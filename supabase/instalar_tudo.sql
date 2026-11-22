-- INSTALAÇÃO COMPLETA DO BANCO (projeto Supabase NOVO, vazio)
-- Gerado automaticamente por "npm run sql:juntar" a partir de: 0001_schema_inicial.sql, 0002_funcoes_cadastro.sql, 0003_contratos_avisos.sql, 0004_proprietarios_contrato.sql, 0005_contrato_revisado_exclusao.sql, 0006_venda_exclusao_imovel.sql, 0007_financeiro_documentos.sql, 0008_documentos_modelos.sql, 0009_uso_armazenamento.sql.
-- Não edite este arquivo: edite os scripts em supabase/migrations e gere de novo.
-- Uso: Supabase → SQL Editor → New query → cole tudo → Run → "Success".
-- Não rode num banco que já tem as tabelas (lá, rode só os scripts novos).

-- =====================================================================
-- 0001_schema_inicial.sql
-- =====================================================================

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

-- =====================================================================
-- 0002_funcoes_cadastro.sql
-- =====================================================================

-- =====================================================================
-- Controle de Aluguéis — funções de cadastro (Etapa 2)
-- ---------------------------------------------------------------------
-- Execute DEPOIS de 0001_schema_inicial.sql, no SQL Editor do Supabase.
-- O script pode ser executado mais de uma vez sem erro.
--
-- Estas funções fazem várias gravações de uma vez só ("tudo ou nada"):
-- se qualquer parte falhar, nada é gravado. Assim não sobram imóveis
-- ou inquilinos cadastrados pela metade.
-- =====================================================================

