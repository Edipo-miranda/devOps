import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { listarAvisos } from '../lib/api'
import { aoAlterarDados } from '../lib/eventos'
import { useCarregar } from '../lib/useCarregar'
import { IconeCarteira, IconeEngrenagem, IconeEscudo, IconePainel, IconePredio, IconeSair, IconeSino } from './Icones'

interface ItemMenu {
  para: string
  rotulo: string
  curto: string // rótulo da barra inferior no celular
  icone: ReactNode
  exato?: boolean
}

const MENU: ItemMenu[] = [
  { para: '/', rotulo: 'Dashboard', curto: 'Início', icone: <IconePainel />, exato: true },
  { para: '/imoveis', rotulo: 'Imóveis e inquilinos', curto: 'Imóveis', icone: <IconePredio /> },
  { para: '/recebimentos', rotulo: 'Recebimentos', curto: 'Recebimentos', icone: <IconeCarteira /> },
  { para: '/avisos', rotulo: 'Avisos', curto: 'Avisos', icone: <IconeSino /> },
]

function Contador({ total, urgente }: { total: number; urgente: boolean }) {
  if (!total) return null
  return <span className={`contador ${urgente ? 'contador--urgente' : ''}`}>{total > 99 ? '99+' : total}</span>
}

export function Layout() {
  const { sessao, sair } = useAuth()
  const { pathname } = useLocation()
  // Recarrega os avisos ao trocar de tela e sempre que algo for gravado no banco.
  const { dados: avisos, recarregar } = useCarregar(listarAvisos, [pathname])
  useEffect(() => aoAlterarDados(recarregar), [recarregar])

  const total = avisos?.length ?? 0
  const urgente = (avisos ?? []).some((a) => a.tipo === 'parcela_atrasada' || a.dias <= 0)
  const email = sessao?.user.email ?? ''

  return (
    <div className="app">
      <aside className="lateral">
        <Link to="/" className="marca">
          <span className="marca__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z" fill="currentColor" /></svg>
          </span>
          <span className="marca__texto">Controle de<br /><strong>Aluguéis</strong></span>
        </Link>

        <nav className="lateral__menu">
          {MENU.map((item) => (
            <NavLink key={item.para} to={item.para} end={item.exato} className="lateral__link">
              {item.icone}
              <span>{item.rotulo}</span>
              {item.para === '/avisos' && <Contador total={total} urgente={urgente} />}
            </NavLink>
          ))}
        </nav>

        <div className="lateral__rodape">
          <NavLink to="/configuracoes" className="lateral__link lateral__link--discreto">
            <IconeEngrenagem /><span>Configurações</span>
          </NavLink>
          <NavLink to="/verificacao" className="lateral__link lateral__link--discreto">
            <IconeEscudo /><span>Verificar conexão</span>
          </NavLink>
          <div className="usuario">
            <span className="usuario__avatar" aria-hidden="true">{email.charAt(0).toUpperCase()}</span>
            <span className="usuario__email" title={email}>{email}</span>
            <button className="usuario__sair" onClick={sair} aria-label="Sair" title="Sair"><IconeSair tamanho={18} /></button>
          </div>
        </div>
      </aside>

      <div className="principal">
        <header className="topo-movel">
          <Link to="/" className="marca marca--movel">
            <span className="marca__logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z" fill="currentColor" /></svg>
            </span>
            <span>Controle de <strong>Aluguéis</strong></span>
          </Link>
          <div className="topo-movel__acoes">
            <Link to="/configuracoes" className="botao-icone" aria-label="Configurações"><IconeEngrenagem /></Link>
            <button className="botao-icone" onClick={sair} aria-label="Sair"><IconeSair /></button>
          </div>
        </header>

        <main className="conteudo">
          <Outlet />
        </main>
      </div>

      <nav className="nav-inferior">
        {MENU.map((item) => (
          <NavLink key={item.para} to={item.para} end={item.exato} className="nav-inferior__link">
            <span className="nav-inferior__icone">
              {item.icone}
              {item.para === '/avisos' && <Contador total={total} urgente={urgente} />}
            </span>
            <span>{item.curto}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
