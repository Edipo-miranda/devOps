-- =====================================================================
-- Controle de Aluguéis — financeiro, documentos do imóvel e caução
-- ---------------------------------------------------------------------
-- Execute DEPOIS dos scripts 0001 a 0006, no SQL Editor do Supabase.
-- O script pode ser executado mais de uma vez sem erro.
--
-- O que este script adiciona:
--   * Imóvel: matrícula, cartório, inscrição e valor do IPTU, área,
--     quartos, banheiros, vagas, condomínio e nº das contas de luz/água.
--   * Locação: controle da caução (recebida, devolvida, valor devolvido).
--   * Recebimento: parte do valor recebido que foi multa/juros de atraso.
--   * Configuração: cobrar ou não multa e juros nos atrasos.
--   * Tabela "despesas" por imóvel (IPTU, condomínio, manutenção...),
--     marcando as dedutíveis no Imposto de Renda.
--   * vw_recebimentos com dados do proprietário e percentuais de atraso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Imóvel: documentação e características
-- ---------------------------------------------------------------------
alter table public.imoveis add column if not exists matricula        text;
alter table public.imoveis add column if not exists cartorio         text;
alter table public.imoveis add column if not exists inscricao_iptu   text;
alter table public.imoveis add column if not exists valor_iptu_anual numeric(12,2);
alter table public.imoveis add column if not exists area_m2          numeric(10,2);
alter table public.imoveis add column if not exists quartos          smallint;
alter table public.imoveis add column if not exists banheiros        smallint;
alter table public.imoveis add column if not exists vagas            smallint;
alter table public.imoveis add column if not exists valor_condominio numeric(12,2);
alter table public.imoveis add column if not exists uc_energia       text;
alter table public.imoveis add column if not exists uc_agua          text;

alter table public.imoveis drop constraint if exists imoveis_caracteristicas_chk;
alter table public.imoveis add constraint imoveis_caracteristicas_chk check (
  (valor_iptu_anual is null or valor_iptu_anual >= 0) and (valor_condominio is null or valor_condominio >= 0) and
  (area_m2 is null or area_m2 > 0) and
  (quartos is null or quartos between 0 and 50) and (banheiros is null or banheiros between 0 and 50) and
  (vagas is null or vagas between 0 and 50) and
  length(coalesce(matricula, '') || coalesce(cartorio, '') || coalesce(inscricao_iptu, '') ||
         coalesce(uc_energia, '') || coalesce(uc_agua, '')) <= 500);

-- ---------------------------------------------------------------------
-- 2. Locação: caução
-- ---------------------------------------------------------------------
alter table public.locacoes add column if not exists caucao_recebida_em     date;
alter table public.locacoes add column if not exists caucao_devolvida_em    date;
alter table public.locacoes add column if not exists caucao_valor_devolvido numeric(12,2);

alter table public.locacoes drop constraint if exists locacoes_caucao_chk;
alter table public.locacoes add constraint locacoes_caucao_chk check (
  (caucao_valor_devolvido is null or caucao_valor_devolvido >= 0) and
  (caucao_devolvida_em is null or caucao_recebida_em is null or caucao_devolvida_em >= caucao_recebida_em));

-- ---------------------------------------------------------------------
-- 3. Recebimento: multa/juros cobrados (já incluídos no valor recebido)
-- ---------------------------------------------------------------------
alter table public.recebimentos add column if not exists valor_encargos numeric(12,2);

alter table public.recebimentos drop constraint if exists recebimentos_encargos_chk;
alter table public.recebimentos add constraint recebimentos_encargos_chk check (
  valor_encargos is null or (valor_encargos >= 0 and valor_recebido is not null and valor_encargos <= valor_recebido));

-- ---------------------------------------------------------------------
-- 4. Configuração: cobrar multa e juros nos atrasos?
-- ---------------------------------------------------------------------
alter table public.configuracoes add column if not exists cobrar_encargos boolean not null default true;

-- ---------------------------------------------------------------------
-- 5. Despesas por imóvel
-- ---------------------------------------------------------------------
create table if not exists public.despesas (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  imovel_id   uuid not null,
  data        date not null,
  categoria   text not null,
  descricao   text,
  valor       numeric(12,2) not null,
  dedutivel   boolean not null default false, -- dedutível no carnê-leão (IPTU, condomínio, administração)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint despesas_categoria_chk check (categoria in
    ('iptu', 'condominio', 'manutencao', 'reforma', 'taxa_administracao', 'seguro', 'contas_consumo', 'impostos_taxas', 'outros')),
  constraint despesas_valor_chk check (valor > 0 and valor < 100000000),
  constraint despesas_descricao_chk check (length(coalesce(descricao, '')) <= 300),
  constraint despesas_imovel_fk foreign key (imovel_id, owner_id)
    references public.imoveis (id, owner_id) on delete cascade
);

create index if not exists despesas_owner_data_idx on public.despesas (owner_id, data);
create index if not exists despesas_imovel_idx on public.despesas (imovel_id);

drop trigger if exists trg_despesas_updated_at on public.despesas;
create trigger trg_despesas_updated_at before update on public.despesas
  for each row execute function public.set_updated_at();

