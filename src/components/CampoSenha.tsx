import { useState } from 'react'
import { IconeOlho, IconeOlhoFechado } from './Icones'

interface Props {
  valor: string
  aoMudar: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
}

/** Campo de senha com botão de olho para mostrar/esconder o que foi digitado. */
export function CampoSenha({ valor, aoMudar, autoComplete }: Props) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="campo-senha">
      <input
        type={visivel ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="campo-senha__olho"
        onClick={() => setVisivel(!visivel)}
        aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'}
        title={visivel ? 'Esconder senha' : 'Mostrar senha'}
      >
        {visivel ? <IconeOlhoFechado tamanho={18} /> : <IconeOlho tamanho={18} />}
      </button>
    </div>
  )
}
