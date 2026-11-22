import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Campo } from '../components/CamposLocacao'
import { FormNovaSenha } from '../components/FormNovaSenha'
import { useAuth } from '../auth/AuthProvider'
import { CONFIG_PADRAO, lerConfiguracoes, salvarConfiguracoes } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { useCarregar } from '../lib/useCarregar'
import type { Configuracoes } from '../types/database'

export function ConfiguracoesPage() {
  const { dados, erro } = useCarregar(lerConfiguracoes, [])
  const { sessao } = useAuth()
  const [senhaOk, setSenhaOk] = useState(false)
  return (
    <section>

      <div className="cabecalho-pagina">
        <div>
          <h1>Configurações</h1>
          <p className="texto-suave">Antecedência dos avisos e dados da sua conta.</p>
        </div>
      </div>
      {erro && <p className="alerta alerta--erro">{erro}</p>}
      {dados && <FormConfiguracoes inicial={dados} />}

      <h2 className="titulo-secao">Minha conta</h2>
      <div className="cartao cartao--estreito">
        <p className="texto-suave paragrafo">Entrando como <strong>{sessao?.user.email}</strong>.</p>
        <h3 className="paragrafo">Alterar minha senha</h3>
        {senhaOk && <p className="alerta alerta--ok" role="status">Senha alterada.</p>}
        <FormNovaSenha rotuloBotao="Alterar senha" aoSalvar={() => setSenhaOk(true)} />
      </div>
      <p className="rodape-secao"><Link to="/verificacao">Verificar conexão com o banco →</Link></p>
    </section>
  )
}

function FormConfiguracoes({ inicial }: { inicial: Configuracoes }) {
  const [parcela, setParcela] = useState(String(inicial.dias_aviso_parcela))
  const [contrato, setContrato] = useState(String(inicial.dias_aviso_contrato))
  const [cobrar, setCobrar] = useState(inicial.cobrar_encargos)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setMensagem(null)
    const p = Number(parcela)
    const c = Number(contrato)
    const novos: Record<string, string> = {}
    if (!Number.isInteger(p) || p < 0 || p > 31) novos.parcela = 'Informe de 0 a 31 dias.'
    if (!Number.isInteger(c) || c < 0 || c > 365) novos.contrato = 'Informe de 0 a 365 dias.'
    setErros(novos)
    if (Object.keys(novos).length) return
    setSalvando(true)
    try {
      await salvarConfiguracoes({ dias_aviso_parcela: p, dias_aviso_contrato: c, cobrar_encargos: cobrar })
      setMensagem({ tipo: 'ok', texto: 'Configurações salvas.' })
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(err) })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="cartao cartao--estreito" onSubmit={salvar} noValidate>
      <Campo rotulo="Avisar parcelas quantos dias antes do vencimento?" dica={`padrão ${CONFIG_PADRAO.dias_aviso_parcela}`} erro={erros.parcela}>
        <input type="number" min={0} max={31} value={parcela} onChange={(e) => setParcela(e.target.value)} />
      </Campo>
      <p className="texto-suave texto-pequeno paragrafo">Parcelas atrasadas são avisadas sempre, até o pagamento ser registrado. Use 0 para avisar só no dia.</p>
      <Campo rotulo="Avisar fim de contrato e reajuste quantos dias antes?" dica={`padrão ${CONFIG_PADRAO.dias_aviso_contrato}`} erro={erros.contrato}>
        <input type="number" min={0} max={365} value={contrato} onChange={(e) => setContrato(e.target.value)} />
      </Campo>
      <p className="subtitulo-form">Atrasos</p>
      <label className="checagem paragrafo">
        <input type="checkbox" checked={cobrar} onChange={(e) => setCobrar(e.target.checked)} />
        <span>
          <strong>Calcular multa e juros nos atrasos</strong>, proporcionais aos dias de atraso, conforme os percentuais de cada contrato.
          Ao registrar um pagamento atrasado, você ainda pode escolher não cobrar naquele caso.
        </span>
      </label>
      {mensagem && <p className={`alerta alerta--${mensagem.tipo}`} role="status">{mensagem.texto}</p>}
      <div className="acoes-form">
        <button type="submit" className="botao botao--primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  )
}
