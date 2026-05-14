"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type Origem = "original" | "urbis" | "manual" | "padrao";
type Campo = { valor: string; origem: Origem; fonte?: string };
type EventoHistorico = {
  id: string;
  operacao: string;
  criado_em: string;
  campos: { campo: string; de: string; para: string }[];
  snapshot: Record<string, Campo> | null;
  meta?: any;
};
type TipoProcesso = "Regularização" | "Aceite" | "Aprovação";

type CampoDB = {
  id: string;
  chave: string;
  label: string;
  tipo: string;
  opcoes: string[] | null;
  placeholder: string;
  valor_padrao: string;
  ordem: number;
};

type AbaDB = {
  id: string;
  nome: string;
  dica: string;
  ordem: number;
  ativo: boolean;
  lip_campos: CampoDB[];
};

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

function formatarDataCompleta(dataStr: string) {
  return new Date(dataStr).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

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

function normalizarTipo(t: string | null | undefined): "ACEITE" | "REGULARIZACAO" | "APROVACAO" {
  const v = String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
  if (v === "ACEITE") return "ACEITE";
  if (v === "APROVACAO") return "APROVACAO";
  return "REGULARIZACAO";
}

function rotuloTipo(t: "ACEITE" | "REGULARIZACAO" | "APROVACAO"): string {
  if (t === "ACEITE") return "Aceite";
  if (t === "APROVACAO") return "Aprovação";
  return "Regularização";
}

// Conversão UTM Zona 22S (SIRGAS 2000) → lat/lng
function utmToLatLng(easting: number, northing: number): { lat: number; lng: number } {
  const k0 = 0.9996, a = 6378137.0, e = 0.0818191908426;
  const e1sq = 0.006739496742;
  const x = easting - 500000;
  const y = northing - 10000000;
  const lon0 = (22 - 1) * 6 - 180 + 3;
  const M = y / k0;
  const mu = M / (a * (1 - Math.pow(e,2)/4 - 3*Math.pow(e,4)/64 - 5*Math.pow(e,6)/256));
  const e1 = (1 - Math.sqrt(1 - e*e)) / (1 + Math.sqrt(1 - e*e));
  const fp = mu + (3*e1/2 - 27*Math.pow(e1,3)/32)*Math.sin(2*mu)
           + (21*Math.pow(e1,2)/16 - 55*Math.pow(e1,4)/32)*Math.sin(4*mu)
           + (151*Math.pow(e1,3)/96)*Math.sin(6*mu)
           + (1097*Math.pow(e1,4)/512)*Math.sin(8*mu);
  const C1 = e1sq * Math.pow(Math.cos(fp),2);
  const T1 = Math.pow(Math.tan(fp),2);
  const R1 = a*(1-e*e) / Math.pow(1-Math.pow(e*Math.sin(fp),2),1.5);
  const N1 = a / Math.sqrt(1-Math.pow(e*Math.sin(fp),2));
  const D = x / (N1*k0);
  const lat = fp - (N1*Math.tan(fp)/R1)*(Math.pow(D,2)/2 - (5+3*T1+10*C1-4*Math.pow(C1,2)-9*e1sq)*Math.pow(D,4)/24 + (61+90*T1+298*C1+45*Math.pow(T1,2)-252*e1sq-3*Math.pow(C1,2))*Math.pow(D,6)/720);
  const lng = lon0*Math.PI/180 + (D - (1+2*T1+C1)*Math.pow(D,3)/6 + (5-2*C1+28*T1-3*Math.pow(C1,2)+8*e1sq+24*Math.pow(T1,2))*Math.pow(D,5)/120)/Math.cos(fp);
  return { lat: lat*180/Math.PI, lng: lng*180/Math.PI };
}

function parseCoords(val: string): string {
  const parts = val.trim().split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
  if (parts.length < 2) return val;
  const [a, b] = parts;
  // UTM zona 22S: easting ~160000-840000, northing ~7500000-9000000
  if (a > 10000 && b > 1000000) {
    const { lat, lng } = utmToLatLng(a, b);
    return `${lat.toFixed(8)},${lng.toFixed(8)}`;
  }
  return val.trim();
}


export default function ProcessoClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const idUrl = (params?.id as string) ?? "";
  const tipoUrl = normalizarTipo(searchParams?.get("tipo"));

  const [aba, setAba] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [statusSalvo, setStatusSalvo] = useState<"idle"|"salvando"|"salvo"|"erro">("idle");
  const [carregando, setCarregando] = useState(true);
  const [carregandoAbas, setCarregandoAbas] = useState(true);
  const [erroCampos, setErroCampos] = useState(false);
  const [lendoLip, setLendoLip] = useState(false);

  const [abasDB, setAbasDB] = useState<AbaDB[]>([]);
  const [mostrarPendentes, setMostrarPendentes] = useState(false);
  const [d, setD] = useState<Record<string, Campo>>({});

  const [historico, setHistorico] = useState<EventoHistorico[]>([]);
  const [perfisUsuario, setPerfisUsuario] = useState<string[]>([]);
  const [eventoAberto, setEventoAberto] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [novoProcesso, setNovoProcesso] = useState("");
  const [tipoNavegacao, setTipoNavegacao] = useState<TipoProcesso>(rotuloTipo(tipoUrl) as TipoProcesso);
  const [toast, setToast] = useState<{ msg: string; tipo: "sucesso"|"erro"|"info" } | null>(null);

  const inputFileRef = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState(0);
  const progressoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapRef = useRef<Record<string, Campo> | null>(null);

  function mostrarToast(msg: string, tipo: "sucesso"|"erro"|"info" = "info") {
    setToast({ msg, tipo });
  }

  useEffect(() => {
    async function carregarAbas() {
      setCarregandoAbas(true);
      const res = await fetch("/api/admin/lip");
      const json = await res.json();
      if (json.ok) {
        setAbasDB(json.data);
        const estadoInicial: Record<string, Campo> = {};
        for (const aba of json.data) {
          for (const campo of aba.lip_campos) {
            estadoInicial[campo.chave] = padrao(campo.valor_padrao || "");
          }
        }
        estadoInicial["processo"] = base();
        estadoInicial["pag"] = base();
        setD(estadoInicial);
        snapRef.current = estadoInicial;
      }
      setCarregandoAbas(false);
    }
    carregarAbas();
  }, []);

  async function carregarHistorico() {
    try {
      const res = await fetch(`/api/processo/historico?id=${idUrl}`);
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) { const meJson = await meRes.json(); setPerfisUsuario(meJson.perfis || (meJson.perfil ? [meJson.perfil] : [])); }
      const json = await res.json();
      if (json?.ok) setHistorico(json.data ?? []);
    } catch {}
  }

  useEffect(() => {
    if (!idUrl || carregandoAbas) return;
    async function carregar() {
      try {
        setCarregando(true);
        const res = await fetch(`/api/processo/carregar?id=${encodeURIComponent(idUrl)}&tipo=${encodeURIComponent(tipoUrl)}`);
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
            const salvo = dadosSalvos[chave];
            if (salvo && typeof salvo === "object" && "valor" in salvo && "origem" in salvo) {
              atualizado[chave] = { valor: salvo.valor ?? "", origem: salvo.origem ?? "manual", fonte: salvo.fonte };
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
  }, [idUrl, carregandoAbas]);

  const autoSalvar = useCallback((estado: Record<string, Campo>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      // Auto-save blindado: salva mesmo com campos padrão vazios (CONFERIR)
      // para que a análise no MAC receba os itens não conformes correspondentes.
      const iguais = snapRef.current && Object.keys(estado).every(
        (k) => estado[k]?.valor === snapRef.current![k]?.valor
      );
      if (iguais) return;
      try {
        setStatusSalvo("salvando");
        const res = await fetch("/api/processo/salvar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: idUrl, dados: estado, tipo: tipoUrl }),
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
  }, [idUrl, tipoUrl]);

  function u(chave: string, valor: string) {
    setD((prev) => {
      const novo = { ...prev, [chave]: { valor, origem: "manual" as Origem } };
      autoSalvar(novo);
      return novo;
    });
  }

  function confirmar(chave: string) {
    if (d[chave]?.origem === "padrao") {
      setD((prev) => {
        const novo = { ...prev, [chave]: { valor: prev[chave].valor, origem: "manual" as Origem } };
        autoSalvar(novo);
        return novo;
      });
    }
  }

  function navegarParaProcesso() {
    const id = novoProcesso.trim();
    if (!id) return;
    const tipoNorm = normalizarTipo(tipoNavegacao);
    router.push(`/processo/${encodeURIComponent(id)}?tipo=${encodeURIComponent(tipoNorm)}`);
    setNovoProcesso("");
  }

  function iniciarProgresso() {
    setProgresso(0);
    let p = 0;
    progressoRef.current = setInterval(() => {
      p += Math.random() * 3;
      if (p >= 80) { p = 80; if (progressoRef.current) clearInterval(progressoRef.current); }
      setProgresso(Math.round(p));
    }, 300);
  }

  function finalizarProgresso() {
    if (progressoRef.current) clearInterval(progressoRef.current);
    setProgresso(100);
    setTimeout(() => setProgresso(0), 1500);
  }

  async function lerLip(arquivos: File[]) {
    try {
      setLendoLip(true);
      setProgresso(5);
      mostrarToast(`📄 Iniciando leitura de ${arquivos.length} arquivo(s)...`, "info");

      const resultados = await Promise.all(
        arquivos.map(async (arquivo) => {
          // 2. S1 — Upload para Gemini File API (streaming direto)
          setProgresso(20);
          mostrarToast("📤 S1: Enviando PDF para Gemini...", "info");
          const s1Res = await fetch("/api/lip/s1", {
            method: "POST",
            headers: {
              "Content-Type": "application/pdf",
              "X-File-Size": arquivo.size.toString(),
              "X-File-Name": arquivo.name,
            },
            body: arquivo,
          });
          const s1Data = await s1Res.json();
          if (!s1Data.ok) throw new Error("S1: " + (s1Data.erro || "Erro ao enviar PDF"));
          const { fileUri } = s1Data;

          // 3. S2 — Mapa de documentos
          setProgresso(45);
          mostrarToast("🗂 S2: Mapeando documentos do processo...", "info");
          const s2Res = await fetch("/api/lip/s2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileUri }),
          });
          const s2Data = await s2Res.json();
          const documentos = s2Data.ok ? (s2Data.documentos ?? []) : [];

          // 4. S3 — Extração inteligente do LIP
          setProgresso(70);
          mostrarToast("🧠 S3: Preenchendo LIP com IA...", "info");
          const s3Res = await fetch("/api/lip/s3", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileUri, documentos, codigo: idUrl, fileName: arquivo.name }),
          });
          const s3Data = await s3Res.json();
          if (!s3Data.ok) {
          if (s3Data.erro?.includes("429") || s3Data.erro?.includes("RESOURCE_EXHAUSTED") || s3Data.erro?.includes("quota") || s3Data.erro === "LIMITE_DIARIO_GEMINI") {
            // Registra falha por limite no historico
            try {
              await fetch("/api/lip/registrar-evento", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ codigo: idUrl, fileName: arquivo.name, status: "LIMITE" }),
              });
            } catch (_) {}
            throw new Error("⚠️ Limite diário do Gemini Free atingido! Tente novamente após as 21h (horário de Brasília).");
          }
          throw new Error("S3: " + (s3Data.erro || "Erro na extração"));
        }

          return {
            campos: s3Data.campos ?? {},
            alertasMAC: s3Data.alertasMAC ?? [],
            validacoes: s3Data.validacoes ?? {},
            pendencias: s3Data.pendencias ?? [],
          };
        })
      );

      setProgresso(90);

      const mesclado: Record<string, { valor: string; fonte: string }> = {};
      for (const { campos } of resultados) {
        for (const chave of Object.keys(campos)) {
          const item = campos[chave];
          if (!mesclado[chave]?.valor && item?.valor && item.valor !== "NP") {
            mesclado[chave] = item;
          }
        }
      }

      setD((prev) => {
        const novo = { ...prev };
        Object.keys(mesclado).forEach((chave) => {
          const item = mesclado[chave];
          if (!item?.valor) return;

          novo[chave] = { valor: item.valor, origem: "urbis", fonte: item.fonte };
        });
        autoSalvar(novo);
        return novo;
      });

      const preenchidos = Object.values(mesclado).filter((v: any) => v?.valor && v.valor !== "NP").length;
      mostrarToast(`✅ LIP preenchido! ${preenchidos} campos extraídos.`, "sucesso");
    } catch (e: any) {
      mostrarToast("❌ Erro: " + e.message, "erro");
    } finally {
      setLendoLip(false);
      finalizarProgresso();
    }
  }

  async function salvar() {
    setErroCampos(false);
    try {
      setSalvando(true); setStatusSalvo("salvando");
      const res = await fetch("/api/processo/salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idUrl, dados: d, tipo: tipoUrl }),
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
          const salvo = json.dados[chave];
          if (salvo && typeof salvo === "object" && "valor" in salvo && "origem" in salvo) {
            novo[chave] = { valor: salvo.valor ?? "", origem: salvo.origem ?? "manual", fonte: salvo.fonte };
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

  const totalPadrao = Object.entries(d).filter(([k, c]) => k !== "coordenadas" && c.origem === "padrao" && c.valor.trim() === "").length;

  function renderCampo(campo: CampoDB) {
    const val = d[campo.chave] ?? padrao(campo.valor_padrao || "");
    const isPadrao = val.origem === "padrao";
    const fonte = val.fonte;
    const ehCoordenadas = campo.chave === "coordenadas";
    const temValor = val.valor.trim() !== "";
    const mostrarBotaoMaps = ehCoordenadas && temValor;
    // Coordenadas são opcionais — não disparam marcação CONFERIR.
    const mostrarConferir = !ehCoordenadas && isPadrao && !temValor;

    if (campo.tipo === "select" && campo.opcoes && campo.opcoes.length > 0) {
      return (
        <div key={campo.id} className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
            {campo.label}{mostrarConferir && <span className="ml-1 text-orange-500 font-bold">⚠ CONFERIR</span>}
          </label>
          <select value={val.valor} onChange={(e) => u(campo.chave, e.target.value)}
            className={`w-full rounded border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${cor(val.origem)} ${borderCor(val.origem, val.valor)}`}>
            <option value="">— selecione —</option>
            {campo.opcoes.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          {fonte && val.origem === "original" && <span className="text-xs text-gray-400 italic">📍 {fonte}</span>}
        </div>
      );
    }

    return (
      <div key={campo.id} className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
          {campo.label}{mostrarConferir && <span className="ml-1 text-orange-500 font-bold">⚠ CONFERIR</span>}
        </label>
        <div className="relative">
          <input value={val.valor} onChange={(e) => u(campo.chave, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmar(campo.chave)}
            placeholder={campo.placeholder || campo.label}
            className={`w-full rounded border p-2 ${mostrarBotaoMaps ? "pr-9" : ""} text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${cor(val.origem)} ${borderCor(val.origem, val.valor)}`} />
          {mostrarBotaoMaps && (
            <>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(parseCoords(val.valor))}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir no Google Maps"
              aria-label="Abrir coordenadas no Google Maps"
              className="absolute right-8 top-1/2 -translate-y-1/2 text-base leading-none px-1 rounded hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >📍</a>
            
            <a
              href={`https://earth.google.com/web/search/${encodeURIComponent(parseCoords(val.valor))}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir no Google Earth"
              aria-label="Abrir coordenadas no Google Earth"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base leading-none px-1 rounded hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >🌍</a>
            </>
          )}
        </div>
        {fonte && val.origem === "original" && <span className="text-xs text-gray-400 italic">📍 {fonte}</span>}
      </div>
    );
  }

  const legenda = [
    { cor: "bg-black", label: "Original (documento)" },
    { cor: "bg-red-600", label: "Urbis (automático)" },
    { cor: "bg-blue-600", label: "Manual (digitado)" },
    { cor: "bg-orange-500", label: "Padrão (conferir!)" },
  ];

  if (carregandoAbas) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Carregando estrutura do formulário...</p>
      </div>
    );
  }

  const abaAtual = abasDB[aba];
  const isUltimaAba = aba === abasDB.length - 1;

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 text-white">
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} onClose={() => setToast(null)} />}

      {/* CABEÇALHO */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push("/")}
            className="mt-1 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🏠 Home
          </button>
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
            className="mt-1 bg-red-800 hover:bg-red-700 text-red-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🚪 Sair
          </button>
          <button onClick={async () => {
              const t = Object.entries(d).filter(([k, c]) => k !== "coordenadas" && c.origem === "padrao" && c.valor.trim() === "").length;
              if (t > 0) { setErroCampos(true); return; }
              await salvar();
              const rotaMac = tipoUrl === "ACEITE" ? "/analise-aceite" : "/analise";
              router.push(`${rotaMac}/${encodeURIComponent(idUrl)}`);
            }}
            className="mt-1 bg-purple-700 hover:bg-purple-600 text-purple-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🔍 MAC
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">📋 LIP - Leitura Inteligente de Processo</h1>
            <p className="text-slate-400 text-sm mt-1">
              Processo: <span className="text-yellow-400 font-mono">{idUrl || "—"}</span>
              {" · "}<span className="text-slate-500">{rotuloTipo(tipoUrl)}</span>
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
        <input value={novoProcesso} onChange={(e) => setNovoProcesso(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && navegarParaProcesso()}
          placeholder="Ex: 25.5.000082553-3"
          className="flex-1 min-w-[180px] bg-slate-700 border border-slate-500 rounded px-3 py-1.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={tipoNavegacao} onChange={(e) => setTipoNavegacao(e.target.value as TipoProcesso)}
          className="bg-slate-700 border border-slate-500 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="Regularização">Regularização</option>
          <option value="Aceite">Aceite</option>
          <option value="Aprovação">Aprovação</option>
        </select>
        <button onClick={navegarParaProcesso} disabled={!novoProcesso.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap">
          Abrir →
        </button>
      </div>

      {/* BLOCO LIP */}
      <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-sm font-bold text-white">📄 Leitura Inteligente do LIP</p>
            <p className="text-xs text-slate-400 mt-0.5">Upload do PDF — preenche os campos automaticamente</p>
          </div>
          <div className="ml-auto flex gap-2">
            <label className={`cursor-pointer px-4 py-2 rounded font-bold text-sm transition-colors ${lendoLip ? "bg-slate-600 text-slate-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-500 text-white"}`}>
              {lendoLip ? "⏳ Lendo..." : "📎 1 arquivo"}
              <input ref={inputFileRef} type="file" accept=".pdf" className="hidden" disabled={lendoLip}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) lerLip([f]); e.target.value = ""; }} />
            </label>
            <label className={`cursor-pointer px-4 py-2 rounded font-bold text-sm transition-colors ${lendoLip ? "bg-slate-600 text-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white"}`}>
              {lendoLip ? "⏳ Lendo..." : "📎 Múltiplos arquivos"}
              <input type="file" accept=".pdf" multiple className="hidden" disabled={lendoLip}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) lerLip(files);
                  e.target.value = "";
                }} />
            </label>
          </div>
        </div>
      </div>

      {progresso > 0 && (
        <div className="bg-slate-800 border border-slate-600 rounded-xl p-3 mb-4">
          <div className="flex justify-between text-xs text-slate-300 mb-1">
            <span>🤖 Lendo PDF com IA...</span>
            <span>{progresso}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div className="bg-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progresso}%` }} />
          </div>
        </div>
      )}

      {carregando && <div className="bg-yellow-900 border border-yellow-500 text-yellow-300 px-4 py-2 rounded mb-4 text-sm">⏳ Carregando dados do processo...</div>}
      {totalPadrao > 0 && (
        <div className="mb-4">
          <div
            className="bg-orange-900 border border-orange-500 text-orange-200 px-4 py-2 rounded text-sm cursor-pointer flex items-center justify-between hover:bg-orange-800 transition-colors"
            onClick={() => setMostrarPendentes(!mostrarPendentes)}
          >
            <span>⚠️ <strong>{totalPadrao} campo(s)</strong> em laranja precisam ser conferidos. Pressione <strong>Enter</strong> para confirmar.</span>
            <span className="ml-4 text-orange-300">{mostrarPendentes ? "▲ Fechar" : "▼ Ver campos"}</span>
          </div>
          {mostrarPendentes && (
            <div className="bg-orange-950 border border-orange-500 border-t-0 rounded-b px-4 py-3 text-sm">
              {abasDB.map((a, i) => {
                const pendentes = a.lip_campos.filter(c => d[c.chave]?.origem === "padrao" && (d[c.chave]?.valor ?? "").trim() === "");
                if (pendentes.length === 0) return null;
                return (
                  <div key={a.id} className="mb-2">
                    <button
                      onClick={() => { setAba(i); setMostrarPendentes(false); }}
                      className="text-orange-300 font-semibold hover:text-orange-100 underline text-xs mb-1"
                    >
                      {a.nome} →
                    </button>
                    <ul className="ml-3 list-disc list-inside">
                      {pendentes.map(c => (
                        <li key={c.chave} className="text-orange-200 text-xs">{c.label}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {erroCampos && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-2 rounded mb-4 text-sm">❌ Confira todos os campos em laranja antes de salvar!</div>}

      {/* ABAS */}
      <div className="flex flex-wrap gap-2 mb-4">
        {abasDB.map((a, i) => (
          <button key={a.id} onClick={() => setAba(i)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${aba === i ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
            {a.nome}
          </button>
        ))}
      </div>

      {/* FORMULÁRIO */}
      {abaAtual && (
        <div className="bg-white text-black p-5 rounded-xl shadow-lg space-y-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold text-slate-800">{abaAtual.nome}</h2>
              {abaAtual.dica && <p className="text-xs text-slate-400 mt-0.5">💡 {abaAtual.dica}</p>}
            </div>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">{aba + 1} / {abasDB.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {abaAtual.lip_campos.map((campo) => renderCampo(campo))}
          </div>
        </div>
      )}

      {/* NAVEGAÇÃO ABAS */}
      <div className="flex items-center gap-3 mt-4">
        <button onClick={() => setAba((a) => a - 1)} disabled={aba === 0}
          className="bg-slate-600 hover:bg-slate-500 disabled:opacity-40 px-4 py-2 rounded font-medium text-sm transition-colors">
          ← Voltar
        </button>
        {!isUltimaAba && (
          <button onClick={() => setAba((a) => a + 1)}
            className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-medium text-sm transition-colors">
            Próxima →
          </button>
        )}
        <button onClick={salvar} disabled={salvando}
          className="ml-auto bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 px-6 py-2 rounded font-bold text-black text-sm transition-colors">
          {salvando ? "Salvando..." : "💾 Salvar"}
        </button>
      </div>

      {/* PROGRESSO */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Progresso</span><span>{aba + 1} de {abasDB.length} abas</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-1.5">
          <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${((aba + 1) / abasDB.length) * 100}%` }} />
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
                    <div className={`absolute left-2 w-5 h-5 rounded-full border-2 ${cores.border} cursor-pointer transition-transform hover:scale-125 flex items-center justify-center`}
                      style={{ opacity: opacidade }}
                      onClick={() => { setEventoAberto(aberto ? null : ev.id); setConfirmando(null); }}>
                      <div className={`w-2.5 h-2.5 rounded-full ${cores.bg}`} />
                    </div>
                    <div className="flex-1" style={{ opacity: opacidade }}>
                      <button onClick={() => { setEventoAberto(aberto ? null : ev.id); setConfirmando(null); }}
                        className={`text-xs font-mono ${cores.text} hover:underline`}>
                        {formatarDataCompleta(ev.criado_em)} — {ev.operacao === "LIP_LEITURA" ? `📄 LIP lido por IA — ${ev.meta?.camposPreenchidos ?? 0} campos extraídos` : ev.campos.length > 0 ? `${ev.campos.length} campo(s) alterado(s)` : ev.operacao}
                      </button>
                      {aberto && (
                        <div className="mt-2 bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs">
                          {ev.operacao === "LIP_LEITURA" ? (
                            <div className="text-slate-300 space-y-1">
                              <p>📄 <span className="text-slate-400">Arquivo:</span> {ev.meta?.arquivo ?? "—"}</p>
                              <p>✅ <span className="text-slate-400">Campos preenchidos:</span> {ev.meta?.camposPreenchidos ?? 0}</p>
                              <p>🟢 <span className="text-slate-400">Status:</span> {ev.meta?.status ?? "—"}</p>
                            </div>
                          ) : ev.campos.length > 0 ? (
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
                                {perfisUsuario.some(p => ["Administrador","Diretora","Diretor"].includes(p)) ? (
                                  <>
                                    <button onClick={() => restaurar(ev)} disabled={!!esteRestaurando}
                                      className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors">
                                      {esteRestaurando ? "Restaurando..." : "✓ Confirmar restauração"}
                                    </button>
                                    <button onClick={() => setConfirmando(null)}
                                      className="bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs font-bold px-3 py-1.5 rounded transition-colors">
                                      Cancelar
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => setConfirmando(null)}
                                    className="bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs font-bold px-3 py-1.5 rounded transition-colors">
                                    Cancelar
                                  </button>
                                )}
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
