"use client";
import { useAuditoria } from "@/hooks/useAuditoria";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { perfilDe } from "@/lib/numeracao";
import { avaliarMarcoTemporal, type VeredictoMarcoTemporal } from "@/lib/marcoTemporal";

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
type TipoProcesso = string;

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
  if (origem === "urbis") return "text-[#2563EB]";
  if (origem === "manual") return "text-[#475569]";
  if (origem === "padrao") return "text-[#EA580C]";
  return "text-[#000000]";
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



function diaKey(dataEvento: string): string {
  const d = new Date(dataEvento);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function corPorIndiceDia(idx: number) {
  if (idx === 0) return { bg: "bg-[#0F172A]", border: "border-[#0F172A]", text: "text-[#000000] font-bold" };
  if (idx === 1) return { bg: "bg-[#1E3A8A]", border: "border-[#1E3A8A]", text: "text-[#1E3A8A] font-semibold" };
  if (idx === 2) return { bg: "bg-[#334155]", border: "border-[#334155]", text: "text-[#334155] font-medium" };
  if (idx === 3) return { bg: "bg-[#065F46]", border: "border-[#065F46]", text: "text-[#065F46]" };
  return { bg: "bg-[#94A3B8]", border: "border-[#94A3B8]", text: "text-[#94A3B8]" };
}
function corParaData(dataEvento: string) {
  return corPorIndiceDia(0);
}

function opacidadeEvento(indice: number, total: number): number {
  if (total <= 1) return 1;
  return 1 - (indice / (total - 1)) * 0.7;
}

function Toast({ msg, tipo, onClose }: { msg: string; tipo: "sucesso" | "erro" | "info"; onClose: () => void }) {
  const bg = tipo === "sucesso" ? "bg-[var(--success-bg)] border-[var(--success)]" : tipo === "erro" ? "bg-[var(--error-bg)] border-[var(--error)]" : "bg-[var(--info-bg)] border-[var(--accent)]";
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, []);
  return (
    <div className={`fixed bottom-6 right-6 z-50 ${bg} border text-[var(--text-primary)] px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-3 max-w-sm`}>
      <span>{msg}</span>
      <button onClick={onClose} className="text-[var(--text-primary)] opacity-60 hover:opacity-100 ml-2">✕</button>

    </div>
  );
}

/** Fallback estático — o nome bom vem do banco (`nomeAssunto`). */
function rotuloTipo(slug: string): string {
  if (slug === "aceite_sei") return "Aceite SEI";
  if (slug === "aprovacao_pp") return "Aprovação PP";
  if (slug === "aprovacao_mp") return "Aprovação MP";
  return "Regularização SEI";
}

