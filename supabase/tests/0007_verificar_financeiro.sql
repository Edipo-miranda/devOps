-- =====================================================================
-- Verificação do financeiro, documentos do imóvel e caução (script 0007)
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase DEPOIS dos scripts 0001 a 0007.
-- Cria usuários TEMPORÁRIOS, testa e apaga tudo no final.
-- Resultado esperado: uma tabela com todas as linhas "OK".
-- =====================================================================
begin;

create temp table resultado_testes (n serial, teste text) on commit drop;
grant all on resultado_testes to authenticated, anon;
grant usage on sequence resultado_testes_n_seq to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000aa', 'teste-m@verificacao.invalid'),
  ('00000000-0000-4000-8000-0000000000bb', 'teste-n@verificacao.invalid');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}';

do $$
declare
  v_hoje   date := public.hoje_brasil();
  v_prop   uuid;
  v_imovel uuid;
  v_loc    uuid;
  v_rec    record;
  v_qtd    int;
begin
  insert into public.proprietarios (nome, pix) values ('TESTE Dono', 'chave-teste') returning id into v_prop;
  v_imovel := public.salvar_imovel(
    jsonb_build_object('identificacao', 'TESTE Casa', 'endereco', 'Rua X, 1', 'proprietario_id', v_prop,
      'matricula', '12.345', 'cartorio', 'CRI Teste', 'inscricao_iptu', '01.02.003', 'valor_iptu_anual', 1200,
      'area_m2', 85.5, 'quartos', 2, 'banheiros', 1, 'vagas', 1, 'valor_condominio', 0, 'uc_energia', '123', 'uc_agua', '456'),
    null, jsonb_build_object('nome', 'TESTE Inquilino', 'cpf', '529.982.247-25'),
    jsonb_build_object('data_entrada', v_hoje - 40, 'valor_aluguel', 1000, 'dia_vencimento', 5,
      'multa_atraso_percentual', 2, 'juros_atraso_percentual', 1, 'garantia', 'caucao', 'valor_garantia', 3000));
  select * into v_rec from public.imoveis where id = v_imovel;
  if v_rec.matricula <> '12.345' or v_rec.area_m2 <> 85.5 or v_rec.quartos <> 2 or v_rec.uc_agua <> '456' then
    raise exception 'FALHOU: documentação do imóvel não gravada';
  end if;
  insert into resultado_testes (teste) values ('Matrícula, IPTU e características do imóvel');

  select id into v_loc from public.locacoes where imovel_id = v_imovel;
  update public.locacoes set caucao_recebida_em = v_hoje - 40 where id = v_loc;
  begin
    update public.locacoes set caucao_devolvida_em = v_hoje - 50 where id = v_loc;
    raise exception 'FALHOU: aceitou devolução da caução antes do recebimento';
  exception when check_violation then
    insert into resultado_testes (teste) values ('Controle da caução');
  end;

  -- Multa/juros registrados junto com o pagamento
  perform public.gerar_recebimentos_mes(extract(year from v_hoje - 40)::int, extract(month from v_hoje - 40)::int);
  update public.recebimentos set valor_recebido = 1030, data_pagamento = v_hoje, valor_encargos = 30
   where locacao_id = v_loc and mes_referencia = date_trunc('month', v_hoje - 40)::date;
  begin
    update public.recebimentos set valor_encargos = 5000 where locacao_id = v_loc and valor_recebido is not null;
    raise exception 'FALHOU: encargos maiores que o valor recebido';
  exception when check_violation then null;
  end;
  select * into v_rec from public.vw_recebimentos where locacao_id = v_loc and valor_recebido is not null;
  if v_rec.valor_encargos <> 30 or v_rec.proprietario_pix <> 'chave-teste' or v_rec.inquilino_cpf <> '529.982.247-25'
     or v_rec.multa_atraso_percentual <> 2 then
    raise exception 'FALHOU: dados novos na vw_recebimentos: %', v_rec;
  end if;
  insert into resultado_testes (teste) values ('Multa/juros no pagamento e dados do proprietário na lista');

  -- Configuração de cobrança
  insert into public.configuracoes (cobrar_encargos) values (false);
  if (select cobrar_encargos from public.configuracoes) then raise exception 'FALHOU: configuração de cobrança'; end if;
  insert into resultado_testes (teste) values ('Opção de não cobrar multa e juros');

  -- Despesas
  insert into public.despesas (imovel_id, data, categoria, descricao, valor, dedutivel)
  values (v_imovel, v_hoje, 'iptu', 'IPTU parcela 1', 100, true), (v_imovel, v_hoje, 'manutencao', 'Torneira', 80, false);
  select count(*) into v_qtd from public.despesas where imovel_id = v_imovel;
  if v_qtd <> 2 then raise exception 'FALHOU: despesas não gravadas'; end if;
  begin
    insert into public.despesas (imovel_id, data, categoria, valor) values (v_imovel, v_hoje, 'viagem', 10);
    raise exception 'FALHOU: aceitou categoria inválida';
  exception when check_violation then null;
  end;
  delete from public.despesas where descricao = 'Torneira';
  select count(*) into v_qtd from public.despesas where imovel_id = v_imovel;
  if v_qtd <> 1 then raise exception 'FALHOU: não excluiu despesa'; end if;
  insert into resultado_testes (teste) values ('Despesas: lançar, validar e excluir');

  perform public.excluir_imovel(v_imovel);
  if exists (select 1 from public.despesas where imovel_id = v_imovel) then raise exception 'FALHOU: sobrou despesa do imóvel excluído'; end if;
  insert into resultado_testes (teste) values ('Excluir imóvel apaga as despesas dele');
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000bb","role":"authenticated"}';

do $$
declare
  v_qtd int;
  v_imovel uuid;
begin
  select count(*) into v_qtd from public.despesas;
  if v_qtd <> 0 then raise exception 'FALHOU: outro usuário viu despesas'; end if;
  reset role;
  insert into public.imoveis (owner_id, identificacao, endereco) values ('00000000-0000-4000-8000-0000000000aa', 'TESTE Outro', 'x')
  returning id into v_imovel;
  set local role authenticated;
  begin
    insert into public.despesas (imovel_id, data, categoria, valor) values (v_imovel, current_date, 'outros', 10);
    raise exception 'FALHOU: lançou despesa em imóvel alheio';
  exception when foreign_key_violation then null;
  end;
  insert into resultado_testes (teste) values ('RLS: despesas por usuário');
end $$;

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform 1 from public.despesas;
    raise exception 'FALHOU: visitante leu despesas';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('Visitante não acessa despesas');
end $$;

-- Limpeza
reset role;
delete from public.despesas      where owner_id in ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb');
delete from public.reajustes     where owner_id in ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb');
delete from public.configuracoes where owner_id in ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb');
delete from public.recebimentos  where owner_id in ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb');
delete from public.locacoes      where owner_id in ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb');
delete from public.inquilinos    where owner_id in ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb');
delete from public.imoveis       where owner_id in ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb');
delete from public.proprietarios where owner_id in ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb');
delete from auth.users           where id       in ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb');

select n as "#", teste, 'OK' as resultado from resultado_testes order by n;

commit;
