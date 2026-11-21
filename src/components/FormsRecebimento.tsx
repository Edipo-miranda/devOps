import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { Campo } from './CamposLocacao'
import { editarLancamento, registrarPagamento } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { REGEX_DATA, formatarData, formatarMesReferencia, formatarMoeda, hojeBrasil, lerValor, valorParaCampo } from '../lib/format'
import type { RecebimentoDetalhado } from '../types/database'

function Resumo({ r }: { r: RecebimentoDetalhado }) {
  return (
    <dl className="resumo-lancamento">
      <div><dt>Inquilino</dt><dd>{r.inquilino_nome}</dd></div>
      <div><dt>Imóvel</dt><dd>{r.imovel_identificacao}</dd></div>
      <div><dt>Referência</dt><dd>{formatarMesReferencia(r.mes_referencia)}</dd></div>
      <div><dt>Previsto</dt><dd>{formatarMoeda(r.valor_previsto)} · vence {formatarData(r.data_vencimento)}</dd></div>
    </dl>
  )
}

// ------------------------------------------------------ Registrar pagamento

export function FormPagamento({ recebimento, aoFechar, aoSalvar }: { recebimento: RecebimentoDetalhado; aoFechar: () => void; aoSalvar: () => void }) {
  const hoje = hojeBrasil()
  const [valor, setValor] = useState(valorParaCampo(recebimento.valor_recebido ?? recebimento.valor_previsto))
  const [data, setData] = useState(recebimento.data_pagamento ?? hoje)
  const [observacao, setObservacao] = useState(recebimento.observacao ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const valorNum = lerValor(valor)
  const diferenca = valorNum !== null ? valorNum - Number(recebimento.valor_previsto) : 0

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const novos: Record<string, string> = {}
    if (valorNum === null || valorNum <= 0 || valorNum >= 10_000_000) novos.valor = 'Informe o valor recebido, por exemplo 1.500,00.'
    if (!REGEX_DATA.test(data)) novos.data = 'Informe a data do recebimento.'
    else if (data > hoje) novos.data = 'A data do recebimento não pode estar no futuro.'
    if (observacao.length > 500) novos.observacao = 'Máximo de 500 caracteres.'
    setErros(novos)
    if (Object.keys(novos).length) return

    setSalvando(true)
    try {
      await registrarPagamento(recebimento.id, {
        valor_recebido: valorNum!,
        data_pagamento: data,
        observacao: observacao.trim() || null,
      })
      aoSalvar()
    } catch (err) {
      setErroGeral(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={recebimento.data_pagamento ? 'Corrigir pagamento' : 'Registrar pagamento'} aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        <Resumo r={recebimento} />
        <div className="grade-2">
          <Campo rotulo="Valor recebido (R$)" erro={erros.valor}>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
          </Campo>
          <Campo rotulo="Data do recebimento" erro={erros.data}>
            <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
          </Campo>
        </div>
        {valorNum !== null && Math.abs(diferenca) >= 0.01 && (
          <p className="alerta alerta--info">
            Valor {diferenca > 0 ? 'acima' : 'abaixo'} do previsto em {formatarMoeda(Math.abs(diferenca))}.
          </p>
        )}
        <Campo rotulo="Observação" dica="opcional" erro={erros.observacao}>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} placeholder="Ex.: pago via PIX" />
        </Campo>
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <div className="acoes-form">
          <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="botao botao--primario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Confirmar recebimento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------- Editar lançamento (em aberto)

export function FormEditarLancamento({ recebimento, aoFechar, aoSalvar }: { recebimento: RecebimentoDetalhado; aoFechar: () => void; aoSalvar: () => void }) {
  const [valor, setValor] = useState(valorParaCampo(recebimento.valor_previsto))
  const [vencimento, setVencimento] = useState(recebimento.data_vencimento)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const v = lerValor(valor)
    const novos: Record<string, string> = {}
    if (v === null || v <= 0 || v >= 10_000_000) novos.valor = 'Informe um valor válido.'
    if (!REGEX_DATA.test(vencimento)) novos.vencimento = 'Informe o vencimento.'
    setErros(novos)
    if (Object.keys(novos).length) return
    setSalvando(true)
    try {
      await editarLancamento(recebimento.id, { valor_previsto: v!, data_vencimento: vencimento })
      aoSalvar()
    } catch (err) {
      setErroGeral(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo="Editar lançamento" aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        <Resumo r={recebimento} />
        <p className="texto-suave paragrafo">Altera somente este mês. Os demais meses e a locação não mudam.</p>
        <div className="grade-2">
          <Campo rotulo="Valor previsto (R$)" erro={erros.valor}>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
          </Campo>
          <Campo rotulo="Vencimento" erro={erros.vencimento}>
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </Campo>
        </div>
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <div className="acoes-form">
          <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="botao botao--primario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
