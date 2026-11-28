"""Gera a planilha "Controle de Aluguéis" (Excel, só fórmulas, sem macros).

Uso:  python3 planilha/gerar_planilha.py   ->  planilha/Controle-de-Alugueis.xlsx
Os dados de exemplo são fictícios (CPF e telefone zerados) e devem ser apagados pelo cliente.
"""
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.hyperlink import Hyperlink
from openpyxl.worksheet.protection import SheetProtection

SAIDA = Path(__file__).with_name('Controle-de-Alugueis.xlsx')
FONTE = 'Arial'

# Cores (as mesmas do sistema)
VERDE_ESC, VERDE, VERDE_CLARO = '0F766E', '0D9488', 'CCFBF1'
ESCURO, CINZA_TXT, BORDA = '0F172A', '64748B', 'E2E8F0'
ENTRADA, AUTO = 'FFFBEB', 'F1F5F9'  # fundo de campo para preencher / automático
AMARELO = 'FACC15'

fina = Side(style='thin', color=BORDA)
BORDA_CEL = Border(left=fina, right=fina, top=fina, bottom=fina)
F_DATA, F_MOEDA, F_PCT, F_MES = 'dd/mm/yyyy', '"R$" #,##0.00;[Red]-"R$" #,##0.00;"-"', '0.00%', 'mm/yyyy'

# Faixas de linhas de dados
IM = (6, 105)      # Imóveis
INQ = (6, 205)     # Inquilinos
PR = (6, 55)       # Proprietários
CT = (6, 105)      # Contratos
PG = (6, 3005)     # Pagamentos
DP = (6, 2005)     # Despesas
AM0 = 8            # primeira linha de "Aluguéis do Mês" (espelha Contratos linha 6)

MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
LISTAS = {
    'tipos': ['Casa', 'Apartamento', 'Kitnet', 'Sala comercial', 'Loja', 'Galpão', 'Terreno', 'Outro'],
    'indices': ['IPCA', 'IGP-M', 'INPC', 'Definido pelo proprietário'],
    'categorias': ['IPTU', 'Condomínio', 'Manutenção / reforma', 'Água / luz / gás', 'Seguro', 'Taxa de administração', 'Imposto', 'Outros'],
    'formas': ['PIX', 'Dinheiro', 'Transferência', 'Boleto', 'Depósito'],
    'simnao': ['Sim', 'Não'],
    'civil': ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável'],
}

# Células auxiliares (aba Listas)
MES_N, ANO, INI, FIM = 'Listas!$K$2', 'Listas!$K$3', 'Listas!$K$4', 'Listas!$K$5'


def rng(aba, col, faixa):
    return f"'{aba}'!${col}${faixa[0]}:${col}${faixa[1]}"


def q(nome):
    return f"'{nome}'"


def fonte(**kw):
    kw.setdefault('name', FONTE)
    kw.setdefault('size', 10)
    kw.setdefault('color', ESCURO)
    return Font(**kw)


def faixa_titulo(ws, titulo, subtitulo, ate_col, voltar=True):
    ws.sheet_view.showGridLines = False
    for c in range(1, ate_col + 1):
        for r in (1, 2):
            ws.cell(r, c).fill = PatternFill('solid', fgColor=VERDE_ESC)
    ws.row_dimensions[1].height = 34
    ws.row_dimensions[2].height = 20
    ws['B1'] = titulo
    ws['B1'].font = fonte(size=18, bold=True, color='FFFFFF')
    ws['B1'].alignment = Alignment(vertical='center')
    ws['B2'] = subtitulo
    ws['B2'].font = fonte(size=10, color=VERDE_CLARO)
    if voltar:
        ws['B3'] = '=HYPERLINK("#\'Painel\'!A1","← Voltar ao Painel")'
        ws['B3'].font = fonte(color=VERDE, bold=True, underline='single')
    ws.column_dimensions['A'].width = 2


def legenda(ws, celula):
    ws[celula] = 'Fundo amarelo-claro = você preenche · Fundo cinza = automático (não digite)'
    ws[celula].font = fonte(size=9, italic=True, color=CINZA_TXT)


def cabecalho(ws, linha, colunas):
    """colunas: lista de (letra, titulo, largura)."""
    ws.row_dimensions[linha].height = 30
    for letra, titulo, largura in colunas:
        c = ws[f'{letra}{linha}']
        c.value = titulo
        c.font = fonte(bold=True, color='FFFFFF', size=10)
        c.fill = PatternFill('solid', fgColor=VERDE)
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.border = BORDA_CEL
        ws.column_dimensions[letra].width = largura


def estilo_coluna(ws, letra, faixa, entrada, formato=None, alinhar=None):
    fill = PatternFill('solid', fgColor=ENTRADA if entrada else AUTO)
    for r in range(faixa[0], faixa[1] + 1):
        c = ws[f'{letra}{r}']
        c.fill = fill
        c.border = BORDA_CEL
        c.font = fonte()
        if formato:
            c.number_format = formato
        if alinhar:
            c.alignment = Alignment(horizontal=alinhar)


def lista(ws, ref, celulas, mensagem=None):
    dv = DataValidation(type='list', formula1=ref, allow_blank=True)
    if mensagem:
        dv.error, dv.errorTitle, dv.showErrorMessage = mensagem, 'Valor inválido', True
    ws.add_data_validation(dv)
    dv.add(celulas)


def proteger(ws):
    ws.protection = SheetProtection(sheet=True, formatCells=False, formatColumns=False, formatRows=False,
                                    selectLockedCells=False, selectUnlockedCells=False)


def destravar(ws, *celulas):
    from openpyxl.styles import Protection
    for ref in celulas:
        for linha in ws[ref] if ':' in ref else [[ws[ref]]]:
            for c in linha:
                c.protection = Protection(locked=False)


def enc(expr):
    """Codifica o texto para link do WhatsApp (espaços e acentos), só com SUBSTITUTE (funciona em qualquer Excel)."""
    trocas = [('%', '%25'), (' ', '%20'), ('&', '%26'), ('?', '%3F'), ('#', '%23'), ('+', '%2B'),
              ('á', '%C3%A1'), ('à', '%C3%A0'), ('â', '%C3%A2'), ('ã', '%C3%A3'), ('é', '%C3%A9'), ('ê', '%C3%AA'),
              ('í', '%C3%AD'), ('ó', '%C3%B3'), ('ô', '%C3%B4'), ('õ', '%C3%B5'), ('ú', '%C3%BA'), ('ç', '%C3%A7'),
              ('Á', '%C3%81'), ('Â', '%C3%82'), ('Ã', '%C3%83'), ('É', '%C3%89'), ('Ê', '%C3%8A'), ('Í', '%C3%8D'),
              ('Ó', '%C3%93'), ('Ô', '%C3%94'), ('Õ', '%C3%95'), ('Ú', '%C3%9A'), ('Ç', '%C3%87')]
    for de, para in trocas:
        expr = f'SUBSTITUTE({expr},"{de}","{para}")'
    return expr


def data_txt(d):
    """dd/mm/aaaa sem TEXT() de data (que depende do idioma do Excel)."""
    return f'TEXT(DAY({d}),"00")&"/"&TEXT(MONTH({d}),"00")&"/"&YEAR({d})'


wb = Workbook()

# ------------------------------------------------------------------ Listas (oculta)
ls = wb.active
ls.title = 'Listas'
ls['A1'] = 'Meses'
for i, m in enumerate(MESES, start=2):
    ls[f'A{i}'] = m
    ls[f'B{i}'] = MESES_CURTOS[i - 2]
col_lista = {}
for j, (chave, itens) in enumerate(LISTAS.items()):
    letra = L(3 + j)
    ls[f'{letra}1'] = chave
    for i, v in enumerate(itens, start=2):
        ls[f'{letra}{i}'] = v
    col_lista[chave] = f'Listas!${letra}$2:${letra}${len(itens) + 1}'
