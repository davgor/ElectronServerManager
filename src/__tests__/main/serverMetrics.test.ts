import {
  computeMetricStats,
  getServerMetrics,
  parsePosixPsUsage,
  parseWindowsUsage,
  resetServerMetricsForTests,
  startServerMetricsSampling,
  stopServerMetricsSampling,
} from "../../main/serverMetrics";
import type {
  ProcessUsageReader,
  ProcessUsageReading,
  ServerMetricsSamplingOptions,
} from "../../main/serverMetrics";

const APP_ID = 1396110;
const PID = 4242;

describe("serverMetrics", () => {
  afterEach(() => {
    resetServerMetricsForTests();
    jest.useRealTimers();
  });

  describe("computeMetricStats", () => {
    it("returns current, average and p95 for a single sample", () => {
      expect(computeMetricStats([10])).toEqual({
        current: 10,
        average: 10,
        p95: 10,
      });
    });

    it("computes the mean of the window", () => {
      const stats = computeMetricStats([10, 20, 30, 40]);
      expect(stats.average).toBe(25);
      expect(stats.current).toBe(40);
    });

    it("computes p95 with nearest-rank on the sorted window", () => {
      // 20 values: rank = ceil(0.95 * 20) = 19 -> the 19th smallest = 19.
      const values = Array.from({ length: 20 }, (_, index) => index + 1);
      expect(computeMetricStats(values).p95).toBe(19);
    });

    it("sorts the window before taking the p95 rank", () => {
      const stats = computeMetricStats([50, 5, 100, 1]);
      // rank = ceil(0.95 * 4) = 4 -> largest value.
      expect(stats.p95).toBe(100);
      expect(stats.current).toBe(1);
    });

    it("does not mutate the input samples", () => {
      const values = [3, 1, 2];
      computeMetricStats(values);
      expect(values).toEqual([3, 1, 2]);
    });
  });

  describe("parsePosixPsUsage", () => {
    it("parses MM:SS cputime and rss KiB into seconds and bytes", () => {
      expect(parsePosixPsUsage("  12:34  2048\n")).toEqual({
        cpuSeconds: 754,
        memoryBytes: 2048 * 1024,
      });
    });

    it("parses HH:MM:SS cputime", () => {
      expect(parsePosixPsUsage("02:03:04 100\n")).toEqual({
        cpuSeconds: 2 * 3600 + 3 * 60 + 4,
        memoryBytes: 100 * 1024,
      });
    });

    it("parses D-HH:MM:SS cputime", () => {
      expect(parsePosixPsUsage("1-02:03:04 100\n")).toEqual({
        cpuSeconds: 24 * 3600 + 2 * 3600 + 3 * 60 + 4,
        memoryBytes: 100 * 1024,
      });
    });

    it("parses fractional seconds (macOS MM:SS.ss)", () => {
      expect(parsePosixPsUsage("00:01.50 100\n")).toEqual({
        cpuSeconds: 1.5,
        memoryBytes: 100 * 1024,
      });
    });

    it("returns null for empty or malformed output", () => {
      expect(parsePosixPsUsage("")).toBeNull();
      expect(parsePosixPsUsage("\n")).toBeNull();
      expect(parsePosixPsUsage("garbage output")).toBeNull();
      expect(parsePosixPsUsage("12:34")).toBeNull();
      expect(parsePosixPsUsage("12:34 not-a-number")).toBeNull();
    });
  });

  describe("parseWindowsUsage", () => {
    it("parses cumulative CPU seconds and working-set bytes", () => {
      expect(parseWindowsUsage("12.5 104857600\r\n")).toEqual({
        cpuSeconds: 12.5,
        memoryBytes: 104857600,
      });
    });

    it("returns null for empty or malformed output", () => {
      expect(parseWindowsUsage("")).toBeNull();
      expect(parseWindowsUsage("\r\n")).toBeNull();
      expect(parseWindowsUsage("only-one-token")).toBeNull();
      expect(parseWindowsUsage("nan nan")).toBeNull();
    });
  });

  describe("sampling lifecycle", () => {
    function createSequenceReader(
      readings: (ProcessUsageReading | null)[]
    ): ProcessUsageReader {
      let index = 0;
      return () => {
        const reading = readings[Math.min(index, readings.length - 1)];
        index += 1;
        return Promise.resolve(reading);
      };
    }

    it("reports not running with no samples for an unknown appId", () => {
      expect(getServerMetrics(999999)).toEqual({
        success: true,
        running: false,
        sampleCount: 0,
      });
    });

    it("computes CPU percent from the delta of cumulative CPU time", async () => {
      jest.useFakeTimers();
      let nowMs = 0;
      const reader = createSequenceReader([
        { cpuSeconds: 0, memoryBytes: 100 * 1024 * 1024 },
        { cpuSeconds: 1.5, memoryBytes: 200 * 1024 * 1024 },
      ]);

      const options: ServerMetricsSamplingOptions = {
        intervalMs: 3000,
        reader,
        now: () => nowMs,
      };
      startServerMetricsSampling(APP_ID, PID, options);
      // Baseline reading at t=0 (no sample yet).
      await jest.advanceTimersByTimeAsync(0);
      expect(getServerMetrics(APP_ID)).toEqual({
        success: true,
        running: true,
        sampleCount: 0,
      });

      nowMs = 3000;
      await jest.advanceTimersByTimeAsync(3000);

      // 1.5 CPU-seconds over 3 wall-seconds = 50%.
      expect(getServerMetrics(APP_ID)).toEqual({
        success: true,
        running: true,
        sampleCount: 1,
        cpu: { current: 50, average: 50, p95: 50 },
        memory: {
          current: 200 * 1024 * 1024,
          average: 200 * 1024 * 1024,
          p95: 200 * 1024 * 1024,
        },
      });

      stopServerMetricsSampling(APP_ID);
    });

    it("clamps negative CPU deltas to zero", async () => {
      jest.useFakeTimers();
      let nowMs = 0;
      const reader = createSequenceReader([
        { cpuSeconds: 10, memoryBytes: 1024 },
        { cpuSeconds: 5, memoryBytes: 1024 },
      ]);

      startServerMetricsSampling(APP_ID, PID, {
        intervalMs: 1000,
        reader,
        now: () => nowMs,
      });
      await jest.advanceTimersByTimeAsync(0);
      nowMs = 1000;
      await jest.advanceTimersByTimeAsync(1000);

      const metrics = getServerMetrics(APP_ID);
      expect(metrics.cpu).toEqual({ current: 0, average: 0, p95: 0 });

      stopServerMetricsSampling(APP_ID);
    });

    it("keeps only the newest maxSamples in the rolling window", async () => {
      jest.useFakeTimers();
      let nowMs = 0;
      // Memory grows by 1000 bytes per second-long tick; CPU is idle.
      const readings: ProcessUsageReading[] = Array.from(
        { length: 8 },
        (_, index) => ({
          cpuSeconds: 0,
          memoryBytes: (index + 1) * 1000,
        })
      );
      startServerMetricsSampling(APP_ID, PID, {
        intervalMs: 1000,
        maxSamples: 3,
        reader: createSequenceReader(readings),
        now: () => nowMs,
      });
      await jest.advanceTimersByTimeAsync(0);
      for (let tick = 1; tick <= 7; tick += 1) {
        nowMs = tick * 1000;
        await jest.advanceTimersByTimeAsync(1000);
      }

      const metrics = getServerMetrics(APP_ID);
      expect(metrics.sampleCount).toBe(3);
      // Window holds readings 6..8 -> memory 6000, 7000, 8000.
      expect(metrics.memory).toEqual({
        current: 8000,
        average: 7000,
        p95: 8000,
      });

      stopServerMetricsSampling(APP_ID);
    });

    it("stops sampling and clears samples when the reader returns null", async () => {
      jest.useFakeTimers();
      let nowMs = 0;
      const reader = createSequenceReader([
        { cpuSeconds: 0, memoryBytes: 1024 },
        { cpuSeconds: 1, memoryBytes: 1024 },
        null,
      ]);

      startServerMetricsSampling(APP_ID, PID, {
        intervalMs: 1000,
        reader,
        now: () => nowMs,
      });
      await jest.advanceTimersByTimeAsync(0);
      nowMs = 1000;
      await jest.advanceTimersByTimeAsync(1000);
      expect(getServerMetrics(APP_ID).sampleCount).toBe(1);

      nowMs = 2000;
      await jest.advanceTimersByTimeAsync(1000);

      expect(getServerMetrics(APP_ID)).toEqual({
        success: true,
        running: false,
        sampleCount: 0,
      });
    });

    it("stops sampling and clears samples when the reader throws", async () => {
      jest.useFakeTimers();
      let calls = 0;
      const reader: ProcessUsageReader = () => {
        calls += 1;
        if (calls >= 2) {
          return Promise.reject(new Error("process gone"));
        }
        return Promise.resolve({ cpuSeconds: 0, memoryBytes: 1024 });
      };

      startServerMetricsSampling(APP_ID, PID, {
        intervalMs: 1000,
        reader,
        now: () => calls * 1000,
      });
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);

      expect(getServerMetrics(APP_ID)).toEqual({
        success: true,
        running: false,
        sampleCount: 0,
      });

      // Timer must be gone: further ticks never call the reader again.
      const callsAfterStop = calls;
      await jest.advanceTimersByTimeAsync(5000);
      expect(calls).toBe(callsAfterStop);
    });

    it("clears samples on stopServerMetricsSampling", async () => {
      jest.useFakeTimers();
      let nowMs = 0;
      startServerMetricsSampling(APP_ID, PID, {
        intervalMs: 1000,
        reader: createSequenceReader([
          { cpuSeconds: 0, memoryBytes: 1024 },
          { cpuSeconds: 0.5, memoryBytes: 2048 },
        ]),
        now: () => nowMs,
      });
      await jest.advanceTimersByTimeAsync(0);
      nowMs = 1000;
      await jest.advanceTimersByTimeAsync(1000);
      expect(getServerMetrics(APP_ID).sampleCount).toBe(1);

      stopServerMetricsSampling(APP_ID);

      expect(getServerMetrics(APP_ID)).toEqual({
        success: true,
        running: false,
        sampleCount: 0,
      });
    });

    it("restarting sampling for an appId discards the previous window", async () => {
      jest.useFakeTimers();
      let nowMs = 0;
      startServerMetricsSampling(APP_ID, PID, {
        intervalMs: 1000,
        reader: createSequenceReader([
          { cpuSeconds: 0, memoryBytes: 1000 },
          { cpuSeconds: 0, memoryBytes: 1000 },
        ]),
        now: () => nowMs,
      });
      await jest.advanceTimersByTimeAsync(0);
      nowMs = 1000;
      await jest.advanceTimersByTimeAsync(1000);
      expect(getServerMetrics(APP_ID).sampleCount).toBe(1);

      startServerMetricsSampling(APP_ID, PID + 1, {
        intervalMs: 1000,
        reader: createSequenceReader([{ cpuSeconds: 0, memoryBytes: 9000 }]),
        now: () => nowMs,
      });

      expect(getServerMetrics(APP_ID)).toEqual({
        success: true,
        running: true,
        sampleCount: 0,
      });

      stopServerMetricsSampling(APP_ID);
    });
  });
});
