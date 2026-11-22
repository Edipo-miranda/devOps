// Todas as leituras e gravações no banco ficam aqui.
// Cada função lança o erro do Supabase; as telas convertem com mensagemDeErro().
import { supabase } from './supabase'
import { notificarAlteracao } from './eventos'
import { adicionarMeses, inicioDoMes } from './format'
import type {
  Aviso,
  CondicoesContrato,
  Configuracoes,
  Endereco,
  HistoricoMes,
  Imovel,
  Proprietario,
  ResumoGeral,
  Inquilino,
  Locacao,
  Reajuste,
  RecebimentoDetalhado,
  ResumoMes,
  SituacaoRecebimento,
} from '../types/database'

export interface LocacaoComInquilino extends Locacao {
  inquilino: Inquilino
}

export interface ImovelComLocacao extends Imovel {
  locacao_ativa: LocacaoComInquilino | null
  proprietario: Pick<Proprietario, 'id' | 'nome'> | null
}

// ---------------------------------------------------------------- Imóveis

export async function listarImoveis(): Promise<ImovelComLocacao[]> {
  const { data, error } = await supabase
    .from('imoveis')
    .select('*, locacoes(*, inquilino:inquilinos(*)), proprietario:proprietarios(id, nome)')
    .order('identificacao')
  if (error) throw error
  return (data ?? []).map((i) => {
    const { locacoes, ...imovel } = i as ImovelComLocacao & { locacoes: LocacaoComInquilino[] }
    return { ...imovel, locacao_ativa: locacoes.find((l) => l.situacao === 'ativa') ?? null }
  })
}

export interface DetalheImovel {
  imovel: Imovel
  proprietario: Proprietario | null
  locacoes: LocacaoComInquilino[]
}

export async function buscarImovel(id: string): Promise<DetalheImovel> {
  const { data, error } = await supabase
    .from('imoveis')
    .select('*, locacoes(*, inquilino:inquilinos(*)), proprietario:proprietarios(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Imóvel não encontrado.')
  const { locacoes, proprietario, ...imovel } = data as Imovel & { locacoes: LocacaoComInquilino[]; proprietario: Proprietario | null }
  locacoes.sort((a, b) => b.data_entrada.localeCompare(a.data_entrada))
  return { imovel, proprietario, locacoes }
}

export interface DadosImovel extends Endereco {
  identificacao: string
  endereco: string // linha completa, montada a partir das partes
  observacoes: string | null
  tipo: string | null
  descricao: string | null
  proprietario_id: string | null
}

/** Dados do inquilino com os nomes das colunas do banco. */
export interface DadosInquilino extends Endereco {
  nome: string
  telefone: string | null
  cpf: string | null
  rg: string | null
  orgao_emissor: string | null
  nacionalidade: string | null
  estado_civil: string | null
  profissao: string | null
  email: string | null
  data_nascimento: string | null
  genero: string | null
}

export interface DadosNovaLocacao {
  inquilino_id: string | null // inquilino já cadastrado...
  inquilino: DadosInquilino | null // ...ou novo
  locacao: {
    data_entrada: string
    valor_aluguel: number
    dia_vencimento: number
    prazo_meses: number | null
    reajuste_meses: number | null
  } & CondicoesContrato
}

export async function cadastrarImovel(imovel: DadosImovel, locacao: DadosNovaLocacao | null): Promise<string> {
  const { data, error } = await supabase.rpc('salvar_imovel', {
    p_imovel: imovel,
    p_inquilino_id: locacao?.inquilino_id ?? null,
    p_inquilino: locacao?.inquilino ?? null,
    p_locacao: locacao?.locacao ?? null,
  })
  if (error) throw error
  notificarAlteracao()
  return data as string
}

export async function atualizarImovel(id: string, dados: DadosImovel): Promise<void> {
  const { error } = await supabase.from('imoveis').update(dados).eq('id', id)
  if (error) throw error
  notificarAlteracao()
}

