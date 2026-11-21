import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Aviso, type AvisoDados } from '../components/Aviso'
import { FormImovel } from '../components/FormImovel'
import { FormEditarInquilino, FormEditarLocacao, FormEncerrarLocacao, FormNovaLocacao } from '../components/FormsLocacao'
import { TabelaRecebimentos } from '../components/TabelaRecebimentos'
import { buscarImovel, definirImovelAtivo, garantirMesAtual, listarRecebimentosDoImovel, type LocacaoComInquilino } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { formatarData, formatarMoeda } from '../lib/format'
import { useCarregar } from '../lib/useCarregar'
import type { Inquilino } from '../types/database'

type Janela =
  | { tipo: 'imovel' }
  | { tipo: 'nova-locacao' }
  | { tipo: 'editar-locacao'; locacao: LocacaoComInquilino }
  | { tipo: 'encerrar'; locacao: LocacaoComInquilino }
  | { tipo: 'inquilino'; inquilino: Inquilino }
  | null

export function ImovelDetalhePage() {
  const { id = '' } = useParams()
  const [janela, setJanela] = useState<Janela>(null)
  const [aviso, setAviso] = useState<AvisoDados | null>(null)
  const fecharAviso = useCallback(() => setAviso(null), [])

  const { dados, erro, recarregar } = useCarregar(async () => {
    await garantirMesAtual().catch(() => 0)
    const [detalhe, recebimentos] = await Promise.all([buscarImovel(id), listarRecebimentosDoImovel(id)])
    return { ...detalhe, recebimentos }
  }, [id])

  function concluido(texto: string) {
    setJanela(null)
    setAviso({ tipo: 'ok', texto })
    recarregar()
  }

  async function alternarAtivo() {
    if (!dados) return
    const ativo = !dados.imovel.ativo
    if (!ativo && !window.confirm('Desativar este imóvel? Ele sai da lista principal, mas todo o histórico é mantido.')) return
    try {
      await definirImovelAtivo(dados.imovel.id, ativo)
      concluido(ativo ? 'Imóvel reativado.' : 'Imóvel desativado.')
    } catch (err) {
      setAviso({ tipo: 'erro', texto: mensagemDeErro(err) })
    }
  }

  if (erro && !dados) {
    return (
      <section>
        <p className="alerta alerta--erro">{erro}</p>
        <Link to="/imoveis">← Voltar para imóveis</Link>
      </section>
    )
  }
  if (!dados) return <p className="texto-suave">Carregando…</p>

  const { imovel, locacoes, recebimentos } = dados
  const ativa = locacoes.find((l) => l.situacao === 'ativa') ?? null
  const anteriores = locacoes.filter((l) => l.situacao !== 'ativa')

  return (
    <section>
      <Link to="/imoveis" className="voltar">← Imóveis</Link>

      <div className="cabecalho-pagina">
        <div>
          <h1>
            {imovel.identificacao}{' '}
            {!imovel.ativo && <span className="selo selo--neutro">Desativado</span>}
          </h1>
          <p className="texto-suave">{imovel.endereco}</p>
          {imovel.observacoes && <p className="texto-suave texto-pequeno">{imovel.observacoes}</p>}
        </div>
        <div className="grupo-botoes">
          <button className="botao" onClick={() => setJanela({ tipo: 'imovel' })}>Editar imóvel</button>
          <button className="botao botao--discreto" onClick={alternarAtivo}>{imovel.ativo ? 'Desativar' : 'Reativar'}</button>
        </div>
      </div>

      <div className="cartao">
        <div className="cartao__topo">
          <h2>Locação atual</h2>
          {ativa ? (
            <div className="grupo-botoes">
              <button className="botao botao--pequeno" onClick={() => setJanela({ tipo: 'editar-locacao', locacao: ativa })}>Editar valor/vencimento</button>
              <button className="botao botao--pequeno" onClick={() => setJanela({ tipo: 'inquilino', inquilino: ativa.inquilino })}>Editar inquilino</button>
              <button className="botao botao--pequeno botao--discreto" onClick={() => setJanela({ tipo: 'encerrar', locacao: ativa })}>Encerrar locação</button>
            </div>
          ) : (
            imovel.ativo && (
              <button className="botao botao--primario botao--pequeno" onClick={() => setJanela({ tipo: 'nova-locacao' })}>+ Cadastrar inquilino</button>
            )
          )}
        </div>
        {ativa ? (
          <dl className="dados-grade">
            <div><dt>Inquilino</dt><dd>{ativa.inquilino.nome}</dd></div>
            <div><dt>Telefone</dt><dd>{ativa.inquilino.telefone ?? '—'}</dd></div>
            <div><dt>Data de entrada</dt><dd>{formatarData(ativa.data_entrada)}</dd></div>
            <div><dt>Aluguel atual</dt><dd>{formatarMoeda(ativa.valor_aluguel)}</dd></div>
            <div><dt>Vencimento</dt><dd>Todo dia {ativa.dia_vencimento}</dd></div>
            <div><dt>Situação</dt><dd><span className="selo selo--pago">Ativa</span></dd></div>
          </dl>
        ) : (
          <p className="texto-suave">
            {imovel.ativo ? 'Imóvel vago. Cadastre um inquilino para começar a gerar os lançamentos.' : 'Imóvel desativado. Reative-o para cadastrar um inquilino.'}
          </p>
        )}
      </div>

      <h2 className="titulo-secao">Histórico de ocupações</h2>
      {anteriores.length === 0 ? (
        <p className="vazio">Nenhuma ocupação anterior.</p>
      ) : (
        <div className="tabela-container">
          <table className="tabela tabela--responsiva">
            <thead>
              <tr><th>Inquilino</th><th>Telefone</th><th>Entrada</th><th>Saída</th><th className="num">Último aluguel</th><th /></tr>
            </thead>
            <tbody>
              {anteriores.map((l) => (
                <tr key={l.id}>
                  <td data-rotulo="Inquilino" className="destaque">{l.inquilino.nome}</td>
                  <td data-rotulo="Telefone">{l.inquilino.telefone ?? '—'}</td>
                  <td data-rotulo="Entrada">{formatarData(l.data_entrada)}</td>
                  <td data-rotulo="Saída">{formatarData(l.data_saida)}</td>
                  <td data-rotulo="Último aluguel" className="num">{formatarMoeda(l.valor_aluguel)}</td>
                  <td className="acoes">
                    <button className="botao botao--pequeno botao--discreto" onClick={() => setJanela({ tipo: 'inquilino', inquilino: l.inquilino })}>Editar inquilino</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="titulo-secao">Recebimentos deste imóvel</h2>
      {recebimentos.length === 0 ? (
        <p className="vazio">Nenhum lançamento ainda.</p>
      ) : (
        <TabelaRecebimentos
          linhas={recebimentos}
          ocultarImovel
          aoAlterar={(texto) => {
            setAviso({ tipo: 'ok', texto })
            recarregar()
          }}
          aoErro={(texto) => setAviso({ tipo: 'erro', texto })}
        />
      )}

      {janela?.tipo === 'imovel' && (
        <FormImovel imovel={imovel} aoFechar={() => setJanela(null)} aoSalvar={() => concluido('Imóvel atualizado.')} />
      )}
      {janela?.tipo === 'nova-locacao' && (
        <FormNovaLocacao imovelId={imovel.id} aoFechar={() => setJanela(null)} aoSalvar={() => concluido('Inquilino cadastrado.')} />
      )}
      {janela?.tipo === 'editar-locacao' && (
        <FormEditarLocacao locacao={janela.locacao} aoFechar={() => setJanela(null)} aoSalvar={() => concluido('Locação atualizada.')} />
      )}
      {janela?.tipo === 'encerrar' && (
        <FormEncerrarLocacao
          locacao={janela.locacao}
          aoFechar={() => setJanela(null)}
          aoSalvar={(n) => concluido(n > 0 ? `Locação encerrada. ${n} lançamento(s) futuro(s) sem pagamento removido(s).` : 'Locação encerrada.')}
        />
      )}
      {janela?.tipo === 'inquilino' && (
        <FormEditarInquilino inquilino={janela.inquilino} aoFechar={() => setJanela(null)} aoSalvar={() => concluido('Inquilino atualizado.')} />
      )}

      <Aviso aviso={aviso} aoFechar={fecharAviso} />
    </section>
  )
}
