import dgram, { type RemoteInfo, type Socket } from "dgram";
import { once } from "events";

import type { GameQueryTarget } from "../../../main/gameQuery/types";
import {
  defaultUdpExchange,
  openUdpExchangeSession,
  UdpExchangeError,
} from "../../../main/gameQuery/udpExchange";

const REQUEST = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54, 0x01]);
const REPLY = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49, 0x11, 0x00]);

interface LoopbackServer {
  socket: Socket;
  target: GameQueryTarget;
  received: Buffer[];
}

const openServers: Socket[] = [];

/**
 * Bind a udp4 server on 127.0.0.1 (ephemeral port) that records every
 * datagram and answers with `reply`, or stays silent when `reply` is null.
 */
async function startServer(reply: Buffer | null): Promise<LoopbackServer> {
  const socket = dgram.createSocket("udp4");
  openServers.push(socket);
  const received: Buffer[] = [];
  socket.on("message", (message: Buffer, remote: RemoteInfo) => {
    received.push(Buffer.from(message));
    if (reply !== null) {
      socket.send(reply, remote.port, remote.address);
    }
  });
  await new Promise<void>((resolve) => {
    socket.bind(0, "127.0.0.1", () => resolve());
  });
  return {
    socket,
    target: { host: "127.0.0.1", port: socket.address().port },
    received,
  };
}

function closeSocket(socket: Socket): Promise<void> {
  return new Promise<void>((resolve) => {
    socket.close(() => resolve());
  });
}

type CreateSocketSpy = jest.SpiedFunction<typeof dgram.createSocket>;

/** The client socket defaultUdpExchange created (the most recent one). */
function lastCreatedSocket(spy: CreateSocketSpy): Socket {
  const { results } = spy.mock;
  const last = results.length > 0 ? results[results.length - 1] : undefined;
  if (last === undefined || last.type !== "return") {
    throw new Error("expected defaultUdpExchange to create a socket");
  }
  return last.value;
}

async function captureExchangeError(
  pending: Promise<Buffer>
): Promise<UdpExchangeError> {
  const outcome: unknown = await pending.then(
    () => null,
    (error: unknown) => error
  );
  if (!(outcome instanceof UdpExchangeError)) {
    throw new Error("expected the exchange to reject with UdpExchangeError");
  }
  return outcome;
}

