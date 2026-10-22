import { fromBinary, toBinary } from "@bufbuild/protobuf";
import { createClient } from "redis";
import type { Bus } from "./bus";
import { type BusMessage, BusMessageSchema } from "./gen/pendulum/v1/bus_pb";

const NEXT_ID_KEY = "pendulums:next-id";

const logError = (error: unknown) => console.error("redis:", error instanceof Error ? error.message : error);

// Node-only, so it lives behind its own import path and never reaches the browser bundle.
export async function connectRedis(url: string) {
  // Fail publishes at once while disconnected: a queue would replay stale positions on reconnect,
  // and the gateway couldn't tell the user that a command didn't go out.
  const publisher = createClient({ url, disableOfflineQueue: true });
  publisher.on("error", logError);
  await publisher.connect();

  // A connection in subscribe mode can't send other commands. This one keeps the offline queue,
  // so a subscribe issued during a disconnect still happens.
  const subscriber = createClient({ url });
  subscriber.on("error", logError);
  await subscriber.connect();

  const decode = (raw: Buffer): BusMessage | undefined => {
    try {
      return fromBinary(BusMessageSchema, raw);
    } catch (error) {
      logError(error);
      return undefined;
    }
  };

  const bus: Bus = {
    async publish(channel, message) {
      await publisher.publish(channel, Buffer.from(toBinary(BusMessageSchema, message)));
    },
    subscribe(channel, handler) {
      const listener = (raw: Buffer) => {
        const message = decode(raw);
        if (message) handler(message);
      };
      subscriber.subscribe(channel, listener, true).catch(logError);
    },
    unsubscribe(channel) {
      subscriber.unsubscribe(channel).catch(logError);
    },
    subscribePattern(pattern, handler) {
      const listener = (raw: Buffer) => {
        const message = decode(raw);
        if (message) handler(message);
      };
      subscriber.pSubscribe(pattern, listener, true).catch(logError);
    },
  };

  return {
    bus,
    // INCR is atomic, so two servers starting together never get the same id.
    claimId: () => publisher.incr(NEXT_ID_KEY),
    async close() {
      await subscriber.close();
      await publisher.close();
    },
  };
}
