import { useRef, useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { Campo } from './CamposLocacao'
import { IconeDocumento } from './Icones'
import { enviarDocumento, excluirDocumento, linkDocumento, listarDocumentos, type LocacaoComInquilino } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { formatarData } from '../lib/format'
import { primeiraMaiuscula } from '../lib/texto'
import { useCarregar } from '../lib/useCarregar'
import type { Documento, TipoDocumento } from '../types/database'

const TIPOS: Record<TipoDocumento, string> = {
  contrato_assinado: 'Contrato assinado',
  aditivo: 'Aditivo / renovação',
  vistoria: 'Vistoria / laudo',
  documento_pessoal: 'Documento pessoal (RG, CPF…)',
  comprovante: 'Comprovante',
  outro: 'Outro',
}

const TAMANHO_MAXIMO = 20 * 1024 * 1024 // 20 MB
const ACEITOS = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,application/pdf,image/*'

const tamanhoLegivel = (b: number | null) =>
  !b ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`

/** Documentos guardados do imóvel (contrato assinado, vistoria, documentos pessoais…). */
export function DocumentosImovel({ imovelId, locacoes, aoAlterar, aoErro }: {
  imovelId: string
  locacoes: LocacaoComInquilino[]
  aoAlterar: (texto: string) => void
  aoErro: (texto: string) => void
}) {
  const { dados, erro, recarregar } = useCarregar(() => listarDocumentos(imovelId), [imovelId])
  const [enviando, setEnviando] = useState(false)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const nomeLocacao = (id: string | null) => {
    const l = locacoes.find((x) => x.id === id)
    return l ? `${l.inquilino.nome} (desde ${formatarData(l.data_entrada)})` : null
  }

  async function abrir(d: Documento, baixar: boolean) {
    setAbrindo(d.id)
    try {
      const url = await linkDocumento(d.caminho, baixar ? d.nome : undefined)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      aoErro(mensagemDeErro(err))
    } finally {
      setAbrindo(null)
    }
  }

  async function excluir(d: Documento) {
    if (!window.confirm(`Excluir o documento "${d.nome}"? O arquivo será apagado definitivamente.`)) return
    try {
      await excluirDocumento(d)
      aoAlterar('Documento excluído.')
      recarregar()
    } catch (err) {
      aoErro(mensagemDeErro(err))
    }
  }

  return (
    <>
      <div className="cabecalho-secao">
        <h2>Documentos</h2>
        <button className="botao botao--pequeno botao--primario" onClick={() => setEnviando(true)}>+ Anexar documento</button>
      </div>
      {erro && <p className="alerta alerta--erro">{erro}</p>}
      {dados && dados.length === 0 && (
        <p className="vazio">Nenhum documento guardado. Anexe aqui o contrato assinado, a vistoria e os documentos do inquilino.</p>
      )}
      {dados && dados.length > 0 && (
        <ul className="lista-documentos">
          {dados.map((d) => (
            <li key={d.id} className="documento">
              <span className="documento__icone"><IconeDocumento /></span>
              <div>
                <div className="documento__nome">{d.nome}</div>
                <div className="texto-suave texto-pequeno">
                  {TIPOS[d.tipo]} · {formatarData(d.created_at.slice(0, 10))}
                  {d.tamanho ? ` · ${tamanhoLegivel(d.tamanho)}` : ''}
                  {nomeLocacao(d.locacao_id) ? ` · ${nomeLocacao(d.locacao_id)}` : ''}
                </div>
                {d.observacao && <div className="texto-suave texto-pequeno">{d.observacao}</div>}
              </div>
              <div className="grupo-botoes">
                <button className="botao botao--pequeno" onClick={() => abrir(d, false)} disabled={abrindo === d.id}>Abrir</button>
                <button className="botao botao--pequeno botao--discreto" onClick={() => abrir(d, true)} disabled={abrindo === d.id}>Baixar</button>
                <button className="botao botao--pequeno botao--discreto botao--texto-perigo" onClick={() => excluir(d)}>Excluir</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {enviando && (
        <FormDocumento
          imovelId={imovelId}
          locacoes={locacoes}
          aoFechar={() => setEnviando(false)}
          aoSalvar={() => {
            setEnviando(false)
            aoAlterar('Documento guardado.')
            recarregar()
          }}
        />
      )}
    </>
  )
}

function FormDocumento({ imovelId, locacoes, aoFechar, aoSalvar }: {
  imovelId: string
  locacoes: LocacaoComInquilino[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const ativa = locacoes.find((l) => l.situacao === 'ativa')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [tipo, setTipo] = useState<TipoDocumento>('contrato_assinado')
  const [nome, setNome] = useState('')
  const [locacaoId, setLocacaoId] = useState(ativa?.id ?? '')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  function escolher(f: File | null) {
    setErro(null)
    if (f && f.size > TAMANHO_MAXIMO) {
      setErro('O arquivo passa de 20 MB. Diminua a resolução da foto ou compacte o PDF.')
      return
    }
    setArquivo(f)
    if (f && !nome) setNome(f.name.replace(/\.[^.]+$/, ''))
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!arquivo) return setErro('Escolha o arquivo.')
    if (!nome.trim()) return setErro('Dê um nome ao documento.')
    setSalvando(true)
    try {
      const extensao = arquivo.name.match(/\.[^.]+$/)?.[0] ?? ''
      await enviarDocumento(arquivo, {
        imovel_id: imovelId,
        locacao_id: locacaoId || null,
        tipo,
        nome: `${primeiraMaiuscula(nome)}${nome.toLowerCase().endsWith(extensao.toLowerCase()) ? '' : extensao}`,
        observacao: observacao.trim() || null,
      })
      aoSalvar()
    } catch (err) {
      const msg = mensagemDeErro(err)
      setErro(/bucket|not found/i.test(msg) ? 'A pasta de documentos ainda não existe. Rode o script 0008 no Supabase.' : msg)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo="Anexar documento" aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        <div className={`escolher-arquivo ${arquivo ? 'escolher-arquivo--ok' : ''}`} onClick={() => entrada.current?.click()}>
          <input ref={entrada} type="file" accept={ACEITOS} hidden onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
          {arquivo ? (
            <><strong>{arquivo.name}</strong><span className="texto-suave texto-pequeno">{tamanhoLegivel(arquivo.size)} · clique para trocar</span></>
          ) : (
            <><strong>Clique para escolher o arquivo</strong><span className="texto-suave texto-pequeno">PDF, foto (JPG/PNG) ou Word, até 20 MB. No celular, dá para tirar foto.</span></>
          )}
        </div>
        <div className="grade-2">
          <Campo rotulo="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)}>
              {Object.entries(TIPOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Locação" dica="opcional">
            <select value={locacaoId} onChange={(e) => setLocacaoId(e.target.value)}>
              <option value="">— do imóvel (sem locação) —</option>
              {locacoes.map((l) => (
                <option key={l.id} value={l.id}>{l.inquilino.nome} — {l.situacao === 'ativa' ? 'atual' : `até ${formatarData(l.data_saida)}`}</option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Nome do documento">
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={150} placeholder="Ex.: Contrato assinado 2026" />
        </Campo>
        <Campo rotulo="Observação" dica="opcional">
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} placeholder="Ex.: assinado pelo gov.br em 25/11/2026" />
        </Campo>
        {erro && <p className="alerta alerta--erro" role="alert">{erro}</p>}
        <div className="acoes-form">
          <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="botao botao--primario" disabled={salvando}>{salvando ? 'Enviando…' : 'Guardar documento'}</button>
        </div>
      </form>
    </Modal>
  )
}
