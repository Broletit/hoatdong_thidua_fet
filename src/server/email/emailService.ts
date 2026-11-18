import { randomUUID } from "node:crypto";
import { getDatabase, type Database } from "@/server/db/mysql";
import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";

/**
 * Trả về mốc thời gian bắt đầu ngày hôm nay (00:00:00) theo múi giờ Việt Nam (UTC+7).
 */
export function getStartOfTodayVn(): Date {
  const now = new Date();
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnNow = new Date(now.getTime() + vnOffsetMs);
  const year = vnNow.getUTCFullYear();
  const month = vnNow.getUTCMonth();
  const date = vnNow.getUTCDate();
  return new Date(Date.UTC(year, month, date) - vnOffsetMs);
}

/**
 * Đếm số lượng email đã gửi thành công hoặc đang chờ xử lý trong ngày hôm nay.
 */
export async function getDailyEmailCount(db: Database): Promise<number> {
  const startOfDay = getStartOfTodayVn();
  const startOfDayStr = startOfDay.toISOString().replace("T", " ").replace("Z", "");
  const row = (await db.first(
    `SELECT COUNT(*) AS total
     FROM email_outbox
     WHERE created_at >= ? AND status <> 'failed'`,
    [startOfDayStr]
  )) as { total: number } | undefined;
  return Number(row?.total ?? 0);
}

/**
 * Kiểm tra giới hạn email/ngày cho toàn bộ hệ thống (mặc định 80 email/ngày).
 * Nếu vượt quá giới hạn, ném ra ngoại lệ "Hệ thống đang bảo trì, thử lại vào ngày mai".
 */
export async function assertDailyEmailLimit(db: Database) {
  const limit = parseInt(process.env.DAILY_EMAIL_LIMIT || "80", 10);
  const count = await getDailyEmailCount(db);
  if (count >= limit) {
    throw new Error("Hệ thống đang bảo trì, thử lại vào ngày mai");
  }
}

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
  private getSettings() {
    const apiKey = process.env.RESEND_API_KEY?.trim() || "";
    const from =
      process.env.EMAIL_FROM?.trim() ||
      process.env.RESEND_FROM?.trim() ||
      "IUH <noreply@tuoitrefetiuh.com>";

    if (!apiKey) {
      throw new Error(
        "Chưa cấu hình RESEND_API_KEY trong file .env. Vui lòng thiết lập để sử dụng Resend API."
      );
    }
    return { apiKey, from };
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const { apiKey, from } = this.getSettings();

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: message.from || from,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        html: message.html || undefined,
        text: message.text || undefined,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; error?: string; name?: string }
      | null;

    if (!response.ok) {
      const errMsg =
        data?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`Resend API thất bại (${response.status}): ${errMsg}`);
    }

    return {
      providerMessageId: data?.id || `resend_${randomUUID()}`,
      status: "sent",
    };
  }
}

function provider(): EmailProvider {
  const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === "console") return new ConsoleEmailProvider();
  if (explicit === "resend") return new ResendEmailProvider();

  // Tự động nhận diện nếu có cấu hình RESEND_API_KEY
  if (process.env.RESEND_API_KEY?.trim()) return new ResendEmailProvider();
  return new ConsoleEmailProvider();
}

export async function sendEmail(message: EmailMessage) {
  const db = getDatabase();

  // Kiểm tra giới hạn email/ngày cho toàn bộ hệ thống
  await assertDailyEmailLimit(db);

  const id = randomUUID();
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
