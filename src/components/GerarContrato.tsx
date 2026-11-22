import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from './Modal'
import { Campo } from './CamposLocacao'
import { CampoData } from './CampoData'
import { IconeBaixar, IconeCompartilhar } from './Icones'
import { gerarPdfContrato, nomeArquivoContrato, pendenciasContrato, type DadosContrato, type OpcoesContrato } from '../lib/contrato'
import { mascararCpf } from '../lib/documentos'
import { hojeBrasil } from '../lib/format'

/** Janela para conferir pendências, escolher local/data/testemunhas e gerar o contrato em PDF. */
export function GerarContrato({ dados, aoFechar }: { dados: DadosContrato; aoFechar: () => void }) {
  const { obrigatorio, recomendado } = pendenciasContrato(dados)
  const cidadePadrao = dados.imovel.cidade ? `${dados.imovel.cidade}${dados.imovel.uf ? `/${dados.imovel.uf}` : ''}` : ''
  const [cidade, setCidade] = useState(cidadePadrao)
  const [data, setData] = useState(hojeBrasil())
  const [t1, setT1] = useState({ nome: '', cpf: '' })
  const [t2, setT2] = useState({ nome: '', cpf: '' })
  const [gerando, setGerando] = useState<'baixar' | 'compartilhar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState<string | null>(null)

  const opcoes = (): OpcoesContrato => ({ cidadeAssinatura: cidade.trim(), dataAssinatura: data || hojeBrasil(), testemunhas: [t1, t2] })
  const podeCompartilhar = typeof navigator !== 'undefined' && 'canShare' in navigator

  async function gerar(acao: 'baixar' | 'compartilhar') {
    setErro(null)
    setPronto(null)
    setGerando(acao)
    try {
      const blob = await gerarPdfContrato(dados, opcoes())
      const nome = nomeArquivoContrato(dados)
      const arquivo = new File([blob], nome, { type: 'application/pdf' })
      if (acao === 'compartilhar' && navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: nome, text: 'Contrato de locação para assinatura' })
        setPronto('Contrato compartilhado.')
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = nome
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
        setPronto(`PDF gerado: ${nome}`)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setErro('Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setGerando(null)
    }
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

      <div className="grade-2">
        <Campo rotulo="Cidade da assinatura">
          <input value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={100} placeholder="Campinas/SP" />
        </Campo>
        <Campo rotulo="Data da assinatura">
          <CampoData valor={data} aoMudar={setData} />
        </Campo>
      </div>
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
