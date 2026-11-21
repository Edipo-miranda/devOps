import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const LINKS = [
  { para: '/', rotulo: 'Dashboard', exato: true },
  { para: '/imoveis', rotulo: 'Imóveis', exato: false },
  { para: '/recebimentos', rotulo: 'Recebimentos', exato: false },
]

export function Layout() {
  const { sessao, sair } = useAuth()

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
            <span className="texto-suave topo__email">{sessao?.user.email}</span>
            <button className="botao botao--discreto" onClick={sair}>Sair</button>
          </div>
        </div>
      </header>
      <main className="conteudo">
        <Outlet />
      </main>
      <footer className="rodape">
        <NavLink to="/verificacao">Verificar conexão com o banco</NavLink>
      </footer>
    </div>
  )
}