ls['J2'], ls['J3'], ls['J4'], ls['J5'] = 'Mês (nº)', 'Ano', 'Início do mês', 'Fim do mês'
ls['K2'] = "=MATCH(Painel!$D$6,Listas!$A$2:$A$13,0)"
ls['K3'] = '=Painel!$G$6'
ls['K4'] = '=DATE(K3,K2,1)'
ls['K5'] = '=EOMONTH(K4,0)'
ls['K4'].number_format = ls['K5'].number_format = F_DATA
ls.sheet_state = 'hidden'

# ------------------------------------------------------------------ Proprietários
pr = wb.create_sheet('Proprietários')
faixa_titulo(pr, 'Proprietários', 'Donos dos imóveis: aparecem no recibo e no relatório de Imposto de Renda', 7)
legenda(pr, 'B4')
cabecalho(pr, 5, [('B', 'Nome completo', 34), ('C', 'CPF / CNPJ', 20), ('D', 'Telefone', 18), ('E', 'Chave PIX', 30),
                  ('F', 'Banco / agência / conta', 30), ('G', 'Observações', 30)])
for letra in 'BCDEFG':
    estilo_coluna(pr, letra, PR, True)
pr.freeze_panes = 'B6'

# ------------------------------------------------------------------ Imóveis
im = wb.create_sheet('Imóveis')
faixa_titulo(im, 'Imóveis', 'Cadastre cada imóvel uma vez. O nome (identificação) não pode se repetir.', 14)
legenda(im, 'B4')
cabecalho(im, 5, [('B', 'Identificação (nome curto)', 26), ('C', 'Tipo', 16), ('D', 'Endereço (rua e nº)', 32), ('E', 'Bairro', 18),
                  ('F', 'Cidade', 18), ('G', 'UF', 6), ('H', 'CEP', 12), ('I', 'Proprietário', 26), ('J', 'Matrícula', 14),
                  ('K', 'IPTU anual', 13), ('L', 'Condomínio (mês)', 13), ('M', 'Situação', 12)])
for letra in 'BCDEFGHIJ':
    estilo_coluna(im, letra, IM, True)
estilo_coluna(im, 'K', IM, True, F_MOEDA)
estilo_coluna(im, 'L', IM, True, F_MOEDA)
estilo_coluna(im, 'M', IM, False, alinhar='center')
for r in range(IM[0], IM[1] + 1):
    im[f'M{r}'] = (f'=IF(B{r}="","",IF(COUNTIFS({rng("Contratos", "B", CT)},B{r},{rng("Contratos", "Q", CT)},"Ativo")>0,'
                   f'"Alugado","Vago"))')
lista(im, col_lista['tipos'], f'C{IM[0]}:C{IM[1]}')
lista(im, rng('Proprietários', 'B', PR), f'I{IM[0]}:I{IM[1]}', 'Escolha um proprietário cadastrado na aba Proprietários.')
dv = DataValidation(type='custom', formula1=f'COUNTIF($B${IM[0]}:$B${IM[1]},B{IM[0]})=1', showErrorMessage=True,
                    error='Já existe um imóvel com esse nome.', errorTitle='Nome repetido')
im.add_data_validation(dv)
dv.add(f'B{IM[0]}:B{IM[1]}')
im.freeze_panes = 'C6'

# ------------------------------------------------------------------ Inquilinos
iq = wb.create_sheet('Inquilinos')
faixa_titulo(iq, 'Inquilinos', 'WhatsApp: só números com DDD (ex.: 43999998888), para o link de cobrança funcionar.', 10)
legenda(iq, 'B4')
cabecalho(iq, 5, [('B', 'Nome completo', 32), ('C', 'CPF', 16), ('D', 'RG', 14), ('E', 'WhatsApp (só números com DDD)', 20),
                  ('F', 'E-mail', 28), ('G', 'Estado civil', 15), ('H', 'Profissão', 18), ('I', 'Observações', 30)])
for letra in 'BCDEFGHI':
    estilo_coluna(iq, letra, INQ, True)
lista(iq, col_lista['civil'], f'G{INQ[0]}:G{INQ[1]}')
iq.freeze_panes = 'C6'

# ------------------------------------------------------------------ Contratos
ct = wb.create_sheet('Contratos')
faixa_titulo(ct, 'Contratos', 'Um contrato por locação. Para encerrar, preencha a data de saída (o histórico continua).', 19)
legenda(ct, 'B4')
cabecalho(ct, 5, [('B', 'Imóvel', 24), ('C', 'Inquilino', 26), ('D', 'Início do contrato', 12), ('E', 'Prazo (meses)', 9),
                  ('F', 'Fim do contrato', 12), ('G', 'Valor do aluguel', 13), ('H', 'Dia do vencimento', 10),
                  ('I', 'Reajuste a cada (meses)', 10), ('J', 'Índice de reajuste', 14), ('K', 'Último reajuste (data)', 12),
                  ('L', 'Próximo reajuste', 12), ('M', 'Multa por atraso', 9), ('N', 'Juros ao mês', 9),
                  ('O', 'Data de saída (encerrou)', 12), ('P', 'Código do contrato (automático)', 34), ('Q', 'Situação', 11),
                  ('R', 'Aviso', 30)])
for letra, fmt in [('B', None), ('C', None), ('D', F_DATA), ('E', '0'), ('G', F_MOEDA), ('H', '0'), ('I', '0'), ('J', None),
                   ('K', F_DATA), ('M', F_PCT), ('N', F_PCT), ('O', F_DATA)]:
    estilo_coluna(ct, letra, CT, True, fmt)
for letra, fmt in [('F', F_DATA), ('L', F_DATA), ('P', None), ('Q', None), ('R', None)]:
    estilo_coluna(ct, letra, CT, False, fmt)
for r in range(CT[0], CT[1] + 1):
    ct[f'F{r}'] = f'=IF(OR(D{r}="",E{r}=""),"",EDATE(D{r},E{r})-1)'
    ct[f'L{r}'] = f'=IF(OR(D{r}="",I{r}=""),"",EDATE(IF(K{r}="",D{r},K{r}),I{r}))'
    ct[f'P{r}'] = f'=IF(OR(B{r}="",C{r}=""),"",B{r}&" | "&C{r})'
    ct[f'Q{r}'] = f'=IF(P{r}="","",IF(AND(O{r}<>"",O{r}<=TODAY()),"Encerrado","Ativo"))'
    ct[f'R{r}'] = (f'=IF(Q{r}<>"Ativo","",IF(AND(F{r}<>"",F{r}<TODAY()),"Contrato venceu: renove ou encerre",'
                   f'IF(AND(F{r}<>"",F{r}-TODAY()<=60),"Contrato termina em "&(F{r}-TODAY())&" dias",'
                   f'IF(AND(L{r}<>"",L{r}<=TODAY()),"Reajuste vencido ("&J{r}&")",'
                   f'IF(AND(L{r}<>"",L{r}-TODAY()<=60),"Reajuste em "&(L{r}-TODAY())&" dias ("&J{r}&")","")))))')
lista(ct, rng('Imóveis', 'B', IM), f'B{CT[0]}:B{CT[1]}', 'Escolha um imóvel cadastrado na aba Imóveis.')
lista(ct, rng('Inquilinos', 'B', INQ), f'C{CT[0]}:C{CT[1]}', 'Escolha um inquilino cadastrado na aba Inquilinos.')
lista(ct, col_lista['indices'], f'J{CT[0]}:J{CT[1]}')
dvd = DataValidation(type='whole', operator='between', formula1='1', formula2='31', showErrorMessage=True,
                     error='Informe um dia de 1 a 31.', errorTitle='Dia inválido')
