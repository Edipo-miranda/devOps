// Mensagens de cobrança/lembrete pelo WhatsApp (abre o app com o texto pronto).
import { calcularEncargos } from './encargos'
import { formatarData, formatarMesReferencia, formatarMoeda, hojeBrasil } from './format'
import type { RecebimentoDetalhado } from '../types/database'

/** Telefone brasileiro no formato do WhatsApp: "5543999998888". null se não der para usar. */
export function telefoneWhatsApp(telefone: string | null): string | null {
  if (!telefone) return null
  let d = telefone.replace(/\D/g, '')
  if (d.startsWith('0')) d = d.replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return d.length >= 12 && d.length <= 13 ? d : null
}

/** Texto da cobrança: lembrete (a vencer) ou cobrança (atrasado, com multa e juros se cobrar). */
export function mensagemCobranca(r: RecebimentoDetalhado, cobrarEncargos: boolean): string {
  const primeiroNome = r.inquilino_nome.split(' ')[0]
  const valor = Number(r.valor_previsto)
  const ref = formatarMesReferencia(r.mes_referencia).toLowerCase()
  const linhas: string[] = []
  if (r.situacao === 'atrasado') {
    const enc = calcularEncargos(valor, r.data_vencimento, hojeBrasil(), r.multa_atraso_percentual, r.juros_atraso_percentual)
    linhas.push(`Olá, ${primeiroNome}! Tudo bem?`)
    linhas.push(`Consta em aberto o aluguel de ${ref} do imóvel ${r.imovel_identificacao}, que venceu em ${formatarData(r.data_vencimento)} (${enc.dias} ${enc.dias === 1 ? 'dia' : 'dias'} de atraso).`)
    if (cobrarEncargos && enc.total > 0) {
      linhas.push(`Valor do aluguel: ${formatarMoeda(valor)}`)
      linhas.push(`Multa e juros até hoje: ${formatarMoeda(enc.total)}`)
      linhas.push(`*Total para pagamento hoje: ${formatarMoeda(valor + enc.total)}*`)
    } else {
      linhas.push(`*Valor: ${formatarMoeda(valor)}*`)
    }
  } else {
    linhas.push(`Olá, ${primeiroNome}! Tudo bem?`)
    linhas.push(`Passando para lembrar do aluguel de ${ref} do imóvel ${r.imovel_identificacao}.`)
    linhas.push(`*Valor: ${formatarMoeda(valor)}* — vencimento em ${formatarData(r.data_vencimento)}.`)
  }
  if (r.proprietario_pix) {
    linhas.push('')
    linhas.push(`Pagamento via PIX: ${r.proprietario_pix}${r.proprietario_nome ? ` (${r.proprietario_nome})` : ''}`)
  }
  linhas.push('')
  linhas.push('Se já pagou, por favor desconsidere e me envie o comprovante. Obrigado!')
  return linhas.join('\n')
}

/** Link que abre o WhatsApp com a mensagem pronta (no contato do inquilino, se houver telefone). */
export function linkWhatsApp(telefone: string | null, mensagem: string): string {
  const numero = telefoneWhatsApp(telefone)
  const texto = encodeURIComponent(mensagem)
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`
}
