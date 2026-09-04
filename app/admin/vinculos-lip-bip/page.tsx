"use client";
import React, { useEffect, useState } from "react";
import { Loader2, Search, Check, X, Link2 } from "lucide-react";

/**
 * app/admin/vinculos-lip-bip/page.tsx — fila e procedimento manual de vinculação LIP/BIP,
 * Regularização SEI e Aceite SEI (achado da Fase 4 de "TAREFA DA NOITE": 0% de vínculo BIP nesses
 * dois assuntos). Nunca cria vínculo automático — toda proposta passa por aprovação administrativa
 * explícita (ver app/api/mac/vinculos-fila/*). Slot 5 não usa esta tela — tem seu próprio mecanismo
 * em /admin/filtros-slot5 (bip-vinculos).
 *
 * Mesmos tokens visuais de app/admin/bdi/page.tsx — nenhuma regra de dado mora aqui.
 */

const TONS: Record<string, string> = {
  info: "bg-sky-50 text-sky-700 border-sky-200",
  aviso: "bg-amber-50 text-amber-700 border-amber-200",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  erro: "bg-red-50 text-red-700 border-red-200",
  neutro: "bg-slate-100 text-slate-600 border-slate-200",
};
function Badge({ tom = "neutro", children }: { tom?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONS[tom] ?? TONS.neutro}`}>{children}</span>;
}
const BTN_PRIMARIO = "inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50";
const BTN_SECUNDARIO = "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)]";
function Secao({ titulo, descricao, children }: { titulo: string; descricao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{titulo}</h2>
        {descricao && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

const ASSUNTOS = [{ slug: "regularizacao", nome: "Regularização SEI" }, { slug: "aceite_sei", nome: "Aceite SEI" }];

type ItemFila = {
  itemId: string; grupo: string; texto: string; tipo: "LIP" | "BIP";
  referenciaChecklist: string | null; fundamentoLegalCadastrado: string | null; campoLipRelacionado: string | null;
};
type Cobertura = { total_itens: number; lip: { vinculado: number; sem_vinculo: number }; bip: { vinculado: number; sem_vinculo: number }; sem_nenhum_vinculo: number };
type Pendente = {
  propostaId: string; itemId: string; grupo: string; texto: string; tipo: "LIP" | "BIP";
  lipChave: string | null; papel: string | null; obrigatorio: boolean | null;
  bipFragmentoId: string | null; bipReferencia: string | null; bipLei: string | null;
  confianca: string; justificativa: string; criadoPorNome: string; criadoEm: string;
};

export default function VinculosLipBipPage() {
  const [assunto, setAssunto] = useState(ASSUNTOS[0].slug);
  const [assuntoId, setAssuntoId] = useState<string | null>(null);
  const [aba, setAba] = useState<"fila" | "pendentes">("fila");
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [itemAberto, setItemAberto] = useState<ItemFila | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cobertura, setCobertura] = useState<Cobertura | null>(null);
  // Fase G — "evidenciar cobertura por slot": comparação lado a lado dos 2 assuntos desta
  // fila, sem precisar alternar a aba pra ver o outro. Slot 5 não entra aqui de propósito
  // (tem mecanismo e tela próprios, ver comentário no topo do arquivo).
  const [coberturaPorAssunto, setCoberturaPorAssunto] = useState<Record<string, Cobertura | null>>({});

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/mac/vinculos-fila?assunto=${assunto}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "falha ao carregar");
      setFila(j.fila);
      setPendentes(j.pendentes);
      setAssuntoId(j.assuntoId);
      setCobertura(j.cobertura ?? null);
      setCoberturaPorAssunto((atual) => ({ ...atual, [assunto]: j.cobertura ?? null }));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [assunto]);

  // Carrega a cobertura do OUTRO assunto em segundo plano, só pra alimentar a comparação —
  // não mexe em fila/pendentes/aba selecionada.
  useEffect(() => {
    ASSUNTOS.filter((a) => a.slug !== assunto).forEach(async (a) => {
      try {
        const r = await fetch(`/api/mac/vinculos-fila?assunto=${a.slug}`);
        const j = await r.json();
        if (j.ok) setCoberturaPorAssunto((atual) => ({ ...atual, [a.slug]: j.cobertura ?? null }));
      } catch { /* comparação é conveniência — falha aqui não bloqueia a tela principal */ }
    });
  }, [assunto]);

  async function decidir(propostaId: string, decisao: "aprovado" | "rejeitado") {
    let motivo: string | null = null;
    if (decisao === "rejeitado") {
      motivo = window.prompt("Motivo da rejeição (obrigatório):");
      if (!motivo || !motivo.trim()) return;
    }
    setAviso(null);
    const r = await fetch("/api/mac/vinculos-fila/decidir", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propostaId, decisao, motivo }),
    });
    const j = await r.json();
    if (!j.ok) { setAviso(j.erro); return; }
    carregar();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2">
        <Link2 className="h-5 w-5 text-[var(--text-muted)]" />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Vinculação LIP/BIP — fila manual</h1>
      </div>
      <p className="mb-5 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
        Regularização SEI e Aceite SEI ainda não têm vínculo legal (BIP) cadastrado. Esta fila propõe
        vínculo item-a-item — nenhum vínculo é criado automaticamente nem por semelhança textual: toda
        proposta cita um campo do LIP ou um fragmento do BIP que existe de verdade, e só vira vínculo
        real depois de aprovação administrativa explícita.
      </p>

      <div className="mb-4 flex items-center gap-2">
        {ASSUNTOS.map((a) => (
          <button key={a.slug} onClick={() => setAssunto(a.slug)}
            className={assunto === a.slug ? BTN_PRIMARIO : BTN_SECUNDARIO}>{a.nome}</button>
        ))}
      </div>

      <Secao titulo="Cobertura — comparação entre os 2 assuntos desta fila" descricao="Slot 5 tem mecanismo e tela próprios (não entra aqui). Base jurídica ausente = cobertura BIP não vinculada.">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Assunto</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Itens ativos</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Cobertura LIP</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Cobertura BIP</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Sem base legal (BIP)</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Sem nenhum vínculo</th>
            </tr>
          </thead>
          <tbody>
            {ASSUNTOS.map((a) => {
              const c = coberturaPorAssunto[a.slug];
              return (
                <tr key={a.slug} className={`border-b border-[var(--border)] last:border-0 ${a.slug === assunto ? "bg-[var(--bg-card-hover)]" : ""}`}>
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{a.nome}</td>
                  {c ? (
                    <>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{c.total_itens}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{c.lip.vinculado} de {c.total_itens}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{c.bip.vinculado} de {c.total_itens}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{c.bip.sem_vinculo}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{c.sem_nenhum_vinculo}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-3 py-2 text-[var(--text-muted)]">carregando…</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Secao>

      {cobertura && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Itens ativos</div>
            <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{cobertura.total_itens}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Cobertura LIP</div>
            <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{cobertura.lip.vinculado} <span className="text-xs font-normal text-[var(--text-muted)]">de {cobertura.total_itens}</span></div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Cobertura BIP</div>
            <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{cobertura.bip.vinculado} <span className="text-xs font-normal text-[var(--text-muted)]">de {cobertura.total_itens}</span></div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Sem nenhum vínculo (LIP e BIP)</div>
            <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{cobertura.sem_nenhum_vinculo}</div>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2 border-b border-[var(--border)]">
        {(["fila", "pendentes"] as const).map((t) => (
          <button key={t} onClick={() => setAba(t)}
            className={`px-3 py-2 text-xs font-medium ${aba === t ? "border-b-2 border-[var(--accent)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
            {t === "fila" ? `Fila (${fila.length})` : `Aguardando aprovação (${pendentes.length})`}
          </button>
        ))}
      </div>

      {aviso && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{aviso}</div>}
      {erro && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>}
      {carregando && <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> carregando…</div>}

      {!carregando && aba === "fila" && (
        <Secao titulo="Itens sem vínculo" descricao="Item do checklist ativo sem chave LIP nem fragmento BIP, e sem proposta pendente.">
          {fila.length === 0 ? (
            <div className="px-5 py-6 text-xs text-[var(--text-muted)]">Nenhum item pendente de proposta neste assunto/tipo — fila vazia.</div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {fila.map((i) => (
                <li key={`${i.itemId}:${i.tipo}`} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[var(--text-primary)]">{i.grupo} {i.referenciaChecklist && <span className="text-[var(--text-muted)]">· {i.referenciaChecklist}</span>}</div>
                    <div className="truncate text-xs text-[var(--text-muted)]">{i.texto}</div>
                    {(i.fundamentoLegalCadastrado || i.campoLipRelacionado) && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-[var(--text-muted)]">
                        {i.fundamentoLegalCadastrado && <span>fundamento já cadastrado: {i.fundamentoLegalCadastrado}</span>}
                        {i.campoLipRelacionado && <span>campo LIP: <code>{i.campoLipRelacionado}</code></span>}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tom={i.tipo === "LIP" ? "info" : "aviso"}>{i.tipo}</Badge>
                    <button className={BTN_SECUNDARIO} onClick={() => setItemAberto(i)}>Propor</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}

      {!carregando && aba === "pendentes" && (
        <Secao titulo="Aguardando aprovação administrativa" descricao="Só Administrador/Diretora decide, e nunca quem propôs.">
          {pendentes.length === 0 ? (
            <div className="px-5 py-6 text-xs text-[var(--text-muted)]">Nenhuma proposta pendente.</div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {pendentes.map((p) => (
                <li key={p.propostaId} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--text-primary)]">{p.grupo} <Badge tom={p.tipo === "LIP" ? "info" : "aviso"}>{p.tipo}</Badge> <Badge tom="neutro">{p.confianca}</Badge></div>
                      <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{p.texto}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        {p.tipo === "LIP" ? <>campo <code className="rounded bg-[var(--bg-card-hover)] px-1">{p.lipChave}</code> · papel {p.papel} · {p.obrigatorio ? "obrigatório" : "apoio"}</>
                          : <>{p.bipReferencia} — {p.bipLei}</>}
                      </div>
                      <div className="mt-1 text-xs italic text-[var(--text-muted)]">"{p.justificativa}"</div>
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">proposto por {p.criadoPorNome} em {new Date(p.criadoEm).toLocaleString("pt-BR")}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button className={BTN_PRIMARIO} onClick={() => decidir(p.propostaId, "aprovado")}><Check className="h-3.5 w-3.5" /> aprovar</button>
                      <button className={BTN_SECUNDARIO} onClick={() => decidir(p.propostaId, "rejeitado")}><X className="h-3.5 w-3.5" /> rejeitar</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}

      {itemAberto && assuntoId && (
        <PropostaModal item={itemAberto} assuntoId={assuntoId} onFechar={() => setItemAberto(null)} onEnviado={() => { setItemAberto(null); carregar(); }} />
      )}
    </div>
  );
}

function PropostaModal({ item, assuntoId, onFechar, onEnviado }: { item: ItemFila; assuntoId: string; onFechar: () => void; onEnviado: () => void }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);
  const [escolhido, setEscolhido] = useState<any | null>(null);
  const [papel, setPapel] = useState("EVIDENCIA");
  const [obrigatorio, setObrigatorio] = useState(false);
  const [confianca, setConfianca] = useState("MEDIA");
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Busca por similaridade (embedding real, custo real) é SEMPRE ação explícita — nunca liga
  // no debounce automático abaixo, que continua ilike/gratuito. Ver
  // app/api/mac/vinculos-fila/buscar-bip/route.ts.
  const [viaSimilaridade, setViaSimilaridade] = useState(false);
  const [buscandoSimilar, setBuscandoSimilar] = useState(false);

  useEffect(() => {
    if (busca.trim().length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      const url = item.tipo === "LIP"
        ? `/api/mac/vinculos-fila/buscar-lip?assuntoId=${assuntoId}&q=${encodeURIComponent(busca)}`
        : `/api/mac/vinculos-fila/buscar-bip?q=${encodeURIComponent(busca)}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j.ok) { setResultados(j.resultados); setViaSimilaridade(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, item.tipo, assuntoId]);

  async function buscarPorSimilaridade() {
    if (busca.trim().length < 2) return;
    setBuscandoSimilar(true);
    try {
      const r = await fetch(`/api/mac/vinculos-fila/buscar-bip?q=${encodeURIComponent(busca)}&modo=similaridade`);
      const j = await r.json();
      if (j.ok) { setResultados(j.resultados); setViaSimilaridade(!!j.por_similaridade); }
    } finally {
      setBuscandoSimilar(false);
    }
  }

  async function enviar() {
    if (!escolhido || !justificativa.trim()) return;
    setEnviando(true);
    setErro(null);
    const corpo: any = { itemId: item.itemId, tipo: item.tipo, confianca, justificativa };
    if (item.tipo === "LIP") { corpo.lipChave = escolhido.chave; corpo.papel = papel; corpo.obrigatorio = obrigatorio; }
    else { corpo.bipFragmentoId = escolhido.id; }
    const r = await fetch("/api/mac/vinculos-fila/propor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json();
    setEnviando(false);
    if (!j.ok) { setErro(j.erro); return; }
    onEnviado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onFechar}>
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <div className="text-xs font-semibold text-[var(--text-primary)]">{item.grupo}</div>
          <div className="text-xs text-[var(--text-muted)]">{item.texto}</div>
        </div>

        <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">
          {item.tipo === "LIP" ? "Buscar campo do LIP" : "Buscar fragmento do BIP (artigo/palavra-chave)"}
        </label>
        <div className="relative mb-2 flex gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={busca} onChange={(e) => { setBusca(e.target.value); setEscolhido(null); setViaSimilaridade(false); }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-page)] py-1.5 pl-7 pr-2 text-xs" placeholder="digite ao menos 2 caracteres" />
          </div>
          {item.tipo === "BIP" && (
            <button
              type="button"
              onClick={buscarPorSimilaridade}
              disabled={busca.trim().length < 2 || buscandoSimilar}
              title="Busca semântica por IA (gera custo pequeno de embedding) — a busca automática acima é sempre a textual, gratuita."
              className="whitespace-nowrap rounded-lg border border-[var(--border)] px-2 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50"
            >
              {buscandoSimilar ? "Buscando…" : "🔎 Por similaridade (IA)"}
            </button>
          )}
        </div>
        {viaSimilaridade && resultados.length > 0 && !escolhido && (
          <div className="mb-1 text-[10px] text-[var(--text-muted)]">Resultado por similaridade semântica — confira o trecho antes de propor, é sugestão, não vínculo.</div>
        )}
        {resultados.length > 0 && !escolhido && (
          <ul className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-[var(--border)]">
            {resultados.map((r) => (
              <li key={r.chave ?? r.id} className="cursor-pointer border-b border-[var(--border)] px-3 py-2 text-xs last:border-0 hover:bg-[var(--bg-card-hover)]" onClick={() => setEscolhido(r)}>
                {item.tipo === "LIP" ? <><code>{r.chave}</code> — {r.label} <span className="text-[var(--text-muted)]">({r.aba})</span></>
                  : <><strong>{r.referencia}</strong> — {r.lei}<div className="text-[var(--text-muted)]">{r.trecho}</div></>}
              </li>
            ))}
          </ul>
        )}
        {escolhido && (
          <div className="mb-3 rounded-lg border border-[var(--accent)] bg-[var(--bg-card-hover)] px-3 py-2 text-xs">
            {item.tipo === "LIP" ? <>selecionado: <code>{escolhido.chave}</code> — {escolhido.label}</> : <>selecionado: <strong>{escolhido.referencia}</strong> — {escolhido.lei}</>}
            <button className="ml-2 text-[var(--text-muted)] underline" onClick={() => setEscolhido(null)}>trocar</button>
          </div>
        )}

        {item.tipo === "LIP" && escolhido && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">Papel</label>
              <select value={papel} onChange={(e) => setPapel(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-page)] px-2 py-1.5 text-xs">
                {["ENTRADA_REGRA", "CONDICAO_APLICABILIDADE", "EVIDENCIA", "PARAMETRO_CALCULO", "CONTEXTO", "RESULTADO_ESPERADO"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">Obrigatório?</label>
              <select value={obrigatorio ? "sim" : "nao"} onChange={(e) => setObrigatorio(e.target.value === "sim")} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-page)] px-2 py-1.5 text-xs">
                <option value="nao">Apoio/contexto</option>
                <option value="sim">Indispensável</option>
              </select>
            </div>
          </div>
        )}

        <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">Confiança</label>
        <select value={confianca} onChange={(e) => setConfianca(e.target.value)} className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-page)] px-2 py-1.5 text-xs">
          <option value="ALTA">ALTA</option><option value="MEDIA">MÉDIA</option><option value="BAIXA">BAIXA</option>
        </select>

        <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">Justificativa (obrigatória)</label>
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3}
          className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-page)] px-2 py-1.5 text-xs" placeholder="por que este campo/artigo se aplica a este item" />

        {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{erro}</div>}

        <div className="flex justify-end gap-2">
          <button className={BTN_SECUNDARIO} onClick={onFechar}>cancelar</button>
          <button className={BTN_PRIMARIO} disabled={!escolhido || !justificativa.trim() || enviando} onClick={enviar}>
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "enviar proposta"}
          </button>
        </div>
      </div>
    </div>
  );
}
