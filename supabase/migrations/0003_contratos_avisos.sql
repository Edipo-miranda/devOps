-- =====================================================================
-- Controle de Aluguéis — prazo de contrato, reajustes e avisos
-- ---------------------------------------------------------------------
-- Execute DEPOIS dos scripts 0001 e 0002, no SQL Editor do Supabase.
-- O script pode ser executado mais de uma vez sem erro.
--
-- O que este script adiciona:
--   * Na locação: prazo do contrato, início do contrato atual, reajuste
--     (a cada quantos meses) e data do último reajuste.
--   * Tabela "reajustes": histórico de cada reajuste aplicado.
--   * Tabela "configuracoes": com quantos dias de antecedência avisar.
--   * Função "avisos": lista parcelas vencendo/vencidas, contratos
--     terminando e reajustes chegando.
--
-- Reajuste NÃO é calculado automaticamente: o app apenas avisa a data;
-- o novo valor é sempre definido pelo proprietário.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novos campos na locação
-- ---------------------------------------------------------------------
alter table public.locacoes add column if not exists prazo_meses          smallint; -- ex.: 12 (vazio = prazo indeterminado)
alter table public.locacoes add column if not exists data_inicio_contrato date;     -- início do contrato atual (muda na renovação)
alter table public.locacoes add column if not exists reajuste_meses       smallint; -- ex.: 12 (vazio = sem reajuste)
alter table public.locacoes add column if not exists data_ultimo_reajuste date;     -- base para o próximo reajuste

update public.locacoes set data_inicio_contrato = data_entrada where data_inicio_contrato is null;

-- Preenche o início do contrato com a data de entrada quando não informado.
create or replace function public.locacoes_preencher_contrato()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.data_inicio_contrato := coalesce(new.data_inicio_contrato, new.data_entrada);
  return new;
end;
$$;

drop trigger if exists trg_locacoes_preencher_contrato on public.locacoes;
create trigger trg_locacoes_preencher_contrato before insert or update on public.locacoes
  for each row execute function public.locacoes_preencher_contrato();

alter table public.locacoes alter column data_inicio_contrato set not null;

alter table public.locacoes drop constraint if exists locacoes_prazo_chk;
alter table public.locacoes add constraint locacoes_prazo_chk check (prazo_meses is null or prazo_meses between 1 and 240);
alter table public.locacoes drop constraint if exists locacoes_reajuste_chk;
alter table public.locacoes add constraint locacoes_reajuste_chk check (reajuste_meses is null or reajuste_meses between 1 and 120);
alter table public.locacoes drop constraint if exists locacoes_inicio_contrato_chk;
alter table public.locacoes add constraint locacoes_inicio_contrato_chk check (data_inicio_contrato >= data_entrada);
alter table public.locacoes drop constraint if exists locacoes_ultimo_reajuste_chk;
alter table public.locacoes add constraint locacoes_ultimo_reajuste_chk check (data_ultimo_reajuste is null or data_ultimo_reajuste >= data_entrada);

-- ---------------------------------------------------------------------
-- 2. Histórico de reajustes
-- ---------------------------------------------------------------------
create table if not exists public.reajustes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  locacao_id     uuid not null,
  data_reajuste  date not null,
  valor_anterior numeric(12,2) not null,
  valor_novo     numeric(12,2) not null,
  observacao     text,
  created_at     timestamptz not null default now(),

  constraint reajustes_valores_chk check (valor_anterior > 0 and valor_novo > 0 and valor_novo < 10000000),
  constraint reajustes_obs_chk     check (observacao is null or length(observacao) <= 300),
  constraint reajustes_locacao_fk  foreign key (locacao_id, owner_id)
    references public.locacoes (id, owner_id) on delete restrict
);

create index if not exists reajustes_locacao_idx on public.reajustes (locacao_id, data_reajuste);

alter table public.reajustes enable row level security;
drop policy if exists reajustes_select on public.reajustes;
create policy reajustes_select on public.reajustes for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists reajustes_insert on public.reajustes;
create policy reajustes_insert on public.reajustes for insert to authenticated
  with check (owner_id = (select auth.uid()));