ct.add_data_validation(dvd)
dvd.add(f'H{CT[0]}:H{CT[1]}')
ct.conditional_formatting.add(f'R{CT[0]}:R{CT[1]}', FormulaRule(formula=[f'LEN(R{CT[0]})>0'], fill=PatternFill('solid', fgColor='FEF3C7'),
                                                                  font=Font(name=FONTE, bold=True, color='B45309')))
ct.conditional_formatting.add(f'Q{CT[0]}:Q{CT[1]}', FormulaRule(formula=[f'Q{CT[0]}="Encerrado"'], font=Font(name=FONTE, color=CINZA_TXT)))
ct.freeze_panes = 'D6'

# ------------------------------------------------------------------ Pagamentos
pg = wb.create_sheet('Pagamentos')
faixa_titulo(pg, 'Pagamentos recebidos', 'Lance aqui cada aluguel recebido. O mês de referência é o mês do aluguel (ex.: 11/2026).', 13)
legenda(pg, 'B4')
cabecalho(pg, 5, [('B', 'Data do pagamento', 13), ('C', 'Contrato', 36), ('D', 'Mês de referência', 11), ('E', 'Aluguel recebido', 14),
                  ('F', 'Multa e juros recebidos', 13), ('G', 'Total recebido', 14), ('H', 'Forma', 13), ('I', 'Observação', 26),
                  ('J', 'Imóvel', 22), ('K', 'Inquilino', 24), ('L', 'Proprietário', 24)])
for letra, fmt in [('B', F_DATA), ('C', None), ('D', F_MES), ('E', F_MOEDA), ('F', F_MOEDA), ('H', None), ('I', None)]:
    estilo_coluna(pg, letra, PG, True, fmt)
for letra, fmt in [('G', F_MOEDA), ('J', None), ('K', None), ('L', None)]:
    estilo_coluna(pg, letra, PG, False, fmt)
for r in range(PG[0], PG[1] + 1):
    pg[f'G{r}'] = f'=IF(AND(E{r}="",F{r}=""),"",N(E{r})+N(F{r}))'
    pos = f'MATCH(C{r},{rng("Contratos", "P", CT)},0)'
    pg[f'J{r}'] = f'=IF(C{r}="","",IFERROR(INDEX({rng("Contratos", "B", CT)},{pos}),"?"))'
    pg[f'K{r}'] = f'=IF(C{r}="","",IFERROR(INDEX({rng("Contratos", "C", CT)},{pos}),"?"))'
    pg[f'L{r}'] = f'=IF(C{r}="","",IFERROR(INDEX({rng("Imóveis", "I", IM)},MATCH(J{r},{rng("Imóveis", "B", IM)},0)),""))'
lista(pg, rng('Contratos', 'P', CT), f'C{PG[0]}:C{PG[1]}', 'Escolha um contrato da aba Contratos.')
lista(pg, col_lista['formas'], f'H{PG[0]}:H{PG[1]}')
pg.freeze_panes = 'C6'

# ------------------------------------------------------------------ Despesas
dp = wb.create_sheet('Despesas')
faixa_titulo(dp, 'Despesas', 'IPTU, condomínio, manutenção… "Dedutível" = pode ser abatida no carnê-leão (confirme com o contador).', 10)
legenda(dp, 'B4')
cabecalho(dp, 5, [('B', 'Data', 12), ('C', 'Imóvel', 24), ('D', 'Categoria', 22), ('E', 'Descrição', 30), ('F', 'Valor', 13),
                  ('G', 'Dedutível no IR?', 11), ('H', 'Proprietário', 24)])
for letra, fmt in [('B', F_DATA), ('C', None), ('D', None), ('E', None), ('F', F_MOEDA), ('G', None)]:
    estilo_coluna(dp, letra, DP, True, fmt)
estilo_coluna(dp, 'H', DP, False)
for r in range(DP[0], DP[1] + 1):
    dp[f'H{r}'] = f'=IF(C{r}="","",IFERROR(INDEX({rng("Imóveis", "I", IM)},MATCH(C{r},{rng("Imóveis", "B", IM)},0)),""))'
lista(dp, rng('Imóveis', 'B', IM), f'C{DP[0]}:C{DP[1]}', 'Escolha um imóvel cadastrado na aba Imóveis.')
lista(dp, col_lista['categorias'], f'D{DP[0]}:D{DP[1]}')
lista(dp, col_lista['simnao'], f'G{DP[0]}:G{DP[1]}')
dp.freeze_panes = 'C6'

# ------------------------------------------------------------------ Aluguéis do Mês
am = wb.create_sheet('Aluguéis do Mês')
faixa_titulo(am, 'Aluguéis do mês', 'Automático: mostra cada contrato do mês escolhido no Painel, com situação, multa, juros e cobrança.', 14)
am['D3'] = '="Mês: "&INDEX(Listas!$A$2:$A$13,' + MES_N + ')&" de "&' + ANO
am['D3'].font = fonte(bold=True, size=12, color=VERDE_ESC)
am['H3'] = 'Para trocar o mês, use o seletor no Painel.'
am['H3'].font = fonte(size=9, italic=True, color=CINZA_TXT)
am['B5'] = 'Clique em "Cobrar" para abrir o WhatsApp com a mensagem pronta (escolha com ou sem multa e juros).'
am['B5'].font = fonte(size=9, italic=True, color=CINZA_TXT)
H = AM0 - 1
cabecalho(am, H, [('B', 'Imóvel', 22), ('C', 'Inquilino', 24), ('D', 'Vencimento', 12), ('E', 'Valor previsto', 13), ('F', 'Recebido', 13),
                  ('G', 'Data do pagamento', 12), ('H', 'Situação', 11), ('I', 'Dias de atraso', 8), ('J', 'Multa + juros hoje', 12),
                  ('K', 'Total com multa e juros', 13), ('L', 'WhatsApp (só aluguel)', 14), ('M', 'WhatsApp (com multa e juros)', 14)])
am.column_dimensions['A'].hidden = True
for letra in 'NOPQRSTU':
    am.column_dimensions[letra].hidden = True
