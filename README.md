# Agent Router Research Assistant

Chat UI that uses [AgentRouter](https://www.agentrouter.to/quick-start) to search the web, then write an answer with sources.

The API key stays on the **backend**. The browser never talks to AgentRouter directly.

```
agent-router/
  backend/     Express + @agentrouter/agentrouter
  frontend/    Vite + React chat UI
```

## Setup

1. Get a key from [agentrouter.to/agentic-api/install](https://www.agentrouter.to/agentic-api/install).
2. Configure the backend:

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```bash
AGENTIC_API_BASE_URL=https://api.agentrouter.to/api/agentic-api
AGENTIC_API_KEY=aak_your_real_key
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173
```

## Run (two terminals)

```bash
# terminal 1
cd backend
npm install
npm run dev
```

```bash
# terminal 2
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

- Backend: `http://localhost:3001`
- Frontend proxies `/api` to the backend.

## Try-on

Open the **Try-On** tab. Upload:

1. Your photo (face or full body)
2. A wearable photo (suit, earrings, necklace, glasses, …)

Pick the item type and generate. The backend uploads both images, then calls AgentRouter `media` / `image-edit` so you can see how it looks on you.

`POST /api/try-on` (multipart): `person`, `wearable`, `itemType`, `notes`.

## What this app does

1. You type a research question.
2. Backend lists `search` capabilities and recommends a route (`cost` + `quality`).
3. If the route can execute, it runs web search.
4. It then calls `models` / `chat-complete` (DeepSeek) to write a cited answer.
5. The chat shows the answer, sources, route, and credits. The header shows wallet balance.

If search is gated, the UI still tries the chat model and shows a note.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Whether a key is configured (never returns the key) |
| GET | `/api/wallet` | Credit balance |
| GET | `/api/usage` | Last 20 usage rows |
| POST | `/api/research` | `{ "query": "..." }` research pipeline |
| POST | `/api/try-on` | multipart person + wearable photos, virtual try-on |

## What else you can build with the same key

Same pattern: backend SDK + small UI.

- **Translator** — `translation` / `text-rephrase`
- **Company lookup** — `enrichment` / people and company enrich
- **Image studio** — `media` / `image-generate`
- **Flight board** — `travel` / airport operations
- **Email sender** — `email` / `send` (real mail; add a confirm step)
- **Full playground** — type any task, show recommend, then execute
# AgentRouter