revoke all on public.reajustes from anon, authenticated;
grant select, insert on public.reajustes to authenticated;

-- ---------------------------------------------------------------------
-- 3. Configurações dos avisos (uma linha por usuário)
-- ---------------------------------------------------------------------
create table if not exists public.configuracoes (
  owner_id            uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  dias_aviso_parcela  smallint not null default 3,
  dias_aviso_contrato smallint not null default 60,
  updated_at          timestamptz not null default now(),

  constraint configuracoes_parcela_chk  check (dias_aviso_parcela between 0 and 31),
  constraint configuracoes_contrato_chk check (dias_aviso_contrato between 0 and 365)
);

drop trigger if exists trg_configuracoes_updated_at on public.configuracoes;
create trigger trg_configuracoes_updated_at before update on public.configuracoes
  for each row execute function public.set_updated_at();

alter table public.configuracoes enable row level security;
drop policy if exists configuracoes_select on public.configuracoes;
create policy configuracoes_select on public.configuracoes for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists configuracoes_insert on public.configuracoes;
create policy configuracoes_insert on public.configuracoes for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists configuracoes_update on public.configuracoes;
create policy configuracoes_update on public.configuracoes for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.configuracoes from anon, authenticated;
grant select, insert, update on public.configuracoes to authenticated;

-- Antecedência configurada pelo usuário logado (ou o padrão: 3 e 60 dias).
create or replace function public.config_avisos(out dias_parcela int, out dias_contrato int)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select c.dias_aviso_parcela  from public.configuracoes c where c.owner_id = auth.uid()), 3)::int,
         coalesce((select c.dias_aviso_contrato from public.configuracoes c where c.owner_id = auth.uid()), 60)::int;
$$;

-- ---------------------------------------------------------------------
-- 4. Funções de cadastro com os campos de contrato
--    (substituem as versões do script 0002)
-- ---------------------------------------------------------------------
drop function if exists public.cadastrar_imovel(text, text, text, uuid, text, text, date, numeric, int);
drop function if exists public.registrar_locacao(uuid, uuid, text, text, date, numeric, int);
-- Versões de uma edição anterior deste script (com índice de reajuste):
drop function if exists public.cadastrar_imovel(text, text, text, uuid, text, text, date, numeric, int, int, int, text);
drop function if exists public.registrar_locacao(uuid, uuid, text, text, date, numeric, int, int, int, text);
-- O índice de reajuste foi retirado: o valor do reajuste é definido pelo proprietário.
alter table public.locacoes drop constraint if exists locacoes_indice_chk;
alter table public.locacoes drop column if exists indice_reajuste;

create or replace function public.registrar_locacao(
  p_imovel_id          uuid,
  p_inquilino_id       uuid,
  p_inquilino_nome     text,
  p_inquilino_telefone text,
  p_data_entrada       date,
  p_valor_aluguel      numeric,
  p_dia_vencimento     int,
  p_prazo_meses        int  default null,
  p_reajuste_meses     int  default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inquilino uuid := p_inquilino_id;
  v_locacao   uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if p_data_entrada is null then
    raise exception 'Informe a data de entrada.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.imoveis where id = p_imovel_id) then
    raise exception 'Imóvel não encontrado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.locacoes where imovel_id = p_imovel_id and situacao = 'ativa') then
    raise exception 'Este imóvel já tem uma locação ativa. Encerre-a antes de cadastrar um novo inquilino.'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.locacoes where imovel_id = p_imovel_id and data_saida > p_data_entrada) then
    raise exception 'A data de entrada é anterior à saída do inquilino anterior deste imóvel.'
      using errcode = 'P0001';
  end if;

  if v_inquilino is null then
    insert into public.inquilinos (nome, telefone)
    values (btrim(p_inquilino_nome), nullif(btrim(coalesce(p_inquilino_telefone, '')), ''))
    returning id into v_inquilino;
  elsif not exists (select 1 from public.inquilinos where id = v_inquilino) then
    raise exception 'Inquilino não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.locacoes (imovel_id, inquilino_id, data_entrada, valor_aluguel, dia_vencimento,
                               prazo_meses, reajuste_meses)
  values (p_imovel_id, v_inquilino, p_data_entrada, p_valor_aluguel, p_dia_vencimento,
          p_prazo_meses, p_reajuste_meses)
  returning id into v_locacao;

  return v_locacao;
