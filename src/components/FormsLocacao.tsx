import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CampoData } from './CampoData'
import { Modal } from './Modal'
import { Campo, CamposCondicoes, CamposContrato, CamposLocacao, Secao } from './CamposLocacao'
import { CamposPessoa } from './CamposPessoa'
import { INDICE_COMPLETO } from '../lib/documentos'
import { montarCartaReajuste } from '../lib/documentosPdf'
import { INDICES_AUTOMATICOS, variacaoAcumulada, type ResultadoIndice } from '../lib/indices'
import { entregarArquivo, gerarPdf, nomeArquivo, podeCompartilharArquivos } from '../lib/pdf'
import { IconeDocumento } from './Icones'
import { ExcluirInquilino } from './ExcluirInquilino'
import { pessoaForm, validarPessoa } from '../lib/formularios'
import {
  condicoesForm,
  errosComPrefixo,
  validarCondicoes,
  validarContrato,
  validarLocacao,
  valoresLocacaoIniciais,
  type ErrosLocacao,
  type ValoresContrato,
} from '../lib/validacaoLocacao'
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
import { REGEX_DATA, adicionarMeses, formatarData, formatarMoeda, hojeBrasil, lerValor, valorParaCampo } from '../lib/format'
import type { Imovel, Inquilino, Proprietario } from '../types/database'

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
  })
  const [condicoes, setCondicoes] = useState(() => condicoesForm(locacao))
  const [caucao, setCaucao] = useState({
    recebida: locacao.caucao_recebida_em ?? '',
    devolvida: locacao.caucao_devolvida_em ?? '',
    valorDevolvido: locacao.caucao_valor_devolvido ? valorParaCampo(locacao.caucao_valor_devolvido) : '',
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
    const cond = validarCondicoes(condicoes)
    for (const [k, m] of Object.entries(cond.erros)) novos['cond.' + k] = m
    const devolvido = caucao.valorDevolvido.trim() ? lerValor(caucao.valorDevolvido) : null
    if (caucao.valorDevolvido.trim() && devolvido === null) novos.caucaoValor = 'Valor inválido.'
    if (caucao.recebida && caucao.devolvida && caucao.devolvida < caucao.recebida) novos.caucaoDevolvida = 'Não pode ser antes do recebimento.'
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
        data_ultimo_reajuste: ultimoReajuste || null,
        ...cond.dados,
        caucao_recebida_em: cond.dados.garantia === 'caucao' ? caucao.recebida || null : null,
        caucao_devolvida_em: cond.dados.garantia === 'caucao' ? caucao.devolvida || null : null,
        caucao_valor_devolvido: cond.dados.garantia === 'caucao' ? devolvido : null,
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
            <CampoData valor={dataEntrada} aoMudar={setDataEntrada} />
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
            <CampoData valor={inicioContrato} aoMudar={setInicioContrato} />
          </Campo>
          <Campo rotulo="Último reajuste em" dica="vazio = nunca reajustado" erro={erros.ultimoReajuste}>
            <CampoData valor={ultimoReajuste} aoMudar={setUltimoReajuste} />
          </Campo>
        </div>
        <Secao titulo="Condições do contrato" dica="garantia, multa, foro e cláusulas" temErro={Object.keys(errosComPrefixo(erros, 'cond.')).length > 0}>
          <CamposCondicoes valores={condicoes} aoMudar={setCondicoes} erros={errosComPrefixo(erros, 'cond.')} />
          {condicoes.garantia === 'caucao' && (
            <>
              <p className="subtitulo-form">Controle da caução</p>
              <div className="grade-3">
                <Campo rotulo="Recebida em">
                  <CampoData valor={caucao.recebida} aoMudar={(v) => setCaucao({ ...caucao, recebida: v })} />
                </Campo>
                <Campo rotulo="Devolvida em" dica="na saída" erro={erros.caucaoDevolvida}>
                  <CampoData valor={caucao.devolvida} aoMudar={(v) => setCaucao({ ...caucao, devolvida: v })} />
                </Campo>
                <Campo rotulo="Valor devolvido (R$)" erro={erros.caucaoValor}>
                  <input value={caucao.valorDevolvido} onChange={(e) => setCaucao({ ...caucao, valorDevolvido: e.target.value })} inputMode="decimal" />
                </Campo>
              </div>
            </>
          )}
        </Secao>
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <Rodape salvando={salvando} aoFechar={aoFechar} />
      </form>
    </Modal>
  )
}

// -------------------------------------------------------- Registrar reajuste

