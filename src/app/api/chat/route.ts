import Anthropic from "@anthropic-ai/sdk";
import { retrieve } from "@/lib/retrieve";

export const maxDuration = 60; // Vercel: allow up to 60s for streaming

const MODEL = "claude-opus-4-8";
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;

const SYSTEM_PROMPT = `You are the portfolio assistant on Riley Greiff's website. Visitors are \
usually recruiters, hiring managers, and engineers evaluating Riley's work.

Riley is an AI/ML engineer (MS in Analytics, Georgia Tech; former PE-track civil engineer) \
focused on applied LLM systems and inference efficiency.

Rules:
- Answer ONLY from the context provided in each message. The context is drawn from Riley's \
GitHub repositories, resume, and project writeups.
- If the context doesn't contain the answer, say so plainly and suggest what to ask instead \
or point to Riley's GitHub (https://github.com/RileyGreiff) or email (rgreiff97@gmail.com). \
Never invent projects, employers, dates, or capabilities.
- When you reference a project, name it and include its repository link from the context.
- Keep answers concise — a few sentences to a short paragraph, bullets when comparing \
multiple projects. Recruiters are skimming.
- Stay on topic: Riley's work, skills, and experience. Politely decline anything else \
(general coding help, opinions on other people, etc.).`;

// --- CORS: the widget is served from the static GitHub Pages site, a different
// --- origin than this Vercel backend, so browser calls need explicit allowance.
const ALLOWED_ORIGINS = new Set([
  "https://rileygreiff.github.io",
  "http://localhost:8080", // local `python -m http.server 8080` preview
  "http://localhost:3000", // the Next.js app itself
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // Custom response headers are invisible to cross-origin JS unless exposed.
    "Access-Control-Expose-Headers": "X-Sources",
    Vary: "Origin",
  };
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

// --- Simple per-IP rate limiting (per serverless instance). Good enough to blunt
// --- casual abuse; swap for Upstash Ratelimit for a durable cross-instance limit.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) return true;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear(); // crude memory guard
  return false;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function validateBody(body: unknown): ChatMessage[] | null {
  if (typeof body !== "object" || body === null) return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }
  for (const m of messages) {
    if (
      typeof m !== "object" || m === null ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      m.content.length === 0 || m.content.length > MAX_MESSAGE_CHARS
    ) {
      return null;
    }
  }
  if (messages[messages.length - 1].role !== "user") return null;
  return messages as ChatMessage[];
}

export async function POST(request: Request) {
  const cors = corsHeaders(request.headers.get("origin"));

  // Fail fast with a clear reason if the deploy is missing credentials.
  const missing = ["ANTHROPIC_API_KEY", "VOYAGE_API_KEY", "DATABASE_URL"].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    return Response.json(
      { error: "Server misconfigured.", missing },
      { status: 500, headers: cors },
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return Response.json(
      { error: "Too many requests — please wait a minute." },
      { status: 429, headers: cors },
    );
  }

  let messages: ChatMessage[] | null;
  try {
    messages = validateBody(await request.json());
  } catch {
    messages = null;
  }
  if (!messages) {
    return Response.json({ error: "Invalid request." }, { status: 400, headers: cors });
  }

  const question = messages[messages.length - 1].content;

  let chunks;
  try {
    chunks = await retrieve(question);
  } catch (err) {
    // Retrieval touches Postgres + the Voyage API — the usual failure points on
    // a fresh deploy (missing/wrong DATABASE_URL or VOYAGE_API_KEY). Surface a
    // short reason so misconfig is diagnosable instead of a blank 500.
    console.error("retrieve() failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Retrieval failed.", detail }, { status: 500, headers: cors });
  }

  const contextBlock =
    chunks.length > 0
      ? chunks
          .map(
            (c) =>
              `<source title="${c.title}"${c.source_url ? ` url="${c.source_url}"` : ""}` +
              `${c.heading ? ` section="${c.heading}"` : ""}>\n${c.content}\n</source>`,
          )
          .join("\n\n")
      : "(no relevant context found)";

  // Inject retrieved context into the final user turn; keep the system prompt stable.
  const claudeMessages: Anthropic.MessageParam[] = [
    ...messages.slice(0, -1),
    {
      role: "user",
      content: `<context>\n${contextBlock}\n</context>\n\n${question}`,
    },
  ];

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048, // answers are deliberately short
    system: SYSTEM_PROMPT,
    messages: claudeMessages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("text", (text) => controller.enqueue(encoder.encode(text)));
      stream.on("error", (err) => {
        console.error("Anthropic stream error:", err);
        controller.error(err);
      });
      stream.on("end", () => controller.close());
    },
    cancel() {
      stream.abort();
    },
  });

  // Deduplicated source links, surfaced to the UI via a header (set before streaming).
  const sources = [
    ...new Map(
      chunks
        .filter((c) => c.source_url)
        .map((c) => [c.source_url, { title: c.title, url: c.source_url }]),
    ).values(),
  ];

  return new Response(readable, {
    headers: {
      ...cors,
      "Content-Type": "text/plain; charset=utf-8",
      "X-Sources": encodeURIComponent(JSON.stringify(sources)),
    },
  });
}
