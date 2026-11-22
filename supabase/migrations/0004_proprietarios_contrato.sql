-- =====================================================================
-- Controle de Aluguéis — proprietários, dados completos para contrato
-- e visão geral do dashboard
-- ---------------------------------------------------------------------
-- Execute DEPOIS dos scripts 0001, 0002 e 0003, no SQL Editor do Supabase.
-- O script pode ser executado mais de uma vez sem erro.
--
-- O que este script adiciona:
--   * Tabela "proprietarios" (dono do imóvel) com qualificação completa,
--     endereço e dados para pagamento (PIX/banco).
--   * Endereço separado (CEP, logradouro, número, complemento, bairro,
--     cidade, UF) em imóveis, inquilinos e proprietários.
--   * Dados do inquilino para contrato (CPF, RG, estado civil...).
--   * Condições do contrato na locação (finalidade, garantia, fiador,
--     multa, foro, encargos, cláusulas adicionais).
--   * Funções "salvar_imovel" e "salvar_locacao" (tudo ou nada) e
--     "resumo_geral" / "historico_mensal" para o dashboard.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Proprietários
-- ---------------------------------------------------------------------
create table if not exists public.proprietarios (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo_pessoa    text not null default 'fisica',
  nome           text not null,
  cpf_cnpj       text,
  rg             text,
  orgao_emissor  text,
  nacionalidade  text,
  estado_civil   text,
  profissao      text,
  email          text,
  telefone       text,
  cep            text,
  logradouro     text,
  numero         text,
  complemento    text,
  bairro         text,
  cidade         text,
  uf             text,
  pix            text,
  banco          text,
  agencia        text,
  conta          text,
  observacoes    text,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint proprietarios_tipo_chk     check (tipo_pessoa in ('fisica', 'juridica')),
  constraint proprietarios_nome_chk     check (length(btrim(nome)) between 2 and 150),
  constraint proprietarios_doc_chk      check (cpf_cnpj is null or cpf_cnpj ~ '^(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})$'),
  constraint proprietarios_telefone_chk check (telefone is null or telefone ~ '^[0-9()+ -]{8,20}$'),
  constraint proprietarios_email_chk    check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint proprietarios_cep_chk      check (cep is null or cep ~ '^\d{5}-\d{3}$'),
  constraint proprietarios_uf_chk       check (uf is null or uf ~ '^[A-Z]{2}$'),
  constraint proprietarios_textos_chk   check (length(coalesce(observacoes, '')) <= 1000 and length(coalesce(pix, '')) <= 140),
  constraint proprietarios_id_owner_uk  unique (id, owner_id)
);

create unique index if not exists proprietarios_owner_doc_uk
  on public.proprietarios (owner_id, cpf_cnpj) where cpf_cnpj is not null;

drop trigger if exists trg_proprietarios_updated_at on public.proprietarios;
create trigger trg_proprietarios_updated_at before update on public.proprietarios
  for each row execute function public.set_updated_at();

alter table public.proprietarios enable row level security;
drop policy if exists proprietarios_select on public.proprietarios;
create policy proprietarios_select on public.proprietarios for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists proprietarios_insert on public.proprietarios;
create policy proprietarios_insert on public.proprietarios for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists proprietarios_update on public.proprietarios;
create policy proprietarios_update on public.proprietarios for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.proprietarios from anon, authenticated;
grant select, insert, update on public.proprietarios to authenticated;

-- ---------------------------------------------------------------------
-- 2. Imóveis: endereço separado, tipo, descrição e proprietário
-- ---------------------------------------------------------------------
alter table public.imoveis add column if not exists tipo            text;
alter table public.imoveis add column if not exists cep             text;
alter table public.imoveis add column if not exists logradouro      text;
alter table public.imoveis add column if not exists numero          text;
alter table public.imoveis add column if not exists complemento     text;
alter table public.imoveis add column if not exists bairro          text;
alter table public.imoveis add column if not exists cidade          text;
alter table public.imoveis add column if not exists uf              text;
alter table public.imoveis add column if not exists descricao       text;
alter table public.imoveis add column if not exists proprietario_id uuid;

