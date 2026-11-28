"""Gera a planilha "Controle de Aluguéis" (Excel, só fórmulas, sem macros) com visual de sistema.

Uso:  python3 planilha/gerar_planilha.py           ->  planilha/Controle-de-Alugueis-EXEMPLO.xlsx
      python3 planilha/gerar_planilha.py --vazia   ->  planilha/Controle-de-Alugueis-EM-BRANCO.xlsx
Os dados de exemplo são fictícios (CPF e telefone zerados) e devem ser apagados pelo cliente.
"""
import sys
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
from openpyxl.utils import get_column_letter as L_

PASTA = Path(__file__).parent
VERSAO = '1.0'
VAZIA = '--vazia' in sys.argv  # versão em branco (sem dados de exemplo)
SAIDA = PASTA / ('Controle-de-Alugueis-EM-BRANCO.xlsx' if VAZIA else 'Controle-de-Alugueis-EXEMPLO.xlsx')
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
PR, IM, INQ, CT, PG, DP, RJ = (8, 57), (8, 107), (8, 207), (8, 107), (8, 3007), (8, 2007), (8, 507)
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
        ('🔁  Reajustes', 'Reajustes'), ('🧮  Calcular reajuste', 'Calcular reajuste'), ('📝  Gerar contrato', 'Gerar contrato'),
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


def valor_em(cod, data, vini, estrito=False):
    """Valor do aluguel vigente numa data: o do último reajuste até a data (aba Reajustes) ou o valor inicial."""
    op = '<' if estrito else '<='
    d0 = f'_xlfn.MAXIFS({rng("Reajustes", "D", RJ)},{rng("Reajustes", "E", RJ)},{cod},{rng("Reajustes", "D", RJ)},"{op}"&{data})'
    return f'IF({d0}=0,{vini},SUMIFS({rng("Reajustes", "H", RJ)},{rng("Reajustes", "E", RJ)},{cod},{rng("Reajustes", "D", RJ)},{d0}))'


def nvenc(desde, ate, dia):
    """Quantos vencimentos (todo dia `dia`) a partir de `desde` já passaram até `ate` (vencimento no próprio dia não conta)."""
    prim = f'DATE(YEAR({desde}),MONTH({desde}),MIN({dia},DAY(EOMONTH({desde},0))))'
    prim2 = f'IF({prim}<{desde},DATE(YEAR({desde}),MONTH({desde})+1,MIN({dia},DAY(EOMONTH({desde},1)))),{prim})'
    return (f'MAX(0,(YEAR({ate})*12+MONTH({ate}))-(YEAR({prim2})*12+MONTH({prim2}))'
            f'+IF(DAY({ate})>MIN({dia},DAY(EOMONTH({ate},0))),1,0))')


def pal(ref):
    return f'INDEX(Listas!$X$1:$X$1000,{ref}+1)'


def ext(v):
    """Valor por extenso (até R$ 999.999,99) só com fórmulas."""
    i, c = f'INT(ROUND({v},2))', f'ROUND(({v}-INT(ROUND({v},2)))*100,0)'
    t, u = f'INT({i}/1000)', f'MOD({i},1000)'
    return (f'IF({i}>=1000000,"",IF({i}=0,"",IF({t}>0,IF({t}=1,"mil",{pal(t)}&" mil"),"")'
            f'&IF(AND({t}>0,{u}>0),IF(OR({u}<100,MOD({u},100)=0)," e "," "),"")&IF({u}>0,{pal(u)},"")'
            f'&IF({i}=1," real"," reais"))&IF({c}>0,IF({i}>0," e ","")&{pal(c)}&IF({c}=1," centavo"," centavos"),""))')


class F(str):
    """Trecho de fórmula (o resto é texto fixo)."""


def lit(texto):
    texto = texto.replace('"', '""')
    partes = [texto[i:i + 240] for i in range(0, len(texto), 240)] or ['']
    return '&'.join(f'"{p}"' for p in partes)


def cat(*partes):
    return '&'.join(p if isinstance(p, F) else lit(p) for p in partes if p != '')


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
    ws[f'B{8 + len(MENU)}'] = f'Controle de Aluguéis · versão {VERSAO}'
    ws[f'B{9 + len(MENU)}'] = '="Licenciado para: "&IF(Painel!$P$3="","—",Painel!$P$3)'
    for k in (8, 9):
        ws[f'B{k + len(MENU)}'].font = fonte(size=8, color='64748B')
        ws[f'B{k + len(MENU)}'].alignment = Alignment(indent=1)
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
layout(pr, 'Proprietários', 'Proprietários', 'Donos dos imóveis: aparecem no contrato, no recibo, na carta de reajuste e no relatório de IR.', PR[1], 15)
legenda(pr)
cabecalho(pr, CAB, [('D', 'Nome completo', 32), ('E', 'CPF / CNPJ', 18), ('F', 'RG (e órgão)', 15), ('G', 'Nacionalidade', 13),
                    ('H', 'Estado civil', 14), ('I', 'Profissão', 16), ('J', 'Endereço completo', 40), ('K', 'Telefone', 16),
                    ('L', 'Chave PIX', 26), ('M', 'Banco / agência / conta', 24), ('N', 'Observações', 26)])
for letra in 'DEFGHIJKLMN':
    coluna(pr, letra, PR, True)
lista(pr, col_lista['civil'], f'H{PR[0]}:H{PR[1]}')
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
    im[f'O{r}'] = f'=IF(D{r}="","",IF(COUNTIFS({rng("Contratos", "D", CT)},D{r},{rng("Contratos", "T", CT)},"Ativo")>0,"Alugado","Vago"))'
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
layout(iq, 'Inquilinos', 'Inquilinos', 'WhatsApp: só números com DDD (ex.: 43999998888), para os botões de cobrança funcionarem.', INQ[1], 14)
legenda(iq)
cabecalho(iq, CAB, [('D', 'Nome completo', 32), ('E', 'CPF', 16), ('F', 'RG (e órgão)', 14), ('G', 'WhatsApp (só números com DDD)', 20),
                    ('H', 'E-mail', 26), ('I', 'Estado civil', 14), ('J', 'Profissão', 16), ('K', 'Nacionalidade', 13),
                    ('L', 'Endereço atual (antes de mudar)', 36), ('M', 'Observações', 26)])
for letra in 'DEFGHIJKLM':
    coluna(iq, letra, INQ, True)
lista(iq, col_lista['civil'], f'I{INQ[0]}:I{INQ[1]}')
iq.freeze_panes = f'E{INQ[0]}'

# ----------------------------------------------------------------- Contratos
ct = wb.create_sheet('Contratos')
layout(ct, 'Contratos', 'Contratos', 'Um contrato por locação. Reajustes vão na aba Reajustes. Para encerrar, preencha a data de saída.', CT[1], 23)
legenda(ct)
cabecalho(ct, CAB, [('D', 'Imóvel', 22), ('E', 'Inquilino', 24), ('F', 'Início do contrato', 11), ('G', 'Prazo (meses)', 8),
                    ('H', 'Fim do contrato', 11), ('I', 'Valor inicial do aluguel', 12), ('J', 'Valor atual (após reajustes)', 12),
                    ('K', 'Dia do venci-mento', 8), ('L', 'Reajuste a cada (meses)', 9), ('M', 'Índice de reajuste', 13),
                    ('N', 'Último reajuste', 11), ('O', 'Próximo reajuste', 11), ('P', 'Multa por atraso', 8), ('Q', 'Juros ao mês', 8),
                    ('R', 'Data de saída (encerrou)', 11), ('S', 'Código do contrato', 32), ('T', 'Situação', 10),
                    ('U', 'Aviso', 28), ('V', 'Saldo em aberto', 12)])
for letra, fmt in [('D', None), ('E', None), ('F', F_DATA), ('G', '0'), ('I', F_MOEDA), ('K', '0'), ('L', '0'), ('M', None),
                   ('P', F_PCT), ('Q', F_PCT), ('R', F_DATA)]:
    coluna(ct, letra, CT, True, fmt)
