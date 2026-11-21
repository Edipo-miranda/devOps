import { useCallback, useEffect, useRef, useState } from 'react'
import { mensagemDeErro } from './erros'

/**
 * Carrega dados do banco sempre que `deps` mudar.
 * Enquanto recarrega, mantém os dados anteriores na tela (evita "piscar").
 */
export function useCarregar<T>(buscar: () => Promise<T>, deps: unknown[]) {
  const [versao, setVersao] = useState(0)
  const chave = `${JSON.stringify(deps)}#${versao}`
  const [estado, setEstado] = useState<{ chave: string; dados?: T; erro?: string } | null>(null)
  const buscarRef = useRef(buscar)
  useEffect(() => {
    buscarRef.current = buscar
  })

  useEffect(() => {
    let ativo = true
    buscarRef.current().then(
      (dados) => ativo && setEstado({ chave, dados }),
      (erro) => ativo && setEstado((ant) => ({ chave, dados: ant?.dados, erro: mensagemDeErro(erro) })),
    )
    return () => {
      ativo = false
    }
  }, [chave])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  return {
    dados: estado?.dados,
    erro: estado?.chave === chave ? estado.erro : undefined,
    carregando: estado?.chave !== chave,
    recarregar,
  }
}
