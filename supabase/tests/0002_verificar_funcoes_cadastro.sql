-- =====================================================================
-- Verificação das funções de cadastro (0002_funcoes_cadastro.sql)
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase DEPOIS dos scripts 0001 e 0002.
-- Cria usuários TEMPORÁRIOS, testa e apaga tudo no final.
-- Resultado esperado: uma tabela com todas as linhas "OK".
-- =====================================================================
begin;

create temp table resultado_testes (n serial, teste text) on commit drop;
grant all on resultado_testes to authenticated, anon;
grant usage on sequence resultado_testes_n_seq to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'teste-c@verificacao.invalid'),
  ('00000000-0000-4000-8000-0000000000d2', 'teste-d@verificacao.invalid');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';

do $$
declare
  v_imovel   uuid;
  v_imovel2  uuid;
  v_loc      uuid;
  v_inq      uuid;
  v_qtd      int;
  v_hoje     date := public.hoje_brasil();
  m_atual    date := date_trunc('month', public.hoje_brasil())::date;
  m_prox     date := (date_trunc('month', public.hoje_brasil()) + interval '1 month')::date;
  m_prox2    date := (date_trunc('month', public.hoje_brasil()) + interval '2 month')::date;
begin
  -- Imóvel + inquilino novo + locação, tudo de uma vez
  v_imovel := public.cadastrar_imovel('TESTE Casa 1', 'Rua Teste, 10', null,
                                      null, 'TESTE Pessoa Um', '(11) 98888-7777',
                                      m_atual, 1250.50, 10);
  select count(*) into v_qtd from public.locacoes where imovel_id = v_imovel and situacao = 'ativa';
  if v_qtd <> 1 then raise exception 'FALHOU: cadastrar_imovel não criou a locação'; end if;
  insert into resultado_testes (teste) values ('Cadastra imóvel, inquilino e locação juntos');

  -- Imóvel vago (sem locação)
  v_imovel2 := public.cadastrar_imovel('TESTE Sala 2', 'Av. Teste, 20', 'Sala comercial',
                                       null, null, null, null, null, null);
  select count(*) into v_qtd from public.locacoes where imovel_id = v_imovel2;
  if v_qtd <> 0 then raise exception 'FALHOU: imóvel vago não deveria ter locação'; end if;
  insert into resultado_testes (teste) values ('Cadastra imóvel vago');

  -- Tudo ou nada: inquilino inválido não pode deixar imóvel cadastrado pela metade
  begin
    perform public.cadastrar_imovel('TESTE Casa 3', 'Rua Teste, 30', null,
                                    null, 'X', null, m_atual, 900, 5);
    raise exception 'FALHOU: aceitou nome de inquilino inválido';
  exception when check_violation then
    null;
  end;
  if exists (select 1 from public.imoveis where identificacao = 'TESTE Casa 3') then
    raise exception 'FALHOU: sobrou imóvel cadastrado pela metade';
  end if;
  insert into resultado_testes (teste) values ('Cadastro é tudo ou nada');

  -- Segunda locação ativa no mesmo imóvel
  begin
    perform public.registrar_locacao(v_imovel, null, 'TESTE Pessoa Dois', null, m_atual, 1000, 5);
    raise exception 'FALHOU: aceitou segunda locação ativa';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  insert into resultado_testes (teste) values ('Bloqueia segunda locação ativa');

  -- Lançamentos: mês atual pago, próximos meses em aberto
  perform public.gerar_recebimentos_mes(extract(year from m_atual)::int, extract(month from m_atual)::int);
  perform public.gerar_recebimentos_mes(extract(year from m_prox)::int,  extract(month from m_prox)::int);
  perform public.gerar_recebimentos_mes(extract(year from m_prox2)::int, extract(month from m_prox2)::int);
  select id into v_loc from public.locacoes where imovel_id = v_imovel and situacao = 'ativa';
  update public.recebimentos set valor_recebido = 1250.50, data_pagamento = v_hoje
   where locacao_id = v_loc and mes_referencia = m_atual;
  update public.recebimentos set valor_recebido = 1250.50, data_pagamento = v_hoje
   where locacao_id = v_loc and mes_referencia = m_prox2;  -- pago adiantado: deve ser mantido

  -- Saída antes da entrada
  begin
    perform public.encerrar_locacao(v_loc, m_atual - 1);
    raise exception 'FALHOU: aceitou saída antes da entrada';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  insert into resultado_testes (teste) values ('Bloqueia saída anterior à entrada');

  -- Encerrar no mês atual: remove só o próximo mês sem pagamento
  v_qtd := public.encerrar_locacao(v_loc, v_hoje);
  if v_qtd <> 1 then raise exception 'FALHOU: esperava remover 1 lançamento em aberto, removeu %', v_qtd; end if;
  if not exists (select 1 from public.recebimentos where locacao_id = v_loc and mes_referencia = m_atual) then
    raise exception 'FALHOU: removeu lançamento do mês da saída';
  end if;
  if not exists (select 1 from public.recebimentos where locacao_id = v_loc and mes_referencia = m_prox2) then
    raise exception 'FALHOU: removeu lançamento já pago';
  end if;
  insert into resultado_testes (teste) values ('Encerrar locação mantém histórico e pagamentos');

  begin
    perform public.encerrar_locacao(v_loc, v_hoje);
    raise exception 'FALHOU: encerrou duas vezes';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  insert into resultado_testes (teste) values ('Não encerra locação já encerrada');

  -- Novo inquilino: não pode entrar antes da saída do anterior
  begin
    perform public.registrar_locacao(v_imovel, null, 'TESTE Pessoa Dois', null, v_hoje - 1, 1300, 5);
    raise exception 'FALHOU: aceitou entrada antes da saída anterior';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  insert into resultado_testes (teste) values ('Bloqueia períodos sobrepostos');

  -- Novo inquilino reaproveitando um inquilino já cadastrado
  select id into v_inq from public.inquilinos where nome = 'TESTE Pessoa Um';
  perform public.registrar_locacao(v_imovel2, v_inq, null, null, v_hoje, 800, 15);
  perform public.registrar_locacao(v_imovel, null, 'TESTE Pessoa Dois', null, v_hoje, 1300, 5);
  select count(*) into v_qtd from public.locacoes where imovel_id = v_imovel;
  if v_qtd <> 2 then raise exception 'FALHOU: histórico do imóvel deveria ter 2 locações'; end if;
  insert into resultado_testes (teste) values ('Novo inquilino com histórico preservado');
