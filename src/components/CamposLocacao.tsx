import type { Inquilino } from '../types/database'
import type { ErrosLocacao, ValoresLocacao } from '../lib/validacaoLocacao'

interface Props {
  valores: ValoresLocacao
  erros: ErrosLocacao
  inquilinos: Inquilino[]
  aoMudar: (v: ValoresLocacao) => void
}

/** Campos do inquilino e da locação (usados em "Novo imóvel" e "Novo inquilino"). */
export function CamposLocacao({ valores, erros, inquilinos, aoMudar }: Props) {
  const set = <K extends keyof ValoresLocacao>(k: K, val: ValoresLocacao[K]) => aoMudar({ ...valores, [k]: val })

  return (
    <>
      {inquilinos.length > 0 && (
        <div className="alternador" role="radiogroup" aria-label="Inquilino">
          <button type="button" role="radio" aria-checked={valores.modoInquilino === 'novo'}
            className={valores.modoInquilino === 'novo' ? 'ativo' : ''} onClick={() => set('modoInquilino', 'novo')}>
            Novo inquilino
          </button>
          <button type="button" role="radio" aria-checked={valores.modoInquilino === 'existente'}
            className={valores.modoInquilino === 'existente' ? 'ativo' : ''} onClick={() => set('modoInquilino', 'existente')}>
            Já cadastrado
          </button>
        </div>
      )}

      {valores.modoInquilino === 'existente' ? (
        <Campo rotulo="Inquilino" erro={erros.inquilinoId}>
          <select value={valores.inquilinoId} onChange={(e) => set('inquilinoId', e.target.value)}>
            <option value="">Selecione…</option>
            {inquilinos.map((i) => (
              <option key={i.id} value={i.id}>{i.nome}{i.telefone ? ` — ${i.telefone}` : ''}</option>
            ))}
          </select>
        </Campo>
      ) : (
        <div className="grade-2">
          <Campo rotulo="Nome do inquilino" erro={erros.nome}>
            <input value={valores.nome} onChange={(e) => set('nome', e.target.value)} maxLength={150} autoComplete="off" />
          </Campo>
          <Campo rotulo="Telefone" dica="opcional" erro={erros.telefone}>
            <input value={valores.telefone} onChange={(e) => set('telefone', e.target.value)} inputMode="tel"
              placeholder="(11) 98765-4321" maxLength={20} autoComplete="off" />
          </Campo>
        </div>
      )}

      <div className="grade-3">
        <Campo rotulo="Data de entrada" erro={erros.dataEntrada}>
          <input type="date" value={valores.dataEntrada} onChange={(e) => set('dataEntrada', e.target.value)} />
        </Campo>
        <Campo rotulo="Valor do aluguel (R$)" erro={erros.valor}>
          <input value={valores.valor} onChange={(e) => set('valor', e.target.value)} inputMode="decimal" placeholder="1.500,00" />
        </Campo>
        <Campo rotulo="Dia de vencimento" erro={erros.dia}>
          <input type="number" min={1} max={31} value={valores.dia} onChange={(e) => set('dia', e.target.value)} placeholder="10" />
        </Campo>
      </div>
    </>
  )
}

export function Campo({ rotulo, dica, erro, children }: { rotulo: string; dica?: string; erro?: string; children: React.ReactNode }) {
  return (
    <label className={`campo ${erro ? 'campo--erro' : ''}`}>
      <span>
        {rotulo} {dica && <small className="texto-suave">({dica})</small>}
      </span>
      {children}
      {erro && <small className="campo__erro">{erro}</small>}
    </label>
  )
}
