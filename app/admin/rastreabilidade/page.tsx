"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Linha = any;

// ── LIP: cores de declaração ──────────────────────────────────────────────────
const CORES: Record<string, string> = {
  AUTOMATICO: "#16A34A", CALCULADO: "#2563EB", NAO_APLICAVEL: "#64748B",
  DOCUMENTO_AUSENTE: "#EA580C", MANUAL: "#7C3AED",
  PENDENTE_VISAO: "#DC2626", BLOQUEADO: "#DC2626",
};
const rotuloStatus: Record<string, string> = {
  AUTOMATICO: "Automático", CALCULADO: "Calculado", NAO_APLICAVEL: "Não aplicável",
  DOCUMENTO_AUSENTE: "Documento ausente",
  MANUAL: "Manual", PENDENTE_VISAO: "Pendente de visão", BLOQUEADO: "Bloqueado",
};
const CORES_RESULTADO: Record<string, string> = {
  ENCONTRADO: "#16A34A", CALCULADO: "#2563EB", NAO_APLICAVEL: "#64748B",
  NAO_ENCONTRADO: "#DC2626", FONTE_ILEGIVEL: "#DC2626", DOCUMENTO_AUSENTE: "#EA580C",
  AGUARDANDO_FATO: "#EA580C", MANUAL: "#7C3AED", BLOQUEADO: "#B91C1C", NAO_IMPLEMENTADO: "#B91C1C",
  SEM_RESULTADO: "#94A3B8",
};
const rotuloResultado: Record<string, string> = {
  ENCONTRADO: "Encontrado", CALCULADO: "Calculado", NAO_APLICAVEL: "Não aplicável",
  NAO_ENCONTRADO: "Não encontrado", FONTE_ILEGIVEL: "Fonte ilegível", DOCUMENTO_AUSENTE: "Documento ausente",
  AGUARDANDO_FATO: "Aguardando fato", MANUAL: "Manual", BLOQUEADO: "Bloqueado",
  NAO_IMPLEMENTADO: "Não implementado", SEM_RESULTADO: "Sem resultado",
};

// ── MAC: cores e rótulos de classificação ─────────────────────────────────────
const CORES_CLASSIF_BIP: Record<string, string> = {
  VINCULADO_BIP: "#16A34A", SEM_FUNDAMENTO_BIP: "#EA580C",
  REVISAO_MANUAL: "#DC2626", NAO_ANALISADO: "#94A3B8",
};
const CORES_CLASSIF_LIP: Record<string, string> = {
  AUTOMATIZAVEL: "#16A34A", PARCIALMENTE_AUTOMATIZAVEL: "#2563EB",
  MANUAL_COM_EVIDENCIA_LIP: "#7C3AED", MANUAL_SEM_DADO_LIP: "#64748B",
  REVISAO_MANUAL: "#DC2626", NAO_ANALISADO: "#94A3B8",
};
const ROT_CLASSIF_BIP: Record<string, string> = {
  VINCULADO_BIP: "Com BIP", SEM_FUNDAMENTO_BIP: "Sem BIP",
  REVISAO_MANUAL: "Revisão BIP", NAO_ANALISADO: "N/A",
};
const ROT_CLASSIF_LIP: Record<string, string> = {
  AUTOMATIZAVEL: "Automático", PARCIALMENTE_AUTOMATIZAVEL: "Parcial",
  MANUAL_COM_EVIDENCIA_LIP: "Com evidência", MANUAL_SEM_DADO_LIP: "Sem dado LIP",
  REVISAO_MANUAL: "Revisão LIP", NAO_ANALISADO: "N/A",
};
const RESULTADOS_LACUNA = new Set([
  "NAO_ENCONTRADO", "FONTE_ILEGIVEL", "DOCUMENTO_AUSENTE", "BLOQUEADO", "NAO_IMPLEMENTADO",
]);

// ── MAC: as 4 posturas do plano de endereçamento — derivadas do `resultado`,
//    NUNCA uma coluna nova (ver memória urbis-mac-slot5-plano-posturas). Tudo que
//    não é RESOLVIDO/NAO_APLICAVEL/AGUARDANDO_FATO cai no catch-all VEREDITO_HUMANO.
const POSTURA_DE_RESULTADO: Record<string, string> = {
  ENCONTRADO: "RESOLVIDO", CALCULADO: "RESOLVIDO", INFERIDO: "RESOLVIDO",
  NAO_APLICAVEL: "NAO_APLICAVEL",
  AGUARDANDO_FATO: "DADO_NECESSARIO",
};
const posturaDe = (l: Linha): string => POSTURA_DE_RESULTADO[l.resultado?.resultado] ?? "VEREDITO_HUMANO";
const CORES_POSTURA: Record<string, string> = {
  RESOLVIDO: "#16A34A", NAO_APLICAVEL: "#64748B", DADO_NECESSARIO: "#EA580C", VEREDITO_HUMANO: "#7C3AED",
};
const ROT_POSTURA: Record<string, string> = {
  RESOLVIDO: "Resolvido", NAO_APLICAVEL: "Não aplicável",
  DADO_NECESSARIO: "Dado necessário", VEREDITO_HUMANO: "Veredito humano",
};

