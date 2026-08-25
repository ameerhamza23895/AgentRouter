import type { AgentRouterClient } from "@agentrouter/agentrouter";

export type TryOnInput = {
  person: { buffer: Buffer; mimetype: string; originalname: string };
  wearable: { buffer: Buffer; mimetype: string; originalname: string };
  itemType: string;
  notes?: string;
};

export type TryOnResult = {
  imageUrl: string | null;
  prompt: string;
  personUrl?: string;
  wearableUrl?: string;
  routeKey?: string;
  creditsCharged: number;
  note?: string;
  wallet: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
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

function findUrl(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const rec = asRecord(value);
  for (const key of [
    "primaryImageUrl",
    "url",
    "imageUrl",
    "publicUrl",
    "fileUrl",
    "hostedUrl",
    "src",
    "href",
  ]) {
    const v = rec[key];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  }
  for (const nested of [rec.raw, rec.data, rec.file, rec.image, rec.images, rec.result]) {
    const found = findUrl(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function dataUri(file: TryOnInput["person"]): string {
  return `data:${file.mimetype || "image/jpeg"};base64,${file.buffer.toString("base64")}`;
}

function buildPrompt(itemType: string, notes?: string): string {
  const item = itemType.trim() || "wearable accessory";
  const extra = notes?.trim() ? ` Extra direction: ${notes.trim()}` : "";
  return [
    "Photorealistic virtual try-on.",
    "The first/input photo is the person. Keep their face, identity, skin tone, hair, body shape, pose, camera angle, lighting, and background the same.",
    `The reference/source photo is the ${item}. Place that exact ${item} onto the person as if they are wearing it.`,
    "Match scale, perspective, fabric or metal texture, color, and lighting. Natural fit, no extra jewelry or clothing that is not in the reference.",
    "Fashion photography, sharp details, no text, no watermark, no collage, no split screen.",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

async function uploadOrDataUri(
  client: AgentRouterClient,
  file: TryOnInput["person"],
): Promise<{ url: string; hosted: boolean }> {
  try {
    const uploaded = await client.capabilities.execute({
      domain: "files",
      capability: "upload",
      allowFallback: true,
      timeoutMs: 60_000,
      input: {
        filename: file.originalname || "photo.jpg",
        contentType: file.mimetype || "image/jpeg",
        contentBase64: file.buffer.toString("base64"),
      },
    });
    const url = findUrl(uploaded);
    if (url) return { url, hosted: true };
  } catch {
    // Fall back to an inline data URI if hosting is unavailable.
  }
  return { url: dataUri(file), hosted: false };
}

export async function runTryOn(
  client: AgentRouterClient,
  input: TryOnInput,
): Promise<TryOnResult> {
  const prompt = buildPrompt(input.itemType, input.notes);
  let creditsCharged = 0;

  const person = await uploadOrDataUri(client, input.person);
  const wearable = await uploadOrDataUri(client, input.wearable);

  const edited = await client.capabilities.execute({
    domain: "media",
    capability: "image-edit",
    routeKey: "media.image.edit.fal.mpp",
    provider: "fal",
    allowFallback: true,
    timeoutMs: 120_000,
    input: {
      prompt,
      inputImageUrl: person.url,
      sourceUrl: wearable.url,
      firstFrameUrl: person.url,
      lastFrameUrl: wearable.url,
      aspectRatio: "4:3",
    },
  });

  creditsCharged += creditsFrom(edited);
  const imageUrl = findUrl(edited);

  let wallet: unknown = null;
  try {
    wallet = await client.wallet.get();
  } catch {
    wallet = null;
  }

  return {
    imageUrl,
    prompt,
    personUrl: person.hosted ? person.url : undefined,
    wearableUrl: wearable.hosted ? wearable.url : undefined,
    routeKey: String(asRecord(edited).routeKey ?? "media.image.edit.fal.mpp"),
    creditsCharged,
    note:
      person.hosted && wearable.hosted
        ? undefined
        : "One or both photos were sent as inline images because file hosting did not return a public URL.",
    wallet,
  };
}
