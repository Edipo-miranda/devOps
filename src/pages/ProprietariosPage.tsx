import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Aviso, type AvisoDados } from '../components/Aviso'
import { Modal } from '../components/Modal'
import { Campo, Secao } from '../components/CamposLocacao'
import { CamposPessoa } from '../components/CamposPessoa'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import { definirProprietarioAtivo, excluirProprietario, listarProprietarios, salvarProprietario } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { pessoaForm, validarPessoa } from '../lib/formularios'
import { useCarregar } from '../lib/useCarregar'
import type { Proprietario } from '../types/database'

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function ProprietariosPage() {
  const { dados, erro, carregando, recarregar } = useCarregar(listarProprietarios, [])
  const [busca, setBusca] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [editando, setEditando] = useState<Proprietario | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<(Proprietario & { imoveis: { count: number }[] }) | null>(null)
  const [aviso, setAviso] = useState<AvisoDados | null>(null)
  const fecharAviso = useCallback(() => setAviso(null), [])

  const lista = useMemo(() => {
    const termo = normalizar(busca.trim())
    return (dados ?? []).filter(
      (p) => (mostrarInativos || p.ativo) && (!termo || normalizar(`${p.nome} ${p.cpf_cnpj ?? ''}`).includes(termo)),
    )
  }, [dados, busca, mostrarInativos])

  async function alternarAtivo(p: Proprietario) {
    if (p.ativo && !window.confirm(`Desativar ${p.nome}? Ele some das listas, mas os imóveis e contratos continuam.`)) return
    try {
      await definirProprietarioAtivo(p.id, !p.ativo)
      setAviso({ tipo: 'ok', texto: p.ativo ? 'Proprietário desativado.' : 'Proprietário reativado.' })
      recarregar()
    } catch (err) {
      setAviso({ tipo: 'erro', texto: mensagemDeErro(err) })
    }
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Proprietários</h1>
          <p className="texto-suave">Donos dos imóveis. Os dados aparecem como LOCADOR no contrato.</p>
        </div>
        <button className="botao botao--primario" onClick={() => setEditando('novo')}>+ Novo proprietário</button>
      </div>

      <div className="barra-filtros">
        <input type="search" className="campo-busca" placeholder="Buscar por nome ou CPF/CNPJ…" value={busca}
          onChange={(e) => setBusca(e.target.value)} aria-label="Buscar proprietário" />
        <label className="checagem">
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
          <span>Mostrar desativados</span>
        </label>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}
      {!dados && !erro && <p className="texto-suave">Carregando…</p>}
      {dados && lista.length === 0 && (
        <p className="vazio">{dados.length === 0 ? 'Nenhum proprietário cadastrado. Clique em “+ Novo proprietário”.' : 'Nenhum proprietário encontrado.'}</p>
      )}

      {lista.length > 0 && (
        <div className={`tabela-container ${carregando ? 'carregando' : ''}`}>
          <table className="tabela tabela--responsiva">
            <thead>
              <tr><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>Cidade</th><th className="num">Imóveis</th><th /></tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td data-rotulo="Nome" className="destaque">
                    {p.nome} {!p.ativo && <span className="selo selo--neutro">Desativado</span>}
                  </td>
                  <td data-rotulo="CPF/CNPJ">{p.cpf_cnpj ?? '—'}</td>
                  <td data-rotulo="Telefone">{p.telefone ?? '—'}</td>
                  <td data-rotulo="Cidade">{[p.cidade, p.uf].filter(Boolean).join('/') || '—'}</td>
                  <td data-rotulo="Imóveis" className="num">{p.imoveis?.[0]?.count ?? 0}</td>
                  <td className="acoes">
                    <button className="botao botao--pequeno" onClick={() => setEditando(p)}>Editar</button>
                    <button className="botao botao--pequeno botao--discreto" onClick={() => alternarAtivo(p)}>{p.ativo ? 'Desativar' : 'Reativar'}</button>
                    <button className="botao botao--pequeno botao--discreto botao--texto-perigo" onClick={() => setExcluindo(p)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormProprietario
          proprietario={editando === 'novo' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            setAviso({ tipo: 'ok', texto: 'Proprietário salvo.' })
            recarregar()
          }}
        />
      )}
      {excluindo && (
        <ConfirmarExclusao
          titulo="Excluir proprietário"
          aoFechar={() => setExcluindo(null)}
          aoConfirmar={async () => {
            const n = await excluirProprietario(excluindo.id)
            setExcluindo(null)
            setAviso({ tipo: 'ok', texto: n > 0 ? `Proprietário excluído. ${n} imóvel(is) ficaram sem proprietário.` : 'Proprietário excluído.' })
            recarregar()
          }}
        >
          <p>Você vai excluir <strong>{excluindo.nome}</strong>{excluindo.cpf_cnpj ? ` (${excluindo.cpf_cnpj})` : ''}.</p>
          {(excluindo.imoveis?.[0]?.count ?? 0) > 0 ? (
            <p>
              Ele está ligado a <strong>{excluindo.imoveis[0].count} imóvel(is)</strong>. Os imóveis, inquilinos e recebimentos <strong>não</strong> serão
              apagados — apenas ficarão sem proprietário. Depois, vincule o proprietário certo em “Editar imóvel”.
            </p>
          ) : (
            <p>Ele não está ligado a nenhum imóvel.</p>
          )}
        </ConfirmarExclusao>
      )}
      <Aviso aviso={aviso} aoFechar={fecharAviso} />
    </section>
  )
}

