import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { Campo } from './CamposLocacao'
import { CampoData } from './CampoData'
import { ConfirmarExclusao } from './ConfirmarExclusao'
import { excluirImovel, marcarImovelVendido, movimentacaoImovel, type LocacaoComInquilino } from '../lib/api'
import { mensagemDeErro } from '../lib/erros'
import { REGEX_DATA, formatarData, hojeBrasil, lerValor } from '../lib/format'
import { capitalizarNome } from '../lib/texto'
import { useCarregar } from '../lib/useCarregar'
import type { Imovel } from '../types/database'

/** Registra a venda: encerra a locação na data e desativa o imóvel, guardando o histórico. */
export function FormVendaImovel({ imovel, locacaoAtiva, aoFechar, aoSalvar }: {
  imovel: Imovel
  locacaoAtiva: LocacaoComInquilino | null
  aoFechar: () => void
  aoSalvar: (texto: string) => void
}) {
  const [data, setData] = useState(hojeBrasil())
  const [valor, setValor] = useState('')
  const [comprador, setComprador] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const novos: Record<string, string> = {}
    if (!REGEX_DATA.test(data)) novos.data = 'Informe a data da venda.'
    else if (locacaoAtiva && data < locacaoAtiva.data_entrada) novos.data = `Não pode ser antes da entrada do inquilino (${formatarData(locacaoAtiva.data_entrada)}).`
    const v = valor.trim() ? lerValor(valor) : null
    if (valor.trim() && (v === null || v <= 0)) novos.valor = 'Valor inválido.'
    setErros(novos)
    if (Object.keys(novos).length) return
    setSalvando(true)
    try {
      const removidos = await marcarImovelVendido(imovel.id, { data, valor: v, comprador: capitalizarNome(comprador) || null })
      aoSalvar(`Imóvel marcado como vendido.${removidos ? ` ${removidos} lançamento(s) futuro(s) sem pagamento removido(s).` : ''}`)
    } catch (err) {
      setErroGeral(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={`Marcar como vendido — ${imovel.identificacao}`} aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate>
        <p className="texto-suave paragrafo">
          O imóvel sai das listas ativas, mas <strong>todo o histórico de aluguéis e pagamentos fica guardado</strong> (útil para o Imposto de Renda).
        </p>
        {locacaoAtiva && (
          <p className="alerta alerta--info">
            A locação de <strong>{locacaoAtiva.inquilino.nome}</strong> será <strong>encerrada na data da venda</strong>. Lançamentos sem pagamento
            de meses seguintes ao da venda serão removidos; os pagos ficam.
          </p>
        )}
        <div className="grade-2">
          <Campo rotulo="Data da venda" erro={erros.data}>
            <CampoData valor={data} aoMudar={setData} />
          </Campo>
          <Campo rotulo="Valor da venda (R$)" dica="opcional" erro={erros.valor}>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="350.000,00" />
          </Campo>
        </div>
        <Campo rotulo="Comprador" dica="opcional">
          <input value={comprador} onChange={(e) => setComprador(e.target.value)} onBlur={() => setComprador(capitalizarNome(comprador))} maxLength={150} />
        </Campo>
        {erroGeral && <p className="alerta alerta--erro" role="alert">{erroGeral}</p>}
        <div className="acoes-form">
          <button type="button" className="botao" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="botao botao--primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Confirmar venda'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Confirmação de exclusão do imóvel, mostrando a movimentação que será apagada. */
export function ExcluirImovel({ imovel, aoFechar, aoExcluir }: { imovel: Imovel; aoFechar: () => void; aoExcluir: () => void }) {
  const { dados: mov, erro } = useCarregar(() => movimentacaoImovel(imovel.id), [imovel.id])
  const temMovimento = Boolean(mov && mov.locacoes + mov.lancamentos > 0)

  return (
    <ConfirmarExclusao
      titulo="Excluir imóvel"
      aoFechar={aoFechar}
      aoConfirmar={async () => {
        await excluirImovel(imovel.id)
        aoExcluir()
      }}
    >
      <p>
        Você vai excluir <strong>{imovel.identificacao}</strong>.{' '}
        {mov && (temMovimento ? 'Isso apagará toda a movimentação dele:' : 'Este imóvel não tem movimentação.')}
      </p>
      {erro && <p>Não foi possível conferir a movimentação: {erro}</p>}
      {!mov && !erro && <p>Conferindo a movimentação…</p>}
      {mov && temMovimento && (
        <ul className="lista-pendencias">
          <li>{mov.locacoes} locação(ões){mov.inquilinos.length ? ` (${mov.inquilinos.join(', ')})` : ''}</li>
          <li>{mov.lancamentos} lançamento(s) de aluguel, sendo <strong>{mov.pagos} pago(s)</strong></li>
          <li>histórico de reajustes</li>
        </ul>
      )}
      <p>Os inquilinos continuam cadastrados (exclua-os na aba Inquilinos, se quiser).</p>
      {mov && mov.pagos > 0 && (
        <p><strong>Vendeu o imóvel?</strong> Prefira “Marcar como vendido”, que guarda o histórico de pagamentos.</p>
      )}
    </ConfirmarExclusao>
  )
}
