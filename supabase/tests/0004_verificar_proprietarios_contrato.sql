-- =====================================================================
-- Verificação de proprietários, dados de contrato e visão geral (script 0004)
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase DEPOIS dos scripts 0001 a 0004.
-- Cria usuários TEMPORÁRIOS, testa e apaga tudo no final.
-- Resultado esperado: uma tabela com todas as linhas "OK".
-- =====================================================================
begin;

create temp table resultado_testes (n serial, teste text) on commit drop;
grant all on resultado_testes to authenticated, anon;
grant usage on sequence resultado_testes_n_seq to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a7', 'teste-g@verificacao.invalid'),
  ('00000000-0000-4000-8000-0000000000b8', 'teste-h@verificacao.invalid');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a7","role":"authenticated"}';

do $$
declare
  v_hoje   date := public.hoje_brasil();
  v_prop   uuid;
  v_imovel uuid;
  v_loc    record;
  v_inq    record;
  v_im     record;
  v_res    record;
  v_qtd    int;
begin
  -- Proprietário
  insert into public.proprietarios (nome, cpf_cnpj, estado_civil, profissao, cep, logradouro, numero, bairro, cidade, uf, pix)
  values ('TESTE Proprietário', '111.444.777-35', 'casado(a)', 'comerciante', '01310-100', 'Av. Teste', '1000', 'Centro', 'São Paulo', 'SP', 'pix-teste')
  returning id into v_prop;
  insert into resultado_testes (teste) values ('Cadastro de proprietário');

  begin
    insert into public.proprietarios (nome, cpf_cnpj) values ('TESTE Outro', '11144477735');
    raise exception 'FALHOU: aceitou CPF sem formatação';
  exception when check_violation then
    insert into resultado_testes (teste) values ('Valida formato do CPF/CNPJ');
  end;

  begin
    insert into public.proprietarios (nome, cpf_cnpj) values ('TESTE Duplicado', '111.444.777-35');
    raise exception 'FALHOU: aceitou proprietário com CPF repetido';
  exception when unique_violation then
    insert into resultado_testes (teste) values ('Bloqueia CPF/CNPJ de proprietário repetido');
  end;

  begin
    insert into public.proprietarios (nome, uf) values ('TESTE UF', 'sp');
    raise exception 'FALHOU: aceitou UF minúscula';
  exception when check_violation then
    insert into resultado_testes (teste) values ('Valida UF');
  end;

  -- Imóvel completo + inquilino completo + locação com condições do contrato
  v_imovel := public.salvar_imovel(
    jsonb_build_object('identificacao', 'TESTE Casa 1', 'endereco', 'Rua Teste, 10 - Jardim - Campinas/SP',
      'tipo', 'casa', 'cep', '13010-000', 'logradouro', 'Rua Teste', 'numero', '10', 'complemento', '',
      'bairro', 'Jardim', 'cidade', 'Campinas', 'uf', 'SP', 'descricao', '2 quartos', 'proprietario_id', v_prop),
    null,
    jsonb_build_object('nome', 'TESTE Inquilino', 'cpf', '529.982.247-25', 'rg', '12.345.678-9', 'orgao_emissor', 'SSP/SP',
      'nacionalidade', 'brasileira', 'estado_civil', 'solteiro(a)', 'profissao', 'professora', 'email', 'teste@exemplo.invalid',
      'telefone', '(19) 99999-0000', 'data_nascimento', '1990-05-10'),
    jsonb_build_object('data_entrada', v_hoje, 'valor_aluguel', 1500, 'dia_vencimento', 10, 'prazo_meses', 30,
      'reajuste_meses', 12, 'finalidade', 'residencial', 'garantia', 'caucao', 'valor_garantia', 4500,
      'multa_atraso_percentual', 10, 'juros_atraso_percentual', 1, 'multa_rescisao_alugueis', 3,
      'foro', 'Campinas/SP', 'clausulas_adicionais', 'Proibido animais de grande porte.'));

  select * into v_im from public.imoveis where id = v_imovel;
  if v_im.bairro <> 'Jardim' or v_im.uf <> 'SP' or v_im.proprietario_id <> v_prop or v_im.complemento is not null then
    raise exception 'FALHOU: endereço/proprietário do imóvel não gravados corretamente';
  end if;
  select * into v_loc from public.locacoes where imovel_id = v_imovel;
  select * into v_inq from public.inquilinos where id = v_loc.inquilino_id;
  if v_inq.cpf <> '529.982.247-25' or v_inq.data_nascimento <> '1990-05-10' or v_inq.profissao <> 'professora' then
    raise exception 'FALHOU: dados do inquilino não gravados';
  end if;
  if v_loc.garantia <> 'caucao' or v_loc.valor_garantia <> 4500 or v_loc.prazo_meses <> 30 or v_loc.foro <> 'Campinas/SP' then
    raise exception 'FALHOU: condições do contrato não gravadas';
  end if;
  insert into resultado_testes (teste) values ('Cadastro completo (imóvel, inquilino e contrato)');

  -- Tudo ou nada: CPF inválido do inquilino não deixa imóvel pela metade
  begin
    perform public.salvar_imovel(jsonb_build_object('identificacao', 'TESTE Casa 2', 'endereco', 'Rua X, 1'), null,
      jsonb_build_object('nome', 'TESTE Inquilino 2', 'cpf', '123'),
      jsonb_build_object('data_entrada', v_hoje, 'valor_aluguel', 900, 'dia_vencimento', 5));
    raise exception 'FALHOU: aceitou CPF inválido';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.imoveis where identificacao = 'TESTE Casa 2') then
    raise exception 'FALHOU: sobrou imóvel cadastrado pela metade';
  end if;
  insert into resultado_testes (teste) values ('Cadastro completo é tudo ou nada');

  begin
    perform public.salvar_imovel(jsonb_build_object('identificacao', 'TESTE Casa 3', 'endereco', 'Rua X, 3'), null,
      jsonb_build_object('nome', 'TESTE Inquilino 3'),
      jsonb_build_object('data_entrada', v_hoje, 'valor_aluguel', 900, 'dia_vencimento', 5, 'garantia', 'cheque'));
    raise exception 'FALHOU: aceitou garantia inválida';
  exception when check_violation then null;
  end;
  insert into resultado_testes (teste) values ('Valida tipo de garantia');

  -- Locação para imóvel vago com inquilino já cadastrado
  v_imovel := public.salvar_imovel(jsonb_build_object('identificacao', 'TESTE Sala 4', 'endereco', 'Rua X, 4'), null, null, null);
  perform public.salvar_locacao(v_imovel, v_inq.id, null,
    jsonb_build_object('data_entrada', v_hoje, 'valor_aluguel', 800, 'dia_vencimento', 15, 'garantia', 'fiador',
      'fiador_nome', 'TESTE Fiador', 'fiador_cpf', '111.444.777-35'));
  if not exists (select 1 from public.locacoes where imovel_id = v_imovel and fiador_nome = 'TESTE Fiador') then
    raise exception 'FALHOU: locação com fiador';
  end if;
  insert into resultado_testes (teste) values ('Locação com inquilino existente e fiador');

  -- Visão geral do dashboard
  perform public.preparar_lancamentos();
  select * into v_res from public.resumo_geral();
  if v_res.contratos_ativos <> 2 or v_res.receita_mensal_contratada <> 2300 or v_res.imoveis_ativos <> 2
     or v_res.imoveis_alugados <> 2 or v_res.imoveis_vagos <> 0 or v_res.proprietarios <> 1 then
    raise exception 'FALHOU: resumo geral incorreto: %', v_res;
  end if;
  update public.recebimentos set valor_recebido = 1500, data_pagamento = v_hoje
   where locacao_id = v_loc.id and mes_referencia = date_trunc('month', v_hoje)::date;
  select * into v_res from public.resumo_geral();
  if v_res.recebido_total <> 1500 or v_res.recebido_ano <> 1500 then
    raise exception 'FALHOU: totais recebidos incorretos: %', v_res;
  end if;
  insert into resultado_testes (teste) values ('Resumo geral do dashboard');

  select count(*) into v_qtd from public.historico_mensal(12);
  if v_qtd <> 12 then raise exception 'FALHOU: histórico deveria ter 12 meses, tem %', v_qtd; end if;
  select recebido into v_res from public.historico_mensal(12) where mes_referencia = date_trunc('month', v_hoje)::date;
  if v_res.recebido <> 1500 then raise exception 'FALHOU: histórico do mês atual incorreto'; end if;
  insert into resultado_testes (teste) values ('Histórico dos últimos 12 meses');
