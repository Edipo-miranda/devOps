// Tipos que espelham as tabelas criadas em supabase/migrations/0001_schema_inicial.sql.
// Datas chegam do banco como texto no formato "AAAA-MM-DD".

export type SituacaoLocacao = 'ativa' | 'encerrada'
export type SituacaoRecebimento = 'em_aberto' | 'pago' | 'atrasado'

export interface Imovel {
  id: string
  owner_id: string
  identificacao: string
  endereco: string
  observacoes: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface Inquilino {
  id: string
  owner_id: string
  nome: string
  telefone: string | null
  created_at: string
  updated_at: string
}

export interface Locacao {
  id: string
  owner_id: string
  imovel_id: string
  inquilino_id: string
  data_entrada: string
  data_saida: string | null
  valor_aluguel: number
  dia_vencimento: number
  situacao: SituacaoLocacao
  created_at: string
  updated_at: string
}

export interface Recebimento {
  id: string
  owner_id: string
  locacao_id: string
  mes_referencia: string
  valor_previsto: number
  data_vencimento: string
  valor_recebido: number | null
  data_pagamento: string | null
  observacao: string | null
  created_at: string
  updated_at: string
}

/** Linha da view vw_recebimentos (recebimento + situação calculada + nomes). */
export interface RecebimentoDetalhado extends Recebimento {
  situacao: SituacaoRecebimento
  dias_atraso: number
  imovel_id: string
  imovel_identificacao: string
  imovel_endereco: string
  inquilino_id: string
  inquilino_nome: string
  inquilino_telefone: string | null
}

/** Retorno da função resumo_mes (dashboard). */
export interface ResumoMes {
  total_previsto: number
  total_recebido: number
  total_pendente: number
  qtd_lancamentos: number
  qtd_pagos: number
  qtd_em_aberto: number
  qtd_atrasados: number
}