n = CT[1] - CT[0] + 1
for i in range(n):
    r, c = AM0 + i, CT[0] + i
    C = lambda col: f"'Contratos'!${col}${c}"  # noqa: E731
    am[f'A{r}'] = f'=IF(AND({C("P")}<>"",{C("D")}<>"",{C("D")}<={FIM},OR({C("O")}="",{C("O")}>={INI})),1,0)'
    am[f'B{r}'] = f'=IF($A{r}=1,{C("B")},"")'
    am[f'C{r}'] = f'=IF($A{r}=1,{C("C")},"")'
    am[f'D{r}'] = f'=IF($A{r}=1,DATE({ANO},{MES_N},MIN(N({C("H")})+(N({C("H")})=0),DAY({FIM}))),"")'
    am[f'E{r}'] = f'=IF($A{r}=1,N({C("G")}),"")'
    soma = f'SUMIFS({rng("Pagamentos", "E", PG)},{rng("Pagamentos", "C", PG)},{C("P")},{rng("Pagamentos", "D", PG)},">="&{INI},{rng("Pagamentos", "D", PG)},"<="&{FIM})'
    am[f'F{r}'] = f'=IF($A{r}=1,{soma},"")'
    ultima = f'_xlfn.MAXIFS({rng("Pagamentos", "B", PG)},{rng("Pagamentos", "C", PG)},{C("P")},{rng("Pagamentos", "D", PG)},">="&{INI},{rng("Pagamentos", "D", PG)},"<="&{FIM})'
    am[f'G{r}'] = f'=IF($A{r}<>1,"",IF(F{r}>0,{ultima},""))'
    am[f'H{r}'] = f'=IF($A{r}<>1,"",IF(F{r}>=E{r},"Pago",IF(TODAY()>D{r},"Atrasado",IF(F{r}>0,"Parcial","Em aberto"))))'
    am[f'I{r}'] = f'=IF(H{r}="Atrasado",TODAY()-D{r},"")'
    falta = f'(E{r}-F{r})'
    am[f'J{r}'] = f'=IF(H{r}="Atrasado",ROUND({falta}*N({C("M")}),2)+ROUND({falta}*N({C("N")})/30*I{r},2),"")'
    am[f'K{r}'] = f'=IF(H{r}="Atrasado",{falta}+J{r},"")'
    # auxiliares ocultas: telefone, mensagens e links
    am[f'N{r}'] = (f'=IF($A{r}<>1,"",IFERROR(INDEX({rng("Inquilinos", "E", INQ)},MATCH(C{r},{rng("Inquilinos", "B", INQ)},0))&"",""))')
    nome = f'LEFT(C{r},FIND(" ",C{r}&" ")-1)'
    mesref = f'TEXT({MES_N},"00")&"/"&{ANO}'
    venc = data_txt(f'D{r}')
    verbo = f'IF(H{r}="Atrasado","venceu","vence")'
    base_msg = f'"Olá, "&{nome}&"! O aluguel de "&{mesref}'
    resto_sem = f'" de R$ "&FIXED({falta},2)&" "&{verbo}&" em "&{venc}&"."'
    resto_com = f'" de R$ "&FIXED({falta},2)&" venceu em "&{venc}&". Com multa e juros até hoje: R$ "&FIXED(K{r},2)&"."'
    am[f'O{r}'] = f'=IF(OR(H{r}="Atrasado",H{r}="Em aberto",H{r}="Parcial"),{base_msg}&" ("&LEFT(B{r},22)&")"&{resto_sem},"")'
    am[f'P{r}'] = f'=IF(H{r}="Atrasado",{base_msg}&" ("&LEFT(B{r},22)&")"&{resto_com},"")'
    url = lambda texto: f'"https://wa.me/"&IF(N{r}="","","55"&N{r})&"?text="&{enc(texto)}'  # noqa: E731
    # Links acima de 255 caracteres não funcionam no Excel: nesse caso a mensagem sai sem o nome do imóvel.
    curto_sem = f'IF(O{r}="","",{base_msg}&{resto_sem})'
    curto_com = f'IF(P{r}="","",{base_msg}&{resto_com})'
    am[f'Q{r}'] = f'=IF(O{r}="","",IF(LEN({url(f"O{r}")})<=255,{url(f"O{r}")},{url(curto_sem)}))'
    am[f'R{r}'] = f'=IF(P{r}="","",IF(LEN({url(f"P{r}")})<=255,{url(f"P{r}")},{url(curto_com)}))'
    am[f'S{r}'] = f'=IF($A{r}=1,MAX(0,E{r}-F{r}),0)'
    am[f'L{r}'] = f'=IF(Q{r}="","",HYPERLINK(Q{r},IF(H{r}="Em aberto","Lembrar","Cobrar")))'
    am[f'M{r}'] = f'=IF(R{r}="","",HYPERLINK(R{r},"Cobrar c/ juros"))'
    for letra, fmt in [('B', None), ('C', None), ('D', F_DATA), ('E', F_MOEDA), ('F', F_MOEDA), ('G', F_DATA), ('H', None),
                       ('I', '0'), ('J', F_MOEDA), ('K', F_MOEDA), ('L', None), ('M', None)]:
        cel = am[f'{letra}{r}']
        cel.font = fonte(color='15803D', bold=True, underline='single') if letra in 'LM' else fonte()
        cel.border = BORDA_CEL
        if fmt:
            cel.number_format = fmt
        if letra in 'HILM':
            cel.alignment = Alignment(horizontal='center')
fim_am = AM0 + n - 1
am.row_dimensions[H].height = 42
faixa_am = f'H{AM0}:H{fim_am}'
for texto, fundo, cor in [('Pago', 'DCFCE7', '15803D'), ('Atrasado', 'FEE2E2', 'B91C1C'), ('Em aberto', 'FEF3C7', 'B45309'), ('Parcial', 'FEF3C7', 'B45309')]:
    am.conditional_formatting.add(faixa_am, FormulaRule(formula=[f'H{AM0}="{texto}"'], fill=PatternFill('solid', fgColor=fundo),
                                                         font=Font(name=FONTE, bold=True, color=cor)))
am.conditional_formatting.add(f'J{AM0}:K{fim_am}', FormulaRule(formula=[f'$H{AM0}="Atrasado"'], font=Font(name=FONTE, bold=True, color='B91C1C')))
am.freeze_panes = f'D{AM0}'
proteger(am)

# ------------------------------------------------------------------ Painel
pn = wb.create_sheet('Painel', 0)
faixa_titulo(pn, 'CONTROLE DE ALUGUÉIS', 'Imóveis, inquilinos, contratos e recebimentos em um só lugar', 14, voltar=False)
for col, w in zip('BCDEFGHIJKLMN', [16, 16, 16, 4, 16, 16, 4, 16, 16, 4, 16, 16, 2]):
    pn.column_dimensions[col].width = w
# menu
menu = [('Aluguéis do mês', 'Aluguéis do Mês'), ('Pagamentos', 'Pagamentos'), ('Contratos', 'Contratos'), ('Imóveis', 'Imóveis'),
        ('Inquilinos', 'Inquilinos'), ('Proprietários', 'Proprietários'), ('Despesas', 'Despesas'), ('Relatório IR', 'Relatório IR'),
        ('Recibo', 'Recibo'), ('Como usar', 'Como usar')]
pn.row_dimensions[3].height = 24
menu_cells = ['B3', 'C3', 'D3', 'F3', 'G3', 'I3', 'J3', 'L3', 'M3']
for (rot, aba), ref in zip(menu[:9], menu_cells):
    pn[ref] = f'=HYPERLINK("#{q(aba)}!A1","{rot}")'
    pn[ref].font = fonte(bold=True, color=VERDE_ESC, underline='single', size=9)
    pn[ref].alignment = Alignment(horizontal='center', vertical='center')
    pn[ref].fill = PatternFill('solid', fgColor=VERDE_CLARO)
pn['B4'] = f'=HYPERLINK("#{q("Como usar")}!A1","❓ Primeira vez? Veja Como usar")'
pn['B4'].font = fonte(bold=True, color='B45309', underline='single', size=9)

pn['B6'] = 'Mês:'
pn['B6'].font = fonte(bold=True, size=12)
pn['B6'].alignment = Alignment(horizontal='right', vertical='center')
pn['D6'] = MESES[date.today().month - 1]
pn['F6'] = 'Ano:'
pn['F6'].font = fonte(bold=True, size=12)
pn['F6'].alignment = Alignment(horizontal='right', vertical='center')
pn['G6'] = date.today().year
for ref in ('D6', 'G6'):
    pn[ref].font = fonte(bold=True, size=13, color=VERDE_ESC)
    pn[ref].fill = PatternFill('solid', fgColor=ENTRADA)
    pn[ref].border = Border(left=Side('medium', color=VERDE), right=Side('medium', color=VERDE),
                            top=Side('medium', color=VERDE), bottom=Side('medium', color=VERDE))
    pn[ref].alignment = Alignment(horizontal='center', vertical='center')
pn.row_dimensions[6].height = 24
lista(pn, 'Listas!$A$2:$A$13', 'D6')
dva = DataValidation(type='whole', operator='between', formula1='2000', formula2='2100', showErrorMessage=True, error='Ano inválido.')
pn.add_data_validation(dva)
dva.add('G6')
pn['I6'] = '◀ escolha o mês e o ano aqui'
pn['I6'].font = fonte(size=9, italic=True, color=CINZA_TXT)

