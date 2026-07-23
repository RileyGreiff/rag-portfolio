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

export async function retrieve(question: string, k = 6): Promise<RetrievedChunk[]> {
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
