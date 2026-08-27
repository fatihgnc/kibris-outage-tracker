-- Which articles have already been read, so the parser is not paid for twice.
--
-- The ingest runs every ten minutes and the adapters look three days back, so
-- the same article is crawled hundreds of times before it falls out of the
-- window. That cost nothing while parsing was a pile of regexes. It is now a
-- request to a model, and re-reading an article we have already read is the one
-- expense in this pipeline with no upside at all.
--
-- Keyed by URL, with a hash of the text beside it: outlets rewrite these
-- announcements in place — a lead moved from "yarın" to "bugün" on the morning
-- of the work (§10.4) — and a rewritten article is genuinely new information
-- that has to be read again.
create table seen_articles (
  url          text primary key,
  content_hash text not null,
  -- How many times reading this exact text has been attempted and failed. The
  -- ingest gives up after a few: a transient API failure deserves a retry, an
  -- article the model cannot make sense of must not be re-sent every ten
  -- minutes forever.
  attempts     integer not null default 0,
  -- Once true, this text is never sent again.
  parsed_ok    boolean not null default false,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);

-- Housekeeping: rows for articles long out of every adapter's window.
create index seen_articles_last_seen_idx on seen_articles (last_seen);

-- Maintainer-facing only, like review_queue: anon gets no policy and no
-- privilege. Nothing a reader sees depends on this table.
alter table seen_articles enable row level security;

revoke all on seen_articles from anon, authenticated;
grant select, insert, update on seen_articles to service_role;

-- PostgREST answers from a cached copy of the schema and does not pick up a new
-- table on its own. Without this the first runs after the push read every
-- article again, warned, and paid for it — which is exactly what happened.
notify pgrst, 'reload schema';
