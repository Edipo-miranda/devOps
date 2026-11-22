import { Link } from 'react-router-dom'
import { IconeAlerta, IconeCheck, IconeDocumento, IconePredio } from './Icones'
import { fimDoContrato, historicoMensal, listarDespesas, listarImoveis, resumoGeral } from '../lib/api'
import { MESES, adicionarMeses, formatarData, formatarMoeda, hojeBrasil } from '../lib/format'
import { useCarregar } from '../lib/useCarregar'
import type { HistoricoMes } from '../types/database'

/** Aba "Visão geral" do dashboard: números de todos os contratos, gráfico de 12 meses e contratos ativos. */
export function VisaoGeral() {
  const { dados, erro, carregando } = useCarregar(async () => {
    const hojeIso = hojeBrasil()
    const inicio12 = adicionarMeses(`${hojeIso.slice(0, 7)}-01`, -11)
    const [resumo, historicoBase, imoveis, despesas12, despesasAno] = await Promise.all([
      resumoGeral(), historicoMensal(12), listarImoveis(),
      listarDespesas({ de: inicio12 }), listarDespesas({ ano: Number(hojeIso.slice(0, 4)) }),
    ])
    // Soma as despesas de cada mês (pela data do pagamento) no gráfico.
    const historico = historicoBase.map((h) => ({
      ...h,
      despesas: despesas12.filter((d) => d.data.slice(0, 7) === h.mes_referencia.slice(0, 7)).reduce((s, d) => s + d.valor, 0),
    }))
    const totalDespesasAno = despesasAno.reduce((s, d) => s + d.valor, 0)
    const contratos = imoveis
      .filter((i) => i.locacao_ativa)
      .map((i) => ({ imovel: i, locacao: i.locacao_ativa!, fim: fimDoContrato(i.locacao_ativa!) }))
      .sort((a, b) => (a.fim ?? '9999').localeCompare(b.fim ?? '9999'))
    return { resumo, historico, contratos, totalDespesasAno }
  }, [])

  if (erro) return <p className="alerta alerta--erro">{erro}</p>
  if (!dados) return <p className="texto-suave">Carregando…</p>
  const r = dados.resumo
  const hoje = hojeBrasil()
  const ocupacao = r.imoveis_ativos ? Math.round((r.imoveis_alugados / r.imoveis_ativos) * 100) : 0

  return (
    <div className={carregando ? 'carregando' : ''}>
      <div className="indicadores">
        <div className="indicador indicador--azul">
          <span className="indicador__icone"><IconeDocumento /></span>
          <span className="indicador__rotulo">Contratos ativos</span>
          <span className="indicador__valor">{r.contratos_ativos}</span>
          <span className="indicador__rodape">{formatarMoeda(r.receita_mensal_contratada)} por mês</span>
        </div>
        <div className="indicador indicador--verde">
          <span className="indicador__icone"><IconePredio /></span>
          <span className="indicador__rotulo">Ocupação</span>
          <span className="indicador__valor">{ocupacao}%</span>
          <span className="indicador__rodape">{r.imoveis_alugados} alugado(s) · {r.imoveis_vagos} vago(s)</span>
        </div>
        <div className="indicador indicador--ambar">
          <span className="indicador__icone"><IconeCheck /></span>
          <span className="indicador__rotulo">Recebido em {hoje.slice(0, 4)}</span>
          <span className="indicador__valor">{formatarMoeda(r.recebido_ano)}</span>
          <span className="indicador__rodape">desde o início: {formatarMoeda(r.recebido_total)}</span>
        </div>
        <Link to="/recebimentos?situacao=atrasado&todos=1" className="indicador indicador--vermelho">
          <span className="indicador__icone"><IconeAlerta /></span>
          <span className="indicador__rotulo">Em atraso (todos os meses)</span>
          <span className="indicador__valor">{formatarMoeda(r.atrasados_valor)}</span>
          <span className="indicador__rodape">{r.atrasados_qtd} aluguel(éis) · {r.contratos_vencendo_60d} contrato(s) vencendo em 60 dias</span>
        </Link>
      </div>

      <div className="resultado-mes">
        <div><span>Recebido em {hoje.slice(0, 4)}</span><strong className="texto-ok">{formatarMoeda(r.recebido_ano)}</strong></div>
        <div><span>Despesas em {hoje.slice(0, 4)}</span><strong className="texto-erro">− {formatarMoeda(dados.totalDespesasAno)}</strong></div>
        <div><span>Lucro líquido em {hoje.slice(0, 4)}</span><strong>{formatarMoeda(r.recebido_ano - dados.totalDespesasAno)}</strong></div>
        <Link to="/relatorios" className="resultado-mes__link">Ver relatórios →</Link>
      </div>

      <h2 className="titulo-secao">Últimos 12 meses</h2>
      <GraficoMeses meses={dados.historico} />

      <h2 className="titulo-secao">Contratos ativos ({dados.contratos.length})</h2>
      {dados.contratos.length === 0 ? (
        <p className="vazio">Nenhum contrato ativo.</p>
      ) : (
        <div className="tabela-container">
          <table className="tabela tabela--responsiva tabela--clicavel">
            <thead>
              <tr><th>Inquilino</th><th>Imóvel</th><th>Proprietário</th><th className="num">Aluguel</th><th>Venc.</th><th>Fim do contrato</th></tr>
            </thead>
            <tbody>
              {dados.contratos.map(({ imovel, locacao, fim }) => (
                <tr key={locacao.id}>
                  <td data-rotulo="Inquilino" className="destaque">{locacao.inquilino.nome}</td>
                  <td data-rotulo="Imóvel"><Link to={`/imoveis/${imovel.id}`}>{imovel.identificacao}</Link></td>
                  <td data-rotulo="Proprietário">{imovel.proprietario?.nome ?? '—'}</td>
                  <td data-rotulo="Aluguel" className="num">{formatarMoeda(locacao.valor_aluguel)}</td>
                  <td data-rotulo="Vencimento">Dia {locacao.dia_vencimento}</td>
                  <td data-rotulo="Fim do contrato" className={fim && fim <= hoje ? 'texto-erro' : ''}>
                    {fim ? formatarData(fim) : 'Indeterminado'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Barras simples de previsto x recebido por mês (sem biblioteca de gráficos). */
function GraficoMeses({ meses }: { meses: (HistoricoMes & { despesas: number })[] }) {
  const maximo = Math.max(1, ...meses.map((m) => Math.max(m.previsto, m.recebido, m.despesas)))
  const total = meses.reduce(
    (s, m) => ({ previsto: s.previsto + m.previsto, recebido: s.recebido + m.recebido, despesas: s.despesas + m.despesas }),
    { previsto: 0, recebido: 0, despesas: 0 },
  )

  return (
    <div className="grafico cartao">
      <div className="grafico__legenda">
        <span><i className="grafico__cor grafico__cor--previsto" /> Previsto: <strong>{formatarMoeda(total.previsto)}</strong></span>
        <span><i className="grafico__cor grafico__cor--recebido" /> Recebido: <strong>{formatarMoeda(total.recebido)}</strong></span>
        <span><i className="grafico__cor grafico__cor--despesas" /> Despesas: <strong>{formatarMoeda(total.despesas)}</strong></span>
      </div>
      <div className="grafico__barras" role="img" aria-label="Previsto e recebido nos últimos 12 meses">
        {meses.map((m) => {
          const [a, mes] = m.mes_referencia.split('-').map(Number)
          const titulo = `${MESES[mes - 1]}/${a}: previsto ${formatarMoeda(m.previsto)}, recebido ${formatarMoeda(m.recebido)}, despesas ${formatarMoeda(m.despesas)}`
          return (
            <Link key={m.mes_referencia} to={`/?ano=${a}&mes=${mes}`} className="grafico__mes" title={titulo}>
              <div className="grafico__colunas">
                <span className="grafico__barra grafico__barra--previsto" style={{ height: `${(m.previsto / maximo) * 100}%` }} />
                <span className="grafico__barra grafico__barra--recebido" style={{ height: `${(m.recebido / maximo) * 100}%` }} />
                <span className="grafico__barra grafico__barra--despesas" style={{ height: `${(m.despesas / maximo) * 100}%` }} />
              </div>
              <span className="grafico__rotulo">{MESES[mes - 1].slice(0, 3)}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
