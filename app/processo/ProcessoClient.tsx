"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Origem = "original" | "urbis" | "manual" | "padrao";
type Campo = { valor: string; origem: Origem; fonte?: string };
type EventoHistorico = {
  id: string;
  operacao: string;
  criado_em: string;
  campos: { campo: string; de: string; para: string }[];
  snapshot: Record<string, Campo> | null;
};

type TipoProcesso = "Regularização" | "Aceite" | "Aprovação";

function base(valor = ""): Campo { return { valor, origem: "original" }; }
function padrao(valor: string): Campo { return { valor, origem: "padrao" }; }
function cor(origem: Origem) {
  if (origem === "urbis") return "text-red-600";
  if (origem === "manual") return "text-blue-600";
  if (origem === "padrao") return "text-orange-500";
  return "text-black";
}
function borderCor(origem: Origem, valor: string) {
  if (origem === "padrao" && valor.trim() === "") return "border-orange-400 border-2";
  return "border-gray-300";
}

const CAMPOS_LIP: Partial<Record<string, string>> = {
  proprietario: "Proprietário", logradouro: "Logradouro", quadra: "Quadra",
  lote: "Lote", bairro: "Bairro", iptu: "IPTU",
  areaTotal: "Área Total", areaForaFrontal: "Área fora do Frontal",
  areaRecuo: "Área em Recuo", areaTerreno: "Área do Terreno",
  areaImpermeavel: "Área Impermeável", tipoUso: "Tipo de Uso do Solo",
  usoDefinido: "Uso sem definição", corredor: "Corredor Viário",
  despacho: "Despacho CHEADV",
  pav: "Nº de Pavimentos", unid: "Nº de Unidades",
  cnae1: "CNAE 1", cnae2: "CNAE 2", cnae3: "CNAE 3", cnae4: "CNAE 4", cnae5: "CNAE 5",
  caixa: "Caixa de Recarga", faixa: "Faixa de Ampliação",
  numeroUso: "Nº Uso para Aprovação",
  usoSolo: "Uso do Solo (nº SEI)", certidao: "Certidão de Matrícula",
  levantamento: "Levantamento / Arquitetura", artLev: "ART/RRT de Levantamento",
  artCx: "ART/RRT da Caixa", laudo: "Laudo Técnico",
  vistoria: "Vistoria Fiscal", foto: "Foto do Google",
  outro: "Outro processo", qualOutro: "Nº outro processo",
  embargo: "Embargo", existente: "Área Existente Aprovada",
  tombado: "Área tombada", procuracao: "Procuração", onerosa: "Onerosa",
};

const CAMPO_ABA: Partial<Record<string, number>> = {
  proprietario: 0, logradouro: 0, quadra: 0, lote: 0, bairro: 0, iptu: 0,
  areaTotal: 1, areaForaFrontal: 1, areaRecuo: 1, areaTerreno: 1, areaImpermeavel: 1,
  despacho: 2, tipoUso: 2, usoDefinido: 2, numeroUso: 2, corredor: 2,
  cnae1: 2, cnae2: 2, cnae3: 2, cnae4: 2, cnae5: 2,
  faixa: 3, caixa: 3, volMin: 3, volAt: 3, caixas: 3,
  pav: 4, unid: 4, existente: 4,
  outro: 5, qualOutro: 5, embargo: 5, tombado: 5, procuracao: 5, onerosa: 5,
  certidao: 6, levantamento: 6, artLev: 6, artCx: 6,
  laudo: 6, vistoria: 6, usoSolo: 6, foto: 6,
};

const CORES_DIA = [
  { bg: "bg-yellow-400", border: "border-yellow-400", text: "text-yellow-400" },
  { bg: "bg-orange-500", border: "border-orange-500", text: "text-orange-500" },
  { bg: "bg-red-500",    border: "border-red-500",    text: "text-red-500"    },
  { bg: "bg-cyan-400",   border: "border-cyan-400",   text: "text-cyan-400"   },
  { bg: "bg-pink-400",   border: "border-pink-400",   text: "text-pink-400"   },
  { bg: "bg-green-500",  border: "border-green-500",  text: "text-green-500"  },
];

function corParaData(dataEvento: string) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const data = new Date(dataEvento); data.setHours(0, 0, 0, 0);
  const diffDias = Math.floor((hoje.getTime() - data.getTime()) / (1000 * 60 * 60 * 24));
  return CORES_DIA[Math.min(diffDias, CORES_DIA.length - 1)];
}

