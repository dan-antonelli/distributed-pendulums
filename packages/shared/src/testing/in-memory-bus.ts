import type { Bus } from "../bus";
import type { BusMessage } from "../gen/pendulum/v1/bus_pb";

type Handler = (message: BusMessage) => void;

// Decides whether a message reaches a given receiver. Lets tests simulate lost messages.
export type DeliveryFilter = (receiver: string, channel: string, message: BusMessage) => boolean;

// A fake broker for tests. Each participant connects under a name and gets its own Bus.
// Delivery is asynchronous (setTimeout 0), like Redis, so fake timers control it.
export class InMemoryBus {
  private readonly subscriptions = new Map<string, Map<string, Handler>>();
  private readonly patterns: { receiver: string; pattern: RegExp; handler: Handler }[] = [];
  filter: DeliveryFilter = () => true;

  connect(name: string): Bus & { disconnect(): void } {
    return {
      publish: async (channel, message) => this.deliver(channel, message),
      subscribe: (channel, handler) => this.channel(channel).set(name, handler),
      unsubscribe: (channel) => this.subscriptions.get(channel)?.delete(name),
      subscribePattern: (pattern, handler) => {
        const escaped = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
        this.patterns.push({ receiver: name, pattern: new RegExp(`^${escaped.join(".*")}$`), handler });
      },
      disconnect: () => {
        for (const subscribers of this.subscriptions.values()) subscribers.delete(name);
        for (let i = this.patterns.length - 1; i >= 0; i--) if (this.patterns[i]!.receiver === name) this.patterns.splice(i, 1);
      },
    };
  }

  private channel(channel: string): Map<string, Handler> {
    let subscribers = this.subscriptions.get(channel);
    if (!subscribers) {
      subscribers = new Map();
      this.subscriptions.set(channel, subscribers);
    }
    return subscribers;
  }

  private deliver(channel: string, message: BusMessage): void {
    for (const { receiver, pattern, handler } of this.patterns) {
      if (pattern.test(channel) && this.filter(receiver, channel, message)) setTimeout(() => handler(message), 0);
    }
    for (const [receiver, handler] of this.subscriptions.get(channel) ?? []) {
      if (!this.filter(receiver, channel, message)) continue;
      // Re-check on arrival: a receiver that unsubscribed (or died) while the message was in flight gets nothing.
      setTimeout(() => {
        if (this.subscriptions.get(channel)?.get(receiver) === handler) handler(message);
      }, 0);
    }
  }
}
