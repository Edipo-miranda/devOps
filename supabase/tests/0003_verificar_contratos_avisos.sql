-- =====================================================================
-- Verificação de contratos, reajustes e avisos (0003_contratos_avisos.sql)
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase DEPOIS dos scripts 0001, 0002 e 0003.
-- Cria usuários TEMPORÁRIOS, testa e apaga tudo no final.
-- Resultado esperado: uma tabela com todas as linhas "OK".
-- =====================================================================
begin;

create temp table resultado_testes (n serial, teste text) on commit drop;
grant all on resultado_testes to authenticated, anon;
grant usage on sequence resultado_testes_n_seq to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'teste-e@verificacao.invalid'),
  ('00000000-0000-4000-8000-0000000000f2', 'teste-f@verificacao.invalid');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}';

do $$
declare
  v_hoje    date := public.hoje_brasil();
  v_imovel  uuid;
  v_imovel2 uuid;
  v_loc     uuid;
  v_loc2    uuid;
  v_qtd     int;
  v_rec     record;
  v_mes     date := date_trunc('month', public.hoje_brasil())::date;
  v_r1      uuid;
  v_r2      uuid;
begin
  -- Locação com contrato de 12 meses e reajuste anual, entrada há 11 meses e 15 dias:
  -- fim do contrato e reajuste caem daqui a ~15 dias -> devem aparecer (aviso de 60 dias).
  v_imovel := public.cadastrar_imovel('TESTE Apto A', 'Rua Teste, 1', null, null, 'TESTE Inquilino A', null,
                                      (v_hoje - interval '11 months' - interval '15 days')::date, 1000, 28,
                                      12, 12, 'IGP-M');
  select id into v_loc from public.locacoes where imovel_id = v_imovel;
  select * into v_rec from public.locacoes where id = v_loc;
  if v_rec.prazo_meses <> 12 or v_rec.reajuste_meses <> 12 or v_rec.indice_reajuste <> 'IGP-M'
     or v_rec.data_inicio_contrato <> v_rec.data_entrada then
    raise exception 'FALHOU: campos de contrato não gravados';
  end if;
  insert into resultado_testes (teste) values ('Cadastro com prazo e reajuste');

  -- Sem prazo nem reajuste: não gera aviso de contrato
  v_imovel2 := public.cadastrar_imovel('TESTE Casa B', 'Rua Teste, 2', null, null, 'TESTE Inquilino B', null,
                                       (v_hoje - interval '3 years')::date, 800, 1);
  select id into v_loc2 from public.locacoes where imovel_id = v_imovel2;

  begin
    update public.locacoes set prazo_meses = 0 where id = v_loc;
    raise exception 'FALHOU: aceitou prazo zero';
  exception when check_violation then
    insert into resultado_testes (teste) values ('Bloqueia prazo inválido');
  end;

  select count(*) into v_qtd from public.avisos() where tipo = 'fim_contrato' and locacao_id = v_loc;
  if v_qtd <> 1 then raise exception 'FALHOU: aviso de fim de contrato ausente'; end if;
  select count(*) into v_qtd from public.avisos() where tipo = 'reajuste' and locacao_id = v_loc;
  if v_qtd <> 1 then raise exception 'FALHOU: aviso de reajuste ausente'; end if;
  select count(*) into v_qtd from public.avisos() where tipo in ('fim_contrato', 'reajuste') and locacao_id = v_loc2;
  if v_qtd <> 0 then raise exception 'FALHOU: avisou contrato sem prazo/reajuste'; end if;
  insert into resultado_testes (teste) values ('Avisos de fim de contrato e reajuste');

  -- Antecedência configurável: com 5 dias, os avisos de ~15 dias somem
  insert into public.configuracoes (dias_aviso_parcela, dias_aviso_contrato) values (3, 5);
  select count(*) into v_qtd from public.avisos() where locacao_id = v_loc and tipo in ('fim_contrato', 'reajuste');
  if v_qtd <> 0 then raise exception 'FALHOU: antecedência configurada não respeitada'; end if;
  update public.configuracoes set dias_aviso_contrato = 60;
  insert into resultado_testes (teste) values ('Antecedência configurável');

  -- Parcelas: atrasada, vence hoje e vencendo
  perform public.preparar_lancamentos();
  select id into v_r1 from public.recebimentos where locacao_id = v_loc  and mes_referencia = v_mes;
  select id into v_r2 from public.recebimentos where locacao_id = v_loc2 and mes_referencia = v_mes;
  update public.recebimentos set data_vencimento = v_hoje - 2 where locacao_id = v_loc  and mes_referencia = v_mes;
  update public.recebimentos set data_vencimento = v_hoje     where locacao_id = v_loc2 and mes_referencia = v_mes;
  select count(*) into v_qtd from public.avisos() where tipo = 'parcela_atrasada' and recebimento_id = v_r1 and dias = -2;
  if v_qtd <> 1 then raise exception 'FALHOU: aviso de parcela atrasada'; end if;
  select count(*) into v_qtd from public.avisos() where tipo = 'parcela_hoje' and recebimento_id = v_r2;
  if v_qtd <> 1 then raise exception 'FALHOU: aviso de parcela vencendo hoje'; end if;
  update public.recebimentos set data_vencimento = v_hoje + 2 where locacao_id = v_loc2 and mes_referencia = v_mes;
  select count(*) into v_qtd from public.avisos() where tipo = 'parcela_vencendo' and recebimento_id = v_r2;
  if v_qtd <> 1 then raise exception 'FALHOU: aviso de parcela vencendo em 2 dias'; end if;
  update public.recebimentos set data_vencimento = v_hoje + 10 where locacao_id = v_loc2 and mes_referencia = v_mes;
  select count(*) into v_qtd from public.avisos() where recebimento_id = v_r2;
  if v_qtd <> 0 then raise exception 'FALHOU: avisou parcela fora da antecedência'; end if;
  insert into resultado_testes (teste) values ('Avisos de parcela (atrasada, hoje, vencendo)');

  -- Pagamento faz o aviso sumir
  update public.recebimentos set valor_recebido = 1000, data_pagamento = v_hoje where locacao_id = v_loc and mes_referencia = v_mes;
  select count(*) into v_qtd from public.avisos() where recebimento_id = v_r1;
  if v_qtd <> 0 then raise exception 'FALHOU: aviso continuou após pagamento'; end if;
  insert into resultado_testes (teste) values ('Aviso de parcela some após pagamento');

  -- Reajuste: grava histórico, muda valor atual, não mexe em lançamento pago
  v_qtd := public.registrar_reajuste(v_loc, v_hoje, 1100, 'IGP-M 10%', true);
  select valor_aluguel, data_ultimo_reajuste into v_rec from public.locacoes where id = v_loc;
  if v_rec.valor_aluguel <> 1100 or v_rec.data_ultimo_reajuste <> v_hoje then
    raise exception 'FALHOU: reajuste não atualizou a locação';
  end if;
  if not exists (select 1 from public.reajustes where locacao_id = v_loc and valor_anterior = 1000 and valor_novo = 1100) then
    raise exception 'FALHOU: histórico de reajuste não gravado';
  end if;
  if (select valor_previsto from public.recebimentos where locacao_id = v_loc and mes_referencia = v_mes) <> 1000 then
    raise exception 'FALHOU: reajuste alterou lançamento já pago';
  end if;
  select count(*) into v_qtd from public.avisos() where tipo = 'reajuste' and locacao_id = v_loc;
  if v_qtd <> 0 then raise exception 'FALHOU: aviso de reajuste continuou após registrar'; end if;
  insert into resultado_testes (teste) values ('Registro de reajuste com histórico');

  -- Reajuste com opção de aplicar nos lançamentos em aberto
  perform public.registrar_reajuste(v_loc2, v_hoje, 900, null, true);
  if (select valor_previsto from public.recebimentos where locacao_id = v_loc2 and mes_referencia = v_mes) <> 900 then
    raise exception 'FALHOU: opção aplicar em aberto não atualizou o lançamento';
  end if;
  insert into resultado_testes (teste) values ('Reajuste aplicado a lançamento em aberto (opcional)');

  -- Renovação: novo período de contrato faz o aviso sumir
  update public.locacoes
     set data_inicio_contrato = (data_inicio_contrato + make_interval(months => prazo_meses))::date
   where id = v_loc;
  select count(*) into v_qtd from public.avisos() where tipo = 'fim_contrato' and locacao_id = v_loc;
  if v_qtd <> 0 then raise exception 'FALHOU: aviso de fim de contrato continuou após renovar'; end if;
  insert into resultado_testes (teste) values ('Renovação de contrato');
