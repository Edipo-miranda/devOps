import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { Campo, CamposContrato, CamposLocacao } from './CamposLocacao'
import { validarContrato, validarLocacao, valoresLocacaoIniciais, type ErrosLocacao, type ValoresContrato } from '../lib/validacaoLocacao'
import {
  atualizarInquilino,
  atualizarLocacao,
  encerrarLocacao,
  fimDoContrato,
  invalidarMesAtual,
  listarInquilinos,
  proximoReajuste,
  registrarLocacao,
  registrarReajuste,
  renovarContrato,
  type LocacaoComInquilino,
} from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { REGEX_DATA, REGEX_TELEFONE, adicionarMeses, formatarData, formatarMoeda, hojeBrasil, lerValor, valorParaCampo } from '../lib/format'
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
  const [contrato, setContrato] = useState<ValoresContrato>({
    prazo: locacao.prazo_meses ? String(locacao.prazo_meses) : '',
    reajuste: locacao.reajuste_meses ? String(locacao.reajuste_meses) : '',
    indice: locacao.indice_reajuste ?? '',
  })
  const [inicioContrato, setInicioContrato] = useState(locacao.data_inicio_contrato)
  const [ultimoReajuste, setUltimoReajuste] = useState(locacao.data_ultimo_reajuste ?? '')
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
    if (!REGEX_DATA.test(inicioContrato)) novos.inicioContrato = 'Informe o início do contrato atual.'
    else if (inicioContrato < dataEntrada) novos.inicioContrato = 'Não pode ser antes da data de entrada.'
    if (ultimoReajuste && ultimoReajuste < dataEntrada) novos.ultimoReajuste = 'Não pode ser antes da data de entrada.'
    const c = validarContrato(contrato)
    Object.assign(novos, c.erros)
    setErros(novos)
    if (Object.keys(novos).length) return

    setSalvando(true)
    try {
      await atualizarLocacao(locacao.id, {
        data_entrada: dataEntrada,
        valor_aluguel: v!,
        dia_vencimento: d,
        prazo_meses: c.prazo,
        data_inicio_contrato: inicioContrato,
        reajuste_meses: c.reajuste,
        indice_reajuste: c.indice,
        data_ultimo_reajuste: ultimoReajuste || null,
      })
      invalidarMesAtual()
      aoSalvar()
    } catch (err) {
      setErroGeral(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={`Editar locação — ${locacao.inquilino.nome}`} aoFechar={aoFechar} largo>
      <form onSubmit={salvar} noValidate>
        <p className="alerta alerta--info">
          O novo valor e o novo vencimento valem para os <strong>próximos lançamentos gerados</strong>.
          Lançamentos já existentes não mudam. Para reajuste, prefira o botão “Registrar reajuste”, que guarda o histórico.
        </p>
        <div className="grade-3">
          <Campo rotulo="Data de entrada" erro={erros.dataEntrada}>
            <input type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} />
          </Campo>
          <Campo rotulo="Valor atual do aluguel (R$)" erro={erros.valor}>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
          </Campo>
          <Campo rotulo="Dia de vencimento" erro={erros.dia}>
            <input type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} />
          </Campo>
        </div>
        <CamposContrato valores={contrato} erros={erros} aoMudar={setContrato} />
        <div className="grade-2">
          <Campo rotulo="Início do contrato atual" dica="muda ao renovar" erro={erros.inicioContrato}>
            <input type="date" value={inicioContrato} onChange={(e) => setInicioContrato(e.target.value)} />
          </Campo>
          <Campo rotulo="Último reajuste em" dica="vazio = nunca reajustado" erro={erros.ultimoReajuste}>
            <input type="date" value={ultimoReajuste} onChange={(e) => setUltimoReajuste(e.target.value)} />
          </Campo>
        </div>
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <Rodape salvando={salvando} aoFechar={aoFechar} />
      </form>
    </Modal>
  )
}

// -------------------------------------------------------- Registrar reajuste

