import { type Transport, createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { SimulationService } from "@pendulums/shared";
import { createContext, useContext, useMemo } from "react";

export const gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:8080";

export const TransportContext = createContext<Transport>(createConnectTransport({ baseUrl: gatewayUrl }));

export function useClient() {
  const transport = useContext(TransportContext);
  return useMemo(() => createClient(SimulationService, transport), [transport]);
}
