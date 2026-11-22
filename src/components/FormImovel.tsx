import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from './Modal'
import { Campo, CamposLocacao, Secao } from './CamposLocacao'
import { CamposEndereco } from './CamposPessoa'
import { validarLocacao, valoresLocacaoIniciais, type ErrosLocacao } from '../lib/validacaoLocacao'
import { enderecoForm, validarEndereco, type Erros } from '../lib/formularios'
import { TIPOS_IMOVEL, formatarEndereco } from '../lib/documentos'
import {
  atualizarImovel,
  cadastrarImovel,
  invalidarMesAtual,
  listarInquilinos,
  listarProprietarios,
  type DadosImovel,
} from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import type { Imovel, Inquilino, Proprietario } from '../types/database'

interface Props {
  imovel?: Imovel // se informado, edita; senão, cadastra
  aoFechar: () => void
  aoSalvar: (id: string) => void
}

export function FormImovel({ imovel, aoFechar, aoSalvar }: Props) {
  const editando = Boolean(imovel)
  const [identificacao, setIdentificacao] = useState(imovel?.identificacao ?? '')
  const [tipo, setTipo] = useState(imovel?.tipo ?? '')
  const [proprietarioId, setProprietarioId] = useState(imovel?.proprietario_id ?? '')
  const [endereco, setEndereco] = useState(enderecoForm(imovel))
  const [descricao, setDescricao] = useState(imovel?.descricao ?? '')
  const [observacoes, setObservacoes] = useState(imovel?.observacoes ?? '')
  const [alugado, setAlugado] = useState(true)
  const [locacao, setLocacao] = useState(valoresLocacaoIniciais)
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([])
  const [proprietarios, setProprietarios] = useState<Proprietario[]>([])
  const [erros, setErros] = useState<Erros>({})
  const [errosLocacao, setErrosLocacao] = useState<ErrosLocacao>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    listarProprietarios()
      .then((l) => setProprietarios(l.filter((p) => p.ativo || p.id === imovel?.proprietario_id)))
      .catch(() => setProprietarios([]))
    if (!editando) listarInquilinos().then(setInquilinos).catch(() => setInquilinos([]))
  }, [editando, imovel?.proprietario_id])

  // Imóveis cadastrados antes da separação do endereço: mostra o texto antigo como referência.
  const enderecoAntigo = imovel && !imovel.logradouro ? imovel.endereco : null

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)

    const novosErros: Erros = {}
    if (!identificacao.trim()) novosErros.identificacao = 'Informe uma identificação, por exemplo "Apto 101".'
    else if (identificacao.trim().length > 120) novosErros.identificacao = 'Máximo de 120 caracteres.'
    const end = validarEndereco(endereco, true)
    Object.assign(novosErros, end.erros)
    setErros(novosErros)

    const validacao = !editando && alugado ? validarLocacao(locacao) : { erros: {}, dados: null }
    setErrosLocacao(validacao.erros)
    if (Object.keys(novosErros).length || Object.keys(validacao.erros).length) {
      setErroGeral('Revise os campos marcados em vermelho.')
      return
    }

    const dados: DadosImovel = {
      identificacao: identificacao.trim(),
      endereco: formatarEndereco(end.dados),
      observacoes: observacoes.trim() || null,
      tipo: tipo || null,
      descricao: descricao.trim() || null,
      proprietario_id: proprietarioId || null,
      ...end.dados,
    }

    setSalvando(true)
    try {
      if (imovel) {
        await atualizarImovel(imovel.id, dados)
        aoSalvar(imovel.id)
      } else {
        const id = await cadastrarImovel(dados, validacao.dados)
        invalidarMesAtual()
        aoSalvar(id)
      }
    } catch (err) {
      const e = err as { code?: string; message?: string }
      if (e.code === '23505' && /cpf/i.test(e.message ?? '')) setErroGeral('Já existe um inquilino com esse CPF. Use a opção "Já cadastrado".')
      else if (e.code === '23505') setErroGeral('Já existe um imóvel com essa identificação.')
      else setErroGeral(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={editando ? 'Editar imóvel' : 'Novo imóvel'} aoFechar={aoFechar} largo>
      <form onSubmit={salvar} noValidate>
        <div className="grade-3">
          <Campo rotulo="Identificação" erro={erros.identificacao}>
            <input value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} maxLength={120} placeholder="Ex.: Apto 101" />
          </Campo>
          <Campo rotulo="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">—</option>
              {TIPOS_IMOVEL.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Proprietário (dono)">
            <select value={proprietarioId} onChange={(e) => setProprietarioId(e.target.value)}>
              <option value="">— não informado —</option>
              {proprietarios.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        </div>
        {proprietarios.length === 0 && (
          <p className="texto-suave texto-pequeno paragrafo">
            Nenhum proprietário cadastrado. <Link to="/proprietarios" onClick={aoFechar}>Cadastrar proprietário</Link> — necessário para gerar contrato.
          </p>
        )}

        <p className="subtitulo-form">Endereço do imóvel</p>
        {enderecoAntigo && <p className="alerta alerta--info">Endereço anterior: <strong>{enderecoAntigo}</strong>. Preencha os campos separados abaixo.</p>}
        <CamposEndereco valores={endereco} aoMudar={setEndereco} erros={erros} />

        <div className="grade-2">
          <Campo rotulo="Descrição do imóvel" dica="vai no contrato">
            <textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={1000} placeholder="Ex.: 2 quartos, sala, cozinha, 1 banheiro e 1 vaga de garagem" />
          </Campo>
          <Campo rotulo="Observações internas" dica="não vai no contrato">
            <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} />
          </Campo>
        </div>

        {!editando && (
          <fieldset className="secao-form">
            <label className="checagem">
              <input type="checkbox" checked={alugado} onChange={(e) => setAlugado(e.target.checked)} />
              <span>O imóvel está alugado (cadastrar inquilino agora)</span>
            </label>
            {alugado && <CamposLocacao valores={locacao} erros={errosLocacao} inquilinos={inquilinos} aoMudar={setLocacao} />}
          </fieldset>
        )}

        {editando && (
          <Secao titulo="Para alterar inquilino ou condições do contrato" dica="use os botões da página do imóvel">
            <p className="texto-suave texto-pequeno">“Editar inquilino” e “Editar locação”, no quadro Locação atual.</p>
          </Secao>
        )}

        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}

        <div className="acoes-form">
          <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="botao botao--primario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
