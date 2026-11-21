// Avisa as partes da tela (ex.: o sino de avisos) que algo mudou no banco.
const ALTERACAO = 'dados-alterados'

export function notificarAlteracao() {
  window.dispatchEvent(new Event(ALTERACAO))
}

export function aoAlterarDados(callback: () => void): () => void {
  window.addEventListener(ALTERACAO, callback)
  return () => window.removeEventListener(ALTERACAO, callback)
}
