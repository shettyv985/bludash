import { Resend } from "resend";

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM;
  const missing = [
    !apiKey ? "RESEND_API_KEY" : "",
    !from ? "REPORT_EMAIL_FROM" : "",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing email configuration: ${missing.join(", ")}`);
  }

  return {
    apiKey: apiKey!,
    from: from!,
  };
}

function idempotencyKey(subject: string) {
  return `creative-digest/${subject}`
    .replace(/[^a-zA-Z0-9/_:-]+/g, "-")
    .slice(0, 256);
}

export async function sendMail(message: MailMessage) {
  const config = getResendConfig();
  const resend = new Resend(config.apiKey);

  const { data, error } = await resend.emails.send(
    {
      from: config.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    },
    {
      idempotencyKey: idempotencyKey(message.subject),
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
