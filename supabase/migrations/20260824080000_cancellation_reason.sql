-- A cancelled row had two very different meanings behind one flag, and the
-- archive could not tell them apart (§10.6).
--
--   'retracted' — the utility called the outage off. This is real news and the
--                 archive must keep it, marked, exactly as §10.6 asks.
--   'bad_data'  — the ingest invented the record and it never described a real
--                 announcement. Showing it as a retraction tells the reader an
--                 outage was announced and called off, which is a fabrication.
--
-- The schema grants no delete (history stays intact), so bad data is retired
-- with a reason rather than removed, and the archive filters on the reason.

create type cancellation_reason as enum ('retracted', 'bad_data');

alter table outages add column cancelled_reason cancellation_reason;

-- Everything cancelled before this migration was written by retractOutages,
-- which only ever handled genuine cancellation announcements.
update outages set cancelled_reason = 'retracted' where cancelled_at is not null;

-- The two columns describe one fact and must not drift apart: a reason with no
-- cancellation, or a cancellation with no reason, is a bug in the writer.
alter table outages add constraint outages_cancelled_reason_agrees
  check ((cancelled_at is null) = (cancelled_reason is null));

-- The archive reads every row not retired as bad data, newest first, so the
-- ordering is part of the index.
create index outages_archive_idx on outages (starts_at desc)
  where cancelled_reason is distinct from 'bad_data';
