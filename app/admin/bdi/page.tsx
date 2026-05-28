"use client";
import React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Config = { chave: string; valor: string; descricao: string };
type Lei = { id: string; titulo: string; tipo: string; numero: string; url_pdf: string; resumo: string; tags: string[]; ativo: boolean };
type Historico = { id: string; usuario_nome: string; linha: string; mensagem_usuario: string; resposta_urbi: string; criado_em: string };
type Stats = {
  resumo: { total_processos: number; total_analistas: number; area_total_construida: number; area_media: number; total_retornos: number; total_bairros: number };
  por_assunto: { assunto: string; total_processos: number; area_total: number; area_media: number; total_retornos: number; porte: string; count_porte: number }[];
  por_analista: { analista: string; gerencia: string; total_processos: number; area_total: number; tempo_medio_horas: number }[];
  por_bairro: { bairro: string; total_processos: number; area_total: number; assunto: string }[];
  produtividade: { analista: string; gerencia: string; mes: number; ano: number; tipo_processo: string; total_despachos: number; total_pontos: number }[];
  analistas: { analista: string; gerencia: string; total_processos: number; area_total: number; tempo_medio_horas: number; total_retornos: number; pontos_totais_mrp: number; despachos_mrp: number; assunto: string }[];
  autores: { autor: string; registro: string; tipo_registro: string; total_processos: number; total_analises: number; total_nao_conformidades: number; erros_por_processo: number; assunto: string; status_processo: string }[];
  nao_conformidades: { grupo: string; texto: string; ref: string; assunto: string; frequencia: number }[];
};

