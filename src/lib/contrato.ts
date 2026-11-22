// Monta o contrato de locação em PDF a partir dos dados cadastrados.
// Texto baseado no modelo revisado enviado pelo usuário (Lei nº 8.245/1991).
// Campos não preenchidos saem como linhas em branco para completar à mão.
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { fimDoContrato, type LocacaoComInquilino } from './api'
import { GARANTIAS, INDICE_COMPLETO, enderecoPorExtenso, numeroComExtenso, valorPorExtenso } from './documentos'
import { MESES, formatarData, formatarMoeda } from './format'
import { gerarPdf, nomeArquivo } from './pdf'
import { capitalizarNome } from './texto'
import type { Genero, Imovel, Inquilino, Proprietario } from '../types/database'

export interface Testemunha {
  nome: string
  cpf: string
}

export interface OpcoesContrato {
  cidadeAssinatura: string
  dataAssinatura: string // AAAA-MM-DD ou "" para deixar em branco
  testemunhas: [Testemunha, Testemunha]
  primeiroPagamento: { periodo: string; valor: string; vencimento: string } | null // null = não incluir o parágrafo
}

export interface DadosContrato {
  imovel: Imovel
  proprietario: Proprietario | null
  locacao: LocacaoComInquilino
}

const L = '__________________' // lacuna curta
const LL = '________________________________________________' // lacuna longa
const ou = (v: string | null | undefined, lacuna = L) => (v && v.trim() ? v.trim() : lacuna)
const pct = (n: number | null) => String(n ?? '').replace('.', ',')

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
      if (!proprietario.genero) recomendado.push('Gênero do proprietário (para a concordância do texto)')
    }
    if (!proprietario.logradouro) recomendado.push('Endereço do proprietário')
    if (!proprietario.pix && !proprietario.banco) recomendado.push('Chave PIX ou dados bancários do proprietário')
  }
  if (!q.cpf) obrigatorio.push('CPF do inquilino')
  if (!q.rg) recomendado.push('RG do inquilino')
  if (!q.estado_civil) recomendado.push('Estado civil do inquilino')
  if (!q.profissao) recomendado.push('Profissão do inquilino')
  if (!q.genero) recomendado.push('Gênero do inquilino (para a concordância do texto)')
  if (!imovel.logradouro || !imovel.cidade) obrigatorio.push('Endereço completo do imóvel (Editar imóvel)')
  if (locacao.garantia === 'fiador' && !locacao.fiador_cpf) recomendado.push('CPF do fiador')
  return { obrigatorio, recomendado }
}

// ------------------------------------------------------------ concordância

/** "portador" -> portador / portadora / portador(a), conforme o gênero. */
function g(masc: string, fem: string, genero: Genero | null): string {
  if (genero === 'masculino') return masc
  if (genero === 'feminino') return fem
  return `${masc}(a)`
}

/** Estado civil cadastrado como "casado(a)" -> "casado" ou "casada". */
function estadoCivil(texto: string | null, genero: Genero | null): string | null {
  if (!texto) return null
  if (genero === 'masculino') return texto.replace('(a)', '')
  if (genero === 'feminino') return texto.replace(/o\(a\)/, 'a')
  return texto
}

