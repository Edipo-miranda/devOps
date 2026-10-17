-- =====================================================================
-- Controle de Aluguéis — esquema inicial do banco de dados
-- ---------------------------------------------------------------------
-- Como usar: copie TODO este arquivo e execute no Supabase em
--   Dashboard > SQL Editor > New query > Run
-- O script pode ser executado mais de uma vez sem erro.
--
-- Tabelas:
--   imoveis      -> cada imóvel (casa, apartamento, sala...)
--   inquilinos   -> cada pessoa que aluga
--   locacoes     -> o vínculo "inquilino X ocupa imóvel Y desde a data Z"
--                   (é aqui que fica o histórico de ocupações)
--   recebimentos -> um lançamento por locação por mês de referência
--
-- Segurança: todas as tabelas usam RLS. Cada usuário logado só enxerga
-- e altera os próprios dados (coluna owner_id = usuário logado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Função utilitária: "hoje" no fuso horário de Brasília.
-- Usada para decidir se um recebimento está atrasado.
-- ---------------------------------------------------------------------
create or replace function public.hoje_brasil()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Atualiza a coluna updated_at automaticamente em toda alteração.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- 1. IMÓVEIS
-- =====================================================================
create table if not exists public.imoveis (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  identificacao text not null,               -- ex.: "Apto 101", "Casa fundos"
  endereco      text not null,
  observacoes   text,
  ativo         boolean not null default true, -- "desativar" em vez de apagar
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint imoveis_identificacao_chk check (length(btrim(identificacao)) between 1 and 120),
  constraint imoveis_endereco_chk      check (length(btrim(endereco)) between 1 and 300),
  -- necessário para as chaves estrangeiras compostas (id + dono)
  constraint imoveis_id_owner_uk unique (id, owner_id)
);

-- O mesmo usuário não pode ter dois imóveis com a mesma identificação.
create unique index if not exists imoveis_owner_identificacao_uk
  on public.imoveis (owner_id, lower(btrim(identificacao)));

-- =====================================================================
-- 2. INQUILINOS
-- =====================================================================
create table if not exists public.inquilinos (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  nome       text not null,
  telefone   text,                              -- opcional
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inquilinos_nome_chk     check (length(btrim(nome)) between 2 and 150),
  constraint inquilinos_telefone_chk check (telefone is null or telefone ~ '^[0-9()+ -]{8,20}$'),
  constraint inquilinos_id_owner_uk  unique (id, owner_id)
);

create index if not exists inquilinos_owner_nome_idx
  on public.inquilinos (owner_id, lower(nome));

-- =====================================================================
-- 3. LOCAÇÕES (ocupações)
-- Cada linha = um período em que um inquilino ocupou um imóvel.
-- Quando o inquilino sai, a locação é "encerrada" (com data de saída)
-- e uma nova locação pode ser criada para o próximo inquilino.
-- Nada é apagado: o histórico fica preservado.
-- =====================================================================
create table if not exists public.locacoes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  imovel_id      uuid not null,
  inquilino_id   uuid not null,
  data_entrada   date not null,
  data_saida     date,                          -- preenchida ao encerrar
  valor_aluguel  numeric(12,2) not null,        -- valor ATUAL, informado manualmente
  dia_vencimento smallint not null,
  situacao       text not null default 'ativa',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint locacoes_valor_chk      check (valor_aluguel > 0 and valor_aluguel < 10000000),
  constraint locacoes_dia_chk        check (dia_vencimento between 1 and 31),
  constraint locacoes_situacao_chk   check (situacao in ('ativa', 'encerrada')),
  constraint locacoes_saida_chk      check (data_saida is null or data_saida >= data_entrada),
  -- locação encerrada precisa de data de saída; locação ativa não pode ter.
  constraint locacoes_encerrada_chk  check ((situacao = 'encerrada') = (data_saida is not null)),
  constraint locacoes_id_owner_uk    unique (id, owner_id),

  -- Chaves estrangeiras compostas: garantem que o imóvel e o inquilino
  -- pertencem ao MESMO usuário dono da locação.
  constraint locacoes_imovel_fk foreign key (imovel_id, owner_id)
    references public.imoveis (id, owner_id) on delete restrict,
  constraint locacoes_inquilino_fk foreign key (inquilino_id, owner_id)
    references public.inquilinos (id, owner_id) on delete restrict
);

-- Um imóvel só pode ter UMA locação ativa por vez.
create unique index if not exists locacoes_uma_ativa_por_imovel_uk
  on public.locacoes (imovel_id) where situacao = 'ativa';

create index if not exists locacoes_owner_idx     on public.locacoes (owner_id);
create index if not exists locacoes_imovel_idx    on public.locacoes (imovel_id);
create index if not exists locacoes_inquilino_idx on public.locacoes (inquilino_id);

