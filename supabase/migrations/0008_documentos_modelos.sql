-- =====================================================================
-- Controle de Aluguéis — documentos anexados e modelos de contrato
-- ---------------------------------------------------------------------
-- Execute DEPOIS dos scripts 0001 a 0007, no SQL Editor do Supabase.
-- O script pode ser executado mais de uma vez sem erro.
--
-- O que este script adiciona:
--   * Pasta privada "documentos" no Storage do Supabase (arquivos de até
--     20 MB: PDF, fotos, Word). Cada usuário só acessa a própria pasta.
--   * Tabela "documentos": contrato assinado, vistoria, documentos pessoais,
--     comprovantes... ligados ao imóvel e, se quiser, à locação.
--   * Tabela "modelos_contrato": contratos próprios, com campos como
--     {{LOCATARIO_NOME}} que são preenchidos com os dados de cada locação.
--   * Na locação: o texto do contrato editado (guardado como modelo).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Storage: pasta (bucket) privada "documentos"
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Cada arquivo fica em "<id do usuário>/...": só o dono enxerga, envia e apaga.
drop policy if exists documentos_ler on storage.objects;
create policy documentos_ler on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists documentos_enviar on storage.objects;
create policy documentos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists documentos_apagar on storage.objects;
create policy documentos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 2. Documentos anexados
-- ---------------------------------------------------------------------
create table if not exists public.documentos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  imovel_id   uuid not null,
  locacao_id  uuid,
  tipo        text not null default 'outro',
  nome        text not null,       -- nome mostrado na tela
  caminho     text not null,       -- caminho do arquivo no Storage
  tamanho     bigint,
  mime        text,
  observacao  text,
  created_at  timestamptz not null default now(),

  constraint documentos_tipo_chk check (tipo in ('contrato_assinado', 'vistoria', 'documento_pessoal', 'comprovante', 'aditivo', 'outro')),
  constraint documentos_nome_chk check (length(btrim(nome)) between 1 and 200 and length(coalesce(observacao, '')) <= 300),
  constraint documentos_caminho_uk unique (caminho),
  constraint documentos_imovel_fk foreign key (imovel_id, owner_id) references public.imoveis (id, owner_id) on delete cascade,
  constraint documentos_locacao_fk foreign key (locacao_id, owner_id) references public.locacoes (id, owner_id) on delete cascade
);

create index if not exists documentos_imovel_idx on public.documentos (imovel_id);

alter table public.documentos enable row level security;
drop policy if exists documentos_select on public.documentos;
create policy documentos_select on public.documentos for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists documentos_insert on public.documentos;
create policy documentos_insert on public.documentos for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists documentos_update on public.documentos;
create policy documentos_update on public.documentos for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists documentos_delete on public.documentos;
create policy documentos_delete on public.documentos for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.documentos from anon, authenticated;
grant select, insert, update, delete on public.documentos to authenticated;

-- ---------------------------------------------------------------------
-- 3. Modelos de contrato e texto editado da locação
-- conteudo = { "titulo", "subtitulo", "partes": [...], "clausulas": [{ "titulo", "paragrafos": [...] }], "finais": [...] }
-- ---------------------------------------------------------------------
create table if not exists public.modelos_contrato (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome       text not null,
  conteudo   jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint modelos_nome_chk check (length(btrim(nome)) between 2 and 100),
  constraint modelos_tamanho_chk check (pg_column_size(conteudo) <= 200000)
);

create unique index if not exists modelos_owner_nome_uk on public.modelos_contrato (owner_id, lower(btrim(nome)));

drop trigger if exists trg_modelos_updated_at on public.modelos_contrato;
create trigger trg_modelos_updated_at before update on public.modelos_contrato
  for each row execute function public.set_updated_at();

alter table public.modelos_contrato enable row level security;
drop policy if exists modelos_select on public.modelos_contrato;
create policy modelos_select on public.modelos_contrato for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists modelos_insert on public.modelos_contrato;
create policy modelos_insert on public.modelos_contrato for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists modelos_update on public.modelos_contrato;
create policy modelos_update on public.modelos_contrato for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists modelos_delete on public.modelos_contrato;
create policy modelos_delete on public.modelos_contrato for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.modelos_contrato from anon, authenticated;
grant select, insert, update, delete on public.modelos_contrato to authenticated;

alter table public.locacoes add column if not exists contrato_texto jsonb;
alter table public.locacoes drop constraint if exists locacoes_contrato_texto_chk;
alter table public.locacoes add constraint locacoes_contrato_texto_chk check (contrato_texto is null or pg_column_size(contrato_texto) <= 200000);

-- ---------------------------------------------------------------------
-- 4. Exclusões (0005/0006) passam a apagar também os documentos.
--    Os ARQUIVOS no Storage são apagados pelo aplicativo antes.
-- ---------------------------------------------------------------------
create or replace function public.excluir_inquilino(p_inquilino_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locacoes     uuid[];
  v_recebimentos integer;
  v_reajustes    integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.inquilinos where id = p_inquilino_id and owner_id = auth.uid()) then
    raise exception 'Inquilino não encontrado.' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(id), '{}') into v_locacoes
    from public.locacoes where inquilino_id = p_inquilino_id and owner_id = auth.uid();

  delete from public.recebimentos where locacao_id = any (v_locacoes) and owner_id = auth.uid();
  get diagnostics v_recebimentos = row_count;
  delete from public.reajustes where locacao_id = any (v_locacoes) and owner_id = auth.uid();
  get diagnostics v_reajustes = row_count;
  delete from public.documentos where locacao_id = any (v_locacoes) and owner_id = auth.uid();
  delete from public.locacoes where id = any (v_locacoes) and owner_id = auth.uid();
  delete from public.inquilinos where id = p_inquilino_id and owner_id = auth.uid();

  return jsonb_build_object('locacoes', coalesce(array_length(v_locacoes, 1), 0),
                            'recebimentos', v_recebimentos, 'reajustes', v_reajustes);
end;
$$;

create or replace function public.excluir_imovel(p_imovel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locacoes     uuid[];
  v_recebimentos integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.imoveis where id = p_imovel_id and owner_id = auth.uid()) then
    raise exception 'Imóvel não encontrado.' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(id), '{}') into v_locacoes
    from public.locacoes where imovel_id = p_imovel_id and owner_id = auth.uid();

  delete from public.recebimentos where locacao_id = any (v_locacoes) and owner_id = auth.uid();
  get diagnostics v_recebimentos = row_count;
  delete from public.reajustes  where locacao_id = any (v_locacoes) and owner_id = auth.uid();
  delete from public.documentos where imovel_id = p_imovel_id and owner_id = auth.uid();
  delete from public.locacoes   where id = any (v_locacoes) and owner_id = auth.uid();
  delete from public.despesas   where imovel_id = p_imovel_id and owner_id = auth.uid();
  delete from public.imoveis    where id = p_imovel_id and owner_id = auth.uid();

  return jsonb_build_object('locacoes', coalesce(array_length(v_locacoes, 1), 0), 'recebimentos', v_recebimentos);
end;
$$;

revoke all on function public.excluir_inquilino(uuid) from public, anon;
revoke all on function public.excluir_imovel(uuid) from public, anon;
grant execute on function public.excluir_inquilino(uuid) to authenticated;
grant execute on function public.excluir_imovel(uuid) to authenticated;