end $$;

-- Outro usuário não pode encerrar nem usar dados do primeiro
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}';

do $$
declare
  v_loc    uuid;
  v_imovel uuid;
begin
  reset role;
  select id, imovel_id into v_loc, v_imovel from public.locacoes
   where owner_id = '00000000-0000-4000-8000-0000000000c1' and situacao = 'ativa' limit 1;
  set local role authenticated;

  begin
    perform public.encerrar_locacao(v_loc, current_date);
    raise exception 'FALHOU: outro usuário encerrou a locação';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.registrar_locacao(v_imovel, null, 'TESTE Intruso', null, current_date, 100, 1);
    raise exception 'FALHOU: outro usuário criou locação no imóvel alheio';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  insert into resultado_testes (teste) values ('Outro usuário não mexe nas locações');
end $$;

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  begin
    perform public.cadastrar_imovel('x', 'y', null, null, null, null, null, null, null);
    raise exception 'FALHOU: visitante executou cadastrar_imovel';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.encerrar_locacao(gen_random_uuid(), current_date);
    raise exception 'FALHOU: visitante executou encerrar_locacao';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('Visitante não executa as funções');
end $$;

-- Limpeza
reset role;
delete from public.recebimentos where owner_id in ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d2');
delete from public.locacoes     where owner_id in ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d2');
delete from public.inquilinos   where owner_id in ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d2');
delete from public.imoveis      where owner_id in ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d2');
delete from auth.users          where id       in ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d2');

select n as "#", teste, 'OK' as resultado from resultado_testes order by n;

commit;
