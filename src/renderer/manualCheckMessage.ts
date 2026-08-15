import type { ManualUpdateCheckResult } from "../types/ipc";

/** Visual tone for the manual update-check status line. */
export type UpdateCheckStatusTone = "ok" | "failed" | "pending";

export const CHECKING_UPDATES_MESSAGE = "Checking for updates…";

export function formatManualUpdateCheckMessage(
  result: ManualUpdateCheckResult
): string {
  switch (result.outcome) {
    case "update-available":
      return `Update found: v${result.version}`;
    case "up-to-date":
      return "No updates found — you're on the latest version.";
    case "disabled":
      return "Update checks are only available in installed builds.";
    case "busy":
      return result.message ?? "An update check is already in progress.";
    case "error":
      return `Update check failed: ${result.message}`;
  }
}

export function statusToneForResult(
  result: ManualUpdateCheckResult
): UpdateCheckStatusTone {
  if (result.outcome === "error") {
    return "failed";
  }
  if (result.outcome === "disabled" || result.outcome === "busy") {
    return "pending";
  }
  return "ok";
}
