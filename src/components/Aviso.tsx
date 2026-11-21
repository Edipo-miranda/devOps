import { useEffect } from 'react'

export interface AvisoDados {
  tipo: 'ok' | 'erro'
  texto: string
}

/** Mensagem flutuante que some sozinha depois de alguns segundos. */
export function Aviso({ aviso, aoFechar }: { aviso: AvisoDados | null; aoFechar: () => void }) {
  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(aoFechar, aviso.tipo === 'erro' ? 8000 : 4000)
    return () => window.clearTimeout(t)
  }, [aviso, aoFechar])

  if (!aviso) return null
  return (
    <div className={`aviso aviso--${aviso.tipo}`} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
      <span>{aviso.texto}</span>
      <button className="botao botao--discreto botao--icone" onClick={aoFechar} aria-label="Fechar aviso">✕</button>
    </div>
  )
}
