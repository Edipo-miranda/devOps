-- =====================================================================
-- Controle de Aluguéis — imóvel vendido e exclusão de imóvel
-- ---------------------------------------------------------------------
-- Execute DEPOIS dos scripts 0001 a 0005, no SQL Editor do Supabase.
-- O script pode ser executado mais de uma vez sem erro.
--
-- * "Marcar como vendido": encerra a locação ativa na data da venda,
--   guarda data/valor/comprador e desativa o imóvel. O histórico fica.
-- * "Excluir imóvel": apaga o imóvel e TODA a movimentação dele
--   (locações, lançamentos, pagamentos e reajustes). Os inquilinos
--   continuam cadastrados (podem ser excluídos na aba Inquilinos).
-- =====================================================================

alter table public.imoveis add column if not exists vendido_em  date;
alter table public.imoveis add column if not exists valor_venda numeric(14,2);
alter table public.imoveis add column if not exists comprador   text;

alter table public.imoveis drop constraint if exists imoveis_venda_chk;
alter table public.imoveis add constraint imoveis_venda_chk check (
  (valor_venda is null or valor_venda > 0) and length(coalesce(comprador, '')) <= 150);

-- Imóvel vendido não pode estar ativo.
alter table public.imoveis drop constraint if exists imoveis_vendido_inativo_chk;
alter table public.imoveis add constraint imoveis_vendido_inativo_chk check (vendido_em is null or not ativo);

-- ---------------------------------------------------------------------
-- Marcar como vendido
-- ---------------------------------------------------------------------
create or replace function public.marcar_imovel_vendido(p_imovel_id uuid, p_data date, p_valor numeric, p_comprador text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_loc       uuid;
  v_removidos integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if p_data is null then
    raise exception 'Informe a data da venda.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.imoveis where id = p_imovel_id) then
    raise exception 'Imóvel não encontrado.' using errcode = 'P0001';
  end if;

  -- Encerra a locação ativa na data da venda (remove só lançamentos futuros sem pagamento).
  select id into v_loc from public.locacoes where imovel_id = p_imovel_id and situacao = 'ativa';
  if v_loc is not null then
    v_removidos := public.encerrar_locacao(v_loc, p_data);
  end if;

  update public.imoveis
     set ativo = false, vendido_em = p_data, valor_venda = p_valor,
         comprador = nullif(btrim(coalesce(p_comprador, '')), '')
   where id = p_imovel_id;

  return v_removidos;
end;
$$;

-- ---------------------------------------------------------------------
-- Excluir imóvel (com toda a movimentação)
-- ---------------------------------------------------------------------
create or replace function public.excluir_imovel(p_imovel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locacoes     uuid[];
  v_recebimentos integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.imoveis where id = p_imovel_id and owner_id = auth.uid()) then
    raise exception 'Imóvel não encontrado.' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(id), '{}') into v_locacoes
    from public.locacoes where imovel_id = p_imovel_id and owner_id = auth.uid();

  delete from public.recebimentos where locacao_id = any (v_locacoes) and owner_id = auth.uid();
  get diagnostics v_recebimentos = row_count;
  delete from public.reajustes where locacao_id = any (v_locacoes) and owner_id = auth.uid();
  delete from public.locacoes  where id = any (v_locacoes) and owner_id = auth.uid();
  delete from public.imoveis   where id = p_imovel_id and owner_id = auth.uid();

  return jsonb_build_object('locacoes', coalesce(array_length(v_locacoes, 1), 0), 'recebimentos', v_recebimentos);
end;
$$;

revoke all on function public.marcar_imovel_vendido(uuid, date, numeric, text) from public, anon;
revoke all on function public.excluir_imovel(uuid) from public, anon;
grant execute on function public.marcar_imovel_vendido(uuid, date, numeric, text) to authenticated;
grant execute on function public.excluir_imovel(uuid) to authenticated;
