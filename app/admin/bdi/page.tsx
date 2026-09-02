"use client";
import React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Historico = { id: string; usuario_nome: string; linha: string; mensagem_usuario: string; resposta_urbi: string; criado_em: string };
type UsuarioResumo = { id: string; urbi_ativo?: boolean };
type Stats = {
  resumo: { total_processos: number; total_analistas: number; area_total_construida: number; area_media: number; total_retornos: number; total_bairros: number };
  por_assunto: { assunto: string; total_processos: number; area_total: number; area_media: number; total_retornos: number; porte: string; count_porte: number }[];
  por_analista: { analista: string; gerencia: string; total_processos: number; area_total: number; tempo_medio_horas: number }[];
  por_bairro: { bairro: string; total_processos: number; area_total: number; assunto: string }[];
  produtividade: { analista: string; gerencia: string; mes: number; ano: number; tipo_processo: string; total_despachos: number; total_pontos: number }[];
  analistas: { analista: string; gerencia: string; total_processos: number; area_total: number; tempo_medio_horas: number; total_retornos: number; pontos_totais_mrp: number; despachos_mrp: number; assunto: string }[];
  retrabalho: { processo_codigo: string; virou_nao_conforme: number; foi_resolvido: number; trocas_totais: number }[];
  exigencias_contexto: { tipo_processo: string; faixa_area: string; bairro: string | null; exigencia: string; vezes: number; processos: number }[];
  desempenho_referencia: { referencia: string; reprovou: number; passou: number; processos: number; pct_reprova: number }[];
  campos_criticos: { codigo: string; tipo_processo: string; campos_vazios: number; campos_em_x: number; campos_totais: number; area_maior_que_terreno: boolean | null }[];
  numeracao: { tipo: string; ano: number; numero_inicial: number; numero_final: number; proximo: number; restantes: number; situacao: string }[];
  nao_conformidades: { grupo: string; texto: string; ref: string; assunto: string; frequencia: number }[];
};

