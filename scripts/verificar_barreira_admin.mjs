#!/usr/bin/env node
/**
 * scripts/verificar_barreira_admin.mjs — falha se algum método (GET/POST/PUT/PATCH/DELETE) de
 * rota em app/api/admin/** não chamar uma barreira de autenticação (C1, 21/10/2026).
 *
 * Por quê: /api/admin/usuarios ficou aberta à internet desde a criação porque nenhum método
 * chamava autenticação — e uma varredura por ARQUIVO não pega isso quando um método do arquivo
 * tem barreira e outro não. Aqui a conferência é MÉTODO A MÉTODO, inclusive seguindo funções
 * auxiliares do próprio arquivo (ex.: `bloqueioAdmin(req)`).
 *
 * Só lê arquivos. Uso: node scripts/verificar_barreira_admin.mjs  (código de saída 1 = falhou)
 */
import fs from "fs";
import path from "path";

const RAIZ = path.join(process.cwd(), "app", "api", "admin");
const BARREIRA = /\b(autenticar|autorizar|usuarioDaRequisicao|resolverUsuarioIdPorCookie|exigirUsuarioAtivo|exigirAdministradorAtivo|exigirAdministrador|exigirAdmin)\s*\(/;

function rotas(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? rotas(path.join(dir, e.name)) : e.name === "route.ts" ? [path.join(dir, e.name)] : []);
}

function corpoDaFuncao(fonte, nome) {
  const m = fonte.match(new RegExp(`(?:async\\s+)?function\\s+${nome}\\s*\\([\\s\\S]*?\\n}`));
  return m ? m[0] : null;
}

const falhas = [];
let metodos = 0;
for (const arquivo of rotas(RAIZ)) {
  const fonte = fs.readFileSync(arquivo, "utf8");
  const exportados = [...fonte.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)];
  exportados.forEach((m, i) => {
    metodos++;
    const corpo = fonte.slice(m.index, i + 1 < exportados.length ? exportados[i + 1].index : fonte.length);
    if (BARREIRA.test(corpo)) return;
    // Segue auxiliares locais chamados com `req` (um nível).
    const auxiliares = [...corpo.matchAll(/\b(\w+)\s*\(\s*req\b/g)].map((x) => x[1]);
    const protegido = auxiliares.some((nome) => {
      const c = corpoDaFuncao(fonte, nome);
      return c && BARREIRA.test(c);
    });
    if (!protegido) falhas.push(`${m[1].padEnd(6)} ${path.relative(process.cwd(), arquivo)}`);
  });
}

if (falhas.length) {
  console.error(`✗ ${falhas.length} método(s) administrativo(s) sem barreira de autenticação:`);
  for (const f of falhas) console.error("   " + f);
  process.exit(1);
}
console.log(`✓ ${metodos} métodos em app/api/admin conferidos — todos chamam uma barreira de autenticação.`);