function FormProprietario({ proprietario, aoFechar, aoSalvar }: { proprietario: Proprietario | null; aoFechar: () => void; aoSalvar: () => void }) {
  const [juridica, setJuridica] = useState(proprietario?.tipo_pessoa === 'juridica')
  const [pessoa, setPessoa] = useState(() => pessoaForm(proprietario as unknown as Record<string, unknown> | null))
  const [pix, setPix] = useState(proprietario?.pix ?? '')
  const [banco, setBanco] = useState(proprietario?.banco ?? '')
  const [agencia, setAgencia] = useState(proprietario?.agencia ?? '')
  const [conta, setConta] = useState(proprietario?.conta ?? '')
  const [observacoes, setObservacoes] = useState(proprietario?.observacoes ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const { erros: novos, dados } = validarPessoa(pessoa, juridica)
    setErros(novos)
    if (Object.keys(novos).length) return
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { documento, data_nascimento, ...resto } = dados
    setSalvando(true)
    try {
      await salvarProprietario(proprietario?.id ?? null, {
        ...resto,
        tipo_pessoa: juridica ? 'juridica' : 'fisica',
        cpf_cnpj: documento,
        rg: juridica ? null : resto.rg,
        orgao_emissor: juridica ? null : resto.orgao_emissor,
        pix: pix.trim() || null,
        banco: banco.trim() || null,
        agencia: agencia.trim() || null,
        conta: conta.trim() || null,
        observacoes: observacoes.trim() || null,
      })
      aoSalvar()
    } catch (err) {
      const e = err as { code?: string }
      setErroGeral(e.code === '23505' ? 'Já existe um proprietário com esse CPF/CNPJ.' : mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={proprietario ? 'Editar proprietário' : 'Novo proprietário'} aoFechar={aoFechar} largo>
      <form onSubmit={salvar} noValidate>
        <div className="alternador" role="radiogroup" aria-label="Tipo de pessoa">
          <button type="button" role="radio" aria-checked={!juridica} className={!juridica ? 'ativo' : ''}
            onClick={() => { setJuridica(false); setPessoa({ ...pessoa, documento: '' }) }}>Pessoa física</button>
          <button type="button" role="radio" aria-checked={juridica} className={juridica ? 'ativo' : ''}
            onClick={() => { setJuridica(true); setPessoa({ ...pessoa, documento: '' }) }}>Pessoa jurídica</button>
        </div>
        <CamposPessoa valores={pessoa} aoMudar={setPessoa} erros={erros} juridica={juridica} />

        <Secao titulo="Dados para receber o aluguel" dica="aparecem no contrato" aberta={Boolean(proprietario?.pix || proprietario?.banco)}>
          <Campo rotulo="Chave PIX">
            <input value={pix} onChange={(e) => setPix(e.target.value)} maxLength={140} placeholder="CPF, e-mail, telefone ou chave aleatória" />
          </Campo>
          <div className="grade-3">
            <Campo rotulo="Banco"><input value={banco} onChange={(e) => setBanco(e.target.value)} maxLength={60} /></Campo>
            <Campo rotulo="Agência"><input value={agencia} onChange={(e) => setAgencia(e.target.value)} maxLength={20} /></Campo>
            <Campo rotulo="Conta"><input value={conta} onChange={(e) => setConta(e.target.value)} maxLength={30} /></Campo>
          </div>
        </Secao>
        <Campo rotulo="Observações internas" dica="opcional">
          <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} />
        </Campo>

        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <div className="acoes-form">
          <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="botao botao--primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  )
}
