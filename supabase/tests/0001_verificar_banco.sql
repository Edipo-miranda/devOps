-- =====================================================================
-- Verificação automática do banco de dados
-- ---------------------------------------------------------------------
-- Execute DEPOIS de 0001_schema_inicial.sql, no SQL Editor do Supabase.
--
-- O script cria dois usuários TEMPORÁRIOS de teste, simula o acesso de
-- cada um (e de um visitante não logado), confere as regras e, no fim,
-- APAGA tudo o que criou. Nenhum dado de teste fica no banco.
--
-- Resultado esperado: uma tabela com todas as linhas "OK".
-- Se alguma regra falhar, aparece um erro começando com "FALHOU".
-- =====================================================================
begin;

create temp table resultado_testes (n serial, teste text) on commit drop;
grant all on resultado_testes to authenticated, anon;
grant usage on sequence resultado_testes_n_seq to authenticated, anon;

-- Usuários temporários (ids fixos e e-mails de domínio inválido de propósito).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'teste-a@verificacao.invalid'),
  ('00000000-0000-4000-8000-00000000000b', 'teste-b@verificacao.invalid');

-- ---------------------------------------------------------------------
-- USUÁRIO A
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}';

do $$
declare
  v_imovel  uuid;
  v_imovel2 uuid;
  v_inq     uuid;
  v_loc     uuid;
  v_hoje    date := public.hoje_brasil();
  m2        date := (date_trunc('month', public.hoje_brasil()) - interval '2 month')::date; -- 2 meses atrás
  m1        date := (date_trunc('month', public.hoje_brasil()) - interval '1 month')::date; -- mês passado
  mp        date := (date_trunc('month', public.hoje_brasil()) + interval '1 month')::date; -- próximo mês
  v_qtd     int;
  v_rec     record;
  v_ok      boolean;
