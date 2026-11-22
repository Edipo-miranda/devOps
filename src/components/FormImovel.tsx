import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from './Modal'
import { Campo, CamposLocacao, Secao } from './CamposLocacao'
import { CamposEndereco } from './CamposPessoa'
import { validarLocacao, valoresLocacaoIniciais, type ErrosLocacao } from '../lib/validacaoLocacao'
import { enderecoForm, validarEndereco, type Erros } from '../lib/formularios'
import { TIPOS_IMOVEL, formatarEndereco } from '../lib/documentos'
import { capitalizarNome, primeiraMaiuscula } from '../lib/texto'
import {
  atualizarImovel,
  cadastrarImovel,
  invalidarMesAtual,
  listarInquilinos,
  listarProprietarios,
  type DadosImovel,
} from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { lerValor, valorParaCampo } from '../lib/format'
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
  const txt = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v))
  const [doc, setDoc] = useState({
    matricula: txt(imovel?.matricula),
    cartorio: txt(imovel?.cartorio),
    inscricao_iptu: txt(imovel?.inscricao_iptu),
    valor_iptu_anual: imovel?.valor_iptu_anual ? valorParaCampo(imovel.valor_iptu_anual) : '',
    valor_condominio: imovel?.valor_condominio ? valorParaCampo(imovel.valor_condominio) : '',
    area_m2: txt(imovel?.area_m2).replace('.', ','),
    quartos: txt(imovel?.quartos),
    banheiros: txt(imovel?.banheiros),
    vagas: txt(imovel?.vagas),
    uc_energia: txt(imovel?.uc_energia),
    uc_agua: txt(imovel?.uc_agua),
  })
  const setDocCampo = (k: keyof typeof doc, v: string) => setDoc({ ...doc, [k]: v })
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
    // Valores e números opcionais da documentação
    const dinheiro = (k: 'valor_iptu_anual' | 'valor_condominio') => {
      if (!doc[k].trim()) return null
      const v = lerValor(doc[k])
      if (v === null) novosErros[k] = 'Valor inválido.'
      return v
    }
    const inteiro = (k: 'quartos' | 'banheiros' | 'vagas') => {
      if (!doc[k].trim()) return null
      const n = Number(doc[k])
      if (!Number.isInteger(n) || n < 0 || n > 50) novosErros[k] = 'De 0 a 50.'
      return n
    }
    const area = doc.area_m2.trim() ? Number(doc.area_m2.replace(',', '.')) : null
    if (area !== null && !(area > 0)) novosErros.area_m2 = 'Área inválida.'
    const documentacao = {
      matricula: doc.matricula.trim() || null,
      cartorio: doc.cartorio.trim() ? capitalizarNome(doc.cartorio) : null,
      inscricao_iptu: doc.inscricao_iptu.trim() || null,
      valor_iptu_anual: dinheiro('valor_iptu_anual'),
      valor_condominio: dinheiro('valor_condominio'),
      area_m2: area,
      quartos: inteiro('quartos'),
      banheiros: inteiro('banheiros'),
      vagas: inteiro('vagas'),
      uc_energia: doc.uc_energia.trim() || null,
      uc_agua: doc.uc_agua.trim() || null,
    }
    setErros(novosErros)

    const validacao = !editando && alugado ? validarLocacao(locacao) : { erros: {}, dados: null }
    setErrosLocacao(validacao.erros)
    if (Object.keys(novosErros).length || Object.keys(validacao.erros).length) {
      setErroGeral('Revise os campos marcados em vermelho.')
      return
    }

    const dados: DadosImovel = {
      identificacao: capitalizarNome(identificacao),
      endereco: formatarEndereco(end.dados),
      observacoes: observacoes.trim() || null,
      tipo: tipo || null,
      descricao: descricao.trim() ? primeiraMaiuscula(descricao) : null,
      proprietario_id: proprietarioId || null,
      ...documentacao,
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
            <input value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} onBlur={() => setIdentificacao(capitalizarNome(identificacao))} maxLength={120} placeholder="Ex.: Apto 101" />
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

        <Secao titulo="Documentação e características" dica="matrícula, IPTU, condomínio, cômodos, contas"
          aberta={editando && Boolean(imovel?.matricula || imovel?.inscricao_iptu)}
          temErro={['valor_iptu_anual', 'valor_condominio', 'area_m2', 'quartos', 'banheiros', 'vagas'].some((k) => erros[k])}>
          <div className="grade-2">
            <Campo rotulo="Matrícula do imóvel" dica="vai no contrato">
              <input value={doc.matricula} onChange={(e) => setDocCampo('matricula', e.target.value)} maxLength={40} placeholder="Ex.: 12.345" />
            </Campo>
            <Campo rotulo="Cartório de Registro de Imóveis">
              <input value={doc.cartorio} onChange={(e) => setDocCampo('cartorio', e.target.value)} maxLength={120} placeholder="Ex.: CRI de Santo Antônio da Platina" />
            </Campo>
          </div>
          <div className="grade-3">
            <Campo rotulo="Inscrição do IPTU" dica="vai no contrato">
              <input value={doc.inscricao_iptu} onChange={(e) => setDocCampo('inscricao_iptu', e.target.value)} maxLength={40} />
            </Campo>
            <Campo rotulo="IPTU anual (R$)" erro={erros.valor_iptu_anual}>
              <input value={doc.valor_iptu_anual} onChange={(e) => setDocCampo('valor_iptu_anual', e.target.value)} inputMode="decimal" placeholder="1.200,00" />
            </Campo>
            <Campo rotulo="Condomínio mensal (R$)" dica="se tiver" erro={erros.valor_condominio}>
              <input value={doc.valor_condominio} onChange={(e) => setDocCampo('valor_condominio', e.target.value)} inputMode="decimal" placeholder="350,00" />
            </Campo>
          </div>
          <div className="grade-4">
            <Campo rotulo="Área (m²)" erro={erros.area_m2}>
              <input value={doc.area_m2} onChange={(e) => setDocCampo('area_m2', e.target.value)} inputMode="decimal" placeholder="85" />
            </Campo>
            <Campo rotulo="Quartos" erro={erros.quartos}>
              <input type="number" min={0} max={50} value={doc.quartos} onChange={(e) => setDocCampo('quartos', e.target.value)} />
            </Campo>
            <Campo rotulo="Banheiros" erro={erros.banheiros}>
              <input type="number" min={0} max={50} value={doc.banheiros} onChange={(e) => setDocCampo('banheiros', e.target.value)} />
            </Campo>
            <Campo rotulo="Vagas" erro={erros.vagas}>
              <input type="number" min={0} max={50} value={doc.vagas} onChange={(e) => setDocCampo('vagas', e.target.value)} />
            </Campo>
          </div>
          <div className="grade-2">
            <Campo rotulo="Nº da conta de energia (UC)" dica="para transferir a titularidade">
              <input value={doc.uc_energia} onChange={(e) => setDocCampo('uc_energia', e.target.value)} maxLength={40} />
            </Campo>
            <Campo rotulo="Nº da conta de água">
              <input value={doc.uc_agua} onChange={(e) => setDocCampo('uc_agua', e.target.value)} maxLength={40} />
            </Campo>
          </div>
        </Secao>

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
