import type {
  AgentRouterClient,
  AgenticApiCapabilityCatalogEntry,
  AgenticApiCapabilityContract,
} from "@agentrouter/agentrouter";

export type Source = {
  title: string;
  url?: string;
  snippet?: string;
};

export type ResearchResponse = {
  answer: string;
  sources: Source[];
  recommendation: {
    domain: string;
    capability: string;
    recommendedRouteKey?: string;
    recommendedProvider?: string;
    canExecuteNow?: boolean;
    blockingRequirements?: unknown;
  } | null;
  searchGated: boolean;
  searchNote?: string;
  creditsCharged: number;
  routes: string[];
  wallet: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function queryFieldFromContract(contract: AgenticApiCapabilityContract): string {
  const fields = contract.execute?.fields ?? [];
  const names = fields.map((field) => field.name);
  const preferred = ["query", "q", "prompt", "text", "question", "input"];
  for (const name of preferred) {
    if (names.includes(name)) return name;
  }
  return contract.execute?.requiredFields[0] ?? "query";
}

function pickSearchCapability(
  items: AgenticApiCapabilityCatalogEntry[],
): AgenticApiCapabilityCatalogEntry | null {
  if (!items.length) return null;

  const score = (item: AgenticApiCapabilityCatalogEntry) => {
    const id = `${item.capabilityId} ${item.capabilityKey} ${item.label}`.toLowerCase();
    let n = 0;
    if (item.status === "live") n += 40;
    if (id.includes("answer")) n += 100;
    if (id.includes("web-search") || id.includes("websearch")) n += 90;
    if (id.includes("web search")) n += 85;
    if (id.includes("news")) n += 70;
    if (id.includes("search")) n += 60;
    return n;
  };

  return [...items].sort((a, b) => score(b) - score(a))[0];
}

function collectSources(value: unknown, acc: Source[] = [], depth = 0): Source[] {
  if (depth > 6 || value == null) return acc;

  if (Array.isArray(value)) {
    for (const item of value) collectSources(item, acc, depth + 1);
    return acc;
  }

  if (typeof value !== "object") return acc;

  const rec = asRecord(value);
  const url = String(rec.url ?? rec.link ?? rec.href ?? "");
  const title = String(rec.title ?? rec.name ?? rec.headline ?? rec.url ?? "");
  const snippet = String(
    rec.snippet ?? rec.description ?? rec.content ?? rec.text ?? rec.summary ?? "",
  );

  if (url.startsWith("http")) {
    acc.push({
      title: title || url,
      url,
      snippet: snippet || undefined,
    });
  }

  for (const key of ["results", "sources", "hits", "items", "data", "web", "organic", "raw"]) {
    if (rec[key] != null) collectSources(rec[key], acc, depth + 1);
  }

  return acc;
}

function uniqueSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const source of sources) {
    const key = source.url || source.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out.slice(0, 8);
}

function creditsFrom(result: unknown): number {
  const rec = asRecord(result);
  const raw = asRecord(rec.raw);
  const n = Number(
    rec.creditsCharged ??
      rec.chargedCredits ??
      raw.creditsCharged ??
      raw.chargedCredits ??
      0,
  );
  return Number.isFinite(n) ? n : 0;
}

function completionText(result: unknown): string {
  const rec = asRecord(result);
  const raw = asRecord(rec.raw);
  const direct = rec.completionText ?? raw.completionText ?? rec.answer ?? raw.answer;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const message = asRecord(asRecord(choices[0]).message);
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }

  if (typeof rec.data === "string" && rec.data.trim()) return rec.data.trim();
  return "";
}

function compactSearchContext(searchResult: unknown, sources: Source[]): string {
  if (sources.length) {
    return sources
      .map(
        (s, i) =>
          `${i + 1}. ${s.title}${s.url ? ` (${s.url})` : ""}${s.snippet ? `\n${s.snippet}` : ""}`,
      )
      .join("\n\n");
  }
  try {
    return JSON.stringify(searchResult, null, 2).slice(0, 6000);
  } catch {
    return String(searchResult ?? "");
  }
}

function recField(raw: unknown, key: string): unknown {
  const rec = asRecord(raw);
  const nested = asRecord(rec.raw);
  return rec[key] ?? nested[key];
}

