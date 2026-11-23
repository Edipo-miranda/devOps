// Todas as leituras e gravações no banco ficam aqui.
// Cada função lança o erro do Supabase; as telas convertem com mensagemDeErro().
import { supabase } from './supabase'
import { notificarAlteracao } from './eventos'
import { adicionarMeses, inicioDoMes } from './format'
import type {
  Aviso,
  CondicoesContrato,
  Configuracoes,
  ControleCaucao,
  Despesa,
  Documento,
  ModeloContrato,
  TipoDocumento,
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
  matricula: string | null
  cartorio: string | null
  inscricao_iptu: string | null
  valor_iptu_anual: number | null
  area_m2: number | null
  quartos: number | null
  banheiros: number | null
  vagas: number | null
  valor_condominio: number | null
  uc_energia: string | null
  uc_agua: string | null
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

export interface DadosEdicaoLocacao extends Partial<CondicoesContrato>, Partial<ControleCaucao> {
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
  dados: { valor_recebido: number; data_pagamento: string; observacao: string | null; valor_encargos: number | null },
): Promise<void> {
  const { error } = await supabase.from('recebimentos').update(dados).eq('id', id)
  if (error) throw error
  notificarAlteracao()
}

export async function desfazerPagamento(id: string): Promise<void> {
  const { error } = await supabase
    .from('recebimentos')
    .update({ valor_recebido: null, data_pagamento: null, valor_encargos: null })
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

export const CONFIG_PADRAO: Configuracoes = { dias_aviso_parcela: 3, dias_aviso_contrato: 60, cobrar_encargos: true }

export async function lerConfiguracoes(): Promise<Configuracoes> {
  const { data, error } = await supabase.from('configuracoes').select('dias_aviso_parcela, dias_aviso_contrato, cobrar_encargos').maybeSingle()
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
  const { data: locs } = await supabase.from('locacoes').select('id').eq('inquilino_id', id)
  await apagarArquivosDocumentos({ locacaoIds: (locs ?? []).map((l) => l.id as string) })
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
  await apagarArquivosDocumentos({ imovelId: id })
  const { error } = await supabase.rpc('excluir_imovel', { p_imovel_id: id })
  if (error) throw error
  invalidarMesAtual()
  notificarAlteracao()
}

// ----------------------------------------------------------------- Despesas

export type DadosDespesa = Pick<Despesa, 'imovel_id' | 'data' | 'categoria' | 'descricao' | 'valor' | 'dedutivel'>

export async function listarDespesas(filtro: { imovelId?: string; ano?: number; de?: string; ate?: string }): Promise<Despesa[]> {
  let q = supabase.from('despesas').select('*')
  if (filtro.imovelId) q = q.eq('imovel_id', filtro.imovelId)
  if (filtro.ano) q = q.gte('data', `${filtro.ano}-01-01`).lte('data', `${filtro.ano}-12-31`)
  if (filtro.de) q = q.gte('data', filtro.de)
  if (filtro.ate) q = q.lte('data', filtro.ate)
  const { data, error } = await q.order('data', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Despesa[]).map((d) => ({ ...d, valor: Number(d.valor) }))
}

export async function salvarDespesa(id: string | null, dados: DadosDespesa): Promise<void> {
  const { error } = id ? await supabase.from('despesas').update(dados).eq('id', id) : await supabase.from('despesas').insert(dados)
  if (error) throw error
  notificarAlteracao()
}

/** Lança várias despesas de uma vez (tudo ou nada). */
export async function salvarDespesasEmLote(itens: DadosDespesa[]): Promise<void> {
  const { error } = await supabase.from('despesas').insert(itens)
  if (error) throw error
  notificarAlteracao()
}

export async function excluirDespesa(id: string): Promise<void> {
  const { error } = await supabase.from('despesas').delete().eq('id', id)
  if (error) throw error
  notificarAlteracao()
}

/** Recebimentos PAGOS num ano, pela data do pagamento (regime de caixa, como no carnê-leão). */
export async function recebimentosPagosNoAno(ano: number): Promise<RecebimentoDetalhado[]> {
  const { data, error } = await supabase
    .from('vw_recebimentos')
    .select('*')
    .gte('data_pagamento', `${ano}-01-01`)
    .lte('data_pagamento', `${ano}-12-31`)
    .order('data_pagamento')
  if (error) throw error
  return (data ?? []) as RecebimentoDetalhado[]
}

/** Vários lançamentos pelo id (usado nos avisos para montar a cobrança). */
export async function buscarRecebimentos(ids: string[]): Promise<RecebimentoDetalhado[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('vw_recebimentos').select('*').in('id', ids)
  if (error) throw error
  return (data ?? []) as RecebimentoDetalhado[]
}

// -------------------------------------------------- Contrato editado e modelos

export async function salvarTextoContrato(locacaoId: string, conteudo: unknown | null): Promise<void> {
  const { error } = await supabase.from('locacoes').update({ contrato_texto: conteudo }).eq('id', locacaoId)
  if (error) throw error
  notificarAlteracao()
}

export async function listarModelos(): Promise<ModeloContrato[]> {
  const { data, error } = await supabase.from('modelos_contrato').select('id, nome, conteudo, updated_at').order('nome')
  if (error) throw error
  return data ?? []
}

export async function salvarModelo(id: string | null, nome: string, conteudo: unknown): Promise<void> {
  const { error } = id
    ? await supabase.from('modelos_contrato').update({ nome, conteudo }).eq('id', id)
    : await supabase.from('modelos_contrato').insert({ nome, conteudo })
  if (error) throw error
}

export async function excluirModelo(id: string): Promise<void> {
  const { error } = await supabase.from('modelos_contrato').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------- Documentos

const PASTA = 'documentos'

export async function listarDocumentos(imovelId: string): Promise<Documento[]> {
  const { data, error } = await supabase.from('documentos').select('*').eq('imovel_id', imovelId).order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Envia o arquivo para a pasta privada do usuário e registra o documento. */
export async function enviarDocumento(
  arquivo: File,
  dados: { imovel_id: string; locacao_id: string | null; tipo: TipoDocumento; nome: string; observacao: string | null },
): Promise<void> {
  const { data: sessao } = await supabase.auth.getSession()
  const uid = sessao.session?.user.id
  if (!uid) throw new Error('Sessão expirada. Entre novamente.')
  const seguro = arquivo.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
  const caminho = `${uid}/${dados.imovel_id}/${crypto.randomUUID()}-${seguro}`
  // Confere o espaço antes de enviar (o banco também recusa, script 0010).
  const uso = await usoArmazenamento().catch(() => null) // sem o script 0009, segue sem a conferência
  if (uso && uso.meus_bytes + arquivo.size > uso.meu_limite) throw new Error(mensagemEspacoEsgotado(uso, arquivo.size))
  const envio = await supabase.storage.from(PASTA).upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false })
  if (envio.error) {
    if (uso && /row-level security|violates|unauthorized|403/i.test(envio.error.message)) throw new Error(mensagemEspacoEsgotado(uso, arquivo.size))
    throw envio.error
  }
  const { error } = await supabase.from('documentos').insert({ ...dados, caminho, tamanho: arquivo.size, mime: arquivo.type || null })
  if (error) {
    await supabase.storage.from(PASTA).remove([caminho]) // não deixa arquivo órfão
    throw error
  }
}

function mensagemEspacoEsgotado(uso: UsoArmazenamento, tamanho: number): string {
  const mb = (b: number) => (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  const livre = Math.max(0, uso.meu_limite - uso.meus_bytes)
  return `Seu espaço para documentos não é suficiente: você usou ${mb(uso.meus_bytes)} MB de ${mb(uso.meu_limite)} MB `
    + `e restam ${mb(livre)} MB (este arquivo tem ${mb(tamanho)} MB). Exclua documentos antigos ou peça mais espaço ao suporte.`
}

/** Link temporário (5 minutos) para abrir/baixar um documento privado. */
export async function linkDocumento(caminho: string, baixar?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PASTA).createSignedUrl(caminho, 300, baixar ? { download: baixar } : undefined)
  if (error) throw error
  return data.signedUrl
}

export async function excluirDocumento(doc: Pick<Documento, 'id' | 'caminho'>): Promise<void> {
  const arq = await supabase.storage.from(PASTA).remove([doc.caminho])
  if (arq.error) throw arq.error
  const { error } = await supabase.from('documentos').delete().eq('id', doc.id)
  if (error) throw error
}

/** Apaga os arquivos do Storage antes de excluir imóvel/inquilino (o banco apaga os registros). */
export async function apagarArquivosDocumentos(filtro: { imovelId?: string; locacaoIds?: string[] }): Promise<void> {
  let q = supabase.from('documentos').select('caminho')
  if (filtro.imovelId) q = q.eq('imovel_id', filtro.imovelId)
  if (filtro.locacaoIds) {
    if (filtro.locacaoIds.length === 0) return
    q = q.in('locacao_id', filtro.locacaoIds)
  }
  const { data } = await q
  const caminhos = (data ?? []).map((d) => d.caminho as string)
  if (caminhos.length) await supabase.storage.from(PASTA).remove(caminhos)
}

export interface UsoArmazenamento {
  meus_bytes: number
  meus_arquivos: number
  total_bytes: number
  total_arquivos: number
  meu_limite: number // limite do usuário em bytes (padrão 100 MB, script 0010)
}

export const LIMITE_PADRAO_DOCUMENTOS = 100 * 1024 * 1024

/** Espaço ocupado pelos documentos: do usuário e do sistema inteiro (limite gratuito: 1 GB no total). */
export async function usoArmazenamento(): Promise<UsoArmazenamento> {
  const { data, error } = await supabase.rpc('uso_armazenamento')
  if (error) throw error
  const l = Array.isArray(data) ? (data[0] as UsoArmazenamento | undefined) : undefined
  if (!l) return { meus_bytes: 0, meus_arquivos: 0, total_bytes: 0, total_arquivos: 0, meu_limite: LIMITE_PADRAO_DOCUMENTOS }
  return {
    meus_bytes: Number(l.meus_bytes), meus_arquivos: Number(l.meus_arquivos),
    total_bytes: Number(l.total_bytes), total_arquivos: Number(l.total_arquivos),
    meu_limite: Number(l.meu_limite) || LIMITE_PADRAO_DOCUMENTOS,
  }
}
