import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { Campo, CamposLocacao } from './CamposLocacao'
import { validarLocacao, valoresLocacaoIniciais, type ErrosLocacao } from '../lib/validacaoLocacao'
import {
  atualizarInquilino,
  atualizarLocacao,
  encerrarLocacao,
  invalidarMesAtual,
  listarInquilinos,
  registrarLocacao,
  type LocacaoComInquilino,
} from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { REGEX_DATA, REGEX_TELEFONE, formatarData, hojeBrasil, lerValor, valorParaCampo } from '../lib/format'
import type { Inquilino } from '../types/database'

function Rodape({ salvando, aoFechar, rotulo = 'Salvar' }: { salvando: boolean; aoFechar: () => void; rotulo?: string }) {
  return (
    <div className="acoes-form">
      <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
      <button type="submit" className="botao botao--primario" disabled={salvando}>
        {salvando ? 'Salvando…' : rotulo}
      </button>
    </div>
  )
}

// ------------------------------------------------------------- Nova locação

export function FormNovaLocacao({ imovelId, aoFechar, aoSalvar }: { imovelId: string; aoFechar: () => void; aoSalvar: () => void }) {
  const [valores, setValores] = useState(valoresLocacaoIniciais)
  const [erros, setErros] = useState<ErrosLocacao>({})
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([])
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    listarInquilinos().then(setInquilinos).catch(() => setInquilinos([]))
  }, [])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const { erros, dados } = validarLocacao(valores)
    setErros(erros)
    if (!dados) return
    setSalvando(true)
    try {
      await registrarLocacao(imovelId, dados)
      invalidarMesAtual()
      aoSalvar()
    } catch (err) {
      setErroGeral(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo="Nova locação" aoFechar={aoFechar} largo>
      <form onSubmit={salvar} noValidate>
        <CamposLocacao valores={valores} erros={erros} inquilinos={inquilinos} aoMudar={setValores} />
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <Rodape salvando={salvando} aoFechar={aoFechar} />
      </form>
    </Modal>
  )
}

// ----------------------------------------------------------- Editar locação

export function FormEditarLocacao({ locacao, aoFechar, aoSalvar }: { locacao: LocacaoComInquilino; aoFechar: () => void; aoSalvar: () => void }) {
  const [dataEntrada, setDataEntrada] = useState(locacao.data_entrada)
  const [valor, setValor] = useState(valorParaCampo(locacao.valor_aluguel))
  const [dia, setDia] = useState(String(locacao.dia_vencimento))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const novos: Record<string, string> = {}
    const v = lerValor(valor)
    const d = Number(dia)
    if (!REGEX_DATA.test(dataEntrada)) novos.dataEntrada = 'Informe a data de entrada.'
    if (v === null || v <= 0 || v >= 10_000_000) novos.valor = 'Informe um valor válido, por exemplo 1.500,00.'
    if (!Number.isInteger(d) || d < 1 || d > 31) novos.dia = 'Informe um dia entre 1 e 31.'
    setErros(novos)
    if (Object.keys(novos).length) return

    setSalvando(true)
    try {
      await atualizarLocacao(locacao.id, { data_entrada: dataEntrada, valor_aluguel: v!, dia_vencimento: d })
      invalidarMesAtual()
      aoSalvar()
    } catch (err) {
      setErroGeral(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={`Editar locação — ${locacao.inquilino.nome}`} aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        <p className="alerta alerta--info">
          O novo valor e o novo vencimento valem para os <strong>próximos lançamentos gerados</strong>.
          Lançamentos já existentes não mudam. Para corrigir um mês específico, use “Editar” na tela de Recebimentos.
        </p>
        <Campo rotulo="Data de entrada" erro={erros.dataEntrada}>
          <input type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} />
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Valor atual do aluguel (R$)" erro={erros.valor}>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
          </Campo>
          <Campo rotulo="Dia de vencimento" erro={erros.dia}>
            <input type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} />
          </Campo>
        </div>
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <Rodape salvando={salvando} aoFechar={aoFechar} />
      </form>
    </Modal>
  )
}

// --------------------------------------------------------- Encerrar locação

export function FormEncerrarLocacao({ locacao, aoFechar, aoSalvar }: { locacao: LocacaoComInquilino; aoFechar: () => void; aoSalvar: (removidos: number) => void }) {
  const [dataSaida, setDataSaida] = useState(hojeBrasil())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!REGEX_DATA.test(dataSaida)) return setErro('Informe a data de saída.')
    if (dataSaida < locacao.data_entrada) {
      return setErro(`A saída não pode ser antes da entrada (${formatarData(locacao.data_entrada)}).`)
    }
    setSalvando(true)
    try {
      const removidos = await encerrarLocacao(locacao.id, dataSaida)
      invalidarMesAtual()
      aoSalvar(removidos)
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo="Encerrar locação" aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        <p className="texto-suave paragrafo">
          Registra a saída de <strong>{locacao.inquilino.nome}</strong>. O histórico e todos os pagamentos ficam guardados.
          Lançamentos <strong>sem pagamento</strong> de meses posteriores ao mês da saída serão removidos.
        </p>
        <Campo rotulo="Data de saída">
          <input type="date" value={dataSaida} min={locacao.data_entrada} onChange={(e) => setDataSaida(e.target.value)} />
        </Campo>
        {erro && <p className="alerta alerta--erro" role="alert">{erro}</p>}
        <Rodape salvando={salvando} aoFechar={aoFechar} rotulo="Encerrar locação" />
      </form>
    </Modal>
  )
}

// --------------------------------------------------------- Editar inquilino

export function FormEditarInquilino({ inquilino, aoFechar, aoSalvar }: { inquilino: Inquilino; aoFechar: () => void; aoSalvar: () => void }) {
  const [nome, setNome] = useState(inquilino.nome)
  const [telefone, setTelefone] = useState(inquilino.telefone ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const novos: Record<string, string> = {}
    if (nome.trim().length < 2) novos.nome = 'Informe o nome (mínimo 2 letras).'
    if (telefone.trim() && !REGEX_TELEFONE.test(telefone.trim())) novos.telefone = 'Telefone inválido.'
    setErros(novos)
    if (Object.keys(novos).length) return
    setSalvando(true)
    try {
      await atualizarInquilino(inquilino.id, nome.trim(), telefone.trim() || null)
      aoSalvar()
    } catch (err) {
      setErroGeral(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo="Editar inquilino" aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        <Campo rotulo="Nome" erro={erros.nome}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={150} />
        </Campo>
        <Campo rotulo="Telefone" dica="opcional" erro={erros.telefone}>
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" maxLength={20} />
        </Campo>
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <Rodape salvando={salvando} aoFechar={aoFechar} />
      </form>
    </Modal>
  )
}