export async function runResearch(
  client: AgentRouterClient,
  query: string,
): Promise<ResearchResponse> {
  const routes: string[] = [];
  let creditsCharged = 0;
  let recommendation: ResearchResponse["recommendation"] = null;
  let searchResult: unknown = null;
  let searchGated = false;
  let searchNote: string | undefined;

  try {
    const listed = await client.catalog.capabilities.list("search");
    const picked = pickSearchCapability(listed);

    if (!picked) {
      searchGated = true;
      searchNote = "No search capabilities were returned from the catalog.";
    } else {
      let queryField = "query";
      try {
        const contract = await client.catalog.capabilities.contract(
          "search",
          picked.capabilityId,
        );
        queryField = queryFieldFromContract(contract);
      } catch {
        queryField = "query";
      }

      const rec = await client.capabilities.recommend({
        domain: "search",
        capability: picked.capabilityId,
        input: {
          optimizationPreferences: ["cost", "quality"],
          [queryField]: query,
        },
      });

      const recommendedRouteKey = recField(rec, "recommendedRouteKey");
      const recommendedProvider = recField(rec, "recommendedProvider");
      const canExecuteNow = recField(rec, "canExecuteNow");

      recommendation = {
        domain: rec.domainKey || "search",
        capability: rec.capabilityId || picked.capabilityId,
        recommendedRouteKey: recommendedRouteKey
          ? String(recommendedRouteKey)
          : undefined,
        recommendedProvider: recommendedProvider
          ? String(recommendedProvider)
          : undefined,
        canExecuteNow: canExecuteNow !== false,
        blockingRequirements: recField(rec, "blockingRequirements"),
      };

      if (recommendation.recommendedRouteKey) {
        routes.push(recommendation.recommendedRouteKey);
      }

      if (canExecuteNow === false) {
        searchGated = true;
        searchNote =
          "Search route is not executable right now (gated or blocked). Answering from the chat model only.";
      } else {
        const executed = await client.capabilities.execute({
          domain: "search",
          capability: picked.capabilityId,
          routeKey: recommendation.recommendedRouteKey,
          provider: recommendation.recommendedProvider,
          allowFallback: true,
          input: { [queryField]: query },
        });
        searchResult = executed;
        creditsCharged += creditsFrom(executed);
        const routeKey = recField(executed, "routeKey");
        if (routeKey) routes.push(String(routeKey));
      }
    }
  } catch (error) {
    searchGated = true;
    searchNote =
      error instanceof Error
        ? `Search failed: ${error.message}`
        : "Search failed. Answering from the chat model only.";
  }

  const sources = uniqueSources(collectSources(searchResult));
  const context = compactSearchContext(searchResult, sources);
  let answer = "";

  try {
    const chat = await client.capabilities.execute({
      domain: "models",
      capability: "chat-complete",
      routeKey: "models.chat.complete.deepseek.mpp",
      allowFallback: true,
      input: {
        model: "deepseek-v4-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a research assistant. Write a concise, factual answer. Cite sources by number when search results are provided. If there are no search results, say so and answer from general knowledge.",
          },
          {
            role: "user",
            content: `Question:\n${query}\n\nSearch results:\n${context || "(none)"}`,
          },
        ],
      },
    });

    creditsCharged += creditsFrom(chat);
    const chatRoute = recField(chat, "routeKey");
    if (chatRoute) routes.push(String(chatRoute));
    answer = completionText(chat);
  } catch (error) {
    if (!answer) {
      answer =
        error instanceof Error
          ? `Could not write an answer: ${error.message}`
          : "Could not write an answer.";
    }
  }

  if (!answer) {
    answer = searchGated
      ? searchNote || "Could not complete research."
      : sources.length
        ? sources.map((s) => `• ${s.title}${s.url ? ` — ${s.url}` : ""}`).join("\n")
        : "Search completed but no answer text was returned.";
  }

  let wallet: unknown = null;
  try {
    wallet = await client.wallet.get();
  } catch {
    wallet = null;
  }

  return {
    answer,
    sources,
    recommendation,
    searchGated,
    searchNote,
    creditsCharged,
    routes: [...new Set(routes)],
    wallet,
  };
}
