import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, type AvisoDados } from '../components/Aviso'
import { ListaAvisos } from '../components/ListaAvisos'
import { garantirMesAtual, listarAvisos, lerConfiguracoes } from '../lib/api'
import { aoAlterarDados } from '../lib/eventos'
import { useCarregar } from '../lib/useCarregar'

export function AvisosPage() {
  const [aviso, setAviso] = useState<AvisoDados | null>(null)
  const fecharAviso = useCallback(() => setAviso(null), [])

  const { dados, erro, carregando, recarregar } = useCarregar(async () => {
    await garantirMesAtual()
    const [avisos, config] = await Promise.all([listarAvisos(), lerConfiguracoes()])
    return { avisos, config }
  }, [])

  useEffect(() => aoAlterarDados(recarregar), [recarregar])

  const parcelas = dados?.avisos.filter((a) => a.tipo.startsWith('parcela')) ?? []
  const contratos = dados?.avisos.filter((a) => !a.tipo.startsWith('parcela')) ?? []
  const props = {
    aoAlterar: (texto: string) => setAviso({ tipo: 'ok', texto }),
    aoErro: (texto: string) => setAviso({ tipo: 'erro', texto }),
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Avisos</h1>
          <p className="texto-suave">
            {dados
              ? `Parcelas: ${dados.config.dias_aviso_parcela} dia(s) antes do vencimento e enquanto atrasadas. ` +
                `Contratos e reajustes: ${dados.config.dias_aviso_contrato} dia(s) antes.`
              : 'Parcelas a vencer ou atrasadas, contratos terminando e reajustes.'}
          </p>
        </div>
        <Link to="/configuracoes" className="botao">Configurar antecedência</Link>
      </div>

      {erro && <p className="alerta alerta--erro">{erro}</p>}
      {!dados && !erro && <p className="texto-suave">Carregando…</p>}

      {dados && (
        <div className={carregando ? 'carregando' : ''}>
          <h2 className="titulo-secao">Parcelas</h2>
          {parcelas.length === 0 ? <p className="vazio">Nenhuma parcela atrasada ou a vencer nos próximos dias.</p> : <ListaAvisos avisos={parcelas} {...props} />}

          <h2 className="titulo-secao">Contratos e reajustes</h2>
          {contratos.length === 0 ? (
            <p className="vazio">Nenhum contrato terminando ou reajuste previsto no período de aviso.</p>
          ) : (
            <ListaAvisos avisos={contratos} {...props} />
          )}
        </div>
      )}

      <Aviso aviso={aviso} aoFechar={fecharAviso} />
    </section>
  )
}
