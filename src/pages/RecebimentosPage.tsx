import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Aviso, type AvisoDados } from '../components/Aviso'
import { FiltroPeriodo } from '../components/FiltroPeriodo'
import { TabelaRecebimentos } from '../components/TabelaRecebimentos'
import { garantirMesAtual, gerarRecebimentosMes, listarRecebimentos, type FiltroRecebimentos } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { MESES, formatarMoeda, mesAtualBrasil } from '../lib/format'
import { useCarregar } from '../lib/useCarregar'
import { exportarExcel, exportarPdf, type Coluna } from '../lib/exportar'
import { nomeArquivo } from '../lib/pdf'
import type { RecebimentoDetalhado } from '../types/database'

const SITUACOES = [
  { valor: '', rotulo: 'Todas as situações' },
  { valor: 'pendentes', rotulo: 'A receber (em aberto + atrasados)' },
  { valor: 'em_aberto', rotulo: 'Em aberto' },
  { valor: 'atrasado', rotulo: 'Atrasado' },
  { valor: 'pago', rotulo: 'Pago' },
] as const

const ROTULOS_SITUACAO: Record<string, string> = { pago: 'Pago', em_aberto: 'Em aberto', atrasado: 'Atrasado' }

const COLUNAS_LISTA: Coluna<RecebimentoDetalhado>[] = [
  { titulo: 'Inquilino', valor: (r) => r.inquilino_nome },
  { titulo: 'Imóvel', valor: (r) => r.imovel_identificacao },
  { titulo: 'Referência', valor: (r) => r.mes_referencia.slice(0, 7).split('-').reverse().join('/'), largura: 11 },
  { titulo: 'Vencimento', valor: (r) => r.data_vencimento, tipo: 'data' },
  { titulo: 'Situação', valor: (r) => ROTULOS_SITUACAO[r.situacao], largura: 11 },
  { titulo: 'Previsto', valor: (r) => Number(r.valor_previsto), tipo: 'moeda' },
  { titulo: 'Pagamento', valor: (r) => r.data_pagamento, tipo: 'data' },
  { titulo: 'Multa/juros', valor: (r) => (r.valor_encargos ? Number(r.valor_encargos) : null), tipo: 'moeda' },
  { titulo: 'Recebido', valor: (r) => (r.valor_recebido !== null ? Number(r.valor_recebido) : null), tipo: 'moeda' },
]

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

  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null)

  /** Exporta a lista exatamente como está filtrada na tela. */
  async function exportar(tipo: 'excel' | 'pdf') {
    setExportando(tipo)
    try {
      const nome = nomeArquivo(`Recebimentos ${todoHistorico ? 'historico completo' : mes ? `${String(mes).padStart(2, '0')}-${ano}` : ano}`)
      if (tipo === 'excel') {
        await exportarExcel(nome, [{ nome: 'Recebimentos', colunas: COLUNAS_LISTA, linhas }])
      } else {
        await exportarPdf(nome, 'Recebimentos de aluguel', `Período: ${periodo} · ${linhas.length} lançamento(s)`, [{
          titulo: 'Lançamentos',
          colunas: COLUNAS_LISTA,
          linhas,
          totais: ['', '', '', '', 'Total', totais.previsto, '', '', totais.recebido],
        }])
      }
    } catch (err) {
      setAviso({ tipo: 'erro', texto: mensagemDeErro(err) })
    } finally {
      setExportando(null)
    }
  }

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
        <div className="grupo-botoes">
        <button className="botao botao--discreto" onClick={() => exportar('excel')} disabled={!dados || exportando !== null}>
          {exportando === 'excel' ? 'Gerando…' : 'Excel'}
        </button>
        <button className="botao botao--discreto" onClick={() => exportar('pdf')} disabled={!dados || exportando !== null}>
          {exportando === 'pdf' ? 'Gerando…' : 'PDF'}
        </button>
        {!todoHistorico && mes && (
          <button className="botao" onClick={gerar} disabled={gerando} title="Cria os lançamentos que faltam, sem duplicar">
            {gerando ? 'Gerando…' : `Gerar lançamentos de ${MESES[mes - 1]}`}
          </button>
        )}
        </div>
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
