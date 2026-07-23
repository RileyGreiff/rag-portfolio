const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = process.env.VOYAGE_MODEL ?? "voyage-3.5";

type InputType = "document" | "query";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry on rate limits (429) and transient 5xx. The free Voyage tier is 3 RPM,
// so back off generously; a payment method (still $0 under the 200M free tokens)
// lifts this. Handles both cases without code changes.
const MAX_RETRIES = 6;

async function embed(texts: string[], inputType: InputType): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType }),
    });

    if (res.ok) {
      const json = (await res.json()) as {
        data: { index: number; embedding: number[] }[];
      };
      // Voyage returns items with an index; sort to be safe.
      return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`Voyage API ${res.status}: ${await res.text()}`);
    }

    // ~25s clears the 3 RPM window; grow slightly each retry.
    const waitMs = 25_000 + attempt * 5_000;
    console.log(`  rate limited (${res.status}); waiting ${waitMs / 1000}s...`);
    await sleep(waitMs);
  }
}

/** Embed corpus chunks at ingest time. */
export function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts, "document");
}

/** Embed a user question at query time. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embed([text], "query");
  return vec;
}

/** pgvector expects the '[1,2,3]' literal format. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
