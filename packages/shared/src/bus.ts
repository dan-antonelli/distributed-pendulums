import type { BusMessage } from "./gen/pendulum/v1/bus_pb";

// The only thing the pendulum and gateway logic know about messaging.
// Production: a Redis adapter. Tests: an in-memory fake.
export interface Bus {
  // Resolves once the broker accepted the message; rejects if it couldn't (for example, Redis is down).
  // Accepted is not the same as delivered: pub/sub has no receipts.
  publish(channel: string, message: BusMessage): Promise<void>;
  subscribe(channel: string, handler: (message: BusMessage) => void): void;
  unsubscribe(channel: string): void;
  // `*` matches any text, as in Redis. Only the gateway uses this, to hear every position.
  subscribePattern(pattern: string, handler: (message: BusMessage) => void): void;
}
