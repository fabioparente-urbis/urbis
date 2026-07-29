/**
 * lib/rastreabilidade/fechar.ts — fecha o RESULTADO de todo campo declarado que o leitor e a
 * rota não tocaram, sem casos especiais por campo: sintetiza a partir da própria DECLARAÇÃO,
 * do mesmo jeito que os construtores de `lipSlot5.ts` fecham a declaração.
 *
 * `preenchidoPor === "tela"` fica de fora de propósito — só existe `observacoes`, que nasce no
 * aceite. Sintetizar um resultado para ele antes disso inventaria um "não encontrado" para um
 * campo que ainda nem devia existir.
 */

import type { CampoRastreado } from "./tipos";
import type { ResultadoCampo } from "../lerPastaSlot5";

export function fecharResultados(
  campos: CampoRastreado[],
  parciais: Record<string, ResultadoCampo>,
): Record<string, ResultadoCampo> {
  const out: Record<string, ResultadoCampo> = { ...parciais };

  for (const c of campos) {
    if (c.preenchidoPor === "tela") continue;
    if (out[c.chave]) continue;

    if (c.declaracao === "DOCUMENTO_AUSENTE") {
      out[c.chave] = {
        resultado: "DOCUMENTO_AUSENTE", fonte: c.fontePrincipal,
        tentativa: { procurou: c.ondeProcura ?? [], motivo: c.regraSemDado ?? "o documento não integra a pasta deste assunto" },
      };
      continue;
    }

    if (c.declaracao === "BLOQUEADO") {
      const dependencia = c.depende?.length ? `depende de ${c.depende.join(", ")}` : "depende de campo ainda não resolvível";
      out[c.chave] = {
        resultado: "BLOQUEADO", fonte: c.fontePrincipal,
        tentativa: { procurou: c.depende ?? [], motivo: c.regraSemDado ? `${c.regraSemDado} — ${dependencia}` : dependencia },
      };
      continue;
    }

    if (c.declaracao === "MANUAL") {
      out[c.chave] = { resultado: "MANUAL", fonte: "ANALISTA" };
      continue;
    }

    if (c.declaracao === "PENDENTE_VISAO") {
      out[c.chave] = {
        resultado: "NAO_IMPLEMENTADO", fonte: c.fontePrincipal,
        tentativa: { procurou: c.ondeProcura ?? [], motivo: c.regraSemDado ?? c.aplicabilidade ?? "depende do Grupo C (leitura de imagem)" },
      };
      continue;
    }

    // AUTOMATICO ou CALCULADO ainda sem resultado: a fábrica pronta esbarrou num fato que não
    // ocorreu (fatoNecessario) ou o dado simplesmente não estava onde devia (NAO_ENCONTRADO).
    if (c.fatoNecessario) {
      out[c.chave] = {
        resultado: "AGUARDANDO_FATO", fonte: c.fontePrincipal,
        tentativa: { procurou: c.ondeProcura ?? [], motivo: c.fatoNecessario },
      };
      continue;
    }

    out[c.chave] = {
      resultado: "NAO_ENCONTRADO", fonte: c.fontePrincipal,
      tentativa: {
        procurou: c.ondeProcura?.length ? c.ondeProcura : [c.fontePrincipal],
        motivo: `não foi possível localizar ou consultar "${c.chave}"`,
      },
    };
  }

  return out;
}
