"use client";

// app/admin/bdi/leis/page.tsx
//
// Gerenciador completo de Leis do BDI.
//
// Operacoes:
//   - Listar       (GET  /api/admin/bdi/leis)
//   - Adicionar    (POST /api/admin/bdi/leis) — multipart com PDF opcional
//   - Editar       (PUT  /api/admin/bdi/leis/:id) — somente metadados
//   - Reindexar    (POST /api/admin/bdi/leis/:id/reindexar)
//   - Upload PDF   (POST /api/bdi/indexar-lei) — fluxo herdado
//   - Excluir      (DELETE /api/admin/bdi/leis/:id) — com confirmacao
//                  baseada em /api/admin/bdi/leis/:id/referencias
//
// Acesso: somente Administrador / Diretora. O gate definitivo esta nos
// endpoints; aqui usamos /api/auth/me para evitar 403 mudo.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isPerfilIrrestrito } from "@/lib/perfis";

type Lei = {
  id: string;
  titulo: string;
  tipo?: string | null;
  numero?: string | null;
  ano?: number | string | null;
  ementa?: string | null;
  url_pdf?: string | null;
  status_indexacao?: "pendente" | "indexado" | "erro" | string | null;
  fragmentos_count?: number;
  [k: string]: any;
};

type IndexResp = {
  ok: boolean;
  documento_id?: string;
  titulo?: string;
  arquivo?: string;
  paginas?: number;
  fragmentos_indexados?: number;
  duracao_ms?: number;
  erro?: string;
};

type Referencia = {
  id: string;
  modelo_id?: string | null;
  modelo_nome?: string | null;
  grupo?: string | null;
  texto?: string | null;
  ref?: string | null;
  ordem?: number | null;
};

const TIPOS: Array<{ value: string; label: string }> = [
  { value: "lei_complementar", label: "Lei Complementar" },
  { value: "lei_ordinaria", label: "Lei Ordinária" },
  { value: "decreto", label: "Decreto" },
  { value: "instrucao_normativa", label: "Instrução Normativa" },
  { value: "instrucao_aeronautica", label: "Instrução Aeronáutica" },
  { value: "nbr", label: "NBR" },
  { value: "coletanea", label: "Coletânea" },
  { value: "plano_diretor", label: "Plano Diretor" },
];

type FormLei = {
  titulo: string;
  tipo: string;
  numero: string;
  ano: string;
  ementa: string;
};

const FORM_VAZIO: FormLei = {
  titulo: "",
  tipo: "lei_ordinaria",
  numero: "",
  ano: "",
  ementa: "",
};

const S: Record<string, any> = {
  page: {
    background: "#0a0a0f",
    minHeight: "100vh",
    fontFamily: "'JetBrains Mono', monospace",
    color: "#e2e8f0",
  },
  header: {
    borderBottom: "1px solid #d946ef33",
    padding: "14px 28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#0d0d14",
  },
  content: { padding: "24px 28px" },
  card: {
    background: "#0d0d14",
    border: "1px solid #ffffff11",
    borderRadius: 8,
    padding: 18,
    marginBottom: 12,
  },
  label: { color: "#ffffff44", fontSize: 10, letterSpacing: 2, marginBottom: 6 },
  titulo: { color: "#f0f0f0", fontSize: 13, fontWeight: 600, marginBottom: 4 },
  meta: { color: "#ffffff55", fontSize: 11 },
  badge: (cor: string): React.CSSProperties => ({
    background: cor + "22",
    border: `1px solid ${cor}55`,
    color: cor,
    fontSize: 9,
    padding: "2px 10px",
    borderRadius: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  }),
  btn: (cor: string, disabled = false): React.CSSProperties => ({
    background: cor + "22",
    border: `1px solid ${cor}55`,
    color: cor,
    padding: "8px 16px",
    borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 11,
    fontFamily: "inherit",
    letterSpacing: 1,
    opacity: disabled ? 0.4 : 1,
    whiteSpace: "nowrap",
  }),
  input: {
    background: "#0a0a0f",
    border: "1px solid #ffffff22",
    color: "#e2e8f0",
    padding: "10px 12px",
    borderRadius: 4,
    fontFamily: "inherit",
    fontSize: 12,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  modalBackdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "#000000cc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  modal: {
    background: "#0d0d14",
    border: "1px solid #d946ef55",
    borderRadius: 8,
    padding: 24,
    width: "92%",
    maxWidth: 640,
    maxHeight: "92vh",
    overflowY: "auto" as const,
    boxShadow: "0 12px 40px #00000088",
  },
};

