import { execFile } from "child_process";

import type { GetServerMetricsResponse, MetricStats } from "../types/ipc";

/** One raw reading of a process: cumulative CPU time and resident memory. */
export interface ProcessUsageReading {
  /** Cumulative CPU seconds consumed by the process since it started. */
  cpuSeconds: number;
  /** Resident set size / working set in bytes. */
  memoryBytes: number;
}

/**
 * Reads current usage for a pid. Returns null when the process is gone (or
 * unreadable), which stops sampling. Injectable so tests never spawn
 * real processes.
 */
export type ProcessUsageReader = (
  pid: number
) => Promise<ProcessUsageReading | null>;

export interface ServerMetricsSamplingOptions {
  intervalMs?: number;
  maxSamples?: number;
  reader?: ProcessUsageReader;
  now?: () => number;
}

const DEFAULT_SAMPLE_INTERVAL_MS = 3000;

/** 200 samples at the default 3s interval keeps a 10-minute window. */
const DEFAULT_MAX_SAMPLES = 200;

interface UsageSample {
  cpuPercent: number;
  memoryBytes: number;
}

interface SamplerState {
  timer: ReturnType<typeof setInterval>;
  samples: UsageSample[];
  lastReading: { cpuSeconds: number; atMs: number } | null;
  maxSamples: number;
  tickInFlight: boolean;
}

const samplers = new Map<number, SamplerState>();

/**
 * Nearest-rank current/average/p95 over a non-empty window of samples.
 * `current` is the newest value (last pushed), p95 uses the sorted window.
 */
export function computeMetricStats(values: readonly number[]): MetricStats {
  const current = values[values.length - 1];
  const sum = values.reduce((total, value) => total + value, 0);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(0.95 * sorted.length));
  return {
    current,
    average: sum / values.length,
    p95: sorted[rank - 1],
  };
}

/** Parses `cputime` output of `ps` (`[D-][HH:]MM:SS[.ss]`) into seconds. */
function parseCpuTimeSeconds(text: string): number | null {
  if (!/^(?:\d+-)?(?:\d+:)?\d{1,2}:\d{1,2}(?:\.\d+)?$/.test(text)) {
    return null;
  }
  const [dayPart, timePart] = text.includes("-")
    ? text.split("-")
    : ["0", text];
  let seconds = 0;
  for (const value of timePart.split(":").map(Number)) {
    seconds = seconds * 60 + value;
  }
  return Number(dayPart) * 86400 + seconds;
}

/** Parses `ps -o cputime=,rss= -p <pid>` output (rss is KiB). */
export function parsePosixPsUsage(stdout: string): ProcessUsageReading | null {
  const tokens = stdout.trim().split(/\s+/);
  if (tokens.length !== 2) {
    return null;
  }
  const cpuSeconds = parseCpuTimeSeconds(tokens[0]);
  const rssKiB = Number(tokens[1]);
  if (cpuSeconds === null || !Number.isFinite(rssKiB) || rssKiB < 0) {
    return null;
  }
  return { cpuSeconds, memoryBytes: rssKiB * 1024 };
}

/** Parses the `"<cpuSeconds> <workingSetBytes>"` line our PowerShell emits. */
export function parseWindowsUsage(stdout: string): ProcessUsageReading | null {
  const tokens = stdout.trim().split(/\s+/);
  if (tokens.length !== 2) {
    return null;
  }
  const cpuSeconds = Number(tokens[0]);
  const memoryBytes = Number(tokens[1]);
  if (
    !Number.isFinite(cpuSeconds) ||
    !Number.isFinite(memoryBytes) ||
    cpuSeconds < 0 ||
    memoryBytes < 0
  ) {
    return null;
  }
  return { cpuSeconds, memoryBytes };
}

function execFileText(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (error, stdout) => {
      resolve(error !== null ? null : stdout);
    });
  });
}

async function defaultProcessUsageReader(
  pid: number
): Promise<ProcessUsageReading | null> {
  if (process.platform === "win32") {
    const script =
      `$p = Get-Process -Id ${String(pid)} -ErrorAction Stop; ` +
      "$cpu = if ($null -eq $p.CPU) { 0 } else { $p.CPU }; " +
      'Write-Output "$cpu $($p.WorkingSet64)"';
    const stdout = await execFileText("powershell", [
      "-NoProfile",
      "-Command",
      script,
    ]);
    return stdout === null ? null : parseWindowsUsage(stdout);
  }
  const stdout = await execFileText("ps", [
    "-o",
    "cputime=,rss=",
    "-p",
    String(pid),
  ]);
  return stdout === null ? null : parsePosixPsUsage(stdout);
}

/**
 * Starts (or restarts) periodic usage sampling for a tracked server process.
 * The first reading is a baseline only; each subsequent reading produces a
 * sample whose CPU percent is the cumulative-CPU-time delta over wall time.
 */
export function startServerMetricsSampling(
  appId: number,
  pid: number,
  options?: ServerMetricsSamplingOptions
): void {
  stopServerMetricsSampling(appId);

  const intervalMs = options?.intervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const maxSamples = options?.maxSamples ?? DEFAULT_MAX_SAMPLES;
  const reader = options?.reader ?? defaultProcessUsageReader;
  const now = options?.now ?? Date.now;

  const state: SamplerState = {
    timer: setInterval(() => {
      void tick();
    }, intervalMs),
    samples: [],
    lastReading: null,
    maxSamples,
    tickInFlight: false,
  };

  async function tick(): Promise<void> {
    if (state.tickInFlight || samplers.get(appId) !== state) {
      return;
    }
    state.tickInFlight = true;
    let reading: ProcessUsageReading | null;
    try {
      reading = await reader(pid);
    } catch {
      reading = null;
    }
    state.tickInFlight = false;
    if (samplers.get(appId) !== state) {
      // Stopped (or restarted) while the reader was in flight.
      return;
    }
    if (reading === null) {
      stopServerMetricsSampling(appId);
      return;
    }
    const atMs = now();
    const previous = state.lastReading;
    state.lastReading = { cpuSeconds: reading.cpuSeconds, atMs };
    if (previous === null) {
      return;
    }
    const elapsedMs = atMs - previous.atMs;
    if (elapsedMs <= 0) {
      return;
    }
    const cpuPercent = Math.max(
      0,
      (((reading.cpuSeconds - previous.cpuSeconds) * 1000) / elapsedMs) * 100
    );
    state.samples.push({ cpuPercent, memoryBytes: reading.memoryBytes });
    if (state.samples.length > state.maxSamples) {
      state.samples.shift();
    }
  }

  samplers.set(appId, state);
  void tick();
}

/** Stops sampling for a server and drops its window (no stale PID samples). */
export function stopServerMetricsSampling(appId: number): void {
  const state = samplers.get(appId);
  if (state === undefined) {
    return;
  }
  clearInterval(state.timer);
  samplers.delete(appId);
}

export function getServerMetrics(appId: number): GetServerMetricsResponse {
  const state = samplers.get(appId);
  if (state === undefined) {
    return { success: true, running: false, sampleCount: 0 };
  }
  if (state.samples.length === 0) {
    return { success: true, running: true, sampleCount: 0 };
  }
  return {
    success: true,
    running: true,
    sampleCount: state.samples.length,
    cpu: computeMetricStats(state.samples.map((sample) => sample.cpuPercent)),
    memory: computeMetricStats(
      state.samples.map((sample) => sample.memoryBytes)
    ),
  };
}

export function resetServerMetricsForTests(): void {
  for (const appId of [...samplers.keys()]) {
    stopServerMetricsSampling(appId);
  }
}