alter table public.imoveis drop constraint if exists imoveis_cep_chk;
alter table public.imoveis add constraint imoveis_cep_chk check (cep is null or cep ~ '^\d{5}-\d{3}$');
alter table public.imoveis drop constraint if exists imoveis_uf_chk;
alter table public.imoveis add constraint imoveis_uf_chk check (uf is null or uf ~ '^[A-Z]{2}$');
alter table public.imoveis drop constraint if exists imoveis_descricao_chk;
alter table public.imoveis add constraint imoveis_descricao_chk check (length(coalesce(descricao, '')) <= 1000);
alter table public.imoveis drop constraint if exists imoveis_proprietario_fk;
alter table public.imoveis add constraint imoveis_proprietario_fk foreign key (proprietario_id, owner_id)
  references public.proprietarios (id, owner_id) on delete restrict;

create index if not exists imoveis_proprietario_idx on public.imoveis (proprietario_id);

-- ---------------------------------------------------------------------
-- 3. Inquilinos: qualificação e endereço
-- ---------------------------------------------------------------------
alter table public.inquilinos add column if not exists cpf             text;
alter table public.inquilinos add column if not exists rg              text;
alter table public.inquilinos add column if not exists orgao_emissor   text;
alter table public.inquilinos add column if not exists nacionalidade   text;
alter table public.inquilinos add column if not exists estado_civil    text;
alter table public.inquilinos add column if not exists profissao       text;
alter table public.inquilinos add column if not exists email           text;
alter table public.inquilinos add column if not exists data_nascimento date;
alter table public.inquilinos add column if not exists cep             text;
alter table public.inquilinos add column if not exists logradouro      text;
alter table public.inquilinos add column if not exists numero          text;
alter table public.inquilinos add column if not exists complemento     text;
alter table public.inquilinos add column if not exists bairro          text;
alter table public.inquilinos add column if not exists cidade          text;
alter table public.inquilinos add column if not exists uf              text;

alter table public.inquilinos drop constraint if exists inquilinos_cpf_chk;
alter table public.inquilinos add constraint inquilinos_cpf_chk check (cpf is null or cpf ~ '^\d{3}\.\d{3}\.\d{3}-\d{2}$');
alter table public.inquilinos drop constraint if exists inquilinos_email_chk;
alter table public.inquilinos add constraint inquilinos_email_chk check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.inquilinos drop constraint if exists inquilinos_cep_chk;
alter table public.inquilinos add constraint inquilinos_cep_chk check (cep is null or cep ~ '^\d{5}-\d{3}$');
alter table public.inquilinos drop constraint if exists inquilinos_uf_chk;
alter table public.inquilinos add constraint inquilinos_uf_chk check (uf is null or uf ~ '^[A-Z]{2}$');

create unique index if not exists inquilinos_owner_cpf_uk
  on public.inquilinos (owner_id, cpf) where cpf is not null;

-- ---------------------------------------------------------------------
-- 4. Locações: condições do contrato
-- (multa e juros são apenas TEXTO do contrato: o app não calcula)
-- ---------------------------------------------------------------------
alter table public.locacoes add column if not exists finalidade              text not null default 'residencial';
alter table public.locacoes add column if not exists garantia                text not null default 'nenhuma';
alter table public.locacoes add column if not exists valor_garantia          numeric(12,2);
alter table public.locacoes add column if not exists fiador_nome             text;
alter table public.locacoes add column if not exists fiador_cpf              text;
alter table public.locacoes add column if not exists fiador_qualificacao     text;
alter table public.locacoes add column if not exists multa_atraso_percentual numeric(5,2);
alter table public.locacoes add column if not exists juros_atraso_percentual numeric(5,2);
alter table public.locacoes add column if not exists multa_rescisao_alugueis numeric(4,1);
alter table public.locacoes add column if not exists encargos_locatario      text;
alter table public.locacoes add column if not exists foro                    text;
alter table public.locacoes add column if not exists clausulas_adicionais    text;

alter table public.locacoes drop constraint if exists locacoes_finalidade_chk;
alter table public.locacoes add constraint locacoes_finalidade_chk check (finalidade in ('residencial', 'comercial'));
alter table public.locacoes drop constraint if exists locacoes_garantia_chk;
alter table public.locacoes add constraint locacoes_garantia_chk
  check (garantia in ('nenhuma', 'caucao', 'fiador', 'seguro_fianca', 'titulo_capitalizacao'));
