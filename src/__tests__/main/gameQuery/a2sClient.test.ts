import { createSocket, type Socket } from "dgram";

import {
  queryA2sInfo,
  queryA2sPlayers,
  type A2sInfo,
  type A2sResult,
} from "../../../main/gameQuery/a2sClient";
import type {
  GameQueryTarget,
  UdpExchange,
} from "../../../main/gameQuery/types";
import { UdpExchangeError } from "../../../main/gameQuery/udpExchange";

const TARGET: GameQueryTarget = { host: "127.0.0.1", port: 15637 };

const SIMPLE_HEADER = [0xff, 0xff, 0xff, 0xff];
const INFO_RESPONSE = 0x49;
const PLAYER_RESPONSE = 0x44;
const CHALLENGE_RESPONSE = 0x41;

/** Exact A2S_INFO request bytes: header, 0x54, "Source Engine Query\0". */
const INFO_REQUEST = Buffer.from([
  ...SIMPLE_HEADER,
  0x54,
  ...Buffer.from("Source Engine Query", "latin1"),
  0x00,
]);

/** Exact first A2S_PLAYER request bytes: header, 0x55, challenge -1. */
const PLAYER_REQUEST = Buffer.from([
  ...SIMPLE_HEADER,
  0x55,
  0xff,
  0xff,
  0xff,
  0xff,
]);

function u8(...values: number[]): Buffer {
  return Buffer.from(values);
}

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function i32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32LE(value, 0);
  return buffer;
}

function f32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatLE(value, 0);
  return buffer;
}

/** Null-terminated UTF-8 string, as A2S encodes strings. */
function str(value: string): Buffer {
  return Buffer.concat([Buffer.from(value, "utf8"), u8(0)]);
}

/** Single-packet response datagram: simple header, type byte, body. */
function packet(type: number, ...parts: Buffer[]): Buffer {
  return Buffer.concat([u8(...SIMPLE_HEADER, type), ...parts]);
}

function challengePacket(challenge: number[]): Buffer {
  return packet(CHALLENGE_RESPONSE, u8(...challenge));
}

/** A2S_INFO body up to and including the version string (no EDF). */
function infoBody(
  overrides: { visibility?: number; vac?: number } = {}
): Buffer[] {
  return [
    u8(17),
    str("Shroud Squad"),
    str("Embervale"),
    str("enshrouded"),
    str("Enshrouded"),
    u16(0x1234),
    u8(3, 16, 1),
    u8("d".charCodeAt(0), "w".charCodeAt(0)),
    u8(overrides.visibility ?? 0, overrides.vac ?? 0),
    str("0.7.4.0"),
  ];
}

const BASE_INFO: A2sInfo = {
  protocol: 17,
  name: "Shroud Squad",
  map: "Embervale",
  folder: "enshrouded",
  game: "Enshrouded",
  steamAppId: 0x1234,
  players: 3,
  maxPlayers: 16,
  bots: 1,
  serverType: "d",
  environment: "w",
  passwordProtected: false,
  vacSecured: false,
  version: "0.7.4.0",
};

function playerRow(
  index: number,
  name: string,
  score: number,
  durationSeconds: number
): Buffer {
  return Buffer.concat([
    u8(index),
    str(name),
    i32(score),
    f32(durationSeconds),
  ]);
}

interface ExchangeCall {
  payload: Buffer;
  target: GameQueryTarget;
  timeoutMs: number;
}

interface ScriptedExchange {
  exchange: UdpExchange;
  calls: ExchangeCall[];
}

/**
 * Fake transport: answers each request with the next scripted datagram, or
 * rejects with the scripted error, and records every request it was sent.
 */
function scriptedExchange(...script: Array<Buffer | Error>): ScriptedExchange {
  const queue = [...script];
  const calls: ExchangeCall[] = [];
  const exchange: UdpExchange = (payload, target, timeoutMs) => {
    calls.push({ payload: Buffer.from(payload), target, timeoutMs });
    if (queue.length === 0) {
      return Promise.reject(new Error("fake exchange: script exhausted"));
    }
    const next = queue.shift() as Buffer | Error;
    if (Buffer.isBuffer(next)) {
      return Promise.resolve(next);
    }
    return Promise.reject(next);
  };
  return { exchange, calls };
}

