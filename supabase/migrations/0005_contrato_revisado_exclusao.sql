-- =====================================================================
-- Controle de Aluguéis — contrato revisado e exclusão de cadastros
-- ---------------------------------------------------------------------
-- Execute DEPOIS dos scripts 0001 a 0004, no SQL Editor do Supabase.
-- O script pode ser executado mais de uma vez sem erro.
--
-- O que este script adiciona:
--   * Índice de reajuste da locação (IPCA, IGP-M, INPC, IVAR ou valor
--     definido pelo proprietário) — usado no texto do contrato.
--   * Quem paga o IPTU (proprietário ou inquilino).
--   * Gênero do inquilino/proprietário, para o contrato sair com a
--     concordância certa (brasileiro/brasileira, casado/casada...).
--   * Funções para EXCLUIR inquilino (com toda a movimentação dele) e
--     proprietário (os imóveis ficam, apenas sem proprietário).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novos campos
-- ---------------------------------------------------------------------
alter table public.locacoes add column if not exists indice_reajuste text not null default 'IPCA';
alter table public.locacoes add column if not exists iptu_por_conta  text not null default 'locador';

alter table public.locacoes drop constraint if exists locacoes_indice_chk;
alter table public.locacoes add constraint locacoes_indice_chk
  check (indice_reajuste in ('IPCA', 'IGP-M', 'INPC', 'IVAR', 'proprietario'));
alter table public.locacoes drop constraint if exists locacoes_iptu_chk;
alter table public.locacoes add constraint locacoes_iptu_chk check (iptu_por_conta in ('locador', 'locatario'));

alter table public.inquilinos    add column if not exists genero text;
alter table public.proprietarios add column if not exists genero text;
alter table public.inquilinos    drop constraint if exists inquilinos_genero_chk;
alter table public.inquilinos    add constraint inquilinos_genero_chk check (genero is null or genero in ('masculino', 'feminino'));
alter table public.proprietarios drop constraint if exists proprietarios_genero_chk;
alter table public.proprietarios add constraint proprietarios_genero_chk check (genero is null or genero in ('masculino', 'feminino'));

-- O texto padrão antigo de encargos citava o IPTU, que agora tem campo próprio.
update public.locacoes
   set encargos_locatario = 'água, energia elétrica, gás, internet e outros serviços que contratar ou utilizar'
 where encargos_locatario = 'consumo de água, energia elétrica e gás, taxas condominiais ordinárias e IPTU proporcional ao período da locação';