const MESES = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function BDIPage() {
  const router = useRouter();
  const [aba, setAba] = useState<"painel"|"estatisticas"|"capacidades"|"legislacao"|"historico">("painel");
  const [usuarios, setUsuarios] = useState<UsuarioResumo[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [sessoes, setSessoes] = useState<any[]>([]);
  const [loadingSessoes, setLoadingSessoes] = useState(false);
  const [filtroAssunto, setFiltroAssunto] = useState("Todos");
  const [subAba, setSubAba] = useState<"resumo"|"analistas"|"retrabalho"|"exigencias"|"qualidade"|"conformidade"|"bairros"|"sessoes">("resumo");

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
    const [r1, r2] = await Promise.all([
      fetch("/api/admin/usuarios").then(r => r.json()),
      fetch("/api/urbi/historico?limit=100").then(r => r.json()),
    ]);
    if (r1.ok) setUsuarios(r1.data);
    if (r2.ok) setHistorico(r2.data);
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

  const totalConversas = historico.length;
  const usuariosComUrbiAtivo = usuarios.filter(u => u.urbi_ativo).length;
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
          <span style={{ color: "#ffffff44", fontSize: 11 }}>URBI ativo para {usuariosComUrbiAtivo}/{usuarios.length} usuários</span>
          <button onClick={() => router.push("/admin/rastreabilidade")} style={S.btn("#ffffff44")}>🔍 Rastreabilidade</button>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 24 }}>
              {[
                { label: "CONVERSAS TOTAIS", valor: totalConversas },
                { label: "USUÁRIOS COM URBI ATIVO", valor: `${usuariosComUrbiAtivo}/${usuarios.length}` },
              ].map(({ label, valor }) => (
                <div key={label} style={S.card}>
                  <div style={S.label}>{label}</div>
                  <div style={S.valor}>{valor}</div>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={S.label}>ATIVAÇÃO DO URBI</div>
              <div style={{ color: "#f0f0f0", fontSize: 14, lineHeight: 1.7, marginBottom: 14, maxWidth: 560 }}>
                O URBI é ativado individualmente, por usuário — não existe um interruptor geral. Ligue ou desligue
                para cada analista, gerência ou diretora em Configurações → Usuários.
              </div>
              <button style={S.btn("#d946ef")} onClick={() => router.push("/admin/usuarios")}>
                👤 Abrir Usuários →
              </button>
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
                  const subAbas: [string, string][] = [["resumo","📊 Resumo"],["analistas","👤 Analistas"],["retrabalho","🔁 Retrabalho"],["exigencias","📌 Exigências"],["qualidade","🧭 Qualidade"],["conformidade","⚠️ Conformidade"],["bairros","📍 Bairros"],["sessoes","🕑 Sessões"]];
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

                {subAba === "retrabalho" && <>
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:4 }}>PROCESSOS COM MAIOR RETRABALHO</div>
                  <div style={{ fontSize:11, color:"#ffffff55", marginBottom:14 }}>
                    Contado do histórico do MAC: quantas vezes um item mudou de status. &quot;Voltou&quot; é item que
                    estava conforme e virou não conforme; &quot;resolvido&quot; é o caminho contrário.
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["#","PROCESSO","TROCAS","VOLTOU","RESOLVIDO"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {stats.retrabalho.map((r,i)=>(
                        <tr key={r.processo_codigo} style={{ background: i%2===0?"#ffffff08":"transparent" }}>
                          <td style={{...S.td,fontWeight:700,color:"#ffffff55",width:32}}>{i+1}</td>
                          <td style={{...S.td,fontFamily:"monospace",fontSize:11}}>{r.processo_codigo}</td>
                          <td style={{...S.td,textAlign:"center",fontWeight:700}}>{r.trocas_totais}</td>
                          <td style={{...S.td,textAlign:"center",color:"#ef4444"}}>{r.virou_nao_conforme}</td>
                          <td style={{...S.td,textAlign:"center",color:"#22c55e"}}>{r.foi_resolvido}</td>
                        </tr>
                      ))}
                      {stats.retrabalho.length===0 && <tr><td colSpan={5} style={{...S.td,color:"#ffffff33",textAlign:"center"}}>Sem trocas registradas</td></tr>}
                    </tbody>
                  </table>
                </div>
                </>}

                {subAba === "exigencias" && <>
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:4 }}>EXIGÊNCIAS POR ASSUNTO, BAIRRO E FAIXA DE ÁREA</div>
                  <div style={{ fontSize:11, color:"#ffffff55", marginBottom:14 }}>
                    O que mais reprova em processo parecido. Vem do histórico do MAC, contando só marcação de não conforme.
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["ASSUNTO","FAIXA DE ÁREA","BAIRRO","EXIGÊNCIA","PROC."].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {stats.exigencias_contexto.map((r,i)=>(
                        <tr key={i} style={{ background: i%2===0?"#ffffff08":"transparent" }}>
                          <td style={S.td}><span style={S.badge("#d946ef")}>{r.tipo_processo}</span></td>
                          <td style={{...S.td,fontSize:11}}>{r.faixa_area}</td>
                          <td style={{...S.td,fontSize:11,color:"#ffffff88"}}>{r.bairro || "—"}</td>
                          <td style={{...S.td,fontSize:11}}>{String(r.exigencia).slice(0,90)}</td>
                          <td style={{...S.td,textAlign:"center",fontWeight:700}}>{r.processos}</td>
                        </tr>
                      ))}
                      {stats.exigencias_contexto.length===0 && <tr><td colSpan={5} style={{...S.td,color:"#ffffff33",textAlign:"center"}}>Sem dados</td></tr>}
                    </tbody>
                  </table>
                </div>

                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:4 }}>REFERÊNCIAS LEGAIS QUE MAIS REPROVAM</div>
                  <div style={{ fontSize:11, color:"#ffffff55", marginBottom:14 }}>
                    A referência é como foi gravada no checklist, às vezes com várias leis juntas — é o desempenho
                    da combinação, não de artigo isolado. Só aparece referência presente em 3 ou mais processos.
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["REFERÊNCIA","REPROVOU","PASSOU","PROC.","% REPROVA"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {stats.desempenho_referencia.map((r,i)=>(
                        <tr key={i} style={{ background: i%2===0?"#ffffff08":"transparent" }}>
                          <td style={{...S.td,fontSize:11}}>{r.referencia}</td>
                          <td style={{...S.td,textAlign:"center",color:"#ef4444",fontWeight:700}}>{r.reprovou}</td>
                          <td style={{...S.td,textAlign:"center",color:"#22c55e"}}>{r.passou}</td>
                          <td style={{...S.td,textAlign:"center"}}>{r.processos}</td>
                          <td style={{...S.td,textAlign:"center"}}>{r.pct_reprova}%</td>
                        </tr>
                      ))}
                      {stats.desempenho_referencia.length===0 && <tr><td colSpan={5} style={{...S.td,color:"#ffffff33",textAlign:"center"}}>Sem dados</td></tr>}
                    </tbody>
                  </table>
                </div>
                </>}

                {subAba === "qualidade" && <>
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:4 }}>NUMERAÇÃO</div>
                  <div style={{ fontSize:11, color:"#ffffff55", marginBottom:14 }}>Faixa esgotada trava a emissão de documento.</div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["TIPO","ANO","FAIXA","PRÓXIMO","RESTANTES","SITUAÇÃO"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {stats.numeracao.map((r,i)=>{
                        const cor = r.situacao==="ESGOTADA" ? "#ef4444" : r.situacao==="CRITICO" ? "#f59e0b" : r.situacao==="ATENCAO" ? "#facc15" : "#22c55e";
                        return (
                        <tr key={i} style={{ background: i%2===0?"#ffffff08":"transparent" }}>
                          <td style={S.td}>{r.tipo}</td>
                          <td style={{...S.td,textAlign:"center"}}>{r.ano}</td>
                          <td style={{...S.td,fontFamily:"monospace",fontSize:11}}>{r.numero_inicial}–{r.numero_final}</td>
                          <td style={{...S.td,textAlign:"center",fontFamily:"monospace"}}>{r.proximo}</td>
                          <td style={{...S.td,textAlign:"center",fontWeight:700}}>{r.restantes}</td>
                          <td style={S.td}><span style={S.badge(cor)}>{r.situacao}</span></td>
                        </tr>
                        );
                      })}
                      {stats.numeracao.length===0 && <tr><td colSpan={6} style={{...S.td,color:"#ffffff33",textAlign:"center"}}>Sem faixas cadastradas</td></tr>}
                    </tbody>
                  </table>
                </div>

                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:4 }}>PREENCHIMENTO E QUALIDADE DOS DADOS</div>
                  <div style={{ fontSize:11, color:"#ffffff55", marginBottom:14 }}>
                    Campo vazio pode ser falha de leitura. Campo em X afirma que o documento não traz a
                    informação — <b>não é erro</b>. As duas colunas são contadas separadas de propósito.
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["PROCESSO","ASSUNTO","VAZIOS","EM X","CAMPOS","ÁREA > TERRENO"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {stats.campos_criticos.map((r,i)=>(
                        <tr key={r.codigo} style={{ background: i%2===0?"#ffffff08":"transparent" }}>
                          <td style={{...S.td,fontFamily:"monospace",fontSize:11}}>{r.codigo}</td>
                          <td style={{...S.td,fontSize:11}}>{r.tipo_processo}</td>
                          <td style={{...S.td,textAlign:"center",color: r.campos_vazios>=10?"#f59e0b":"#ffffff99",fontWeight:700}}>{r.campos_vazios}</td>
                          <td style={{...S.td,textAlign:"center",color:"#06b6d4"}}>{r.campos_em_x}</td>
                          <td style={{...S.td,textAlign:"center",color:"#ffffff55"}}>{r.campos_totais}</td>
                          <td style={{...S.td,textAlign:"center"}}>
                            {r.area_maior_que_terreno === true
                              ? <span style={S.badge("#ef4444")}>SIM</span>
                              : r.area_maior_que_terreno === null
                                ? <span style={S.badge("#64748b")}>não deu p/ ler</span>
                                : "—"}
                          </td>
                        </tr>
                      ))}
                      {stats.campos_criticos.length===0 && <tr><td colSpan={6} style={{...S.td,color:"#ffffff33",textAlign:"center"}}>Sem dados</td></tr>}
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


                {subAba === "sessoes" && <>
                <div style={S.card}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                    <div style={S.label}>SESSÕES DE TRABALHO</div>
                    <button onClick={carregarSessoes} style={S.btn("#d946ef")}>↻ Atualizar</button>
                  </div>
                  {loadingSessoes && <div style={{ color:"#ffffff44", fontSize:12, textAlign:"center", padding:20 }}>Carregando…</div>}
                  {!loadingSessoes && sessoes.length === 0 && (
                    <div style={{ color:"#ffffff33", fontSize:12, textAlign:"center", padding:20 }}>Nenhuma sessão registrada ainda.</div>
                  )}
                  {!loadingSessoes && sessoes.length > 0 && (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr>
                          {["ANALISTA","DATA","SESSÕES","BRUTO","LÍQUIDO","ÚLTIMO ACESSO"].map(h=>(
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sessoes.map((s:any, i:number) => (
                          <tr key={i}>
                            <td style={S.td}>{s.analista || "—"}</td>
                            <td style={{...S.td, fontFamily:"monospace", fontSize:11}}>{s.data ? new Date(s.data).toLocaleDateString("pt-BR") : "—"}</td>
                            <td style={{...S.td, textAlign:"center"}}>{s.total_sessoes ?? "—"}</td>
                            <td style={{...S.td, color:"#facc15"}}>{s.minutos_brutos != null ? `${s.minutos_brutos} min` : "—"}</td>
                            <td style={{...S.td, color:"#4ade80"}}>{s.minutos_liquidos != null ? `${s.minutos_liquidos} min` : "—"}</td>
                            <td style={{...S.td, fontFamily:"monospace", fontSize:11}}>{s.ultimo_acesso ? new Date(s.ultimo_acesso).toLocaleString("pt-BR") : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
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
            <div style={{ ...S.card, display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ fontSize: 24 }}>⚖️</span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: "#f0f0f0", fontSize: 13, fontWeight: 600 }}>BIP — Especialista em Legislação</span>
                  <span style={{ color: "#22c55e", fontSize: 10, letterSpacing: 1 }}>ATIVO</span>
                </div>
                <div style={{ color: "#ffffff55", fontSize: 11 }}>
                  Não se liga por aqui — cada analista ativa direto no botão "⚖️ Ativar BIP" dentro do chat do URBI.
                  Quando ativo, o URBI responde só com base no BIP e sempre cita a fonte.
                </div>
              </div>
            </div>
            <div style={{ ...S.card, display: "flex", gap: 14, alignItems: "center", opacity: 0.6 }}>
              <span style={{ fontSize: 24 }}>🤖</span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: "#f0f0f0", fontSize: 13, fontWeight: 600 }}>Co-Analista</span>
                  <span style={{ color: "#ffffff33", fontSize: 10, letterSpacing: 1 }}>AINDA NÃO IMPLEMENTADO</span>
                </div>
                <div style={{ color: "#ffffff55", fontSize: 11 }}>
                  Apoio de análise consultando dados reais do processo — depende de acesso a ferramentas que o URBI
                  ainda não tem. Não é um recurso que se liga; é trabalho de fase futura.
                </div>
              </div>
            </div>
          </div>
        )}

        {aba === "legislacao" && (
          <div style={S.card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 22 }}>📚</span>
              <div style={{ color: "#f0f0f0", fontSize: 15, fontWeight: 700 }}>O BIP é a fonte jurídica oficial do URBIS</div>
            </div>
            <div style={{ color: "#ffffff66", fontSize: 13, lineHeight: 1.7, marginBottom: 20, maxWidth: 580 }}>
              Leis, decretos e normas técnicas ficam indexados e pesquisáveis no BIP — Biblioteca Inteligente
              para Pesquisas. É de lá que o modo BIP do URBI busca fragmento e cita fonte ao responder.
              Este cadastro antigo de legislação (aba que existia aqui) não alimenta mais nada no sistema —
              cadastre e gerencie leis diretamente no BIP.
            </div>
            <button style={S.btn("#d946ef")} onClick={() => router.push("/admin/bdi/leis")}>
              📚 Abrir o BIP — Biblioteca de Leis →
            </button>
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
    </div>
  );
}
