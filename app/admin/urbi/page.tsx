"use client";
import React from "react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Search, Bot, Check } from "lucide-react";
import { isPerfilIrrestrito } from "@/lib/perfis";

/**
 * Primeira versão do módulo administrativo próprio do URBI — consolida
 * observabilidade que hoje está espalhada (histórico dentro do BDI, uso/
 * custo dentro de /admin/rastreabilidade, sugestões sem UI nenhuma) SEM
 * mover nem apagar nada de onde já está. Todas as 5 abas leem tabela que já
 * existe; nenhum card mostra número sem dizer a fonte.
 *
 * Nunca escreve em LIP/MAC/processo — a única escrita daqui é `estado` de
 * urbi_sugestoes (sempre com decidido_por/decidido_em) e `valor` de
 * urbi_config (kill switch e demais chaves já existentes).
 */

// ---- casca visual: mesma convenção dos outros /admin (ver app/admin/bdi/page.tsx) ----
const TH = "px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap";
const TD = "px-3 py-2 text-[var(--text-secondary)] align-top";
const TR = "border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-card-hover)]";
const BTN_PRIMARIO = "inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_SECUNDARIO = "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed";
const INPUT = "rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]";

const TONS: Record<string, string> = {
  accent: "bg-indigo-50 text-indigo-700 border-indigo-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  aviso: "bg-amber-50 text-amber-700 border-amber-200",
  alerta: "bg-orange-50 text-orange-700 border-orange-200",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  erro: "bg-red-50 text-red-700 border-red-200",
  neutro: "bg-slate-100 text-slate-600 border-slate-200",
};
function Badge({ tom = "neutro", children }: { tom?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONS[tom] ?? TONS.neutro}`}>{children}</span>;
}
function Metrica({ label, valor, fonte }: { label: string; valor: React.ReactNode; fonte?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{valor}</div>
      {fonte && <div className="mt-1.5 text-[10px] leading-tight text-[var(--text-muted)]">fonte: {fonte}</div>}
    </div>
  );
}
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
function Vazio({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <tr><td colSpan={cols} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">{children}</td></tr>;
}
function fmtData(iso?: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}
/**
 * `urbis_api_calls.motivo_erro` guarda o corpo bruto de erro da API externa
 * (Gemini/Groq), normalmente JSON pretty-printed — ex.:
 * `{"error":{"code":503,"message":"...","status":"UNAVAILABLE"}}`. Extrai só
 * a mensagem (+status/code, quando existir) pra exibição curta; o bruto
 * continua disponível expandindo o `<details>` que usa isto.
 */
function resumirMotivoErro(motivoErro: string | null): string {
  if (!motivoErro) return "—";
  try {
    const parsed = JSON.parse(motivoErro);
    const msg = parsed?.error?.message;
    const rotulo = parsed?.error?.status ?? parsed?.error?.code;
    if (typeof msg === "string" && msg.trim()) return rotulo ? `${msg} (${rotulo})` : msg;
  } catch { /* não era JSON — cai no truncado abaixo */ }
  const limpo = motivoErro.trim();
  return limpo.length > 140 ? `${limpo.slice(0, 140)}…` : limpo;
}

type AbaUrbi = "visao" | "conversas" | "sugestoes" | "uso" | "catalogo" | "config";

// =====================================================================
// Visão geral
// =====================================================================

type VisaoGeral = {
  chat_ativo: boolean;
  chat_ativo_fonte: string;
  uso_7dias: { total: number; ok: number; erro: number; custo_total_usd: number; tokens_entrada: number; tokens_saida: number; por_operacao: Record<string, number> };
  uso_7dias_fonte: string;
  sugestoes_novas: number;
  sugestoes_novas_fonte: string;
  erros_recentes: { operacao: string; motivo_erro: string | null; criado_em: string }[];
  erros_recentes_fonte: string;
  cobertura_coanalista: { processos_com_coanalista: number; processos_ativos_total: number };
  cobertura_coanalista_fonte: string;
  cobertura_coanalista_por_slot: { slot: string; nome_slot: string; processos_com_coanalista: number; processos_ativos_total: number }[];
  sugestoes_novas_por_slot: { slot: string; nome_slot: string; total: number }[];
  sugestoes_novas_por_grau: { grau_certeza: string; total: number }[];
  falhas_cobertura_mdp_mrp_por_slot: { slot: string; nome_slot: string; total: number }[];
  falhas_cobertura_mdp_mrp_fonte: string;
  mudancas_catalogo_7dias_por_slot: { slot: string; nome_slot: string; total: number }[];
  mudancas_catalogo_7dias_fonte: string;
  fontes_indisponiveis: string[];
};

function TabelaPorSlot<T extends { slot: string; nome_slot: string }>({ linhas, colunas }: { linhas: T[]; colunas: [keyof T, string][] }) {
  if (linhas.length === 0) return <div className="px-5 pb-5 text-xs text-[var(--text-muted)]">Nenhum processo vivo em nenhum slot.</div>;
  return (
    <table className="w-full text-xs">
      <thead><tr><th className={TH}>Slot</th>{colunas.map(([, label]) => <th key={label} className={TH}>{label}</th>)}</tr></thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.slot} className={TR}>
            <td className={TD}>{l.nome_slot}</td>
            {colunas.map(([chave, label]) => <td key={label} className={TD}>{String(l[chave])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AbaVisaoGeral({ onIrParaAba }: { onIrParaAba: (aba: AbaUrbi) => void }) {
  const [dados, setDados] = useState<VisaoGeral | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const res = await fetch("/api/admin/urbi/visao-geral");
      const json = await res.json();
      if (!json.ok) { setErro(json.erro ?? "Falha ao carregar."); return; }
      setDados(json.data);
    } catch { setErro("Falha técnica ao carregar."); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      <Secao
        titulo="Estado do chat"
        descricao="Kill switch do Gemini — ver aba Configurações para ligar/desligar."
        acao={<button onClick={carregar} disabled={carregando} className={BTN_SECUNDARIO}><RefreshCw size={12} className={carregando ? "animate-spin" : ""} /> Atualizar</button>}
      >
        <div className="p-5">
          {carregando && !dados ? <span className="text-sm text-[var(--text-muted)]">Carregando…</span> : dados && (
            <Badge tom={dados.chat_ativo ? "ok" : "neutro"}>
              {dados.chat_ativo ? "Ligado — chamadas reais ao Gemini acontecem" : "Desligado — nenhuma chamada ao Gemini, custo zero"}
            </Badge>
          )}
          {erro && <div className="mt-2 text-sm text-[var(--error)]">{erro}</div>}
        </div>
      </Secao>

      {dados && (
        <>
          <Secao titulo="Uso — últimos 7 dias" descricao={dados.uso_7dias_fonte}>
            <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
              <Metrica label="Chamadas" valor={dados.uso_7dias.total} />
              <Metrica label="OK" valor={dados.uso_7dias.ok} />
              <Metrica label="Erro" valor={dados.uso_7dias.erro} />
              <Metrica label="Estimativa histórica de uso" valor={`US$ ${dados.uso_7dias.custo_total_usd.toFixed(4)}`} fonte="registro calculado a partir do uso — não é fatura nem cobrança atual" />
            </div>
            {Object.keys(dados.uso_7dias.por_operacao).length > 0 && (
              <div className="flex flex-wrap gap-2 px-5 pb-5">
                {Object.entries(dados.uso_7dias.por_operacao).map(([op, n]) => (
                  <Badge key={op} tom="neutro">{op}: {n}</Badge>
                ))}
              </div>
            )}
          </Secao>

          <div className="grid gap-3 md:grid-cols-2">
            <Metrica label="Sugestões novas (aguardando revisão)" valor={dados.sugestoes_novas} fonte={dados.sugestoes_novas_fonte} />
            <Metrica
              label="Cobertura do Co-Analista"
              valor={`${dados.cobertura_coanalista.processos_com_coanalista} de ${dados.cobertura_coanalista.processos_ativos_total}`}
              fonte={dados.cobertura_coanalista_fonte}
            />
          </div>

          <Secao titulo="Cobertura do Co-Analista por slot" descricao={dados.cobertura_coanalista_fonte}>
            <TabelaPorSlot
              linhas={dados.cobertura_coanalista_por_slot.map((l) => ({ ...l, cobertura: `${l.processos_com_coanalista} de ${l.processos_ativos_total}` }))}
              colunas={[["cobertura", "Processos com Co-Analista"]]}
            />
          </Secao>

          <div className="grid gap-3 md:grid-cols-2">
            <Secao titulo="Sugestões novas por slot" descricao={dados.sugestoes_novas_fonte} acao={<button onClick={() => onIrParaAba("sugestoes")} className={BTN_SECUNDARIO}>Ver sugestões</button>}>
              <TabelaPorSlot linhas={dados.sugestoes_novas_por_slot} colunas={[["total", "Novas"]]} />
            </Secao>
            <Secao titulo="Sugestões novas por grau de certeza" descricao={dados.sugestoes_novas_fonte}>
              <table className="w-full text-xs">
                <thead><tr><th className={TH}>Grau</th><th className={TH}>Novas</th></tr></thead>
                <tbody>
                  {dados.sugestoes_novas_por_grau.length === 0
                    ? <Vazio cols={2}>Nenhuma sugestão nova.</Vazio>
                    : dados.sugestoes_novas_por_grau.map((g) => (
                      <tr key={g.grau_certeza} className={TR}>
                        <td className={TD}><Badge tom={TOM_GRAU[g.grau_certeza] ?? "neutro"}>{g.grau_certeza}</Badge></td>
                        <td className={TD}>{g.total}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Secao>
          </div>

          <Secao titulo="Falhas de cobertura MDP/MRP por slot" descricao={dados.falhas_cobertura_mdp_mrp_fonte}>
            {dados.falhas_cobertura_mdp_mrp_por_slot.length === 0
              ? <div className="px-5 pb-5 text-xs text-[var(--text-muted)]">Nenhum documento sem registro em MDP/MRP pendente de revisão hoje.</div>
              : <TabelaPorSlot linhas={dados.falhas_cobertura_mdp_mrp_por_slot} colunas={[["total", "Documentos sem registro"]]} />}
          </Secao>

          <Secao
            titulo="Mudanças de catálogo — últimos 7 dias, por slot"
            descricao={dados.mudancas_catalogo_7dias_fonte}
            acao={<button onClick={() => onIrParaAba("catalogo")} className={BTN_SECUNDARIO}>Ver mudanças</button>}
          >
            {dados.mudancas_catalogo_7dias_por_slot.length === 0
              ? <div className="px-5 pb-5 text-xs text-[var(--text-muted)]">Nenhuma mudança de catálogo nos últimos 7 dias.</div>
              : <TabelaPorSlot linhas={dados.mudancas_catalogo_7dias_por_slot} colunas={[["total", "Mudanças"]]} />}
          </Secao>

          <Secao titulo="Erros recentes (URBI)" descricao={dados.erros_recentes_fonte}>
            <table className="w-full text-xs">
              <thead><tr><th className={TH}>Operação</th><th className={TH}>Motivo</th><th className={TH}>Quando</th></tr></thead>
              <tbody>
                {dados.erros_recentes.length === 0
                  ? <Vazio cols={3}>Nenhum erro recente registrado.</Vazio>
                  : dados.erros_recentes.map((e, i) => (
                    <tr key={i} className={TR}>
                      <td className={TD}>{e.operacao}</td>
                      <td className={`${TD} max-w-md`}>
                        {e.motivo_erro ? (
                          <details>
                            <summary className="cursor-pointer">{resumirMotivoErro(e.motivo_erro)}</summary>
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--bg-primary)] p-2 text-[10px] text-[var(--text-muted)]">{e.motivo_erro}</pre>
                          </details>
                        ) : "—"}
                      </td>
                      <td className={TD}>{fmtData(e.criado_em)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Secao>

          {dados.fontes_indisponiveis.length > 0 && (
            <div className="mb-5 rounded-xl border border-[var(--error)] bg-red-50 px-4 py-3 text-xs text-red-700">
              Fonte indisponível ao montar esta visão geral: {dados.fontes_indisponiveis.join(" · ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// =====================================================================
// Conversas
// =====================================================================

type LinhaHistorico = { id: string; usuario_nome: string; linha: string; mensagem_usuario: string; resposta_urbi: string; criado_em: string };

function AbaConversas() {
  const [linhas, setLinhas] = useState<LinhaHistorico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [linhaFiltro, setLinhaFiltro] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const [retElegiveis, setRetElegiveis] = useState<number | null>(null);
  const [retConsultando, setRetConsultando] = useState(false);
  const [retAplicando, setRetAplicando] = useState(false);
  const [retMsg, setRetMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (busca.trim()) params.set("busca", busca.trim());
      if (linhaFiltro) params.set("linha", linhaFiltro);
      const res = await fetch(`/api/urbi/historico?${params}`);
      const json = await res.json();
      if (!json.ok) { setErro(json.erro ?? "Falha ao carregar."); return; }
      setLinhas(json.data ?? []);
    } catch { setErro("Falha técnica ao carregar."); }
    finally { setCarregando(false); }
  }, [busca, linhaFiltro]);

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function consultarRetencao() {
    setRetConsultando(true); setRetMsg(null);
    try {
      const res = await fetch("/api/admin/urbi-historico/retencao");
      const json = await res.json();
      if (json.ok) setRetElegiveis(json.elegiveis);
      else setRetMsg(json.erro ?? "Falha ao consultar.");
    } finally { setRetConsultando(false); }
  }
  async function aplicarRetencao() {
    setRetAplicando(true); setRetMsg(null);
    try {
      const res = await fetch("/api/admin/urbi-historico/retencao", { method: "POST" });
      const json = await res.json();
      if (json.ok) { setRetMsg(`✅ ${json.anonimizadas ?? 0} conversa(s) anonimizada(s).`); setRetElegiveis(0); }
      else setRetMsg(json.erro ?? "Falha ao anonimizar.");
    } finally { setRetAplicando(false); }
  }

  return (
    <div>
      <Secao
        titulo="Conversas do URBI"
        descricao={<>Log de pergunta/resposta (fonte: <code>urbi_historico</code>). "Processo" não é gravado por mensagem hoje — só o dossiê do Co-Analista sabe o processo de cada leitura, não o histórico de chat; não dá pra filtrar por processo aqui sem inventar esse vínculo.</>}
        acao={<button onClick={carregar} disabled={carregando} className={BTN_SECUNDARIO}><RefreshCw size={12} className={carregando ? "animate-spin" : ""} /> Atualizar</button>}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Enter" && carregar()}
              placeholder="Buscar em pergunta/resposta…" className={`${INPUT} w-64 pl-7`} />
          </div>
          <select value={linhaFiltro} onChange={(e) => setLinhaFiltro(e.target.value)} className={INPUT}>
            <option value="">Todos os modos</option>
            <option value="geral">geral</option>
            <option value="co-analista">co-analista</option>
            <option value="consultor">consultor</option>
            <option value="calculadora">calculadora</option>
            <option value="correio">correio</option>
          </select>
          <button onClick={carregar} className={BTN_PRIMARIO}>Filtrar</button>
        </div>
        <table className="w-full text-xs">
          <thead><tr><th className={TH}>Usuário</th><th className={TH}>Modo</th><th className={TH}>Pergunta</th><th className={TH}>Resposta</th><th className={TH}>Quando</th></tr></thead>
          <tbody>
            {erro && <Vazio cols={5}>{erro}</Vazio>}
            {!erro && carregando && linhas.length === 0 && <Vazio cols={5}>Carregando…</Vazio>}
            {!erro && !carregando && linhas.length === 0 && <Vazio cols={5}>Nenhuma conversa encontrada.</Vazio>}
            {linhas.map((l) => (
              <tr key={l.id} className={TR}>
                <td className={TD}>{l.usuario_nome}</td>
                <td className={TD}><Badge>{l.linha}</Badge></td>
                <td className={`${TD} max-w-xs truncate`} title={l.mensagem_usuario}>{l.mensagem_usuario}</td>
                <td className={`${TD} max-w-xs truncate`} title={l.resposta_urbi}>{l.resposta_urbi}</td>
                <td className={TD}>{fmtData(l.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>

      <Secao titulo="Retenção" descricao="Mesma política e mesma ação de /admin/configuracoes (18 meses, anonimiza texto — nunca apaga a linha). Ação manual, nada roda sozinho.">
        <div className="flex flex-wrap items-center gap-3 p-5">
          <button onClick={consultarRetencao} disabled={retConsultando} className={BTN_SECUNDARIO}>
            {retConsultando ? <><Loader2 size={12} className="animate-spin" /> Consultando</> : "Consultar elegíveis"}
          </button>
          {retElegiveis !== null && <span className="text-xs text-[var(--text-secondary)]">{retElegiveis} conversa(s) com mais de 18 meses</span>}
          {!!retElegiveis && (
            <button onClick={aplicarRetencao} disabled={retAplicando} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--error)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50">
              {retAplicando ? <><Loader2 size={12} className="animate-spin" /> Anonimizando</> : "Anonimizar agora"}
            </button>
          )}
          {retMsg && <span className="text-xs text-[var(--text-secondary)]">{retMsg}</span>}
        </div>
      </Secao>

      <AbaAcoesAdministrativas />
    </div>
  );
}

// =====================================================================
// Ações administrativas (Fase F — distinção conversa × sugestão automática × ação humana)
// =====================================================================

type AcaoAdministrativa = { tipo: "sugestao_decidida" | "config_alterada"; quando: string; quem_nome: string | null; detalhe: string };

const ROTULO_TIPO_ACAO: Record<AcaoAdministrativa["tipo"], string> = {
  sugestao_decidida: "Decisão sobre sugestão",
  config_alterada: "Configuração alterada",
};

function AbaAcoesAdministrativas() {
  const [linhas, setLinhas] = useState<AcaoAdministrativa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const res = await fetch("/api/admin/urbi/acoes-administrativas");
      const json = await res.json();
      if (!json.ok) { setErro(json.erro ?? "Falha ao carregar."); return; }
      setLinhas(json.data ?? []);
    } catch { setErro("Falha técnica ao carregar."); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <Secao
      titulo="Ações administrativas recentes"
      descricao={<>Distinto de conversa (acima) e de sugestão automática (aba Sugestões): aqui é decisão HUMANA — mudar estado de uma sugestão, ligar/desligar o chat, editar outra chave de configuração. Fontes: <code>urbi_sugestoes.decidido_por</code> e <code>urbi_config.atualizado_por</code>. Não é a trilha de auditoria completa do URBI (pergunta/comando/resposta/bloqueio de custo ainda não têm tabela comum) — só o que já tem "quem decidiu" registrado hoje.</>}
      acao={<button onClick={carregar} disabled={carregando} className={BTN_SECUNDARIO}><RefreshCw size={12} className={carregando ? "animate-spin" : ""} /> Atualizar</button>}
    >
      <table className="w-full text-xs">
        <thead><tr><th className={TH}>Tipo</th><th className={TH}>Detalhe</th><th className={TH}>Quem</th><th className={TH}>Quando</th></tr></thead>
        <tbody>
          {erro && <Vazio cols={4}>{erro}</Vazio>}
          {!erro && carregando && linhas.length === 0 && <Vazio cols={4}>Carregando…</Vazio>}
          {!erro && !carregando && linhas.length === 0 && <Vazio cols={4}>Nenhuma ação administrativa registrada ainda.</Vazio>}
          {linhas.map((a, i) => (
            <tr key={i} className={TR}>
              <td className={TD}><Badge tom="info">{ROTULO_TIPO_ACAO[a.tipo]}</Badge></td>
              <td className={TD}>{a.detalhe}</td>
              <td className={TD}>{a.quem_nome ?? "—"}</td>
              <td className={TD}>{fmtData(a.quando)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Secao>
  );
}

// =====================================================================
// Sugestões
// =====================================================================

type Sugestao = {
  id: string; processo_codigo: string; tipo: string; chave: string;
  sugestao: string; motivo_factual: string; campos_comparados: string[]; fontes: string[];
  grau_certeza: string; estado: string; gerado_em: string;
  decidido_por: string | null; decidido_por_nome: string | null; decidido_em: string | null;
  tipo_processo: string | null;
};

const ROTULO_TIPO_SUGESTAO: Record<string, string> = {
  item_voltou_nao_conforme: "Item voltou a não conforme",
  documento_sem_registro: "Documento sem registro (MDP/MRP)",
  aguardando_retorno_base_insuficiente: "Aguardando retorno — base insuficiente",
  incoerencia_lip_mac: "Incoerência LIP",
  divergencia_lip_documento: "Divergência LIP × documento",
  item_sem_base_juridica: "Item sem base jurídica (BIP)",
  catalogo_alterado_apos_analise: "Catálogo alterado após análise fechada",
};
const GRAUS_CERTEZA = ["confirmado", "vale_conferir", "base_insuficiente", "nao_aplicavel", "aguarda_confirmacao_humana"] as const;
const TOM_GRAU: Record<string, string> = {
  confirmado: "ok", vale_conferir: "aviso", base_insuficiente: "alerta", nao_aplicavel: "neutro", aguarda_confirmacao_humana: "info",
};
const TOM_ESTADO: Record<string, string> = {
  nova: "accent", vista: "info", confirmada: "ok", descartada: "neutro", insuficiente: "alerta",
};
const ESTADOS_HUMANOS = ["vista", "confirmada", "descartada", "insuficiente"] as const;

function AbaSugestoes() {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Sugestao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [processoFiltro, setProcessoFiltro] = useState("");
  const [slotFiltro, setSlotFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [grauFiltro, setGrauFiltro] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const params = new URLSearchParams();
      if (estadoFiltro) params.set("estado", estadoFiltro);
      if (processoFiltro.trim()) params.set("processo", processoFiltro.trim());
      if (slotFiltro) params.set("slot", slotFiltro);
      if (tipoFiltro) params.set("tipo", tipoFiltro);
      if (grauFiltro) params.set("grau_certeza", grauFiltro);
      const res = await fetch(`/api/admin/urbi/sugestoes?${params}`);
      const json = await res.json();
      if (!json.ok) { setErro(json.erro ?? "Falha ao carregar."); return; }
      setLinhas(json.data ?? []);
    } catch { setErro("Falha técnica ao carregar."); }
    finally { setCarregando(false); }
  }, [estadoFiltro, processoFiltro, slotFiltro, tipoFiltro, grauFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  async function mudarEstado(id: string, novoEstado: string) {
    setSalvandoId(id);
    try {
      const res = await fetch("/api/admin/urbi/sugestoes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estado: novoEstado }),
      });
      const json = await res.json();
      if (json.ok) carregar();
      else setErro(json.erro ?? "Falha ao salvar.");
    } finally { setSalvandoId(null); }
  }

  return (
    <Secao
      titulo="Sugestões e alertas do Co-Analista"
      descricao="Derivadas de fato pelo dossiê (nunca decididas pela IA) — ver lib/urbi/sugestoes.ts. Mudar o estado aqui não altera processo, LIP ou MAC; só registra a leitura humana."
      acao={<button onClick={carregar} disabled={carregando} className={BTN_SECUNDARIO}><RefreshCw size={12} className={carregando ? "animate-spin" : ""} /> Atualizar</button>}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3">
        <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className={INPUT}>
          <option value="">Todos os estados</option>
          <option value="nova">nova</option>
          {ESTADOS_HUMANOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={slotFiltro} onChange={(e) => setSlotFiltro(e.target.value)} className={INPUT}>
          <option value="">Todos os slots</option>
          <option value="regularizacao">Regularização SEI</option>
          <option value="aceite_sei">Aceite SEI</option>
          <option value="slot_05">Aprovação de Projeto</option>
        </select>
        <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className={INPUT}>
          <option value="">Todos os tipos</option>
          {Object.entries(ROTULO_TIPO_SUGESTAO).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
        </select>
        <select value={grauFiltro} onChange={(e) => setGrauFiltro(e.target.value)} className={INPUT}>
          <option value="">Todo grau de certeza</option>
          {GRAUS_CERTEZA.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <input value={processoFiltro} onChange={(e) => setProcessoFiltro(e.target.value)} onKeyDown={(e) => e.key === "Enter" && carregar()}
          placeholder="Código do processo…" className={`${INPUT} w-52`} />
        <button onClick={carregar} className={BTN_PRIMARIO}>Filtrar</button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className={TH}>Processo</th><th className={TH}>Tipo</th><th className={TH}>Sugestão</th>
            <th className={TH}>Grau</th><th className={TH}>Fontes</th><th className={TH}>Estado</th><th className={TH}>Decidido</th><th className={TH}>Ação</th>
          </tr>
        </thead>
        <tbody>
          {erro && <Vazio cols={8}>{erro}</Vazio>}
          {!erro && carregando && linhas.length === 0 && <Vazio cols={8}>Carregando…</Vazio>}
          {!erro && !carregando && linhas.length === 0 && <Vazio cols={8}>Nenhuma sugestão encontrada — se o chat estiver desligado, é esperado não haver nenhuma nova.</Vazio>}
          {linhas.map((s) => (
            <tr key={s.id} className={TR}>
              <td className={TD}>
                {s.tipo_processo ? (
                  <button className="underline decoration-dotted hover:text-[var(--text-primary)]" onClick={() => router.push(`/processo/${encodeURIComponent(s.processo_codigo)}?tipo=${encodeURIComponent(s.tipo_processo!)}`)} title="Abrir processo (a tela aplica o controle de acesso de sempre)">
                    {s.processo_codigo}
                  </button>
                ) : s.processo_codigo}
              </td>
              <td className={TD}>{ROTULO_TIPO_SUGESTAO[s.tipo] ?? s.tipo}</td>
              <td className={`${TD} max-w-sm`}>
                <div>{s.sugestao}</div>
                <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{s.motivo_factual}</div>
              </td>
              <td className={TD}><Badge tom={TOM_GRAU[s.grau_certeza] ?? "neutro"}>{s.grau_certeza}</Badge></td>
              <td className={TD}>{s.fontes.join(", ")}</td>
              <td className={TD}><Badge tom={TOM_ESTADO[s.estado] ?? "neutro"}>{s.estado}</Badge></td>
              <td className={TD}>{s.decidido_por_nome ? <>{s.decidido_por_nome}<br />{fmtData(s.decidido_em)}</> : "—"}</td>
              <td className={TD}>
                <select
                  defaultValue=""
                  disabled={salvandoId === s.id}
                  onChange={(e) => { if (e.target.value) mudarEstado(s.id, e.target.value); e.target.value = ""; }}
                  className={INPUT}
                >
                  <option value="">mudar estado…</option>
                  {ESTADOS_HUMANOS.filter((e) => e !== s.estado).map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Secao>
  );
}

// =====================================================================
// Uso e custo
// =====================================================================

type Uso = {
  periodo_dias: number; total_chamadas: number; custo_total_usd: number; duracao_media_ms: number | null;
  por_operacao: Record<string, { chamadas: number; ok: number; erro: number; custo_usd: number }>;
  por_modelo: Record<string, { chamadas: number; custo_usd: number }>;
  recentes: { id: string; operacao: string; modelo: string; status: string; criado_em: string; duracao_ms: number | null; custo_estimado_usd: number | null; processo_codigo: string | null }[];
  fonte: string;
};

function AbaUso() {
  const [dados, setDados] = useState<Uso | null>(null);
  const [dias, setDias] = useState(30);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const res = await fetch(`/api/admin/urbi/uso?dias=${dias}`);
      const json = await res.json();
      if (!json.ok) { setErro(json.erro ?? "Falha ao carregar."); return; }
      setDados(json.data);
    } catch { setErro("Falha técnica ao carregar."); }
    finally { setCarregando(false); }
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      <Secao
        titulo="Uso e custo do URBI"
        descricao="Mesma tabela que já alimenta o painel de IA em /admin/rastreabilidade (urbis_api_calls), filtrada a modulo=URBI."
        acao={<div className="flex items-center gap-2">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className={INPUT}>
            <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option>
          </select>
          <button onClick={carregar} disabled={carregando} className={BTN_SECUNDARIO}><RefreshCw size={12} className={carregando ? "animate-spin" : ""} /></button>
        </div>}
      >
        {erro && <div className="p-5 text-sm text-[var(--error)]">{erro}</div>}
        {dados && (
          <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
            <Metrica label="Chamadas" valor={dados.total_chamadas} />
            <Metrica label="Estimativa histórica de uso" valor={`US$ ${dados.custo_total_usd.toFixed(4)}`} fonte="registro calculado a partir do uso — não é fatura nem cobrança atual" />
            <Metrica label="Duração média" valor={dados.duracao_media_ms != null ? `${dados.duracao_media_ms} ms` : "—"} />
            <Metrica label="Período" valor={`${dados.periodo_dias} dias`} />
          </div>
        )}
      </Secao>

      {dados && (
        <div className="grid gap-3 md:grid-cols-2">
          <Secao titulo="Por operação">
            <table className="w-full text-xs">
              <thead><tr><th className={TH}>Operação</th><th className={TH}>Chamadas</th><th className={TH}>OK</th><th className={TH}>Erro</th><th className={TH} title="Estimativa histórica calculada — não é fatura nem cobrança atual">Custo</th></tr></thead>
              <tbody>
                {Object.keys(dados.por_operacao).length === 0
                  ? <Vazio cols={5}>Sem chamadas no período.</Vazio>
                  : Object.entries(dados.por_operacao).map(([op, v]) => (
                    <tr key={op} className={TR}><td className={TD}>{op}</td><td className={TD}>{v.chamadas}</td><td className={TD}>{v.ok}</td><td className={TD}>{v.erro}</td><td className={TD}>US$ {v.custo_usd.toFixed(4)}</td></tr>
                  ))}
              </tbody>
            </table>
          </Secao>
          <Secao titulo="Por modelo">
            <table className="w-full text-xs">
              <thead><tr><th className={TH}>Modelo</th><th className={TH}>Chamadas</th><th className={TH} title="Estimativa histórica calculada — não é fatura nem cobrança atual">Custo</th></tr></thead>
              <tbody>
                {Object.keys(dados.por_modelo).length === 0
                  ? <Vazio cols={3}>Sem chamadas no período.</Vazio>
                  : Object.entries(dados.por_modelo).map(([m, v]) => (
                    <tr key={m} className={TR}><td className={TD}>{m}</td><td className={TD}>{v.chamadas}</td><td className={TD}>US$ {v.custo_usd.toFixed(4)}</td></tr>
                  ))}
              </tbody>
            </table>
          </Secao>
        </div>
      )}

      {dados && (
        <Secao titulo="Chamadas recentes">
          <table className="w-full text-xs">
            <thead><tr><th className={TH}>Operação</th><th className={TH}>Modelo</th><th className={TH}>Status</th><th className={TH}>Processo</th><th className={TH}>Duração</th><th className={TH} title="Estimativa histórica calculada — não é fatura nem cobrança atual">Custo</th><th className={TH}>Quando</th></tr></thead>
            <tbody>
              {dados.recentes.length === 0
                ? <Vazio cols={7}>Nenhuma chamada no período.</Vazio>
                : dados.recentes.map((r) => (
                  <tr key={r.id} className={TR}>
                    <td className={TD}>{r.operacao}</td>
                    <td className={TD}>{r.modelo}</td>
                    <td className={TD}><Badge tom={r.status === "ok" ? "ok" : "erro"}>{r.status}</Badge></td>
                    <td className={TD}>{r.processo_codigo ?? "—"}</td>
                    <td className={TD}>{r.duracao_ms != null ? `${r.duracao_ms} ms` : "—"}</td>
                    <td className={TD}>{r.custo_estimado_usd != null ? `US$ ${Number(r.custo_estimado_usd).toFixed(5)}` : "—"}</td>
                    <td className={TD}>{fmtData(r.criado_em)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Secao>
      )}
    </div>
  );
}

// =====================================================================
// Mudanças de catálogo (Fase D)
// =====================================================================

type MudancaCatalogo = {
  id: string;
  criado_em: string;
  slot: string | null;
  item_grupo: string | null;
  item_texto_atual: string;
  acao: "criado" | "atualizado" | "desativado" | "reativado";
  campos_alterados: Record<string, { de: unknown; para: unknown }>;
};

const NOME_SLOT: Record<string, string> = {
  regularizacao: "Regularização SEI",
  aceite_sei: "Aceite SEI",
  slot_05: "Aprovação de Projeto",
};
const TOM_ACAO: Record<string, string> = {
  criado: "ok", atualizado: "info", desativado: "erro", reativado: "aviso",
};

function AbaCatalogo() {
  const [linhas, setLinhas] = useState<MudancaCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [slotFiltro, setSlotFiltro] = useState("");
  const [acaoFiltro, setAcaoFiltro] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const params = new URLSearchParams({ limit: "150" });
      if (slotFiltro) params.set("slot", slotFiltro);
      if (acaoFiltro) params.set("acao", acaoFiltro);
      const res = await fetch(`/api/admin/urbi/catalogo?${params}`);
      const json = await res.json();
      if (!json.ok) { setErro(json.erro ?? "Falha ao carregar."); return; }
      setLinhas(json.data ?? []);
    } catch { setErro("Falha técnica ao carregar."); }
    finally { setCarregando(false); }
  }, [slotFiltro, acaoFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <Secao
      titulo="Mudanças de catálogo (LIP/MAC)"
      descricao={<>Trilha real do checklist — item criado, atualizado, desativado ou reativado (fonte: <code>mac_checklist_itens_historico</code>, trigger de banco desde 03/09/2026). Isto é sobre o CATÁLOGO, nunca sobre um processo ou interessado específico — nenhuma coluna aqui se refere a isso.</>}
      acao={<button onClick={carregar} disabled={carregando} className={BTN_SECUNDARIO}><RefreshCw size={12} className={carregando ? "animate-spin" : ""} /> Atualizar</button>}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3">
        <select value={slotFiltro} onChange={(e) => setSlotFiltro(e.target.value)} className={INPUT}>
          <option value="">Todos os slots</option>
          <option value="regularizacao">Regularização SEI</option>
          <option value="aceite_sei">Aceite SEI</option>
          <option value="slot_05">Aprovação de Projeto</option>
        </select>
        <select value={acaoFiltro} onChange={(e) => setAcaoFiltro(e.target.value)} className={INPUT}>
          <option value="">Toda ação</option>
          <option value="criado">criado</option>
          <option value="atualizado">atualizado</option>
          <option value="desativado">desativado</option>
          <option value="reativado">reativado</option>
        </select>
        <button onClick={carregar} className={BTN_PRIMARIO}>Filtrar</button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className={TH}>Quando</th><th className={TH}>Slot</th><th className={TH}>Item</th>
            <th className={TH}>Ação</th><th className={TH}>Campos alterados</th>
          </tr>
        </thead>
        <tbody>
          {erro && <Vazio cols={5}>{erro}</Vazio>}
          {!erro && carregando && linhas.length === 0 && <Vazio cols={5}>Carregando…</Vazio>}
          {!erro && !carregando && linhas.length === 0 && <Vazio cols={5}>Nenhuma mudança de catálogo registrada ainda neste filtro — a trilha começou a valer em 03/09/2026, mudança anterior a isso não aparece aqui.</Vazio>}
          {linhas.map((l) => (
            <tr key={l.id} className={TR}>
              <td className={TD}>{fmtData(l.criado_em)}</td>
              <td className={TD}>{l.slot ? (NOME_SLOT[l.slot] ?? l.slot) : "—"}</td>
              <td className={`${TD} max-w-xs`}>
                <div className="truncate" title={l.item_texto_atual}>{l.item_texto_atual}</div>
                {l.item_grupo && <div className="text-[10px] text-[var(--text-muted)]">{l.item_grupo}</div>}
              </td>
              <td className={TD}><Badge tom={TOM_ACAO[l.acao] ?? "neutro"}>{l.acao}</Badge></td>
              <td className={`${TD} max-w-sm`}>
                {Object.entries(l.campos_alterados ?? {}).map(([campo, v]) => (
                  <div key={campo} className="mb-0.5">
                    <code>{campo}</code>: <span className="text-[var(--text-muted)]">{String(v?.de ?? "—")}</span> → {String(v?.para ?? "—")}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Secao>
  );
}

// =====================================================================
// Configurações
// =====================================================================

type ConfigRow = { chave: string; valor: string; descricao: string | null; atualizado_em: string | null; atualizado_por_nome: string | null };

function AbaConfig() {
  const [linhas, setLinhas] = useState<ConfigRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [confirmandoKillSwitch, setConfirmandoKillSwitch] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const res = await fetch("/api/urbi/config");
      const json = await res.json();
      if (!json.ok) { setErro(json.erro ?? "Falha ao carregar."); return; }
      setLinhas(json.data ?? []);
    } catch { setErro("Falha técnica ao carregar."); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(chave: string, valor: string) {
    setSalvando(chave);
    try {
      const res = await fetch("/api/urbi/config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave, valor }),
      });
      const json = await res.json();
      if (json.ok) { setEdicoes((e) => { const c = { ...e }; delete c[chave]; return c; }); carregar(); }
      else setErro(json.erro ?? "Falha ao salvar.");
    } finally { setSalvando(null); }
  }

  const chatConfig = linhas.find((l) => l.chave === "chat_gemini_ativo");
  const outras = linhas.filter((l) => l.chave !== "chat_gemini_ativo");
  const chatLigado = chatConfig?.valor === "true";

  return (
    <div>
      <Secao
        titulo="Kill switch — chamadas reais ao Gemini"
        descricao={chatConfig?.descricao ?? "urbi_config.chat_gemini_ativo"}
        acao={<button onClick={carregar} disabled={carregando} className={BTN_SECUNDARIO}><RefreshCw size={12} className={carregando ? "animate-spin" : ""} /></button>}
      >
        <div className="p-5">
          {carregando && !chatConfig ? <span className="text-sm text-[var(--text-muted)]">Carregando…</span> : chatConfig && (
            <div className="flex items-center gap-3">
              <Badge tom={chatLigado ? "ok" : "neutro"}>{chatLigado ? "LIGADO" : "DESLIGADO"}</Badge>
              {!confirmandoKillSwitch ? (
                <button onClick={() => setConfirmandoKillSwitch(true)} className={chatLigado ? BTN_SECUNDARIO : BTN_PRIMARIO}>
                  {chatLigado ? "Desligar" : "Ligar (aceitando custo real)"}
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2">
                  <span className="text-xs text-[var(--text-secondary)]">
                    {chatLigado ? "Confirmar desligar o chat?" : "Confirmar ligar — isso passa a gerar custo real de Gemini?"}
                  </span>
                  <button
                    onClick={() => { salvar("chat_gemini_ativo", chatLigado ? "false" : "true"); setConfirmandoKillSwitch(false); }}
                    disabled={salvando === "chat_gemini_ativo"}
                    className={BTN_PRIMARIO}
                  >
                    {salvando === "chat_gemini_ativo" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirmar
                  </button>
                  <button onClick={() => setConfirmandoKillSwitch(false)} className={BTN_SECUNDARIO}>Cancelar</button>
                </div>
              )}
            </div>
          )}
          {chatConfig && (
            <div className="mt-2 text-[10px] text-[var(--text-muted)]">
              Última alteração: {chatConfig.atualizado_por_nome ? `${chatConfig.atualizado_por_nome}, ` : "quem alterou não ficou registrado (mudança anterior a 03/09/2026), "}
              {fmtData(chatConfig.atualizado_em)}
            </div>
          )}
          {erro && <div className="mt-2 text-sm text-[var(--error)]">{erro}</div>}
        </div>
      </Secao>

      <Secao titulo="Outras configurações" descricao="Chaves já existentes em urbi_config — nenhuma criada nesta rodada, só exibidas e editáveis pela mesma rota que já existia (/api/urbi/config).">
        <table className="w-full text-xs">
          <thead><tr><th className={TH}>Chave</th><th className={TH}>Descrição</th><th className={TH}>Valor</th><th className={TH}>Última alteração</th><th className={TH}></th></tr></thead>
          <tbody>
            {!carregando && outras.length === 0 && <Vazio cols={5}>Nenhuma outra chave em urbi_config.</Vazio>}
            {outras.map((l) => (
              <tr key={l.chave} className={TR}>
                <td className={TD}><code>{l.chave}</code></td>
                <td className={TD}>{l.descricao ?? "—"}</td>
                <td className={TD}>
                  <input
                    className={`${INPUT} w-40`}
                    value={edicoes[l.chave] ?? l.valor}
                    onChange={(e) => setEdicoes((ed) => ({ ...ed, [l.chave]: e.target.value }))}
                  />
                </td>
                <td className={`${TD} text-[10px]`}>
                  {l.atualizado_em ? <>{l.atualizado_por_nome ?? "quem não ficou registrado"}<br />{fmtData(l.atualizado_em)}</> : "—"}
                </td>
                <td className={TD}>
                  <button
                    onClick={() => salvar(l.chave, edicoes[l.chave] ?? l.valor)}
                    disabled={salvando === l.chave || edicoes[l.chave] === undefined || edicoes[l.chave] === l.valor}
                    className={BTN_SECUNDARIO}
                  >
                    {salvando === l.chave ? <Loader2 size={12} className="animate-spin" /> : "Salvar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>
    </div>
  );
}

// =====================================================================
// Página
// =====================================================================

export default function UrbiAdminPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [aba, setAba] = useState<AbaUrbi>("visao");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json().catch(() => null);
        const perfis = json?.data?.perfis?.length ? json.data.perfis : json?.data?.perfil;
        if (!json?.ok || !isPerfilIrrestrito(perfis)) { router.push("/"); return; }
        setAutorizado(true);
      } catch { router.push("/"); }
    })();
  }, [router]);

  if (autorizado === null) return <div className="p-8 text-sm text-[var(--text-muted)]">Carregando…</div>;
  if (!autorizado) return null;

  const ABAS: [AbaUrbi, string][] = [
    ["visao", "Visão geral"], ["conversas", "Conversas"], ["sugestoes", "Sugestões"], ["uso", "Uso e custo"], ["catalogo", "Mudanças de catálogo"], ["config", "Configurações"],
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]"><Bot size={22} /> Módulo URBI</h1>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Administração do assistente/Co-Analista. Histórico de negócio (BDI) continua em{" "}
              <button className="underline" onClick={() => router.push("/admin/bdi")}>/admin/bdi</button>; painel de custo geral de IA continua em{" "}
              <button className="underline" onClick={() => router.push("/admin/rastreabilidade")}>/admin/rastreabilidade</button> — nada foi movido de lá.
            </p>
          </div>
          <button onClick={() => router.push("/")} className={BTN_SECUNDARIO}>← Home</button>
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
          {ABAS.map(([key, label]) => (
            <button key={key} onClick={() => setAba(key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${aba === key ? "border-[var(--accent)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
              {label}
            </button>
          ))}
        </div>

        {aba === "visao" && <AbaVisaoGeral onIrParaAba={setAba} />}
        {aba === "conversas" && <AbaConversas />}
        {aba === "sugestoes" && <AbaSugestoes />}
        {aba === "uso" && <AbaUso />}
        {aba === "catalogo" && <AbaCatalogo />}
        {aba === "config" && <AbaConfig />}
      </div>
    </div>
  );
}