AMR = lambda col: f"{q('Aluguéis do Mês')}!${col}${AM0}:${col}${fim_am}"  # noqa: E731
despesas_mes = f'SUMIFS({rng("Despesas", "F", DP)},{rng("Despesas", "B", DP)},">="&{INI},{rng("Despesas", "B", DP)},"<="&{FIM})'
cards = [
    ('B8', 'PREVISTO NO MÊS', f'=SUM({AMR("E")})', f'=COUNTIF({AMR("A")},1)&" aluguel(éis)"', VERDE_ESC),
    ('E8', 'RECEBIDO', f'=SUM({AMR("F")})', f'=COUNTIF({AMR("H")},"Pago")&" pago(s)"', '15803D'),
    ('H8', 'FALTA RECEBER', f'=SUM({AMR("S")})', f'=COUNTIF({AMR("H")},"Em aberto")+COUNTIF({AMR("H")},"Parcial")&" em aberto"', 'B45309'),
    ('K8', 'ATRASADOS', f'=SUMIF({AMR("H")},"Atrasado",{AMR("S")})', f'=COUNTIF({AMR("H")},"Atrasado")&" atrasado(s)"', 'B91C1C'),
    ('B13', 'DESPESAS DO MÊS', f'={despesas_mes}', '="lançadas na aba Despesas"', '7C3AED'),
    ('E13', 'RESULTADO DO MÊS', f'=SUM({AMR("F")})-{despesas_mes}', '="recebido − despesas"', VERDE_ESC),
    ('H13', 'IMÓVEIS', f'=COUNTA({rng("Imóveis", "B", IM)})', f'=COUNTIF({rng("Imóveis", "M", IM)},"Alugado")&" alugado(s) · "&COUNTIF({rng("Imóveis", "M", IM)},"Vago")&" vago(s)"', '2563EB'),
    ('K13', 'AVISOS', f'=SUMPRODUCT(--(LEN({rng("Contratos", "R", CT)})>0))', '="reajuste / fim de contrato"', 'B45309'),
]
for ref, titulo, valor, detalhe, cor in cards:
    col, lin = ref[0], int(ref[1:])
    col2 = L(pn[ref].column + 1)
    for r in range(lin, lin + 4):
        for cc in (col, col2):
            cel = pn[f'{cc}{r}']
            cel.fill = PatternFill('solid', fgColor='FFFFFF')
            cel.border = Border(left=Side('thin', color=BORDA) if cc == col else None,
                                right=Side('thin', color=BORDA) if cc == col2 else None,
                                top=Side('thick', color=cor) if r == lin else None,
                                bottom=Side('thin', color=BORDA) if r == lin + 3 else None)
    pn.merge_cells(f'{col}{lin}:{col2}{lin}')
    pn.merge_cells(f'{col}{lin + 1}:{col2}{lin + 2}')
    pn.merge_cells(f'{col}{lin + 3}:{col2}{lin + 3}')
    pn[f'{col}{lin}'] = titulo
    pn[f'{col}{lin}'].font = fonte(size=9, bold=True, color=CINZA_TXT)
    pn[f'{col}{lin + 1}'] = valor
    pn[f'{col}{lin + 1}'].font = fonte(size=18, bold=True, color=cor)
    pn[f'{col}{lin + 1}'].number_format = '0' if titulo in ('IMÓVEIS', 'AVISOS') else F_MOEDA
    pn[f'{col}{lin + 1}'].alignment = Alignment(vertical='center')
    pn[f'{col}{lin + 3}'] = detalhe
    pn[f'{col}{lin + 3}'].font = fonte(size=9, color=CINZA_TXT)
for r in (8, 13):
    pn.row_dimensions[r].height = 18
pn['K17'] = f'=HYPERLINK("#{q("Contratos")}!R6","Ver avisos na aba Contratos →")'
pn['K17'].font = fonte(size=9, bold=True, color=VERDE, underline='single')
pn['B17'] = f'=HYPERLINK("#{q("Aluguéis do Mês")}!A1","Ver os aluguéis do mês e cobrar no WhatsApp →")'
pn['B17'].font = fonte(size=9, bold=True, color=VERDE, underline='single')

# Últimos 12 meses (tabela + gráfico)
pn['B19'] = 'ÚLTIMOS 12 MESES'
pn['B19'].font = fonte(bold=True, size=11, color=VERDE_ESC)
for letra, t in zip('BCD', ['Mês', 'Previsto', 'Recebido']):
    c = pn[f'{letra}20']
    c.value, c.font, c.fill, c.alignment = t, fonte(bold=True, color='FFFFFF', size=9), PatternFill('solid', fgColor=VERDE), Alignment(horizontal='center')
for k in range(12):
    r = 21 + k
    ini = f'EDATE({INI},{k - 11})'
    fim = f'EOMONTH({INI},{k - 11})'
    pn[f'B{r}'] = f'=INDEX(Listas!$B$2:$B$13,MONTH({ini}))&"/"&RIGHT(YEAR({ini}),2)'
    pn[f'C{r}'] = (f'=SUMPRODUCT(({rng("Contratos", "P", CT)}<>"")*({rng("Contratos", "D", CT)}<>"")*({rng("Contratos", "D", CT)}<={fim})'
                   f'*((({rng("Contratos", "O", CT)}="")+({rng("Contratos", "O", CT)}>={ini}))>0)*{rng("Contratos", "G", CT)})')
    pn[f'D{r}'] = f'=SUMIFS({rng("Pagamentos", "E", PG)},{rng("Pagamentos", "D", PG)},">="&{ini},{rng("Pagamentos", "D", PG)},"<="&{fim})'
    for letra in 'BCD':
        pn[f'{letra}{r}'].font = fonte(size=9)
        pn[f'{letra}{r}'].border = BORDA_CEL
    pn[f'C{r}'].number_format = pn[f'D{r}'].number_format = F_MOEDA
graf = BarChart()
graf.type = 'col'
graf.title = 'Previsto x recebido'
graf.y_axis.title = None
graf.add_data(Reference(pn, min_col=3, min_row=20, max_col=4, max_row=32), titles_from_data=True)
graf.set_categories(Reference(pn, min_col=2, min_row=21, max_row=32))
graf.height, graf.width = 7.5, 19
graf.roundedCorners = False
graf.legend.position = 'b'
graf.legend.overlay = False
graf.title.overlay = False
graf.x_axis.delete = False
graf.y_axis.delete = False
graf.y_axis.numFmt = '#,##0'
graf.y_axis.majorGridlines = None
from openpyxl.chart.shapes import GraphicalProperties  # noqa: E402
graf.series[0].graphicalProperties = GraphicalProperties(solidFill='CBD5E1')
graf.series[1].graphicalProperties = GraphicalProperties(solidFill=VERDE)
pn.add_chart(graf, 'F19')
pn['B34'] = 'Planilha Controle de Aluguéis · os dados que vêm preenchidos são EXEMPLOS: apague-os antes de usar (veja Como usar).'
pn['B34'].font = fonte(size=8, italic=True, color=CINZA_TXT)
destravar(pn, 'D6', 'G6')
proteger(pn)

# ------------------------------------------------------------------ Relatório IR
ir = wb.create_sheet('Relatório IR')
faixa_titulo(ir, 'Relatório para o Imposto de Renda', 'Pelo mês do PAGAMENTO (regime de caixa), como no carnê-leão. Confirme com o seu contador.', 10)
ir['B5'] = 'Ano:'
ir['C5'] = date.today().year
ir['E5'] = 'Proprietário (vazio = todos):'
ir['G5'] = None
for ref in ('B5', 'E5'):
    ir[ref].font = fonte(bold=True)
    ir[ref].alignment = Alignment(horizontal='right')