export function FormReajuste({ locacao, aoFechar, aoSalvar }: { locacao: LocacaoComInquilino; aoFechar: () => void; aoSalvar: (atualizados: number) => void }) {
  const hoje = hojeBrasil()
  const previsto = proximoReajuste(locacao)
  const [data, setData] = useState(previsto && previsto <= hoje ? previsto : hoje)
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState(locacao.indice_reajuste ?? '')
  const [aplicar, setAplicar] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const atual = Number(locacao.valor_aluguel)
  const novo = lerValor(valor)
  const percentual = novo ? ((novo - atual) / atual) * 100 : null

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const novos: Record<string, string> = {}
    if (!REGEX_DATA.test(data)) novos.data = 'Informe a data do reajuste.'
    else if (data < locacao.data_entrada) novos.data = 'Não pode ser antes da data de entrada.'
    if (novo === null || novo <= 0 || novo >= 10_000_000) novos.valor = 'Informe o novo valor, por exemplo 1.650,00.'
    if (observacao.length > 300) novos.observacao = 'Máximo de 300 caracteres.'
    setErros(novos)
    if (Object.keys(novos).length) return

    setSalvando(true)
    try {
      const n = await registrarReajuste(locacao.id, {
        data,
        valor_novo: novo!,
        observacao: observacao.trim() || null,
        aplicar_em_aberto: aplicar,
      })
      invalidarMesAtual()
      aoSalvar(n)
    } catch (err) {
      setErroGeral(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={`Registrar reajuste — ${locacao.inquilino.nome}`} aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        <p className="texto-suave paragrafo">
          Valor atual: <strong>{formatarMoeda(atual)}</strong>
          {previsto && <> · reajuste previsto para <strong>{formatarData(previsto)}</strong></>}
          {locacao.indice_reajuste && <> · índice {locacao.indice_reajuste}</>}.
          O novo valor é informado por você; o app não calcula índices.
        </p>
        <div className="grade-2">
          <Campo rotulo="Data do reajuste" erro={erros.data}>
            <input type="date" value={data} min={locacao.data_entrada} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo rotulo="Novo valor do aluguel (R$)" erro={erros.valor}>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder={valorParaCampo(atual)} />
          </Campo>
        </div>
        {percentual !== null && Number.isFinite(percentual) && (
          <p className="alerta alerta--info">
            {percentual >= 0 ? 'Aumento' : 'Redução'} de {Math.abs(percentual).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
            ({formatarMoeda(Math.abs(novo! - atual))}).
          </p>
        )}
        <Campo rotulo="Observação" dica="opcional" erro={erros.observacao}>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} placeholder="Ex.: IGP-M acumulado 4,2%" />
        </Campo>
        <label className="checagem paragrafo">
          <input type="checkbox" checked={aplicar} onChange={(e) => setAplicar(e.target.checked)} />
          <span>Aplicar o novo valor também aos lançamentos já gerados e <strong>sem pagamento</strong> a partir do mês do reajuste</span>
        </label>
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <Rodape salvando={salvando} aoFechar={aoFechar} rotulo="Registrar reajuste" />
      </form>
    </Modal>
  )
}

// ----------------------------------------------------------- Renovar contrato

export function FormRenovarContrato({ locacao, aoFechar, aoSalvar }: { locacao: LocacaoComInquilino; aoFechar: () => void; aoSalvar: (texto: string) => void }) {
  const fimAtual = fimDoContrato(locacao)
  const [modo, setModo] = useState<'renovar' | 'indeterminado'>('renovar')
  const [prazo, setPrazo] = useState(String(locacao.prazo_meses ?? 12))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const prazoNum = Number(prazo)
  const prazoValido = Number.isInteger(prazoNum) && prazoNum >= 1 && prazoNum <= 240
  const novoFim = fimAtual && prazoValido ? adicionarMeses(fimAtual, prazoNum) : null

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (modo === 'renovar' && !prazoValido) return setErro('Informe o prazo de 1 a 240 meses.')
    setSalvando(true)
    try {
      await renovarContrato(locacao, modo === 'renovar' ? prazoNum : null)
      aoSalvar(modo === 'renovar' ? `Contrato renovado até ${formatarData(novoFim)}.` : 'Contrato passou a ter prazo indeterminado.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo="Renovar contrato" aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        <p className="texto-suave paragrafo">
          Contrato atual de <strong>{locacao.inquilino.nome}</strong>: {formatarData(locacao.data_inicio_contrato)} até{' '}
          <strong>{formatarData(fimAtual)}</strong>. O histórico e os recebimentos não mudam.
        </p>
        <label className="checagem paragrafo">
          <input type="radio" name="modo" checked={modo === 'renovar'} onChange={() => setModo('renovar')} />
          Renovar por um novo período
        </label>
        {modo === 'renovar' && (
          <Campo rotulo="Novo prazo (meses)">
            <input type="number" min={1} max={240} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
        )}
        {modo === 'renovar' && novoFim && (
          <p className="alerta alerta--info">Novo período: {formatarData(fimAtual)} até {formatarData(novoFim)}.</p>
        )}
        <label className="checagem paragrafo">
          <input type="radio" name="modo" checked={modo === 'indeterminado'} onChange={() => setModo('indeterminado')} />
          Continuar sem novo contrato (prazo indeterminado — para de avisar o fim do contrato)
        </label>
        {erro && <p className="alerta alerta--erro" role="alert">{erro}</p>}
        <Rodape salvando={salvando} aoFechar={aoFechar} rotulo="Confirmar" />
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
