/**
 * Restaura prompts do LIP a partir de um backup JSON gerado antes de uma alteração.
 *
 * Uso (a partir da raiz do projeto):
 *   node scripts/restaurar_prompts.mjs backups/prompts/lip_prompts_slot1_slot2_2026-08-20T11-16-59.json
 *
 * O script fica versionado aqui, mas os arquivos de backup ficam em
 * `backups/`, que é ignorado pelo git — o dado é local, a ferramenta não.
 *
 * Restaura `conteudo`, `versao`, `ativo` e `nome` EXATAMENTE como estavam no
 * momento do backup, casando por `id`. Não cria nem apaga linha nenhuma — só
 * devolve o conteúdo antigo por cima do atual.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("Informe o arquivo de backup. Ex.:");
  console.error("  node scripts/restaurar_prompts.mjs backups/prompts/lip_prompts_slot1_slot2_2026-08-20T11-16-59.json");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const bkp = JSON.parse(readFileSync(arquivo, "utf8"));
console.log("Backup de:", bkp.gerado_em);
console.log("Motivo:   ", bkp.motivo);
console.log("git HEAD: ", bkp.git_head);
console.log("registros:", bkp.registros.length);
console.log("");

for (const p of bkp.registros) {
  const { error } = await supabase
    .from("lip_prompts")
    .update({ conteudo: p.conteudo, versao: p.versao, ativo: p.ativo, nome: p.nome })
    .eq("id", p.id);
  if (error) {
    console.error(`  ✗ id=${p.id} (${p.chave}): ${error.message}`);
  } else {
    console.log(`  ✓ id=${p.id} ${p.chave} → versao ${p.versao} restaurada (${p.conteudo?.length} chars)`);
  }
}

console.log("\nPronto. Confira no /admin/configuracoes antes de rodar uma leitura.");
