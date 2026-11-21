import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Aviso, type AvisoDados } from '../components/Aviso'
import { FiltroPeriodo } from '../components/FiltroPeriodo'
import { TabelaRecebimentos } from '../components/TabelaRecebimentos'
import { garantirMesAtual, gerarRecebimentosMes, listarRecebimentos, type FiltroRecebimentos } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { MESES, formatarMoeda, mesAtualBrasil } from '../lib/format'
import { useCarregar } from '../lib/useCarregar'

const SITUACOES = [
  { valor: '', rotulo: 'Todas as situações' },
  { valor: 'pendentes', rotulo: 'A receber (em aberto + atrasados)' },
  { valor: 'em_aberto', rotulo: 'Em aberto' },
  { valor: 'atrasado', rotulo: 'Atrasado' },
  { valor: 'pago', rotulo: 'Pago' },
] as const

/** Remove acentos e deixa minúsculo, para a busca ignorar "é", "ç" etc. */
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function RecebimentosPage() {
  const [params, setParams] = useSearchParams()
  const atual = mesAtualBrasil()
  const todoHistorico = params.get('todos') === '1'
  const ano = Number(params.get('ano')) || atual.ano
  const mesParam = params.get('mes')
  const mes = mesParam === '0' ? null : Number(mesParam) || atual.mes
  const situacao = (params.get('situacao') ?? '') as NonNullable<FiltroRecebimentos['situacao']> | ''
  const busca = params.get('busca') ?? ''

  const [aviso, setAviso] = useState<AvisoDados | null>(null)
  const [gerando, setGerando] = useState(false)
  const fecharAviso = useCallback(() => setAviso(null), [])

  function atualizar(novos: Record<string, string | null>) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(novos)) {
      if (v === null || v === '') p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  const { dados, erro, carregando, recarregar } = useCarregar(async () => {
    await garantirMesAtual()
    return listarRecebimentos({
      ano: todoHistorico ? null : ano,
      mes: todoHistorico ? null : mes,
      situacao: situacao || null,
    })
  }, [ano, mes, situacao, todoHistorico])

  const linhas = useMemo(() => {
    const termo = normalizar(busca.trim())
    if (!termo || !dados) return dados ?? []
    return dados.filter(
      (r) => normalizar(r.inquilino_nome).includes(termo) || normalizar(r.imovel_identificacao).includes(termo),
    )
  }, [dados, busca])

  const totais = useMemo(
    () => ({
      previsto: linhas.reduce((s, r) => s + Number(r.valor_previsto), 0),
      recebido: linhas.reduce((s, r) => s + Number(r.valor_recebido ?? 0), 0),
    }),
    [linhas],
  )

  async function gerar() {
    if (!mes) return
    setGerando(true)
    try {
      const qtd = await gerarRecebimentosMes(ano, mes)
      setAviso({
        tipo: 'ok',
        texto: qtd === 0
          ? `Nenhum lançamento novo: ${MESES[mes - 1]}/${ano} já está completo.`
          : `${qtd} lançamento(s) criado(s) para ${MESES[mes - 1]}/${ano}.`,
      })
      recarregar()
    } catch (err) {
      setAviso({ tipo: 'erro', texto: mensagemDeErro(err) })
    } finally {
      setGerando(false)
    }
  }

  const periodo = todoHistorico ? 'todo o histórico' : mes ? `${MESES[mes - 1]}/${ano}` : `o ano de ${ano}`

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Recebimentos</h1>
          <p className="texto-suave">Lançamentos de {periodo}.</p>
        </div>
        {!todoHistorico && mes && (
          <button className="botao" onClick={gerar} disabled={gerando} title="Cria os lançamentos que faltam, sem duplicar">
            {gerando ? 'Gerando…' : `Gerar lançamentos de ${MESES[mes - 1]}`}
          </button>
        )}
      </div>

      <div className="barra-filtros">
        <input
          type="search"
          className="campo-busca"
          placeholder="Buscar inquilino ou imóvel…"
          value={busca}
          onChange={(e) => atualizar({ busca: e.target.value })}
          aria-label="Buscar inquilino ou imóvel"
        />
        {!todoHistorico && (
          <FiltroPeriodo
            ano={ano}
            mes={mes}
            permitirTodos
            aoMudar={(a, m) => atualizar({ ano: String(a), mes: m === null ? '0' : String(m) })}
          />
        )}
        <select value={situacao} onChange={(e) => atualizar({ situacao: e.target.value })} aria-label="Situação">
          {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
        </select>
        <label className="checagem">
          <input type="checkbox" checked={todoHistorico} onChange={(e) => atualizar({ todos: e.target.checked ? '1' : null })} />
          Todo o histórico
        </label>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      {dados && (
        <p className="totais-lista">
          <span>{linhas.length} lançamento(s)</span>
          <span>Previsto: <strong>{formatarMoeda(totais.previsto)}</strong></span>
          <span>Recebido: <strong>{formatarMoeda(totais.recebido)}</strong></span>
        </p>
      )}

      <div className={carregando ? 'carregando' : ''}>
        {dados && linhas.length === 0 ? (
          <p className="vazio">
            {busca ? 'Nenhum lançamento encontrado para essa busca.' : 'Nenhum lançamento encontrado com esses filtros.'}
          </p>
        ) : (
          <TabelaRecebimentos
            linhas={linhas}
            aoAlterar={(texto) => {
              setAviso({ tipo: 'ok', texto })
              recarregar()
            }}
            aoErro={(texto) => setAviso({ tipo: 'erro', texto })}
          />
        )}
        {!dados && !erro && <p className="texto-suave">Carregando…</p>}
      </div>

      <Aviso aviso={aviso} aoFechar={fecharAviso} />
    </section>
  )
}
