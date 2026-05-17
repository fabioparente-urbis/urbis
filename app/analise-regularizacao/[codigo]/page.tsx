"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BotaoGerarLaudo } from "@/components/mac/BotaoGerarLaudo";

type StatusItem = "conforme" | "nao_conforme" | "nao_aplica" | null;

type Item = {
  id: string;
  grupo: string;
  texto: string;
  ref?: string;
  ordem: number;
};

type Modelo = {
  id: string;
  nome: string;
  tipo_processo: string | null;
  dono_id: string | null;
};

export default function MacPage() {
  const params = useParams();
  const router = useRouter();
  const codigo = decodeURIComponent(params?.codigo as string ?? "");

  const [analises, setAnalises] = useState<any[]>([]);
  const [analiseAtual, setAnaliseAtual] = useState<any | null>(null);
  const [itens, setItens] = useState<Record<string, StatusItem>>({});
  const [fontes, setFontes] = useState<Record<string, "auto" | "p2" | "manual" | null>>({});
  const [aceites, setAceites] = useState<Record<string, boolean>>({});
  const [analisandoP2, setAnalisandoP2] = useState(false);
  const [progressoP2, setProgressoP2] = useState(0);
  const progressoP2Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputP2Ref = useRef<HTMLInputElement>(null);
  const [checklistItens, setChecklistItens] = useState<Item[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [observacoesPorAba, setObservacoesPorAba] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [historicoMac, setHistoricoMac] = useState<{momento:string;total:number;abas:string[];analista:string}[]>([]);
  const [novaAnalise, setNovaAnalise] = useState(false);
  const [toast, setToast] = useState("");
  const [abaAtual, setAbaAtual] = useState(0);
  const [gerandoDespacho, setGerandoDespacho] = useState(false);
  const [modalDespacho, setModalDespacho] = useState(false);
  const [modalDespachoInterno, setModalDespachoInterno] = useState(false);
  const [numDI, setNumDI] = useState("");
  const [dataDI, setDataDI] = useState(() => new Date().toLocaleDateString("pt-BR"));
  const [destinoDI, setDestinoDI] = useState("");
  const [destinoCustomDI, setDestinoCustomDI] = useState("");
  const [corpoDI, setCorpoDI] = useState("");
  const [gerandoDI, setGerandoDI] = useState(false);
  const [modalPendenciasLip, setModalPendenciasLip] = useState(false);
  const [pendenciasLip, setPendenciasLip] = useState<string[]>([]);
  const [modalIndeferimento, setModalIndeferimento] = useState(false);
  const [motivosIndeferimento, setMotivosIndeferimento] = useState<string[]>([]);
  const [obsIndeferimento, setObsIndeferimento] = useState("");
  const [indeferimentoPendente, setIndeferimentoPendente] = useState<{motivos: string[], obs: string} | null>(null);
  const [tipoDespacho, setTipoDespacho] = useState<"despacho" | "indeferimento" | "arquivamento">("despacho");
  const [numeroDespacho, setNumeroDespacho] = useState("");
  const [numeroRevisao, setNumeroRevisao] = useState<number>(1);
  const [historicoAnalises, setHistoricoAnalises] = useState("");

  // Seleção de modelo
  const [modalModelo, setModalModelo] = useState(false);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [modeloSelecionado, setModeloSelecionado] = useState<Modelo | null>(null);
  const [tipoProcesso, setTipoProcesso] = useState<string>("");

  const GRUPOS = [...new Set(checklistItens.map((i) => i.grupo))];
  const grupoAtual = GRUPOS[abaAtual] ?? "";
  const itensGrupo = checklistItens.filter((i) => i.grupo === grupoAtual);

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const inputImportRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  async function importarExcel(file: File) {
    if (!file || !analiseAtual?.id) {
      mostrarToast("Crie/salve a análise antes de importar.");
      return;
    }
    try {
      setImportando(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("analiseId", analiseAtual.id);
      const res = await fetch("/api/mac/importar-mac", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        mostrarToast(`Erro ao importar: ${json?.erro || res.statusText}`);
        return;
      }
      const naoEnc = Array.isArray(json.naoEncontrados) ? json.naoEncontrados.length : 0;
      mostrarToast(`✅ ${json.atualizados} item(ns) atualizado(s)${naoEnc ? ` · ${naoEnc} não encontrado(s)` : ""}`);
      await carregar();
    } catch (e: any) {
      mostrarToast(`Erro ao importar: ${e?.message || "falha"}`);
    } finally {
      setImportando(false);
      if (inputImportRef.current) inputImportRef.current.value = "";
    }
  }

  async function carregarModelos(tipo: string) {
    const meRes = await fetch("/api/auth/me");
const meJson = await meRes.json();
const uid = meJson.ok ? meJson.data.id : "";
const res = await fetch(`/api/mac/checklists?analista_id=${uid}`);
    const json = await res.json();
    if (json.ok) {
      const filtrados = json.data.filter((m: Modelo) =>
        m.tipo_processo === null || m.tipo_processo === tipo
      );
      setModelos(filtrados);
    }
  }

  async function carregarItensModelo(modeloId: string) {
    const res = await fetch(`/api/mac/checklists/itens?modelo_id=${modeloId}`);
    const json = await res.json();
    if (json.ok) setChecklistItens(json.data);
  }

  async function carregar() {
    setCarregando(true);

    // Busca tipo do processo
    const resPoc = await fetch(`/api/processos?busca=${encodeURIComponent(codigo)}`);
    const jsonPoc = await resPoc.json();
    const tipo = jsonPoc.ok && jsonPoc.data.length > 0 ? jsonPoc.data[0].tipo_processo : "REGULARIZACAO";
    setTipoProcesso(tipo);

    const res = await fetch(`/api/analise-regularizacao?codigo=${encodeURIComponent(codigo)}`);
    const json = await res.json();

    if (json.ok && json.data.length > 0) {
      setAnalises(json.data);
      const ultima = json.data[0];
      setAnaliseAtual(ultima);
      if (analiseAtual?.id) {
        carregarHistoricoMac(analiseAtual.id);
      }
      setItens(ultima.itens || {});
      setFontes(ultima.fontes || {});
      setAceites(ultima.aceites || {});
      setObservacoes(ultima.observacoes || "");
      setObservacoesPorAba(ultima.observacoes_por_aba || {});
      setNumeroRevisao(Number(ultima.numero_revisao) || 1);
      setHistoricoAnalises(ultima.historico_analises || "");
      setNovaAnalise(false);

      // Carrega itens do modelo salvo na análise
      if (ultima.modelo_id) {
        await carregarItensModelo(ultima.modelo_id);
      } else {
        // Sem modelo salvo — carrega o PADRÃO
        await carregarItensModelo("00000000-0000-0000-0000-000000000001");
      }
    } else {
      // Sem análise — abre modal de seleção de modelo
      await carregarModelos(tipo);
      setModalModelo(true);
      setNovaAnalise(true);
    }

    setCarregando(false);
  }

  useEffect(() => { carregar(); }, [codigo]);
  // auto-save ao alterar itens/obs
  useEffect(() => {
    if (checklistItens.length === 0) return;
    const t = setTimeout(() => salvarSilencioso("em_andamento"), 400);
    return () => clearTimeout(t);
  }, [itens, observacoes, observacoesPorAba, fontes, aceites]);


  function setItem(id: string, status: StatusItem) {
    setItens((prev) => ({ ...prev, [id]: status }));
    setFontes((prev) => ({ ...prev, [id]: "manual" }));
    setAceites((prev) => ({ ...prev, [id]: true }));
  }

  function marcarGrupo(grupo: string, status: "conforme" | "nao_conforme" | "nao_aplica") {
    const ids = checklistItens.filter((i) => i.grupo === grupo).map((i) => i.id);
    setItens((prev) => {
      const novo = { ...prev };
      ids.forEach((id) => { novo[id] = status; });
      return novo;
    });
    setFontes((prev) => {
      const novo = { ...prev };
      ids.forEach((id) => { novo[id] = "manual"; });
      return novo;
    });
    setAceites((prev) => {
      const novo = { ...prev };
      ids.forEach((id) => { novo[id] = true; });
      return novo;
    });
  }

  function limparGrupo(grupo: string) {
    const ids = checklistItens.filter((i) => i.grupo === grupo).map((i) => i.id);
    setItens((prev) => {
      const novo = { ...prev };
      ids.forEach((id) => { delete novo[id]; });
      return novo;
    });
    setFontes((prev) => {
      const novo = { ...prev };
      ids.forEach((id) => { delete novo[id]; });
      return novo;
    });
    setAceites((prev) => {
      const novo = { ...prev };
      ids.forEach((id) => { delete novo[id]; });
      return novo;
    });
  }

  async function confirmarModelo() {
    if (!modeloSelecionado) return;
    await carregarItensModelo(modeloSelecionado.id);
    setModalModelo(false);
  }

  // Auto-save silencioso para disparar em troca de aba / clique de botão,
  // sem chamar carregar() (que resetaria estado da UI).

  function carregarHistoricoMac(id: string) {
    fetch(`/api/mac/historico?analiseId=${id}`)
      .then(r => r.json()).then(j => { if (j.ok) setHistoricoMac(j.eventos); });
  }
  async function salvarSilencioso(status = "em_andamento", skipStateUpdate = false) {
    try {
      if (novaAnalise || !analiseAtual) {
        const res = await fetch("/api/analise-regularizacao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processo_codigo: codigo,
            itens,
            fontes,
            aceites,
            observacoes,
            observacoes_por_aba: observacoesPorAba,
            status,
            modelo_id: modeloSelecionado?.id || "00000000-0000-0000-0000-000000000001",
            numero_revisao: numeroRevisao,
            historico_analises: historicoAnalises,
          }),
        });
        const json = await res.json().catch(() => null);
        if (json?.ok && json?.data && !skipStateUpdate) {
          setAnaliseAtual(json.data);
          setNovaAnalise(false);
        }
      } else {
        await fetch("/api/analise-regularizacao", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: analiseAtual.id,
            itens,
            fontes,
            aceites,
            observacoes,
            observacoes_por_aba: observacoesPorAba,
            status,
            numero_revisao: numeroRevisao,
            historico_analises: historicoAnalises,
          }),
        });
      }
    } catch {
      // silencioso por design
    } finally {
      if (analiseAtual?.id) carregarHistoricoMac(analiseAtual.id);
    }
  }

  async function salvar(status = "em_andamento") {
    setSalvando(true);
    try {
      if (novaAnalise || !analiseAtual) {
        const res = await fetch("/api/analise-regularizacao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processo_codigo: codigo,
            itens,
            fontes,
            aceites,
            observacoes,
            observacoes_por_aba: observacoesPorAba,
            status,
            modelo_id: modeloSelecionado?.id || "00000000-0000-0000-0000-000000000001",
            numero_revisao: numeroRevisao,
            historico_analises: historicoAnalises,
          }),
        });
        const json = await res.json();
        if (!json.ok) { mostrarToast("Erro: " + json.erro); return; }
        mostrarToast("Análise criada!");
        await carregar();
      } else {
        const res = await fetch("/api/analise-regularizacao", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: analiseAtual.id,
            itens,
            fontes,
            aceites,
            observacoes,
            observacoes_por_aba: observacoesPorAba,
            status,
            numero_revisao: numeroRevisao,
            historico_analises: historicoAnalises,
          }),
        });
        const json = await res.json();
        if (!json.ok) { mostrarToast("Erro: " + json.erro); return; }
        mostrarToast("Salvo!");
        await carregar();
      }
    } finally {
      setSalvando(false);
      if (analiseAtual?.id) carregarHistoricoMac(analiseAtual.id);
    }
  }

  async function gerarDespacho() {
    setGerandoDespacho(true);
    setModalDespacho(false);
    // Garante que itens e observações atuais estejam persistidos antes do docx
    await salvarSilencioso();
    try {
      const naoConformesIds = checklistItens
        .filter((i) => itens[i.id] === "nao_conforme")
        .map((i) => i.texto);

      const res = await fetch("/api/despacho-regularizacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processo: codigo,
          tipo: tipoDespacho,
          numeroDespacho,
          naoConformes: naoConformesIds,
          observacoes,
          observacoesPorAba,
          analises: analises.map((a) => ({
            numero: a.numero_analise,
            data: new Date(a.criado_em).toLocaleDateString("pt-BR"),
            ultima: a.numero_analise === 5,
          })),
          analiseId: analiseAtual?.id,
          numero_revisao: numeroRevisao,
        }),
      });

      if (!res.ok) { mostrarToast("Erro ao gerar despacho."); return; }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `despacho_${codigo}_${tipoDespacho}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      mostrarToast("✅ Despacho gerado!");
    } catch {
      mostrarToast("Erro ao gerar despacho.");
    } finally {
      setGerandoDespacho(false);
    }
  }

  function iniciarNovaAnalise() {
    if (analises.length >= 5) {
      mostrarToast("Limite de 5 análises atingido.");
      return;
    }
    const ultima = analises[analises.length - 1];
    setAnaliseAtual(null);
    setItens(ultima?.itens || {});
    setFontes(ultima?.fontes || {});
    setAceites(ultima?.aceites || {});
    setObservacoes("");
    setObservacoesPorAba(ultima?.observacoes_por_aba || {});
    setNovaAnalise(true);
    carregarModelos(tipoProcesso).then(() => setModalModelo(true));
  }

  function selecionarAnalise(a: any) {
    setAnaliseAtual(a);
    setItens(a.itens || {});
    setFontes(a.fontes || {});
    setAceites(a.aceites || {});
    setObservacoes(a.observacoes || "");
    setObservacoesPorAba(a.observacoes_por_aba || {});
    setNumeroRevisao(Number(a.numero_revisao) || 1);
    setHistoricoAnalises(a.historico_analises || "");
    setNovaAnalise(false);
    if (a.modelo_id) carregarItensModelo(a.modelo_id);
  }

  const naoConformes = checklistItens.filter((i) => itens[i.id] === "nao_conforme");
  const conformes = checklistItens.filter((i) => itens[i.id] === "conforme");
  const naoAplica = checklistItens.filter((i) => itens[i.id] === "nao_aplica");
  const naoRespondidos = checklistItens.filter((i) => !itens[i.id]);

  function temNaoConformeNaAba(idx: number) {
    return checklistItens.filter((i) => i.grupo === GRUPOS[idx]).some((i) => itens[i.id] === "nao_conforme");
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Carregando...</p>
      </div>
    );
  }

  async function handleDespachoInterno() {
    setGerandoDI(true);
    try {
      const res = await fetch("/api/despacho-interno", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, tipoProcesso: "REGULARIZACAO", numeroDespacho: numDI, data: dataDI, destino: destinoDI === "outro" ? destinoCustomDI : destinoDI, corpo: corpoDI }),
      });
      if (!res.ok) throw new Error("Erro");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `DespachoInterno_${codigo}_${numDI}.docx`; a.click();
      URL.revokeObjectURL(url); setModalDespachoInterno(false);
    } catch { alert("Erro ao gerar despacho interno"); } finally { setGerandoDI(false); }
  }
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-600 text-white px-5 py-3 rounded-xl shadow-2xl text-sm">
          {toast}
        </div>
      )}

      {/* MODAL SELEÇÃO DE MODELO */}
      {modalModelo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="mb-5">
              <h2 className="text-white font-bold text-lg mb-1">📋 Selecione o Checklist</h2>
              <p className="text-slate-400 text-sm">Escolha o modelo de checklist para esta análise</p>
            </div>

            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {modelos.map((m) => (
                <button key={m.id}
                  onClick={() => setModeloSelecionado(m)}
                  className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-colors ${
                    modeloSelecionado?.id === m.id
                      ? "bg-blue-900 border-blue-500 text-white"
                      : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                  }`}>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">
                      {m.dono_id === null ? "⭐ " : "👤 "}{m.nome}
                    </p>
                    {m.tipo_processo && (
                      <p className="text-xs opacity-60 mt-0.5">{m.tipo_processo}</p>
                    )}
                    {m.dono_id === null && (
                      <p className="text-xs text-yellow-400 mt-0.5">Padrão global</p>
                    )}
                  </div>
                  {modeloSelecionado?.id === m.id && (
                    <span className="text-blue-400 text-lg">✓</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={confirmarModelo}
                disabled={!modeloSelecionado}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                Usar este checklist →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERAR DESPACHO */}
      {modalDespacho && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">📄 Gerar Despacho</h2>
              <button onClick={() => setModalDespacho(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Tipo de Documento</label>
                <div className="flex flex-col gap-2">
                  {[
                    { value: "despacho", label: "📋 Despacho ao Interessado", desc: "Com itens não conformes" },
                    { value: "indeferimento", label: "❌ Indeferimento", desc: "Parecer de indeferimento" },
                    { value: "arquivamento", label: "🗂️ Arquivamento", desc: "Parecer de arquivamento" },
                  ].map((op) => (
                    <button key={op.value}
                      onClick={() => setTipoDespacho(op.value as any)}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        tipoDespacho === op.value
                          ? "bg-blue-900 border-blue-500 text-white"
                          : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                      }`}>
                      <div>
                        <p className="text-sm font-semibold">{op.label}</p>
                        <p className="text-xs opacity-70">{op.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Número do Despacho</label>
                <input
                  value={numeroDespacho}
                  onChange={(e) => setNumeroDespacho(e.target.value)}
                  placeholder="Ex: 042"
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {tipoDespacho === "despacho" && naoConformes.length > 0 && (
                <div className="bg-red-950 border border-red-800 rounded-lg p-3">
                  <p className="text-xs text-red-300 font-semibold mb-1">{naoConformes.length} item(ns) não conforme(s):</p>
                  <ul className="space-y-0.5">
                    {naoConformes.slice(0, 5).map((i) => (
                      <li key={i.id} className="text-xs text-red-400">• {i.texto.slice(0, 60)}...</li>
                    ))}
                    {naoConformes.length > 5 && <li className="text-xs text-red-500">+ {naoConformes.length - 5} outros...</li>}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={gerarDespacho} disabled={gerandoDespacho}
                className="flex-1 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                {gerandoDespacho ? "⏳ Gerando..." : "📄 Gerar e Baixar"}
              </button>
              <button onClick={() => setModalDespacho(false)}
                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
              🏠 Home
            </button>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
              className="bg-red-800 hover:bg-red-700 text-red-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
              🚪 Sair
            </button>
                        <button onClick={() => salvar("em_andamento").then(() => router.push(`/processo/${encodeURIComponent(codigo)}`))}
              className="bg-fuchsia-700 hover:bg-fuchsia-600 text-fuchsia-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ← LIP
            </button>
            
            <button onClick={() => setModalDespachoInterno(true)}
              className="bg-indigo-700 hover:bg-indigo-600 text-indigo-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
              📨 Despacho Interno
            </button>
            <button
              type="button"
              onClick={() => { if (analiseAtual?.id) window.open(`/api/mac/exportar-mac?analiseId=${analiseAtual.id}&codigo=${encodeURIComponent(codigo)}`, "_blank"); }}
              disabled={!analiseAtual?.id}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-green-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
              📊 Exportar Excel
            </button>
            <button
              type="button"
              onClick={() => inputImportRef.current?.click()}
              disabled={importando || !analiseAtual?.id}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-emerald-100 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
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
            <div>
              <h1 className="text-xl font-bold">🔍 MAC — Módulo de Análises e Conformidades</h1>
              <p className="text-yellow-400 font-mono text-sm">{codigo}</p>
{modeloSelecionado && (
  <p className="text-slate-400 text-xs mt-0.5">📋 {modeloSelecionado.nome}</p>
)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {analises.map((a) => (
              <button key={a.id} onClick={() => selecionarAnalise(a)}
                className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
                  analiseAtual?.id === a.id
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                }`}>
                {a.numero_analise}ª{a.status === "deferido" ? " ✅" : a.status === "indeferido" ? " ❌" : ""}
              </button>
            ))}
            {novaAnalise && !analiseAtual && (
              <span className="px-3 py-1.5 rounded text-xs font-bold bg-green-800 border border-green-600 text-green-300">
                {analises.length + 1}ª (nova)
              </span>
            )}
            {!novaAnalise && analises.length < 5 && (
              <button onClick={iniciarNovaAnalise}
                className="px-3 py-1.5 rounded text-xs font-bold bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 transition-colors">
                + Nova
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs mb-3">
          <span className="flex items-center gap-1"><span className="bg-green-700 px-2 py-0.5 rounded font-bold">✅</span> <span className="text-slate-300">Conforme</span></span>
          <span className="flex items-center gap-1"><span className="bg-red-700 px-2 py-0.5 rounded font-bold">❌</span> <span className="text-slate-300">Não Conforme</span></span>
          <span className="flex items-center gap-1"><span className="bg-slate-600 px-2 py-0.5 rounded font-bold">⬜</span> <span className="text-slate-300">Não se Aplica</span></span>
          <span className="flex items-center gap-2 ml-auto">
            <label htmlFor="numero_revisao" className="text-slate-400 font-semibold uppercase tracking-wide">Revisão</label>
            <select
              id="numero_revisao"
              value={numeroRevisao}
              onChange={(e) => {
                const v = Number(e.target.value);
                setNumeroRevisao(v);
                void salvarSilencioso();
              }}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>1ª ANÁLISE</option>
              <option value={2}>2ª ANÁLISE</option>
              <option value={3}>3ª ANÁLISE</option>
              <option value={4}>4ª ANÁLISE</option>
              <option value={5}>5ª ANÁLISE (ÚLTIMA*)</option>
            </select>
          </span>
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
            Histórico de análises anteriores
          </label>
          <textarea
            value={historicoAnalises}
            onChange={(e) => setHistoricoAnalises(e.target.value)}
            onBlur={() => void salvarSilencioso()}
            placeholder="Ex: 1ª análise: Analista João — 2ª análise: Analista Maria"
            rows={2}
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-4 text-xs">
          <span className="text-green-400">✅ {conformes.length} conformes</span>
          <span className="text-red-400">❌ {naoConformes.length} não conformes</span>
          <span className="text-slate-400">⬜ {naoAplica.length} não se aplica</span>
          <span className="text-yellow-400">⏳ {naoRespondidos.length} não respondidos</span>
        </div>
      </div>

      <div className="flex flex-1 gap-0 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ABAS */}
          <div className="flex flex-wrap gap-2 px-6 pt-4 pb-2 bg-slate-900">
            {GRUPOS.map((grupo, idx) => {
              const total = checklistItens.filter((i) => i.grupo === grupo).length;
              const respondidos = checklistItens.filter((i) => i.grupo === grupo && itens[i.id]).length;
              const temErro = temNaoConformeNaAba(idx);
              return (
                <button key={grupo} onClick={() => { void salvarSilencioso(); setAbaAtual(idx); }}
                  className={`relative px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    abaAtual === idx ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}>
                  {grupo}
                  <span className="ml-1.5 text-xs opacity-60">{respondidos}/{total}</span>
                  {temErro && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-slate-900" />}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="flex flex-wrap gap-2 pt-3 pb-1">
              <button onClick={() => marcarGrupo(grupoAtual, "conforme")}
                className="flex items-center gap-1.5 bg-green-900 hover:bg-green-800 border border-green-700 text-green-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                ✅ Todos Conformes
              </button>
              <button onClick={() => marcarGrupo(grupoAtual, "nao_conforme")}
                className="flex items-center gap-1.5 bg-red-900 hover:bg-red-800 border border-red-700 text-red-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                ❌ Todos Não Conformes
              </button>
              <button onClick={() => marcarGrupo(grupoAtual, "nao_aplica")}
                className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-500 text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                ⬜ Todos N/A
              </button>
              <button onClick={() => limparGrupo(grupoAtual)}
                className="flex items-center gap-1.5 bg-yellow-900 hover:bg-yellow-800 border border-yellow-700 text-yellow-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                🔄 Limpar Aba
              </button>
              <button
                onClick={() => inputP2Ref.current?.click()}
                disabled={analisandoP2 || checklistItens.length === 0}
                title="Envia o PDF do processo para o Gemini analisar o checklist automaticamente"
                className="flex items-center gap-1.5 bg-indigo-900 hover:bg-indigo-800 disabled:opacity-50 border border-indigo-600 text-indigo-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                {analisandoP2 ? "⏳ Analisando..." : "🤖 Analisar com P2"}
              </button>
              <input
                ref={inputP2Ref}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setAnalisandoP2(true);
                    setProgressoP2(0);
                    let p = 0;
                    progressoP2Ref.current = setInterval(() => {
                      p += Math.random() * 8 + 2;
                      if (p >= 80) { p = 80; if (progressoP2Ref.current) clearInterval(progressoP2Ref.current); }
                      setProgressoP2(Math.round(p));
                    }, 400);
                    const fd = new FormData();
                    fd.append("file", f);
                    fd.append("codigo", codigo);
                    fd.append("checklistItens", JSON.stringify(
                      checklistItens.map((i) => ({ id: i.id, texto: i.texto, grupo: i.grupo }))
                    ));
                    if (analiseAtual?.id) fd.append("analiseId", analiseAtual.id);
                    const res = await fetch("/api/mac/p2", { method: "POST", body: fd });
                    const json = await res.json().catch(() => null);
                    if (!res.ok || !json?.ok) {
                      mostrarToast(`Erro P2: ${json?.erro || res.statusText}`);
                      return;
                    }
                    // Só preenche itens que ainda são null (analista não tocou)
                    setItens((prev) => {
                      const novo = { ...prev };
                      Object.entries(json.itens || {}).forEach(([id, status]) => {
                        if (prev[id] == null) novo[id] = status as StatusItem;
                      });
                      return novo;
                    });
                    setFontes((prev) => ({ ...prev, ...(json.fontes || {}) }));
                    setAceites((prev) => {
                      const novo = { ...prev };
                      Object.keys(json.fontes || {}).forEach((id) => { novo[id] = false; });
                      return novo;
                    });
                    const total = Object.keys(json.itens || {}).length;
                    mostrarToast(`🤖 P2 sugeriu ${total} item(ns) — revise e aceite.`);
                  } catch (err: any) {
                    mostrarToast(`Erro P2: ${err?.message || "falha"}`);
                  } finally {
                    if (progressoP2Ref.current) clearInterval(progressoP2Ref.current);
                    setProgressoP2(100);
                    setTimeout(() => setProgressoP2(0), 800);
                    setAnalisandoP2(false);
                    if (inputP2Ref.current) inputP2Ref.current.value = "";
                  }
                }}
              />
            </div>

            {progressoP2 > 0 && (
              <div className="flex flex-col gap-1 px-1 py-2">
                <div className="flex justify-between text-xs text-indigo-300 font-semibold">
                  <span>🤖 Analisando PDF com IA...</span>
                  <span>{progressoP2}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div className="bg-indigo-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progressoP2}%` }} />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3 pt-2">
              {itensGrupo.map((item) => {
                const status = itens[item.id];
                const fonte = fontes[item.id] ?? null;
                const aceito = !!aceites[item.id];
                return (
                  <div key={item.id}
                    className={`rounded-xl border p-4 transition-all ${
                      status === "conforme" ? "bg-green-950 border-green-800" :
                      status === "nao_conforme" ? "bg-red-950 border-red-800" :
                      status === "nao_aplica" ? "bg-slate-800 border-slate-700 opacity-50" :
                      "bg-slate-800 border-slate-700"
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-white leading-relaxed">{item.texto}</p>
                        {item.ref && <p className="text-xs text-slate-500 mt-1">{item.ref}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {fonte === "p2" && !aceito && (
                          <button
                            onClick={() => setAceites((prev) => ({ ...prev, [item.id]: true }))}
                            title="Sugestão da IA — clique para aceitar"
                            className="px-2 py-0.5 rounded text-[10px] font-bold border border-yellow-500 bg-yellow-900/40 text-yellow-200 hover:bg-yellow-800/60 transition-colors">
                            🤖 IA — Aceitar
                          </button>
                        )}
                        {fonte === "p2" && aceito && (
                          <span
                            title="Sugestão da IA aceita"
                            className="px-2 py-0.5 rounded text-[10px] font-bold border border-green-600 bg-green-900/40 text-green-200">
                            🤖 IA ✓
                          </span>
                        )}
                        {fonte === "manual" && (
                          <span
                            title="Preenchido manualmente"
                            className="px-2 py-0.5 rounded text-[10px] font-bold border border-slate-600 bg-slate-700/40 text-slate-400">
                            ✏️
                          </span>
                        )}
                        <div className="flex gap-1">
                          {(["conforme", "nao_conforme", "nao_aplica"] as StatusItem[]).map((s) => (
                            <button key={s!}
                              onClick={() => setItem(item.id, status === s ? null : s)}
                              className={`px-2 py-1 rounded text-xs font-bold border transition-all ${
                                status === s
                                  ? s === "conforme" ? "bg-green-700 border-green-500 text-white" :
                                    s === "nao_conforme" ? "bg-red-700 border-red-500 text-white" :
                                    "bg-slate-600 border-slate-400 text-white"
                                  : "bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-400"
                              }`}>
                              {s === "conforme" ? "✅" : s === "nao_conforme" ? "❌" : "⬜"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="mt-4">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-2">
                  📝 Observações — {grupoAtual}
                </label>
                <textarea
                  value={observacoesPorAba[grupoAtual] || ""}
                  onChange={(e) => setObservacoesPorAba((prev) => ({ ...prev, [grupoAtual]: e.target.value }))}
                  placeholder={`Observações específicas de ${grupoAtual}...`}
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {abaAtual === GRUPOS.length - 1 && (
                <div className="mt-2">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-2">
                    📋 Observações Gerais do Despacho
                  </label>
                  <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Observações gerais para o despacho final..."
                    rows={4}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              )}
            </div>

            <div className="flex justify-between mt-6">
              <button onClick={() => { void salvarSilencioso(); setAbaAtual((a) => Math.max(0, a - 1)); }} disabled={abaAtual === 0}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-4 py-2 rounded text-sm transition-colors">
                ← Anterior
              </button>
              <button onClick={() => { void salvarSilencioso(); setAbaAtual((a) => Math.min(GRUPOS.length - 1, a + 1)); }} disabled={abaAtual === GRUPOS.length - 1}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-4 py-2 rounded text-sm transition-colors">
                Próxima →
              </button>
            </div>
          </div>
        </div>

        {/* PAINEL LATERAL */}
        <div className="w-72 bg-slate-800 border-l border-slate-700 p-4 flex flex-col gap-4 overflow-y-auto">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Ações</h3>
          <button onClick={() => {
  carregarModelos(tipoProcesso).then(() => setModalModelo(true));
}}
  className="w-full bg-slate-600 hover:bg-slate-500 text-slate-300 font-bold py-2 rounded-lg text-sm transition-colors">
  🔄 Trocar Checklist
</button>
<button onClick={() => router.push("/admin/checklists")}
  className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-2 rounded-lg text-sm transition-colors">
  📋 Gerenciar Checklists
</button>

          <button onClick={() => salvar("em_andamento")} disabled={salvando}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
            {salvando ? "Salvando..." : "💾 Salvar"}
          </button>

          <button onClick={() => salvar("deferido")} disabled={salvando || naoConformes.length > 0}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
            ✅ Deferir
          </button>

          {naoConformes.length > 0 && (
            <p className="text-xs text-yellow-400">⚠️ {naoConformes.length} item(ns) não conforme(s) — impossível deferir.</p>
          )}

          {indeferimentoPendente && (
            <button onClick={async () => {
              const { motivos, obs } = indeferimentoPendente;
              setGerandoDespacho(true);
              await salvarSilencioso("indeferido");
              try {
                const res = await fetch("/api/despacho-regularizacao", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    processo: codigo, tipo: "indeferimento", numeroDespacho: "",
                    naoConformes: motivos, observacoes: obs,
                    analises: analises.map((a) => ({ numero: a.numero_analise, data: new Date(a.criado_em).toLocaleDateString("pt-BR"), ultima: a.numero_analise === 5 })),
                  }),
                });
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url; link.download = `indeferimento_${codigo}.docx`;
                  document.body.appendChild(link); link.click();
                  document.body.removeChild(link); URL.revokeObjectURL(url);
                  setIndeferimentoPendente(null);
                  mostrarToast("✅ Documento de indeferimento gerado!");
                }
              } finally { setGerandoDespacho(false); }
            }}
            className="w-full bg-orange-700 hover:bg-orange-600 text-white font-bold py-2.5 rounded-lg text-sm">
              📄 Baixar Indeferimento
            </button>
          )}
          <button onClick={async () => { await salvarSilencioso(); setModalIndeferimento(true); }} disabled={salvando}
            className="w-full bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
            ❌ Indeferir
          </button>

          <div className="border-t border-slate-700 pt-2">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Documentos</h3>

            <button onClick={async () => {
              // Bloqueia emissão se há sugestões IA não aceitas
              const pendentesAceite = checklistItens.filter(
                (i) => fontes[i.id] === "p2" && !aceites[i.id]
              );
              if (pendentesAceite.length > 0) {
                mostrarToast(`⚠️ ${pendentesAceite.length} item(ns) sugeridos pela IA aguardam aceite.`);
                return;
              }
              await salvarSilencioso();
              try {
                const [procRes, lipRes] = await Promise.all([
                  fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}`),
                  fetch("/api/admin/lip"),
                ]);
                const procJson = await procRes.json();
                const lipJson = await lipRes.json();
                const dados = procJson?.dados || {};
                const campos = (lipJson?.data || []).flatMap((a: any) => a.lip_campos || []);
                const pendentes = campos
                  .filter((c: any) => {
                    const v = dados[c.chave]?.valor;
                    return v === "X";
                  })
                  .map((c: any) => c.label);
                if (pendentes.length > 0) {
                  setPendenciasLip(pendentes);
                  setModalPendenciasLip(true);
                } else {
                  setModalDespacho(true);
                }
              } catch { setModalDespacho(true); }
            }} disabled={gerandoDespacho}
              className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
              {gerandoDespacho ? "⏳ Gerando..." : "📄 Gerar Despacho"}
            </button>
            <div className="mt-2">
              <BotaoGerarLaudo processoId={codigo} />
            </div>
          </div>
          {/* HISTÓRICO MAC */}
          <div className="mt-4 border-t border-slate-700 pt-4 px-1">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">🕐 Histórico</h3>
            {historicoMac.length === 0 ? (
              <p className="text-slate-500 text-xs">Nenhuma alteração ainda.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-700" />
                <div className="flex flex-col gap-3">
                  {historicoMac.map((ev, idx) => (
                    <div key={idx} className="relative flex items-start gap-3 pl-8">
                      <div className="absolute left-1.5 w-3 h-3 rounded-full bg-indigo-500 border-2 border-indigo-300 mt-0.5" />
                      <div className="text-xs text-slate-400 font-mono leading-relaxed">
                        {new Date(ev.momento).toLocaleString("pt-BR")}
                        <br/>
                        <span className="text-slate-300">{ev.total} item(ns) alterado(s)</span>
                        {ev.abas.length > 0 && <span className="text-slate-500"> · {ev.abas.slice(0,3).join(", ")}{ev.abas.length > 3 ? ` +${ev.abas.length-3}` : ""}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalDespachoInterno && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">📨 Despacho Interno</h2>
              <button onClick={() => setModalDespachoInterno(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
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
              <button onClick={() => setModalDespachoInterno(false)}
                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {modalPendenciasLip && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-orange-600 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-bold text-orange-400 mb-2">⚠️ Pendências no LIP</h2>
            <p className="text-slate-300 text-sm mb-3">Os seguintes campos estão vazios ou marcados com X. Deseja emitir o despacho mesmo assim?</p>
            <ul className="text-sm text-red-300 mb-4 max-h-48 overflow-y-auto list-disc pl-5">
              {pendenciasLip.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            <div className="flex gap-3">
              <button onClick={() => { setModalPendenciasLip(false); setModalDespacho(true); }}
                className="flex-1 bg-orange-700 hover:bg-orange-600 text-white font-bold py-2 rounded-lg text-sm">
                Emitir mesmo assim
              </button>
              <button onClick={() => setModalPendenciasLip(false)}
                className="flex-1 bg-slate-600 hover:bg-slate-500 text-slate-200 font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {modalIndeferimento && (
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
                <input type="checkbox" className="mt-1" checked={motivosIndeferimento.includes(motivo)}
                  onChange={(e) => {
                    if (e.target.checked) setMotivosIndeferimento((p) => [...p, motivo]);
                    else setMotivosIndeferimento((p) => p.filter((m) => m !== motivo));
                  }} />
                <span className="text-sm text-slate-300">{motivo}</span>
              </label>
            ))}
            <textarea value={obsIndeferimento} onChange={(e) => setObsIndeferimento(e.target.value)}
              placeholder="Observações adicionais (opcional)..."
              className="w-full mt-3 bg-slate-700 border border-slate-500 rounded p-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none h-20" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setModalIndeferimento(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button
                disabled={salvando}
                onClick={async () => {
                  const motivosCopy = [...motivosIndeferimento];
                  const obsCopy = obsIndeferimento;
                  setIndeferimentoPendente({ motivos: motivosCopy, obs: obsCopy });
                  setModalIndeferimento(false);
                  setMotivosIndeferimento([]);
                  setObsIndeferimento("");
                  await salvar("indeferido");
                }}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-sm">
                Confirmar Indeferimento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}