alter table public.locacoes drop constraint if exists locacoes_valor_garantia_chk;
alter table public.locacoes add constraint locacoes_valor_garantia_chk check (valor_garantia is null or valor_garantia > 0);
alter table public.locacoes drop constraint if exists locacoes_fiador_cpf_chk;
alter table public.locacoes add constraint locacoes_fiador_cpf_chk check (fiador_cpf is null or fiador_cpf ~ '^\d{3}\.\d{3}\.\d{3}-\d{2}$');
alter table public.locacoes drop constraint if exists locacoes_percentuais_chk;
alter table public.locacoes add constraint locacoes_percentuais_chk check (
  (multa_atraso_percentual is null or multa_atraso_percentual between 0 and 100) and
  (juros_atraso_percentual is null or juros_atraso_percentual between 0 and 100) and
  (multa_rescisao_alugueis is null or multa_rescisao_alugueis between 0 and 12));
alter table public.locacoes drop constraint if exists locacoes_textos_chk;
alter table public.locacoes add constraint locacoes_textos_chk check (
  length(coalesce(clausulas_adicionais, '')) <= 5000 and length(coalesce(encargos_locatario, '')) <= 1000 and
  length(coalesce(fiador_qualificacao, '')) <= 1000 and length(coalesce(foro, '')) <= 100);

-- ---------------------------------------------------------------------
-- 5. Funções auxiliares: texto vazio vira nulo
-- ---------------------------------------------------------------------
create or replace function public.txt(p jsonb, k text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p ->> k), '');
$$;

-- ---------------------------------------------------------------------
-- 6. salvar_locacao: cria a locação ativa do imóvel com inquilino novo
--    (p_inquilino) ou já cadastrado (p_inquilino_id). Tudo ou nada.
-- ---------------------------------------------------------------------
create or replace function public.salvar_locacao(p_imovel_id uuid, p_inquilino_id uuid, p_inquilino jsonb, p_locacao jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inquilino uuid := p_inquilino_id;
  v_entrada   date := (p_locacao ->> 'data_entrada')::date;
  v_locacao   uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if v_entrada is null then
    raise exception 'Informe a data de entrada.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.imoveis where id = p_imovel_id) then
    raise exception 'Imóvel não encontrado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.locacoes where imovel_id = p_imovel_id and situacao = 'ativa') then
    raise exception 'Este imóvel já tem uma locação ativa. Encerre-a antes de cadastrar um novo inquilino.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.locacoes where imovel_id = p_imovel_id and data_saida > v_entrada) then
    raise exception 'A data de entrada é anterior à saída do inquilino anterior deste imóvel.' using errcode = 'P0001';
  end if;

  if v_inquilino is null then
    insert into public.inquilinos (nome, telefone, cpf, rg, orgao_emissor, nacionalidade, estado_civil, profissao, email,
                                   data_nascimento, cep, logradouro, numero, complemento, bairro, cidade, uf)
    values (public.txt(p_inquilino, 'nome'), public.txt(p_inquilino, 'telefone'), public.txt(p_inquilino, 'cpf'),
            public.txt(p_inquilino, 'rg'), public.txt(p_inquilino, 'orgao_emissor'), public.txt(p_inquilino, 'nacionalidade'),
            public.txt(p_inquilino, 'estado_civil'), public.txt(p_inquilino, 'profissao'), public.txt(p_inquilino, 'email'),
            public.txt(p_inquilino, 'data_nascimento')::date, public.txt(p_inquilino, 'cep'), public.txt(p_inquilino, 'logradouro'),
            public.txt(p_inquilino, 'numero'), public.txt(p_inquilino, 'complemento'), public.txt(p_inquilino, 'bairro'),
            public.txt(p_inquilino, 'cidade'), public.txt(p_inquilino, 'uf'))
    returning id into v_inquilino;
  elsif not exists (select 1 from public.inquilinos where id = v_inquilino) then
    raise exception 'Inquilino não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.locacoes (
    imovel_id, inquilino_id, data_entrada, valor_aluguel, dia_vencimento, prazo_meses, reajuste_meses,
    finalidade, garantia, valor_garantia, fiador_nome, fiador_cpf, fiador_qualificacao,
    multa_atraso_percentual, juros_atraso_percentual, multa_rescisao_alugueis, encargos_locatario, foro, clausulas_adicionais)
  values (
    p_imovel_id, v_inquilino, v_entrada, (p_locacao ->> 'valor_aluguel')::numeric, (p_locacao ->> 'dia_vencimento')::int,
    (public.txt(p_locacao, 'prazo_meses'))::int, (public.txt(p_locacao, 'reajuste_meses'))::int,
    coalesce(public.txt(p_locacao, 'finalidade'), 'residencial'), coalesce(public.txt(p_locacao, 'garantia'), 'nenhuma'),
    (public.txt(p_locacao, 'valor_garantia'))::numeric, public.txt(p_locacao, 'fiador_nome'), public.txt(p_locacao, 'fiador_cpf'),
    public.txt(p_locacao, 'fiador_qualificacao'), (public.txt(p_locacao, 'multa_atraso_percentual'))::numeric,
    (public.txt(p_locacao, 'juros_atraso_percentual'))::numeric, (public.txt(p_locacao, 'multa_rescisao_alugueis'))::numeric,
    public.txt(p_locacao, 'encargos_locatario'), public.txt(p_locacao, 'foro'), public.txt(p_locacao, 'clausulas_adicionais'))
  returning id into v_locacao;

  return v_locacao;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. salvar_imovel: cria o imóvel e, se informado, a locação. Tudo ou nada.
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
                              bairro, cidade, uf, descricao, proprietario_id)
  values (public.txt(p_imovel, 'identificacao'), public.txt(p_imovel, 'endereco'), public.txt(p_imovel, 'observacoes'),
          public.txt(p_imovel, 'tipo'), public.txt(p_imovel, 'cep'), public.txt(p_imovel, 'logradouro'),
          public.txt(p_imovel, 'numero'), public.txt(p_imovel, 'complemento'), public.txt(p_imovel, 'bairro'),
          public.txt(p_imovel, 'cidade'), public.txt(p_imovel, 'uf'), public.txt(p_imovel, 'descricao'),
          (public.txt(p_imovel, 'proprietario_id'))::uuid)
  returning id into v_imovel;

  if p_locacao is not null then
    perform public.salvar_locacao(v_imovel, p_inquilino_id, p_inquilino, p_locacao);
  end if;

  return v_imovel;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Dashboard: visão geral e histórico mensal