for ref in ('C5', 'G5'):
    ir[ref].fill = PatternFill('solid', fgColor=ENTRADA)
    ir[ref].border = Border(left=Side('medium', color=VERDE), right=Side('medium', color=VERDE), top=Side('medium', color=VERDE), bottom=Side('medium', color=VERDE))
    ir[ref].font = fonte(bold=True, color=VERDE_ESC)
ir.merge_cells('E5:F5')
ir.merge_cells('G5:H5')
lista(ir, rng('Proprietários', 'B', PR), 'G5')
cabecalho(ir, 7, [('B', 'Mês', 13), ('C', 'Aluguéis recebidos', 15), ('D', 'Multa e juros', 13), ('E', 'Total recebido', 15),
                  ('F', 'Despesas dedutíveis', 15), ('G', 'Base (recebido − dedutíveis)', 16), ('H', 'Todas as despesas', 15), ('I', 'Lucro do mês', 15)])
filtro_pg = f'(($G$5="")+({rng("Pagamentos", "L", PG)}=$G$5)>0)'
filtro_dp = f'(($G$5="")+({rng("Despesas", "H", DP)}=$G$5)>0)'
for m in range(12):
    r = 8 + m
    ini, fim = f'DATE($C$5,{m + 1},1)', f'EOMONTH(DATE($C$5,{m + 1},1),0)'
    nopg = f'({rng("Pagamentos", "B", PG)}>={ini})*({rng("Pagamentos", "B", PG)}<={fim})*{filtro_pg}'
    nodp = f'({rng("Despesas", "B", DP)}>={ini})*({rng("Despesas", "B", DP)}<={fim})*{filtro_dp}'
    ir[f'B{r}'] = MESES[m]
    ir[f'C{r}'] = f'=SUMPRODUCT({nopg}*{rng("Pagamentos", "E", PG)})'
    ir[f'D{r}'] = f'=SUMPRODUCT({nopg}*{rng("Pagamentos", "F", PG)})'
    ir[f'E{r}'] = f'=C{r}+D{r}'
    ir[f'F{r}'] = f'=SUMPRODUCT({nodp}*({rng("Despesas", "G", DP)}="Sim")*{rng("Despesas", "F", DP)})'
    ir[f'G{r}'] = f'=MAX(0,E{r}-F{r})'
    ir[f'H{r}'] = f'=SUMPRODUCT({nodp}*{rng("Despesas", "F", DP)})'
    ir[f'I{r}'] = f'=E{r}-H{r}'
    for letra in 'BCDEFGHI':
        ir[f'{letra}{r}'].font = fonte(bold=(letra == 'B'))
        ir[f'{letra}{r}'].border = BORDA_CEL
        if letra != 'B':
            ir[f'{letra}{r}'].number_format = F_MOEDA
ir['B20'] = 'TOTAL DO ANO'
for letra in 'CDEFGHI':
    ir[f'{letra}20'] = f'=SUM({letra}8:{letra}19)'
    ir[f'{letra}20'].number_format = F_MOEDA
for letra in 'BCDEFGHI':
    ir[f'{letra}20'].font = fonte(bold=True, color='FFFFFF')
    ir[f'{letra}20'].fill = PatternFill('solid', fgColor=VERDE_ESC)
    ir[f'{letra}20'].border = BORDA_CEL
ir['B22'] = 'RESULTADO POR IMÓVEL NO ANO'
ir['B22'].font = fonte(bold=True, size=11, color=VERDE_ESC)
cabecalho(ir, 23, [('B', 'Imóvel', 13), ('C', 'Recebido', 15), ('D', 'Despesas', 13), ('E', 'Lucro', 15)])
ir.column_dimensions['B'].width = 26
for i in range(IM[1] - IM[0] + 1):
    r, s = 24 + i, IM[0] + i
    ini, fim = 'DATE($C$5,1,1)', 'DATE($C$5,12,31)'
    nome = f"'Imóveis'!$B${s}"
    dono_ok = f"OR($G$5=\"\",'Imóveis'!$I${s}=$G$5)"
    ir[f'B{r}'] = f'=IF(AND({nome}<>"",{dono_ok}),{nome},"")'
    ir[f'C{r}'] = (f'=IF(B{r}="","",SUMIFS({rng("Pagamentos", "G", PG)},{rng("Pagamentos", "J", PG)},B{r},'
                   f'{rng("Pagamentos", "B", PG)},">="&{ini},{rng("Pagamentos", "B", PG)},"<="&{fim}))')
    ir[f'D{r}'] = (f'=IF(B{r}="","",SUMIFS({rng("Despesas", "F", DP)},{rng("Despesas", "C", DP)},B{r},'
                   f'{rng("Despesas", "B", DP)},">="&{ini},{rng("Despesas", "B", DP)},"<="&{fim}))')
    ir[f'E{r}'] = f'=IF(B{r}="","",C{r}-D{r})'
    for letra in 'CDE':
        ir[f'{letra}{r}'].number_format = F_MOEDA
    for letra in 'BCDE':
        ir[f'{letra}{r}'].font = fonte()
ir.conditional_formatting.add(f'B24:E{24 + IM[1] - IM[0]}', FormulaRule(formula=['$B24<>""'], border=BORDA_CEL))
ir['K7'] = 'Como usar no carnê-leão'
ir['K7'].font = fonte(bold=True, color=VERDE_ESC)
ir['K8'] = 'Base = total recebido no mês − despesas dedutíveis pagas no mês.'
ir['K9'] = 'Cada proprietário declara os próprios aluguéis: escolha o proprietário acima.'
ir['K10'] = 'Para salvar em PDF: Arquivo → Exportar → PDF (ou Imprimir → Salvar como PDF).'
for ref in ('K8', 'K9', 'K10'):
    ir[ref].font = fonte(size=9, color=CINZA_TXT)
ir.column_dimensions['K'].width = 60
destravar(ir, 'C5', 'G5')
proteger(ir)

# ------------------------------------------------------------------ Recibo
rc = wb.create_sheet('Recibo')
faixa_titulo(rc, 'Recibo de aluguel', 'Escolha o contrato e o mês. Depois: Arquivo → Imprimir (ou Exportar → PDF).', 9)
for col, w in zip('BCDEFGH', [16, 16, 16, 16, 16, 16, 2]):
    rc.column_dimensions[col].width = w
rc['B5'] = 'Contrato:'
rc['B6'] = 'Mês de referência:'
for ref in ('B5', 'B6'):
    rc[ref].font = fonte(bold=True)
    rc[ref].alignment = Alignment(horizontal='right')
rc.merge_cells('C5:F5')
rc['C6'].number_format = F_MES
for ref in ('C5', 'C6'):
    rc[ref].fill = PatternFill('solid', fgColor=ENTRADA)
    rc[ref].border = Border(left=Side('medium', color=VERDE), right=Side('medium', color=VERDE), top=Side('medium', color=VERDE), bottom=Side('medium', color=VERDE))
    rc[ref].font = fonte(bold=True, color=VERDE_ESC)
