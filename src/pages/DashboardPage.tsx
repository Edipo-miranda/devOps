import { Link, useSearchParams } from 'react-router-dom'
import { FiltroPeriodo } from '../components/FiltroPeriodo'
import { contarAtrasadosGeral, garantirMesAtual, listarRecebimentos, resumoMes } from '../lib/api'
import { MESES, formatarData, formatarMoeda, mesAtualBrasil } from '../lib/format'
import { useCarregar } from '../lib/useCarregar'
import { SeloSituacao } from '../components/SeloSituacao'

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const atual = mesAtualBrasil()
  const ano = Number(params.get('ano')) || atual.ano
  const mes = Number(params.get('mes')) || atual.mes

  const { dados, erro, carregando } = useCarregar(async () => {
    await garantirMesAtual()
    const [resumo, pendentes, atrasadosGeral] = await Promise.all([
      resumoMes(ano, mes),
      listarRecebimentos({ ano, mes, situacao: null }),
      contarAtrasadosGeral(),
    ])
    return { resumo, pendentes: pendentes.filter((r) => r.situacao !== 'pago'), atrasadosGeral }
  }, [ano, mes])

  const r = dados?.resumo
  const percentual = r && r.total_previsto > 0 ? Math.round((r.total_recebido / r.total_previsto) * 100) : 0
  const linkRecebimentos = (situacao?: string) =>
    `/recebimentos?ano=${ano}&mes=${mes}${situacao ? `&situacao=${situacao}` : ''}`

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Dashboard</h1>
          <p className="texto-suave">Resumo dos aluguéis de {MESES[mes - 1].toLowerCase()} de {ano}.</p>
        </div>
        <FiltroPeriodo ano={ano} mes={mes} aoMudar={(a, m) => setParams({ ano: String(a), mes: String(m ?? atual.mes) })} />
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      {dados && dados.atrasadosGeral.quantidade > 0 && (
        <Link to="/recebimentos?situacao=atrasado&todos=1" className="alerta alerta--erro alerta--link">
          {dados.atrasadosGeral.quantidade} {dados.atrasadosGeral.quantidade === 1 ? 'aluguel atrasado' : 'aluguéis atrasados'} no
          total, somando {formatarMoeda(dados.atrasadosGeral.valor)}. Ver todos →
        </Link>
      )}

      <div className={`indicadores ${carregando ? 'carregando' : ''}`}>
        <Link to={linkRecebimentos()} className="indicador">
          <span className="indicador__rotulo">Previsto no mês</span>
          <span className="indicador__valor">{r ? formatarMoeda(r.total_previsto) : '—'}</span>
          <span className="indicador__rodape">{r ? `${r.qtd_lancamentos} lançamento(s)` : ' '}</span>
        </Link>
        <Link to={linkRecebimentos('pago')} className="indicador">
          <span className="indicador__rotulo">Recebido</span>
          <span className="indicador__valor indicador__valor--ok">{r ? formatarMoeda(r.total_recebido) : '—'}</span>
          <span className="indicador__rodape">
            <span className="barra"><span className="barra__preenchida" style={{ width: `${Math.min(percentual, 100)}%` }} /></span>
            {percentual}% do previsto
          </span>
        </Link>
        <Link to={linkRecebimentos('pendentes')} className="indicador">
          <span className="indicador__rotulo">Pendente</span>
          <span className="indicador__valor">{r ? formatarMoeda(r.total_pendente) : '—'}</span>
          <span className="indicador__rodape">{r ? `${r.qtd_em_aberto + r.qtd_atrasados} a receber` : ' '}</span>
        </Link>
        <Link to={linkRecebimentos('atrasado')} className="indicador">
          <span className="indicador__rotulo">Atrasados no mês</span>
          <span className={`indicador__valor ${r && r.qtd_atrasados > 0 ? 'indicador__valor--erro' : ''}`}>
            {r ? r.qtd_atrasados : '—'}
          </span>
          <span className="indicador__rodape">vencidos e sem pagamento</span>
        </Link>
      </div>

      <h2 className="titulo-secao">A receber neste mês</h2>
      {dados && dados.pendentes.length === 0 && (
        <p className="vazio">
          {r && r.qtd_lancamentos === 0
            ? 'Nenhum lançamento neste mês. Cadastre imóveis com inquilinos ou gere os lançamentos na tela Recebimentos.'
            : 'Tudo recebido neste mês. 👍'}
        </p>
      )}
      {dados && dados.pendentes.length > 0 && (
        <div className="tabela-container">
          <table className="tabela tabela--responsiva">
            <thead>
              <tr><th>Inquilino</th><th>Imóvel</th><th>Vencimento</th><th className="num">Valor</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {dados.pendentes.map((p) => (
                <tr key={p.id}>
                  <td data-rotulo="Inquilino" className="destaque">{p.inquilino_nome}</td>
                  <td data-rotulo="Imóvel">{p.imovel_identificacao}</td>
                  <td data-rotulo="Vencimento">{formatarData(p.data_vencimento)}</td>
                  <td data-rotulo="Valor" className="num">{formatarMoeda(p.valor_previsto)}</td>
                  <td data-rotulo="Situação"><SeloSituacao situacao={p.situacao} diasAtraso={p.dias_atraso} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dados && dados.pendentes.length > 0 && (
        <p className="rodape-secao"><Link to={linkRecebimentos('pendentes')}>Registrar pagamentos →</Link></p>
      )}
    </section>
  )
}
