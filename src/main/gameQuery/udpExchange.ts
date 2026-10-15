/**
 * UDP transport for game queries (epic 042): request datagrams out, the first
 * datagram back from the queried host:port, on a short-lived udp4 socket that
 * a session keeps for a whole challenge round trip.
 */

import { createSocket, type RemoteInfo, type Socket } from "dgram";

import type { GameQueryTarget, UdpExchange } from "./types";

/** Why a UDP exchange failed: no reply in time, or a socket/send failure. */
type UdpExchangeErrorKind = "timeout" | "network";

/** Rejection reason for `UdpExchange` implementations. */
export class UdpExchangeError extends Error {
  public readonly kind: UdpExchangeErrorKind;

  public constructor(kind: UdpExchangeErrorKind, message: string) {
    super(message);
    this.name = "UdpExchangeError";
    this.kind = kind;
  }
}

function describeTarget(target: GameQueryTarget): string {
  return `${target.host}:${String(target.port)}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function networkError(
  target: GameQueryTarget,
  error: unknown
): UdpExchangeError {
  return new UdpExchangeError(
    "network",
    `UDP query to ${describeTarget(target)} failed: ${describeError(error)}`
  );
}

/**
 * Close a socket without letting a close failure escape. `close()` throws
 * synchronously only when the socket is already closed.
 */
function closeQuietly(socket: Socket): void {
  try {
    socket.close();
  } catch {
    // Already closed: nothing left to release.
  }
}

/**
 * One udp4 socket reused for several request/response exchanges, so every
 * datagram of a query leaves from the same source port. Steam ties an A2S
 * challenge to the client ip:port it was issued to; answering it from a new
 * socket just earns another challenge.
 */
interface UdpExchangeSession {
  exchange: UdpExchange;
  /** Release the socket (idempotent). */
  close: () => void;
}

/**
 * Open a session whose `exchange` sends `payload` to `target` and resolves
 * with the first datagram received from that same host:port. It rejects with
 * `UdpExchangeError("timeout")` after `timeoutMs` and
 * `UdpExchangeError("network")` on a socket or send error; a failed exchange
 * also closes the session. Exchanges must not overlap.
 */
export function openUdpExchangeSession(): UdpExchangeSession {
  let socket: Socket | null = null;
  let closed = false;

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    if (socket !== null) {
      closeQuietly(socket);
    }
  };

  const ensureSocket = (): Socket => {
    if (socket === null) {
      socket = createSocket("udp4");
      // Keeps a socket error between exchanges from going unhandled.
      socket.on("error", () => undefined);
    }
    return socket;
  };

  const exchange: UdpExchange = (payload, target, timeoutMs) =>
    new Promise<Buffer>((resolve, reject) => {
      if (closed) {
        reject(networkError(target, new Error("UDP session is closed")));
        return;
      }
      const active = ensureSocket();
      let settled = false;

      const settle = (outcome: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        active.off("message", onMessage);
        active.off("error", onError);
        outcome();
      };

      const fail = (error: UdpExchangeError): void => {
        settle(() => {
          close();
          reject(error);
        });
      };

      // Only the queried host:port may answer: a stray or spoofed datagram to
      // our ephemeral port must not pass for the server (e.g. a fake "0
      // players" reply would let the auto-update gate reboot an occupied
      // server).
      function onMessage(message: Buffer, remote: RemoteInfo): void {
        if (remote.address !== target.host || remote.port !== target.port) {
          return;
        }
        settle(() => resolve(message));
      }

      function onError(error: Error): void {
        fail(networkError(target, error));
      }

      const timer = setTimeout(() => {
        fail(
          new UdpExchangeError(
            "timeout",
            `No response from ${describeTarget(target)} within ${String(timeoutMs)} ms`
          )
        );
      }, timeoutMs);

      active.on("message", onMessage);
      active.on("error", onError);

      try {
        active.send(payload, target.port, target.host, (error) => {
          if (error !== null) {
            fail(networkError(target, error));
          }
        });
      } catch (error) {
        fail(networkError(target, error));
      }
    });

  return { exchange, close };
}

/**
 * One-shot `UdpExchange`: a session used for a single request/response and
 * then closed. The socket is closed and the timer cleared exactly once on
 * every path.
 */
export const defaultUdpExchange: UdpExchange = (payload, target, timeoutMs) => {
  const session = openUdpExchangeSession();
  return session.exchange(payload, target, timeoutMs).finally(session.close);
};