-- Impede criar locação ativa em imóvel desativado.
create or replace function public.locacoes_validar_imovel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.situacao = 'ativa' and exists (
       select 1 from public.imoveis i where i.id = new.imovel_id and not i.ativo
     ) then
    raise exception 'O imóvel está desativado. Reative o imóvel antes de criar uma locação ativa.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Impede desativar imóvel que ainda tem locação ativa.
create or replace function public.imoveis_validar_desativacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ativo and not new.ativo and exists (
       select 1 from public.locacoes l where l.imovel_id = new.id and l.situacao = 'ativa'
     ) then
    raise exception 'Encerre a locação ativa deste imóvel antes de desativá-lo.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- =====================================================================
-- 4. RECEBIMENTOS
-- Um lançamento por locação e por mês. Cada lançamento guarda uma
-- CÓPIA do valor previsto e do vencimento no momento em que foi criado,
-- por isso mudar o valor atual do aluguel não altera meses antigos.
-- =====================================================================
create table if not exists public.recebimentos (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  locacao_id      uuid not null,
  mes_referencia  date not null,                -- sempre o dia 1 do mês (ex.: 2026-10-01)
  valor_previsto  numeric(12,2) not null,
  data_vencimento date not null,
  valor_recebido  numeric(12,2),                -- preenchido ao registrar pagamento
  data_pagamento  date,                         -- preenchido ao registrar pagamento
  observacao      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint recebimentos_mes_chk       check (extract(day from mes_referencia) = 1),
  constraint recebimentos_previsto_chk  check (valor_previsto > 0 and valor_previsto < 10000000),
  constraint recebimentos_recebido_chk  check (valor_recebido is null or (valor_recebido > 0 and valor_recebido < 10000000)),
  -- valor recebido e data do pagamento andam juntos: ou os dois, ou nenhum.
  constraint recebimentos_pagamento_chk check ((valor_recebido is null) = (data_pagamento is null)),
  constraint recebimentos_obs_chk       check (observacao is null or length(observacao) <= 500),

  -- NÃO permite lançamento duplicado para a mesma locação no mesmo mês.
  constraint recebimentos_locacao_mes_uk unique (locacao_id, mes_referencia),

  constraint recebimentos_locacao_fk foreign key (locacao_id, owner_id)
    references public.locacoes (id, owner_id) on delete restrict
);

create index if not exists recebimentos_owner_mes_idx
  on public.recebimentos (owner_id, mes_referencia);

-- Protege o histórico: depois de criado, o lançamento não pode trocar de
-- locação, de mês ou de dono.
create or replace function public.recebimentos_proteger_campos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.locacao_id     is distinct from old.locacao_id
     or new.mes_referencia is distinct from old.mes_referencia
     or new.owner_id       is distinct from old.owner_id then
    raise exception 'Não é permitido alterar a locação, o mês de referência ou o dono de um recebimento.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- =====================================================================
-- TRIGGERS
-- =====================================================================
drop trigger if exists trg_imoveis_updated_at on public.imoveis;
create trigger trg_imoveis_updated_at before update on public.imoveis
  for each row execute function public.set_updated_at();

drop trigger if exists trg_imoveis_desativacao on public.imoveis;
create trigger trg_imoveis_desativacao before update on public.imoveis
  for each row execute function public.imoveis_validar_desativacao();

drop trigger if exists trg_inquilinos_updated_at on public.inquilinos;
create trigger trg_inquilinos_updated_at before update on public.inquilinos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_locacoes_updated_at on public.locacoes;
create trigger trg_locacoes_updated_at before update on public.locacoes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_locacoes_validar_imovel on public.locacoes;
create trigger trg_locacoes_validar_imovel before insert or update on public.locacoes
  for each row execute function public.locacoes_validar_imovel();

drop trigger if exists trg_recebimentos_updated_at on public.recebimentos;
create trigger trg_recebimentos_updated_at before update on public.recebimentos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_recebimentos_proteger on public.recebimentos;
create trigger trg_recebimentos_proteger before update on public.recebimentos
  for each row execute function public.recebimentos_proteger_campos();

-- =====================================================================
-- RLS — segurança por linha
-- Cada usuário só vê/cria/edita linhas em que owner_id = seu id.
-- Não há política de DELETE: nada pode ser apagado pelo aplicativo,
-- o que preserva o histórico (imóveis são "desativados", locações são
-- "encerradas").
-- =====================================================================
alter table public.imoveis      enable row level security;
alter table public.inquilinos   enable row level security;
alter table public.locacoes     enable row level security;
alter table public.recebimentos enable row level security;

