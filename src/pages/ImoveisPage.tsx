import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormImovel } from '../components/FormImovel'
import { listarImoveis } from '../lib/api'
import { formatarData, formatarMoeda } from '../lib/format'
import { useCarregar } from '../lib/useCarregar'

type Filtro = 'ativos' | 'inativos' | 'todos'

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function ImoveisPage() {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>('ativos')
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)
  const { dados, erro, carregando } = useCarregar(listarImoveis, [])

  const lista = useMemo(() => {
    const termo = normalizar(busca.trim())
    return (dados ?? []).filter((i) => {
      if (filtro === 'ativos' && !i.ativo) return false
      if (filtro === 'inativos' && i.ativo) return false
      if (!termo) return true
      return [i.identificacao, i.endereco, i.locacao_ativa?.inquilino.nome ?? ''].some((t) => normalizar(t).includes(termo))
    })
  }, [dados, filtro, busca])

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Imóveis e inquilinos</h1>
          <p className="texto-suave">Cadastre imóveis, inquilinos e acompanhe o histórico de ocupações.</p>
        </div>
        <button className="botao botao--primario" onClick={() => setNovo(true)}>+ Novo imóvel</button>
      </div>

      <div className="barra-filtros">
        <input
          type="search"
          className="campo-busca"
          placeholder="Buscar imóvel, endereço ou inquilino…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar"
        />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Mostrar">
          <option value="ativos">Imóveis ativos</option>
          <option value="inativos">Imóveis desativados</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}
      {!dados && !erro && <p className="texto-suave">Carregando…</p>}

      {dados && lista.length === 0 && (
        <p className="vazio">
          {dados.length === 0 ? 'Nenhum imóvel cadastrado ainda. Clique em “+ Novo imóvel” para começar.' : 'Nenhum imóvel encontrado.'}
        </p>
      )}

      {lista.length > 0 && (
        <div className={`tabela-container ${carregando ? 'carregando' : ''}`}>
          <table className="tabela tabela--responsiva tabela--clicavel">
            <thead>
              <tr>
                <th>Imóvel</th>
                <th>Inquilino atual</th>
                <th>Desde</th>
                <th className="num">Aluguel</th>
                <th>Vencimento</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => {
                const l = i.locacao_ativa
                return (
                  <tr key={i.id} onClick={() => navigate(`/imoveis/${i.id}`)}>
                    <td data-rotulo="Imóvel">
                      <Link to={`/imoveis/${i.id}`} className="destaque" onClick={(e) => e.stopPropagation()}>{i.identificacao}</Link>
                      <div className="texto-suave texto-pequeno">{i.endereco}</div>
                    </td>
                    <td data-rotulo="Inquilino">{l ? l.inquilino.nome : <span className="texto-suave">—</span>}</td>
                    <td data-rotulo="Desde">{l ? formatarData(l.data_entrada) : '—'}</td>
                    <td data-rotulo="Aluguel" className="num">{l ? formatarMoeda(l.valor_aluguel) : '—'}</td>
                    <td data-rotulo="Vencimento">{l ? `Dia ${l.dia_vencimento}` : '—'}</td>
                    <td data-rotulo="Situação">
                      {!i.ativo ? (
                        <span className="selo selo--neutro">Desativado</span>
                      ) : l ? (
                        <span className="selo selo--pago">Alugado</span>
                      ) : (
                        <span className="selo selo--aberto">Vago</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {novo && (
        <FormImovel aoFechar={() => setNovo(false)} aoSalvar={(id) => navigate(`/imoveis/${id}`)} />
      )}
    </section>
  )
}