begin
  -- Cadastro de imóvel
  insert into public.imoveis (identificacao, endereco) values ('TESTE Apto 1', 'Rua de Teste, 1')
    returning id into v_imovel;
  insert into resultado_testes (teste) values ('Cadastro de imóvel');

  -- Identificação duplicada
  begin
    insert into public.imoveis (identificacao, endereco) values ('teste apto 1 ', 'Outro endereço');
    raise exception 'FALHOU: aceitou imóvel com identificação duplicada';
  exception when unique_violation then
    insert into resultado_testes (teste) values ('Bloqueia identificação de imóvel duplicada');
  end;

  -- Telefone inválido
  begin
    insert into public.inquilinos (nome, telefone) values ('TESTE Inquilino', 'abc');
    raise exception 'FALHOU: aceitou telefone inválido';
  exception when check_violation then
    insert into resultado_testes (teste) values ('Bloqueia telefone inválido');
  end;

  insert into public.inquilinos (nome, telefone) values ('TESTE Inquilino', '(11) 99999-0000')
    returning id into v_inq;
  insert into public.inquilinos (nome) values ('TESTE Inquilino sem telefone');
  insert into resultado_testes (teste) values ('Cadastro de inquilino (telefone opcional)');

  -- Locação ativa, vencimento dia 31 (testa meses curtos)
  insert into public.locacoes (imovel_id, inquilino_id, data_entrada, valor_aluguel, dia_vencimento)
    values (v_imovel, v_inq, m2, 1000.00, 31)
    returning id into v_loc;
  insert into resultado_testes (teste) values ('Cadastro de locação');

  begin
    insert into public.locacoes (imovel_id, inquilino_id, data_entrada, valor_aluguel, dia_vencimento)
      values (v_imovel, v_inq, m2, 900.00, 10);
    raise exception 'FALHOU: aceitou duas locações ativas no mesmo imóvel';
  exception when unique_violation then
    insert into resultado_testes (teste) values ('Bloqueia duas locações ativas no mesmo imóvel');
  end;

  begin
    insert into public.locacoes (imovel_id, inquilino_id, data_entrada, valor_aluguel, dia_vencimento)
      values (v_imovel, v_inq, m2, 0, 10);
    raise exception 'FALHOU: aceitou aluguel com valor zero';
  exception when check_violation then
    insert into resultado_testes (teste) values ('Bloqueia valor de aluguel inválido');
  end;

  -- Geração de lançamentos sem duplicidade
  v_qtd := public.gerar_recebimentos_mes(extract(year from m2)::int, extract(month from m2)::int);
  if v_qtd <> 1 then raise exception 'FALHOU: esperava 1 lançamento novo, gerou %', v_qtd; end if;
  v_qtd := public.gerar_recebimentos_mes(extract(year from m2)::int, extract(month from m2)::int);
  if v_qtd <> 0 then raise exception 'FALHOU: gerou lançamento duplicado'; end if;
  insert into resultado_testes (teste) values ('Gera lançamento do mês sem duplicar');

  begin
    insert into public.recebimentos (locacao_id, mes_referencia, valor_previsto, data_vencimento)
      values (v_loc, m2, 1000, m2);
    raise exception 'FALHOU: aceitou inserção manual duplicada';
  exception when unique_violation then
    insert into resultado_testes (teste) values ('Restrição única locação + mês');
  end;

  select * into v_rec from public.vw_recebimentos where locacao_id = v_loc and mes_referencia = m2;
  if v_rec.data_vencimento <> (m2 + interval '1 month' - interval '1 day')::date then
    raise exception 'FALHOU: vencimento dia 31 deveria virar o último dia do mês (%)', v_rec.data_vencimento;
  end if;
  insert into resultado_testes (teste) values ('Vencimento dia 31 ajustado ao último dia do mês');

  if v_rec.situacao <> 'atrasado' or v_rec.dias_atraso <= 0 then
    raise exception 'FALHOU: lançamento vencido sem pagamento deveria estar atrasado (%)', v_rec.situacao;
  end if;
  insert into resultado_testes (teste) values ('Situação Atrasado calculada');

  perform public.gerar_recebimentos_mes(extract(year from mp)::int, extract(month from mp)::int);
  select situacao into v_rec from public.vw_recebimentos where locacao_id = v_loc and mes_referencia = mp;
  if v_rec.situacao <> 'em_aberto' then
    raise exception 'FALHOU: lançamento futuro deveria estar em aberto (%)', v_rec.situacao;
  end if;
  insert into resultado_testes (teste) values ('Situação Em aberto calculada');

  -- Alterar o valor atual do aluguel não muda meses antigos
  update public.locacoes set valor_aluguel = 1500.00 where id = v_loc;
  select valor_previsto into v_rec from public.recebimentos where locacao_id = v_loc and mes_referencia = m2;
  if v_rec.valor_previsto <> 1000.00 then
    raise exception 'FALHOU: mudar o aluguel alterou um mês antigo';
  end if;
  perform public.gerar_recebimentos_mes(extract(year from m1)::int, extract(month from m1)::int);
  select valor_previsto into v_rec from public.recebimentos where locacao_id = v_loc and mes_referencia = m1;
  if v_rec.valor_previsto <> 1500.00 then
    raise exception 'FALHOU: novo mês deveria usar o valor atual (1500)';
  end if;
  insert into resultado_testes (teste) values ('Reajuste manual preserva meses antigos');

  -- Registro de pagamento
  begin
    update public.recebimentos set valor_recebido = 1000 where locacao_id = v_loc and mes_referencia = m2;
    raise exception 'FALHOU: aceitou pagamento sem data';
  exception when check_violation then
    insert into resultado_testes (teste) values ('Pagamento exige valor e data juntos');
  end;

  update public.recebimentos set valor_recebido = 1000, data_pagamento = v_hoje
    where locacao_id = v_loc and mes_referencia = m2;
  select situacao into v_rec from public.vw_recebimentos where locacao_id = v_loc and mes_referencia = m2;
  if v_rec.situacao <> 'pago' then raise exception 'FALHOU: deveria estar pago'; end if;
  insert into resultado_testes (teste) values ('Registro de pagamento -> Pago');

  -- Histórico protegido
  begin
    update public.recebimentos set mes_referencia = mp where locacao_id = v_loc and mes_referencia = m2;
    raise exception 'FALHOU: permitiu trocar o mês de um recebimento';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
    insert into resultado_testes (teste) values ('Bloqueia troca de mês/locação do recebimento');
  end;

  begin
    delete from public.recebimentos where locacao_id = v_loc;
    raise exception 'FALHOU: permitiu apagar recebimento';
  exception when insufficient_privilege then
    insert into resultado_testes (teste) values ('Bloqueia exclusão de recebimentos');
  end;

  -- Resumo do mês (dashboard)
  select * into v_rec from public.resumo_mes(extract(year from m2)::int, extract(month from m2)::int);
  if v_rec.total_previsto <> 1000 or v_rec.total_recebido <> 1000 or v_rec.total_pendente <> 0
     or v_rec.qtd_atrasados <> 0 or v_rec.qtd_pagos <> 1 then
    raise exception 'FALHOU: resumo do mês incorreto: %', v_rec;
  end if;
  select * into v_rec from public.resumo_mes(extract(year from m1)::int, extract(month from m1)::int);
  if v_rec.total_previsto <> 1500 or v_rec.total_pendente <> 1500 or v_rec.qtd_atrasados <> 1 then
    raise exception 'FALHOU: resumo do mês passado incorreto: %', v_rec;
  end if;
  insert into resultado_testes (teste) values ('Resumo do mês para o dashboard');

  -- Desativar imóvel / encerrar locação / histórico de ocupações
  begin
    update public.imoveis set ativo = false where id = v_imovel;
    raise exception 'FALHOU: desativou imóvel com locação ativa';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
    insert into resultado_testes (teste) values ('Bloqueia desativar imóvel com locação ativa');
  end;

  begin
    update public.locacoes set situacao = 'encerrada' where id = v_loc;
    raise exception 'FALHOU: encerrou locação sem data de saída';
  exception when check_violation then
    insert into resultado_testes (teste) values ('Encerramento exige data de saída');
  end;

  update public.locacoes set situacao = 'encerrada', data_saida = m1 + 9 where id = v_loc;
  v_qtd := public.gerar_recebimentos_mes(extract(year from v_hoje)::int, extract(month from v_hoje)::int);
  if v_qtd <> 0 then raise exception 'FALHOU: gerou lançamento para locação já encerrada'; end if;
  insert into resultado_testes (teste) values ('Locação encerrada não gera meses seguintes');

  update public.imoveis set ativo = false where id = v_imovel;
  begin
    insert into public.locacoes (imovel_id, inquilino_id, data_entrada, valor_aluguel, dia_vencimento)
      values (v_imovel, v_inq, v_hoje, 1200, 5);
    raise exception 'FALHOU: criou locação em imóvel desativado';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
    insert into resultado_testes (teste) values ('Bloqueia locação em imóvel desativado');
  end;

  update public.imoveis set ativo = true where id = v_imovel;
  insert into public.locacoes (imovel_id, inquilino_id, data_entrada, valor_aluguel, dia_vencimento)
    select v_imovel, id, m1 + 15, 1300, 5 from public.inquilinos where nome = 'TESTE Inquilino sem telefone';
  select count(*) into v_qtd from public.locacoes where imovel_id = v_imovel;
  if v_qtd <> 2 then raise exception 'FALHOU: histórico de ocupações perdido'; end if;
  insert into resultado_testes (teste) values ('Novo inquilino mantém histórico do anterior');
