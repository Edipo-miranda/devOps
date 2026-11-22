import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Aviso, type AvisoDados } from '../components/Aviso'
import { GerarContrato } from '../components/GerarContrato'
import { ExcluirImovel, FormVendaImovel } from '../components/FormsImovelVenda'
import { IconeDocumento } from '../components/Icones'
import { GARANTIAS, formatarEndereco } from '../lib/documentos'
import { FormImovel } from '../components/FormImovel'
import {
  FormEditarInquilino,
  FormEditarLocacao,
  FormEncerrarLocacao,
  FormNovaLocacao,
  FormReajuste,
  FormRenovarContrato,
} from '../components/FormsLocacao'
import { TabelaRecebimentos } from '../components/TabelaRecebimentos'
import {
  buscarImovel,
  definirImovelAtivo,
  fimDoContrato,
  garantirMesAtual,
  listarReajustes,
  listarRecebimentosDoImovel,
  proximoReajuste,
  type LocacaoComInquilino,
} from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { diasEntre, formatarData, formatarMoeda, hojeBrasil } from '../lib/format'
import { useCarregar } from '../lib/useCarregar'
import type { Inquilino } from '../types/database'

type Janela =
  | { tipo: 'imovel' }
  | { tipo: 'nova-locacao' }
  | { tipo: 'editar-locacao'; locacao: LocacaoComInquilino }
  | { tipo: 'encerrar'; locacao: LocacaoComInquilino }
  | { tipo: 'inquilino'; inquilino: Inquilino }
  | { tipo: 'reajuste'; locacao: LocacaoComInquilino }
  | { tipo: 'renovar'; locacao: LocacaoComInquilino }
  | { tipo: 'contrato'; locacao: LocacaoComInquilino }
  | { tipo: 'venda' }
  | { tipo: 'excluir' }
  | null

/** "em 15 dias", "hoje", "há 3 dias" — distância de uma data até hoje. */
function prazoRelativo(data: string): string {
  const d = diasEntre(hojeBrasil(), data)
  if (d === 0) return 'hoje'
  const n = Math.abs(d)
  return d > 0 ? `em ${n} ${n === 1 ? 'dia' : 'dias'}` : `há ${n} ${n === 1 ? 'dia' : 'dias'}`
}

