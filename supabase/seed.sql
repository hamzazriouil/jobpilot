-- seed.sql: reference data (docs/02-DATABASE.md §8). Idempotent.
-- `user_paste` must exist before any pasted job can be stored (jobs.source_id FK).
-- Enable each feed source only after reading its terms and filling `attribution`.
insert into public.sources (id, name, kind, url, enabled) values
 ('user_paste','Pasted by user','user',null,true),
 ('remoteok','Remote OK','api','https://remoteok.com/api',false),
 ('remotive','Remotive','api','https://remotive.com/api/remote-jobs',false),
 ('himalayas','Himalayas','api','https://himalayas.app/jobs/api',false),
 ('arbeitnow','Arbeitnow','api','https://www.arbeitnow.com/api/job-board-api',false),
 ('wwr','We Work Remotely','rss','https://weworkremotely.com/categories/remote-programming-jobs.rss',false),
 ('hn','HN Who is hiring','api','https://hn.algolia.com/api/v1/',false)
on conflict (id) do nothing;
