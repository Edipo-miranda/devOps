import { useState } from 'react'
import { BotaoCobrar } from './BotaoCobrar'
import { Link } from 'react-router-dom'
import { FormPagamento } from './FormsRecebimento'
import { buscarRecebimento, buscarRecebimentos, lerConfiguracoes } from '../lib/api'
import { useCarregar } from '../lib/useCarregar'
import { mensagemDeErro } from '../lib/erros'
import { formatarData, formatarMoeda } from '../lib/format'
import type { Aviso, RecebimentoDetalhado, TipoAviso } from '../types/database'

const ESTILO: Record<TipoAviso, { rotulo: string; classe: string }> = {
  parcela_atrasada: { rotulo: 'Atrasado', classe: 'selo--atrasado' },
  parcela_hoje: { rotulo: 'Vence hoje', classe: 'selo--aberto' },
  parcela_vencendo: { rotulo: 'A vencer', classe: 'selo--aberto' },
  fim_contrato: { rotulo: 'Contrato', classe: 'selo--info' },
  reajuste: { rotulo: 'Reajuste', classe: 'selo--info' },
}

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`

/** Texto principal de cada aviso, em linguagem simples. */
function descricao(a: Aviso): string {
  const data = formatarData(a.data_alvo)
  switch (a.tipo) {
    case 'parcela_atrasada':
      return `Aluguel ${a.detalhe ?? ''} atrasado há ${dias(-a.dias)} (venceu em ${data})`
    case 'parcela_hoje':
      return `Aluguel ${a.detalhe ?? ''} vence hoje`
    case 'parcela_vencendo':
      return `Aluguel ${a.detalhe ?? ''} vence em ${dias(a.dias)} (${data})`
    case 'fim_contrato':
      if (a.dias > 0) return `Contrato de ${a.detalhe} termina em ${dias(a.dias)} (${data})`
      if (a.dias === 0) return `Contrato de ${a.detalhe} termina hoje`
      return `Contrato de ${a.detalhe} terminou em ${data} — renove ou encerre`
    case 'reajuste':
      if (a.dias > 0) return `Reajuste previsto em ${dias(a.dias)} (${data})`
      if (a.dias === 0) return `Reajuste previsto para hoje`
      return `Reajuste previsto desde ${data} — ainda não registrado`
  }
}

interface Props {
  avisos: Aviso[]
  aoAlterar: (texto: string) => void
  aoErro: (texto: string) => void
}

export function ListaAvisos({ avisos, aoAlterar, aoErro }: Props) {
  const [pagando, setPagando] = useState<RecebimentoDetalhado | null>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  // Dados dos lançamentos dos avisos de parcela, para montar a mensagem do WhatsApp.
  const ids = avisos.map((a) => a.recebimento_id).filter((x): x is string => Boolean(x))
  const { dados: extra } = useCarregar(async () => {
    const [recs, config] = await Promise.all([buscarRecebimentos(ids), lerConfiguracoes()])
    return { recs: new Map(recs.map((r) => [r.id, r])), cobrar: config.cobrar_encargos }
  }, [ids.join(',')])

  async function abrirPagamento(id: string) {
    setAbrindo(id)
    try {
      setPagando(await buscarRecebimento(id))
    } catch (err) {
      aoErro(mensagemDeErro(err))
    } finally {
      setAbrindo(null)
    }
  }

  return (
    <>
      <ul className="lista-avisos">
        {avisos.map((a) => (
          <li key={`${a.tipo}-${a.recebimento_id ?? a.locacao_id}`} className={`aviso-item aviso-item--${a.tipo}`}>
            <span className={`selo ${ESTILO[a.tipo].classe}`}>{ESTILO[a.tipo].rotulo}</span>
            <div className="aviso-item__texto">
              <strong>{a.inquilino}</strong> · <Link to={`/imoveis/${a.imovel_id}`}>{a.imovel}</Link>
              <div>{descricao(a)}</div>
              {a.tipo.startsWith('parcela') && <div className="texto-suave texto-pequeno">{formatarMoeda(a.valor)}</div>}
            </div>
            <div className="aviso-item__acoes">
              {a.recebimento_id && (
                <button className="botao botao--pequeno botao--primario" disabled={abrindo === a.recebimento_id}
                  onClick={() => abrirPagamento(a.recebimento_id!)}>
                  Registrar pagamento
                </button>
              )}
              {a.recebimento_id && extra?.recs.get(a.recebimento_id) && (() => {
                return <BotaoCobrar r={extra.recs.get(a.recebimento_id!)!} cobrarPadrao={extra.cobrar} />
              })()}
              {a.tipo === 'fim_contrato' && (
                <Link className="botao botao--pequeno" to={`/imoveis/${a.imovel_id}?acao=renovar`}>Renovar / encerrar</Link>
              )}
              {a.tipo === 'reajuste' && (
                <Link className="botao botao--pequeno" to={`/imoveis/${a.imovel_id}?acao=reajuste`}>Calcular reajuste</Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {pagando && (
        <FormPagamento
          recebimento={pagando}
          aoFechar={() => setPagando(null)}
          aoSalvar={() => {
            setPagando(null)
            aoAlterar('Pagamento registrado.')
          }}
        />
      )}
    </>
  )
}
