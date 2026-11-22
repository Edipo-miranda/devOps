// Relatório anual para o Imposto de Renda (carnê-leão) e resultado por imóvel.
// Regime de caixa: o aluguel conta no mês em que foi PAGO (data do pagamento).
import { CATEGORIAS_DESPESA } from './despesas'
import { MESES } from './format'
import type { Coluna, SecaoPdf } from './exportar'
import type { Despesa, RecebimentoDetalhado } from '../types/database'

export interface LinhaMes {
  mes: number
  nome: string
  aluguel: number
  encargos: number
  total: number
  dedutiveis: number
  base: number // total recebido − despesas dedutíveis
}

export interface LinhaPagador {
  nome: string
  cpf: string | null
  meses: number
  total: number
}

export interface LinhaImovel {
  imovel: string
  recebido: number
  despesas: number
  lucro: number
}

export interface Relatorio {
  meses: LinhaMes[]
  pagadores: LinhaPagador[]
  imoveis: LinhaImovel[]
  recebimentos: RecebimentoDetalhado[]
  despesas: (Despesa & { imovel: string })[]
  totais: { aluguel: number; encargos: number; total: number; dedutiveis: number; base: number; despesas: number; lucro: number }
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function calcularRelatorio(
  recebimentos: RecebimentoDetalhado[],
  despesas: Despesa[],
  nomeImovel: (id: string) => string,
): Relatorio {
  const meses: LinhaMes[] = MESES.map((nome, i) => ({ mes: i + 1, nome, aluguel: 0, encargos: 0, total: 0, dedutiveis: 0, base: 0 }))
  const pagadores = new Map<string, LinhaPagador & { mesesSet: Set<number> }>()
  const imoveis = new Map<string, LinhaImovel>()
  const imovel = (id: string) => {
    if (!imoveis.has(id)) imoveis.set(id, { imovel: nomeImovel(id), recebido: 0, despesas: 0, lucro: 0 })
    return imoveis.get(id)!
  }

  for (const r of recebimentos) {
    if (!r.data_pagamento) continue
    const m = Number(r.data_pagamento.slice(5, 7)) - 1
    const total = Number(r.valor_recebido ?? 0)
    const enc = Number(r.valor_encargos ?? 0)
    meses[m].aluguel += total - enc
    meses[m].encargos += enc
    meses[m].total += total
    const chave = r.inquilino_cpf ?? r.inquilino_nome
    const p = pagadores.get(chave) ?? { nome: r.inquilino_nome, cpf: r.inquilino_cpf, meses: 0, total: 0, mesesSet: new Set<number>() }
    p.total += total
    p.mesesSet.add(m)
    pagadores.set(chave, p)
    imovel(r.imovel_id).recebido += total
  }
  for (const d of despesas) {
    const m = Number(d.data.slice(5, 7)) - 1
    if (d.dedutivel) meses[m].dedutiveis += d.valor
    imovel(d.imovel_id).despesas += d.valor
  }
  for (const m of meses) {
    m.aluguel = r2(m.aluguel); m.encargos = r2(m.encargos); m.total = r2(m.total); m.dedutiveis = r2(m.dedutiveis)
    m.base = r2(Math.max(0, m.total - m.dedutiveis))
  }
  const listaImoveis = [...imoveis.values()].map((i) => ({ ...i, recebido: r2(i.recebido), despesas: r2(i.despesas), lucro: r2(i.recebido - i.despesas) }))
    .sort((a, b) => a.imovel.localeCompare(b.imovel))
  const soma = (k: keyof LinhaMes) => r2(meses.reduce((s, m) => s + (m[k] as number), 0))
  const totalDespesas = r2(despesas.reduce((s, d) => s + d.valor, 0))

  return {
    meses,
    pagadores: [...pagadores.values()].map(({ mesesSet, ...p }) => ({ ...p, meses: mesesSet.size, total: r2(p.total) }))
      .sort((a, b) => b.total - a.total),
    imoveis: listaImoveis,
    recebimentos: recebimentos.filter((r) => r.data_pagamento),
    despesas: despesas.map((d) => ({ ...d, imovel: nomeImovel(d.imovel_id) })),
    totais: {
      aluguel: soma('aluguel'), encargos: soma('encargos'), total: soma('total'), dedutiveis: soma('dedutiveis'), base: soma('base'),
      despesas: totalDespesas, lucro: r2(soma('total') - totalDespesas),
    },
  }
}

// ----------------------------------------------------- colunas (Excel e PDF)

export const COLUNAS_MESES: Coluna<LinhaMes>[] = [
  { titulo: 'Mês', valor: (m) => m.nome, largura: 12 },
  { titulo: 'Aluguéis', valor: (m) => m.aluguel, tipo: 'moeda' },
  { titulo: 'Multa/juros', valor: (m) => m.encargos, tipo: 'moeda' },
  { titulo: 'Total recebido', valor: (m) => m.total, tipo: 'moeda' },
  { titulo: 'Despesas dedutíveis', valor: (m) => m.dedutiveis, tipo: 'moeda' },
  { titulo: 'Base (recebido − dedutíveis)', valor: (m) => m.base, tipo: 'moeda' },
]

export const COLUNAS_PAGADORES: Coluna<LinhaPagador>[] = [
  { titulo: 'Inquilino (pagador)', valor: (p) => p.nome, largura: 34 },
  { titulo: 'CPF', valor: (p) => p.cpf ?? '', largura: 16 },
  { titulo: 'Meses com pagamento', valor: (p) => p.meses, tipo: 'numero' },
  { titulo: 'Total pago no ano', valor: (p) => p.total, tipo: 'moeda' },
]

export const COLUNAS_IMOVEIS: Coluna<LinhaImovel>[] = [
  { titulo: 'Imóvel', valor: (i) => i.imovel, largura: 30 },
  { titulo: 'Recebido', valor: (i) => i.recebido, tipo: 'moeda' },
  { titulo: 'Despesas', valor: (i) => i.despesas, tipo: 'moeda' },
  { titulo: 'Lucro líquido', valor: (i) => i.lucro, tipo: 'moeda' },
]

export const COLUNAS_RECEBIMENTOS: Coluna<RecebimentoDetalhado>[] = [
  { titulo: 'Data do pagamento', valor: (r) => r.data_pagamento, tipo: 'data' },
  { titulo: 'Referência', valor: (r) => r.mes_referencia.slice(0, 7).split('-').reverse().join('/'), largura: 11 },
  { titulo: 'Inquilino', valor: (r) => r.inquilino_nome },
  { titulo: 'CPF', valor: (r) => r.inquilino_cpf ?? '', largura: 16 },
  { titulo: 'Imóvel', valor: (r) => r.imovel_identificacao },
  { titulo: 'Previsto', valor: (r) => Number(r.valor_previsto), tipo: 'moeda' },
  { titulo: 'Multa/juros', valor: (r) => Number(r.valor_encargos ?? 0), tipo: 'moeda' },
  { titulo: 'Recebido', valor: (r) => Number(r.valor_recebido ?? 0), tipo: 'moeda' },
]

export const COLUNAS_DESPESAS: Coluna<Despesa & { imovel: string }>[] = [
  { titulo: 'Data', valor: (d) => d.data, tipo: 'data' },
  { titulo: 'Imóvel', valor: (d) => d.imovel },
  { titulo: 'Categoria', valor: (d) => CATEGORIAS_DESPESA[d.categoria].rotulo },
  { titulo: 'Descrição', valor: (d) => d.descricao ?? '' },
  { titulo: 'Dedutível', valor: (d) => (d.dedutivel ? 'Sim' : 'Não'), largura: 10 },
  { titulo: 'Valor', valor: (d) => d.valor, tipo: 'moeda' },
]

/** Seções do PDF "para o contador". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function secoesRelatorio(rel: Relatorio): SecaoPdf<any>[] {
  const t = rel.totais
  return [
    {
      titulo: 'Rendimentos de aluguel mês a mês (carnê-leão)',
      texto: 'Valores pelo mês do pagamento (regime de caixa). Despesas dedutíveis conforme marcadas no cadastro — confirme com o contador.',
      colunas: COLUNAS_MESES,
      linhas: rel.meses,
      totais: ['Total', t.aluguel, t.encargos, t.total, t.dedutiveis, t.base],
    },
    { titulo: 'Pagadores (inquilinos)', colunas: COLUNAS_PAGADORES, linhas: rel.pagadores, totais: ['Total', '', '', t.total] },
    { titulo: 'Resultado por imóvel', colunas: COLUNAS_IMOVEIS, linhas: rel.imoveis, totais: ['Total', t.total, t.despesas, t.lucro] },
    { titulo: 'Despesas do ano', colunas: COLUNAS_DESPESAS, linhas: rel.despesas, totais: ['', '', '', '', 'Total', t.despesas] },
    { titulo: 'Recebimentos do ano (detalhado)', colunas: COLUNAS_RECEBIMENTOS, linhas: rel.recebimentos, totais: ['', '', '', '', '', '', 'Total', t.total] },
  ]
}
