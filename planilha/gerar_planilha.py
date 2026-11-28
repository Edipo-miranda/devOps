"""Gera a planilha "Controle de Aluguéis" (Excel, só fórmulas, sem macros) com visual de sistema.

Uso:  python3 planilha/gerar_planilha.py   ->  planilha/Controle-de-Alugueis.xlsx
Os dados de exemplo são fictícios (CPF e telefone zerados) e devem ser apagados pelo cliente.
"""
from datetime import date
from pathlib import Path

from PIL import Image as PILImage, ImageDraw, ImageFont
from openpyxl import Workbook
from openpyxl.chart import BarChart, DoughnutChart, Reference
from openpyxl.chart.series import DataPoint
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.image import Image as XLImage
from openpyxl.formatting.rule import DataBarRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Protection, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.protection import SheetProtection

PASTA = Path(__file__).parent
SAIDA = PASTA / 'Controle-de-Alugueis.xlsx'
LOGO = PASTA / 'logo-planilha.png'
FONTE = 'Arial'

# ----------------------------------------------------------------- cores (as do sistema)
LATERAL = '0B1220'
VERDE_ESC, VERDE, VERDE_CLARO = '0F766E', '0D9488', 'CCFBF1'
FUNDO, BRANCO, ESCURO, SUAVE, BORDA = 'F3F5F9', 'FFFFFF', '0F172A', '64748B', 'E2E8F0'
AUTO, AUTO_TXT = 'F1F5F9', '475569'
VERMELHO, LARANJA, AZUL, ROXO, VERDE_OK = 'DC2626', 'D97706', '2563EB', '7C3AED', '059669'

fina = Side(style='thin', color=BORDA)
BORDA_CEL = Border(left=fina, right=fina, top=fina, bottom=fina)
F_DATA, F_MES, F_PCT = 'dd/mm/yyyy', 'mm/yyyy', '0.00%'
F_MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00;"-"'

# ----------------------------------------------------------------- faixas (cabeçalho na linha 7, dados a partir da 8)
CAB = 7
PR, IM, INQ, CT, PG, DP = (8, 57), (8, 107), (8, 207), (8, 107), (8, 3007), (8, 2007)
AM0 = 9  # Aluguéis do Mês: linha 9 espelha Contratos linha 8

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
MENU = [('📊  Painel', 'Painel'), ('📅  Aluguéis do mês', 'Aluguéis do Mês'), ('⚠️  Em aberto', 'Em aberto'),
        ('🧾  Extrato do inquilino', 'Extrato'), ('💰  Pagamentos', 'Pagamentos'), ('📄  Contratos', 'Contratos'),
        ('🏠  Imóveis', 'Imóveis'), ('👤  Inquilinos', 'Inquilinos'), ('🤝  Proprietários', 'Proprietários'),
        ('💸  Despesas', 'Despesas'), ('📈  Relatório IR', 'Relatório IR'), ('🖨️  Recibo', 'Recibo'), ('❓  Como usar', 'Como usar')]

# células auxiliares na aba Listas
MES_N, ANO, INI, FIM = 'Listas!$K$2', 'Listas!$K$3', 'Listas!$K$4', 'Listas!$K$5'


# ================================================================= utilidades
def q(nome):
    return f"'{nome}'"


def rng(aba, col, faixa):
    return f"{q(aba)}!${col}${faixa[0]}:${col}${faixa[1]}"


def fonte(**kw):
    kw.setdefault('name', FONTE)
    kw.setdefault('size', 10)
    kw.setdefault('color', ESCURO)
    return Font(**kw)


def preencher(ws, ref, cor):
    for linha in ws[ref]:
        for c in linha:
            c.fill = PatternFill('solid', fgColor=cor)


def caixa(ws, ref, cor_fundo=BRANCO, cor_borda=BORDA):
    """Fundo e contorno de um bloco (cartão)."""
    linhas = ws[ref]
    lado = Side('thin', color=cor_borda)
    for i, linha in enumerate(linhas):
        for j, c in enumerate(linha):
            c.fill = PatternFill('solid', fgColor=cor_fundo)
            c.border = Border(left=lado if j == 0 else None, right=lado if j == len(linha) - 1 else None,
                              top=lado if i == 0 else None, bottom=lado if i == len(linhas) - 1 else None)


def lista(ws, ref, celulas, mensagem=None):
    dv = DataValidation(type='list', formula1=ref, allow_blank=True)
    if mensagem:
        dv.error, dv.errorTitle, dv.showErrorMessage = mensagem, 'Valor inválido', True
    ws.add_data_validation(dv)
    dv.add(celulas)


def proteger(ws):
    ws.protection = SheetProtection(sheet=True, formatCells=False, formatColumns=False, formatRows=False)


def destravar(ws, *refs):
    for ref in refs:
        for linha in ws[ref] if ':' in ref else [[ws[ref]]]:
            for c in linha:
                c.protection = Protection(locked=False)


def seletor(ws, ref):
    c = ws[ref]
    c.font = fonte(bold=True, size=12, color=VERDE_ESC)
    c.fill = PatternFill('solid', fgColor=BRANCO)
    c.alignment = Alignment(horizontal='center', vertical='center')
    m = Side('medium', color=VERDE)
    c.border = Border(left=m, right=m, top=m, bottom=m)


def enc(expr):
    """Codifica texto para link do WhatsApp (espaços e acentos) só com SUBSTITUTE."""
    trocas = [('%', '%25'), (' ', '%20'), ('&', '%26'), ('?', '%3F'), ('#', '%23'), ('+', '%2B'),
              ('á', '%C3%A1'), ('à', '%C3%A0'), ('â', '%C3%A2'), ('ã', '%C3%A3'), ('é', '%C3%A9'), ('ê', '%C3%AA'),
              ('í', '%C3%AD'), ('ó', '%C3%B3'), ('ô', '%C3%B4'), ('õ', '%C3%B5'), ('ú', '%C3%BA'), ('ç', '%C3%A7'),
              ('Á', '%C3%81'), ('Â', '%C3%82'), ('Ã', '%C3%83'), ('É', '%C3%89'), ('Ê', '%C3%8A'), ('Í', '%C3%8D'),
              ('Ó', '%C3%93'), ('Ô', '%C3%94'), ('Õ', '%C3%95'), ('Ú', '%C3%9A'), ('Ç', '%C3%87')]
    for de, para in trocas:
        expr = f'SUBSTITUTE({expr},"{de}","{para}")'
    return expr


def link_whats(fone, texto, texto_curto):
    """URL do WhatsApp; se passar de 255 caracteres (limite do Excel), usa o texto curto."""
    base = f'"https://wa.me/"&IF({fone}="","","55"&{fone})&"?text="&'
    longo, curto = base + enc(texto), base + enc(texto_curto)
    return f'IF(LEN({longo})<=255,{longo},{curto})'


def data_txt(d):
    return f'TEXT(DAY({d}),"00")&"/"&TEXT(MONTH({d}),"00")&"/"&YEAR({d})'


