/**
 * Steam A2S (Valve server query) client for A2S_INFO and A2S_PLAYER (epic
 * 042). Used against the Enshrouded dedicated server's `queryPort`.
 * Protocol: https://developer.valvesoftware.com/wiki/Server_queries
 *
 * Only single-packet responses are supported. Split (multi-packet) responses
 * are reported as a parse error: Enshrouded caps servers at 16 players, so its
 * A2S_INFO and A2S_PLAYER responses always fit in one datagram.
 */

import type { GameQueryTarget, UdpExchange } from "./types";
import { openUdpExchangeSession, UdpExchangeError } from "./udpExchange";

/** Failure category of an A2S query. */
type A2sErrorKind = "timeout" | "network" | "empty" | "parse";

/** Outcome of an A2S query; queries never throw or reject. */
export type A2sResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: A2sErrorKind; error: string };

/** Decoded A2S_INFO (Source) response. */
export interface A2sInfo {
  protocol: number;
  name: string;
  map: string;
  folder: string;
  game: string;
  /** The 16-bit "ID" field (low bits of the Steam app id). */
  steamAppId: number;
  players: number;
  maxPlayers: number;
  bots: number;
  /** Single ASCII char, e.g. "d" (dedicated). */
  serverType: string;
  /** Single ASCII char, e.g. "w" (Windows). */
  environment: string;
  passwordProtected: boolean;
  vacSecured: boolean;
  version: string;
  /** Game port from extra data flag 0x80, when the server sends it. */
  gamePort?: number;
  /** Keywords/tags from extra data flag 0x20, when the server sends it. */
  keywords?: string;
}

/** One row of an A2S_PLAYER response. */
interface A2sPlayer {
  index: number;
  name: string;
  score: number;
  durationSeconds: number;
}

/** Transport and timeout overrides for an A2S query. */
interface A2sQueryOptions {
  /** Defaults to one real udp4 socket per query (`openUdpExchangeSession`). */
  exchange?: UdpExchange;
  /** Per-datagram reply timeout; defaults to 2000 ms. */
  timeoutMs?: number;
}

type A2sFailure = Extract<A2sResult<never>, { ok: false }>;

const DEFAULT_TIMEOUT_MS = 2000;
/** Challenge re-sends allowed per query before giving up (loop guard). */
const MAX_CHALLENGE_ROUNDS = 2;

const SIMPLE_HEADER = -1;
const SPLIT_HEADER = -2;
const MIN_PACKET_LENGTH = 5;
const CHALLENGE_LENGTH = 4;

const A2S_INFO_REQUEST = 0x54;
const A2S_PLAYER_REQUEST = 0x55;
const S2C_CHALLENGE = 0x41;
const A2S_INFO_RESPONSE = 0x49;
const A2S_PLAYER_RESPONSE = 0x44;

const EDF_GAME_PORT = 0x80;
const EDF_STEAM_ID = 0x10;
const EDF_SOURCE_TV = 0x40;
const EDF_KEYWORDS = 0x20;
const EDF_GAME_ID = 0x01;

const INFO_PAYLOAD = Buffer.from("Source Engine Query\0", "latin1");
const NO_CHALLENGE = Buffer.from([0xff, 0xff, 0xff, 0xff]);

/** Thrown by `ByteReader` and caught inside this module as kind "parse". */
class A2sParseError extends Error {}

/** Bounds-checked little-endian cursor over a response datagram. */
class ByteReader {
  private offset: number;

  public constructor(
    private readonly buffer: Buffer,
    start: number
  ) {
    this.offset = start;
  }

  public remaining(): number {
    return this.buffer.length - this.offset;
  }

  public readUInt8(): number {
    return this.buffer.readUInt8(this.take(1));
  }

  public readUInt16LE(): number {
    return this.buffer.readUInt16LE(this.take(2));
  }

  public readInt32LE(): number {
    return this.buffer.readInt32LE(this.take(4));
  }

  public readFloatLE(): number {
    return this.buffer.readFloatLE(this.take(4));
  }

  public readBytes(length: number): Buffer {
    const start = this.take(length);
    return Buffer.from(this.buffer.subarray(start, start + length));
  }

  public skip(length: number): void {
    this.take(length);
  }

