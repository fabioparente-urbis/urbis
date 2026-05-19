// Helper de envio de e-mail "best-effort".
//
// Política:
// 1) Se RESEND_API_KEY estiver definida no ambiente, envia via API HTTP do
//    Resend (sem dependência npm — usa fetch nativo do Node 18+).
// 2) Caso contrário, registra a tentativa em console.warn e retorna ok=false.
//    O chamador NUNCA deve bloquear o fluxo principal por causa de e-mail
//    (best-effort, ver briefing Cowork item 4).
//
// Para ativar em produção, basta configurar no Railway:
//   RESEND_API_KEY=re_xxx
//   EMAIL_FROM="URBIS <no-reply@seu-dominio.com>"   (opcional)

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

export type EmailResult = {
  ok: boolean;
  provider: "resend" | "log" | "none";
  erro?: string;
};

const DEFAULT_FROM = process.env.EMAIL_FROM || "URBIS <no-reply@urbis.local>";

export async function enviarEmail(payload: EmailPayload): Promise<EmailResult> {
  if (!payload?.to) return { ok: false, provider: "none", erro: "destinatário ausente" };

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: payload.from || DEFAULT_FROM,
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn("[email] Resend falhou:", res.status, txt);
        return { ok: false, provider: "resend", erro: `HTTP ${res.status}` };
      }
      return { ok: true, provider: "resend" };
    } catch (e: any) {
      console.warn("[email] Resend lançou:", e?.message || e);
      return { ok: false, provider: "resend", erro: e?.message || String(e) };
    }
  }

  // Fallback: provedor não configurado. Log estruturado para depuração.
  console.warn(
    "[email] RESEND_API_KEY ausente — e-mail não enviado.",
    JSON.stringify({ to: payload.to, subject: payload.subject }),
  );
  return { ok: false, provider: "log" };
}
