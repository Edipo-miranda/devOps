-- =====================================================================
-- Verificação de documentos anexados e modelos de contrato (script 0008)
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase DEPOIS dos scripts 0001 a 0008.
-- Cria usuários TEMPORÁRIOS, testa e apaga tudo no final.
-- Resultado esperado: uma tabela com todas as linhas "OK".
-- =====================================================================
begin;

create temp table resultado_testes (n serial, teste text) on commit drop;
grant all on resultado_testes to authenticated, anon;
grant usage on sequence resultado_testes_n_seq to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000ac', 'teste-o@verificacao.invalid'),
  ('00000000-0000-4000-8000-0000000000bd', 'teste-p@verificacao.invalid');

-- Conferência feita como administrador (a lista de pastas não é visível aos usuários).
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'documentos' and not public) then
    raise exception 'FALHOU: pasta privada "documentos" não criada no Storage';
  end if;
  insert into resultado_testes (teste) values ('Pasta privada de documentos no Storage');
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000ac","role":"authenticated"}';

do $$
declare
  v_imovel uuid;
  v_loc    uuid;
  v_inq    uuid;
  v_qtd    int;
begin
  v_imovel := public.salvar_imovel(jsonb_build_object('identificacao', 'TESTE Doc', 'endereco', 'Rua D, 1'), null,
    jsonb_build_object('nome', 'TESTE Inquilino Doc'), jsonb_build_object('data_entrada', current_date, 'valor_aluguel', 900, 'dia_vencimento', 5));
  select id, inquilino_id into v_loc, v_inq from public.locacoes where imovel_id = v_imovel;

  insert into public.documentos (imovel_id, locacao_id, tipo, nome, caminho)
  values (v_imovel, v_loc, 'contrato_assinado', 'Contrato assinado.pdf', '00000000-0000-4000-8000-0000000000ac/x/contrato.pdf');
  begin
    insert into public.documentos (imovel_id, tipo, nome, caminho) values (v_imovel, 'foto_da_praia', 'x', 'y');
    raise exception 'FALHOU: aceitou tipo de documento inválido';
  exception when check_violation then null;
  end;
  insert into resultado_testes (teste) values ('Cadastro de documento anexado');

  insert into public.modelos_contrato (nome, conteudo) values ('Comercial', '{"titulo":"CONTRATO","clausulas":[]}');
  begin
    insert into public.modelos_contrato (nome, conteudo) values ('comercial ', '{}');
    raise exception 'FALHOU: aceitou modelo com nome repetido';
  exception when unique_violation then null;
  end;
  update public.locacoes set contrato_texto = '{"titulo":"EDITADO","clausulas":[]}' where id = v_loc;
  if (select contrato_texto ->> 'titulo' from public.locacoes where id = v_loc) <> 'EDITADO' then
    raise exception 'FALHOU: texto editado do contrato não gravado';
  end if;
  insert into resultado_testes (teste) values ('Modelos de contrato e texto editado');

  perform public.excluir_inquilino(v_inq);
  select count(*) into v_qtd from public.documentos where locacao_id = v_loc;
  if v_qtd <> 0 then raise exception 'FALHOU: sobrou documento da locação excluída'; end if;
  insert into public.documentos (imovel_id, tipo, nome, caminho) values (v_imovel, 'vistoria', 'Vistoria.pdf', 'z');
  perform public.excluir_imovel(v_imovel);
  select count(*) into v_qtd from public.documentos where imovel_id = v_imovel;
  if v_qtd <> 0 then raise exception 'FALHOU: sobrou documento do imóvel excluído'; end if;
  insert into resultado_testes (teste) values ('Exclusões apagam os registros de documentos');
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000bd","role":"authenticated"}';
do $$
declare v_qtd int;
begin
  select count(*) into v_qtd from public.modelos_contrato;
  if v_qtd <> 0 then raise exception 'FALHOU: outro usuário viu modelos'; end if;
  select count(*) into v_qtd from public.documentos;
  if v_qtd <> 0 then raise exception 'FALHOU: outro usuário viu documentos'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('documentos', '00000000-0000-4000-8000-0000000000ac/invasao.pdf');
    raise exception 'FALHOU: enviou arquivo na pasta de outro usuário';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('RLS: documentos, arquivos e modelos por usuário');
end $$;

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform 1 from public.documentos;
    raise exception 'FALHOU: visitante leu documentos';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('Visitante não acessa documentos');
end $$;

-- Limpeza
reset role;
delete from public.documentos       where owner_id in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');
delete from public.modelos_contrato where owner_id in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');
delete from public.despesas         where owner_id in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');
delete from public.reajustes        where owner_id in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');
delete from public.configuracoes    where owner_id in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');
delete from public.recebimentos     where owner_id in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');
delete from public.locacoes         where owner_id in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');
delete from public.inquilinos       where owner_id in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');
delete from public.imoveis          where owner_id in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');
delete from public.proprietarios    where owner_id in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');
delete from auth.users              where id       in ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000bd');

select n as "#", teste, 'OK' as resultado from resultado_testes order by n;

commit;
