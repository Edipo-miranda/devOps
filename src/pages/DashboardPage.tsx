import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Aviso, type AvisoDados } from '../components/Aviso'
import { ListaAvisos } from '../components/ListaAvisos'
import { aoAlterarDados } from '../lib/eventos'
import { FiltroPeriodo } from '../components/FiltroPeriodo'
import { contarAtrasadosGeral, garantirMesAtual, listarAvisos, listarDespesas, listarRecebimentos, resumoMes } from '../lib/api'
import { MESES, formatarData, formatarMoeda, inicioDoMes, mesAtualBrasil, ultimoDiaDoMes } from '../lib/format'
import { useCarregar } from '../lib/useCarregar'
import { SeloSituacao } from '../components/SeloSituacao'
import { IconeAlerta, IconeAlvo, IconeCheck, IconeRelogio } from '../components/Icones'
import { VisaoGeral } from '../components/VisaoGeral'

/** Aba "Mês": resumo do mês escolhido, avisos e o que falta receber. */
function AbaMes() {
  const [params, setParams] = useSearchParams()
  const atual = mesAtualBrasil()
  const ano = Number(params.get('ano')) || atual.ano
  const mes = Number(params.get('mes')) || atual.mes

  const [aviso, setAviso] = useState<AvisoDados | null>(null)
  const fecharAviso = useCallback(() => setAviso(null), [])

  const { dados, erro, carregando, recarregar } = useCarregar(async () => {
    await garantirMesAtual()
    const inicio = inicioDoMes(ano, mes)
    const [resumo, pendentes, atrasadosGeral, avisos, despesas] = await Promise.all([
      resumoMes(ano, mes),
      listarRecebimentos({ ano, mes, situacao: null }),
      contarAtrasadosGeral(),
      listarAvisos(),
      listarDespesas({ de: inicio, ate: ultimoDiaDoMes(ano, mes) }),
    ])
    return { resumo, pendentes: pendentes.filter((r) => r.situacao !== 'pago'), atrasadosGeral, avisos, despesas }
  }, [ano, mes])

  useEffect(() => aoAlterarDados(recarregar), [recarregar])

  const r = dados?.resumo
  const percentual = r && r.total_previsto > 0 ? Math.round((r.total_recebido / r.total_previsto) * 100) : 0
  const linkRecebimentos = (situacao?: string) =>
    `/recebimentos?ano=${ano}&mes=${mes}${situacao ? `&situacao=${situacao}` : ''}`

  return (
    <section>
      <div className="destaque-topo">
        <div className="destaque-topo__texto">
          <span className="destaque-topo__rotulo">Resumo de {MESES[mes - 1].toLowerCase()} de {ano}</span>
          <h1>{r ? formatarMoeda(r.total_recebido) : '—'}</h1>
          <p>
            recebidos de {r ? formatarMoeda(r.total_previsto) : '—'} previstos
            {r && r.total_pendente > 0 ? ` · faltam ${formatarMoeda(r.total_pendente)}` : ''}
          </p>
          <div className="destaque-topo__barra" aria-label={`${percentual}% recebido`}>
            <span style={{ width: `${Math.min(percentual, 100)}%` }} />
          </div>
        </div>
        <div className="destaque-topo__lado">
          <div className="anel" style={{ ['--p' as string]: Math.min(percentual, 100) }}>
            <span>{percentual}%</span>
          </div>
          <FiltroPeriodo ano={ano} mes={mes} aoMudar={(a, m) => setParams({ ano: String(a), mes: String(m ?? atual.mes) })} />
        </div>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}

      <div className={`indicadores ${carregando ? 'carregando' : ''}`}>
        <Link to={linkRecebimentos()} className="indicador indicador--azul">
          <span className="indicador__icone"><IconeAlvo /></span>
          <span className="indicador__rotulo">Previsto no mês</span>
          <span className="indicador__valor">{r ? formatarMoeda(r.total_previsto) : '—'}</span>
          <span className="indicador__rodape">{r ? `${r.qtd_lancamentos} lançamento(s)` : ' '}</span>
        </Link>
        <Link to={linkRecebimentos('pago')} className="indicador indicador--verde">
          <span className="indicador__icone"><IconeCheck /></span>
          <span className="indicador__rotulo">Recebido</span>
          <span className="indicador__valor">{r ? formatarMoeda(r.total_recebido) : '—'}</span>
          <span className="indicador__rodape">{r ? `${r.qtd_pagos} pago(s) · ${percentual}% do previsto` : ' '}</span>
        </Link>
        <Link to={linkRecebimentos('pendentes')} className="indicador indicador--ambar">
          <span className="indicador__icone"><IconeRelogio /></span>
          <span className="indicador__rotulo">Pendente</span>
          <span className="indicador__valor">{r ? formatarMoeda(r.total_pendente) : '—'}</span>
          <span className="indicador__rodape">{r ? `${r.qtd_em_aberto + r.qtd_atrasados} a receber` : ' '}</span>
        </Link>
        <Link to={linkRecebimentos('atrasado')} className="indicador indicador--vermelho">
          <span className="indicador__icone"><IconeAlerta /></span>
          <span className="indicador__rotulo">Atrasados no mês</span>
          <span className="indicador__valor">{r ? r.qtd_atrasados : '—'}</span>
          <span className="indicador__rodape">vencidos e sem pagamento</span>
        </Link>
      </div>

      {dados && r && (() => {
        const totalDespesas = dados.despesas.reduce((soma, d) => soma + d.valor, 0)
        const resultado = r.total_recebido - totalDespesas
        return (
          <div className="resultado-mes">
            <div><span>Recebido no mês</span><strong className="texto-ok">{formatarMoeda(r.total_recebido)}</strong></div>
            <div>
              <span>Despesas no mês</span>
              <strong className="texto-erro">− {formatarMoeda(totalDespesas)}</strong>
              <small className="texto-suave">{dados.despesas.length} lançamento(s)</small>
            </div>
            <div><span>Resultado do mês</span><strong className={resultado < 0 ? 'texto-erro' : ''}>{formatarMoeda(resultado)}</strong></div>
            <Link to="/relatorios" className="resultado-mes__link">Ver relatórios →</Link>
          </div>
        )
      })()}

      {dados && dados.atrasadosGeral.quantidade > 0 && (
        <Link to="/recebimentos?situacao=atrasado&todos=1" className="faixa-alerta">
          <IconeAlerta tamanho={18} />
          <span>
            Total atrasado em todos os meses: <strong>{dados.atrasadosGeral.quantidade}</strong> aluguel(éis),{' '}
            <strong>{formatarMoeda(dados.atrasadosGeral.valor)}</strong>
          </span>
          <span className="faixa-alerta__acao">Ver lista →</span>
        </Link>
      )}

      {dados && dados.avisos.length > 0 && (
        <div className="painel-avisos">
          <div className="painel-avisos__topo">
            <h2>Avisos ({dados.avisos.length})</h2>
            <Link to="/avisos">Ver todos →</Link>
          </div>
          <ListaAvisos
            avisos={dados.avisos.slice(0, 5)}
            aoAlterar={(texto) => setAviso({ tipo: 'ok', texto })}
            aoErro={(texto) => setAviso({ tipo: 'erro', texto })}
          />
          {dados.avisos.length > 5 && (
            <p className="rodape-secao"><Link to="/avisos">Mais {dados.avisos.length - 5} aviso(s) →</Link></p>
          )}
        </div>
      )}


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
      <Aviso aviso={aviso} aoFechar={fecharAviso} />
    </section>
  )
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const aba = params.get('aba') === 'geral' ? 'geral' : 'mes'

  return (
    <>
      <div className="abas" role="tablist" aria-label="Visão do dashboard">
        <button role="tab" aria-selected={aba === 'mes'} className={aba === 'mes' ? 'ativa' : ''} onClick={() => setParams({})}>
          Mês
        </button>
        <button role="tab" aria-selected={aba === 'geral'} className={aba === 'geral' ? 'ativa' : ''} onClick={() => setParams({ aba: 'geral' })}>
          Visão geral
        </button>
      </div>
      {aba === 'mes' ? <AbaMes /> : <VisaoGeral />}
    </>
  )
}
