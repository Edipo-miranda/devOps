import { createClient } from '@supabase/supabase-js'

const urlInformada = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim()

/** Fica só com "https://xxxx.supabase.co", descartando caminhos como /rest/v1/ colados por engano. */
function normalizarUrl(valor: string | undefined): string | undefined {
  if (!valor) return undefined
  try {
    return new URL(valor).origin
  } catch {
    return valor
  }
}
const url = normalizarUrl(urlInformada)

/** Lê o "role" de uma chave no formato antigo (JWT), sem validar a assinatura. */
function papelDaChaveJwt(chave: string): string | null {
  const partes = chave.split('.')
  if (partes.length !== 3) return null
  try {
    const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function validarConfiguracao(): string | null {
  if (!url || !key) {
    return 'Variáveis de ambiente ausentes. Crie o arquivo .env.local a partir de .env.example.'
  }
  if (!/^https:\/\/.+/.test(url)) {
    return 'VITE_SUPABASE_URL inválida. Ela deve começar com https://'
  }
  if (/(^|\.)supabase\.com$/.test(new URL(url).hostname)) {
    return 'VITE_SUPABASE_URL está com o endereço do painel (supabase.com). Use a Project URL, no formato https://xxxx.supabase.co'
  }
  // Proteção extra: o frontend jamais pode usar uma chave secreta.
  if (key.startsWith('sb_secret_') || papelDaChaveJwt(key) === 'service_role') {
    return 'A chave configurada é SECRETA (secret/service_role). Use a chave pública (publishable/anon) e troque a chave secreta no Supabase, pois ela pode ter sido exposta.'
  }
  return null
}

export const erroConfiguracao = validarConfiguracao()

export const supabase = createClient(
  erroConfiguracao ? 'https://invalido.supabase.co' : url!,
  erroConfiguracao ? 'invalido' : key!,
  { auth: { persistSession: true, autoRefreshToken: true } },
)
