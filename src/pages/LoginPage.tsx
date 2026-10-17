import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { mensagemDeErro } from '../lib/erros'

export function LoginPage() {
  const { sessao } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const destino = (location.state as { de?: string } | null)?.de ?? '/'
  if (sessao) return <Navigate to={destino} replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Informe um e-mail válido.')
    if (senha.length < 6) return setErro('A senha deve ter pelo menos 6 caracteres.')

    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) setErro(mensagemDeErro(error))
  }

  return (
    <div className="login">
      <form className="login__cartao" onSubmit={entrar} noValidate>
        <h1 className="login__titulo">Controle de Aluguéis</h1>
        <p className="texto-suave">Entre com o usuário cadastrado no Supabase.</p>

        <label className="campo">
          <span>E-mail</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>

        {erro && <p className="alerta alerta--erro" role="alert">{erro}</p>}

        <button className="botao botao--primario botao--largo" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
