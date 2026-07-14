"use client";
import { useAuditoria } from "@/hooks/useAuditoria";

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
  assunto_id: string | null;
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
  const [itensPendentesIA, setItensPendentesIA] = useState<any[]>([]);
  const [modalItensPendentesIA, setModalItensPendentesIA] = useState(false);
  const [analisandoP2, setAnalisandoP2] = useState(false);
  const [modalLimparMac, setModalLimparMac] = useState(false);
  const [progressoP2, setProgressoP2] = useState(0);
  const progressoP2Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timerP2, setTimerP2] = useState(0);
  const timerP2Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputP2Ref = useRef<HTMLInputElement>(null);
  const carregandoHistoricoRef = useRef(false);
  const [checklistItens, setChecklistItens] = useState<Item[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [observacoesPorAba, setObservacoesPorAba] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [dadosLip, setDadosLip] = useState<Record<string,any>>({});
  const [bannerCritico, setBannerCritico] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [statusSalvo, setStatusSalvo] = useState<""|"pendente"|"salvando"|"salvo"|"erro">("");
  const [historicoAberto, setHistoricoAberto] = useState<number|null>(null);
  const [historicoMac, setHistoricoMac] = useState<{momento:string;total:number;abas:string[];analista:string;itens:{aba:string;texto:string;ref:string|null;de:string|null;para:string}[]}[]>([]);
  const [novaAnalise, setNovaAnalise] = useState(false);
  const [toast, setToast] = useState("");
  const [abaAtual, setAbaAtual] = useState(0);
  const [gerandoDespacho, setGerandoDespacho] = useState(false);
  const [confirmarNaoRespondidos, setConfirmarNaoRespondidos] = useState(false);
  const [modalDespacho, setModalDespacho] = useState(false);
  const [modalDespachoInterno, setModalDespachoInterno] = useState(false);
  const [numDI, setNumDI] = useState("");
  const [numDIBloqueio, setNumDIBloqueio] = useState<string | null>(null);
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
  const [numeracaoBloqueio, setNumeracaoBloqueio] = useState<string | null>(null);
  const [numeracaoCarregando, setNumeracaoCarregando] = useState(false);
  const [numeroRevisao, setNumeroRevisao] = useState<number>(1);
  const [historicoAnalises, setHistoricoAnalises] = useState("");
  // CAU/CREA do responsável técnico do projeto (item 3 Cowork).

  // Seleção de modelo
  const [modalModelo, setModalModelo] = useState(false);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [modeloSelecionado, setModeloSelecionado] = useState<Modelo | null>(null);
  const [tipoProcesso, setTipoProcesso] = useState<string>("");
  const [assuntoId, setAssuntoId] = useState<string | null>(null);
  const [assuntoNome, setAssuntoNome] = useState<string>("Aceite SEI");
  const [isAdmin, setIsAdmin] = useState(false);

  const GRUPOS = [...new Set(checklistItens.map((i) => i.grupo))];
  const grupoAtual = GRUPOS[abaAtual] ?? "";
  const itensGrupo = checklistItens.filter((i) => i.grupo === grupoAtual);

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const inputImportRef = useRef<HTMLInputElement>(null);
  const { registrar } = useAuditoria();
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
      registrar({ modulo: "MAC", acao: "MAC_EXCEL_IMPORTADO", processo_codigo: codigo, detalhe: { atualizados: json.atualizados } });
      await carregar();
    } catch (e: any) {
      mostrarToast(`Erro ao importar: ${e?.message || "falha"}`);
    } finally {
      setImportando(false);
      if (inputImportRef.current) inputImportRef.current.value = "";
    }
  }

  async function carregarModelos(tipo: string, assunto?: string | null) {
    const meRes = await fetch("/api/auth/me");
    const meJson = await meRes.json();
    const uid = meJson.ok ? meJson.data.id : "";
    let url = `/api/mac/checklists?analista_id=${uid}`;
    if (assunto) url += `&assunto_id=${encodeURIComponent(assunto)}`;
    const res = await fetch(url);
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

    // Busca tipo e assunto do processo
    const resPoc = await fetch(`/api/processos?busca=${encodeURIComponent(codigo)}`);
    const jsonPoc = await resPoc.json();
    const tipo = jsonPoc.ok && jsonPoc.data.length > 0 ? jsonPoc.data[0].tipo_processo : "regularizacao";
    const assunto: string | null = jsonPoc.ok && jsonPoc.data.length > 0 ? (jsonPoc.data[0].assunto_id ?? null) : null;
    setTipoProcesso(tipo);
    setAssuntoId(assunto);
    if (assunto) { fetch("/api/admin/assuntos").then(r=>r.json()).then(j=>{ const a = j.data?.find((x: {id:string;nome:string}) => x.id === assunto); if(a) setAssuntoNome(a.nome); }); }
    fetch("/api/auth/me").then(r=>r.json()).then(j=>{ if(j.ok){ const p=Array.isArray(j.data?.perfis)?j.data.perfis:[]; setIsAdmin(p.includes("Administrador")); } });

    const res = await fetch(`/api/analise-aceite-sei?codigo=${encodeURIComponent(codigo)}`);
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
      // Carrega campos LIP para o banner crítico
      fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}`, { credentials: "include" })
        .then(r => r.json())
        .then(j => setDadosLip(j?.data?.dados || j?.dados || {}));

      // Carrega itens do modelo salvo na análise
      if (ultima.modelo_id) {
        await carregarItensModelo(ultima.modelo_id);
      } else if (!ultima.modelo_id && Object.keys(ultima.itens || {}).length === 0) {
        // Análise existe mas sem modelo e sem itens — força seleção de modelo
        await carregarModelos(tipo, assunto);
        setModeloSelecionado(null);
        setModalModelo(true);
        setNovaAnalise(false);
      } else {
        await carregarItensModelo("00000000-0000-0000-0000-000000000001");
      }
    } else {
      // Sem análise — abre modal de seleção de modelo
      await carregarModelos(tipo, assunto);
      setModalModelo(true);
      setNovaAnalise(true);
    }

    setCarregando(false);
  }

  useEffect(() => { carregar(); }, [codigo]);
  // auto-save ao alterar itens/obs
  useEffect(() => {
    if (checklistItens.length === 0) return;
    setStatusSalvo("pendente");
    const t = setTimeout(() => salvarSilencioso("em_andamento"), 400);
    return () => clearTimeout(t);
  }, [itens, observacoes, observacoesPorAba, fontes, aceites]);


  function setItem(id: string, status: StatusItem) {
    setItens((prev) => ({ ...prev, [id]: status }));
    setFontes((prev) => ({ ...prev, [id]: "manual" }));
    setAceites((prev) => ({ ...prev, [id]: fontes[id] !== undefined ? false : prev[id] }));
    registrar({ modulo: "MAC", acao: "MAC_ITEM_MARCADO", processo_codigo: codigo, detalhe: { item_id: id, status } });
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


  async function salvarObs() {
    try {
      registrar({ modulo: "LIP", acao: "LIP_SALVO", processo_codigo: codigo, detalhe: { campos: Object.keys(dadosLip).length } });
      const res = await fetch("/api/processo/salvar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, campos: { observacoes: { valor: obsText, origem: "manual", status: "confirmado" } } })
      });
      mostrarToast(res.ok ? "✅ Observações salvas!" : "Erro ao salvar.");
    } catch { mostrarToast("Erro ao salvar."); }
  }

  function aceitarTodasIA(grupo: string) {
    const ids = checklistItens.filter((i) => i.grupo === grupo).map((i) => i.id);
    setAceites((prev) => {
      const novo = { ...prev };
      ids.forEach((id) => { if (fontes[id] !== undefined) novo[id] = true; });
      return novo;
    });
  }

  function recusarTodasIA(grupo: string) {
    const ids = checklistItens.filter((i) => i.grupo === grupo).map((i) => i.id);
    setItens((prev) => {
      const novo = { ...prev };
      ids.forEach((id) => { if (fontes[id] !== undefined && aceites[id] === false) novo[id] = null; });
      return novo;
    });
    setFontes((prev) => {
      const novo = { ...prev };
      ids.forEach((id) => { if (aceites[id] === false) delete novo[id]; });
      return novo;
    });
    setAceites((prev) => {
      const novo = { ...prev };
      ids.forEach((id) => { if (aceites[id] === false) delete novo[id]; });
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
    await salvarSilencioso("em_andamento");
  }

  // Auto-save silencioso para disparar em troca de aba / clique de botão,
  // sem chamar carregar() (que resetaria estado da UI).

  function carregarHistoricoMac(id: string) {
    if (carregandoHistoricoRef.current) return;
    carregandoHistoricoRef.current = true;
    fetch(`/api/mac/historico?analiseId=${id}`)
      .then(r => r.json())
      .then(j => { if (j.ok) setHistoricoMac(j.eventos); })
      .finally(() => { carregandoHistoricoRef.current = false; });
  }
  async function salvarSilencioso(status = "em_andamento", skipStateUpdate = false) {
    setStatusSalvo("salvando");
    try {
      if (novaAnalise || !analiseAtual) {
        const res = await fetch("/api/analise-aceite-sei", {
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
        await fetch("/api/analise-aceite-sei", {
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
      setStatusSalvo("salvo");
      setTimeout(() => setStatusSalvo(""), 2500);
    } catch {
      setStatusSalvo("erro");
    } finally {
      if (analiseAtual?.id) carregarHistoricoMac(analiseAtual.id);
    }
  }

  async function salvar(status = "em_andamento") {
    setSalvando(true);
    try {
      if (novaAnalise || !analiseAtual) {
        const res = await fetch("/api/analise-aceite-sei", {
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
        registrar({ modulo: "MAC", acao: "MAC_ANALISE_CRIADA", processo_codigo: codigo, detalhe: { numero_revisao: numeroRevisao } });
        await carregar();
      } else {
        const res = await fetch("/api/analise-aceite-sei", {
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
        registrar({ modulo: "MAC", acao: "MAC_ANALISE_SALVA", processo_codigo: codigo, detalhe: { numero_revisao: numeroRevisao } });
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

      const res = await fetch("/api/despacho-aceite-sei", { credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processo: codigo,
          tipo: tipoDespacho,
          numeroDespacho,
          naoConformes: naoConformesIds,
          observacoes,
          observacoesPorAba,
          analises: analises.slice().sort((a,b) => a.numero_analise - b.numero_analise).filter((a) => a.numero_analise <= (analiseAtual?.numero_analise ?? 1)).map((a) => ({
            numero: a.numero_analise,
            data: new Date(a.criado_em).toLocaleDateString("pt-BR"),
            ultima: a.numero_analise === 5,
          })),
          analiseId: analiseAtual?.id,
          assunto_id: assuntoId,
          numero_revisao: numeroRevisao,
        }),
      });

      if (!res.ok) { mostrarToast("Erro ao gerar despacho."); return; }
      registrar({ modulo: "DESPACHO", acao: "DESPACHO_GERADO", processo_codigo: codigo, detalhe: { tipo: tipoDespacho, numero: numeroDespacho } });
      // Auto-registro MRP
      const dlFresh = await fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}`, { credentials: "include" }).then(r => r.json()).then(j => j?.data?.dados || j?.dados || {}).catch(() => ({}));
      fetch("/api/mrp/registros", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processo_codigo: codigo,
          tipo_despacho: (tipoDespacho || "despacho").toLowerCase(),
          numero_despacho: numeroDespacho,
          numero_analise: analiseAtual?.numero_analise ?? null,
          numero_revisao: numeroRevisao,
          area_construida: Number((dlFresh?.areaTotal?.valor ?? "0").toString().replace(",", ".")) || 0,
          interessado: dlFresh?.proprietario?.valor ?? null,
          bairro: dlFresh?.bairro?.valor ?? null,
          numero_sei: dlFresh?.processo?.valor ?? codigo,
          numero_fisico: dlFresh?.processoFisico?.valor ?? null,
          assunto: assuntoNome,
          auto_gerado: true,
        }),
      }).then(async r => { const j = await r.json(); console.log("[MRP-AUTO]", r.status, JSON.stringify(j)); }).catch(e => console.error("[MRP-AUTO] ERRO:", e?.message));

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `despacho_${codigo}_${tipoDespacho}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      mostrarToast("✅ Despacho gerado!");

      // Consome o número SOMENTE após o download bem-sucedido
      const _tipoSerieCommit = tipoDespacho === "arquivamento" || tipoDespacho === "indeferimento" ? "parecer" : "despacho";
      const _numCommit = parseInt(numeroDespacho, 10);
      if (_numCommit > 0) {
        // Confirma a numeração de forma confiável: tenta até 3x em falha de
        // rede/5xx. 409 = servidor já avançou o número (re-emissão) → ok.
        // Se todas falharem, avisa o analista (não trava o fluxo).
        const _urlCommit = `/api/numeracao/proximo?tipo=${_tipoSerieCommit}&processo=${encodeURIComponent(codigo)}&modo=commit&numero=${encodeURIComponent(_numCommit)}`;
        let _commitOk = false;
        for (let _t = 1; _t <= 3 && !_commitOk; _t++) {
          try {
            const _r = await fetch(_urlCommit, { credentials: "include" });
            if (_r.ok || _r.status === 409) { _commitOk = true; break; }
          } catch { /* rede — tenta de novo */ }
          if (_t < 3) await new Promise(res => setTimeout(res, _t * 800));
        }
        if (!_commitOk) mostrarToast("⚠️ Despacho gerado, mas a numeração não foi confirmada. Confira a numeração antes de gerar o próximo.");
      }

      // MDP: registra despacho (best-effort)
      fetch("/api/mdp", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processo_codigo: codigo,
          assunto_id: assuntoId || null,
          tipo: tipoDespacho === "indeferimento" ? "indeferimento" : tipoDespacho === "arquivamento" ? "arquivamento" : "despacho",
          numero: numeroDespacho,
          destinatario: null,
          data_despacho: new Date().toLocaleDateString("pt-BR"),
          conteudo: {
            pendencias_mac: checklistItens
              .filter(i => itens[i.id] === "nao_conforme")
              .map(i => ({ grupo: i.grupo, texto: i.texto })),
            pendencias_lip: pendenciasLip,
            observacoes: observacoes || "",
          },
        }),
      }).catch(() => {});

      // Grava tag permanente no processo (STEP 2a)
      await gravarTag({
        tipo: tipoDespacho,
        numero_analise: analiseAtual?.numero_analise,
        numero_despacho: numeroDespacho || undefined,
      });

      // Análise 5 + despacho ao interessado → abre indeferimento (STEP 1d)
      if (
        tipoDespacho === "despacho" &&
        analiseAtual?.numero_analise === 5
      ) {
        setTimeout(() => setModalIndeferimento(true), 400);
      }
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
    // CAU/CREA propagam da análise anterior (mesmo projeto = mesmo RT).
    setNovaAnalise(true);
    carregarModelos(tipoProcesso, assuntoId).then(() => setModalModelo(true));
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

  // Seleciona uma análise existente (numero_analise === n) ou inicia o fluxo
  // de criação se ainda não existir. Os botões 1..5 ficam liberados apenas
  // quando a análise anterior já foi emitida (regra na UI).
  function selecionarOuCriarAnalise(n: number) {
    const existente = analises.find((a) => a.numero_analise === n);
    if (existente) {
      selecionarAnalise(existente);
    } else {
      // Backend incrementa numero_analise automaticamente; com a regra de
      // liberação sequencial, o próximo será exatamente N.
      iniciarNovaAnalise();
    }
  }

  // Grava uma tag permanente no processo (jsonb processos.tags).
  // Falha silenciosamente — não bloqueia o fluxo principal (download).
  async function gravarTag(tag: {
    tipo: "despacho" | "indeferimento" | "arquivamento" | "laudo";
    numero_analise?: number;
    numero_despacho?: string;
  }) {
    try {
      await fetch("/api/processo/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          tag: {
            ...tag,
            data: new Date().toLocaleDateString("pt-BR"),
          },
        }),
      });
    } catch {
      // silencioso
    }
  }

  const naoConformes = checklistItens.filter((i) => itens[i.id] === "nao_conforme");
  const conformes = checklistItens.filter((i) => itens[i.id] === "conforme");
  const naoAplica = checklistItens.filter((i) => itens[i.id] === "nao_aplica");
  const naoRespondidos = checklistItens.filter((i) => !itens[i.id]);

  function temNaoConformeNaAba(idx: number) {
    return checklistItens.filter((i) => i.grupo === GRUPOS[idx]).some((i) => itens[i.id] === "nao_conforme");
  }

  const [mostrarBanner, setMostrarBanner] = useState(false);
  const [obsText, setObsText] = useState("");
  const [pendentesLIPItems, setPendentesLIPItems] = useState<{label:string}[]>([]);
  useEffect(() => {
    const items: {label:string}[] = [];
    (Object.entries(dadosLip) as [string, any][]).forEach(([chave, campo]) => {
      if (campo && (!campo.valor || campo.status === "rascunho" || campo.valor?.toLowerCase() === "x")) {
        items.push({ label: chave.replace(/_/g, " ") });
      }
    });
    setPendentesLIPItems(items);
    setBannerCritico(items.length > 0 ? "ativo" : null);
  }, [dadosLip]);
  useEffect(() => {
    const obs = dadosLip["observacoes"]?.valor;
    if (obs) setObsText(obs);
  }, [dadosLip]);

  if (carregando) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Carregando...</p>
      </div>
    );
  }

  async function handleDespachoInterno() {
    setGerandoDI(true);
    try {
      const res = await fetch("/api/despacho-interno", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, tipoProcesso: tipoProcesso || "regularizacao", numeroDespacho: numDI, data: dataDI, destino: destinoDI === "outro" ? destinoCustomDI : destinoDI, corpo: corpoDI, assunto_id: assuntoId, pendencias_lip: pendenciasLip }),
      });
      if (!res.ok) throw new Error("Erro");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `DespachoInterno_${codigo}_${numDI}.docx`; a.click();
      URL.revokeObjectURL(url); setModalDespachoInterno(false);
      registrar({ modulo: "DESPACHO", acao: "DESPACHO_INTERNO_GERADO", processo_codigo: codigo, detalhe: { numero: numDI } });
      const dlFresh = await fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}`, { credentials: "include" }).then(r => r.json()).then(j => j?.data?.dados || j?.dados || {}).catch(() => ({}));
      fetch("/api/mrp/registros", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processo_codigo: codigo,
          tipo_despacho: "DESPACHO_INTERNO",
          numero_despacho: numDI,
          area_construida: Number((dlFresh?.areaTotal?.valor ?? "0").toString().replace(",", ".")) || 0,
          interessado: dlFresh?.proprietario?.valor ?? null,
          bairro: dlFresh?.bairro?.valor ?? null,
          numero_sei: dlFresh?.processo?.valor ?? codigo,
          numero_fisico: dlFresh?.processoFisico?.valor ?? null,
          assunto: assuntoNome,
          auto_gerado: true,
        }),
      }).then(async r => { const j = await r.json(); console.log("[MRP-AUTO]", r.status, JSON.stringify(j)); }).catch(e => console.error("[MRP-AUTO] ERRO:", e?.message));
    } catch { alert("Erro ao gerar despacho interno"); } finally { setGerandoDI(false); }
  }


  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col">
      {(pendentesLIPItems.length > 0 || naoRespondidos.length > 0) && (
        <div style={{ position:"sticky", top:0, zIndex:100 }}>
          <div
            onClick={() => setMostrarBanner((v) => !v)}
            style={{ cursor:"pointer", background:"var(--error)", color:"var(--accent-fg)", padding:"10px 16px", fontSize:13, fontWeight:600, borderBottom:"2px solid var(--border-strong)", display:"flex", justifyContent:"space-between", alignItems:"center" }}
          >
            <span>
              {pendentesLIPItems.length > 0 && `⚠ LIP: ${pendentesLIPItems.map((p) => p.label).join(", ")}. `}
              {naoRespondidos.length > 0 && `⬜ ${naoRespondidos.length} não verificado(s) no MAC. `}
            </span>
            <span style={{ marginLeft:12, whiteSpace:"nowrap" }}>{mostrarBanner ? "▲ Fechar" : "▼ Ver itens"}</span>
          </div>
          {mostrarBanner && (
            <div style={{ background:"#7f1d1d", borderBottom:"2px solid var(--border-strong)", padding:"8px 16px 12px", maxHeight:"40vh", overflowY:"auto" }}>
              {pendentesLIPItems.length > 0 && (
                <div style={{ marginBottom:10 }}>
                  <p style={{ fontSize:11, color:"#fca5a5", fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Campos LIP em rascunho</p>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {pendentesLIPItems.map((p, i) => (
                      <a key={i} href={`/processo/${codigo}?tipo=aceite_sei`}
                        style={{ fontSize:12, color:"white", background:"rgba(255,255,255,0.2)", borderRadius:4, padding:"3px 10px", textDecoration:"none", fontWeight:600 }}>
                        {p.label} →
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {naoRespondidos.length > 0 && (
                <div>
                  <p style={{ fontSize:11, color:"#fca5a5", fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Não verificados no MAC</p>
                  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    {naoRespondidos.map((item) => {
                      const grupoIdx = GRUPOS.indexOf(item.grupo);
                      return (
                        <button key={item.id}
                          onClick={() => { setAbaAtual(grupoIdx >= 0 ? grupoIdx : 0); setMostrarBanner(false); }}
                          style={{ fontSize:11, color:"white", textAlign:"left", background:"rgba(255,255,255,0.15)", borderRadius:4, padding:"4px 10px", cursor:"pointer", border:"none", width:"100%" }}>
                          ❌ <strong>[{item.grupo}]</strong> {item.texto.length > 100 ? item.texto.slice(0,100)+"…" : item.texto}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] px-5 py-3 rounded-xl shadow-2xl text-sm">
          {toast}
        </div>
      )}

      {/* MODAL SELEÇÃO DE MODELO */}
      {modalModelo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="mb-5">
              <h2 className="text-[var(--text-primary)] font-bold text-lg mb-1">📋 Selecione o Checklist</h2>
              <p className="text-[var(--text-muted)] text-sm">Escolha o modelo de checklist para esta análise</p>
            </div>

            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {modelos.map((m) => (
                <button key={m.id}
                  onClick={() => setModeloSelecionado(m)}
                  className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-colors ${
                    modeloSelecionado?.id === m.id
                      ? "bg-[var(--accent)] border-[var(--accent-hover)] text-[var(--accent-fg)]"
                      : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                  }`}>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">
                      {m.dono_id === null ? "⭐ " : "👤 "}{m.nome}
                    </p>
                    {m.tipo_processo && (
                      <p className="text-xs opacity-60 mt-0.5">{m.tipo_processo}</p>
                    )}
                    {m.dono_id === null && (
                      <p className="text-xs text-[var(--warning)] mt-0.5">Padrão global</p>
                    )}
                  </div>
                  {modeloSelecionado?.id === m.id && (
                    <span className="text-blue-400 text-lg">✓</span>
                  )}
                </button>
              ))}
            </div>

            {numeracaoBloqueio && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2 text-xs text-red-700 font-medium">
                ⚠ Emissão bloqueada: {numeracaoBloqueio}
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={confirmarModelo}
                disabled={!modeloSelecionado}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                Usar este checklist →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERAR DESPACHO */}
      {modalDespacho && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">📄 Gerar Despacho</h2>
              <button onClick={() => setModalDespacho(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Tipo de Documento</label>
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
                          ? "bg-[var(--accent)] border-[var(--accent-hover)] text-[var(--accent-fg)]"
                          : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
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
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Número do Despacho</label>
                {numeracaoCarregando ? (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-muted)]">Buscando número…</div>
                ) : numeracaoBloqueio ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">
                    ⚠ {numeracaoBloqueio}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={numeroDespacho}
                    onChange={(e) => setNumeroDespacho(e.target.value.replace(/\D/g, ""))}
                    placeholder="—"
                    className="bg-[var(--bg-secondary)] border border-[var(--accent)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                )}
              </div>

            </div>
            {confirmarNaoRespondidos && (
              <div className="bg-[#FEF9C3] border border-[#CA8A04] rounded-lg p-3 mb-2">
                <p className="text-xs text-[#92400E] font-semibold mb-2">⚠ {naoRespondidos.length} item(ns) não verificado(s) no MAC. Gerar mesmo assim?</p>
                <div className="flex gap-2">
                  <button onClick={() => { setConfirmarNaoRespondidos(false); gerarDespacho(); }} disabled={!!numeracaoBloqueio}
                    className="flex-1 bg-[#CA8A04] hover:bg-[#A16207] text-white font-bold py-1.5 rounded text-xs disabled:opacity-50">
                    Gerar mesmo assim
                  </button>
                  <button onClick={() => { setConfirmarNaoRespondidos(false); setModalDespacho(false); }}
                    className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] font-bold py-1.5 rounded text-xs">
                    Voltar e analisar
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={() => { if (naoRespondidos.length > 0 && !confirmarNaoRespondidos) { setConfirmarNaoRespondidos(true); } else { setConfirmarNaoRespondidos(false); gerarDespacho(); } }} disabled={gerandoDespacho}
                className="flex-1 bg-[var(--ia)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                {gerandoDespacho ? "⏳ Gerando..." : "📄 Gerar e Baixar"}
              </button>
              <button onClick={() => setModalDespacho(false)}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-secondary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="bg-[var(--bg-card)] border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              🏠 Home
            </button>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
              className="bg-[var(--error-bg)] hover:bg-[var(--error)] hover:text-white text-[var(--error)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              🚪 Sair
            </button>
                        <button onClick={() => salvar("em_andamento").then(() => router.push(`/processo/${encodeURIComponent(codigo)}?tipo=aceite_sei`))}
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
              ← LIP
            </button>
            <button onClick={() => window.open(`/processo/${codigo}?tipo=aceite_sei`, "_blank")}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors border border-[var(--border)]">
              🔍 Ver LIP ↗
            </button>
            
            <button
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors"
              onClick={async () => {
                setNumDIBloqueio(null);
                try {
                  const _r = await fetch(`/api/numeracao/proximo?tipo=despacho&processo=${encodeURIComponent(codigo)}`, { credentials: "include" });
                  const _j = await _r.json();
                  if (_j.ok) { setNumDI(String(_j.numero).padStart(3, "0")); setNumDIBloqueio(null); }
                  else { setNumDI(""); setNumDIBloqueio(_j.esgotado ? "Faixa de despachos esgotada. Acesse Configurações → Numeração." : "Nenhuma faixa de despacho cadastrada. Acesse Configurações → Numeração."); }
                } catch { setNumDI(""); setNumDIBloqueio("Erro ao buscar número de despacho."); }
                setModalDespachoInterno(true);
              }}>
              📨 Despacho Interno
            </button>
            {isAdmin && (
              <button onClick={() => router.push("/admin/checklists")}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
                ⚙️ Gerenciar Checklist
              </button>
            )}
            <button
              type="button"
              onClick={() => { if (analiseAtual?.id) window.open(`/api/mac/exportar-mac?analiseId=${analiseAtual.id}&codigo=${encodeURIComponent(codigo)}`, "_blank"); }}
              disabled={!analiseAtual?.id}
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
              📊 Exportar Excel
            </button>
            <button
              type="button"
              onClick={() => inputImportRef.current?.click()}
              disabled={importando || !analiseAtual?.id}
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
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
              <h1 className="text-xl font-bold">🔍 MAC — Aceite SEI</h1>
              <p className="text-[var(--text-muted)] text-xs">{assuntoNome}</p>
              <div className="text-xs h-4 mt-0.5">{statusSalvo==="pendente"&&<span className="text-[var(--warning)]">● Alterações não salvas</span>}{statusSalvo==="salvando"&&<span className="text-[var(--warning)] animate-pulse">⏳ Salvando...</span>}{statusSalvo==="salvo"&&<span className="text-[var(--success)]">✓ Salvo automaticamente</span>}{statusSalvo==="erro"&&<span className="text-[var(--error)]">✗ Erro ao salvar</span>}</div>
              <p className="text-[var(--accent)] font-mono text-sm">{codigo}</p>
{modeloSelecionado && (
  <p className="text-[var(--text-muted)] text-xs mt-0.5">📋 {modeloSelecionado.nome}</p>
)}
            </div>
          </div>

        </div>

        {(() => {
        const itensRespondidos = checklistItens.filter((i: any) => itens[i.id]);
        const itensAceitosIA = itensRespondidos.filter((i: any) => aceites[i.id] === true);
        const pctMacIA = itensRespondidos.length > 0 ? Math.round((itensAceitosIA.length / itensRespondidos.length) * 100) : 0;
        const cor = pctMacIA >= 70 ? "#22c55e" : pctMacIA >= 40 ? "#eab308" : "#ef4444";
        const circ = 2 * Math.PI * 38;
        return (
          <div style={{ position: "fixed", top: 60, right: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <svg width="90" height="90" viewBox="0 0 90 90">
              <circle cx="45" cy="45" r="38" fill="none" stroke="var(--border)" strokeWidth="8"/>
              <circle cx="45" cy="45" r="38" fill="none"
                stroke={cor} strokeWidth="8"
                strokeDasharray={`${(pctMacIA / 100) * circ} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 45 45)"
              />
              <text x="45" y="49" textAnchor="middle" fontSize="20" fontWeight="bold" fill={cor}>
                {pctMacIA}%
              </text>
            </svg>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Monitor IA</span>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              <a href="https://www.ilovepdf.com/pt/comprimir_pdf" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}>
                <span>🗜️</span><span>Comprimir PDF</span>
              </a>
            </div>
          </div>
        );
      })()}
      <div className="flex flex-wrap items-center gap-4 text-xs mb-3">
          <span className="flex items-center gap-1"><span className="bg-[#ECFDF5] border border-[#059669] text-[#059669] px-2 py-0.5 rounded font-bold">✅</span> <span className="text-[var(--text-secondary)]">Conforme</span></span>
          <span className="flex items-center gap-1"><span className="bg-[#FEF2F2] border border-[#DC2626] text-[#DC2626] px-2 py-0.5 rounded font-bold">❌</span> <span className="text-[var(--text-secondary)]">Não Conforme</span></span>
          <span className="flex items-center gap-1"><span className="bg-[#EFF6FF] border border-[#2563EB] text-[#2563EB] px-2 py-0.5 rounded font-bold">⬜</span> <span className="text-[var(--text-secondary)]">Não se Aplica</span></span>
          <a href="https://www.ilovepdf.com/pt/comprimir_pdf" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
            <span>🗜️</span><span>Comprimir PDF</span>
          </a>
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <label className="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wide">
            Observações das análises
          </label>
          <textarea
            value={historicoAnalises}
            onChange={(e) => setHistoricoAnalises(e.target.value)}
            onBlur={() => void salvarSilencioso()}
            placeholder="Ex: 1ª análise: Analista João — 2ª análise: Analista Maria"
            rows={2}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
          />
        </div>



      </div>

      <div className="flex flex-1 gap-0 overflow-hidden">
        {abaAtual === GRUPOS.length && (
          <div className="flex-1 flex flex-col overflow-y-auto px-6 pb-6 pt-4 gap-3">
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mb-1">📝 Observações do MAC</p>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={20}
              className="flex-1 w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-vertical" />
            <button onClick={() => salvarSilencioso().then(() => mostrarToast("✅ Observações do MAC salvas!"))}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-4 py-2 rounded text-sm font-medium transition-colors w-fit">
              💾 Salvar Observações
            </button>
          </div>
        )}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ABAS — sempre visíveis */}
          <div className="flex flex-wrap gap-2 px-6 pt-4 pb-2 bg-[var(--bg-primary)]">
            {GRUPOS.map((grupo, idx) => {
              const total = checklistItens.filter((i) => i.grupo === grupo).length;
              const respondidos = checklistItens.filter((i) => i.grupo === grupo && itens[i.id]).length;
              const temErro = temNaoConformeNaAba(idx);
              return (
                <button key={grupo} onClick={() => { void salvarSilencioso(); setAbaAtual(idx); }}
                  className={`relative px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    abaAtual === idx ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                  }`}>
                  {grupo}
                  <span className="ml-1.5 text-xs opacity-60">{respondidos}/{total}</span>
                  {temErro && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[var(--error)] rounded-full border border-[var(--bg-card)]" />}
                </button>
              );
            })}
            <button onClick={() => { void salvarSilencioso(); setAbaAtual(GRUPOS.length); }}
              className={`relative px-3 py-1.5 rounded text-sm font-medium transition-colors ${abaAtual === GRUPOS.length ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"}`}>
              📝 OBS
            </button>
          </div>

          <div className={`flex-1 overflow-y-auto px-6 pb-6${abaAtual === GRUPOS.length ? " hidden" : ""}`}>
            <div className="flex flex-wrap gap-2 pt-3 pb-1">
              <button onClick={() => marcarGrupo(grupoAtual, "conforme")}
                className="flex items-center gap-1.5 bg-[#ECFDF5] hover:bg-[#059669] hover:text-white border border-[#059669] text-[#059669] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                ✅ Todos Conformes
              </button>
              <button onClick={() => marcarGrupo(grupoAtual, "nao_conforme")}
                className="flex items-center gap-1.5 bg-[#FEF2F2] hover:bg-[#DC2626] hover:text-white border border-[#DC2626] text-[#DC2626] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                ❌ Todos Não Conformes
              </button>
              <button onClick={() => marcarGrupo(grupoAtual, "nao_aplica")}
                className="flex items-center gap-1.5 bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white border border-[#2563EB] text-[#2563EB] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                ⬜ Todos N/A
              </button>
              <button onClick={() => limparGrupo(grupoAtual)}
                className="flex items-center gap-1.5 bg-[#F1F5F9] hover:bg-[#334155] hover:text-white border border-[#334155] text-[#334155] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                🔄 Limpar Aba
              </button>
              <button onClick={() => aceitarTodasIA(grupoAtual)}
                className="flex items-center gap-1.5 bg-[#F0FDF4] hover:bg-[#16A34A] hover:text-white border border-[#16A34A] text-[#16A34A] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                🤖 Aceitar todas IA
              </button>
              <button onClick={() => recusarTodasIA(grupoAtual)}
                className="flex items-center gap-1.5 bg-[#FFF7ED] hover:bg-[#EA580C] hover:text-white border border-[#EA580C] text-[#EA580C] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                🚫 Recusar todas IA
              </button>

              <input
                ref={inputP2Ref}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const _inicioLeitura = Date.now();
                  const _dataLeitura = new Date().toLocaleString("pt-BR");
                  try {
                    setAnalisandoP2(true);
                    setProgressoP2(0);
                    setTimerP2(0);
                    timerP2Ref.current = setInterval(() => { setTimerP2((t) => t + 1); }, 1000);
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
                    if (assuntoId) fd.append("assunto_id", assuntoId);
                    const res = await fetch("/api/mac/p3", { method: "POST", body: fd });
                    const json = await res.json().catch(() => null);
                    if (!res.ok || !json?.ok) {
                      throw new Error(json?.erro || res.statusText || "Falha na leitura P3");
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
                    const _tempoLeitura = Math.round((Date.now() - _inicioLeitura) / 1000);
                    const _min = String(Math.floor(_tempoLeitura / 60)).padStart(2, "0");
                    const _seg = String(_tempoLeitura % 60).padStart(2, "0");
                    const _fmtDoc = (d: any): string => {
                      if (!d) return "";
                      if (typeof d === "string") return d;
                      const nome = d.nome || d.tipo || d.documento || d.descricao || "Documento";
                      const sei = d.sei || d.numero_sei || d.numeroSei || d.numero || null;
                      const pag = d.pagina || d.paginas || d.pag || null;
                      const partes: string[] = [];
                      if (sei) partes.push(`SEI ${sei}`);
                      if (pag) partes.push(`pág. ${pag}`);
                      return partes.length ? `${nome} (${partes.join(", ")})` : String(nome);
                    };
                    const _docs: any[] = Array.isArray(json.documentos) ? json.documentos : [];
                    const _incompat: string[] = Array.from(new Set((Array.isArray(json.incompatibilidades) ? json.incompatibilidades : []).filter(Boolean).map(String)));
                    const _linhasDoc = _docs.length ? _docs.map((d) => `  • ${_fmtDoc(d)}`).join("\n") : "  • (mapa de documentos não retornado pela IA)";
                    const _linhasInc = _incompat.length ? _incompat.map((p) => `  ⚠ ${p}`).join("\n") : "  • Nenhuma incompatibilidade apontada pela IA.";
                    const _obsLeitura =
                      `━━━ LEITURA DO PROCESSO (MAC) ━━━\n` +
                      `✅ Status: LEITURA CONCLUÍDA | ${_dataLeitura} | Duração: ${_min}:${_seg} | ${total} item(ns) sugerido(s)\n` +
                      `📄 Documentos analisados (${_docs.length}):\n${_linhasDoc}\n` +
                      `🔎 Incompatibilidades:\n${_linhasInc}`;
                    setObservacoes((prev: string) => prev ? prev + "\n\n" + _obsLeitura : _obsLeitura);
                    registrar({ modulo: "MAC", acao: "MAC_ANALISE_IA_CONCLUIDA", processo_codigo: codigo, origem: "IA", detalhe: { itens_sugeridos: total } });
                    mostrarToast(`🤖 P3 sugeriu ${total} item(ns) — revise e aceite.`);
                  } catch (err: any) {
                    const _tempoLeitura = Math.round((Date.now() - _inicioLeitura) / 1000);
                    const _min = String(Math.floor(_tempoLeitura / 60)).padStart(2, "0");
                    const _seg = String(_tempoLeitura % 60).padStart(2, "0");
                    const _obsErro =
                      `━━━ LEITURA DO PROCESSO (MAC) ━━━\n` +
                      `❌ Status: ERRO NA LEITURA | ${_dataLeitura} | Duração até o erro: ${_min}:${_seg} | Progresso: ${progressoP2}%\n` +
                      `⚠ Motivo: ${err?.message || "falha desconhecida"}`;
                    setObservacoes((prev: string) => prev ? prev + "\n\n" + _obsErro : _obsErro);
                    mostrarToast(`Erro P3: ${err?.message || "falha"}`);
                  } finally {
                    if (progressoP2Ref.current) clearInterval(progressoP2Ref.current);
                    if (timerP2Ref.current) clearInterval(timerP2Ref.current);
                    setProgressoP2(0);
                    setTimerP2(0);
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
                  <span className="flex gap-2">
                    <span>{progressoP2}%</span>
                    <span className="text-[var(--text-muted)]">{String(Math.floor(timerP2/60)).padStart(2,"0")}:{String(timerP2%60).padStart(2,"0")}</span>
                  </span>
                </div>
                <div className="w-full bg-[var(--bg-secondary)] rounded-full h-2">
                  <div className="bg-[var(--primary)] h-2 rounded-full transition-all duration-300" style={{ width: `${progressoP2}%` }} />
                </div>
              </div>
            )}
            {/* Legenda de status (movida do cabeçalho) — STEP 1g */}
            <div className="flex flex-wrap gap-4 text-xs px-1 py-2 border-b border-[var(--border)] mb-2">
              <span className="text-[#059669]">✅ {conformes.length} conformes</span>
              <span className="text-[#DC2626]">❌ {naoConformes.length} não conformes</span>
              <span className="text-[var(--text-muted)]">⬜ {naoAplica.length} não se aplica</span>
              <span className="text-yellow-400">⏳ {naoRespondidos.length} não respondidos</span>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              {itensGrupo.map((item) => {
                const status = itens[item.id];
                const fonte = fontes[item.id] ?? null;
                const aceito = !!aceites[item.id];
                return (
                  <div key={item.id}
                    className={`rounded-xl border p-4 transition-all ${
                      status === "conforme" ? "bg-[#ECFDF5] border-[#059669]" :
                      status === "nao_conforme" ? "bg-[#FEF2F2] border-[#DC2626]" :
                      status === "nao_aplica" ? "bg-[#EFF6FF] border-[#2563EB]" :
                      "bg-[var(--surface)] border-[var(--border)]"
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-[var(--text-primary)] leading-relaxed">{item.texto}</p>
                        {item.ref && <p className="text-xs text-[var(--text-muted)] mt-1">{item.ref}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {fonte === "p2" && !aceito && (
                          <button
                            onClick={() => setAceites((prev) => ({ ...prev, [item.id]: true }))}
                            title="Sugestão da IA — clique para aceitar"
                            className="px-2 py-0.5 rounded text-[10px] font-bold border border-[var(--border-strong)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors">
                            🤖 IA — Aceitar
                          </button>
                        )}
                        {fonte === "p2" && aceito && (
                          <span
                            title="Sugestão da IA aceita"
                            className="px-2 py-0.5 rounded text-[10px] font-bold border border-[var(--border)] bg-[var(--success-bg)]/40 text-[var(--accent-fg)]">
                            🤖 IA ✓
                          </span>
                        )}
                        {fonte === "manual" && (
                          <span
                            title="Preenchido manualmente"
                            className="px-2 py-0.5 rounded text-[10px] font-bold border border-[var(--border)] bg-[var(--bg-secondary)]/40 text-[var(--text-muted)]">
                            ✏️
                          </span>
                        )}
                        <div className="flex gap-1">
                          {(["conforme", "nao_conforme", "nao_aplica"] as StatusItem[]).map((s) => (
                            <button key={s!}
                              onClick={() => setItem(item.id, status === s ? null : s)}
                              className={`px-2 py-1 rounded text-xs font-bold border transition-all ${
                                status === s
                                  ? s === "conforme" ? "bg-[#ECFDF5] border-[#059669] text-[#059669]" :
                                    s === "nao_conforme" ? "bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]" :
                                    "bg-[#EFF6FF] border-[#2563EB] text-[#2563EB]"
                                  : "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)] hover:border-[#2563EB]"
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
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-2">
                  📝 Observações — {grupoAtual}
                </label>
                <textarea
                  value={observacoesPorAba[grupoAtual] || ""}
                  onChange={(e) => setObservacoesPorAba((prev) => ({ ...prev, [grupoAtual]: e.target.value }))}
                  placeholder={`Observações específicas de ${grupoAtual}...`}
                  rows={3}
                  className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                />
              </div>

              {abaAtual === GRUPOS.length - 1 && (
                <div className="mt-2">
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-2">
                    📋 Observações Gerais do Despacho
                  </label>
                  <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Observações gerais para o despacho final..."
                    rows={4}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none" />
                </div>
              )}
            </div>

            <div className="flex justify-between mt-6">
              <button onClick={() => { void salvarSilencioso(); setAbaAtual((a) => Math.max(0, a - 1)); }} disabled={abaAtual === 0}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40 text-[var(--text-primary)] px-4 py-2 rounded text-sm transition-colors">
                ← Anterior
              </button>
              <button onClick={() => { void salvarSilencioso(); setAbaAtual((a) => Math.min(GRUPOS.length - 1, a + 1)); }} disabled={abaAtual === GRUPOS.length - 1}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40 text-[var(--text-primary)] px-4 py-2 rounded text-sm transition-colors">
                Próxima →
              </button>
            </div>
          {/* HISTÓRICO MAC */}
          <div className="mt-8 px-2 pb-6">
            <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 uppercase tracking-wide">🕐 Histórico de Alterações</h3>
            {historicoMac.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm">Nenhuma alteração registrada ainda.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[var(--bg-secondary)]" />
                <div className="flex flex-col gap-4">
                  {historicoMac.map((ev, hidx) => {
                    const aberto = historicoAberto === hidx;
                    const diasUnicosMac = [...new Set(historicoMac.map(e => { const d = new Date(e.momento); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }))];
                    const diaEvMac = (() => { const d = new Date(ev.momento); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; })();
                    const indiceDiaMac = diasUnicosMac.indexOf(diaEvMac);
                    const coresMac = indiceDiaMac === 0 ? { border: "border-[#0F172A]", bg: "bg-[#0F172A]", text: "text-[#000000] font-bold" }
                      : indiceDiaMac === 1 ? { border: "border-[#1E3A8A]", bg: "bg-[#1E3A8A]", text: "text-[#1E3A8A] font-semibold" }
                      : indiceDiaMac === 2 ? { border: "border-[#334155]", bg: "bg-[#334155]", text: "text-[#334155] font-medium" }
                      : indiceDiaMac === 3 ? { border: "border-[#065F46]", bg: "bg-[#065F46]", text: "text-[#065F46]" }
                      : { border: "border-[#94A3B8]", bg: "bg-[#94A3B8]", text: "text-[#94A3B8]" };
                    return (
                      <div key={hidx} className="relative flex items-start gap-4 pl-10">
                        <div className={`absolute left-2 w-5 h-5 rounded-full border-2 ${coresMac.border} cursor-pointer transition-transform hover:scale-125 flex items-center justify-center`}
                          onClick={() => setHistoricoAberto(aberto ? null : hidx)}>
                          <div className={`w-2.5 h-2.5 rounded-full ${coresMac.bg}`} />
                        </div>
                        <div className="flex-1">
                          <button onClick={() => setHistoricoAberto(aberto ? null : hidx)}
                            className={`text-xs font-mono ${coresMac.text} hover:underline text-left`}>
                            {new Date(ev.momento).toLocaleString("pt-BR")} — {ev.total} campo(s) alterado(s)
                          </button>
                          {aberto && (
                            <div className="mt-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--text-secondary)] space-y-2">
                              <p><span className="text-[var(--text-muted)]">Data:</span> {new Date(ev.momento).toLocaleString("pt-BR")}</p>
                              <p><span className="text-[var(--text-muted)]">Analista:</span> {ev.analista || "—"}</p>
                              <p><span className="text-[var(--text-muted)]">Itens alterados:</span> {ev.total}</p>
                              {ev.itens.length > 0 && (
                                <table className="w-full mt-2 border-collapse">
                                  <thead>
                                    <tr className="text-[var(--text-muted)] text-[10px] uppercase">
                                      <th className="text-left pb-1 pr-2">Aba</th>
                                      <th className="text-left pb-1 pr-2">Item</th>
                                      <th className="text-left pb-1 pr-2">De</th>
                                      <th className="text-left pb-1">Para</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ev.itens.map((it, ii) => (
                                      <tr key={ii} className="border-t border-[var(--border)]">
                                        <td className="py-1 pr-2 text-[var(--text-muted)] whitespace-nowrap">{it.aba}</td>
                                        <td className="py-1 pr-2 text-[var(--text-primary)] max-w-[200px]">{it.texto}{it.ref && <span className="text-[var(--text-muted)] ml-1">({it.ref})</span>}</td>
                                        <td className="py-1 pr-2 text-[var(--text-muted)] whitespace-nowrap">{it.de || "—"}</td>
                                        <td className="py-1 whitespace-nowrap font-bold text-[var(--text-primary)]">{it.para}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
        </div>


        {/* PAINEL LATERAL */}
        <div className="w-72 bg-[var(--bg-card)] border-l border-[var(--border)] p-4 flex flex-col gap-4 overflow-y-auto">
          <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">Ações</h3>

          {/* Botões de análise 1-5 (STEP 1b) */}
          <div className="flex flex-col gap-1.5 mb-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const existente = analises.find((a) => a.numero_analise === n);
              const jaEmitida =
                !!existente && existente.status !== "em_andamento";
              const liberada =
                n === 1 ||
                analises.some(
                  (a) =>
                    a.numero_analise === n - 1,
                );
              const ativa = analiseAtual?.numero_analise === n;
              return (
                <button
                  key={n}
                  disabled={!liberada && !existente}
                  onClick={() => selecionarOuCriarAnalise(n)}
                  className={`w-full py-2 rounded-lg text-sm font-bold border transition-all ${
                    ativa
                      ? "bg-[var(--accent)] border-[var(--accent-hover)] text-[var(--accent-fg)]"
                      : jaEmitida
                        ? "bg-[var(--success-bg)] border-[var(--border)] text-[var(--accent-fg)] hover:bg-[var(--success-bg)]"
                        : existente
                          ? "bg-[var(--bg-secondary)] border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                          : liberada
                            ? "bg-[var(--bg-secondary)] border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                            : "bg-[var(--bg-primary)] border-[var(--border)] text-slate-600 cursor-not-allowed opacity-50"
                  }`}
                >
                  {jaEmitida ? `✅ Análise ${n}` : `📋 Análise ${n}`}
                </button>
              );
            })}
          </div>

          {/* Botão Via / Logradouro */}
          <button
            onClick={() => { void salvarSilencioso(); router.push(`/logradouro/${encodeURIComponent(codigo)}`); }}
            className="w-full py-2 rounded-lg text-sm font-bold border transition-all bg-[var(--bg-secondary)] border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] mt-1"
          >
            🗺️ Via / Logradouro
          </button>

          <button onClick={() => {
  carregarModelos(tipoProcesso).then(() => setModalModelo(true));
}}
  className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm transition-colors">
  🔄 Trocar Checklist
</button>
<button onClick={() => router.push("/admin/checklists")}
  className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm transition-colors">
  📋 Gerenciar MAC
</button>

          <button
            type="button"
            onClick={() => inputP2Ref.current?.click()}
            disabled={analisandoP2 || checklistItens.length === 0}
            title="Envia o PDF do processo para o Gemini analisar o checklist automaticamente"
            className="w-full bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white disabled:opacity-50 border border-[#2563EB] text-[#2563EB] font-bold py-2.5 rounded-lg text-sm transition-colors">
            {analisandoP2 ? "⏳ Analisando..." : "📎 LER PROCESSO ACEITE SEI"}
          </button>

          <button onClick={() => salvar("em_andamento")} disabled={salvando}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] font-bold py-2.5 rounded-lg text-sm transition-colors">
            {salvando ? "Salvando..." : "💾 Salvar"}
          </button>

          <button onClick={() => salvar("deferido")} disabled={salvando}
            className="w-full bg-[#ECFDF5] hover:bg-[#059669] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed border border-[#059669] text-[#059669] font-bold py-2.5 rounded-lg text-sm transition-colors">
            ✅ Deferir
          </button>


          {indeferimentoPendente && (
            <button onClick={async () => {
              const { motivos, obs } = indeferimentoPendente;
              setGerandoDespacho(true);
              await salvarSilencioso("indeferido");
              try {
                const res = await fetch("/api/despacho-aceite-sei", { credentials: "include",
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    processo: codigo, tipo: "indeferimento", numeroDespacho: await fetch(`/api/numeracao/proximo?tipo=parecer&processo=${encodeURIComponent(codigo)}`, { credentials: "include" }).then(r=>r.json()).then(j=>j.ok ? String(j.numero).padStart(3,"0") : "").catch(()=>""),
                    naoConformes: motivos, observacoes: obs,
                    analises: analises.slice().sort((a,b) => a.numero_analise - b.numero_analise).filter((a) => a.numero_analise <= (analiseAtual?.numero_analise ?? 1)).map((a) => ({ numero: a.numero_analise, data: new Date(a.criado_em).toLocaleDateString("pt-BR"), ultima: a.numero_analise === 5 })), assunto_id: assuntoId,
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
                  await gravarTag({
                    tipo: "indeferimento",
                    numero_analise: analiseAtual?.numero_analise,
                  });
                }
              } finally { setGerandoDespacho(false); }
            }}
            className="w-full bg-[#EA580C] hover:bg-[#C2410C] border border-[#EA580C] text-white font-bold py-2.5 rounded-lg text-sm">
              📄 Baixar Indeferimento
            </button>
          )}
          <button onClick={async () => { await salvarSilencioso(); setModalIndeferimento(true); }} disabled={salvando}
            className="w-full bg-[#FEF2F2] hover:bg-[#DC2626] hover:text-white disabled:opacity-50 border border-[#DC2626] text-[#DC2626] font-bold py-2.5 rounded-lg text-sm transition-colors">
            ❌ Indeferir
          </button>

          <div className="border-t border-[var(--border)] pt-2">
            <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Documentos</h3>

            <button onClick={async () => {
              await salvarSilencioso();
              // Coleta avisos — nunca bloqueia, só informa
              const pendentesIA = checklistItens.filter(
                (i) => fontes[i.id] === "p2" && !aceites[i.id]
              );
              try {
                const [procRes, lipRes] = await Promise.all([
                  fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}`, { credentials: "include" }),
                  fetch("/api/admin/lip"),
                ]);
                const procJson = await procRes.json();
                const lipJson = await lipRes.json();
                const dados = procJson?.data?.dados || procJson?.dados || {};
                const pendentesLipX = (lipJson?.data || []).flatMap((a: any) =>
                  (a.lip_campos || [])
                    .filter((c: any) => dados[c.chave]?.valor === "X")
                    .map((c: any) => ({ id: `lip_${c.chave}`, texto: `${c.label} — marcado com X`, grupo: `LIP — ${a.nome || "LIP"}` }))
                );
                const todosAvisos = [
                  ...pendentesIA,
                  ...pendentesLipX,
                ];
                if (todosAvisos.length > 0) {
                  setItensPendentesIA(todosAvisos);
                  setModalItensPendentesIA(true);
                  return;
                }
              } catch { /* silencioso */ }
              // Busca número de despacho automático
              setNumeracaoCarregando(true);
              setNumeracaoBloqueio(null);
              try {
                const _tipoSerie = tipoDespacho === "arquivamento" || tipoDespacho === "indeferimento" ? "parecer" : "despacho";
                const _nr = await fetch(`/api/numeracao/proximo?tipo=${_tipoSerie}&processo=${encodeURIComponent(codigo)}&modo=peek`, { credentials: "include" });
                const _nj = await _nr.json();
                if (_nj.ok) {
                  setNumeroDespacho(String(_nj.numero).padStart(3, "0"));
                  setNumeracaoBloqueio(null);
                } else {
                  setNumeroDespacho("");
                  const _labelSerie = _tipoSerie === "parecer" ? "pareceres" : "despachos";
                  setNumeracaoBloqueio(_nj.esgotado
                    ? `Faixa de ${_labelSerie} esgotada. Acesse Configurações → Numeração para cadastrar nova faixa.`
                    : `Nenhuma faixa de ${_labelSerie} cadastrada. Acesse Configurações → Numeração.`);
                }
              } catch {
                setNumeroDespacho("");
                setNumeracaoBloqueio("Erro ao buscar número de despacho.");
              } finally {
                setNumeracaoCarregando(false);
              }
              setModalDespacho(true);
            }} disabled={gerandoDespacho}
              className="w-full bg-[var(--ia-bg)] hover:bg-[var(--ia)] hover:text-white disabled:opacity-50 border border-[var(--ia)] text-[var(--ia)] font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
              {gerandoDespacho ? "⏳ Gerando..." : "📄 Gerar Despacho"}
            </button>
            <button
              onClick={() => window.open(`/mdp/${encodeURIComponent(codigo)}`, "_blank")}
              className="w-full mt-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] text-[var(--text-secondary)] font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
              📋 Ver Despachos (MDP)
            </button>
            <div className="mt-2">
              <BotaoGerarLaudo
                processoId={codigo}
                mrpData={{ assuntoNome, interessado: dadosLip?.proprietario?.valor ?? null, areaConstruida: Number((dadosLip?.areaTotal?.valor ?? "0").toString().replace(",", ".")) || 0, bairro: dadosLip?.bairro?.valor ?? null, numeroSei: dadosLip?.processo?.valor ?? codigo, numeroFisico: dadosLip?.processoFisico?.valor ?? null }}
                onSuccess={() =>
                  void gravarTag({
                    tipo: "laudo",
                    numero_analise: analiseAtual?.numero_analise,
                  })
                }
              />
            </div>

            {/* Limpar MAC */}
            <button
              type="button"
              onClick={() => setModalLimparMac(true)}
              className="w-full mt-2 bg-[#FEF2F2] hover:bg-[#DC2626] hover:text-white border border-[#DC2626] text-[#DC2626] font-bold py-2.5 rounded-lg text-sm transition-colors"
            >
              🗑️ Limpar MAC
            </button>
          </div>
        </div>
      </div>

      {modalDespachoInterno && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">📨 Despacho Interno</h2>
              <button onClick={() => setModalDespachoInterno(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Nº Despacho</label>
                  {numDIBloqueio ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">⚠ {numDIBloqueio}</div>
                  ) : (
                    <div className="bg-[var(--bg-secondary)] border border-[var(--accent)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--text-primary)]">{numDI || "—"}</div>
                  )}
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
                className="flex-1 bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white disabled:opacity-50 border border-[#2563EB] text-[#2563EB] font-bold py-2.5 rounded-lg text-sm transition-colors">
                {gerandoDI ? "⏳ Gerando..." : "📨 Gerar e Baixar"}
              </button>
              <button onClick={() => setModalDespachoInterno(false)}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-secondary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {modalPendenciasLip && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-orange-600 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-bold text-orange-400 mb-2">⚠️ Pendências no LIP</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-3">Os seguintes campos estão vazios ou marcados com X. Deseja emitir o despacho mesmo assim?</p>
            <ul className="text-sm text-red-300 mb-4 max-h-48 overflow-y-auto list-disc pl-5">
              {pendenciasLip.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            <div className="flex gap-3">
              <button onClick={async () => { setModalPendenciasLip(false); setNumeracaoCarregando(true); try { const _r = await fetch(`/api/numeracao/proximo?tipo=despacho&processo=${encodeURIComponent(codigo)}&modo=peek`, { credentials: "include" }); const _j = await _r.json(); if (_j.ok) { setNumeroDespacho(String(_j.numero).padStart(3, "0")); setNumeracaoBloqueio(null); } else { setNumeroDespacho(""); setNumeracaoBloqueio(_j.esgotado ? "Faixa esgotada. Acesse Configurações → Numeração." : "Nenhuma faixa cadastrada. Acesse Configurações → Numeração."); } } catch { setNumeroDespacho(""); setNumeracaoBloqueio("Erro ao buscar número."); } finally { setNumeracaoCarregando(false); } setModalDespacho(true); }}
                className="flex-1 bg-orange-700 hover:bg-orange-600 text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Emitir mesmo assim
              </button>
              <button onClick={() => setModalPendenciasLip(false)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {modalLimparMac && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border-2 border-red-600 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-red-400 mb-2">⚠️ ATENÇÃO — AÇÃO IRREVERSÍVEL</h2>
            <p className="text-sm text-[var(--text-primary)] mb-2">Você está prestes a <strong>apagar toda a análise MAC</strong> deste processo.</p>
            <p className="text-sm text-red-300 font-semibold mb-4">Todos os itens, observações, fontes e aceites serão zerados. Esta ação não pode ser desfeita.</p>
            <p className="text-xs text-[var(--text-muted)] mb-4">Recomendamos exportar o Excel antes de continuar.</p>
            <div className="flex gap-3">
              <button onClick={() => setModalLimparMac(false)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={() => {
                setItens({});
                setFontes({});
                setAceites({});
                setObservacoes("");
                setObservacoesPorAba({});
                setModalLimparMac(false);
                mostrarToast("🗑️ Análise MAC zerada.");
              }}
                className="flex-1 bg-red-700 hover:bg-red-600 text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Confirmar — Limpar tudo
              </button>
            </div>
          </div>
        </div>
      )}
      {modalIndeferimento && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-red-700 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-bold text-red-400 mb-4">❌ Indeferimento por Impossibilidade de Análise</h2>
            <p className="text-xs text-[var(--text-muted)] mb-3">Selecione o(s) motivo(s):</p>
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
                <span className="text-sm text-[var(--text-secondary)]">{motivo}</span>
              </label>
            ))}
            <textarea value={obsIndeferimento} onChange={(e) => setObsIndeferimento(e.target.value)}
              placeholder="Observações adicionais (opcional)..."
              className="w-full mt-3 bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded p-2 text-sm text-[var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none h-20" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setModalIndeferimento(false)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm">
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
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Confirmar Indeferimento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL — Itens IA pendentes de confirmação */}
      {modalItensPendentesIA && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-yellow-500/40 rounded-2xl p-6 w-full max-w-3xl shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🤖</span>
              <h2 className="text-[var(--text-primary)] font-bold text-xl">Itens sugeridos pela IA aguardam aprovação</h2>
            </div>
            <p className="text-[var(--text-muted)] text-sm mb-4">
              Os itens abaixo foram marcados pela IA e precisam ser revisados antes de emitir o despacho. Localize cada item no MAC e confirme ou rejeite:
            </p>
            <ul className="space-y-3 max-h-[60vh] overflow-y-auto mb-5 pr-1">
              {itensPendentesIA.map((item) => (
                <li key={item.id} className="flex items-start gap-3 bg-[var(--bg-secondary)]/60 border border-yellow-500/20 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)]">
                  <span className="text-yellow-400 mt-0.5 text-lg shrink-0">⚠</span>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-xs text-[var(--warning)] font-semibold uppercase tracking-wide">MAC — {item.grupo || "Checklist"}</span>
                    <span className="text-[var(--text-primary)] leading-relaxed">{item.texto || item.id}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button
                onClick={async () => { setModalItensPendentesIA(false); setNumeracaoCarregando(true); try { const _r = await fetch(`/api/numeracao/proximo?tipo=despacho&processo=${encodeURIComponent(codigo)}&modo=peek`, { credentials: "include" }); const _j = await _r.json(); if (_j.ok) { setNumeroDespacho(String(_j.numero).padStart(3, "0")); setNumeracaoBloqueio(null); } else { setNumeroDespacho(""); setNumeracaoBloqueio(_j.esgotado ? "Faixa esgotada. Acesse Configurações → Numeração." : "Nenhuma faixa cadastrada. Acesse Configurações → Numeração."); } } catch { setNumeroDespacho(""); setNumeracaoBloqueio("Erro ao buscar número."); } finally { setNumeracaoCarregando(false); } setModalDespacho(true); }}
                className="flex-1 bg-[var(--ia)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                Emitir mesmo assim
              </button>
              <button
                onClick={() => setModalItensPendentesIA(false)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                Voltar e revisar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}