const MESES = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function BDIPage() {
  const router = useRouter();
  const [aba, setAba] = useState<"painel"|"estatisticas"|"capacidades"|"legislacao"|"historico">("painel");
  const [config, setConfig] = useState<Config[]>([]);
  const [leis, setLeis] = useState<Lei[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [sessoes, setSessoes] = useState<any[]>([]);
  const [loadingSessoes, setLoadingSessoes] = useState(false);
  const [filtroAssunto, setFiltroAssunto] = useState("Todos");
  const [subAba, setSubAba] = useState<"resumo"|"analistas"|"autores"|"conformidade"|"bairros"|"sessoes">("resumo");
  const [toast, setToast] = useState("");
  const [modalLei, setModalLei] = useState(false);
  const [editandoLei, setEditandoLei] = useState<Lei | null>(null);
  const [form, setForm] = useState({ titulo: "", tipo: "lei", numero: "", url_pdf: "", resumo: "", tags: "" });

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      if (!json.ok || json.data?.perfil !== "Administrador") { router.push("/"); return; }
      carregarTudo();
    })();
  }, []);

  useEffect(() => {
    if (aba === "estatisticas" && !stats) carregarStats();
  }, [aba]);

  async function carregarSessoes() {
    if (loadingSessoes) return;
    setLoadingSessoes(true);
    const res = await fetch("/api/sessao/stats");
    const json = await res.json();
    if (json.ok) setSessoes(json.data ?? []);
    setLoadingSessoes(false);
  }
  async function carregarTudo() {
    const [r1, r2, r3] = await Promise.all([
      fetch("/api/urbi/config").then(r => r.json()),
      fetch("/api/urbi/legislacao").then(r => r.json()),
      fetch("/api/urbi/historico?limit=100").then(r => r.json()),
    ]);
    if (r1.ok) setConfig(r1.data);
    if (r2.ok) setLeis(r2.data);
    if (r3.ok) setHistorico(r3.data);
  }

  async function carregarStats() {
    setLoadingStats(true);
    try {
      const r = await fetch("/api/bdi/stats");
      const j = await r.json();
      if (j.ok) setStats(j);
    } finally {
      setLoadingStats(false);
    }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }
  function getConfig(chave: string) { return config.find(c => c.chave === chave)?.valor ?? ""; }

  async function toggleConfig(chave: string) {
    const atual = getConfig(chave);
    const novo = atual === "true" ? "false" : "true";
    await fetch("/api/urbi/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave, valor: novo }) });
    setConfig(c => c.map(x => x.chave === chave ? { ...x, valor: novo } : x));
    showToast("Configuração atualizada.");
  }

  async function salvarLei() {
    const payload = { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean), ativo: true };
    if (editandoLei) {
      await fetch("/api/urbi/legislacao", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editandoLei.id, ...payload }) });
      showToast("Lei atualizada.");
    } else {
      await fetch("/api/urbi/legislacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      showToast("Lei cadastrada.");
    }
    setModalLei(false); setEditandoLei(null);
    setForm({ titulo: "", tipo: "lei", numero: "", url_pdf: "", resumo: "", tags: "" });
    carregarTudo();
  }

  async function toggleLei(lei: Lei) {
    await fetch("/api/urbi/legislacao", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: lei.id, ativo: !lei.ativo }) });
    carregarTudo();
  }

  async function deletarLei(id: string) {
    if (!confirm("Remover esta lei?")) return;
    await fetch("/api/urbi/legislacao", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    showToast("Lei removida."); carregarTudo();
  }

  function abrirEdicao(lei: Lei) {
    setEditandoLei(lei);
    setForm({ titulo: lei.titulo, tipo: lei.tipo, numero: lei.numero ?? "", url_pdf: lei.url_pdf ?? "", resumo: lei.resumo ?? "", tags: (lei.tags ?? []).join(", ") });
    setModalLei(true);
  }

  const linhas = [
    { chave: "linha_consultor", label: "Consultor Jurídico", desc: "Responde dúvidas sobre legislação urbanística de Goiânia", emoji: "⚖️" },
    { chave: "linha_calculadora", label: "Calculadora", desc: "Cálculos de áreas, recuos, permeabilidade e volumetria", emoji: "🧮" },
    { chave: "linha_correio", label: "Correio", desc: "Mensageria interna entre analistas (em desenvolvimento)", emoji: "📬" },
    { chave: "linha_co_analista", label: "Co-Analista", desc: "Auditor preditivo baseado em padrões históricos (futuro)", emoji: "🤖" },
  ];

  const totalConversas = historico.length;
  const leiAtivas = leis.filter(l => l.ativo).length;
  const urbiAtivo = getConfig("urbi_ativo") === "true";

  // Stats filtradas por assunto
  const assuntosDisponiveis = ["Todos", ...Array.from(new Set((stats?.por_assunto ?? []).map(x => x.assunto)))];
  const porBairroFiltrado = filtroAssunto === "Todos"
    ? stats?.por_bairro ?? []
    : (stats?.por_bairro ?? []).filter(b => b.assunto === filtroAssunto);
  const porAssuntoAgrupado = (stats?.por_assunto ?? []).reduce((acc, row) => {
    if (!acc[row.assunto]) acc[row.assunto] = { assunto: row.assunto, total_processos: 0, area_total: 0, total_retornos: 0 };
    acc[row.assunto].total_processos += Number(row.total_processos);
    acc[row.assunto].area_total += Number(row.area_total);
    acc[row.assunto].total_retornos += Number(row.total_retornos);
    return acc;
  }, {} as Record<string, { assunto: string; total_processos: number; area_total: number; total_retornos: number }>);

  const S: Record<string, any> = {
    page: { background: "#0a0a0f", minHeight: "100vh", fontFamily: "'JetBrains Mono', monospace", color: "#e2e8f0" },
    header: { borderBottom: "1px solid #d946ef33", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d0d14" },
    abas: { display: "flex", gap: 4, padding: "16px 28px 0", borderBottom: "1px solid #ffffff11", overflowX: "auto" as const },
    aba: (ativa: boolean): React.CSSProperties => ({ padding: "8px 18px", fontSize: 11, letterSpacing: 2, cursor: "pointer", border: "none", background: "transparent", color: ativa ? "#d946ef" : "#ffffff44", borderBottom: ativa ? "2px solid #d946ef" : "2px solid transparent", transition: "all 0.15s", whiteSpace: "nowrap" as const }),
    content: { padding: "24px 28px" },
    card: { background: "#0d0d14", border: "1px solid #ffffff11", borderRadius: 8, padding: 20, marginBottom: 16 },
    label: { color: "#ffffff44", fontSize: 10, letterSpacing: 2, marginBottom: 6 },
    valor: { color: "#f0f0f0", fontSize: 22, fontWeight: 700 },
    toggle: (ativo: boolean): React.CSSProperties => ({ width: 42, height: 22, borderRadius: 11, background: ativo ? "#d946ef" : "#ffffff22", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }),
    input: { background: "#0a0a0f", border: "1px solid #ffffff22", borderRadius: 6, color: "#f0f0f0", padding: "8px 12px", fontSize: 12, fontFamily: "inherit", width: "100%", outline: "none", marginBottom: 10 },
    btn: (cor: string): React.CSSProperties => ({ background: cor + "22", border: `1px solid ${cor}55`, color: cor, padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: 1 }),
    th: { color: "#ffffff44", fontSize: 10, letterSpacing: 2, padding: "8px 12px", textAlign: "left" as const, borderBottom: "1px solid #ffffff11" },
    td: { color: "#f0f0f0", fontSize: 12, padding: "8px 12px", borderBottom: "1px solid #ffffff08" },
    badge: (cor: string): React.CSSProperties => ({ background: cor + "22", border: `1px solid ${cor}44`, color: cor, fontSize: 9, padding: "2px 8px", borderRadius: 10, letterSpacing: 1 }),
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/urbi/urbi-botao.jpg" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ color: "#d946ef", fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>BDI — BANCO DE DADOS PARA INTELIGÊNCIA</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: urbiAtivo ? "#22c55e" : "#ef4444", boxShadow: `0 0 6px ${urbiAtivo ? "#22c55e" : "#ef4444"}` }} />
          <span style={{ color: "#ffffff44", fontSize: 11 }}>URBI {urbiAtivo ? "ATIVO" : "INATIVO"}</span>
          <button onClick={() => router.push("/")} style={S.btn("#ffffff66")}>← HOME</button>
        </div>
      </div>

      <div style={S.abas}>
        {(["painel","estatisticas","capacidades","legislacao","historico"] as const).map(a => (
          <button key={a} style={S.aba(aba === a)} onClick={() => setAba(a)}>
            {{ painel: "📊 PAINEL", estatisticas: "🧠 ESTATÍSTICAS", capacidades: "⚙️ CAPACIDADES", legislacao: "📚 LEGISLAÇÃO", historico: "🕘 HISTÓRICO" }[a]}
          </button>
        ))}
      </div>

      <div style={S.content}>

        {aba === "painel" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              {[
                { label: "CONVERSAS TOTAIS", valor: totalConversas },
                { label: "LEIS ATIVAS", valor: leiAtivas },
                { label: "LEIS CADASTRADAS", valor: leis.length },
                { label: "LINHAS ATIVAS", valor: linhas.filter(l => getConfig(l.chave) === "true").length },
              ].map(({ label, valor }) => (
                <div key={label} style={S.card}>
                  <div style={S.label}>{label}</div>
                  <div style={S.valor}>{valor}</div>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={S.label}>URBI GLOBAL</div>
                  <div style={{ color: "#f0f0f0", fontSize: 14 }}>Liga ou desliga o URBI para todos os analistas</div>
                </div>
                <button style={S.toggle(urbiAtivo)} onClick={() => toggleConfig("urbi_ativo")} />
              </div>
            </div>
          </div>
        )}

        {aba === "estatisticas" && (
          <div>
            {loadingStats && <div style={{ color: "#ffffff44", fontSize: 12, textAlign: "center", padding: 40 }}>Carregando estatísticas…</div>}
            {!loadingStats && stats && (
              <>
                {/* Sub-abas de estatísticas */}
                {(() => {
                  const subAbas: [string, string][] = [["resumo","📊 Resumo"],["analistas","👤 Analistas"],["autores","✍️ Autores"],["conformidade","⚠️ Conformidade"],["bairros","📍 Bairros"],["sessoes","🕑 Sessões"]];
                  return (
                    <>
                      <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid #ffffff11", paddingBottom:0 }}>
                        {subAbas.map(([k,l]) => (
                          <button key={k} onClick={() => { setSubAba(k as any); if (k === 'sessoes') carregarSessoes(); }}
                            style={{ padding:"6px 14px", fontSize:10, letterSpacing:2, cursor:"pointer", border:"none", background:"transparent",
                              color: subAba===k ? "#d946ef" : "#ffffff44", borderBottom: subAba===k ? "2px solid #d946ef" : "2px solid transparent" }}>
                            {l}
                          </button>
                        ))}
                      </div>

                {subAba === "resumo" && <>
                {/* Resumo geral */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 24 }}>
                  {[
                    { label: "PROCESSOS", valor: stats.resumo.total_processos ?? 0 },
                    { label: "ANALISTAS", valor: stats.resumo.total_analistas ?? 0 },
                    { label: "BAIRROS", valor: stats.resumo.total_bairros ?? 0 },
                    { label: "RETORNOS", valor: stats.resumo.total_retornos ?? 0 },
                    { label: "ÁREA TOTAL (m²)", valor: Number(stats.resumo.area_total_construida ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) },
                    { label: "ÁREA MÉDIA (m²)", valor: Number(stats.resumo.area_media ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) },
                  ].map(({ label, valor }) => (
                    <div key={label} style={{ ...S.card, marginBottom: 0 }}>
                      <div style={S.label}>{label}</div>
                      <div style={{ ...S.valor, fontSize: 18 }}>{valor}</div>
                    </div>
                  ))}
                </div>

                {/* Por assunto */}
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom: 14 }}>PROCESSOS POR ASSUNTO</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["ASSUNTO","PROCESSOS","ÁREA TOTAL (m²)","ÁREA MÉDIA (m²)","RETORNOS"].map(h => <th key={h} style={S.th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(porAssuntoAgrupado).map(row => (
                        <tr key={row.assunto}>
                          <td style={S.td}><span style={S.badge("#d946ef")}>{row.assunto}</span></td>
                          <td style={S.td}>{row.total_processos}</td>
                          <td style={S.td}>{Number(row.area_total).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                          <td style={S.td}>{row.total_processos > 0 ? Number(row.area_total / row.total_processos).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—"}</td>
                          <td style={S.td}>{row.total_retornos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Por analista */}
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom: 14 }}>PRODUTIVIDADE POR ANALISTA</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["ANALISTA","GERÊNCIA","PROCESSOS","ÁREA TOTAL (m²)","T. MÉDIO (h)"].map(h => <th key={h} style={S.th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.por_analista.map(row => (
                        <tr key={row.analista}>
                          <td style={S.td}>{row.analista}</td>
                          <td style={S.td}><span style={S.badge("#06b6d4")}>{row.gerencia ?? "—"}</span></td>
                          <td style={S.td}>{row.total_processos}</td>
                          <td style={S.td}>{Number(row.area_total).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                          <td style={S.td}>{Number(row.tempo_medio_horas).toFixed(1)}</td>
                        </tr>
                      ))}
                      {stats.por_analista.length === 0 && <tr><td colSpan={5} style={{ ...S.td, color: "#ffffff33", textAlign: "center" }}>Sem dados</td></tr>}
                    </tbody>
                  </table>
                </div>

                {/* Top bairros */}
                <div style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={S.label}>TOP BAIRROS</div>
                    <select value={filtroAssunto} onChange={e => setFiltroAssunto(e.target.value)}
                      style={{ background: "#0a0a0f", border: "1px solid #ffffff22", borderRadius: 4, color: "#f0f0f0", padding: "4px 10px", fontSize: 11, fontFamily: "inherit" }}>
                      {assuntosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["BAIRRO","PROCESSOS","ÁREA TOTAL (m²)","ASSUNTO"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {porBairroFiltrado.map(row => (
                        <tr key={row.bairro + row.assunto}>
                          <td style={S.td}>{row.bairro}</td>
                          <td style={S.td}>{row.total_processos}</td>
                          <td style={S.td}>{Number(row.area_total).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                          <td style={S.td}><span style={S.badge("#f59e0b")}>{row.assunto}</span></td>
                        </tr>
                      ))}
                      {porBairroFiltrado.length === 0 && <tr><td colSpan={4} style={{ ...S.td, color: "#ffffff33", textAlign: "center" }}>Sem dados</td></tr>}
                    </tbody>
                  </table>
                </div>

                {/* Produtividade MRP */}
                <div style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={S.label}>PRODUTIVIDADE MRP (DESPACHOS)</div>
                    <button onClick={carregarStats} style={S.btn("#d946ef")}>↻ Atualizar</button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["ANALISTA","PERÍODO","TIPO","DESPACHOS","PONTOS"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {stats.produtividade.slice(0, 30).map((row, i) => (
                        <tr key={i}>
                          <td style={S.td}>{row.analista}</td>
                          <td style={S.td}>{MESES[row.mes]}/{row.ano}</td>
                          <td style={S.td}><span style={S.badge("#22c55e")}>{row.tipo_processo}</span></td>
                          <td style={S.td}>{row.total_despachos}</td>
                          <td style={S.td}>{Number(row.total_pontos).toFixed(1)}</td>
                        </tr>
                      ))}
                      {stats.produtividade.length === 0 && <tr><td colSpan={5} style={{ ...S.td, color: "#ffffff33", textAlign: "center" }}>Sem dados de MRP ainda</td></tr>}
                    </tbody>
                  </table>
                </div>
                </>}

                {subAba === "analistas" && <>
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:14 }}>DESEMPENHO POR ANALISTA</div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["ANALISTA","GERÊNCIA","ASSUNTO","PROCESSOS","ÁREA m²","T.MÉDIO(h)","RETORNOS","PTS MRP","DESPACHOS"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {stats.analistas.map((r,i)=>(
                        <tr key={i}>
                          <td style={S.td}>{r.analista||"—"}</td>
                          <td style={S.td}><span style={S.badge("#06b6d4")}>{r.gerencia||"DIRAAP"}</span></td>
                          <td style={S.td}><span style={S.badge("#d946ef")}>{r.assunto||"—"}</span></td>
                          <td style={S.td}>{r.total_processos}</td>
                          <td style={S.td}>{Number(r.area_total).toLocaleString("pt-BR",{maximumFractionDigits:0})}</td>
                          <td style={S.td}>{Number(r.tempo_medio_horas).toFixed(1)}</td>
                          <td style={S.td}>{r.total_retornos}</td>
                          <td style={S.td}>{Number(r.pontos_totais_mrp).toFixed(1)}</td>
                          <td style={S.td}>{r.despachos_mrp}</td>
                        </tr>
                      ))}
                      {stats.analistas.length===0 && <tr><td colSpan={9} style={{...S.td,color:"#ffffff33",textAlign:"center"}}>Sem dados</td></tr>}
                    </tbody>
                  </table>
                </div>
                </>}

                {subAba === "autores" && <>
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:4 }}>RANKING DE PROJETISTAS — CAU / CREA</div>
                  <div style={{ fontSize:11, color:"#ffffff55", marginBottom:14 }}>Ordenado por erros por processo (maior → menor risco)</div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["#","AUTOR","REGISTRO","TIPO","ASSUNTO","PROC.","NÃO CONF.","ERROS/PROC."].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {stats.autores.map((r,i)=>{
                        const cor = r.erros_por_processo===0 ? "#22c55e" : r.erros_por_processo<=2 ? "#f59e0b" : "#ef4444";
                        return (
                        <tr key={i} style={{ background: i%2===0?"#ffffff08":"transparent" }}>
                          <td style={{...S.td,fontWeight:700,color:"#ffffff55",width:32}}>{i+1}</td>
                          <td style={{...S.td,fontSize:11}}>{r.autor||"—"}</td>
                          <td style={{...S.td,fontFamily:"monospace",fontSize:11,color:"#facc15"}}>{r.registro||"—"}</td>
                          <td style={S.td}><span style={S.badge(r.tipo_registro==="CAU"?"#f59e0b":"#06b6d4")}>{r.tipo_registro}</span></td>
                          <td style={S.td}><span style={S.badge("#d946ef")}>{r.assunto||"—"}</span></td>
                          <td style={{...S.td,textAlign:"center"}}>{r.total_processos}</td>
                          <td style={{...S.td,textAlign:"center",color:"#ef4444",fontWeight:700}}>{r.total_nao_conformidades}</td>
                          <td style={{...S.td,textAlign:"center"}}>
                            <span style={{...S.badge(cor), fontSize:13, fontWeight:800}}>{r.erros_por_processo}</span>
                          </td>
                        </tr>
                        );
                      })}
                      {stats.autores.length===0 && <tr><td colSpan={8} style={{...S.td,color:"#ffffff33",textAlign:"center"}}>Sem dados de CAU/CREA — preencha o LIP com os responsáveis técnicos</td></tr>}
                    </tbody>
                  </table>
                </div>
                </>}

                {subAba === "conformidade" && <>
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:14 }}>NÃO CONFORMIDADES MAIS FREQUENTES</div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["GRUPO","ITEM","REF. LEGAL","ASSUNTO","FREQ."].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {stats.nao_conformidades.map((r,i)=>(
                        <tr key={i}>
                          <td style={{...S.td,fontSize:10}}><span style={S.badge("#f59e0b")}>{r.grupo}</span></td>
                          <td style={{...S.td,fontSize:11,maxWidth:300}}>{r.texto}</td>
                          <td style={{...S.td,fontSize:10,fontFamily:"monospace"}}>{r.ref||"—"}</td>
                          <td style={S.td}><span style={S.badge("#d946ef")}>{r.assunto||"—"}</span></td>
                          <td style={{...S.td,fontWeight:700,color:"#ef4444"}}>{r.frequencia}</td>
                        </tr>
                      ))}
                      {stats.nao_conformidades.length===0 && <tr><td colSpan={5} style={{...S.td,color:"#ffffff33",textAlign:"center"}}>Sem dados de MAC ainda</td></tr>}
                    </tbody>
                  </table>
                </div>
                </>}

                {subAba === "bairros" && <>
                <div style={S.card}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                    <div style={S.label}>DISTRIBUIÇÃO POR BAIRRO</div>
                    <select value={filtroAssunto} onChange={e => setFiltroAssunto(e.target.value)}
                      style={{ background:"#0a0a0f", border:"1px solid #ffffff22", borderRadius:4, color:"#f0f0f0", padding:"4px 10px", fontSize:11, fontFamily:"inherit" }}>
                      {assuntosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["BAIRRO","PROCESSOS","ÁREA TOTAL (m²)","ASSUNTO"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {porBairroFiltrado.map(row=>(
                        <tr key={row.bairro+row.assunto}>
                          <td style={S.td}>{row.bairro}</td>
                          <td style={S.td}>{row.total_processos}</td>
                          <td style={S.td}>{Number(row.area_total).toLocaleString("pt-BR",{maximumFractionDigits:0})}</td>
                          <td style={S.td}><span style={S.badge("#f59e0b")}>{row.assunto}</span></td>
                        </tr>
                      ))}
                      {porBairroFiltrado.length===0 && <tr><td colSpan={4} style={{...S.td,color:"#ffffff33",textAlign:"center"}}>Sem dados</td></tr>}
                    </tbody>
                  </table>
                </div>
                </>}

                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {aba === "capacidades" && (
          <div>
            {linhas.map(({ chave, label, desc, emoji }) => {
              const ativo = getConfig(chave) === "true";
              return (
                <div key={chave} style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <span style={{ fontSize: 24 }}>{emoji}</span>
                    <div>
                      <div style={{ color: "#f0f0f0", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</div>
                      <div style={{ color: "#ffffff55", fontSize: 11 }}>{desc}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: ativo ? "#22c55e" : "#ffffff33", fontSize: 10, letterSpacing: 1 }}>{ativo ? "ATIVO" : "INATIVO"}</span>
                    <button style={S.toggle(ativo)} onClick={() => toggleConfig(chave)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {aba === "legislacao" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button style={S.btn("#d946ef")} onClick={() => { setEditandoLei(null); setForm({ titulo: "", tipo: "lei", numero: "", url_pdf: "", resumo: "", tags: "" }); setModalLei(true); }}>+ Adicionar Lei</button>
            </div>
            {leis.length === 0 && <div style={{ color: "#ffffff33", fontSize: 12, textAlign: "center", padding: 40 }}>Nenhuma lei cadastrada ainda.</div>}
            {leis.map(lei => (
              <div key={lei.id} style={{ ...S.card, opacity: lei.ativo ? 1 : 0.4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <span style={S.badge("#d946ef")}>{lei.tipo.toUpperCase()}</span>
                      {lei.numero && <span style={{ color: "#ffffff44", fontSize: 11 }}>Nº {lei.numero}</span>}
                    </div>
                    <div style={{ color: "#f0f0f0", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{lei.titulo}</div>
                    {lei.resumo && <div style={{ color: "#ffffff55", fontSize: 11, marginBottom: 6 }}>{lei.resumo}</div>}
                    {lei.url_pdf && <a href={lei.url_pdf} target="_blank" style={{ color: "#06b6d4", fontSize: 11 }}>🔗 Ver PDF</a>}
                    {(lei.tags ?? []).length > 0 && (
                      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                        {lei.tags.map(t => <span key={t} style={{ background: "#ffffff11", color: "#ffffff66", fontSize: 9, padding: "2px 8px", borderRadius: 10 }}>{t}</span>)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginLeft: 16 }}>
                    <button style={S.btn("#06b6d4")} onClick={() => abrirEdicao(lei)}>✏️</button>
                    <button style={S.btn(lei.ativo ? "#f59e0b" : "#22c55e")} onClick={() => toggleLei(lei)}>{lei.ativo ? "⏸" : "▶"}</button>
                    <button style={S.btn("#ef4444")} onClick={() => deletarLei(lei.id)}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {aba === "historico" && (
          <div>
            {historico.length === 0 && <div style={{ color: "#ffffff33", fontSize: 12, textAlign: "center", padding: 40 }}>Nenhuma conversa registrada ainda.</div>}
            {historico.map(h => (
              <div key={h.id} style={{ ...S.card, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "#d946ef", fontSize: 11 }}>{h.usuario_nome}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    {h.linha && <span style={S.badge("#06b6d4")}>{h.linha}</span>}
                    <span style={{ color: "#ffffff33", fontSize: 10 }}>{new Date(h.criado_em).toLocaleString("pt-BR")}</span>
                  </div>
                </div>
                <div style={{ color: "#ffffff88", fontSize: 11, marginBottom: 6 }}>👤 {h.mensagem_usuario}</div>
                <div style={{ color: "#ffffff55", fontSize: 11 }}>🤖 {h.resposta_urbi.substring(0, 200)}{h.resposta_urbi.length > 200 ? "..." : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalLei && (
        <div style={{ position: "fixed", inset: 0, background: "#00000088", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ background: "#0d0d14", border: "1px solid #d946ef44", borderRadius: 10, padding: 28, width: 500, maxWidth: "90vw" }}>
            <div style={{ color: "#d946ef", fontSize: 11, letterSpacing: 2, marginBottom: 20 }}>{editandoLei ? "EDITAR LEI" : "NOVA LEI"}</div>
            <input placeholder="Título *" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} style={S.input} />
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ ...S.input, cursor: "pointer" }}>
              {["lei","decreto","portaria","resolucao","outro"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="Número (ex: 031/2007)" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} style={S.input} />
            <input placeholder="URL do PDF" value={form.url_pdf} onChange={e => setForm(f => ({ ...f, url_pdf: e.target.value }))} style={S.input} />
            <textarea placeholder="Resumo" value={form.resumo} onChange={e => setForm(f => ({ ...f, resumo: e.target.value }))} style={{ ...S.input, height: 80, resize: "vertical" }} />
            <input placeholder="Tags (separadas por vírgula)" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} style={S.input} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button style={S.btn("#ffffff44")} onClick={() => setModalLei(false)}>Cancelar</button>
              <button style={S.btn("#d946ef")} onClick={salvarLei}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#052e16", border: "1px solid #22c55e55", color: "#22c55e", padding: "10px 18px", borderRadius: 6, fontSize: 12, fontFamily: "monospace" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
