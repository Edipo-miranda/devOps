import type { SituacaoRecebimento } from '../types/database'

const ROTULO_SITUACAO: Record<SituacaoRecebimento, string> = {
  em_aberto: 'Em aberto',
  pago: 'Pago',
  atrasado: 'Atrasado',
}

const CLASSE: Record<SituacaoRecebimento, string> = {
  em_aberto: 'selo--aberto',
  pago: 'selo--pago',
  atrasado: 'selo--atrasado',
}

export function SeloSituacao({ situacao, diasAtraso }: { situacao: SituacaoRecebimento; diasAtraso?: number }) {
  return (
    <span className={`selo ${CLASSE[situacao]}`}>
      {ROTULO_SITUACAO[situacao]}
      {situacao === 'atrasado' && diasAtraso ? ` · ${diasAtraso} ${diasAtraso === 1 ? 'dia' : 'dias'}` : ''}
    </span>
  )
}