-- Imóveis
drop policy if exists imoveis_select on public.imoveis;
create policy imoveis_select on public.imoveis for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists imoveis_insert on public.imoveis;
create policy imoveis_insert on public.imoveis for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists imoveis_update on public.imoveis;
create policy imoveis_update on public.imoveis for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Inquilinos
drop policy if exists inquilinos_select on public.inquilinos;
create policy inquilinos_select on public.inquilinos for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists inquilinos_insert on public.inquilinos;
create policy inquilinos_insert on public.inquilinos for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists inquilinos_update on public.inquilinos;
create policy inquilinos_update on public.inquilinos for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Locações
drop policy if exists locacoes_select on public.locacoes;
create policy locacoes_select on public.locacoes for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists locacoes_insert on public.locacoes;
create policy locacoes_insert on public.locacoes for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists locacoes_update on public.locacoes;
create policy locacoes_update on public.locacoes for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Recebimentos
drop policy if exists recebimentos_select on public.recebimentos;
create policy recebimentos_select on public.recebimentos for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists recebimentos_insert on public.recebimentos;
create policy recebimentos_insert on public.recebimentos for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists recebimentos_update on public.recebimentos;
create policy recebimentos_update on public.recebimentos for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Visitantes não logados (papel "anon") não têm acesso a nada.
-- Usuários logados podem consultar, incluir e alterar, mas nunca apagar.
revoke all on public.imoveis, public.inquilinos, public.locacoes, public.recebimentos from anon, authenticated;
grant select, insert, update on public.imoveis, public.inquilinos, public.locacoes, public.recebimentos to authenticated;

-- =====================================================================
-- VIEW de recebimentos com a SITUAÇÃO calculada
--   pago      -> pagamento registrado
--   atrasado  -> sem pagamento e vencimento já passou (horário de Brasília)
--   em_aberto -> sem pagamento e ainda dentro do prazo
-- security_invoker = true faz a view respeitar o RLS do usuário logado.
-- =====================================================================
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
    when r.data_pagamento is not null           then 'pago'
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
  q.telefone      as inquilino_telefone
from public.recebimentos r
join public.locacoes   l on l.id = r.locacao_id
join public.imoveis    i on i.id = l.imovel_id
join public.inquilinos q on q.id = l.inquilino_id;

revoke all on public.vw_recebimentos from anon, authenticated;
grant select on public.vw_recebimentos to authenticated;

-- =====================================================================
-- FUNÇÃO: gerar lançamentos de um mês
-- Cria um recebimento para cada locação que estava vigente no mês
-- (entrada até o fim do mês e saída, se houver, a partir do início do mês).
-- Usa o valor ATUAL do aluguel como valor previsto.
-- Se o lançamento já existe, NÃO cria outro (on conflict do nothing).
-- Dia de vencimento maior que o último dia do mês (ex.: 31 em fevereiro)
-- vira o último dia do mês.
-- Retorna a quantidade de lançamentos novos criados.
-- =====================================================================
create or replace function public.gerar_recebimentos_mes(p_ano int, p_mes int)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inicio date;
  v_fim    date;
  v_qtd    integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if p_mes not between 1 and 12 or p_ano not between 2000 and 2100 then
    raise exception 'Mês ou ano inválido.' using errcode = '22023';
  end if;

  v_inicio := make_date(p_ano, p_mes, 1);
  v_fim    := (v_inicio + interval '1 month' - interval '1 day')::date;

  insert into public.recebimentos (owner_id, locacao_id, mes_referencia, valor_previsto, data_vencimento)
  select
    l.owner_id,
    l.id,
    v_inicio,
    l.valor_aluguel,
    make_date(p_ano, p_mes, least(l.dia_vencimento::int, extract(day from v_fim)::int))
  from public.locacoes l
  where l.owner_id = auth.uid()
    and l.data_entrada <= v_fim
    and (l.data_saida is null or l.data_saida >= v_inicio)
  on conflict (locacao_id, mes_referencia) do nothing;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke all on function public.gerar_recebimentos_mes(int, int) from public, anon;
grant execute on function public.gerar_recebimentos_mes(int, int) to authenticated;

-- =====================================================================
-- FUNÇÃO: resumo do mês para o Dashboard
-- =====================================================================
create or replace function public.resumo_mes(p_ano int, p_mes int)
returns table (
  total_previsto  numeric,
  total_recebido  numeric,
  total_pendente  numeric,
  qtd_lancamentos integer,
  qtd_pagos       integer,
  qtd_em_aberto   integer,
  qtd_atrasados   integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(v.valor_previsto), 0),
    coalesce(sum(v.valor_recebido), 0),
    coalesce(sum(v.valor_previsto) filter (where v.situacao <> 'pago'), 0),
    count(*)::int,
    (count(*) filter (where v.situacao = 'pago'))::int,
    (count(*) filter (where v.situacao = 'em_aberto'))::int,
    (count(*) filter (where v.situacao = 'atrasado'))::int
  from public.vw_recebimentos v
  where v.mes_referencia = make_date(p_ano, p_mes, 1);
$$;

revoke all on function public.resumo_mes(int, int) from public, anon;
grant execute on function public.resumo_mes(int, int) to authenticated;

revoke all on function public.hoje_brasil() from public, anon;
grant execute on function public.hoje_brasil() to authenticated;
