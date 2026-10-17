import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/** Só mostra o conteúdo para quem está logado; senão, manda para o login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { sessao, carregando } = useAuth()
  const location = useLocation()

  if (carregando) return <div className="tela-carregando">Carregando…</div>
  if (!sessao) return <Navigate to="/login" replace state={{ de: location.pathname }} />
  return <>{children}</>
}
