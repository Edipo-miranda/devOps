// Exportação de tabelas para Excel (.xlsx) e PDF.
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { formatarData, formatarMoeda, hojeBrasil } from './format'
import { ESTILO_BASE, entregarArquivo, gerarPdf } from './pdf'

export type TipoColuna = 'texto' | 'moeda' | 'data' | 'numero'

export interface Coluna<T> {
  titulo: string
  valor: (linha: T) => string | number | null | undefined
  tipo?: TipoColuna
  largura?: number // largura no Excel (caracteres)
}

export interface Aba<T> {
  nome: string
  colunas: Coluna<T>[]
  linhas: T[]
}

const dataExcel = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

/** Gera e baixa uma planilha .xlsx com uma ou mais abas. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportarExcel(nome: string, abas: Aba<any>[]): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const sheets = abas.map((aba) => ({
    sheet: aba.nome.slice(0, 31),
    stickyRowsCount: 1,
    columns: aba.colunas.map((c) => ({ width: c.largura ?? (c.tipo === 'texto' || !c.tipo ? 28 : 14) })),
    data: [
      aba.colunas.map((c) => ({ value: c.titulo, fontWeight: 'bold' as const, backgroundColor: '#E6F4F1' })),
      ...aba.linhas.map((l) =>
        aba.colunas.map((c) => {
          const v = c.valor(l)
          if (v === null || v === undefined || v === '') return null
          if (c.tipo === 'moeda') return { value: Number(v), type: Number, format: '#,##0.00' }
          if (c.tipo === 'numero') return { value: Number(v), type: Number }
          if (c.tipo === 'data') return { value: dataExcel(String(v)), type: Date, format: 'dd/mm/yyyy' }
          return { value: String(v), type: String }
        }),
      ),
    ],
  }))
  const blob = await writeXlsxFile(sheets).toBlob()
  await entregarArquivo(blob, nome.endsWith('.xlsx') ? nome : `${nome}.xlsx`, 'baixar')
}

/** Formata uma célula para o PDF. */
function celulaPdf<T>(c: Coluna<T>, l: T): Content {
  const v = c.valor(l)
  if (v === null || v === undefined || v === '') return { text: '—', color: '#888' }
  if (c.tipo === 'moeda') return { text: formatarMoeda(Number(v)), alignment: 'right' }
  if (c.tipo === 'numero') return { text: String(v), alignment: 'right' }
  if (c.tipo === 'data') return { text: formatarData(String(v)) }
  return { text: String(v) }
}

export interface SecaoPdf<T> {
  titulo: string
  colunas: Coluna<T>[]
  linhas: T[]
  totais?: (string | number | null)[] // linha de total (mesma ordem das colunas)
  texto?: string // parágrafo antes da tabela
}

/** Monta um PDF com uma ou mais tabelas (paisagem quando há muitas colunas). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function montarPdfTabelas(titulo: string, subtitulo: string, secoes: SecaoPdf<any>[], rodape?: string): TDocumentDefinitions {
  const maxColunas = Math.max(...secoes.map((s) => s.colunas.length))
  const content: Content[] = [
    { text: titulo, style: 'titulo' },
    { text: subtitulo, style: 'subtitulo' },
  ]
  for (const s of secoes) {
    content.push({ text: s.titulo, style: 'titulo2' })
    if (s.texto) content.push({ text: s.texto, style: 'pequeno', margin: [0, 0, 0, 6] })
    if (s.linhas.length === 0) {
      content.push({ text: 'Sem registros.', style: 'pequeno', margin: [0, 0, 0, 8] })
      continue
    }
    const corpo: Content[][] = [
      s.colunas.map((c) => ({ text: c.titulo, style: 'tabelaCabecalho', alignment: c.tipo === 'moeda' || c.tipo === 'numero' ? 'right' : 'left' })),
      ...s.linhas.map((l) => s.colunas.map((c) => celulaPdf(c, l))),
    ]
    if (s.totais) {
      corpo.push(s.totais.map((t, i) => {
        const c = s.colunas[i]
        if (t === null || t === '') return { text: '' }
        return { text: typeof t === 'number' && c.tipo === 'moeda' ? formatarMoeda(t) : String(t), bold: true, alignment: c.tipo === 'moeda' || c.tipo === 'numero' ? 'right' : 'left' }
      }))
    }
    content.push({
      table: { headerRows: 1, widths: s.colunas.map((c) => (c.tipo === 'texto' || !c.tipo ? '*' : 'auto')), body: corpo },
      layout: 'lightHorizontalLines',
      fontSize: 8.5,
      margin: [0, 0, 0, 10],
    })
  }
  if (rodape) content.push({ text: rodape, style: 'pequeno', margin: [0, 10, 0, 0] })
  return {
    ...ESTILO_BASE,
    pageOrientation: maxColunas > 6 ? 'landscape' : 'portrait',
    pageMargins: [36, 40, 36, 44],
    info: { title: titulo },
    content,
    footer: (p, total) => ({
      columns: [
        { text: `Gerado em ${formatarData(hojeBrasil())} pelo Controle de Aluguéis`, style: 'pequeno' },
        { text: `Página ${p} de ${total}`, style: 'pequeno', alignment: 'right' },
      ],
      margin: [36, 16, 36, 0],
    }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportarPdf(nome: string, titulo: string, subtitulo: string, secoes: SecaoPdf<any>[], rodape?: string) {
  const blob = await gerarPdf(montarPdfTabelas(titulo, subtitulo, secoes, rodape))
  await entregarArquivo(blob, nome.endsWith('.pdf') ? nome : `${nome}.pdf`, 'baixar')
}
