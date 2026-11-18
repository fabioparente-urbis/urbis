"""Analisa a saída de scripts/estudo_modelos_gemini.mts (e do comparar_modelos_gemini.mts do Slot 5).
Uso: python3 scripts/estudo_modelos_gemini_analisar.py <pasta-da-saida>
Referências (referencias.json): ficha salva do LIP (processos.dados) e análise do MAC feita à mão.
"""
import json, sys, re, unicodedata, itertools, os
from statistics import mean

D = sys.argv[1]
REF = json.load(open(os.path.join(D, "referencias.json")))
MODELOS = ["gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"]

def norm(v):
    if v is None: return ""
    s = unicodedata.normalize("NFKD", str(v)).encode("ascii", "ignore").decode().lower().strip()
    s = re.sub(r"\s+", " ", s)
    if s in ("np", "n/a", "na", "-", "nao identificado", "null", "none"): return "np"
    # número: compara só o valor
    t = s.replace("m2", "").replace("m²", "").replace(" ", "")
    if re.fullmatch(r"[\d.,]+", t):
        if "," in t: t = t.replace(".", "").replace(",", ".")
        try:
            f = float(t)
            return ("%.2f" % f) if len(t) < 9 else re.sub(r"\D", "", s)  # códigos longos: só dígitos
        except: pass
    # data dd/mm/aaaa
    m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", s)
    if m:
        d, mo, a = m.groups(); a = ("20" + a) if len(a) == 2 else a
        return f"{int(d):02d}/{int(mo):02d}/{a}"
    return re.sub(r"[^a-z0-9]", "", s)

def igual(a, b):
    na, nb = norm(a), norm(b)
    if na == nb: return True
    if len(na) > 6 and len(nb) > 6 and (na in nb or nb in na): return True
    return False

def pares(lst):
    return list(itertools.combinations(lst, 2))

def lip(caso, slot):
    arq = os.path.join(D, f"{caso}.json")
    if not os.path.exists(arq): return None
    runs = json.load(open(arq))
    ref = {k: v.get("valor") for k, v in REF[slot]["lip"].items() if isinstance(v, dict) and norm(v.get("valor")) not in ("",)}
    out = {}
    for m in MODELOS:
        rs = [r for r in runs if r["modelo"] == m]
        oks = [r for r in rs if not r.get("erro") and r.get("job", {}).get("status") == "concluido"]
        camposR = []
        for r in oks:
            res = r["job"].get("resultado") or {}
            c = res.get("campos") or res.get("dados") or {}
            camposR.append({k: (v.get("valor") if isinstance(v, dict) else v) for k, v in c.items()})
        acertos = [sum(1 for k in ref if igual(c.get(k), ref[k])) for c in camposR]
        estab = [sum(1 for k in ref if igual(a.get(k), b.get(k))) / len(ref) for a, b in pares(camposR)]
        out[m] = dict(rodadas=len(rs), ok=len(oks), erros=[r.get("erro") or r.get("job", {}).get("erro") for r in rs if r not in oks],
                      acerto=[round(100 * x / len(ref)) for x in acertos], estab=round(100 * mean(estab)) if estab else None,
                      usd=round(mean([r["custo"]["usd"] for r in oks]), 4) if oks else None,
                      seg=round(mean([r["segundos"] for r in oks])) if oks else None,
                      tok=round(mean([r["custo"]["entrada"] + r["custo"]["saida"] + r["custo"]["raciocinio"] for r in oks])) if oks else None)
    return len(ref), out

def mac(caso, slot):
    arq = os.path.join(D, f"{caso}.json")
    if not os.path.exists(arq): return None
    runs = json.load(open(arq))
    ativos = set().union(*[set(r.get("resposta", {}).get("itens", {}).keys()) for r in runs])
    ref = {k: v for k, v in REF[slot]["mac"].items() if v and k in ativos}
    out = {}
    for m in MODELOS:
        rs = [r for r in runs if r["modelo"] == m]
        oks = [r for r in rs if r.get("resposta", {}).get("ok")]
        its = [r["resposta"]["itens"] for r in oks]
        acertos = [sum(1 for k in ref if i.get(k) == ref[k]) for i in its]
        estab = [sum(1 for k in ref if a.get(k) == b.get(k)) / len(ref) for a, b in pares(its)]
        verdes = [sum(1 for v in i.values() if v == "conforme") for i in its]
        nc = [sum(1 for v in i.values() if v == "nao_conforme") for i in its]
        out[m] = dict(rodadas=len(rs), ok=len(oks), acerto=[round(100 * x / len(ref)) for x in acertos],
                      estab=round(100 * mean(estab)) if estab else None, verde=verdes, nao_conforme=nc,
                      usd=round(mean([r["custo"]["usd"] for r in oks]), 4) if oks else None,
                      seg=round(mean([r["segundos"] for r in oks])) if oks else None,
                      tok=round(mean([r["custo"]["entrada"] + r["custo"]["saida"] + r["custo"]["raciocinio"] for r in oks])) if oks else None)
    return len(ref), out

def s5mac():
    arq = os.path.join(D, "s5-mac.json")
    if not os.path.exists(arq): return None
    j = json.load(open(arq)); ref = j["respondidos"]; ids = j["pendentes"]
    PRECO = {"gemini-2.5-flash": (0.30, 2.50), "gemini-3.5-flash-lite": (0.30, 2.50), "gemini-3.6-flash": (0.75, 3.75)}
    out = {}
    for m in MODELOS:
        rs = [r for r in j["rodadas"] if r["modelo"] == m and r.get("itens")]
        its = [r["itens"] for r in rs]
        acertos = [sum(1 for k in ids if i.get(k) == ref.get(k)) for i in its]
        estab = [sum(1 for k in ids if a.get(k) == b.get(k)) / len(ids) for a, b in pares(its)]
        def usd(r):
            u = r.get("uso") or {}; pe, ps = PRECO[m]
            return (u.get("promptTokenCount", 0) * pe + (u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)) * ps) / 1e6
        out[m] = dict(ok=len(rs), acerto=[round(100 * x / len(ids)) for x in acertos], estab=round(100 * mean(estab)) if estab else None,
                      usd=round(mean([usd(r) for r in rs]), 4) if rs else None, seg=round(mean([r["segundos"] for r in rs])) if rs else None,
                      tok=round(mean([r.get("tokens") or 0 for r in rs])) if rs else None)
    return len(ids), out

res = {"s1-lip": lip("s1-lip", "s1"), "s2-lip": lip("s2-lip", "s2"), "s5-lip": lip("s5-lip", "s5"),
       "s1-mac": mac("s1-mac", "s1"), "s2-mac": mac("s2-mac", "s2"), "s5-mac": s5mac()}
for k, v in res.items():
    if not v: print(k, "— sem dados"); continue
    n, o = v
    print(f"\n== {k} (referência: {n} itens/campos) ==")
    for m, x in o.items(): print(f"  {m:24s} {x}")
json.dump(res, open(os.path.join(D, "resumo.json"), "w"), indent=1)
