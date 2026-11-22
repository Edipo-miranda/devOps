-- =====================================================================
-- Verificação do espaço usado (script 0009). Não cria nem apaga nada.
-- Resultado esperado: uma tabela com todas as linhas "OK".
-- =====================================================================
begin;

create temp table resultado_testes (n serial, teste text) on commit drop;
grant all on resultado_testes to authenticated, anon;
grant usage on sequence resultado_testes_n_seq to authenticated, anon;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000ef","role":"authenticated"}';
do $$
declare v record;
begin
  select * into v from public.uso_armazenamento();
  if v.meus_bytes <> 0 or v.meus_arquivos <> 0 then raise exception 'FALHOU: usuário sem arquivos deveria ter 0'; end if;
  if v.total_bytes < 0 then raise exception 'FALHOU: total inválido'; end if;
  insert into resultado_testes (teste) values ('Espaço usado: meus arquivos e total do sistema');
end $$;

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform * from public.uso_armazenamento();
    raise exception 'FALHOU: visitante viu o espaço usado';
  exception when insufficient_privilege then null;
  end;
  insert into resultado_testes (teste) values ('Visitante não vê o espaço usado');
end $$;

reset role;
select n as "#", teste, 'OK' as resultado from resultado_testes order by n;
commit;
