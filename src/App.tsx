import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { erroConfiguracao } from './lib/supabase'
import { LoginPage } from './pages/LoginPage'
import { DefinirSenhaPage } from './pages/DefinirSenhaPage'
import { VerificacaoPage } from './pages/VerificacaoPage'
import { DashboardPage } from './pages/DashboardPage'
import { ImoveisPage } from './pages/ImoveisPage'
import { ImovelDetalhePage } from './pages/ImovelDetalhePage'
import { RecebimentosPage } from './pages/RecebimentosPage'
import { AvisosPage } from './pages/AvisosPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'

export default function App() {
  if (erroConfiguracao) {
    return (
      <div className="login">
        <div className="login__cartao">
          <h1 className="login__titulo">Configuração necessária</h1>
          <p className="alerta alerta--erro">{erroConfiguracao}</p>
          <p className="texto-suave">Veja o passo a passo no arquivo README.md.</p>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/definir-senha" element={<DefinirSenhaPage />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            <Route path="imoveis" element={<ImoveisPage />} />
            <Route path="imoveis/:id" element={<ImovelDetalhePage />} />
            <Route path="recebimentos" element={<RecebimentosPage />} />
            <Route path="avisos" element={<AvisosPage />} />
            <Route path="configuracoes" element={<ConfiguracoesPage />} />
            <Route path="verificacao" element={<VerificacaoPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
