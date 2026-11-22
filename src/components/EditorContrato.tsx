import { useState } from 'react'
import { Campo } from './CamposLocacao'
import { CAMPOS_MODELO, type TextoContrato } from '../lib/contrato'

/** Textarea com altura de acordo com o texto. */
function AreaTexto({ valor, aoMudar, placeholder }: { valor: string; aoMudar: (v: string) => void; placeholder?: string }) {
  const linhas = Math.min(14, Math.max(2, Math.ceil(valor.length / 95) + (valor.match(/\n/g)?.length ?? 0)))
  return <textarea rows={linhas} value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder={placeholder} />
}

// Parágrafos são separados por uma linha em branco na caixa de texto.
const juntar = (ps: string[]) => ps.join('\n\n')
const separar = (t: string) => t.split(/\n\s*\n/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean)

interface Props {
  texto: TextoContrato
  aoMudar: (t: TextoContrato) => void
}

/** Edição livre do contrato: títulos, abertura, cláusulas (adicionar, remover, mover) e disposições finais. */
export function EditorContrato({ texto, aoMudar }: Props) {
  const [mostrarCampos, setMostrarCampos] = useState(false)
  const set = (parcial: Partial<TextoContrato>) => aoMudar({ ...texto, ...parcial })
  const mudarClausula = (i: number, c: Partial<TextoContrato['clausulas'][number]>) =>
    set({ clausulas: texto.clausulas.map((x, j) => (j === i ? { ...x, ...c } : x)) })
  const mover = (i: number, d: -1 | 1) => {
    const lista = [...texto.clausulas]
    const [c] = lista.splice(i, 1)
    lista.splice(i + d, 0, c)
    set({ clausulas: lista })
  }

  return (
    <div className="editor-contrato">
      <p className="alerta alerta--info">
        Edite à vontade. Para separar parágrafos, deixe uma <strong>linha em branco</strong>. A numeração das cláusulas é automática.
        As assinaturas, a cidade e a data entram sozinhas no final.{' '}
        <button type="button" className="botao-link" onClick={() => setMostrarCampos(!mostrarCampos)}>
          {mostrarCampos ? 'Esconder campos automáticos' : 'Ver campos automáticos'}
        </button>
      </p>
      {mostrarCampos && (
        <div className="campos-modelo">
          <p className="texto-pequeno">
            Em modelos, estes campos são trocados pelos dados de cada locação. Ao salvar, o app já troca os dados deste contrato pelos campos.
          </p>
          <ul>
            {CAMPOS_MODELO.map((c) => (
              <li key={c.campo}><code>{`{{${c.campo}}}`}</code> <span className="texto-suave">{c.descricao}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="grade-2">
        <Campo rotulo="Título">
          <input value={texto.titulo} onChange={(e) => set({ titulo: e.target.value })} />
        </Campo>
        <Campo rotulo="Subtítulo" dica="opcional">
          <input value={texto.subtitulo} onChange={(e) => set({ subtitulo: e.target.value })} />
        </Campo>
      </div>
      <Campo rotulo={texto.tituloAbertura || 'Abertura'} dica="qualificação das partes">
        <AreaTexto valor={juntar(texto.partes)} aoMudar={(v) => set({ partes: separar(v) })} />
      </Campo>

      {texto.clausulas.map((c, i) => (
        <div key={i} className="editor-clausula">
          <div className="editor-clausula__topo">
            <span className="editor-clausula__numero">Cláusula {i + 1}ª</span>
            <input value={c.titulo} onChange={(e) => mudarClausula(i, { titulo: e.target.value })} aria-label={`Título da cláusula ${i + 1}`} placeholder="TÍTULO DA CLÁUSULA" />
            <div className="grupo-botoes">
              <button type="button" className="botao botao--pequeno botao--discreto" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
              <button type="button" className="botao botao--pequeno botao--discreto" disabled={i === texto.clausulas.length - 1} onClick={() => mover(i, 1)} aria-label="Descer">↓</button>
              <button type="button" className="botao botao--pequeno botao--discreto botao--texto-perigo"
                onClick={() => window.confirm(`Remover a cláusula ${i + 1}ª (${c.titulo})?`) && set({ clausulas: texto.clausulas.filter((_, j) => j !== i) })}>
                Remover
              </button>
            </div>
          </div>
          <AreaTexto valor={juntar(c.paragrafos)} aoMudar={(v) => mudarClausula(i, { paragrafos: separar(v) })} placeholder="Texto da cláusula…" />
        </div>
      ))}

      <button type="button" className="botao paragrafo" onClick={() => set({ clausulas: [...texto.clausulas, { titulo: 'NOVA CLÁUSULA', paragrafos: [''] }] })}>
        + Nova cláusula
      </button>

      <Campo rotulo={texto.tituloFinais || 'Disposições finais'}>
        <AreaTexto valor={juntar(texto.finais)} aoMudar={(v) => set({ finais: separar(v) })} />
      </Campo>
    </div>
  )
}