export async function definirImovelAtivo(id: string, ativo: boolean): Promise<void> {
  // Reativar também desfaz uma venda registrada.
  const dados = ativo ? { ativo, vendido_em: null, valor_venda: null, comprador: null } : { ativo }
  const { error } = await supabase.from('imoveis').update(dados).eq('id', id)
  if (error) throw error
  notificarAlteracao()
}

// ---------------------------------------------------- Inquilinos / locações

export async function listarInquilinos(): Promise<Inquilino[]> {
  const { data, error } = await supabase.from('inquilinos').select('*').order('nome')
  if (error) throw error
  return data ?? []
}

export async function atualizarInquilino(id: string, dados: DadosInquilino): Promise<void> {
  const { error } = await supabase.from('inquilinos').update(dados).eq('id', id)
  if (error) throw error
  notificarAlteracao()
}

export async function registrarLocacao(imovelId: string, l: DadosNovaLocacao): Promise<void> {
  const { error } = await supabase.rpc('salvar_locacao', {
    p_imovel_id: imovelId,
    p_inquilino_id: l.inquilino_id,
    p_inquilino: l.inquilino,
    p_locacao: l.locacao,
  })
  if (error) throw error
  notificarAlteracao()
}

export interface DadosEdicaoLocacao extends Partial<CondicoesContrato> {
  data_entrada: string
  valor_aluguel: number
  dia_vencimento: number
  prazo_meses: number | null
  data_inicio_contrato: string
  reajuste_meses: number | null
  data_ultimo_reajuste: string | null
}

export async function atualizarLocacao(id: string, dados: DadosEdicaoLocacao): Promise<void> {
  const { error } = await supabase.from('locacoes').update(dados).eq('id', id)
  if (error) throw error
  notificarAlteracao()
}

/** Fim do contrato atual (início + prazo), ou null se o prazo for indeterminado. */
export function fimDoContrato(l: Locacao): string | null {
  return l.prazo_meses ? adicionarMeses(l.data_inicio_contrato, l.prazo_meses) : null
}

/** Data do próximo reajuste, ou null se não houver reajuste. */
export function proximoReajuste(l: Locacao): string | null {
  return l.reajuste_meses ? adicionarMeses(l.data_ultimo_reajuste ?? l.data_entrada, l.reajuste_meses) : null
}

/**
 * Renova o contrato: o novo período começa no fim do atual.
 * Com prazo null, o contrato passa a ter prazo indeterminado (sem aviso de fim).
 */
export async function renovarContrato(l: Locacao, novoPrazo: number | null): Promise<void> {
  const dados = novoPrazo
    ? { data_inicio_contrato: fimDoContrato(l) ?? l.data_inicio_contrato, prazo_meses: novoPrazo }
    : { prazo_meses: null }
  const { error } = await supabase.from('locacoes').update(dados).eq('id', l.id)
  if (error) throw error
  notificarAlteracao()
}

/** Registra um reajuste com o valor informado. Retorna quantos lançamentos em aberto foram atualizados. */
export async function registrarReajuste(
  locacaoId: string,
  dados: { data: string; valor_novo: number; observacao: string | null; aplicar_em_aberto: boolean },
): Promise<number> {
  const { data, error } = await supabase.rpc('registrar_reajuste', {
    p_locacao_id: locacaoId,
    p_data: dados.data,
    p_valor_novo: dados.valor_novo,
    p_observacao: dados.observacao,
    p_aplicar_em_aberto: dados.aplicar_em_aberto,
  })
  if (error) throw error
  notificarAlteracao()
  return data as number
}

