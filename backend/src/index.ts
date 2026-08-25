import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import { createClient, hasApiKey } from "./client.js";
import { runResearch } from "./research.js";
import { runTryOn } from "./tryon.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image uploads are allowed"));
  },
});

app.use(
  cors({
    origin: [frontendOrigin, "http://127.0.0.1:5173"],
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    keyConfigured: hasApiKey(),
  });
});

app.get("/api/wallet", async (_req, res) => {
  try {
    const client = createClient();
    const wallet = await client.wallet.get();
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

app.get("/api/usage", async (_req, res) => {
  try {
    const client = createClient();
    const usage = await client.usage.list({ limit: 20 });
    res.json(usage);
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

app.post("/api/research", async (req, res) => {
  const query = String(req.body?.query ?? "").trim();
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  try {
    const client = createClient();
    const result = await runResearch(client, query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

app.post(
  "/api/try-on",
  upload.fields([
    { name: "person", maxCount: 1 },
    { name: "wearable", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as
      | { person?: Express.Multer.File[]; wearable?: Express.Multer.File[] }
      | undefined;
    const person = files?.person?.[0];
    const wearable = files?.wearable?.[0];
    if (!person || !wearable) {
      res.status(400).json({ error: "Upload a person photo and a wearable photo." });
      return;
    }

    try {
      const client = createClient();
      const result = await runTryOn(client, {
        person: {
          buffer: person.buffer,
          mimetype: person.mimetype,
          originalname: person.originalname,
        },
        wearable: {
          buffer: wearable.buffer,
          mimetype: wearable.mimetype,
          originalname: wearable.originalname,
        },
        itemType: String(req.body?.itemType ?? "wearable item"),
        notes: String(req.body?.notes ?? ""),
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  },
);

app.listen(port, () => {
  console.log(`Agent Router backend listening on http://localhost:${port}`);
  if (!hasApiKey()) {
    console.warn(
      "AGENTIC_API_KEY is not set. Copy backend/.env.example to backend/.env",
    );
  }
});

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
