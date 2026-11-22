// Variação acumulada de índices de reajuste (IPCA, IGP-M, INPC) com dados do Banco Central.
import { MESES } from './format'

export interface VariacaoMensal {
  mes: string // "AAAA-MM"
  variacao: number // % no mês
}

export interface ResultadoIndice {
  meses: VariacaoMensal[] // meses usados, do mais antigo ao mais recente
  acumulado: number // % acumulado no período
  periodo: string // "outubro/2025 a setembro/2026"
}

export const INDICES_AUTOMATICOS = ['IPCA', 'IGP-M', 'INPC']

const SERIES: Record<string, number> = { IPCA: 433, 'IGP-M': 189, INPC: 188 }

/** Busca as variações mensais: primeiro pela função do próprio site; se falhar, direto no Banco Central. */
async function buscarVariacoes(indice: string): Promise<VariacaoMensal[]> {
  try {
    const r = await fetch(`/api/indice?indice=${encodeURIComponent(indice)}`)
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return (await r.json()) as VariacaoMensal[]
  } catch {
    // segue para a consulta direta
  }
  const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIES[indice]}/dados/ultimos/36?formato=json`)
  if (!r.ok) throw new Error('Banco Central indisponível')
  const dados = (await r.json()) as { data: string; valor: string }[]
  return dados.map((d) => {
    const [, m, a] = d.data.split('/')
    return { mes: `${a}-${m}`, variacao: Number(String(d.valor).replace(',', '.')) }
  })
}

const nomeMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1].toLowerCase()}/${a}`
}

/**
 * Acumula os últimos `quantidade` meses já publicados ANTES do mês do reajuste
 * (os índices saem com atraso; usa-se o último período disponível).
 */
export function acumular(variacoes: VariacaoMensal[], dataReajuste: string, quantidade: number): ResultadoIndice | null {
  const limite = dataReajuste.slice(0, 7)
  const disponiveis = variacoes.filter((v) => v.mes < limite).sort((a, b) => a.mes.localeCompare(b.mes))
  const meses = disponiveis.slice(-quantidade)
  if (meses.length < quantidade) return null
  const fator = meses.reduce((f, v) => f * (1 + v.variacao / 100), 1)
  return {
    meses,
    acumulado: Math.round((fator - 1) * 10000) / 100,
    periodo: `${nomeMes(meses[0].mes)} a ${nomeMes(meses[meses.length - 1].mes)}`,
  }
}

export async function variacaoAcumulada(indice: string, dataReajuste: string, quantidade = 12): Promise<ResultadoIndice | null> {
  if (!INDICES_AUTOMATICOS.includes(indice)) return null
  return acumular(await buscarVariacoes(indice), dataReajuste, quantidade)
}