export async function listarReajustes(locacaoIds: string[]): Promise<Reajuste[]> {
  if (locacaoIds.length === 0) return []
  const { data, error } = await supabase
    .from('reajustes')
    .select('*')
    .in('locacao_id', locacaoIds)
    .order('data_reajuste', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Retorna quantos lançamentos futuros sem pagamento foram removidos. */
export async function encerrarLocacao(id: string, dataSaida: string): Promise<number> {
  const { data, error } = await supabase.rpc('encerrar_locacao', { p_locacao_id: id, p_data_saida: dataSaida })
  if (error) throw error
  notificarAlteracao()
  return data as number
}

// ------------------------------------------------------------ Recebimentos

/** Cria os lançamentos do mês (não duplica). Retorna quantos foram criados. */
export async function gerarRecebimentosMes(ano: number, mes: number): Promise<number> {
  const { data, error } = await supabase.rpc('gerar_recebimentos_mes', { p_ano: ano, p_mes: mes })
  if (error) throw error
  if (data) notificarAlteracao()
  return data as number
}

let mesAtualGarantido: Promise<number> | null = null

/**
 * Gera, uma vez por sessão, os lançamentos do mês atual (horário de Brasília) e,
 * perto da virada do mês, também os do mês seguinte (para os avisos de vencimento).
 */
export function garantirMesAtual(): Promise<number> {
  if (!mesAtualGarantido) {
    mesAtualGarantido = Promise.resolve(supabase.rpc('preparar_lancamentos')).then(({ data, error }) => {
      if (error) throw error
      return data as number
    }).catch((e) => {
      mesAtualGarantido = null
      throw e
    })
  }
  return mesAtualGarantido
}

/** Após cadastrar/editar locações, permite gerar o mês atual de novo. */
export function invalidarMesAtual() {
  mesAtualGarantido = null
}

export interface FiltroRecebimentos {
  ano: number | null // null = todo o histórico
  mes: number | null // null = todos os meses do ano
  situacao: SituacaoRecebimento | 'pendentes' | null // pendentes = em aberto + atrasados
  imovelId?: string
}

export async function listarRecebimentos(f: FiltroRecebimentos): Promise<RecebimentoDetalhado[]> {
  let q = supabase.from('vw_recebimentos').select('*')
  if (f.ano && f.mes) {
    q = q.eq('mes_referencia', inicioDoMes(f.ano, f.mes))
  } else if (f.ano) {
    q = q.gte('mes_referencia', inicioDoMes(f.ano, 1)).lte('mes_referencia', inicioDoMes(f.ano, 12))
  }
  if (f.situacao === 'pendentes') q = q.in('situacao', ['em_aberto', 'atrasado'])
  else if (f.situacao) q = q.eq('situacao', f.situacao)
  if (f.imovelId) q = q.eq('imovel_id', f.imovelId)
  const { data, error } = await q
    .order('mes_referencia', { ascending: false })
    .order('data_vencimento')
    .order('imovel_identificacao')
  if (error) throw error
  return (data ?? []) as RecebimentoDetalhado[]
}

export async function listarRecebimentosDoImovel(imovelId: string): Promise<RecebimentoDetalhado[]> {
  const { data, error } = await supabase
    .from('vw_recebimentos')
    .select('*')
    .eq('imovel_id', imovelId)
    .order('mes_referencia', { ascending: false })
  if (error) throw error
  return (data ?? []) as RecebimentoDetalhado[]
}

export async function registrarPagamento(
  id: string,
  dados: { valor_recebido: number; data_pagamento: string; observacao: string | null },
): Promise<void> {
  const { error } = await supabase.from('recebimentos').update(dados).eq('id', id)
  if (error) throw error
  notificarAlteracao()
}

export async function desfazerPagamento(id: string): Promise<void> {
  const { error } = await supabase
    .from('recebimentos')
    .update({ valor_recebido: null, data_pagamento: null })
    .eq('id', id)
  if (error) throw error
  notificarAlteracao()
}

export async function editarLancamento(
  id: string,
  dados: { valor_previsto: number; data_vencimento: string },
): Promise<void> {
  const { error } = await supabase.from('recebimentos').update(dados).eq('id', id)
  if (error) throw error
  notificarAlteracao()
}

// --------------------------------------------------------------- Dashboard

export async function resumoMes(ano: number, mes: number): Promise<ResumoMes> {
  const { data, error } = await supabase.rpc('resumo_mes', { p_ano: ano, p_mes: mes })
  if (error) throw error
  const linha = (data as ResumoMes[])[0]
  return {
    total_previsto: Number(linha.total_previsto),
    total_recebido: Number(linha.total_recebido),
    total_pendente: Number(linha.total_pendente),
    qtd_lancamentos: linha.qtd_lancamentos,
    qtd_pagos: linha.qtd_pagos,
    qtd_em_aberto: linha.qtd_em_aberto,
    qtd_atrasados: linha.qtd_atrasados,
  }
}

/** Atrasados de todos os meses (para o alerta do Dashboard). */
export async function contarAtrasadosGeral(): Promise<{ quantidade: number; valor: number }> {
  const { data, error } = await supabase.from('vw_recebimentos').select('valor_previsto').eq('situacao', 'atrasado')
  if (error) throw error
  const linhas = data ?? []
  return { quantidade: linhas.length, valor: linhas.reduce((s, l) => s + Number(l.valor_previsto), 0) }
}

// ------------------------------------------------------------------ Avisos

export async function listarAvisos(): Promise<Aviso[]> {
  const { data, error } = await supabase.rpc('avisos')
  if (error) throw error
  return (data ?? []) as Aviso[]
}

export async function buscarRecebimento(id: string): Promise<RecebimentoDetalhado> {
  const { data, error } = await supabase.from('vw_recebimentos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Lançamento não encontrado.')
  return data as RecebimentoDetalhado
}

export const CONFIG_PADRAO: Configuracoes = { dias_aviso_parcela: 3, dias_aviso_contrato: 60 }

export async function lerConfiguracoes(): Promise<Configuracoes> {
  const { data, error } = await supabase.from('configuracoes').select('dias_aviso_parcela, dias_aviso_contrato').maybeSingle()
  if (error) throw error
  return data ?? CONFIG_PADRAO
}

export async function salvarConfiguracoes(c: Configuracoes): Promise<void> {
  const { data: sessao } = await supabase.auth.getSession()
  const ownerId = sessao.session?.user.id
  if (!ownerId) throw new Error('Sessão expirada. Entre novamente.')
  const { error } = await supabase.from('configuracoes').upsert({ owner_id: ownerId, ...c })
  if (error) throw error
  invalidarMesAtual()
  notificarAlteracao()
}

// ----------------------------------------------------------- Proprietários

export type DadosProprietario = Omit<Proprietario, 'id' | 'owner_id' | 'ativo' | 'created_at' | 'updated_at'>

export async function listarProprietarios(): Promise<(Proprietario & { imoveis: { count: number }[] })[]> {
  const { data, error } = await supabase.from('proprietarios').select('*, imoveis(count)').order('nome')
  if (error) throw error
  return data ?? []
}

export async function salvarProprietario(id: string | null, dados: DadosProprietario): Promise<string> {
  const q = id
    ? supabase.from('proprietarios').update(dados).eq('id', id).select('id').single()
    : supabase.from('proprietarios').insert(dados).select('id').single()
  const { data, error } = await q
  if (error) throw error
  notificarAlteracao()
  return data.id as string
}

export async function definirProprietarioAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('proprietarios').update({ ativo }).eq('id', id)
  if (error) throw error
  notificarAlteracao()
}

// ------------------------------------------------------ Dashboard (geral)

export async function resumoGeral(): Promise<ResumoGeral> {
  const { data, error } = await supabase.rpc('resumo_geral')
  if (error) throw error
  const l = (data as ResumoGeral[])[0]
  const r = {} as Record<string, number>
  for (const [k, v] of Object.entries(l)) r[k] = Number(v)
  return r as unknown as ResumoGeral
}

export async function historicoMensal(meses = 12): Promise<HistoricoMes[]> {
  const { data, error } = await supabase.rpc('historico_mensal', { p_meses: meses })
  if (error) throw error
  return ((data ?? []) as HistoricoMes[]).map((h) => ({
    mes_referencia: h.mes_referencia,
    previsto: Number(h.previsto),
    recebido: Number(h.recebido),
    atrasado: Number(h.atrasado),
  }))
}

// ---------------------------------------------------------------- Exclusão

export interface MovimentacaoInquilino {
  locacoes: number
  ativas: number
  lancamentos: number
  pagos: number
  imoveis: string[]
}

/** Conta o que será apagado junto com o inquilino (para a mensagem de confirmação). */
export async function movimentacaoInquilino(id: string): Promise<MovimentacaoInquilino> {
  const [loc, rec] = await Promise.all([
    supabase.from('locacoes').select('id, situacao, imovel:imoveis(identificacao)').eq('inquilino_id', id),
    supabase.from('vw_recebimentos').select('situacao').eq('inquilino_id', id),
  ])
  if (loc.error) throw loc.error
  if (rec.error) throw rec.error
  const locacoes = (loc.data ?? []) as unknown as { situacao: string; imovel: { identificacao: string } | null }[]
  return {
    locacoes: locacoes.length,
    ativas: locacoes.filter((l) => l.situacao === 'ativa').length,
    lancamentos: rec.data?.length ?? 0,
    pagos: rec.data?.filter((r) => r.situacao === 'pago').length ?? 0,
    imoveis: [...new Set(locacoes.map((l) => l.imovel?.identificacao).filter((x): x is string => Boolean(x)))],
  }
}

/** Apaga o inquilino e toda a movimentação dele (locações, lançamentos, pagamentos e reajustes). */
export async function excluirInquilino(id: string): Promise<void> {
  const { error } = await supabase.rpc('excluir_inquilino', { p_inquilino_id: id })
  if (error) throw error
  invalidarMesAtual()
  notificarAlteracao()
}

/** Apaga o proprietário. Os imóveis dele continuam, sem proprietário. Retorna quantos imóveis foram desvinculados. */
export async function excluirProprietario(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('excluir_proprietario', { p_proprietario_id: id })
  if (error) throw error
  notificarAlteracao()
  return data as number
}

export async function listarInquilinosComLocacoes() {
  const { data, error } = await supabase
    .from('inquilinos')
    .select('*, locacoes(id, situacao, imovel:imoveis(id, identificacao))')
    .order('nome')
  if (error) throw error
  return (data ?? []) as (Inquilino & { locacoes: { id: string; situacao: string; imovel: { id: string; identificacao: string } | null }[] })[]
}

// ---------------------------------------------------------- Venda/exclusão de imóvel

/** Encerra a locação ativa na data da venda e desativa o imóvel, mantendo o histórico. */
export async function marcarImovelVendido(id: string, dados: { data: string; valor: number | null; comprador: string | null }): Promise<number> {
  const { data, error } = await supabase.rpc('marcar_imovel_vendido', {
    p_imovel_id: id,
    p_data: dados.data,
    p_valor: dados.valor,
    p_comprador: dados.comprador,
  })
  if (error) throw error
  invalidarMesAtual()
  notificarAlteracao()
  return data as number
}

/** Conta o que será apagado junto com o imóvel (para a mensagem de confirmação). */
export async function movimentacaoImovel(id: string) {
  const [loc, rec] = await Promise.all([
    supabase.from('locacoes').select('id, situacao, inquilino:inquilinos(nome)').eq('imovel_id', id),
    supabase.from('vw_recebimentos').select('situacao').eq('imovel_id', id),
  ])
  if (loc.error) throw loc.error
  if (rec.error) throw rec.error
  const locacoes = (loc.data ?? []) as unknown as { situacao: string; inquilino: { nome: string } | null }[]
  return {
    locacoes: locacoes.length,
    inquilinos: [...new Set(locacoes.map((l) => l.inquilino?.nome).filter((x): x is string => Boolean(x)))],
    lancamentos: rec.data?.length ?? 0,
    pagos: rec.data?.filter((r) => r.situacao === 'pago').length ?? 0,
  }
}

/** Apaga o imóvel e toda a movimentação dele. Os inquilinos continuam cadastrados. */
export async function excluirImovel(id: string): Promise<void> {
  const { error } = await supabase.rpc('excluir_imovel', { p_imovel_id: id })
  if (error) throw error
  invalidarMesAtual()
  notificarAlteracao()
}