rc['D6'] = 'digite assim: 11/2026'
rc['D6'].font = fonte(size=9, italic=True, color=CINZA_TXT)
lista(rc, rng('Contratos', 'P', CT), 'C5')
# auxiliares (ocultas na coluna J)
aux = {
    'pos': f'=MATCH($C$5,{rng("Contratos", "P", CT)},0)',
    'imovel': f'=IFERROR(INDEX({rng("Contratos", "B", CT)},J2),"")',
    'inq': f'=IFERROR(INDEX({rng("Contratos", "C", CT)},J2),"")',
    'cpf': f'=IFERROR(INDEX({rng("Inquilinos", "C", INQ)},MATCH(J4,{rng("Inquilinos", "B", INQ)},0))&"","")',
    'ini': '=IF($C$6="","",DATE(YEAR($C$6),MONTH($C$6),1))',
    'fim': '=IF(J6="","",EOMONTH(J6,0))',
    'valor': f'=IF(J6="",0,SUMIFS({rng("Pagamentos", "G", PG)},{rng("Pagamentos", "C", PG)},$C$5,{rng("Pagamentos", "D", PG)},">="&J6,{rng("Pagamentos", "D", PG)},"<="&J7))',
    'data': f'=IF(J8=0,"",_xlfn.MAXIFS({rng("Pagamentos", "B", PG)},{rng("Pagamentos", "C", PG)},$C$5,{rng("Pagamentos", "D", PG)},">="&J6,{rng("Pagamentos", "D", PG)},"<="&J7))',
    'linha_im': f'=IFERROR(MATCH(J3,{rng("Imóveis", "B", IM)},0),0)',
    'end': f'=IF(J10=0,"",INDEX({rng("Imóveis", "D", IM)},J10)&" - "&INDEX({rng("Imóveis", "E", IM)},J10)&" - "&INDEX({rng("Imóveis", "F", IM)},J10)&"/"&INDEX({rng("Imóveis", "G", IM)},J10))',
    'cidade': f'=IF(J10=0,"",INDEX({rng("Imóveis", "F", IM)},J10)&"/"&INDEX({rng("Imóveis", "G", IM)},J10))',
    'dono': f'=IF(J10=0,"",INDEX({rng("Imóveis", "I", IM)},J10)&"")',
    'dono_doc': f'=IFERROR(INDEX({rng("Proprietários", "C", PR)},MATCH(J13,{rng("Proprietários", "B", PR)},0))&"","")',
}
for i, (k, f) in enumerate(aux.items(), start=2):
    rc[f'I{i}'] = k
    rc[f'J{i}'] = f
rc.column_dimensions['I'].hidden = True
rc.column_dimensions['J'].hidden = True
rc['J6'].number_format = rc['J7'].number_format = rc['J9'].number_format = F_DATA
# corpo do recibo
for r in range(9, 27):
    for col in 'BCDEFG':
        rc[f'{col}{r}'].fill = PatternFill('solid', fgColor='FFFFFF')
for col in 'BCDEFG':
    rc[f'{col}9'].border = Border(top=Side('medium', color=VERDE_ESC))
    rc[f'{col}26'].border = Border(bottom=Side('medium', color=VERDE_ESC))
rc.merge_cells('B10:G10')
rc['B10'] = 'RECIBO DE ALUGUEL'
rc['B10'].font = fonte(size=16, bold=True)
rc['B10'].alignment = Alignment(horizontal='center')
rc.merge_cells('B11:G11')
rc['B11'] = '=IF(J8=0,"","Valor: R$ "&FIXED(J8,2))'
rc['B11'].font = fonte(size=13, bold=True, color=VERDE_ESC)
rc['B11'].alignment = Alignment(horizontal='center')
rc.merge_cells('B13:G17')
rc['B13'] = ('=IF($C$5="","Escolha o contrato e o mês acima.",IF(J8=0,"Não há pagamento lançado para este contrato neste mês (aba Pagamentos).",'
             '"Recebi de "&UPPER(J4)&IF(J5="","",", CPF "&J5)&", a importância de R$ "&FIXED(J8,2)&", referente ao aluguel de "'
             '&TEXT(MONTH(J6),"00")&"/"&YEAR(J6)&" do imóvel situado à "&J11&", pago em "&' + data_txt('J9') +
             '&". Pelo que dou plena e geral quitação do valor acima."))')
rc['B13'].font = fonte(size=11)
rc['B13'].alignment = Alignment(wrap_text=True, vertical='top', horizontal='justify')
rc.merge_cells('B19:G19')
rc['B19'] = '=IF(J8=0,"",J12&", "&DAY(J9)&" de "&LOWER(INDEX(Listas!$A$2:$A$13,MONTH(J9)))&" de "&YEAR(J9)&".")'
rc['B19'].font = fonte(size=11)
rc.merge_cells('C23:F23')
rc['C23'].border = Border(top=Side('thin', color=ESCURO))
rc['C23'] = '=IF(J8=0,"",UPPER(J13))'
rc['C23'].font = fonte(bold=True)
rc['C23'].alignment = Alignment(horizontal='center')
rc.merge_cells('C24:F24')
rc['C24'] = '=IF(J8=0,"","Locador"&IF(J14="",""," — CPF/CNPJ "&J14))'
rc['C24'].font = fonte(size=9, color=CINZA_TXT)
rc['C24'].alignment = Alignment(horizontal='center')
for col in 'CDEF':
    rc[f'{col}23'].border = Border(top=Side('thin', color=ESCURO))
rc.print_area = 'B9:G26'
rc.page_setup.orientation = 'portrait'
rc.page_setup.fitToWidth = 1
rc.sheet_properties.pageSetUpPr.fitToPage = True
rc.print_options.horizontalCentered = True
destravar(rc, 'C5:F5', 'C6')
proteger(rc)

