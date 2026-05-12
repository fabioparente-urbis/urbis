// Perfis com visibilidade total dos processos.
// Demais perfis (Analista, etc.) so enxergam/acessam processos atribuidos a eles.
//
// Este modulo nao importa nada de Next ou Supabase para que possa ser usado
// tanto no server (lib/auth.ts) quanto em client components.
export const PERFIS_IRRESTRITOS = ["Administrador", "Gerente", "Diretor"] as const;

export type PerfilIrrestrito = (typeof PERFIS_IRRESTRITOS)[number];

// Catálogo canônico de perfis (usado pela UI de checkboxes em /admin/usuarios).
export const PERFIS_DISPONIVEIS = ["Administrador", "Gerente", "Diretor", "Analista"] as const;

/**
 * Aceita string única (legado) ou array de perfis. Retorna true se houver
 * qualquer perfil irrestrito.
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
