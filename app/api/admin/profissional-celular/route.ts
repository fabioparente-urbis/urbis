import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

// Celular do responsável técnico — SÓ perfil Administrador (nem Diretora).
// Nunca devolve o número a mais ninguém; 403 mudo para os demais.

const SENT = new Set(["", "NP", "N.P.", "N.P", "CAU-NP", "CREA-NP", "N/A", "NA", "-", "--", "NAO POSSUI", "SEM", "SEM RESPONSAVEL"]);
const limpa = (v?: string | null) =>
  (v ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const valido = (v?: string | null) => !SENT.has(limpa(v));

async function exigirAdmin(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.perfis.includes("Administrador")) {
    return NextResponse.json({ ok: false, erro: "SEM_PERMISSAO" }, { status: 403 });
  }
  return ctx;
}

async function achar(nome?: string, cau?: string, crea?: string) {
  const tenta = async (col: string, val: string) => {
    const { data } = await supabaseAdmin.from("profissionais").select("id, merged_into_id")
      .eq(col, val).eq("ativo", true).limit(1).maybeSingle();
    return data;
  };
  let p: any = null;
  if (valido(crea)) p = await tenta("crea", limpa(crea));
  if (!p && valido(cau)) p = await tenta("cau", limpa(cau));
  if (!p && valido(nome)) p = await tenta("nome_normalizado", limpa(nome));
  let id: string | null = p?.id ?? null;
  for (let i = 0; p?.merged_into_id && i < 5; i++) {
    id = p.merged_into_id;
    const { data } = await supabaseAdmin.from("profissionais").select("id, merged_into_id").eq("id", id!).maybeSingle();
    p = data;
  }
  return id;
}

// Responsável técnico = engenheiro; sem engenheiro, o autor arquiteto.
async function resolver(q: { nomeEng?: string; crea?: string; nomeArq?: string; cau?: string }) {
  let id: string | null = null;
  if (valido(q.nomeEng) || valido(q.crea)) id = await achar(q.nomeEng, undefined, q.crea);
  if (!id && (valido(q.nomeArq) || valido(q.cau))) id = await achar(q.nomeArq, q.cau, undefined);
  return id;
}

export async function GET(req: NextRequest) {
  const ctx = await exigirAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const sp = new URL(req.url).searchParams;
  const id = await resolver({ nomeEng: sp.get("nomeEng") ?? "", crea: sp.get("crea") ?? "", nomeArq: sp.get("nomeArq") ?? "", cau: sp.get("cau") ?? "" });
  if (!id) return NextResponse.json({ ok: true, celular: "", profissional: false });
  const { data } = await supabaseAdmin.from("profissional_celular").select("celular, contato_nome").eq("profissional_id", id).maybeSingle();
  return NextResponse.json({ ok: true, celular: data?.celular ?? "", nome: data?.contato_nome ?? "", profissional: true });
}

export async function PUT(req: NextRequest) {
  const ctx = await exigirAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const b = await req.json().catch(() => ({}));
  const celular = String(b.celular ?? "").trim().slice(0, 30);
  const nomeContato = String(b.nomeContato ?? "").trim().slice(0, 120);
  let id = await resolver(b);
  if (!id) {
    // Profissional ainda não cadastrado: cria o mínimo, sem validar.
    const nome = valido(b.nomeEng) ? b.nomeEng : valido(b.nomeArq) ? b.nomeArq : null;
    if (!nome) return NextResponse.json({ ok: false, erro: "SEM_PROFISSIONAL_NO_PROCESSO" }, { status: 422 });
    const ehEng = nome === b.nomeEng;
    const { data, error } = await supabaseAdmin.from("profissionais").insert({
      nome_original: nome, nome_normalizado: limpa(nome),
      crea: ehEng && valido(b.crea) ? limpa(b.crea) : null,
      cau: !ehEng && valido(b.cau) ? limpa(b.cau) : null,
    }).select("id").single();
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    id = data.id;
  }
  if (!celular && !nomeContato) {
    await supabaseAdmin.from("profissional_celular").delete().eq("profissional_id", id!);
    return NextResponse.json({ ok: true, celular: "", nome: "" });
  }
  const { error } = await supabaseAdmin.from("profissional_celular").upsert({
    profissional_id: id, celular, contato_nome: nomeContato || null, atualizado_por: ctx.userId, atualizado_em: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, celular, nome: nomeContato });
}