  /** Null-terminated UTF-8 string. */
  public readString(): string {
    const end = this.buffer.indexOf(0, this.offset);
    if (end === -1) {
      throw new A2sParseError(
        `Truncated A2S response: unterminated string at byte ${String(this.offset)}`
      );
    }
    const value = this.buffer.toString("utf8", this.offset, end);
    this.offset = end + 1;
    return value;
  }

  /** Reserve `length` bytes and return their start offset. */
  private take(length: number): number {
    if (this.remaining() < length) {
      throw new A2sParseError(
        `Truncated A2S response: needed ${String(length)} byte(s) at byte ${String(this.offset)}, ${String(this.remaining())} left`
      );
    }
    const start = this.offset;
    this.offset += length;
    return start;
  }
}

/** One A2S request/response pairing, minus the shared challenge loop. */
interface A2sQuerySpec<T> {
  buildRequest(challenge: Buffer | null): Buffer;
  responseType: number;
  parse(reader: ByteReader): T;
}

type ResponseStep<T> =
  | { kind: "challenge"; challenge: Buffer }
  | { kind: "done"; result: A2sResult<T> };

function describeTarget(target: GameQueryTarget): string {
  return `${target.host}:${String(target.port)}`;
}

function hexByte(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;
}

function failure(kind: A2sErrorKind, error: string): A2sFailure {
  return { ok: false, kind, error };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}

function requestHeader(type: number): Buffer {
  const header = Buffer.alloc(MIN_PACKET_LENGTH);
  header.writeInt32LE(SIMPLE_HEADER, 0);
  header.writeUInt8(type, 4);
  return header;
}

function buildInfoRequest(challenge: Buffer | null): Buffer {
  const parts = [requestHeader(A2S_INFO_REQUEST), INFO_PAYLOAD];
  if (challenge !== null) {
    parts.push(challenge);
  }
  return Buffer.concat(parts);
}

function buildPlayerRequest(challenge: Buffer | null): Buffer {
  return Buffer.concat([
    requestHeader(A2S_PLAYER_REQUEST),
    challenge ?? NO_CHALLENGE,
  ]);
}

/** Apply the optional Extra Data Flag fields, in protocol order. */
function readExtraData(reader: ByteReader, info: A2sInfo): void {
  const flags = reader.readUInt8();
  if (hasFlag(flags, EDF_GAME_PORT)) {
    info.gamePort = reader.readUInt16LE();
  }
  if (hasFlag(flags, EDF_STEAM_ID)) {
    reader.skip(8);
  }
  if (hasFlag(flags, EDF_SOURCE_TV)) {
    reader.skip(2);
    reader.readString();
  }
  if (hasFlag(flags, EDF_KEYWORDS)) {
    info.keywords = reader.readString();
  }
  if (hasFlag(flags, EDF_GAME_ID)) {
    reader.skip(8);
  }
}

function parseInfo(reader: ByteReader): A2sInfo {
  // Property initialisers run in source order, which is the wire order.
  const info: A2sInfo = {
    protocol: reader.readUInt8(),
    name: reader.readString(),
    map: reader.readString(),
    folder: reader.readString(),
    game: reader.readString(),
    steamAppId: reader.readUInt16LE(),
    players: reader.readUInt8(),
    maxPlayers: reader.readUInt8(),
    bots: reader.readUInt8(),
    serverType: String.fromCharCode(reader.readUInt8()),
    environment: String.fromCharCode(reader.readUInt8()),
    passwordProtected: reader.readUInt8() === 1,
    vacSecured: reader.readUInt8() === 1,
    version: reader.readString(),
  };
  if (reader.remaining() > 0) {
    readExtraData(reader, info);
  }
  return info;
}

function parsePlayers(reader: ByteReader): A2sPlayer[] {
  const count = reader.readUInt8();
  const players: A2sPlayer[] = [];
  // Servers may announce more players than they list; stop cleanly when the
  // datagram ends exactly on a row boundary.
  while (players.length < count && reader.remaining() > 0) {
    players.push({
      index: reader.readUInt8(),
      name: reader.readString(),
      score: reader.readInt32LE(),
      durationSeconds: reader.readFloatLE(),
    });
  }
  return players;
}

const INFO_QUERY: A2sQuerySpec<A2sInfo> = {
  buildRequest: buildInfoRequest,
  responseType: A2S_INFO_RESPONSE,
  parse: parseInfo,
};

const PLAYER_QUERY: A2sQuerySpec<A2sPlayer[]> = {
  buildRequest: buildPlayerRequest,
  responseType: A2S_PLAYER_RESPONSE,
  parse: parsePlayers,
};

