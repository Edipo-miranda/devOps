import { MESES, mesAtualBrasil } from '../lib/format'

interface Props {
  ano: number
  mes: number | null
  aoMudar: (ano: number, mes: number | null) => void
  permitirTodos?: boolean
}

/** Seletores de mês e ano, com botões para o mês anterior/seguinte. */
export function FiltroPeriodo({ ano, mes, aoMudar, permitirTodos }: Props) {
  const atual = mesAtualBrasil().ano
  const anos: number[] = []
  for (let a = atual + 1; a >= Math.min(atual - 6, ano); a--) anos.push(a)

  function deslocar(delta: number) {
    if (mes === null) return aoMudar(ano + delta, null)
    const total = ano * 12 + (mes - 1) + delta
    aoMudar(Math.floor(total / 12), (total % 12) + 1)
  }

  return (
    <div className="filtro-periodo">
      <button type="button" className="botao botao--icone" onClick={() => deslocar(-1)} aria-label="Período anterior">‹</button>
      <select
        aria-label="Mês"
        value={mes ?? ''}
        onChange={(e) => aoMudar(ano, e.target.value ? Number(e.target.value) : null)}
      >
        {permitirTodos && <option value="">Todos os meses</option>}
        {MESES.map((nome, i) => (
          <option key={nome} value={i + 1}>{nome}</option>
        ))}
      </select>
      <select aria-label="Ano" value={ano} onChange={(e) => aoMudar(Number(e.target.value), mes)}>
        {anos.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <button type="button" className="botao botao--icone" onClick={() => deslocar(1)} aria-label="Próximo período">›</button>
    </div>
  )
}
