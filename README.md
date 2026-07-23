# rag-portfolio

A production-style RAG (retrieval-augmented generation) chatbot that answers questions
about Riley Greiff's projects and experience — grounded in GitHub READMEs and resume
content, with cited sources.

```
                    ┌──────────── ingest (offline) ────────────┐
GitHub READMEs ──►  chunk (markdown-aware) ──► embed (Voyage) ──► Postgres + pgvector
resume / writeups                                                     │
                                                                      ▼
Visitor question ──► embed query ──► top-k cosine retrieval ──► Claude (streamed) ──► UI
```

## Stack

| Layer      | Choice                                        |
| ---------- | --------------------------------------------- |
| App        | Next.js 16 (App Router, TypeScript), Tailwind |
| Generation | Claude (`claude-opus-4-8`), streaming         |
| Embeddings | Voyage AI `voyage-3.5` (1024 dims)            |
| Vector DB  | Postgres + pgvector (HNSW, cosine)            |
| Hosting    | Vercel + Supabase/Neon                        |

## Setup

1. **Provision Postgres with pgvector.** Create a free project on
   [Supabase](https://supabase.com) or [Neon](https://neon.tech) and copy the
   connection string.

2. **Get API keys:** [Anthropic](https://platform.claude.com) and
   [Voyage AI](https://www.voyageai.com).

3. **Configure env:**

   ```bash
   cp .env.example .env.local   # then fill in the values
   ```

4. **Create the schema and ingest the corpus:**

   ```bash
   npm install
   npm run db:init
   npm run ingest      # pulls GitHub READMEs + content/*.md, embeds, upserts
   ```

5. **Run:**

   ```bash
   npm run dev         # http://localhost:3000
   ```

## How it works

- **Ingest** (`scripts/ingest.ts`) pulls every non-fork repo README for
  `GITHUB_USERNAME` plus any markdown in `content/` (resume, writeups). Documents are
  chunked on markdown headings (oversized sections split by paragraph, tiny fragments
  merged), embedded with Voyage in batches, and upserted transactionally — re-running
  is idempotent.
- **Retrieval** (`src/lib/retrieve.ts`) embeds the question (`input_type: "query"`),
  runs a top-k cosine search via pgvector's HNSW index, and drops chunks below a
  similarity floor so off-topic questions get an honest "I don't know."
- **Chat** (`src/app/api/chat/route.ts`) validates input, rate-limits per IP, injects
  retrieved chunks into the final user turn as `<source>` blocks, and streams Claude's
  answer. Source links ride back on an `X-Sources` response header and render as chips
  under each answer.

## Operational notes

- **Refreshing content:** re-run `npm run ingest` after pushing new repos/READMEs
  (or wire it into a GitHub Action on a schedule).
- **Rate limiting** is in-memory per serverless instance — fine for blunting casual
  abuse. For a durable cross-instance limit, swap in Upstash Ratelimit.
- **Spend guard:** set a monthly budget limit in the Anthropic Console — this is a
  public, unauthenticated endpoint.
- **Changing embedding models** changes vector dimensions: update `vector(1024)` in
  `db/schema.sql`, re-run `db:init` logic (or `alter table`), and re-ingest.
