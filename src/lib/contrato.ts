// Monta o contrato de locação em PDF a partir dos dados cadastrados.
// O texto é um MODELO baseado na Lei do Inquilinato (Lei nº 8.245/1991);
// recomenda-se a revisão por um advogado antes do primeiro uso.
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { fimDoContrato, type LocacaoComInquilino } from './api'
import { GARANTIAS, formatarEndereco, numeroComExtenso, valorPorExtenso } from './documentos'
import { MESES, formatarData, formatarMoeda } from './format'
import type { Imovel, Inquilino, Proprietario } from '../types/database'

export interface Testemunha {
  nome: string
  cpf: string
}

export interface OpcoesContrato {
  cidadeAssinatura: string
  dataAssinatura: string // AAAA-MM-DD
  testemunhas: [Testemunha, Testemunha]
}

export interface DadosContrato {
  imovel: Imovel
  proprietario: Proprietario | null
  locacao: LocacaoComInquilino
}

const LACUNA = '____________________'
const ou = (v: string | null | undefined, lacuna = LACUNA) => (v && v.trim() ? v.trim() : lacuna)

/** O que falta preencher. "obrigatorio" deixa lacunas importantes no contrato. */
export function pendenciasContrato({ imovel, proprietario, locacao }: DadosContrato) {
  const obrigatorio: string[] = []
  const recomendado: string[] = []
  const q = locacao.inquilino
  if (!proprietario) obrigatorio.push('Vincular um proprietário ao imóvel (Editar imóvel)')
  else {
    if (!proprietario.cpf_cnpj) obrigatorio.push('CPF/CNPJ do proprietário')
    if (proprietario.tipo_pessoa === 'fisica') {
      if (!proprietario.rg) recomendado.push('RG do proprietário')
      if (!proprietario.estado_civil) recomendado.push('Estado civil do proprietário')
      if (!proprietario.profissao) recomendado.push('Profissão do proprietário')
    }
    if (!proprietario.logradouro) recomendado.push('Endereço do proprietário')
    if (!proprietario.pix && !proprietario.banco) recomendado.push('Chave PIX ou dados bancários do proprietário')
  }
  if (!q.cpf) obrigatorio.push('CPF do inquilino')
  if (!q.rg) recomendado.push('RG do inquilino')
  if (!q.estado_civil) recomendado.push('Estado civil do inquilino')
  if (!q.profissao) recomendado.push('Profissão do inquilino')
  if (!imovel.logradouro || !imovel.cidade) obrigatorio.push('Endereço completo do imóvel (Editar imóvel)')
  if (!imovel.descricao) recomendado.push('Descrição do imóvel (cômodos, vagas…)')
  if (locacao.garantia === 'fiador' && !locacao.fiador_cpf) recomendado.push('CPF do fiador')
  return { obrigatorio, recomendado }
}

/**
 * No texto justificado, o PDF trata "/" e "-" como ponto de quebra e abre espaço
 * neles ("SSP/ SP", "e- mail"). Palavras com esses sinais viram blocos inteiros.
 */
function semQuebra(texto: string): Content[] {
  return texto.split(/(\S*[/-]\S*)/).filter(Boolean).map((t) => (/\S[/-]|[/-]\S/.test(t) ? { text: t, noWrap: true } : t)) as Content[]
}

