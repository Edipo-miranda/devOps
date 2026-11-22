// Máscaras, validações e textos usados em cadastros e no contrato.
import type { Endereco } from '../types/database'

const digitos = (t: string) => t.replace(/\D/g, '')

// ------------------------------------------------------------------ CPF/CNPJ

export function mascararCpf(t: string): string {
  const d = digitos(t).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

export function mascararCnpj(t: string): string {
  const d = digitos(t).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/** Confere os dígitos verificadores do CPF. */
export function cpfValido(t: string): boolean {
  const d = digitos(t)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const calc = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

/** Confere os dígitos verificadores do CNPJ. */
export function cnpjValido(t: string): boolean {
  const d = digitos(t)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

// --------------------------------------------------------------------- CEP

export function mascararCep(t: string): string {
  return digitos(t).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')
}

/**
 * Busca o endereço do CEP (serviços públicos e gratuitos: ViaCEP e, se falhar, BrasilAPI).
 * CEPs gerais de cidade (ex.: 86430-000) trazem só cidade e UF.
 * Retorna null se o CEP não existir ou se não houver internet.
 */
export async function buscarCep(cep: string): Promise<Partial<Endereco> | null> {
  const d = digitos(cep)
  if (d.length !== 8) return null
  const comTempo = (url: string) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t))
  }
  try {
    const r = await comTempo(`https://viacep.com.br/ws/${d}/json/`)
    if (r.ok) {
      const j = await r.json()
      if (j.erro) return null
      return { logradouro: j.logradouro || null, bairro: j.bairro || null, cidade: j.localidade || null, uf: j.uf || null }
    }
  } catch {
    // tenta o serviço reserva
  }
  try {
    const r = await comTempo(`https://brasilapi.com.br/api/cep/v2/${d}`)
    if (!r.ok) return null
    const j = await r.json()
    return { logradouro: j.street || null, bairro: j.neighborhood || null, cidade: j.city || null, uf: j.state || null }
  } catch {
    return null
  }
}

/** Endereço por extenso para o contrato: "Rua X, nº 10, apto 2, Bairro, Cidade/UF, CEP 00000-000". */
export function enderecoPorExtenso(e: Partial<Endereco>): string {
  const cidade = [e.cidade, e.uf].filter(Boolean).join('/')
  return [e.logradouro, e.numero ? `nº ${e.numero}` : null, e.complemento, e.bairro, cidade, e.cep ? `CEP ${e.cep}` : null]
    .filter(Boolean)
    .join(', ')
}

/** "Rua X, 10, apto 2 - Bairro - Cidade/UF - CEP 00000-000" (pula partes vazias). */
export function formatarEndereco(e: Partial<Endereco>, comCep = true): string {
  const rua = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ')
  const cidade = [e.cidade, e.uf].filter(Boolean).join('/')
  const partes = [rua, e.bairro, cidade]
  if (comCep && e.cep) partes.push(`CEP ${e.cep}`)
  return partes.filter(Boolean).join(' - ')
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export const ESTADOS_CIVIS = ['solteiro(a)', 'casado(a)', 'divorciado(a)', 'viúvo(a)', 'separado(a)', 'união estável']

export const TIPOS_IMOVEL = ['casa', 'apartamento', 'kitnet', 'sala comercial', 'loja', 'galpão', 'terreno', 'outro']

export const INDICES: Record<string, string> = {
  IPCA: 'IPCA (IBGE) — recomendado',
  'IGP-M': 'IGP-M (FGV)',
  INPC: 'INPC (IBGE)',
  IVAR: 'IVAR (FGV) — índice de aluguéis',
  proprietario: 'Sem índice — valor definido pelo proprietário',
}

/** Nome completo do índice para o contrato: "IPCA/IBGE". */
export const INDICE_COMPLETO: Record<string, string> = {
  IPCA: 'IPCA/IBGE',
  'IGP-M': 'IGP-M/FGV',
  INPC: 'INPC/IBGE',
  IVAR: 'IVAR/FGV',
}

export const GARANTIAS: Record<string, string> = {
  nenhuma: 'Sem garantia',
  caucao: 'Caução (depósito)',
  fiador: 'Fiador',
  seguro_fianca: 'Seguro-fiança',
  titulo_capitalizacao: 'Título de capitalização',
}

// ----------------------------------------------------------- valor por extenso

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
  'setecentos', 'oitocentos', 'novecentos']

/** 0–999 por extenso ("cento e vinte e três"). */
function ate999(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []
  if (c) partes.push(CENTENAS[c])
  if (resto < 20) {
    if (resto) partes.push(UNIDADES[resto])
  } else {
    const d = Math.floor(resto / 10)
    const u = resto % 10
    partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d])
  }
  return partes.join(' e ')
}

/** Número inteiro por extenso, até centenas de milhões. */
function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  const grupos = [
    { valor: Math.floor(n / 1_000_000) % 1000, sing: 'milhão', plur: 'milhões' },
    { valor: Math.floor(n / 1000) % 1000, sing: 'mil', plur: 'mil' },
    { valor: n % 1000, sing: '', plur: '' },
  ]
  const textos: { texto: string; valor: number }[] = []
  for (const g of grupos) {
    if (!g.valor) continue
    let t: string
    if (g.sing === 'mil') t = g.valor === 1 ? 'mil' : `${ate999(g.valor)} mil`
    else if (g.sing) t = `${ate999(g.valor)} ${g.valor === 1 ? g.sing : g.plur}`
    else t = ate999(g.valor)
    textos.push({ texto: t, valor: g.valor })
  }
  // Regra usual: "e" antes do último grupo quando ele é menor que 100 ou centena exata.
  return textos
    .map((t, i) => {
      if (i === 0) return t.texto
      const ultimo = i === textos.length - 1
      const usaE = ultimo && (t.valor < 100 || t.valor % 100 === 0)
      return (usaE ? ' e ' : ' ') + t.texto
    })
    .join('')
}

/** 1500.5 -> "mil e quinhentos reais e cinquenta centavos" */
export function valorPorExtenso(valor: number): string {
  const centavosTotal = Math.round(valor * 100)
  const reais = Math.floor(centavosTotal / 100)
  const centavos = centavosTotal % 100
  const partes: string[] = []
  if (reais) {
    const exatoMilhao = reais >= 1_000_000 && reais % 1_000_000 === 0
    partes.push(`${inteiroPorExtenso(reais)}${exatoMilhao ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`)
  }
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  return partes.length ? partes.join(' e ') : 'zero real'
}

/** 30 -> "30 (trinta)" */
export function numeroComExtenso(n: number): string {
  return `${n} (${inteiroPorExtenso(n)})`
}