for letra, fmt in [('H', F_DATA), ('J', F_MOEDA), ('N', F_DATA), ('O', F_DATA), ('S', None), ('T', None), ('U', None), ('V', F_MOEDA)]:
    coluna(ct, letra, CT, False, fmt)
for letra in 'WXYZ':
    ct.column_dimensions[letra].hidden = True
RJD, RJE, RJH, RJM = (rng('Reajustes', c, RJ) for c in 'DEHM')
for r in range(CT[0], CT[1] + 1):
    ult = f'_xlfn.MAXIFS({RJD},{RJE},S{r})'
    ct[f'H{r}'] = f'=IF(OR(F{r}="",G{r}=""),"",EDATE(F{r},G{r})-1)'
    ct[f'J{r}'] = f'=IF(S{r}="","",IF({ult}=0,I{r},SUMIFS({RJH},{RJE},S{r},{RJD},{ult})))'
    ct[f'N{r}'] = f'=IF(S{r}="","",IF({ult}=0,"",{ult}))'
    ct[f'O{r}'] = f'=IF(OR(F{r}="",L{r}=""),"",EDATE(IF(N{r}="",F{r},N{r}),L{r}))'
    ct[f'S{r}'] = f'=IF(OR(D{r}="",E{r}=""),"",D{r}&" | "&E{r})'
    ct[f'T{r}'] = f'=IF(S{r}="","",IF(AND(R{r}<>"",R{r}<=TODAY()),"Encerrado","Ativo"))'
    ct[f'U{r}'] = (f'=IF(T{r}<>"Ativo","",IF(AND(H{r}<>"",H{r}<TODAY()),"Contrato venceu: renove ou encerre",'
                   f'IF(AND(H{r}<>"",H{r}-TODAY()<=60),"Contrato termina em "&(H{r}-TODAY())&" dias",'
                   f'IF(AND(O{r}<>"",O{r}<=TODAY()),"Reajuste vencido ("&M{r}&")",'
                   f'IF(AND(O{r}<>"",O{r}-TODAY()<=60),"Reajuste em "&(O{r}-TODAY())&" dias ("&M{r}&")","")))))')
    # Saldo em aberto: vencimentos já passados x valor (com os reajustes do histórico) − tudo o que foi pago.
    fimc = f'IF(R{r}="",TODAY(),MIN(R{r},TODAY()))'
    ct[f'W{r}'] = f'=IF(OR(S{r}="",F{r}="",K{r}=""),"",N(I{r})*{nvenc(f"F{r}", fimc, f"K{r}")}+SUMIFS({RJM},{RJE},S{r}))'
    ct[f'X{r}'] = f'=IF(W{r}="","",SUMIFS({rng("Pagamentos", "G", PG)},{rng("Pagamentos", "E", PG)},S{r}))'
    ct[f'V{r}'] = f'=IF(W{r}="","",MAX(0,ROUND(W{r}-X{r},2)))'
    ct[f'Y{r}'] = f'=IF(N(V{r})>0,V{r}+ROW()/1000000,"")'
    ct[f'Z{r}'] = f'=IF(U{r}<>"",ROW(),"")'
lista(ct, rng('Imóveis', 'D', IM), f'D{CT[0]}:D{CT[1]}', 'Escolha um imóvel cadastrado na aba Imóveis.')
lista(ct, rng('Inquilinos', 'D', INQ), f'E{CT[0]}:E{CT[1]}', 'Escolha um inquilino cadastrado na aba Inquilinos.')
lista(ct, col_lista['indices'], f'M{CT[0]}:M{CT[1]}')
dvd = DataValidation(type='whole', operator='between', formula1='1', formula2='31', showErrorMessage=True, error='Informe um dia de 1 a 31.')
ct.add_data_validation(dvd)
dvd.add(f'K{CT[0]}:K{CT[1]}')
ct.conditional_formatting.add(f'U{CT[0]}:U{CT[1]}', FormulaRule(formula=[f'LEN(U{CT[0]})>0'], fill=PatternFill('solid', fgColor='FEF3C7'),
                                                                  font=Font(name=FONTE, bold=True, color='B45309')))
ct.conditional_formatting.add(f'V{CT[0]}:V{CT[1]}', FormulaRule(formula=[f'N(V{CT[0]})>0'], font=Font(name=FONTE, bold=True, color='B91C1C')))
ct.conditional_formatting.add(f'T{CT[0]}:T{CT[1]}', FormulaRule(formula=[f'T{CT[0]}="Encerrado"'], font=Font(name=FONTE, color=SUAVE)))
ct.freeze_panes = f'F{CT[0]}'

# ----------------------------------------------------------------- Reajustes (histórico)
rj = wb.create_sheet('Reajustes')
layout(rj, 'Reajustes', 'Histórico de reajustes', 'Lance cada reajuste aqui. O novo valor vale a partir do primeiro vencimento na data do reajuste ou depois.', RJ[1], 14)
legenda(rj)
rj['H5'] = '=HYPERLINK("#' + q('Calcular reajuste') + '!A1","🧮 Calcular o novo valor e gerar a carta →")'
rj['H5'].font = fonte(size=9, bold=True, color=VERDE, underline='single')
cabecalho(rj, CAB, [('D', 'Data do reajuste', 12), ('E', 'Contrato', 34), ('F', 'Índice usado', 14), ('G', 'Variação aplicada (%)', 11),
                    ('H', 'Novo valor do aluguel', 14), ('I', 'Valor anterior', 13), ('J', 'Aumento', 12), ('K', 'Conferência', 20)])
for letra, fmt in [('D', F_DATA), ('E', None), ('F', None), ('G', F_PCT), ('H', F_MOEDA)]:
    coluna(rj, letra, RJ, True, fmt)
for letra, fmt in [('I', F_MOEDA), ('J', F_MOEDA), ('K', None)]:
    coluna(rj, letra, RJ, False, fmt)
for letra in 'LM':
    rj.column_dimensions[letra].hidden = True
CTX = lambda col, pos: f'INDEX({rng("Contratos", col, CT)},{pos})'  # noqa: E731
for r in range(RJ[0], RJ[1] + 1):
    rj[f'L{r}'] = f'=IF(E{r}="","",IFERROR(MATCH(E{r},{rng("Contratos", "S", CT)},0),""))'
    rj[f'I{r}'] = f'=IF(OR(D{r}="",L{r}=""),"",{valor_em(f"E{r}", f"D{r}", CTX("I", f"L{r}"), estrito=True)})'
    rj[f'J{r}'] = f'=IF(OR(H{r}="",I{r}=""),"",H{r}-I{r})'
    saida = CTX('R', f'L{r}')
    fimc = f'IF({saida}="",TODAY(),MIN({saida},TODAY()))'
    rj[f'M{r}'] = f'=IF(OR(J{r}="",L{r}=""),0,J{r}*{nvenc(f"D{r}", fimc, CTX("K", f"L{r}"))})'
    rj[f'K{r}'] = (f'=IF(OR(D{r}="",E{r}=""),"",IF(L{r}="","⚠ Contrato não encontrado",IF(COUNTIFS($E${RJ[0]}:$E${RJ[1]},E{r},'
                   f'$D${RJ[0]}:$D${RJ[1]},D{r})>1,"⚠ Lançado 2 vezes","✓")))')
rj.conditional_formatting.add(f'K{RJ[0]}:K{RJ[1]}', FormulaRule(formula=[f'LEFT(K{RJ[0]},1)="⚠"'], fill=PatternFill('solid', fgColor='FEE2E2'),
                                                                  font=Font(name=FONTE, bold=True, color='B91C1C')))
