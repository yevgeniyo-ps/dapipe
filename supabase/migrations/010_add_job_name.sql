-- 010_add_job_name.sql
alter table reports add column if not exists job_name text not null default '';
