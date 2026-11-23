-- =====================================================================
-- Controle de Aluguéis — limite de espaço para documentos por usuário
-- ---------------------------------------------------------------------
-- Execute DEPOIS do script 0009, no SQL Editor do Supabase.
-- Cada usuário pode guardar até 100 MB de documentos (padrão), para que
-- um cliente não ocupe sozinho o 1 GB do plano gratuito, que é de todos.
-- O limite vale no próprio banco: o envio é recusado quando acaba.
--
-- Para dar MAIS (ou menos) espaço a um cliente, rode no SQL Editor:
--   select public.definir_limite_documentos('email@do.cliente', 300);  -- 300 MB
-- Para voltar ao padrão (100 MB):
--   select public.definir_limite_documentos('email@do.cliente', null);
-- =====================================================================

-- Limites diferentes do padrão (só o administrador altera, pelo SQL Editor).
create table if not exists public.limites_armazenamento (
  owner_id   uuid primary key references auth.users (id) on delete cascade,
  limite_mb  integer not null constraint limites_armazenamento_mb_chk check (limite_mb between 1 and 100000),
  updated_at timestamptz not null default now()
);
alter table public.limites_armazenamento enable row level security;
drop policy if exists limites_select on public.limites_armazenamento;
create policy limites_select on public.limites_armazenamento for select to authenticated
  using (owner_id = (select auth.uid()));
-- Sem políticas de insert/update/delete: o usuário só consegue ler o próprio limite.
grant select on public.limites_armazenamento to authenticated;

-- Limite do usuário logado, em bytes (padrão 100 MB).
create or replace function public.meu_limite_documentos()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select l.limite_mb from public.limites_armazenamento l where l.owner_id = (select auth.uid())), 100)::bigint * 1048576;
$$;

-- Espaço já ocupado pelos arquivos do usuário logado, em bytes.
create or replace function public.meu_espaco_documentos()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id = 'documentos'
     and (storage.foldername(o.name))[1] = (select auth.uid())::text;
$$;

revoke all on function public.meu_limite_documentos() from public, anon;
revoke all on function public.meu_espaco_documentos() from public, anon;
grant execute on function public.meu_limite_documentos() to authenticated;
grant execute on function public.meu_espaco_documentos() to authenticated;

-- Envio de arquivo: além de ser na própria pasta, só se ainda houver espaço.
drop policy if exists documentos_enviar on storage.objects;
create policy documentos_enviar on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.meu_espaco_documentos() < public.meu_limite_documentos()
  );

-- Registro do documento: conferência exata (o arquivo já enviado entra na conta).
-- Se passar do limite, o registro é recusado e o aplicativo apaga o arquivo enviado.
create or replace function public.conferir_limite_documentos()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_usado  bigint := public.meu_espaco_documentos();
  v_limite bigint := public.meu_limite_documentos();
begin
  if (select auth.uid()) is not null and v_usado > v_limite then
    raise exception 'Seu espaço para documentos acabou (limite de % MB). Exclua documentos antigos ou peça mais espaço.', v_limite / 1048576
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists documentos_limite on public.documentos;
create trigger documentos_limite before insert on public.documentos
  for each row execute function public.conferir_limite_documentos();

-- Espaço usado: agora também devolve o limite do usuário.
drop function if exists public.uso_armazenamento();
create function public.uso_armazenamento()
returns table (meus_bytes bigint, meus_arquivos integer, total_bytes bigint, total_arquivos integer, meu_limite bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum((o.metadata ->> 'size')::bigint) filter (where (storage.foldername(o.name))[1] = (select auth.uid())::text), 0)::bigint,
    (count(*) filter (where (storage.foldername(o.name))[1] = (select auth.uid())::text))::int,
    coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint,
    count(*)::int,
    public.meu_limite_documentos()
  from storage.objects o
  where o.bucket_id = 'documentos' and (select auth.uid()) is not null;
$$;
revoke all on function public.uso_armazenamento() from public, anon;
grant execute on function public.uso_armazenamento() to authenticated;

-- Só para o administrador (SQL Editor): muda o limite de um cliente pelo e-mail.
create or replace function public.definir_limite_documentos(p_email text, p_limite_mb integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'Usuário com o e-mail % não encontrado.', p_email;
  end if;
  if p_limite_mb is null then
    delete from public.limites_armazenamento where owner_id = v_id;
    return format('%s volta ao limite padrão de 100 MB.', p_email);
  end if;
  insert into public.limites_armazenamento (owner_id, limite_mb) values (v_id, p_limite_mb)
  on conflict (owner_id) do update set limite_mb = excluded.limite_mb, updated_at = now();
  return format('%s agora pode guardar até %s MB de documentos.', p_email, p_limite_mb);
end;
$$;
revoke all on function public.definir_limite_documentos(text, integer) from public, anon, authenticated;
