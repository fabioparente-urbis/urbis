"""
Monta o template base do Despacho do Slot 5 a partir do "Despacho Geral - Aprovacao.docx".

O Despacho Geral é o MESTRE: traz as 279 exigências possíveis e o roster de todos os analistas.
O template base guarda só a moldura — abertura, tabela de Controle de Etapas, parágrafo da CHEADV,
CONSIDERAÇÕES FINAIS, notas de rodapé legais e a linha da data — preservando estilos, numeração,
cabeçalho com logo e rodapé originais. O miolo (as exigências) e a assinatura entram em tempo de
geração, a partir do que o MAC marcou.

Corta:
  - body[5..904]  → as 279 exigências do mestre
  - body[915..975] → o roster de assinaturas de todos os analistas
Mantém body[0..4], body[905..914] e o sectPr final.
"""
import shutil, zipfile, re, sys, os
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
ORIG = "/Users/fabiomartinssantos/lip-interface/referencias-slot5/Despacho Geral - Aprovacao.docx"
DEST = "/Users/fabiomartinssantos/lip-interface/public/templates/despacho-slot5-base.docx"
TRAB = "/tmp/tpl_build"

CORTES = [(5, 905), (915, 976)]  # [inicio, fim) em índices de filhos do body

if os.path.exists(TRAB):
    shutil.rmtree(TRAB)
os.makedirs(TRAB)
with zipfile.ZipFile(ORIG) as z:
    z.extractall(TRAB)
# .docx de terceiros: symlink dentro do zip é vetor de escrita fora do diretório
for raiz, _, arqs in os.walk(TRAB):
    for a in arqs:
        cam = os.path.join(raiz, a)
        if os.path.islink(cam):
            os.unlink(cam)

doc_path = os.path.join(TRAB, "word/document.xml")
with open(doc_path, encoding="utf-8") as f:
    original = f.read()

# Registra TODOS os prefixos do documento original. Sem isso o ElementTree reescreve os
# namespaces que não conhece como ns0:, ns1:… e o arquivo sai com prefixo não declarado —
# o pandoc engole, o Word recusa.
for prefixo, uri in re.findall(r'xmlns:(\w+)="([^"]+)"', re.search(r"<w:document\s([^>]*?)>", original).group(1)):
    ET.register_namespace(prefixo, uri)

tree = ET.parse(doc_path)
root = tree.getroot()
body = root.find(W + "body")
kids = list(body)
print(f"body original: {len(kids)} filhos")

remover = set()
for ini, fim in CORTES:
    remover.update(range(ini, fim))
for i in sorted(remover, reverse=True):
    body.remove(kids[i])
print(f"body do template: {len(list(body))} filhos (removidos {len(remover)})")


def texto(el):
    return "".join(t.text or "" for t in el.iter(W + "t"))


for i, k in enumerate(list(body)):
    print(" ", i, k.tag.replace(W, ""), repr(texto(k)[:64]))

# Preserva as declarações de namespace do documento original: ET só reemite as que usa,
# e atributos como w14:paraId em elementos remanescentes referenciam prefixos que sumiriam.
cab = re.match(r"^<\?xml[^>]*\?>\s*", original)
ns_orig = re.search(r"<w:document\s([^>]*?)>", original).group(1)
corpo_novo = ET.tostring(root, encoding="unicode")
corpo_novo = re.sub(r"<(?:\w+:)?document\s[^>]*>", f"<w:document {ns_orig}>", corpo_novo, count=1)
corpo_novo = re.sub(r"</(?:\w+:)?document>", "</w:document>", corpo_novo, count=1)
with open(doc_path, "w", encoding="utf-8") as f:
    f.write((cab.group(0) if cab else '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n') + corpo_novo)

# ── Remove as imagens que só existiam no miolo cortado ───────────────────────
usados = set()
for nome in os.listdir(os.path.join(TRAB, "word")):
    if nome.endswith(".xml"):
        with open(os.path.join(TRAB, "word", nome), encoding="utf-8") as f:
            conteudo = f.read()
        usados.update(re.findall(r'r:(?:embed|id|link)="([^"]+)"', conteudo))

rels_dir = os.path.join(TRAB, "word/_rels")
apagados = 0
for relname in os.listdir(rels_dir):
    cam = os.path.join(rels_dir, relname)
    with open(cam, encoding="utf-8") as f:
        conteudo = f.read()
    tree_r = ET.parse(cam)
    root_r = tree_r.getroot()
    NSR = "{http://schemas.openxmlformats.org/package/2006/relationships}"
    for rel in list(root_r):
        rid = rel.get("Id")
        alvo = rel.get("Target") or ""
        if "image" in (rel.get("Type") or "") and rid not in usados:
            root_r.remove(rel)
            arq = os.path.normpath(os.path.join(TRAB, "word", alvo))
            if os.path.exists(arq):
                os.remove(arq)
                apagados += 1
    ET.register_namespace("", NSR[1:-1])
    tree_r.write(cam, encoding="UTF-8", xml_declaration=True)
print(f"imagens removidas: {apagados}")

os.makedirs(os.path.dirname(DEST), exist_ok=True)
if os.path.exists(DEST):
    os.remove(DEST)
with zipfile.ZipFile(DEST, "w", zipfile.ZIP_DEFLATED) as z:
    for raiz, _, arqs in os.walk(TRAB):
        for a in arqs:
            cam = os.path.join(raiz, a)
            z.write(cam, os.path.relpath(cam, TRAB))
print(f"gerado: {DEST}  ({os.path.getsize(DEST)/1024:.0f} KB, original {os.path.getsize(ORIG)/1024:.0f} KB)")
