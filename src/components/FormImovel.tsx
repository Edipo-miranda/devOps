import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { Campo, CamposLocacao } from './CamposLocacao'
import { validarLocacao, valoresLocacaoIniciais, type ErrosLocacao } from '../lib/validacaoLocacao'
import { atualizarImovel, cadastrarImovel, invalidarMesAtual, listarInquilinos, type DadosImovel } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import type { Imovel, Inquilino } from '../types/database'

interface Props {
  imovel?: Imovel // se informado, edita; senão, cadastra
  aoFechar: () => void
  aoSalvar: (id: string) => void
}

export function FormImovel({ imovel, aoFechar, aoSalvar }: Props) {
  const editando = Boolean(imovel)
  const [identificacao, setIdentificacao] = useState(imovel?.identificacao ?? '')
  const [endereco, setEndereco] = useState(imovel?.endereco ?? '')
  const [observacoes, setObservacoes] = useState(imovel?.observacoes ?? '')
  const [alugado, setAlugado] = useState(true)
  const [locacao, setLocacao] = useState(valoresLocacaoIniciais)
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [errosLocacao, setErrosLocacao] = useState<ErrosLocacao>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!editando) listarInquilinos().then(setInquilinos).catch(() => setInquilinos([]))
  }, [editando])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)

    const novosErros: Record<string, string> = {}
    if (!identificacao.trim()) novosErros.identificacao = 'Informe uma identificação, por exemplo "Apto 101".'
    else if (identificacao.trim().length > 120) novosErros.identificacao = 'Máximo de 120 caracteres.'
    if (!endereco.trim()) novosErros.endereco = 'Informe o endereço.'
    else if (endereco.trim().length > 300) novosErros.endereco = 'Máximo de 300 caracteres.'
    setErros(novosErros)

    const validacao = !editando && alugado ? validarLocacao(locacao) : { erros: {}, dados: null }
    setErrosLocacao(validacao.erros)
    if (Object.keys(novosErros).length || Object.keys(validacao.erros).length) return

    const dados: DadosImovel = {
      identificacao: identificacao.trim(),
      endereco: endereco.trim(),
      observacoes: observacoes.trim() || null,
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
      const e = err as { code?: string }
      setErroGeral(e.code === '23505' ? 'Já existe um imóvel com essa identificação.' : mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={editando ? 'Editar imóvel' : 'Novo imóvel'} aoFechar={aoFechar} largo={!editando}>
      <form onSubmit={salvar} noValidate>
        <div className="grade-2">
          <Campo rotulo="Identificação do imóvel" erro={erros.identificacao}>
            <input value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} maxLength={120} placeholder="Ex.: Apto 101" />
          </Campo>
          <Campo rotulo="Endereço" erro={erros.endereco}>
            <input value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={300} placeholder="Rua, número, bairro, cidade" />
          </Campo>
        </div>
        <Campo rotulo="Observações" dica="opcional">
          <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} />
        </Campo>

        {!editando && (
          <fieldset className="secao-form">
            <label className="checagem">
              <input type="checkbox" checked={alugado} onChange={(e) => setAlugado(e.target.checked)} />
              O imóvel está alugado (cadastrar inquilino agora)
            </label>
            {alugado && (
              <CamposLocacao valores={locacao} erros={errosLocacao} inquilinos={inquilinos} aoMudar={setLocacao} />
            )}
          </fieldset>
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