/** "22 de novembro de 2026" */
function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1].toLowerCase()} de ${a}`
}

/** Qualificação completa de uma parte, pulando o que não foi preenchido. */
function qualificacao(p: Proprietario | Inquilino, documento: string | null, juridica = false): string {
  const endereco = formatarEndereco(p)
  if (juridica) {
    return [
      `${p.nome.toUpperCase()}, pessoa jurídica de direito privado`,
      `inscrita no CNPJ sob o nº ${ou(documento)}`,
      endereco ? `com sede em ${endereco}` : null,
    ].filter(Boolean).join(', ')
  }
  const rg = p.rg ? `portador(a) do RG nº ${p.rg}${p.orgao_emissor ? ` ${p.orgao_emissor}` : ''}` : `portador(a) do RG nº ${LACUNA}`
  return [
    p.nome.toUpperCase(),
    ou(p.nacionalidade, 'brasileiro(a)'),
    ou(p.estado_civil),
    ou(p.profissao),
    rg,
    `inscrito(a) no CPF sob o nº ${ou(documento)}`,
    endereco ? `residente e domiciliado(a) em ${endereco}` : null,
    p.email ? `e-mail ${p.email}` : null,
    p.telefone ? `telefone ${p.telefone}` : null,
  ].filter(Boolean).join(', ')
}

/** Monta a definição do documento (pdfmake). */
export function montarContrato(d: DadosContrato, op: OpcoesContrato): TDocumentDefinitions {
  const { imovel, proprietario, locacao } = d
  const inq = locacao.inquilino
  const residencial = locacao.finalidade !== 'comercial'
  const valor = Number(locacao.valor_aluguel)
  const fim = fimDoContrato(locacao)
  const temFiador = locacao.garantia === 'fiador'
  const enderecoImovel = formatarEndereco(imovel) || imovel.endereco
  const foro = locacao.foro || [imovel.cidade, imovel.uf].filter(Boolean).join('/') || LACUNA

  const locador = proprietario
    ? qualificacao(proprietario, proprietario.cpf_cnpj, proprietario.tipo_pessoa === 'juridica')
    : `${LACUNA} (nome e qualificação do proprietário)`
  const locatario = qualificacao(inq, inq.cpf)

  // Cláusulas em ordem; o número é atribuído automaticamente.
  const clausulas: { titulo: string; paragrafos: string[] }[] = []
  const add = (titulo: string, ...paragrafos: (string | null | false)[]) =>
    clausulas.push({ titulo, paragrafos: paragrafos.filter((p): p is string => Boolean(p)) })

  add(
    'DO OBJETO',
    `O LOCADOR dá em locação ao LOCATÁRIO o imóvel${imovel.tipo ? ` (${imovel.tipo})` : ''} situado em ${enderecoImovel}` +
      `${imovel.descricao ? `, composto por: ${imovel.descricao}` : ''}.`,
    `O imóvel destina-se exclusivamente a fins ${residencial ? 'residenciais' : 'comerciais'}, sendo vedada a alteração dessa ` +
      'destinação sem autorização prévia e por escrito do LOCADOR.',
  )

  add(
    'DO PRAZO',
    locacao.prazo_meses
      ? `A locação terá o prazo de ${numeroComExtenso(locacao.prazo_meses)} meses, com início em ` +
        `${formatarData(locacao.data_inicio_contrato)} e término em ${formatarData(fim)}, data em que o LOCATÁRIO deverá ` +
        'restituir o imóvel livre e desocupado, salvo renovação ou prorrogação nos termos da Lei nº 8.245/1991.'
      : `A locação é celebrada por prazo indeterminado, com início em ${formatarData(locacao.data_inicio_contrato)}.`,
  )

  const pagamento = proprietario?.pix
    ? `por meio de PIX para a chave ${proprietario.pix}`
    : proprietario?.banco
      ? `por depósito/transferência no banco ${proprietario.banco}, agência ${ou(proprietario.agencia)}, conta ${ou(proprietario.conta)}`
      : 'em local ou meio indicado pelo LOCADOR'
  add(
    'DO ALUGUEL E DO PAGAMENTO',
    `O aluguel mensal é de ${formatarMoeda(valor)} (${valorPorExtenso(valor)}), com vencimento todo dia ` +
      `${locacao.dia_vencimento} de cada mês, devendo ser pago ${pagamento}, em nome do LOCADOR.`,
    'O comprovante de pagamento servirá como recibo. Nos meses em que o dia do vencimento não existir, o pagamento ' +
      'vencerá no último dia do mês.',
  )

  add(
    'DO REAJUSTE',
    locacao.reajuste_meses
      ? `O valor do aluguel poderá ser reajustado a cada ${numeroComExtenso(locacao.reajuste_meses)} meses, contados do ` +
        'início da locação ou do último reajuste, em valor estabelecido pelo LOCADOR e comunicado por escrito ao LOCATÁRIO ' +
        'com antecedência mínima de 30 (trinta) dias, observada a legislação vigente.'
      : 'O valor do aluguel somente será alterado mediante acordo escrito entre as partes, observada a legislação vigente.',
  )

  if (locacao.multa_atraso_percentual || locacao.juros_atraso_percentual) {
    const partes = [
      locacao.multa_atraso_percentual ? `multa de ${String(locacao.multa_atraso_percentual).replace('.', ',')}% sobre o valor devido` : null,
      locacao.juros_atraso_percentual ? `juros de mora de ${String(locacao.juros_atraso_percentual).replace('.', ',')}% ao mês, calculados pro rata die` : null,
    ].filter(Boolean)
    add('DO ATRASO', `O pagamento após o vencimento sujeitará o LOCATÁRIO a ${partes.join(', acrescida de ')}, sem prejuízo das demais medidas legais.`)
  }

  add(
    'DOS ENCARGOS',
    `Além do aluguel, são de responsabilidade do LOCATÁRIO, durante toda a locação: ${ou(locacao.encargos_locatario, 'as despesas de consumo do imóvel')}.`,
    'O LOCATÁRIO deverá transferir para o seu nome, quando aplicável, as contas de consumo, e apresentar os comprovantes de ' +
      'pagamento sempre que solicitado.',
  )

  const vg = locacao.valor_garantia ? `${formatarMoeda(Number(locacao.valor_garantia))} (${valorPorExtenso(Number(locacao.valor_garantia))})` : LACUNA
  switch (locacao.garantia) {
    case 'caucao':
      add('DA GARANTIA', `Em garantia das obrigações deste contrato, o LOCATÁRIO entrega ao LOCADOR caução em dinheiro no valor de ${vg}, ` +
        'nos termos do art. 38 da Lei nº 8.245/1991, que será devolvida ao final da locação, após a entrega das chaves e a quitação ' +
        'de todos os débitos, podendo ser utilizada para cobrir valores em aberto.')
      break
    case 'fiador':
      add('DA GARANTIA (FIANÇA)', `Assina também este contrato, como FIADOR(A) e principal pagador(a), ${ou(locacao.fiador_nome).toUpperCase()}, ` +
        `inscrito(a) no CPF sob o nº ${ou(locacao.fiador_cpf)}${locacao.fiador_qualificacao ? `, ${locacao.fiador_qualificacao}` : ''}, ` +
        'responsável solidariamente por todas as obrigações do LOCATÁRIO até a efetiva entrega das chaves, renunciando ' +
        'expressamente aos benefícios dos arts. 827, 835 e 838 do Código Civil.')
      break
    case 'seguro_fianca':
    case 'titulo_capitalizacao':
      add('DA GARANTIA', `A presente locação é garantida por ${GARANTIAS[locacao.garantia].toLowerCase()}` +
        `${locacao.valor_garantia ? ` no valor de ${vg}` : ''}, contratado(a) pelo LOCATÁRIO e mantido(a) vigente durante toda a locação.`)
      break
    default:
      add('DA GARANTIA', 'A presente locação é celebrada sem garantia locatícia.')
  }

  add(
    'DA CONSERVAÇÃO, BENFEITORIAS E DEVOLUÇÃO',
    'O LOCATÁRIO declara receber o imóvel em perfeitas condições de uso, conforme vistoria, obrigando-se a conservá-lo e a ' +
      'restituí-lo no mesmo estado, ressalvado o desgaste natural pelo uso normal.',
    'Quaisquer obras ou benfeitorias dependem de autorização prévia e por escrito do LOCADOR e, salvo acordo em contrário, ' +
      'ficarão incorporadas ao imóvel, sem direito a indenização ou retenção.',
    'É vedado ao LOCATÁRIO sublocar, ceder ou emprestar o imóvel, no todo ou em parte, sem o consentimento prévio e por escrito do LOCADOR.',
    'O LOCADOR poderá vistoriar o imóvel mediante combinação prévia de dia e horário com o LOCATÁRIO.',
  )

  add(
    'DA RESCISÃO',
    locacao.multa_rescisao_alugueis
      ? `Caso o LOCATÁRIO devolva o imóvel antes do término do prazo, pagará multa equivalente a ` +
        `${String(locacao.multa_rescisao_alugueis).replace('.', ',')} aluguel(éis) vigente(s), proporcional ao período restante ` +
        'do contrato, nos termos do art. 4º da Lei nº 8.245/1991, ressalvadas as hipóteses de dispensa previstas em lei.'
      : 'A devolução antecipada do imóvel deverá ser comunicada por escrito com antecedência mínima de 30 (trinta) dias.',
    'O descumprimento de qualquer cláusula deste contrato autoriza a parte prejudicada a considerá-lo rescindido, sem prejuízo das penalidades cabíveis.',
  )

  if (locacao.clausulas_adicionais) {
    add('DISPOSIÇÕES ADICIONAIS', ...locacao.clausulas_adicionais.split('\n').map((l) => l.trim()).filter(Boolean))
  }

  add('DO FORO', `Fica eleito o foro da comarca de ${foro} para dirimir quaisquer questões oriundas deste contrato.`)

  // ------------------------------------------------------------ documento
  const corpo: Content[] = []
  clausulas.forEach((c, i) => {
    corpo.push({ text: `CLÁUSULA ${i + 1}ª – ${c.titulo}`, style: 'clausula' })
    c.paragrafos.forEach((p, j) => {
      const prefixo = j > 0 ? [{ text: `Parágrafo ${j}º – `, bold: true }] : []
      corpo.push({ text: [...prefixo, ...semQuebra(p)], style: 'paragrafo' })
    })
  })

  const linhaAssinatura = (papel: string, nome: string | null, doc: string | null): Content => ({
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.7 }], margin: [0, 30, 0, 4] },
      { text: papel, bold: true, fontSize: 9 },
      { text: nome || ' ', fontSize: 9 },
      { text: doc ? `CPF/CNPJ: ${doc}` : 'CPF: ', fontSize: 8.5, color: '#444' },
    ],
    unbreakable: true,
  })

  const [t1, t2] = op.testemunhas
  const assinaturas: Content = {
    unbreakable: true,
    stack: [
      { text: `${op.cidadeAssinatura || LACUNA}, ${dataPorExtenso(op.dataAssinatura)}.`, alignment: 'right', margin: [0, 18, 0, 6] },
      {
        columns: [
          linhaAssinatura('LOCADOR(A)', proprietario?.nome ?? null, proprietario?.cpf_cnpj ?? null),
          linhaAssinatura('LOCATÁRIO(A)', inq.nome, inq.cpf),
        ],
        columnGap: 30,
      },
      ...(temFiador
        ? [{ columns: [linhaAssinatura('FIADOR(A)', locacao.fiador_nome, locacao.fiador_cpf), { text: '' }], columnGap: 30 } as Content]
        : []),
      { text: 'TESTEMUNHAS', bold: true, fontSize: 9, margin: [0, 22, 0, 0] },
      {
        columns: [
          linhaAssinatura('Testemunha 1', t1.nome || null, t1.cpf || null),
          linhaAssinatura('Testemunha 2', t2.nome || null, t2.cpf || null),
        ],
        columnGap: 30,
      },
    ],
  }

  return {
    pageSize: 'A4',
    pageMargins: [60, 56, 60, 64],
    info: { title: `Contrato de locação - ${imovel.identificacao} - ${inq.nome}`, author: proprietario?.nome ?? '' },
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.3, alignment: 'justify' },
    styles: {
      titulo: { fontSize: 13.5, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
      subtitulo: { fontSize: 9, alignment: 'center', color: '#555', margin: [0, 0, 0, 18] },
      parte: { margin: [0, 0, 0, 8] },
      clausula: { bold: true, fontSize: 10.5, margin: [0, 12, 0, 4], alignment: 'left' },
      paragrafo: { margin: [0, 0, 0, 5] },
    },
    content: [
      { text: `CONTRATO DE LOCAÇÃO DE IMÓVEL ${residencial ? 'RESIDENCIAL' : 'COMERCIAL'}`, style: 'titulo' },
      { text: 'Lei nº 8.245, de 18 de outubro de 1991', style: 'subtitulo' },
      { text: 'Pelo presente instrumento particular, as partes abaixo qualificadas:', style: 'parte' },
      { text: [{ text: 'LOCADOR(A): ', bold: true }, ...semQuebra(`${locador}.`)], style: 'parte' },
      { text: [{ text: 'LOCATÁRIO(A): ', bold: true }, ...semQuebra(`${locatario}.`)], style: 'parte' },
      {
        text: 'têm entre si, justo e contratado, a locação do imóvel descrito abaixo, que se regerá pela Lei nº 8.245/1991 ' +
          'e pelas cláusulas e condições seguintes:',
        style: 'parte',
      },
      ...corpo,
      {
        text: `E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em ${temFiador ? '3 (três)' : '2 (duas)'} ` +
          'vias de igual teor e forma, na presença das testemunhas abaixo, ou eletronicamente, nos termos da legislação vigente.',
        margin: [0, 14, 0, 0],
      },
      assinaturas,
    ],
    footer: (pagina, total) => ({
      columns: [
        { text: `Rubricas: _______  _______${temFiador ? '  _______' : ''}`, fontSize: 8, color: '#666', alignment: 'left' },
        { text: `Página ${pagina} de ${total}`, fontSize: 8, color: '#666', alignment: 'right' },
      ],
      margin: [60, 20, 60, 0],
    }),
  }
}

/** Nome de arquivo seguro: "Contrato - Apto 101 - Maria Silva.pdf" */
export function nomeArquivoContrato(d: DadosContrato): string {
  const limpar = (t: string) => t.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()
  return `Contrato - ${limpar(d.imovel.identificacao)} - ${limpar(d.locacao.inquilino.nome)}.pdf`
}

/** Gera o PDF (carrega a biblioteca só quando necessário). */
export async function gerarPdfContrato(d: DadosContrato, op: OpcoesContrato): Promise<Blob> {
  const [pdfMakeMod, vfsMod] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
  const pdfMake = (pdfMakeMod as unknown as { default?: typeof pdfMakeMod }).default ?? pdfMakeMod
  const vfs = (vfsMod as unknown as { default?: Record<string, string> }).default ?? (vfsMod as unknown as Record<string, string>)
  pdfMake.addVirtualFileSystem(vfs)
  return pdfMake.createPdf(montarContrato(d, op)).getBlob()
}
