import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { FormNovaSenha } from '../components/FormNovaSenha'

/** Tela em que a pessoa cria a própria senha (convite, recuperação ou primeiro acesso). */
export function DefinirSenhaPage() {
  const { sessao, carregando, senhaDefinida, sair } = useAuth()
  const navigate = useNavigate()

  if (carregando) return <div className="tela-carregando">Carregando…</div>
  if (!sessao) return <Navigate to="/login" replace />

  return (
    <div className="login login--simples">
      <div className="login__cartao">
        <h1 className="login__titulo">Crie sua senha</h1>
        <p className="texto-suave">
          Olá, <strong>{sessao.user.email}</strong>. Escolha uma senha só sua para entrar no Controle de Aluguéis.
          Ninguém mais terá acesso a ela.
        </p>
        <FormNovaSenha
          rotuloBotao="Salvar senha e entrar"
          aoSalvar={() => {
            senhaDefinida()
            navigate('/', { replace: true })
          }}
        />
        <p className="rodape-secao" style={{ textAlign: 'center' }}>
          <button type="button" className="botao botao--discreto botao--pequeno" onClick={sair}>Sair</button>
        </p>
      </div>
    </div>
  )
}
