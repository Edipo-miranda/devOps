// Multa e juros de atraso, proporcionais aos dias (pro rata die).
import { diasEntre } from './format'

export interface Encargos {
  dias: number
  multa: number
  juros: number
  total: number // multa + juros
}

const arredondar = (v: number) => Math.round(v * 100) / 100

/**
 * Multa: percentual único sobre o valor (ex.: 2%), se houver qualquer dia de atraso.
 * Juros: percentual ao mês, proporcional aos dias (ex.: 1% ao mês = 1/30% por dia).
 */
export function calcularEncargos(
  valor: number,
  vencimento: string,
  dataPagamento: string,
  multaPercentual: number | null,
  jurosPercentualMes: number | null,
): Encargos {
  const dias = Math.max(0, diasEntre(vencimento, dataPagamento))
  if (dias === 0) return { dias: 0, multa: 0, juros: 0, total: 0 }
  const multa = arredondar(valor * (Number(multaPercentual) || 0) / 100)
  const juros = arredondar(valor * ((Number(jurosPercentualMes) || 0) / 100 / 30) * dias)
  return { dias, multa, juros, total: arredondar(multa + juros) }
}
