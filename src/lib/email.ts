import "server-only";

// Sends through Resend when RESEND_API_KEY is set; otherwise logs the email (local development).
export async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email] to=${to} subject=${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "onboarding@resend.dev", to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
}