function opacidadeEvento(indice: number, total: number): number {
  if (total <= 1) return 1;
  return 1 - (indice / (total - 1)) * 0.7;
}

function formatarDataCompleta(dataStr: string) {
  return new Date(dataStr).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Toast({ msg, tipo, onClose }: { msg: string; tipo: "sucesso" | "erro" | "info"; onClose: () => void }) {
  const bg = tipo === "sucesso" ? "bg-green-700 border-green-500" : tipo === "erro" ? "bg-red-800 border-red-500" : "bg-blue-800 border-blue-500";
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, []);
  return (
    <div className={`fixed bottom-6 right-6 z-50 ${bg} border text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-3 max-w-sm`}>
      <span>{msg}</span>
      <button onClick={onClose} className="text-white opacity-60 hover:opacity-100 ml-2">✕</button>
    </div>
  );
}

export default function ProcessoClient() {
  const params = useParams();
  const router = useRouter();
  const idUrl = (params?.id as string) ?? "";

  const [aba, setAba] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [statusSalvo, setStatusSalvo] = useState<"idle"|"salvando"|"salvo"|"erro">("idle");
  const [carregando, setCarregando] = useState(false);
  const [erroCampos, setErroCampos] = useState(false);
  const [lendoLip, setLendoLip] = useState(false);
  const [bloqueadosLip, setBloqueadosLip] = useState<string[]>([]);

  const [historico, setHistorico] = useState<EventoHistorico[]>([]);
  const [eventoAberto, setEventoAberto] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [novoProcesso, setNovoProcesso] = useState("");
  const [tipoNavegacao, setTipoNavegacao] = useState<TipoProcesso>("Regularização");
  const [toast, setToast] = useState<{ msg: string; tipo: "sucesso"|"erro"|"info" } | null>(null);

  const inputFileRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapRef = useRef<typeof estadoInicial | null>(null);

  const estadoInicial = {
    proprietario: padrao(""), logradouro: padrao(""), processo: base(),
    quadra: padrao(""), lote: padrao(""), bairro: padrao(""), iptu: padrao(""),
    areaTotal: padrao(""), areaForaFrontal: padrao(""), areaVertical: padrao("0"),
    areaRecuo: padrao(""), areaTerreno: padrao(""), areaImpermeavel: padrao(""),
    despacho: padrao(""), tipoUso: padrao("APROVAÇÃO DE PROJETO"),
    usoDefinido: padrao("Não"), numeroUso: padrao(""),
    cnae1: padrao("NP"), cnae2: padrao("NP"), cnae3: padrao("NP"),
    cnae4: padrao("NP"), cnae5: padrao("NP"),
    corredor: padrao("Não"), faixa: padrao("NP"), caixa: padrao("Não"),
    volMin: padrao("NP"), volAt: padrao("NP"), caixas: padrao("NP"),
    pav: padrao(""), unid: padrao(""), existente: padrao("Não"),
    outro: padrao("Não"), qualOutro: padrao("NP"), pag: base(),
    embargo: padrao("Não"), dataEmb: padrao("NP"), tombado: padrao("NP"),
    procuracao: padrao("Não"), onerosa: padrao("Não"),
    certidao: padrao(""), levantamento: padrao(""), artLev: padrao(""), artCx: padrao(""),
    laudo: padrao(""), vistoria: padrao(""), usoSolo: padrao(""), foto: padrao(""),
  };

  const [d, setD] = useState(estadoInicial);

  function mostrarToast(msg: string, tipo: "sucesso"|"erro"|"info" = "info") {
    setToast({ msg, tipo });
  }

  async function carregarHistorico() {
    try {
      const res = await fetch(`/api/processo/historico?id=${idUrl}`);
      const json = await res.json();
      if (json?.ok) setHistorico(json.data ?? []);
    } catch {}
  }

  useEffect(() => {
    if (!idUrl) return;
    async function carregar() {
      try {
        setCarregando(true);
        const res = await fetch(`/api/processo/carregar?id=${idUrl}`);
        const texto = await res.text();
        let json: any = null;
        try { json = texto ? JSON.parse(texto) : null; } catch {
          setD((prev) => ({ ...prev, processo: { valor: idUrl, origem: "urbis" } })); return;
        }
        if (!json?.ok || !json?.data?.dados) {
          setD((prev) => ({ ...prev, processo: { valor: idUrl, origem: "urbis" } })); return;
        }
        const dadosSalvos = json.data.dados;
        setD((prev) => {
          const atualizado = { ...prev };
          for (const chave in atualizado) {
            const key = chave as keyof typeof atualizado;
            const salvo = dadosSalvos[key];
            if (salvo && typeof salvo === "object" && "valor" in salvo && "origem" in salvo) {
              atualizado[key] = {
                valor: salvo.valor ?? "",
                origem: salvo.origem ?? "manual",
                fonte: salvo.fonte,
              };
            }
          }
          atualizado.processo = { valor: idUrl, origem: "urbis" };
          snapRef.current = atualizado;
          return atualizado;
        });
      } catch (e) {
        console.error("Erro ao carregar:", e);
        setD((prev) => ({ ...prev, processo: { valor: idUrl, origem: "urbis" } }));
      } finally {
        setCarregando(false);
      }
    }
    carregar();
    carregarHistorico();
  }, [idUrl]);

  const autoSalvar = useCallback((estado: typeof d) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const temPadrao = Object.values(estado).some((c) => c.origem === "padrao" && c.valor.trim() === "");
      if (temPadrao) return;
      const iguais = snapRef.current && Object.keys(estado).every(
        (k) => estado[k as keyof typeof estado].valor === snapRef.current![k as keyof typeof estado].valor
      );
      if (iguais) return;
      try {
        setStatusSalvo("salvando");
        const res = await fetch("/api/processo/salvar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: idUrl, dados: estado }),
        });
        const json = await res.json();
        if (json?.ok) {
          snapRef.current = estado;
          setStatusSalvo("salvo");
          await carregarHistorico();
          setTimeout(() => setStatusSalvo("idle"), 3000);
        } else {
          setStatusSalvo("erro");
        }
      } catch { setStatusSalvo("erro"); }
    }, 2000);
  }, [idUrl]);

  function u(campo: keyof typeof d, valor: string) {
    setD((prev) => {
      const novo = { ...prev, [campo]: { valor, origem: "manual" as Origem } };
      autoSalvar(novo);
      return novo;
    });
  }

  function confirmar(campo: keyof typeof d) {
    if (d[campo].origem === "padrao") {
      setD((prev) => {
        const novo = { ...prev, [campo]: { valor: prev[campo].valor, origem: "manual" as Origem } };
        autoSalvar(novo);
        return novo;
      });
    }
  }

  function navegarParaProcesso() {
    const id = novoProcesso.trim();
    if (!id) return;
    router.push(`/processo/${encodeURIComponent(id)}?tipo=${tipoNavegacao}`);
    setNovoProcesso("");
  }

  function limparBloqueadosEReler() {
    setD((prev) => {
      const novo = { ...prev };
      for (const campo of bloqueadosLip) novo[campo as keyof typeof novo] = base();
      return novo;
    });
    setBloqueadosLip([]);
    inputFileRef.current?.click();
  }

  async function lerLip(arquivo: File) {
    try {
      setLendoLip(true); setBloqueadosLip([]);
      const formData = new FormData();
      formData.append("pdf", arquivo);
      const res = await fetch("/api/lip/analisar", { method: "POST", body: formData });
      const json = await res.json();
      if (!json.ok) {
        mostrarToast("Erro ao ler LIP: " + json.erro, "erro");
        return;
      }
      const c = json.campos;
      const bloqueados: string[] = [];

      setD((prev) => {
        const novo = { ...prev };

        function aplicar(campo: keyof typeof novo, itemLip: { valor: string; fonte: string } | null | undefined) {
          if (!itemLip?.valor) return;
          if (novo[campo].origem === "manual" && novo[campo].valor.trim() !== "") {
            bloqueados.push(campo as string); return;
          }
          if (novo[campo].origem === "padrao" || novo[campo].origem === "original" || novo[campo].valor.trim() === "") {
            novo[campo] = { valor: itemLip.valor, origem: "original", fonte: itemLip.fonte };
          }
        }

        aplicar("proprietario",    c.proprietario);
        aplicar("logradouro",      c.logradouro);
        aplicar("quadra",          c.quadra);
        aplicar("lote",            c.lote);
        aplicar("bairro",          c.bairro);
        aplicar("iptu",            c.iptu);
        aplicar("areaTotal",       c.areaTotal);
        aplicar("areaForaFrontal", c.areaForaFrontal);
        aplicar("areaRecuo",       c.areaRecuo);
        aplicar("areaTerreno",     c.areaTerreno);
        aplicar("areaImpermeavel", c.areaImpermeavel);
        aplicar("tipoUso",         c.tipoUso);
        aplicar("usoDefinido",     c.usoDefinido);
        aplicar("numeroUso",       c.numeroUso);
        aplicar("despacho",        c.despacho);
        aplicar("cnae1",           c.cnae1);
        aplicar("cnae2",           c.cnae2);
        aplicar("cnae3",           c.cnae3);
        aplicar("cnae4",           c.cnae4);
        aplicar("cnae5",           c.cnae5);
        aplicar("corredor",        c.corredor);
        aplicar("faixa",           c.faixa);
        aplicar("caixa",           c.caixa);
        aplicar("volMin",          c.volMin);
        aplicar("volAt",           c.volAt);
        aplicar("caixas",          c.caixas);
        aplicar("pav",             c.pav);
        aplicar("unid",            c.unid);
        aplicar("existente",       c.existente);
        aplicar("outro",           c.outro);
        aplicar("qualOutro",       c.qualOutro);
        aplicar("embargo",         c.embargo);
        aplicar("dataEmb",         c.dataEmb);
        aplicar("tombado",         c.tombado);
        aplicar("procuracao",      c.procuracao);
        aplicar("onerosa",         c.onerosa);
        aplicar("usoSolo",         c.numeroUso);
        aplicar("certidao",        c.certidao);
        aplicar("levantamento",    c.levantamento);
        aplicar("artLev",          c.artLev);
        aplicar("artCx",           c.artCx);
        aplicar("laudo",           c.laudo);
        aplicar("vistoria",        c.vistoria);
        aplicar("foto",            c.foto);

        return novo;
      });

      setBloqueadosLip(bloqueados);

      if (bloqueados.length === 0) {
        mostrarToast("✅ LIP lido com sucesso! Confira os campos em preto.", "sucesso");
      } else {
        mostrarToast(`LIP lido. ${bloqueados.length} campo(s) com preenchimento manual — verifique os avisos nas abas.`, "info");
      }
    } catch (e: any) {
      mostrarToast("Erro: " + e.message, "erro");
    } finally {
      setLendoLip(false);
    }
  }

  async function salvar() {
    const totalPadrao = Object.values(d).filter((c) => c.origem === "padrao" && c.valor.trim() === "").length;
    if (totalPadrao > 0) { setErroCampos(true); return; }
    setErroCampos(false);
    try {
      setSalvando(true); setStatusSalvo("salvando");
      const res = await fetch("/api/processo/salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idUrl, dados: d }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        mostrarToast("Erro ao salvar: " + JSON.stringify(json), "erro");
        setStatusSalvo("erro"); return;
      }
      snapRef.current = d;
      setStatusSalvo("salvo");
      await carregarHistorico();
      setTimeout(() => setStatusSalvo("idle"), 3000);
    } catch (e: any) {
      mostrarToast("Erro: " + (e?.message || "desconhecido"), "erro");
      setStatusSalvo("erro");
    } finally { setSalvando(false); }
  }

  async function restaurar(evento: EventoHistorico) {
    if (!evento.snapshot) { mostrarToast("Snapshot não disponível.", "erro"); return; }
    try {
      setRestaurando(evento.id);
      const res = await fetch("/api/processo/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditoria_id: evento.id, codigo: idUrl }),
      });
      const json = await res.json();
      if (!json?.ok) { mostrarToast("Erro ao restaurar: " + json.erro, "erro"); return; }
      setD((prev) => {
        const novo = { ...prev };
        for (const chave in novo) {
          const key = chave as keyof typeof novo;
          const salvo = json.dados[key];
          if (salvo && typeof salvo === "object" && "valor" in salvo && "origem" in salvo) {
            novo[key] = { valor: salvo.valor ?? "", origem: salvo.origem ?? "manual", fonte: salvo.fonte };
          }
        }
        novo.processo = { valor: idUrl, origem: "urbis" };
        snapRef.current = novo;
        return novo;
      });
      setConfirmando(null);
      setEventoAberto(null);
      await carregarHistorico();
      setStatusSalvo("salvo");
      mostrarToast("✅ Processo restaurado com sucesso!", "sucesso");
      setTimeout(() => setStatusSalvo("idle"), 3000);
    } catch (e: any) {
      mostrarToast("Erro: " + e.message, "erro");
    } finally {
      setRestaurando(null);
    }
  }

  const totalPadrao = Object.values(d).filter((c) => c.origem === "padrao" && c.valor.trim() === "").length;

  function bloqueadosDaAba(i: number) { return bloqueadosLip.filter((c) => CAMPO_ABA[c] === i); }
  function temConflitosNaAba(i: number) { return bloqueadosDaAba(i).length > 0; }

  function AvisoLip({ indiceAba }: { indiceAba: number }) {
    const bloqueados = bloqueadosDaAba(indiceAba);
    const naoEncontrados = Object.entries(CAMPO_ABA)
      .filter(([, aba]) => aba === indiceAba)
      .map(([campo]) => campo)
      .filter((campo) => {
        const c = d[campo as keyof typeof d];
        return c?.origem === "padrao" && c?.valor.trim() === "";
      });

    if (bloqueados.length === 0 && naoEncontrados.length === 0) return null;

    return (
      <>
        {bloqueados.length > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-300 rounded-lg p-3 flex flex-col gap-2">
            <p className="text-sm text-blue-800 font-semibold">
              📋 O LIP encontrou dados para: <span className="font-normal">{bloqueados.map((c) => CAMPOS_LIP[c] ?? c).join(", ")}</span>
            </p>
            <p className="text-xs text-blue-700">Esses campos não foram atualizados pois possuem preenchimento manual.</p>
            <button onClick={limparBloqueadosEReler}
              className="self-start bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors">
              🗑️ Limpar campos e reler PDF
            </button>
          </div>
        )}
        {naoEncontrados.length > 0 && (
          <div className="mb-4 bg-amber-950 border border-amber-600 rounded-xl p-3">
            <p className="text-xs font-bold text-amber-300 mb-1">🔍 Verificar manualmente:</p>
            <ul className="space-y-0.5">
              {naoEncontrados.map((campo) => (
                <li key={campo} className="text-xs text-amber-200 flex gap-2">
                  <span className="text-amber-400">•</span>
                  <span>{CAMPOS_LIP[campo] ?? campo} — não encontrado</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  }

  function I(campo: keyof typeof d, label: string, placeholder?: string) {
    const isPadrao = d[campo].origem === "padrao";
    const fonte = d[campo].fonte;
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
          {label}{isPadrao && d[campo].valor.trim() === "" && <span className="ml-1 text-orange-500 font-bold">⚠ CONFERIR</span>}
        </label>
        <input value={d[campo].valor} onChange={(e) => u(campo, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirmar(campo)}
          placeholder={placeholder ?? label}
          className={`w-full rounded border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${cor(d[campo].origem)} ${borderCor(d[campo].origem, d[campo].valor)}`} />
        {fonte && d[campo].origem === "original" && (
          <span className="text-xs text-gray-400 italic">📍 {fonte}</span>
        )}
      </div>
    );
  }

  function S(campo: keyof typeof d, label: string, opcoes: string[]) {
    const isPadrao = d[campo].origem === "padrao";
    const fonte = d[campo].fonte;
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
          {label}{isPadrao && d[campo].valor.trim() === "" && <span className="ml-1 text-orange-500 font-bold">⚠ CONFERIR</span>}
        </label>
        <select value={d[campo].valor} onChange={(e) => u(campo, e.target.value)}
          className={`w-full rounded border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${cor(d[campo].origem)} ${borderCor(d[campo].origem, d[campo].valor)}`}>
          <option value="">— selecione —</option>
          {opcoes.map((op) => <option key={op} value={op}>{op}</option>)}
        </select>
        {fonte && d[campo].origem === "original" && (
          <span className="text-xs text-gray-400 italic">📍 {fonte}</span>
        )}
      </div>
    );
  }

  const abas = [
    { nome: "1. Identificação", dica: "Ver no carimbo do projeto e no Uso do Solo", render: () => (<><AvisoLip indiceAba={0} /><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{I("proprietario","Proprietário","Ver no carimbo do projeto")}{I("logradouro","Logradouro","Ver no carimbo do projeto")}{I("processo","Processo Nº","Ver no Uso do Solo")}<div className="grid grid-cols-2 gap-2">{I("quadra","Quadra (Qd.)","Ver no carimbo")}{I("lote","Lote (Lt.)","Ver no carimbo")}</div>{I("bairro","Bairro","Ver no carimbo do projeto")}{I("iptu","IPTU","Ver no Uso do Solo")}</div></>) },
    { nome: "2. Áreas", dica: "Ver no carimbo do projeto", render: () => (<><AvisoLip indiceAba={1} /><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{I("areaTotal","Á. a ser Regularizada TOTAL","Ver no carimbo")}{I("areaForaFrontal","Á. a ser Regularizada fora do frontal","Ver no carimbo")}{I("areaVertical","Á. a ser Regularizada em Ed. Vertical","0 se não houver")}{I("areaRecuo","Á. Construída em Recuo Frontal","Ver no carimbo")}{I("areaTerreno","Área do Terreno","Ver no carimbo")}{I("areaImpermeavel","Área Impermeável","Área do Lote menos Área Permeável")}</div></>) },
    { nome: "3. Uso do Solo", dica: "Ver no documento de Uso do Solo e Despacho da CHEADV", render: () => (<><AvisoLip indiceAba={2} /><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{I("despacho","Despacho CHEADV","Ver no despacho")}{I("tipoUso","Tipo de Uso do Solo","Ver no Uso do Solo")}{S("usoDefinido","Uso de Solo sem uso definido?",["Sim","Não"])}{I("numeroUso","Nº Uso para Aprovação","Ver no Uso do Solo")}<div className="md:col-span-2 border-t pt-4"><p className="text-xs text-gray-400 mb-3 font-semibold uppercase">CNAEs — se não houver, preencher NP</p><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{I("cnae1","Descrição CNAE 1","Se não houver: NP")}{I("cnae2","Descrição CNAE 2","Se não houver: NP")}{I("cnae3","Descrição CNAE 3","Se não houver: NP")}{I("cnae4","Descrição CNAE 4","Se não houver: NP")}{I("cnae5","Descrição CNAE 5","Se não houver: NP")}</div></div></div></>) },
    { nome: "4. Urbanístico", dica: "Ver no Uso do Solo e projeto", render: () => (<><AvisoLip indiceAba={3} /><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{S("corredor","Corredor Viário?",["Sim","Não"])}{I("faixa","Faixa de Ampliação?","Se não houver: NP")}{S("caixa","Caixa de Recarga?",["Sim","Não"])}{I("areaImpermeavel","Área Impermeável","Área do Lote menos Área Permeável")}{I("volMin","Vol. Mínimo da Caixa","Se não houver: NP")}{I("volAt","Vol. Atendido da Caixa","Se não houver: NP")}{I("caixas","Nº de Caixas","Se não houver: NP")}</div></>) },
    { nome: "5. Edificação", dica: "Ver no carimbo do projeto", render: () => (<><AvisoLip indiceAba={4} /><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{I("pav","Número de Pavimentos","Ver no carimbo")}{I("unid","Número de Unidades","Ver no carimbo")}{S("existente","Área Existente Aprovada?",["Sim","Não"])}</div></>) },
    { nome: "6. Processo", dica: "Ver no SEI e histórico do processo", render: () => (<><AvisoLip indiceAba={5} /><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{S("outro","Existe outro processo?",["Sim","Não"])}{I("qualOutro","Qual o nº do outro processo?","Se não houver: NP")}{I("pag","Pág. do SEI (Busca Arq.)","")}{S("embargo","Tem Embargo?",["Sim","Não"])}{I("dataEmb","Data do Embargo","Se não houver: NP")}{I("tombado","É área tombada?","Se não houver: NP")}{S("procuracao","Tem Procuração?",["Sim","Não","NP"])}{S("onerosa","Onerosa?",["Sim","Não","NP"])}</div></>) },
    { nome: "7. Documentos", dica: "Ver número do documento no SEI", render: () => (<><AvisoLip indiceAba={6} /><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{I("certidao","Certidão de Matrícula","Nº SEI")}{I("levantamento","Levantamento / Arquitetura","Nº SEI")}{I("artLev","ART/RRT de Levantamento","Nº SEI")}{I("artCx","ART/RRT da Caixa de Recarga","Nº SEI")}{I("laudo","Laudo Técnico","Nº SEI")}{I("vistoria","Vistoria Fiscal e Laudo Reg.","Nº SEI")}{I("usoSolo","Uso do Solo para Aprovação","Nº SEI")}{I("foto","Foto do Google","Nº SEI")}</div></>) },
  ];

  const atual = abas[aba];
  const isUltimaAba = aba === abas.length - 1;
  const legenda = [
    { cor: "bg-black", label: "Original (documento)" },
    { cor: "bg-red-600", label: "Urbis (automático)" },
    { cor: "bg-blue-600", label: "Manual (digitado)" },
    { cor: "bg-orange-500", label: "Padrão (conferir!)" },
  ];

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 text-white">

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} onClose={() => setToast(null)} />}

      {/* CABEÇALHO */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push("/")}
            className="mt-1 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1">
            🏠 Home
          </button>
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
            className="mt-1 bg-red-800 hover:bg-red-700 text-red-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1">
            🚪 Sair
          </button>
          <button onClick={() => router.push(`/analise/${encodeURIComponent(idUrl)}`)}
  className="mt-1 bg-purple-700 hover:bg-purple-600 text-purple-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1">
  🔍 MAC
</button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">📋 Cadastro de Processo</h1>
            <p className="text-slate-400 text-sm mt-1">
              Processo: <span className="text-yellow-400 font-mono">{idUrl || "—"}</span>
              {" · "}<span className="text-slate-500">Regularização</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-xs h-5">
            {statusSalvo === "salvando" && <span className="text-yellow-400 animate-pulse">⏳ Salvando...</span>}
            {statusSalvo === "salvo" && <span className="text-green-400">✓ Salvo automaticamente</span>}
            {statusSalvo === "erro" && <span className="text-red-400">✗ Erro ao salvar</span>}
          </div>
          <div className="hidden md:flex flex-col gap-1 text-xs">
            {legenda.map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${l.cor}`} />
                <span className="text-slate-400">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO */}
      <div className="bg-slate-800 border border-slate-600 rounded-xl p-3 mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-slate-400 text-sm whitespace-nowrap">🔍 Ir para processo:</span>
        <input
          value={novoProcesso}
          onChange={(e) => setNovoProcesso(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && navegarParaProcesso()}
          placeholder="Ex: 25.5.000082553-3"
          className="flex-1 min-w-[180px] bg-slate-700 border border-slate-500 rounded px-3 py-1.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={tipoNavegacao}
          onChange={(e) => setTipoNavegacao(e.target.value as TipoProcesso)}
          className="bg-slate-700 border border-slate-500 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="Regularização">Regularização</option>
          <option value="Aceite">Aceite</option>
          <option value="Aprovação">Aprovação</option>
        </select>
        <button
          onClick={navegarParaProcesso}
          disabled={!novoProcesso.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap"
        >
          Abrir →
        </button>
      </div>

      {/* BLOCO LIP */}
      <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 mb-4 flex items-center gap-4">
        <div>
          <p className="text-sm font-bold text-white">📄 Leitura Inteligente do LIP</p>
          <p className="text-xs text-slate-400 mt-0.5">Faça upload do PDF e os campos serão preenchidos automaticamente</p>
        </div>
        <label className={`ml-auto cursor-pointer px-4 py-2 rounded font-bold text-sm transition-colors ${lendoLip ? "bg-slate-600 text-slate-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-500 text-white"}`}>
          {lendoLip ? "⏳ Lendo..." : "📎 Upload PDF"}
          <input ref={inputFileRef} type="file" accept=".pdf" className="hidden" disabled={lendoLip}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) lerLip(f); e.target.value = ""; }} />
        </label>
      </div>

      {carregando && <div className="bg-yellow-900 border border-yellow-500 text-yellow-300 px-4 py-2 rounded mb-4 text-sm">⏳ Carregando dados do processo...</div>}
      {totalPadrao > 0 && <div className="bg-orange-900 border border-orange-500 text-orange-200 px-4 py-2 rounded mb-4 text-sm">⚠️ <strong>{totalPadrao} campo(s)</strong> em laranja precisam ser conferidos. Pressione <strong>Enter</strong> para confirmar.</div>}
      {erroCampos && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-2 rounded mb-4 text-sm">❌ Confira todos os campos em laranja antes de salvar!</div>}

      {/* ABAS */}
      <div className="flex flex-wrap gap-2 mb-4">
        {abas.map((a, i) => (
          <button key={i} onClick={() => setAba(i)}
            className={`relative px-3 py-1.5 rounded text-sm font-medium transition-colors ${aba === i ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
            {a.nome}
            {temConflitosNaAba(i) && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-400 rounded-full border border-slate-900" />}
          </button>
        ))}
      </div>

      {/* FORMULÁRIO */}
      <div className="bg-white text-black p-5 rounded-xl shadow-lg space-y-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{atual.nome}</h2>
            <p className="text-xs text-slate-400 mt-0.5">💡 {atual.dica}</p>
          </div>
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">{aba + 1} / {abas.length}</span>
        </div>
        {atual.render()}
      </div>

      {/* NAVEGAÇÃO ABAS */}
      <div className="flex items-center gap-3 mt-4">
        <button onClick={() => setAba((a) => a - 1)} disabled={aba === 0}
          className="bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded font-medium text-sm transition-colors">
          ← Voltar
        </button>
        {!isUltimaAba && (
          <button onClick={() => setAba((a) => a + 1)}
            className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-medium text-sm transition-colors">
            Próxima →
          </button>
        )}
        <button onClick={salvar} disabled={salvando}
          className="ml-auto bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded font-bold text-black text-sm transition-colors">
          {salvando ? "Salvando..." : "💾 Salvar"}
        </button>
      </div>

      {/* PROGRESSO */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Progresso</span><span>{aba + 1} de {abas.length} abas</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-1.5">
          <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${((aba + 1) / abas.length) * 100}%` }} />
        </div>
      </div>

      {/* HISTÓRICO */}
      <div className="mt-8">
        <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wide">🕐 Histórico de Alterações</h3>
        {historico.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma alteração registrada ainda.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-700" />
            <div className="flex flex-col gap-4">
              {historico.map((ev, idx) => {
                const cores = corParaData(ev.criado_em);
                const opacidade = opacidadeEvento(idx, historico.length);
                const aberto = eventoAberto === ev.id;
                const esteConfirmando = confirmando === ev.id;
                const esteRestaurando = restaurando === ev.id;
                return (
                  <div key={ev.id} className="relative flex items-start gap-4 pl-10">
                    <div
                      className={`absolute left-2 w-5 h-5 rounded-full border-2 ${cores.border} cursor-pointer transition-transform hover:scale-125 flex items-center justify-center`}
                      style={{ opacity: opacidade }}
                      onClick={() => { setEventoAberto(aberto ? null : ev.id); setConfirmando(null); }}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${cores.bg}`} />
                    </div>
                    <div className="flex-1" style={{ opacity: opacidade }}>
                      <button
                        onClick={() => { setEventoAberto(aberto ? null : ev.id); setConfirmando(null); }}
                        className={`text-xs font-mono ${cores.text} hover:underline`}
                      >
                        {formatarDataCompleta(ev.criado_em)} — {ev.campos.length > 0 ? `${ev.campos.length} campo(s) alterado(s)` : ev.operacao}
                      </button>
                      {aberto && (
                        <div className="mt-2 bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs">
                          {ev.campos.length > 0 ? (
                            <table className="w-full mb-3">
                              <thead>
                                <tr className="text-slate-400">
                                  <th className="text-left pb-1 font-semibold">Campo</th>
                                  <th className="text-left pb-1 font-semibold">De</th>
                                  <th className="text-left pb-1 font-semibold">Para</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ev.campos.map((c, i) => (
                                  <tr key={i} className="border-t border-slate-700">
                                    <td className="py-1 text-slate-300 pr-3">{c.campo}</td>
                                    <td className="py-1 text-red-400 pr-3 font-mono">{c.de || "—"}</td>
                                    <td className="py-1 text-green-400 font-mono">{c.para || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-slate-400 mb-3">Processo criado.</p>
                          )}
                          {ev.snapshot && !esteConfirmando && (
                            <button onClick={() => setConfirmando(ev.id)}
                              className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold px-3 py-1.5 rounded transition-colors">
                              ↩ Restaurar para este momento
                            </button>
                          )}
                          {esteConfirmando && (
                            <div className="bg-slate-700 border border-orange-500 rounded p-3 mt-2">
                              <p className="text-orange-300 text-xs font-semibold mb-2">
                                ⚠️ Tem certeza? Todas as alterações feitas após este momento serão revertidas.
                              </p>
                              <div className="flex gap-2">
                                <button onClick={() => restaurar(ev)} disabled={!!esteRestaurando}
                                  className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors">
                                  {esteRestaurando ? "Restaurando..." : "✓ Confirmar restauração"}
                                </button>
                                <button onClick={() => setConfirmando(null)}
                                  className="bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs font-bold px-3 py-1.5 rounded transition-colors">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
