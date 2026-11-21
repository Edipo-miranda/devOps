import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/** Só mostra o conteúdo para quem está logado; senão, manda para o login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { sessao, carregando, precisaDefinirSenha, verificandoSenha } = useAuth()
  const location = useLocation()

  if (carregando) return <div className="tela-carregando">Carregando…</div>
  if (!sessao) return <Navigate to="/login" replace state={{ de: location.pathname }} />
  if (verificandoSenha) return <div className="tela-carregando">Carregando…</div>
  if (precisaDefinirSenha) return <Navigate to="/definir-senha" replace />
  return <>{children}</>
}
