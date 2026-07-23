import { getSql } from "./db";
import { embedQuery, toVectorLiteral } from "./embeddings";

export interface RetrievedChunk {
  content: string;
  heading: string | null;
  title: string;
  source_url: string | null;
  similarity: number;
}

const MIN_SIMILARITY = 0.3; // drop chunks that are clearly unrelated to the question

export interface IndexEntry {
  title: string;
  source_url: string | null;
  snippet: string;
}

/**
 * A compact list of every project (title + one-line snippet from its first
 * chunk). Always included in the prompt so the model can answer broad or
 * subjective questions ("most impressive project?") and compare across the
 * whole portfolio, even when vector search for a vague query returns little.
 */
export async function getPortfolioIndex(): Promise<IndexEntry[]> {
  const sql = getSql();
  const rows = await sql<{ title: string; source_url: string | null; content: string }[]>`
    select d.title, d.source_url,
      (select c.content from chunks c
        where c.document_id = d.id order by c.id asc limit 1) as content
    from documents d
    order by d.title
  `;
  return rows.map((r) => ({
    title: r.title,
    source_url: r.source_url,
    snippet: (r.content ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
  }));
}

export async function retrieve(question: string, k = 8): Promise<RetrievedChunk[]> {
  const sql = getSql();
  const qvec = toVectorLiteral(await embedQuery(question));

  const rows = await sql<RetrievedChunk[]>`
    select
      c.content,
      c.heading,
      d.title,
      d.source_url,
      1 - (c.embedding <=> ${qvec}::vector) as similarity
    from chunks c
    join documents d on d.id = c.document_id
    order by c.embedding <=> ${qvec}::vector
    limit ${k}
  `;

  return rows.filter((r) => r.similarity >= MIN_SIMILARITY);
}
