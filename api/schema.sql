-- Supabase schema for the Tshovani enrollment system.
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists applications (
  id         bigint generated always as identity primary key,
  ref        text not null unique,
  status     text not null default 'pending',
  learner    jsonb not null,
  guardian   jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The service key bypasses RLS, but keep it on as defense-in-depth.
alter table applications enable row level security;

-- No public policies: only the serverless functions (service key) can read/write.
-- Staff access goes through admin.html -> /api/* with the admin token.

create index if not exists applications_status_idx on applications (status);
create index if not exists applications_created_idx on applications (created_at desc);
