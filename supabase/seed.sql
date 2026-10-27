-- seed.sql: reference data (docs/02-DATABASE.md §8). Idempotent.
-- `user_paste` must exist before any pasted job can be stored (jobs.source_id FK).
-- Enable each feed source only after reading its terms and filling `attribution`
-- (docs/10-SOURCES.md). Himalayas and Remote OK: terms read 2026-10-25, enabled. Jobicy: 2026-10-27.
-- The attribution strings match workers/ingest/src/sources/*.ts (`--sync-sources` writes them).
insert into public.sources (id, name, kind, url, attribution, enabled) values
 ('user_paste','Pasted by user','user',null,null,true),
 ('remoteok','Remote OK','api','https://remoteok.com/api','Via Remote OK (https://remoteok.com)',true),
 ('remotive','Remotive','api','https://remotive.com/api/remote-jobs',null,false),
 ('himalayas','Himalayas','api','https://himalayas.app/jobs/api','Via Himalayas (https://himalayas.app)',true),
 ('jobicy','Jobicy','api','https://jobicy.com/api/jobs','Via Jobicy (https://jobicy.com)',true),
 ('arbeitnow','Arbeitnow','api','https://www.arbeitnow.com/api/job-board-api',null,false),
 ('wwr','We Work Remotely','rss','https://weworkremotely.com/categories/remote-programming-jobs.rss',null,false),
 ('hn','HN Who is hiring','api','https://hn.algolia.com/api/v1/',null,false)
on conflict (id) do nothing;
