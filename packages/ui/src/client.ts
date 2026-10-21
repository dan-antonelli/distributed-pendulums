import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { SimulationService } from "@pendulums/shared";

// Set at build time (VITE_GATEWAY_URL). The default matches the port docker compose publishes.
export const gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8080";

export const client = createClient(SimulationService, createConnectTransport({ baseUrl: gatewayUrl }));
