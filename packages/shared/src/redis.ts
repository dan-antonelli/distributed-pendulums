import { fromBinary, toBinary } from "@bufbuild/protobuf";
import { createClient } from "redis";
import type { Bus } from "./bus";
import { type BusMessage, BusMessageSchema } from "./gen/pendulum/v1/bus_pb";

const NEXT_ID_KEY = "pendulums:next-id";

const logError = (error: unknown) => console.error("redis:", error instanceof Error ? error.message : error);

// The production Bus: Redis pub/sub carrying binary protobuf (DECISIONS D2, D17).
// Node-only, so it lives behind its own import path ("@pendulums/shared/redis") and never reaches the browser bundle.
export async function connectRedis(url: string) {
  const publisher = createClient({ url });
  publisher.on("error", logError);
  await publisher.connect();

  // A Redis connection in subscribe mode can't send other commands, so subscriptions get their own.
  const subscriber = publisher.duplicate();
  subscriber.on("error", logError);
  await subscriber.connect();

  const decode = (raw: Buffer): BusMessage | undefined => {
    try {
      return fromBinary(BusMessageSchema, raw);
    } catch (error) {
      // Not ours, or a version we can't read. Log and drop it rather than crash (DECISIONS D14).
      logError(error);
      return undefined;
    }
  };

  const bus: Bus = {
    publish(channel, message) {
      publisher.publish(channel, Buffer.from(toBinary(BusMessageSchema, message))).catch(logError);
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
    // Atomic: Redis runs commands one at a time, so two servers starting together never get the same id (DECISIONS D10).
    claimId: () => publisher.incr(NEXT_ID_KEY),
    async close() {
      await subscriber.close();
      await publisher.close();
    },
  };
}
