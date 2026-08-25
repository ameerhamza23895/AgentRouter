import { AgentRouterClient } from "@agentrouter/agentrouter";

const DEFAULT_BASE = "https://api.agentrouter.to/api/agentic-api";

export function hasApiKey(): boolean {
  const key = process.env.AGENTIC_API_KEY?.trim() ?? "";
  return key.length > 0 && !key.startsWith("aak_your_key");
}

export function createClient(): AgentRouterClient {
  if (!hasApiKey()) {
    throw new Error(
      "AGENTIC_API_KEY is missing. Copy backend/.env.example to backend/.env and paste your key.",
    );
  }

  return new AgentRouterClient({
    apiKey: process.env.AGENTIC_API_KEY,
    baseUrl: process.env.AGENTIC_API_BASE_URL ?? DEFAULT_BASE,
    timeoutMs: 45_000,
  });
}
