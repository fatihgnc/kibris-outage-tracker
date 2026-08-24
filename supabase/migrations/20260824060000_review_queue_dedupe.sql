-- The review queue is a work list for one person, and it was growing by one
-- row per unparseable announcement per run. An announcement the parser cannot
-- read is still there on the next poll, so a cron every few minutes buries the
-- maintainer in copies of the same item: three runs by hand already produced
-- three rows for one Gündem Kıbrıs piece.
--
-- Outages avoid this by keying on a content fingerprint (§10.5). The queue gets
-- the same treatment, computed in the database so old rows and new rows are
-- keyed identically: the source URL plus the raw text, which is exactly what
-- makes two entries the same piece of work.

-- Existing duplicates first — the unique index cannot be created over them.
-- The oldest row of each group survives, so nothing loses its first-seen time.
delete from review_queue r
where exists (
  select 1
  from review_queue keep
  where keep.raw_text = r.raw_text
    and coalesce(keep.source ->> 'url', '') = coalesce(r.source ->> 'url', '')
    and keep.id < r.id
);

alter table review_queue
  add column fingerprint text
  generated always as (md5(coalesce(source ->> 'url', '') || raw_text)) stored;

-- Unique rather than a plain index: the guarantee belongs in the schema, so a
-- second writer or a re-run cannot reintroduce the duplicates by another path.
create unique index review_queue_fingerprint_idx on review_queue (fingerprint);
