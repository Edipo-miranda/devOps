import { useState, type FormEvent } from 'react'
import { Campo } from './CamposLocacao'
import { supabase } from '../lib/supabase'
import { mensagemDeErro } from '../lib/erros'

/** Formulário de nova senha. Grava a senha e desmarca a obrigação de trocá-la. */
export function FormNovaSenha({ rotuloBotao, aoSalvar }: { rotuloBotao: string; aoSalvar: () => void }) {
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const novos: Record<string, string> = {}
    if (senha.length < 8) novos.senha = 'Use pelo menos 8 caracteres.'
    else if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) novos.senha = 'Use letras e números.'
    if (confirmacao !== senha) novos.confirmacao = 'As senhas não são iguais.'
    setErros(novos)
    if (Object.keys(novos).length) return

    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha, data: { trocar_senha: false } })
    setSalvando(false)
    if (error) {
      setErroGeral(/different from the old/i.test(error.message) ? 'A nova senha precisa ser diferente da atual.' : mensagemDeErro(error))
      return
    }
    setSenha('')
    setConfirmacao('')
    aoSalvar()
  }

  return (
    <form onSubmit={salvar} noValidate>
      <Campo rotulo="Nova senha" dica="mínimo 8, com letras e números" erro={erros.senha}>
        <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Campo>
      <Campo rotulo="Repita a nova senha" erro={erros.confirmacao}>
        <input type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
      </Campo>
      {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
      <button type="submit" className="botao botao--primario botao--largo" disabled={salvando}>
        {salvando ? 'Salvando…' : rotuloBotao}
      </button>
    </form>
  )
}
