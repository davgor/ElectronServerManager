import { describeAutoUpdateNotice } from "../../renderer/autoUpdateNotice";

describe("describeAutoUpdateNotice (042.5 visibility)", () => {
  it("explains a deferral with the player count", () => {
    expect(
      describeAutoUpdateNotice({
        success: true,
        stage: "deferred",
        updated: false,
        playersOnline: 2,
      })
    ).toBe(
      "Update available — waiting for 2 players to leave. Rechecking every 5 minutes."
    );
  });

  it("uses the singular for one player", () => {
    expect(
      describeAutoUpdateNotice({
        success: true,
        stage: "deferred",
        updated: false,
        playersOnline: 1,
      })
    ).toBe(
      "Update available — waiting for 1 player to leave. Rechecking every 5 minutes."
    );
  });

  it("keeps a failed check visible with its stage and error", () => {
    expect(
      describeAutoUpdateNotice({
        success: false,
        stage: "notifying",
        updated: false,
        error: "Could not check for online players before updating (timeout).",
      })
    ).toBe(
      "Last auto-update check failed at notifying: Could not check for online players before updating (timeout)."
    );
  });

  it("falls back to a generic error message", () => {
    expect(
      describeAutoUpdateNotice({
        success: false,
        stage: "checking",
        updated: false,
      })
    ).toBe("Last auto-update check failed at checking: Unknown error");
  });

  it.each(["no-update", "complete"] as const)(
    "clears the notice after a %s result",
    (stage) => {
      expect(
        describeAutoUpdateNotice({ success: true, stage, updated: false })
      ).toBeNull();
    }
  );
});
