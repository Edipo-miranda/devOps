// Ícones simples em SVG (traço), sem biblioteca externa.
import type { ReactNode } from 'react'

function Icone({ children, tamanho = 20 }: { children: ReactNode; tamanho?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

type P = { tamanho?: number }

export const IconePainel = (p: P) => (
  <Icone {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Icone>
)
export const IconePredio = (p: P) => (
  <Icone {...p}><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h2a2 2 0 0 1 2 2v10" /><path d="M2 21h20" /><path d="M8 7h4M8 11h4M8 15h4" /></Icone>
)
export const IconeCarteira = (p: P) => (
  <Icone {...p}><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="M21 11h-5a2 2 0 0 0 0 4h5v-4Z" /></Icone>
)
export const IconeSino = (p: P) => (
  <Icone {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Icone>
)
export const IconeEngrenagem = (p: P) => (
  <Icone {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></Icone>
)
export const IconeSair = (p: P) => (
  <Icone {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icone>
)
export const IconeCalendario = (p: P) => (
  <Icone tamanho={18} {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Icone>
)
export const IconeAlvo = (p: P) => (
  <Icone {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Icone>
)
export const IconeCheck = (p: P) => (
  <Icone {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 5-5" /></Icone>
)
export const IconeRelogio = (p: P) => (
  <Icone {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icone>
)
export const IconeAlerta = (p: P) => (
  <Icone {...p}><path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></Icone>
)
export const IconeEscudo = (p: P) => (
  <Icone {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></Icone>
)
