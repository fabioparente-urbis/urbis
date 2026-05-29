// Perfis com visibilidade total dos processos.
// Apenas Administrador e Diretora veem todos os processos sem restricao
// de gerencia. Demais perfis (Gerencia PP/MP/GP, Analista) tem regras
// proprias de visibilidade definidas em /api/processos/route.ts.
//
// Este modulo nao importa nada de Next ou Supabase para que possa ser
// usado tanto no server (lib/auth.ts) quanto em client components.
export const PERFIS_IRRESTRITOS = ["Administrador", "Diretora", "Diretor"] as const;

export type PerfilIrrestrito = (typeof PERFIS_IRRESTRITOS)[number];

// Perfis das 3 gerencias da DIRAAP. Cada um e unico no sistema (constraint
// no banco) e ve apenas processos dos seus analistas (usuarios.gerencia).
export const PERFIS_GERENCIA = ["Gerência GERECCO", "Gerência GERAED", "Gerência GERAGP", "Gerência GERAP"] as const;
export type PerfilGerencia = (typeof PERFIS_GERENCIA)[number];

// Codigos de gerencia armazenados em usuarios.gerencia. NULL = DIRAAP direto.
export const GERENCIAS = ["GERECCO", "GERAED", "GERAGP", "GERAP"] as const;
export type Gerencia = (typeof GERENCIAS)[number];

// Catalogo canonico de perfis para o checkbox em /admin/usuarios.
export const PERFIS_DISPONIVEIS = [
  "Administrador",
  "Diretora",
  "Gerência GERECCO",
  "Gerência GERAED",
  "Gerência GERAGP",
  "Gerência GERAP",
  "Analista",
] as const;

/**
 * Aceita string unica (legado) ou array de perfis. Retorna true se houver
 * qualquer perfil irrestrito (Administrador ou Diretora).
 */
export function isPerfilIrrestrito(
  perfil: string | string[] | null | undefined,
): boolean {
  if (!perfil) return false;
  const lista = Array.isArray(perfil) ? perfil : [perfil];
  return lista.some((p) =>
    !!p && (PERFIS_IRRESTRITOS as readonly string[]).includes(p),
  );
}

/**
 * Retorna a gerencia associada ao perfil ("Gerência GERECCO" -> "GERECCO"). Aceita
 * string unica ou array. Retorna null quando nao ha perfil de gerencia.
 */
export function gerenciaDoPerfil(
  perfil: string | string[] | null | undefined,
): Gerencia | null {
  if (!perfil) return null;
  const lista = Array.isArray(perfil) ? perfil : [perfil];
  for (const p of lista) {
    if (p === "Gerência GERECCO") return "GERECCO";
    if (p === "Gerência GERAED") return "GERAED";
    if (p === "Gerência GERAGP") return "GERAGP";
    if (p === "Gerência GERAP") return "GERAP";
  }
  return null;
}
