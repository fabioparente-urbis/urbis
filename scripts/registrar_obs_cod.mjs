// Registra uma entrada no OBS COD (caderno de observações sobre o código)
// direto no banco, sem precisar de sessão logada no navegador.
//
// Existe porque toda sessão de IA que trabalha neste repositório deve
// registrar o que foi feito, com data e hora — ver CLAUDE.md, seção
// "OBS COD — registro obrigatório de sessão". Datas e horas são geradas
// pelo próprio banco (criado_em); nunca informe manualmente.
//
// Uso:
//   node scripts/registrar_obs_cod.mjs \
//     --titulo "Resumo curto do que mudou" \
//     --texto "O que foi feito, por quê, e o que ficou pendente." \
//     --categoria decisao \
//     --onde "app/api/admin/backup/route.ts"
//
// --categoria: arquitetura | bug | decisao | pendencia | risco (default: decisao)
// --onde: arquivo(s)/rota(s) principais tocados (opcional, mas recomendado)
// --usuario-email: default fabio.parente@gmail.com

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const CATEGORIAS = ["arquitetura", "bug", "decisao", "pendencia", "risco"];

function argValor(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

const titulo = argValor("titulo");
const texto = argValor("texto") ?? "";
const categoria = argValor("categoria") ?? "decisao";
const onde = argValor("onde");
const usuarioEmail = argValor("usuario-email") ?? "fabio.parente@gmail.com";

if (!titulo) {
  console.error("Uso: node scripts/registrar_obs_cod.mjs --titulo \"...\" [--texto \"...\"] [--categoria decisao] [--onde \"arquivo.ts\"]");
  process.exit(1);
}
if (!CATEGORIAS.includes(categoria)) {
  console.error(`categoria inválida: ${categoria}. Use uma de: ${CATEGORIAS.join(", ")}`);
  process.exit(1);
}

const resUsuario = await fetch(
  `${URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(usuarioEmail)}&select=id`,
  { headers: H },
);
const usuarios = await resUsuario.json();
if (!Array.isArray(usuarios) || usuarios.length === 0) {
  console.error(`Usuário não encontrado: ${usuarioEmail}`);
  process.exit(1);
}
const criado_por = usuarios[0].id;

const res = await fetch(`${URL}/rest/v1/obs_cod`, {
  method: "POST",
  headers: { ...H, Prefer: "return=representation" },
  body: JSON.stringify({ titulo, texto, categoria, onde: onde ?? null, criado_por }),
});
const data = await res.json();
if (!res.ok) {
  console.error("Falha ao registrar:", data);
  process.exit(1);
}
console.log(`✅ Registrado no OBS COD (${data[0]?.criado_em}): ${titulo}`);
