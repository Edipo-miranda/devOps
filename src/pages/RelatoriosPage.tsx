import { useMemo, useState } from 'react'
import { listarDespesas, listarImoveis, listarInquilinos, listarProprietarios, recebimentosPagosNoAno } from '../lib/api'
import { formatarEndereco } from '../lib/documentos'
import { exportarExcel, exportarPdf } from '../lib/exportar'
import { formatarMoeda, hojeBrasil } from '../lib/format'
import { mensagemDeErro } from '../lib/erros'
import {
  COLUNAS_DESPESAS,
  COLUNAS_IMOVEIS,
  COLUNAS_MESES,
  COLUNAS_PAGADORES,
  COLUNAS_RECEBIMENTOS,
  calcularRelatorio,
  secoesRelatorio,
} from '../lib/relatorios'
import { nomeArquivo } from '../lib/pdf'
import { useCarregar } from '../lib/useCarregar'

const ANO_ATUAL = Number(hojeBrasil().slice(0, 4))

export function RelatoriosPage() {
  const [ano, setAno] = useState(ANO_ATUAL)
  const [proprietarioId, setProprietarioId] = useState('')
  const [gerando, setGerando] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  const { dados, erro, carregando } = useCarregar(async () => {
    const [recebimentos, despesas, imoveis, proprietarios] = await Promise.all([
      recebimentosPagosNoAno(ano), listarDespesas({ ano }), listarImoveis(), listarProprietarios(),
    ])
    return { recebimentos, despesas, imoveis, proprietarios }
  }, [ano])

  const rel = useMemo(() => {
    if (!dados) return null
    const doDono = (imovelId: string) => !proprietarioId || dados.imoveis.find((i) => i.id === imovelId)?.proprietario_id === proprietarioId
    const nome = (id: string) => dados.imoveis.find((i) => i.id === id)?.identificacao ?? 'Imóvel excluído'
    return calcularRelatorio(
      dados.recebimentos.filter((r) => doDono(r.imovel_id)),
      dados.despesas.filter((d) => doDono(d.imovel_id)),
      nome,
    )
  }, [dados, proprietarioId])

  const dono = dados?.proprietarios.find((p) => p.id === proprietarioId)
  const subtitulo = `Ano-calendário ${ano}${dono ? ` · Proprietário: ${dono.nome}${dono.cpf_cnpj ? ` (CPF/CNPJ ${dono.cpf_cnpj})` : ''}` : ' · Todos os proprietários'}`
  const base = `Relatório IR ${ano}${dono ? ` - ${dono.nome}` : ''}`

  async function executar(chave: string, acao: () => Promise<void>) {
    setErroAcao(null)
    setGerando(chave)
    try {
      await acao()
    } catch (err) {
      setErroAcao(mensagemDeErro(err))
    } finally {
      setGerando(null)
    }
  }

  const pdf = () => executar('pdf', () => exportarPdf(nomeArquivo(base), 'Relatório de rendimentos de aluguel', subtitulo, secoesRelatorio(rel!),
    'Documento auxiliar para o Imposto de Renda. Confirme valores e deduções com seu contador.'))

  const excel = () => executar('excel', () => exportarExcel(nomeArquivo(base), [
    { nome: 'Mês a mês', colunas: COLUNAS_MESES, linhas: rel!.meses },
    { nome: 'Pagadores', colunas: COLUNAS_PAGADORES, linhas: rel!.pagadores },
    { nome: 'Por imóvel', colunas: COLUNAS_IMOVEIS, linhas: rel!.imoveis },
    { nome: 'Recebimentos', colunas: COLUNAS_RECEBIMENTOS, linhas: rel!.recebimentos },
    { nome: 'Despesas', colunas: COLUNAS_DESPESAS, linhas: rel!.despesas },
  ]))

  const cadastros = () => executar('cadastros', async () => {
    const inquilinos = await listarInquilinos()
    const d = dados!
    await exportarExcel(`Cadastros ${hojeBrasil()}`, [
      {
        nome: 'Imóveis',
        colunas: [
          { titulo: 'Identificação', valor: (i) => i.identificacao },
          { titulo: 'Endereço', valor: (i) => formatarEndereco(i) || i.endereco, largura: 50 },
          { titulo: 'Proprietário', valor: (i) => i.proprietario?.nome ?? '' },
          { titulo: 'Inquilino atual', valor: (i) => i.locacao_ativa?.inquilino.nome ?? '' },
          { titulo: 'Aluguel', valor: (i) => (i.locacao_ativa ? Number(i.locacao_ativa.valor_aluguel) : null), tipo: 'moeda' },
          { titulo: 'Vencimento', valor: (i) => i.locacao_ativa?.dia_vencimento ?? null, tipo: 'numero' },
          { titulo: 'Matrícula', valor: (i) => i.matricula ?? '' },
          { titulo: 'Inscrição IPTU', valor: (i) => i.inscricao_iptu ?? '' },
          { titulo: 'IPTU anual', valor: (i) => i.valor_iptu_anual, tipo: 'moeda' },
          { titulo: 'Condomínio', valor: (i) => i.valor_condominio, tipo: 'moeda' },
          { titulo: 'Situação', valor: (i) => (i.vendido_em ? 'Vendido' : i.ativo ? (i.locacao_ativa ? 'Alugado' : 'Vago') : 'Desativado') },
        ],
        linhas: d.imoveis,
      },
      {
        nome: 'Inquilinos',
        colunas: [
          { titulo: 'Nome', valor: (q) => q.nome },
          { titulo: 'CPF', valor: (q) => q.cpf ?? '', largura: 16 },
          { titulo: 'RG', valor: (q) => [q.rg, q.orgao_emissor].filter(Boolean).join(' '), largura: 18 },
          { titulo: 'Telefone', valor: (q) => q.telefone ?? '', largura: 18 },
          { titulo: 'E-mail', valor: (q) => q.email ?? '' },
          { titulo: 'Estado civil', valor: (q) => q.estado_civil ?? '', largura: 14 },
          { titulo: 'Profissão', valor: (q) => q.profissao ?? '', largura: 18 },
          { titulo: 'Endereço', valor: (q) => formatarEndereco(q), largura: 50 },
        ],
        linhas: inquilinos,
      },
      {
        nome: 'Proprietários',
        colunas: [
          { titulo: 'Nome', valor: (p) => p.nome },
          { titulo: 'CPF/CNPJ', valor: (p) => p.cpf_cnpj ?? '', largura: 20 },
          { titulo: 'Telefone', valor: (p) => p.telefone ?? '', largura: 18 },
          { titulo: 'E-mail', valor: (p) => p.email ?? '' },
          { titulo: 'PIX', valor: (p) => p.pix ?? '' },
          { titulo: 'Endereço', valor: (p) => formatarEndereco(p), largura: 50 },
        ],
        linhas: d.proprietarios,
      },
    ])
  })

  const t = rel?.totais

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Relatórios</h1>
          <p className="texto-suave">Rendimentos para o Imposto de Renda, despesas e lucro por imóvel. Exporte em PDF ou Excel para o contador.</p>
        </div>
      </div>

      <div className="barra-filtros">
        <select value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
          {Array.from({ length: 6 }, (_, i) => ANO_ATUAL - i).map((a) => <option key={a} value={a}>Ano {a}</option>)}
        </select>
        <select value={proprietarioId} onChange={(e) => setProprietarioId(e.target.value)} aria-label="Proprietário">
          <option value="">Todos os proprietários</option>
          {dados?.proprietarios.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <div className="grupo-botoes">
          <button className="botao botao--primario" onClick={pdf} disabled={!rel || gerando !== null}>{gerando === 'pdf' ? 'Gerando…' : 'PDF para o contador'}</button>
          <button className="botao" onClick={excel} disabled={!rel || gerando !== null}>{gerando === 'excel' ? 'Gerando…' : 'Excel'}</button>
          <button className="botao botao--discreto" onClick={cadastros} disabled={!dados || gerando !== null}>{gerando === 'cadastros' ? 'Gerando…' : 'Exportar cadastros'}</button>
        </div>
      </div>
      <p className="texto-suave texto-pequeno paragrafo">
        Para declarar por proprietário (cada um declara os próprios aluguéis), escolha o proprietário acima antes de exportar.
      </p>

      {erro && <p className="alerta alerta--erro">{erro}</p>}
      {erroAcao && <p className="alerta alerta--erro">{erroAcao}</p>}
      {!rel && !erro && <p className="texto-suave">Carregando…</p>}

      {rel && t && (
        <div className={carregando ? 'carregando' : ''}>
          <div className="resultado-ano resultado-ano--4">
            <div><span>Total recebido em {ano}</span><strong className="texto-ok">{formatarMoeda(t.total)}</strong></div>
            <div><span>Despesas dedutíveis</span><strong>{formatarMoeda(t.dedutiveis)}</strong></div>
            <div><span>Todas as despesas</span><strong className="texto-erro">− {formatarMoeda(t.despesas)}</strong></div>
            <div><span>Lucro líquido</span><strong>{formatarMoeda(t.lucro)}</strong></div>
          </div>

          <h2 className="titulo-secao">Mês a mês (carnê-leão)</h2>
          <div className="tabela-container">
            <table className="tabela tabela--responsiva">
              <thead><tr>{COLUNAS_MESES.map((c) => <th key={c.titulo} className={c.tipo === 'moeda' ? 'num' : ''}>{c.titulo}</th>)}</tr></thead>
              <tbody>
                {rel.meses.map((m) => (
                  <tr key={m.mes} className={m.total === 0 && m.dedutiveis === 0 ? 'linha-vazia' : ''}>
                    <td data-rotulo="Mês" className="destaque">{m.nome}</td>
                    <td data-rotulo="Aluguéis" className="num">{formatarMoeda(m.aluguel)}</td>
                    <td data-rotulo="Multa/juros" className="num">{formatarMoeda(m.encargos)}</td>
                    <td data-rotulo="Total recebido" className="num">{formatarMoeda(m.total)}</td>
                    <td data-rotulo="Dedutíveis" className="num">{formatarMoeda(m.dedutiveis)}</td>
                    <td data-rotulo="Base" className="num destaque">{formatarMoeda(m.base)}</td>
                  </tr>
                ))}
                <tr className="linha-total">
                  <td data-rotulo="Total">Total</td>
                  <td data-rotulo="Aluguéis" className="num">{formatarMoeda(t.aluguel)}</td>
                  <td data-rotulo="Multa/juros" className="num">{formatarMoeda(t.encargos)}</td>
                  <td data-rotulo="Total recebido" className="num">{formatarMoeda(t.total)}</td>
                  <td data-rotulo="Dedutíveis" className="num">{formatarMoeda(t.dedutiveis)}</td>
                  <td data-rotulo="Base" className="num">{formatarMoeda(t.base)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grade-relatorios">
            <div>
              <h2 className="titulo-secao">Por inquilino (pagador)</h2>
              {rel.pagadores.length === 0 ? <p className="vazio">Nenhum pagamento em {ano}.</p> : (
                <div className="tabela-container">
                  <table className="tabela tabela--responsiva">
                    <thead><tr><th>Inquilino</th><th>CPF</th><th className="num">Total</th></tr></thead>
                    <tbody>
                      {rel.pagadores.map((p) => (
                        <tr key={`${p.nome}${p.cpf}`}>
                          <td data-rotulo="Inquilino" className="destaque">{p.nome}</td>
                          <td data-rotulo="CPF">{p.cpf ?? <span className="texto-erro">sem CPF</span>}</td>
                          <td data-rotulo="Total" className="num">{formatarMoeda(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <h2 className="titulo-secao">Resultado por imóvel</h2>
              {rel.imoveis.length === 0 ? <p className="vazio">Sem movimento em {ano}.</p> : (
                <div className="tabela-container">
                  <table className="tabela tabela--responsiva">
                    <thead><tr><th>Imóvel</th><th className="num">Recebido</th><th className="num">Despesas</th><th className="num">Lucro</th></tr></thead>
                    <tbody>
                      {rel.imoveis.map((i) => (
                        <tr key={i.imovel}>
                          <td data-rotulo="Imóvel" className="destaque">{i.imovel}</td>
                          <td data-rotulo="Recebido" className="num">{formatarMoeda(i.recebido)}</td>
                          <td data-rotulo="Despesas" className="num">{formatarMoeda(i.despesas)}</td>
                          <td data-rotulo="Lucro" className="num destaque">{formatarMoeda(i.lucro)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <p className="texto-suave texto-pequeno" style={{ marginTop: 14 }}>
            Valores pelo mês do pagamento. Lance as despesas (IPTU, condomínio, manutenção…) na página de cada imóvel.
            Este relatório é um apoio: confirme deduções e obrigações com seu contador.
          </p>
        </div>
      )}
    </section>
  )
}
