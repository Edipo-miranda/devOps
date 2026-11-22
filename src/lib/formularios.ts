// Estado e validação dos blocos de formulário reaproveitados (endereço e dados pessoais).
import { cnpjValido, cpfValido } from './documentos'
import { REGEX_DATA, REGEX_TELEFONE } from './format'
import { capitalizarNome, minusculas } from './texto'
import type { Endereco, Genero } from '../types/database'

export type Erros = Record<string, string>

const vazio = (t: string) => t.trim() === ''
const ouNulo = (t: string) => t.trim() || null
const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// ---------------------------------------------------------------- Endereço

export interface EnderecoForm {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export function enderecoForm(e?: Partial<Endereco> | null): EnderecoForm {
  return {
    cep: e?.cep ?? '',
    logradouro: e?.logradouro ?? '',
    numero: e?.numero ?? '',
    complemento: e?.complemento ?? '',
    bairro: e?.bairro ?? '',
    cidade: e?.cidade ?? '',
    uf: e?.uf ?? '',
  }
}

/** Valida o endereço. Com `obrigatorio`, exige rua, número, bairro, cidade e UF. */
export function validarEndereco(f: EnderecoForm, obrigatorio: boolean, prefixo = ''): { erros: Erros; dados: Endereco } {
  const erros: Erros = {}
  if (f.cep && !/^\d{5}-\d{3}$/.test(f.cep)) erros[prefixo + 'cep'] = 'CEP incompleto (00000-000).'
  if (obrigatorio) {
    if (vazio(f.logradouro)) erros[prefixo + 'logradouro'] = 'Informe a rua/avenida.'
    if (vazio(f.numero)) erros[prefixo + 'numero'] = 'Informe o número (ou "s/n").'
    if (vazio(f.bairro)) erros[prefixo + 'bairro'] = 'Informe o bairro.'
    if (vazio(f.cidade)) erros[prefixo + 'cidade'] = 'Informe a cidade.'
    if (vazio(f.uf)) erros[prefixo + 'uf'] = 'Escolha o estado.'
  }
  return {
    erros,
    dados: {
      cep: ouNulo(f.cep),
      logradouro: ouNulo(capitalizarNome(f.logradouro)),
      numero: ouNulo(f.numero.toLocaleUpperCase('pt-BR')),
      complemento: ouNulo(capitalizarNome(f.complemento)),
      bairro: ouNulo(capitalizarNome(f.bairro)),
      cidade: ouNulo(capitalizarNome(f.cidade)),
      uf: ouNulo(f.uf),
    },
  }
}

// ----------------------------------------------------------- Dados pessoais

export interface PessoaForm {
  nome: string
  telefone: string
  documento: string // CPF (ou CNPJ para proprietário pessoa jurídica)
  rg: string
  orgao_emissor: string
  nacionalidade: string
  estado_civil: string
  profissao: string
  email: string
  data_nascimento: string
  genero: '' | Genero
  endereco: EnderecoForm
}

export function pessoaForm(p?: Record<string, unknown> | null): PessoaForm {
  const s = (k: string) => (typeof p?.[k] === 'string' ? (p[k] as string) : '')
  return {
    nome: s('nome'),
    telefone: s('telefone'),
    documento: s('cpf') || s('cpf_cnpj'),
    rg: s('rg'),
    orgao_emissor: s('orgao_emissor'),
    nacionalidade: s('nacionalidade') || (p ? '' : 'brasileira'),
    estado_civil: s('estado_civil'),
    profissao: s('profissao'),
    email: s('email'),
    data_nascimento: s('data_nascimento'),
    genero: (s('genero') as PessoaForm['genero']) || '',
    endereco: enderecoForm(p as Partial<Endereco> | null),
  }
}

/** Valida nome, telefone, CPF/CNPJ, e-mail etc. Só o nome é obrigatório. Padroniza maiúsculas/minúsculas. */
export function validarPessoa(f: PessoaForm, juridica = false) {
  const erros: Erros = {}
  if (f.nome.trim().length < 2) erros.nome = 'Informe o nome completo.'
  else if (f.nome.trim().length > 150) erros.nome = 'Nome muito longo.'
  if (f.telefone.trim() && !REGEX_TELEFONE.test(f.telefone.trim())) erros.telefone = 'Telefone inválido.'
  if (f.documento) {
    if (juridica ? !cnpjValido(f.documento) : !cpfValido(f.documento)) erros.documento = juridica ? 'CNPJ inválido.' : 'CPF inválido.'
  }
  if (f.email.trim() && !REGEX_EMAIL.test(f.email.trim())) erros.email = 'E-mail inválido.'
  if (f.data_nascimento && !REGEX_DATA.test(f.data_nascimento)) erros.data_nascimento = 'Data inválida.'
  const end = validarEndereco(f.endereco, false, 'end_')
  Object.assign(erros, end.erros)
  return {
    erros,
    dados: {
      nome: juridica ? f.nome.replace(/\s+/g, ' ').trim() : capitalizarNome(f.nome),
      telefone: ouNulo(f.telefone),
      documento: ouNulo(f.documento),
      rg: ouNulo(f.rg.toLocaleUpperCase('pt-BR')),
      orgao_emissor: ouNulo(f.orgao_emissor.toLocaleUpperCase('pt-BR')),
      nacionalidade: ouNulo(minusculas(f.nacionalidade)),
      estado_civil: ouNulo(f.estado_civil),
      profissao: ouNulo(minusculas(f.profissao)),
      email: ouNulo(f.email.toLocaleLowerCase('pt-BR')),
      data_nascimento: f.data_nascimento || null,
      genero: f.genero || null,
      ...end.dados,
    },
  }
}
