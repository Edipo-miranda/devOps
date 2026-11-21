/** Converte erros do Supabase/Postgres em mensagens claras em português. */
export function mensagemDeErro(erro: unknown): string {
  if (!erro) return 'Erro desconhecido.'
  const e = erro as { code?: string; message?: string }
  const msg = e.message ?? String(erro)

  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet e a URL do Supabase.'
  }
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).'
  if (/rate limit|too many requests/i.test(msg)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'
  if (/Email address .* not authorized|not authorized to send/i.test(msg)) {
    return 'O Supabase ainda não está configurado para enviar e-mails para esse endereço. Peça ao administrador para trocar sua senha.'
  }
  if (/Password should be|weak password/i.test(msg)) return 'Senha fraca. Use pelo menos 8 caracteres, com letras e números.'
  if (/Invalid path specified/i.test(msg)) {
    return 'A URL do Supabase está com um caminho a mais. Use só https://xxxx.supabase.co, sem /rest/v1 no final.'
  }
  if (/Invalid API key|No API key/i.test(msg)) return 'Chave do Supabase inválida. Confira o arquivo .env.local.'

  switch (e.code) {
    case '23505':
      return 'Já existe um registro com esses dados (duplicado).'
    case '23514':
      return 'Algum campo tem um valor inválido. Revise o formulário.'
    case '23503':
      return 'Registro relacionado não encontrado.'
    case '42501':
      return 'Sem permissão para esta operação. Faça login novamente.'
    case '42P01':
    case 'PGRST205':
      return 'Tabela não encontrada. Execute o script SQL do banco no Supabase.'
    case 'PGRST202':
      return 'Função não encontrada no banco. Execute o script SQL do banco no Supabase.'
    case 'P0001':
      return msg // mensagens de regra de negócio já escritas em português no banco
  }
  return msg
}