lista(rj, rng('Contratos', 'S', CT), f'E{RJ[0]}:E{RJ[1]}', 'Escolha um contrato da aba Contratos.')
lista(rj, col_lista['indices'], f'F{RJ[0]}:F{RJ[1]}')
rj.freeze_panes = f'E{RJ[0]}'

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
    pos = f'MATCH(E{r},{rng("Contratos", "S", CT)},0)'
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
    am[f'R{r}'] = f'=IF(AND({C("S")}<>"",{C("F")}<>"",{C("F")}<={FIM},OR({C("R")}="",{C("R")}>={INI})),1,0)'
    am[f'D{r}'] = f'=IF($R{r}=1,{C("D")},"")'
    am[f'E{r}'] = f'=IF($R{r}=1,{C("E")},"")'
    am[f'F{r}'] = f'=IF($R{r}=1,DATE({ANO},{MES_N},MIN(N({C("K")})+(N({C("K")})=0),DAY({FIM}))),"")'
    am[f'G{r}'] = f'=IF($R{r}=1,{valor_em(C("S"), f"F{r}", f"N({C(chr(73))})")},"")'
    soma = (f'SUMIFS({rng("Pagamentos", "G", PG)},{rng("Pagamentos", "E", PG)},{C("S")},{rng("Pagamentos", "F", PG)},">="&{INI},'
            f'{rng("Pagamentos", "F", PG)},"<="&{FIM})')
    am[f'H{r}'] = f'=IF($R{r}=1,{soma},"")'
    ultima = (f'_xlfn.MAXIFS({rng("Pagamentos", "D", PG)},{rng("Pagamentos", "E", PG)},{C("S")},{rng("Pagamentos", "F", PG)},">="&{INI},'
              f'{rng("Pagamentos", "F", PG)},"<="&{FIM})')
    am[f'I{r}'] = f'=IF($R{r}<>1,"",IF(H{r}>0,{ultima},""))'
    am[f'K{r}'] = f'=IF($R{r}<>1,"",IF(H{r}>=G{r},"Pago",IF(TODAY()>F{r},"Atrasado",IF(H{r}>0,"Parcial","Em aberto"))))'
    am[f'J{r}'] = f'={icone(f"K{r}")}'
    am[f'L{r}'] = f'=IF(K{r}="Atrasado",TODAY()-F{r},"")'
    falta = f'(G{r}-H{r})'
    am[f'M{r}'] = f'=IF(K{r}="Atrasado",ROUND({falta}*N({C("P")}),2)+ROUND({falta}*N({C("Q")})/30*L{r},2),"")'
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
ea['D5'] = f'="Total em aberto: R$ "&FIXED(SUM({rng("Contratos", "V", CT)}),2)&"   ·   "&COUNTIF({rng("Contratos", "V", CT)},">0")&" contrato(s)"'
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
    ea[f'F{r}'] = f'={pega("J")}'
    ea[f'H{r}'] = f'={pega("V")}'
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
ex['R1'] = f'=IF($E$5="","",IFERROR(MATCH($E$5,{rng("Contratos", "S", CT)},0),""))'
P = lambda col: f'IF($R$1="","",INDEX({rng("Contratos", col, CT)},$R$1))'  # noqa: E731
caixa(ex, 'D8:J12')
info = [('D8', 'INQUILINO', f'={P("E")}', 'D9'), ('G8', 'IMÓVEL', f'={P("D")}', 'G9'),
        ('D10', 'ALUGUEL', f'={P("J")}', 'D11'), ('F10', 'VENCIMENTO', f'=IF($R$1="","","Todo dia "&{P("K")})', 'F11'),
        ('H10', 'SALDO EM ABERTO (TOTAL)', f'={P("V")}', 'H11')]
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
    ativo = f'AND($R$1<>"",{P("F")}<>"",{P("F")}<={fim},OR({P("R")}="",{P("R")}>={ini}))'
    ex[f'S{r}'] = f'=IF({ativo},1,0)'
    ex[f'D{r}'] = MESES[m]
    ex[f'E{r}'] = f'=IF(S{r}=1,DATE($E$6,{m + 1},MIN({P("K")},DAY({fim}))),"")'
    ex[f'F{r}'] = f'=IF(S{r}=1,{valor_em("$E$5", f"E{r}", P("I"))},"")'
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
    'pos': f'=IF($E$5="","",IFERROR(MATCH($E$5,{rng("Contratos", "S", CT)},0),""))',
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

# ----------------------------------------------------------------- Calcular reajuste (+ carta)
cr = wb.create_sheet('Calcular reajuste')
layout(cr, 'Calcular reajuste', 'Calcular reajuste', 'Escolha o contrato e digite a variação do índice. O novo valor e a carta de reajuste saem prontos.', 48, 11, cabecalhos=False)
for col in 'DEFGHI':
    cr.column_dimensions[col].width = 17
for ref, rot in [('D5', 'Contrato:'), ('D6', 'Índice:'), ('D7', 'Variação acumulada:'), ('D8', 'Data do reajuste:')]:
    cr[ref] = rot
    cr[ref].font = fonte(bold=True)
    cr[ref].alignment = Alignment(horizontal='right', vertical='center')
cr.merge_cells('E5:H5')
for ref in ('E5', 'E6', 'E7', 'E8'):
    seletor(cr, ref)
lista(cr, rng('Contratos', 'S', CT), 'E5', 'Escolha um contrato da aba Contratos.')
lista(cr, col_lista['indices'], 'E6')
cr['E7'].number_format = F_PCT
cr['E8'].number_format = F_DATA
cr['S1'] = f'=IF($E$5="","",IFERROR(MATCH($E$5,{rng("Contratos", "S", CT)},0),""))'
Q_ = lambda col: f'IF($S$1="","",INDEX({rng("Contratos", col, CT)},$S$1))'  # noqa: E731
cr['E6'] = f'={Q_("M")}'
cr['E8'] = f'={Q_("O")}'
cr['F6'] = 'vem do contrato (pode trocar)'
cr['F7'] = 'digite o acumulado de 12 meses (ex.: 4,66%)'
cr['F8'] = 'vem do contrato (pode trocar)'
for ref in ('F6', 'F7', 'F8'):
    cr[ref].font = fonte(size=9, italic=True, color=SUAVE)
cr['D9'] = 'Onde achar o índice: Calculadora do Cidadão (Banco Central), IBGE (IPCA e INPC) ou FGV (IGP-M).'
cr['D9'].font = fonte(size=9, italic=True, color=SUAVE)
aux_cr = {
    'imovel': f'={Q_("D")}', 'inq': f'={Q_("E")}', 'atual': f'={Q_("J")}', 'dia': f'={Q_("K")}',
    'novo': '=IF(OR(S4="",$E$7=""),"",ROUND(S4*(1+$E$7),2))',
    'vig': ('=IF(OR($E$8="",S5=""),"",IF(DATE(YEAR($E$8),MONTH($E$8),MIN(S5,DAY(EOMONTH($E$8,0))))<$E$8,'
            'DATE(YEAR($E$8),MONTH($E$8)+1,1),DATE(YEAR($E$8),MONTH($E$8),1)))'),
    'linha_im': f'=IFERROR(MATCH(S2,{rng("Imóveis", "D", IM)},0),0)',
    'end': (f'=IF(S8=0,"",INDEX({rng("Imóveis", "F", IM)},S8)&" - "&INDEX({rng("Imóveis", "G", IM)},S8)&" - "'
            f'&INDEX({rng("Imóveis", "H", IM)},S8)&"/"&INDEX({rng("Imóveis", "I", IM)},S8))'),
    'cidade': f'=IF(S8=0,"",INDEX({rng("Imóveis", "H", IM)},S8)&"/"&INDEX({rng("Imóveis", "I", IM)},S8))',
    'dono': f'=IF(S8=0,"",INDEX({rng("Imóveis", "K", IM)},S8)&"")',
    'pct': '=IF($E$7="","",FIXED($E$7*100,2)&"%")',
}
for i, (k, f) in enumerate(aux_cr.items(), start=2):
    cr[f'R{i}'], cr[f'S{i}'] = k, f
for letra in 'RS':
    cr.column_dimensions[letra].hidden = True