/** Validate the datagram header and decode a challenge or final response. */
function interpretResponse<T>(
  response: Buffer,
  spec: A2sQuerySpec<T>,
  target: GameQueryTarget
): ResponseStep<T> {
  if (response.length < MIN_PACKET_LENGTH) {
    return {
      kind: "done",
      result: failure(
        "empty",
        `Empty A2S response from ${describeTarget(target)} (${String(response.length)} byte(s))`
      ),
    };
  }
  const header = response.readInt32LE(0);
  if (header === SPLIT_HEADER) {
    return {
      kind: "done",
      result: failure("parse", "Multi-packet A2S responses are not supported"),
    };
  }
  if (header !== SIMPLE_HEADER) {
    return {
      kind: "done",
      result: failure(
        "parse",
        `Unexpected A2S packet header from ${describeTarget(target)}`
      ),
    };
  }

  const type = response.readUInt8(4);
  const reader = new ByteReader(response, MIN_PACKET_LENGTH);
  try {
    if (type === S2C_CHALLENGE) {
      return {
        kind: "challenge",
        challenge: reader.readBytes(CHALLENGE_LENGTH),
      };
    }
    if (type === spec.responseType) {
      return { kind: "done", result: { ok: true, value: spec.parse(reader) } };
    }
  } catch (error) {
    return { kind: "done", result: failure("parse", errorMessage(error)) };
  }
  return {
    kind: "done",
    result: failure(
      "parse",
      `Unexpected A2S response type ${hexByte(type)} from ${describeTarget(target)} (expected ${hexByte(spec.responseType)})`
    ),
  };
}

function exchangeFailure(
  error: unknown,
  target: GameQueryTarget,
  timeoutMs: number
): A2sFailure {
  if (error instanceof UdpExchangeError && error.kind === "timeout") {
    return failure(
      "timeout",
      `No response from ${describeTarget(target)} within ${String(timeoutMs)} ms`
    );
  }
  return failure(
    "network",
    `Could not query ${describeTarget(target)}: ${errorMessage(error)}`
  );
}

/** Run one query over the injected transport or a fresh UDP session. */
async function runQuery<T>(
  target: GameQueryTarget,
  spec: A2sQuerySpec<T>,
  options: A2sQueryOptions
): Promise<A2sResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (options.exchange !== undefined) {
    return exchangeWithChallenges(target, spec, options.exchange, timeoutMs);
  }
  // One socket for the whole challenge round trip: Steam only honours a
  // challenge from the ip:port it was issued to.
  const session = openUdpExchangeSession();
  try {
    return await exchangeWithChallenges(
      target,
      spec,
      session.exchange,
      timeoutMs
    );
  } finally {
    session.close();
  }
}

/** Send a request, answering up to `MAX_CHALLENGE_ROUNDS` challenges. */
async function exchangeWithChallenges<T>(
  target: GameQueryTarget,
  spec: A2sQuerySpec<T>,
  exchange: UdpExchange,
  timeoutMs: number
): Promise<A2sResult<T>> {
  let challenge: Buffer | null = null;

  for (let round = 0; round <= MAX_CHALLENGE_ROUNDS; round += 1) {
    let response: Buffer;
    try {
      response = await exchange(
        spec.buildRequest(challenge),
        target,
        timeoutMs
      );
    } catch (error) {
      return exchangeFailure(error, target, timeoutMs);
    }
    const step = interpretResponse(response, spec, target);
    if (step.kind === "done") {
      return step.result;
    }
    challenge = step.challenge;
  }

  return failure(
    "parse",
    `${describeTarget(target)} kept answering with a new challenge after ${String(MAX_CHALLENGE_ROUNDS)} rounds`
  );
}

/** Query A2S_INFO. Never throws; failures are `{ ok: false }` results. */
export function queryA2sInfo(
  target: GameQueryTarget,
  options: A2sQueryOptions = {}
): Promise<A2sResult<A2sInfo>> {
  return runQuery(target, INFO_QUERY, options);
}

/** Query A2S_PLAYER. Never throws; failures are `{ ok: false }` results. */
export function queryA2sPlayers(
  target: GameQueryTarget,
  options: A2sQueryOptions = {}
): Promise<A2sResult<A2sPlayer[]>> {
  return runQuery(target, PLAYER_QUERY, options);
}
