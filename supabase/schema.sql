-- =====================================================================
-- PORTAL DO HOSTEL — banco de dados, papéis e regras de segurança (RLS)
-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run.
-- Pode rodar de novo sem problema (é idempotente).
-- =====================================================================

-- 1) Papéis
do $$ begin
  create type public.app_role as enum ('admin', 'lavanderia', 'camareira', 'pendente');
exception when duplicate_object then null; end $$;

-- 2) Perfis (um por usuário do login)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  nome       text,
  role       public.app_role not null default 'pendente',
  created_at timestamptz not null default now()
);

-- 3) Dados dos módulos (chave/valor, no mesmo formato que os apps já usam)
create table if not exists public.kv_store (
  module     text not null,
  key        text not null,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (module, key)
);

-- 4) Funções auxiliares (security definer evita recursão nas regras)
create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.can_access(mod text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case public.my_role()
    when 'admin'      then true
    when 'lavanderia' then mod = 'lsr'
    when 'camareira'  then mod = 'rotatividade'
    else false
  end
$$;

-- 5) Perfil criado automaticamente quando um usuário é criado (entra como 'pendente')
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Garante perfil para usuários que já existiam antes de rodar este script
insert into public.profiles (id, email, nome)
select u.id, u.email, split_part(u.email, '@', 1) from auth.users u
on conflict (id) do nothing;

-- 6) Regras de segurança (RLS)
alter table public.profiles enable row level security;
alter table public.kv_store enable row level security;

-- Perfis: cada um vê o próprio; admin vê e altera todos
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() = 'admin');

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Dados: cada papel só enxerga e grava os módulos que pode usar
drop policy if exists kv_select on public.kv_store;
create policy kv_select on public.kv_store for select to authenticated
  using (public.can_access(module));

drop policy if exists kv_insert on public.kv_store;
create policy kv_insert on public.kv_store for insert to authenticated
  with check (public.can_access(module));

drop policy if exists kv_update on public.kv_store;
create policy kv_update on public.kv_store for update to authenticated
  using (public.can_access(module)) with check (public.can_access(module));

drop policy if exists kv_delete on public.kv_store;
create policy kv_delete on public.kv_store for delete to authenticated
  using (public.can_access(module));

-- Visitantes sem login não podem nada
revoke all on public.profiles from anon;
revoke all on public.kv_store from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.kv_store to authenticated;

-- Colunas que o admin NÃO pode trocar por engano via API (só o papel e o nome)
revoke update on public.profiles from authenticated;
grant update (role, nome) on public.profiles to authenticated;

-- =====================================================================
-- DEPOIS de criar o seu usuário em Authentication > Users, torne-se admin:
--   update public.profiles set role = 'admin' where email = 'SEU_EMAIL_AQUI';
-- =====================================================================


-- Migração: papel de bloqueio (rode uma vez no SQL Editor)
alter type public.app_role add value if not exists 'bloqueado';