# resultado
caixa(cr, 'D11:I14')
for ref, rot, val, fmt, cor in [('D11', 'VALOR ATUAL', '=S4', F_MOEDA, ESCURO), ('F11', 'NOVO VALOR', '=S6', F_MOEDA, VERDE_ESC),
                                ('H11', 'AUMENTO', '=IF(S6="","",S6-S4)', F_MOEDA, LARANJA)]:
    cr[ref] = rot
    cr[ref].font = fonte(size=8, bold=True, color=SUAVE)
    v = ref[0] + '12'
    cr.merge_cells(f'{v}:{chr(ord(ref[0]) + 1)}12')
    cr[v] = val
    cr[v].font = fonte(size=18, bold=True, color=cor)
    cr[v].number_format = fmt
    cr[v].alignment = Alignment(horizontal='left', vertical='center')
cr.row_dimensions[12].height = 30
cr.merge_cells('D14:I14')
cr['D14'] = '=IF(S6="","Escolha o contrato e digite a variação.","Vale a partir do vencimento de "&TEXT(MONTH(S7),"00")&"/"&YEAR(S7)&". Para registrar, lance na aba Reajustes: data, contrato, índice, variação e o novo valor (R$ "&FIXED(S6,2)&").")'
cr['D14'].font = fonte(size=9, bold=True, color=VERDE_ESC)
cr['D14'].alignment = Alignment(wrap_text=True, vertical='center')
cr.row_dimensions[14].height = 30
cr['D15'] = f'=HYPERLINK("#{q("Reajustes")}!A1","🔁 Ir para Reajustes e registrar →")'
cr['D15'].font = fonte(size=9, bold=True, color=VERDE, underline='single')
# carta
cr['D17'] = 'Carta de reajuste (para imprimir: Arquivo → Imprimir)'
cr['D17'].font = fonte(bold=True, size=12)
caixa(cr, 'D18:I44')
for col in 'DEFGHI':
    cr[f'{col}18'].border = Border(top=Side('thick', color=VERDE_ESC))
linhas_carta = [
    (20, '="COMUNICADO DE REAJUSTE DE ALUGUEL"', fonte(size=14, bold=True), 'center', 22),
    (22, '=IF(S2="","",S10&", "&DAY(TODAY())&" de "&LOWER(INDEX(Listas!$A$2:$A$13,MONTH(TODAY())))&" de "&YEAR(TODAY())&".")', fonte(), 'right', 18),
    (24, '=IF(S3="","","Ao(À) Sr(a). "&UPPER(S3))', fonte(bold=True), 'left', 18),
    (25, '=IF(S2="","","Ref.: reajuste do aluguel do imóvel situado à "&S9&".")', fonte(), 'left', 30),
    (27, '=IF(S3="","","Prezado(a) "&LEFT(S3,FIND(" ",S3&" ")-1)&",")', fonte(), 'left', 18),
    (28, ('=IF(S6="","","Conforme previsto no contrato de locação, informamos que o aluguel do imóvel acima será reajustado pela '
          'variação acumulada do "&$E$6&" de "&S12&" no período, passando a valer a partir do vencimento de "&TEXT(MONTH(S7),"00")&"/"&YEAR(S7)&".")'),
     fonte(), 'justify', 44),
    (30, '=IF(S6="","","Valor atual: R$ "&FIXED(S4,2))', fonte(), 'left', 18),
    (31, '=IF(S6="","","Novo valor: R$ "&FIXED(S6,2)&" ("&' + ext('S6') + '&")")', fonte(bold=True), 'left', 30),
    (33, '=IF(S6="","","Os demais termos do contrato permanecem inalterados. Ficamos à disposição para qualquer esclarecimento.")', fonte(), 'left', 30),
    (35, '=IF(S6="","","Atenciosamente,")', fonte(), 'left', 18),
    (38, '=IF(S6="","",UPPER(S11))', fonte(bold=True), 'center', 18),
    (39, '=IF(S6="","","Locador")', fonte(size=9, color=SUAVE), 'center', 16),
    (42, '=IF(S6="","","Ciente: ____________________________________   Data: ____/____/________")', fonte(), 'left', 18),
    (43, '=IF(S6="","",UPPER(S3)&" (locatário)")', fonte(size=9, color=SUAVE), 'left', 16),
]
for lin, f, fnt, al, alt in linhas_carta:
    cr.merge_cells(f'E{lin}:H{lin}')
    cr[f'E{lin}'] = f
    cr[f'E{lin}'].font = fnt
    cr[f'E{lin}'].alignment = Alignment(horizontal=al, vertical='top', wrap_text=True)
    cr.row_dimensions[lin].height = alt
for col in 'EFGH':
    cr[f'{col}38'].border = Border(top=Side('thin', color=ESCURO))
cr.print_area = 'D18:I44'
cr.sheet_properties.pageSetUpPr.fitToPage = True
cr.page_setup.fitToWidth = 1
cr.print_options.horizontalCentered = True
destravar(cr, 'E5:H5', 'E6', 'E7', 'E8')
proteger(cr)

# ----------------------------------------------------------------- Gerar contrato
gc = wb.create_sheet('Gerar contrato')
for col in 'DEFGHI':
    gc.column_dimensions[col].width = 17
campos = [('D5', 'Contrato:', 'E5'), ('D6', 'Finalidade:', 'E6'), ('D7', 'Garantia:', 'E7'), ('D8', 'Valor da garantia:', 'E8'),
          ('D9', 'Fiador (nome):', 'E9'), ('D10', 'Fiador (CPF):', 'E10'), ('G6', 'IPTU por conta do:', 'H6'),
          ('G7', 'Multa rescisória (aluguéis):', 'H7'), ('G8', 'Foro (cidade/UF):', 'H8'), ('G9', 'Cidade da assinatura:', 'H9'),
          ('G10', 'Data da assinatura:', 'H10'), ('D11', 'Testemunha 1:', 'E11'), ('G11', 'Testemunha 2:', 'H11')]
for rot_ref, rot, val in campos:
    gc[rot_ref] = rot
    gc[rot_ref].font = fonte(bold=True, size=9)
    gc[rot_ref].alignment = Alignment(horizontal='right', vertical='center', wrap_text=True)
GC_LISTAS = {'fin': ['Residencial', 'Comercial'], 'gar': ['Caução em dinheiro', 'Fiador', 'Seguro-fiança', 'Sem garantia'], 'iptu': ['Locador', 'Locatário']}
for j, (k, itens) in enumerate(GC_LISTAS.items()):
    letra = 'QRS'[j]
    for i, v in enumerate(itens, start=2):
        ls[f'{letra}{20 + i}'] = v
lista(gc, 'Listas!$Q$22:$Q$23', 'E6')
lista(gc, 'Listas!$R$22:$R$25', 'E7')
lista(gc, 'Listas!$S$22:$S$23', 'H6')
lista(gc, rng('Contratos', 'S', CT), 'E5', 'Escolha um contrato da aba Contratos.')
gc.merge_cells('E5:I5')
for ref in ('E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11'):
    seletor(gc, ref)
    gc[ref].font = fonte(bold=True, size=10, color=VERDE_ESC)
for a_, b_ in (('E9', 'F9'), ('E11', 'F11'), ('H8', 'I8'), ('H9', 'I9'), ('H11', 'I11')):
    gc.merge_cells(f'{a_}:{b_}')
