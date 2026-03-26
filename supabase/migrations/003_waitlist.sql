-- 003_waitlist.sql
-- Waitlist for early access + approved users gate

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  company text,
  use_case text,
  created_at timestamptz not null default now()
);

create table approved_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RPC to check if current user is approved
create or replace function is_approved()
returns boolean as $$
begin
  return exists (
    select 1 from approved_users where user_id = auth.uid()
  );
end;
$$ language plpgsql security definer stable;
