import http from "node:http";
import { cors } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { channels } from "@pendulums/shared";
import { connectRedis } from "@pendulums/shared/redis";
import { routes } from "./service";
import { SystemView } from "./view";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const port = Number(process.env.PORT ?? 8080);
// The UI runs on another port, so the browser needs permission to call us (CORS).
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "*";

const redis = await connectRedis(redisUrl);
const view = new SystemView();
redis.bus.subscribe(channels.heartbeat, view.onMessage);
redis.bus.subscribePattern(channels.allPositions, view.onMessage);

const connect = connectNodeAdapter({ routes: routes(redis.bus, view) });

const server = http.createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Methods": cors.allowedMethods.join(", "),
      "Access-Control-Allow-Headers": cors.allowedHeaders.join(", "),
      "Access-Control-Max-Age": "7200",
    });
    response.end();
    return;
  }
  response.setHeader("Access-Control-Expose-Headers", cors.exposedHeaders.join(", "));
  connect(request, response);
});

server.listen(port, () => console.log(`[gateway] listening on :${port}, redis ${redisUrl}`));

async function shutdown() {
  server.close();
  await redis.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
