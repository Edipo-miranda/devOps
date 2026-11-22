import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from './Modal'
import { Campo } from './CamposLocacao'
import { CampoData } from './CampoData'
import { IconeBaixar, IconeCompartilhar } from './Icones'
import { EditorContrato } from './EditorContrato'
import {
  extrairModelo,
  gerarPdfContrato,
  nomeArquivoContrato,
  pendenciasContrato,
  preencherModelo,
  textoPadraoContrato,
  type DadosContrato,
  type OpcoesContrato,
  type TextoContrato,
} from '../lib/contrato'
import { excluirModelo, listarModelos, salvarModelo, salvarTextoContrato } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { entregarArquivo } from '../lib/pdf'
import { useCarregar } from '../lib/useCarregar'
import { mascararCpf } from '../lib/documentos'
import { hojeBrasil } from '../lib/format'

/** Janela para conferir pendências, escolher local/data/testemunhas e gerar o contrato em PDF. */
export function GerarContrato({ dados, aoFechar }: { dados: DadosContrato; aoFechar: () => void }) {
  const { obrigatorio, recomendado } = pendenciasContrato(dados)
  const cidadePadrao = dados.imovel.cidade ? `${dados.imovel.cidade}${dados.imovel.uf ? `/${dados.imovel.uf}` : ''}` : ''
  const [cidade, setCidade] = useState(cidadePadrao)
  const [data, setData] = useState('') // vazio = data em branco para preencher à mão
  const [incluirPrimeiro, setIncluirPrimeiro] = useState(true)
  const [primeiro, setPrimeiro] = useState({ periodo: '', valor: '', vencimento: '' })
  const [t1, setT1] = useState({ nome: '', cpf: '' })
  const [t2, setT2] = useState({ nome: '', cpf: '' })
  const [gerando, setGerando] = useState<'baixar' | 'compartilhar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState<string | null>(null)

  // Qual texto usar: padrão, o editado desta locação, ou um modelo salvo.
  const [textoLocacao, setTextoLocacao] = useState<TextoContrato | null>((dados.locacao.contrato_texto as TextoContrato | null) ?? null)
  const [fonte, setFonte] = useState<string>(textoLocacao ? 'locacao' : 'padrao')
  const [textoEditado, setTextoEditado] = useState<TextoContrato | null>(null)
  const [editando, setEditando] = useState(false)
  const [nomeModelo, setNomeModelo] = useState('')
  const [salvandoTexto, setSalvandoTexto] = useState(false)
  const { dados: modelos, recarregar: recarregarModelos } = useCarregar(listarModelos, [])

  const opcoes = (): OpcoesContrato => ({
    cidadeAssinatura: cidade.trim(),
    dataAssinatura: data,
    testemunhas: [t1, t2],
    primeiroPagamento: incluirPrimeiro ? primeiro : null,
  })
  const podeCompartilhar = typeof navigator !== 'undefined' && 'canShare' in navigator

  /** Texto escolhido, já com os dados desta locação. */
  function textoAtual(): TextoContrato {
    if (textoEditado) return textoEditado
    if (fonte === 'locacao' && textoLocacao) return preencherModelo(textoLocacao, dados)
    const modelo = modelos?.find((m) => `modelo:${m.id}` === fonte)
    if (modelo) return preencherModelo(modelo.conteudo as TextoContrato, dados)
    return textoPadraoContrato(dados, opcoes())
  }

  function escolherFonte(f: string) {
    setFonte(f)
    setTextoEditado(null)
  }

  async function gerar(acao: 'baixar' | 'compartilhar') {
    setErro(null)
    setPronto(null)
    setGerando(acao)
    try {
      const blob = await gerarPdfContrato(dados, opcoes(), textoAtual())
      const nome = nomeArquivoContrato(dados)
      const ok = await entregarArquivo(blob, nome, acao, 'Contrato de locação para assinatura')
      if (ok) setPronto(`PDF gerado: ${nome}. Depois de assinado, anexe-o em “Documentos” na página do imóvel.`)
    } catch (err) {
      setErro(`Não foi possível gerar o PDF. ${mensagemDeErro(err)}`)
    } finally {
      setGerando(null)
    }
  }

  async function salvarNaLocacao() {
    setErro(null)
    setSalvandoTexto(true)
    try {
      const modelo = extrairModelo(textoAtual(), dados)
      await salvarTextoContrato(dados.locacao.id, modelo)
      setTextoLocacao(modelo)
      setFonte('locacao')
      setPronto('Texto salvo nesta locação. Ele será usado sempre que gerar o contrato deste inquilino.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvandoTexto(false)
    }
  }

  async function salvarComoModelo() {
    setErro(null)
    if (nomeModelo.trim().length < 2) return setErro('Dê um nome ao modelo (ex.: "Comercial com fiador").')
    setSalvandoTexto(true)
    try {
      await salvarModelo(null, nomeModelo.trim(), extrairModelo(textoAtual(), dados))
      setPronto(`Modelo "${nomeModelo.trim()}" salvo. Ele aparece em "Texto do contrato" em qualquer locação.`)
      setNomeModelo('')
      recarregarModelos()
    } catch (err) {
      const e = err as { code?: string }
      setErro(e.code === '23505' ? 'Já existe um modelo com esse nome.' : mensagemDeErro(err))
    } finally {
      setSalvandoTexto(false)
    }
  }

  async function voltarAoPadraoNaLocacao() {
    if (!window.confirm('Apagar o texto editado desta locação e voltar ao contrato padrão?')) return
    try {
      await salvarTextoContrato(dados.locacao.id, null)
      setTextoLocacao(null)
      escolherFonte('padrao')
      setPronto('Esta locação voltou a usar o contrato padrão.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function apagarModelo() {
    const m = modelos?.find((x) => `modelo:${x.id}` === fonte)
    if (!m || !window.confirm(`Excluir o modelo "${m.nome}"? Contratos já gerados não são afetados.`)) return
    try {
      await excluirModelo(m.id)
      escolherFonte(textoLocacao ? 'locacao' : 'padrao')
      recarregarModelos()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  if (editando) {
    const texto = textoEditado ?? textoAtual()
    return (
      <Modal titulo="Editar texto do contrato" aoFechar={aoFechar} largo>
        <EditorContrato texto={texto} aoMudar={setTextoEditado} />
        {erro && <p className="alerta alerta--erro" role="alert">{erro}</p>}
        {pronto && <p className="alerta alerta--ok" role="status">{pronto}</p>}
        <div className="salvar-modelo">
          <input value={nomeModelo} onChange={(e) => setNomeModelo(e.target.value)} placeholder="Nome do modelo (ex.: Comercial com fiador)" maxLength={100} />
          <button type="button" className="botao" onClick={salvarComoModelo} disabled={salvandoTexto}>Salvar como modelo</button>
        </div>
        <div className="acoes-form acoes-form--separadas">
          <button type="button" className="botao botao--discreto" onClick={() => { setTextoEditado(textoPadraoContrato(dados, opcoes())); setPronto(null) }}>
            Restaurar texto padrão
          </button>
          <div className="grupo-botoes">
            <button type="button" className="botao" onClick={salvarNaLocacao} disabled={salvandoTexto}>
              {salvandoTexto ? 'Salvando…' : 'Salvar nesta locação'}
            </button>
            <button type="button" className="botao botao--primario" onClick={() => { setTextoEditado(texto); setEditando(false); setPronto(null) }}>
              Usar este texto →
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal titulo="Gerar contrato em PDF" aoFechar={aoFechar} largo>
      <p className="texto-suave paragrafo">
        Contrato de <strong>{dados.locacao.inquilino.nome}</strong> — {dados.imovel.identificacao}. Os dados vêm do cadastro do
        proprietário, do inquilino, do imóvel e da locação.
      </p>

      {obrigatorio.length > 0 && (
        <div className="alerta alerta--erro">
          <strong>Faltam dados importantes</strong> (o contrato sairá com espaços em branco para preencher à mão):
          <ul className="lista-pendencias">{obrigatorio.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {recomendado.length > 0 && (
        <div className="alerta alerta--info">
          <strong>Recomendado completar:</strong>
          <ul className="lista-pendencias">{recomendado.map((p) => <li key={p}>{p}</li>)}</ul>
          Complete em <em>Editar inquilino</em>, <em>Editar imóvel</em> ou em <Link to="/proprietarios" onClick={aoFechar}>Proprietários</Link>.
        </div>
      )}

      <div className="escolha-texto">
        <Campo rotulo="Texto do contrato">
          <select value={textoEditado ? 'editado' : fonte} onChange={(e) => escolherFonte(e.target.value)}>
            {textoEditado && <option value="editado">Texto editado agora (não salvo)</option>}
            <option value="padrao">Contrato padrão (modelo revisado)</option>
            {textoLocacao && <option value="locacao">Texto salvo desta locação</option>}
            {modelos?.map((m) => <option key={m.id} value={`modelo:${m.id}`}>Modelo: {m.nome}</option>)}
          </select>
        </Campo>
        <div className="grupo-botoes">
          <button type="button" className="botao" onClick={() => setEditando(true)}>Editar texto / cláusulas</button>
          {fonte === 'locacao' && !textoEditado && <button type="button" className="botao botao--discreto" onClick={voltarAoPadraoNaLocacao}>Voltar ao padrão</button>}
          {fonte.startsWith('modelo:') && !textoEditado && <button type="button" className="botao botao--discreto botao--texto-perigo" onClick={apagarModelo}>Excluir modelo</button>}
        </div>
      </div>

      <div className="grade-2">
        <Campo rotulo="Cidade da assinatura">
          <input value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={100} placeholder="Campinas/SP" />
        </Campo>
        <Campo rotulo="Data da assinatura" dica="vazio = em branco no contrato">
          <div className="campo-com-botao">
            <CampoData key={data ? 'com-data' : 'sem-data'} valor={data} aoMudar={setData} />
            <button type="button" className="botao botao--pequeno" onClick={() => setData(hojeBrasil())}>Hoje</button>
          </div>
        </Campo>
      </div>

      <label className="checagem paragrafo">
        <input type="checkbox" checked={incluirPrimeiro} onChange={(e) => setIncluirPrimeiro(e.target.checked)} />
        <span>Incluir o parágrafo de <strong>primeiro pagamento proporcional</strong> (campos vazios saem em branco)</span>
      </label>
      {incluirPrimeiro && (
        <div className="grade-3">
          <Campo rotulo="Período" dica="opcional">
            <input value={primeiro.periodo} onChange={(e) => setPrimeiro({ ...primeiro, periodo: e.target.value })} placeholder="21/11 a 04/12/2026" maxLength={60} />
          </Campo>
          <Campo rotulo="Valor (R$)" dica="opcional">
            <input value={primeiro.valor} onChange={(e) => setPrimeiro({ ...primeiro, valor: e.target.value })} inputMode="decimal" placeholder="700,00" maxLength={20} />
          </Campo>
          <Campo rotulo="Vencimento" dica="opcional">
            <input value={primeiro.vencimento} onChange={(e) => setPrimeiro({ ...primeiro, vencimento: e.target.value })} placeholder="05/12/2026" maxLength={20} />
          </Campo>
        </div>
      )}
      <p className="subtitulo-form">Testemunhas <small className="texto-suave">(opcional — podem ser preenchidas à mão)</small></p>
      <div className="grade-2">
        <Campo rotulo="Testemunha 1 — nome"><input value={t1.nome} onChange={(e) => setT1({ ...t1, nome: e.target.value })} maxLength={150} /></Campo>
        <Campo rotulo="Testemunha 1 — CPF"><input value={t1.cpf} onChange={(e) => setT1({ ...t1, cpf: mascararCpf(e.target.value) })} inputMode="numeric" /></Campo>
        <Campo rotulo="Testemunha 2 — nome"><input value={t2.nome} onChange={(e) => setT2({ ...t2, nome: e.target.value })} maxLength={150} /></Campo>
        <Campo rotulo="Testemunha 2 — CPF"><input value={t2.cpf} onChange={(e) => setT2({ ...t2, cpf: mascararCpf(e.target.value) })} inputMode="numeric" /></Campo>
      </div>

      <div className="dica-assinatura">
        <strong>Como assinar</strong>
        <ul>
          <li><strong>No papel:</strong> imprima, todos assinam e rubricam cada página.</li>
          <li>
            <strong>Pela internet, de graça:</strong> cada pessoa assina o PDF no <em>Assinador gov.br</em>{' '}
            (<a href="https://assinador.iti.br" target="_blank" rel="noreferrer">assinador.iti.br</a>) com a conta gov.br nível prata ou ouro,
            e devolve o arquivo assinado.
          </li>
        </ul>
        <small className="texto-suave">Este é um modelo de contrato. Recomendamos a revisão por um advogado antes do primeiro uso.</small>
      </div>

      {erro && <p className="alerta alerta--erro" role="alert">{erro}</p>}
      {pronto && <p className="alerta alerta--ok" role="status">{pronto}</p>}

      <div className="acoes-form">
        <button type="button" className="botao" onClick={aoFechar}>Fechar</button>
        {podeCompartilhar && (
          <button type="button" className="botao botao--com-icone" onClick={() => gerar('compartilhar')} disabled={gerando !== null}>
            <IconeCompartilhar tamanho={16} /> {gerando === 'compartilhar' ? 'Gerando…' : 'Enviar (WhatsApp, e-mail…)'}
          </button>
        )}
        <button type="button" className="botao botao--primario botao--com-icone" onClick={() => gerar('baixar')} disabled={gerando !== null}>
          <IconeBaixar tamanho={16} /> {gerando === 'baixar' ? 'Gerando…' : 'Baixar PDF'}
        </button>
      </div>
    </Modal>
  )
}