# ------------------------------------------------------------------ Como usar
cu = wb.create_sheet('Como usar', 1)
faixa_titulo(cu, 'Como usar', 'Siga a ordem abaixo na primeira vez. Depois, no dia a dia, use só Pagamentos e o Painel.', 5)
cu.column_dimensions['B'].width = 6
cu.column_dimensions['C'].width = 100
cu.column_dimensions['D'].width = 10
passos = [
    ('', 'ANTES DE COMEÇAR', None),
    ('!', 'A planilha vem com DADOS DE EXEMPLO (fictícios). Apague as linhas de exemplo em Proprietários, Imóveis, Inquilinos, '
          'Contratos, Pagamentos e Despesas — apague só o conteúdo das células amarelas, nunca as colunas cinzas.', None),
    ('!', 'Células com fundo AMARELO-CLARO são para você preencher. Células CINZAS são automáticas: não digite nelas.', None),
    ('', 'PRIMEIRA VEZ (nesta ordem)', None),
    ('1', 'Proprietários: cadastre os donos dos imóveis (nome, CPF e chave PIX).', 'Proprietários'),
    ('2', 'Imóveis: cadastre cada imóvel com um nome curto que não se repita (ex.: "Casa Rua das Flores") e escolha o proprietário.', 'Imóveis'),
    ('3', 'Inquilinos: cadastre os inquilinos. No WhatsApp, só números com DDD (ex.: 43999998888).', 'Inquilinos'),
    ('4', 'Contratos: escolha o imóvel e o inquilino, a data de início, o prazo, o valor, o dia do vencimento, o índice e a multa/juros. '
          'Multa e juros em porcentagem (ex.: 2% e 1%).', 'Contratos'),
    ('', 'NO DIA A DIA', None),
    ('5', 'Painel: escolha o mês e o ano para ver previsto, recebido, o que falta e os atrasados.', 'Painel'),
    ('6', 'Aluguéis do Mês: aparece sozinho cada contrato do mês, com a situação (Pago, Em aberto, Atrasado), a multa e os juros. '
          'Clique em "Cobrar" ou "Lembrar" para abrir o WhatsApp com a mensagem pronta — com ou sem multa e juros.', 'Aluguéis do Mês'),
    ('7', 'Pagamentos: quando receber, lance a data, escolha o contrato, o mês de referência (ex.: 11/2026) e o valor. '
          'Se cobrou multa e juros, lance na coluna própria.', 'Pagamentos'),
    ('8', 'Despesas: lance IPTU, condomínio, manutenção… e marque se é dedutível no Imposto de Renda.', 'Despesas'),
    ('9', 'Recibo: escolha o contrato e o mês e imprima ou salve em PDF.', 'Recibo'),
    ('10', 'Relatório IR: escolha o ano (e o proprietário, se quiser) para ver o carnê-leão mês a mês e o resultado por imóvel.', 'Relatório IR'),
    ('', 'BOM SABER', None),
    ('•', 'Encerrou uma locação? Na aba Contratos, preencha a "Data de saída". O histórico continua guardado.', None),
    ('•', 'Reajustou o aluguel? Altere o valor no contrato e preencha a data do "Último reajuste". Os pagamentos antigos não mudam '
          '(o "previsto" de meses anteriores passa a mostrar o valor novo).', None),
    ('•', 'Não troque o nome de um imóvel ou inquilino que já tem pagamentos lançados: os pagamentos são ligados ao nome do contrato.', None),
    ('•', 'Funciona no Excel (Windows e Mac), no Excel do celular e no Google Planilhas. Não tem macros.', None),
    ('•', 'Abas com fórmulas estão protegidas (sem senha) para não apagar nada sem querer: Revisar → Desproteger planilha.', None),
    ('•', 'Faça cópias de segurança do arquivo de vez em quando (salve uma cópia com a data no nome).', None),
    ('', 'QUER MAIS? Versão sistema online: no celular, com login, avisos automáticos, contrato de locação em PDF e documentos guardados.', None),
]
r = 5
for marca, texto, aba in passos:
    if marca == '':
        cu[f'B{r}'] = texto
        cu[f'B{r}'].font = fonte(bold=True, size=11, color=VERDE_ESC)
        if len(texto) > 60:
            cu.merge_cells(f'B{r}:D{r}')
            cu[f'B{r}'].alignment = Alignment(wrap_text=True, vertical='top')
            cu.row_dimensions[r].height = 32
        r += 1
        continue
    cu[f'B{r}'] = marca
    cu[f'B{r}'].font = fonte(bold=True, size=11, color='FFFFFF' if marca.isdigit() else 'B45309')
    if marca.isdigit():
        cu[f'B{r}'].fill = PatternFill('solid', fgColor=VERDE)
    cu[f'B{r}'].alignment = Alignment(horizontal='center', vertical='top')
    cu[f'C{r}'] = texto
    cu[f'C{r}'].font = fonte(size=10)
    if aba:
        cu[f'D{r}'] = f'=HYPERLINK("#{q(aba)}!A1","Abrir →")'
        cu[f'D{r}'].font = fonte(size=10, bold=True, color=VERDE, underline='single')
        cu[f'D{r}'].alignment = Alignment(vertical='top')
    cu[f'C{r}'].alignment = Alignment(wrap_text=True, vertical='top')
    cu.row_dimensions[r].height = 30 if len(texto) > 100 else 18
    r += 1

# ------------------------------------------------------------------ Dados de EXEMPLO
hoje = date.today()
pr['B6'], pr['C6'], pr['D6'], pr['E6'] = 'Proprietário Exemplo', '000.000.000-00', '(00) 00000-0000', 'CPF 000.000.000-00'
exemplos_im = [('Casa Exemplo', 'Casa', 'Rua Exemplo, 100', 'Centro', 'Cidade Exemplo', 'PR', '00000-000', 1200),
               ('Apto Exemplo', 'Apartamento', 'Avenida Exemplo, 200', 'Centro', 'Cidade Exemplo', 'PR', '00000-000', 900),
               ('Sala Exemplo', 'Sala comercial', 'Rua Exemplo B, 300', 'Centro', 'Cidade Exemplo', 'PR', '00000-000', 1500)]
for i, (nome, tipo, end, bai, cid, uf, cep, iptu) in enumerate(exemplos_im):
    r = 6 + i
    for col, v in zip('BCDEFGH', (nome, tipo, end, bai, cid, uf, cep)):
        im[f'{col}{r}'] = v
    im[f'I{r}'] = 'Proprietário Exemplo'
    im[f'J{r}'] = '00.000'
    im[f'K{r}'] = iptu
for i, nome in enumerate(['Inquilina Exemplo Ana', 'Inquilino Exemplo Bruno', 'Inquilina Exemplo Carla']):
    r = 6 + i
    iq[f'B{r}'], iq[f'C{r}'], iq[f'D{r}'], iq[f'E{r}'] = nome, '000.000.000-00', '0000000', ''
    iq[f'G{r}'], iq[f'H{r}'] = 'Solteiro(a)', 'Exemplo'


def mes_antes(n):
    y, m = hoje.year, hoje.month - n
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


contratos = [('Casa Exemplo', 'Inquilina Exemplo Ana', mes_antes(10), 30, 1500, 5),
             ('Apto Exemplo', 'Inquilino Exemplo Bruno', mes_antes(23), 30, 2200, 10),
             ('Sala Exemplo', 'Inquilina Exemplo Carla', mes_antes(4), 36, 3200, 30)]
for i, (imv, inq, ini, prazo, valor, dia) in enumerate(contratos):
    r = 6 + i
    ct[f'B{r}'], ct[f'C{r}'], ct[f'D{r}'], ct[f'E{r}'] = imv, inq, ini, prazo
    ct[f'G{r}'], ct[f'H{r}'], ct[f'I{r}'], ct[f'J{r}'] = valor, dia, 12, 'IPCA'
    ct[f'M{r}'], ct[f'N{r}'] = 0.02, 0.01
# pagamentos dos 3 meses anteriores + mês atual só para o primeiro contrato
lin = 6
for n in (3, 2, 1, 0):
    ref = mes_antes(n)
    for i, (imv, inq, ini, prazo, valor, dia) in enumerate(contratos):
        if n == 0 and i > 0:
            continue
        if ref < date(ini.year, ini.month, 1):
            continue
        pg[f'B{lin}'] = date(ref.year, ref.month, min(dia, 28))
        pg[f'C{lin}'] = f'{imv} | {inq}'
        pg[f'D{lin}'] = ref
        pg[f'E{lin}'] = valor
        pg[f'H{lin}'] = 'PIX'
        lin += 1
for i, (d, imv, cat, desc, val, ded) in enumerate([
        (mes_antes(2).replace(day=10), 'Casa Exemplo', 'IPTU', 'IPTU parcela', 120, 'Sim'),
        (mes_antes(1).replace(day=15), 'Apto Exemplo', 'Manutenção / reforma', 'Troca de torneira', 180, 'Não'),
        (mes_antes(0).replace(day=5), 'Sala Exemplo', 'Condomínio', 'Condomínio do mês', 450, 'Sim')]):
    r = 6 + i
    dp[f'B{r}'], dp[f'C{r}'], dp[f'D{r}'], dp[f'E{r}'], dp[f'F{r}'], dp[f'G{r}'] = d, imv, cat, desc, val, ded
rc['C5'] = 'Casa Exemplo | Inquilina Exemplo Ana'
rc['C6'] = mes_antes(1)

# ------------------------------------------------------------------ ordem e cores das abas
ordem = ['Painel', 'Como usar', 'Aluguéis do Mês', 'Pagamentos', 'Contratos', 'Imóveis', 'Inquilinos', 'Proprietários',
         'Despesas', 'Relatório IR', 'Recibo', 'Listas']
wb._sheets = [wb[n] for n in ordem]
cores = {'Painel': VERDE_ESC, 'Como usar': AMARELO, 'Aluguéis do Mês': VERDE, 'Pagamentos': VERDE, 'Relatório IR': '7C3AED',
         'Recibo': '7C3AED', 'Despesas': 'B91C1C'}
for ws in wb.worksheets:
    ws.sheet_properties.tabColor = cores.get(ws.title, '64748B')
wb.active = 0
wb.save(SAIDA)
print('ok', SAIDA)
