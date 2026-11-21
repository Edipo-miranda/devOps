// Funções de formatação e datas. Datas do banco são texto "AAAA-MM-DD";
// trabalhamos com elas como texto para evitar erros de fuso horário.

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatarMoeda(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  return moeda.format(Number(valor))
}

/** "2026-11-05" -> "05/11/2026" */
export function formatarData(data: string | null | undefined): string {
  if (!data) return '—'
  const [a, m, d] = data.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** "2026-11-01" -> "Novembro/2026" */
export function formatarMesReferencia(data: string): string {
  const [a, m] = data.split('-')
  return `${MESES[Number(m) - 1]}/${a}`
}

/** Data de hoje no fuso de Brasília, no formato "AAAA-MM-DD". */
export function hojeBrasil(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Mês e ano atuais no fuso de Brasília. */
export function mesAtualBrasil(): { ano: number; mes: number } {
  const [a, m] = hojeBrasil().split('-')
  return { ano: Number(a), mes: Number(m) }
}

/** Primeiro dia do mês, no formato "AAAA-MM-01". */
export function inicioDoMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`
}

/**
 * Converte o texto digitado em número. Aceita "1.234,56", "1234,56" e "1234.56".
 * Retorna null se não for um valor válido com no máximo 2 casas decimais.
 */
export function lerValor(texto: string): number | null {
  let t = texto.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  return Number(t)
}

/** Número -> texto para preencher campos de valor (ex.: 1250.5 -> "1250,50"). */
export function valorParaCampo(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return ''
  return Number(valor).toFixed(2).replace('.', ',')
}

/**
 * Soma meses a uma data "AAAA-MM-DD", como o banco faz:
 * se o dia não existir no mês final (ex.: 31/01 + 1 mês), usa o último dia do mês.
 */
export function adicionarMeses(data: string, meses: number): string {
  const [a, m, d] = data.split('-').map(Number)
  const total = a * 12 + (m - 1) + meses
  const ano = Math.floor(total / 12)
  const mes = (total % 12) + 1
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimoDia)).padStart(2, '0')}`
}

/** Diferença em dias entre duas datas "AAAA-MM-DD" (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export const REGEX_TELEFONE = /^[0-9()+ -]{8,20}$/
export const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/