// A SEI é o número que o usuário digitou ao cadastrar (o código do processo) —
// é a autoridade, não a leitura do PDF. A IA às vezes joga o número FÍSICO
// (só dígitos) no campo "Processo SEI"; nesse caso recuperamos para o campo
// físico (se estiver vazio) e restauramos a SEI. Só age em processos SEI
// (código em formato NUP, ex.: 26.5.000009203-2). Muta `novo` in-place.
function corrigirSeiFisico(novo: Record<string, Campo>, codigo: string): void {
  if (!/^\d{2}\.\d{1,2}\.\d{6,}-\d$/.test(codigo)) return;
  const extraido = novo.processo?.valor ? String(novo.processo.valor).trim() : "";
  if (extraido && extraido !== codigo && !novo.processoFisico?.valor && /^\d{5,}$/.test(extraido)) {
    novo.processoFisico = { valor: extraido, origem: "urbis", fonte: novo.processo?.fonte || "Leitura do processo" };
  }
  novo.processo = { valor: codigo, origem: "manual", fonte: "Número informado no cadastro" };
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



function normalizarRegistro(v: string, tipo: "cau" | "crea"): string {
  if (!v) return v;
  const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const prefix = tipo === "cau" ? "CAU" : "CREA";
  const digits = clean.replace(/^(CAU|CREA)/, "");
  const m = digits.match(/^(\d+)([A-Z]{2})?$/);
  if (m) return m[2] ? `${prefix}-${m[1]}/${m[2]}` : `${prefix}-${m[1]}`;
  // Texto livre que não segue o padrão numérico: retorna só uppercase/trim
  return v.toUpperCase().trim();
}
export default function ProcessoClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const idUrl = (params?.id as string) ?? "";
  const tipoUrl = searchParams?.get("tipo") ?? "regularizacao";
  // Aprovação de Projeto lê PASTA (a pasta é a rodada de análise); os outros assuntos
  // seguem escolhendo arquivos, sem nenhuma mudança de comportamento.
  const ehSlot5 = tipoUrl === "slot_05";

  const [aba, setAba] = useState(0);
  const { registrar } = useAuditoria();
  const valorAnteriorRef = useRef<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [modalDI, setModalDI] = useState(false);
  const [modalLimparLip, setModalLimparLip] = useState(false);
  const [numDI, setNumDI] = useState("");
  const [dataDI, setDataDI] = useState(() => new Date().toLocaleDateString("pt-BR"));
  const [destinoDI, setDestinoDI] = useState("");
  const [destinoCustomDI, setDestinoCustomDI] = useState("");
  const [corpoDI, setCorpoDI] = useState("");
  const [gerandoDI, setGerandoDI] = useState(false);
  const [numDIBloqueio, setNumDIBloqueio] = useState<string | null>(null);
  const [numDICarregando, setNumDICarregando] = useState(false);
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
  const [modalVCP, setModalVCP] = useState(false);
  const [lendoPasta, setLendoPasta] = useState(false);
  // proposta da leitura da pasta (slot 5): fica na tela até o analista aceitar em bloco
  const [propostaPasta, setPropostaPasta] = useState<any>(null);
  const [vcpArquivos, setVcpArquivos] = useState<File[]>([]);
  const [vcpProcessando, setVcpProcessando] = useState(false);
  const [tempoLeitura, setTempoLeitura] = useState(0); // segundos
  const tempoLeituraRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [vcpDragOver, setVcpDragOver] = useState(false);
  const [vcpSugestoes, setVcpSugestoes] = useState<Record<string, string>>({});
  const [vcpModo, setVcpModo] = useState<"substituir"|"sugerir"|null>(null);
  // Marco temporal (LC 314/2018): quando a última vistoria reprova a obra,
  // avisa em janela no meio da tela — só avisa, não bloqueia nada.
  const [alertaMarco, setAlertaMarco] = useState<VeredictoMarcoTemporal | null>(null);

  const [abasDB, setAbasDB] = useState<AbaDB[]>([]);
  const [mostrarPendentes, setMostrarPendentes] = useState(false);
  const [d, setD] = useState<Record<string, Campo>>({});

  const [historico, setHistorico] = useState<EventoHistorico[]>([]);
  const [perfisUsuario, setPerfisUsuario] = useState<string[]>([]);
  const [eventoAberto, setEventoAberto] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [novoProcesso, setNovoProcesso] = useState("");
  const [tipoNavegacao, setTipoNavegacao] = useState<TipoProcesso>(tipoUrl);
  const [toast, setToast] = useState<{ msg: string; tipo: "sucesso"|"erro"|"info" } | null>(null);

  const inputFileRef = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState(0);
  const progressoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapRef = useRef<Record<string, Campo> | null>(null);

  function mostrarToast(msg: string, tipo: "sucesso"|"erro"|"info" = "info") {
    setToast({ msg, tipo });
  }

  // Guarda o assunto_id resolvido do processo — usado para pedir a IA (s2/s3)
  // o prompt do slot certo. Ref (não state) porque é lido dentro de handlers async.
  const assuntoIdRef = useRef<string | null>(null);

  // Assuntos ativos vindos do banco. Sem isto, um slot novo (slot_05,
  // slot_06…) cairia no `else` do `rotuloTipo` e a tela chamaria de
  // "Regularização SEI" um processo que não é — e a caixa "Ir para
  // processo" só oferecia Regularização, que era opção fixa no código.
  const [assuntosAtivos, setAssuntosAtivos] = useState<{ slug: string; nome: string; numeracao?: string | null }[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/assuntos")
      .then((r) => r.json())
      .then((j) => {
        if (!vivo || !j?.ok || !Array.isArray(j.data)) return;
        setAssuntosAtivos(
          j.data.filter((x: any) => x?.ativo === true)
            .map((x: any) => ({ slug: x.slug, nome: x.nome, numeracao: x.numeracao })),
        );
      })
      .catch(() => { /* fica no rótulo estático */ });
    return () => { vivo = false; };
  }, []);
  const nomeAssunto = assuntosAtivos.find((a) => a.slug === tipoUrl)?.nome ?? null;
  // Como ESTE assunto numera seus processos (SEI x alvará/OS).
  const perfilNum = perfilDe(assuntosAtivos.find((a) => a.slug === tipoUrl)?.numeracao);
  // E como numera o assunto escolhido na caixa de navegação, que pode ser outro.
  const perfilNumNavegacao = perfilDe(assuntosAtivos.find((a) => a.slug === tipoNavegacao)?.numeracao);

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
      // Fallback: se processo não tem assunto_id, usa Regularização (slot_01)
      // NUNCA busca sem filtro — evita misturar abas de slots diferentes
      if (!assuntoIdAlvo) {
        try {
          const resAssunto = await fetch("/api/admin/assuntos");
          const jsonAssunto = await resAssunto.json().catch(() => null);
          const reg = jsonAssunto?.data?.find((a: {slug: string; id: string}) => a.slug === "regularizacao");
          if (reg?.id) assuntoIdAlvo = reg.id;
        } catch { /* mantém null */ }
      }
      assuntoIdRef.current = assuntoIdAlvo;
      const urlAbas = assuntoIdAlvo
        ? `/api/admin/lip?assunto_id=${encodeURIComponent(assuntoIdAlvo)}`
        : "/api/admin/lip?assunto_id=none"; // fallback seguro — retorna vazio
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
      if (meRes.ok) { const meJson = await meRes.json(); const p = Array.isArray(meJson.data?.perfis) ? meJson.data.perfis : (meJson.data?.perfil ? [meJson.data.perfil] : []); setPerfisUsuario(p); }
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
  const [confirmarMac, setConfirmarMac] = useState(false);
  const [importando, setImportando] = useState(false);
  async function importarExcel(file: File) {
    if (!file) return;
    try {
      setImportando(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("codigo", idUrl);
      fd.append("tipo", tipoUrl || "regularizacao");
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
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: idUrl, dados: estado, tipo: tipoUrl }),
        });
        const json = await res.json();
        if (json?.ok) {
          snapRef.current = estado;
          setStatusSalvo("salvo");
          await carregarHistorico();
          setTimeout(() => setStatusSalvo("idle"), 3000);
        } else if (res.status === 401 || json?.erro === "SESSAO_EXPIRADA") {
          mostrarToast("⚠️ Sessão expirada. Faça login em nova aba e salve novamente.", "erro");
          setStatusSalvo("erro");
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
    const tipoNorm = tipoNavegacao;
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

  // Formata um documento do mapa S2 de forma defensiva (nome/tipo, SEI, página)
  function formatarDocLeitura(d: any): string {
    if (!d) return "";
    if (typeof d === "string") return d;
    const nome = d.nome || d.tipo || d.documento || d.descricao || "Documento";
    const sei = d.sei || d.numero_sei || d.numeroSei || d.numero || null;
    const pag = d.pagina || d.paginas || d.pag || d.pages || null;
    const partes: string[] = [];
    if (sei) partes.push(`SEI ${sei}`);
    if (pag) partes.push(`pág. ${pag}`);
    return partes.length ? `${nome} (${partes.join(", ")})` : String(nome);
  }

  // Anexa um bloco ao campo Observações do LIP (preservando o conteúdo atual)
  function anexarObsLip(bloco: string) {
    setD((prev) => {
      const novo = { ...prev };
      const obsAtual = (novo["observacoes"]?.valor ?? "").trim();
      novo["observacoes"] = { valor: obsAtual ? obsAtual + "\n\n" + bloco : bloco, origem: "urbis", fonte: "LIP" };
      autoSalvar(novo);
      return novo;
    });
  }

  async function aguardarJobS3(jobId: string): Promise<any> {
    if (!jobId) throw new Error("S3: jobId ausente");
    return new Promise((resolve, reject) => {
      let tentativas = 0;
      const MAX = 144; // 144 × 5s = 12 minutos
      const interval = setInterval(async () => {
        tentativas++;
        try {
          const poll = await fetch(`/api/lip/s3/status?jobId=${encodeURIComponent(jobId)}`);
          if (!poll.ok) { return; } // erro de rede, continua polling
          const data = await poll.json();
          console.log(`[S3-poll] tentativa=${tentativas} status=${data.status} temResultado=${!!data.resultado}`);
          if (data.status === "concluido") {
            if (!data.resultado) { return; } // ainda salvando, aguarda próximo ciclo
            clearInterval(interval);
            resolve(data.resultado);
          } else if (data.status === "erro") {
            clearInterval(interval);
            reject(new Error("S3: " + (data.erro || "Erro no processamento")));
          } else if (tentativas >= MAX) {
            clearInterval(interval);
            reject(new Error("S3: Timeout — processamento demorou mais de 12 minutos"));
          }
        } catch (e) {
          console.warn(`[S3-poll] erro tentativa ${tentativas}:`, e);
        }
      }, 5000);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * LER PASTA — triagem local do slot 5, ANTES de gastar Gemini.
   *
   * O `lerLip` manda cada arquivo por S1+S2+S3, ou seja três chamadas ao
   * Gemini por arquivo. Apontar a pasta inteira sem filtrar custaria trinta
   * chamadas e mandaria o DWG e os documentos pessoais escaneados junto.
   *
   * Aqui nada vai para a rede: a pasta é a rodada (raiz = 1ª análise, cada
   * subpasta a seguinte), o hash derruba arquivo repetido, e três papéis
   * ficam fora por decisão do analista — documentos pessoais e declaração de
   * responsabilidade são escopo da CHEADV, e o DWG não é legível.
   *
   * Ver docs/PROMPT_LEITURA_PASTA_SLOT5.md
   * ───────────────────────────────────────────────────────────────────────── */
  async function lerPasta(todos: File[]) {
    const arquivos = todos.filter((f) => !f.name.startsWith("."));
    if (!arquivos.length) { mostrarToast("Nenhum arquivo na pasta.", "erro"); return; }

    try {
      setLendoPasta(true);
      mostrarToast(`📁 Lendo ${arquivos.length} arquivo(s) da pasta...`, "info");

      const fd = new FormData();
      for (const f of arquivos) {
        fd.append("arquivos", f, f.name);
        fd.append("caminhos", (f as any).webkitRelativePath || f.name);
      }

      const r = await fetch("/api/lip/ler-pasta", { method: "POST", body: fd });
      const data = await r.json();
      if (!data.ok) throw new Error(data.erro || "Falha ao ler a pasta");

      setPropostaPasta(data);
      registrar({
        modulo: "LIP", acao: "LIP_LEITURA_PASTA", processo_codigo: idUrl, origem: "SISTEMA",
        detalhe: { arquivos: arquivos.length, campos: Object.keys(data.campos ?? {}).length, ms: data.msLeitura },
      });
    } catch (e: any) {
      mostrarToast("Erro na leitura da pasta: " + (e?.message ?? e), "erro");
    } finally {
      setLendoPasta(false);
    }
  }

  /**
   * Aceite em bloco. Nada entra no LIP sozinho: a leitura é uma PROPOSTA, e é aqui — e só aqui —
   * que ela vira valor gravado. Decisão do analista: aceita tudo de uma vez, sem marcar campo a
   * campo.
   */
  function aceitarPropostaPasta() {
    const p = propostaPasta;
    if (!p) return;
    setD((prev) => {
      const novo = { ...prev };
      for (const [chave, item] of Object.entries(p.campos as Record<string, any>)) {
        if (!item?.valor) continue;
        novo[chave] = { valor: item.valor, origem: "urbis", fonte: item.fonte };
      }
      // o log da leitura vai para a aba OBS, como já acontece na leitura por arquivo
      const linhas = [
        `📁 LEITURA DA PASTA — ${new Date().toLocaleString("pt-BR")}`,
        `Arquivos: ${p.catalogo.length} · rodadas: ${(p.rodadas ?? []).join(", ")} · sem IA`,
        ...p.obrigatorios.filter((o: any) => !o.presente).map((o: any) => `  ⚠ FALTA: ${o.nome}`),
        ...p.conferencias
          .filter((c: any) => c.estado === "NÃO CONFERE")
          .map((c: any) => `  ✘ ${c.nome} — ${c.detalhe}`),
        ...p.conferencias
          .filter((c: any) => c.estado === "SEM DADO" && c.dependencia)
          .map((c: any) => `  ? ${c.nome} (depende de: ${c.dependencia})`),
      ].join("\n");
      const obsAtual = novo["observacoes"]?.valor ?? "";
      novo["observacoes"] = { valor: obsAtual ? obsAtual + "\n\n" + linhas : linhas, origem: "urbis", fonte: "LIP" };
      corrigirSeiFisico(novo, idUrl);
      autoSalvar(novo);
      return novo;
    });
    mostrarToast(`✅ ${Object.keys(p.campos).length} campos aceitos`, "sucesso");
    setPropostaPasta(null);
  }

  async function lerLip(arquivos: File[]) {
    const _t0Leitura = Date.now();
    const _dataLeitura = new Date().toLocaleString("pt-BR");
    let _docsLeitura: any[] = [];
    let _incompatLeitura: string[] = [];
    let _veredicto: VeredictoMarcoTemporal | null = null;
    try {
      setLendoLip(true);
      setTempoLeitura(0);
      if (tempoLeituraRef.current) clearInterval(tempoLeituraRef.current);
      tempoLeituraRef.current = setInterval(() => setTempoLeitura(t => t + 1), 1000);
      setProgresso(5);
      mostrarToast(`📄 Iniciando leitura de ${arquivos.length} arquivo(s)...`, "info");

      const resultados = [];
      for (const arquivo of arquivos) {
        resultados.push(await (async (arquivo) => {
          // 2. S1 — Upload para Gemini File API (streaming direto)
          if (arquivo.size > 50 * 1024 * 1024) {
            throw new Error(`PDF "${arquivo.name}" tem ${(arquivo.size/1024/1024).toFixed(0)}MB — limite é 50MB. Comprima o PDF antes de enviar.`);
          }
          setProgresso(20);
          mostrarToast("📤 S1: Enviando PDF para Gemini...", "info");
          // O tipo vai junto: print de tela (PNG/JPG) precisa chegar ao
          // Gemini como imagem, não como PDF.
          const tipoArquivo = arquivo.type || "application/pdf";
          const s1Res = await fetch("/api/lip/s1", {
            method: "POST",
            headers: {
              "Content-Type": tipoArquivo,
              "X-File-Type": tipoArquivo,
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
            body: JSON.stringify({ fileUri, assunto_id: assuntoIdRef.current, mimeType: s1Data.mimeType }),
          });
          const s2Data = await s2Res.json();
          const documentos = s2Data.ok ? (s2Data.documentos ?? []) : [];

          // 4. S3 — Extração inteligente do LIP
          registrar({ modulo: "LIP", acao: "LIP_ANALISE_IA_INICIADA", processo_codigo: idUrl, origem: "IA", detalhe: { arquivo: arquivo.name } });
          setProgresso(70);
          mostrarToast("🧠 S3: Preenchendo LIP com IA...", "info");
          const pdfBase64 = await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res((r.result as string).split(",")[1]);
            r.readAsDataURL(arquivo);
          });
          const s3Init = await fetch("/api/lip/s3", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileUri, documentos, codigo: idUrl, fileName: arquivo.name, pdfBase64, assunto_id: assuntoIdRef.current, mimeType: s1Data.mimeType }),
          }).then(r => r.json());
          if (!s3Init.ok) {
            if (s3Init.erro === "LIMITE_DIARIO_GEMINI" || s3Init.erro === "BUDGET_EXCEDIDO") {
              try { await fetch("/api/lip/registrar-evento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: idUrl, fileName: arquivo.name, status: "LIMITE" }) }); } catch (_) {}
            }
            throw new Error("S3: " + (s3Init.erro || "Erro ao iniciar leitura"));
          }
          mostrarToast("⏳ Lendo PDF com IA... isso pode levar alguns minutos", "info");
          const s3Data = await aguardarJobS3(s3Init.jobId);

          registrar({ modulo: "LIP", acao: "LIP_ANALISE_IA_CONCLUIDA", processo_codigo: idUrl, origem: "IA", detalhe: { campos: Object.keys(s3Data.campos ?? {}).length, alertas: (s3Data.alertasMAC ?? []).length } });
          return {
            campos: s3Data.campos ?? {},
            alertasMAC: s3Data.alertasMAC ?? [],
            validacoes: s3Data.validacoes ?? {},
            pendencias: s3Data.pendencias ?? [],
            marcoTemporal: s3Data.marcoTemporal ?? null,
            tipoProcesso: s3Data.tipoProcesso ?? null,
            documentos,
          };
        })(arquivo));
      }

      // Coleta documentos e incompatibilidades de todos os arquivos lidos
      for (const r of resultados) {
        if (Array.isArray((r as any).documentos)) _docsLeitura.push(...(r as any).documentos);
        if (Array.isArray((r as any).pendencias)) _incompatLeitura.push(...(r as any).pendencias);
        if (Array.isArray((r as any).alertasMAC)) _incompatLeitura.push(...(r as any).alertasMAC);
      }

      // ── Marco temporal (LC 314/2018) ──────────────────────────────
      // Vale o pior veredito entre os arquivos lidos: basta uma vistoria
      // reprovar para o processo não passar. O veredito é do fiscal — o
      // URBIS só lê o último laudo e repassa.
      const _comMarco = resultados
        .map((r) => avaliarMarcoTemporal((r as any).tipoProcesso ?? tipoUrl, (r as any).marcoTemporal))
        .filter((v): v is VeredictoMarcoTemporal => v !== null);
      _veredicto =
        _comMarco.find((v) => v.naoApta === true) ??
        _comMarco.find((v) => v.naoApta === null) ??
        _comMarco[0] ??
        null;
      if (_veredicto?.naoApta === true) {
        setAlertaMarco(_veredicto);
        registrar({
          modulo: "LIP",
          acao: "LIP_MARCO_TEMPORAL_REPROVADO",
          processo_codigo: idUrl,
          origem: "IA",
          detalhe: { marco: _veredicto.marco.data, leitura: _veredicto.leitura },
        });
      }

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
        corrigirSeiFisico(novo, idUrl);
        autoSalvar(novo);
        return novo;
      });

      const preenchidos = Object.values(mesclado).filter((v: any) => v?.valor && v.valor !== "NP").length;

      // ── Registro da leitura (Observações) — status, documentos, incompatibilidades, tempo ──
      const _seg = Math.round((Date.now() - _t0Leitura) / 1000);
      const _mm = String(Math.floor(_seg / 60)).padStart(2, "0");
      const _ss = String(_seg % 60).padStart(2, "0");
      const _linhasDoc = _docsLeitura.length
        ? _docsLeitura.map((d) => `  • ${formatarDocLeitura(d)}`).join("\n")
        : "  • (mapa de documentos não retornado pela IA)";
      const _incompatUnicas = Array.from(new Set(_incompatLeitura.filter(Boolean).map(String)));
      const _linhasIncompat = _incompatUnicas.length
        ? _incompatUnicas.map((p) => `  ⚠ ${p}`).join("\n")
        : "  • Nenhuma incompatibilidade apontada pela IA.";
      const _linhasMarco = _veredicto
        ? "\n" + [
            `⚖️ Marco temporal (LC nº 314/2018 — limite ${_veredicto.marco.data}):`,
            `  ${_veredicto.naoApta === true ? "⛔" : _veredicto.naoApta === false ? "✅" : "⚠"} ${_veredicto.mensagem}`,
            `  • Conclusão da obra segundo a vistoria: ${_veredicto.leitura.dataConclusaoObra || "Não informado"}`,
            `  • Parecer do fiscal: ${_veredicto.leitura.parecerFiscal || "Não informado"}`,
            ...(_veredicto.leitura.fonte ? [`  • Fonte: ${_veredicto.leitura.fonte}`] : []),
            ...(_veredicto.leitura.trecho ? [`  • Trecho: "${_veredicto.leitura.trecho}"`] : []),
          ].join("\n")
        : "";
      const _bloco =
        `━━━ LEITURA DO PROCESSO (LIP) ━━━\n` +
        `✅ Status: LEITURA CONCLUÍDA | ${_dataLeitura} | Duração: ${_mm}:${_ss} | ${preenchidos} campo(s) preenchido(s)\n` +
        `📄 Documentos analisados (${_docsLeitura.length}):\n${_linhasDoc}\n` +
        `🔎 Incompatibilidades:\n${_linhasIncompat}` +
        _linhasMarco;
      anexarObsLip(_bloco);

      mostrarToast(`✅ LIP preenchido! ${preenchidos} campos extraídos.`, "sucesso");
    } catch (e: any) {
      mostrarToast("❌ Erro: " + e.message, "erro");
      const _seg = Math.round((Date.now() - _t0Leitura) / 1000);
      const _mm = String(Math.floor(_seg / 60)).padStart(2, "0");
      const _ss = String(_seg % 60).padStart(2, "0");
      const _pctLido = typeof progresso === "number" ? progresso : 0;
      const _blocoErro =
        `━━━ LEITURA DO PROCESSO (LIP) ━━━\n` +
        `❌ Status: ERRO NA LEITURA | ${_dataLeitura} | Duração até o erro: ${_mm}:${_ss} | Progresso: ${_pctLido}%\n` +
        `⚠ Motivo: ${e.message}`;
      anexarObsLip(_blocoErro);
    } finally {
      if (tempoLeituraRef.current) { clearInterval(tempoLeituraRef.current); tempoLeituraRef.current = null; }
      setTempoLeitura(0);
      setLendoLip(false);
      finalizarProgresso();
    }
  }

  function detectarTipoArquivo(nome: string): string {
    const n = nome.toUpperCase();
    if (n.includes("VISTORIA") || n.includes("FISCAL")) return "VISTORIA";
    if (n.includes("USO")) return "USO_SOLO";
    if (n.includes("CHEADV")) return "CHEADV";
    if (n.includes("PROJETO") || n.includes("LEVANTAMENTO") || n.includes("PLANTA")) return "PROJETO";
    if (n.includes("CERTIDAO") || n.includes("CERTIDÃO") || n.includes("MATRICULA")) return "CERTIDAO";
    if (n.includes("ART") || n.includes("RRT")) return "ART";
    if (n.includes("LAUDO")) return "LAUDO";
    if (n.includes("BUSCA")) return "BUSCA";
    if (n.includes("EMBARGO")) return "EMBARGO";
    if (n.includes("ONEROSA") || n.includes("OUTORGA")) return "ONEROSA";
    if (n.includes("PROCURACAO") || n.includes("PROCURAÇÃO")) return "PROCURACAO";
    if (n.includes("DESPACHO")) return "DESPACHO";
    return "OUTRO";
  }

  function extrairSEIArquivo(nome: string): string | null {
    const m = nome.match(/\b(\d{7,})\b/);
    return m ? m[1] : null;
  }

  async function processarVCP() {
    if (vcpArquivos.length === 0) return;
    setVcpProcessando(true);
    setModalVCP(false);
    setTempoLeitura(0);
    tempoLeituraRef.current = setInterval(() => setTempoLeitura(t => t + 1), 1000);
    try {
      mostrarToast(`📄 VCP: Processando ${vcpArquivos.length} arquivo(s)...`, "info");
      // 1. Processar cada PDF via Gemini serializado (S1→S2→S3)
      const total = vcpArquivos.length;
      const resultados: { nome: string; tipo: string; sei: string | null; campos: Record<string, any> }[] = [];
      for (let i = 0; i < total; i++) {
        const arquivo = vcpArquivos[i];
        setProgresso(Math.round(10 + (i / total) * 60));
        mostrarToast(`📄 VCP: Lendo ${arquivo.name} (${i + 1}/${total})...`, "info");
        const tipoVcp = arquivo.type || "application/pdf";
        const s1Res = await fetch("/api/lip/s1", {
          method: "POST",
          headers: { "Content-Type": tipoVcp, "X-File-Type": tipoVcp, "X-File-Size": arquivo.size.toString(), "X-File-Name": arquivo.name },
          body: arquivo,
        });
        const s1Data = await s1Res.json();
        if (!s1Data.ok) throw new Error("S1: " + s1Data.erro);
        const s2Res = await fetch("/api/lip/s2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileUri: s1Data.fileUri, assunto_id: assuntoIdRef.current, mimeType: s1Data.mimeType }) });
        const s2Data = await s2Res.json();
        const pdfBase64vcp = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res((r.result as string).split(",")[1]);
          r.readAsDataURL(arquivo);
        });
        const s3VcpInit = await fetch("/api/lip/s3", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileUri: s1Data.fileUri, documentos: s2Data.documentos ?? [], codigo: idUrl, fileName: arquivo.name, pdfBase64: pdfBase64vcp, assunto_id: assuntoIdRef.current }) }).then(r => r.json());
        if (!s3VcpInit.ok) throw new Error("S3: " + (s3VcpInit.erro || "Erro ao iniciar leitura"));
        mostrarToast(`⏳ VCP: Processando ${arquivo.name} com IA...`, "info");
        const s3VcpData = await aguardarJobS3(s3VcpInit.jobId);
        resultados.push({
          nome: arquivo.name,
          tipo: detectarTipoArquivo(arquivo.name),
          sei: extrairSEIArquivo(arquivo.name),
          campos: s3VcpData.campos ?? {},
        });
      }
      setProgresso(80);
      mostrarToast("🔍 VCP: Cruzando dados entre documentos...", "info");
      // 2. Mesclar campos no LIP
      const mesclado: Record<string, { valor: string; fonte: string }> = {};
      for (const { campos } of resultados) {
        for (const chave of Object.keys(campos)) {
          const item = campos[chave];
          if (!mesclado[chave]?.valor && item?.valor && item.valor !== "NP") mesclado[chave] = item;
        }
      }
      // 3. S4 — cruzamento
      const s4Res = await fetch("/api/lip/s4", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivos: resultados }) });
      const s4Data = await s4Res.json();
      setProgresso(95);
      // 4. Salvar campos mesclados + OBS
      const lipJaPreenchido = Object.values(d).some((v: any) => v?.origem === "urbis" || v?.origem === "manual");
      const modoFinal = lipJaPreenchido ? (vcpModo ?? "substituir") : "substituir";
      const agora = new Date().toLocaleTimeString("pt-BR");
      const nomeArquivos = vcpArquivos.map((a: File) => a.name).join(", ");
      const logCabecalho = `=== VCP ${agora} | Modo: ${modoFinal.toUpperCase()} | Arquivos: ${nomeArquivos} ===`;
      if (modoFinal === "sugerir") {
        const sugestoes: Record<string, string> = {};
        Object.keys(mesclado).forEach((chave) => {
          const item = mesclado[chave];
          if (item?.valor && item.valor !== "NP") sugestoes[chave] = item.valor;
        });
        // Sugestões do S4 (divergências) — primeira opção diferente do valor atual
        if (s4Data.sugestoesVCP) {
          for (const [chave, info] of Object.entries(s4Data.sugestoesVCP as Record<string, { opcoes: string[]; descricao: string }>)) {
            const valAtual = (d[chave]?.valor ?? "").toUpperCase();
            const opcaoDiferente = info.opcoes.find(o => o.toUpperCase() !== valAtual);
            if (opcaoDiferente) sugestoes[chave] = opcaoDiferente;
          }
        }
        setVcpSugestoes(sugestoes);
        setD((prev) => {
          const novo = { ...prev };
          const obsAtual = (prev["observacoes"]?.valor ?? "").trim();
          const obsNova = logCabecalho + (s4Data.ok && s4Data.obsTexto ? "\n" + s4Data.obsTexto : "");
          novo["observacoes"] = { valor: obsAtual ? obsAtual + "\n\n" + obsNova : obsNova, origem: "urbis", fonte: "VCP" };
          autoSalvar(novo);
          return novo;
        });
      } else {
        setVcpSugestoes({});
        setD((prev) => {
          const novo = { ...prev };
          Object.keys(mesclado).forEach((chave) => {
            const item = mesclado[chave];
            if (!item?.valor) return;
            novo[chave] = { valor: item.valor, origem: "urbis", fonte: item.fonte };
          });
          corrigirSeiFisico(novo, idUrl);
          const obsAtual = (prev["observacoes"]?.valor ?? "").trim();
          const obsNova = logCabecalho + (s4Data.ok && s4Data.obsTexto ? "\n" + s4Data.obsTexto : "");
          novo["observacoes"] = { valor: obsAtual ? obsAtual + "\n\n" + obsNova : obsNova, origem: "urbis", fonte: "VCP" };
          autoSalvar(novo);
          return novo;
        });
      }
      // Gravar tempo na OBS
      const tempoFinal = tempoLeitura;
      const mm = String(Math.floor(tempoFinal / 60)).padStart(2, '0');
      const ss = String(tempoFinal % 60).padStart(2, '0');
      setD((prev) => {
        const novo = { ...prev };
        const obsAtual = (novo['observacoes']?.valor ?? '').trim();
        const linhaTemp = `⏱ VCP concluído em ${mm}:${ss} — ${vcpArquivos.length} arquivo(s) lido(s).`;
        novo['observacoes'] = { valor: obsAtual ? obsAtual + '\n' + linhaTemp : linhaTemp, origem: 'urbis', fonte: 'VCP' };
        autoSalvar(novo);
        return novo;
      });
      setVcpModo(null);
      const totalInc = s4Data.total ?? 0;
      mostrarToast(totalInc > 0 ? `⚠️ VCP concluído: ${totalInc} inconsistência(s) na aba OBS.` : "✅ VCP concluído: nenhuma inconsistência encontrada.", "sucesso");
    } catch (e: any) {
      mostrarToast("❌ VCP: " + e.message, "erro");
      const agoraErrVCP = new Date().toLocaleString("pt-BR");
      setD((prev) => {
        const novo = { ...prev };
        const obsAtual = (novo["observacoes"]?.valor ?? "").trim();
        const linhaErro = `❌ ERRO VCP (${agoraErrVCP}): ${e.message}`;
        novo["observacoes"] = { valor: obsAtual ? obsAtual + "\n" + linhaErro : linhaErro, origem: "urbis", fonte: "VCP" };
        autoSalvar(novo);
        return novo;
      });
    } finally {
      if (tempoLeituraRef.current) { clearInterval(tempoLeituraRef.current); tempoLeituraRef.current = null; }
      setVcpProcessando(false);
      finalizarProgresso();
    }
  }

  async function handleDespachoInterno() {
    setGerandoDI(true);
    try {
      const res = await fetch("/api/despacho-interno", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: idUrl, tipoProcesso: tipoUrl || "regularizacao", numeroDespacho: numDI, data: dataDI, destino: destinoDI === "outro" ? destinoCustomDI : destinoDI, corpo: corpoDI, assunto_id: assuntoIdRef.current }),
      });
      if (!res.ok) throw new Error("Erro");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `DespachoInterno_${idUrl}_${numDI}.docx`; a.click();
      URL.revokeObjectURL(url);
      // Confirma o número apenas após download bem-sucedido
      const _num = parseInt(numDI, 10);
      if (!isNaN(_num)) {
        for (let i = 0; i < 3; i++) {
          try {
            const _c = await fetch(`/api/numeracao/proximo?tipo=despacho&processo=${encodeURIComponent(idUrl)}&modo=commit&numero=${_num}`, { credentials: "include" });
            if (_c.ok || (await _c.json()).ok) break;
          } catch { /* continua */ }
        }
      }
      setModalDI(false);
    } catch { alert("Erro ao gerar despacho interno"); } finally { setGerandoDI(false); }
  }
    async function salvar() {
    setErroCampos(false);
    try {
      setSalvando(true); setStatusSalvo("salvando");
      const res = await fetch("/api/processo/salvar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idUrl, dados: d, tipo: tipoUrl }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 401 || json?.erro === "SESSAO_EXPIRADA") {
          mostrarToast("⚠️ Sua sessão expirou. Faça login em uma nova aba e tente salvar novamente.", "erro");
        } else {
          mostrarToast("Erro ao salvar: " + (json?.erro || "desconhecido"), "erro");
        }
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
    const temSugestaoVCP = vcpSugestoes[campo.chave] !== undefined && vcpSugestoes[campo.chave] !== val.valor;
    if (campo.tipo === "textarea" || campo.chave === "observacoes") {
      return (
        <div key={campo.id} className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
            {campo.label}{mostrarConferir && <span className="ml-1 text-orange-500 font-bold">⚠ CONFERIR</span>}
          </label>
          <textarea value={val.valor} onChange={(e) => u(campo.chave, e.target.value)}
            placeholder={campo.placeholder || campo.label} rows={10}
            className={`w-full rounded border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-vertical ${cor(val.origem)} ${borderCor(val.origem, val.valor)}`} />
          {fonte && val.origem === "original" && <span className="text-xs text-gray-400 italic">📍 {fonte}</span>}
        </div>
      );
    }

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
          {temSugestaoVCP && <span className="ml-1 text-yellow-500 font-bold">⚡ VCP</span>}
        </label>
        {temSugestaoVCP && (
          <div className="mb-1 p-2 rounded border border-yellow-400 bg-yellow-50 text-xs flex items-center gap-2">
            <span className="text-yellow-700">⚡ Sugestão VCP: <strong>{vcpSugestoes[campo.chave]}</strong></span>
            <button onClick={() => { u(campo.chave, vcpSugestoes[campo.chave]); setVcpSugestoes(prev => { const n = {...prev}; delete n[campo.chave]; return n; }); }}
              className="ml-auto px-2 py-0.5 rounded bg-yellow-400 hover:bg-yellow-500 text-white font-bold text-xs">Aceitar</button>
            <button onClick={() => setVcpSugestoes(prev => { const n = {...prev}; delete n[campo.chave]; return n; })}
              className="px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs">Manter</button>
          </div>
        )}
        <div className="relative">
          <input value={val.valor} onFocus={() => { valorAnteriorRef.current[campo.chave] = val.valor; }} onChange={(e) => {
            const v = e.target.value;
            if (campo.chave === "iptu") { u(campo.chave, v.replace(/\D/g, "")); return; }
            if (campo.chave === "cau") {
              // CAU-AXXXXXXX ou CAU AXXXXXXX → normaliza para CAU AXXXXXXX
              const norm = v.toUpperCase().replace(/[^A-Z0-9\s\-]/g, "");
              u(campo.chave, norm); return;
            }
            if (campo.chave === "crea") {
              // CREA XXXXX/UF → aceita números, letras, barra, hífen
              const norm = v.toUpperCase().replace(/[^A-Z0-9\/\-\s]/g, "");
              u(campo.chave, norm); return;
            }
            u(campo.chave, v);
          }}
            onBlur={(e) => {
              if (campo.chave === "cau") { u(campo.chave, e.target.value.toUpperCase().trim()); }
              else if (campo.chave === "crea") u(campo.chave, normalizarRegistro(e.target.value, "crea"));
              const anterior = valorAnteriorRef.current[campo.chave] ?? "";
              const atual = e.target.value;
              if (atual !== anterior) {
                registrar({ modulo: "LIP", acao: "LIP_CAMPO_ALTERADO", processo_codigo: idUrl, origem: "MANUAL",
                  detalhe: { campo: campo.chave, label: campo.label, valor_anterior: anterior, valor_novo: atual } });
              }
              // Rotina padrão de dicas do URBI: ao preencher o responsável
              // técnico, consulta o histórico factual dele (Módulo
              // Profissionais) e, se houver algo relevante, dispara a
              // dica. Silencioso em qualquer falha — nunca atrapalha o save.
              if ((campo.chave === "nome_responsavel_arq" || campo.chave === "nome_responsavel_eng") && atual.trim() && atual !== anterior) {
                const qs = new URLSearchParams({
                  nome: atual.trim(),
                  cau: d.cau?.valor ?? "",
                  crea: d.crea?.valor ?? "",
                  processo_atual: idUrl,
                });
                fetch(`/api/profissionais/historico?${qs.toString()}`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((json) => {
                    if (json?.ok && json.encontrado && json.mensagem) {
                      window.dispatchEvent(new CustomEvent("urbi:dica", { detail: { processoId: idUrl, mensagem: json.mensagem } }));
                    }
                  })
                  .catch(() => {});
              }
            }}
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
    { cor: "bg-[var(--text-primary)]", label: "Original (documento)" },
    { cor: "bg-[#2563EB]", label: "Urbis (automático)" },
    { cor: "bg-[var(--accent)]", label: "Manual (digitado)" },
    { cor: "bg-[#EA580C]", label: "Padrão (conferir!)" },
  ];
  // "Preenchido" é o que alguém de fato preencheu — leitura da IA ou
  // digitação. Valor padrão não conta: com 59 padrões na Aprovação de
  // Projeto, o LIP abria dizendo que 59 campos já estavam preenchidos,
  // o que inflava o percentual e escondia o trabalho que faltava.
  const camposPreenchidos = Object.entries(d).filter(
    ([k, c]) => k !== "coordenadas" && c.valor?.trim() !== "" && c.origem !== "padrao",
  );
  const totalPadraoComValor = Object.entries(d).filter(
    ([k, c]) => k !== "coordenadas" && c.valor?.trim() !== "" && c.origem === "padrao",
  ).length;
  const totalPreenchidos = camposPreenchidos.length;
  const totalUrbis = camposPreenchidos.filter(([_, c]) => c.origem === "urbis").length;
  const pctIA = totalPreenchidos > 0 ? Math.round((totalUrbis / totalPreenchidos) * 100) : 0;

  if (carregandoAbas) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Carregando estrutura do formulário...</p>
      </div>
    );
  }

  const abaAtual = abasDB[aba];
  const isUltimaAba = aba === abasDB.length - 1;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-4 md:p-6 text-[var(--text-primary)]">
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} onClose={() => setToast(null)} />}
      {alertaMarco && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border-2 border-red-600 rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-bold text-red-400 mb-1">⛔ MARCO TEMPORAL NÃO ATENDIDO</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Lei Complementar nº 314, de 05 de novembro de 2018 — {alertaMarco.marco.rotulo}: limite {alertaMarco.marco.data}
            </p>
            <p className="text-sm text-[var(--text-primary)] mb-4">
              Segundo a <strong>última vistoria fiscal</strong>, a edificação <strong>não está apta</strong>:
              a estrutura não estava concluída antes de {alertaMarco.marco.data}.
            </p>
            <p className="text-sm text-red-300 font-semibold mb-4">
              Este processo deve ser INDEFERIDO por não atender ao marco temporal da
              Lei Complementar nº 314/2018 — não há necessidade de analisá-lo.
            </p>
            <div className="bg-[var(--bg-secondary)] rounded-lg p-3 mb-4 text-xs space-y-1">
              <p className="text-[var(--text-secondary)]">
                <span className="text-[var(--text-muted)]">Conclusão da obra segundo a vistoria:</span>{" "}
                <strong className="text-[var(--text-primary)]">{alertaMarco.leitura.dataConclusaoObra || "Não informado"}</strong>
              </p>
              <p className="text-[var(--text-secondary)]">
                <span className="text-[var(--text-muted)]">Parecer do fiscal:</span>{" "}
                <strong className="text-[var(--text-primary)]">{alertaMarco.leitura.parecerFiscal || "Não informado"}</strong>
              </p>
              {alertaMarco.leitura.fonte && (
                <p className="text-[var(--text-secondary)]">
                  <span className="text-[var(--text-muted)]">Fonte:</span> {alertaMarco.leitura.fonte}
                </p>
              )}
              {alertaMarco.leitura.trecho && (
                <p className="text-[var(--text-muted)] italic pt-1 border-t border-[var(--border)]">
                  “{alertaMarco.leitura.trecho}”
                </p>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Confira o laudo antes de decidir — o URBIS apenas repassa o que o fiscal registrou.
              O registro completo ficou nas Observações do LIP.
            </p>
            <button onClick={() => setAlertaMarco(null)}
              className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-lg text-sm">
              Entendi
            </button>
          </div>
        </div>
      )}
      {modalLimparLip && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border-2 border-red-600 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-red-400 mb-2">⚠️ ATENÇÃO — AÇÃO IRREVERSÍVEL</h2>
            <p className="text-sm text-[var(--text-primary)] mb-2">Você está prestes a <strong>apagar todos os dados do LIP</strong> deste processo.</p>
            <p className="text-sm text-red-300 font-semibold mb-4">Todos os campos preenchidos serão zerados. Esta ação não pode ser desfeita.</p>
            <p className="text-xs text-[var(--text-muted)] mb-4">Recomendamos exportar o Excel antes de continuar.</p>
            <div className="flex gap-3">
              <button onClick={() => setModalLimparLip(false)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={() => {
                setD({});
                setModalLimparLip(false);
                mostrarToast("🗑️ LIP zerado.");
              }}
                className="flex-1 bg-red-700 hover:bg-red-600 text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Confirmar — Limpar tudo
              </button>
            </div>
          </div>
        </div>
      )}
      {/* PROPOSTA DA LEITURA DA PASTA (slot 5) — nada entra no LIP sem passar por aqui */}
      {propostaPasta && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl w-full max-w-4xl max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-[var(--bg-card)] border-b border-[var(--border)] p-4">
              <p className="text-base font-bold text-[var(--text-primary)]">📁 Leitura da pasta — proposta</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {propostaPasta.catalogo.length} arquivo(s) · rodada(s) {(propostaPasta.rodadas ?? []).join(", ")} ·
                {" "}{propostaPasta.custo?.paginasNaPasta} páginas · <b>sem IA</b> ·
                {" "}{Math.round((propostaPasta.msLeitura ?? 0) / 100) / 10}s
              </p>
            </div>

            <div className="p-4 space-y-4">
              {/* documentos obrigatórios ausentes */}
              {propostaPasta.obrigatorios?.some((o: any) => !o.presente) && (
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)] mb-1">Documentos obrigatórios ausentes</p>
                  {propostaPasta.obrigatorios.filter((o: any) => !o.presente).map((o: any) => (
                    <p key={o.papel} className="text-xs text-[#DC2626]">✘ {o.nome}</p>
                  ))}
                </div>
              )}

              {/* catálogo */}
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)] mb-1">O que foi identificado</p>
                <div className="text-xs text-[var(--text-secondary)] space-y-0.5">
                  {propostaPasta.catalogo.map((it: any, i: number) => (
                    <p key={i}>
                      <span className="text-[var(--text-muted)]">r{it.rodada}</span>{" "}
                      {it.soPresenca ? "○" : "●"} {it.nome} → <b>{it.papeis.join(" + ")}</b>
                      {it.confianca !== "alta" && <span className="text-[#EA580C]"> ({it.confianca})</span>}
                      {it.soPresenca && <span className="text-[var(--text-muted)]"> — só presença, não lido</span>}
                      {it.alertaRetrocesso && <span className="text-[#DC2626]"> ⚠ {it.alertaRetrocesso}</span>}
                      {it.divergenciaNome && <span className="text-[#EA580C]"> ⚠ {it.divergenciaNome}</span>}
                    </p>
                  ))}
                  {propostaPasta.duplicidades?.entreRodadas?.map((g: string[], i: number) => (
                    <p key={"d" + i} className="text-[var(--text-muted)]">↺ reenviado sem alteração: {g.join(" → ")}</p>
                  ))}
                </div>
              </div>

              {/* conferências */}
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)] mb-1">Conferências</p>
                <div className="space-y-1">
                  {propostaPasta.conferencias.map((c: any, i: number) => (
                    <div key={i} className="text-xs">
                      <p className={c.estado === "NÃO CONFERE" ? "text-[#DC2626] font-semibold"
                        : c.estado === "CONFERE" ? "text-[#16A34A]"
                        : c.estado === "SEM DADO" ? "text-[#EA580C]" : "text-[var(--text-muted)]"}>
                        {c.estado === "CONFERE" ? "✔" : c.estado === "NÃO CONFERE" ? "✘" : c.estado === "SEM DADO" ? "?" : "i"} {c.nome}
                      </p>
                      <p className="text-[var(--text-muted)] pl-4">{c.detalhe}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* campos propostos, com o valor atual ao lado quando houver conflito */}
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)] mb-1">
                  Campos a preencher ({Object.keys(propostaPasta.campos).length})
                </p>
                <div className="text-xs space-y-0.5">
                  {Object.entries(propostaPasta.campos as Record<string, any>).map(([k, v]) => {
                    const atual = d[k]?.valor;
                    const conflito = atual && atual !== v.valor;
                    return (
                      <p key={k} className="text-[var(--text-secondary)]">
                        <span className="text-[var(--text-muted)]">{k}</span>: <b>{v.valor}</b>
                        {conflito && <span className="text-[#DC2626]"> (substitui &quot;{atual}&quot;)</span>}
                        <span className="text-[var(--text-muted)]"> — {v.origem} · {v.fonte}</span>
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-[var(--bg-card)] border-t border-[var(--border)] p-4 flex justify-end gap-2">
              <button onClick={() => setPropostaPasta(null)}
                className="px-4 py-2 rounded text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Descartar
              </button>
              <button onClick={aceitarPropostaPasta}
                className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white px-4 py-2 rounded text-sm font-bold">
                Aceitar tudo ({Object.keys(propostaPasta.campos).length} campos)
              </button>
            </div>
          </div>
        </div>
      )}

      {modalVCP && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setModalVCP(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            {(() => { const lipPreenchido = Object.values(d).some((v: any) => v?.origem === "urbis" || v?.origem === "manual"); return (
            <>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">📎 Verificação Cruzada de PDFs</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              ⚠️ Nomeie os arquivos indicando o tipo e o número SEI do documento.<br/>
              Exemplos: <span className="font-mono text-[var(--accent)]">VISTORIA 9184440.pdf</span>, <span className="font-mono text-[var(--accent)]">USO 6979846.pdf</span>, <span className="font-mono text-[var(--accent)]">CHEADV 9045907.pdf</span>, <span className="font-mono text-[var(--accent)]">PROJETO 8792319.pdf</span>
            </p>
            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center mb-4 transition-colors ${vcpDragOver ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] hover:border-[var(--accent)]"}`}
              onDragOver={e => { e.preventDefault(); setVcpDragOver(true); }}
              onDragLeave={() => setVcpDragOver(false)}
              onDrop={e => { e.preventDefault(); setVcpDragOver(false); const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".pdf")); setVcpArquivos(prev => { const nomes = prev.map(p => p.name); return [...prev, ...files.filter(f => !nomes.includes(f.name))]; }); }}
            >
              <p className="text-[var(--text-secondary)] text-sm mb-2">Arraste os PDFs aqui</p>
              <label className="cursor-pointer text-xs text-[var(--accent)] underline">
                ou clique para selecionar
                <input type="file" accept=".pdf,image/*" multiple className="hidden" onChange={e => { const files = Array.from(e.target.files || []); setVcpArquivos(prev => { const nomes = prev.map(p => p.name); return [...prev, ...files.filter(f => !nomes.includes(f.name))]; }); e.target.value = ""; }} />
              </label>
            </div>
            {vcpArquivos.length > 0 && (
              <div className="mb-4 max-h-48 overflow-y-auto space-y-1">
                {vcpArquivos.map((f, i) => {
                  const n = f.name.toUpperCase();
                  const tipo = n.includes("VISTORIA")||n.includes("FISCAL") ? "VISTORIA" : n.includes("USO") ? "USO_SOLO" : n.includes("CHEADV") ? "CHEADV" : n.includes("PROJETO")||n.includes("LEVANTAMENTO") ? "PROJETO" : n.includes("CERTIDAO")||n.includes("CERTIDÃO") ? "CERTIDAO" : n.includes("ART")||n.includes("RRT") ? "ART" : n.includes("LAUDO") ? "LAUDO" : n.includes("BUSCA") ? "BUSCA" : n.includes("EMBARGO") ? "EMBARGO" : n.includes("ONEROSA") ? "ONEROSA" : "OUTRO";
                  const sei = f.name.match(/\b(\d{7,})\b/)?.[1] ?? null;
                  return (
                    <div key={i} className="flex items-center justify-between bg-[var(--bg-secondary)] rounded px-3 py-1.5 text-xs">
                      <span className="text-[var(--text-primary)] truncate max-w-[60%]">{f.name}</span>
                      <span className="text-[var(--accent)] font-mono ml-2">{tipo}{sei ? ` · ${sei}` : " · sem SEI"}</span>
                      <button onClick={() => setVcpArquivos(prev => prev.filter((_, j) => j !== i))} className="ml-2 text-[var(--text-muted)] hover:text-red-400">✕</button>
                    </div>
                  );
                })}
              </div>
            )}
            {Object.values(d).some((v: any) => v?.origem === "urbis" || v?.origem === "manual") && (
              <div className="mb-4 bg-[var(--bg-secondary)] rounded-xl p-3">
                <p className="text-xs text-[var(--text-secondary)] font-semibold mb-2">LIP já preenchido — o que fazer com os campos extraídos?</p>
                <div className="flex gap-2">
                  <button onClick={() => setVcpModo("substituir")} className={`flex-1 py-2 rounded text-xs font-bold border transition-colors ${vcpModo === "substituir" ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]"}`}>
                    🔄 Substituir tudo
                  </button>
                  <button onClick={() => setVcpModo("sugerir")} className={`flex-1 py-2 rounded text-xs font-bold border transition-colors ${vcpModo === "sugerir" ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]"}`}>
                    💡 Sugerir valores
                  </button>
                </div>
                {vcpModo === "substituir" && <p className="text-xs text-orange-400 mt-1">⚠️ Todos os campos do LIP serão sobrescritos.</p>}
                {vcpModo === "sugerir" && <p className="text-xs text-green-400 mt-1">✅ Sugestões aparecem em cada campo — você decide o que aceitar.</p>}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setModalVCP(false)} className="px-4 py-2 rounded text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancelar</button>
              <button
                disabled={vcpArquivos.length === 0 || (Object.values(d).some((v: any) => v?.origem === "urbis" || v?.origem === "manual") && !vcpModo)}
                onClick={processarVCP}
                className={`px-4 py-2 rounded font-bold text-sm ${(vcpArquivos.length === 0 || (Object.values(d).some((v: any) => v?.origem === "urbis" || v?.origem === "manual") && !vcpModo)) ? "bg-[var(--bg-secondary)] text-[var(--text-muted)] cursor-not-allowed" : "bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white"}`}
              >
                🔍 Processar ({vcpArquivos.length} arquivo{vcpArquivos.length !== 1 ? "s" : ""})
              </button>
            </div>
            </> ); })()}
          </div>
        </div>
      )}
      {modalDI && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">📨 Despacho Interno</h2>
              <button onClick={() => setModalDI(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Nº Despacho</label>
                  <input value={numDICarregando ? "" : numDI} onChange={e => setNumDI(e.target.value)} placeholder={numDICarregando ? "Buscando..." : "Ex: 042"} disabled={numDICarregando} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60" />
                  {numDIBloqueio && <p className="text-xs text-[var(--error)] mt-1">{numDIBloqueio}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Data</label>
                  <input value={dataDI} onChange={e => setDataDI(e.target.value)} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Destinatário</label>
                <select value={destinoDI} onChange={e => setDestinoDI(e.target.value)} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Selecione...</option>
                  <option value="GERECCO">GERECCO</option>
                  <option value="GERAED">GERAED</option>
                  <option value="GERAGP">GERAGP</option>
                  <option value="DIRAAP">DIRAAP</option>
                  <option value="outro">Outro...</option>
                </select>
                {destinoDI === "outro" && (
                  <input value={destinoCustomDI} onChange={e => setDestinoCustomDI(e.target.value)} placeholder="Informe o destinatário" className="mt-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Conteúdo</label>
                <textarea value={corpoDI} onChange={e => setCorpoDI(e.target.value)} rows={5} placeholder="Redija o conteúdo do despacho interno..." className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleDespachoInterno} disabled={gerandoDI || !numDI || !!numDIBloqueio || !destinoDI || !corpoDI}
                className="flex-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                {gerandoDI ? "⏳ Gerando..." : "📨 Gerar e Baixar"}
              </button>
              <button onClick={() => setModalDI(false)}
                className="bg-[var(--bg-secondary)] hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
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
            className="mt-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🏠 Home
          </button>
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
            className="mt-1 bg-red-800 hover:bg-red-700 text-red-200 hover:text-[var(--text-primary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🚪 Sair
          </button>
          <button onClick={() => router.push("/processos")}
            className="mt-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
            ← Processos
          </button>
          <button onClick={async () => {
              // Só bloqueia se houver campos marcados com X (pendências reais)
              if (totalPadrao > 0) { setConfirmarMac(true); return; }
              await salvar();
              const rotaMac = tipoUrl === "aceite_sei" ? "/analise-aceite-sei" : "/analise-regularizacao";
              router.push(`${rotaMac}/${encodeURIComponent(idUrl)}`);
            }}
            className="mt-1 bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
            MAC →
          </button>
          <button onClick={() => { void salvar(); const rotaMac2 = tipoUrl === "aceite_sei" ? "/analise-aceite-sei" : "/analise-regularizacao"; window.open(`${rotaMac2}/${encodeURIComponent(idUrl)}`, "_blank"); }}
            className="mt-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors border border-[var(--border)]">
            MAC ↗
          </button>
          <button onClick={async () => {
              setNumDIBloqueio(null);
              setNumDICarregando(true);
              try {
                const _r = await fetch(`/api/numeracao/proximo?tipo=despacho&processo=${encodeURIComponent(idUrl)}&modo=peek`, { credentials: "include" });
                const _j = await _r.json();
                if (_j.ok) { setNumDI(String(_j.numero).padStart(3, "0")); setNumDIBloqueio(null); }
                else { setNumDI(""); setNumDIBloqueio(_j.esgotado ? "Faixa esgotada. Acesse Configurações → Numeração." : "Nenhuma faixa cadastrada. Acesse Configurações → Numeração."); }
              } catch { setNumDI(""); setNumDIBloqueio("Erro ao buscar número de despacho."); }
              finally { setNumDICarregando(false); }
              setModalDI(true);
            }}
            className="mt-1 bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
            📨 Despacho Interno
          </button>
          {perfisUsuario.includes("Administrador") && (
            <button onClick={() => router.push("/admin/lip")}
              className="mt-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ⚙️ Gerenciar LIP
            </button>
          )}
          <a
            href={`/api/processo/exportar-lip?codigo=${encodeURIComponent(idUrl)}&tipo=${tipoUrl || "regularizacao"}`}
            download
            className="mt-1 bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
            📊 Exportar Excel
          </a>
          <button
            type="button"
            onClick={() => inputImportRef.current?.click()}
            disabled={importando || !idUrl}
            className="mt-1 bg-[var(--primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
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
            className="mt-1 bg-[var(--error-bg)] hover:bg-[var(--error)] hover:text-white text-[var(--error)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🗑️ Limpar LIP
          </button>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">📋 LIP - Leitura Inteligente de Processo</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              {perfilNum.rotulo}: <span className="text-[var(--accent)] font-mono">{idUrl || "—"}</span>
              {" · "}<span className="text-[var(--text-muted)]">{nomeAssunto ?? rotuloTipo(tipoUrl)}</span>
            </p>
            {d.proprietario?.valor && (
              <p className="text-[var(--text-muted)] text-sm mt-0.5">{d.proprietario.valor}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-xs h-5">
            {statusSalvo === "salvando" && <span className="text-[var(--warning)] animate-pulse">⏳ Salvando...</span>}
            {statusSalvo === "salvo" && <span className="text-[var(--success)]">✓ Salvo automaticamente</span>}
            {statusSalvo === "erro" && <span className="text-[var(--error)]">✗ Erro ao salvar</span>}
          </div>
          <div className="hidden md:flex flex-row items-center gap-4">
            <div className="flex flex-col gap-1 text-xs">
              {legenda.map((l) => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${l.cor}`} />
                  <span className="text-[var(--text-muted)]">{l.label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1 text-xs border-l border-[var(--border)] pl-4">
              {[
                { emoji: "🗜️", label: "Comprimir PDF", url: "https://www.ilovepdf.com/pt/comprimir_pdf" },
                { emoji: "🗺️", label: "Mapa Fácil", url: "https://portalmapa.goiania.go.gov.br/mapafacil/" },
                { emoji: "🚫", label: "Embargos", url: "https://www.goiania.go.gov.br/sistemas/sisce/html/sisce00001f0.htm" },
                { emoji: "📋", label: "Consultar Uso", url: "https://www10.goiania.go.gov.br/siusoweb/ConsultarIntegridadeUsoSolo.aspx" },
              ].map((u) => (
                <a key={u.label} href={u.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer">
                  <span>{u.emoji}</span>
                  <span>{u.label}</span>
                </a>
              ))}
            </div>
            <div className="flex flex-col items-center gap-1">
              <svg width="90" height="90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r="38" fill="none" stroke="var(--border)" strokeWidth="8"/>
                <circle cx="45" cy="45" r="38" fill="none"
                  stroke={pctIA >= 70 ? "#22c55e" : pctIA >= 40 ? "#eab308" : "#ef4444"}
                  strokeWidth="8"
                  strokeDasharray={`${(pctIA / 100) * 2 * Math.PI * 38} ${2 * Math.PI * 38}`}
                  strokeLinecap="round"
                  transform="rotate(-90 45 45)"
                />
                <text x="45" y="49" textAnchor="middle" fontSize="20" fontWeight="bold"
                  fill={pctIA >= 70 ? "#22c55e" : pctIA >= 40 ? "#eab308" : "#ef4444"}>
                  {pctIA}%
                </text>
              </svg>
              <span className="text-xs text-[var(--text-muted)] font-semibold">Monitor IA</span>
              <span className="text-[10px] text-[var(--text-muted)] text-center leading-tight">
                {totalUrbis} lidos · {totalPreenchidos - totalUrbis} digitados
                {totalPadraoComValor > 0 && <><br /><span className="text-[#EA580C]">{totalPadraoComValor} no padrão</span></>}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-[var(--text-muted)] text-sm whitespace-nowrap">🔍 Ir para {perfilNumNavegacao.rotuloCurto}:</span>
        <input value={novoProcesso} onChange={(e) => setNovoProcesso(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && navegarParaProcesso()}
          placeholder={perfilNumNavegacao.exemplo}
          className="flex-1 min-w-[180px] bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        <select value={tipoNavegacao} onChange={(e) => setTipoNavegacao(e.target.value as TipoProcesso)}
          className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
          {(assuntosAtivos.length ? assuntosAtivos : [{ slug: tipoUrl, nome: nomeAssunto ?? rotuloTipo(tipoUrl) }]).map((a) => (
            <option key={a.slug} value={a.slug}>{a.nome}</option>
          ))}
        </select>
        <button onClick={navegarParaProcesso} disabled={!novoProcesso.trim()}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--accent-fg)] px-4 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap">
          Cadastrar
        </button>
      </div>

      {/* BLOCO LIP */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">📄 Leitura Inteligente do LIP</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {ehSlot5
                ? "Escolha a pasta do processo — a pasta é a rodada (raiz = 1ª análise, cada subpasta a seguinte)"
                : "Upload do PDF — preenche os campos automaticamente"}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <label className={`cursor-pointer px-4 py-2 rounded font-bold text-sm transition-colors ${lendoLip || lendoPasta ? "bg-[var(--bg-secondary)] text-[var(--text-muted)] cursor-not-allowed" : "bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold"}`}>
              {lendoLip ? "⏳ Lendo..." : lendoPasta ? "⏳ Lendo a pasta..." : ehSlot5 ? "📁 LER PASTA" : `📎 LER PROCESSO ${(nomeAssunto ?? rotuloTipo(tipoUrl)).toUpperCase()}`}
              {/* No slot 5 o analista escolhe a PASTA do processo, não os arquivos: a pasta é a
                  rodada de análise (raiz = 1ª, cada subpasta a seguinte). `webkitdirectory` desce
                  nas subpastas e cada File chega com webkitRelativePath, de onde sai a rodada. */}
              <input ref={inputFileRef} type="file" accept={ehSlot5 ? undefined : ".pdf,image/*"} multiple className="hidden" disabled={lendoLip || lendoPasta}
                {...(ehSlot5 ? { webkitdirectory: "", directory: "" } as any : {})}
                onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) (ehSlot5 ? lerPasta(fs) : lerLip(fs)); e.target.value = ""; }} />
            </label>
            <button
              disabled={lendoLip}
              onClick={() => { setVcpArquivos([]); setModalVCP(true); }}
              className={`px-4 py-2 rounded font-bold text-sm transition-colors ${lendoLip ? "bg-[var(--bg-secondary)] text-[var(--text-muted)] cursor-not-allowed" : "bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold"}`}
            >
              📎 LER ARQUIVOS INDIVIDUAIS
            </button>
          </div>
        </div>
      </div>

      {progresso > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 mb-4">
          <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
            <span>🤖 Lendo PDF com IA...</span>
            <span className="flex gap-2">
              <span className="text-[var(--text-muted)]">{String(Math.floor(tempoLeitura/60)).padStart(2,'0')}:{String(tempoLeitura%60).padStart(2,'0')}</span>
              <span>{progresso}%</span>
            </span>
          </div>
          <div className="w-full bg-[var(--bg-secondary)] rounded-full h-2">
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
            <span className="ml-4 text-[var(--warning)]">{mostrarPendentes ? "▲ Fechar" : "▼ Ver campos"}</span>
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
        {abasDB.map((a, i) => {
          const temPendente = a.lip_campos.some(
            (c) => c.chave !== "coordenadas" && d[c.chave]?.origem === "padrao" && (d[c.chave]?.valor ?? "").trim() === ""
          );
          return (
            <button key={a.id} onClick={() => setAba(i)}
              className={`relative px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                aba === i ? "bg-[var(--accent)] text-[var(--accent-fg)]" :
                temPendente ? "bg-[#FEE2E2] border border-[#991B1B] text-[#991B1B] hover:bg-[#FECACA]" :
                "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
              }`}>
              {a.nome}
              {temPendente && <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-400 rounded-full border border-slate-900" />}
            </button>
          );
        })}
      </div>

      {/* FORMULÁRIO */}
      {abaAtual && (
        <div className="bg-white text-black p-5 rounded-xl shadow-lg space-y-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold text-slate-800">{abaAtual.nome}</h2>
              {abaAtual.dica && <p className="text-xs text-[var(--text-muted)] mt-0.5">💡 {abaAtual.dica}</p>}
            </div>
            <span className="text-xs bg-slate-100 text-[var(--text-muted)] px-2 py-1 rounded">{aba + 1} / {abasDB.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {abaAtual.lip_campos.map((campo) => renderCampo(campo))}
          </div>
        </div>
      )}

      {/* NAVEGAÇÃO ABAS */}
      <div className="flex items-center gap-3 mt-4">
        <button onClick={() => setAba((a) => a - 1)} disabled={aba === 0}
          className="bg-[var(--bg-secondary)] hover:bg-slate-500 disabled:opacity-40 px-4 py-2 rounded font-medium text-sm transition-colors">
          ← Voltar
        </button>
        {!isUltimaAba && (
          <button onClick={() => setAba((a) => a + 1)}
            className="bg-[var(--success)] hover:bg-[var(--accent-hover)] px-4 py-2 rounded font-medium text-sm transition-colors">
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
        <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
          <span>Progresso</span><span>{aba + 1} de {abasDB.length} abas</span>
        </div>
        <div className="w-full bg-[var(--bg-secondary)] rounded-full h-1.5">
          <div className="bg-[var(--accent)] h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${((aba + 1) / abasDB.length) * 100}%` }} />
        </div>
      </div>

      {/* HISTÓRICO */}
      <div className="mt-8">
        <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 uppercase tracking-wide">🕐 Histórico de Alterações</h3>
        {historico.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm">Nenhuma alteração registrada ainda.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[var(--bg-secondary)]" />
            <div className="flex flex-col gap-4">
              {historico.map((ev, idx) => {
                const diasUnicos = [...new Set(historico.map(e => diaKey(e.criado_em)))];
                const indiceDia = diasUnicos.indexOf(diaKey(ev.criado_em));
                const cores = corPorIndiceDia(indiceDia);
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
                        <div className="mt-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 text-xs">
                          {ev.operacao === "LIP_LEITURA" ? (
                            <div className="text-[var(--text-secondary)] space-y-1">
                              <p>📄 <span className="text-[var(--text-muted)]">Arquivo:</span> {ev.meta?.arquivo ?? "—"}</p>
                              <p>✅ <span className="text-[var(--text-muted)]">Campos preenchidos:</span> {ev.meta?.camposPreenchidos ?? 0}</p>
                              <p>🟢 <span className="text-[var(--text-muted)]">Status:</span> {ev.meta?.status ?? "—"}</p>
                            </div>
                          ) : ev.campos.length > 0 ? (
                            <table className="w-full mb-3">
                              <thead>
                                <tr className="text-[var(--text-muted)]">
                                  <th className="text-left pb-1 font-semibold">Campo</th>
                                  <th className="text-left pb-1 font-semibold">De</th>
                                  <th className="text-left pb-1 font-semibold">Para</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ev.campos.map((c, i) => (
                                  <tr key={i} className="border-t border-[var(--border)]">
                                    <td className="py-1 text-[var(--text-secondary)] pr-3">{c.campo}</td>
                                    <td className="py-1 text-[var(--text-muted)] pr-3 font-mono">{c.de || "—"}</td>
                                    <td className="py-1 text-green-400 font-mono">{c.para || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-[var(--text-muted)] mb-3">Processo criado.</p>
                          )}
                          {ev.snapshot && !esteConfirmando && (
                            <button onClick={() => setConfirmando(ev.id)}
                              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] text-xs font-bold px-3 py-1.5 rounded transition-colors">
                              ↩ Restaurar para este momento
                            </button>
                          )}
                          {esteConfirmando && (
                            <div className="bg-[var(--bg-secondary)] border border-orange-500 rounded p-3 mt-2">
                              <p className="text-orange-300 text-xs font-semibold mb-2">
                                ⚠️ Tem certeza? Todas as alterações feitas após este momento serão revertidas.
                              </p>
                              <div className="flex gap-2">
                                {perfisUsuario.some(p => ["Administrador","Diretora","Diretor"].includes(p)) ? (
                                  <>
                                    <button onClick={() => restaurar(ev)} disabled={!!esteRestaurando}
                                      className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-[var(--text-primary)] text-xs font-bold px-3 py-1.5 rounded transition-colors">
                                      {esteRestaurando ? "Restaurando..." : "✓ Confirmar restauração"}
                                    </button>
                                    <button onClick={() => setConfirmando(null)}
                                      className="bg-[var(--bg-secondary)] hover:bg-slate-500 text-[var(--text-primary)] text-xs font-bold px-3 py-1.5 rounded transition-colors">
                                      Cancelar
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => setConfirmando(null)}
                                    className="bg-[var(--bg-secondary)] hover:bg-slate-500 text-[var(--text-primary)] text-xs font-bold px-3 py-1.5 rounded transition-colors">
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






      {confirmarMac && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-orange-600 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-orange-400 font-bold text-lg mb-3">⚠️ Campos pendentes no LIP</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-5">Existem campos em laranja não conferidos. Deseja ir para o MAC mesmo assim?</p>
            <div className="flex gap-3">
              <button onClick={async () => { setConfirmarMac(false); await salvar(); const rotaMac3 = tipoUrl === "aceite_sei" ? "/analise-aceite-sei" : "/analise-regularizacao"; router.push(`${rotaMac3}/${encodeURIComponent(idUrl)}`); }}
                className="flex-1 bg-orange-700 hover:bg-orange-600 text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Ir assim mesmo
              </button>
              <button onClick={() => setConfirmarMac(false)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Voltar e conferir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}