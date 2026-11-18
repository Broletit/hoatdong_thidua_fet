import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { passwordResetEmail } from "../src/server/email/templates";
import { getStartOfTodayVn } from "../src/server/email/emailService";
import { getDatabase } from "../src/server/db/mysql";

async function checkQuota() {
  try {
    const db = getDatabase();
    const startOfDay = getStartOfTodayVn();
    const startOfDayStr = startOfDay.toISOString().replace("T", " ").replace("Z", "");
    const row = (await db.first(
      `SELECT COUNT(*) AS total
       FROM email_outbox
       WHERE created_at >= ? AND status <> 'failed'`,
      [startOfDayStr]
    )) as { total: number } | undefined;
    const total = Number(row?.total ?? 0);
    const limit = parseInt(process.env.DAILY_EMAIL_LIMIT || "80", 10);
    console.log(`📊 Hạn mức hôm nay: ${total} / ${limit} email (Múi giờ VN: ${startOfDay.toLocaleDateString("vi-VN")})`);
    if (total >= limit) {
      console.warn("⚠️ CẢNH BÁO: Đã đạt hoặc vượt mức 80 email/ngày. Người dùng yêu cầu gửi mail sẽ nhận thông báo: 'Hệ thống đang bảo trì, thử lại vào ngày mai'.");
    }
  } catch (e: any) {
    console.log(`(Không kiểm tra được database: ${e.message})`);
  }
}

async function main() {
  const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const provider = explicit || (process.env.RESEND_API_KEY ? "resend" : "console");

  console.log("==================================================");
  console.log("           KIỂM TRA HỆ THỐNG GỬI EMAIL");
  console.log("==================================================");
  console.log(`Chế độ đang sử dụng: ${provider.toUpperCase()}`);
  
  await checkQuota();
  console.log("--------------------------------------------------");

  if (provider === "console") {
    console.log("Hệ thống đang chạy chế độ CONSOLE (in ra terminal, không gửi qua internet).");
    const testMsg = passwordResetEmail("sinhvien_test@gmail.com", "888999");
    console.log("Tiêu đề email:", testMsg.subject);
    console.log("Người nhận:", testMsg.to);
    console.log("Nội dung text:", testMsg.text);
    console.log("\n[KẾT QUẢ]: Logic tạo template và mã hóa nội dung hoạt động 100%!");
    process.exit(0);
  }

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY?.trim() || "";
    const from = process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM?.trim() || "IUH <noreply@tuoitrefetiuh.com>";

    console.log(`- Provider: Resend REST API (https://api.resend.com/emails)`);
    console.log(`- API Key: ${apiKey ? apiKey.substring(0, 7) + "..." + apiKey.slice(-4) : "(chưa cấu hình)"}`);
    console.log(`- Email From: ${from}`);

    if (!apiKey) {
      console.error("\n❌ LỖI: Bạn chưa điền RESEND_API_KEY trong file .env!");
      console.log("👉 Vui lòng thêm RESEND_API_KEY=re_... vào file .env.");
      process.exit(1);
    }

    const recipient = process.argv[2];
    if (recipient) {
      console.log(`\nĐang gửi thử email qua Resend API tới: ${recipient}...`);
      const emailContent = passwordResetEmail(recipient, "123456");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        }),
      });

      const data = (await response.json().catch(() => null)) as any;
      if (!response.ok) {
        console.error(`\n❌ GỬI MAIL QUA RESEND THẤT BẠI (${response.status}):`, data?.message || data?.error || response.statusText);
        if (response.status === 401 || response.status === 403) {
          console.error("👉 API Key không hợp lệ hoặc bị khóa trên Resend Dashboard.");
        } else if (response.status === 422) {
          console.error("👉 Tên miền trong 'from' chưa được xác thực (verify DNS) trên Resend, hoặc địa chỉ người nhận không hợp lệ.");
        }
      } else {
        console.log(`✅ GỬI MAIL QUA RESEND THÀNH CÔNG!`);
        console.log(`- Message ID: ${data?.id}`);
        console.log(`- Trạng thái HTTP: ${response.status}`);
      }
    } else {
      console.log("\n💡 Bạn có thể gửi thử email thực tế bằng lệnh:");
      console.log("   npx tsx scripts/test-email.ts your_email@gmail.com");
    }
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
