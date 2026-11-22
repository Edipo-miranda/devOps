import type { DadosNovaLocacao } from './api'
import { cpfValido } from './documentos'
import { REGEX_DATA, hojeBrasil, lerValor, valorParaCampo } from './format'
import { pessoaForm, validarPessoa, type Erros, type PessoaForm } from './formularios'
import type { CondicoesContrato, Finalidade, Garantia } from '../types/database'

// ------------------------------------------------------ Condições do contrato

export interface CondicoesForm {
  finalidade: Finalidade
  garantia: Garantia
  valorGarantia: string
  fiadorNome: string
  fiadorCpf: string
  fiadorQualificacao: string
  multaAtraso: string // % (texto do contrato; o app não calcula)
  jurosAtraso: string // % ao mês
  multaRescisao: string // quantidade de aluguéis
  encargos: string
  foro: string
  clausulas: string
}

export const ENCARGOS_PADRAO =
  'consumo de água, energia elétrica e gás, taxas condominiais ordinárias e IPTU proporcional ao período da locação'

export function condicoesForm(c?: Partial<CondicoesContrato> | null): CondicoesForm {
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','))
  return {
    finalidade: c?.finalidade ?? 'residencial',
    garantia: c?.garantia ?? 'nenhuma',
    valorGarantia: c?.valor_garantia ? valorParaCampo(c.valor_garantia) : '',
    fiadorNome: c?.fiador_nome ?? '',
    fiadorCpf: c?.fiador_cpf ?? '',
    fiadorQualificacao: c?.fiador_qualificacao ?? '',
    multaAtraso: c ? n(c.multa_atraso_percentual) : '10',
    jurosAtraso: c ? n(c.juros_atraso_percentual) : '1',
    multaRescisao: c ? n(c.multa_rescisao_alugueis) : '3',
    encargos: c ? (c.encargos_locatario ?? '') : ENCARGOS_PADRAO,
    foro: c?.foro ?? '',
    clausulas: c?.clausulas_adicionais ?? '',
  }
}

/** Lê um número decimal opcional ("2,5" ou "2.5"). undefined = inválido. */
function lerNumero(texto: string, min: number, max: number): number | null | undefined {
  if (!texto.trim()) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined
}

export function validarCondicoes(f: CondicoesForm): { erros: Erros; dados: CondicoesContrato } {
  const erros: Erros = {}
  const valorGarantia = f.valorGarantia.trim() ? lerValor(f.valorGarantia) : null
  if (f.valorGarantia.trim() && (valorGarantia === null || valorGarantia <= 0)) erros.valorGarantia = 'Valor inválido.'
  if (f.garantia === 'caucao' && !valorGarantia) erros.valorGarantia = 'Informe o valor da caução.'
  if (f.garantia === 'fiador') {
    if (f.fiadorNome.trim().length < 2) erros.fiadorNome = 'Informe o nome do fiador.'
    if (f.fiadorCpf && !cpfValido(f.fiadorCpf)) erros.fiadorCpf = 'CPF inválido.'
  }
  const multa = lerNumero(f.multaAtraso, 0, 100)
  const juros = lerNumero(f.jurosAtraso, 0, 100)
  const rescisao = lerNumero(f.multaRescisao, 0, 12)
  if (multa === undefined) erros.multaAtraso = 'De 0 a 100.'
  if (juros === undefined) erros.jurosAtraso = 'De 0 a 100.'
  if (rescisao === undefined) erros.multaRescisao = 'De 0 a 12 aluguéis.'
  if (f.clausulas.length > 5000) erros.clausulas = 'Máximo de 5.000 caracteres.'
  const fiador = f.garantia === 'fiador'
  return {
    erros,
    dados: {
      finalidade: f.finalidade,
      garantia: f.garantia,
      valor_garantia: valorGarantia,
      fiador_nome: fiador ? f.fiadorNome.trim() || null : null,
      fiador_cpf: fiador ? f.fiadorCpf || null : null,
      fiador_qualificacao: fiador ? f.fiadorQualificacao.trim() || null : null,
      multa_atraso_percentual: multa ?? null,
      juros_atraso_percentual: juros ?? null,
      multa_rescisao_alugueis: rescisao ?? null,
      encargos_locatario: f.encargos.trim() || null,
      foro: f.foro.trim() || null,
      clausulas_adicionais: f.clausulas.trim() || null,
    },
  }
}

