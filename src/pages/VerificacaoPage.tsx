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

    // Funções da Etapa 2 (0002_funcoes_cadastro.sql). Chamada com um id inexistente:
    // se a função existir, responde "Locação não encontrada" e nada é alterado.
    const { error: erroEncerrar } = await supabase.rpc('encerrar_locacao', {
      p_locacao_id: '00000000-0000-0000-0000-000000000000',
      p_data_saida: '2000-01-01',
    })
    const existe = erroEncerrar?.code === 'P0001'
    resultados.push(
      existe
        ? { nome: 'Funções de cadastro (script 0002)', estado: 'ok' }
        : {
            nome: 'Funções de cadastro (script 0002)',
            estado: 'erro',
            detalhe: erroEncerrar ? mensagemDeErro(erroEncerrar) : 'Resposta inesperada do banco.',
          },
    )

    // Avisos, contratos e reajustes (0003_contratos_avisos.sql). Só leitura.
    const { data: avisos, error: erroAvisos } = await supabase.rpc('avisos')
    resultados.push(
      erroAvisos
        ? { nome: 'Avisos e reajustes (script 0003)', estado: 'erro', detalhe: mensagemDeErro(erroAvisos) }
        : { nome: 'Avisos e reajustes (script 0003)', estado: 'ok', detalhe: `${(avisos as unknown[]).length} aviso(s) agora` },
    )

    // Proprietários, contrato e visão geral (0004_proprietarios_contrato.sql). Só leitura.
    const { error: erroGeral } = await supabase.rpc('resumo_geral')
    resultados.push(
      erroGeral
        ? { nome: 'Proprietários e contrato (script 0004)', estado: 'erro', detalhe: mensagemDeErro(erroGeral) }
        : { nome: 'Proprietários e contrato (script 0004)', estado: 'ok' },
    )

    // Contrato revisado e exclusão (0005). Id inexistente: responde "não encontrado" e nada é apagado.
    const { error: erroExcluir } = await supabase.rpc('excluir_inquilino', { p_inquilino_id: '00000000-0000-0000-0000-000000000000' })
    resultados.push(
      erroExcluir?.code === 'P0001'
        ? { nome: 'Contrato revisado e exclusão (script 0005)', estado: 'ok' }
        : { nome: 'Contrato revisado e exclusão (script 0005)', estado: 'erro', detalhe: erroExcluir ? mensagemDeErro(erroExcluir) : 'Resposta inesperada do banco.' },
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
