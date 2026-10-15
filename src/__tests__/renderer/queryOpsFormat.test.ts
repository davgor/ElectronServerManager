import {
  describeQueryError,
  formatPlayerCount,
  formatPlayerDuration,
  playerDisplayName,
  playerRowKeys,
  reportedPlayerNames,
} from "../../renderer/queryOpsFormat";

describe("queryOpsFormat", () => {
  describe("formatPlayerDuration", () => {
    it("formats durations under a minute as whole seconds", () => {
      expect(formatPlayerDuration(0)).toBe("0s");
      expect(formatPlayerDuration(42)).toBe("42s");
      expect(formatPlayerDuration(42.9)).toBe("42s");
      expect(formatPlayerDuration(59.99)).toBe("59s");
    });

    it("formats durations under an hour as minutes and zero-padded seconds", () => {
      expect(formatPlayerDuration(60)).toBe("1m 00s");
      expect(formatPlayerDuration(303)).toBe("5m 03s");
      expect(formatPlayerDuration(3599)).toBe("59m 59s");
    });

    it("formats durations of an hour or more as hours and zero-padded minutes", () => {
      expect(formatPlayerDuration(3600)).toBe("1h 00m");
      expect(formatPlayerDuration(3720)).toBe("1h 02m");
      expect(formatPlayerDuration(3779)).toBe("1h 02m");
      expect(formatPlayerDuration(36_000 + 45 * 60)).toBe("10h 45m");
    });

    it("returns a dash for negative or non-finite durations", () => {
      expect(formatPlayerDuration(-1)).toBe("—");
      expect(formatPlayerDuration(-0.5)).toBe("—");
      expect(formatPlayerDuration(Number.NaN)).toBe("—");
      expect(formatPlayerDuration(Number.POSITIVE_INFINITY)).toBe("—");
    });
  });

  describe("formatPlayerCount", () => {
    it("formats online and maximum players as a fraction", () => {
      expect(formatPlayerCount({ players: 2, maxPlayers: 16 })).toBe("2/16");
      expect(formatPlayerCount({ players: 0, maxPlayers: 8 })).toBe("0/8");
    });
  });

  describe("describeQueryError", () => {
    it("joins the error kind and message", () => {
      expect(
        describeQueryError({
          errorKind: "timeout",
          error: "No response from 127.0.0.1:15637 within 2000 ms",
        })
      ).toBe("timeout — No response from 127.0.0.1:15637 within 2000 ms");
    });

    it("falls back to a readable default message per error kind", () => {
      expect(describeQueryError({ errorKind: "unavailable" })).toBe(
        "unavailable — Live query is not available for this server"
      );
      expect(describeQueryError({ errorKind: "config" })).toBe(
        "config — Server config could not be read"
      );
      expect(describeQueryError({ errorKind: "timeout" })).toBe(
        "timeout — No response from the server query port"
      );
      expect(describeQueryError({ errorKind: "network" })).toBe(
        "network — Network error while querying the server"
      );
      expect(describeQueryError({ errorKind: "empty" })).toBe(
        "empty — The server sent an empty query response"
      );
      expect(describeQueryError({ errorKind: "parse" })).toBe(
        "parse — The server query response could not be parsed"
      );
    });

    it("treats a blank message like a missing one", () => {
      expect(describeQueryError({ errorKind: "network", error: "   " })).toBe(
        "network — Network error while querying the server"
      );
    });

    it("returns the message alone when no error kind is reported", () => {
      expect(describeQueryError({ error: "IPC channel closed" })).toBe(
        "IPC channel closed"
      );
    });

    it("returns a generic message when neither kind nor message is set", () => {
      expect(describeQueryError({})).toBe("Server query failed");
      expect(describeQueryError({ error: "" })).toBe("Server query failed");
    });
  });

  describe("playerDisplayName", () => {
    it("returns the reported player name", () => {
      expect(
        playerDisplayName({ name: "Embervale", score: 0, durationSeconds: 1 })
      ).toBe("Embervale");
    });

    it("returns a placeholder when the name is empty or blank", () => {
      expect(
        playerDisplayName({ name: "", score: 0, durationSeconds: 1 })
      ).toBe("(name not reported)");
      expect(
        playerDisplayName({ name: "  ", score: 0, durationSeconds: 1 })
      ).toBe("(name not reported)");
    });
  });

  describe("reportedPlayerNames", () => {
    it("keeps only players with a non-blank name, in order", () => {
      expect(
        reportedPlayerNames([
          { name: "Ash", score: 0, durationSeconds: 5 },
          { name: "", score: 0, durationSeconds: 5 },
          { name: " ", score: 0, durationSeconds: 5 },
          { name: "Briar", score: 3, durationSeconds: 9 },
        ])
      ).toEqual(["Ash", "Briar"]);
    });

    it("returns an empty list when the player list is missing", () => {
      expect(reportedPlayerNames(null)).toEqual([]);
      expect(reportedPlayerNames(undefined)).toEqual([]);
    });
  });

  describe("playerRowKeys", () => {
    it("keys named players by name and unnamed players by their order", () => {
      expect(
        playerRowKeys([
          { name: "Ash", score: 0, durationSeconds: 5 },
          { name: "", score: 0, durationSeconds: 5 },
          { name: "unnamed", score: 0, durationSeconds: 5 },
          { name: "Ash", score: 1, durationSeconds: 9 },
          { name: " ", score: 0, durationSeconds: 7 },
        ])
      ).toEqual([
        "name:Ash#0",
        "unnamed#0",
        "name:unnamed#0",
        "name:Ash#1",
        "unnamed#1",
      ]);
    });

    it("returns no keys for an empty list", () => {
      expect(playerRowKeys([])).toEqual([]);
    });
  });
});
