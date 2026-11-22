-- =====================================================================
-- Controle de Aluguéis — espaço usado pelos documentos
-- ---------------------------------------------------------------------
-- Execute DEPOIS do script 0008, no SQL Editor do Supabase.
-- Mostra em Configurações quanto da pasta "documentos" está ocupado:
-- pelos arquivos do usuário e pelo sistema inteiro (o limite do plano
-- gratuito, 1 GB, é compartilhado por todos os usuários do projeto).
-- Só devolve totais (tamanho e quantidade), nunca nomes de arquivos.
-- =====================================================================
create or replace function public.uso_armazenamento()
returns table (meus_bytes bigint, meus_arquivos integer, total_bytes bigint, total_arquivos integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum((o.metadata ->> 'size')::bigint) filter (where (storage.foldername(o.name))[1] = (select auth.uid())::text), 0)::bigint,
    (count(*) filter (where (storage.foldername(o.name))[1] = (select auth.uid())::text))::int,
    coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint,
    count(*)::int
  from storage.objects o
  where o.bucket_id = 'documentos' and (select auth.uid()) is not null;
$$;

revoke all on function public.uso_armazenamento() from public, anon;
grant execute on function public.uso_armazenamento() to authenticated;