-- ---------------------------------------------------------------------
-- registrar_locacao: cria uma locação ativa para um imóvel.
-- Se p_inquilino_id for nulo, cadastra um inquilino novo com nome/telefone.
-- Retorna o id da locação criada.
-- ---------------------------------------------------------------------
create or replace function public.registrar_locacao(
  p_imovel_id          uuid,
  p_inquilino_id       uuid,
  p_inquilino_nome     text,
  p_inquilino_telefone text,
  p_data_entrada       date,
  p_valor_aluguel      numeric,
  p_dia_vencimento     int
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

  if exists (select 1 from public.locacoes
              where imovel_id = p_imovel_id and data_saida > p_data_entrada) then
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

  insert into public.locacoes (imovel_id, inquilino_id, data_entrada, valor_aluguel, dia_vencimento)
  values (p_imovel_id, v_inquilino, p_data_entrada, p_valor_aluguel, p_dia_vencimento)
  returning id into v_locacao;

  return v_locacao;
end;
$$;

-- ---------------------------------------------------------------------
-- cadastrar_imovel: cria o imóvel e, se a data de entrada for
-- informada, já cria a locação com o inquilino. Retorna o id do imóvel.
-- ---------------------------------------------------------------------
create or replace function public.cadastrar_imovel(
  p_identificacao      text,
  p_endereco           text,
  p_observacoes        text,
  p_inquilino_id       uuid,
  p_inquilino_nome     text,
  p_inquilino_telefone text,
  p_data_entrada       date,
  p_valor_aluguel      numeric,
  p_dia_vencimento     int
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
                                     p_data_entrada, p_valor_aluguel, p_dia_vencimento);
  end if;

  return v_imovel;
end;
$$;

-- ---------------------------------------------------------------------
-- encerrar_locacao: registra a saída do inquilino.
-- Também remove lançamentos SEM pagamento de meses POSTERIORES ao mês da
-- saída (gerados antes por engano). Lançamentos pagos e de meses
-- anteriores ou do próprio mês da saída são sempre mantidos.
-- Retorna quantos lançamentos foram removidos.
-- Roda com privilégio elevado (security definer) apenas para poder fazer
-- essa remoção restrita; o dono é verificado explicitamente.
-- ---------------------------------------------------------------------
create or replace function public.encerrar_locacao(p_locacao_id uuid, p_data_saida date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc public.locacoes%rowtype;
  v_qtd integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select * into v_loc from public.locacoes
   where id = p_locacao_id and owner_id = auth.uid()
   for update;

  if not found then
    raise exception 'Locação não encontrada.' using errcode = 'P0001';
  end if;
  if v_loc.situacao <> 'ativa' then
    raise exception 'Esta locação já está encerrada.' using errcode = 'P0001';
  end if;
  if p_data_saida is null or p_data_saida < v_loc.data_entrada then
    raise exception 'A data de saída não pode ser anterior à data de entrada.' using errcode = 'P0001';
  end if;

  update public.locacoes
     set situacao = 'encerrada', data_saida = p_data_saida
   where id = v_loc.id;

  delete from public.recebimentos
   where locacao_id = v_loc.id
     and owner_id = auth.uid()
     and data_pagamento is null
     and mes_referencia > date_trunc('month', p_data_saida)::date;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke all on function public.registrar_locacao(uuid, uuid, text, text, date, numeric, int) from public, anon;
revoke all on function public.cadastrar_imovel(text, text, text, uuid, text, text, date, numeric, int) from public, anon;
revoke all on function public.encerrar_locacao(uuid, date) from public, anon;
grant execute on function public.registrar_locacao(uuid, uuid, text, text, date, numeric, int) to authenticated;
grant execute on function public.cadastrar_imovel(text, text, text, uuid, text, text, date, numeric, int) to authenticated;
grant execute on function public.encerrar_locacao(uuid, date) to authenticated;

-- =====================================================================
-- 0003_contratos_avisos.sql
-- =====================================================================

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

-- =====================================================================
-- 0004_proprietarios_contrato.sql
-- =====================================================================

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

-- =====================================================================
-- 0005_contrato_revisado_exclusao.sql
-- =====================================================================

-- =====================================================================
-- Controle de Aluguéis — contrato revisado e exclusão de cadastros
-- ---------------------------------------------------------------------
-- Execute DEPOIS dos scripts 0001 a 0004, no SQL Editor do Supabase.
-- O script pode ser executado mais de uma vez sem erro.
--
-- O que este script adiciona:
--   * Índice de reajuste da locação (IPCA, IGP-M, INPC, IVAR ou valor
--     definido pelo proprietário) — usado no texto do contrato.
--   * Quem paga o IPTU (proprietário ou inquilino).
--   * Gênero do inquilino/proprietário, para o contrato sair com a
--     concordância certa (brasileiro/brasileira, casado/casada...).
--   * Funções para EXCLUIR inquilino (com toda a movimentação dele) e
--     proprietário (os imóveis ficam, apenas sem proprietário).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novos campos
-- ---------------------------------------------------------------------
alter table public.locacoes add column if not exists indice_reajuste text not null default 'IPCA';
alter table public.locacoes add column if not exists iptu_por_conta  text not null default 'locador';

alter table public.locacoes drop constraint if exists locacoes_indice_chk;
alter table public.locacoes add constraint locacoes_indice_chk
  check (indice_reajuste in ('IPCA', 'IGP-M', 'INPC', 'IVAR', 'proprietario'));
alter table public.locacoes drop constraint if exists locacoes_iptu_chk;
alter table public.locacoes add constraint locacoes_iptu_chk check (iptu_por_conta in ('locador', 'locatario'));

alter table public.inquilinos    add column if not exists genero text;
alter table public.proprietarios add column if not exists genero text;
alter table public.inquilinos    drop constraint if exists inquilinos_genero_chk;
alter table public.inquilinos    add constraint inquilinos_genero_chk check (genero is null or genero in ('masculino', 'feminino'));
alter table public.proprietarios drop constraint if exists proprietarios_genero_chk;
alter table public.proprietarios add constraint proprietarios_genero_chk check (genero is null or genero in ('masculino', 'feminino'));

-- O texto padrão antigo de encargos citava o IPTU, que agora tem campo próprio.
update public.locacoes
   set encargos_locatario = 'água, energia elétrica, gás, internet e outros serviços que contratar ou utilizar'
 where encargos_locatario = 'consumo de água, energia elétrica e gás, taxas condominiais ordinárias e IPTU proporcional ao período da locação';

-- ---------------------------------------------------------------------
-- 2. salvar_locacao com os novos campos (substitui a versão do 0004)
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
                                   data_nascimento, genero, cep, logradouro, numero, complemento, bairro, cidade, uf)
    values (public.txt(p_inquilino, 'nome'), public.txt(p_inquilino, 'telefone'), public.txt(p_inquilino, 'cpf'),
            public.txt(p_inquilino, 'rg'), public.txt(p_inquilino, 'orgao_emissor'), public.txt(p_inquilino, 'nacionalidade'),
            public.txt(p_inquilino, 'estado_civil'), public.txt(p_inquilino, 'profissao'), public.txt(p_inquilino, 'email'),
            public.txt(p_inquilino, 'data_nascimento')::date, public.txt(p_inquilino, 'genero'),
            public.txt(p_inquilino, 'cep'), public.txt(p_inquilino, 'logradouro'), public.txt(p_inquilino, 'numero'),
            public.txt(p_inquilino, 'complemento'), public.txt(p_inquilino, 'bairro'), public.txt(p_inquilino, 'cidade'),
            public.txt(p_inquilino, 'uf'))
    returning id into v_inquilino;
  elsif not exists (select 1 from public.inquilinos where id = v_inquilino) then
    raise exception 'Inquilino não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.locacoes (
    imovel_id, inquilino_id, data_entrada, valor_aluguel, dia_vencimento, prazo_meses, reajuste_meses,
    finalidade, garantia, valor_garantia, fiador_nome, fiador_cpf, fiador_qualificacao,
    multa_atraso_percentual, juros_atraso_percentual, multa_rescisao_alugueis, encargos_locatario, foro, clausulas_adicionais,
    indice_reajuste, iptu_por_conta)
  values (
    p_imovel_id, v_inquilino, v_entrada, (p_locacao ->> 'valor_aluguel')::numeric, (p_locacao ->> 'dia_vencimento')::int,
    (public.txt(p_locacao, 'prazo_meses'))::int, (public.txt(p_locacao, 'reajuste_meses'))::int,
    coalesce(public.txt(p_locacao, 'finalidade'), 'residencial'), coalesce(public.txt(p_locacao, 'garantia'), 'nenhuma'),
    (public.txt(p_locacao, 'valor_garantia'))::numeric, public.txt(p_locacao, 'fiador_nome'), public.txt(p_locacao, 'fiador_cpf'),
    public.txt(p_locacao, 'fiador_qualificacao'), (public.txt(p_locacao, 'multa_atraso_percentual'))::numeric,
    (public.txt(p_locacao, 'juros_atraso_percentual'))::numeric, (public.txt(p_locacao, 'multa_rescisao_alugueis'))::numeric,
    public.txt(p_locacao, 'encargos_locatario'), public.txt(p_locacao, 'foro'), public.txt(p_locacao, 'clausulas_adicionais'),
    coalesce(public.txt(p_locacao, 'indice_reajuste'), 'IPCA'), coalesce(public.txt(p_locacao, 'iptu_por_conta'), 'locador'))
  returning id into v_locacao;

  return v_locacao;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Exclusão de inquilino: apaga o inquilino e TODA a movimentação dele
