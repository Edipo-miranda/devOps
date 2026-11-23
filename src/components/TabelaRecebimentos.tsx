import { useState } from 'react'
import { BotaoCobrar } from './BotaoCobrar'
import { SeloSituacao } from './SeloSituacao'
import { FormEditarLancamento, FormPagamento } from './FormsRecebimento'
import { desfazerPagamento, lerConfiguracoes } from '../lib/api'
import { calcularEncargos } from '../lib/encargos'
import { montarRecibo } from '../lib/documentosPdf'
import { entregarArquivo, gerarPdf, nomeArquivo, podeCompartilharArquivos } from '../lib/pdf'
import { useCarregar } from '../lib/useCarregar'
import { hojeBrasil } from '../lib/format'
import { mensagemDeErro } from '../lib/erros'
import { formatarData, formatarMesReferencia, formatarMoeda } from '../lib/format'
import type { RecebimentoDetalhado } from '../types/database'

interface Props {
  linhas: RecebimentoDetalhado[]
  aoAlterar: (mensagem: string) => void
  aoErro: (mensagem: string) => void
  ocultarImovel?: boolean
}

/** Tabela de recebimentos com as ações de pagamento. No celular vira lista de cartões. */
export function TabelaRecebimentos({ linhas, aoAlterar, aoErro, ocultarImovel }: Props) {
  const [pagando, setPagando] = useState<RecebimentoDetalhado | null>(null)
  const [editando, setEditando] = useState<RecebimentoDetalhado | null>(null)
  const [gerandoRecibo, setGerandoRecibo] = useState<string | null>(null)
  const { dados: config } = useCarregar(lerConfiguracoes, [])
  const cobrarEncargos = config?.cobrar_encargos ?? true
  const hoje = hojeBrasil()

  async function recibo(r: RecebimentoDetalhado) {
    setGerandoRecibo(r.id)
    try {
      const blob = await gerarPdf(montarRecibo({ recebimento: r, imovel: { endereco: r.imovel_endereco, cidade: r.imovel_cidade, uf: r.imovel_uf } }))
      const nome = nomeArquivo(`Recibo ${formatarMesReferencia(r.mes_referencia).replace('/', '-')} - ${r.inquilino_nome}.pdf`)
      await entregarArquivo(blob, nome, podeCompartilharArquivos() ? 'compartilhar' : 'baixar', 'Recibo de aluguel')
    } catch (err) {
      aoErro(mensagemDeErro(err))
    } finally {
      setGerandoRecibo(null)
    }
  }

  async function desfazer(r: RecebimentoDetalhado) {
    const ok = window.confirm(
      `Desfazer o pagamento de ${r.inquilino_nome} (${formatarMesReferencia(r.mes_referencia)})?\n` +
        'O lançamento volta a ficar em aberto ou atrasado.',
    )
    if (!ok) return
    try {
      await desfazerPagamento(r.id)
      aoAlterar('Pagamento desfeito.')
    } catch (err) {
      aoErro(mensagemDeErro(err))
    }
  }

  return (
    <>
      <div className="tabela-container">
        <table className="tabela tabela--responsiva">
          <thead>
            <tr>
              <th>{ocultarImovel ? 'Inquilino' : 'Inquilino / imóvel'}</th>
              <th>Referência</th>
              <th className="num">Previsto</th>
              <th>Situação</th>
              <th className="num">Recebido</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.id}>
                <td data-rotulo="Inquilino"><div>
                  <div className="destaque">{r.inquilino_nome}</div>
                  {!ocultarImovel && <div className="texto-suave texto-pequeno">{r.imovel_identificacao}</div>}
                </div></td>
                <td data-rotulo="Referência">{formatarMesReferencia(r.mes_referencia)}</td>
                <td data-rotulo="Previsto" className="num"><div>
                  <div>{formatarMoeda(r.valor_previsto)}</div>
                  <div className="texto-suave texto-pequeno">vence {formatarData(r.data_vencimento)}</div>
                  {r.situacao === 'atrasado' && cobrarEncargos && (() => {
                    const enc = calcularEncargos(Number(r.valor_previsto), r.data_vencimento, hoje, r.multa_atraso_percentual, r.juros_atraso_percentual)
                    return enc.total > 0 ? (
                      <div className="texto-erro texto-pequeno" title="Com multa e juros até hoje">com multa e juros hoje: <strong>{formatarMoeda(Number(r.valor_previsto) + enc.total)}</strong></div>
                    ) : null
                  })()}
                </div></td>
                <td data-rotulo="Situação"><SeloSituacao situacao={r.situacao} diasAtraso={r.dias_atraso} /></td>
                <td data-rotulo="Recebido" className="num"><div>
                  <div>{formatarMoeda(r.valor_recebido)}</div>
                  {r.data_pagamento && <div className="texto-suave texto-pequeno">em {formatarData(r.data_pagamento)}</div>}
                  {r.valor_encargos ? <div className="texto-suave texto-pequeno">c/ multa e juros {formatarMoeda(r.valor_encargos)}</div> : null}
                  {r.observacao && <div className="texto-suave texto-pequeno">{r.observacao}</div>}
                </div></td>
                <td className="acoes"><div className="acoes__grupo">
                  {r.situacao === 'pago' ? (
                    <>
                      <button className="botao botao--pequeno" onClick={() => recibo(r)} disabled={gerandoRecibo === r.id}>
                        {gerandoRecibo === r.id ? 'Gerando…' : 'Recibo'}
                      </button>
                      <button className="botao botao--pequeno botao--discreto" onClick={() => setPagando(r)}>Corrigir</button>
                      <button className="botao botao--pequeno botao--discreto" onClick={() => desfazer(r)}>Desfazer</button>
                    </>
                  ) : (
                    <>
                      <button className="botao botao--pequeno botao--primario" onClick={() => setPagando(r)}>Registrar pagamento</button>
                      <BotaoCobrar r={r} cobrarPadrao={cobrarEncargos} />
                      <button className="botao botao--pequeno botao--discreto" onClick={() => setEditando(r)}>Editar</button>
                    </>
                  )}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
      {editando && (
        <FormEditarLancamento
          recebimento={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            aoAlterar('Lançamento atualizado.')
          }}
        />
      )}
    </>
  )
}
