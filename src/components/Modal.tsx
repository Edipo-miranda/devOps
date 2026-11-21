import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  titulo: string
  aoFechar: () => void
  children: ReactNode
  largo?: boolean
}

/** Janela sobreposta. Fecha com Esc ou clicando fora. */
export function Modal({ titulo, aoFechar, children, largo }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const fechar = useRef(aoFechar)
  useEffect(() => {
    fechar.current = aoFechar
  })

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar.current()
    }
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    caixa.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div ref={caixa} className={`modal__caixa ${largo ? 'modal__caixa--larga' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal__topo">
          <h2>{titulo}</h2>
          <button type="button" className="botao botao--discreto botao--icone" onClick={aoFechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