export function FormReajuste({ locacao, imovel, proprietario, aoFechar, aoSalvar }: {
  locacao: LocacaoComInquilino
  imovel?: Imovel
  proprietario?: Proprietario | null
  aoFechar: () => void
  aoSalvar: (atualizados: number) => void
}) {
  const hoje = hojeBrasil()
  const previsto = proximoReajuste(locacao)
  const [data, setData] = useState(previsto && previsto <= hoje ? previsto : hoje)
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [indicePct, setIndicePct] = useState('')
  const [aplicar, setAplicar] = useState(false)
  const nomeIndice = INDICE_COMPLETO[locacao.indice_reajuste] ?? null
  const automatico = INDICES_AUTOMATICOS.includes(locacao.indice_reajuste)
  const [resultado, setResultado] = useState<ResultadoIndice | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [avisoIndice, setAvisoIndice] = useState<string | null>(null)
  const [gerandoCarta, setGerandoCarta] = useState(false)

  /** Busca a variação acumulada do índice no Banco Central e calcula o novo valor. */
  async function buscarIndice(dataBase = data) {
    setBuscando(true)
    setAvisoIndice(null)
    try {
      const r = await variacaoAcumulada(locacao.indice_reajuste, dataBase, locacao.reajuste_meses ?? 12)
      if (!r) {
        setAvisoIndice('O índice ainda não tem todos os meses publicados para esta data. Digite o percentual manualmente.')
        return
      }
      setResultado(r)
      setIndicePct(String(r.acumulado).replace('.', ','))
      setValor(valorParaCampo(Math.round(Number(locacao.valor_aluguel) * (1 + r.acumulado / 100) * 100) / 100))
      setObservacao(`${nomeIndice} acumulado de ${String(r.acumulado).replace('.', ',')}% (${r.periodo})`)
    } catch {
      setAvisoIndice('Não foi possível consultar o Banco Central agora. Digite o percentual manualmente.')
    } finally {
      setBuscando(false)
    }
  }

  // Ao abrir, já busca o índice automaticamente (IPCA, IGP-M e INPC).
  const buscouAoAbrir = useRef(false)
  useEffect(() => {
    if (!automatico || buscouAoAbrir.current) return
    buscouAoAbrir.current = true
    void Promise.resolve().then(() => buscarIndice())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Primeiro vencimento com o novo valor: o vencimento do mês do reajuste, ou do mês seguinte se já passou. */
  function vigencia(): string {
    const [a, m, d] = data.split('-').map(Number)
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
    const venc = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(locacao.dia_vencimento, ultimo)).padStart(2, '0')}`
    if (d <= Math.min(locacao.dia_vencimento, ultimo)) return venc
    const prox = adicionarMeses(`${a}-${String(m).padStart(2, '0')}-01`, 1)
    const [pa, pm] = prox.split('-').map(Number)
    const ult2 = new Date(Date.UTC(pa, pm, 0)).getUTCDate()
    return `${pa}-${String(pm).padStart(2, '0')}-${String(Math.min(locacao.dia_vencimento, ult2)).padStart(2, '0')}`
  }

  async function gerarCarta() {
    const novoValor = lerValor(valor)
    if (!novoValor || !imovel) {
      setErros({ ...erros, valor: 'Informe o novo valor para gerar a carta.' })
      return
    }
    setGerandoCarta(true)
    try {
      const blob = await gerarPdf(montarCartaReajuste({
        imovel,
        proprietario: proprietario ?? null,
        inquilino: locacao.inquilino,
        inicioLocacao: locacao.data_entrada,
        indiceNome: nomeIndice,
        periodo: resultado?.periodo ?? null,
        percentual: indicePct ? Number(indicePct.replace(',', '.')) : ((novoValor - Number(locacao.valor_aluguel)) / Number(locacao.valor_aluguel)) * 100,
        valorAtual: Number(locacao.valor_aluguel),
        valorNovo: novoValor,
        dataReajuste: data,
        vigencia: vigencia(),
      }))
      await entregarArquivo(blob, nomeArquivo(`Carta de reajuste - ${locacao.inquilino.nome}.pdf`), podeCompartilharArquivos() ? 'compartilhar' : 'baixar', 'Comunicação de reajuste do aluguel')
    } catch (err) {
      setErroGeral(mensagemDeErro(err))
    } finally {
      setGerandoCarta(false)
    }
  }

  /** Calcula o novo valor a partir da variação do índice digitada (ex.: 4,68%). */
  function aplicarPercentual(texto: string) {
    setIndicePct(texto)
    const p = Number(texto.replace(',', '.'))
    if (!texto.trim() || !Number.isFinite(p)) return
    setValor(valorParaCampo(Math.round(Number(locacao.valor_aluguel) * (1 + p / 100) * 100) / 100))
    if (nomeIndice && !observacao) setObservacao(`${nomeIndice} acumulado de ${texto.trim().replace('.', ',')}%`)
  }
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
    <Modal titulo={`Reajuste do aluguel — ${locacao.inquilino.nome}`} aoFechar={aoFechar} largo>
      <form onSubmit={salvar} noValidate>
        <p className="texto-suave paragrafo">
          Valor atual: <strong>{formatarMoeda(atual)}</strong>
          {previsto && <> · reajuste previsto para <strong>{formatarData(previsto)}</strong></>}.
        </p>
        {nomeIndice ? (
          <div className="alerta alerta--info">
            Pelo contrato, o reajuste segue a <strong>variação acumulada do {nomeIndice}</strong> em {locacao.reajuste_meses ?? 12} meses.{' '}
            {automatico ? (
              <>
                {buscando && <>Buscando no Banco Central…</>}
                {resultado && !buscando && (
                  <>Período usado: <strong>{resultado.periodo}</strong> → <strong>{String(resultado.acumulado).replace('.', ',')}%</strong>. O novo valor já foi calculado.</>
                )}
                {' '}
                <button type="button" className="botao botao--pequeno" onClick={() => buscarIndice()} disabled={buscando}>
                  {buscando ? 'Buscando…' : resultado ? 'Buscar de novo' : 'Buscar índice'}
                </button>
              </>
            ) : (
              <>O IVAR não é publicado pelo Banco Central: consulte o percentual no site da FGV e digite abaixo.</>
            )}
            {avisoIndice && <div className="texto-erro" style={{ marginTop: 6 }}>{avisoIndice}</div>}
          </div>
        ) : (
          <p className="alerta alerta--info">Pelo contrato, o novo valor é <strong>definido pelo proprietário</strong>.</p>
        )}
        {nomeIndice && (
          <Campo rotulo={`Variação acumulada do ${nomeIndice.split('/')[0]} (%)`} dica="opcional">
            <input value={indicePct} onChange={(e) => aplicarPercentual(e.target.value)} inputMode="decimal" placeholder="Ex.: 4,68" />
          </Campo>
        )}
        <div className="grade-2">
          <Campo rotulo="Data do reajuste" erro={erros.data}>
            <CampoData valor={data} min={locacao.data_entrada} aoMudar={setData} />
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
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} placeholder="Ex.: novo valor combinado com o inquilino" />
        </Campo>
        <label className="checagem paragrafo">
          <input type="checkbox" checked={aplicar} onChange={(e) => setAplicar(e.target.checked)} />
          <span>Aplicar o novo valor também aos lançamentos já gerados e <strong>sem pagamento</strong> a partir do mês do reajuste</span>
        </label>
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <div className="acoes-form acoes-form--separadas">
          {imovel ? (
            <button type="button" className="botao botao--com-icone" onClick={gerarCarta} disabled={gerandoCarta}>
              <IconeDocumento tamanho={15} /> {gerandoCarta ? 'Gerando…' : 'Carta de reajuste (PDF)'}
            </button>
          ) : <span />}
          <div className="grupo-botoes">
            <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
            <button type="submit" className="botao botao--primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Registrar reajuste'}</button>
          </div>
        </div>
        <p className="texto-suave texto-pequeno">
          Dica: gere e envie a <strong>carta de reajuste</strong> ao inquilino com 30 dias de antecedência e registre o reajuste na data.
        </p>
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
          <CampoData valor={dataSaida} min={locacao.data_entrada} aoMudar={setDataSaida} />
        </Campo>
        {erro && <p className="alerta alerta--erro" role="alert">{erro}</p>}
        <Rodape salvando={salvando} aoFechar={aoFechar} rotulo="Encerrar locação" />
      </form>
    </Modal>
  )
}

// --------------------------------------------------------- Editar inquilino

export function FormEditarInquilino({ inquilino, aoFechar, aoSalvar, aoExcluir }: { inquilino: Inquilino; aoFechar: () => void; aoSalvar: () => void; aoExcluir?: () => void }) {
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const [pessoa, setPessoa] = useState(() => pessoaForm(inquilino as unknown as Record<string, unknown>))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const { erros: novos, dados } = validarPessoa(pessoa)
    setErros(novos)
    if (Object.keys(novos).length) return
    const { documento, ...resto } = dados
    setSalvando(true)
    try {
      await atualizarInquilino(inquilino.id, { ...resto, cpf: documento })
      aoSalvar()
    } catch (err) {
      const e = err as { code?: string }
      setErroGeral(e.code === '23505' ? 'Já existe outro inquilino com esse CPF.' : mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo="Editar inquilino" aoFechar={aoFechar} largo>
      <form onSubmit={salvar} noValidate>
        <CamposPessoa valores={pessoa} aoMudar={setPessoa} erros={erros} comNascimento rotuloEndereco="Endereço do inquilino (opcional)" />
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <div className="acoes-form acoes-form--separadas">
          {aoExcluir ? (
            <button type="button" className="botao botao--discreto botao--texto-perigo" onClick={() => setConfirmarExclusao(true)}>Excluir inquilino</button>
          ) : <span />}
          <div className="grupo-botoes">
            <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
            <button type="submit" className="botao botao--primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </form>
      {confirmarExclusao && aoExcluir && (
        <ExcluirInquilino inquilino={inquilino} aoFechar={() => setConfirmarExclusao(false)} aoExcluir={aoExcluir} />
      )}
    </Modal>
  )
}
