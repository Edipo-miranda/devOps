# Controle de Aluguéis

Aplicativo web para controlar o recebimento de aluguéis de vários imóveis e inquilinos.

- **Frontend:** React + TypeScript + Vite
- **Banco de dados e login:** Supabase (PostgreSQL + Supabase Auth)
- **Publicação:** Vercel (plano gratuito)

> **Situação atual: Etapa 2** — telas de Dashboard, Imóveis e inquilinos e Recebimentos prontas.
> Antes de usar, execute também o script `0002_funcoes_cadastro.sql` no Supabase (veja
> [Atualizar para a Etapa 2](#atualizar-para-a-etapa-2)).

---

## 1. Estrutura do projeto

```
├── supabase/
│   ├── migrations/0001_schema_inicial.sql   ← cria tabelas, regras, segurança e funções
│   ├── migrations/0002_funcoes_cadastro.sql ← cadastro "tudo ou nada" e encerramento de locação
│   ├── migrations/0003_contratos_avisos.sql ← prazo de contrato, reajustes e avisos
│   ├── migrations/0004_proprietarios_contrato.sql ← proprietários, dados p/ contrato, visão geral
│   ├── migrations/0005_contrato_revisado_exclusao.sql ← índice de reajuste, IPTU, gênero, exclusão
│   ├── migrations/0006_venda_exclusao_imovel.sql ← imóvel vendido e exclusão de imóvel
│   ├── migrations/0007_financeiro_documentos.sql ← despesas, multa/juros, matrícula/IPTU, caução
│   ├── migrations/0008_documentos_modelos.sql ← documentos anexados e modelos de contrato
│   ├── migrations/0009_uso_armazenamento.sql ← espaço usado pelos documentos
│   ├── tests/0001_verificar_banco.sql       ← testa o banco e apaga tudo que criou
│   ├── tests/0002_verificar_funcoes_cadastro.sql
│   ├── tests/0003_verificar_contratos_avisos.sql
│   ├── tests/0004_verificar_proprietarios_contrato.sql
│   ├── tests/0005_verificar_contrato_exclusao.sql
│   ├── tests/0006_verificar_venda_exclusao_imovel.sql
│   ├── tests/0007_verificar_financeiro.sql
│   ├── tests/0008_verificar_documentos_modelos.sql
│   └── tests/0009_verificar_uso_armazenamento.sql
├── src/
│   ├── lib/supabase.ts       ← conexão com o Supabase (só chave pública)
│   ├── lib/erros.ts          ← traduz erros para mensagens em português
│   ├── lib/api.ts            ← todas as leituras e gravações no banco
│   ├── lib/format.ts         ← moeda, datas e fuso de Brasília
│   ├── auth/                 ← controle de login (sessão do usuário)
│   ├── components/Layout.tsx ← topo e menu de navegação
│   ├── pages/                ← uma tela por arquivo
│   ├── types/database.ts     ← formato dos dados de cada tabela
│   └── styles/index.css      ← visual do aplicativo
├── .env.example              ← modelo das variáveis de ambiente
├── vercel.json               ← configuração para a Vercel
└── package.json              ← dependências e comandos
```

## 2. Modelo do banco de dados

```
 imoveis ─┐                          ┌─ inquilinos
          │ 1                      1 │
          └──────► locacoes ◄────────┘      (histórico de ocupações)
                      │ 1
                      ▼ N
                 recebimentos               (um por locação por mês)
```

| Tabela | Para que serve | Campos principais |
|---|---|---|
| `imoveis` | Cada imóvel | identificação, endereço, ativo (sim/não) |
| `inquilinos` | Cada pessoa que aluga | nome, telefone (opcional) |
| `locacoes` | "Fulano ocupa o imóvel X desde a data Y" | data de entrada, data de saída, **valor atual do aluguel**, dia de vencimento, situação (`ativa`/`encerrada`) |
| `recebimentos` | Cobrança de um mês | mês de referência, **valor previsto**, **vencimento**, valor recebido, data do pagamento |

**Regras garantidas pelo próprio banco** (mesmo que alguém tente burlar o aplicativo):

- Não existe recebimento duplicado para a mesma locação e o mesmo mês (`unique (locacao_id, mes_referencia)`).
- Cada recebimento guarda uma **cópia** do valor e do vencimento. Mudar o valor do aluguel na locação
  **não altera** os meses já lançados; só os meses gerados depois usam o novo valor.
- Um imóvel só pode ter **uma** locação ativa por vez. Quando o inquilino sai, a locação é encerrada
  (com data de saída) e fica no histórico; o próximo inquilino recebe uma locação nova.
- Nada é apagado pelo aplicativo: imóveis são **desativados**, locações são **encerradas**.
- Valor recebido e data do pagamento são preenchidos sempre juntos.
- Mês de referência, locação e dono de um recebimento não podem ser trocados depois.
- Vencimento no dia 31 em mês mais curto vira o último dia do mês (ex.: 28/02).
- Não há cálculo automático de reajuste, juros ou multa.

**Situação do recebimento** (calculada na view `vw_recebimentos`, com a data de hoje no fuso de Brasília):

| Situação | Quando |
|---|---|
| Pago | pagamento registrado |
| Atrasado | sem pagamento e a data de vencimento já passou |
| Em aberto | sem pagamento e ainda dentro do prazo (inclui o próprio dia do vencimento) |

**Funções no banco:**

- `gerar_recebimentos_mes(ano, mes)` — cria os lançamentos do mês para todas as locações vigentes
  naquele mês. Pode ser chamada várias vezes: só cria o que ainda não existe.
- `resumo_mes(ano, mes)` — totais do Dashboard (previsto, recebido, pendente, atrasados).
- `cadastrar_imovel(...)` e `registrar_locacao(...)` — gravam imóvel, inquilino e locação de uma vez
  (se algo falhar, nada é gravado).
- `encerrar_locacao(id, data_saida)` — registra a saída e remove apenas lançamentos **sem pagamento**
  de meses **posteriores** ao mês da saída.

**Quando os lançamentos são criados:** ao abrir o aplicativo, os lançamentos do **mês atual** são criados
automaticamente (sem duplicar). Para meses passados ou futuros, use o botão
**Gerar lançamentos de &lt;mês&gt;** na tela Recebimentos.

**Segurança (RLS):** cada usuário só vê e altera os próprios registros. Visitantes não logados não
acessam nada. As chaves estrangeiras compostas impedem ligar um imóvel de um usuário a um inquilino
de outro.

---

## 3. O que fazer agora (passo a passo)

### Passo 1 — Instalar as ferramentas no seu computador

1. Instale o **Node.js** versão 20 ou mais nova (LTS): <https://nodejs.org>.
2. Instale o **Git**: <https://git-scm.com>.
3. Baixe este repositório (`git clone ...`) e, dentro da pasta, rode:
   ```bash
   npm install
   ```

### Passo 2 — Criar o projeto no Supabase

1. Acesse <https://supabase.com>, crie uma conta e clique em **New project**.
2. Dê um nome, crie uma **senha do banco** forte (guarde-a) e escolha a região **South America (São Paulo)**.
3. Aguarde o projeto ficar pronto (1–2 minutos).

### Passo 3 — Criar as tabelas (executar o SQL)

1. No menu lateral do Supabase, abra **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/migrations/0001_schema_inicial.sql`, copie **todo** o conteúdo, cole e clique em **Run**.
3. Deve aparecer *Success. No rows returned*.

### Passo 4 — Testar o banco

1. Ainda no **SQL Editor**, abra uma nova query.
2. Cole todo o conteúdo de `supabase/tests/0001_verificar_banco.sql` e clique em **Run**.
3. O resultado deve ser uma tabela com **29 linhas "OK"**. O teste cria usuários temporários e apaga
   tudo no final — nenhum dado de teste fica no banco.
4. Se aparecer um erro começando com **FALHOU**, copie a mensagem e me envie.

### Passo 5 — Criar o seu usuário de login

1. Menu **Authentication** → **Users** → **Add user** → **Create new user**.
2. Informe seu e-mail e uma senha (mínimo 6 caracteres) e marque **Auto Confirm User**.
3. **Recomendado:** em **Authentication** → **Sign In / Providers**, desligue **Allow new users to sign up**.
   Assim, ninguém mais consegue criar conta no seu aplicativo. (Mesmo que alguém crie, a RLS impede
   que veja os seus dados.)

### Passo 6 — Configurar as variáveis de ambiente

1. No Supabase, abra **Project Settings** → **API Keys**. Copie a **Publishable key** (começa com
   `sb_publishable_`). Se o seu projeto mostrar apenas as chaves antigas, use a **anon public**.
2. Copie a **Project URL** (em **Project Settings** → **Data API**, ou no botão **Connect**). Formato:
   `https://xxxxx.supabase.co`.
3. Na pasta do projeto, copie o arquivo `.env.example` com o nome `.env.local` e preencha:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

> ⚠️ **Nunca** use a **Secret key** (`sb_secret_...`) nem a **service_role** no aplicativo.
> Tudo que começa com `VITE_` vai para o navegador e qualquer pessoa pode ver. O aplicativo recusa
> funcionar se detectar uma chave secreta. O arquivo `.env.local` já está no `.gitignore` e
> não vai para o GitHub.

### Passo 7 — Rodar e verificar a integração

```bash
npm run dev
```

Abra o endereço mostrado (normalmente <http://localhost:5173>), entre com o usuário do Passo 5 e veja a
tela **Verificação da conexão**. Todos os itens devem aparecer como **OK**. Se algum der erro, a
mensagem explica o motivo (ex.: SQL não executado, chave errada).


---

## Atualizar para a Etapa 2

1. No terminal do VS Code (com o app parado — **Ctrl + C**), baixe a atualização e instale:
   ```
   git pull
   npm install
   ```
2. No Supabase, **SQL Editor → New query**, cole todo o arquivo
   `supabase/migrations/0002_funcoes_cadastro.sql` e clique em **Run** → *Success*.
3. Numa nova query, cole `supabase/tests/0002_verificar_funcoes_cadastro.sql` e clique em **Run** →
   devem aparecer **11 linhas OK**.
4. Rode `npm run dev`, entre e abra o link **Verificar conexão com o banco** (no rodapé): todos os itens OK,
   inclusive **Funções de cadastro (script 0002)**.

## Atualizar para os avisos (contratos e reajustes)

1. Com o app parado (**Ctrl + C**): `git pull` e depois `npm install`.
2. No Supabase, **SQL Editor → New query**: cole todo o `supabase/migrations/0003_contratos_avisos.sql` → **Run** → *Success*.
   (Se ainda não rodou o 0002, rode o 0002 antes.)
3. Nova query: cole `supabase/tests/0003_verificar_contratos_avisos.sql` → **Run** → **11 linhas OK**.
4. `npm run dev` → rodapé → **Verificar conexão com o banco**: tudo OK, inclusive **Avisos e reajustes (script 0003)**.
5. Nas locações que você já cadastrou, abra o imóvel → **Editar locação** e preencha **Prazo do contrato**,
   **Reajuste a cada**, **Início do contrato atual** e **Último reajuste em** (se já houve reajuste).
   Locações cadastradas antes desta atualização ficam sem prazo e sem reajuste até você preencher.

### Como funcionam os avisos

- Aparecem **dentro do app**: no sino 🔔 do topo (com o número de avisos), no Dashboard e na tela **Avisos**.
- **Parcela:** a partir de 3 dias antes do vencimento, no dia, e todos os dias enquanto estiver atrasada.
  Some quando o pagamento é registrado.
- **Fim do contrato:** 60 dias antes de completar o prazo (ex.: 12 meses). Some ao **renovar** (novo período),
  ao marcar **prazo indeterminado** ou ao **encerrar** a locação.
- **Reajuste:** 60 dias antes da data (último reajuste — ou a entrada — + periodicidade). Some ao **registrar o
  reajuste**, informando o novo valor definido pelo proprietário (o app não faz cálculos). O histórico de reajustes fica guardado.
- A antecedência (3 e 60 dias) pode ser alterada em **Configurações dos avisos** (rodapé).

## Roteiro de teste com dados reais

Use os seus imóveis de verdade (não é preciso inventar dados). Siga na ordem e confira cada resultado:

| # | Faça | Resultado esperado |
|---|---|---|
| 1 | Imóveis → **+ Novo imóvel**, marque "está alugado", preencha e salve | Abre a página do imóvel com a locação atual |
| 2 | Salve o formulário vazio | Mensagens em vermelho em cada campo obrigatório |
| 3 | Cadastre um imóvel com a **mesma identificação** | Aviso de imóvel duplicado |
| 4 | Recebimentos (mês atual) | O lançamento do imóvel aparece com valor e vencimento |
| 5 | Clique em **Gerar lançamentos** de novo | "Nenhum lançamento novo" (não duplica) |
| 6 | **Registrar pagamento** com valor e data | Situação muda para **Pago**; Dashboard atualiza os totais |
| 7 | No imóvel, **Editar valor/vencimento** com outro valor | Lançamentos já existentes **não mudam** |
| 8 | Recebimentos → próximo mês → **Gerar lançamentos** | Novo mês usa o **novo** valor |
| 9 | **Encerrar locação** e depois **+ Cadastrar inquilino** | O antigo vai para "Histórico de ocupações"; recebimentos antigos continuam |
| 10 | Busca por parte do nome do inquilino ou do imóvel | Filtra a lista |
| 11 | Edite uma locação com prazo 12 e reajuste 12, e **Início do contrato** há ~11 meses | Sino mostra avisos de contrato e reajuste |
| 12 | **Registrar reajuste** com o novo valor | Aviso some; aparece em "Histórico de reajustes"; meses pagos não mudam |
| 13 | **Renovar contrato** | Aviso de fim de contrato some; novo período aparece no imóvel |
| 14 | Lançamento com vencimento em até 3 dias, sem pagamento | Aviso "A vencer"; após registrar pagamento, some |

Um lançamento com vencimento já passado e sem pagamento aparece como **Atrasado** (data de Brasília).

## 4. Publicar na Vercel (quando o app estiver pronto)

1. Envie o projeto para o GitHub.
2. Em <https://vercel.com>, **Add New → Project**, importe o repositório (a Vercel detecta Vite).
3. Em **Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
   (os mesmos valores do `.env.local`) e clique em **Deploy**.
4. No Supabase, em **Authentication** → **URL Configuration**, coloque o endereço da Vercel em **Site URL**.

Se o painel da Vercel mostrar **"Sem implantação em produção"**, abra **Deployments**, clique em
**Create Deployment** (ou nos **⋯** → **Create Deployment**), informe a branch `ccr-24d97354-i2totz` e confirme.
Toda nova atualização enviada para essa branch é publicada automaticamente.

O arquivo `vercel.json` faz as rotas do aplicativo (ex.: `/recebimentos`) funcionarem ao recarregar a página.

## Instalar no celular (como aplicativo)

Depois de publicado na Vercel (endereço `https://...vercel.app`):

- **Android (Chrome):** abra o endereço → menu **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).
- **iPhone (Safari):** abra o endereço → botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.

O ícone "Aluguéis" aparece na tela inicial e o app abre em tela cheia. Ele precisa de internet
(os dados ficam no Supabase) e se atualiza sozinho a cada nova publicação.

## Contrato em PDF e proprietários (script 0004)

1. Com o app parado: `git pull` e `npm install`.
2. Supabase → **SQL Editor**: rode `supabase/migrations/0004_proprietarios_contrato.sql` → *Success*.
3. Rode `supabase/tests/0004_verificar_proprietarios_contrato.sql` → **12 linhas OK**.
4. No app: cadastre o **proprietário** (menu Proprietários), vincule-o ao imóvel (**Editar imóvel**), complete
   os dados do inquilino (**Editar inquilino**) e as **Condições do contrato** (**Editar locação**).
5. Na página do imóvel, clique em **Gerar contrato** → confira as pendências → **Baixar PDF** ou **Enviar**.

Assinatura: no papel (imprimir e rubricar cada página) ou, de graça pela internet, no **Assinador gov.br**
(assinador.iti.br). O texto é um modelo baseado na Lei nº 8.245/1991 — recomenda-se revisão por advogado.

## Contrato revisado e exclusão (script 0005)

1. Supabase → **SQL Editor**: rode `supabase/migrations/0005_contrato_revisado_exclusao.sql` → *Success*.
2. Rode `supabase/tests/0005_verificar_contrato_exclusao.sql` → **7 linhas OK**.
3. O contrato segue o modelo revisado (qualificação das partes, art. 42/46/47, reajuste por índice, encargos,
   ausência de garantia, conservação, rescisão com fórmula proporcional, entrega das chaves, foro).
4. **Excluir inquilino** (Imóveis e inquilinos → aba Inquilinos, ou Editar inquilino) apaga também todas as
   locações, lançamentos, pagamentos e reajustes dele. **Excluir proprietário** mantém os imóveis, sem dono.
5. Nomes, ruas, bairros e cidades são padronizados com iniciais maiúsculas ("Maria da Silva");
   profissão e nacionalidade ficam em minúsculas, como no texto do contrato.

## Imóvel vendido e exclusão de imóvel (script 0006)

1. Supabase → **SQL Editor**: rode `supabase/migrations/0006_venda_exclusao_imovel.sql` → *Success*.
2. Rode `supabase/tests/0006_verificar_venda_exclusao_imovel.sql` → **4 linhas OK**.
3. **Vendeu um imóvel?** Na página dele, **Marcar como vendido**: encerra a locação na data da venda, guarda
   data/valor/comprador e tira o imóvel das listas ativas. **Todo o histórico de pagamentos continua**
   (importante para o Imposto de Renda). "Desfazer venda" reativa o imóvel, se marcou por engano.
4. **Cadastro de teste ou errado?** **Excluir**: apaga o imóvel e toda a movimentação dele (os inquilinos ficam).

## Financeiro, cobrança, recibos e relatórios (script 0007)

1. Supabase → **SQL Editor**: rode `supabase/migrations/0007_financeiro_documentos.sql` → *Success*.
2. Rode `supabase/tests/0007_verificar_financeiro.sql` → **8 linhas OK**.
3. Novidades:
   - **Cobrar / Lembrar pelo WhatsApp** (Recebimentos e Avisos): mensagem pronta com valor, vencimento, PIX e,
     se atrasado, multa e juros até hoje.
   - **Multa e juros automáticos** ao registrar pagamento atrasado (pro rata die), com opção de não cobrar
     (por pagamento ou em Configurações).
   - **Recibo em PDF** de cada pagamento.
   - **Reajuste**: busca a variação acumulada do IPCA/IGP-M/INPC no Banco Central (função `api/indice.js`
     na Vercel), calcula o novo valor e gera a **carta de reajuste em PDF**.
   - **Despesas por imóvel** (IPTU, condomínio, manutenção…) e lucro líquido.
   - **Relatórios e IR**: mês a mês (carnê-leão), por pagador, por imóvel; **PDF para o contador** e **Excel**;
     exportação dos cadastros.
   - **Imóvel**: matrícula, cartório, inscrição e valor do IPTU, condomínio, área, cômodos, contas de luz/água.
   - **Caução**: datas de recebimento/devolução e valor devolvido.

## Documentos e modelos de contrato (script 0008)

1. Supabase → **SQL Editor**: rode `supabase/migrations/0008_documentos_modelos.sql` → *Success*.
   (Cria a pasta privada **documentos** no Storage, com limite de 20 MB por arquivo.)
2. Rode `supabase/tests/0008_verificar_documentos_modelos.sql` → **6 linhas OK**.
3. **Documentos**: na página do imóvel → **+ Anexar documento** (contrato assinado, vistoria, RG/CPF, comprovantes).
   Os arquivos são privados: só o usuário dono consegue abrir.
4. **Editar o contrato**: Gerar contrato → **Editar texto / cláusulas** (alterar, incluir, remover e reordenar
   cláusulas). **Salvar nesta locação** guarda a versão para aquele inquilino; **Salvar como modelo** cria um
   contrato próprio reaproveitável (os dados viram campos como `{{LOCATARIO_NOME}}`).

## Espaço usado e fotos reduzidas (script 0009)

1. Supabase → **SQL Editor**: rode `supabase/migrations/0009_uso_armazenamento.sql` → *Success*.
2. Rode `supabase/tests/0009_verificar_uso_armazenamento.sql` → **2 linhas OK**.
3. **Configurações → Espaço para documentos** mostra quanto *você* usa e quanto o *sistema inteiro* usa,
   comparado com o 1 GB do plano gratuito (o limite é do projeto Supabase, somado entre todos os usuários).
4. Fotos anexadas são **reduzidas automaticamente** (até 1920 px, JPEG) antes de enviar — ex.: 11,6 MB → 469 KB.
   PDFs e Word são enviados como estão.

## Dar acesso a outra pessoa

Cada usuário tem **seus próprios dados**: um não vê nada do outro (RLS no banco). A nova pessoa começa com o sistema vazio.

1. Supabase → **Authentication → Users → Add user → Create new user**: e-mail da pessoa, uma **senha
   provisória** qualquer e **Auto Confirm User** marcado.
2. Supabase → **SQL Editor**, rode (trocando o e-mail):
   ```sql
   update auth.users
      set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"trocar_senha": true}'
    where email = 'email.da.pessoa@exemplo.com';
   ```
3. Envie para a pessoa o endereço do app, o e-mail e a senha provisória. No primeiro acesso, o app abre a tela
   **"Crie sua senha"** e só libera o uso depois que ela criar a própria senha. Você não fica sabendo a senha nova.

A senha também pode ser trocada a qualquer momento em **Configurações → Minha conta**.
"Esqueci minha senha" (na tela de login) envia um link por e-mail — no plano gratuito, o Supabase só envia
e-mails para os membros do próprio projeto; para outras pessoas é preciso configurar um SMTP
(**Authentication → Emails → SMTP Settings**).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | roda o app no seu computador |
| `npm run build` | verifica os tipos e gera a versão de produção |
| `npm run lint` | procura problemas no código |
