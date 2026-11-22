// Padronização de textos digitados (nomes, endereços, profissões).

/** Palavras que ficam em minúsculas no meio de nomes próprios e endereços. */
const MINUSCULAS = new Set(['da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos', 'a', 'o', 'à', 'ao', 'com', 'sem', 'para', 'por'])

/** Siglas que devem ficar em maiúsculas (estados, tipos de logradouro abreviados etc.). */
const SIGLAS = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii', 'ltda', 'eireli', 'cep', 'br', 'sp', 'pr', 'rj', 'mg', 'sc', 'rs', 'df'])

function capitalizarPalavra(palavra: string): string {
  if (!palavra) return palavra
  // Partes separadas por hífen ou apóstrofo: "Pé-de-Moleque" -> "Pé-de-Moleque", "d'Ávila"
  return palavra
    .split(/([-'’])/)
    .map((parte, i) => {
      if (parte === '-' || parte === "'" || parte === '’') return parte
      const min = parte.toLocaleLowerCase('pt-BR')
      if (i > 0 && MINUSCULAS.has(min)) return min
      if (min === 'd' && i === 0) return 'd' // d'Ávila
      return min.charAt(0).toLocaleUpperCase('pt-BR') + min.slice(1)
    })
    .join('')
}

/**
 * Deixa a primeira letra de cada palavra maiúscula, como em nomes próprios:
 * "maria DA silva" -> "Maria da Silva", "rua tertuliano margarido" -> "Rua Tertuliano Margarido".
 * Mantém em maiúsculas siglas conhecidas e palavras com números ("BR-153", "12B").
 */
export function capitalizarNome(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (!limpo) return ''
  return limpo
    .split(' ')
    .map((palavra, i) => {
      const min = palavra.toLocaleLowerCase('pt-BR')
      if (/\d/.test(palavra)) return palavra.toLocaleUpperCase('pt-BR')
      if (SIGLAS.has(min.replace(/\.$/, ''))) return palavra.toLocaleUpperCase('pt-BR')
      if (i > 0 && MINUSCULAS.has(min)) return min
      return capitalizarPalavra(palavra)
    })
    .join(' ')
}

/** Profissão, nacionalidade e estado civil vão em minúsculas no meio da frase: "Analista" -> "analista". */
export function minusculas(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR')
}

/** Só a primeira letra da frase em maiúscula: "apto 101" -> "Apto 101". */
export function primeiraMaiuscula(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.charAt(0).toLocaleUpperCase('pt-BR') + limpo.slice(1)
}
