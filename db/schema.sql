-- Requires the pgvector extension (available on Supabase/Neon out of the box).
create extension if not exists vector;

create table if not exists documents (
  id         text primary key,          -- e.g. "github:rileygreiff/kvviz" or "file:resume.md"
  title      text not null,
  source_url text,
  updated_at timestamptz not null default now()
);

create table if not exists chunks (
  id          bigserial primary key,
  document_id text not null references documents(id) on delete cascade,
  heading     text,
  content     text not null,
  -- 1024 dims = voyage-3.5 default. If you change embedding models,
  -- update this dimension and re-run the ingest from scratch.
  embedding   vector(1024) not null
);

create index if not exists chunks_document_id_idx on chunks (document_id);
create index if not exists chunks_embedding_idx on chunks
  using hnsw (embedding vector_cosine_ops);
