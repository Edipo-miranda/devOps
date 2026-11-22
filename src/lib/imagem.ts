// Reduz fotos antes de enviar (economiza o espaço do plano gratuito do Supabase).

const LADO_MAXIMO = 1920 // pixels no lado maior: continua legível para documentos e vistorias
const QUALIDADE = 0.78 // JPEG

export interface ResultadoReducao {
  arquivo: File
  reduzido: boolean
  tamanhoOriginal: number
}

/** Carrega a imagem no navegador (HEIC só funciona em aparelhos que abrem esse formato, como o iPhone). */
function carregar(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem não suportada')) }
    img.src = url
  })
}

/**
 * Se for foto, diminui para no máximo 1920 px e salva em JPG.
 * PDFs, documentos do Word e imagens que o navegador não consegue abrir são enviados como estão.
 * Só usa a versão reduzida se ela realmente ficar menor.
 */
export async function reduzirImagem(arquivo: File): Promise<ResultadoReducao> {
  const original = { arquivo, reduzido: false, tamanhoOriginal: arquivo.size }
  if (!arquivo.type.startsWith('image/') || arquivo.type === 'image/gif' || arquivo.type === 'image/svg+xml') return original
  try {
    const img = await carregar(arquivo)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight))
    const largura = Math.round(img.naturalWidth * escala)
    const altura = Math.round(img.naturalHeight * escala)
    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    const ctx = canvas.getContext('2d')
    if (!ctx) return original
    ctx.fillStyle = '#fff' // PNG com fundo transparente fica branco no JPG
    ctx.fillRect(0, 0, largura, altura)
    ctx.drawImage(img, 0, 0, largura, altura)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALIDADE))
    if (!blob || blob.size >= arquivo.size) return original
    const nome = arquivo.name.replace(/\.[^.]+$/, '') + '.jpg'
    return { arquivo: new File([blob], nome, { type: 'image/jpeg' }), reduzido: true, tamanhoOriginal: arquivo.size }
  } catch {
    return original
  }
}

/** "4,2 MB", "380 KB" */
export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} GB`
}