export default function Rastreabilidade() {
  const router = useRouter();
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [modulo, setModulo] = useState<"LIP" | "MAC">("LIP");
  const [busca, setBusca] = useState("");
  const [fSecao, setFSecao] = useState("");
  const [fMetodo, setFMetodo] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fFonte, setFFonte] = useState("");
  const [fIA, setFIA] = useState("");
  const [fClassifLip, setFClassifLip] = useState("");
  const [fClassifBip, setFClassifBip] = useState("");
  const [fTemVinculoLip, setFTemVinculoLip] = useState("");
  const [fTemVinculoBip, setFTemVinculoBip] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [processoBusca, setProcessoBusca] = useState("");
  const [processoAtivo, setProcessoAtivo] = useState("");
  const [soLacunas, setSoLacunas] = useState(false);
  const [fPostura, setFPostura] = useState("");

  function trocarModulo(m: "LIP" | "MAC") {
    setModulo(m); setAberto(null);
    setBusca(""); setFSecao(""); setFMetodo(""); setFStatus(""); setFFonte(""); setFIA("");
    setFClassifLip(""); setFClassifBip(""); setFTemVinculoLip(""); setFTemVinculoBip(""); setFPostura("");
  }

  function atualizarValorManual(id: string, valorManual: string) {
    const agora = new Date().toISOString();
    setDados((d: any) => !d ? d : {
      ...d,
      linhas: d.linhas.map((x: any) => x.id !== id ? x : {
        ...x,
        resultado: x.resultado
          ? { ...x.resultado, valorManual, complementadoEm: agora }
          : {
            resultado: "MANUAL", valor: null, fonte: null, tentativa: null, evidencia: null,
            valorManual, autorManualId: null, complementadoEm: agora, atualizadoEm: agora,
          },
      }),
    });
  }

  useEffect(() => {
    setDados(null); setErro("");
    const qs = new URLSearchParams({ modulo, slot: "slot_05" });
    if (processoAtivo) qs.set("processo", processoAtivo);
    fetch(`/api/admin/rastreabilidade?${qs}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => (d.ok ? setDados(d) : setErro(d.erro)))
      .catch((e) => setErro(String(e)));
  }, [modulo, processoAtivo]);

  const linhas: Linha[] = dados?.linhas ?? [];
  const opcoes = useMemo(() => ({
    secoes: [...new Set(linhas.map((l) => l.secao))].sort(),
    metodos: [...new Set(linhas.flatMap((l) => l.metodos))].sort(),
    status: [...new Set(linhas.map((l) => l.declaracao))].sort(),
    fontes: [...new Set(linhas.map((l) => l.fontePrincipal))].sort(),
    classifBip: [...new Set(linhas.map((l: any) => l.classificacao_bip).filter(Boolean))].sort(),
    classifLip: [...new Set(linhas.map((l: any) => l.classificacao_lip).filter(Boolean))].sort(),
  }), [linhas]);

  const filtradas = linhas.filter((l) => {
    const q = busca.trim().toLowerCase();
    if (q && !`${l.id} ${l.nome} ${l.secao} ${l.responsavel ?? ""} ${l.aplicabilidade ?? ""}`.toLowerCase().includes(q)) return false;
    if (fSecao && l.secao !== fSecao) return false;
    if (fMetodo && !l.metodos.includes(fMetodo)) return false;
    if (fStatus && l.declaracao !== fStatus) return false;
    if (fFonte && l.fontePrincipal !== fFonte) return false;
    if (fIA === "sim" && !l.usaIA) return false;
    if (fIA === "nao" && l.usaIA) return false;
    if (fClassifLip && l.classificacao_lip !== fClassifLip) return false;
    if (fClassifBip && l.classificacao_bip !== fClassifBip) return false;
    if (fTemVinculoLip === "sim" && !(l.lipVinculos?.length)) return false;
    if (fTemVinculoLip === "nao" && !!(l.lipVinculos?.length)) return false;
    if (fTemVinculoBip === "sim" && !(l.bipVinculos?.length)) return false;
    if (fTemVinculoBip === "nao" && !!(l.bipVinculos?.length)) return false;
    if (soLacunas && !RESULTADOS_LACUNA.has(l.resultado?.resultado)) return false;
    if (modulo === "MAC" && fPostura && posturaDe(l) !== fPostura) return false;
    return true;
  });

  const sel = "bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-xs text-[var(--text-primary)]";
  const temExecucao = !!dados?.processo;
  const macComPostura = modulo === "MAC" && temExecucao;
  const colunas = modulo === "MAC"
    ? macComPostura ? "grid-cols-[1fr_140px_110px_110px_40px_40px_150px]" : "grid-cols-[1fr_160px_130px_130px_50px_50px]"
    : temExecucao
      ? "grid-cols-[1fr_110px_170px_150px_130px_45px_55px]"
      : "grid-cols-[1fr_130px_180px_150px_50px_60px_90px]";
  const temFiltro = busca || fSecao || fStatus || fMetodo || fFonte || fIA
    || fClassifLip || fClassifBip || fTemVinculoLip || fTemVinculoBip || fPostura;

  const posturaCounts = useMemo(() => {
    if (!macComPostura) return null;
    const acc: Record<string, number> = {};
    for (const l of linhas) { const p = posturaDe(l); acc[p] = (acc[p] ?? 0) + 1; }
    return acc;
  }, [linhas, macComPostura]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <button onClick={() => router.push("/")}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          ← HOME
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">🔍 Rastreabilidade — Slot 5</h1>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Especificação oficial de como o URBIS decide cada campo. Lida direto do código — não é cópia,
        não pode divergir do que o sistema faz.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <input value={processoBusca} onChange={(e) => setProcessoBusca(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setProcessoAtivo(processoBusca.trim())}
          placeholder="código do processo — ver RESULTADO de uma execução"
          className={`${sel} min-w-[280px]`} />
        <button onClick={() => setProcessoAtivo(processoBusca.trim())}
          className="px-3 py-1 rounded text-xs font-semibold bg-[var(--primary)] text-white">
          ver execução
        </button>
        {!!processoAtivo && (
          <button onClick={() => { setProcessoBusca(""); setProcessoAtivo(""); setSoLacunas(false); }}
            className="text-xs text-[var(--text-muted)] underline">limpar processo</button>
        )}
        {temExecucao && (
          <button onClick={() => setSoLacunas((v) => !v)}
            className={`px-3 py-1 rounded text-xs font-semibold border ${soLacunas
              ? "bg-[#DC2626] text-white border-[#DC2626]"
              : "border-[var(--border-strong)] text-[var(--text-secondary)]"}`}>
            {soLacunas ? "vendo só lacunas" : "ver relatório de lacunas"}
          </button>
        )}
      </div>

      {!!processoAtivo && dados?.resultadosIndisponiveis && (
        <p className="text-xs text-[#DC2626] mb-3">
          ⚠ o registro de resultados não está instalado — rode a migration{" "}
          <code>2026_07_29_mhd_resultados_campo.sql</code>.
        </p>
      )}

      {erro && <p className="text-sm text-[#DC2626]">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-[var(--text-muted)]">carregando…</p>}

      {dados && (
        <>
          {/* Abas de módulo */}
          <div className="flex gap-2 mb-3">
            {dados.matrizes.map((m: any) => (
              <button key={m.modulo} onClick={() => trocarModulo(m.modulo)}
                className={`px-3 py-1.5 rounded text-sm font-semibold ${modulo === m.modulo
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
                {m.modulo} · {m.total} {m.total === 1 ? "registro" : "registros"}
              </button>
            ))}
          </div>

          {!!linhas.length && (
            <>
              {/* Filtros */}
              <div className="flex flex-wrap gap-2 items-center mb-2">
                <input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder={modulo === "MAC" ? "buscar texto do item, grupo, ID…" : "buscar campo, nome, arquivo…"}
                  className={`${sel} min-w-[240px] flex-1`} />
                <select value={fSecao} onChange={(e) => setFSecao(e.target.value)} className={sel}>
                  <option value="">{modulo === "MAC" ? "todos os grupos" : "todas as seções"}</option>
                  {opcoes.secoes.map((s: any) => <option key={s} value={s}>{s}</option>)}
                </select>
                {modulo === "LIP" && (
                  <>
                    <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={sel}>
                      <option value="">todos os status</option>
                      {opcoes.status.map((s: any) => <option key={s} value={s}>{rotuloStatus[s] ?? s}</option>)}
                    </select>
                    <select value={fMetodo} onChange={(e) => setFMetodo(e.target.value)} className={sel}>
                      <option value="">todos os métodos</option>
                      {opcoes.metodos.map((s: any) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={fFonte} onChange={(e) => setFFonte(e.target.value)} className={sel}>
                      <option value="">todas as fontes</option>
                      {opcoes.fontes.map((s: any) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={fIA} onChange={(e) => setFIA(e.target.value)} className={sel}>
                      <option value="">IA: tanto faz</option>
                      <option value="sim">usa IA</option>
                      <option value="nao">sem IA</option>
                    </select>
                  </>
                )}
                {modulo === "MAC" && (
                  <>
                    <select value={fClassifLip} onChange={(e) => setFClassifLip(e.target.value)} className={sel}>
                      <option value="">class. LIP: todas</option>
                      {opcoes.classifLip.map((s: any) => <option key={s} value={s}>{ROT_CLASSIF_LIP[s] ?? s}</option>)}
                    </select>
                    <select value={fClassifBip} onChange={(e) => setFClassifBip(e.target.value)} className={sel}>
                      <option value="">class. BIP: todas</option>
                      {opcoes.classifBip.map((s: any) => <option key={s} value={s}>{ROT_CLASSIF_BIP[s] ?? s}</option>)}
                    </select>
                    <select value={fTemVinculoLip} onChange={(e) => setFTemVinculoLip(e.target.value)} className={sel}>
                      <option value="">vínculo LIP: tanto faz</option>
                      <option value="sim">com vínculo LIP</option>
                      <option value="nao">sem vínculo LIP</option>
                    </select>
                    <select value={fTemVinculoBip} onChange={(e) => setFTemVinculoBip(e.target.value)} className={sel}>
                      <option value="">vínculo BIP: tanto faz</option>
                      <option value="sim">com vínculo BIP</option>
                      <option value="nao">sem vínculo BIP</option>
                    </select>
                  </>
                )}
                {temFiltro && (
                  <button onClick={() => {
                    setBusca(""); setFSecao(""); setFStatus(""); setFMetodo(""); setFFonte(""); setFIA("");
                    setFClassifLip(""); setFClassifBip(""); setFTemVinculoLip(""); setFTemVinculoBip("");
                  }} className="text-xs text-[var(--text-muted)] underline">limpar</button>
                )}
              </div>

              {/* Totais LIP */}
              {modulo === "LIP" && (
                <div className="flex flex-wrap gap-2 mb-3 text-xs">
                  <span className="text-[var(--text-muted)]">
                    Declaração — {filtradas.length} de {dados.totais.campos} · {dados.totais.implementados} implementados ·{" "}
                    {dados.totais.usamIA} usam IA
                  </span>
                  {Object.entries(dados.totais.porStatus).map(([s, n]: any) => (
                    <button key={s} onClick={() => setFStatus(fStatus === s ? "" : s)}
                      className="px-2 py-0.5 rounded-full border"
                      style={{ borderColor: CORES[s], color: CORES[s] }}>
                      {rotuloStatus[s] ?? s}: {n}
                    </button>
                  ))}
                </div>
              )}

              {/* Totais MAC */}
              {modulo === "MAC" && (
                <>
                  <div className="flex flex-wrap gap-2 mb-1 text-xs">
                    <span className="text-[var(--text-muted)]">
                      Classificação LIP — {filtradas.length} de {dados.totais.campos} itens ·{" "}
                      {dados.totais.itensComVinculoLip} com vínculo · {dados.totais.totalVinculosLip} vínculos total
                    </span>
                    {dados.totais.porClassifLip && Object.entries(dados.totais.porClassifLip).map(([s, n]: any) => (
                      <button key={s} onClick={() => setFClassifLip(fClassifLip === s ? "" : s)}
                        className="px-2 py-0.5 rounded-full border"
                        style={{ borderColor: CORES_CLASSIF_LIP[s] ?? "#64748B", color: CORES_CLASSIF_LIP[s] ?? "#64748B" }}>
                        {ROT_CLASSIF_LIP[s] ?? s}: {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3 text-xs">
                    <span className="text-[var(--text-muted)]">
                      Classificação BIP — {dados.totais.itensComVinculoBip} com vínculo · {dados.totais.totalVinculosBip} vínculos total
                    </span>
                    {dados.totais.porClassifBip && Object.entries(dados.totais.porClassifBip).map(([s, n]: any) => (
                      <button key={s} onClick={() => setFClassifBip(fClassifBip === s ? "" : s)}
                        className="px-2 py-0.5 rounded-full border"
                        style={{ borderColor: CORES_CLASSIF_BIP[s] ?? "#64748B", color: CORES_CLASSIF_BIP[s] ?? "#64748B" }}>
                        {ROT_CLASSIF_BIP[s] ?? s}: {n}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {macComPostura && posturaCounts && (
                <div className="flex flex-wrap gap-2 mb-3 text-xs">
                  <span className="text-[var(--text-muted)]">
                    Postura — endereçamento dos {linhas.length} itens · processo {dados.processo}
                  </span>
                  {Object.entries(posturaCounts).map(([s, n]: any) => (
                    <button key={s} onClick={() => setFPostura(fPostura === s ? "" : s)}
                      className="px-2 py-0.5 rounded-full border"
                      style={fPostura === s
                        ? { borderColor: CORES_POSTURA[s], color: "white", background: CORES_POSTURA[s] }
                        : { borderColor: CORES_POSTURA[s], color: CORES_POSTURA[s] }}>
                      {ROT_POSTURA[s] ?? s}: {n}
                    </button>
                  ))}
                </div>
              )}

              {temExecucao && dados.totais.porResultado && (
                <div className="flex flex-wrap gap-2 mb-3 text-xs">
                  <span className="text-[var(--text-muted)]">Resultado — processo {dados.processo}</span>
                  {Object.entries(dados.totais.porResultado).map(([s, n]: any) => (
                    <button key={s} onClick={() => setSoLacunas(RESULTADOS_LACUNA.has(s) ? soLacunas : false)}
                      className="px-2 py-0.5 rounded-full border"
                      style={{ borderColor: CORES_RESULTADO[s], color: CORES_RESULTADO[s] }}>
                      {rotuloResultado[s] ?? s}: {n}
                    </button>
                  ))}
                  <span className="text-[var(--text-muted)]">
                    · soma: {(Object.values(dados.totais.porResultado) as number[]).reduce((a, b) => a + b, 0)}
                  </span>
                </div>
              )}

              {!!dados.semRastro?.length && (
                <p className="text-xs text-[#DC2626] mb-2">
                  ⚠ {dados.semRastro.length} campo(s) do LIP sem rastreabilidade: {dados.semRastro.join(", ")}
                </p>
              )}

              {/* Tabela */}
              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className={`grid ${colunas} gap-2 px-3 py-2 bg-[var(--bg-secondary)] text-[10px] font-bold uppercase text-[var(--text-muted)]`}>
                  {modulo === "MAC" ? (
                    <>
                      <span>Texto do Item</span>
                      <span>Grupo</span>
                      <span>Class. LIP</span>
                      <span>Class. BIP</span>
                      <span title="vínculos LIP"># LIP</span>
                      <span title="vínculos BIP"># BIP</span>
                      {macComPostura && <span>Postura</span>}
                    </>
                  ) : (
                    <>
                      <span>Campo</span>
                      <span>Declaração</span>
                      {temExecucao ? <span>Resultado</span> : null}
                      <span>Método</span>
                      <span>Fonte</span>
                      <span>IA?</span>
                      <span>Versão</span>
                      {!temExecucao && <span>Alterado</span>}
                    </>
                  )}
                </div>

                {filtradas.map((l) => (
                  <div key={l.id} className="border-t border-[var(--border)]">
                    <button onClick={() => setAberto(aberto === l.id ? null : l.id)}
                      className={`w-full grid ${colunas} gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-secondary)]`}>
                      {modulo === "MAC" ? (
                        <>
                          <span className="text-[var(--text-primary)] truncate" title={l.nome}>{l.nome}</span>
                          <span className="text-[var(--text-secondary)] truncate text-[10px]" title={l.secao}>{l.secao}</span>
                          <span className="text-[10px] truncate"
                            style={{ color: CORES_CLASSIF_LIP[l.classificacao_lip ?? "NAO_ANALISADO"] ?? "#94A3B8" }}>
                            {ROT_CLASSIF_LIP[l.classificacao_lip ?? "NAO_ANALISADO"] ?? l.classificacao_lip ?? "—"}
                          </span>
                          <span className="text-[10px] truncate"
                            style={{ color: CORES_CLASSIF_BIP[l.classificacao_bip ?? "NAO_ANALISADO"] ?? "#94A3B8" }}>
                            {ROT_CLASSIF_BIP[l.classificacao_bip ?? "NAO_ANALISADO"] ?? l.classificacao_bip ?? "—"}
                          </span>
                          <span className="text-[var(--text-secondary)] text-center">{l.lipVinculos?.length ?? 0}</span>
                          <span className="text-[var(--text-secondary)] text-center">{l.bipVinculos?.length ?? 0}</span>
                          {macComPostura && (
                            <span className="text-[10px] truncate flex items-center gap-1"
                              style={{ color: CORES_POSTURA[posturaDe(l)] }}>
                              {ROT_POSTURA[posturaDe(l)]}
                              {l.resultado?.valorManual && <span title="já respondido">✓</span>}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-[var(--text-primary)] truncate" title={l.nome}>
                            {l.nome} <span className="text-[var(--text-muted)]">· {l.id}</span>
                          </span>
                          <span style={{ color: CORES[l.declaracao] }}>{rotuloStatus[l.declaracao] ?? l.declaracao}</span>
                          {temExecucao && (
                            <span style={{ color: CORES_RESULTADO[l.resultado?.resultado ?? "SEM_RESULTADO"] }}
                              className="truncate"
                              title={l.resultado?.valor ?? l.resultado?.tentativa?.motivo ?? ""}>
                              {rotuloResultado[l.resultado?.resultado ?? "SEM_RESULTADO"]}
                            </span>
                          )}
                          <span className="text-[var(--text-secondary)] truncate" title={l.metodos.join(" → ")}>
                            {l.metodos.join(" → ")}
                          </span>
                          <span className="text-[var(--text-secondary)] truncate">{l.fontePrincipal}</span>
                          <span className={l.usaIA ? "text-[#DC2626]" : "text-[var(--text-muted)]"}>{l.usaIA ? "sim" : "—"}</span>
                          <span className="text-[var(--text-secondary)]">v{l.versao}</span>
                          {!temExecucao && <span className="text-[var(--text-muted)]">{l.alteradoEm}</span>}
                        </>
                      )}
                    </button>

                    {aberto === l.id && (
                      <div className="px-4 py-3 bg-[var(--bg-secondary)] text-xs space-y-2">

                        {/* Identificação MAC */}
                        {modulo === "MAC" && (
                          <>
                            <Campo t="ID / código"><code className="text-[10px]">{l.id}</code></Campo>
                            <Campo t="Ordem">{l.ordem ?? "—"}</Campo>
                            <Campo t="Grupo">{l.secao}</Campo>
                            <Campo t="Texto completo"><span className="whitespace-pre-wrap">{l.nome}</span></Campo>
                            {l.ativo === false && (
                              <Campo t="Status"><span className="text-[#DC2626]">⚠ Inativo</span></Campo>
                            )}
                            {l.fundamento_legal && <Campo t="Fundamento legal">{l.fundamento_legal}</Campo>}
                            {l.nota_analista && <Campo t="Nota do analista">{l.nota_analista}</Campo>}
                            {l.versao_compatibilizacao && (
                              <Campo t="Versão de compatibilização">{l.versao_compatibilizacao}</Campo>
                            )}
                          </>
                        )}

                        {/* Seção/implementado — LIP */}
                        {modulo === "LIP" && (
                          <>
                            <Campo t="Seção">{l.secao}</Campo>
                            <Campo t="Implementado">{l.implementado ? "sim" : "não"} · preenchido por <b>{l.preenchidoPor}</b></Campo>
                          </>
                        )}

                        {l.valoresPossiveis?.length > 0 && (
                          <Campo t="Valores possíveis">{l.valoresPossiveis.join(" · ")}</Campo>
                        )}
                        <Campo t="Métodos (ordem de execução)">{l.metodos.join("  →  ")}</Campo>
                        <Campo t="Fonte principal">{l.fontePrincipal}</Campo>
                        {l.fontesComparadas?.length > 0 && (
                          <Campo t="Fontes comparadas">{l.fontesComparadas.join(" · ")}</Campo>
                        )}
                        {l.depende?.length > 0 && <Campo t="Depende de">{l.depende.join(" · ")}</Campo>}
                        <div>
                          <p className="text-[10px] uppercase text-[var(--text-muted)] font-bold">Regras</p>
                          {l.regras?.length > 0
                            ? l.regras.map((r: any, i: number) => (
                              <p key={i} className="text-[var(--text-secondary)]">
                                <b>{r.regra}</b> — {r.descricao}
                                {r.parametros && Object.keys(r.parametros).length
                                  ? ` (${Object.entries(r.parametros).map(([k, v]) => `${k}=${v}`).join(", ")})` : ""}
                              </p>))
                            : <p className="text-[var(--text-muted)]">nenhuma</p>}
                        </div>
                        {l.formula && <Campo t="Fórmula / comparação"><code>{l.formula}</code></Campo>}
                        {l.aplicabilidade && <Campo t="Aplicabilidade">{l.aplicabilidade}</Campo>}
                        {l.regraNP && <Campo t="Regra de NP">{l.regraNP}</Campo>}
                        {l.regraSemDado && <Campo t="Regra de sem dado">{l.regraSemDado}</Campo>}
                        {l.fatoNecessario && <Campo t="Fato necessário">{l.fatoNecessario}</Campo>}
                        <Campo t="Executado por"><code>{l.responsavel}</code></Campo>
                        {l.testes?.length > 0 && <Campo t="Testes">{l.testes.join(" · ")}</Campo>}
                        <Campo t="Versão / hash da regra">v{l.versao} · <code>{l.hash}</code></Campo>
                        {l.observacao && <Campo t="Observação">{l.observacao}</Campo>}

                        {/* Integração LIP — só MAC */}
                        {modulo === "MAC" && (
                          <div className="pt-2 border-t border-[var(--border)]">
                            <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] mb-1">
                              Integração LIP
                              {l.classificacao_lip && (
                                <span className="ml-2 font-normal normal-case"
                                  style={{ color: CORES_CLASSIF_LIP[l.classificacao_lip] ?? "#64748B" }}>
                                  {ROT_CLASSIF_LIP[l.classificacao_lip] ?? l.classificacao_lip}
                                </span>
                              )}
                            </p>
                            {l.lipVinculos?.length > 0 ? (
                              l.lipVinculos.map((v: any, i: number) => (
                                <div key={i} className="ml-2 border-l-2 border-[var(--border)] pl-2 mb-2">
                                  <p className="text-[var(--text-primary)] font-mono text-[10px] font-medium">
                                    {v.lip_chave}{v.obrigatorio ? " *" : ""}
                                    {v.lip_declaracao && (
                                      <span className="ml-2 font-sans font-normal"
                                        style={{ color: CORES[v.lip_declaracao] }}>
                                        ({rotuloStatus[v.lip_declaracao] ?? v.lip_declaracao}
                                        {v.lip_implementado === false ? " — não implementado" : ""})
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[var(--text-muted)] text-[10px]">
                                    papel: <b>{v.papel}</b> · confiança: <b>{v.confianca}</b>
                                    {v.obrigatorio && " · obrigatório"}
                                  </p>
                                  <p className="text-[var(--text-secondary)]">{v.justificativa}</p>
                                </div>
                              ))
                            ) : (
                              <p className="text-[var(--text-muted)] ml-2">Sem vínculo LIP identificado</p>
                            )}
                          </div>
                        )}

                        {/* Integração BIP — só MAC */}
                        {modulo === "MAC" && (
                          <div className="pt-2 border-t border-[var(--border)]">
                            <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] mb-1">
                              Integração BIP
                              {l.classificacao_bip && (
                                <span className="ml-2 font-normal normal-case"
                                  style={{ color: CORES_CLASSIF_BIP[l.classificacao_bip] ?? "#64748B" }}>
                                  {ROT_CLASSIF_BIP[l.classificacao_bip] ?? l.classificacao_bip}
                                </span>
                              )}
                            </p>
                            {l.bipVinculos?.length > 0 ? (
                              l.bipVinculos.map((v: any, i: number) => (
                                <div key={i} className="ml-2 border-l-2 border-[var(--border)] pl-2 mb-1">
                                  <p className="text-[var(--text-primary)] font-mono text-[10px]">
                                    {v.referencia ?? v.fragmentoId}
                                    <span className="ml-2 font-sans font-normal text-[var(--text-muted)]">
                                      [{v.confianca}]
                                    </span>
                                  </p>
                                  <p className="text-[var(--text-secondary)]">
                                    {v.documentoSigla
                                      ? <><b>{v.documentoSigla}</b> — {v.documentoTitulo}</>
                                      : (v.documentoTitulo ?? "documento não encontrado")}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <p className="text-[var(--text-muted)] ml-2">Sem vínculo BIP identificado</p>
                            )}
                          </div>
                        )}

                        {/* Resultado da execução */}
                        {temExecucao && (
                          <div className="mt-2 pt-2 border-t border-[var(--border)]">
                            {l.resultado ? (
                              <>
                                <p className="text-[10px] uppercase font-bold"
                                  style={{ color: CORES_RESULTADO[l.resultado.resultado] }}>
                                  Resultado da execução — {dados.processo}
                                </p>
                                <Campo t="Resultado">
                                  <span style={{ color: CORES_RESULTADO[l.resultado.resultado] }}>
                                    {rotuloResultado[l.resultado.resultado] ?? l.resultado.resultado}
                                  </span>
                                </Campo>
                                {l.resultado.valor && <Campo t="Valor">{l.resultado.valor}</Campo>}
                                {l.resultado.fonte && <Campo t="Fonte">{l.resultado.fonte}</Campo>}
                                {l.resultado.evidencia && <Campo t="Evidência (NP)">{l.resultado.evidencia}</Campo>}
                                {l.resultado.tentativa && (
                                  <Campo t="Tentativa do leitor">
                                    {l.resultado.tentativa.motivo}
                                    {!!l.resultado.tentativa.procurou?.length && (
                                      <> — procurou: {l.resultado.tentativa.procurou.join(", ")}</>
                                    )}
                                    {l.resultado.tentativa.documento && <> · documento: {l.resultado.tentativa.documento}</>}
                                    {l.resultado.tentativa.temCamadaTexto === false && <> · sem camada de texto</>}
                                  </Campo>
                                )}
                                {l.resultado.valorManual && (
                                  <Campo t="Complementado manualmente">
                                    {l.resultado.valorManual} — {l.resultado.complementadoEm}
                                  </Campo>
                                )}
                              </>
                            ) : (
                              <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                                Sem execução automática ainda — processo {dados.processo}
                              </p>
                            )}

                            {modulo === "MAC" && (
                              <div className="mt-2">
                                <p className="text-[10px] uppercase font-bold"
                                  style={{ color: CORES_POSTURA[posturaDe(l)] }}>
                                  Postura — {ROT_POSTURA[posturaDe(l)]}
                                </p>
                                <RespostaItem linha={l} processo={dados.processo}
                                  onSalvo={(v) => atualizarValorManual(l.id, v)} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {!linhas.length && dados && (
            <p className="text-sm text-[var(--text-muted)]">Nenhum registro encontrado.</p>
          )}
        </>
      )}
    </div>
  );
}

function Campo({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-[var(--text-muted)] font-bold">{t}</p>
      <p className="text-[var(--text-secondary)]">{children}</p>
    </div>
  );
}

/**
 * Formulário de resposta assistida do plano do motor MAC Slot 5 (4 posturas). Chama o POST de
 * app/api/admin/rastreabilidade/route.ts — nunca grava direto, só via essa rota.
 */
function RespostaItem({ linha, processo, onSalvo }: { linha: Linha; processo: string; onSalvo: (valorManual: string) => void }) {
  const postura = posturaDe(linha);
  const jaRespondido = !!linha.resultado?.valorManual;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(linha.resultado?.valorManual ?? linha.resultado?.valor ?? "");
  const [status, setStatus] = useState<"idle" | "salvando" | "erro">("idle");
  const [erro, setErro] = useState("");

  const rotuloAcao = postura === "RESOLVIDO"
    ? "Confirmar"
    : postura === "DADO_NECESSARIO" ? "Registrar resposta" : "Registrar veredito";

  async function salvar() {
    if (!valor.trim()) return;
    setStatus("salvando"); setErro("");
    try {
      const r = await fetch("/api/admin/rastreabilidade", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: "MAC", slot: "slot_05", processo, chave: linha.id, valorManual: valor.trim() }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao gravar");
      onSalvo(valor.trim());
      setEditando(false);
      setStatus("idle");
    } catch (e: any) {
      setStatus("erro"); setErro(String(e?.message ?? e));
    }
  }

  if (postura === "NAO_APLICAVEL") {
    return <p className="text-[10px] text-[var(--text-muted)]">Recolhido — não aplicável, sem ação necessária.</p>;
  }

  if (jaRespondido && !editando) {
    return (
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-[var(--text-secondary)]">
          resposta: <b>{linha.resultado.valorManual}</b>
        </span>
        <button onClick={() => setEditando(true)} className="underline text-[var(--text-muted)]">editar</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {postura === "RESOLVIDO" && (
        <p className="text-[10px] text-[var(--text-muted)]">
          valor lido automaticamente: <b>{linha.resultado?.valor ?? "—"}</b> — confira antes de confirmar
        </p>
      )}
      {jaRespondido && editando && (
        <p className="text-[10px] text-[var(--text-muted)]">resposta anterior: <b>{linha.resultado.valorManual}</b></p>
      )}
      <div className="flex items-center gap-2">
        <textarea value={valor} onChange={(e) => setValor(e.target.value)} rows={2}
          className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-xs text-[var(--text-primary)]" />
        <button onClick={salvar} disabled={status === "salvando" || !valor.trim()}
          className="px-3 py-1 rounded text-xs font-semibold bg-[var(--primary)] text-white disabled:opacity-50 shrink-0">
          {status === "salvando" ? "salvando…" : rotuloAcao}
        </button>
        {jaRespondido && editando && (
          <button onClick={() => { setEditando(false); setValor(linha.resultado.valorManual); setStatus("idle"); }}
            className="text-[10px] underline text-[var(--text-muted)] shrink-0">cancelar</button>
        )}
      </div>
      {status === "erro" && <p className="text-[10px] text-[#DC2626]">✗ {erro}</p>}
    </div>
  );
}