--    (locações, lançamentos/pagamentos e reajustes). Não tem volta.
--    Roda com privilégio elevado só para poder apagar; o dono é conferido.
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
  delete from public.locacoes where id = any (v_locacoes) and owner_id = auth.uid();
  delete from public.inquilinos where id = p_inquilino_id and owner_id = auth.uid();

  return jsonb_build_object('locacoes', coalesce(array_length(v_locacoes, 1), 0),
                            'recebimentos', v_recebimentos, 'reajustes', v_reajustes);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Exclusão de proprietário: os imóveis dele NÃO são apagados,
--    apenas ficam sem proprietário (vincule outro em "Editar imóvel").
-- ---------------------------------------------------------------------
create or replace function public.excluir_proprietario(p_proprietario_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imoveis integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.proprietarios where id = p_proprietario_id and owner_id = auth.uid()) then
    raise exception 'Proprietário não encontrado.' using errcode = 'P0001';
  end if;

  update public.imoveis set proprietario_id = null
   where proprietario_id = p_proprietario_id and owner_id = auth.uid();
  get diagnostics v_imoveis = row_count;
  delete from public.proprietarios where id = p_proprietario_id and owner_id = auth.uid();
  return v_imoveis;
end;
$$;

revoke all on function public.salvar_locacao(uuid, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.excluir_inquilino(uuid) from public, anon;
revoke all on function public.excluir_proprietario(uuid) from public, anon;
grant execute on function public.salvar_locacao(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.excluir_inquilino(uuid) to authenticated;
grant execute on function public.excluir_proprietario(uuid) to authenticated;

-- =====================================================================
-- 0006_venda_exclusao_imovel.sql
-- =====================================================================

-- =====================================================================
-- Controle de Aluguéis — imóvel vendido e exclusão de imóvel
-- ---------------------------------------------------------------------
-- Execute DEPOIS dos scripts 0001 a 0005, no SQL Editor do Supabase.
-- O script pode ser executado mais de uma vez sem erro.
--
-- * "Marcar como vendido": encerra a locação ativa na data da venda,
--   guarda data/valor/comprador e desativa o imóvel. O histórico fica.
-- * "Excluir imóvel": apaga o imóvel e TODA a movimentação dele
--   (locações, lançamentos, pagamentos e reajustes). Os inquilinos
--   continuam cadastrados (podem ser excluídos na aba Inquilinos).
-- =====================================================================

alter table public.imoveis add column if not exists vendido_em  date;
alter table public.imoveis add column if not exists valor_venda numeric(14,2);
alter table public.imoveis add column if not exists comprador   text;

alter table public.imoveis drop constraint if exists imoveis_venda_chk;
alter table public.imoveis add constraint imoveis_venda_chk check (
  (valor_venda is null or valor_venda > 0) and length(coalesce(comprador, '')) <= 150);

-- Imóvel vendido não pode estar ativo.
alter table public.imoveis drop constraint if exists imoveis_vendido_inativo_chk;
alter table public.imoveis add constraint imoveis_vendido_inativo_chk check (vendido_em is null or not ativo);

-- ---------------------------------------------------------------------
-- Marcar como vendido
-- ---------------------------------------------------------------------
create or replace function public.marcar_imovel_vendido(p_imovel_id uuid, p_data date, p_valor numeric, p_comprador text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_loc       uuid;
  v_removidos integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if p_data is null then
    raise exception 'Informe a data da venda.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.imoveis where id = p_imovel_id) then
    raise exception 'Imóvel não encontrado.' using errcode = 'P0001';
  end if;

  -- Encerra a locação ativa na data da venda (remove só lançamentos futuros sem pagamento).
  select id into v_loc from public.locacoes where imovel_id = p_imovel_id and situacao = 'ativa';
  if v_loc is not null then
    v_removidos := public.encerrar_locacao(v_loc, p_data);
  end if;

  update public.imoveis
     set ativo = false, vendido_em = p_data, valor_venda = p_valor,
         comprador = nullif(btrim(coalesce(p_comprador, '')), '')
   where id = p_imovel_id;

  return v_removidos;
end;
$$;

-- ---------------------------------------------------------------------
-- Excluir imóvel (com toda a movimentação)
-- ---------------------------------------------------------------------
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
  delete from public.imoveis   where id = p_imovel_id and owner_id = auth.uid();

  return jsonb_build_object('locacoes', coalesce(array_length(v_locacoes, 1), 0), 'recebimentos', v_recebimentos);
end;
$$;

revoke all on function public.marcar_imovel_vendido(uuid, date, numeric, text) from public, anon;
revoke all on function public.excluir_imovel(uuid) from public, anon;
grant execute on function public.marcar_imovel_vendido(uuid, date, numeric, text) to authenticated;
grant execute on function public.excluir_imovel(uuid) to authenticated;

-- =====================================================================
-- 0007_financeiro_documentos.sql
-- =====================================================================

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

-- =====================================================================
-- 0008_documentos_modelos.sql
-- =====================================================================

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

-- =====================================================================
-- 0009_uso_armazenamento.sql
-- =====================================================================

-- =====================================================================
-- Controle de Aluguéis — espaço usado pelos documentos
-- ---------------------------------------------------------------------
-- Execute DEPOIS do script 0008, no SQL Editor do Supabase.
-- Mostra em Configurações quanto da pasta "documentos" está ocupado:
-- pelos arquivos do usuário e pelo sistema inteiro (o limite do plano
-- gratuito, 1 GB, é compartilhado por todos os usuários do projeto).
-- Só devolve totais (tamanho e quantidade), nunca nomes de arquivos.
-- =====================================================================
create or replace function public.uso_armazenamento()
returns table (meus_bytes bigint, meus_arquivos integer, total_bytes bigint, total_arquivos integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum((o.metadata ->> 'size')::bigint) filter (where (storage.foldername(o.name))[1] = (select auth.uid())::text), 0)::bigint,
    (count(*) filter (where (storage.foldername(o.name))[1] = (select auth.uid())::text))::int,
    coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint,
    count(*)::int
  from storage.objects o
  where o.bucket_id = 'documentos' and (select auth.uid()) is not null;
$$;

revoke all on function public.uso_armazenamento() from public, anon;
grant execute on function public.uso_armazenamento() to authenticated;