gc['E6'], gc['E7'], gc['H6'], gc['H7'] = 'Residencial', 'Caução em dinheiro', 'Locador', 3
gc['E8'].number_format = F_MOEDA
gc['H10'].number_format = F_DATA
gc['D12'] = 'Campos de foro, cidade e data vazios: o contrato usa a cidade do imóvel e deixa a data em branco para preencher à mão.'
gc['D12'].font = fonte(size=9, italic=True, color=SUAVE)
# auxiliares
GQ = lambda col: f'IF($S$2="","",INDEX({rng("Contratos", col, CT)},$S$2))'  # noqa: E731
IMV = lambda col: f'IF($S$14=0,"",INDEX({rng("Imóveis", col, IM)},$S$14)&"")'  # noqa: E731
PRP = lambda col: f'IF($S$20=0,"",INDEX({rng("Proprietários", col, PR)},$S$20)&"")'  # noqa: E731
INQ_ = lambda col: f'IF($S$24=0,"",INDEX({rng("Inquilinos", col, INQ)},$S$24)&"")'  # noqa: E731
LAC = '__________'
ou = lambda x: f'IF({x}="","{LAC}",{x})'  # noqa: E731
aux_gc = {
    2: f'=IF($E$5="","",IFERROR(MATCH($E$5,{rng("Contratos", "S", CT)},0),""))', 3: f'={GQ("D")}', 4: f'={GQ("E")}', 5: f'={GQ("F")}',
    6: f'={GQ("G")}', 7: f'={GQ("H")}', 8: f'={GQ("J")}', 9: f'={GQ("K")}', 10: f'={GQ("L")}', 11: f'={GQ("M")}',
    12: f'=N({GQ("P")})', 13: f'=N({GQ("Q")})', 14: f'=IFERROR(MATCH(S3,{rng("Imóveis", "D", IM)},0),0)',
    15: f'=IF(S14=0,"",{IMV("F")}&", bairro "&{IMV("G")}&", "&{IMV("H")}&"/"&{IMV("I")}&IF({IMV("J")}="","",", CEP "&{IMV("J")}))',
    16: f'=IF(S14=0,"",{IMV("H")}&"/"&{IMV("I")})', 17: f'={IMV("L")}', 18: f'=N(IF(S14=0,0,INDEX({rng("Imóveis", "N", IM)},S14)))',
    19: f'={IMV("K")}', 20: f'=IFERROR(MATCH(S19,{rng("Proprietários", "D", PR)},0),0)',
    21: (f'=IF(S20=0,"{LAC}, nacionalidade {LAC}, estado civil {LAC}, profissão {LAC}, portador(a) do RG nº {LAC}, inscrito(a) no CPF nº {LAC}, '
         f'residente e domiciliado(a) à {LAC}",UPPER({PRP("D")})&", "&IF({PRP("G")}="","nacionalidade {LAC}",{PRP("G")})&", "'
         f'&IF({PRP("H")}="","estado civil {LAC}",LOWER({PRP("H")}))&", "&IF({PRP("I")}="","profissão {LAC}",{PRP("I")})'
         f'&", portador(a) do RG nº "&{ou(PRP("F"))}&", inscrito(a) no CPF/CNPJ nº "&{ou(PRP("E"))}&", residente e domiciliado(a) à "&{ou(PRP("J"))})'),
    22: f'={PRP("L")}', 23: f'={PRP("M")}', 24: f'=IFERROR(MATCH(S4,{rng("Inquilinos", "D", INQ)},0),0)',
    25: (f'=IF(S24=0,"{LAC}",UPPER({INQ_("D")})&", "&IF({INQ_("K")}="","nacionalidade {LAC}",{INQ_("K")})&", "'
         f'&IF({INQ_("I")}="","estado civil {LAC}",LOWER({INQ_("I")}))&", "&IF({INQ_("J")}="","profissão {LAC}",{INQ_("J")})'
         f'&", portador(a) do RG nº "&{ou(INQ_("F"))}&" e CPF nº "&{ou(INQ_("E"))}&", telefone "&{ou(INQ_("G"))}'
         f'&", e-mail "&{ou(INQ_("H"))}&", residente atualmente à "&{ou(INQ_("L"))})'),
    26: f'={PRP("E")}', 27: f'={INQ_("E")}', 28: f'=IF(N(S8)=0,"",{ext("S8")})', 29: '=IF($H$8<>"",$H$8,IF(S16="","' + LAC + '",S16))',
    30: '=IF($H$9<>"",$H$9,IF(S16="","' + LAC + '",S16))', 31: f'=IF(N($E$8)=0,"",{ext("$E$8")})', 32: f'=IF(N(S18)=0,"",{ext("S18")})',
    33: '=OR(S11="IPCA",S11="IGP-M",S11="INPC")', 34: '=IF(S11="IPCA","IPCA/IBGE",IF(S11="IGP-M","IGP-M/FGV",IF(S11="INPC","INPC/IBGE","")))',
    35: '=$E$6<>"Comercial"', 36: '=LOWER(IF($E$6="","Residencial",$E$6))',
}
for k, f in aux_gc.items():
    gc[f'S{k}'] = f
for letra in 'RS':
    gc.column_dimensions[letra].hidden = True
Sx = lambda n: F(f'$S${n}')  # noqa: E731
data = lambda ref: F(data_txt(ref))  # noqa: E731
pctf = lambda ref: F(f'FIXED({ref}*100,IF({ref}*100=INT({ref}*100),0,2))&"%"')  # noqa: E731
gar = '$E$7'
dtx = lambda ref: f'IF({ref}="","____/____/______",{data_txt(ref)})'  # noqa: E731
doc = []  # (tipo, formula, caracteres estimados)
def par(*partes, est=200):
    doc.append(('p', '=' + cat(*partes), est))
def clausula(n, titulo):
    doc.append(('c', '=' + cat(f'CLÁUSULA {n}ª – ', titulo) if isinstance(titulo, F) else f'="CLÁUSULA {n}ª – {titulo}"', 40))

doc.append(('t', '="CONTRATO DE LOCAÇÃO DE IMÓVEL "&UPPER(S36)', 40))
doc.append(('s', '="Lei nº 8.245/1991 (Lei do Inquilinato)"', 40))
doc.append(('c', '="QUALIFICAÇÃO DAS PARTES"', 30))
par('LOCADOR: ', Sx(21), '.', est=330)
par('LOCATÁRIO: ', Sx(25), '.', est=330)
par('As partes celebram o presente contrato de locação ', Sx(36), ', que será regido pela Lei nº 8.245/1991 e pelas cláusulas abaixo.', est=140)
clausula(1, 'DO IMÓVEL E DA DESTINAÇÃO')
par('O LOCADOR entrega em locação ao LOCATÁRIO o imóvel ', Sx(36), ' situado à ', Sx(15), F('IF(S17="","",", objeto da matrícula nº "&S17)'), '.', est=200)
doc.append(('p', '=IF(S35,' + lit('O imóvel destina-se exclusivamente à moradia do LOCATÁRIO e de sua família, sendo vedada a alteração de finalidade sem autorização prévia e escrita do LOCADOR.') + ','
            + lit('O imóvel destina-se exclusivamente ao uso comercial do LOCATÁRIO, sendo vedada a alteração de finalidade sem autorização prévia e escrita do LOCADOR.') + ')', 170))
clausula(2, 'DO PRAZO')
doc.append(('p', '=IF(N(S6)=0,"A locação é celebrada por prazo indeterminado, com início em "&' + dtx('S5') + '&".",'
            '"A locação terá prazo de "&S6&" ("&' + pal('S6') + '&") meses, com início em "&' + dtx('S5') + '&" e término em "&' + dtx('S7') + '&".")', 130))
doc.append(('p', '=IF(NOT(S35),' + lit('Findo o prazo, a prorrogação e a eventual renovação da locação observarão as disposições da Lei nº 8.245/1991 aplicáveis às locações não residenciais, especialmente seus artigos 51 a 57.')
            + ',IF(N(S6)<30,' + lit('Por se tratar de locação residencial com prazo inferior a 30 (trinta) meses, eventual prorrogação por prazo indeterminado e retomada do imóvel observarão as hipóteses e condições previstas na Lei nº 8.245/1991, especialmente seu artigo 47.')
            + ',' + lit('Findo o prazo ajustado, se o LOCATÁRIO permanecer no imóvel por mais de 30 (trinta) dias sem oposição do LOCADOR, a locação será prorrogada por prazo indeterminado, nos termos do artigo 46 da Lei nº 8.245/1991.') + '))', 240))
