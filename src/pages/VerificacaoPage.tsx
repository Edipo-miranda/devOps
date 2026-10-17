import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensagemDeErro } from '../lib/erros'

type Estado = 'verificando' | 'ok' | 'erro'
interface Item {
  nome: string
  estado: Estado
  detalhe?: string
}

const TABELAS = ['imoveis', 'inquilinos', 'locacoes', 'recebimentos', 'vw_recebimentos'] as const

/**
 * Confere, com o usuário logado, se o aplicativo enxerga todas as tabelas,
 * a view e as funções criadas pelo script SQL. Não grava nada no banco.
 */
export function VerificacaoPage() {
  const [itens, setItens] = useState<Item[]>([])

  const verificar = useCallback(async (): Promise<Item[]> => {
    const resultados: Item[] = []

    const { data: hoje, error: erroHoje } = await supabase.rpc('hoje_brasil')
    resultados.push(
      erroHoje
        ? { nome: 'Função hoje_brasil()', estado: 'erro', detalhe: mensagemDeErro(erroHoje) }
        : { nome: 'Função hoje_brasil()', estado: 'ok', detalhe: `Data de hoje em Brasília: ${String(hoje).split('-').reverse().join('/')}` },
    )

    for (const tabela of TABELAS) {
      const { count, error } = await supabase.from(tabela).select('*', { count: 'exact', head: true })
      resultados.push(
        error
          ? { nome: `Tabela ${tabela}`, estado: 'erro', detalhe: mensagemDeErro(error) }
          : { nome: `Tabela ${tabela}`, estado: 'ok', detalhe: `${count ?? 0} registro(s) seus` },
      )
    }

    const agora = new Date()
    const { error: erroResumo } = await supabase.rpc('resumo_mes', { p_ano: agora.getFullYear(), p_mes: agora.getMonth() + 1 })
    resultados.push(
      erroResumo
        ? { nome: 'Função resumo_mes()', estado: 'erro', detalhe: mensagemDeErro(erroResumo) }
        : { nome: 'Função resumo_mes()', estado: 'ok' },
    )

    return resultados
  }, [])

  useEffect(() => {
    let ativo = true
    verificar().then((r) => ativo && setItens(r))
    return () => { ativo = false }
  }, [verificar])

  const tudoOk = itens.length > 0 && itens.every((i) => i.estado === 'ok')

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Verificação da conexão</h1>
          <p className="texto-suave">Confere se o aplicativo está ligado corretamente ao seu banco Supabase.</p>
        </div>
        <button className="botao" onClick={() => { setItens([]); verificar().then(setItens) }}>Verificar novamente</button>
      </div>

      {itens.length === 0 && <p className="texto-suave">Verificando…</p>}
      {itens.length > 0 && (
        <p className={`alerta ${tudoOk ? 'alerta--ok' : 'alerta--erro'}`}>
          {tudoOk ? 'Tudo certo: banco de dados configurado e acessível.' : 'Há itens com problema. Veja os detalhes abaixo.'}
        </p>
      )}

      <div className="tabela-container">
        <table className="tabela">
          <thead>
            <tr><th>Item</th><th>Situação</th><th>Detalhe</th></tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.nome}>
                <td>{i.nome}</td>
                <td>
                  <span className={`selo ${i.estado === 'ok' ? 'selo--pago' : 'selo--atrasado'}`}>
                    {i.estado === 'ok' ? 'OK' : 'Erro'}
                  </span>
                </td>
                <td className="texto-suave">{i.detalhe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
