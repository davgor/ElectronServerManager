/**
 * Resolve whether the Electron main process should run in development mode.
 * Kept pure so bootstrap detection can be unit-tested (fireguard / regression).
 */
export function resolveIsDev(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.NODE_ENV === "development" || env.ELECTRON_START_URL);
}
