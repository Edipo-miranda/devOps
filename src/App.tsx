import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { erroConfiguracao } from './lib/supabase'
import { LoginPage } from './pages/LoginPage'
import { VerificacaoPage } from './pages/VerificacaoPage'

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
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<VerificacaoPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