-- ---------------------------------------------------------------------
create or replace function public.resumo_geral()
returns table (
  contratos_ativos          integer,
  receita_mensal_contratada numeric,
  imoveis_ativos            integer,
  imoveis_alugados          integer,
  imoveis_vagos             integer,
  proprietarios             integer,
  recebido_ano              numeric,
  recebido_total            numeric,
  atrasados_qtd             integer,
  atrasados_valor           numeric,
  contratos_vencendo_60d    integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with hoje as (select public.hoje_brasil() as d),
  ativas as (
    select l.* from public.locacoes l where l.situacao = 'ativa'
  )
  select
    (select count(*) from ativas)::int,
    (select coalesce(sum(valor_aluguel), 0) from ativas),
    (select count(*) from public.imoveis where ativo)::int,
    (select count(distinct imovel_id) from ativas)::int,
    (select count(*) from public.imoveis i where i.ativo and not exists (select 1 from ativas a where a.imovel_id = i.id))::int,
    (select count(*) from public.proprietarios where ativo)::int,
    (select coalesce(sum(valor_recebido), 0) from public.recebimentos, hoje
      where extract(year from mes_referencia) = extract(year from hoje.d)),
    (select coalesce(sum(valor_recebido), 0) from public.recebimentos),
    (select count(*) from public.vw_recebimentos where situacao = 'atrasado')::int,
    (select coalesce(sum(valor_previsto), 0) from public.vw_recebimentos where situacao = 'atrasado'),
    (select count(*) from ativas a, hoje
      where a.prazo_meses is not null
        and (a.data_inicio_contrato + make_interval(months => a.prazo_meses))::date between hoje.d and hoje.d + 60)::int;
$$;

create or replace function public.historico_mensal(p_meses int)
returns table (mes_referencia date, previsto numeric, recebido numeric, atrasado numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with meses as (
    select (date_trunc('month', public.hoje_brasil()) - make_interval(months => g))::date as m
      from generate_series(0, least(greatest(p_meses, 1), 36) - 1) as g
  )
  select m.m,
         coalesce(sum(v.valor_previsto), 0),
         coalesce(sum(v.valor_recebido), 0),
         coalesce(sum(v.valor_previsto) filter (where v.situacao = 'atrasado'), 0)
    from meses m
    left join public.vw_recebimentos v on v.mes_referencia = m.m
   group by m.m
   order by m.m;
$$;

revoke all on function public.txt(jsonb, text) from public, anon;
revoke all on function public.salvar_locacao(uuid, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.salvar_imovel(jsonb, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.resumo_geral() from public, anon;
revoke all on function public.historico_mensal(int) from public, anon;
grant execute on function public.txt(jsonb, text) to authenticated;
grant execute on function public.salvar_locacao(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.salvar_imovel(jsonb, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.resumo_geral() to authenticated;
grant execute on function public.historico_mensal(int) to authenticated;
