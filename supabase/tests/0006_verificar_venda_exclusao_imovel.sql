-- =====================================================================
-- Verificação de imóvel vendido e exclusão de imóvel (script 0006)
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase DEPOIS dos scripts 0001 a 0006.
-- Cria usuários TEMPORÁRIOS, testa e apaga tudo no final.
-- Resultado esperado: uma tabela com todas as linhas "OK".
-- =====================================================================
begin;

create temp table resultado_testes (n serial, teste text) on commit drop;
grant all on resultado_testes to authenticated, anon;
grant usage on sequence resultado_testes_n_seq to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e9', 'teste-k@verificacao.invalid'),
  ('00000000-0000-4000-8000-0000000000f9', 'teste-l@verificacao.invalid');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}';

do $$
declare
  v_hoje    date := public.hoje_brasil();
  v_mes     date := date_trunc('month', public.hoje_brasil())::date;
  v_vendido uuid;
  v_teste   uuid;
  v_loc     uuid;
  v_inq     uuid;
  v_res     jsonb;
  v_im      record;
begin
  -- Imóvel alugado que será vendido
  v_vendido := public.salvar_imovel(jsonb_build_object('identificacao', 'TESTE Vendido', 'endereco', 'Rua V, 1'), null,
    jsonb_build_object('nome', 'TESTE Inquilino V'),
    jsonb_build_object('data_entrada', v_hoje - 60, 'valor_aluguel', 1000, 'dia_vencimento', 10));
  select id into v_loc from public.locacoes where imovel_id = v_vendido;
  perform public.gerar_recebimentos_mes(extract(year from v_hoje - 60)::int, extract(month from v_hoje - 60)::int);
  perform public.gerar_recebimentos_mes(extract(year from v_mes + 31)::int, extract(month from v_mes + 31)::int);
  update public.recebimentos set valor_recebido = 1000, data_pagamento = v_hoje
   where locacao_id = v_loc and mes_referencia = date_trunc('month', v_hoje - 60)::date;

  perform public.marcar_imovel_vendido(v_vendido, v_hoje, 350000, 'teste comprador');
  select * into v_im from public.imoveis where id = v_vendido;
  if v_im.ativo or v_im.vendido_em <> v_hoje or v_im.valor_venda <> 350000 then
    raise exception 'FALHOU: imóvel não marcado como vendido: %', v_im;
  end if;
  if (select situacao from public.locacoes where id = v_loc) <> 'encerrada' then
    raise exception 'FALHOU: locação deveria ser encerrada na venda';
  end if;
  if not exists (select 1 from public.recebimentos where locacao_id = v_loc and data_pagamento is not null) then
    raise exception 'FALHOU: venda apagou pagamento do histórico';
  end if;
  if exists (select 1 from public.recebimentos where locacao_id = v_loc and mes_referencia > v_mes and data_pagamento is null) then
    raise exception 'FALHOU: lançamento futuro sem pagamento deveria ser removido';
  end if;
  insert into resultado_testes (teste) values ('Marcar como vendido encerra a locação e mantém o histórico');

  begin
    update public.imoveis set ativo = true where id = v_vendido;
    raise exception 'FALHOU: imóvel vendido ficou ativo';
  exception when check_violation then
    insert into resultado_testes (teste) values ('Imóvel vendido não pode ficar ativo sem desfazer a venda');
  end;

  -- Imóvel de exemplo excluído com toda a movimentação
  v_teste := public.salvar_imovel(jsonb_build_object('identificacao', 'TESTE Exemplo', 'endereco', 'Rua E, 1'), null,
    jsonb_build_object('nome', 'TESTE Inquilino E'),
    jsonb_build_object('data_entrada', v_hoje, 'valor_aluguel', 800, 'dia_vencimento', 5));
  select id, inquilino_id into v_loc, v_inq from public.locacoes where imovel_id = v_teste;
  perform public.preparar_lancamentos();
  v_res := public.excluir_imovel(v_teste);
  if (v_res ->> 'locacoes')::int <> 1 or (v_res ->> 'recebimentos')::int < 1 then
    raise exception 'FALHOU: contagem da exclusão: %', v_res;
  end if;
  if exists (select 1 from public.imoveis where id = v_teste) or exists (select 1 from public.locacoes where id = v_loc)
     or exists (select 1 from public.recebimentos where locacao_id = v_loc) then
    raise exception 'FALHOU: sobrou movimentação do imóvel excluído';
  end if;
  if not exists (select 1 from public.inquilinos where id = v_inq) then
    raise exception 'FALHOU: o inquilino não deveria ser apagado junto com o imóvel';
  end if;
  if not exists (select 1 from public.imoveis where id = v_vendido) then
    raise exception 'FALHOU: apagou outro imóvel';
  end if;
  insert into resultado_testes (teste) values ('Excluir imóvel apaga a movimentação e mantém o inquilino');
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000f9","role":"authenticated"}';

do $$
declare
  v_im uuid;
begin
  reset role;
  select id into v_im from public.imoveis where owner_id = '00000000-0000-4000-8000-0000000000e9' limit 1;
  set local role authenticated;
  begin
    perform public.excluir_imovel(v_im);
    raise exception 'FALHOU: outro usuário excluiu imóvel';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.marcar_imovel_vendido(v_im, current_date, null, null);
    raise exception 'FALHOU: outro usuário marcou venda';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  insert into resultado_testes (teste) values ('Outro usuário não exclui nem vende imóvel alheio');
end $$;

-- Limpeza
reset role;
delete from public.reajustes     where owner_id in ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000f9');
delete from public.configuracoes where owner_id in ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000f9');
delete from public.recebimentos  where owner_id in ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000f9');
delete from public.locacoes      where owner_id in ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000f9');
delete from public.inquilinos    where owner_id in ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000f9');
delete from public.imoveis       where owner_id in ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000f9');
delete from public.proprietarios where owner_id in ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000f9');
delete from auth.users           where id       in ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000f9');

select n as "#", teste, 'OK' as resultado from resultado_testes order by n;

commit;