alter table public.despesas enable row level security;
drop policy if exists despesas_select on public.despesas;
create policy despesas_select on public.despesas for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists despesas_insert on public.despesas;
create policy despesas_insert on public.despesas for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists despesas_update on public.despesas;
create policy despesas_update on public.despesas for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Despesa lançada errado pode ser apagada (não afeta aluguéis).
drop policy if exists despesas_delete on public.despesas;
create policy despesas_delete on public.despesas for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.despesas from anon, authenticated;
grant select, insert, update, delete on public.despesas to authenticated;

-- A exclusão do imóvel (0006) apaga também as despesas dele.
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
  delete from public.reajustes where locacao_id = any (v_locacoes) and owner_id = auth.uid();
  delete from public.locacoes  where id = any (v_locacoes) and owner_id = auth.uid();
  delete from public.despesas  where imovel_id = p_imovel_id and owner_id = auth.uid();
  delete from public.imoveis   where id = p_imovel_id and owner_id = auth.uid();

  return jsonb_build_object('locacoes', coalesce(array_length(v_locacoes, 1), 0), 'recebimentos', v_recebimentos);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. salvar_imovel com os campos novos (substitui a versão do 0004)
-- ---------------------------------------------------------------------
create or replace function public.salvar_imovel(p_imovel jsonb, p_inquilino_id uuid, p_inquilino jsonb, p_locacao jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_imovel uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  insert into public.imoveis (identificacao, endereco, observacoes, tipo, cep, logradouro, numero, complemento,
                              bairro, cidade, uf, descricao, proprietario_id, matricula, cartorio, inscricao_iptu,
                              valor_iptu_anual, area_m2, quartos, banheiros, vagas, valor_condominio, uc_energia, uc_agua)
  values (public.txt(p_imovel, 'identificacao'), public.txt(p_imovel, 'endereco'), public.txt(p_imovel, 'observacoes'),
          public.txt(p_imovel, 'tipo'), public.txt(p_imovel, 'cep'), public.txt(p_imovel, 'logradouro'),
          public.txt(p_imovel, 'numero'), public.txt(p_imovel, 'complemento'), public.txt(p_imovel, 'bairro'),
          public.txt(p_imovel, 'cidade'), public.txt(p_imovel, 'uf'), public.txt(p_imovel, 'descricao'),
          (public.txt(p_imovel, 'proprietario_id'))::uuid, public.txt(p_imovel, 'matricula'), public.txt(p_imovel, 'cartorio'),
          public.txt(p_imovel, 'inscricao_iptu'), (public.txt(p_imovel, 'valor_iptu_anual'))::numeric,
          (public.txt(p_imovel, 'area_m2'))::numeric, (public.txt(p_imovel, 'quartos'))::smallint,
          (public.txt(p_imovel, 'banheiros'))::smallint, (public.txt(p_imovel, 'vagas'))::smallint,
          (public.txt(p_imovel, 'valor_condominio'))::numeric, public.txt(p_imovel, 'uc_energia'), public.txt(p_imovel, 'uc_agua'))
  returning id into v_imovel;

  if p_locacao is not null then
    perform public.salvar_locacao(v_imovel, p_inquilino_id, p_inquilino, p_locacao);
  end if;

  return v_imovel;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. vw_recebimentos com proprietário, CPF do inquilino e percentuais
--    de atraso (colunas novas no FINAL, como o PostgreSQL exige)
-- ---------------------------------------------------------------------
create or replace view public.vw_recebimentos
with (security_invoker = true) as
select
  r.id,
  r.owner_id,
  r.locacao_id,
  r.mes_referencia,
  r.valor_previsto,
  r.data_vencimento,
  r.valor_recebido,
  r.data_pagamento,
  r.observacao,
  r.created_at,
  r.updated_at,
  case
    when r.data_pagamento is not null             then 'pago'
    when r.data_vencimento < public.hoje_brasil() then 'atrasado'
    else 'em_aberto'
  end as situacao,
  case
    when r.data_pagamento is null and r.data_vencimento < public.hoje_brasil()
      then public.hoje_brasil() - r.data_vencimento
    else 0
  end as dias_atraso,
  l.imovel_id,
  i.identificacao as imovel_identificacao,
  i.endereco      as imovel_endereco,
  l.inquilino_id,
  q.nome          as inquilino_nome,
  q.telefone      as inquilino_telefone,
  r.valor_encargos,
  l.multa_atraso_percentual,
  l.juros_atraso_percentual,
  q.cpf           as inquilino_cpf,
  i.proprietario_id,
  p.nome          as proprietario_nome,
  p.cpf_cnpj      as proprietario_cpf_cnpj,
  p.pix           as proprietario_pix,
  i.cidade        as imovel_cidade,
  i.uf            as imovel_uf
from public.recebimentos r
join public.locacoes   l on l.id = r.locacao_id
join public.imoveis    i on i.id = l.imovel_id
join public.inquilinos q on q.id = l.inquilino_id
left join public.proprietarios p on p.id = i.proprietario_id;

revoke all on public.vw_recebimentos from anon, authenticated;
grant select on public.vw_recebimentos to authenticated;
