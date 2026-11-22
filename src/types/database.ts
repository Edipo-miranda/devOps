// Tipos que espelham as tabelas criadas em supabase/migrations/.
// Datas chegam do banco como texto no formato "AAAA-MM-DD".

export type SituacaoLocacao = 'ativa' | 'encerrada'
export type SituacaoRecebimento = 'em_aberto' | 'pago' | 'atrasado'
export type Finalidade = 'residencial' | 'comercial'
export type Garantia = 'nenhuma' | 'caucao' | 'fiador' | 'seguro_fianca' | 'titulo_capitalizacao'
export type IndiceReajuste = 'IPCA' | 'IGP-M' | 'INPC' | 'IVAR' | 'proprietario'
export type Genero = 'masculino' | 'feminino'

/** Endereço separado em partes (imóvel, inquilino e proprietário). */
export interface Endereco {
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

/** Dados pessoais usados na qualificação das partes do contrato. */
export interface Qualificacao {
  rg: string | null
  orgao_emissor: string | null
  nacionalidade: string | null
  estado_civil: string | null
  profissao: string | null
  email: string | null
  genero: Genero | null // concordância no contrato (brasileiro/brasileira…)
}

export interface Imovel extends Endereco {
  id: string
  owner_id: string
  identificacao: string
  endereco: string // endereço completo em uma linha (montado a partir das partes)
  observacoes: string | null
  tipo: string | null
  descricao: string | null
  proprietario_id: string | null
  vendido_em: string | null // preenchido quando o imóvel foi vendido
  valor_venda: number | null
  comprador: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface Inquilino extends Endereco, Qualificacao {
  id: string
  owner_id: string
  nome: string
  telefone: string | null
  cpf: string | null
  data_nascimento: string | null
  created_at: string
  updated_at: string
}

export interface Proprietario extends Endereco, Qualificacao {
  id: string
  owner_id: string
  tipo_pessoa: 'fisica' | 'juridica'
  nome: string
  cpf_cnpj: string | null
  telefone: string | null
  pix: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

/** Condições do contrato guardadas na locação (multa e juros são só texto do contrato). */
export interface CondicoesContrato {
  finalidade: Finalidade
  garantia: Garantia
  valor_garantia: number | null
  fiador_nome: string | null
  fiador_cpf: string | null
  fiador_qualificacao: string | null
  multa_atraso_percentual: number | null
  juros_atraso_percentual: number | null
  multa_rescisao_alugueis: number | null
  encargos_locatario: string | null
  foro: string | null
  clausulas_adicionais: string | null
  indice_reajuste: IndiceReajuste
  iptu_por_conta: 'locador' | 'locatario'
}

export interface Locacao extends CondicoesContrato {
  id: string
  owner_id: string
  imovel_id: string
  inquilino_id: string
  data_entrada: string
  data_saida: string | null
  valor_aluguel: number
  dia_vencimento: number
  situacao: SituacaoLocacao
  prazo_meses: number | null // vazio = prazo indeterminado
  data_inicio_contrato: string // início do contrato atual (muda ao renovar)
  reajuste_meses: number | null // vazio = sem reajuste
  data_ultimo_reajuste: string | null
  created_at: string
  updated_at: string
}

export interface Reajuste {
  id: string
  locacao_id: string
  data_reajuste: string
  valor_anterior: number
  valor_novo: number
  observacao: string | null
  created_at: string
}

export type TipoAviso = 'parcela_atrasada' | 'parcela_hoje' | 'parcela_vencendo' | 'fim_contrato' | 'reajuste'

/** Linha retornada pela função avisos(). */
export interface Aviso {
  tipo: TipoAviso
  data_alvo: string
  dias: number // dias até a data (negativo = já passou)
  imovel_id: string
  imovel: string
  inquilino: string
  locacao_id: string
  recebimento_id: string | null
  valor: number
  detalhe: string | null
}

export interface Configuracoes {
  dias_aviso_parcela: number
  dias_aviso_contrato: number
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

/** Retorno da função resumo_geral() (aba Visão geral do dashboard). */
export interface ResumoGeral {
  contratos_ativos: number
  receita_mensal_contratada: number
  imoveis_ativos: number
  imoveis_alugados: number
  imoveis_vagos: number
  proprietarios: number
  recebido_ano: number
  recebido_total: number
  atrasados_qtd: number
  atrasados_valor: number
  contratos_vencendo_60d: number
}

export interface HistoricoMes {
  mes_referencia: string
  previsto: number
  recebido: number
  atrasado: number
}
