import { useState } from 'react'
import { SeloSituacao } from './SeloSituacao'
import { FormEditarLancamento, FormPagamento } from './FormsRecebimento'
import { desfazerPagamento } from '../lib/api'
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
              <th>Inquilino</th>
              {!ocultarImovel && <th>Imóvel</th>}
              <th>Referência</th>
              <th className="num">Previsto</th>
              <th>Vencimento</th>
              <th>Situação</th>
              <th className="num">Recebido</th>
              <th>Pagamento</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.id}>
                <td data-rotulo="Inquilino" className="destaque">{r.inquilino_nome}</td>
                {!ocultarImovel && <td data-rotulo="Imóvel">{r.imovel_identificacao}</td>}
                <td data-rotulo="Referência">{formatarMesReferencia(r.mes_referencia)}</td>
                <td data-rotulo="Previsto" className="num">{formatarMoeda(r.valor_previsto)}</td>
                <td data-rotulo="Vencimento">{formatarData(r.data_vencimento)}</td>
                <td data-rotulo="Situação"><SeloSituacao situacao={r.situacao} diasAtraso={r.dias_atraso} /></td>
                <td data-rotulo="Recebido" className="num">
                  {formatarMoeda(r.valor_recebido)}
                  {r.observacao && <div className="texto-suave texto-pequeno">{r.observacao}</div>}
                </td>
                <td data-rotulo="Pagamento">{formatarData(r.data_pagamento)}</td>
                <td className="acoes">
                  {r.situacao === 'pago' ? (
                    <>
                      <button className="botao botao--pequeno" onClick={() => setPagando(r)}>Corrigir</button>
                      <button className="botao botao--pequeno botao--discreto" onClick={() => desfazer(r)}>Desfazer</button>
                    </>
                  ) : (
                    <>
                      <button className="botao botao--pequeno botao--primario" onClick={() => setPagando(r)}>Registrar pagamento</button>
                      <button className="botao botao--pequeno botao--discreto" onClick={() => setEditando(r)}>Editar</button>
                    </>
                  )}
                </td>
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
