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
