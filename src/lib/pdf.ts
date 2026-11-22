// Geração e entrega de PDFs (contrato, recibo, carta de reajuste, relatórios).
import type { TDocumentDefinitions } from 'pdfmake/interfaces'

/** Gera o PDF (a biblioteca só é carregada quando necessário). */
export async function gerarPdf(doc: TDocumentDefinitions): Promise<Blob> {
  const [pdfMakeMod, vfsMod] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
  const pdfMake = (pdfMakeMod as unknown as { default?: typeof pdfMakeMod }).default ?? pdfMakeMod
  const vfs = (vfsMod as unknown as { default?: Record<string, string> }).default ?? (vfsMod as unknown as Record<string, string>)
  pdfMake.addVirtualFileSystem(vfs)
  return pdfMake.createPdf(doc).getBlob()
}

/** O aparelho permite enviar arquivos pelo menu de compartilhar (WhatsApp, e-mail...)? */
export const podeCompartilharArquivos = () => typeof navigator !== 'undefined' && 'canShare' in navigator

/**
 * Entrega o arquivo: "compartilhar" abre o menu do celular (WhatsApp, e-mail...);
 * se não for possível, ou em "baixar", faz o download.
 * Retorna false se a pessoa cancelou o compartilhamento.
 */
export async function entregarArquivo(blob: Blob, nome: string, acao: 'baixar' | 'compartilhar', texto?: string): Promise<boolean> {
  const arquivo = new File([blob], nome, { type: blob.type || 'application/octet-stream' })
  if (acao === 'compartilhar' && navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nome, text: texto })
      return true
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false
      // falhou: cai no download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}

/** Remove caracteres proibidos em nomes de arquivo. */
export const nomeArquivo = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sem acentos: alguns navegadores trocam o nome por "download"
    .replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()

/** Estilo base dos documentos (mesma fonte e margens do contrato). */
export const ESTILO_BASE: Pick<TDocumentDefinitions, 'pageSize' | 'defaultStyle' | 'styles'> = {
  pageSize: 'A4',
  defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.3 },
  styles: {
    titulo: { fontSize: 14, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
    subtitulo: { fontSize: 9.5, alignment: 'center', color: '#444', margin: [0, 0, 0, 16] },
    titulo2: { bold: true, fontSize: 10.5, margin: [0, 12, 0, 4] },
    paragrafo: { margin: [0, 0, 0, 6], alignment: 'justify' },
    tabelaCabecalho: { bold: true, fontSize: 9, color: '#333', fillColor: '#eef2f5' },
    pequeno: { fontSize: 8.5, color: '#555' },
  },
}
