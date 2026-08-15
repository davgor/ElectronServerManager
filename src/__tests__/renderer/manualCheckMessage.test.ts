import {
  CHECKING_UPDATES_MESSAGE,
  formatManualUpdateCheckMessage,
  statusToneForResult,
} from "../../renderer/manualCheckMessage";

describe("manualCheckMessage", () => {
  it("exposes an immediate checking message", () => {
    expect(CHECKING_UPDATES_MESSAGE).toBe("Checking for updates…");
  });

  describe("formatManualUpdateCheckMessage", () => {
    it("announces a found update with its version", () => {
      expect(
        formatManualUpdateCheckMessage({
          outcome: "update-available",
          version: "1.2.3",
        })
      ).toBe("Update found: v1.2.3");
    });

    it("confirms the app is up to date", () => {
      expect(formatManualUpdateCheckMessage({ outcome: "up-to-date" })).toBe(
        "No updates found — you're on the latest version."
      );
    });

    it("explains when updates are disabled (dev/unpackaged/env flag)", () => {
      expect(formatManualUpdateCheckMessage({ outcome: "disabled" })).toBe(
        "Update checks are only available in installed builds."
      );
    });

    it("passes through a busy message when provided", () => {
      expect(
        formatManualUpdateCheckMessage({
          outcome: "busy",
          message: "Downloading update…",
        })
      ).toBe("Downloading update…");
    });

    it("falls back to a default busy message", () => {
      expect(formatManualUpdateCheckMessage({ outcome: "busy" })).toBe(
        "An update check is already in progress."
      );
    });

    it("reports errors with the underlying message", () => {
      expect(
        formatManualUpdateCheckMessage({
          outcome: "error",
          message: "GitHub unreachable",
        })
      ).toBe("Update check failed: GitHub unreachable");
    });
  });

  describe("statusToneForResult", () => {
    it("marks errors as failed", () => {
      expect(statusToneForResult({ outcome: "error", message: "x" })).toBe(
        "failed"
      );
    });

    it("marks disabled and busy as pending", () => {
      expect(statusToneForResult({ outcome: "disabled" })).toBe("pending");
      expect(statusToneForResult({ outcome: "busy" })).toBe("pending");
    });

    it("marks up-to-date and update-available as ok", () => {
      expect(statusToneForResult({ outcome: "up-to-date" })).toBe("ok");
      expect(
        statusToneForResult({ outcome: "update-available", version: "1.0.0" })
      ).toBe("ok");
    });
  });
});
