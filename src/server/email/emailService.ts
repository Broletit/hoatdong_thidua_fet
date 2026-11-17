import nodemailer, { type Transporter } from "nodemailer";
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

class SmtpEmailProvider implements EmailProvider {
  private transporter?: Transporter;

  private settings() {
    const host = process.env.SMTP_HOST?.trim() || "";
    const port = Number(process.env.SMTP_PORT?.trim() || "465");
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE.toLowerCase() === "true"
      : port === 465;
    const user = process.env.SMTP_USER?.trim() || "";
    const pass = process.env.SMTP_PASS?.trim() || "";
    const from = process.env.EMAIL_FROM?.trim() || user;

    if (!host || !user || !pass) {
      throw new Error(
        "Chưa cấu hình đầy đủ SMTP mail tổ chức. Vui lòng thiết lập SMTP_HOST, SMTP_USER và SMTP_PASS trong file cấu hình môi trường (.env)."
      );
    }

    return { host, port, secure, user, pass, from };
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const { host, port, secure, user, pass } = this.settings();
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
        tls: {
          rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === "false" ? false : true,
        },
      });
    }
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const { from } = this.settings();
    const transporter = this.getTransporter();

    const info = await transporter.sendMail({
      from: message.from || from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return {
      providerMessageId: info.messageId || `smtp_${randomUUID()}`,
      status: "sent",
    };
  }
}

function provider(): EmailProvider {
  const kind = (process.env.EMAIL_PROVIDER || "smtp").toLowerCase();
  if (kind === "console") return new ConsoleEmailProvider();
  if (kind === "smtp") return new SmtpEmailProvider();
  throw new Error("EMAIL_PROVIDER phải là 'smtp' hoặc 'console'.");
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