function expectOk<T>(result: A2sResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok result, got ${result.kind}: ${result.error}`);
  }
  return result.value;
}

function errorText<T>(result: A2sResult<T>): string {
  if (result.ok) {
    throw new Error("expected a failed result");
  }
  return result.error;
}

describe("a2sClient", () => {
  describe("queryA2sInfo", () => {
    it("sends the exact A2S_INFO request with the default 2000 ms timeout", async () => {
      const fake = scriptedExchange(packet(INFO_RESPONSE, ...infoBody()));

      await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]?.payload).toEqual(INFO_REQUEST);
      expect(fake.calls[0]?.target).toEqual(TARGET);
      expect(fake.calls[0]?.timeoutMs).toBe(2000);
    });

    it("passes a custom timeout to the transport", async () => {
      const fake = scriptedExchange(packet(INFO_RESPONSE, ...infoBody()));

      await queryA2sInfo(TARGET, { exchange: fake.exchange, timeoutMs: 750 });

      expect(fake.calls[0]?.timeoutMs).toBe(750);
    });

    it("parses an info response without extra data fields", async () => {
      const fake = scriptedExchange(packet(INFO_RESPONSE, ...infoBody()));

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({ ok: true, value: BASE_INFO });
    });

    it.each([
      [0, 0, false, false],
      [1, 0, true, false],
      [0, 1, false, true],
      [1, 1, true, true],
    ])(
      "maps visibility=%d vac=%d to passwordProtected=%s vacSecured=%s",
      async (visibility, vac, passwordProtected, vacSecured) => {
        const fake = scriptedExchange(
          packet(INFO_RESPONSE, ...infoBody({ visibility, vac }))
        );

        const info = expectOk(
          await queryA2sInfo(TARGET, { exchange: fake.exchange })
        );

        expect(info.passwordProtected).toBe(passwordProtected);
        expect(info.vacSecured).toBe(vacSecured);
      }
    );

    it("decodes UTF-8 strings and keeps an empty map name", async () => {
      const fake = scriptedExchange(
        packet(
          INFO_RESPONSE,
          u8(17),
          str("Bjørn's Hütte"),
          str(""),
          str("enshrouded"),
          str("Enshrouded"),
          u16(0),
          u8(0, 16, 0),
          u8("d".charCodeAt(0), "w".charCodeAt(0), 0, 0),
          str("1.0")
        )
      );

      const info = expectOk(
        await queryA2sInfo(TARGET, { exchange: fake.exchange })
      );

      expect(info.name).toBe("Bjørn's Hütte");
      expect(info.map).toBe("");
      expect(info.folder).toBe("enshrouded");
      expect(info.game).toBe("Enshrouded");
      expect(info.version).toBe("1.0");
    });

    it("reads the game port and keywords extra data fields", async () => {
      const fake = scriptedExchange(
        packet(
          INFO_RESPONSE,
          ...infoBody(),
          u8(0x80 | 0x20),
          u16(15636),
          str("coop,pve")
        )
      );

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({
        ok: true,
        value: { ...BASE_INFO, gamePort: 15636, keywords: "coop,pve" },
      });
    });

    it("reads only the game port when the keywords flag is clear", async () => {
      const fake = scriptedExchange(
        packet(INFO_RESPONSE, ...infoBody(), u8(0x80), u16(15636))
      );

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({
        ok: true,
        value: { ...BASE_INFO, gamePort: 15636 },
      });
    });

    it("skips SteamID, SourceTV, and GameID fields in protocol order", async () => {
      const fake = scriptedExchange(
        packet(
          INFO_RESPONSE,
          ...infoBody(),
          u8(0x80 | 0x10 | 0x40 | 0x20 | 0x01),
          u16(15636),
          u8(1, 2, 3, 4, 5, 6, 7, 8),
          u16(27020),
          str("SourceTV"),
          str("coop,pve"),
          u8(9, 10, 11, 12, 13, 14, 15, 16)
        )
      );

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({
        ok: true,
        value: { ...BASE_INFO, gamePort: 15636, keywords: "coop,pve" },
      });
    });

    it("omits game port and keywords when only skipped fields are present", async () => {
      const fake = scriptedExchange(
        packet(
          INFO_RESPONSE,
          ...infoBody(),
          u8(0x10 | 0x40 | 0x01),
          u8(1, 2, 3, 4, 5, 6, 7, 8),
          u16(27020),
          str("SourceTV"),
          u8(9, 10, 11, 12, 13, 14, 15, 16)
        )
      );

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({ ok: true, value: BASE_INFO });
    });

    it.each([
      ["SteamID", 0x10, u8(1, 2, 3, 4, 5, 6, 7)],
      ["SourceTV name", 0x40, Buffer.concat([u16(27020), u8(0x53, 0x54)])],
      ["keywords", 0x20, u8(0x63, 0x6f)],
      ["GameID", 0x01, u8(1, 2, 3, 4)],
      ["game port", 0x80, u8(0x14)],
    ])(
      "reports a parse error when the %s extra data field is cut short",
      async (_field, flag, partial) => {
        const fake = scriptedExchange(
          packet(INFO_RESPONSE, ...infoBody(), u8(flag), partial)
        );

        const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

        expect(result).toMatchObject({ ok: false, kind: "parse" });
      }
    );

    it("reports a parse error for every truncation of an info response", async () => {
      const full = packet(INFO_RESPONSE, ...infoBody());

      for (let length = 5; length < full.length; length += 1) {
        const fake = scriptedExchange(full.subarray(0, length));
        const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });
        expect({ length, kind: result.ok ? "ok" : result.kind }).toEqual({
          length,
          kind: "parse",
        });
      }
    });

    it("re-sends the request with the challenge appended", async () => {
      const fake = scriptedExchange(
        challengePacket([0x11, 0x22, 0x33, 0x44]),
        packet(INFO_RESPONSE, ...infoBody())
      );

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({ ok: true, value: BASE_INFO });
      expect(fake.calls).toHaveLength(2);
      expect(fake.calls[0]?.payload).toEqual(INFO_REQUEST);
      expect(fake.calls[1]?.payload).toEqual(
        Buffer.concat([INFO_REQUEST, u8(0x11, 0x22, 0x33, 0x44)])
      );
    });

    it("honours a second challenge using only the newest challenge bytes", async () => {
      const fake = scriptedExchange(
        challengePacket([0x11, 0x22, 0x33, 0x44]),
        challengePacket([0xaa, 0xbb, 0xcc, 0xdd]),
        packet(INFO_RESPONSE, ...infoBody())
      );

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({ ok: true, value: BASE_INFO });
      expect(fake.calls).toHaveLength(3);
      expect(fake.calls[2]?.payload).toEqual(
        Buffer.concat([INFO_REQUEST, u8(0xaa, 0xbb, 0xcc, 0xdd)])
      );
    });

    it("gives up with a parse error after two challenge rounds", async () => {
      const fake = scriptedExchange(
        challengePacket([1, 1, 1, 1]),
        challengePacket([2, 2, 2, 2]),
        challengePacket([3, 3, 3, 3]),
        packet(INFO_RESPONSE, ...infoBody())
      );

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(fake.calls).toHaveLength(3);
      expect(result).toMatchObject({ ok: false, kind: "parse" });
      expect(errorText(result)).toContain("challenge");
      expect(errorText(result)).toContain("127.0.0.1:15637");
    });

    it("reports a parse error for a challenge with fewer than 4 bytes", async () => {
      const fake = scriptedExchange(packet(CHALLENGE_RESPONSE, u8(0x11, 0x22)));

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toMatchObject({ ok: false, kind: "parse" });
      expect(fake.calls).toHaveLength(1);
    });

    it("rejects a player response to an info query", async () => {
      const fake = scriptedExchange(packet(PLAYER_RESPONSE, u8(0)));

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toMatchObject({ ok: false, kind: "parse" });
      expect(errorText(result)).toContain("0x44");
    });
  });

  describe("queryA2sPlayers", () => {
    it("sends the exact first A2S_PLAYER request and answers the challenge", async () => {
      const fake = scriptedExchange(
        challengePacket([0x12, 0x34, 0x56, 0x78]),
        packet(PLAYER_RESPONSE, u8(0))
      );

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({ ok: true, value: [] });
      expect(fake.calls).toHaveLength(2);
      expect(fake.calls[0]?.payload).toEqual(PLAYER_REQUEST);
      expect(fake.calls[1]?.payload).toEqual(
        u8(...SIMPLE_HEADER, 0x55, 0x12, 0x34, 0x56, 0x78)
      );
      expect(fake.calls[0]?.timeoutMs).toBe(2000);
      expect(fake.calls[1]?.target).toEqual(TARGET);
    });

    it("replaces the challenge on a second challenge round", async () => {
      const fake = scriptedExchange(
        challengePacket([0x12, 0x34, 0x56, 0x78]),
        challengePacket([0x9a, 0xbc, 0xde, 0xf0]),
        packet(PLAYER_RESPONSE, u8(0))
      );

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(result.ok).toBe(true);
      expect(fake.calls[2]?.payload).toEqual(
        u8(...SIMPLE_HEADER, 0x55, 0x9a, 0xbc, 0xde, 0xf0)
      );
    });

    it("gives up with a parse error after two challenge rounds", async () => {
      const fake = scriptedExchange(
        challengePacket([1, 1, 1, 1]),
        challengePacket([2, 2, 2, 2]),
        challengePacket([3, 3, 3, 3])
      );

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(fake.calls).toHaveLength(3);
      expect(result).toMatchObject({ ok: false, kind: "parse" });
    });

    it("parses multiple players including an empty name", async () => {
      const fake = scriptedExchange(
        packet(
          PLAYER_RESPONSE,
          u8(3),
          playerRow(0, "Alice", 12, 61.5),
          playerRow(1, "", 0, 0.25),
          playerRow(2, "Bjørn", -3, 3600.75)
        )
      );

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({
        ok: true,
        value: [
          { index: 0, name: "Alice", score: 12, durationSeconds: 61.5 },
          { index: 1, name: "", score: 0, durationSeconds: 0.25 },
          { index: 2, name: "Bjørn", score: -3, durationSeconds: 3600.75 },
        ],
      });
    });

    it("returns float32 durations as decoded", async () => {
      const fake = scriptedExchange(
        packet(PLAYER_RESPONSE, u8(1), playerRow(5, "Cleo", 7, 12.3))
      );

      const players = expectOk(
        await queryA2sPlayers(TARGET, { exchange: fake.exchange })
      );

      expect(players[0]?.durationSeconds).toBeCloseTo(12.3, 4);
      expect(Number.isInteger(players[0]?.durationSeconds)).toBe(false);
    });

    it("stops cleanly when fewer rows are present than the count claims", async () => {
      const fake = scriptedExchange(
        packet(
          PLAYER_RESPONSE,
          u8(4),
          playerRow(0, "Alice", 1, 1),
          playerRow(1, "Bob", 2, 2)
        )
      );

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({
        ok: true,
        value: [
          { index: 0, name: "Alice", score: 1, durationSeconds: 1 },
          { index: 1, name: "Bob", score: 2, durationSeconds: 2 },
        ],
      });
    });

    it("ignores rows beyond the count", async () => {
      const fake = scriptedExchange(
        packet(
          PLAYER_RESPONSE,
          u8(1),
          playerRow(0, "Alice", 1, 1),
          playerRow(1, "Bob", 2, 2)
        )
      );

      const players = expectOk(
        await queryA2sPlayers(TARGET, { exchange: fake.exchange })
      );

      expect(players).toHaveLength(1);
    });

    it("reports a parse error for a row cut off mid-entry", async () => {
      const row = playerRow(1, "Bob", 2, 2);
      for (let length = 1; length < row.length; length += 1) {
        const fake = scriptedExchange(
          packet(
            PLAYER_RESPONSE,
            u8(2),
            playerRow(0, "Alice", 1, 1),
            row.subarray(0, length)
          )
        );
        const result = await queryA2sPlayers(TARGET, {
          exchange: fake.exchange,
        });
        expect({ length, kind: result.ok ? "ok" : result.kind }).toEqual({
          length,
          kind: "parse",
        });
      }
    });

    it("reports a parse error when the player count byte is missing", async () => {
      const fake = scriptedExchange(packet(PLAYER_RESPONSE));

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(result).toMatchObject({ ok: false, kind: "parse" });
    });

    it("rejects an info response to a player query", async () => {
      const fake = scriptedExchange(packet(INFO_RESPONSE, ...infoBody()));

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(result).toMatchObject({ ok: false, kind: "parse" });
      expect(errorText(result)).toContain("0x49");
    });
  });

  describe("response and transport errors", () => {
    it.each([
      ["zero-length", Buffer.alloc(0)],
      ["header-only", u8(...SIMPLE_HEADER)],
      ["2-byte", u8(0xff, 0xff)],
    ])("reports a %s datagram as empty", async (_label, datagram) => {
      const fake = scriptedExchange(datagram);

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toMatchObject({ ok: false, kind: "empty" });
      expect(errorText(result)).toContain("127.0.0.1:15637");
    });

    it("rejects split multi-packet responses", async () => {
      const fake = scriptedExchange(
        Buffer.concat([u8(0xfe, 0xff, 0xff, 0xff), u8(1, 0, 0, 0, 2, 0)])
      );

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({
        ok: false,
        kind: "parse",
        error: "Multi-packet A2S responses are not supported",
      });
    });

    it("rejects a datagram without the simple header", async () => {
      const fake = scriptedExchange(
        Buffer.concat([u8(0, 0, 0, 0, INFO_RESPONSE), ...infoBody()])
      );

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toMatchObject({ ok: false, kind: "parse" });
    });

    it("rejects the obsolete GoldSource info response naming the byte", async () => {
      const fake = scriptedExchange(packet(0x6d, ...infoBody()));

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toMatchObject({ ok: false, kind: "parse" });
      expect(errorText(result)).toContain("0x6D");
    });

    it("names a single-digit unexpected type byte with two hex digits", async () => {
      const fake = scriptedExchange(packet(0x05, u8(0)));

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({
        ok: false,
        kind: "parse",
        error:
          "Unexpected A2S response type 0x05 from 127.0.0.1:15637 (expected 0x44)",
      });
    });

    it("maps a transport timeout to an actionable timeout result", async () => {
      const fake = scriptedExchange(
        new UdpExchangeError("timeout", "socket timed out")
      );

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toStrictEqual({
        ok: false,
        kind: "timeout",
        error: "No response from 127.0.0.1:15637 within 2000 ms",
      });
    });

    it("reports the custom timeout in the timeout message", async () => {
      const fake = scriptedExchange(new UdpExchangeError("timeout", "late"));

      const result = await queryA2sPlayers(
        { host: "10.0.0.5", port: 27015 },
        { exchange: fake.exchange, timeoutMs: 500 }
      );

      expect(result).toStrictEqual({
        ok: false,
        kind: "timeout",
        error: "No response from 10.0.0.5:27015 within 500 ms",
      });
    });

    it("maps a transport network error through with host:port", async () => {
      const fake = scriptedExchange(
        new UdpExchangeError("network", "send EHOSTUNREACH")
      );

      const result = await queryA2sInfo(TARGET, { exchange: fake.exchange });

      expect(result).toMatchObject({ ok: false, kind: "network" });
      expect(errorText(result)).toContain("127.0.0.1:15637");
      expect(errorText(result)).toContain("send EHOSTUNREACH");
    });

    it("maps a generic transport error to a network result", async () => {
      const fake = scriptedExchange(new Error("boom"));

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(result).toMatchObject({ ok: false, kind: "network" });
      expect(errorText(result)).toContain("127.0.0.1:15637");
      expect(errorText(result)).toContain("boom");
    });

    it("maps a non-Error rejection to a network result", async () => {
      // A misbehaving transport that rejects with a bare string.
      const exchange = jest
        .fn<ReturnType<UdpExchange>, Parameters<UdpExchange>>()
        .mockRejectedValue("weird failure");

      const result = await queryA2sInfo(TARGET, { exchange });

      expect(result).toMatchObject({ ok: false, kind: "network" });
      expect(errorText(result)).toContain("weird failure");
    });

    it("maps a transport that throws synchronously to a network result", async () => {
      const exchange: UdpExchange = () => {
        throw new Error("sync failure");
      };

      const result = await queryA2sInfo(TARGET, { exchange });

      expect(result).toMatchObject({ ok: false, kind: "network" });
      expect(errorText(result)).toContain("sync failure");
    });

    it("maps a timeout during a challenge re-send", async () => {
      const fake = scriptedExchange(
        challengePacket([1, 2, 3, 4]),
        new UdpExchangeError("timeout", "late")
      );

      const result = await queryA2sPlayers(TARGET, { exchange: fake.exchange });

      expect(result).toMatchObject({ ok: false, kind: "timeout" });
      expect(fake.calls).toHaveLength(2);
    });
  });

  describe("default UDP transport", () => {
    let server: Socket | null = null;

    /** Bind a loopback udp4 A2S server that answers via `respond`. */
    async function startLoopbackServer(
      respond: (request: Buffer) => Buffer
    ): Promise<{ target: GameQueryTarget; received: Buffer[] }> {
      const received: Buffer[] = [];
      const socket = createSocket("udp4");
      server = socket;
      socket.on("message", (message, remote) => {
        received.push(Buffer.from(message));
        socket.send(respond(message), remote.port, remote.address);
      });
      await new Promise<void>((resolve) => {
        socket.bind(0, "127.0.0.1", () => resolve());
      });
      return {
        target: { host: "127.0.0.1", port: socket.address().port },
        received,
      };
    }

    afterEach(async () => {
      const open = server;
      server = null;
      if (open !== null) {
        await new Promise<void>((resolve) => {
          open.close(() => resolve());
        });
      }
    });

    it("queries info from a loopback A2S server when no exchange is injected", async () => {
      const loopback = await startLoopbackServer(() =>
        packet(INFO_RESPONSE, ...infoBody())
      );

      const result = await queryA2sInfo(loopback.target);

      expect(result).toStrictEqual({ ok: true, value: BASE_INFO });
      expect(loopback.received).toEqual([INFO_REQUEST]);
    });

    it("completes the player challenge flow over a real socket", async () => {
      const challenge = [0x0a, 0x0b, 0x0c, 0x0d];
      const loopback = await startLoopbackServer((request) =>
        request.subarray(5).equals(Buffer.from(challenge))
          ? packet(PLAYER_RESPONSE, u8(1), playerRow(0, "Alice", 4, 30.5))
          : challengePacket(challenge)
      );

      const result = await queryA2sPlayers(loopback.target);

      expect(result).toStrictEqual({
        ok: true,
        value: [{ index: 0, name: "Alice", score: 4, durationSeconds: 30.5 }],
      });
      expect(loopback.received).toEqual([
        PLAYER_REQUEST,
        u8(...SIMPLE_HEADER, 0x55, ...challenge),
      ]);
    });

    it("answers a challenge from the same source port it was issued to", async () => {
      // Like Steam's query handler: a challenge is only valid for the exact
      // client ip:port it was sent to; anything else gets a fresh challenge.
      const issuedTo = new Map<string, Buffer>();
      let nextChallenge = 0x20;
      const socket = createSocket("udp4");
      server = socket;
      socket.on("message", (message, remote) => {
        const client = `${remote.address}:${String(remote.port)}`;
        const presented = message.subarray(5, 9);
        const expected = issuedTo.get(client);
        if (expected !== undefined && presented.equals(expected)) {
          socket.send(
            packet(PLAYER_RESPONSE, u8(1), playerRow(0, "Ash", 0, 12)),
            remote.port,
            remote.address
          );
          return;
        }
        const challenge = Buffer.from([nextChallenge, 0, 0, 1]);
        nextChallenge += 1;
        issuedTo.set(client, challenge);
        socket.send(
          challengePacket([...challenge]),
          remote.port,
          remote.address
        );
      });
      await new Promise<void>((resolve) => {
        socket.bind(0, "127.0.0.1", () => resolve());
      });

      const result = await queryA2sPlayers({
        host: "127.0.0.1",
        port: socket.address().port,
      });

      expect(result).toStrictEqual({
        ok: true,
        value: [{ index: 0, name: "Ash", score: 0, durationSeconds: 12 }],
      });
      expect(issuedTo.size).toBe(1);
    });
  });
});