end;
$$;

create or replace function public.cadastrar_imovel(
  p_identificacao      text,
  p_endereco           text,
  p_observacoes        text,
  p_inquilino_id       uuid,
  p_inquilino_nome     text,
  p_inquilino_telefone text,
  p_data_entrada       date,
  p_valor_aluguel      numeric,
  p_dia_vencimento     int,
  p_prazo_meses        int  default null,
  p_reajuste_meses     int  default null
)
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

  insert into public.imoveis (identificacao, endereco, observacoes)
  values (btrim(p_identificacao), btrim(p_endereco), nullif(btrim(coalesce(p_observacoes, '')), ''))
  returning id into v_imovel;

  if p_data_entrada is not null then
    perform public.registrar_locacao(v_imovel, p_inquilino_id, p_inquilino_nome, p_inquilino_telefone,
                                     p_data_entrada, p_valor_aluguel, p_dia_vencimento,
                                     p_prazo_meses, p_reajuste_meses);
  end if;

  return v_imovel;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Registrar reajuste (valor informado por você)
-- Atualiza o valor atual do aluguel, grava o histórico e, só se você
-- marcar a opção, atualiza também os lançamentos SEM pagamento a partir
-- do mês do reajuste. Lançamentos pagos nunca são alterados.
-- ---------------------------------------------------------------------
create or replace function public.registrar_reajuste(
  p_locacao_id        uuid,
  p_data              date,
  p_valor_novo        numeric,
  p_observacao        text,
  p_aplicar_em_aberto boolean
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_loc public.locacoes%rowtype;
  v_qtd integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select * into v_loc from public.locacoes where id = p_locacao_id for update;
  if not found then
    raise exception 'Locação não encontrada.' using errcode = 'P0001';
  end if;
  if v_loc.situacao <> 'ativa' then
    raise exception 'Só é possível reajustar uma locação ativa.' using errcode = 'P0001';
  end if;
  if p_data is null or p_data < v_loc.data_entrada then
    raise exception 'A data do reajuste não pode ser anterior à data de entrada.' using errcode = 'P0001';
  end if;
  if p_valor_novo is null or p_valor_novo <= 0 then
    raise exception 'Informe o novo valor do aluguel.' using errcode = 'P0001';
  end if;

  insert into public.reajustes (locacao_id, data_reajuste, valor_anterior, valor_novo, observacao)
  values (v_loc.id, p_data, v_loc.valor_aluguel, p_valor_novo, nullif(btrim(coalesce(p_observacao, '')), ''));

  update public.locacoes
     set valor_aluguel = p_valor_novo,
         data_ultimo_reajuste = p_data
   where id = v_loc.id;

  if p_aplicar_em_aberto then
    update public.recebimentos
       set valor_previsto = p_valor_novo
     where locacao_id = v_loc.id
       and data_pagamento is null
       and mes_referencia >= date_trunc('month', p_data)::date;
    get diagnostics v_qtd = row_count;
  end if;

  return v_qtd;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Preparar lançamentos: gera o mês atual e, quando faltar pouco para
-- a virada do mês (dentro da antecedência de aviso), também o seguinte,
-- para que o aviso de "parcela vencendo" funcione no início do mês.
-- ---------------------------------------------------------------------
create or replace function public.preparar_lancamentos()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hoje   date := public.hoje_brasil();
  v_limite date := v_hoje + (select dias_parcela from public.config_avisos());
  v_qtd    integer;
begin
  v_qtd := public.gerar_recebimentos_mes(extract(year from v_hoje)::int, extract(month from v_hoje)::int);
  if date_trunc('month', v_limite) > date_trunc('month', v_hoje) then
    v_qtd := v_qtd + public.gerar_recebimentos_mes(extract(year from v_limite)::int, extract(month from v_limite)::int);
  end if;
  return v_qtd;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Avisos
--   parcela_atrasada  -> vencida e sem pagamento
--   parcela_hoje      -> vence hoje
--   parcela_vencendo  -> vence nos próximos N dias (padrão 3)
--   fim_contrato      -> prazo do contrato termina nos próximos N dias (padrão 60) ou já terminou
--   reajuste          -> data de reajuste nos próximos N dias (padrão 60) ou já passou
-- "dias" = dias até a data (negativo = já passou).
-- Um aviso some sozinho quando resolvido: pagamento registrado, contrato
-- renovado/encerrado ou reajuste registrado.
-- ---------------------------------------------------------------------
create or replace function public.avisos()
returns table (
  tipo           text,
  data_alvo      date,
  dias           integer,
  imovel_id      uuid,
  imovel         text,
  inquilino      text,
  locacao_id     uuid,
  recebimento_id uuid,
  valor          numeric,
  detalhe        text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cfg as (
    select c.dias_parcela, c.dias_contrato, public.hoje_brasil() as hoje from public.config_avisos() c
  ),
  contratos as (
    select l.*, i.identificacao, q.nome,
           (l.data_inicio_contrato + make_interval(months => l.prazo_meses))::date as fim,
           (coalesce(l.data_ultimo_reajuste, l.data_entrada) + make_interval(months => l.reajuste_meses))::date as proximo_reajuste
      from public.locacoes l
      join public.imoveis i    on i.id = l.imovel_id
      join public.inquilinos q on q.id = l.inquilino_id
     where l.situacao = 'ativa'
  )
  select case
           when r.data_vencimento < cfg.hoje then 'parcela_atrasada'
           when r.data_vencimento = cfg.hoje then 'parcela_hoje'
           else 'parcela_vencendo'
         end,
         r.data_vencimento, r.data_vencimento - cfg.hoje,
         r.imovel_id, r.imovel_identificacao, r.inquilino_nome, r.locacao_id, r.id,
         r.valor_previsto, to_char(r.mes_referencia, 'MM/YYYY')
    from public.vw_recebimentos r, cfg
   where r.data_pagamento is null
     and r.data_vencimento <= cfg.hoje + cfg.dias_parcela

  union all

  select 'fim_contrato', c.fim, c.fim - cfg.hoje, c.imovel_id, c.identificacao, c.nome, c.id, null,
         c.valor_aluguel, c.prazo_meses || ' meses'
    from contratos c, cfg
   where c.prazo_meses is not null
     and c.fim <= cfg.hoje + cfg.dias_contrato

  union all

  select 'reajuste', c.proximo_reajuste, c.proximo_reajuste - cfg.hoje, c.imovel_id, c.identificacao, c.nome, c.id, null,
         c.valor_aluguel, c.reajuste_meses || ' meses'
    from contratos c, cfg
   where c.reajuste_meses is not null
     and c.proximo_reajuste <= cfg.hoje + cfg.dias_contrato

  order by 3, 1;
$$;

revoke all on function public.config_avisos() from public, anon;
revoke all on function public.registrar_locacao(uuid, uuid, text, text, date, numeric, int, int, int) from public, anon;
revoke all on function public.cadastrar_imovel(text, text, text, uuid, text, text, date, numeric, int, int, int) from public, anon;
revoke all on function public.registrar_reajuste(uuid, date, numeric, text, boolean) from public, anon;
revoke all on function public.preparar_lancamentos() from public, anon;
revoke all on function public.avisos() from public, anon;

grant execute on function public.config_avisos() to authenticated;
grant execute on function public.registrar_locacao(uuid, uuid, text, text, date, numeric, int, int, int) to authenticated;
grant execute on function public.cadastrar_imovel(text, text, text, uuid, text, text, date, numeric, int, int, int) to authenticated;
grant execute on function public.registrar_reajuste(uuid, date, numeric, text, boolean) to authenticated;
grant execute on function public.preparar_lancamentos() to authenticated;
grant execute on function public.avisos() to authenticated;
