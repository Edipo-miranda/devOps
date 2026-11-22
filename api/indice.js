// Função da Vercel (roda no servidor, de graça): busca as variações mensais de um índice
// na API pública do Banco Central (SGS) e devolve para o app.
// Uso: /api/indice?indice=IPCA  ->  [{ "mes": "2026-09", "variacao": 0.48 }, ...]
const SERIES = { IPCA: 433, 'IGP-M': 189, INPC: 188 }

export default async function handler(req, res) {
  const indice = String(req.query.indice || '')
  const serie = SERIES[indice]
  if (!serie) {
    res.status(400).json({ erro: 'Índice não disponível para busca automática.' })
    return
  }
  try {
    const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/36?formato=json`, {
      headers: { Accept: 'application/json' },
    })
    if (!r.ok) throw new Error(`Banco Central respondeu ${r.status}`)
    const dados = await r.json()
    const meses = dados.map((d) => {
      const [, m, a] = String(d.data).split('/')
      return { mes: `${a}-${m}`, variacao: Number(String(d.valor).replace(',', '.')) }
    })
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
    res.status(200).json(meses)
  } catch (err) {
    res.status(502).json({ erro: `Não foi possível consultar o Banco Central: ${err.message}` })
  }
}
