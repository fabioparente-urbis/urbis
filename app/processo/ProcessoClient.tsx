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
  const [modalDI, setModalDI] = useState(false);
  const [modalLimparLip, setModalLimparLip] = useState(false);
  const [numDI, setNumDI] = useState("");
  const [dataDI, setDataDI] = useState(() => new Date().toLocaleDateString("pt-BR"));
  const [destinoDI, setDestinoDI] = useState("");
  const [destinoCustomDI, setDestinoCustomDI] = useState("");
  const [corpoDI, setCorpoDI] = useState("");
  const [gerandoDI, setGerandoDI] = useState(false);
  const [modalIndeferimentoLip, setModalIndeferimentoLip] = useState(false);
  const [motivosIndeferimentoLip, setMotivosIndeferimentoLip] = useState<string[]>([]);
  const [obsIndeferimentoLip, setObsIndeferimentoLip] = useState("");
  const [gerandoIndeferimento, setGerandoIndeferimento] = useState(false);
  const [indeferimentoPendenteLip, setIndeferimentoPendenteLip] = useState<{motivos: string[], obs: string} | null>(null);
  const [bairroBusca, setBairroBusca] = useState("");
  const [bairrosBusca, setBairrosBusca] = useState<string[]>([]);
  const [logradouroBusca, setLogradouroBusca] = useState("");
  const [logradourosBusca, setLogradourosBusca] = useState<string[]>([]);
  const [dadosLogradouro, setDadosLogradouro] = useState<any>(null);
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
    // Sessão 4: LIP é parametrizado por assunto. Antes de buscar abas/campos,
    // resolvemos o assunto_id do processo (via /api/processo/carregar). Se
    // o processo é legado ou ainda não foi criado, caímos para fetch sem
    // filtro (que retorna todas as abas — compat).
    async function inicializar() {
      setCarregandoAbas(true);
      let assuntoIdAlvo: string | null = null;
      if (idUrl) {
        try {
          const resProc = await fetch(
            `/api/processo/carregar?id=${encodeURIComponent(idUrl)}&tipo=${encodeURIComponent(tipoUrl)}`,
          );
          const jsonProc = await resProc.json().catch(() => null);
          if (jsonProc?.ok) {
            assuntoIdAlvo = jsonProc.data?.assunto_id ?? null;
          }
        } catch {
          // segue sem assunto_id (fallback)
        }
      }
      const urlAbas = assuntoIdAlvo
        ? `/api/admin/lip?assunto_id=${encodeURIComponent(assuntoIdAlvo)}`
        : "/api/admin/lip";
      const res = await fetch(urlAbas);
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
    inicializar();
  }, [idUrl, tipoUrl]);

  async function carregarHistorico() {
    try {
      const res = await fetch(`/api/processo/historico?id=${idUrl}`);
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) { const meJson = await meRes.json(); setPerfisUsuario(meJson.perfis || (meJson.perfil ? [meJson.perfil] : [])); }
      const json = await res.json();
      if (json?.ok) setHistorico(json.data ?? []);
    } catch {}
  }

  const carregarProcesso = useCallback(async () => {
    if (!idUrl) return;
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
  }, [idUrl, tipoUrl]);

  useEffect(() => {
    if (!idUrl || carregandoAbas) return;
    carregarProcesso();
    carregarHistorico();
  }, [idUrl, carregandoAbas, carregarProcesso]);
  // Sincroniza inputs de via quando LIP carrega do banco
  useEffect(() => {
    if (d["bairro"]?.valor && !bairroBusca) setBairroBusca(d["bairro"].valor);
    if (d["logradouro"]?.valor && !logradouroBusca) setLogradouroBusca(d["logradouro"].valor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d["bairro"]?.valor, d["logradouro"]?.valor]);

  const inputImportRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  async function importarExcel(file: File) {
    if (!file) return;
    try {
      setImportando(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("codigo", idUrl);
      fd.append("tipo", tipoUrl || "REGULARIZACAO");
      const res = await fetch("/api/processo/importar-lip", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        mostrarToast(`Erro ao importar: ${json?.erro || res.statusText}`, "erro");
        return;
      }
      const naoEnc = Array.isArray(json.naoEncontrados) ? json.naoEncontrados.length : 0;
      mostrarToast(
        `✅ Importação concluída: ${json.atualizados} campo(s) atualizado(s)${naoEnc ? ` · ${naoEnc} não encontrado(s)` : ""}`,
        "sucesso",
      );
      await carregarProcesso();
      await carregarHistorico();
    } catch (e: any) {
      mostrarToast(`Erro ao importar: ${e?.message || "falha inesperada"}`, "erro");
    } finally {
      setImportando(false);
      if (inputImportRef.current) inputImportRef.current.value = "";
    }
  }

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

  async function buscarBairros(q: string) {
    setBairroBusca(q);
    if (q.length < 2) { setBairrosBusca([]); return; }
    const res = await fetch(`/api/logradouros?tipo=bairros&q=${encodeURIComponent(q)}`);
    const json = await res.json();
    if (json.ok) setBairrosBusca(json.data);
  }
  async function selecionarBairro(bairro: string) {
    setBairroBusca(bairro); setBairrosBusca([]);
    u("bairro", bairro);
    setLogradouroBusca(""); setLogradourosBusca([]); setDadosLogradouro(null);
  }
  async function buscarLogradouros(q: string, bairro: string) {
    setLogradouroBusca(q);
    if (q.length < 2 || !bairro) { setLogradourosBusca([]); return; }
    const res = await fetch(`/api/logradouros?bairro=${encodeURIComponent(bairro)}&q=${encodeURIComponent(q)}`);
    const json = await res.json();
    if (json.ok) setLogradourosBusca(json.data);
  }
  async function selecionarLogradouro(logradouro: string, bairro: string) {
    setLogradouroBusca(logradouro); setLogradourosBusca([]);
    u("logradouro", logradouro);
    const res = await fetch(`/api/logradouros?bairro=${encodeURIComponent(bairro)}&logradouro=${encodeURIComponent(logradouro)}`);
    const json = await res.json();
    if (json.ok) setDadosLogradouro(json.data);
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

  async function handleDespachoInterno() {
    setGerandoDI(true);
    try {
      const res = await fetch("/api/despacho-interno", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: idUrl, tipoProcesso: tipoUrl || "REGULARIZACAO", numeroDespacho: numDI, data: dataDI, destino: destinoDI === "outro" ? destinoCustomDI : destinoDI, corpo: corpoDI }),
      });
      if (!res.ok) throw new Error("Erro");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `DespachoInterno_${idUrl}_${numDI}.docx`; a.click();
      URL.revokeObjectURL(url); setModalDI(false);
    } catch { alert("Erro ao gerar despacho interno"); } finally { setGerandoDI(false); }
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
      {modalIndeferimentoLip && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-red-700 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-bold text-red-400 mb-4">❌ Indeferimento por Impossibilidade de Análise</h2>
            <p className="text-xs text-slate-400 mb-3">Selecione o(s) motivo(s):</p>
            {[
              "Uso do solo não definido — atividade sem classificação permitida para regularização",
              "Edificação com mais de 7 pavimentos — vedada pela LC 314/2018",
              "Reforma ou construção após 04/03/2022 — não elegível para regularização",
              "Edificação em APP/APM — vedada pela legislação ambiental",
              "Processo sem documentação mínima para análise",
            ].map((motivo) => (
              <label key={motivo} className="flex items-start gap-2 mb-2 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={motivosIndeferimentoLip.includes(motivo)}
                  onChange={(e) => {
                    if (e.target.checked) setMotivosIndeferimentoLip((p) => [...p, motivo]);
                    else setMotivosIndeferimentoLip((p) => p.filter((m) => m !== motivo));
                  }} />
                <span className="text-sm text-slate-300">{motivo}</span>
              </label>
            ))}
            <textarea value={obsIndeferimentoLip} onChange={(e) => setObsIndeferimentoLip(e.target.value)}
              placeholder="Observações adicionais (opcional)..."
              className="w-full mt-3 bg-slate-700 border border-slate-500 rounded p-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none h-20" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setModalIndeferimentoLip(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button disabled={motivosIndeferimentoLip.length === 0}
                onClick={() => {
                  setIndeferimentoPendenteLip({ motivos: motivosIndeferimentoLip, obs: obsIndeferimentoLip });
                  setModalIndeferimentoLip(false);
                }}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-sm">
                ✅ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      {modalLimparLip && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border-2 border-red-600 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-red-400 mb-2">⚠️ ATENÇÃO — AÇÃO IRREVERSÍVEL</h2>
            <p className="text-sm text-slate-200 mb-2">Você está prestes a <strong>apagar todos os dados do LIP</strong> deste processo.</p>
            <p className="text-sm text-red-300 font-semibold mb-4">Todos os campos preenchidos serão zerados. Esta ação não pode ser desfeita.</p>
            <p className="text-xs text-slate-400 mb-4">Recomendamos exportar o Excel antes de continuar.</p>
            <div className="flex gap-3">
              <button onClick={() => setModalLimparLip(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={() => {
                setD({});
                setModalLimparLip(false);
                mostrarToast("🗑️ LIP zerado.");
              }}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-lg text-sm">
                Confirmar — Limpar tudo
              </button>
            </div>
          </div>
        </div>
      )}
      {modalDI && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">📨 Despacho Interno</h2>
              <button onClick={() => setModalDI(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Nº Despacho</label>
                  <input value={numDI} onChange={e => setNumDI(e.target.value)} placeholder="Ex: 042" className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Data</label>
                  <input value={dataDI} onChange={e => setDataDI(e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Destinatário</label>
                <select value={destinoDI} onChange={e => setDestinoDI(e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Selecione...</option>
                  <option value="Gerência de Pequeno Porte — DIRAAP/SEFIC">Gerência de Pequeno Porte — DIRAAP</option>
                  <option value="Gerência de Médio Porte — DIRAAP/SEFIC">Gerência de Médio Porte — DIRAAP</option>
                  <option value="Gerência de Grande Porte — DIRAAP/SEFIC">Gerência de Grande Porte — DIRAAP</option>
                  <option value="Diretoria de Análise de Projetos — DIRAAP/SEFIC">Diretoria de Análise de Projetos — DIRAAP/SEFIC</option>
                  <option value="outro">Outro...</option>
                </select>
                {destinoDI === "outro" && (
                  <input value={destinoCustomDI} onChange={e => setDestinoCustomDI(e.target.value)} placeholder="Informe o destinatário" className="mt-2 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Conteúdo</label>
                <textarea value={corpoDI} onChange={e => setCorpoDI(e.target.value)} rows={5} placeholder="Redija o conteúdo do despacho interno..." className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleDespachoInterno} disabled={gerandoDI || !numDI || !destinoDI || !corpoDI}
                className="flex-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                {gerandoDI ? "⏳ Gerando..." : "📨 Gerar e Baixar"}
              </button>
              <button onClick={() => setModalDI(false)}
                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
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
              const rotaMac = tipoUrl === "ACEITE" ? "/analise-aceite" : "/analise-regularizacao";
              router.push(`${rotaMac}/${encodeURIComponent(idUrl)}`);
            }}
            className="mt-1 bg-purple-700 hover:bg-purple-600 text-purple-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🔍 MAC
          </button>
          <button onClick={() => setModalDI(true)}
            className="mt-1 bg-indigo-700 hover:bg-indigo-600 text-indigo-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
            📨 Despacho Interno
          </button>
          <a
            href={`/api/processo/exportar-lip?codigo=${encodeURIComponent(idUrl)}&tipo=${tipoUrl || "REGULARIZACAO"}`}
            download
            className="mt-1 bg-green-700 hover:bg-green-600 text-green-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
            📊 Exportar Excel
          </a>
          <button
            type="button"
            onClick={() => inputImportRef.current?.click()}
            disabled={importando || !idUrl}
            className="mt-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-emerald-100 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
            {importando ? "⏳ Importando..." : "📥 Importar Excel"}
          </button>
          <input
            ref={inputImportRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importarExcel(f);
            }}
          />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setModalLimparLip(true)}
            className="mt-1 bg-red-900 hover:bg-red-800 text-red-300 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🗑️ Limpar LIP
          </button>
          <button onClick={() => setModalIndeferimentoLip(true)}
            className="mt-1 bg-red-800 hover:bg-red-700 text-red-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
            ❌ Indeferimento
          </button>
          {indeferimentoPendenteLip && (
            <button
              disabled={gerandoIndeferimento}
              onClick={async () => {
                const { motivos, obs } = indeferimentoPendenteLip;
                setGerandoIndeferimento(true);
                try {
                  const res = await fetch("/api/despacho-regularizacao", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      processo: idUrl, tipo: "indeferimento", numeroDespacho: "",
                      naoConformes: motivos, observacoes: obs,
                      tipoProcesso: tipoUrl || "REGULARIZACAO",
                      analises: [],
                    }),
                  });
                  if (res.ok) {
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `indeferimento_${idUrl}.docx`;
                    document.body.appendChild(a); a.click();
                    document.body.removeChild(a); URL.revokeObjectURL(url);
                    setMotivosIndeferimentoLip([]); setObsIndeferimentoLip("");
                    setIndeferimentoPendenteLip(null);
                    mostrarToast("Indeferimento gerado!");
                  }
                } finally { setGerandoIndeferimento(false); }
              }}
              className="bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
              {gerandoIndeferimento ? "Gerando..." : "Baixar Indeferimento"}
            </button>
          )}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">📋 LIP - Leitura Inteligente de Processo</h1>
            <p className="text-slate-400 text-sm mt-1">
              Processo: <span className="text-emerald-400 font-mono">{idUrl || "—"}</span>
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
              {lendoLip ? "⏳ Lendo..." : "📎 Ler PDF com Prompt P1"}
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
                const pendentes = a.lip_campos.filter(c => (d[c.chave]?.valor ?? "").trim() === "X");
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
          {aba === 0 && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-bold text-blue-800 mb-3">Via no Cadastro Imobiliário</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Setor / Bairro</label>
                  <input type="text" value={bairroBusca} onChange={(e) => buscarBairros(e.target.value)}
                    placeholder="Digite para buscar..." className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  {bairrosBusca.length > 0 && (
                    <ul className="absolute z-20 bg-white border border-slate-200 rounded shadow-lg w-full max-h-48 overflow-y-auto mt-1">
                      {bairrosBusca.map((b) => (<li key={b} onClick={() => selecionarBairro(b)} className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer">{b}</li>))}
                    </ul>
                  )}
                </div>
                <div className="relative">
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Logradouro</label>
                  <input type="text" value={logradouroBusca} onChange={(e) => buscarLogradouros(e.target.value, d["bairro"]?.valor || bairroBusca)}
                    placeholder="Digite para buscar..." className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  {logradourosBusca.length > 0 && (
                    <ul className="absolute z-20 bg-white border border-slate-200 rounded shadow-lg w-full max-h-48 overflow-y-auto mt-1">
                      {logradourosBusca.map((l) => (<li key={l} onClick={() => selecionarLogradouro(l, d["bairro"]?.valor || bairroBusca)} className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer">{l}</li>))}
                    </ul>
                  )}
                </div>
              </div>
              {dadosLogradouro && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {([
                    ["Hierarquia", dadosLogradouro.hierarquia_viaria],
                    ["Largura da Via", dadosLogradouro.largura_via ? `${dadosLogradouro.largura_via}m` : "—"],
                    ["Larg. Calçada", dadosLogradouro.larg_calcada ? `${dadosLogradouro.larg_calcada}m` : "—"],
                    ["Largura Pista", dadosLogradouro.largura_pista ? `${dadosLogradouro.largura_pista}m` : "—"],
                    ["Largura Ilha", dadosLogradouro.largura_ilha ? `${dadosLogradouro.largura_ilha}m` : "—"],
                    ["Área", dadosLogradouro.area ? `${dadosLogradouro.area}m²` : "—"],
                  ] as [string,string][]).map(([label, valor]) => (
                    <div key={label} className="bg-white border border-blue-100 rounded p-2 text-center">
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="text-sm font-bold text-slate-800">{valor}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