par('Se as partes desejarem renovar a locação por novo prazo determinado, deverão formalizar o acordo por escrito.', est=110)
clausula(3, 'DO ALUGUEL, VENCIMENTO E PAGAMENTO')
par('O aluguel mensal será de R$ ', F('IF(N(S8)=0,"' + LAC + '",FIXED(S8,2))'), ' (', Sx(28), '), com vencimento todo dia ', Sx(9), ', ',
    F('IF(S22<>"","mediante PIX para a chave "&S22,IF(S23<>"","mediante depósito ou transferência para "&S23,"mediante ' + LAC + '"))'), ', em nome do LOCADOR.', est=220)
doc.append(('p', f'=IF({gar}="Sem garantia",' + lit('Como a locação não possui garantia locatícia, as partes poderão ajustar o pagamento do aluguel e encargos até o sexto dia útil do mês vincendo, conforme artigo 42 da Lei nº 8.245/1991.') + ',"")', 180))
par('Os comprovantes de pagamento servirão como prova do pagamento, sem prejuízo de o LOCADOR fornecer recibo discriminado quando solicitado.', est=140)
doc.append(('p', '=IF(AND(S12=0,S13=0),"","Em caso de atraso, incidirá "&IF(S12>0,"multa moratória de "&' + pctf('S12') + '&" sobre o valor em atraso","")'
            '&IF(AND(S12>0,S13>0)," e ","")&IF(S13>0,"juros de mora de "&' + pctf('S13') + '&" ao mês, calculados proporcionalmente aos dias de atraso","")'
            '&IF(S33,", além de correção monetária pelo "&S11&", se aplicável","")&".")', 230))
clausula(4, 'DO REAJUSTE')
doc.append(('p', '=IF(N(S10)=0,' + lit('O valor do aluguel somente será alterado mediante acordo escrito entre as partes, observada a legislação vigente.')
            + ',IF(S33,"O aluguel será reajustado a cada "&S10&" ("&' + pal('S10') + '&") meses, contados do início da locação, pela variação acumulada do "&S34&" no período. "&'
            + lit('Caso o índice deixe de existir ou não possa ser utilizado, as partes adotarão outro índice oficial que o substitua. O reajuste deverá respeitar a legislação vigente.')
            + ',"O aluguel poderá ser reajustado a cada "&S10&" ("&' + pal('S10') + '&") meses, contados do início da locação, em valor definido pelo LOCADOR "&'
            + lit('e comunicado por escrito ao LOCATÁRIO com antecedência mínima de 30 (trinta) dias. O reajuste deverá respeitar a legislação vigente.') + '))', 300))
doc.append(('p', '=IF(N(S10)=0,"","O novo valor passará a vigorar a partir do primeiro vencimento seguinte à data do reajuste.")', 100))
clausula(5, 'DOS ENCARGOS E CONSUMOS')
par('Durante a locação, serão de responsabilidade do LOCATÁRIO as despesas de consumo individual do imóvel, incluindo água, energia elétrica, gás, internet e outros serviços que contratar ou utilizar.', est=190)
par('O LOCATÁRIO deverá, quando possível, transferir as contas de consumo para seu nome e manter os pagamentos em dia, apresentando comprovantes quando solicitado.', est=160)
doc.append(('p', '=IF($H$6="Locatário",' + lit('O IPTU incidente sobre o imóvel durante a locação será de responsabilidade do LOCATÁRIO, e as despesas extraordinárias de propriedade, do LOCADOR. Se houver condomínio, as despesas ordinárias atribuídas legalmente ao LOCATÁRIO serão pagas por ele, e as extraordinárias pelo LOCADOR.')
            + ',' + lit('Salvo acordo escrito em contrário, o IPTU e despesas extraordinárias de propriedade serão de responsabilidade do LOCADOR. Se houver condomínio, as despesas ordinárias atribuídas legalmente ao LOCATÁRIO serão pagas por ele, e as extraordinárias pelo LOCADOR.') + ')', 290))
doc.append(('p', '=IF(S18=0,"","A taxa de condomínio ordinária é, nesta data, de aproximadamente R$ "&FIXED(S18,2)&" ("&S32&") por mês, sujeita às alterações aprovadas pelo condomínio.")', 170))
doc.append(('c', f'="CLÁUSULA 6ª – "&IF({gar}="Caução em dinheiro","DA GARANTIA (CAUÇÃO)",IF({gar}="Fiador","DA GARANTIA (FIANÇA)",IF({gar}="Seguro-fiança","DA GARANTIA","DA AUSÊNCIA DE GARANTIA")))', 40))
vg = 'IF(N($E$8)>0,"R$ "&FIXED($E$8,2)&" ("&S31&")","R$ ' + LAC + '")'
doc.append(('p', f'=IF({gar}="Caução em dinheiro","Em garantia das obrigações deste contrato, o LOCATÁRIO entrega ao LOCADOR caução em dinheiro no valor de "&{vg}&"'
            + ', nos termos do artigo 38 da Lei nº 8.245/1991, que será devolvida ao final da locação, "&'
            + lit('após a vistoria de saída e a quitação de eventuais débitos, podendo ser utilizada para cobrir valores em aberto.')
            + f',IF({gar}="Fiador","Assina também este contrato, como FIADOR e principal pagador, "&UPPER({ou("$E$9")})&", inscrito(a) no CPF nº "&{ou("$E$10")}&", "&'
            + lit('responsável solidariamente por todas as obrigações do LOCATÁRIO até a efetiva entrega das chaves, renunciando aos benefícios dos artigos 827, 835 e 838 do Código Civil.')
            + f',IF({gar}="Seguro-fiança","A locação é garantida por seguro-fiança"&IF(N($E$8)>0," no valor de "&{vg},"")&", contratado pelo LOCATÁRIO e mantido vigente durante toda a locação.",'
            + lit('A locação é celebrada sem fiador, caução, seguro-fiança ou outra garantia locatícia.') + ')))', 330))
par('As partes reconhecem que não está sendo exigida mais de uma modalidade de garantia.', est=90)
clausula(7, 'DA CONSERVAÇÃO, VISTORIA E BENFEITORIAS')
for t in ['O LOCATÁRIO declara receber o imóvel em condições de uso, conforme laudo de vistoria e registro fotográfico que, se elaborado, deverá ser anexado a este contrato. A declaração não afasta a responsabilidade do LOCADOR por defeitos preexistentes ou vícios que sejam de sua responsabilidade legal.',
          'O LOCATÁRIO deverá conservar o imóvel, reparar danos que causar ou que forem causados por seus familiares, visitantes ou prestadores, e devolvê-lo ao final da locação no estado em que o recebeu, ressalvado o desgaste natural decorrente do uso regular.',
          'Obras ou benfeitorias dependerão de autorização prévia e escrita do LOCADOR. A indenização ou retenção por benfeitorias será tratada conforme a legislação aplicável e eventual acordo escrito entre as partes.',
          'É vedado sublocar, ceder ou emprestar o imóvel, total ou parcialmente, sem consentimento prévio e escrito do LOCADOR.',
          'O LOCADOR poderá vistoriar o imóvel mediante prévio agendamento com o LOCATÁRIO, em dia e horário razoáveis.']:
    par(t, est=len(t))
clausula(8, 'DA RESCISÃO E MULTA')
doc.append(('p', '=IF(OR(N($H$7)=0,N(S6)=0),"","Durante o prazo determinado, o LOCATÁRIO poderá devolver o imóvel antes do término, mediante comunicação escrita, ficando sujeito à multa equivalente a "&$H$7&" ("&'
            + pal('$H$7') + '&") "&IF($H$7=1,"aluguel vigente","aluguéis vigentes")&", "&' + lit('reduzida proporcionalmente ao período já cumprido do contrato, conforme artigo 4º da Lei nº 8.245/1991, salvo hipótese legal de dispensa.') + ')', 310))