describe("defaultUdpExchange", () => {
  let createSpy: CreateSocketSpy;

  beforeEach(() => {
    createSpy = jest.spyOn(dgram, "createSocket");
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    await Promise.all(openServers.splice(0).map(closeSocket));
  });

  it("resolves with the datagram the target sends back", async () => {
    const server = await startServer(REPLY);

    const reply = await defaultUdpExchange(REQUEST, server.target, 2000);

    expect(reply).toEqual(REPLY);
    expect(server.received).toEqual([REQUEST]);
  });

  it("ignores datagrams from anyone but the queried host:port", async () => {
    const stranger = dgram.createSocket("udp4");
    openServers.push(stranger);
    await new Promise<void>((resolve) => {
      stranger.bind(0, "127.0.0.1", () => resolve());
    });
    const spoofed = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49, 0x66]);

    // The real server first makes a stranger hit the client's port with a
    // spoofed reply, then answers itself once that datagram is out.
    const socket = dgram.createSocket("udp4");
    openServers.push(socket);
    socket.on("message", (_message: Buffer, remote: RemoteInfo) => {
      stranger.send(spoofed, remote.port, remote.address, () => {
        setTimeout(() => {
          socket.send(REPLY, remote.port, remote.address);
        }, 50);
      });
    });
    await new Promise<void>((resolve) => {
      socket.bind(0, "127.0.0.1", () => resolve());
    });

    const reply = await defaultUdpExchange(
      REQUEST,
      { host: "127.0.0.1", port: socket.address().port },
      2000
    );

    expect(reply).toEqual(REPLY);
  });

  it("closes its socket once and clears its timer after a reply", async () => {
    jest.useFakeTimers({
      doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
    });
    const server = await startServer(REPLY);

    const pending = defaultUdpExchange(REQUEST, server.target, 5000);
    const client = lastCreatedSocket(createSpy);
    const closeSpy = jest.spyOn(client, "close");
    expect(jest.getTimerCount()).toBe(1);

    await expect(pending).resolves.toEqual(REPLY);
    expect(jest.getTimerCount()).toBe(0);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects with a timeout error when the target never replies", async () => {
    const server = await startServer(null);

    const pending = defaultUdpExchange(REQUEST, server.target, 100);
    const client = lastCreatedSocket(createSpy);
    const closeSpy = jest.spyOn(client, "close");
    const error = await captureExchangeError(pending);

    expect(error.kind).toBe("timeout");
    expect(error.name).toBe("UdpExchangeError");
    expect(error.message).toBe(
      `No response from 127.0.0.1:${String(server.target.port)} within 100 ms`
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects with a network error and closes when the socket errors", async () => {
    const server = await startServer(null);

    const pending = defaultUdpExchange(REQUEST, server.target, 5000);
    const client = lastCreatedSocket(createSpy);
    const delivered = once(server.socket, "message");
    await delivered;
    const closeSpy = jest.spyOn(client, "close");
    client.emit("error", new Error("boom"));
    const error = await captureExchangeError(pending);

    expect(error.kind).toBe("network");
    expect(error.message).toContain(`127.0.0.1:${String(server.target.port)}`);
    expect(error.message).toContain("boom");
    expect(closeSpy).toHaveBeenCalledTimes(1);

    client.emit("error", new Error("late"));
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects with a network error and closes when the send fails", async () => {
    const server = await startServer(null);
    const oversized = Buffer.alloc(70000);

    const pending = defaultUdpExchange(oversized, server.target, 5000);
    const closed = once(lastCreatedSocket(createSpy), "close");
    const error = await captureExchangeError(pending);

    expect(error.kind).toBe("network");
    expect(error.message).toContain(`127.0.0.1:${String(server.target.port)}`);
    await closed;
  });

  it("rejects with a network error when send throws synchronously", async () => {
    const pending = defaultUdpExchange(
      REQUEST,
      { host: "127.0.0.1", port: 0 },
      5000
    );
    const closed = once(lastCreatedSocket(createSpy), "close");
    const error = await captureExchangeError(pending);

    expect(error.kind).toBe("network");
    expect(error.message).toContain("127.0.0.1:0");
    await closed;
  });
});

describe("openUdpExchangeSession", () => {
  afterEach(async () => {
    await Promise.all(openServers.splice(0).map(closeSocket));
  });

  it("sends every exchange from the same source port until closed", async () => {
    const sourcePorts: number[] = [];
    const socket = dgram.createSocket("udp4");
    openServers.push(socket);
    socket.on("message", (_message: Buffer, remote: RemoteInfo) => {
      sourcePorts.push(remote.port);
      socket.send(REPLY, remote.port, remote.address);
    });
    await new Promise<void>((resolve) => {
      socket.bind(0, "127.0.0.1", () => resolve());
    });
    const target = { host: "127.0.0.1", port: socket.address().port };

    const session = openUdpExchangeSession();
    await expect(session.exchange(REQUEST, target, 2000)).resolves.toEqual(
      REPLY
    );
    await expect(session.exchange(REQUEST, target, 2000)).resolves.toEqual(
      REPLY
    );
    session.close();
    session.close();

    expect(sourcePorts).toHaveLength(2);
    expect(sourcePorts[1]).toBe(sourcePorts[0]);
  });

  it("rejects exchanges once closed, without sending", async () => {
    const server = await startServer(REPLY);
    const session = openUdpExchangeSession();
    session.close();

    const error = await captureExchangeError(
      session.exchange(REQUEST, server.target, 2000)
    );

    expect(error.kind).toBe("network");
    expect(error.message).toContain("UDP session is closed");
    expect(server.received).toEqual([]);
  });

  it("closes the session after a failed exchange", async () => {
    const server = await startServer(null);
    const session = openUdpExchangeSession();

    const timeout = await captureExchangeError(
      session.exchange(REQUEST, server.target, 50)
    );
    const afterwards = await captureExchangeError(
      session.exchange(REQUEST, server.target, 2000)
    );

    expect(timeout.kind).toBe("timeout");
    expect(afterwards.message).toContain("UDP session is closed");
  });
});
