import type { DadosNovaLocacao } from './api'
import { REGEX_DATA, REGEX_TELEFONE, hojeBrasil, lerValor } from './format'

export interface ValoresLocacao {
  modoInquilino: 'novo' | 'existente'
  inquilinoId: string
  nome: string
  telefone: string
  dataEntrada: string
  valor: string
  dia: string
}

export type ErrosLocacao = Partial<Record<keyof ValoresLocacao, string>>

export function valoresLocacaoIniciais(): ValoresLocacao {
  return { modoInquilino: 'novo', inquilinoId: '', nome: '', telefone: '', dataEntrada: hojeBrasil(), valor: '', dia: '' }
}

/** Valida os campos. Retorna os erros encontrados e, se não houver, os dados prontos para gravar. */
export function validarLocacao(v: ValoresLocacao): { erros: ErrosLocacao; dados: DadosNovaLocacao | null } {
  const erros: ErrosLocacao = {}

  if (v.modoInquilino === 'existente') {
    if (!v.inquilinoId) erros.inquilinoId = 'Escolha o inquilino.'
  } else {
    if (v.nome.trim().length < 2) erros.nome = 'Informe o nome do inquilino (mínimo 2 letras).'
    else if (v.nome.trim().length > 150) erros.nome = 'Nome muito longo.'
    if (v.telefone.trim() && !REGEX_TELEFONE.test(v.telefone.trim())) {
      erros.telefone = 'Telefone inválido. Use só números, espaços, parênteses, + e -.'
    }
  }

  if (!REGEX_DATA.test(v.dataEntrada)) erros.dataEntrada = 'Informe a data de entrada.'

  const valor = lerValor(v.valor)
  if (valor === null || valor <= 0) erros.valor = 'Informe um valor válido, por exemplo 1.500,00.'
  else if (valor >= 10_000_000) erros.valor = 'Valor muito alto.'

  const dia = Number(v.dia)
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) erros.dia = 'Informe um dia entre 1 e 31.'

  if (Object.keys(erros).length) return { erros, dados: null }
  return {
    erros,
    dados: {
      inquilino_id: v.modoInquilino === 'existente' ? v.inquilinoId : null,
      inquilino_nome: v.modoInquilino === 'novo' ? v.nome.trim() : null,
      inquilino_telefone: v.modoInquilino === 'novo' ? v.telefone.trim() || null : null,
      data_entrada: v.dataEntrada,
      valor_aluguel: valor!,
      dia_vencimento: dia,
    },
  }
}