// ---------------------------------------------------------------- Locação

export interface ValoresLocacao {
  modoInquilino: 'novo' | 'existente'
  inquilinoId: string
  inquilino: PessoaForm
  dataEntrada: string
  valor: string
  dia: string
  prazo: string // meses; vazio = indeterminado
  reajuste: string // meses; vazio = sem reajuste
  condicoes: CondicoesForm
}

export type ErrosLocacao = Erros

export function valoresLocacaoIniciais(): ValoresLocacao {
  return {
    modoInquilino: 'novo',
    inquilinoId: '',
    inquilino: pessoaForm(),
    dataEntrada: hojeBrasil(),
    valor: '',
    dia: '',
    prazo: '12',
    reajuste: '12',
    condicoes: condicoesForm(),
  }
}

/**
 * Valida os campos. Erros do inquilino vêm com prefixo "inq." e das condições
 * com "cond."; retorna os dados prontos para gravar quando não há erros.
 */
export function validarLocacao(v: ValoresLocacao): { erros: ErrosLocacao; dados: DadosNovaLocacao | null } {
  const erros: Erros = {}

  let inquilino: DadosNovaLocacao['inquilino'] = null
  if (v.modoInquilino === 'existente') {
    if (!v.inquilinoId) erros.inquilinoId = 'Escolha o inquilino.'
  } else {
    const p = validarPessoa(v.inquilino)
    for (const [k, m] of Object.entries(p.erros)) erros['inq.' + k] = m
    const { documento, ...resto } = p.dados
    inquilino = { ...resto, cpf: documento }
  }

  if (!REGEX_DATA.test(v.dataEntrada)) erros.dataEntrada = 'Informe a data de entrada.'
  const valor = lerValor(v.valor)
  if (valor === null || valor <= 0) erros.valor = 'Informe um valor válido, por exemplo 1.500,00.'
  else if (valor >= 10_000_000) erros.valor = 'Valor muito alto.'
  const dia = Number(v.dia)
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) erros.dia = 'Informe um dia entre 1 e 31.'

  const contrato = validarContrato(v)
  Object.assign(erros, contrato.erros)
  const cond = validarCondicoes(v.condicoes)
  for (const [k, m] of Object.entries(cond.erros)) erros['cond.' + k] = m

  if (Object.keys(erros).length) return { erros, dados: null }
  return {
    erros,
    dados: {
      inquilino_id: v.modoInquilino === 'existente' ? v.inquilinoId : null,
      inquilino,
      locacao: {
        data_entrada: v.dataEntrada,
        valor_aluguel: valor!,
        dia_vencimento: dia,
        prazo_meses: contrato.prazo,
        reajuste_meses: contrato.reajuste,
        ...cond.dados,
      },
    },
  }
}

/** Separa os erros com prefixo (ex.: "inq.nome" -> { nome }). */
export function errosComPrefixo(erros: Erros, prefixo: string): Erros {
  const r: Erros = {}
  for (const [k, m] of Object.entries(erros)) if (k.startsWith(prefixo)) r[k.slice(prefixo.length)] = m
  return r
}

/** Lê um número de meses opcional. Retorna undefined quando inválido. */
function lerMeses(texto: string, maximo: number): number | null | undefined {
  if (!texto.trim()) return null
  const n = Number(texto)
  return Number.isInteger(n) && n >= 1 && n <= maximo ? n : undefined
}

export interface ValoresContrato {
  prazo: string
  reajuste: string
}

/** Valida o prazo do contrato e a periodicidade do reajuste. */
export function validarContrato(v: ValoresContrato) {
  const erros: Erros = {}
  const prazo = lerMeses(v.prazo, 240)
  const reajuste = lerMeses(v.reajuste, 120)
  if (prazo === undefined) erros.prazo = 'Informe de 1 a 240 meses, ou deixe vazio (indeterminado).'
  if (reajuste === undefined) erros.reajuste = 'Informe de 1 a 120 meses, ou deixe vazio (sem reajuste).'
  return { erros, prazo: prazo ?? null, reajuste: reajuste ?? null }
}
