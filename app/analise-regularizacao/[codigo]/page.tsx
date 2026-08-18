"use client";
import { perfilDe } from "@/lib/numeracao";
import { filtrosDoAssunto, type FiltroMac } from "@/lib/macFiltros";
import { useAuditoria } from "@/hooks/useAuditoria";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BotaoGerarLaudo } from "@/components/mac/BotaoGerarLaudo";
import { parseAreaBR } from "@/lib/mrp";

type StatusItem = "conforme" | "nao_conforme" | "nao_aplica" | null;


type Item = {
  id: string;
  grupo: string;
  texto: string;
  ref?: string;
  ordem: number;
  /** Item que, nao conforme, leva a indeferimento — nao e mera exigencia. */
  gera_indeferimento?: boolean;
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
  // Reemissão: gerar de novo o documento de uma análise já concluída,
  // mantendo o número que ela já tem e pegando o checklist como está
  // agora. Sem isto, "Gerar Despacho" numa análise concluída pedia um
  // número NOVO e queimava a numeração.
  const [reemitindo, setReemitindo] = useState(false);
  const [modalItensPendentesIA, setModalItensPendentesIA] = useState(false);
  const [analisandoP2, setAnalisandoP2] = useState(false);
  const [modalLimparAnalise, setModalLimparAnalise] = useState<number | null>(null);
  const [modalExportar, setModalExportar] = useState(false);
  const [modalImportar, setModalImportar] = useState(false);
  const [progressoP2, setProgressoP2] = useState(0);
  const progressoP2Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timerP2, setTimerP2] = useState(0);
  const timerP2Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputP2Ref = useRef<HTMLInputElement>(null);
  const carregandoHistoricoRef = useRef(false);
  // Trava de concorrência: impede dois POST simultâneos de análise nova
  // (corrida do autosave). Ver salvarSilencioso() e iniciarNovaAnalise().
  const criandoAnaliseRef = useRef(false);
  const [checklistItens, setChecklistItens] = useState<Item[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [observacoesPorAba, setObservacoesPorAba] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [dadosLip, setDadosLip] = useState<Record<string,any>>({});
  const [tagsProcesso, setTagsProcesso] = useState<any[]>([]);
  const [bannerCritico, setBannerCritico] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [statusSalvo, setStatusSalvo] = useState<""|"pendente"|"salvando"|"salvo"|"erro">("");
  const [historicoAberto, setHistoricoAberto] = useState<number|null>(null);
  const [historicoMac, setHistoricoMac] = useState<{momento:string;total:number;abas:string[];analista:string;itens:{aba:string;texto:string;ref:string|null;de:string|null;para:string}[]}[]>([]);
  const [novaAnalise, setNovaAnalise] = useState(false);
  // Número da análise iniciada mas ainda não gravada. Enquanto ela não
  // existe no banco, analiseAtual é null — sem isso nenhum botão 1..5
  // acende e o analista não vê em qual análise está.
  const [numeroAnaliseNova, setNumeroAnaliseNova] = useState<number | null>(null);
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
  const [indeferimentoParaReimprimir, setIndeferimentoParaReimprimir] = useState<{motivos: string[], obs: string, numeroParecer: string, data?: string} | null>(null);
  const [tipoDespacho, setTipoDespacho] = useState<"despacho" | "indeferimento" | "arquivamento">("despacho");
  const [numeroDespacho, setNumeroDespacho] = useState("");
  // Data de emissão do documento (editável no modal). Alimenta documento, tag e
  // MRP com a MESMA data — evita o descasamento de dia perto da meia-noite.
  const [dataEmissao, setDataEmissao] = useState(() => new Date().toLocaleDateString("pt-BR"));
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
  const [assuntoNome, setAssuntoNome] = useState<string>("");
  // Numeração do assunto: define se o número mostrado é Processo SEI
  // ou Nº do Alvará (Projeto). Ver lib/numeracao.ts.
  const [numeracao, setNumeracao] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Só usado quando MUITOS_GRUPOS: mostra o índice ou a página do grupo.
  const [verIndice, setVerIndice] = useState(true);
  // Busca no checklist: o filtro é local e instantâneo; a busca semântica
  // (Gemini) só sai quando o analista pede, para não torrar o orçamento
  // de chamadas por tecla digitada.
  const [buscaTexto, setBuscaTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [buscaErro, setBuscaErro] = useState("");
  const [buscaIA, setBuscaIA] = useState<{ id: string; grupo: string; texto: string; motivo: string }[] | null>(null);

  const GRUPOS = [...new Set(checklistItens.map((i) => i.grupo))];
  const grupoAtual = GRUPOS[abaAtual] ?? "";
  // Com poucos grupos (Regularização e Aceite têm 9) a régua horizontal de
  // sempre dá conta. A Aprovação de Projeto tem 48: viram uma parede
  // ilegível. Acima do limite, a navegação vira índice vertical + uma
  // página por grupo. Abaixo dele, NADA muda — é o fluxo de produção.
  const MUITOS_GRUPOS = GRUPOS.length > 12;
  const itensGrupo = checklistItens.filter((i) => i.grupo === grupoAtual);

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const inputImportRef = useRef<HTMLInputElement>(null);
  const { registrar } = useAuditoria();
  const [importando, setImportando] = useState(false);
  const [importScope, setImportScope] = useState<"atual" | "todas">("atual");

  async function importarExcel(file: File, scope: "atual" | "todas" = "atual") {
    if (!file) return;
    if (scope === "atual" && !analiseAtual?.id) {
      mostrarToast("Crie/salve a análise antes de importar.");
      return;
    }
    try {
      setImportando(true);
      const fd = new FormData();
      fd.append("file", file);
      if (scope === "todas") {
        fd.append("todas", "true");
        fd.append("codigo", codigo);
      } else {
        fd.append("analiseId", analiseAtual!.id);
      }
      const res = await fetch("/api/mac/importar-mac", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        mostrarToast(`Erro ao importar: ${json?.erro || res.statusText}`);
        return;
      }
      const naoEnc = Array.isArray(json.naoEncontrados) ? json.naoEncontrados.length : 0;
      mostrarToast(`✅ ${json.atualizados} item(ns) importado(s)${naoEnc ? ` · ${naoEnc} não encontrado(s)` : ""}`);
      registrar({ modulo: "MAC", acao: "MAC_EXCEL_IMPORTADO", processo_codigo: codigo, detalhe: { scope, atualizados: json.atualizados } });
      await carregar();
    } catch (e: any) {
      mostrarToast(`Erro ao importar: ${e?.message || "falha"}`);
    } finally {
      setImportando(false);
      if (inputImportRef.current) inputImportRef.current.value = "";
    }
  }

  async function limparAnalise(numeroAnalise: number) {
    const alvo = analises.find((a) => a.numero_analise === numeroAnalise);
    if (!alvo) return;
    // Zera no banco via PUT
    await fetch("/api/analise-regularizacao", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: alvo.id,
        itens: {},
        fontes: {},
        aceites: {},
        observacoes: "",
        observacoes_por_aba: {},
        status: "em_andamento",
        numero_revisao: Number(alvo.numero_revisao) || 1,
        historico_analises: alvo.historico_analises || "",
      }),
    });
    // Atualiza lista
    const resLista = await fetch(`/api/analise-regularizacao?codigo=${encodeURIComponent(codigo)}`);
    const jsonLista = await resLista.json();
    if (jsonLista.ok) setAnalises(jsonLista.data);

    // Se foi a análise em exibição: vai para a análise anterior (ou mantém se for só uma)
    if (analiseAtual?.numero_analise === numeroAnalise) {
      const listaAtualizada: any[] = jsonLista.ok ? jsonLista.data : analises;
      const anterior = listaAtualizada
        .filter((a: any) => a.numero_analise < numeroAnalise)
        .sort((a: any, b: any) => b.numero_analise - a.numero_analise)[0];
      if (anterior) {
        selecionarAnalise(anterior);
      } else {
        // Era a única análise — limpa estado local, mantém na tela zerando
        setItens({});
        setFontes({});
        setAceites({});
        setObservacoes("");
        setObservacoesPorAba({});
        const alvoPut = jsonLista.ok ? jsonLista.data.find((a: any) => a.id === alvo.id) : null;
        if (alvoPut) setAnaliseAtual(alvoPut);
      }
    } else if (jsonLista.ok && analiseAtual?.id) {
      // Zerou outra análise: recarrega a que está em tela, senão ela fica
      // defasada em relação à lista (inclusive nos números de documento).
      const restaurada = jsonLista.data.find((a: any) => a.id === analiseAtual.id);
      if (restaurada) setAnaliseAtual(restaurada);
    }
    mostrarToast(`🗑️ Análise ${numeroAnalise} zerada.`);
    setModalLimparAnalise(null);
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
    // Resolve por assunto_id e, se o processo for antigo e não tiver,
    // cai no slug — antes disso a tela assumia "Regularização SEI".
    fetch("/api/admin/assuntos").then(r=>r.json()).then(j=>{
      const lista = j?.data ?? [];
      const a = lista.find((x: {id:string}) => x.id === assunto) ?? lista.find((x: {slug:string}) => x.slug === tipo);
      if (a) { setAssuntoNome(a.nome); setNumeracao(a.numeracao ?? null); }
    }).catch(()=>{});
    fetch("/api/auth/me").then(r=>r.json()).then(j=>{ if(j.ok){ const p=Array.isArray(j.data?.perfis)?j.data.perfis:[]; setIsAdmin(p.includes("Administrador")); } });

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
      // Carrega campos LIP para o banner crítico
      fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}${tipoProcesso ? `&tipo=${encodeURIComponent(tipoProcesso)}` : ""}`, { credentials: "include" })
        .then(r => r.json())
        .then(j => { setDadosLip(j?.data?.dados || j?.dados || {}); setTagsProcesso(j?.data?.tags || j?.tags || []); });

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

  /**
   * Filtro rápido: derruba de uma vez os grupos que não se aplicam ao
   * projeto ("não é posto", "sem marquise"). Mesma trava do resto: só
   * marca item ainda não respondido e confirma mostrando os números.
   */
  function aplicarFiltro(f: FiltroMac) {
    if (f.grupos.length === 0) { mostrarToast(`Filtro "${f.nome}" ainda não foi configurado.`); return; }
    const existentes = f.grupos.filter((g) => GRUPOS.includes(g));
    if (existentes.length === 0) { mostrarToast(`Nenhum grupo deste filtro existe neste checklist.`); return; }
    const alvo = checklistItens.filter((i) => existentes.includes(i.grupo) && !itens[i.id]);
    if (alvo.length === 0) { mostrarToast("Esses grupos já estão respondidos."); return; }
    if (!confirm(`"${f.nome}" — marcar como NÃO SE APLICA:\n\n${existentes.map((g) => "• " + g).join("\n")}\n\n${alvo.length} item(ns). Itens já respondidos não são tocados.`)) return;
    setItens((prev) => {
      const novo = { ...prev };
      for (const i of alvo) novo[i.id] = "nao_aplica";
      return novo;
    });
    setFontes((prev) => {
      const novo = { ...prev };
      for (const i of alvo) novo[i.id] = "manual";
      return novo;
    });
    void salvarSilencioso();
    mostrarToast(`✅ ${f.nome}: ${alvo.length} item(ns) marcados como N/A.`);
  }

  // O índice mostra, por grupo, quantos itens existem, quantos foram
  // respondidos e se há não-conformidade. Calcular isso dentro do map
  // custava 3 varreduras dos 561 itens POR grupo — ~80 mil operações a
  // cada tecla digitada na busca. Aqui é uma varredura só, memoizada.
  const statsPorGrupo = useMemo(() => {
    const m: Record<string, { total: number; respondidos: number; temErro: boolean; busca: string }> = {};
    for (const i of checklistItens) {
      const g = m[i.grupo] ?? (m[i.grupo] = { total: 0, respondidos: 0, temErro: false, busca: "" });
      g.total++;
      if (itens[i.id]) g.respondidos++;
      if (itens[i.id] === "nao_conforme") g.temErro = true;
      g.busca += " " + String(i.texto ?? "");
    }
    for (const k of Object.keys(m)) {
      m[k].busca = (k + m[k].busca).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }
    return m;
  }, [checklistItens, itens]);

  const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  async function buscarComIA() {
    const pergunta = buscaTexto.trim();
    if (pergunta.length < 3) { setBuscaErro("Escreva o que você procura."); return; }
    if (!assuntoId) { setBuscaErro("Assunto do processo não resolvido."); return; }
    setBuscando(true); setBuscaErro(""); setBuscaIA(null);
    try {
      const res = await fetch("/api/mac/buscar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assunto_id: assuntoId, pergunta }),
      });
      const json = await res.json();
      if (!json.ok) { setBuscaErro(json.erro || "Falha na busca."); return; }
      setBuscaIA(json.itens ?? []);
      if ((json.itens ?? []).length === 0) setBuscaErro("Nenhum item trata desse assunto.");
    } catch (e: any) { setBuscaErro(e?.message || "Erro inesperado."); } finally { setBuscando(false); }
  }

  /**
   * Marca como "não se aplica" tudo que está FORA dos grupos informados.
   * Só toca em item ainda não respondido — nunca sobrescreve o que o
   * analista já decidiu.
   */
  function marcarDemaisComoNA(gruposManter: string[]) {
    const manter = new Set(gruposManter);
    const alvo = checklistItens.filter((i) => !manter.has(i.grupo) && !itens[i.id]);
    if (alvo.length === 0) { mostrarToast("Nada a marcar — os outros grupos já estão respondidos."); return; }
    if (!confirm(`Marcar ${alvo.length} item(ns) de ${new Set(alvo.map(i => i.grupo)).size} grupo(s) como "não se aplica"?\n\nItens já respondidos não são tocados.`)) return;
    setItens((prev) => {
      const novo = { ...prev };
      for (const i of alvo) novo[i.id] = "nao_aplica";
      return novo;
    });
    setFontes((prev) => {
      const novo = { ...prev };
      for (const i of alvo) novo[i.id] = "manual";
      return novo;
    });
    void salvarSilencioso();
    mostrarToast(`✅ ${alvo.length} item(ns) marcados como não se aplica.`);
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

  async function deferirTudo() {
    // Sem número de despacho disponível, não salva como deferido — a análise
    // deferida sempre desemboca em geração de despacho.
    try {
      const _peekDespacho = await fetch(`/api/numeracao/proximo?tipo=despacho&processo=${encodeURIComponent(codigo)}&modo=peek`, { credentials: "include" });
      const _jPeekDespacho = await _peekDespacho.json();
      if (!_jPeekDespacho.ok) {
        mostrarToast(_jPeekDespacho.esgotado
          ? "❌ Faixa de despachos esgotada. Acesse Configurações → Numeração para cadastrar nova faixa."
          : "❌ Nenhuma faixa de despacho cadastrada. Acesse Configurações → Numeração.");
        return;
      }
    } catch {
      mostrarToast("❌ Erro ao verificar numeração de despacho.");
      return;
    }

    const idsTodos = checklistItens.map((i) => i.id);
    const novoItens = { ...itens };
    const novoFontes = { ...fontes };
    const novoAceites = { ...aceites };
    idsTodos.forEach((id) => {
      novoItens[id] = "conforme";
      novoFontes[id] = "manual";
      novoAceites[id] = true;
    });
    setItens(novoItens);
    setFontes(novoFontes);
    setAceites(novoAceites);
    await salvar("deferido", novoItens, novoFontes, novoAceites);
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
        // Trava de concorrência: se já há um POST de análise nova em curso,
        // não dispara outro (evita criar duas análises com o mesmo número).
        // Ao criar com sucesso, a trava permanece — os próximos saves caem no
        // PUT; só é liberada ao iniciar outra análise (iniciarNovaAnalise).
        if (criandoAnaliseRef.current) { setStatusSalvo(""); return; }
        criandoAnaliseRef.current = true;
        let criouOk = false;
        try {
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
          if (json?.ok && json?.data) {
            criouOk = true;
            if (!skipStateUpdate) {
              setAnaliseAtual(json.data);
              setNovaAnalise(false);
              // Atualiza lista de análises para que botões 1-5 e lixeiras fiquem corretos
              fetch(`/api/analise-regularizacao?codigo=${encodeURIComponent(codigo)}`)
                .then(r => r.json())
                .then(j => { if (j.ok) setAnalises(j.data); })
                .catch(() => {});
            }
          }
        } finally {
          // Só libera a trava se NÃO criou (falha) — permite nova tentativa.
          if (!criouOk) criandoAnaliseRef.current = false;
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
        // Mantém o cache analises[] em sincronia — sem isso, ao clicar em outra
        // análise e voltar, selecionarAnalise() carregava dados antigos do cache
        // e o despacho saía com obs/checklist desatualizados.
        if (!skipStateUpdate) {
          setAnalises(prev => prev.map(a => a.id === analiseAtual.id
            ? { ...a, itens, fontes, aceites, observacoes, observacoes_por_aba: observacoesPorAba, numero_revisao: numeroRevisao, historico_analises: historicoAnalises }
            : a
          ));
        }
      }
      setStatusSalvo("salvo");
      setTimeout(() => setStatusSalvo(""), 2500);
    } catch {
      setStatusSalvo("erro");
    } finally {
      if (analiseAtual?.id) carregarHistoricoMac(analiseAtual.id);
    }
  }

  async function salvar(status = "em_andamento", itensOverride?: Record<string, StatusItem>, fontesOverride?: Record<string, "auto" | "p2" | "manual" | null>, aceitesOverride?: Record<string, boolean>) {
    const itensParaSalvar = itensOverride ?? itens;
    const fontesParaSalvar = fontesOverride ?? fontes;
    const aceitesParaSalvar = aceitesOverride ?? aceites;
    setSalvando(true);
    try {
      if (novaAnalise || !analiseAtual) {
        const res = await fetch("/api/analise-regularizacao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processo_codigo: codigo,
            itens: itensParaSalvar,
            fontes: fontesParaSalvar,
            aceites: aceitesParaSalvar,
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
        const res = await fetch("/api/analise-regularizacao", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: analiseAtual.id,
            itens: itensParaSalvar,
            fontes: fontesParaSalvar,
            aceites: aceitesParaSalvar,
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
        // Não chama carregar() — mantém a análise atual selecionada sem troca.
        // Apenas atualiza a lista de análises para refletir mudanças de status.
        const analiseAtualId = analiseAtual.id;
        const resLista = await fetch(`/api/analise-regularizacao?codigo=${encodeURIComponent(codigo)}`);
        const jsonLista = await resLista.json();
        if (jsonLista.ok) {
          setAnalises(jsonLista.data);
          // Restaura a análise que estava sendo editada
          const restaurada = jsonLista.data.find((a: any) => a.id === analiseAtualId);
          if (restaurada) setAnaliseAtual(restaurada);
        }
      }
    } finally {
      setSalvando(false);
      if (analiseAtual?.id) carregarHistoricoMac(analiseAtual.id);
    }
  }

  /**
   * Prepara a numeração e abre o modal de emissão.
   *
   * Existe como função única porque havia DOIS caminhos até aqui — o botão
   * "Gerar Despacho" e o "Emitir mesmo assim" do modal de pendências — e o
   * segundo tinha a lógica escrita no próprio onClick. Resultado: em
   * processo com pendência de LIP, a reemissão pedia número novo e
   * queimava a numeração, mesmo com o botão dizendo "Reemitir nº X".
   */
  async function prepararNumeracao(tipo: "despacho" | "arquivamento") {
    const serie = tipo === "arquivamento" ? "parecer" : "despacho";
    const jaEmitido = serie === "parecer" ? analiseAtual?.numero_parecer : analiseAtual?.numero_despacho;

    // Reemissão: reaproveita o número da análise e não consulta a série.
    if (jaEmitido) {
      setReemitindo(true);
      setNumeroDespacho(String(jaEmitido));
      setNumeracaoBloqueio(null);
      setNumeracaoCarregando(false);
      setModalDespacho(true);
      return;
    }

    setReemitindo(false);
    setNumeracaoCarregando(true);
    setNumeracaoBloqueio(null);
    try {
      const r = await fetch(`/api/numeracao/proximo?tipo=${serie}&processo=${encodeURIComponent(codigo)}&modo=peek`, { credentials: "include" });
      const j = await r.json();
      if (j.ok) {
        setNumeroDespacho(String(j.numero).padStart(3, "0"));
        setNumeracaoBloqueio(null);
      } else {
        setNumeroDespacho("");
        const label = serie === "parecer" ? "pareceres" : "despachos";
        setNumeracaoBloqueio(j.esgotado
          ? `Faixa de ${label} esgotada. Acesse Configurações → Numeração para cadastrar nova faixa.`
          : `Nenhuma faixa de ${label} cadastrada. Acesse Configurações → Numeração.`);
      }
    } catch {
      setNumeroDespacho("");
      setNumeracaoBloqueio("Erro ao buscar número de despacho.");
    } finally {
      setNumeracaoCarregando(false);
    }
    setModalDespacho(true);
  }

  // Abre o modal de emissão já com o tipo definido pelo botão de origem.
  // Arquivamento sai da série de parecer; despacho, da série de despacho.
  async function abrirModalDespacho(tipo: "despacho" | "arquivamento") {
    setTipoDespacho(tipo);
    setDataEmissao(new Date().toLocaleDateString("pt-BR"));
              await salvarSilencioso();
    // Avisos de pendência só valem para o despacho ao interessado.
    if (tipo === "despacho") {
    // Coleta avisos — nunca bloqueia, só informa
    // origem explícita — sem isso o modal prefixava "MAC —" também nos
    // itens vindos do LIP, virando "MAC — LIP — 3. Uso do Solo".
    const pendentesIA = checklistItens
      .filter((i) => fontes[i.id] === "p2" && !aceites[i.id])
      .map((i) => ({ id: i.id, texto: i.texto, grupo: i.grupo, origem: "mac" as const }));
    try {
      const [procRes, lipRes] = await Promise.all([
        fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}${tipoProcesso ? `&tipo=${encodeURIComponent(tipoProcesso)}` : ""}`, { credentials: "include" }),
        fetch(`/api/admin/lip${assuntoId ? `?assunto_id=${encodeURIComponent(assuntoId)}` : ""}`),
      ]);
      const procJson = await procRes.json();
      const lipJson = await lipRes.json();
      const dados = procJson?.data?.dados || procJson?.dados || {};
      const vistosLip = new Set<string>();
      const pendentesLipX = (lipJson?.data || []).flatMap((a: any) =>
        (a.lip_campos || [])
          .filter((c: any) => dados[c.chave]?.valor === "X")
          .filter((c: any) => (vistosLip.has(c.chave) ? false : (vistosLip.add(c.chave), true)))
          .map((c: any) => ({ id: `lip_${c.chave}`, texto: `${c.label} — marcado com X`, grupo: a.nome || "LIP", origem: "lip" as const }))
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
    }
    await prepararNumeracao(tipo);
  }

  async function gerarDespacho() {
    setGerandoDespacho(true);
    setModalDespacho(false);
    // Captura antes de qualquer await — o estado React pode mudar entre
    // awaits (ex: salvarSilencioso cria a análise e faz setAnaliseAtual),
    // mas a closure capturada aqui reflete o render em que o clique ocorreu.
    const capturedAnaliseId = analiseAtual?.id ?? null;
    const capturedNumeroAnalise = analiseAtual?.numero_analise ?? null;
    // Garante que itens e observações atuais estejam persistidos antes do
    // docx — é isto que faz a reemissão sair com o checklist e as
    // observações COMO ESTÃO AGORA (a rota relê `analises_mac.itens`).
    // Preserva o status: sem isso, reemitir uma análise concluída a
    // reabria como "em andamento", porque salvarSilencioso() assume
    // "em_andamento" quando não recebe status.
    await salvarSilencioso(analiseAtual?.status || "em_andamento");
    try {
      const naoConformesIds = checklistItens
        .filter((i) => itens[i.id] === "nao_conforme")
        .map((i) => i.texto);

      const res = await fetch("/api/despacho-regularizacao", { credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processo: codigo,
          tipo: tipoDespacho,
          numeroDespacho,
          naoConformes: naoConformesIds,
          observacoes,
          observacoesPorAba,
          analises: analises.slice().sort((a,b) => a.numero_analise - b.numero_analise).filter((a) => a.numero_analise <= (capturedNumeroAnalise ?? 1)).map((a) => ({
            numero: a.numero_analise,
            data: dataDaAnalise(a),
            ultima: a.numero_analise === 5,
          })),
          analiseId: capturedAnaliseId,
          assunto_id: assuntoId,
          numero_revisao: numeroRevisao,
          data: dataEmissao,
        }),
      });

      if (!res.ok) { mostrarToast("Erro ao gerar despacho."); return; }
      registrar({ modulo: "DESPACHO", acao: "DESPACHO_GERADO", processo_codigo: codigo, detalhe: { tipo: tipoDespacho, numero: numeroDespacho } });
      // Auto-registro MRP
      const dlFresh = await fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}${tipoProcesso ? `&tipo=${encodeURIComponent(tipoProcesso)}` : ""}`, { credentials: "include" }).then(r => r.json()).then(j => j?.data?.dados || j?.dados || {}).catch(() => ({}));
      fetch("/api/mrp/registros", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processo_codigo: codigo,
          tipo_despacho: (tipoDespacho || "despacho").toLowerCase(),
          numero_despacho: numeroDespacho,
          numero_analise: capturedNumeroAnalise,
          numero_revisao: numeroRevisao,
          area_construida: parseAreaBR(dlFresh?.areaTotal?.valor),
          interessado: dlFresh?.proprietario?.valor ?? null,
          bairro: dlFresh?.bairro?.valor ?? null,
          numero_sei: dlFresh?.processo?.valor ?? codigo,
          numero_fisico: dlFresh?.processoFisico?.valor ?? null,
          // O slot vai por id; `assunto` (obra) o servidor extrai do LIP.
          assunto_id: assuntoId,
          tipo_processo: tipoProcesso || null,
          data_despacho: dataBRparaISO(dataEmissao),
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

      // Consome o número SOMENTE após o download bem-sucedido — e nunca na
      // reemissão, onde o número já foi consumido na primeira vez.
      const _tipoSerieCommit = tipoDespacho === "arquivamento" || tipoDespacho === "indeferimento" ? "parecer" : "despacho";
      const _numCommit = parseInt(numeroDespacho, 10);
      if (_numCommit > 0 && !reemitindo) {
        // Confirma a numeração de forma confiável: tenta até 3x em falha de
        // rede/5xx. 409 = servidor já avançou o número (re-emissão) → ok.
        // Se todas falharem, avisa o analista (não trava o fluxo).
        const _urlCommit = `/api/numeracao/proximo?tipo=${_tipoSerieCommit}&processo=${encodeURIComponent(codigo)}&modo=commit&numero=${encodeURIComponent(_numCommit)}&data=${encodeURIComponent(dataEmissao)}${capturedAnaliseId ? `&analise_id=${encodeURIComponent(capturedAnaliseId)}&analise_numero=${capturedNumeroAnalise}` : ""}`;
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
          data_despacho: dataEmissao,
          conteudo: {
            pendencias_mac: checklistItens
              .filter(i => itens[i.id] === "nao_conforme")
              .map(i => ({ grupo: i.grupo, texto: i.texto })),
            pendencias_lip: pendenciasLip,
            observacoes: observacoes || "",
            observacoes_por_aba: observacoesPorAba || {},
          },
        }),
      }).catch(() => {});

      // Grava tag permanente no processo (STEP 2a)
      await gravarTag({
        tipo: tipoDespacho,
        numero_analise: capturedNumeroAnalise ?? undefined,
        numero_despacho: numeroDespacho || undefined,
        data: dataEmissao,
      });

      // Reflete o número na análise em tela, sem esperar um reload — quem
      // grava em analises_mac é a rota de numeração, fora deste estado.
      setAnaliseAtual((prev: any) => prev ? {
        ...prev,
        [_tipoSerieCommit === "parecer" ? "numero_parecer" : "numero_despacho"]: numeroDespacho,
      } : prev);

      // Salva DEPOIS de emitir, além do save que antecede o docx. Na
      // reemissão não há commit de numeração — e é o commit que normalmente
      // grava em analises_mac depois da emissão. Sem este save, o que foi
      // ajustado no checklist ficava só no save anterior e a tela seguia
      // marcando alteração pendente. Status preservado para não reabrir
      // análise concluída.
      await salvarSilencioso(analiseAtual?.status || "em_andamento");

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

  // A data de cada análise no despacho é a data em que aquela análise foi
  // efetivamente despachada. Fonte primária: data_despacho/data_parecer,
  // gravada atomicamente em analises_mac junto com o número (numeracao/
  // proximo). A tag em processos.tags é fallback (gravação client-side,
  // best-effort — pode ter sido perdida em análises emitidas antes desta
  // coluna existir). `criado_em` é o último fallback, para análises que
  // ainda não geraram documento.
  function dataDaAnalise(a: any): string {
    if (a.data_despacho) return a.data_despacho;
    if (a.data_parecer) return a.data_parecer;
    const tag = (tagsProcesso ?? []).find((t: any) =>
      t?.numero_analise === a.numero_analise &&
      ["despacho", "indeferimento", "arquivamento"].includes(t?.tipo)
    );
    if (tag?.data) return tag.data;
    // Sem tag = ainda não despachada. Se é a análise que está sendo emitida
    // agora, vale a data escolhida no modal de emissão (padrão hoje) — não a
    // hora do clique, que perto da meia-noite cai no dia seguinte.
    if (a.numero_analise === analiseAtual?.numero_analise) {
      return dataEmissao;
    }
    return new Date(a.criado_em).toLocaleDateString("pt-BR");
  }

  // "dd/mm/aaaa" → ISO ao meio-dia local (data não escorrega ao exibir em UTC).
  function dataBRparaISO(dataBR: string): string {
    const m = String(dataBR ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return new Date().toISOString();
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0).toISOString();
  }

  // Máscara progressiva dd/mm/aaaa enquanto o usuário digita.
  function mascararDataBR(v: string): string {
    const d = String(v ?? "").replace(/\D/g, "").slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  }

  function iniciarNovaAnalise() {
    if (analises.length >= 5) {
      mostrarToast("Limite de 5 análises atingido.");
      return;
    }
    // `analises` vem da API ordenada por numero_analise DESC, então a posição
    // final do array é a análise 1 — não a mais recente. Buscar pelo maior
    // numero_analise torna a cópia independente da ordenação.
    const ultima = [...analises].sort((a, b) => b.numero_analise - a.numero_analise)[0];
    setNumeroAnaliseNova(ultima ? ultima.numero_analise + 1 : 1);
    setAnaliseAtual(null);
    setItens(ultima?.itens || {});
    setFontes(ultima?.fontes || {});
    setAceites(ultima?.aceites || {});
    setObservacoes(ultima?.observacoes || "");
    setObservacoesPorAba(ultima?.observacoes_por_aba || {});
    // CAU/CREA propagam da análise anterior (mesmo projeto = mesmo RT).
    criandoAnaliseRef.current = false; // libera a trava para criar a nova análise
    setNovaAnalise(true);
    // Reutiliza o checklist da análise anterior sem perguntar
    if (ultima?.modelo_id) {
      setModeloSelecionado({ id: ultima.modelo_id, nome: "", tipo_processo: null, dono_id: null, assunto_id: null });
      carregarItensModelo(ultima.modelo_id);
    } else {
      carregarModelos(tipoProcesso, assuntoId).then(() => setModalModelo(true));
    }
  }

  function selecionarAnalise(a: any) {
    setNumeroAnaliseNova(null);
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
    data?: string;
  }) {
    try {
      await fetch("/api/processo/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          tag: {
            ...tag,
            data: tag.data || new Date().toLocaleDateString("pt-BR"),
          },
        }),
      });
    } catch {
      // silencioso
    }
  }

  // Análise em andamento: a já gravada, ou a que acabou de ser iniciada.
  const numeroAnaliseEmAndamento = analiseAtual?.numero_analise ?? numeroAnaliseNova;

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
        body: JSON.stringify({ codigo, tipoProcesso: tipoProcesso || "regularizacao", numeroDespacho: numDI, data: dataDI, destino: destinoDI === "outro" ? destinoCustomDI : destinoDI, corpo: corpoDI, assunto_id: assuntoId, pendencias_lip: pendenciasLip, numero_analise: analiseAtual?.numero_analise }),
      });
      if (!res.ok) throw new Error("Erro");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `DespachoInterno_${codigo}_${numDI}.docx`; a.click();
      URL.revokeObjectURL(url); setModalDespachoInterno(false);
      registrar({ modulo: "DESPACHO", acao: "DESPACHO_INTERNO_GERADO", processo_codigo: codigo, detalhe: { numero: numDI } });

      // Consome o número SOMENTE após o download bem-sucedido (peek não commita).
      const _numCommitDI = parseInt(numDI, 10);
      if (_numCommitDI > 0) {
        let _commitOkDI = false;
        for (let _t = 1; _t <= 3 && !_commitOkDI; _t++) {
          try {
            const _rc = await fetch(`/api/numeracao/proximo?tipo=despacho&processo=${encodeURIComponent(codigo)}&modo=commit&numero=${encodeURIComponent(_numCommitDI)}&documento=despacho_interno${analiseAtual?.id ? `&analise_id=${encodeURIComponent(analiseAtual.id)}&analise_numero=${analiseAtual.numero_analise}` : ""}`, { credentials: "include" });
            if (_rc.ok || _rc.status === 409) { _commitOkDI = true; break; }
          } catch { /* rede — tenta de novo */ }
          if (_t < 3) await new Promise((r) => setTimeout(r, _t * 800));
        }
        if (!_commitOkDI) mostrarToast("⚠️ Despacho interno gerado, mas a numeração não foi confirmada. Confira antes de gerar o próximo.");
        setAnaliseAtual((prev: any) => prev ? { ...prev, numero_despacho_interno: numDI } : prev);
      }
      const dlFresh = await fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}${tipoProcesso ? `&tipo=${encodeURIComponent(tipoProcesso)}` : ""}`, { credentials: "include" }).then(r => r.json()).then(j => j?.data?.dados || j?.dados || {}).catch(() => ({}));
      fetch("/api/mrp/registros", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processo_codigo: codigo,
          tipo_despacho: "DESPACHO_INTERNO",
          numero_despacho: numDI,
          area_construida: parseAreaBR(dlFresh?.areaTotal?.valor),
          interessado: dlFresh?.proprietario?.valor ?? null,
          bairro: dlFresh?.bairro?.valor ?? null,
          numero_sei: dlFresh?.processo?.valor ?? codigo,
          numero_fisico: dlFresh?.processoFisico?.valor ?? null,
          assunto_id: assuntoId,
          tipo_processo: tipoProcesso || null,
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
                      <a key={i} href={`/processo/${codigo}?tipo=${tipoProcesso || "regularizacao"}`}
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
              <h2 className="text-[var(--text-primary)] font-bold text-lg">
                {reemitindo
                  ? (tipoDespacho === "arquivamento" ? "🔄 Reemitir Arquivamento" : "🔄 Reemitir Despacho")
                  : (tipoDespacho === "arquivamento" ? "🗂️ Gerar Arquivamento" : "📄 Gerar Despacho")}
              </h2>
              <button onClick={() => setModalDespacho(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              {reemitindo && (
                <div className="rounded-lg border border-[var(--accent)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                  Reemissão da <strong className="text-[var(--text-primary)]">Análise {analiseAtual?.numero_analise}</strong>: o número
                  não muda e a numeração não avança. O documento sai com o
                  checklist <strong className="text-[var(--text-primary)]">como está agora</strong>.
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">{tipoDespacho === "arquivamento" ? "Número do Parecer" : "Número do Despacho"}</label>
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

              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Data de emissão</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={dataEmissao}
                  onChange={(e) => setDataEmissao(mascararDataBR(e.target.value))}
                  placeholder="dd/mm/aaaa"
                  className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <span className="text-[10px] text-[var(--text-muted)]">Vai para o documento, a tag da pilha e o MRP.</span>
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
                        <button onClick={() => salvar("em_andamento").then(() => router.push(`/processo/${encodeURIComponent(codigo)}?tipo=${tipoProcesso || "regularizacao"}`))}
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
              ← LIP
            </button>
            <button onClick={() => window.open(`/processo/${codigo}?tipo=${tipoProcesso || "regularizacao"}`, "_blank")}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors border border-[var(--border)]">
              🔍 Ver LIP ↗
            </button>
            
            <button
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors"
              onClick={async () => {
                setNumDIBloqueio(null);
                try {
                  const _r = await fetch(`/api/numeracao/proximo?tipo=despacho&processo=${encodeURIComponent(codigo)}&modo=peek`, { credentials: "include" });
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
              onClick={() => setModalExportar(true)}
              disabled={!analiseAtual?.id && analises.length === 0}
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
              📊 Exportar Excel
            </button>
            <button
              type="button"
              onClick={() => setModalImportar(true)}
              disabled={importando || (!analiseAtual?.id && analises.length === 0)}
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
                if (f) { importarExcel(f, importScope); }
              }}
            />
            <div>
              <h1 className="text-xl font-bold">🔍 MAC — Módulo de Análises e Conformidades</h1>
              <p className="text-[var(--text-muted)] text-xs">{assuntoNome}</p>
              <div className="text-xs h-4 mt-0.5">{statusSalvo==="pendente"&&<span className="text-[var(--warning)]">● Alterações não salvas</span>}{statusSalvo==="salvando"&&<span className="text-[var(--warning)] animate-pulse">⏳ Salvando...</span>}{statusSalvo==="salvo"&&<span className="text-[var(--success)]">✓ Salvo automaticamente</span>}{statusSalvo==="erro"&&<span className="text-[var(--error)]">✗ Erro ao salvar</span>}</div>
              <p className="text-sm"><span className="text-[var(--text-muted)]">{perfilDe(numeracao).rotulo}: </span><span className="text-[var(--accent)] font-mono">{codigo}</span></p>
{dadosLip?.proprietario?.valor && (
  <p className="text-[var(--text-muted)] text-xs mt-0.5">{dadosLip.proprietario.valor}</p>
)}
{numeroAnaliseEmAndamento && (() => {
  // Uma análise pode ter emitido despacho E parecer — são séries distintas.
  const emitidos = [
    analiseAtual?.numero_despacho ? `Despacho nº ${analiseAtual.numero_despacho}` : null,
    analiseAtual?.numero_despacho_interno ? `Despacho Interno nº ${analiseAtual.numero_despacho_interno}` : null,
    analiseAtual?.numero_parecer ? `Parecer nº ${analiseAtual.numero_parecer}` : null,
  ].filter(Boolean);
  return emitidos.length > 0 ? (
    <p className="text-[var(--success)] text-xs font-bold mt-0.5">
      Análise {numeroAnaliseEmAndamento} concluída — {emitidos.join(" e ")}
    </p>
  ) : (
    <p className="text-[var(--accent)] text-xs font-bold mt-0.5">
      Análise {numeroAnaliseEmAndamento} em andamento
      {analiseAtual ? "" : " (não salva)"}
    </p>
  );
})()}
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
        {abaAtual === GRUPOS.length && !(MUITOS_GRUPOS && verIndice) && (
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
          {MUITOS_GRUPOS && !verIndice && (
            <div className="flex items-center gap-3 px-6 pt-4 pb-2 bg-[var(--bg-primary)]">
              <button onClick={() => { void salvarSilencioso(); setVerIndice(true); }}
                className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors">← Índice</button>
              <span className="font-bold text-[var(--text-primary)] truncate">{abaAtual === GRUPOS.length ? "📝 OBS" : grupoAtual}</span>
            </div>
          )}
          {MUITOS_GRUPOS && verIndice && (
            <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
              {filtrosDoAssunto(tipoProcesso).length > 0 && (
                <div className="max-w-4xl mb-4">
                  <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mb-2">Filtros rápidos — derrubam abas inteiras para N/A</p>
                  <div className="flex flex-wrap gap-2">
                    {filtrosDoAssunto(tipoProcesso).map((f) => (
                      <button key={f.nome} onClick={() => aplicarFiltro(f)} title={f.grupos.length ? f.grupos.join(" · ") : "Ainda não configurado"}
                        className={`px-3 py-2 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
                          f.grupos.length
                            ? "bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white"
                            : "bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-dashed border-[var(--border)]"
                        }`}>
                        {f.nome}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="max-w-4xl mb-4">
                <div className="flex gap-2 flex-wrap">
                  <input value={buscaTexto} onChange={(e) => { setBuscaTexto(e.target.value); setBuscaErro(""); }}
                    onKeyDown={(e) => e.key === "Enter" && buscarComIA()}
                    placeholder="Procurar no checklist — ex.: vaga de idoso, acessibilidade, recuo frontal"
                    className="flex-1 min-w-[260px] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                  <button onClick={buscarComIA} disabled={buscando}
                    className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
                    {buscando ? "⏳ Buscando..." : "🔎 Buscar com IA"}
                  </button>
                  {(buscaTexto || buscaIA) && (
                    <button onClick={() => { setBuscaTexto(""); setBuscaIA(null); setBuscaErro(""); }}
                      className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-sm">Limpar</button>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Digitar já filtra a lista pelo texto. O botão usa a IA para achar também o que fala do assunto com outras palavras.
                </p>
                {buscaErro && <p className="text-xs text-[var(--error)] mt-2">{buscaErro}</p>}

                {buscaIA && buscaIA.length > 0 && (
                  <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                      <span className="text-sm font-bold text-[var(--text-primary)]">
                        {buscaIA.length} item(ns) em {new Set(buscaIA.map((x) => x.grupo)).size} grupo(s)
                      </span>
                      <button onClick={() => marcarDemaisComoNA([...new Set(buscaIA.map((x) => x.grupo))])}
                        className="bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white border border-[#2563EB] text-[#2563EB] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                        ⬜ Marcar os outros grupos como N/A
                      </button>
                    </div>
                    <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                      {buscaIA.map((r) => (
                        <button key={r.id} onClick={() => { const idx = GRUPOS.indexOf(r.grupo); if (idx >= 0) { void salvarSilencioso(); setAbaAtual(idx); setVerIndice(false); } }}
                          className="text-left px-3 py-2 rounded border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)] transition-colors">
                          <span className="text-xs text-[var(--accent)] font-semibold">{r.grupo}</span>
                          {r.motivo && <span className="text-xs text-[var(--text-muted)]"> — {r.motivo}</span>}
                          <span className="block text-xs text-[var(--text-secondary)] mt-0.5">{String(r.texto).slice(0, 160)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mb-3">Itens do checklist — {GRUPOS.length} grupos</p>
              <div className="flex flex-col gap-1.5 max-w-4xl">
                {GRUPOS.filter((grupo) => {
                  const q = semAcento(buscaTexto.trim());
                  return !q || (statsPorGrupo[grupo]?.busca ?? "").includes(q);
                }).map((grupo) => {
                  const idx = GRUPOS.indexOf(grupo);
                  const st = statsPorGrupo[grupo] ?? { total: 0, respondidos: 0, temErro: false };
                  const total = st.total;
                  const respondidos = st.respondidos;
                  const temErro = st.temErro;
                  return (
                    <button key={grupo} onClick={() => { void salvarSilencioso(); setAbaAtual(idx); setVerIndice(false); }}
                      className="flex items-center gap-3 text-left px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] hover:border-[var(--accent)] transition-colors">
                      <span className="text-xs text-[var(--text-muted)] font-mono w-7 shrink-0">{idx + 1}</span>
                      <span className="flex-1 text-sm text-[var(--text-primary)] font-medium">{grupo}</span>
                      {temErro && <span className="w-2.5 h-2.5 bg-[var(--error)] rounded-full shrink-0" />}
                      <span className={`text-xs shrink-0 ${respondidos === total ? "text-[#059669]" : "text-[var(--text-muted)]"}`}>{respondidos}/{total}</span>
                    </button>
                  );
                })}
                <button onClick={() => { void salvarSilencioso(); setAbaAtual(GRUPOS.length); setVerIndice(false); }}
                  className="flex items-center gap-3 text-left px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] hover:border-[var(--accent)] transition-colors">
                  <span className="text-xs text-[var(--text-muted)] font-mono w-7 shrink-0">📝</span>
                  <span className="flex-1 text-sm text-[var(--text-primary)] font-medium">OBS</span>
                </button>
              </div>
            </div>
          )}
          <div className={`flex flex-wrap gap-2 px-6 pt-4 pb-2 bg-[var(--bg-primary)]${MUITOS_GRUPOS ? " hidden" : ""}`}>
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

          <div className={`flex-1 overflow-y-auto px-6 pb-6${abaAtual === GRUPOS.length || (MUITOS_GRUPOS && verIndice) ? " hidden" : ""}`}>
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
                        {item.gera_indeferimento && (
                          <span className="inline-block mb-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#DC2626] border border-[#DC2626]"
                            title="Não conformidade neste item leva a indeferimento, não a exigência.">
                            ⚠ Indefere
                          </span>
                        )}
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

          {/* Botões de análise 1-5 — compactos + Limpar individual */}
          <div className="flex flex-col gap-1.5 mb-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const existente = analises.find((a) => a.numero_analise === n);
              const jaEmitida = !!existente && existente.status !== "em_andamento";
              const liberada = n === 1 || analises.some((a) => a.numero_analise === n - 1);
              const ativa = numeroAnaliseEmAndamento === n;
              return (
                <div key={n} className="flex gap-1 items-stretch">
                  <button
                    disabled={!liberada && !existente}
                    onClick={() => selecionarOuCriarAnalise(n)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      ativa
                        ? "bg-[var(--accent)] border-[var(--accent-hover)] text-[var(--accent-fg)]"
                        : jaEmitida
                          ? "bg-[var(--success-bg)] border-[var(--border)] text-[var(--accent-fg)]"
                          : existente || liberada
                            ? "bg-[var(--bg-secondary)] border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                            : "bg-[var(--bg-primary)] border-[var(--border)] text-slate-600 cursor-not-allowed opacity-50"
                    }`}
                  >
                    {jaEmitida ? `✅ Análise ${n}` : `📋 Análise ${n}`}
                  </button>
                  {existente && (
                    <button
                      onClick={() => setModalLimparAnalise(n)}
                      title={`Zerar Análise ${n}`}
                      className="px-2 py-1 rounded-lg text-xs border border-red-400 text-red-400 hover:bg-red-600 hover:text-white transition-colors"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Botão Via / Logradouro */}
          <button
            onClick={() => { void salvarSilencioso(); router.push(`/logradouro/${encodeURIComponent(codigo)}?voltar=${encodeURIComponent(`/analise-regularizacao/${codigo}`)}&rotulo=${encodeURIComponent("Voltar ao MAC")}`); }}
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
            {analisandoP2 ? "⏳ Analisando..." : `📎 LER PROCESSO ${(assuntoNome || "").toUpperCase()}`.trim()}
          </button>

          <button onClick={() => salvar("em_andamento")} disabled={salvando}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] font-bold py-2.5 rounded-lg text-sm transition-colors">
            {salvando ? "Salvando..." : "💾 Salvar"}
          </button>

          <button onClick={() => deferirTudo()} disabled={salvando}
            className="w-full bg-[#ECFDF5] hover:bg-[#059669] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed border border-[#059669] text-[#059669] font-bold py-2.5 rounded-lg text-sm transition-colors">
            ✅ Deferir
          </button>

          <button onClick={() => abrirModalDespacho("despacho")} disabled={gerandoDespacho}
            className="w-full bg-[var(--ia-bg)] hover:bg-[var(--ia)] hover:text-white disabled:opacity-50 border border-[var(--ia)] text-[var(--ia)] font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
            {gerandoDespacho ? "⏳ Gerando..." : analiseAtual?.numero_despacho ? `🔄 Reemitir Despacho nº ${analiseAtual.numero_despacho}` : "📄 Gerar Despacho"}
          </button>


          {indeferimentoPendente && (
            <button onClick={async () => {
              const { motivos, obs } = indeferimentoPendente;
              setGerandoDespacho(true);
              try {
                // Verifica numeração de parecer ANTES de salvar o status
                // indeferido — sem número disponível, não salva nem emite.
                const _peekParecer = await fetch(`/api/numeracao/proximo?tipo=parecer&processo=${encodeURIComponent(codigo)}&modo=peek`, { credentials: "include" });
                const _jPeekParecer = await _peekParecer.json();
                if (!_jPeekParecer.ok) {
                  mostrarToast(_jPeekParecer.esgotado
                    ? "❌ Faixa de pareceres esgotada. Acesse Configurações → Numeração para cadastrar nova faixa."
                    : "❌ Nenhuma faixa de parecer cadastrada. Acesse Configurações → Numeração.");
                  return;
                }
                const numeroParecer = String(_jPeekParecer.numero).padStart(3, "0");

                await salvarSilencioso("indeferido");
                const res = await fetch("/api/despacho-regularizacao", { credentials: "include",
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    processo: codigo, tipo: "indeferimento", numeroDespacho: numeroParecer,
                    naoConformes: motivos, observacoes: obs,
                    analises: analises.slice().sort((a,b) => a.numero_analise - b.numero_analise).filter((a) => a.numero_analise <= (analiseAtual?.numero_analise ?? 1)).map((a) => ({ numero: a.numero_analise, data: dataDaAnalise(a), ultima: a.numero_analise === 5 })), assunto_id: assuntoId,
                    data: dataEmissao,
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
                  setIndeferimentoParaReimprimir({ motivos, obs, numeroParecer, data: dataEmissao });
                  mostrarToast("✅ Documento de indeferimento gerado!");
                  await gravarTag({
                    tipo: "indeferimento",
                    numero_analise: analiseAtual?.numero_analise,
                    numero_despacho: numeroParecer,
                    data: dataEmissao,
                  });
                  setAnaliseAtual((prev: any) => prev ? { ...prev, numero_parecer: numeroParecer } : prev);

                  // Consome o número SOMENTE após a geração bem-sucedida.
                  const _numCommitParecer = parseInt(numeroParecer, 10);
                  let _commitOkParecer = false;
                  for (let _t = 1; _t <= 3 && !_commitOkParecer; _t++) {
                    try {
                      const _rc = await fetch(`/api/numeracao/proximo?tipo=parecer&processo=${encodeURIComponent(codigo)}&modo=commit&numero=${encodeURIComponent(_numCommitParecer)}&data=${encodeURIComponent(dataEmissao)}${analiseAtual?.id ? `&analise_id=${encodeURIComponent(analiseAtual.id)}&analise_numero=${analiseAtual.numero_analise}` : ""}`, { credentials: "include" });
                      if (_rc.ok || _rc.status === 409) { _commitOkParecer = true; break; }
                    } catch { /* rede — tenta de novo */ }
                    if (_t < 3) await new Promise((r) => setTimeout(r, _t * 800));
                  }
                  if (!_commitOkParecer) mostrarToast("⚠️ Indeferimento gerado, mas a numeração de parecer não foi confirmada. Confira antes de gerar o próximo.");
                }
              } finally { setGerandoDespacho(false); }
            }}
            className="w-full bg-[#EA580C] hover:bg-[#C2410C] border border-[#EA580C] text-white font-bold py-2.5 rounded-lg text-sm">
              📄 Baixar Indeferimento
            </button>
          )}
          {!indeferimentoPendente && indeferimentoParaReimprimir && (
            <button onClick={async () => {
              setGerandoDespacho(true);
              try {
                const { motivos: _m, obs: _o, numeroParecer: _np } = indeferimentoParaReimprimir;
                const res = await fetch("/api/despacho-regularizacao", { credentials: "include",
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    processo: codigo, tipo: "indeferimento", numeroDespacho: _np,
                    naoConformes: _m, observacoes: _o,
                    analises: analises.slice().sort((a,b) => a.numero_analise - b.numero_analise).filter((a) => a.numero_analise <= (analiseAtual?.numero_analise ?? 1)).map((a) => ({ numero: a.numero_analise, data: dataDaAnalise(a), ultima: a.numero_analise === 5 })), assunto_id: assuntoId,
                    data: indeferimentoParaReimprimir.data || dataEmissao,
                  }),
                });
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url; link.download = `indeferimento_${codigo}.docx`;
                  document.body.appendChild(link); link.click();
                  document.body.removeChild(link); URL.revokeObjectURL(url);
                  mostrarToast("✅ Parecer re-impresso com sucesso.");
                } else { mostrarToast("❌ Falha ao re-imprimir o parecer."); }
              } finally { setGerandoDespacho(false); }
            }} disabled={gerandoDespacho}
            className="w-full bg-[var(--bg-secondary)] hover:bg-[#FFF7ED] border border-[#EA580C] text-[#EA580C] font-medium py-2 rounded-lg text-sm transition-colors">
              🖨️ Re-imprimir Parecer {indeferimentoParaReimprimir.numeroParecer}
            </button>
          )}
          <button onClick={async () => { setDataEmissao(new Date().toLocaleDateString("pt-BR")); await salvarSilencioso(); setModalIndeferimento(true); }} disabled={salvando}
            className="w-full bg-[#FEF2F2] hover:bg-[#DC2626] hover:text-white disabled:opacity-50 border border-[#DC2626] text-[#DC2626] font-bold py-2.5 rounded-lg text-sm transition-colors">
            ❌ Indeferir
          </button>

          <div className="border-t border-[var(--border)] pt-2">
            <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Documentos</h3>

            <button
              onClick={() => window.open(`/mdp/${encodeURIComponent(codigo)}`, "_blank")}
              className="w-full mt-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] text-[var(--text-secondary)] font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
              📋 Ver Despachos (MDP)
            </button>
            <button onClick={() => abrirModalDespacho("arquivamento")} disabled={gerandoDespacho}
              className="w-full mt-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] text-[var(--text-secondary)] font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
              🗂️ Arquivamento
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
      {/* Modal Limpar Análise individual */}
      {modalLimparAnalise !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border-2 border-red-600 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-red-400 mb-2">⚠️ Zerar Análise {modalLimparAnalise}</h2>
            <p className="text-sm text-[var(--text-primary)] mb-4">
              Todos os itens, observações, fontes e aceites da <strong>Análise {modalLimparAnalise}</strong> serão apagados
              e você precisará selecionar o checklist novamente. Esta ação não pode ser desfeita.
            </p>
            <p className="text-xs text-[var(--text-muted)] mb-4">As outras análises não serão afetadas.</p>
            <div className="flex gap-3">
              <button onClick={() => setModalLimparAnalise(null)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={() => limparAnalise(modalLimparAnalise)}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-lg text-sm">
                Zerar Análise {modalLimparAnalise}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Exportar Excel */}
      {modalExportar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-4">📊 Exportar Excel</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">Escolha o que deseja exportar:</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (analiseAtual?.id)
                    window.open(`/api/mac/exportar-mac?analiseId=${analiseAtual.id}&codigo=${encodeURIComponent(codigo)}`, "_blank");
                  setModalExportar(false);
                }}
                disabled={!analiseAtual?.id}
                className="w-full bg-[var(--primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                📋 Análise {analiseAtual?.numero_analise ?? "—"} (atual)
              </button>
              <button
                onClick={() => {
                  window.open(`/api/mac/exportar-mac?todas=true&codigo=${encodeURIComponent(codigo)}`, "_blank");
                  setModalExportar(false);
                }}
                className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-strong)] text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                📚 Todas as análises ({analises.length} planilha{analises.length !== 1 ? "s" : ""})
              </button>
            </div>
            <button onClick={() => setModalExportar(false)} className="w-full mt-3 text-[var(--text-muted)] text-xs hover:underline">Cancelar</button>
          </div>
        </div>
      )}

      {/* Modal Importar Excel */}
      {modalImportar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-4">📥 Importar Excel</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">Escolha o que deseja importar:</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setImportScope("atual"); setModalImportar(false); inputImportRef.current?.click(); }}
                disabled={!analiseAtual?.id}
                className="w-full bg-[var(--primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                📋 Análise {analiseAtual?.numero_analise ?? "—"} (atual)
                <span className="block text-xs font-normal opacity-80">Arquivo com 1 planilha</span>
              </button>
              <button
                onClick={() => { setImportScope("todas"); setModalImportar(false); inputImportRef.current?.click(); }}
                className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-strong)] text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                📚 Todas as análises
                <span className="block text-xs font-normal text-[var(--text-muted)]">Arquivo com múltiplas planilhas (Analise 1, Analise 2…)</span>
              </button>
            </div>
            <button onClick={() => setModalImportar(false)} className="w-full mt-3 text-[var(--text-muted)] text-xs hover:underline">Cancelar</button>
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
            <div className="flex flex-col gap-1 mt-3">
              <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Data de emissão do parecer</label>
              <input
                type="text"
                inputMode="numeric"
                value={dataEmissao}
                onChange={(e) => setDataEmissao(mascararDataBR(e.target.value))}
                placeholder="dd/mm/aaaa"
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-3 py-2 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
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
              Há pendências antes de emitir o despacho: campos do LIP ainda em rascunho (marcados com "X") e/ou itens do checklist do MAC que a IA sugeriu e você ainda não confirmou ou rejeitou.
            </p>
            <div className="max-h-[60vh] overflow-y-auto mb-5 pr-1 space-y-5">
              {itensPendentesIA.some((i: any) => i.origem === "lip") && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)] mb-2">📋 Campos do LIP marcados como rascunho (X)</p>
                  <ul className="space-y-2">
                    {itensPendentesIA.filter((i: any) => i.origem === "lip").map((item) => (
                      <li key={item.id} className="flex items-start gap-3 bg-[var(--bg-secondary)]/60 border border-[var(--accent)]/30 rounded-xl px-4 py-3 text-sm">
                        <span className="text-[var(--accent)] mt-0.5 text-lg shrink-0">📋</span>
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="text-xs text-[var(--accent)] font-semibold uppercase tracking-wide">Aba do LIP — {item.grupo || "LIP"}</span>
                          <span className="text-[var(--text-primary)] leading-relaxed">{item.texto || item.id}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {itensPendentesIA.some((i: any) => i.origem === "mac") && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--warning)] mb-2">☑ Itens do MAC sugeridos pela IA (não confirmados)</p>
                  <ul className="space-y-2">
                    {itensPendentesIA.filter((i: any) => i.origem === "mac").map((item) => (
                      <li key={item.id} className="flex items-start gap-3 bg-[var(--bg-secondary)]/60 border border-yellow-500/20 rounded-xl px-4 py-3 text-sm">
                        <span className="text-yellow-400 mt-0.5 text-lg shrink-0">⚠</span>
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="text-xs text-[var(--warning)] font-semibold uppercase tracking-wide">Grupo do MAC — {item.grupo || "Checklist"}</span>
                          <span className="text-[var(--text-primary)] leading-relaxed">{item.texto || item.id}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => { setModalItensPendentesIA(false); await prepararNumeracao(tipoDespacho === "arquivamento" ? "arquivamento" : "despacho"); }}
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