function corDoStatus(status?: string | null): string {
  if (status === "indexado") return "#22c55e";
  if (status === "erro") return "#ef4444";
  return "#f59e0b"; // pendente / desconhecido
}

function labelTipo(tipo?: string | null): string {
  return TIPOS.find((t) => t.value === tipo)?.label ?? (tipo ?? "—");
}

export default function BDILeisPage() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [leis, setLeis] = useState<Lei[]>([]);
  const [erro, setErro] = useState<string>("");
  const [toast, setToast] = useState<string>("");

  // Modal de criar/editar
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormLei>(FORM_VAZIO);
  const [pdfArquivo, setPdfArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Modal de confirmacao de exclusao
  const [excluindoLei, setExcluindoLei] = useState<Lei | null>(null);
  const [excluindoReferencias, setExcluindoReferencias] = useState<Referencia[] | null>(null);
  const [carregandoRefs, setCarregandoRefs] = useState(false);
  const [excluindoConfirma, setExcluindoConfirma] = useState("");
  const [excluindoExecutando, setExcluindoExecutando] = useState(false);

  // Acoes inline por lei
  const [indexandoId, setIndexandoId] = useState<string | null>(null);
  const [reindexandoId, setReindexandoId] = useState<string | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<Record<string, IndexResp>>({});
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (!json.ok) {
          router.push("/login");
          return;
        }
        const perfis: string[] =
          Array.isArray(json.data?.perfis) && json.data.perfis.length > 0
            ? json.data.perfis
            : json.data?.perfil
              ? [json.data.perfil]
              : [];
        if (!isPerfilIrrestrito(perfis)) {
          router.push("/");
          return;
        }
        setAutorizado(true);
        await carregar();
      } catch {
        router.push("/");
      } finally {
        setCarregando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregar() {
    setErro("");
    const res = await fetch("/api/admin/bdi/leis", { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) {
      setErro(json.erro ?? "Falha ao carregar leis.");
      return;
    }
    setLeis(json.data ?? []);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4500);
  }

  // ---- Criar / Editar ----------------------------------------------------

  function abrirCriar() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setPdfArquivo(null);
    setModalAberto(true);
  }

  function abrirEditar(lei: Lei) {
    setEditandoId(lei.id);
    setForm({
      titulo: lei.titulo ?? "",
      tipo: lei.tipo ?? "lei_ordinaria",
      numero: lei.numero ?? "",
      ano: lei.ano != null ? String(lei.ano) : "",
      ementa: lei.ementa ?? "",
    });
    setPdfArquivo(null); // edicao nao envia PDF
    setModalAberto(true);
  }

  function fecharModal() {
    if (salvando) return;
    setModalAberto(false);
    setEditandoId(null);
    setPdfArquivo(null);
  }

  async function salvar() {
    if (!form.titulo.trim()) {
      showToast("⚠ Título é obrigatório.");
      return;
    }
    setSalvando(true);
    try {
      if (editandoId) {
        // PUT JSON — somente metadados
        const res = await fetch(`/api/admin/bdi/leis/${editandoId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: form.titulo.trim(),
            tipo: form.tipo,
            numero: form.numero.trim() || null,
            ano: form.ano.trim() ? Number(form.ano) : null,
            ementa: form.ementa.trim() || null,
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.erro ?? "Falha ao atualizar.");
        showToast("✅ Lei atualizada.");
      } else {
        // POST multipart (suporta PDF opcional)
        const fd = new FormData();
        fd.append("titulo", form.titulo.trim());
        fd.append("tipo", form.tipo);
        fd.append("numero", form.numero.trim());
        fd.append("ano", form.ano.trim());
        fd.append("ementa", form.ementa.trim());
        if (pdfArquivo) fd.append("pdf", pdfArquivo);
        const res = await fetch("/api/admin/bdi/leis", {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.erro ?? "Falha ao criar lei.");
        if (json.indexacao && json.indexacao.ok === false) {
          showToast(
            `⚠ Lei criada, mas a indexação falhou: ${json.indexacao.erro ?? "erro"}.`,
          );
        } else if (json.indexacao && json.indexacao.ok) {
          showToast(
            `✅ Lei criada e ${json.indexacao.fragmentos_indexados ?? 0} fragmentos indexados.`,
          );
        } else {
          showToast("✅ Lei criada.");
        }
      }
      fecharModal();
      await carregar();
    } catch (e: any) {
      showToast(`❌ ${e?.message ?? "Erro desconhecido."}`);
    } finally {
      setSalvando(false);
    }
  }

  // ---- Upload PDF inline (relança indexação) -----------------------------

  function dispararUpload(lei: Lei) {
    const input = inputsRef.current[lei.id];
    if (!input) return;
    input.value = "";
    input.click();
  }

  async function aoEscolherArquivo(lei: Lei, ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      showToast("Selecione um arquivo .pdf.");
      return;
    }
    setIndexandoId(lei.id);
    const fd = new FormData();
    fd.append("documento_id", lei.id);
    fd.append("pdf", file);
    try {
      const res = await fetch("/api/bdi/indexar-lei", { method: "POST", body: fd });
      const json: IndexResp = await res.json();
      setUltimoResultado((prev) => ({ ...prev, [lei.id]: json }));
      if (json.ok) {
        showToast(
          `✅ ${lei.titulo}: ${json.fragmentos_indexados ?? 0} fragmentos em ${json.duracao_ms ?? 0}ms.`,
        );
      } else {
        showToast(`❌ Falha em "${lei.titulo}": ${json.erro ?? "erro"}`);
      }
      await carregar();
    } catch (e: any) {
      showToast(`❌ Falha de rede: ${e?.message ?? "erro"}`);
    } finally {
      setIndexandoId(null);
    }
  }

  // ---- Reindexar (re-processa PDF ja no R2) ------------------------------

  async function reindexar(lei: Lei) {
    if (!lei.url_pdf) {
      showToast("Esta lei ainda não tem PDF no R2. Faça upload primeiro.");
      return;
    }
    if (!confirm(`Reindexar "${lei.titulo}"? Isso refaz fragmentos e embeddings.`)) return;
    setReindexandoId(lei.id);
    try {
      const res = await fetch(`/api/admin/bdi/leis/${lei.id}/reindexar`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok) {
        showToast(`❌ Reindexação falhou: ${json.erro ?? json.indexacao?.erro ?? "erro"}.`);
      } else {
        const r: IndexResp = json.indexacao ?? {};
        setUltimoResultado((prev) => ({ ...prev, [lei.id]: r }));
        showToast(
          `✅ Reindexado: ${r.fragmentos_indexados ?? 0} fragmentos em ${r.duracao_ms ?? 0}ms.`,
        );
      }
      await carregar();
    } catch (e: any) {
      showToast(`❌ ${e?.message ?? "erro"}`);
    } finally {
      setReindexandoId(null);
    }
  }

  // ---- Exclusão segura ---------------------------------------------------

  async function abrirExcluir(lei: Lei) {
    setExcluindoLei(lei);
    setExcluindoReferencias(null);
    setExcluindoConfirma("");
    setCarregandoRefs(true);
    try {
      const res = await fetch(`/api/admin/bdi/leis/${lei.id}/referencias`);
      const json = await res.json();
      setExcluindoReferencias(json.ok ? (json.data ?? []) : []);
    } catch {
      setExcluindoReferencias([]);
    } finally {
      setCarregandoRefs(false);
    }
  }

  function fecharExcluir() {
    if (excluindoExecutando) return;
    setExcluindoLei(null);
    setExcluindoReferencias(null);
    setExcluindoConfirma("");
  }

  async function confirmarExcluir() {
    if (!excluindoLei) return;
    setExcluindoExecutando(true);
    try {
      const res = await fetch(`/api/admin/bdi/leis/${excluindoLei.id}?force=1`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.erro ?? "Falha ao excluir.");
      showToast(`✅ "${excluindoLei.titulo}" removida.`);
      fecharExcluir();
      await carregar();
    } catch (e: any) {
      showToast(`❌ ${e?.message ?? "erro"}`);
    } finally {
      setExcluindoExecutando(false);
    }
  }

  // ---- Render -----------------------------------------------------------

  if (carregando) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#ffffff44", fontSize: 12, letterSpacing: 2 }}>CARREGANDO…</div>
      </div>
    );
  }

  if (!autorizado) return null;

  const algumaAcaoBloqueante =
    indexandoId !== null || reindexandoId !== null || excluindoExecutando;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#d946ef", fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
            BIP — BIBLIOTECA INTELIGENTE E PESQUISA
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={abrirCriar}
            style={S.btn("#22c55e", algumaAcaoBloqueante)}
            disabled={algumaAcaoBloqueante}
          >
            + NOVA LEI
          </button>
          <button
            onClick={carregar}
            style={S.btn("#06b6d4", algumaAcaoBloqueante)}
            disabled={algumaAcaoBloqueante}
          >
            ↻ ATUALIZAR
          </button>
          <button onClick={() => router.push("/admin/bdi")} style={S.btn("#ffffff66")}>
            ← BDI
          </button>
          <button onClick={() => router.push("/")} style={S.btn("#ffffff66")}>
            ⌂ HOME
          </button>
        </div>
      </div>

      <div style={S.content}>
        <div style={{ ...S.card, background: "#0d0d1a", borderColor: "#d946ef22" }}>
          <div style={S.label}>COMO USAR</div>
          <div style={{ color: "#ffffff88", fontSize: 12, lineHeight: 1.6 }}>
            Cadastre leis em <code>bdi_documentos_lei</code>. Ao enviar um PDF, o
            sistema fragmenta por artigo (ou seção numérica para NBR/Instruções
            Aeronáuticas), gera embeddings (Gemini text-embedding-004) e salva em{" "}
            <code>bdi_lei_fragmentos</code>. O PDF original é arquivado no Cloudflare R2
            (campo <code>url_pdf</code>) para permitir reindexação sem reupload.
          </div>
        </div>

        {erro && (
          <div
            style={{
              ...S.card,
              background: "#2a0a0a",
              border: "1px solid #ef444466",
              color: "#fca5a5",
              fontSize: 12,
            }}
          >
            ⚠ {erro}
          </div>
        )}

        {!erro && leis.length === 0 && (
          <div style={{ color: "#ffffff44", fontSize: 12, textAlign: "center", padding: 40 }}>
            Nenhuma lei cadastrada. Clique em <strong>+ NOVA LEI</strong> para começar.
          </div>
        )}

        {leis.map((lei) => {
          const cor = corDoStatus(lei.status_indexacao);
          const indexando = indexandoId === lei.id;
          const reindexando = reindexandoId === lei.id;
          const desabilitar = algumaAcaoBloqueante && !indexando && !reindexando;
          const ult = ultimoResultado[lei.id];

          return (
            <div key={lei.id} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                    {lei.tipo && <span style={S.badge("#d946ef")}>{labelTipo(lei.tipo)}</span>}
                    {lei.numero && <span style={S.meta}>Nº {String(lei.numero)}</span>}
                    {lei.ano && <span style={S.meta}>· {String(lei.ano)}</span>}
                    <span style={S.badge(cor)}>{lei.status_indexacao ?? "pendente"}</span>
                    <span style={{ ...S.meta, color: "#ffffff77" }}>
                      {(lei.fragmentos_count ?? 0).toLocaleString("pt-BR")} fragmentos
                    </span>
                    {lei.url_pdf && (
                      <a
                        href={lei.url_pdf}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#06b6d4", fontSize: 11, textDecoration: "none" }}
                      >
                        🔗 PDF
                      </a>
                    )}
                  </div>
                  <div style={S.titulo}>{lei.titulo}</div>
                  {lei.ementa && (
                    <div style={{ ...S.meta, marginTop: 4, color: "#ffffff66" }}>
                      {lei.ementa}
                    </div>
                  )}
                  {ult && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: ult.ok ? "#22c55e" : "#fca5a5",
                      }}
                    >
                      {ult.ok ? (
                        <>
                          ✅ Última indexação: {ult.fragmentos_indexados} fragmentos
                          {ult.paginas != null ? `, ${ult.paginas} páginas` : ""}
                          {ult.duracao_ms != null ? ` em ${ult.duracao_ms}ms` : ""}.
                        </>
                      ) : (
                        <>❌ {ult.erro ?? "Falha desconhecida"}</>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch", minWidth: 160 }}>
                  <input
                    ref={(el) => {
                      inputsRef.current[lei.id] = el;
                    }}
                    type="file"
                    accept="application/pdf,.pdf"
                    style={{ display: "none" }}
                    onChange={(e) => aoEscolherArquivo(lei, e)}
                  />
                  <button
                    onClick={() => dispararUpload(lei)}
                    style={S.btn("#d946ef", desabilitar || indexando || reindexando)}
                    disabled={desabilitar || indexando || reindexando}
                    title="Enviar/substituir PDF e indexar"
                  >
                    {indexando ? "⏳ INDEXANDO…" : "📤 UPLOAD PDF"}
                  </button>
                  <button
                    onClick={() => reindexar(lei)}
                    style={S.btn("#06b6d4", desabilitar || indexando || reindexando || !lei.url_pdf)}
                    disabled={desabilitar || indexando || reindexando || !lei.url_pdf}
                    title="Re-processar PDF existente no R2"
                  >
                    {reindexando ? "⏳ REINDEXANDO…" : "🔄 REINDEXAR"}
                  </button>
                  <button
                    onClick={() => abrirEditar(lei)}
                    style={S.btn("#f59e0b", desabilitar || indexando || reindexando)}
                    disabled={desabilitar || indexando || reindexando}
                  >
                    ✎ EDITAR</button>
                  <button
                    onClick={() => router.push(`/admin/bdi/bip/${lei.id}`)}
                    style={S.btn("#22c55e", desabilitar || indexando || reindexando)}
                    disabled={desabilitar || indexando || reindexando}
                  >
                    📖 LER
                  </button>
                  <button
                    onClick={() => abrirExcluir(lei)}
                    style={S.btn("#ef4444", desabilitar || indexando || reindexando)}
                    disabled={desabilitar || indexando || reindexando}
                  >
                    🗑 EXCLUIR
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: criar / editar */}
      {modalAberto && (
        <div style={S.modalBackdrop} onClick={fecharModal}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div style={{ color: "#d946ef", fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
                {editandoId ? "EDITAR LEI" : "NOVA LEI"}
              </div>
              <button onClick={fecharModal} style={S.btn("#ffffff66", salvando)} disabled={salvando}>
                ✕ FECHAR
              </button>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div style={S.label}>TÍTULO *</div>
                <input
                  style={S.input}
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ex.: Lei Complementar 177 — Código de Obras de Goiânia"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                <div>
                  <div style={S.label}>TIPO *</div>
                  <select
                    style={{ ...S.input, cursor: "pointer" }}
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                  >
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={S.label}>NÚMERO</div>
                  <input
                    style={S.input}
                    value={form.numero}
                    onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                    placeholder="177"
                  />
                </div>
                <div>
                  <div style={S.label}>ANO</div>
                  <input
                    style={S.input}
                    value={form.ano}
                    onChange={(e) => setForm((f) => ({ ...f, ano: e.target.value }))}
                    placeholder="2008"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div>
                <div style={S.label}>EMENTA</div>
                <textarea
                  style={{ ...S.input, minHeight: 80, fontFamily: "inherit", resize: "vertical" }}
                  value={form.ementa}
                  onChange={(e) => setForm((f) => ({ ...f, ementa: e.target.value }))}
                  placeholder="Resumo / descrição da lei (opcional)"
                />
              </div>
              {!editandoId && (
                <div>
                  <div style={S.label}>PDF (opcional)</div>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => setPdfArquivo(e.target.files?.[0] ?? null)}
                    style={{ ...S.input, padding: "8px 10px" }}
                  />
                  <div style={{ ...S.meta, marginTop: 6 }}>
                    Se enviado, o PDF será armazenado no R2 e fragmentado/indexado
                    em seguida (pode demorar até 5 min).
                  </div>
                </div>
              )}
              {editandoId && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#ffffff66",
                    background: "#ffffff05",
                    padding: 10,
                    borderRadius: 4,
                    border: "1px solid #ffffff11",
                  }}
                >
                  Edição de metadados — os fragmentos não serão re-processados.
                  Para reindexar use o botão <strong style={{ color: "#06b6d4" }}>🔄 REINDEXAR</strong> ou
                  envie um novo PDF.
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 20,
              }}
            >
              <button onClick={fecharModal} style={S.btn("#ffffff66", salvando)} disabled={salvando}>
                CANCELAR
              </button>
              <button onClick={salvar} style={S.btn("#22c55e", salvando)} disabled={salvando}>
                {salvando ? "⏳ SALVANDO…" : editandoId ? "💾 SALVAR" : "+ CRIAR LEI"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmação de exclusão */}
      {excluindoLei && (
        <div style={S.modalBackdrop} onClick={fecharExcluir}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ color: "#ef4444", fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
                ⚠ CONFIRMAR EXCLUSÃO
              </div>
              <button onClick={fecharExcluir} style={S.btn("#ffffff66", excluindoExecutando)} disabled={excluindoExecutando}>
                ✕
              </button>
            </div>

            <div style={{ ...S.titulo, marginBottom: 8 }}>{excluindoLei.titulo}</div>
            <div style={{ ...S.meta, marginBottom: 12 }}>
              Esta operação remove: o PDF do R2, todos os fragmentos vetorizados,
              e o registro em <code>bdi_documentos_lei</code>. Não pode ser desfeita.
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={S.label}>ITENS DE CHECKLIST QUE CITAM ESTA LEI</div>
              {carregandoRefs && (
                <div style={{ ...S.meta, padding: "10px 0" }}>Verificando referências…</div>
              )}
              {!carregandoRefs && excluindoReferencias && excluindoReferencias.length === 0 && (
                <div
                  style={{
                    background: "#0a1a0f",
                    border: "1px solid #22c55e55",
                    color: "#86efac",
                    padding: 10,
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  ✓ Nenhum item de checklist referencia esta lei.
                </div>
              )}
              {!carregandoRefs && excluindoReferencias && excluindoReferencias.length > 0 && (
                <div
                  style={{
                    background: "#1a0d05",
                    border: "1px solid #f59e0b55",
                    borderRadius: 4,
                    padding: 10,
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  <div style={{ color: "#fbbf24", fontSize: 11, marginBottom: 8 }}>
                    ⚠ {excluindoReferencias.length} item(ns) possivelmente afetados:
                  </div>
                  {excluindoReferencias.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        fontSize: 11,
                        color: "#ffffff99",
                        padding: "6px 0",
                        borderTop: "1px solid #ffffff11",
                      }}
                    >
                      <div style={{ color: "#ffffffcc", marginBottom: 2 }}>
                        {r.modelo_nome ? `[${r.modelo_nome}] ` : ""}
                        {r.grupo ? `${r.grupo} · ` : ""}
                        {r.texto ?? "(sem texto)"}
                      </div>
                      {r.ref && (
                        <div style={{ color: "#f59e0b", fontSize: 10 }}>ref: {r.ref}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={S.label}>
                DIGITE <span style={{ color: "#ef4444" }}>EXCLUIR</span> PARA CONFIRMAR
              </div>
              <input
                style={S.input}
                value={excluindoConfirma}
                onChange={(e) => setExcluindoConfirma(e.target.value)}
                placeholder="EXCLUIR"
                disabled={excluindoExecutando}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={fecharExcluir}
                style={S.btn("#ffffff66", excluindoExecutando)}
                disabled={excluindoExecutando}
              >
                CANCELAR
              </button>
              <button
                onClick={confirmarExcluir}
                style={S.btn(
                  "#ef4444",
                  excluindoConfirma.trim().toUpperCase() !== "EXCLUIR" || excluindoExecutando,
                )}
                disabled={
                  excluindoConfirma.trim().toUpperCase() !== "EXCLUIR" || excluindoExecutando
                }
              >
                {excluindoExecutando ? "⏳ EXCLUINDO…" : "🗑 EXCLUIR DEFINITIVAMENTE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#0d0d14",
            border: "1px solid #d946ef55",
            color: "#f0f0f0",
            padding: "12px 20px",
            borderRadius: 6,
            fontSize: 12,
            fontFamily: "monospace",
            maxWidth: 520,
            boxShadow: "0 8px 24px #00000088",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