doc.append(('p', '=IF(OR(N($H$7)=0,N(S6)=0),"",' + lit('Para cálculo proporcional, a multa será calculada pela seguinte fórmula: multa integral × (período restante do contrato ÷ prazo total contratado).') + ')', 150))
par('O LOCATÁRIO deverá, preferencialmente, comunicar a intenção de desocupação com 30 (trinta) dias de antecedência, para organização da vistoria e entrega das chaves.', est=170)
par('O LOCADOR não poderá reaver o imóvel durante o prazo contratual, salvo nas hipóteses legais. O descumprimento contratual poderá ensejar medidas legais cabíveis, inclusive rescisão e despejo, conforme a lei.', est=210)
clausula(9, 'DA ENTREGA DAS CHAVES')
par('A devolução das chaves deverá ser formalizada por escrito, após vistoria de saída. A entrega das chaves não implica quitação automática de valores pendentes, que deverão ser apurados e discriminados.', est=200)
clausula(10, 'DO FORO')
par('Fica eleito o foro da Comarca de ', Sx(29), ' para dirimir questões decorrentes deste contrato, ressalvadas as regras legais de competência.', est=150)
doc.append(('c', '="DISPOSIÇÕES FINAIS"', 30))
doc.append(('p', f'="E, por estarem de acordo, as partes assinam este instrumento em "&IF({gar}="Fiador","três","duas")&" vias de igual teor, juntamente com duas testemunhas, ou por meio eletrônico que permita comprovar autoria e integridade."', 200))
doc.append(('d', '=S30&", "&IF($H$10="","____ de ____________________ de ________",DAY($H$10)&" de "&LOWER(INDEX(Listas!$A$2:$A$13,MONTH($H$10)))&" de "&YEAR($H$10))&"."', 60))
assin = [('LOCADOR', 'UPPER(S19)', 'S26', None), ('LOCATÁRIO', 'UPPER(S4)', 'S27', None), ('FIADOR', f'UPPER({ou("$E$9")})', '$E$10', f'{gar}="Fiador"'),
         ('TESTEMUNHA 1', f'IF($E$11="","__________________________________________",UPPER($E$11))', '""', None),
         ('TESTEMUNHA 2', f'IF($H$11="","__________________________________________",UPPER($H$11))', '""', None)]
G0 = 14
caixa(gc, f'D{G0}:I{G0 + len(doc) + len(assin) * 4 + 3}')
for col in 'DEFGHI':
    gc[f'{col}{G0}'].border = Border(top=Side('thick', color=VERDE_ESC))
