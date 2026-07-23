# rag-portfolio

The RAG backend for Riley Greiff's portfolio chatbot. It answers questions about
Riley's projects and experience — grounded in GitHub READMEs and resume content,
with cited sources — and is queried by a chat widget embedded on the static
portfolio site (`RileyGreiff.github.io`).

```
              ┌──────────── ingest (offline, run from laptop) ────────────┐
GitHub READMEs ──►  chunk (markdown-aware) ──► embed (Voyage) ──► Postgres + pgvector
resume / writeups                                                        │
                                                                         ▼
Static site widget ──POST /api/chat──►  Vercel (this app)  ──►  retrieve top-k
(RileyGreiff.github.io)      ▲                                            │
        │                    └──────────── streamed answer ◄── Claude ◄───┘
        └── source chips (X-Sources header)
```

Two deployed pieces:

- **This app → Vercel.** A Next.js backend exposing `POST /api/chat`: it embeds the
  question, retrieves matching chunks from Postgres, and streams Claude's answer.
  CORS-restricted to the portfolio origin. Holds the API keys (never the browser).
- **Chat widget → GitHub Pages.** Vanilla JS/CSS in the `portfolio-site` repo
  (`js/chat-widget.js`, `css/chat-widget.css`) — a floating "Ask AI" button that
  calls this backend cross-origin. Its `BACKEND_URL` must point at the Vercel URL.

## Stack

| Layer      | Choice                                        |
| ---------- | --------------------------------------------- |
| Backend    | Next.js 16 (App Router, TypeScript)           |
| Generation | Claude (`claude-opus-4-8`), streaming         |
| Embeddings | Voyage AI `voyage-3.5` (1024 dims)           |
| Vector DB  | Postgres + pgvector (HNSW, cosine)            |
| Hosting    | Vercel (backend) + Neon (database)            |
| Front-end  | Static widget on GitHub Pages                 |

## Local setup

1. **Provision Postgres with pgvector** — a free [Neon](https://neon.tech) or
   [Supabase](https://supabase.com) project; copy the connection string.
2. **Get API keys** — [Anthropic](https://platform.claude.com) and
   [Voyage AI](https://www.voyageai.com).
3. **Configure env:** `cp .env.example .env.local`, then fill in the values.
4. **Create the schema and load the corpus:**

   ```bash
   npm install
   npm run db:init     # tables + pgvector
   npm run ingest      # GitHub READMEs + content/*.md → embeddings → Postgres
   ```

5. **Run the backend locally:** `npm run dev` (serves `/api/chat` on :3000).

## Deploy

- **Backend:** import this repo into [Vercel](https://vercel.com), set
  `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, and `DATABASE_URL` as environment
  variables, and deploy. Note the deployment URL.
- **Widget:** set `BACKEND_URL` in the portfolio site's `js/chat-widget.js` to that
  URL, and add the site's origin to `ALLOWED_ORIGINS` in `src/app/api/chat/route.ts`
  if it's served from anywhere other than `rileygreiff.github.io`.

## How it works

- **Ingest** (`scripts/ingest.ts`) pulls every non-fork **public** repo README for
  `GITHUB_USERNAME`, plus any markdown in `content/` (resume, curated writeups for
  private projects). Documents are chunked on markdown headings, embedded with
  Voyage in batches (with retry/backoff for rate limits), and upserted
  transactionally — re-running is idempotent. *Private repos are not pulled; add
  those as `content/*.md` files, or make the repo public.*
- **Retrieval** (`src/lib/retrieve.ts`) embeds the question, runs a top-k cosine
  search via pgvector's HNSW index, and drops chunks below a similarity floor so
  off-topic questions get an honest "I don't know."
- **Chat** (`src/app/api/chat/route.ts`) validates input, rate-limits per IP,
  injects retrieved chunks into the final user turn as `<source>` blocks, and
  streams Claude's answer. Source links ride back on the `X-Sources` response
  header (CORS-exposed) and render as chips under each answer.

## Operational notes

- **Refreshing content:** re-run `npm run ingest` after pushing new/updated repos
  (or wire it into a scheduled GitHub Action).
- **Rate limiting** is in-memory per serverless instance — enough to blunt casual
  abuse. For a durable cross-instance limit, swap in Upstash Ratelimit.
- **Spend guard:** set a monthly budget limit in the Anthropic Console — this is a
  public, unauthenticated endpoint.
- **Changing embedding models** changes vector dimensions: update `vector(1024)` in
  `db/schema.sql` and re-ingest.
