import { useRef, useState } from 'react'
import { IconeCalendario } from './Icones'

/** "2026-11-05" -> "05/11/2026" */
function isoParaBr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** "05/11/2026" -> "2026-11-05", ou "" se a data não existir (ex.: 31/02). */
function brParaIso(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br)
  if (!m) return ''
  const [, d, mes, a] = m
  const data = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)))
  const valida = data.getUTCFullYear() === Number(a) && data.getUTCMonth() === Number(mes) - 1 && data.getUTCDate() === Number(d)
  return valida && Number(a) >= 1900 ? `${a}-${mes}-${d}` : ''
}

/** Coloca as barras enquanto a pessoa digita: "05112026" -> "05/11/2026". */
function mascarar(texto: string): string {
  const n = texto.replace(/\D/g, '').slice(0, 8)
  if (n.length <= 2) return n
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`
}

interface Props {
  valor: string // "AAAA-MM-DD" ou ""
  aoMudar: (iso: string) => void // recebe "" enquanto a data estiver incompleta ou inválida
  min?: string
  max?: string
}

/**
 * Campo de data sempre no formato brasileiro (dd/mm/aaaa), independente do
 * idioma do navegador. O botão de calendário abre o seletor de datas do sistema.
 */
export function CampoData({ valor, aoMudar, min, max }: Props) {
  const [texto, setTexto] = useState(isoParaBr(valor))
  const seletor = useRef<HTMLInputElement>(null)

  function digitar(novo: string) {
    const mascarado = mascarar(novo)
    setTexto(mascarado)
    aoMudar(brParaIso(mascarado))
  }

  function escolher(iso: string) {
    setTexto(isoParaBr(iso))
    aoMudar(iso)
  }

  function abrirCalendario() {
    const el = seletor.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }

  return (
    <div className={`campo-data ${texto && !brParaIso(texto) ? 'campo-data--invalida' : ''}`}>
      <input
        value={texto}
        onChange={(e) => digitar(e.target.value)}
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        autoComplete="off"
      />
      <button type="button" className="campo-data__botao" onClick={abrirCalendario} aria-label="Abrir calendário" tabIndex={-1}>
        <IconeCalendario />
      </button>
      <input
        ref={seletor}
        type="date"
        className="campo-data__seletor"
        value={brParaIso(texto)}
        min={min}
        max={max}
        onChange={(e) => escolher(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}
