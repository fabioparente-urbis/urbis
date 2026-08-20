"use client";

/**
 * Contenção de erro para a tela do LIP.
 *
 * Sem isto, um erro em tempo de execução em `ProcessoClient.tsx` — que é 1
 * componente só servindo os 15 slots — derrubava a página inteira em branco
 * ("Application error"), sem explicação e sem saída. Este arquivo é uma
 * convenção do Next.js App Router: qualquer erro não tratado dentro de
 * `app/processo/**` renderiza isto no lugar da página quebrada, sem afetar o
 * resto do site.
 *
 * Não resolve o compartilhamento entre slots — só evita que o analista fique
 * com uma tela branca sem nada pra fazer quando algo quebrar.
 */
export default function ErroProcesso({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 max-w-md w-full text-center">
        <p className="text-2xl mb-2">⚠️</p>
        <h1 className="text-lg font-bold text-[var(--text-primary)] mb-1">
          Essa tela travou
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          O que você já tinha salvo não se perde — só esta página quebrou.
          Tenta de novo; se continuar acontecendo, avisa com a mensagem abaixo.
        </p>
        <div className="flex justify-center gap-2 mb-4">
          <button
            onClick={reset}
            className="px-4 py-2 rounded font-bold text-sm bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white"
          >
            🔄 Tentar de novo
          </button>
          <a
            href="/processo"
            className="px-4 py-2 rounded font-bold text-sm bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)]"
          >
            ← Voltar aos processos
          </a>
        </div>
        <details className="text-left text-xs text-[var(--text-muted)]">
          <summary className="cursor-pointer">Detalhe técnico</summary>
          <pre className="whitespace-pre-wrap break-words mt-1">
            {error.message}
            {error.digest ? `\n(ref: ${error.digest})` : ""}
          </pre>
        </details>
      </div>
    </div>
  );
}
