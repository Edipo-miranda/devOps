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
  const [info, setInfo] = useState<string | null>(null)

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

  async function esqueciSenha() {
    setErro(null)
    setInfo(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Digite seu e-mail no campo acima e clique de novo em “Esqueci minha senha”.')
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    setEnviando(false)
    if (error) setErro(mensagemDeErro(error))
    else setInfo('Se esse e-mail estiver cadastrado, você vai receber um link para criar uma nova senha. Veja também a caixa de spam.')
  }

  return (
    <div className="login">
      <div className="login__painel">
        <span className="marca__logo marca__logo--grande" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z" fill="currentColor" /></svg>
        </span>
        <h2>Seus aluguéis organizados em um só lugar.</h2>
        <ul>
          <li>Recebimentos de cada mês, sem planilhas</li>
          <li>Avisos de vencimento, fim de contrato e reajuste</li>
          <li>Histórico completo de inquilinos e pagamentos</li>
        </ul>
      </div>
      <form className="login__cartao" onSubmit={entrar} noValidate>
        <h1 className="login__titulo">Entrar</h1>
        <p className="texto-suave">Entre com seu e-mail e senha.</p>

        <label className="campo">
          <span>E-mail</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>

        {erro && <p className="alerta alerta--erro" role="alert">{erro}</p>}
        {info && <p className="alerta alerta--ok" role="status">{info}</p>}

        <button className="botao botao--primario botao--largo" type="submit" disabled={enviando}>
          {enviando ? 'Aguarde…' : 'Entrar'}
        </button>
        <p className="rodape-secao" style={{ textAlign: 'center' }}>
          <button type="button" className="botao botao--discreto botao--pequeno" onClick={esqueciSenha} disabled={enviando}>
            Esqueci minha senha
          </button>
        </p>
      </form>
    </div>
  )
}
