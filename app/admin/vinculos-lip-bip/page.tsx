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
function Secao({ titulo, descricao, acao, children }: { titulo: string; descricao?: React.ReactNode; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{titulo}</h2>
          {descricao && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">{descricao}</p>}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
      {children}
    </section>
  );
}

const ASSUNTOS = [{ slug: "regularizacao", nome: "Regularização SEI" }, { slug: "aceite_sei", nome: "Aceite SEI" }];
// Slot 5 entra só na comparação de cobertura (Fase Q) — não tem fila aqui, mecanismo próprio em
// /admin/filtros-slot5. Ver app/api/mac/vinculos-fila/cobertura-slot5/route.ts.
const SLOT5 = { slug: "slot_05", nome: "Aprovação de Projeto (Slot 5)" };

type ItemFila = {
  itemId: string; grupo: string; texto: string; tipo: "LIP" | "BIP"; slot: string;
  referenciaChecklist: string | null; fundamentoLegalCadastrado: string | null; campoLipRelacionado: string | null;
  prioridade: { recorrenciaProcessosDistintos: number; motivo: string };
};
type Cobertura = {
  total_itens: number; lip: { vinculado: number; sem_vinculo: number }; bip: { vinculado: number; sem_vinculo: number }; sem_nenhum_vinculo: number;
  bip_por_estado?: { aprovado: number; com_candidato_pendente: number; sem_nada: number };
  itens_prioritarios_sem_fundamento?: { itemId: string; grupo: string; texto: string; recorrencia: number }[];
};
type CandidatoBip = { id: string; referencia: string; lei: string; trecho: string; distancia: number; confiancaSugerida: "MEDIA" | "BAIXA" };
type CandidatosDoItem = { candidatos: CandidatoBip[]; baseInsuficiente: boolean };
// Fase T — lote inicial de revisão: até 10 itens BIP mais prioritários por assunto.
const TAMANHO_LOTE_INICIAL = 10;
type Pendente = {
  propostaId: string; itemId: string; grupo: string; texto: string; tipo: "LIP" | "BIP";
  lipChave: string | null; papel: string | null; obrigatorio: boolean | null;
  bipFragmentoId: string | null; bipReferencia: string | null; bipLei: string | null;
  confianca: string; justificativa: string; criadoPorNome: string; criadoEm: string;
};

export default function VinculosLipBipPage() {
  const [assunto, setAssunto] = useState(ASSUNTOS[0].slug);
  const [assuntoId, setAssuntoId] = useState<string | null>(null);
  const [aba, setAba] = useState<"fila" | "pendentes" | "lote-inicial">("fila");
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
  // Fase Q — candidato por busca vetorial, buscado em lote sob ação explícita (nunca automático).
  // Guardado por itemId; nunca gravado no banco daqui — só exibição, "usar candidato" abre o
  // modal de proposta já existente com o valor pré-preenchido, revisão humana continua obrigatória.
  const [candidatosBip, setCandidatosBip] = useState<Record<string, CandidatosDoItem | undefined>>({});
  const [buscandoCandidatos, setBuscandoCandidatos] = useState(false);
  const [avisoCandidatos, setAvisoCandidatos] = useState<string | null>(null);
  const [candidatoParaModal, setCandidatoParaModal] = useState<CandidatoBip | null>(null);

  async function buscarCandidatosPara(itens: ItemFila[]) {
    const pendentesDeBusca = itens.filter((i) => candidatosBip[i.itemId] === undefined).slice(0, 25);
    if (pendentesDeBusca.length === 0) return;
    setBuscandoCandidatos(true);
    setAvisoCandidatos(null);
    try {
      const r = await fetch("/api/mac/vinculos-fila/candidatos-bip", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: pendentesDeBusca.map((i) => ({ itemId: i.itemId, grupo: i.grupo, texto: i.texto })) }),
      });
      const j = await r.json();
      if (!j.ok) { setAvisoCandidatos(j.erro ?? "falha ao buscar candidatos"); return; }
      if (j.aviso) setAvisoCandidatos(j.aviso);
      setCandidatosBip((atual) => {
        const novo = { ...atual };
        for (const c of j.candidatos) novo[c.itemId] = { candidatos: c.candidatos ?? [], baseInsuficiente: !!c.baseInsuficiente };
        return novo;
      });
    } catch {
      setAvisoCandidatos("falha técnica ao buscar candidatos");
    } finally {
      setBuscandoCandidatos(false);
    }
  }
  const buscarCandidatosEmLote = () => buscarCandidatosPara(fila.filter((i) => i.tipo === "BIP"));

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

  useEffect(() => { setCandidatosBip({}); setAvisoCandidatos(null); carregar(); }, [assunto]);

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

  // Cobertura do Slot 5 (Fase Q) — só leitura, carregada uma vez, sem depender do assunto
  // selecionado (Slot 5 não tem fila aqui).
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/mac/vinculos-fila/cobertura-slot5");
        const j = await r.json();
        if (j.ok) setCoberturaPorAssunto((atual) => ({ ...atual, [SLOT5.slug]: j.cobertura ?? null }));
      } catch { /* comparação é conveniência */ }
    })();
  }, []);

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

      <Secao titulo="Cobertura jurídica por slot" descricao="Slot 5 é só leitura aqui — tem mecanismo e tela próprios (/admin/filtros-slot5), esta linha é comparação, não fila. Base jurídica ausente = cobertura BIP não vinculada.">
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
            {[...ASSUNTOS, SLOT5].map((a) => {
              const c = coberturaPorAssunto[a.slug];
              const ehSlot5 = a.slug === SLOT5.slug;
              return (
                <tr key={a.slug} className={`border-b border-[var(--border)] last:border-0 ${a.slug === assunto ? "bg-[var(--bg-card-hover)]" : ""} ${ehSlot5 ? "opacity-80" : ""}`}>
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{a.nome}{ehSlot5 && <span className="ml-1.5 text-[10px] font-normal text-[var(--text-muted)]">(fora desta fila)</span>}</td>
                  {c ? (
                    <>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{c.total_itens}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{c.lip.vinculado} de {c.total_itens} ({Math.round(100 * c.lip.vinculado / (c.total_itens || 1))}%)</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{c.bip.vinculado} de {c.total_itens} ({Math.round(100 * c.bip.vinculado / (c.total_itens || 1))}%)</td>
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

      {cobertura?.bip_por_estado && (
        <Secao titulo="Base legal (BIP) — 3 estados" descricao="'Com candidato pendente' nunca é vínculo real — é uma proposta em mac_vinculos_propostas ainda aguardando aprovação administrativa (aba 'Aguardando aprovação').">
          <div className="grid grid-cols-3 gap-3 p-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Vínculo aprovado</div>
              <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{cobertura.bip_por_estado.aprovado}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Com candidato pendente</div>
              <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{cobertura.bip_por_estado.com_candidato_pendente}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Sem nada ainda</div>
              <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{cobertura.bip_por_estado.sem_nada}</div>
            </div>
          </div>
          {!!cobertura.itens_prioritarios_sem_fundamento?.length && (
            <div className="border-t border-[var(--border)] px-5 py-3">
              <div className="mb-1.5 text-[11px] font-medium text-[var(--text-primary)]">Itens prioritários ainda sem fundamento (mais recorrentes primeiro)</div>
              <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                {cobertura.itens_prioritarios_sem_fundamento.map((i) => (
                  <li key={i.itemId}>{i.grupo} — {i.texto} <span className="text-[var(--text-muted)]">({i.recorrencia} processo{i.recorrencia > 1 ? "s" : ""} distinto{i.recorrencia > 1 ? "s" : ""})</span></li>
                ))}
              </ul>
            </div>
          )}
        </Secao>
      )}

      <div className="mb-4 flex items-center gap-2 border-b border-[var(--border)]">
        {(["fila", "lote-inicial", "pendentes"] as const).map((t) => (
          <button key={t} onClick={() => setAba(t)}
            className={`px-3 py-2 text-xs font-medium ${aba === t ? "border-b-2 border-[var(--accent)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
            {t === "fila" ? `Fila (${fila.length})` : t === "lote-inicial" ? `Lote inicial (até ${TAMANHO_LOTE_INICIAL})` : `Aguardando aprovação (${pendentes.length})`}
          </button>
        ))}
      </div>

      {aviso && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{aviso}</div>}
      {erro && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>}
      {carregando && <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> carregando…</div>}

      {!carregando && aba === "fila" && (
        <Secao
          titulo="Itens sem vínculo — ordenados por prioridade"
          descricao="Item mais recorrente como 'não conforme' (mac_historico) primeiro — é onde a falta de base legal citável mais aparece na prática. Item do checklist ativo sem chave LIP nem fragmento BIP, e sem proposta pendente."
          acao={fila.some((i) => i.tipo === "BIP") ? (
            <button className={BTN_SECUNDARIO} onClick={buscarCandidatosEmLote} disabled={buscandoCandidatos} title="Busca semântica por IA (custo pequeno de embedding, 1 por item) — ação explícita, nunca automática">
              {buscandoCandidatos ? "Buscando…" : "🔎 Buscar candidatos por similaridade (até 25 itens BIP)"}
            </button>
          ) : undefined}
        >
          {avisoCandidatos && <div className="border-b border-[var(--border)] bg-amber-50 px-5 py-2 text-[11px] text-amber-700">{avisoCandidatos}</div>}
          {fila.length === 0 ? (
            <div className="px-5 py-6 text-xs text-[var(--text-muted)]">Nenhum item pendente de proposta neste assunto/tipo — fila vazia.</div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {fila.map((i) => {
                const info = i.tipo === "BIP" ? candidatosBip[i.itemId] : undefined;
                const melhor = info?.candidatos[0];
                return (
                <li key={`${i.itemId}:${i.tipo}`} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--text-primary)]">{i.grupo} {i.referenciaChecklist && <span className="text-[var(--text-muted)]">· {i.referenciaChecklist}</span>}</div>
                      <div className="truncate text-xs text-[var(--text-muted)]">{i.texto}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-[var(--text-muted)]">
                        {i.prioridade.recorrenciaProcessosDistintos > 0 && <span className="font-medium text-amber-700">prioridade: {i.prioridade.motivo}</span>}
                        {i.fundamentoLegalCadastrado && <span>fundamento já cadastrado: {i.fundamentoLegalCadastrado}</span>}
                        {i.campoLipRelacionado && <span>campo LIP: <code>{i.campoLipRelacionado}</code></span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tom={i.tipo === "LIP" ? "info" : "aviso"}>{i.tipo}</Badge>
                      <button className={BTN_SECUNDARIO} onClick={() => setItemAberto(i)}>Propor</button>
                    </div>
                  </div>
                  {info && !info.baseInsuficiente && melhor && (
                    <div className="mt-2 rounded-lg border border-[var(--accent)] bg-[var(--bg-card-hover)] px-3 py-2 text-[11px]">
                      <div className="mb-0.5 font-medium text-amber-700">candidato por similaridade — proposta, exige revisão humana</div>
                      <div className="text-[var(--text-secondary)]"><strong>{melhor.referencia}</strong> — {melhor.lei}</div>
                      <div className="text-[var(--text-muted)]">{melhor.trecho}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tom="neutro">confiança sugerida: {melhor.confiancaSugerida}</Badge>
                        <button className="text-[var(--accent)] underline" onClick={() => { setCandidatoParaModal(melhor); setItemAberto(i); }}>usar este candidato →</button>
                      </div>
                    </div>
                  )}
                  {info?.baseInsuficiente && (
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]"><Badge tom="neutro">base insuficiente</Badge> nenhum candidato próximo o bastante — proponha manualmente ou deixe pendente.</div>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </Secao>
      )}

      {!carregando && aba === "lote-inicial" && (
        <Secao
          titulo={`Lote inicial de revisão jurídica — até ${TAMANHO_LOTE_INICIAL} itens de ${ASSUNTOS.find((a) => a.slug === assunto)?.nome}`}
          descricao="Fase T — os itens mais recorrentes desta fila, com até 3 candidatos de fundamento legal cada. Nada aqui é vínculo aprovado, nem item MAC ou campo LIP alterado, nem proposta enviada em seu nome: cada 'usar este candidato' só abre o modal de proposta pra você revisar e confirmar."
          acao={
            <button className={BTN_SECUNDARIO} onClick={() => buscarCandidatosPara(fila.filter((i) => i.tipo === "BIP").slice(0, TAMANHO_LOTE_INICIAL))} disabled={buscandoCandidatos} title="Busca semântica por IA (custo pequeno de embedding, até 3 candidatos por item) — ação explícita, nunca automática">
              {buscandoCandidatos ? "Buscando…" : `🔎 Carregar candidatos do lote (${Math.min(TAMANHO_LOTE_INICIAL, fila.filter((i) => i.tipo === "BIP").length)} itens)`}
            </button>
          }
        >
          {avisoCandidatos && <div className="border-b border-[var(--border)] bg-amber-50 px-5 py-2 text-[11px] text-amber-700">{avisoCandidatos}</div>}
          {(() => {
            const lote = fila.filter((i) => i.tipo === "BIP").slice(0, TAMANHO_LOTE_INICIAL);
            if (lote.length === 0) return <div className="px-5 py-6 text-xs text-[var(--text-muted)]">Nenhum item BIP pendente neste assunto — fila vazia ou tudo já tem vínculo/proposta.</div>;
            return (
              <ul className="divide-y divide-[var(--border)]">
                {lote.map((i, idx) => {
                  const info = candidatosBip[i.itemId];
                  return (
                    <li key={i.itemId} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">#{idx + 1} · {ASSUNTOS.find((a) => a.slug === i.slot)?.nome ?? i.slot}</div>
                          <div className="text-xs font-medium text-[var(--text-primary)]">{i.grupo} {i.referenciaChecklist && <span className="text-[var(--text-muted)]">· {i.referenciaChecklist}</span>}</div>
                          <div className="text-xs text-[var(--text-muted)]">{i.texto}</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--text-muted)]">
                            <span className="font-medium text-amber-700">recorrência: {i.prioridade.motivo}</span>
                            <span>campo LIP: {i.campoLipRelacionado ? <code>{i.campoLipRelacionado}</code> : "nenhum relacionado"}</span>
                            <span>fundamento já cadastrado: {i.fundamentoLegalCadastrado ?? "nenhum"}</span>
                          </div>
                        </div>
                        <button className={BTN_SECUNDARIO} onClick={() => setItemAberto(i)}>Propor manualmente</button>
                      </div>

                      {!info && <div className="mt-2 text-[10px] text-[var(--text-muted)]">candidatos ainda não buscados — use "Carregar candidatos do lote" acima.</div>}
                      {info?.baseInsuficiente && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px]"><Badge tom="neutro">base insuficiente</Badge><span className="text-[var(--text-muted)]">nenhum trecho do BIP ficou próximo o bastante pra sugerir com alguma confiança — não force certeza aqui, proponha manualmente se souber o fundamento.</span></div>
                      )}
                      {info && !info.baseInsuficiente && info.candidatos.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          <div className="text-[10px] font-medium text-amber-700">até {info.candidatos.length} candidato(s) por similaridade — proposta, exige revisão humana</div>
                          {info.candidatos.map((c, ci) => (
                            <div key={c.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card-hover)] px-3 py-2 text-[11px]">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[var(--text-secondary)]"><strong>{ci + 1}. {c.referencia}</strong> — {c.lei}</div>
                                <Badge tom={c.confiancaSugerida === "MEDIA" ? "aviso" : "neutro"}>{c.confiancaSugerida} · distância {c.distancia.toFixed(3)}</Badge>
                              </div>
                              <div className="mt-0.5 text-[var(--text-muted)]">{c.trecho}</div>
                              <div className="mt-1 text-[10px] text-[var(--text-muted)]">origem: busca vetorial (gemini-embedding-001) contra bdi_lei_fragmentos — proposta, exige revisão humana antes de propor</div>
                              <button className="mt-1 text-[var(--accent)] underline" onClick={() => { setCandidatoParaModal(c); setItemAberto(i); }}>usar este candidato →</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            );
          })()}
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
        <PropostaModal
          item={itemAberto}
          assuntoId={assuntoId}
          candidatoInicial={candidatoParaModal}
          onFechar={() => { setItemAberto(null); setCandidatoParaModal(null); }}
          onEnviado={() => { setItemAberto(null); setCandidatoParaModal(null); carregar(); }}
        />
      )}
    </div>
  );
}

function PropostaModal({ item, assuntoId, candidatoInicial, onFechar, onEnviado }: { item: ItemFila; assuntoId: string; candidatoInicial?: CandidatoBip | null; onFechar: () => void; onEnviado: () => void }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);
  // Candidato vindo da busca vetorial em lote (Fase Q) já entra PRÉ-SELECIONADO — mas continua
  // sendo só uma proposta: confiança/justificativa ficam editáveis e "enviar proposta" é sempre
  // um clique humano explícito, igual a qualquer outra proposta desta fila.
  const [escolhido, setEscolhido] = useState<any | null>(candidatoInicial ? { id: candidatoInicial.id, referencia: candidatoInicial.referencia, lei: candidatoInicial.lei } : null);
  const [papel, setPapel] = useState("EVIDENCIA");
  const [obrigatorio, setObrigatorio] = useState(false);
  const [confianca, setConfianca] = useState<string>(candidatoInicial?.confiancaSugerida ?? "MEDIA");
  const [justificativa, setJustificativa] = useState(
    candidatoInicial ? `Candidato por busca vetorial (distância ${candidatoInicial.distancia.toFixed(3)}) — revisado e confirmado por mim antes de propor.` : "",
  );
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