end $$;

-- Outro usuário não vê avisos nem reajusta locação alheia
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}';

do $$
declare
  v_qtd int;
  v_loc uuid;
begin
  select count(*) into v_qtd from public.avisos();
  if v_qtd <> 0 then raise exception 'FALHOU: outro usuário viu avisos'; end if;
  select count(*) into v_qtd from public.reajustes;
  if v_qtd <> 0 then raise exception 'FALHOU: outro usuário viu reajustes'; end if;
  select count(*) into v_qtd from public.configuracoes;
  if v_qtd <> 0 then raise exception 'FALHOU: outro usuário viu configurações'; end if;

  reset role;
  select id into v_loc from public.locacoes where owner_id = '00000000-0000-4000-8000-0000000000e1' limit 1;
  set local role authenticated;
  begin
    perform public.registrar_reajuste(v_loc, current_date, 5000, null, false);
    raise exception 'FALHOU: outro usuário reajustou';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  insert into resultado_testes (teste) values ('RLS: avisos, reajustes e configurações por usuário');
end $$;

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  begin
    perform * from public.avisos();
    raise exception 'FALHOU: visitante viu avisos';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.reajustes;
    raise exception 'FALHOU: visitante leu reajustes';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('Visitante não acessa avisos');
end $$;

-- Limpeza
reset role;
delete from public.reajustes     where owner_id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f2');
delete from public.configuracoes where owner_id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f2');
delete from public.recebimentos  where owner_id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f2');
delete from public.locacoes      where owner_id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f2');
delete from public.inquilinos    where owner_id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f2');
delete from public.imoveis       where owner_id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f2');
delete from auth.users           where id       in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f2');

select n as "#", teste, 'OK' as resultado from resultado_testes order by n;

commit;
