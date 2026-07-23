/**
 * Ingest pipeline: GitHub READMEs + local content/ markdown
 *   -> chunk -> embed (Voyage) -> upsert into Postgres/pgvector.
 *
 * Idempotent: re-running replaces each document's chunks.
 * Run: npm run ingest
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getSql } from "../src/lib/db";
import { embedDocuments, toVectorLiteral } from "../src/lib/embeddings";

const GITHUB_USERNAME = process.env.GITHUB_USERNAME ?? "RileyGreiff";
const CONTENT_DIR = "content";
const EMBED_BATCH_SIZE = 32;

interface Doc {
  id: string;
  title: string;
  sourceUrl: string | null;
  text: string;
}

interface Chunk {
  heading: string | null;
  content: string;
}

// ---------- chunking ----------

const MAX_CHUNK_CHARS = 3500; // ~900 tokens
const MIN_CHUNK_CHARS = 200;

/** Split markdown by headings, then split oversized sections by paragraph. */
export function chunkMarkdown(text: string): Chunk[] {
  const lines = text.split("\n");
  const sections: { heading: string | null; lines: string[] }[] = [
    { heading: null, lines: [] },
  ];

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      sections.push({ heading: line.replace(/^#+\s*/, "").trim(), lines: [line] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const body = section.lines.join("\n").trim();
    if (!body) continue;

    if (body.length <= MAX_CHUNK_CHARS) {
      chunks.push({ heading: section.heading, content: body });
      continue;
    }

    // Oversized section: greedily pack paragraphs.
    let current = "";
    for (const para of body.split(/\n{2,}/)) {
      if (current && current.length + para.length + 2 > MAX_CHUNK_CHARS) {
        chunks.push({ heading: section.heading, content: current.trim() });
        current = "";
      }
      current += para + "\n\n";
    }
    if (current.trim()) chunks.push({ heading: section.heading, content: current.trim() });
  }

  // Merge tiny trailing fragments into their predecessor so we don't embed noise.
  const merged: Chunk[] = [];
  for (const chunk of chunks) {
    const prev = merged[merged.length - 1];
    if (prev && chunk.content.length < MIN_CHUNK_CHARS && prev.heading === chunk.heading) {
      prev.content += "\n\n" + chunk.content;
    } else {
      merged.push(chunk);
    }
  }
  return merged;
}

// ---------- sources ----------

async function github(path: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw+json",
    "User-Agent": "rag-portfolio-ingest",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return fetch(`https://api.github.com${path}`, { headers });
}

interface Repo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
}

async function fetchGithubDocs(): Promise<Doc[]> {
  const res = await github(`/users/${GITHUB_USERNAME}/repos?per_page=100&type=owner`);
  if (!res.ok) throw new Error(`GitHub repos ${res.status}: ${await res.text()}`);
  const repos = (await res.json()) as Repo[];

  const docs: Doc[] = [];
  for (const repo of repos) {
    if (repo.fork || repo.archived) continue;

    const readmeRes = await github(`/repos/${repo.full_name}/readme`);
    if (readmeRes.status === 404) {
      console.log(`  skip ${repo.name} (no README)`);
      continue;
    }
    if (!readmeRes.ok) throw new Error(`README ${repo.full_name}: ${readmeRes.status}`);
    const readme = await readmeRes.text();

    const preamble = [
      `# Project: ${repo.name}`,
      repo.description ?? "",
      `Repository: ${repo.html_url}`,
      repo.language ? `Primary language: ${repo.language}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    docs.push({
      id: `github:${repo.full_name.toLowerCase()}`,
      title: repo.name,
      sourceUrl: repo.html_url,
      text: `${preamble}\n\n---\n\n${readme}`,
    });
    console.log(`  fetched ${repo.full_name}`);
  }
  return docs;
}

/** Extra corpus files (resume, project writeups) dropped into content/*.md */
function loadLocalDocs(): Doc[] {
  if (!existsSync(CONTENT_DIR)) return [];
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .map((f) => ({
      id: `file:${f.toLowerCase()}`,
      title: f.replace(/\.md$/i, ""),
      sourceUrl: null,
      text: readFileSync(join(CONTENT_DIR, f), "utf8"),
    }));
}

// ---------- upsert ----------

async function main() {
  const sql = getSql();

  console.log(`Fetching GitHub repos for ${GITHUB_USERNAME}...`);
  const docs = [...(await fetchGithubDocs()), ...loadLocalDocs()];
  console.log(`\n${docs.length} documents to ingest.`);

  let totalChunks = 0;
  for (const doc of docs) {
    const chunks = chunkMarkdown(doc.text);
    if (chunks.length === 0) continue;

    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      // Prefix the doc title so a chunk carries its project context into the embedding.
      embeddings.push(
        ...(await embedDocuments(batch.map((c) => `${doc.title}\n\n${c.content}`))),
      );
    }

    await sql.begin(async (tx) => {
      await tx`
        insert into documents (id, title, source_url, updated_at)
        values (${doc.id}, ${doc.title}, ${doc.sourceUrl}, now())
        on conflict (id) do update
          set title = excluded.title, source_url = excluded.source_url, updated_at = now()
      `;
      await tx`delete from chunks where document_id = ${doc.id}`;
      for (let i = 0; i < chunks.length; i++) {
        await tx`
          insert into chunks (document_id, heading, content, embedding)
          values (${doc.id}, ${chunks[i].heading}, ${chunks[i].content},
                  ${toVectorLiteral(embeddings[i])}::vector)
        `;
      }
    });

    totalChunks += chunks.length;
    console.log(`  upserted ${doc.id} (${chunks.length} chunks)`);
  }

  console.log(`\nDone: ${docs.length} documents, ${totalChunks} chunks.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