end $$;

-- ---------------------------------------------------------------------
-- USUÁRIO B: não pode ver nem mexer nos dados do usuário A
-- ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}';

do $$
declare
  v_qtd     int;
  v_imov_a  uuid;
  v_inq_b   uuid;
begin
  select count(*) into v_qtd from public.imoveis;
  if v_qtd <> 0 then raise exception 'FALHOU: usuário B enxergou imóveis de A'; end if;
  select count(*) into v_qtd from public.vw_recebimentos;
  if v_qtd <> 0 then raise exception 'FALHOU: usuário B enxergou recebimentos de A'; end if;
  select count(*) into v_qtd from public.locacoes;
  if v_qtd <> 0 then raise exception 'FALHOU: usuário B enxergou locações de A'; end if;
  insert into resultado_testes (teste) values ('RLS: outro usuário não vê os dados');

  update public.recebimentos set valor_recebido = 1, data_pagamento = current_date;
  get diagnostics v_qtd = row_count;
  if v_qtd <> 0 then raise exception 'FALHOU: usuário B alterou recebimentos de A'; end if;
  insert into resultado_testes (teste) values ('RLS: outro usuário não altera os dados');

  begin
    insert into public.imoveis (owner_id, identificacao, endereco)
      values ('00000000-0000-4000-8000-00000000000a', 'Invasão', 'x');
    raise exception 'FALHOU: usuário B criou imóvel em nome de A';
  exception when insufficient_privilege then
    insert into resultado_testes (teste) values ('RLS: não cria registro em nome de outro usuário');
  end;

  -- Mesmo sabendo o id do imóvel de A, B não consegue vinculá-lo.
  reset role;
  select id into v_imov_a from public.imoveis where owner_id = '00000000-0000-4000-8000-00000000000a' limit 1;
  set local role authenticated;
  insert into public.inquilinos (nome) values ('TESTE B') returning id into v_inq_b;
  begin
    insert into public.locacoes (imovel_id, inquilino_id, data_entrada, data_saida, situacao, valor_aluguel, dia_vencimento)
      values (v_imov_a, v_inq_b, current_date - 30, current_date, 'encerrada', 100, 1);
    raise exception 'FALHOU: usuário B vinculou imóvel de A';
  exception when foreign_key_violation then
    insert into resultado_testes (teste) values ('Chave estrangeira impede usar imóvel de outro usuário');
  end;

  v_qtd := public.gerar_recebimentos_mes(extract(year from current_date)::int, extract(month from current_date)::int);
  if v_qtd <> 0 then raise exception 'FALHOU: usuário B gerou lançamentos de A'; end if;
  insert into resultado_testes (teste) values ('Geração de lançamentos só afeta o próprio usuário');
end $$;

-- ---------------------------------------------------------------------
-- VISITANTE NÃO LOGADO (anon)
-- ---------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  begin
    perform 1 from public.imoveis;
    raise exception 'FALHOU: visitante leu imóveis';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.vw_recebimentos;
    raise exception 'FALHOU: visitante leu recebimentos';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.gerar_recebimentos_mes(2026, 1);
    raise exception 'FALHOU: visitante executou função';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('Visitante não logado não acessa nada');
end $$;

-- ---------------------------------------------------------------------
-- LIMPEZA: apaga tudo que o teste criou
-- ---------------------------------------------------------------------
reset role;
delete from public.recebimentos where owner_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
delete from public.locacoes     where owner_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
delete from public.inquilinos   where owner_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
delete from public.imoveis      where owner_id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');
delete from auth.users          where id       in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b');

select n as "#", teste, 'OK' as resultado from resultado_testes order by n;

commit;
