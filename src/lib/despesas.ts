import type { CategoriaDespesa } from '../types/database'

/** Categorias de despesa e se costumam ser dedutíveis no carnê-leão. */
export const CATEGORIAS_DESPESA: Record<CategoriaDespesa, { rotulo: string; dedutivel: boolean }> = {
  iptu: { rotulo: 'IPTU', dedutivel: true },
  condominio: { rotulo: 'Condomínio', dedutivel: true },
  taxa_administracao: { rotulo: 'Taxa de administração / corretagem', dedutivel: true },
  manutencao: { rotulo: 'Manutenção e reparos', dedutivel: false },
  reforma: { rotulo: 'Reforma / benfeitoria', dedutivel: false },
  seguro: { rotulo: 'Seguro', dedutivel: false },
  contas_consumo: { rotulo: 'Água, luz e gás (pagos pelo proprietário)', dedutivel: false },
  impostos_taxas: { rotulo: 'Outros impostos e taxas', dedutivel: false },
  outros: { rotulo: 'Outros', dedutivel: false },
}
