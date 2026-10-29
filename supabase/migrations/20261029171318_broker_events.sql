-- Dados da corretora separados por proprietário. Escritas dos agentes: backend confiável.
create table public.agents_status (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  name text not null check (char_length(name) between 1 and 70),
  room_id text not null check (room_id in ('equities','macro','income','crypto','private','compliance')),
  state text not null check (state in ('analyzing','reading','risk','executing','idle','offline')),
  description text not null check (char_length(description) between 1 and 300),
  x integer check (x between 1 and 14), y integer check (y between 2 and 10),
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (owner_id, id), check ((x is null) = (y is null))
);
create table public.agent_events (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null default gen_random_uuid()::text check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  agent_id text not null,
  description text not null check (char_length(description) between 1 and 500),
  at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (owner_id, id),
  foreign key (owner_id, agent_id) references public.agents_status(owner_id, id) on delete cascade
);
create table public.order_approvals (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null default gen_random_uuid()::text check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  agent_id text not null,
  ticker text not null check (ticker ~ '^[A-Z0-9./-]{1,20}$'),
  side text not null check (side in ('buy','sell')),
  quantity double precision not null check (quantity >= 0.00000001 and quantity <= 1e12),
  value double precision not null check (value > 0 and value <= 1e14),
  thesis text not null check (char_length(thesis) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  decided_at bigint,
  primary key (owner_id, id),
  foreign key (owner_id, agent_id) references public.agents_status(owner_id, id) on delete cascade,
  check ((status = 'pending' and decided_at is null) or (status <> 'pending' and decided_at is not null))
);

alter table public.agents_status enable row level security;
alter table public.agent_events enable row level security;
alter table public.order_approvals enable row level security;
revoke all on public.agents_status, public.agent_events, public.order_approvals from anon, authenticated;
grant select on public.agents_status, public.agent_events, public.order_approvals to authenticated;
grant update (status, decided_at) on public.order_approvals to authenticated;
grant all on public.agents_status, public.agent_events, public.order_approvals to service_role;

create policy agents_read_own on public.agents_status for select to authenticated using ((select auth.uid()) = owner_id);
create policy events_read_own on public.agent_events for select to authenticated using ((select auth.uid()) = owner_id);
create policy orders_read_own on public.order_approvals for select to authenticated using ((select auth.uid()) = owner_id);
create policy orders_decide_own on public.order_approvals for update to authenticated
  using ((select auth.uid()) = owner_id and status = 'pending')
  with check ((select auth.uid()) = owner_id and status in ('approved','rejected') and decided_at is not null);

create index agents_recent on public.agents_status(owner_id, updated_at desc);
create index events_recent on public.agent_events(owner_id, at desc);
create index events_agent on public.agent_events(owner_id, agent_id);
create index orders_recent on public.order_approvals(owner_id, created_at desc);
create index orders_agent on public.order_approvals(owner_id, agent_id);

alter publication supabase_realtime add table public.agents_status, public.agent_events, public.order_approvals;
