import nodemailer from "nodemailer";
import "server-only";

/**
 * Outgoing email, over plain SMTP.
 *
 * SMTP rather than a provider SDK because every mail service speaks it —
 * Fastmail, Gmail with an app password, Resend, Postmark, or the host's own
 * relay. Changing provider is a change of environment variables, not code.
 *
 * If SMTP isn't configured, sending is skipped and said so plainly rather than
 * failing loudly: the practice should keep working whether or not email does.
 */

export type MailResult = { sent: boolean; detail: string };

function transport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
      : undefined,
  });
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}): Promise<MailResult> {
  const mailer = transport();
  if (!mailer) {
    return { sent: false, detail: "SMTP is not configured (SMTP_HOST unset)" };
  }

  try {
    const info = await mailer.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@localhost",
      to: options.to,
      subject: options.subject,
      text: options.text,
      attachments: options.attachments,
    });
    return { sent: true, detail: info.messageId ?? "sent" };
  } catch (error) {
    return {
      sent: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
