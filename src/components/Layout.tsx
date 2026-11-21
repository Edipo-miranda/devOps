import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { listarAvisos } from '../lib/api'
import { aoAlterarDados } from '../lib/eventos'
import { useCarregar } from '../lib/useCarregar'

const LINKS = [
  { para: '/', rotulo: 'Dashboard', exato: true },
  { para: '/imoveis', rotulo: 'Imóveis', exato: false },
  { para: '/recebimentos', rotulo: 'Recebimentos', exato: false },
]

export function Layout() {
  const { sessao, sair } = useAuth()
  const { pathname } = useLocation()
  // Recarrega os avisos ao trocar de tela e sempre que algo for gravado no banco.
  const { dados: avisos, recarregar } = useCarregar(listarAvisos, [pathname])
  useEffect(() => aoAlterarDados(recarregar), [recarregar])

  const total = avisos?.length ?? 0
  const urgentes = avisos?.filter((a) => a.tipo === 'parcela_atrasada' || a.dias <= 0).length ?? 0

  return (
    <div className="app">
      <header className="topo">
        <div className="topo__conteudo">
          <span className="topo__marca">Controle de Aluguéis</span>
          <nav className="topo__nav">
            {LINKS.map((l) => (
              <NavLink key={l.para} to={l.para} end={l.exato} className="topo__link">
                {l.rotulo}
              </NavLink>
            ))}
          </nav>
          <div className="topo__usuario">
            <Link
              to="/avisos"
              className={`sino ${pathname === '/avisos' ? 'sino--ativo' : ''}`}
              aria-label={total ? `${total} aviso(s)` : 'Avisos'}
              title={total ? `${total} aviso(s)` : 'Nenhum aviso'}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" fill="currentColor" />
              </svg>
              {total > 0 && <span className={`sino__contador ${urgentes ? 'sino__contador--urgente' : ''}`}>{total > 99 ? '99+' : total}</span>}
            </Link>
            <span className="texto-suave topo__email">{sessao?.user.email}</span>
            <button className="botao botao--discreto" onClick={sair}>Sair</button>
          </div>
        </div>
      </header>
      <main className="conteudo">
        <Outlet />
      </main>
      <footer className="rodape">
        <NavLink to="/configuracoes">Configurações dos avisos</NavLink>
        <NavLink to="/verificacao">Verificar conexão com o banco</NavLink>
      </footer>
    </div>
  )
}
