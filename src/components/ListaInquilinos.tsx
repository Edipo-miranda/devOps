import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, type AvisoDados } from './Aviso'
import { ExcluirInquilino } from './ExcluirInquilino'
import { FormEditarInquilino } from './FormsLocacao'
import { listarInquilinosComLocacoes } from '../lib/api'
import { useCarregar } from '../lib/useCarregar'
import type { Inquilino } from '../types/database'

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Todos os inquilinos (atuais e antigos), com editar e excluir. */
export function ListaInquilinos() {
  const { dados, erro, carregando, recarregar } = useCarregar(listarInquilinosComLocacoes, [])
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Inquilino | null>(null)
  const [excluindo, setExcluindo] = useState<Inquilino | null>(null)
  const [aviso, setAviso] = useState<AvisoDados | null>(null)
  const fecharAviso = useCallback(() => setAviso(null), [])

  const lista = useMemo(() => {
    const termo = normalizar(busca.trim())
    return (dados ?? []).filter((i) => !termo || normalizar(`${i.nome} ${i.cpf ?? ''} ${i.telefone ?? ''}`).includes(termo))
  }, [dados, busca])

  function concluido(texto: string) {
    setEditando(null)
    setExcluindo(null)
    setAviso({ tipo: 'ok', texto })
    recarregar()
  }

  return (
    <>
      <div className="barra-filtros">
        <input type="search" className="campo-busca" placeholder="Buscar por nome, CPF ou telefone…" value={busca}
          onChange={(e) => setBusca(e.target.value)} aria-label="Buscar inquilino" />
      </div>
      <p className="texto-suave texto-pequeno paragrafo">Para cadastrar um inquilino, abra o imóvel e use “+ Cadastrar inquilino”.</p>

      {erro && <p className="alerta alerta--erro">{erro}</p>}
      {!dados && !erro && <p className="texto-suave">Carregando…</p>}
      {dados && lista.length === 0 && <p className="vazio">{dados.length === 0 ? 'Nenhum inquilino cadastrado.' : 'Nenhum inquilino encontrado.'}</p>}

      {lista.length > 0 && (
        <div className={`tabela-container ${carregando ? 'carregando' : ''}`}>
          <table className="tabela tabela--responsiva">
            <thead>
              <tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>Imóvel</th><th>Situação</th><th /></tr>
            </thead>
            <tbody>
              {lista.map((i) => {
                const ativa = i.locacoes.find((l) => l.situacao === 'ativa')
                const ultima = ativa ?? i.locacoes[0]
                return (
                  <tr key={i.id}>
                    <td data-rotulo="Nome" className="destaque">{i.nome}</td>
                    <td data-rotulo="CPF">{i.cpf ?? '—'}</td>
                    <td data-rotulo="Telefone">{i.telefone ?? '—'}</td>
                    <td data-rotulo="Imóvel">{ultima?.imovel ? <Link to={`/imoveis/${ultima.imovel.id}`}>{ultima.imovel.identificacao}</Link> : '—'}</td>
                    <td data-rotulo="Situação">
                      {ativa ? <span className="selo selo--pago">Morando</span>
                        : i.locacoes.length ? <span className="selo selo--neutro">Ex-inquilino</span>
                          : <span className="selo selo--aberto">Sem locação</span>}
                    </td>
                    <td className="acoes">
                      <button className="botao botao--pequeno" onClick={() => setEditando(i)}>Editar</button>
                      <button className="botao botao--pequeno botao--discreto botao--texto-perigo" onClick={() => setExcluindo(i)}>Excluir</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormEditarInquilino
          inquilino={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => concluido('Inquilino atualizado.')}
          aoExcluir={() => concluido('Inquilino e toda a movimentação dele foram excluídos.')}
        />
      )}
      {excluindo && (
        <ExcluirInquilino inquilino={excluindo} aoFechar={() => setExcluindo(null)} aoExcluir={() => concluido('Inquilino e toda a movimentação dele foram excluídos.')} />
      )}
      <Aviso aviso={aviso} aoFechar={fecharAviso} />
    </>
  )
}