-- ---------------------------------------------------------------------
-- 2. salvar_locacao com os novos campos (substitui a versão do 0004)
-- ---------------------------------------------------------------------
create or replace function public.salvar_locacao(p_imovel_id uuid, p_inquilino_id uuid, p_inquilino jsonb, p_locacao jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inquilino uuid := p_inquilino_id;
  v_entrada   date := (p_locacao ->> 'data_entrada')::date;
  v_locacao   uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if v_entrada is null then
    raise exception 'Informe a data de entrada.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.imoveis where id = p_imovel_id) then
    raise exception 'Imóvel não encontrado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.locacoes where imovel_id = p_imovel_id and situacao = 'ativa') then
    raise exception 'Este imóvel já tem uma locação ativa. Encerre-a antes de cadastrar um novo inquilino.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.locacoes where imovel_id = p_imovel_id and data_saida > v_entrada) then
    raise exception 'A data de entrada é anterior à saída do inquilino anterior deste imóvel.' using errcode = 'P0001';
  end if;

  if v_inquilino is null then
    insert into public.inquilinos (nome, telefone, cpf, rg, orgao_emissor, nacionalidade, estado_civil, profissao, email,
                                   data_nascimento, genero, cep, logradouro, numero, complemento, bairro, cidade, uf)
    values (public.txt(p_inquilino, 'nome'), public.txt(p_inquilino, 'telefone'), public.txt(p_inquilino, 'cpf'),
            public.txt(p_inquilino, 'rg'), public.txt(p_inquilino, 'orgao_emissor'), public.txt(p_inquilino, 'nacionalidade'),
            public.txt(p_inquilino, 'estado_civil'), public.txt(p_inquilino, 'profissao'), public.txt(p_inquilino, 'email'),
            public.txt(p_inquilino, 'data_nascimento')::date, public.txt(p_inquilino, 'genero'),
            public.txt(p_inquilino, 'cep'), public.txt(p_inquilino, 'logradouro'), public.txt(p_inquilino, 'numero'),
            public.txt(p_inquilino, 'complemento'), public.txt(p_inquilino, 'bairro'), public.txt(p_inquilino, 'cidade'),
            public.txt(p_inquilino, 'uf'))
    returning id into v_inquilino;
  elsif not exists (select 1 from public.inquilinos where id = v_inquilino) then
    raise exception 'Inquilino não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.locacoes (
    imovel_id, inquilino_id, data_entrada, valor_aluguel, dia_vencimento, prazo_meses, reajuste_meses,
    finalidade, garantia, valor_garantia, fiador_nome, fiador_cpf, fiador_qualificacao,
    multa_atraso_percentual, juros_atraso_percentual, multa_rescisao_alugueis, encargos_locatario, foro, clausulas_adicionais,
    indice_reajuste, iptu_por_conta)
  values (
    p_imovel_id, v_inquilino, v_entrada, (p_locacao ->> 'valor_aluguel')::numeric, (p_locacao ->> 'dia_vencimento')::int,
    (public.txt(p_locacao, 'prazo_meses'))::int, (public.txt(p_locacao, 'reajuste_meses'))::int,
    coalesce(public.txt(p_locacao, 'finalidade'), 'residencial'), coalesce(public.txt(p_locacao, 'garantia'), 'nenhuma'),
    (public.txt(p_locacao, 'valor_garantia'))::numeric, public.txt(p_locacao, 'fiador_nome'), public.txt(p_locacao, 'fiador_cpf'),
    public.txt(p_locacao, 'fiador_qualificacao'), (public.txt(p_locacao, 'multa_atraso_percentual'))::numeric,
    (public.txt(p_locacao, 'juros_atraso_percentual'))::numeric, (public.txt(p_locacao, 'multa_rescisao_alugueis'))::numeric,
    public.txt(p_locacao, 'encargos_locatario'), public.txt(p_locacao, 'foro'), public.txt(p_locacao, 'clausulas_adicionais'),
    coalesce(public.txt(p_locacao, 'indice_reajuste'), 'IPCA'), coalesce(public.txt(p_locacao, 'iptu_por_conta'), 'locador'))
  returning id into v_locacao;

  return v_locacao;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Exclusão de inquilino: apaga o inquilino e TODA a movimentação dele
--    (locações, lançamentos/pagamentos e reajustes). Não tem volta.
--    Roda com privilégio elevado só para poder apagar; o dono é conferido.
-- ---------------------------------------------------------------------
create or replace function public.excluir_inquilino(p_inquilino_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locacoes     uuid[];
  v_recebimentos integer;
  v_reajustes    integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.inquilinos where id = p_inquilino_id and owner_id = auth.uid()) then
    raise exception 'Inquilino não encontrado.' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(id), '{}') into v_locacoes
    from public.locacoes where inquilino_id = p_inquilino_id and owner_id = auth.uid();

  delete from public.recebimentos where locacao_id = any (v_locacoes) and owner_id = auth.uid();
  get diagnostics v_recebimentos = row_count;
  delete from public.reajustes where locacao_id = any (v_locacoes) and owner_id = auth.uid();
  get diagnostics v_reajustes = row_count;
  delete from public.locacoes where id = any (v_locacoes) and owner_id = auth.uid();
  delete from public.inquilinos where id = p_inquilino_id and owner_id = auth.uid();

  return jsonb_build_object('locacoes', coalesce(array_length(v_locacoes, 1), 0),
                            'recebimentos', v_recebimentos, 'reajustes', v_reajustes);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Exclusão de proprietário: os imóveis dele NÃO são apagados,
--    apenas ficam sem proprietário (vincule outro em "Editar imóvel").
-- ---------------------------------------------------------------------
create or replace function public.excluir_proprietario(p_proprietario_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imoveis integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.proprietarios where id = p_proprietario_id and owner_id = auth.uid()) then
    raise exception 'Proprietário não encontrado.' using errcode = 'P0001';
  end if;

  update public.imoveis set proprietario_id = null
   where proprietario_id = p_proprietario_id and owner_id = auth.uid();
  get diagnostics v_imoveis = row_count;
  delete from public.proprietarios where id = p_proprietario_id and owner_id = auth.uid();
  return v_imoveis;
end;
$$;

revoke all on function public.salvar_locacao(uuid, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.excluir_inquilino(uuid) from public, anon;
revoke all on function public.excluir_proprietario(uuid) from public, anon;
grant execute on function public.salvar_locacao(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.excluir_inquilino(uuid) to authenticated;
grant execute on function public.excluir_proprietario(uuid) to authenticated;
