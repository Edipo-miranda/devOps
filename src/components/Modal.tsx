import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  titulo: string
  aoFechar: () => void
  children: ReactNode
  largo?: boolean
}

// Janelas abertas (a última é a de cima): o Esc fecha só a de cima.
const pilha: symbol[] = []

/** Janela sobreposta. Fecha com Esc ou clicando fora. */
export function Modal({ titulo, aoFechar, children, largo }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const fechar = useRef(aoFechar)
  useEffect(() => {
    fechar.current = aoFechar
  })

  useEffect(() => {
    const id = Symbol('modal')
    pilha.push(id)
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && pilha[pilha.length - 1] === id) fechar.current()
    }
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    caixa.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()
    return () => {
      document.removeEventListener('keydown', tecla)
      pilha.splice(pilha.indexOf(id), 1)
      if (pilha.length === 0) document.body.style.overflow = ''
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
