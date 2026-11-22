import { ConfirmarExclusao } from './ConfirmarExclusao'
import { excluirInquilino, movimentacaoInquilino } from '../lib/api'
import { useCarregar } from '../lib/useCarregar'
import type { Inquilino } from '../types/database'

/** Confirmação de exclusão do inquilino, mostrando tudo que será apagado junto. */
export function ExcluirInquilino({ inquilino, aoFechar, aoExcluir }: { inquilino: Pick<Inquilino, 'id' | 'nome'>; aoFechar: () => void; aoExcluir: () => void }) {
  const { dados: mov, erro } = useCarregar(() => movimentacaoInquilino(inquilino.id), [inquilino.id])

  return (
    <ConfirmarExclusao
      titulo="Excluir inquilino"
      aoFechar={aoFechar}
      aoConfirmar={async () => {
        await excluirInquilino(inquilino.id)
        aoExcluir()
      }}
    >
      <p>
        Você vai excluir <strong>{inquilino.nome}</strong>.{' '}
        {mov && mov.locacoes + mov.lancamentos > 0 ? 'Isso apagará toda a movimentação dele:' : 'Este inquilino não tem movimentação.'}
      </p>
      {erro && <p>Não foi possível conferir a movimentação: {erro}</p>}
      {!mov && !erro && <p>Conferindo a movimentação…</p>}
      {mov && mov.locacoes + mov.lancamentos > 0 && (
        <ul className="lista-pendencias">
          <li>{mov.locacoes} locação(ões){mov.imoveis.length ? ` (${mov.imoveis.join(', ')})` : ''}{mov.ativas ? ` — ${mov.ativas} ativa(s): o imóvel ficará vago` : ''}</li>
          <li>{mov.lancamentos} lançamento(s) de aluguel, sendo <strong>{mov.pagos} pago(s)</strong></li>
          <li>histórico de reajustes dessas locações</li>
        </ul>
      )}
      <p>Os imóveis <strong>não</strong> são apagados.</p>
    </ConfirmarExclusao>
  )
}
