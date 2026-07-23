const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = process.env.VOYAGE_MODEL ?? "voyage-3.5";

type InputType = "document" | "query";

async function embed(texts: string[], inputType: InputType): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType }),
  });

  if (!res.ok) {
    throw new Error(`Voyage API ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  // Voyage returns items with an index; sort to be safe.
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
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