/** "22 de novembro de 2026" ou lacunas. */
function dataPorExtenso(iso: string): string {
  if (!iso) return '____ de __________________ de ______'
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1].toLowerCase()} de ${a}`
}

/**
 * Qualificação no formato do modelo revisado: o que está preenchido aparece em texto
 * corrido ("brasileiro, casado, analista"); o que falta aparece com o rótulo e lacuna
 * ("nacionalidade ____").
 */
function qualificacao(p: Proprietario | Inquilino, documento: string | null, opcoes: { juridica?: boolean; locatario?: boolean }): string {
  const nome = p.nome.toUpperCase()
  const endereco = enderecoPorExtenso(p)
  if (opcoes.juridica) {
    return `${nome}, pessoa jurídica de direito privado, inscrita no CNPJ nº ${ou(documento)}, com sede à ${endereco || LL}`
  }
  const gen = p.genero
  const ec = estadoCivil(p.estado_civil, gen)
  const rg = p.rg ? `${p.rg}${p.orgao_emissor ? ` ${p.orgao_emissor}` : ''}` : L
  const partes = [
    nome,
    p.nacionalidade ? p.nacionalidade : `nacionalidade ${L}`,
    ec ? ec : `estado civil ${L}`,
    p.profissao ? p.profissao : `profissão ${L}`,
  ]
  if (opcoes.locatario) {
    partes.push(
      `${g('portador', 'portadora', gen)} do RG nº ${rg} e CPF nº ${ou(documento)}`,
      `telefone ${ou(p.telefone)}`,
      `e-mail ${ou(p.email)}`,
      `residente atualmente à ${endereco || LL}`,
    )
  } else {
    partes.push(
      `${g('portador', 'portadora', gen)} do RG nº ${rg}`,
      `${g('inscrito', 'inscrita', gen)} no CPF nº ${ou(documento)}`,
      `residente e ${g('domiciliado', 'domiciliada', gen)} à ${endereco || LL}`,
      `e-mail ${ou(p.email)}`,
      `telefone ${ou(p.telefone)}`,
    )
  }
  return partes.join(', ')
}

/** No texto justificado, "/" e "-" viram ponto de quebra com espaço; palavras com esses sinais ficam inteiras. */
function semQuebra(texto: string): Content[] {
  return texto.split(/(\S*[/-]\S*)/).filter(Boolean).map((t) => (/\S[/-]|[/-]\S/.test(t) ? { text: t, noWrap: true } : t)) as Content[]
}

// -------------------------------------------------------------- documento

export function montarContrato(d: DadosContrato, op: OpcoesContrato): TDocumentDefinitions {
  const { imovel, proprietario, locacao } = d
  const inq = locacao.inquilino
  const residencial = locacao.finalidade !== 'comercial'
  const tipoLocacao = residencial ? 'residencial' : 'comercial'
  const valor = Number(locacao.valor_aluguel)
  const fim = fimDoContrato(locacao)
  const semGarantia = locacao.garantia === 'nenhuma'
  const temFiador = locacao.garantia === 'fiador'
  const indice = INDICE_COMPLETO[locacao.indice_reajuste] ?? null // null = valor definido pelo proprietário
  const enderecoImovel = enderecoPorExtenso(imovel) || imovel.endereco
  const cidadeImovel = [imovel.cidade, imovel.uf].filter(Boolean).join('/')
  const foro = locacao.foro || cidadeImovel || L

  const locador = proprietario
    ? qualificacao(proprietario, proprietario.cpf_cnpj, { juridica: proprietario.tipo_pessoa === 'juridica' })
    : `${LL}, nacionalidade ${L}, estado civil ${L}, profissão ${L}, portador(a) do RG nº ${L}, inscrito(a) no CPF nº ${L}, residente e domiciliado(a) à ${LL}`
  const locatario = qualificacao(inq, inq.cpf, { locatario: true })

  const clausulas: { titulo: string; paragrafos: string[] }[] = []
  const add = (titulo: string, ...paragrafos: (string | null | false | undefined)[]) =>
    clausulas.push({ titulo, paragrafos: paragrafos.filter((p): p is string => Boolean(p)) })

  // 1. Imóvel e destinação
  add(
    'DO IMÓVEL E DA DESTINAÇÃO',
    `O LOCADOR entrega em locação ao LOCATÁRIO o imóvel ${tipoLocacao} situado à ${enderecoImovel}` +
      `${imovel.descricao ? `, composto por ${imovel.descricao.charAt(0).toLowerCase()}${imovel.descricao.slice(1).replace(/\.$/, '')}` : ''}` +
      `${imovel.area_m2 ? `, com área de ${String(imovel.area_m2).replace('.', ',')} m²` : ''}` +
      `${imovel.matricula ? `, objeto da matrícula nº ${imovel.matricula}${imovel.cartorio ? ` do ${imovel.cartorio}` : ''}` : ''}` +
      `${imovel.inscricao_iptu ? `, inscrição imobiliária (IPTU) nº ${imovel.inscricao_iptu}` : ''}.`,
    residencial
      ? 'O imóvel destina-se exclusivamente à moradia do LOCATÁRIO e de sua família, sendo vedada a alteração de finalidade ' +
        'sem autorização prévia e escrita do LOCADOR.'
      : 'O imóvel destina-se exclusivamente ao uso comercial do LOCATÁRIO, sendo vedada a alteração de finalidade sem ' +
        'autorização prévia e escrita do LOCADOR.',
  )

  // 2. Prazo
  if (locacao.prazo_meses) {
    const p = locacao.prazo_meses
    add(
      'DO PRAZO',
      `A locação terá prazo de ${numeroComExtenso(p)} meses, com início em ${formatarData(locacao.data_inicio_contrato)} e término em ${formatarData(fim)}.`,
      !residencial
        ? 'Findo o prazo, a prorrogação e a eventual renovação da locação observarão as disposições da Lei nº 8.245/1991 ' +
          'aplicáveis às locações não residenciais, especialmente seus artigos 51 a 57.'
        : p < 30
          ? 'Por se tratar de locação residencial com prazo inferior a 30 (trinta) meses, eventual prorrogação por prazo ' +
            'indeterminado e retomada do imóvel observarão as hipóteses e condições previstas na Lei nº 8.245/1991, especialmente seu artigo 47.'
          : 'Findo o prazo ajustado, se o LOCATÁRIO permanecer no imóvel por mais de 30 (trinta) dias sem oposição do LOCADOR, ' +
            'a locação será prorrogada por prazo indeterminado, nos termos do artigo 46 da Lei nº 8.245/1991.',
      'Se as partes desejarem renovar a locação por novo prazo determinado, deverão formalizar o acordo por escrito.',
    )
  } else {
    add(
      'DO PRAZO',
      `A locação é celebrada por prazo indeterminado, com início em ${formatarData(locacao.data_inicio_contrato)}.`,
      'A retomada do imóvel e a denúncia da locação observarão as hipóteses e condições previstas na Lei nº 8.245/1991.',
    )
  }

  // 3. Aluguel, vencimento e pagamento
  const pagamento = proprietario?.pix
    ? `mediante PIX para a chave ${proprietario.pix}`
    : proprietario?.banco
      ? `mediante depósito ou transferência para o banco ${proprietario.banco}, agência ${ou(proprietario.agencia)}, conta ${ou(proprietario.conta)}`
      : `mediante ${L}`
  const pp = op.primeiroPagamento
  const atraso = [
    locacao.multa_atraso_percentual ? `multa moratória de ${pct(locacao.multa_atraso_percentual)}% sobre o valor em atraso` : null,
    locacao.juros_atraso_percentual ? `juros de mora de ${pct(locacao.juros_atraso_percentual)}% ao mês, calculados proporcionalmente aos dias de atraso` : null,
  ].filter(Boolean)
  add(
    'DO ALUGUEL, VENCIMENTO E PAGAMENTO',
    `O aluguel mensal será de ${formatarMoeda(valor)} (${valorPorExtenso(valor)}), com vencimento todo dia ${locacao.dia_vencimento}, ` +
      `${pagamento}, em nome do LOCADOR.`,
    semGarantia &&
      'Como a locação não possui garantia locatícia, as partes poderão ajustar o pagamento do aluguel e encargos até o sexto dia útil ' +
        `do mês vincendo, conforme artigo 42 da Lei nº 8.245/1991. Para este contrato, fica estabelecido o vencimento no dia ` +
        `${locacao.dia_vencimento}, respeitada a regra legal.`,
    pp &&
      `Primeiro pagamento proporcional, se aplicável: período ${ou(pp.periodo)}; valor R$ ${ou(pp.valor)}; vencimento ${ou(pp.vencimento)}. ` +
        'As partes deverão preencher este campo antes da assinatura, evitando dúvida sobre o período inicial.',
    `Os comprovantes de ${proprietario?.pix ? 'PIX' : 'pagamento'} servirão como prova do pagamento, sem prejuízo de o LOCADOR ` +
      'fornecer recibo discriminado quando solicitado.',
    atraso.length > 0 &&
      `Em caso de atraso, incidirá ${atraso.join(' e ')}` +
        `${indice ? `, além de correção monetária pelo ${indice.split('/')[0]}, se aplicável` : ''}.`,
  )

  // 4. Reajuste
  const rm = locacao.reajuste_meses
  add(
    'DO REAJUSTE',
    !rm
      ? 'O valor do aluguel somente será alterado mediante acordo escrito entre as partes, observada a legislação vigente.'
      : indice
        ? `O aluguel será reajustado a cada ${numeroComExtenso(rm)} meses, contados do início da locação, pela variação acumulada ` +
          `do ${indice} no período. Caso o índice deixe de existir ou não possa ser utilizado, as partes adotarão outro índice ` +
          'oficial que o substitua. O reajuste deverá respeitar a legislação vigente.'
        : `O aluguel poderá ser reajustado a cada ${numeroComExtenso(rm)} meses, contados do início da locação, em valor definido ` +
          'pelo LOCADOR e comunicado por escrito ao LOCATÁRIO com antecedência mínima de 30 (trinta) dias. O reajuste deverá ' +
          'respeitar a legislação vigente.',
    Boolean(rm) && 'O novo valor passará a vigorar a partir do primeiro vencimento seguinte à data do reajuste.',
  )

  // 5. Encargos e consumos
  add(
    'DOS ENCARGOS E CONSUMOS',
    'Durante a locação, serão de responsabilidade do LOCATÁRIO as despesas de consumo individual do imóvel, incluindo ' +
      `${ou(locacao.encargos_locatario, 'água, energia elétrica, gás, internet e outros serviços que contratar ou utilizar').replace(/\.$/, '')}.`,
    'O LOCATÁRIO deverá, quando possível, transferir as contas de consumo para seu nome e manter os pagamentos em dia, ' +
      'apresentando comprovantes quando solicitado.',
    locacao.iptu_por_conta === 'locatario'
      ? 'O IPTU incidente sobre o imóvel durante a locação será de responsabilidade do LOCATÁRIO, e as despesas extraordinárias ' +
        'de propriedade, do LOCADOR. Se houver condomínio, as despesas ordinárias atribuídas legalmente ao LOCATÁRIO serão pagas ' +
        'por ele, e as extraordinárias pelo LOCADOR.'
      : 'Salvo acordo escrito em contrário, o IPTU e despesas extraordinárias de propriedade serão de responsabilidade do LOCADOR. ' +
        'Se houver condomínio, as despesas ordinárias atribuídas legalmente ao LOCATÁRIO serão pagas por ele, e as extraordinárias pelo LOCADOR.',
    imovel.valor_condominio
      ? `A taxa de condomínio ordinária é, nesta data, de aproximadamente ${formatarMoeda(Number(imovel.valor_condominio))} ` +
        `(${valorPorExtenso(Number(imovel.valor_condominio))}) por mês, sujeita às alterações aprovadas pelo condomínio.`
      : null,
  )

  // 6. Garantia
  const unica = 'As partes reconhecem que não está sendo exigida mais de uma modalidade de garantia.'
  const vg = locacao.valor_garantia ? `${formatarMoeda(Number(locacao.valor_garantia))} (${valorPorExtenso(Number(locacao.valor_garantia))})` : `R$ ${L}`
  switch (locacao.garantia) {
    case 'caucao':
      add('DA GARANTIA (CAUÇÃO)',
        `Em garantia das obrigações deste contrato, o LOCATÁRIO entrega ao LOCADOR caução em dinheiro no valor de ${vg}, nos termos ` +
          'do artigo 38 da Lei nº 8.245/1991, que será devolvida ao final da locação, após a vistoria de saída e a quitação de ' +
          'eventuais débitos, podendo ser utilizada para cobrir valores em aberto.',
        unica)
      break
    case 'fiador':
      add('DA GARANTIA (FIANÇA)',
        `Assina também este contrato, como FIADOR e principal pagador, ${ou(locacao.fiador_nome, LL).toUpperCase()}, inscrito(a) no CPF ` +
          `nº ${ou(locacao.fiador_cpf)}${locacao.fiador_qualificacao ? `, ${locacao.fiador_qualificacao.replace(/\.$/, '')}` : ''}, ` +
          'responsável solidariamente por todas as obrigações do LOCATÁRIO até a efetiva entrega das chaves, renunciando aos ' +
          'benefícios dos artigos 827, 835 e 838 do Código Civil.',
        unica)
      break
    case 'seguro_fianca':
    case 'titulo_capitalizacao':
      add('DA GARANTIA',
        `A locação é garantida por ${GARANTIAS[locacao.garantia].toLowerCase()}${locacao.valor_garantia ? ` no valor de ${vg}` : ''}, ` +
          'contratado(a) pelo LOCATÁRIO e mantido(a) vigente durante toda a locação.',
        unica)
      break
    default:
      add('DA AUSÊNCIA DE GARANTIA',
        'A locação é celebrada sem fiador, caução, seguro-fiança ou outra garantia locatícia. ' + unica)
  }

  // 7. Conservação, vistoria e benfeitorias
  add(
    'DA CONSERVAÇÃO, VISTORIA E BENFEITORIAS',
    'O LOCATÁRIO declara receber o imóvel em condições de uso, conforme laudo de vistoria e registro fotográfico que, se elaborado, ' +
      'deverá ser anexado a este contrato. A declaração não afasta a responsabilidade do LOCADOR por defeitos preexistentes ou ' +
      'vícios que sejam de sua responsabilidade legal.',
    'O LOCATÁRIO deverá conservar o imóvel, reparar danos que causar ou que forem causados por seus familiares, visitantes ou ' +
      'prestadores, e devolvê-lo ao final da locação no estado em que o recebeu, ressalvado o desgaste natural decorrente do uso regular.',
    'Obras ou benfeitorias dependerão de autorização prévia e escrita do LOCADOR. A indenização ou retenção por benfeitorias será ' +
      'tratada conforme a legislação aplicável e eventual acordo escrito entre as partes.',
    'É vedado sublocar, ceder ou emprestar o imóvel, total ou parcialmente, sem consentimento prévio e escrito do LOCADOR.',
    'O LOCADOR poderá vistoriar o imóvel mediante prévio agendamento com o LOCATÁRIO, em dia e horário razoáveis.',
  )

  // 8. Rescisão e multa
  const mr = locacao.multa_rescisao_alugueis
  const mrTexto = mr ? (Number.isInteger(Number(mr)) ? numeroComExtenso(Number(mr)) : pct(mr)) : null
  add(
    'DA RESCISÃO E MULTA',
    locacao.prazo_meses && mrTexto
      ? 'Durante o prazo determinado, o LOCATÁRIO poderá devolver o imóvel antes do término, mediante comunicação escrita, ficando ' +
        `sujeito à multa equivalente a ${mrTexto} ${Number(mr) === 1 ? 'aluguel vigente' : 'aluguéis vigentes'}, reduzida ` +
        'proporcionalmente ao período já cumprido do contrato, conforme artigo 4º da Lei nº 8.245/1991, salvo hipótese legal de dispensa.'
      : null,
    locacao.prazo_meses && mrTexto
      ? 'Para cálculo proporcional, a multa será calculada pela seguinte fórmula: multa integral × (período restante do contrato ÷ prazo total contratado).'
      : null,
    'O LOCATÁRIO deverá, preferencialmente, comunicar a intenção de desocupação com 30 (trinta) dias de antecedência, para ' +
      'organização da vistoria e entrega das chaves.' + (locacao.prazo_meses && mrTexto ? ' Esse aviso não substitui nem altera a multa proporcional, quando devida.' : ''),
    'O LOCADOR não poderá reaver o imóvel durante o prazo contratual, salvo nas hipóteses legais. O descumprimento contratual ' +
      'poderá ensejar medidas legais cabíveis, inclusive rescisão e despejo, conforme a lei.',
  )

  // 9. Entrega das chaves
  add(
    'DA ENTREGA DAS CHAVES',
    'A devolução das chaves deverá ser formalizada por escrito, após vistoria de saída. A entrega das chaves não implica quitação ' +
      'automática de valores pendentes, que deverão ser apurados e discriminados.',
  )

  // Cláusulas adicionais (opcional)
  if (locacao.clausulas_adicionais) {
    add('DISPOSIÇÕES ADICIONAIS', ...locacao.clausulas_adicionais.split('\n').map((l) => l.trim()).filter(Boolean))
  }

  // Foro
  add('DO FORO', `Fica eleito o foro da Comarca de ${foro} para dirimir questões decorrentes deste contrato, ressalvadas as regras legais de competência.`)

  // ------------------------------------------------------------ PDF
  const corpo: Content[] = []
  clausulas.forEach((c, i) => {
    corpo.push({ text: `CLÁUSULA ${i + 1}ª – ${c.titulo}`, style: 'titulo2' })
    c.paragrafos.forEach((p) => corpo.push({ text: semQuebra(p), style: 'paragrafo' }))
  })

  const [t1, t2] = op.testemunhas
  // Bloco de assinatura no formato do modelo: nome, CPF e linha de assinatura.
  // Testemunha sem nome: a própria linha do nome é preenchida/assinada à mão.
  const assinatura = (papel: string, nome: string | null, doc: string | null, comLinha = true, ultima = false): Content => ({
    unbreakable: true,
    margin: [0, 0, 0, ultima ? 0 : 18], // sem margem no último bloco: evita uma página extra em branco
    stack: [
      { text: [{ text: `${papel}: `, bold: true }, nome ? nome.toUpperCase() : '__________________________________________'] },
      { text: `CPF: ${doc || '______________________________'}` },
      ...(comLinha ? [{ text: 'Assinatura: __________________________________________', margin: [0, 12, 0, 0] } as Content] : []),
    ],
  })

  const cidadeAssinatura = op.cidadeAssinatura || cidadeImovel || '__________________'

  return {
    pageSize: 'A4',
    pageMargins: [56, 50, 56, 56],
    info: { title: `Contrato de locação - ${imovel.identificacao} - ${inq.nome}`, author: proprietario?.nome ?? '' },
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.3, alignment: 'justify' },
    styles: {
      titulo: { fontSize: 14, bold: true, alignment: 'center', margin: [0, 0, 0, 2] },
      subtitulo: { fontSize: 9.5, alignment: 'center', color: '#444', margin: [0, 0, 0, 16] },
      titulo2: { bold: true, fontSize: 10.5, margin: [0, 12, 0, 4], alignment: 'left' },
      paragrafo: { margin: [0, 0, 0, 6] },
    },
    content: [
      { text: `CONTRATO DE LOCAÇÃO DE IMÓVEL ${residencial ? 'RESIDENCIAL' : 'COMERCIAL'}`, style: 'titulo' },
      { text: 'Lei nº 8.245/1991 (Lei do Inquilinato)', style: 'subtitulo' },
      { text: 'QUALIFICAÇÃO DAS PARTES', style: 'titulo2', margin: [0, 0, 0, 4] },
      // Qualificação alinhada à esquerda: as lacunas longas deixariam espaços enormes no texto justificado.
      { text: [{ text: 'LOCADOR: ', bold: true }, ...semQuebra(`${locador}.`)], style: 'paragrafo', alignment: 'left' },
      { text: [{ text: 'LOCATÁRIO: ', bold: true }, ...semQuebra(`${locatario}.`)], style: 'paragrafo', alignment: 'left' },
      {
        text: `As partes celebram o presente contrato de locação ${tipoLocacao}, que será regido pela Lei nº 8.245/1991 e pelas cláusulas abaixo.`,
        style: 'paragrafo',
        margin: [0, 4, 0, 6],
      },
      ...corpo,
      { text: 'DISPOSIÇÕES FINAIS', style: 'titulo2' },
      {
        text: `E, por estarem de acordo, as partes assinam este instrumento em ${temFiador ? 'três' : 'duas'} vias de igual teor, ` +
          'juntamente com duas testemunhas, ou por meio eletrônico que permita comprovar autoria e integridade.',
        style: 'paragrafo',
      },
      { text: `${cidadeAssinatura}, ${dataPorExtenso(op.dataAssinatura)}.`, margin: [0, 18, 0, 24], alignment: 'left' },
      {
        stack: [
          assinatura('LOCADOR', proprietario?.nome ?? null, proprietario?.cpf_cnpj ?? null),
          assinatura('LOCATÁRIO', inq.nome, inq.cpf),
          ...(temFiador ? [assinatura('FIADOR', locacao.fiador_nome, locacao.fiador_cpf)] : []),
          assinatura('TESTEMUNHA 1', t1.nome ? capitalizarNome(t1.nome) : null, t1.cpf || null, Boolean(t1.nome)),
          assinatura('TESTEMUNHA 2', t2.nome ? capitalizarNome(t2.nome) : null, t2.cpf || null, Boolean(t2.nome), true),
        ],
        alignment: 'left',
      },
    ],
    footer: (pagina, total) => ({
      text: `Página ${pagina} de ${total}`,
      fontSize: 8,
      color: '#666',
      alignment: 'right',
      margin: [56, 20, 56, 0],
    }),
  }
}

/** Nome de arquivo seguro: "Contrato - Apto 101 - Maria Silva.pdf" */
export function nomeArquivoContrato(d: DadosContrato): string {
  return nomeArquivo(`Contrato - ${d.imovel.identificacao} - ${d.locacao.inquilino.nome}.pdf`)
}

/** Gera o PDF do contrato. */
export async function gerarPdfContrato(d: DadosContrato, op: OpcoesContrato): Promise<Blob> {
  return gerarPdf(montarContrato(d, op))
}
