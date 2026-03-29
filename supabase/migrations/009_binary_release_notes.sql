-- 009_binary_release_notes.sql
-- Add release_notes column to agent_binaries
alter table agent_binaries add column if not exists release_notes text not null default '';