def por_extenso(n):
    unid = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
            'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
    dez = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
    cen = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']
    if n == 100:
        return 'cem'
    partes = []
    if n >= 100:
        partes.append(cen[n // 100])
    r = n % 100
    if r >= 20:
        partes.append(dez[r // 10] + (f' e {unid[r % 10]}' if r % 10 else ''))
    elif r > 0 or n == 0:
        partes.append(unid[r])
    return ' e '.join(partes)


def gerar_logo():
    esc = 3
    w, h = 230 * esc, 56 * esc
    img = PILImage.new('RGB', (w, h), '#' + LATERAL)
    d = ImageDraw.Draw(img)
    s = 44 * esc
    y0 = (h - s) // 2
    d.rounded_rectangle([0, y0, s, y0 + s], radius=12 * esc, fill='#14B8A6')
    cx = s / 2
    casa = [(cx - 13 * esc, y0 + 21 * esc), (cx, y0 + 10 * esc), (cx + 13 * esc, y0 + 21 * esc), (cx + 13 * esc, y0 + 34 * esc),
            (cx + 4 * esc, y0 + 34 * esc), (cx + 4 * esc, y0 + 26 * esc), (cx - 4 * esc, y0 + 26 * esc), (cx - 4 * esc, y0 + 34 * esc),
            (cx - 13 * esc, y0 + 34 * esc)]
    d.polygon(casa, fill='white')
    fino = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Regular.otf', 15 * esc)
    forte = ImageFont.truetype('/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf', 19 * esc)
    d.text((s + 12 * esc, y0 + 2 * esc), 'Controle de', font=fino, fill='#CBD5E1')
    d.text((s + 12 * esc, y0 + 20 * esc), 'Aluguéis', font=forte, fill='white')
    img = img.resize((230, 56), PILImage.LANCZOS)
    img.save(LOGO)


def layout(ws, ativo, titulo, subtitulo, ultima_linha, ultima_col=20, cabecalhos=True):
    """Menu lateral, logotipo, fundo e título: deixa cada aba com cara de sistema."""
    ws.sheet_view.showGridLines = False
    ws.sheet_view.showRowColHeaders = cabecalhos
    ws.sheet_format.defaultRowHeight = 20
    ws.sheet_format.customHeight = True
    ws.column_dimensions['A'].width = 1.5
    ws.column_dimensions['B'].width = 27
    ws.column_dimensions['C'].width = 3
    for r in range(1, ultima_linha + 1):
        for col in ('A', 'B'):
            ws[f'{col}{r}'].fill = PatternFill('solid', fgColor=LATERAL)
        ws[f'C{r}'].fill = PatternFill('solid', fgColor=FUNDO)
    for r in range(1, min(ultima_linha, 70) + 1):
        for c in range(4, ultima_col + 1):
            ws.cell(r, c).fill = PatternFill('solid', fgColor=FUNDO)
    logo = XLImage(str(LOGO))
    logo.width, logo.height = 184, 45
    ws.add_image(logo, 'B2')
    ws.row_dimensions[2].height = 22
    ws.row_dimensions[3].height = 22
    ws['B6'] = 'MENU'
    ws['B6'].font = fonte(size=8, bold=True, color='475569')
    ws['B6'].alignment = Alignment(indent=1)
    for i, (rotulo, aba) in enumerate(MENU):
        c = ws[f'B{7 + i}']
        c.value = f'=HYPERLINK("#{q(aba)}!A1","{rotulo}")'
        ativo_ = aba == ativo
        c.font = fonte(size=10, bold=ativo_, color=BRANCO if ativo_ else 'CBD5E1')
        c.alignment = Alignment(vertical='center', indent=1)
        if ativo_:
            c.fill = PatternFill('solid', fgColor=VERDE)
    ws[f'B{8 + len(MENU)}'] = 'Planilha Controle de Aluguéis'
    ws[f'B{8 + len(MENU)}'].font = fonte(size=8, color='475569')
    ws[f'B{8 + len(MENU)}'].alignment = Alignment(indent=1)
    ws['D2'] = titulo
    ws['D2'].font = fonte(size=20, bold=True)
    ws['D2'].alignment = Alignment(vertical='center')
    ws['D3'] = subtitulo
    ws['D3'].font = fonte(size=10, color=SUAVE)


def legenda(ws, ref='D5'):
    ws[ref] = '☐ Branco = você preenche      ▣ Cinza = automático (não digite)'
    ws[ref].font = fonte(size=9, italic=True, color=SUAVE)


def cabecalho(ws, linha, colunas):
    ws.row_dimensions[linha].height = 34
    for letra, titulo, largura in colunas:
        c = ws[f'{letra}{linha}']
        c.value = titulo
        c.font = fonte(bold=True, color=BRANCO, size=9)
        c.fill = PatternFill('solid', fgColor=VERDE_ESC)
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.border = Border(left=Side('thin', color='115E59'), right=Side('thin', color='115E59'))
        ws.column_dimensions[letra].width = largura


def coluna(ws, letra, faixa, entrada, formato=None, alinhar=None):
    fill = PatternFill('solid', fgColor=BRANCO if entrada else AUTO)
    f = fonte() if entrada else fonte(color=AUTO_TXT)
    for r in range(faixa[0], faixa[1] + 1):
        c = ws[f'{letra}{r}']
        c.fill, c.border, c.font = fill, BORDA_CEL, f
        if formato:
            c.number_format = formato
        if alinhar:
            c.alignment = Alignment(horizontal=alinhar)


def status_cores(ws, faixa_ref, primeira):
    for texto, fundo, cor in [('Pago', 'DCFCE7', '15803D'), ('Atrasado', 'FEE2E2', 'B91C1C'), ('Em aberto', 'FEF3C7', 'B45309'),
                              ('Parcial', 'FEF3C7', 'B45309'), ('A vencer', 'E0F2FE', '0369A1')]:
        ws.conditional_formatting.add(faixa_ref, FormulaRule(formula=[f'{primeira}="{texto}"'], fill=PatternFill('solid', fgColor=fundo),
                                                              font=Font(name=FONTE, bold=True, color=cor)))


def icone(celula):
    return (f'IF({celula}="Pago","✅",IF({celula}="Atrasado","❌",IF({celula}="Em aberto","⏳",'
            f'IF({celula}="A vencer","⏳",IF({celula}="Parcial","🟡","")))))')


# ================================================================= início
gerar_logo()
wb = Workbook()
hoje = date.today()

# ----------------------------------------------------------------- Listas (oculta)
ls = wb.active
ls.title = 'Listas'
for i, m in enumerate(MESES, start=2):
    ls[f'A{i}'], ls[f'B{i}'] = m, MESES_CURTOS[i - 2]
col_lista = {}
for j, (chave, itens) in enumerate(LISTAS.items()):
    letra = 'CDEFGH'[j]
    ls[f'{letra}1'] = chave
    for i, v in enumerate(itens, start=2):
        ls[f'{letra}{i}'] = v
    col_lista[chave] = f'Listas!${letra}$2:${letra}${len(itens) + 1}'
ls['J2'], ls['J3'], ls['J4'], ls['J5'] = 'Mês (nº)', 'Ano', 'Início do mês', 'Fim do mês'
ls['K2'] = '=MATCH(Painel!$E$5,Listas!$A$2:$A$13,0)'
ls['K3'] = '=Painel!$H$5'
ls['K4'] = '=DATE(K3,K2,1)'
ls['K5'] = '=EOMONTH(K4,0)'
ls['K4'].number_format = ls['K5'].number_format = F_DATA
# por extenso de 0 a 999
for n in range(1000):
    ls[f'W{n + 1}'], ls[f'X{n + 1}'] = n, por_extenso(n)
ls.sheet_state = 'hidden'

# ----------------------------------------------------------------- Proprietários
pr = wb.create_sheet('Proprietários')
layout(pr, 'Proprietários', 'Proprietários', 'Donos dos imóveis: aparecem no recibo e no relatório de Imposto de Renda.', PR[1], 10)
legenda(pr)
cabecalho(pr, CAB, [('D', 'Nome completo', 34), ('E', 'CPF / CNPJ', 20), ('F', 'Telefone', 18), ('G', 'Chave PIX', 30),
                    ('H', 'Banco / agência / conta', 28), ('I', 'Observações', 30)])
for letra in 'DEFGHI':
    coluna(pr, letra, PR, True)
pr.freeze_panes = f'E{PR[0]}'

# ----------------------------------------------------------------- Imóveis
im = wb.create_sheet('Imóveis')
layout(im, 'Imóveis', 'Imóveis', 'Cadastre cada imóvel uma vez, com um nome curto que não se repita.', IM[1], 16)
legenda(im)
cabecalho(im, CAB, [('D', 'Identificação (nome curto)', 26), ('E', 'Tipo', 15), ('F', 'Endereço (rua e nº)', 30), ('G', 'Bairro', 16),
                    ('H', 'Cidade', 18), ('I', 'UF', 6), ('J', 'CEP', 11), ('K', 'Proprietário', 24), ('L', 'Matrícula', 12),
                    ('M', 'IPTU anual', 13), ('N', 'Condomínio (mês)', 13), ('O', 'Situação', 12)])
for letra in 'DEFGHIJKL':
    coluna(im, letra, IM, True)
coluna(im, 'M', IM, True, F_MOEDA)
coluna(im, 'N', IM, True, F_MOEDA)
coluna(im, 'O', IM, False, alinhar='center')
for r in range(IM[0], IM[1] + 1):
    im[f'O{r}'] = f'=IF(D{r}="","",IF(COUNTIFS({rng("Contratos", "D", CT)},D{r},{rng("Contratos", "S", CT)},"Ativo")>0,"Alugado","Vago"))'
im.conditional_formatting.add(f'O{IM[0]}:O{IM[1]}', FormulaRule(formula=[f'O{IM[0]}="Alugado"'], fill=PatternFill('solid', fgColor='DCFCE7'), font=Font(name=FONTE, bold=True, color='15803D')))
im.conditional_formatting.add(f'O{IM[0]}:O{IM[1]}', FormulaRule(formula=[f'O{IM[0]}="Vago"'], fill=PatternFill('solid', fgColor='FEF3C7'), font=Font(name=FONTE, bold=True, color='B45309')))
lista(im, col_lista['tipos'], f'E{IM[0]}:E{IM[1]}')
lista(im, rng('Proprietários', 'D', PR), f'K{IM[0]}:K{IM[1]}', 'Escolha um proprietário cadastrado na aba Proprietários.')
dv = DataValidation(type='custom', formula1=f'COUNTIF($D${IM[0]}:$D${IM[1]},D{IM[0]})=1', showErrorMessage=True,
                    error='Já existe um imóvel com esse nome.', errorTitle='Nome repetido')
im.add_data_validation(dv)
dv.add(f'D{IM[0]}:D{IM[1]}')
im.freeze_panes = f'E{IM[0]}'

# ----------------------------------------------------------------- Inquilinos
iq = wb.create_sheet('Inquilinos')
layout(iq, 'Inquilinos', 'Inquilinos', 'WhatsApp: só números com DDD (ex.: 43999998888), para os botões de cobrança funcionarem.', INQ[1], 12)
legenda(iq)
cabecalho(iq, CAB, [('D', 'Nome completo', 32), ('E', 'CPF', 16), ('F', 'RG', 14), ('G', 'WhatsApp (só números com DDD)', 20),
                    ('H', 'E-mail', 28), ('I', 'Estado civil', 15), ('J', 'Profissão', 18), ('K', 'Observações', 30)])
for letra in 'DEFGHIJK':
    coluna(iq, letra, INQ, True)
lista(iq, col_lista['civil'], f'I{INQ[0]}:I{INQ[1]}')
iq.freeze_panes = f'E{INQ[0]}'

# ----------------------------------------------------------------- Contratos
ct = wb.create_sheet('Contratos')
layout(ct, 'Contratos', 'Contratos', 'Um contrato por locação. Para encerrar, preencha a data de saída (o histórico continua).', CT[1], 22)
legenda(ct)
cabecalho(ct, CAB, [('D', 'Imóvel', 22), ('E', 'Inquilino', 24), ('F', 'Início do contrato', 11), ('G', 'Prazo (meses)', 8),
                    ('H', 'Fim do contrato', 11), ('I', 'Valor do aluguel', 12), ('J', 'Dia do venci-mento', 8),
                    ('K', 'Reajuste a cada (meses)', 9), ('L', 'Índice de reajuste', 13), ('M', 'Último reajuste (data)', 11),
                    ('N', 'Próximo reajuste', 11), ('O', 'Multa por atraso', 8), ('P', 'Juros ao mês', 8),
                    ('Q', 'Data de saída (encerrou)', 11), ('R', 'Código do contrato', 32), ('S', 'Situação', 10),
                    ('T', 'Aviso', 28), ('U', 'Saldo em aberto', 12)])
for letra, fmt in [('D', None), ('E', None), ('F', F_DATA), ('G', '0'), ('I', F_MOEDA), ('J', '0'), ('K', '0'), ('L', None),
                   ('M', F_DATA), ('O', F_PCT), ('P', F_PCT), ('Q', F_DATA)]:
    coluna(ct, letra, CT, True, fmt)
for letra, fmt in [('H', F_DATA), ('N', F_DATA), ('R', None), ('S', None), ('T', None), ('U', F_MOEDA)]:
    coluna(ct, letra, CT, False, fmt)
for letra in 'VWXYZ':
    ct.column_dimensions[letra].hidden = True
for r in range(CT[0], CT[1] + 1):
    ct[f'H{r}'] = f'=IF(OR(F{r}="",G{r}=""),"",EDATE(F{r},G{r})-1)'
    ct[f'N{r}'] = f'=IF(OR(F{r}="",K{r}=""),"",EDATE(IF(M{r}="",F{r},M{r}),K{r}))'
    ct[f'R{r}'] = f'=IF(OR(D{r}="",E{r}=""),"",D{r}&" | "&E{r})'
    ct[f'S{r}'] = f'=IF(R{r}="","",IF(AND(Q{r}<>"",Q{r}<=TODAY()),"Encerrado","Ativo"))'
    ct[f'T{r}'] = (f'=IF(S{r}<>"Ativo","",IF(AND(H{r}<>"",H{r}<TODAY()),"Contrato venceu: renove ou encerre",'
                   f'IF(AND(H{r}<>"",H{r}-TODAY()<=60),"Contrato termina em "&(H{r}-TODAY())&" dias",'
                   f'IF(AND(N{r}<>"",N{r}<=TODAY()),"Reajuste vencido ("&L{r}&")",'
                   f'IF(AND(N{r}<>"",N{r}-TODAY()<=60),"Reajuste em "&(N{r}-TODAY())&" dias ("&L{r}&")","")))))')
    # Saldo em aberto: vencimentos desde o início (ou o último reajuste) até hoje x valor, menos o que foi pago.
    base = f'IF(M{r}="",F{r},MAX(F{r},M{r}))'
    v1 = f'DATE(YEAR({base}),MONTH({base}),MIN(J{r},28))'
    ct[f'V{r}'] = f'=IF(OR(R{r}="",F{r}="",J{r}=""),"",IF({v1}<{base},EDATE({v1},1),{v1}))'
    fimc = f'IF(Q{r}="",TODAY(),MIN(Q{r},TODAY()))'
    ct[f'W{r}'] = (f'=IF(V{r}="","",IF({fimc}<=V{r},0,(YEAR({fimc})-YEAR(V{r}))*12+MONTH({fimc})-MONTH(V{r})'
                   f'+IF(DAY({fimc})>DAY(V{r}),1,0))*N(I{r}))')
    ct[f'X{r}'] = (f'=IF(V{r}="","",SUMIFS({rng("Pagamentos", "G", PG)},{rng("Pagamentos", "E", PG)},R{r},'
                   f'{rng("Pagamentos", "F", PG)},">="&DATE(YEAR(V{r}),MONTH(V{r}),1)))')
    ct[f'U{r}'] = f'=IF(V{r}="","",MAX(0,W{r}-X{r}))'
    ct[f'Y{r}'] = f'=IF(N(U{r})>0,U{r}+ROW()/1000000,"")'
    ct[f'Z{r}'] = f'=IF(T{r}<>"",ROW(),"")'
lista(ct, rng('Imóveis', 'D', IM), f'D{CT[0]}:D{CT[1]}', 'Escolha um imóvel cadastrado na aba Imóveis.')
lista(ct, rng('Inquilinos', 'D', INQ), f'E{CT[0]}:E{CT[1]}', 'Escolha um inquilino cadastrado na aba Inquilinos.')
lista(ct, col_lista['indices'], f'L{CT[0]}:L{CT[1]}')
dvd = DataValidation(type='whole', operator='between', formula1='1', formula2='31', showErrorMessage=True, error='Informe um dia de 1 a 31.')
ct.add_data_validation(dvd)
dvd.add(f'J{CT[0]}:J{CT[1]}')
ct.conditional_formatting.add(f'T{CT[0]}:T{CT[1]}', FormulaRule(formula=[f'LEN(T{CT[0]})>0'], fill=PatternFill('solid', fgColor='FEF3C7'),
                                                                  font=Font(name=FONTE, bold=True, color='B45309')))
ct.conditional_formatting.add(f'U{CT[0]}:U{CT[1]}', FormulaRule(formula=[f'N(U{CT[0]})>0'], font=Font(name=FONTE, bold=True, color='B91C1C')))
ct.conditional_formatting.add(f'S{CT[0]}:S{CT[1]}', FormulaRule(formula=[f'S{CT[0]}="Encerrado"'], font=Font(name=FONTE, color=SUAVE)))
ct.freeze_panes = f'F{CT[0]}'

# ----------------------------------------------------------------- Pagamentos
pg = wb.create_sheet('Pagamentos')
layout(pg, 'Pagamentos', 'Pagamentos recebidos', 'Lance cada aluguel recebido. Mês de referência = mês do aluguel (ex.: 11/2026).', PG[1], 16)
legenda(pg)
cabecalho(pg, CAB, [('D', 'Data do pagamento', 12), ('E', 'Contrato', 34), ('F', 'Mês de referência', 10), ('G', 'Aluguel recebido', 13),
                    ('H', 'Multa e juros recebidos', 12), ('I', 'Total recebido', 13), ('J', 'Forma', 12), ('K', 'Observação', 24),
                    ('L', 'Imóvel', 20), ('M', 'Inquilino', 22), ('N', 'Proprietário', 22), ('O', 'Conferência', 20)])
for letra, fmt in [('D', F_DATA), ('E', None), ('F', F_MES), ('G', F_MOEDA), ('H', F_MOEDA), ('J', None), ('K', None)]:
    coluna(pg, letra, PG, True, fmt)
for letra, fmt in [('I', F_MOEDA), ('L', None), ('M', None), ('N', None), ('O', None)]:
    coluna(pg, letra, PG, False, fmt)
for r in range(PG[0], PG[1] + 1):
    pg[f'I{r}'] = f'=IF(AND(G{r}="",H{r}=""),"",N(G{r})+N(H{r}))'
    pos = f'MATCH(E{r},{rng("Contratos", "R", CT)},0)'
    pg[f'L{r}'] = f'=IF(E{r}="","",IFERROR(INDEX({rng("Contratos", "D", CT)},{pos}),"?"))'
    pg[f'M{r}'] = f'=IF(E{r}="","",IFERROR(INDEX({rng("Contratos", "E", CT)},{pos}),"?"))'
    pg[f'N{r}'] = f'=IF(E{r}="","",IFERROR(INDEX({rng("Imóveis", "K", IM)},MATCH(L{r},{rng("Imóveis", "D", IM)},0)),""))'
    pg[f'O{r}'] = (f'=IF(OR(E{r}="",F{r}=""),"",IF(COUNTIFS($E${PG[0]}:$E${PG[1]},E{r},$F${PG[0]}:$F${PG[1]},F{r})>1,'
                   f'"⚠ Mês lançado 2 vezes","✓"))')
pg.conditional_formatting.add(f'O{PG[0]}:O{PG[1]}', FormulaRule(formula=[f'LEFT(O{PG[0]},1)="⚠"'], fill=PatternFill('solid', fgColor='FEE2E2'),
                                                                  font=Font(name=FONTE, bold=True, color='B91C1C')))
lista(pg, rng('Contratos', 'R', CT), f'E{PG[0]}:E{PG[1]}', 'Escolha um contrato da aba Contratos.')
lista(pg, col_lista['formas'], f'J{PG[0]}:J{PG[1]}')
pg.freeze_panes = f'E{PG[0]}'

# ----------------------------------------------------------------- Despesas
dp = wb.create_sheet('Despesas')
layout(dp, 'Despesas', 'Despesas', 'IPTU, condomínio, manutenção… "Dedutível" = pode ser abatida no carnê-leão (confirme com o contador).', DP[1], 12)
legenda(dp)
cabecalho(dp, CAB, [('D', 'Data', 12), ('E', 'Imóvel', 24), ('F', 'Categoria', 22), ('G', 'Descrição', 30), ('H', 'Valor', 13),
                    ('I', 'Dedutível no IR?', 11), ('J', 'Proprietário', 24)])
for letra, fmt in [('D', F_DATA), ('E', None), ('F', None), ('G', None), ('H', F_MOEDA), ('I', None)]:
    coluna(dp, letra, DP, True, fmt)
coluna(dp, 'J', DP, False)
for r in range(DP[0], DP[1] + 1):
    dp[f'J{r}'] = f'=IF(E{r}="","",IFERROR(INDEX({rng("Imóveis", "K", IM)},MATCH(E{r},{rng("Imóveis", "D", IM)},0)),""))'
lista(dp, rng('Imóveis', 'D', IM), f'E{DP[0]}:E{DP[1]}', 'Escolha um imóvel cadastrado na aba Imóveis.')
lista(dp, col_lista['categorias'], f'F{DP[0]}:F{DP[1]}')
lista(dp, col_lista['simnao'], f'I{DP[0]}:I{DP[1]}')
dp.freeze_panes = f'E{DP[0]}'

# ----------------------------------------------------------------- Aluguéis do Mês
am = wb.create_sheet('Aluguéis do Mês')
n_ct = CT[1] - CT[0] + 1
fim_am = AM0 + n_ct - 1
layout(am, 'Aluguéis do Mês', 'Aluguéis do mês', 'Automático: cada contrato do mês escolhido no Painel, com situação, multa, juros e cobrança.', fim_am, 17, cabecalhos=False)
am['D5'] = '="📅  "&INDEX(Listas!$A$2:$A$13,' + MES_N + ')&" de "&' + ANO
am['D5'].font = fonte(bold=True, size=13, color=VERDE_ESC)
am['H5'] = 'Para trocar o mês, use o seletor do Painel. Clique em "Cobrar" para abrir o WhatsApp com a mensagem pronta.'
am['H5'].font = fonte(size=9, italic=True, color=SUAVE)
cabecalho(am, AM0 - 1, [('D', 'Imóvel', 20), ('E', 'Inquilino', 22), ('F', 'Vencimento', 11), ('G', 'Valor previsto', 12),
                        ('H', 'Recebido', 12), ('I', 'Data do pagamento', 11), ('J', '', 4), ('K', 'Situação', 11),
                        ('L', 'Dias de atraso', 7), ('M', 'Multa + juros hoje', 11), ('N', 'Total com multa e juros', 12),
                        ('O', 'WhatsApp (só aluguel)', 13), ('P', 'WhatsApp (com multa e juros)', 14)])
am.row_dimensions[AM0 - 1].height = 44
for letra in 'RSTUVWXYZ':
    am.column_dimensions[letra].hidden = True
for i in range(n_ct):
    r, c = AM0 + i, CT[0] + i
    C = lambda col: f"{q('Contratos')}!${col}${c}"  # noqa: E731
    am[f'R{r}'] = f'=IF(AND({C("R")}<>"",{C("F")}<>"",{C("F")}<={FIM},OR({C("Q")}="",{C("Q")}>={INI})),1,0)'
    am[f'D{r}'] = f'=IF($R{r}=1,{C("D")},"")'
    am[f'E{r}'] = f'=IF($R{r}=1,{C("E")},"")'
    am[f'F{r}'] = f'=IF($R{r}=1,DATE({ANO},{MES_N},MIN(N({C("J")})+(N({C("J")})=0),DAY({FIM}))),"")'
    am[f'G{r}'] = f'=IF($R{r}=1,N({C("I")}),"")'
    soma = (f'SUMIFS({rng("Pagamentos", "G", PG)},{rng("Pagamentos", "E", PG)},{C("R")},{rng("Pagamentos", "F", PG)},">="&{INI},'
            f'{rng("Pagamentos", "F", PG)},"<="&{FIM})')
    am[f'H{r}'] = f'=IF($R{r}=1,{soma},"")'
    ultima = (f'_xlfn.MAXIFS({rng("Pagamentos", "D", PG)},{rng("Pagamentos", "E", PG)},{C("R")},{rng("Pagamentos", "F", PG)},">="&{INI},'
              f'{rng("Pagamentos", "F", PG)},"<="&{FIM})')
    am[f'I{r}'] = f'=IF($R{r}<>1,"",IF(H{r}>0,{ultima},""))'
    am[f'K{r}'] = f'=IF($R{r}<>1,"",IF(H{r}>=G{r},"Pago",IF(TODAY()>F{r},"Atrasado",IF(H{r}>0,"Parcial","Em aberto"))))'
    am[f'J{r}'] = f'={icone(f"K{r}")}'
    am[f'L{r}'] = f'=IF(K{r}="Atrasado",TODAY()-F{r},"")'
    falta = f'(G{r}-H{r})'
    am[f'M{r}'] = f'=IF(K{r}="Atrasado",ROUND({falta}*N({C("O")}),2)+ROUND({falta}*N({C("P")})/30*L{r},2),"")'
    am[f'N{r}'] = f'=IF(K{r}="Atrasado",{falta}+M{r},"")'
    am[f'S{r}'] = f'=IF($R{r}<>1,"",IFERROR(INDEX({rng("Inquilinos", "G", INQ)},MATCH(E{r},{rng("Inquilinos", "D", INQ)},0))&"",""))'
    nome = f'LEFT(E{r},FIND(" ",E{r}&" ")-1)'
    ini_msg = f'"Olá, "&{nome}&"! O aluguel de "&TEXT({MES_N},"00")&"/"&{ANO}'
    imovel = f'" ("&LEFT(D{r},22)&")"'
    venc = data_txt(f'F{r}')
    sem = f'" de R$ "&FIXED({falta},2)&" "&IF(K{r}="Atrasado","venceu","vence")&" em "&{venc}&"."'
    com = f'" de R$ "&FIXED({falta},2)&" venceu em "&{venc}&". Com multa e juros até hoje: R$ "&FIXED(N{r},2)&"."'
    am[f'T{r}'] = f'=IF(OR(K{r}="Atrasado",K{r}="Em aberto",K{r}="Parcial"),{link_whats(f"S{r}", ini_msg + "&" + imovel + "&" + sem, ini_msg + "&" + sem)},"")'
    am[f'U{r}'] = f'=IF(K{r}="Atrasado",{link_whats(f"S{r}", ini_msg + "&" + imovel + "&" + com, ini_msg + "&" + com)},"")'
    am[f'V{r}'] = f'=IF($R{r}=1,MAX(0,G{r}-H{r}),0)'
    am[f'O{r}'] = f'=IF(T{r}="","",HYPERLINK(T{r},IF(K{r}="Em aberto","💬 Lembrar","💬 Cobrar")))'
    am[f'P{r}'] = f'=IF(U{r}="","",HYPERLINK(U{r},"💬 c/ juros"))'
    for letra, fmt in [('D', None), ('E', None), ('F', F_DATA), ('G', F_MOEDA), ('H', F_MOEDA), ('I', F_DATA), ('J', None), ('K', None),
                       ('L', '0'), ('M', F_MOEDA), ('N', F_MOEDA), ('O', None), ('P', None)]:
        cel = am[f'{letra}{r}']
        cel.fill = PatternFill('solid', fgColor=BRANCO)
        cel.font = fonte(color='15803D', bold=True) if letra in 'OP' else fonte()
        cel.border = Border(bottom=fina)
        if fmt:
            cel.number_format = fmt
        if letra in 'JKLOP':
            cel.alignment = Alignment(horizontal='center')
status_cores(am, f'K{AM0}:K{fim_am}', f'K{AM0}')
am.conditional_formatting.add(f'M{AM0}:N{fim_am}', FormulaRule(formula=[f'$K{AM0}="Atrasado"'], font=Font(name=FONTE, bold=True, color='B91C1C')))
am.freeze_panes = f'D{AM0}'
proteger(am)

# ----------------------------------------------------------------- Em aberto (todos os meses)
ea = wb.create_sheet('Em aberto')
E0 = 9
fim_ea = E0 + n_ct - 1
layout(ea, 'Em aberto', 'Em aberto', 'Quem está devendo, somando TODOS os meses (desde o início do contrato ou do último reajuste).', fim_ea, 12, cabecalhos=False)
ea['D5'] = f'="Total em aberto: R$ "&FIXED(SUM({rng("Contratos", "U", CT)}),2)&"   ·   "&COUNTIF({rng("Contratos", "U", CT)},">0")&" contrato(s)"'
ea['D5'].font = fonte(bold=True, size=13, color='B91C1C')
cabecalho(ea, E0 - 1, [('D', 'Inquilino', 26), ('E', 'Imóvel', 22), ('F', 'Valor do aluguel', 13), ('G', 'Meses em aberto (aprox.)', 11),
                       ('H', 'Saldo em aberto', 16), ('I', 'Cobrar o total', 14)])
ea.row_dimensions[E0 - 1].height = 40
for letra in 'RST':
    ea.column_dimensions[letra].hidden = True
for k in range(n_ct):
    r = E0 + k
    ea[f'R{r}'] = f'=IFERROR(MATCH(LARGE({rng("Contratos", "Y", CT)},{k + 1}),{rng("Contratos", "Y", CT)},0),"")'
    pega = lambda col: f'IF($R{r}="","",INDEX({rng("Contratos", col, CT)},$R{r}))'  # noqa: E731
    ea[f'D{r}'] = f'={pega("E")}'
    ea[f'E{r}'] = f'={pega("D")}'
    ea[f'F{r}'] = f'={pega("I")}'
    ea[f'H{r}'] = f'={pega("U")}'
    ea[f'G{r}'] = f'=IF(OR($R{r}="",N(F{r})=0),"",ROUNDUP(H{r}/F{r},0))'
    ea[f'S{r}'] = f'=IF($R{r}="","",IFERROR(INDEX({rng("Inquilinos", "G", INQ)},MATCH(D{r},{rng("Inquilinos", "D", INQ)},0))&"",""))'
    nome = f'LEFT(D{r},FIND(" ",D{r}&" ")-1)'
    longo = f'"Olá, "&{nome}&"! Consta em aberto o valor de R$ "&FIXED(H{r},2)&" de aluguel do imóvel "&LEFT(E{r},22)&". Podemos combinar o pagamento?"'
    curto = f'"Olá, "&{nome}&"! Consta em aberto o valor de R$ "&FIXED(H{r},2)&" de aluguel. Podemos combinar o pagamento?"'
    ea[f'T{r}'] = f'=IF($R{r}="","",{link_whats(f"S{r}", longo, curto)})'
    ea[f'I{r}'] = f'=IF(T{r}="","",HYPERLINK(T{r},"💬 Cobrar"))'
    for letra, fmt in [('D', None), ('E', None), ('F', F_MOEDA), ('G', '0'), ('H', F_MOEDA), ('I', None)]:
        cel = ea[f'{letra}{r}']
        cel.fill = PatternFill('solid', fgColor=BRANCO)
        cel.border = Border(bottom=fina)
        cel.font = fonte(bold=True, color='15803D') if letra == 'I' else fonte(bold=(letra in 'DH'), color='B91C1C' if letra == 'H' else ESCURO)
        if fmt:
            cel.number_format = fmt
        if letra in 'GI':
            cel.alignment = Alignment(horizontal='center')
ea.conditional_formatting.add(f'H{E0}:H{fim_ea}', DataBarRule(start_type='num', start_value=0, end_type='max', color='F87171', showValue=True))
proteger(ea)

# ----------------------------------------------------------------- Extrato do inquilino
ex = wb.create_sheet('Extrato')
layout(ex, 'Extrato', 'Extrato do inquilino', 'Escolha o contrato e o ano para ver mês a mês o que foi pago e o que está em aberto.', 40, 12, cabecalhos=False)
ex['D5'], ex['D6'] = 'Contrato:', 'Ano:'
for ref in ('D5', 'D6'):
    ex[ref].font = fonte(bold=True)
    ex[ref].alignment = Alignment(horizontal='right', vertical='center')
ex.merge_cells('E5:H5')
seletor(ex, 'E5')
seletor(ex, 'E6')
lista(ex, rng('Contratos', 'R', CT), 'E5', 'Escolha um contrato da aba Contratos.')
ex['E6'] = hoje.year
for col, w in zip('DEFGHIJ', [16, 13, 13, 13, 13, 5, 12]):
    ex.column_dimensions[col].width = w
for letra in 'RS':
    ex.column_dimensions[letra].hidden = True
ex['R1'] = f'=IFERROR(MATCH($E$5,{rng("Contratos", "R", CT)},0),"")'
P = lambda col: f'IF($R$1="","",INDEX({rng("Contratos", col, CT)},$R$1))'  # noqa: E731
caixa(ex, 'D8:J12')
info = [('D8', 'INQUILINO', f'={P("E")}', 'D9'), ('G8', 'IMÓVEL', f'={P("D")}', 'G9'),
        ('D10', 'ALUGUEL', f'={P("I")}', 'D11'), ('F10', 'VENCIMENTO', f'=IF($R$1="","","Todo dia "&{P("J")})', 'F11'),
        ('H10', 'SALDO EM ABERTO (TOTAL)', f'={P("U")}', 'H11')]
for rot_ref, rot, valor, val_ref in info:
    ex[rot_ref] = rot
    ex[rot_ref].font = fonte(size=8, bold=True, color=SUAVE)
    ex[val_ref] = valor
    ex[val_ref].font = fonte(size=12, bold=True, color='B91C1C' if 'SALDO' in rot else ESCURO)
ex['D11'].number_format = ex['H11'].number_format = F_MOEDA
cabecalho(ex, 14, [('D', 'Mês', 16), ('E', 'Vencimento', 13), ('F', 'Valor previsto', 13), ('G', 'Pago', 13), ('H', 'Data do pagamento', 13),
                   ('I', '', 5), ('J', 'Situação', 12)])
for m in range(12):
    r = 15 + m
    ini, fim = f'DATE($E$6,{m + 1},1)', f'EOMONTH(DATE($E$6,{m + 1},1),0)'
    ativo = f'AND($R$1<>"",{P("F")}<>"",{P("F")}<={fim},OR({P("Q")}="",{P("Q")}>={ini}))'
    ex[f'S{r}'] = f'=IF({ativo},1,0)'
    ex[f'D{r}'] = MESES[m]
    ex[f'E{r}'] = f'=IF(S{r}=1,DATE($E$6,{m + 1},MIN({P("J")},DAY({fim}))),"")'
    ex[f'F{r}'] = f'=IF(S{r}=1,{P("I")},"")'
    ex[f'G{r}'] = (f'=IF($R$1="","",SUMIFS({rng("Pagamentos", "G", PG)},{rng("Pagamentos", "E", PG)},$E$5,{rng("Pagamentos", "F", PG)},">="&{ini},'
                   f'{rng("Pagamentos", "F", PG)},"<="&{fim}))')
    ex[f'H{r}'] = (f'=IF(N(G{r})=0,"",_xlfn.MAXIFS({rng("Pagamentos", "D", PG)},{rng("Pagamentos", "E", PG)},$E$5,{rng("Pagamentos", "F", PG)},">="&{ini},'
                   f'{rng("Pagamentos", "F", PG)},"<="&{fim}))')
    ex[f'J{r}'] = f'=IF(S{r}<>1,IF(N(G{r})>0,"Pago","—"),IF(G{r}>=F{r},"Pago",IF(TODAY()>E{r},"Atrasado",IF(G{r}>0,"Parcial","A vencer"))))'
    ex[f'I{r}'] = f'={icone(f"J{r}")}'
    for letra, fmt in [('D', None), ('E', F_DATA), ('F', F_MOEDA), ('G', F_MOEDA), ('H', F_DATA), ('I', None), ('J', None)]:
        cel = ex[f'{letra}{r}']
        cel.fill = PatternFill('solid', fgColor=BRANCO)
        cel.border = Border(bottom=fina)
        cel.font = fonte(bold=(letra == 'D'))
        if fmt:
            cel.number_format = fmt
        if letra in 'IJ':
            cel.alignment = Alignment(horizontal='center')
status_cores(ex, 'J15:J26', 'J15')
ex['D27'] = 'TOTAL DO ANO'
ex['F27'] = '=SUM(F15:F26)'
ex['G27'] = '=SUM(G15:G26)'
ex['H27'] = '=SUMIF(J15:J26,"Atrasado",F15:F26)-SUMIF(J15:J26,"Atrasado",G15:G26)'
ex['I27'] = 'em atraso'
for letra in 'DEFGHIJ':
    ex[f'{letra}27'].fill = PatternFill('solid', fgColor=VERDE_ESC)
    ex[f'{letra}27'].font = fonte(bold=True, color=BRANCO)
for ref in ('F27', 'G27', 'H27'):
    ex[ref].number_format = F_MOEDA
destravar(ex, 'E5:H5', 'E6')
proteger(ex)

# ----------------------------------------------------------------- Relatório IR
ir = wb.create_sheet('Relatório IR')
layout(ir, 'Relatório IR', 'Relatório para o Imposto de Renda', 'Pelo mês do PAGAMENTO (regime de caixa), como no carnê-leão. Confirme com o seu contador.', 135, 14, cabecalhos=False)
ir['D5'], ir['F5'] = 'Ano:', 'Proprietário (vazio = todos):'
for ref in ('D5', 'F5'):
    ir[ref].font = fonte(bold=True)
    ir[ref].alignment = Alignment(horizontal='right', vertical='center')
ir['E5'] = hoje.year
ir.merge_cells('F5:G5')
ir.merge_cells('H5:I5')
seletor(ir, 'E5')
seletor(ir, 'H5')
lista(ir, rng('Proprietários', 'D', PR), 'H5')
cabecalho(ir, 7, [('D', 'Mês', 13), ('E', 'Aluguéis recebidos', 14), ('F', 'Multa e juros', 12), ('G', 'Total recebido', 14),
                  ('H', 'Despesas dedutíveis', 14), ('I', 'Base (recebido − dedutíveis)', 15), ('J', 'Todas as despesas', 14), ('K', 'Lucro do mês', 14)])
filtro_pg = f'(($H$5="")+({rng("Pagamentos", "N", PG)}=$H$5)>0)'
filtro_dp = f'(($H$5="")+({rng("Despesas", "J", DP)}=$H$5)>0)'
for m in range(12):
    r = 8 + m
    ini, fim = f'DATE($E$5,{m + 1},1)', f'EOMONTH(DATE($E$5,{m + 1},1),0)'
    nopg = f'({rng("Pagamentos", "D", PG)}>={ini})*({rng("Pagamentos", "D", PG)}<={fim})*{filtro_pg}'
    nodp = f'({rng("Despesas", "D", DP)}>={ini})*({rng("Despesas", "D", DP)}<={fim})*{filtro_dp}'
    ir[f'D{r}'] = MESES[m]
    ir[f'E{r}'] = f'=SUMPRODUCT({nopg}*{rng("Pagamentos", "G", PG)})'
    ir[f'F{r}'] = f'=SUMPRODUCT({nopg}*{rng("Pagamentos", "H", PG)})'
    ir[f'G{r}'] = f'=E{r}+F{r}'
    ir[f'H{r}'] = f'=SUMPRODUCT({nodp}*({rng("Despesas", "I", DP)}="Sim")*{rng("Despesas", "H", DP)})'
    ir[f'I{r}'] = f'=MAX(0,G{r}-H{r})'
    ir[f'J{r}'] = f'=SUMPRODUCT({nodp}*{rng("Despesas", "H", DP)})'
    ir[f'K{r}'] = f'=G{r}-J{r}'
    for letra in 'DEFGHIJK':
        cel = ir[f'{letra}{r}']
        cel.fill = PatternFill('solid', fgColor=BRANCO)
        cel.border = Border(bottom=fina)
        cel.font = fonte(bold=(letra == 'D'))
        if letra != 'D':
            cel.number_format = F_MOEDA
ir['D20'] = 'TOTAL DO ANO'
for letra in 'EFGHIJK':
    ir[f'{letra}20'] = f'=SUM({letra}8:{letra}19)'
    ir[f'{letra}20'].number_format = F_MOEDA
for letra in 'DEFGHIJK':
    ir[f'{letra}20'].font = fonte(bold=True, color=BRANCO)
    ir[f'{letra}20'].fill = PatternFill('solid', fgColor=VERDE_ESC)
ir['D22'] = 'Resultado por imóvel no ano'
ir['D22'].font = fonte(bold=True, size=12)
cabecalho(ir, 23, [('D', 'Imóvel', 13), ('E', 'Recebido', 14), ('F', 'Despesas', 12), ('G', 'Lucro', 14)])
ir.column_dimensions['D'].width = 24
for i in range(IM[1] - IM[0] + 1):
    r, s = 24 + i, IM[0] + i
    nome, dono = f"{q('Imóveis')}!$D${s}", f"{q('Imóveis')}!$K${s}"
    ir[f'D{r}'] = f'=IF(AND({nome}<>"",OR($H$5="",{dono}=$H$5)),{nome},"")'
    ir[f'E{r}'] = (f'=IF(D{r}="","",SUMIFS({rng("Pagamentos", "I", PG)},{rng("Pagamentos", "L", PG)},D{r},{rng("Pagamentos", "D", PG)},">="&DATE($E$5,1,1),'
                   f'{rng("Pagamentos", "D", PG)},"<="&DATE($E$5,12,31)))')
    ir[f'F{r}'] = (f'=IF(D{r}="","",SUMIFS({rng("Despesas", "H", DP)},{rng("Despesas", "E", DP)},D{r},{rng("Despesas", "D", DP)},">="&DATE($E$5,1,1),'
                   f'{rng("Despesas", "D", DP)},"<="&DATE($E$5,12,31)))')
    ir[f'G{r}'] = f'=IF(D{r}="","",E{r}-F{r})'
    for letra in 'EFG':
        ir[f'{letra}{r}'].number_format = F_MOEDA
ir.conditional_formatting.add(f'D24:G{24 + IM[1] - IM[0]}', FormulaRule(formula=['$D24<>""'], fill=PatternFill('solid', fgColor=BRANCO), border=Border(bottom=fina)))
ir.conditional_formatting.add(f'G24:G{24 + IM[1] - IM[0]}', DataBarRule(start_type='num', start_value=0, end_type='max', color='5EEAD4', showValue=True))
ir['I22'] = 'Para o PDF do contador: Arquivo → Exportar → PDF (ou Imprimir → Salvar como PDF).'
ir['I22'].font = fonte(size=9, italic=True, color=SUAVE)
destravar(ir, 'E5', 'H5:I5')
proteger(ir)

# ----------------------------------------------------------------- Recibo
rc = wb.create_sheet('Recibo')
layout(rc, 'Recibo', 'Recibo de aluguel', 'Escolha o contrato e o mês. Depois: Arquivo → Imprimir (ou Exportar → PDF).', 32, 11, cabecalhos=False)
for col in 'DEFGHI':
    rc.column_dimensions[col].width = 17
rc['D5'], rc['D6'] = 'Contrato:', 'Mês de referência:'
for ref in ('D5', 'D6'):
    rc[ref].font = fonte(bold=True)
    rc[ref].alignment = Alignment(horizontal='right', vertical='center')
rc.merge_cells('E5:H5')
seletor(rc, 'E5')
seletor(rc, 'E6')
rc['E6'].number_format = F_MES
rc['F6'] = 'digite assim: 11/2026'
rc['F6'].font = fonte(size=9, italic=True, color=SUAVE)
lista(rc, rng('Contratos', 'R', CT), 'E5')
aux = {
    'pos': f'=MATCH($E$5,{rng("Contratos", "R", CT)},0)',
    'imovel': f'=IFERROR(INDEX({rng("Contratos", "D", CT)},S2),"")',
    'inq': f'=IFERROR(INDEX({rng("Contratos", "E", CT)},S2),"")',
    'cpf': f'=IFERROR(INDEX({rng("Inquilinos", "E", INQ)},MATCH(S4,{rng("Inquilinos", "D", INQ)},0))&"","")',
    'ini': '=IF($E$6="","",DATE(YEAR($E$6),MONTH($E$6),1))',
    'fim': '=IF(S6="","",EOMONTH(S6,0))',
    'valor': (f'=IF(S6="",0,SUMIFS({rng("Pagamentos", "I", PG)},{rng("Pagamentos", "E", PG)},$E$5,{rng("Pagamentos", "F", PG)},">="&S6,'
              f'{rng("Pagamentos", "F", PG)},"<="&S7))'),
    'data': (f'=IF(S8=0,"",_xlfn.MAXIFS({rng("Pagamentos", "D", PG)},{rng("Pagamentos", "E", PG)},$E$5,{rng("Pagamentos", "F", PG)},">="&S6,'
             f'{rng("Pagamentos", "F", PG)},"<="&S7))'),
    'linha_im': f'=IFERROR(MATCH(S3,{rng("Imóveis", "D", IM)},0),0)',
    'end': (f'=IF(S10=0,"",INDEX({rng("Imóveis", "F", IM)},S10)&" - "&INDEX({rng("Imóveis", "G", IM)},S10)&" - "'
            f'&INDEX({rng("Imóveis", "H", IM)},S10)&"/"&INDEX({rng("Imóveis", "I", IM)},S10))'),
    'cidade': f'=IF(S10=0,"",INDEX({rng("Imóveis", "H", IM)},S10)&"/"&INDEX({rng("Imóveis", "I", IM)},S10))',
    'dono': f'=IF(S10=0,"",INDEX({rng("Imóveis", "K", IM)},S10)&"")',
    'dono_doc': f'=IFERROR(INDEX({rng("Proprietários", "E", PR)},MATCH(S13,{rng("Proprietários", "D", PR)},0))&"","")',
    'inteiro': '=INT(ROUND(S8,2))',
    'centavos': '=ROUND((S8-S15)*100,0)',
    'milhares': '=INT(S15/1000)',
    'unidades': '=MOD(S15,1000)',
}
for i, (k, f) in enumerate(aux.items(), start=2):
    rc[f'R{i}'], rc[f'S{i}'] = k, f
pal = lambda ref: f'INDEX(Listas!$X$1:$X$1000,{ref}+1)'  # noqa: E731
rc['R20'] = 'extenso'
rc['S20'] = (f'=IF(S15>=1000000,"",IF(S15=0,"",IF(S17>0,IF(S17=1,"mil",{pal("S17")}&" mil"),"")'
             f'&IF(AND(S17>0,S18>0),IF(OR(S18<100,MOD(S18,100)=0)," e "," "),"")&IF(S18>0,{pal("S18")},"")'
             f'&IF(S15=1," real"," reais"))&IF(S16>0,IF(S15>0," e ","")&{pal("S16")}&IF(S16=1," centavo"," centavos"),""))')
for letra in 'RS':
    rc.column_dimensions[letra].hidden = True
rc['S6'].number_format = rc['S7'].number_format = rc['S9'].number_format = F_DATA
caixa(rc, 'D9:I28')
for col in 'DEFGHI':
    rc[f'{col}9'].border = Border(top=Side('thick', color=VERDE_ESC))
rc.merge_cells('D11:I11')
rc['D11'] = 'RECIBO DE ALUGUEL'
rc['D11'].font = fonte(size=18, bold=True)
rc['D11'].alignment = Alignment(horizontal='center')
rc.merge_cells('D12:I12')
rc['D12'] = '=IF(S8=0,"","Valor: R$ "&FIXED(S8,2))'
rc['D12'].font = fonte(size=13, bold=True, color=VERDE_ESC)
rc['D12'].alignment = Alignment(horizontal='center')
rc.merge_cells('E14:H19')
rc['E14'] = ('=IF($E$5="","Escolha o contrato e o mês acima.",IF(S8=0,"Não há pagamento lançado para este contrato neste mês (aba Pagamentos).",'
             '"Recebi de "&UPPER(S4)&IF(S5="","",", CPF "&S5)&", a importância de R$ "&FIXED(S8,2)&" ("&S20&"), referente ao aluguel de "'
             '&TEXT(MONTH(S6),"00")&"/"&YEAR(S6)&" do imóvel situado à "&S11&", pago em "&' + data_txt('S9') +
             '&". Pelo que dou plena e geral quitação do valor acima."))')
rc['E14'].font = fonte(size=11)
rc['E14'].alignment = Alignment(wrap_text=True, vertical='top', horizontal='justify')
rc.merge_cells('E21:H21')
rc['E21'] = '=IF(S8=0,"",S12&", "&DAY(S9)&" de "&LOWER(INDEX(Listas!$A$2:$A$13,MONTH(S9)))&" de "&YEAR(S9)&".")'
rc['E21'].font = fonte(size=11)
rc.merge_cells('E25:H25')
rc['E25'] = '=IF(S8=0,"",UPPER(S13))'
rc['E25'].font = fonte(bold=True)
rc['E25'].alignment = Alignment(horizontal='center')
for col in 'EFGH':
    rc[f'{col}25'].border = Border(top=Side('thin', color=ESCURO))
rc.merge_cells('E26:H26')
rc['E26'] = '=IF(S8=0,"","Locador"&IF(S14="",""," — CPF/CNPJ "&S14))'
rc['E26'].font = fonte(size=9, color=SUAVE)
rc['E26'].alignment = Alignment(horizontal='center')
rc.print_area = 'D9:I28'
rc.sheet_properties.pageSetUpPr.fitToPage = True
rc.page_setup.fitToWidth = 1
rc.print_options.horizontalCentered = True
destravar(rc, 'E5:H5', 'E6')
proteger(rc)

# ----------------------------------------------------------------- Painel (dashboard)
pn = wb.create_sheet('Painel', 0)
layout(pn, 'Painel', 'Painel', 'Resumo do mês escolhido, atrasos e avisos.', 48, 20, cabecalhos=False)
LARG = [12, 12, 12, 2, 12, 12, 12, 2, 12, 12, 12, 2, 12, 12, 12, 2]
for col, w in zip('DEFGHIJKLMNOPQRS', LARG):
    pn.column_dimensions[col].width = w
pn['D5'] = '📅  Período'
pn['D5'].font = fonte(bold=True, size=11)
pn['D5'].alignment = Alignment(vertical='center')
pn['E5'] = MESES[hoje.month - 1]
pn.merge_cells('E5:F5')
pn['H5'] = hoje.year
seletor(pn, 'E5')
seletor(pn, 'H5')
pn['G5'] = 'de'
pn['G5'].alignment = Alignment(horizontal='center', vertical='center')
pn['G5'].font = fonte(color=SUAVE)
pn.row_dimensions[5].height = 26
lista(pn, 'Listas!$A$2:$A$13', 'E5')
dva = DataValidation(type='whole', operator='between', formula1='2000', formula2='2100', showErrorMessage=True, error='Ano inválido.')
pn.add_data_validation(dva)
dva.add('H5')
pn['J5'] = '="Hoje: "&' + data_txt('TODAY()')
pn['J5'].font = fonte(size=9, color=SUAVE)
pn['J5'].alignment = Alignment(vertical='center')

AMR = lambda col: f"{q('Aluguéis do Mês')}!${col}${AM0}:${col}${fim_am}"  # noqa: E731
desp_mes = f'SUMIFS({rng("Despesas", "H", DP)},{rng("Despesas", "D", DP)},">="&{INI},{rng("Despesas", "D", DP)},"<="&{FIM})'
CARDS = [
    (7, 'D', '💵', 'PREVISTO NO MÊS', f'=SUM({AMR("G")})', f'=COUNTIF({AMR("R")},1)&" aluguel(éis) no mês"', VERDE_ESC, F_MOEDA),
    (7, 'H', '✅', 'RECEBIDO', f'=SUM({AMR("H")})', f'=COUNTIF({AMR("K")},"Pago")&" pago(s)"', VERDE_OK, F_MOEDA),
    (7, 'L', '⏳', 'FALTA RECEBER', f'=SUM({AMR("V")})', f'=COUNTIF({AMR("K")},"Em aberto")+COUNTIF({AMR("K")},"Parcial")&" a vencer"', LARANJA, F_MOEDA),
    (7, 'P', '❌', 'ATRASADOS NO MÊS', f'=SUMIF({AMR("K")},"Atrasado",{AMR("V")})', f'=COUNTIF({AMR("K")},"Atrasado")&" atrasado(s)"', VERMELHO, F_MOEDA),
    (13, 'D', '⚠️', 'EM ABERTO (TODOS OS MESES)', f'=SUM({rng("Contratos", "U", CT)})', f'=COUNTIF({rng("Contratos", "U", CT)},">0")&" contrato(s) devendo"', VERMELHO, F_MOEDA),
    (13, 'H', '💸', 'DESPESAS DO MÊS', f'={desp_mes}', '="lançadas na aba Despesas"', ROXO, F_MOEDA),
    (13, 'L', '📈', 'RESULTADO DO MÊS', f'=SUM({AMR("H")})-{desp_mes}', '="recebido − despesas"', VERDE_ESC, F_MOEDA),
    (13, 'P', '🏠', 'OCUPAÇÃO', f'=IFERROR(COUNTIF({rng("Imóveis", "O", IM)},"Alugado")/COUNTA({rng("Imóveis", "D", IM)}),0)',
     f'=COUNTIF({rng("Imóveis", "O", IM)},"Alugado")&" alugado(s) · "&COUNTIF({rng("Imóveis", "O", IM)},"Vago")&" vago(s)"', AZUL, '0%'),
]
for lin, col, ic, titulo, valor, detalhe, cor, fmt in CARDS:
    c0 = pn[f'{col}1'].column
    c1, c2 = pn.cell(1, c0 + 1).column_letter, pn.cell(1, c0 + 2).column_letter
    caixa(pn, f'{col}{lin + 1}:{c2}{lin + 4}')
    for cc in (col, c1, c2):  # faixa colorida no topo do cartão
        b = pn[f'{cc}{lin + 1}'].border
        pn[f'{cc}{lin + 1}'].border = Border(left=b.left, right=b.right, top=Side('thick', color=cor))
    pn[f'{col}{lin + 1}'] = ic
    pn[f'{col}{lin + 1}'].font = fonte(size=16)
    pn[f'{col}{lin + 1}'].alignment = Alignment(horizontal='center', vertical='center')
    pn.merge_cells(f'{c1}{lin + 1}:{c2}{lin + 1}')
    pn[f'{c1}{lin + 1}'] = titulo
    pn[f'{c1}{lin + 1}'].font = fonte(size=8, bold=True, color=SUAVE)
    pn[f'{c1}{lin + 1}'].alignment = Alignment(vertical='center', wrap_text=True)
    pn.merge_cells(f'{col}{lin + 2}:{c2}{lin + 3}')
    pn[f'{col}{lin + 2}'] = valor
    pn[f'{col}{lin + 2}'].font = fonte(size=20, bold=True, color=cor)
    pn[f'{col}{lin + 2}'].number_format = fmt
    pn[f'{col}{lin + 2}'].alignment = Alignment(horizontal='left', vertical='center', indent=1)
    pn.merge_cells(f'{col}{lin + 4}:{c2}{lin + 4}')
    pn[f'{col}{lin + 4}'] = detalhe
    pn[f'{col}{lin + 4}'].font = fonte(size=9, color=SUAVE)
    pn[f'{col}{lin + 4}'].alignment = Alignment(indent=1, vertical='top')
    pn.row_dimensions[lin + 1].height = 26

# dados dos gráficos e das listas (na aba Listas, oculta)
ls['M1'], ls['N1'], ls['O1'] = 'Mês', 'Previsto', 'Recebido'
for k in range(12):
    r = 2 + k
    ini, fim = f'EDATE({INI},{k - 11})', f'EOMONTH({INI},{k - 11})'
    ls[f'M{r}'] = f'=INDEX($B$2:$B$13,MONTH({ini}))&"/"&RIGHT(YEAR({ini}),2)'
    ls[f'N{r}'] = (f'=SUMPRODUCT(({rng("Contratos", "R", CT)}<>"")*({rng("Contratos", "F", CT)}<>"")*({rng("Contratos", "F", CT)}<={fim})'
                   f'*((({rng("Contratos", "Q", CT)}="")+({rng("Contratos", "Q", CT)}>={ini}))>0)*{rng("Contratos", "I", CT)})')
    ls[f'O{r}'] = f'=SUMIFS({rng("Pagamentos", "G", PG)},{rng("Pagamentos", "F", PG)},">="&{ini},{rng("Pagamentos", "F", PG)},"<="&{fim})'
ls['Q1'], ls['R1'] = 'Parte', 'Valor'
ls['Q2'], ls['R2'] = 'Recebido', f'=SUM({AMR("H")})'
ls['Q3'], ls['R3'] = 'Falta', f'=SUM({AMR("V")})'
for k in range(5):
    ls[f'T{2 + k}'] = f'=IFERROR(MATCH(LARGE({rng("Contratos", "Y", CT)},{k + 1}),{rng("Contratos", "Y", CT)},0),"")'
    ls[f'U{2 + k}'] = f'=IFERROR(MATCH(SMALL({rng("Contratos", "Z", CT)},{k + 1}),{rng("Contratos", "Z", CT)},0),"")'

for ref, texto in [('D19', 'Recebimento do mês'), ('H19', 'Últimos 12 meses: previsto x recebido')]:
    pn[ref] = texto
    pn[ref].font = fonte(bold=True, size=12)
caixa(pn, 'D20:F33')
caixa(pn, 'H20:R33')
rosca = DoughnutChart(holeSize=62)
rosca.add_data(Reference(ls, min_col=18, min_row=1, max_row=3), titles_from_data=True)
rosca.set_categories(Reference(ls, min_col=17, min_row=2, max_row=3))
serie = rosca.series[0]
serie.dPt = [DataPoint(idx=0), DataPoint(idx=1)]
serie.dPt[0].graphicalProperties = GraphicalProperties(solidFill=VERDE)
serie.dPt[1].graphicalProperties = GraphicalProperties(solidFill='E2E8F0')
rosca.title = None
rosca.legend.position = 'b'
rosca.legend.overlay = False
rosca.roundedCorners = False
rosca.height, rosca.width = 6.4, 6.6
rosca.visible_cells_only = False
pn.add_chart(rosca, 'D21')
pn.merge_cells('D33:F33')
pn['D33'] = f'=IFERROR(TEXT(SUM({AMR("H")})/SUM({AMR("G")}),"0%"),"0%")&" do previsto já entrou"'
pn['D33'].font = fonte(bold=True, color=VERDE_ESC)
pn['D33'].alignment = Alignment(horizontal='center')
barras = BarChart()
barras.type = 'col'
barras.add_data(Reference(ls, min_col=14, min_row=1, max_col=15, max_row=13), titles_from_data=True)
barras.set_categories(Reference(ls, min_col=13, min_row=2, max_row=13))
barras.series[0].graphicalProperties = GraphicalProperties(solidFill='CBD5E1')
barras.series[1].graphicalProperties = GraphicalProperties(solidFill=VERDE)
barras.title = None
barras.legend.position = 't'
barras.legend.overlay = False
barras.roundedCorners = False
barras.x_axis.delete = False
barras.y_axis.delete = False
barras.y_axis.numFmt = '#,##0'
barras.y_axis.majorGridlines = None
barras.gapWidth = 60
barras.height, barras.width = 6.8, 21.3
barras.visible_cells_only = False
pn.add_chart(barras, 'H21')

pn['D35'] = '⚠️  Maiores valores em aberto'
pn['L35'] = '🔔  Avisos de contratos'
for ref in ('D35', 'L35'):
    pn[ref].font = fonte(bold=True, size=12)
for ref, texto in [('D36', 'Inquilino'), ('G36', 'Imóvel'), ('I36', 'Em aberto'), ('L36', 'Inquilino'), ('O36', 'Aviso')]:
    pn[ref] = texto
for faixa in ('D36:J36', 'L36:R36'):
    for linha in pn[faixa]:
        for c in linha:
            c.fill = PatternFill('solid', fgColor=VERDE_ESC)
            c.font = fonte(bold=True, color=BRANCO, size=9)
            c.alignment = Alignment(vertical='center', indent=1)
pn.row_dimensions[36].height = 24
for k in range(5):
    r = 37 + k
    t, u = f'Listas!$T${2 + k}', f'Listas!$U${2 + k}'
    for faixa in (f'D{r}:F{r}', f'G{r}:H{r}', f'I{r}:J{r}', f'L{r}:N{r}', f'O{r}:R{r}'):
        pn.merge_cells(faixa)
    pn[f'D{r}'] = f'=IF({t}="",IF({k}=0,"Ninguém devendo 🎉",""),INDEX({rng("Contratos", "E", CT)},{t}))'
    pn[f'G{r}'] = f'=IF({t}="","",INDEX({rng("Contratos", "D", CT)},{t}))'
    pn[f'I{r}'] = f'=IF({t}="","",INDEX({rng("Contratos", "U", CT)},{t}))'
    pn[f'L{r}'] = f'=IF({u}="",IF({k}=0,"Nenhum aviso no momento",""),INDEX({rng("Contratos", "E", CT)},{u}))'
    pn[f'O{r}'] = f'=IF({u}="","",INDEX({rng("Contratos", "T", CT)},{u}))'
    pn[f'I{r}'].number_format = F_MOEDA
    for col in 'DEFGHIJLMNOPQR':
        pn[f'{col}{r}'].fill = PatternFill('solid', fgColor=BRANCO)
        pn[f'{col}{r}'].border = Border(bottom=fina)
    for ref, f in [(f'D{r}', fonte(bold=True)), (f'G{r}', fonte(color=SUAVE)), (f'I{r}', fonte(bold=True, color='B91C1C')),
                   (f'L{r}', fonte(bold=True)), (f'O{r}', fonte(bold=True, color='B45309'))]:
        pn[ref].font = f
        pn[ref].alignment = Alignment(vertical='center', indent=1)
pn['D42'] = f'=HYPERLINK("#{q("Em aberto")}!A1","Ver todos os valores em aberto →")'
pn['L42'] = f'=HYPERLINK("#{q("Contratos")}!T8","Ver os contratos →")'
for ref in ('D42', 'L42'):
    pn[ref].font = fonte(size=9, bold=True, color=VERDE, underline='single')
pn['D45'] = 'Os dados que vêm preenchidos são EXEMPLOS: apague-os antes de usar (veja ❓ Como usar).'
pn['D45'].font = fonte(size=8, italic=True, color=SUAVE)
destravar(pn, 'E5:F5', 'H5')
proteger(pn)

# ----------------------------------------------------------------- Como usar
cu = wb.create_sheet('Como usar', 1)
layout(cu, 'Como usar', 'Como usar', 'Na primeira vez, siga a ordem abaixo. No dia a dia, use Pagamentos e o Painel.', 45, 7, cabecalhos=False)
cu.column_dimensions['D'].width = 6
cu.column_dimensions['E'].width = 96
cu.column_dimensions['F'].width = 10
passos = [
    ('', 'ANTES DE COMEÇAR', None),
    ('!', 'A planilha vem com DADOS DE EXEMPLO (fictícios). Apague o conteúdo das células BRANCAS em Proprietários, Imóveis, Inquilinos, '
          'Contratos, Pagamentos e Despesas. Nunca apague as colunas CINZAS: elas são automáticas.', None),
    ('', 'PRIMEIRA VEZ (nesta ordem)', None),
    ('1', 'Proprietários: cadastre os donos dos imóveis (nome, CPF e chave PIX).', 'Proprietários'),
    ('2', 'Imóveis: cadastre cada imóvel com um nome curto que não se repita (ex.: "Casa Rua das Flores") e escolha o proprietário.', 'Imóveis'),
    ('3', 'Inquilinos: cadastre os inquilinos. No WhatsApp, só números com DDD (ex.: 43999998888).', 'Inquilinos'),
    ('4', 'Contratos: escolha o imóvel e o inquilino, a data de início, o prazo, o valor, o dia do vencimento, o índice e a multa/juros '
          '(em porcentagem, ex.: 2% e 1%).', 'Contratos'),
    ('', 'NO DIA A DIA', None),
    ('5', 'Painel: escolha o mês e o ano no topo para ver previsto, recebido, o que falta, atrasos e avisos.', 'Painel'),
    ('6', 'Aluguéis do mês: cada contrato aparece sozinho com a situação. Clique em "Cobrar" (só aluguel) ou "c/ juros" para abrir o '
          'WhatsApp com a mensagem pronta.', 'Aluguéis do Mês'),
    ('7', 'Pagamentos: ao receber, lance a data, escolha o contrato, o mês de referência (ex.: 11/2026) e o valor. Multa e juros vão em '
          'coluna própria. A coluna Conferência avisa se o mesmo mês foi lançado duas vezes.', 'Pagamentos'),
    ('8', 'Em aberto: quem está devendo somando todos os meses, com botão para cobrar o total.', 'Em aberto'),
    ('9', 'Extrato do inquilino: escolha o contrato e o ano e veja mês a mês o que foi pago.', 'Extrato'),
    ('10', 'Despesas: lance IPTU, condomínio, manutenção… e marque se é dedutível no Imposto de Renda.', 'Despesas'),
    ('11', 'Recibo: escolha o contrato e o mês e imprima ou salve em PDF (com o valor por extenso).', 'Recibo'),
    ('12', 'Relatório IR: escolha o ano (e o proprietário, se quiser) para ver o carnê-leão mês a mês e o resultado por imóvel.', 'Relatório IR'),
    ('', 'BOM SABER', None),
    ('•', 'Encerrou uma locação? Em Contratos, preencha a "Data de saída". O histórico continua guardado.', None),
    ('•', 'Reajustou o aluguel? Altere o valor no contrato e preencha a data do "Último reajuste". O saldo em aberto passa a contar a partir '
          'do reajuste, e o "previsto" de meses antigos passa a mostrar o valor novo (os pagamentos lançados não mudam).', None),
    ('•', 'Não troque o nome de um imóvel ou inquilino que já tem pagamentos: os pagamentos são ligados ao nome do contrato.', None),
    ('•', 'Funciona no Excel (Windows e Mac), no Excel do celular e no Google Planilhas, sem macros. No Google Planilhas, '
          'os links do menu lateral podem não funcionar: use as abas na parte de baixo da tela.', None),
    ('•', 'Abas automáticas estão protegidas (sem senha) para não apagar nada sem querer: Revisar → Desproteger planilha.', None),
    ('•', 'Faça cópias de segurança do arquivo de vez em quando (salve uma cópia com a data no nome).', None),
    ('', 'Quer no celular com login, avisos automáticos, contrato de locação em PDF e documentos guardados? Conheça a versão sistema online.', None),
]
r = 6
for marca, texto, aba in passos:
    if marca == '':
        cu.merge_cells(f'D{r}:F{r}')
        cu[f'D{r}'] = texto
        cu[f'D{r}'].font = fonte(bold=True, size=11, color=VERDE_ESC)
        cu[f'D{r}'].alignment = Alignment(wrap_text=True, vertical='center')
        cu.row_dimensions[r].height = 28
        r += 1
        continue
    caixa(cu, f'D{r}:F{r}')
    cu[f'D{r}'] = marca
    cu[f'D{r}'].font = fonte(bold=True, size=11, color=BRANCO if marca.isdigit() else 'B45309')
    if marca.isdigit():
        cu[f'D{r}'].fill = PatternFill('solid', fgColor=VERDE)
    cu[f'D{r}'].alignment = Alignment(horizontal='center', vertical='center')
    cu[f'E{r}'] = texto
    cu[f'E{r}'].font = fonte(size=10)
    cu[f'E{r}'].alignment = Alignment(wrap_text=True, vertical='center', indent=1)
    if aba:
        cu[f'F{r}'] = f'=HYPERLINK("#{q(aba)}!A1","Abrir →")'
        cu[f'F{r}'].font = fonte(size=10, bold=True, color=VERDE, underline='single')
        cu[f'F{r}'].alignment = Alignment(vertical='center')
    cu.row_dimensions[r].height = 34 if len(texto) > 95 else 22
    r += 1
proteger(cu)


# ================================================================= dados de EXEMPLO
def mes_antes(n):
    y, m = hoje.year, hoje.month - n
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


pr['D8'], pr['E8'], pr['F8'], pr['G8'] = 'Proprietário Exemplo', '000.000.000-00', '(00) 00000-0000', 'CPF 000.000.000-00'
for i, (nome, tipo, end, iptu) in enumerate([('Casa Exemplo', 'Casa', 'Rua Exemplo, 100', 1200), ('Apto Exemplo', 'Apartamento', 'Avenida Exemplo, 200', 900),
                                             ('Sala Exemplo', 'Sala comercial', 'Rua Exemplo B, 300', 1500), ('Kitnet Exemplo', 'Kitnet', 'Rua Exemplo C, 400', 400)]):
    r = 8 + i
    for col, v in zip('DEFGHIJKLM', (nome, tipo, end, 'Centro', 'Cidade Exemplo', 'PR', '00000-000', 'Proprietário Exemplo', '00.000', iptu)):
        im[f'{col}{r}'] = v
for i, nome in enumerate(['Inquilina Exemplo Ana', 'Inquilino Exemplo Bruno', 'Inquilina Exemplo Carla']):
    r = 8 + i
    iq[f'D{r}'], iq[f'E{r}'], iq[f'F{r}'], iq[f'I{r}'], iq[f'J{r}'] = nome, '000.000.000-00', '0000000', 'Solteiro(a)', 'Exemplo'
contratos = [('Casa Exemplo', 'Inquilina Exemplo Ana', mes_antes(10), 30, 1500, 5),
             ('Apto Exemplo', 'Inquilino Exemplo Bruno', mes_antes(23), 30, 2200, 10),
             ('Sala Exemplo', 'Inquilina Exemplo Carla', mes_antes(4), 36, 3200, 30)]
for i, (imv, inq, ini, prazo, valor, dia) in enumerate(contratos):
    r = 8 + i
    ct[f'D{r}'], ct[f'E{r}'], ct[f'F{r}'], ct[f'G{r}'] = imv, inq, ini, prazo
    ct[f'I{r}'], ct[f'J{r}'], ct[f'K{r}'], ct[f'L{r}'], ct[f'O{r}'], ct[f'P{r}'] = valor, dia, 12, 'IPCA', 0.02, 0.01
# Pagamentos: todos os meses desde o início, menos o mês passado do Bruno (fica em aberto) e o mês atual dos dois últimos.
lin = 8
for i, (imv, inq, ini, prazo, valor, dia) in enumerate(contratos):
    n = (hoje.year - ini.year) * 12 + hoje.month - ini.month
    for k in range(n, -1, -1):
        ref = mes_antes(k)
        if (k == 0 and i > 0) or (i == 1 and k == 1):
            continue
        prox = date(ref.year + (ref.month == 12), ref.month % 12 + 1, 1)
        ultimo = (prox - date.resolution).day
        pg[f'D{lin}'] = date(ref.year, ref.month, min(dia, ultimo))
        pg[f'E{lin}'] = f'{imv} | {inq}'
        pg[f'F{lin}'] = ref
        pg[f'G{lin}'] = valor
        pg[f'J{lin}'] = 'PIX'
        lin += 1
for i, (d, imv, cat, desc, val, ded) in enumerate([
        (mes_antes(2).replace(day=10), 'Casa Exemplo', 'IPTU', 'IPTU parcela', 120, 'Sim'),
        (mes_antes(1).replace(day=15), 'Apto Exemplo', 'Manutenção / reforma', 'Troca de torneira', 180, 'Não'),
        (mes_antes(0).replace(day=5), 'Sala Exemplo', 'Condomínio', 'Condomínio do mês', 450, 'Sim')]):
    r = 8 + i
    for col, v in zip('DEFGHI', (d, imv, cat, desc, val, ded)):
        dp[f'{col}{r}'] = v
rc['E5'] = 'Casa Exemplo | Inquilina Exemplo Ana'
rc['E6'] = mes_antes(1)
ex['E5'] = 'Apto Exemplo | Inquilino Exemplo Bruno'

# ================================================================= ordem, cores e gravação
ordem = ['Painel', 'Como usar', 'Aluguéis do Mês', 'Em aberto', 'Extrato', 'Pagamentos', 'Contratos', 'Imóveis', 'Inquilinos',
         'Proprietários', 'Despesas', 'Relatório IR', 'Recibo', 'Listas']
wb._sheets = [wb[n] for n in ordem]
cores = {'Painel': VERDE_ESC, 'Como usar': 'FACC15', 'Aluguéis do Mês': VERDE, 'Em aberto': VERMELHO, 'Extrato': VERDE,
         'Pagamentos': VERDE, 'Relatório IR': ROXO, 'Recibo': ROXO, 'Despesas': VERMELHO}
for ws in wb.worksheets:
    ws.sheet_properties.tabColor = cores.get(ws.title, '64748B')
    ws.sheet_view.zoomScale = 100
wb.active = 0
wb.save(SAIDA)
print('ok', SAIDA)
