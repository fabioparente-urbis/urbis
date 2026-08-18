"use client";

/**
 * Tela do MAC do Slot 5 — Aprovação de Projeto.
 *
 * Isolada do Slot 1: nenhum import de app/analise-regularizacao ou app/analise-aceite-sei; toda
 * a persistência passa por /api/mac/slot-05/analise, que só enxerga tipo_processo = slot_05.
 * A estrutura visual (cabeçalho, legenda, coluna de ações, índice, atalhos por grupo, aba OBS)
 * segue o padrão da tela do Slot 1 por decisão do usuário — replicada por leitura, nunca
 * importada, para que uma mudança aqui não possa atingir a Regularização/Aceite.
 *
 * O que ela faz de diferente: "PREENCHER DO LIP" lê o que a leitura da PASTA já congelou (campos
 * do LIP + texto dos PDFs guardado no MHD) e marca sozinho os grupos que não se aplicam.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Status = "conforme" | "nao_conforme" | "nao_aplica";
type Item = { id: string; texto: string; grupo: string; ordem: number; ref?: string | null };
type Analise = {
  id: string; numero_analise: number; status: string;
  itens: Record<string, Status>; fontes: Record<string, string>; observacoes: string;
};
type FiltroProposto = {
  id: string; nome: string; recomendado: boolean; justificativa: string;
  statusAlvo: Status; qtd: number; itensIds: string[];
  grupos: { grupo: string; qtd: number }[];
};
type Proposta = {
  total: number; camposPreenchidos: number;
  filtros: FiltroProposto[];
  indecisas: { regraId: string; nome: string; camposFaltando: string[] }[];
};

const ABA_OBS = "__OBS__";

const ESTILO: Record<Status, { bg: string; borda: string; texto: string; icone: string; rotulo: string }> = {
  conforme: { bg: "#ECFDF5", borda: "#059669", texto: "#059669", icone: "✅", rotulo: "Conforme" },
  nao_conforme: { bg: "#FEF2F2", borda: "#DC2626", texto: "#DC2626", icone: "❌", rotulo: "Não Conforme" },
  nao_aplica: { bg: "#EFF6FF", borda: "#2563EB", texto: "#2563EB", icone: "⬜", rotulo: "Não se Aplica" },
};
const STATUS: Status[] = ["conforme", "nao_conforme", "nao_aplica"];


function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function AnaliseAprovacaoProjeto() {
  const router = useRouter();
  const codigo = decodeURIComponent(String(useParams()?.codigo ?? ""));

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [processo, setProcesso] = useState<{
    proprietario: string | null; bairro: string | null; logradouro: string | null;
    areaTotal: string | null; numeroSei: string | null;
  } | null>(null);
  const [pendenciasLip, setPendenciasLip] = useState<string[]>([]);
  const [bannerAberto, setBannerAberto] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [itensChecklist, setItensChecklist] = useState<Item[]>([]);
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [marcas, setMarcas] = useState<Record<string, Status>>({});
  const [fontes, setFontes] = useState<Record<string, string>>({});
  const [observacoes, setObservacoes] = useState("");
  const [abaAtual, setAbaAtual] = useState<string | null>(null); // null = índice
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState("");
  const [proposta, setProposta] = useState<Proposta | null>(null);
  // "fechar" apenas ESCONDE o painel — a proposta continua em memória e volta pelo botão
  // "Ver filtros". Descartar de vez obrigaria a reavaliar tudo de novo.
  const [painelFiltros, setPainelFiltros] = useState(true);
  const [decisoes, setDecisoes] = useState<Record<string, "aceito" | "recusado">>({});
  const [lendoLip, setLendoLip] = useState(false);
  const [importando, setImportando] = useState(false);
  const [macIncompleto, setMacIncompleto] = useState(false);
  const [salvandoIncompleto, setSalvandoIncompleto] = useState(false);
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  const inputImportRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notificar = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);

  /**
   * Grava sem depender do state — usado na aplicação automática dos filtros, que roda dentro do
   * carregamento, quando `analise`/`marcas` ainda não subiram para o React.
   */
  const salvarDireto = useCallback(async (
    novasMarcas: Record<string, Status>, novasFontes: Record<string, string>,
    novasObs: string, analiseAtual: Analise | null,
  ) => {
    try {
      let alvo = analiseAtual;
      if (!alvo) {
        const r = await fetch("/api/mac/slot-05/analise", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo, itens: novasMarcas, fontes: novasFontes, observacoes: novasObs }),
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.erro ?? "falha ao criar análise");
        setAnalise(d.analise);
        setAnalises((prev) => [d.analise, ...prev]);
        return;
      }
      const r = await fetch("/api/mac/slot-05/analise", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alvo.id, itens: novasMarcas, fontes: novasFontes, observacoes: novasObs }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao salvar");
    } catch (e: any) {
      notificar(`Erro ao gravar os filtros: ${e?.message ?? e}`);
    }
  }, [codigo, notificar]);

  useEffect(() => {
    if (!codigo) return;
    let cancelado = false;
    setCarregando(true);

    // Ordem pedida pelo usuário: ao ENTRAR, primeiro descobrir quais filtros ativar (o que o
    // processo não tem), só depois olhar o que o LIP consegue marcar. As duas coisas saem da
    // mesma chamada — ela não grava nada, só propõe.
    (async () => {
      try {
        const r = await fetch(`/api/mac/slot-05/analise?codigo=${encodeURIComponent(codigo)}`, { credentials: "include" });
        const d = await r.json();
        if (cancelado) return;
        if (!d.ok) { setErro(d.erro); return; }

        setItensChecklist(d.itens ?? []);
        setProcesso(d.processo ?? null);
        setPendenciasLip(d.pendenciasLip ?? []);
        setMacIncompleto(d.macIncompleto === true);
        setAnalises(d.analises ?? []);
        const atual: Analise | undefined = (d.analises ?? [])[0];
        const marcasAtuais = atual?.itens ?? {};
        if (atual) {
          setAnalise(atual);
          setMarcas(marcasAtuais);
          setFontes(atual.fontes ?? {});
          setObservacoes(atual.observacoes ?? "");
          fetch(`/api/mac/slot-05/historico?codigo=${encodeURIComponent(codigo)}&analiseId=${atual.id}`,
            { credentials: "include" })
            .then((r) => r.json())
            .then((h) => { if (!cancelado && h.ok) setHistorico(h.historico ?? []); })
            .catch(() => null);
        }
        setCarregando(false);

        // Roda os filtros e JÁ MARCA os recomendados como "Não se Aplica" nos itens deles.
        // O analista não precisa aceitar um a um: chega com o checklist enxuto e desfaz o que
        // discordar. Nunca sobrescreve item já respondido, e o que muda é gravado na hora.
        setLendoLip(true);
        const rp = await fetch("/api/mac/slot-05/preencher-automatico", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo }),
        });
        const dp = await rp.json();
        if (cancelado) return;
        if (dp.ok && dp.filtros?.length) {
          setProposta(dp);
          const recomendados = (dp.filtros as FiltroProposto[]).filter((f) => f.recomendado);

          const novasMarcas: Record<string, Status> = { ...marcasAtuais };
          const novasFontes: Record<string, string> = { ...(atual?.fontes ?? {}) };
          const aplicadosPorFiltro: Record<string, "aceito"> = {};
          let aplicados = 0;

          for (const f of recomendados) {
            let n = 0;
            for (const id of f.itensIds) {
              if (novasMarcas[id]) continue;
              novasMarcas[id] = f.statusAlvo;
              novasFontes[id] = `Filtro "${f.nome}" — ${f.justificativa}`;
              n++;
            }
            aplicadosPorFiltro[f.id] = "aceito";
            aplicados += n;
          }

          setDecisoes(aplicadosPorFiltro);

          if (aplicados > 0) {
            const bloco =
              `━━━ FILTROS APLICADOS AUTOMATICAMENTE ━━━\n` +
              `${new Date().toLocaleString("pt-BR")} — ${aplicados} item(ns) → Não se Aplica\n` +
              recomendados.map((f) => `  • ${f.nome}: ${f.qtd} item(ns)\n    ↳ ${f.justificativa}`).join("\n");
            const novasObs = (atual?.observacoes ?? "") ? `${atual!.observacoes}\n\n${bloco}` : bloco;

            setMarcas(novasMarcas);
            setFontes(novasFontes);
            setObservacoes(novasObs);
            await salvarDireto(novasMarcas, novasFontes, novasObs, atual ?? null);
            // A gravação acabou de criar os registros da trilha — recarrega.
            if (atual) {
              fetch(`/api/mac/slot-05/historico?codigo=${encodeURIComponent(codigo)}&analiseId=${atual.id}`,
                { credentials: "include" })
                .then((rh) => rh.json())
                .then((h) => { if (!cancelado && h.ok) setHistorico(h.historico ?? []); })
                .catch(() => null);
            }
            notificar(`${aplicados} item(ns) já marcados como Não se Aplica por ${recomendados.length} filtro(s). Desfaça o que discordar.`);
          } else {
            notificar("Filtros avaliados — nada novo a retirar.");
          }
        }
      } catch (e) {
        if (!cancelado) setErro(String(e));
      } finally {
        if (!cancelado) { setCarregando(false); setLendoLip(false); }
      }
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  const grupos = useMemo(() => {
    const ordem = new Map<string, number>();
    for (const i of itensChecklist) {
      if (!ordem.has(i.grupo) || i.ordem < ordem.get(i.grupo)!) ordem.set(i.grupo, i.ordem);
    }
    return [...ordem.entries()].sort((a, b) => a[1] - b[1]).map(([g]) => g);
  }, [itensChecklist]);

  const porGrupo = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of itensChecklist) {
      if (!m.has(i.grupo)) m.set(i.grupo, []);
      m.get(i.grupo)!.push(i);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.ordem - b.ordem);
    return m;
  }, [itensChecklist]);

  const stats = useMemo(() => {
    const m: Record<string, { total: number; respondidos: number; temErro: boolean; busca: string }> = {};
    for (const g of grupos) {
      const lista = porGrupo.get(g) ?? [];
      m[g] = {
        total: lista.length,
        respondidos: lista.filter((i) => marcas[i.id]).length,
        temErro: lista.some((i) => marcas[i.id] === "nao_conforme"),
        busca: semAcento(g + " " + lista.map((i) => i.texto).join(" ")),
      };
    }
    return m;
  }, [grupos, porGrupo, marcas]);

  const totais = useMemo(() => {
    const acc = { conforme: 0, nao_conforme: 0, nao_aplica: 0, pendente: 0 };
    for (const i of itensChecklist) {
      const s = marcas[i.id];
      if (s) acc[s]++; else acc.pendente++;
    }
    return acc;
  }, [itensChecklist, marcas]);

  /** Quanto do checklist saiu por filtro automático e quanto o analista marcou à mão. */
  const origemDasRespostas = useMemo(() => {
    let porFiltro = 0, porAnalista = 0;
    for (const i of itensChecklist) {
      if (!marcas[i.id]) continue;
      if ((fontes[i.id] ?? "").startsWith("Filtro")) porFiltro++; else porAnalista++;
    }
    return { porFiltro, porAnalista };
  }, [itensChecklist, marcas, fontes]);

  async function garantirAnalise(itensIniciais?: Record<string, Status>, fontesIniciais?: Record<string, string>) {
    if (analise) return analise;
    const r = await fetch("/api/mac/slot-05/analise", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, itens: itensIniciais ?? {}, fontes: fontesIniciais ?? {} }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro ?? "falha ao criar análise");
    setAnalise(d.analise);
    setAnalises((prev) => [d.analise, ...prev]);
    return d.analise as Analise;
  }

  const salvar = useCallback(async (
    novasMarcas = marcas, novasFontes = fontes, novasObs = observacoes, silencioso = false,
  ) => {
    setSalvando(true);
    try {
      const a = await garantirAnalise(novasMarcas, novasFontes);
      const r = await fetch("/api/mac/slot-05/analise", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, itens: novasMarcas, fontes: novasFontes, observacoes: novasObs }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao salvar");
      // Recarrega a trilha: o PUT acabou de registrar as mudanças de status.
      fetch(`/api/mac/slot-05/historico?codigo=${encodeURIComponent(codigo)}&analiseId=${a.id}`,
        { credentials: "include" })
        .then((rh) => rh.json())
        .then((h) => { if (h.ok) setHistorico(h.historico ?? []); })
        .catch(() => null);
      if (!silencioso) notificar("✅ Salvo.");
    } catch (e: any) {
      notificar(`Erro ao salvar: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcas, fontes, observacoes, analise, codigo, notificar]);

  function marcar(itemId: string, status: Status) {
    setMarcas((prev) => {
      const novo = { ...prev };
      if (novo[itemId] === status) delete novo[itemId]; else novo[itemId] = status;
      return novo;
    });
  }

  function marcarGrupo(grupo: string, status: Status | null) {
    const lista = porGrupo.get(grupo) ?? [];
    setMarcas((prev) => {
      const novo = { ...prev };
      for (const i of lista) { if (status) novo[i.id] = status; else delete novo[i.id]; }
      return novo;
    });
    notificar(status
      ? `${lista.length} item(ns) → ${ESTILO[status].rotulo}.`
      : `${lista.length} item(ns) limpos.`);
  }

  async function preencherDoLip() {
    setLendoLip(true);
    setProposta(null);
    try {
      const r = await fetch("/api/mac/slot-05/preencher-automatico", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao ler o LIP");
      setProposta(d);
      setPainelFiltros(true);
      setAbaAtual(null);
      if (d.total === 0) notificar("O LIP não permitiu decidir nenhum grupo sozinho.");
    } catch (e: any) {
      notificar(`Erro: ${e?.message ?? e}`);
    } finally {
      setLendoLip(false);
    }
  }

  /** Aplica UM filtro. Nunca sobrescreve item que o analista já respondeu. */
  async function aceitarFiltro(f: FiltroProposto) {
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    let aplicados = 0;
    for (const id of f.itensIds) {
      if (novasMarcas[id]) continue;
      novasMarcas[id] = f.statusAlvo;
      novasFontes[id] = `Filtro "${f.nome}" — ${f.justificativa}`;
      aplicados++;
    }
    if (!aplicados) { notificar(`"${f.nome}": todos os itens já estavam respondidos.`); marcarDecidido(f, "aceito"); return; }

    const bloco =
      `━━━ FILTRO APLICADO: ${f.nome} ━━━\n` +
      `${new Date().toLocaleString("pt-BR")} — ${aplicados} item(ns) → ${ESTILO[f.statusAlvo].rotulo}` +
      `${f.recomendado ? "" : " (aceito contra a recomendação do sistema)"}\n` +
      `↳ ${f.justificativa}\n` +
      f.grupos.map((g) => `  • ${g.qtd}× ${g.grupo}`).join("\n");
    const novasObs = observacoes ? `${observacoes}\n\n${bloco}` : bloco;

    setMarcas(novasMarcas);
    setFontes(novasFontes);
    setObservacoes(novasObs);
    marcarDecidido(f, "aceito");
    await salvar(novasMarcas, novasFontes, novasObs);
    notificar(`"${f.nome}": ${aplicados} item(ns) saíram da análise.`);
  }

  function marcarDecidido(f: FiltroProposto, decisao: "aceito" | "recusado") {
    setDecisoes((prev) => ({ ...prev, [f.id]: decisao }));
  }

  /** Restaura a análise a partir do Excel exportado desta tela. */
  async function importarExcel(arquivo: File) {
    setImportando(true);
    try {
      const fd = new FormData();
      fd.append("codigo", codigo);
      fd.append("arquivo", arquivo);
      const r = await fetch("/api/mac/slot-05/importar", { method: "POST", credentials: "include", body: fd });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao importar");
      notificar(
        `${d.restaurados} item(ns) restaurados na análise ${d.analise}` +
        (d.foraDoModelo ? ` · ${d.foraDoModelo} ignorados (fora do checklist do Slot 5)` : ""),
      );
      window.location.reload();
    } catch (e: any) {
      notificar(`Erro ao importar: ${e?.message ?? e}`);
    } finally {
      setImportando(false);
    }
  }

  /** Zera as respostas da análise em aberto. O histórico guarda o que existia. */
  async function limparMac() {
    setConfirmarLimpar(false);
    try {
      const r = await fetch("/api/mac/slot-05/manutencao", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, acao: "limpar" }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao limpar");
      setMarcas({});
      setFontes({});
      setDecisoes({});
      notificar(`MAC limpo — ${d.limpos} item(ns) voltaram para pendente.`);
    } catch (e: any) {
      notificar(`Erro ao limpar: ${e?.message ?? e}`);
    }
  }

  async function toggleMacIncompleto() {
    const novo = !macIncompleto;
    setMacIncompleto(novo); // otimista — a pilha de processos é quem mais se beneficia
    setSalvandoIncompleto(true);
    try {
      const r = await fetch("/api/mac/slot-05/manutencao", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, acao: "mac_incompleto", valor: novo }),
      });
      const d = await r.json();
      if (!d.ok) { setMacIncompleto(!novo); notificar(`Erro: ${d.erro}`); }
    } catch (e: any) {
      setMacIncompleto(!novo);
      notificar(`Erro: ${e?.message ?? e}`);
    } finally {
      setSalvandoIncompleto(false);
    }
  }

  /**
   * Desfaz um filtro já aplicado: devolve à análise só os itens que VIERAM DELE — reconhecidos
   * pela fonte gravada. Item que o analista respondeu à mão nunca é limpo.
   */
  async function desfazerFiltro(f: FiltroProposto) {
    const assinatura = `Filtro "${f.nome}"`;
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    let devolvidos = 0;
    for (const id of f.itensIds) {
      if (!(novasFontes[id] ?? "").startsWith(assinatura)) continue;
      delete novasMarcas[id];
      delete novasFontes[id];
      devolvidos++;
    }
    if (!devolvidos) { notificar(`"${f.nome}": nada a desfazer.`); marcarDecidido(f, "recusado"); return; }

    const bloco =
      `━━━ FILTRO DESFEITO: ${f.nome} ━━━\n` +
      `${new Date().toLocaleString("pt-BR")} — ${devolvidos} item(ns) voltaram para a análise\n` +
      `↳ ${f.justificativa}`;
    const novasObs = observacoes ? `${observacoes}\n\n${bloco}` : bloco;

    setMarcas(novasMarcas);
    setFontes(novasFontes);
    setObservacoes(novasObs);
    marcarDecidido(f, "recusado");
    await salvar(novasMarcas, novasFontes, novasObs, true);
    notificar(`"${f.nome}" desfeito — ${devolvidos} item(ns) voltaram para a análise.`);
  }

  const gruposFiltrados = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return grupos;
    return grupos.filter((g) => (stats[g]?.busca ?? "").includes(q));
  }, [grupos, busca, stats]);

  if (carregando) return <p className="p-6 text-sm text-[var(--text-muted)]">carregando…</p>;
  if (erro) return (
    <div className="p-6">
      <p className="text-sm text-[var(--error)] mb-3">{erro}</p>
      <button onClick={() => router.push("/processos")} className="text-sm underline">← Processos</button>
    </div>
  );

  const itensDaAba = abaAtual && abaAtual !== ABA_OBS ? (porGrupo.get(abaAtual) ?? []) : [];

  const naoRespondidos = itensChecklist.filter((i) => !marcas[i.id]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* ─── Barra de pendências LIP/MAC — mesmo padrão do Slot 1 ─────── */}
      {(pendenciasLip.length > 0 || naoRespondidos.length > 0) && (
        <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
          <div onClick={() => setBannerAberto((v) => !v)}
            style={{ cursor: "pointer", background: "var(--error)", color: "var(--accent-fg)",
              padding: "10px 16px", fontSize: 13, fontWeight: 600,
              borderBottom: "2px solid var(--border-strong)",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              {pendenciasLip.length > 0 && `⚠ LIP: ${pendenciasLip.join(", ")}. `}
              {naoRespondidos.length > 0 && `⬜ ${naoRespondidos.length} não verificado(s) no MAC. `}
            </span>
            <span style={{ marginLeft: 12, whiteSpace: "nowrap" }}>
              {bannerAberto ? "▲ Fechar" : "▼ Ver itens"}
            </span>
          </div>
          {bannerAberto && (
            <div style={{ background: "#7f1d1d", borderBottom: "2px solid var(--border-strong)",
              padding: "8px 16px 12px", maxHeight: "40vh", overflowY: "auto" }}>
              {pendenciasLip.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 11, color: "#fca5a5", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
                    Campos LIP em rascunho
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {pendenciasLip.map((p) => (
                      <a key={p} href={`/processo/${encodeURIComponent(codigo)}?tipo=slot_05`}
                        style={{ fontSize: 12, color: "white", background: "rgba(255,255,255,0.2)",
                          borderRadius: 4, padding: "3px 10px", textDecoration: "none", fontWeight: 600 }}>
                        {p} →
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {naoRespondidos.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, color: "#fca5a5", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
                    Não verificados no MAC — {naoRespondidos.length}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {naoRespondidos.slice(0, 60).map((item) => (
                      <button key={item.id}
                        onClick={() => { setAbaAtual(item.grupo); setBannerAberto(false); }}
                        style={{ fontSize: 11, color: "white", textAlign: "left",
                          background: "rgba(255,255,255,0.15)", borderRadius: 4, padding: "4px 10px",
                          cursor: "pointer", border: "none", width: "100%" }}>
                        ❌ <strong>[{item.grupo}]</strong>{" "}
                        {item.texto.length > 100 ? item.texto.slice(0, 100) + "…" : item.texto}
                      </button>
                    ))}
                    {naoRespondidos.length > 60 && (
                      <p style={{ fontSize: 11, color: "#fca5a5" }}>
                        …e mais {naoRespondidos.length - 60} item(ns).
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-6 pt-4">
        {/* ─── Cabeçalho ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { void salvar(marcas, fontes, observacoes, true); router.push("/"); }}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              🏠 Home
            </button>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
              className="bg-red-800 hover:bg-red-700 text-red-200 px-3 py-1.5 rounded text-sm font-medium transition-colors">
              🚪 Sair
            </button>
            <button onClick={() => { void salvar(marcas, fontes, observacoes, true); router.push(`/processo/${encodeURIComponent(codigo)}?tipo=slot_05`); }}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ← LIP
            </button>
            <button onClick={() => window.open(`/processo/${encodeURIComponent(codigo)}?tipo=slot_05`, "_blank")}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors border border-[var(--border)]">
              🔍 Ver LIP ↗
            </button>
          </div>

          <div className="text-right ml-auto">
            <h1 className="text-lg font-bold">🔍 MAC — Módulo de Análises e Conformidades</h1>
            <p className="text-xs text-[var(--text-muted)]">Aprovação de Projeto</p>
            {salvando
              ? <p className="text-xs text-[var(--warning)] animate-pulse">⏳ Salvando…</p>
              : <p className="text-xs text-[var(--success)]">✓ Salvo automaticamente</p>}
            <p className="text-sm">
              Nº do Alvará (Projeto): <span className="font-mono text-[var(--accent)]">{codigo}</span>
            </p>
            {processo?.proprietario && (
              <p className="text-xs text-[var(--text-muted)]">{processo.proprietario}</p>
            )}
            {(processo?.logradouro || processo?.bairro) && (
              <p className="text-xs text-[var(--text-muted)]">
                {[processo.logradouro, processo.bairro].filter(Boolean).join(" · ")}
              </p>
            )}
            {processo?.areaTotal && (
              <p className="text-xs text-[var(--text-muted)]">Área total: {processo.areaTotal} m²</p>
            )}
            {analise && (
              <p className="text-[var(--accent)] text-xs font-bold mt-0.5">
                Análise {analise.numero_analise} {analise.status === "em_andamento" ? "em andamento" : `— ${analise.status}`}
              </p>
            )}
          </div>

          {/* Monitor de preenchimento do MAC — dentro do fluxo, nunca sobre o texto */}
          {(() => {
            const total = itensChecklist.length;
            const respondidos = total - totais.pendente;
            const pct = total ? Math.round((respondidos / total) * 100) : 0;
            const pctFiltro = total ? Math.round((origemDasRespostas.porFiltro / total) * 100) : 0;
            const cor = pct >= 100 ? "#059669" : pct >= 60 ? "#84cc16" : pct >= 30 ? "#eab308" : "#ef4444";
            const rExt = 34, rInt = 25;
            return (
              <div className="shrink-0 flex flex-col items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
                <svg width="82" height="82" viewBox="0 0 82 82">
                  <circle cx="41" cy="41" r={rExt} fill="none" stroke="var(--border)" strokeWidth="7" />
                  <circle cx="41" cy="41" r={rExt} fill="none" stroke={cor} strokeWidth="7"
                    strokeDasharray={`${(pct / 100) * 2 * Math.PI * rExt} ${2 * Math.PI * rExt}`}
                    strokeLinecap="round" transform="rotate(-90 41 41)" />
                  <circle cx="41" cy="41" r={rInt} fill="none" stroke="#2563EB" strokeWidth="5" opacity="0.45"
                    strokeDasharray={`${(pctFiltro / 100) * 2 * Math.PI * rInt} ${2 * Math.PI * rInt}`}
                    strokeLinecap="round" transform="rotate(-90 41 41)" />
                  <text x="41" y="46" textAnchor="middle" fontSize="18" fontWeight="700" fill={cor}>{pct}%</text>
                </svg>
                <span className="text-[9px] font-bold uppercase tracking-tight text-[var(--text-muted)] text-center leading-tight w-[92px]">
                  Monitor de<br />preenchimento do MAC
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] font-semibold">
                  {respondidos}/{total}
                </span>
                <span className="text-[10px] text-[#2563EB]">🎛️ {pctFiltro}% por filtro</span>
              </div>
            );
          })()}
        </div>

        {/* ─── Painel de números: contagem por status e origem ──────────── */}
        <div className="mt-3 mb-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3">
            {STATUS.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg border flex items-center justify-center text-sm shrink-0"
                  style={{ background: ESTILO[s].bg, borderColor: ESTILO[s].borda }}>
                  {ESTILO[s].icone}
                </span>
                <div className="leading-tight">
                  <p className="text-base font-bold" style={{ color: ESTILO[s].texto }}>{totais[s]}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{ESTILO[s].rotulo}</p>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg border border-[#EA580C] bg-[#FFF7ED] flex items-center justify-center text-sm shrink-0">
                ⏳
              </span>
              <div className="leading-tight">
                <p className="text-base font-bold text-[#EA580C]">{totais.pendente}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Pendentes</p>
              </div>
            </div>

            <div className="w-px self-stretch bg-[var(--border)]" />

            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg border border-[#2563EB] bg-[#EFF6FF] flex items-center justify-center text-sm shrink-0">
                🎛️
              </span>
              <div className="leading-tight">
                <p className="text-base font-bold text-[#2563EB]">{origemDasRespostas.porFiltro}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Retirados por filtro</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg border border-[#7C3AED] bg-[#F5F3FF] flex items-center justify-center text-sm shrink-0">
                ✍️
              </span>
              <div className="leading-tight">
                <p className="text-base font-bold text-[#7C3AED]">{origemDasRespostas.porAnalista}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Marcados por você</p>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <div className="leading-tight text-right">
                <p className="text-[11px] text-[var(--text-secondary)] font-semibold">
                  {itensChecklist.length} itens · {grupos.length} grupos
                </p>
                <a href="https://www.ilovepdf.com/pt/comprimir_pdf" target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                  🗜️ Comprimir PDF
                </a>
              </div>
            </div>
          </div>

          {/* barra de progresso: azul = filtro · roxo = você */}
          <div className="mt-3 h-2 w-full rounded-full bg-[var(--bg-secondary)] overflow-hidden flex">
            <div style={{ width: `${itensChecklist.length ? (origemDasRespostas.porFiltro / itensChecklist.length) * 100 : 0}%`, background: "#2563EB" }} />
            <div style={{ width: `${itensChecklist.length ? (origemDasRespostas.porAnalista / itensChecklist.length) * 100 : 0}%`, background: "#7C3AED" }} />
          </div>
        </div>

        {toast && <p className="text-xs text-[var(--accent)] mb-2">{toast}</p>}
      </div>

      {/* ─── Corpo: conteúdo + coluna de ações ──────────────────────── */}
      <div className="flex gap-4 px-6 pb-8">
        <div className="flex-1 min-w-0">
          {/* Barra para reabrir o painel quando ele está escondido */}
          {proposta && !painelFiltros && (
            <button onClick={() => setPainelFiltros(true)}
              className="w-full mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#2563EB] bg-[#EFF6FF] px-4 py-2 text-left hover:bg-[#DBEAFE] transition-colors">
              <span className="text-sm font-bold text-[#2563EB]">
                🎛️ Filtros de aplicabilidade — {proposta.filtros.filter((f) => f.recomendado).length} aplicados ·{" "}
                {proposta.filtros.filter((f) => !f.recomendado).length} disponíveis
              </span>
              <span className="text-xs font-semibold text-[#2563EB]">▼ Ver filtros</span>
            </button>
          )}

          {/* Filtros — recomendados e não recomendados, decididos um a um */}
          {proposta && painelFiltros && (
            <div className="border border-[#2563EB] rounded-lg p-4 mb-4 bg-[var(--bg-card)]">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                <p className="text-sm font-bold">🎛️ Filtros de aplicabilidade</p>
                <button onClick={() => setPainelFiltros(false)}
                  className="text-[11px] font-semibold text-[#2563EB] hover:underline">▲ esconder</button>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-3">
                Lido de {proposta.camposPreenchidos} campos do LIP e do texto dos documentos da pasta.
                Os <b>recomendados já marcaram Não se Aplica</b> nos itens deles — use
                <b> Desfazer</b> no que discordar. Item que você respondeu à mão nunca é tocado.
              </p>

              {(["recomendados", "naoRecomendados"] as const).map((faixa) => {
                const lista = proposta.filtros.filter((f) =>
                  faixa === "recomendados" ? f.recomendado : !f.recomendado);
                if (!lista.length) return null;
                const recomendado = faixa === "recomendados";
                return (
                  <div key={faixa} className="mb-4">
                    <p className="text-[10px] uppercase font-bold mb-1"
                      style={{ color: recomendado ? "#16A34A" : "#EA580C" }}>
                      {recomendado
                        ? `✔ Aplicados — o processo não tem estes temas (${lista.length})`
                        : `✖ Não recomendados — o tema aparece no processo (${lista.length}) · aplique se discordar`}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {lista.map((f) => {
                        const decisao = decisoes[f.id];
                        return (
                          <div key={f.id}
                            className="border rounded-lg px-3 py-2 flex items-start gap-3"
                            style={{
                              borderColor: decisao === "aceito" ? "#16A34A"
                                : decisao === "recusado" ? "#94A3B8" : "var(--border)",
                              opacity: decisao ? 0.65 : 1,
                            }}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white"
                                  style={{ background: recomendado ? "var(--primary)" : "#94A3B8" }}>
                                  {f.nome}
                                </span>
                                <span className="text-[11px] text-[var(--text-secondary)]">
                                  {f.qtd} item(ns) → {ESTILO[f.statusAlvo].rotulo}
                                </span>
                                {decisao === "aceito" && (
                                  <span className="text-[10px] font-bold" style={{ color: "#16A34A" }}>
                                    ✓ aplicado — itens marcados Não se Aplica
                                  </span>
                                )}
                                {decisao === "recusado" && (
                                  <span className="text-[10px] font-bold" style={{ color: "#64748B" }}>
                                    ✗ fora — itens seguem na análise
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">↳ {f.justificativa}</p>
                              {!!f.grupos.length && (
                                <p className="text-[10px] text-[var(--text-muted)]">
                                  {f.grupos.map((g) => `${g.qtd}× ${g.grupo}`).join(" · ")}
                                </p>
                              )}
                              {f.grupos.length > 1 && (
                                <p className="text-[10px] text-[var(--text-muted)] italic">
                                  alcança {f.grupos.length} grupo(s) — inclui itens achados pelo texto
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {decisao === "aceito" ? (
                                <button onClick={() => desfazerFiltro(f)}
                                  className="px-2 py-1 rounded text-[11px] font-bold border transition-colors"
                                  style={{ background: "#FEF2F2", borderColor: "#DC2626", color: "#DC2626" }}>
                                  ↩ Desfazer
                                </button>
                              ) : (
                                <button onClick={() => aceitarFiltro(f)} disabled={f.qtd === 0}
                                  className="px-2 py-1 rounded text-[11px] font-bold border transition-colors disabled:opacity-40"
                                  style={{ background: "#ECFDF5", borderColor: "#059669", color: "#059669" }}>
                                  ⬜ Aplicar N/A
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {!!proposta.indecisas.length && (
                <div>
                  <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                    Sem dado para decidir ({proposta.indecisas.length})
                  </p>
                  {proposta.indecisas.map((i) => (
                    <p key={i.regraId} className="text-[10px] text-[var(--text-secondary)]">
                      • {i.nome} — {i.camposFaltando.join(", ") || "—"}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ÍNDICE */}
          {abaAtual === null && (
            <>
              <div className="flex gap-2 flex-wrap mb-3">
                <input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Procurar no checklist — ex.: recuo, acessibilidade, calçada"
                  className="flex-1 min-w-[260px] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                {busca && (
                  <button onClick={() => setBusca("")}
                    className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-sm">
                    Limpar
                  </button>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mb-3">
                Itens do checklist — {gruposFiltrados.length} de {grupos.length} grupos
              </p>
              <div className="flex flex-col gap-1.5">
                {gruposFiltrados.map((grupo) => {
                  const st = stats[grupo] ?? { total: 0, respondidos: 0, temErro: false };
                  const completo = st.respondidos === st.total && st.total > 0;
                  return (
                    <button key={grupo} onClick={() => { void salvar(marcas, fontes, observacoes, true); setAbaAtual(grupo); }}
                      className="flex items-center gap-3 text-left px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] hover:border-[var(--accent)] transition-colors">
                      <span className="text-xs text-[var(--text-muted)] font-mono w-7 shrink-0">
                        {grupos.indexOf(grupo) + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium">{grupo}</span>
                      {st.temErro && <span className="w-2.5 h-2.5 bg-[var(--error)] rounded-full shrink-0" />}
                      <span className={`text-xs shrink-0 ${completo ? "text-[#059669]" : "text-[var(--text-muted)]"}`}>
                        {st.respondidos}/{st.total}
                      </span>
                    </button>
                  );
                })}
                <button onClick={() => setAbaAtual(ABA_OBS)}
                  className="flex items-center gap-3 text-left px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] hover:border-[var(--accent)] transition-colors">
                  <span className="text-xs text-[var(--text-muted)] font-mono w-7 shrink-0">📝</span>
                  <span className="flex-1 text-sm font-medium">OBS</span>
                </button>
              </div>
            </>
          )}

          {/* ABA OBS */}
          {abaAtual === ABA_OBS && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setAbaAtual(null)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] shadow-sm transition-colors">
                  <span aria-hidden>📑</span> Índice
                </button>
                <span className="font-bold">📝 OBS</span>
              </div>
              <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={22}
                placeholder="Observações do MAC — o pré-preenchimento pelo LIP registra aqui o que marcou e por quê."
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-vertical" />
              <button onClick={() => salvar()}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] px-4 py-2 rounded text-sm font-medium w-fit">
                💾 Salvar Observações
              </button>

              {/* Histórico completo da análise */}
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
                  🕐 Histórico de alterações — {historico.length} registro(s)
                </p>
                {!historico.length ? (
                  <p className="text-xs text-[var(--text-muted)]">Nenhuma alteração registrada ainda.</p>
                ) : (
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
                    {historico.map((h: any, i: number) => (
                      <div key={h.id ?? i}
                        className="border-t border-[var(--border)] first:border-t-0 px-3 py-1.5 text-[11px] flex items-start gap-2">
                        <span className="text-[var(--text-muted)] shrink-0 w-[110px]">
                          {h.criado_em ? new Date(h.criado_em).toLocaleString("pt-BR") : "—"}
                        </span>
                        <span className="shrink-0 w-[150px] truncate text-[var(--text-secondary)]" title={h.aba ?? ""}>
                          {h.aba ?? "—"}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[var(--text-secondary)]" title={h.item_texto ?? ""}>
                          {h.item_texto ?? "—"}
                        </span>
                        <span className="shrink-0 font-semibold"
                          style={{ color: ESTILO[h.status_novo as Status]?.texto ?? "var(--text-muted)" }}>
                          {h.status_anterior ? `${h.status_anterior} → ` : ""}
                          {ESTILO[h.status_novo as Status]?.rotulo ?? h.status_novo}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ITENS DE UM GRUPO */}
          {abaAtual !== null && abaAtual !== ABA_OBS && (
            <>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <button onClick={() => { void salvar(marcas, fontes, observacoes, true); setAbaAtual(null); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] shadow-sm transition-colors">
                  <span aria-hidden>📑</span> Índice
                </button>
                <span className="font-bold truncate">{abaAtual}</span>
              </div>
              <div className="flex flex-wrap gap-2 pb-2">
                {STATUS.map((s) => (
                  <button key={s} onClick={() => marcarGrupo(abaAtual, s)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:text-white"
                    style={{ background: ESTILO[s].bg, borderColor: ESTILO[s].borda, color: ESTILO[s].texto }}>
                    {ESTILO[s].icone} Todos {ESTILO[s].rotulo}
                  </button>
                ))}
                <button onClick={() => marcarGrupo(abaAtual, null)}
                  className="flex items-center gap-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                  🧹 Limpar Aba
                </button>
                <span className="text-xs text-[var(--text-muted)] self-center">
                  {stats[abaAtual]?.respondidos ?? 0}/{stats[abaAtual]?.total ?? 0} respondidos
                </span>
              </div>

              <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-card)]">
                {itensDaAba.map((it) => (
                  <div key={it.id} className="border-t border-[var(--border)] first:border-t-0 px-3 py-2 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs whitespace-pre-wrap">{it.texto}</p>
                      {fontes[it.id] && (
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">🔎 {fontes[it.id]}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {STATUS.map((s) => (
                        <button key={s} onClick={() => marcar(it.id, s)} title={ESTILO[s].rotulo}
                          className="w-8 h-8 rounded border text-sm font-bold transition-colors"
                          style={marcas[it.id] === s
                            ? { background: ESTILO[s].borda, borderColor: ESTILO[s].borda, color: "white" }
                            : { background: ESTILO[s].bg, borderColor: ESTILO[s].borda, color: ESTILO[s].texto, opacity: 0.45 }}>
                          {ESTILO[s].icone}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Navegação entre grupos */}
              <div className="flex justify-between mt-3">
                <button
                  onClick={() => { const i = grupos.indexOf(abaAtual); if (i > 0) { void salvar(marcas, fontes, observacoes, true); setAbaAtual(grupos[i - 1]); } }}
                  disabled={grupos.indexOf(abaAtual) === 0}
                  className="px-3 py-1.5 rounded text-sm bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40">
                  ← Anterior
                </button>
                <button
                  onClick={() => { const i = grupos.indexOf(abaAtual); if (i < grupos.length - 1) { void salvar(marcas, fontes, observacoes, true); setAbaAtual(grupos[i + 1]); } }}
                  disabled={grupos.indexOf(abaAtual) === grupos.length - 1}
                  className="px-3 py-1.5 rounded text-sm bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40">
                  Próximo →
                </button>
              </div>

              {/* Histórico de alterações — mesma tabela mac_historico do Slot 1 */}
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
                  🕐 Histórico de alterações
                </p>
                {(() => {
                  const idsDaAba = new Set(itensDaAba.map((i) => i.id));
                  const doGrupo = historico.filter((h: any) => idsDaAba.has(h.checklist_item_id));
                  if (!doGrupo.length) {
                    return <p className="text-xs text-[var(--text-muted)]">Nenhuma alteração registrada ainda.</p>;
                  }
                  return (
                    <div className="flex flex-col gap-1">
                      {doGrupo.slice(0, 40).map((h: any, i: number) => (
                        <div key={h.id ?? i} className="text-[11px] text-[var(--text-secondary)] border-l-2 border-[var(--border)] pl-2">
                          <span className="text-[var(--text-muted)]">
                            {h.criado_em ? new Date(h.criado_em).toLocaleString("pt-BR") : ""}
                          </span>{" "}
                          {h.analista_nome && <span className="font-semibold">{h.analista_nome}</span>}{" "}
                          <span>{h.status_anterior ?? "sem resposta"} → <b>{h.status_novo}</b></span>
                          {h.item_texto && (
                            <p className="text-[10px] text-[var(--text-muted)] truncate">{h.item_texto}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        {/* ─── Coluna de AÇÕES ─────────────────────────────────────── */}
        <aside className="w-56 shrink-0 flex flex-col gap-2">
          <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Ações</p>

          {[1, 2, 3, 4, 5].map((n) => {
            const existente = analises.find((a) => a.numero_analise === n);
            const ativa = analise?.numero_analise === n;
            return (
              <button key={n}
                onClick={() => {
                  if (!existente) { notificar(`Análise ${n} ainda não existe.`); return; }
                  setAnalise(existente);
                  setMarcas(existente.itens ?? {});
                  setFontes(existente.fontes ?? {});
                  setObservacoes(existente.observacoes ?? "");
                  setAbaAtual(null);
                }}
                className={`w-full py-2 rounded-lg text-sm font-bold border transition-colors ${
                  ativa ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                    : existente ? "bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)]"
                      : "bg-[var(--bg-secondary)] text-[var(--text-muted)] border-dashed border-[var(--border)]"}`}>
                📋 Análise {n}
              </button>
            );
          })}

          <button onClick={() => { void salvar(marcas, fontes, observacoes, true); router.push(`/logradouro/${encodeURIComponent(codigo)}`); }}
            className="w-full py-2 rounded-lg text-sm font-bold border bg-[var(--bg-secondary)] border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] mt-1">
            🗺️ Via / Logradouro
          </button>
          <button onClick={() => router.push("/admin/checklists")}
            className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm transition-colors">
            📋 Gerenciar MAC
          </button>
          <button onClick={() => router.push("/admin/filtros-slot5")}
            className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm transition-colors"
            title="Criar e editar os filtros que tiram itens da análise">
            🎛️ Gerenciar Filtros
          </button>

          <button
            onClick={() => {
              if (proposta) { setPainelFiltros(true); setAbaAtual(null); notificar("Filtros abertos."); }
              else void preencherDoLip();
            }}
            disabled={lendoLip}
            className="w-full bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white disabled:opacity-50 border border-[#2563EB] text-[#2563EB] font-bold py-2.5 rounded-lg text-sm transition-colors"
            title="Mostra os filtros de aplicabilidade lidos do LIP e dos documentos da pasta">
            {lendoLip ? "⏳ Lendo…" : proposta ? "🎛️ Ver filtros" : "📁 PREENCHER DO LIP"}
          </button>
          {proposta && (
            <button onClick={preencherDoLip} disabled={lendoLip}
              className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] py-1.5 rounded-lg text-xs transition-colors"
              title="Reavalia as condições contra o LIP e os documentos">
              🔄 Reavaliar filtros
            </button>
          )}

          <button onClick={() => salvar()} disabled={salvando}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] font-bold py-2.5 rounded-lg text-sm transition-colors">
            {salvando ? "Salvando…" : "💾 Salvar"}
          </button>

          <button
            onClick={async () => {
              const novas = { ...marcas };
              for (const i of itensChecklist) if (!novas[i.id]) novas[i.id] = "conforme";
              setMarcas(novas);
              await salvar(novas, fontes, observacoes);
              notificar("Itens pendentes marcados como Conforme.");
            }}
            className="w-full bg-[#ECFDF5] hover:bg-[#059669] hover:text-white border border-[#059669] text-[#059669] font-bold py-2.5 rounded-lg text-sm transition-colors"
            title="Marca como Conforme todo item ainda sem resposta">
            ✅ Concluir pendentes
          </button>

          {/* ── Documentos do Slot 5 ────────────────────────────────────
              Os botões existem no lugar certo, mas a GERAÇÃO ainda não foi
              construída. Cada slot é independente: quando forem feitos, serão
              rotas próprias do Slot 5 — nunca reuso das do Slot 1. */}
          <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mt-3">
            Documentos
          </p>

          {[
            { rotulo: "📨 Despacho Interno", cor: "#2563EB" },
            { rotulo: "📄 Despacho", cor: "#2563EB" },
            { rotulo: "📑 Laudo", cor: "#059669" },
            { rotulo: "⛔ Indeferimento", cor: "#DC2626" },
          ].map((b) => (
            <button key={b.rotulo}
              onClick={() => notificar(`"${b.rotulo.replace(/^\S+\s/, "")}" do Slot 5 ainda não foi construído.`)}
              title="Ainda não construído para o Slot 5 — será rota própria, independente do Slot 1"
              className="w-full font-bold py-2.5 rounded-lg text-sm border border-dashed hover:bg-[var(--bg-card-hover)] transition-colors"
              style={{ borderColor: b.cor, color: b.cor }}>
              {b.rotulo}
            </button>
          ))}

          <p className="text-[10px] text-[var(--text-muted)] leading-snug mt-1">
            Tracejado = ainda não gera documento. Cada um será rota própria do Slot 5,
            independente do Slot 1.
          </p>

          {/* ── Backup e manutenção ───────────────────────────────────── */}
          <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mt-3">
            Backup
          </p>
          <a href={`/api/mac/slot-05/exportar?codigo=${encodeURIComponent(codigo)}`} download
            className="w-full text-center bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold py-2 rounded-lg text-sm transition-colors"
            title="Baixa todos os itens com status, filtro que marcou e observações — dá para restaurar tudo">
            📊 Exportar Excel
          </a>
          <button type="button" onClick={() => inputImportRef.current?.click()} disabled={importando}
            className="w-full bg-[var(--primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold py-2 rounded-lg text-sm transition-colors"
            title="Restaura a análise a partir de um Excel exportado desta tela">
            {importando ? "⏳ Importando…" : "📥 Importar Excel"}
          </button>
          <input ref={inputImportRef} type="file" accept=".xlsx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importarExcel(f); e.target.value = ""; }} />

          <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mt-3">
            Manutenção
          </p>
          <button type="button" onClick={() => setConfirmarLimpar(true)}
            className="w-full bg-[var(--error-bg)] hover:bg-[var(--error)] hover:text-white text-[var(--error)] px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            🗑️ Limpar MAC
          </button>
          <button type="button" onClick={toggleMacIncompleto} disabled={salvandoIncompleto}
            className={`w-full px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
              macIncompleto
                ? "bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]"
                : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"}`}>
            {macIncompleto ? "🔴 MAC não concluído" : "⚪ Marcar MAC não concluído"}
          </button>
        </aside>
      </div>

      {confirmarLimpar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--error)] rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-[var(--error)] font-bold text-lg mb-3">🗑️ Limpar o MAC?</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Apaga as <b>{itensChecklist.length - totais.pendente} resposta(s)</b> desta análise —
              inclusive o que os filtros marcaram. Os itens voltam todos para pendente.
            </p>
            <p className="text-[var(--text-muted)] text-xs mb-5">
              A análise não é excluída e o histórico guarda o que existia. Exporte o Excel antes se
              quiser poder restaurar exatamente como está.
            </p>
            <div className="flex gap-3">
              <button onClick={limparMac}
                className="flex-1 bg-[var(--error)] hover:opacity-90 text-white font-bold py-2 rounded-lg text-sm">
                Limpar mesmo assim
              </button>
              <button onClick={() => setConfirmarLimpar(false)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