end $$;

-- Outro usuário
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b8","role":"authenticated"}';

do $$
declare
  v_qtd  int;
  v_prop uuid;
  v_res  record;
begin
  select count(*) into v_qtd from public.proprietarios;
  if v_qtd <> 0 then raise exception 'FALHOU: outro usuário viu proprietários'; end if;
  select * into v_res from public.resumo_geral();
  if v_res.contratos_ativos <> 0 or v_res.recebido_total <> 0 then raise exception 'FALHOU: resumo geral vazou dados'; end if;

  reset role;
  select id into v_prop from public.proprietarios where owner_id = '00000000-0000-4000-8000-0000000000a7' limit 1;
  set local role authenticated;
  begin
    perform public.salvar_imovel(jsonb_build_object('identificacao', 'Intruso', 'endereco', 'x', 'proprietario_id', v_prop), null, null, null);
    raise exception 'FALHOU: usou proprietário de outro usuário';
  exception when foreign_key_violation then null;
  end;
  insert into resultado_testes (teste) values ('RLS: proprietários e resumo por usuário');
end $$;

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  begin
    perform 1 from public.proprietarios;
    raise exception 'FALHOU: visitante leu proprietários';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.resumo_geral();
    raise exception 'FALHOU: visitante viu resumo';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('Visitante não acessa proprietários nem resumo');
end $$;

-- Limpeza
reset role;
delete from public.reajustes     where owner_id in ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000b8');
delete from public.configuracoes where owner_id in ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000b8');
delete from public.recebimentos  where owner_id in ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000b8');
delete from public.locacoes      where owner_id in ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000b8');
delete from public.inquilinos    where owner_id in ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000b8');
delete from public.imoveis       where owner_id in ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000b8');
delete from public.proprietarios where owner_id in ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000b8');
delete from auth.users           where id       in ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000b8');

select n as "#", teste, 'OK' as resultado from resultado_testes order by n;

commit;
