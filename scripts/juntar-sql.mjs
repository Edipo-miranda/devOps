// Junta todos os scripts de supabase/migrations em um arquivo só, para instalar
// o banco de um cliente novo colando uma única vez no SQL Editor do Supabase.
// Uso: npm run sql:juntar   (rode de novo sempre que criar um script novo)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const pasta = 'supabase/migrations'
const arquivos = readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort()
const partes = arquivos.map((f) => `-- =====================================================================\n-- ${f}\n-- =====================================================================\n\n${readFileSync(`${pasta}/${f}`, 'utf8').trim()}\n`)
const cabecalho = `-- INSTALAÇÃO COMPLETA DO BANCO (projeto Supabase NOVO, vazio)
-- Gerado automaticamente por "npm run sql:juntar" a partir de: ${arquivos.join(', ')}.
-- Não edite este arquivo: edite os scripts em supabase/migrations e gere de novo.
-- Uso: Supabase → SQL Editor → New query → cole tudo → Run → "Success".
-- Não rode num banco que já tem as tabelas (lá, rode só os scripts novos).

`
writeFileSync('supabase/instalar_tudo.sql', cabecalho + partes.join('\n'))
console.log(`supabase/instalar_tudo.sql criado com ${arquivos.length} scripts.`)
