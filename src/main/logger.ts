import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogTransport = (
  level: LogLevel,
  message: string,
  ...args: unknown[]
) => void;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function isDevEnv(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    Boolean(process.env.ELECTRON_START_URL)
  );
}

function defaultLogLevel(): LogLevel {
  return isDevEnv() ? "debug" : "warn";
}

function formatArg(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatMessage(args: unknown[]): string {
  return args.map(formatArg).join(" ");
}

const consoleTransport: LogTransport = (level, message): void => {
  switch (level) {
    case "debug":
    case "info":
      // Prefer console methods that match severity without eslint no-console
      // suppressions — the logger is the single allowed console boundary.
      // eslint-disable-next-line no-console -- logger transport
      console.log(`[${level}] ${message}`);
      break;
    case "warn":
      // eslint-disable-next-line no-console -- logger transport
      console.warn(`[${level}] ${message}`);
      break;
    case "error":
      // eslint-disable-next-line no-console -- logger transport
      console.error(`[${level}] ${message}`);
      break;
  }
};

let fileLogPath: string | null = null;

/** Resolve (and create) the production log file under Electron userData/logs. */
export function enableFileLogging(userDataPath: string): void {
  const logsDir = join(userDataPath, "logs");
  mkdirSync(logsDir, { recursive: true });
  fileLogPath = join(logsDir, "main.log");
}

const fileTransport: LogTransport = (level, message): void => {
  if (fileLogPath === null || isDevEnv()) {
    return;
  }
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  try {
    appendFileSync(fileLogPath, line, "utf8");
  } catch {
    // Swallow disk errors — logging must not crash the app.
  }
};

let currentLevel: LogLevel = defaultLogLevel();
let transports: LogTransport[] = [consoleTransport, fileTransport];

export function resetLoggerForTests(): void {
  currentLevel = defaultLogLevel();
  transports = [consoleTransport, fileTransport];
  fileLogPath = null;
}

export function setLoggerTransportsForTests(next: LogTransport[]): void {
  transports = next;
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function emit(level: LogLevel, args: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) {
    return;
  }
  const message = formatMessage(args);
  for (const transport of transports) {
    transport(level, message, ...args);
  }
}

export function debug(...args: unknown[]): void {
  emit("debug", args);
}

export function info(...args: unknown[]): void {
  emit("info", args);
}

export function warn(...args: unknown[]): void {
  emit("warn", args);
}

export function error(...args: unknown[]): void {
  emit("error", args);
}
