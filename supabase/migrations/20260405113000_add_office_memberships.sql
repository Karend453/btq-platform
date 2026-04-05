create table if not exists public.office_memberships (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role text not null check (role in ('broker', 'admin', 'agent', 'btq_admin')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, user_id)
);

create index if not exists office_memberships_office_id_idx
  on public.office_memberships (office_id);

create index if not exists office_memberships_user_id_idx
  on public.office_memberships (user_id);

create index if not exists office_memberships_office_role_status_idx
  on public.office_memberships (office_id, role, status);

insert into public.office_memberships (
  office_id,
  user_id,
  role,
  status,
  created_at,
  updated_at
)
select
  up.office_id,
  up.id,
  up.role,
  'active',
  coalesce(up.created_at, now()),
  now()
from public.user_profiles up
where up.office_id is not null
  and up.role is not null
on conflict (office_id, user_id) do nothing;