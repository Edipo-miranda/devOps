import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

// As telas Dashboard, Imóveis e Recebimentos entram aqui na Etapa 2.
const LINKS = [{ para: '/', rotulo: 'Verificação' }]

export function Layout() {
  const { sessao, sair } = useAuth()

  return (
    <div className="app">
      <header className="topo">
        <div className="topo__conteudo">
          <span className="topo__marca">Controle de Aluguéis</span>
          <nav className="topo__nav">
            {LINKS.map((l) => (
              <NavLink key={l.para} to={l.para} end className="topo__link">
                {l.rotulo}
              </NavLink>
            ))}
          </nav>
          <div className="topo__usuario">
            <span className="texto-suave topo__email">{sessao?.user.email}</span>
            <button className="botao botao--discreto" onClick={sair}>Sair</button>
          </div>
        </div>
      </header>
      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  )
}
