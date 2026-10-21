import type { BusMessage } from "./gen/pendulum/v1/bus_pb";

// The only thing the pendulum logic knows about messaging.
// Production: a Redis adapter. Tests: an in-memory fake. (DECISIONS D16)
export interface Bus {
  publish(channel: string, message: BusMessage): void;
  subscribe(channel: string, handler: (message: BusMessage) => void): void;
  unsubscribe(channel: string): void;
}