export function ImovelDetalhePage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [janela, setJanela] = useState<Janela>(null)
  const [aviso, setAviso] = useState<AvisoDados | null>(null)
  const fecharAviso = useCallback(() => setAviso(null), [])

  const { dados, erro, recarregar } = useCarregar(async () => {
    await garantirMesAtual().catch(() => 0)
    const [detalhe, recebimentos] = await Promise.all([buscarImovel(id), listarRecebimentosDoImovel(id)])
    const reajustes = await listarReajustes(detalhe.locacoes.map((l) => l.id))
    return { ...detalhe, recebimentos, reajustes }
  }, [id])

  // Vindo de um aviso (?acao=reajuste ou ?acao=renovar), abre a janela correspondente.
  const acao = params.get('acao')
  const locacaoAtiva = dados?.locacoes.find((l) => l.situacao === 'ativa') ?? null
  const janelaDoAviso: Janela =
    locacaoAtiva && (acao === 'reajuste' || acao === 'renovar') ? { tipo: acao, locacao: locacaoAtiva } : null
  const janelaAberta = janela ?? janelaDoAviso

  function fecharJanela() {
    setJanela(null)
    if (acao) setParams({}, { replace: true })
  }

  function concluido(texto: string) {
    fecharJanela()
    setAviso({ tipo: 'ok', texto })
    recarregar()
  }

  async function alternarAtivo() {
    if (!dados) return
    const ativo = !dados.imovel.ativo
    if (!ativo && !window.confirm('Desativar este imóvel? Ele sai da lista principal, mas todo o histórico é mantido.')) return
    if (ativo && dados.imovel.vendido_em &&
      !window.confirm('Desfazer a venda? O imóvel volta a ficar ativo e os dados da venda são apagados. A locação encerrada não é reaberta.')) return
    try {
      await definirImovelAtivo(dados.imovel.id, ativo)
      concluido(ativo ? (dados.imovel.vendido_em ? 'Venda desfeita. Imóvel ativo novamente.' : 'Imóvel reativado.') : 'Imóvel desativado.')
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

  const { imovel, proprietario, locacoes, recebimentos, reajustes } = dados
  const ativa = locacaoAtiva
  const fim = ativa ? fimDoContrato(ativa) : null
  const reajusteEm = ativa ? proximoReajuste(ativa) : null
  const hoje = hojeBrasil()
  const nomeInquilino = new Map(locacoes.map((l) => [l.id, l.inquilino.nome]))
  const anteriores = locacoes.filter((l) => l.situacao !== 'ativa')

  return (
    <section>
      <Link to="/imoveis" className="voltar">← Imóveis</Link>

      <div className="cabecalho-pagina">
        <div>
          <h1>
            {imovel.identificacao}{' '}
            {imovel.vendido_em ? <span className="selo selo--info">Vendido</span> : !imovel.ativo && <span className="selo selo--neutro">Desativado</span>}
          </h1>
          <p className="texto-suave">{formatarEndereco(imovel) || imovel.endereco}</p>
          <p className="texto-suave texto-pequeno">
            {[imovel.tipo, imovel.descricao].filter(Boolean).join(' · ')}
            {proprietario ? <> · Proprietário: <Link to="/proprietarios">{proprietario.nome}</Link></> : <> · <em>sem proprietário vinculado</em></>}
          </p>
          {imovel.observacoes && <p className="texto-suave texto-pequeno">{imovel.observacoes}</p>}
          {imovel.vendido_em && (
            <p className="alerta alerta--info texto-pequeno venda-info">
              Vendido em <strong>{formatarData(imovel.vendido_em)}</strong>
              {imovel.valor_venda ? <> por <strong>{formatarMoeda(imovel.valor_venda)}</strong></> : null}
              {imovel.comprador ? <> para <strong>{imovel.comprador}</strong></> : null}. O histórico abaixo continua guardado.
            </p>
          )}
        </div>
        <div className="grupo-botoes">
          <button className="botao" onClick={() => setJanela({ tipo: 'imovel' })}>Editar imóvel</button>
          {imovel.ativo && <button className="botao" onClick={() => setJanela({ tipo: 'venda' })}>Marcar como vendido</button>}
          <button className="botao botao--discreto" onClick={alternarAtivo}>
            {imovel.ativo ? 'Desativar' : imovel.vendido_em ? 'Desfazer venda' : 'Reativar'}
          </button>
          <button className="botao botao--discreto botao--texto-perigo" onClick={() => setJanela({ tipo: 'excluir' })}>Excluir</button>
        </div>
      </div>

      <div className="cartao">
        <div className="cartao__topo">
          <h2>Locação atual</h2>
          {ativa ? (
            <div className="grupo-botoes">
              <button className="botao botao--pequeno botao--primario botao--com-icone" onClick={() => setJanela({ tipo: 'contrato', locacao: ativa })}>
                <IconeDocumento tamanho={15} /> Gerar contrato
              </button>
              <button className="botao botao--pequeno" onClick={() => setJanela({ tipo: 'editar-locacao', locacao: ativa })}>Editar locação</button>
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
            <div><dt>CPF</dt><dd>{ativa.inquilino.cpf ?? '—'}</dd></div>
            <div><dt>E-mail</dt><dd>{ativa.inquilino.email ?? '—'}</dd></div>
            <div><dt>Garantia</dt><dd>{GARANTIAS[ativa.garantia]}{ativa.garantia === 'fiador' && ativa.fiador_nome ? ` — ${ativa.fiador_nome}` : ''}</dd></div>
            <div><dt>Finalidade</dt><dd>{ativa.finalidade === 'comercial' ? 'Comercial' : 'Residencial'}</dd></div>
            <div><dt>Data de entrada</dt><dd>{formatarData(ativa.data_entrada)}</dd></div>
            <div><dt>Aluguel atual</dt><dd>{formatarMoeda(ativa.valor_aluguel)}</dd></div>
            <div><dt>Vencimento</dt><dd>Todo dia {ativa.dia_vencimento}</dd></div>
            <div><dt>Situação</dt><dd><span className="selo selo--pago">Ativa</span></dd></div>
          </dl>
        ) : null}
        {ativa ? (
          <div className="contrato">
            <div className="cartao__topo">
              <h3>Contrato e reajuste</h3>
              <div className="grupo-botoes">
                {ativa.reajuste_meses && (
                  <button className="botao botao--pequeno" onClick={() => setJanela({ tipo: 'reajuste', locacao: ativa })}>Registrar reajuste</button>
                )}
                {ativa.prazo_meses && (
                  <button className="botao botao--pequeno" onClick={() => setJanela({ tipo: 'renovar', locacao: ativa })}>Renovar contrato</button>
                )}
              </div>
            </div>
            <dl className="dados-grade">
              <div><dt>Prazo</dt><dd>{ativa.prazo_meses ? `${ativa.prazo_meses} meses` : 'Indeterminado'}</dd></div>
              <div><dt>Contrato atual</dt><dd>{formatarData(ativa.data_inicio_contrato)}{fim ? ` até ${formatarData(fim)}` : ''}</dd></div>
              <div>
                <dt>Fim do contrato</dt>
                <dd className={fim && fim <= hoje ? 'texto-erro' : ''}>{fim ? `${formatarData(fim)} (${prazoRelativo(fim)})` : '—'}</dd>
              </div>
              <div><dt>Reajuste</dt><dd>{ativa.reajuste_meses ? `A cada ${ativa.reajuste_meses} meses` : 'Sem reajuste'}</dd></div>
              <div><dt>Último reajuste</dt><dd>{formatarData(ativa.data_ultimo_reajuste)}</dd></div>
              <div>
                <dt>Próximo reajuste</dt>
                <dd className={reajusteEm && reajusteEm <= hoje ? 'texto-erro' : ''}>{reajusteEm ? `${formatarData(reajusteEm)} (${prazoRelativo(reajusteEm)})` : '—'}</dd>
              </div>
            </dl>
            {!ativa.prazo_meses && !ativa.reajuste_meses && (
              <p className="texto-suave texto-pequeno">
                Para receber avisos de fim de contrato e de reajuste, informe o prazo e a periodicidade em “Editar locação”.
              </p>
            )}
          </div>
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
                    <button className="botao botao--pequeno botao--discreto" onClick={() => setJanela({ tipo: 'contrato', locacao: l })}>Contrato</button>
                    <button className="botao botao--pequeno botao--discreto" onClick={() => setJanela({ tipo: 'inquilino', inquilino: l.inquilino })}>Editar inquilino</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reajustes.length > 0 && (
        <>
          <h2 className="titulo-secao">Histórico de reajustes</h2>
          <div className="tabela-container">
            <table className="tabela tabela--responsiva">
              <thead>
                <tr><th>Data</th><th>Inquilino</th><th className="num">Valor anterior</th><th className="num">Novo valor</th><th className="num">Variação</th><th>Observação</th></tr>
              </thead>
              <tbody>
                {reajustes.map((r) => {
                  const variacao = ((Number(r.valor_novo) - Number(r.valor_anterior)) / Number(r.valor_anterior)) * 100
                  return (
                    <tr key={r.id}>
                      <td data-rotulo="Data">{formatarData(r.data_reajuste)}</td>
                      <td data-rotulo="Inquilino">{nomeInquilino.get(r.locacao_id)}</td>
                      <td data-rotulo="Valor anterior" className="num">{formatarMoeda(r.valor_anterior)}</td>
                      <td data-rotulo="Novo valor" className="num destaque">{formatarMoeda(r.valor_novo)}</td>
                      <td data-rotulo="Variação" className="num">{variacao.toLocaleString('pt-BR', { maximumFractionDigits: 2, signDisplay: 'always' })}%</td>
                      <td data-rotulo="Observação">{r.observacao ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
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

      {janelaAberta?.tipo === 'imovel' && (
        <FormImovel imovel={imovel} aoFechar={() => fecharJanela()} aoSalvar={() => concluido('Imóvel atualizado.')} />
      )}
      {janelaAberta?.tipo === 'nova-locacao' && (
        <FormNovaLocacao imovelId={imovel.id} aoFechar={() => fecharJanela()} aoSalvar={() => concluido('Inquilino cadastrado.')} />
      )}
      {janelaAberta?.tipo === 'editar-locacao' && (
        <FormEditarLocacao locacao={janelaAberta.locacao} aoFechar={() => fecharJanela()} aoSalvar={() => concluido('Locação atualizada.')} />
      )}
      {janelaAberta?.tipo === 'encerrar' && (
        <FormEncerrarLocacao
          locacao={janelaAberta.locacao}
          aoFechar={() => fecharJanela()}
          aoSalvar={(n) => concluido(n > 0 ? `Locação encerrada. ${n} lançamento(s) futuro(s) sem pagamento removido(s).` : 'Locação encerrada.')}
        />
      )}
      {janelaAberta?.tipo === 'reajuste' && (
        <FormReajuste
          locacao={janelaAberta.locacao}
          aoFechar={() => fecharJanela()}
          aoSalvar={(n) => concluido(n > 0 ? `Reajuste registrado. ${n} lançamento(s) em aberto atualizado(s).` : 'Reajuste registrado.')}
        />
      )}
      {janelaAberta?.tipo === 'renovar' && (
        <FormRenovarContrato locacao={janelaAberta.locacao} aoFechar={() => fecharJanela()} aoSalvar={concluido} />
      )}
      {janelaAberta?.tipo === 'venda' && (
        <FormVendaImovel imovel={imovel} locacaoAtiva={ativa} aoFechar={() => fecharJanela()} aoSalvar={concluido} />
      )}
      {janelaAberta?.tipo === 'excluir' && (
        <ExcluirImovel imovel={imovel} aoFechar={() => fecharJanela()} aoExcluir={() => navigate('/imoveis', { replace: true })} />
      )}
      {janelaAberta?.tipo === 'contrato' && (
        <GerarContrato dados={{ imovel, proprietario, locacao: janelaAberta.locacao }} aoFechar={() => fecharJanela()} />
      )}
      {janelaAberta?.tipo === 'inquilino' && (
        <FormEditarInquilino
          inquilino={janelaAberta.inquilino}
          aoFechar={() => fecharJanela()}
          aoSalvar={() => concluido('Inquilino atualizado.')}
          aoExcluir={() => concluido('Inquilino e toda a movimentação dele foram excluídos.')}
        />
      )}

      <Aviso aviso={aviso} aoFechar={fecharAviso} />
    </section>
  )
}
