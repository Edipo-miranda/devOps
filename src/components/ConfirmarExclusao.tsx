import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { mensagemDeErro } from '../lib/erros'

interface Props {
  titulo: string
  children: ReactNode // o que será apagado
  rotuloBotao?: string
  aoConfirmar: () => Promise<void>
  aoFechar: () => void
}

/** Confirmação de exclusão definitiva: exige marcar "Entendo…" antes de liberar o botão. */
export function ConfirmarExclusao({ titulo, children, rotuloBotao = 'Excluir definitivamente', aoConfirmar, aoFechar }: Props) {
  const [entendi, setEntendi] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function confirmar() {
    setErro(null)
    setExcluindo(true)
    try {
      await aoConfirmar()
    } catch (err) {
      setErro(mensagemDeErro(err))
      setExcluindo(false)
    }
  }

  return (
    <Modal titulo={titulo} aoFechar={aoFechar}>
      <div className="alerta alerta--erro alerta--exclusao">
        <strong>Tem certeza que quer excluir?</strong>
        {children}
      </div>
      <label className="checagem paragrafo">
        <input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
        <span>Entendo que a exclusão é <strong>definitiva</strong> e não pode ser desfeita.</span>
      </label>
      {erro && <p className="alerta alerta--erro" role="alert">{erro}</p>}
      <div className="acoes-form">
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="botao botao--perigo" disabled={!entendi || excluindo} onClick={confirmar}>
          {excluindo ? 'Excluindo…' : rotuloBotao}
        </button>
      </div>
    </Modal>
  )
}
