import type { BusMessage } from "./gen/pendulum/v1/bus_pb";

// The only thing the pendulum and gateway logic know about messaging.
// Production: a Redis adapter. Tests: an in-memory fake.
export interface Bus {
  publish(channel: string, message: BusMessage): void;
  subscribe(channel: string, handler: (message: BusMessage) => void): void;
  unsubscribe(channel: string): void;
  // `*` matches any text, as in Redis. Only the gateway uses this, to hear every position.
  subscribePattern(pattern: string, handler: (message: BusMessage) => void): void;
}