r = G0 + 1
for tipo, f, est in doc:
    gc.merge_cells(f'D{r}:I{r}')
    c = gc[f'D{r}']
    c.value = f
    if tipo == 't':
        c.font, c.alignment = fonte(size=13, bold=True), Alignment(horizontal='center', vertical='center')
        gc.row_dimensions[r].height = 26
    elif tipo == 's':
        c.font, c.alignment = fonte(size=9, color=SUAVE), Alignment(horizontal='center', vertical='top')
        gc.row_dimensions[r].height = 18
    elif tipo == 'c':
        c.font, c.alignment = fonte(size=10, bold=True), Alignment(vertical='bottom', wrap_text=True)
        gc.row_dimensions[r].height = 24
    elif tipo == 'd':
        c.font, c.alignment = fonte(size=10), Alignment(horizontal='right', vertical='center')
        gc.row_dimensions[r].height = 30
    else:
        c.font, c.alignment = fonte(size=10), Alignment(horizontal='justify', vertical='top', wrap_text=True)
        gc.row_dimensions[r].height = max(15, -(-est // 118) * 13 + 4)
    r += 1
r += 1
for papel, nome, doc_, cond in assin:
    pre = f'IF({cond},' if cond else ''
    pos = ',"")' if cond else ''
    for k, (f, alt) in enumerate([(f'="{papel}: "&{nome}', 18), ('="CPF: "&IF(' + doc_ + '="","______________________________",' + doc_ + ')', 16),
                                  ('="Assinatura: __________________________________________"', 24)]):
        gc.merge_cells(f'D{r}:I{r}')
        gc[f'D{r}'] = '=' + pre + f[1:] + pos if cond else f
        gc[f'D{r}'].font = fonte(size=10, bold=(k == 0))
        gc[f'D{r}'].alignment = Alignment(vertical='bottom')
        gc.row_dimensions[r].height = alt
        r += 1
    r += 1
fim_doc = r
layout(gc, 'Gerar contrato', 'Gerar contrato', 'Escolha o contrato e preencha as opções. O contrato abaixo sai pronto para imprimir (Arquivo → Imprimir).', fim_doc + 2, 11, cabecalhos=False)
caixa(gc, f'D{G0 + 1}:I{fim_doc}')
for ref in ('E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11'):
    seletor(gc, ref)
    gc[ref].font = fonte(bold=True, size=10, color=VERDE_ESC)
gc['E8'].number_format = F_MOEDA
gc['H10'].number_format = F_DATA
for col in 'DEFGHI':
    gc[f'{col}{G0}'].fill = PatternFill('solid', fgColor=VERDE_ESC)
gc.row_dimensions[G0].height = 6
gc.print_area = f'D{G0 + 1}:I{fim_doc}'
gc.page_setup.orientation = 'portrait'
gc.page_setup.fitToWidth = 1
gc.page_setup.fitToHeight = 0
gc.sheet_properties.pageSetUpPr.fitToPage = True
destravar(gc, 'E5:I5', 'E6', 'E7', 'E8', 'E9:F9', 'E10', 'E11:F11', 'H6', 'H7', 'H8:I8', 'H9:I9', 'H10', 'H11:I11')
proteger(gc)

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
    (13, 'D', '⚠️', 'EM ABERTO (TODOS OS MESES)', f'=SUM({rng("Contratos", "V", CT)})', f'=COUNTIF({rng("Contratos", "V", CT)},">0")&" contrato(s) devendo"', VERMELHO, F_MOEDA),
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
    colg = L_(27 + k)
    ls[f'N{r}'] = f'=SUM(Listas!${colg}$2:${colg}${1 + n_ct})'
    for i in range(n_ct):
        c = CT[0] + i
        CC = lambda col: f"{q('Contratos')}!${col}${c}"  # noqa: E731
        venc = f'DATE(YEAR({ini}),MONTH({ini}),MIN(N({CC("K")})+(N({CC("K")})=0),DAY({fim})))'
        ativo = f'AND({CC("S")}<>"",{CC("F")}<>"",{CC("F")}<={fim},OR({CC("R")}="",{CC("R")}>={ini}))'
        ls[f'{colg}{2 + i}'] = f'=IF({ativo},{valor_em(CC("S"), venc, f"N({CC(chr(73))})")},0)'
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
    pn[f'I{r}'] = f'=IF({t}="","",INDEX({rng("Contratos", "V", CT)},{t}))'
    pn[f'L{r}'] = f'=IF({u}="",IF({k}=0,"Nenhum aviso no momento",""),INDEX({rng("Contratos", "E", CT)},{u}))'
    pn[f'O{r}'] = f'=IF({u}="","",INDEX({rng("Contratos", "U", CT)},{u}))'
    pn[f'I{r}'].number_format = F_MOEDA
    for col in 'DEFGHIJLMNOPQR':
        pn[f'{col}{r}'].fill = PatternFill('solid', fgColor=BRANCO)
        pn[f'{col}{r}'].border = Border(bottom=fina)
    for ref, f in [(f'D{r}', fonte(bold=True)), (f'G{r}', fonte(color=SUAVE)), (f'I{r}', fonte(bold=True, color='B91C1C')),
                   (f'L{r}', fonte(bold=True)), (f'O{r}', fonte(bold=True, color='B45309'))]:
        pn[ref].font = f
        pn[ref].alignment = Alignment(vertical='center', indent=1)
pn['D42'] = f'=HYPERLINK("#{q("Em aberto")}!A1","Ver todos os valores em aberto →")'
pn['L42'] = f'=HYPERLINK("#{q("Contratos")}!U8","Ver os contratos →")'
for ref in ('D42', 'L42'):
    pn[ref].font = fonte(size=9, bold=True, color=VERDE, underline='single')
pn['D45'] = ('Primeira vez? Comece pela aba ❓ Como usar.' if VAZIA else
             'Os dados que vêm preenchidos são EXEMPLOS: apague-os antes de usar (ou use o arquivo EM BRANCO).')
pn['P2'] = 'LICENCIADO PARA'
pn['P2'].font = fonte(size=8, bold=True, color=SUAVE)
pn['P2'].alignment = Alignment(vertical='bottom')
pn.merge_cells('P3:R3')
seletor(pn, 'P3')
pn['P3'].font = fonte(bold=True, size=10, color=VERDE_ESC)
pn['D45'].font = fonte(size=8, italic=True, color=SUAVE)
destravar(pn, 'E5:F5', 'H5', 'P3:R3')
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
    ('12', 'Calcular reajuste: escolha o contrato e digite a variação do índice (ex.: IPCA 4,66%). Sai o novo valor e a carta de reajuste '
           'para imprimir. Depois, lance o reajuste na aba Reajustes.', 'Calcular reajuste'),
    ('13', 'Reajustes: o histórico de todos os reajustes. O novo valor passa a valer sozinho a partir do vencimento seguinte, e os meses '
           'anteriores continuam com o valor antigo.', 'Reajustes'),
    ('14', 'Gerar contrato: escolha o contrato, a finalidade, a garantia e as opções. O contrato de locação completo sai pronto para '
           'imprimir e assinar. Para sair completo, preencha RG, nacionalidade, estado civil, profissão e endereço nos cadastros.', 'Gerar contrato'),
    ('15', 'Relatório IR: escolha o ano (e o proprietário, se quiser) para ver o carnê-leão mês a mês e o resultado por imóvel.', 'Relatório IR'),
    ('', 'BOM SABER', None),
    ('•', 'Encerrou uma locação? Em Contratos, preencha a "Data de saída". O histórico continua guardado.', None),
    ('•', 'Reajustou o aluguel? Não mude o "Valor inicial" do contrato: lance o reajuste na aba Reajustes. Assim o histórico fica certo.', None),
    ('•', 'O contrato gerado é um modelo de apoio: revise as cláusulas para o seu caso (de preferência com um advogado) antes de assinar.', None),
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


for col, v in zip('DEFGHIJKL', ('Proprietário Exemplo', '000.000.000-00', '0000000 SSP/PR', 'brasileiro', 'Casado(a)', 'comerciante',
                                  'Rua Exemplo, 1 - Centro - Cidade Exemplo/PR', '(00) 00000-0000', 'CPF 000.000.000-00')):
    pr[f'{col}8'] = v
for i, (nome, tipo, end, iptu) in enumerate([('Casa Exemplo', 'Casa', 'Rua Exemplo, 100', 1200), ('Apto Exemplo', 'Apartamento', 'Avenida Exemplo, 200', 900),
                                             ('Sala Exemplo', 'Sala comercial', 'Rua Exemplo B, 300', 1500), ('Kitnet Exemplo', 'Kitnet', 'Rua Exemplo C, 400', 400)]):
    r = 8 + i
    for col, v in zip('DEFGHIJKLM', (nome, tipo, end, 'Centro', 'Cidade Exemplo', 'PR', '00000-000', 'Proprietário Exemplo', '00.000', iptu)):
        im[f'{col}{r}'] = v
for i, nome in enumerate(['Inquilina Exemplo Ana', 'Inquilino Exemplo Bruno', 'Inquilina Exemplo Carla']):
    r = 8 + i
    iq[f'D{r}'], iq[f'E{r}'], iq[f'F{r}'], iq[f'I{r}'], iq[f'J{r}'] = nome, '000.000.000-00', '0000000 SSP/PR', 'Solteiro(a)', 'professor(a)'
    iq[f'K{r}'] = 'brasileira' if 'Inquilina' in nome else 'brasileiro'
contratos = [('Casa Exemplo', 'Inquilina Exemplo Ana', mes_antes(10), 30, 1500, 5),
             ('Apto Exemplo', 'Inquilino Exemplo Bruno', mes_antes(23), 30, 2200, 10),
             ('Sala Exemplo', 'Inquilina Exemplo Carla', mes_antes(4), 36, 3200, 30)]
for i, (imv, inq, ini, prazo, valor, dia) in enumerate(contratos):
    r = 8 + i
    ct[f'D{r}'], ct[f'E{r}'], ct[f'F{r}'], ct[f'G{r}'] = imv, inq, ini, prazo
    ct[f'I{r}'], ct[f'K{r}'], ct[f'L{r}'], ct[f'M{r}'], ct[f'P{r}'], ct[f'Q{r}'] = valor, dia, 12, 'IPCA', 0.02, 0.01
# um reajuste no histórico: o contrato do Bruno fez 1 ano e passou de R$ 2.200,00 para R$ 2.299,00 (IPCA 4,5%)
data_reaj = mes_antes(11)
rj['D8'], rj['E8'], rj['F8'], rj['G8'], rj['H8'] = data_reaj, 'Apto Exemplo | Inquilino Exemplo Bruno', 'IPCA', 0.045, 2299
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
        pg[f'G{lin}'] = 2299 if (i == 1 and ref >= data_reaj) else valor
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
cr['E5'] = 'Casa Exemplo | Inquilina Exemplo Ana'
cr['E7'] = 0.0466
gc['E5'] = 'Casa Exemplo | Inquilina Exemplo Ana'
gc['E8'] = 4500
rc['E6'] = mes_antes(1)
ex['E5'] = 'Apto Exemplo | Inquilino Exemplo Bruno'

if VAZIA:  # tira os exemplos: deixa só a estrutura e as fórmulas
    entradas = {pr: ('DEFGHIJKLMN', PR), im: ('DEFGHIJKLMN', IM), iq: ('DEFGHIJKLM', INQ), ct: ('DEFGIKLMPQR', CT),
                pg: ('DEFGHJK', PG), dp: ('DEFGHI', DP), rj: ('DEFGH', RJ)}
    for ws, (cols, faixa) in entradas.items():
        for col in cols:
            for r in range(faixa[0], faixa[1] + 1):
                ws[f'{col}{r}'].value = None
    for ws, refs in ((rc, ('E5', 'E6')), (cr, ('E5', 'E7')), (gc, ('E5', 'E8')), (ex, ('E5',))):
        for ref in refs:
            ws[ref].value = None

# ================================================================= ordem, cores e gravação
ordem = ['Painel', 'Como usar', 'Aluguéis do Mês', 'Em aberto', 'Extrato', 'Pagamentos', 'Contratos', 'Imóveis', 'Inquilinos',
         'Proprietários', 'Reajustes', 'Calcular reajuste', 'Gerar contrato', 'Despesas', 'Relatório IR', 'Recibo', 'Listas']
ordem = [n for n in ordem if n in wb.sheetnames]
assert len(ordem) == len(wb.sheetnames), set(wb.sheetnames) - set(ordem)
wb._sheets = [wb[n] for n in ordem]
cores = {'Reajustes': LARANJA, 'Calcular reajuste': LARANJA, 'Gerar contrato': AZUL, 'Painel': VERDE_ESC, 'Como usar': 'FACC15', 'Aluguéis do Mês': VERDE, 'Em aberto': VERMELHO, 'Extrato': VERDE,
         'Pagamentos': VERDE, 'Relatório IR': ROXO, 'Recibo': ROXO, 'Despesas': VERMELHO}
for ws in wb.worksheets:
    ws.sheet_properties.tabColor = cores.get(ws.title, '64748B')
    ws.sheet_view.zoomScale = 100
wb.active = 0
from openpyxl.workbook.properties import CalcProperties  # noqa: E402
wb.calculation = CalcProperties(fullCalcOnLoad=True)  # o Excel recalcula tudo ao abrir
wb.save(SAIDA)
print('ok', SAIDA)
