import type { BusMessage } from "./gen/pendulum/v1/bus_pb";

export interface Bus {
  // Rejects if the broker didn't accept the message. Accepted is not delivered: pub/sub has no receipts.
  publish(channel: string, message: BusMessage): Promise<void>;
  subscribe(channel: string, handler: (message: BusMessage) => void): void;
  unsubscribe(channel: string): void;
  subscribePattern(pattern: string, handler: (message: BusMessage) => void): void;
}
