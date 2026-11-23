-- =====================================================================
-- Verificação do limite de documentos por usuário (script 0010)
-- ---------------------------------------------------------------------
-- Execute no SQL Editor do Supabase DEPOIS dos scripts 0001 a 0010.
-- Cria usuários e registros TEMPORÁRIOS e desfaz tudo no final.
-- Resultado esperado: uma tabela com todas as linhas "OK".
-- =====================================================================
begin;

create temp table resultado_testes (n serial, teste text) on commit drop;
grant all on resultado_testes to authenticated, anon;
grant usage on sequence resultado_testes_n_seq to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'teste-limite-1@verificacao.invalid'),
  ('00000000-0000-4000-8000-0000000000c2', 'teste-limite-2@verificacao.invalid');

-- Como administrador: limite de 1 MB para o usuário 1 e um arquivo de 0,6 MB já guardado.
do $$
begin
  if public.definir_limite_documentos('TESTE-LIMITE-1@verificacao.invalid', 1) not like '%1 MB%' then
    raise exception 'FALHOU: não definiu o limite pelo e-mail';
  end if;
  insert into storage.objects (bucket_id, name, metadata)
  values ('documentos', '00000000-0000-4000-8000-0000000000c1/i/a.pdf', '{"size": 600000}');
  insert into resultado_testes (teste) values ('Administrador define o limite pelo e-mail');
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
do $$
declare v record; v_imovel uuid;
begin
  select * into v from public.uso_armazenamento();
  if v.meu_limite <> 1048576 or v.meus_bytes <> 600000 then raise exception 'FALHOU: uso/limite errado (% de %)', v.meus_bytes, v.meu_limite; end if;
  insert into resultado_testes (teste) values ('Usuário vê o próprio uso e limite');

  -- Ainda há espaço: o envio é aceito.
  insert into storage.objects (bucket_id, name, metadata)
  values ('documentos', '00000000-0000-4000-8000-0000000000c1/i/b.pdf', '{"size": 600000}');
  insert into resultado_testes (teste) values ('Envio aceito enquanto há espaço');

  -- Agora passou de 1 MB: o registro do documento é recusado...
  v_imovel := public.salvar_imovel(jsonb_build_object('identificacao', 'TESTE Limite', 'endereco', 'Rua L, 1'), null, null, null);
  begin
    insert into public.documentos (imovel_id, tipo, nome, caminho) values (v_imovel, 'outro', 'b.pdf', '00000000-0000-4000-8000-0000000000c1/i/b.pdf');
    raise exception 'FALHOU: registrou documento acima do limite';
  exception when raise_exception then
    if sqlerrm not like '%espaço para documentos acabou%' then raise; end if;
  end;
  -- ...e novos envios também.
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('documentos', '00000000-0000-4000-8000-0000000000c1/i/c.pdf', '{"size": 10}');
    raise exception 'FALHOU: aceitou envio com o espaço esgotado';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('Envio recusado quando o espaço acaba');

  begin
    insert into public.limites_armazenamento (owner_id, limite_mb) values ('00000000-0000-4000-8000-0000000000c1', 99999);
    raise exception 'FALHOU: usuário aumentou o próprio limite';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.definir_limite_documentos('teste-limite-1@verificacao.invalid', 99999);
    raise exception 'FALHOU: usuário usou a função do administrador';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('Usuário não consegue mudar o próprio limite');
end $$;

-- Usuário 2 não tem limite próprio: vale o padrão de 100 MB e não vê o limite do outro.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}';
do $$
declare v record;
begin
  select * into v from public.uso_armazenamento();
  if v.meu_limite <> 104857600 or v.meus_bytes <> 0 then raise exception 'FALHOU: padrão de 100 MB não aplicado'; end if;
  if exists (select 1 from public.limites_armazenamento) then raise exception 'FALHOU: viu o limite de outro usuário'; end if;
  insert into storage.objects (bucket_id, name, metadata)
  values ('documentos', '00000000-0000-4000-8000-0000000000c2/i/a.pdf', '{"size": 2000000}');
  insert into resultado_testes (teste) values ('Padrão de 100 MB para quem não tem limite próprio');
end $$;

reset role;
select n as "#", teste, 'OK' as resultado from resultado_testes order by n;
rollback;
