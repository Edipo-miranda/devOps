// Recibo de aluguel e carta de reajuste em PDF.
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { enderecoPorExtenso, valorPorExtenso } from './documentos'
import { MESES, formatarData, formatarMesReferencia, formatarMoeda, hojeBrasil } from './format'
import { ESTILO_BASE } from './pdf'
import type { Imovel, Inquilino, Proprietario, RecebimentoDetalhado } from '../types/database'

/** "22 de novembro de 2026" */
function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1].toLowerCase()} de ${a}`
}

const linhaAssinatura = (nome: string, doc: string | null, papel: string): Content => ({
  unbreakable: true,
  margin: [0, 34, 0, 0],
  stack: [
    { text: '__________________________________________', alignment: 'center' },
    { text: nome.toUpperCase(), bold: true, alignment: 'center' },
    { text: [papel, doc ? ` — CPF/CNPJ ${doc}` : ''].join(''), alignment: 'center', style: 'pequeno' },
  ],
})

// ------------------------------------------------------------------ recibo

export interface DadosRecibo {
  recebimento: RecebimentoDetalhado
  imovel: Pick<Imovel, 'endereco' | 'cidade' | 'uf'> & Partial<Imovel>
}

/** Recibo de pagamento de aluguel (uma via, com discriminação de multa/juros). */
export function montarRecibo({ recebimento: r, imovel }: DadosRecibo): TDocumentDefinitions {
  const total = Number(r.valor_recebido ?? 0)
  const encargos = Number(r.valor_encargos ?? 0)
  const aluguel = Math.round((total - encargos) * 100) / 100
  const cidade = [imovel.cidade, imovel.uf].filter(Boolean).join('/')
  // Com as partes do endereço usa o formato do contrato; senão, a linha completa já salva.
  const endereco = imovel.logradouro ? enderecoPorExtenso(imovel) : imovel.endereco
  const numero = r.id.slice(0, 8).toUpperCase()
  const linhas: Content[][] = [
    [{ text: 'Descrição', style: 'tabelaCabecalho' }, { text: 'Valor', style: 'tabelaCabecalho', alignment: 'right' }],
    [`Aluguel — competência ${formatarMesReferencia(r.mes_referencia)} (vencimento ${formatarData(r.data_vencimento)})`, { text: formatarMoeda(aluguel), alignment: 'right' }],
  ]
  if (encargos > 0) linhas.push(['Multa e juros por atraso', { text: formatarMoeda(encargos), alignment: 'right' }])
  linhas.push([{ text: 'Total recebido', bold: true }, { text: formatarMoeda(total), bold: true, alignment: 'right' }])

  return {
    ...ESTILO_BASE,
    pageMargins: [56, 50, 56, 50],
    info: { title: `Recibo de aluguel ${formatarMesReferencia(r.mes_referencia)} - ${r.inquilino_nome}` },
    content: [
      { text: 'RECIBO DE ALUGUEL', style: 'titulo' },
      { text: `Nº ${numero} · ${formatarMoeda(total)}`, style: 'subtitulo' },
      {
        style: 'paragrafo',
        alignment: 'left',
        text: [
          'Recebi de ', { text: r.inquilino_nome.toUpperCase(), bold: true },
          r.inquilino_cpf ? `, CPF nº ${r.inquilino_cpf}` : '',
          ', a importância de ', { text: `${formatarMoeda(total)} (${valorPorExtenso(total)})`, bold: true },
          `, referente ao aluguel de ${formatarMesReferencia(r.mes_referencia).toLowerCase()} do imóvel situado à ${endereco}`,
          `, pago em ${formatarData(r.data_pagamento)}`, encargos > 0 ? ', incluídos multa e juros por atraso' : '',
          '. Pelo que dou plena e geral quitação do valor acima.',
        ],
      },
      {
        table: { widths: ['*', 110], body: linhas },
        layout: 'lightHorizontalLines',
        margin: [0, 8, 0, 8],
      },
      r.observacao ? { text: `Observação: ${r.observacao}`, style: 'pequeno', margin: [0, 0, 0, 6] } : { text: '' },
      { text: `${cidade || '__________________'}, ${dataPorExtenso(r.data_pagamento ?? hojeBrasil())}.`, margin: [0, 14, 0, 0] },
      linhaAssinatura(r.proprietario_nome ?? 'Locador', r.proprietario_cpf_cnpj, 'Locador'),
    ],
    footer: () => ({ text: 'Recibo gerado pelo Controle de Aluguéis', style: 'pequeno', alignment: 'center', margin: [0, 16, 0, 0] }),
  }
}

// --------------------------------------------------------- carta de reajuste

export interface DadosCartaReajuste {
  imovel: Imovel
  proprietario: Proprietario | null
  inquilino: Inquilino
  inicioLocacao: string
  indiceNome: string | null // "IPCA/IBGE" ou null quando o valor é definido pelo proprietário
  periodo: string | null // "outubro/2025 a setembro/2026"
  percentual: number | null
  valorAtual: number
  valorNovo: number
  dataReajuste: string
  vigencia: string // primeiro vencimento com o novo valor
}

/** Comunicação escrita do reajuste (o contrato pede aviso com 30 dias de antecedência). */
export function montarCartaReajuste(c: DadosCartaReajuste): TDocumentDefinitions {
  const cidade = [c.imovel.cidade, c.imovel.uf].filter(Boolean).join('/')
  const endereco = enderecoPorExtenso(c.imovel) || c.imovel.endereco
  const pct = c.percentual !== null ? `${c.percentual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : null
  const criterio = c.indiceNome
    ? `pela variação acumulada do ${c.indiceNome}${c.periodo ? ` no período de ${c.periodo}` : ''}${pct ? `, de ${pct}` : ''}`
    : `conforme valor definido pelo LOCADOR${pct ? ` (variação de ${pct})` : ''}`

  return {
    ...ESTILO_BASE,
    pageMargins: [60, 56, 60, 56],
    info: { title: `Comunicação de reajuste - ${c.inquilino.nome}` },
    content: [
      { text: `${cidade || '__________________'}, ${dataPorExtenso(hojeBrasil())}.`, alignment: 'right', margin: [0, 0, 0, 24] },
      { text: [{ text: 'Ao(À) Sr(a). ', bold: false }, { text: c.inquilino.nome.toUpperCase(), bold: true }] },
      { text: `Imóvel: ${endereco}`, margin: [0, 2, 0, 18] },
      { text: 'Assunto: Comunicação de reajuste do aluguel', bold: true, margin: [0, 0, 0, 14] },
      {
        style: 'paragrafo',
        text: `Conforme a cláusula de reajuste do contrato de locação do imóvel acima, iniciado em ${formatarData(c.inicioLocacao)}, ` +
          `comunicamos que o aluguel será reajustado em ${formatarData(c.dataReajuste)}, ${criterio}.`,
      },
      {
        table: {
          widths: ['*', 140],
          body: [
            [{ text: 'Valor atual do aluguel', style: 'tabelaCabecalho' }, { text: formatarMoeda(c.valorAtual), alignment: 'right' }],
            [{ text: 'Novo valor do aluguel', style: 'tabelaCabecalho' }, { text: formatarMoeda(c.valorNovo), alignment: 'right', bold: true }],
            [{ text: 'Válido a partir do vencimento de', style: 'tabelaCabecalho' }, { text: formatarData(c.vigencia), alignment: 'right' }],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 6, 0, 10],
      },
      {
        style: 'paragrafo',
        text: `O novo valor mensal será de ${formatarMoeda(c.valorNovo)} (${valorPorExtenso(c.valorNovo)}), mantidas as demais condições do contrato. ` +
          'Esta comunicação é feita por escrito, com antecedência, conforme previsto no contrato e na legislação vigente.',
      },
      { text: 'Atenciosamente,', margin: [0, 14, 0, 0] },
      linhaAssinatura(c.proprietario?.nome ?? 'Locador', c.proprietario?.cpf_cnpj ?? null, 'Locador'),
      { text: 'CIENTE DO LOCATÁRIO', bold: true, margin: [0, 34, 0, 0] },
      { text: 'Data: ____/____/________', margin: [0, 10, 0, 0] },
      linhaAssinatura(c.inquilino.nome, c.inquilino.cpf, 'Locatário'),
    ],
  }
}
