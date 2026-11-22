import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { Campo } from './CamposLocacao'
import { CampoData } from './CampoData'
import { excluirDespesa, listarDespesas, salvarDespesa, salvarDespesasEmLote } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { REGEX_DATA, formatarData, formatarMoeda, hojeBrasil, lerValor, valorParaCampo } from '../lib/format'
import { primeiraMaiuscula } from '../lib/texto'
import { useCarregar } from '../lib/useCarregar'
import { CATEGORIAS_DESPESA } from '../lib/despesas'
import type { CategoriaDespesa, Despesa, RecebimentoDetalhado } from '../types/database'

/** Despesas de um imóvel no ano escolhido e o resultado (recebido − despesas). */
export function DespesasImovel({ imovelId, recebimentos, aoAlterar, aoErro }: {
  imovelId: string
  recebimentos: RecebimentoDetalhado[]
  aoAlterar: (texto: string) => void
  aoErro: (texto: string) => void
}) {
  const [ano, setAno] = useState(Number(hojeBrasil().slice(0, 4)))
  const { dados, erro, recarregar } = useCarregar(() => listarDespesas({ imovelId, ano }), [imovelId, ano])
  const [editando, setEditando] = useState<Despesa | 'nova' | null>(null)

  const recebido = recebimentos
    .filter((r) => r.data_pagamento?.startsWith(String(ano)))
    .reduce((s, r) => s + Number(r.valor_recebido ?? 0), 0)
  const totalDespesas = (dados ?? []).reduce((s, d) => s + d.valor, 0)
  const lucro = recebido - totalDespesas

  async function excluir(d: Despesa) {
    if (!window.confirm(`Excluir a despesa "${CATEGORIAS_DESPESA[d.categoria].rotulo}" de ${formatarMoeda(d.valor)} (${formatarData(d.data)})?`)) return
    try {
      await excluirDespesa(d.id)
      aoAlterar('Despesa excluída.')
      recarregar()
    } catch (err) {
      aoErro(mensagemDeErro(err))
    }
  }

  return (
    <>
      <div className="cabecalho-secao">
        <h2>Despesas e resultado</h2>
        <div className="grupo-botoes">
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano" className="seletor-pequeno">
            {Array.from({ length: 6 }, (_, i) => Number(hojeBrasil().slice(0, 4)) - i).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="botao botao--pequeno botao--primario" onClick={() => setEditando('nova')}>+ Despesa</button>
        </div>
      </div>

      <div className="resultado-ano">
        <div><span>Recebido em {ano}</span><strong className="texto-ok">{formatarMoeda(recebido)}</strong></div>
        <div><span>Despesas em {ano}</span><strong className="texto-erro">− {formatarMoeda(totalDespesas)}</strong></div>
        <div><span>Lucro líquido</span><strong>{formatarMoeda(lucro)}</strong></div>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}
      {dados && dados.length === 0 && <p className="vazio">Nenhuma despesa lançada em {ano}.</p>}
      {dados && dados.length > 0 && (
        <div className="tabela-container">
          <table className="tabela tabela--responsiva">
            <thead>
              <tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>IR</th><th className="num">Valor</th><th /></tr>
            </thead>
            <tbody>
              {dados.map((d) => (
                <tr key={d.id}>
                  <td data-rotulo="Data">{formatarData(d.data)}</td>
                  <td data-rotulo="Categoria" className="destaque">{CATEGORIAS_DESPESA[d.categoria].rotulo}</td>
                  <td data-rotulo="Descrição">{d.descricao ?? '—'}</td>
                  <td data-rotulo="IR">{d.dedutivel ? <span className="selo selo--pago">Dedutível</span> : <span className="texto-suave">—</span>}</td>
                  <td data-rotulo="Valor" className="num">{formatarMoeda(d.valor)}</td>
                  <td className="acoes">
                    <button className="botao botao--pequeno" onClick={() => setEditando(d)}>Editar</button>
                    <button className="botao botao--pequeno botao--discreto botao--texto-perigo" onClick={() => excluir(d)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormDespesa
          imovelId={imovelId}
          despesa={editando === 'nova' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            aoAlterar('Despesa salva.')
            recarregar()
          }}
        />
      )}
    </>
  )
}

interface ItemDespesa {
  categoria: CategoriaDespesa
  descricao: string
  valor: string
  dedutivel: boolean
}

const itemVazio = (categoria: CategoriaDespesa = 'iptu'): ItemDespesa => ({
  categoria, descricao: '', valor: '', dedutivel: CATEGORIAS_DESPESA[categoria].dedutivel,
})

/** Nova despesa (permite lançar vários itens de uma vez) ou edição de uma despesa. */
function FormDespesa({ imovelId, despesa, aoFechar, aoSalvar }: { imovelId: string; despesa: Despesa | null; aoFechar: () => void; aoSalvar: () => void }) {
  const [data, setData] = useState(despesa?.data ?? hojeBrasil())
  const [itens, setItens] = useState<ItemDespesa[]>(despesa
    ? [{ categoria: despesa.categoria, descricao: despesa.descricao ?? '', valor: valorParaCampo(despesa.valor), dedutivel: despesa.dedutivel }]
    : [itemVazio()])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const mudar = (i: number, item: Partial<ItemDespesa>) => setItens(itens.map((it, j) => (j === i ? { ...it, ...item } : it)))
  const total = itens.reduce((s, it) => s + (lerValor(it.valor) ?? 0), 0)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const novos: Record<string, string> = {}
    if (!REGEX_DATA.test(data)) novos.data = 'Informe a data.'
    const dados = itens.map((it, i) => {
      const v = lerValor(it.valor)
      if (v === null || v <= 0) novos[`valor${i}`] = 'Informe o valor, por exemplo 120,00.'
      return {
        imovel_id: imovelId,
        data,
        categoria: it.categoria,
        descricao: it.descricao.trim() ? primeiraMaiuscula(it.descricao) : null,
        valor: v ?? 0,
        dedutivel: it.dedutivel,
      }
    })
    setErros(novos)
    if (Object.keys(novos).length) return
    setSalvando(true)
    try {
      if (despesa) await salvarDespesa(despesa.id, dados[0])
      else await salvarDespesasEmLote(dados)
      aoSalvar()
    } catch (err) {
      setErroGeral(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={despesa ? 'Editar despesa' : 'Nova despesa'} aoFechar={aoFechar} largo>
      <form onSubmit={salvar} noValidate>
        <Campo rotulo="Data do pagamento" erro={erros.data}>
          <CampoData valor={data} aoMudar={setData} />
        </Campo>

        {itens.map((it, i) => (
          <div key={i} className="item-despesa">
            <div className="grade-despesa">
              <Campo rotulo={itens.length > 1 ? `Categoria ${i + 1}` : 'Categoria'}>
                <select value={it.categoria} onChange={(e) => {
                  const c = e.target.value as CategoriaDespesa
                  mudar(i, { categoria: c, dedutivel: CATEGORIAS_DESPESA[c].dedutivel })
                }}>
                  {Object.entries(CATEGORIAS_DESPESA).map(([v, c]) => <option key={v} value={v}>{c.rotulo}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Valor (R$)" erro={erros[`valor${i}`]}>
                <input value={it.valor} onChange={(e) => mudar(i, { valor: e.target.value })} inputMode="decimal" placeholder="120,00" />
              </Campo>
              <Campo rotulo="Descrição" dica="opcional">
                <input value={it.descricao} onChange={(e) => mudar(i, { descricao: e.target.value })} maxLength={300} placeholder="Ex.: parcela 3/10" />
              </Campo>
            </div>
            <div className="item-despesa__rodape">
              <label className="checagem">
                <input type="checkbox" checked={it.dedutivel} onChange={(e) => mudar(i, { dedutivel: e.target.checked })} />
                <span>Dedutível no Imposto de Renda</span>
              </label>
              {itens.length > 1 && (
                <button type="button" className="botao botao--pequeno botao--discreto botao--texto-perigo" onClick={() => setItens(itens.filter((_, j) => j !== i))}>
                  Remover
                </button>
              )}
            </div>
          </div>
        ))}

        {!despesa && (
          <button type="button" className="botao botao--pequeno paragrafo" onClick={() => setItens([...itens, itemVazio('condominio')])}>
            + Adicionar outra despesa
          </button>
        )}
        <p className="texto-suave texto-pequeno paragrafo">
          Em geral são dedutíveis no carnê-leão: IPTU, condomínio e taxa de administração pagos pelo proprietário. Confirme com seu contador.
          {itens.length > 1 && <> · <strong>Total: {formatarMoeda(total)}</strong> em {itens.length} despesas</>}
        </p>
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <div className="acoes-form">
          <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="botao botao--primario" disabled={salvando}>
            {salvando ? 'Salvando…' : itens.length > 1 ? `Salvar ${itens.length} despesas` : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
