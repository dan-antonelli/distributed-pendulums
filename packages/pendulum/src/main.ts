import { PendulumPhase } from "@pendulums/shared";
import { connectRedis } from "@pendulums/shared/redis";
import { PendulumController } from "./controller";
import { defaultConfig } from "./defaults";
import { startLoop } from "./loop";
import { STEP_S } from "./physics";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const redis = await connectRedis(redisUrl);
const id = await redis.claimId();
const config = defaultConfig(id);
const controller = new PendulumController(id, config, redis.bus);
controller.start();

const log = (text: string) => console.log(`[pendulum ${id}] ${text}`);
log(`up: anchor ${config.anchorXM.toFixed(1)} m, length ${config.lengthM} m, redis ${redisUrl}`);

let lastPhase = controller.phase;
const stopLoop = startLoop(() => {
  controller.tick(STEP_S);
  if (controller.phase !== lastPhase) {
    log(`${PendulumPhase[lastPhase]} -> ${PendulumPhase[controller.phase]} (cycle ${controller.cycle})`);
    lastPhase = controller.phase;
  }
});

async function shutdown() {
  stopLoop();
  controller.dispose();
  await redis.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
