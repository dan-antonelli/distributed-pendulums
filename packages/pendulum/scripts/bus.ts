import { create, toJson } from "@bufbuild/protobuf";
import { BusMessageSchema, CommandType, channels } from "@pendulums/shared";
import { connectRedis } from "@pendulums/shared/redis";

const commands = { start: CommandType.START, pause: CommandType.PAUSE, stop: CommandType.STOP } as const;
const [action, name] = process.argv.slice(2);
const redis = await connectRedis(process.env.REDIS_URL ?? "redis://localhost:6379");

if (action === "send" && name && name in commands) {
  const type = commands[name as keyof typeof commands];
  await redis.bus.publish(channels.control, create(BusMessageSchema, { body: { case: "command", value: { type } } }));
  await redis.close();
} else if (action === "watch") {
  for (const channel of [channels.heartbeat, channels.control]) {
    redis.bus.subscribe(channel, (message) => console.log(channel, JSON.stringify(toJson(BusMessageSchema, message))));
  }
} else {
  console.log("usage: bus.ts send start|pause|stop | bus.ts watch");
  await redis.close();
}
