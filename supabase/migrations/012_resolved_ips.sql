-- 012_resolved_ips.sql
alter table reports add column if not exists resolved_ips text[] not null default '{}';
