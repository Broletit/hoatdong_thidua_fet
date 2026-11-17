import { randomUUID } from "node:crypto";
import { getDatabase } from "@/server/db/mysql";
import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.info("[email:console]", {
      to: message.to,
      subject: message.subject,
      template: message.template,
    });
    return { providerMessageId: `console_${randomUUID()}`, status: "sent" };
  }
}

class ResendEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "Chưa cấu hình RESEND_API_KEY trong file môi trường (.env). Vui lòng thêm khóa RESEND_API_KEY=re_... để gửi mail qua Resend."
      );
    }

    const defaultFrom = process.env.EMAIL_FROM?.trim() || "IUH <noreply@tuoitrefetiuh.com>";
    const from = message.from?.trim() || defaultFrom;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        html: message.html || undefined,
        text: message.text || undefined,
      }),
    });

    const data = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
      name?: string;
    } | null;

    if (!response.ok) {
      const errorDetail = data?.message || `Mã lỗi HTTP ${response.status}`;
      throw new Error(`Gửi email qua Resend API thất bại: ${errorDetail}`);
    }

    return {
      providerMessageId: data?.id || `resend_${randomUUID()}`,
      status: "sent",
    };
  }
}

function provider(): EmailProvider {
  const kind = (process.env.EMAIL_PROVIDER || "resend").trim().toLowerCase();
  if (kind === "console") return new ConsoleEmailProvider();
  if (kind === "resend") return new ResendEmailProvider();
  throw new Error("EMAIL_PROVIDER phải là 'resend' hoặc 'console'.");
}

export async function sendEmail(message: EmailMessage) {
  const id = randomUUID();
  const db = getDatabase();
  await db.execute(
    "INSERT INTO email_outbox(id,recipient,template_name,subject,payload_json,status) VALUES(?,?,?,?,?,'pending')",
    [id, message.to, message.template, message.subject, JSON.stringify({ text: message.text, html: message.html })]
  );
  try {
    const result = await provider().send(message);
    await db.execute(
      "UPDATE email_outbox SET status=?,provider_message_id=?,attempts=attempts+1,sent_at=CURRENT_TIMESTAMP(3),updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
      [result.status, result.providerMessageId || null, id]
    );
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Email provider failure";
    console.error("[Email Error]:", errorMsg);
    await db.execute(
      "UPDATE email_outbox SET status='failed',attempts=attempts+1,last_error=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
      [errorMsg, id]
    );
    throw error;
  }
}
