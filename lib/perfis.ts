// Perfis com visibilidade total dos processos.
// Demais perfis (Analista, etc.) so enxergam/acessam processos atribuidos a eles.
//
// Este modulo nao importa nada de Next ou Supabase para que possa ser usado
// tanto no server (lib/auth.ts) quanto em client components.
export const PERFIS_IRRESTRITOS = ["Administrador", "Gerente", "Diretor"] as const;

export type PerfilIrrestrito = (typeof PERFIS_IRRESTRITOS)[number];

export function isPerfilIrrestrito(
  perfil: string | null | undefined,
): boolean {
  return !!perfil && (PERFIS_IRRESTRITOS as readonly string[]).includes(perfil);
}
