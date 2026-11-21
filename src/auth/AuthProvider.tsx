import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, tipoLinkEmail } from '../lib/supabase'

interface AuthContexto {
  sessao: Session | null
  carregando: boolean
  /** true quando a pessoa precisa criar/trocar a senha antes de usar o app */
  precisaDefinirSenha: boolean
  senhaDefinida: () => void
  sair: () => Promise<void>
}

const Contexto = createContext<AuthContexto | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [veioDeLink, setVeioDeLink] = useState(tipoLinkEmail === 'invite' || tipoLinkEmail === 'recovery')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((evento, novaSessao) => {
      setSessao(novaSessao)
      if (evento === 'PASSWORD_RECOVERY') setVeioDeLink(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function sair() {
    await supabase.auth.signOut()
  }

  // Marcação feita pelo dono do sistema no Supabase (trocar_senha = true) ou link de convite/recuperação.
  const precisaDefinirSenha = Boolean(sessao) && (veioDeLink || sessao?.user.user_metadata?.trocar_senha === true)

  return (
    <Contexto.Provider value={{ sessao, carregando, precisaDefinirSenha, senhaDefinida: () => setVeioDeLink(false), sair }}>
      {children}
    </Contexto.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
