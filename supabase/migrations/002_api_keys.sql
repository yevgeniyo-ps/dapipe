-- 002_api_keys.sql
-- API key management for GitHub Action authentication

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key_hash text not null unique,
  key_prefix text not null,
  name text not null default 'Default',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index api_keys_org_id_idx on api_keys(org_id);
create index api_keys_key_hash_idx on api_keys(key_hash);

-- Lookup function: hash the raw key, find the org, update last_used_at
create or replace function lookup_org_by_api_key(raw_key text)
returns uuid as $$
declare
  hashed text;
  found_org_id uuid;
begin
  hashed := encode(digest(raw_key, 'sha256'), 'hex');

  select org_id into found_org_id
  from api_keys
  where key_hash = hashed
    and revoked_at is null;

  if found_org_id is not null then
    update api_keys
    set last_used_at = now()
    where key_hash = hashed;
  end if;

  return found_org_id;
end;
$$ language plpgsql security definer;
