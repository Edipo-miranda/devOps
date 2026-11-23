import { useState } from 'react'
import { Modal } from './Modal'
import { IconeWhatsApp } from './Icones'
import { calcularEncargos } from '../lib/encargos'
import { formatarMoeda, hojeBrasil } from '../lib/format'
import { linkWhatsApp, mensagemCobranca } from '../lib/whatsapp'
import type { RecebimentoDetalhado } from '../types/database'

/**
 * Botão "Cobrar"/"Lembrar" pelo WhatsApp. Se o aluguel está atrasado e tem multa/juros,
 * abre uma janela para escolher se a mensagem leva os encargos ou só o valor do aluguel.
 */
export function BotaoCobrar({ r, cobrarPadrao }: { r: RecebimentoDetalhado; cobrarPadrao: boolean }) {
  const [aberto, setAberto] = useState(false)
  const atrasado = r.situacao === 'atrasado'
  const rotulo = atrasado ? 'Cobrar' : 'Lembrar'
  const enc = atrasado
    ? calcularEncargos(Number(r.valor_previsto), r.data_vencimento, hojeBrasil(), r.multa_atraso_percentual, r.juros_atraso_percentual)
    : null

  if (!enc || enc.total <= 0) {
    return (
      <a className="botao botao--pequeno botao--whatsapp" href={linkWhatsApp(r.inquilino_telefone, mensagemCobranca(r, false))}
        target="_blank" rel="noreferrer" title={atrasado ? 'Cobrar pelo WhatsApp' : 'Lembrete pelo WhatsApp'}>
        <IconeWhatsApp /> {rotulo}
      </a>
    )
  }
  return (
    <>
      <button type="button" className="botao botao--pequeno botao--whatsapp" onClick={() => setAberto(true)} title="Cobrar pelo WhatsApp">
        <IconeWhatsApp /> {rotulo}
      </button>
      {aberto && <EscolherCobranca r={r} cobrarPadrao={cobrarPadrao} aoFechar={() => setAberto(false)} />}
    </>
  )
}

function EscolherCobranca({ r, cobrarPadrao, aoFechar }: { r: RecebimentoDetalhado; cobrarPadrao: boolean; aoFechar: () => void }) {
  const [comEncargos, setComEncargos] = useState(cobrarPadrao)
  const valor = Number(r.valor_previsto)
  const enc = calcularEncargos(valor, r.data_vencimento, hojeBrasil(), r.multa_atraso_percentual, r.juros_atraso_percentual)
  const mensagem = mensagemCobranca(r, comEncargos)
  const opcao = (valorOpcao: boolean, titulo: string, total: number, detalhe: string) => (
    <label className={`opcao-cobranca ${comEncargos === valorOpcao ? 'opcao-cobranca--ativa' : ''}`}>
      <input type="radio" name="encargos" checked={comEncargos === valorOpcao} onChange={() => setComEncargos(valorOpcao)} />
      <span>
        <strong>{titulo}</strong> <span className="opcao-cobranca__valor">{formatarMoeda(total)}</span>
        <span className="texto-suave texto-pequeno opcao-cobranca__detalhe">{detalhe}</span>
      </span>
    </label>
  )
  return (
    <Modal titulo={`Cobrar ${r.inquilino_nome.split(' ')[0]} pelo WhatsApp`} aoFechar={aoFechar}>
      <p className="texto-suave paragrafo">Aluguel atrasado há {enc.dias} {enc.dias === 1 ? 'dia' : 'dias'}. O que deseja cobrar?</p>
      <div className="opcoes-cobranca" role="radiogroup">
        {opcao(true, 'Com multa e juros', valor + enc.total,
          `Aluguel ${formatarMoeda(valor)} + multa ${formatarMoeda(enc.multa)} + juros ${formatarMoeda(enc.juros)}`)}
        {opcao(false, 'Só o aluguel', valor, 'Sem multa e sem juros')}
      </div>
      <p className="subtitulo-form">Mensagem que será enviada</p>
      <div className="previa-mensagem">{mensagem}</div>
      <div className="acoes-form">
        <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
        <a className="botao botao--whatsapp" href={linkWhatsApp(r.inquilino_telefone, mensagem)} target="_blank" rel="noreferrer" onClick={aoFechar}>
          <IconeWhatsApp /> Abrir WhatsApp
        </a>
      </div>
    </Modal>
  )
}
