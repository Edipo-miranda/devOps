-- =====================================================================
-- Verificação do contrato revisado e da exclusão de cadastros (script 0005)
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase DEPOIS dos scripts 0001 a 0005.
-- Cria usuários TEMPORÁRIOS, testa e apaga tudo no final.
-- Resultado esperado: uma tabela com todas as linhas "OK".
-- =====================================================================
begin;

create temp table resultado_testes (n serial, teste text) on commit drop;
grant all on resultado_testes to authenticated, anon;
grant usage on sequence resultado_testes_n_seq to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c9', 'teste-i@verificacao.invalid'),
  ('00000000-0000-4000-8000-0000000000d9', 'teste-j@verificacao.invalid');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c9","role":"authenticated"}';

do $$
declare
  v_hoje   date := public.hoje_brasil();
  v_prop   uuid;
  v_imovel uuid;
  v_imovel2 uuid;
  v_loc    record;
  v_inq    uuid;
  v_res    jsonb;
  v_qtd    int;
begin
  insert into public.proprietarios (nome, genero) values ('TESTE Dono', 'masculino') returning id into v_prop;

  v_imovel := public.salvar_imovel(
    jsonb_build_object('identificacao', 'TESTE Casa', 'endereco', 'Rua X, 1', 'proprietario_id', v_prop), null,
    jsonb_build_object('nome', 'TESTE Inquilina', 'genero', 'feminino'),
    jsonb_build_object('data_entrada', v_hoje - 40, 'valor_aluguel', 1500, 'dia_vencimento', 5, 'reajuste_meses', 12,
      'indice_reajuste', 'IGP-M', 'iptu_por_conta', 'locatario'));
  select * into v_loc from public.locacoes where imovel_id = v_imovel;
  v_inq := v_loc.inquilino_id;
  if v_loc.indice_reajuste <> 'IGP-M' or v_loc.iptu_por_conta <> 'locatario' then
    raise exception 'FALHOU: índice/IPTU não gravados';
  end if;
  if (select genero from public.inquilinos where id = v_inq) <> 'feminino' then
    raise exception 'FALHOU: gênero do inquilino não gravado';
  end if;
  insert into resultado_testes (teste) values ('Grava índice de reajuste, IPTU e gênero');

  v_imovel2 := public.salvar_imovel(jsonb_build_object('identificacao', 'TESTE Casa 2', 'endereco', 'Rua X, 2'), null,
    jsonb_build_object('nome', 'TESTE Outro'), jsonb_build_object('data_entrada', v_hoje, 'valor_aluguel', 900, 'dia_vencimento', 5));
  if (select indice_reajuste from public.locacoes where imovel_id = v_imovel2) <> 'IPCA' then
    raise exception 'FALHOU: índice padrão deveria ser IPCA';
  end if;
  insert into resultado_testes (teste) values ('Índice padrão IPCA');

  begin
    update public.locacoes set indice_reajuste = 'SELIC' where id = v_loc.id;
    raise exception 'FALHOU: aceitou índice inválido';
  exception when check_violation then
    insert into resultado_testes (teste) values ('Bloqueia índice inválido');
  end;

  -- Movimentação do inquilino: lançamentos, pagamento e reajuste
  perform public.gerar_recebimentos_mes(extract(year from v_hoje - 40)::int, extract(month from v_hoje - 40)::int);
  perform public.preparar_lancamentos();
  update public.recebimentos set valor_recebido = 1500, data_pagamento = v_hoje where locacao_id = v_loc.id
     and mes_referencia = date_trunc('month', v_hoje)::date;
  perform public.registrar_reajuste(v_loc.id, v_hoje, 1600, null, false);

  -- Exclusão do inquilino apaga tudo dele e deixa o imóvel vago
  v_res := public.excluir_inquilino(v_inq);
  if (v_res ->> 'locacoes')::int <> 1 or (v_res ->> 'recebimentos')::int < 1 or (v_res ->> 'reajustes')::int <> 1 then
    raise exception 'FALHOU: contagem da exclusão incorreta: %', v_res;
  end if;
  if exists (select 1 from public.inquilinos where id = v_inq)
     or exists (select 1 from public.locacoes where id = v_loc.id)
     or exists (select 1 from public.recebimentos where locacao_id = v_loc.id) then
    raise exception 'FALHOU: sobrou movimentação do inquilino excluído';
  end if;
  if not exists (select 1 from public.imoveis where id = v_imovel) then
    raise exception 'FALHOU: o imóvel não deveria ser apagado';
  end if;
  if not exists (select 1 from public.locacoes where imovel_id = v_imovel2) then
    raise exception 'FALHOU: apagou locação de outro inquilino';
  end if;
  insert into resultado_testes (teste) values ('Excluir inquilino apaga toda a movimentação dele');

  -- Exclusão do proprietário mantém os imóveis
  v_qtd := public.excluir_proprietario(v_prop);
  if v_qtd <> 1 then raise exception 'FALHOU: deveria desvincular 1 imóvel, desvinculou %', v_qtd; end if;
  if (select proprietario_id from public.imoveis where id = v_imovel) is not null then
    raise exception 'FALHOU: imóvel continua com proprietário excluído';
  end if;
  if exists (select 1 from public.proprietarios where id = v_prop) then raise exception 'FALHOU: proprietário não foi excluído'; end if;
  insert into resultado_testes (teste) values ('Excluir proprietário mantém os imóveis');
end $$;

-- Outro usuário não consegue excluir dados alheios
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d9","role":"authenticated"}';

do $$
declare
  v_inq uuid;
begin
  reset role;
  select id into v_inq from public.inquilinos where owner_id = '00000000-0000-4000-8000-0000000000c9' limit 1;
  set local role authenticated;
  begin
    perform public.excluir_inquilino(v_inq);
    raise exception 'FALHOU: outro usuário excluiu inquilino';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  insert into resultado_testes (teste) values ('Outro usuário não exclui dados alheios');
end $$;

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  begin
    perform public.excluir_inquilino(gen_random_uuid());
    raise exception 'FALHOU: visitante executou exclusão';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('Visitante não exclui nada');
end $$;

-- Limpeza
reset role;
delete from public.reajustes     where owner_id in ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000d9');
delete from public.configuracoes where owner_id in ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000d9');
delete from public.recebimentos  where owner_id in ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000d9');
delete from public.locacoes      where owner_id in ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000d9');
delete from public.inquilinos    where owner_id in ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000d9');
delete from public.imoveis       where owner_id in ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000d9');
delete from public.proprietarios where owner_id in ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000d9');
delete from auth.users           where id       in ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000d9');

select n as "#", teste, 'OK' as resultado from resultado_testes order by n;

commit;
