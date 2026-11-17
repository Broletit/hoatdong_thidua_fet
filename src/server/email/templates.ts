import type { EmailMessage } from "./types";

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] || char);

export function passwordResetEmail(to: string, code: string): EmailMessage {
  const safeCode = escapeHtml(code);
  return {
    to,
    template: "password_reset",
    subject: "Mã xác nhận khôi phục mật khẩu – Hệ thống Quản lý Hoạt động & Xét Thi đua FET",
    text: `Chào bạn,\n\nMã xác nhận khôi phục mật khẩu của bạn là: ${code}\n\nMã có hiệu lực trong vòng 10 phút và chỉ sử dụng một lần. Vì lý do bảo mật, vui lòng không chia sẻ mã này cho bất kỳ ai.\n\nTrân trọng,\nĐoàn – Hội Khoa Công nghệ Điện tử - Trường Đại học Công nghiệp TP.HCM`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f1f5f9; padding: 30px 15px; color: #1e293b;">
        <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <div style="background: linear-gradient(135deg, #051329 0%, #0a2144 100%); padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; font-size: 18px; margin: 0; font-weight: 700; letter-spacing: 0.5px;">HỆ THỐNG QUẢN LÝ HOẠT ĐỘNG & XÉT THI ĐUA</h1>
            <p style="color: #93c5fd; font-size: 13px; margin: 6px 0 0 0;">Khoa Công nghệ Điện tử – Trường ĐH Công nghiệp TP.HCM</p>
          </div>
          <div style="padding: 28px 24px;">
            <p style="font-size: 15px; margin-top: 0;">Xin chào,</p>
            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với địa chỉ email này. Dưới đây là mã xác thực của bạn:
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <div style="display: inline-block; background-color: #f8fafc; border: 2px dashed #3b82f6; border-radius: 8px; padding: 14px 28px;">
                <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1d4ed8;">${safeCode}</span>
              </div>
            </div>
            <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin-bottom: 8px;">
              ⏱️ Mã xác nhận này có hiệu lực trong vòng <strong>10 phút</strong> và chỉ sử dụng được <strong>một lần</strong>.
            </p>
            <p style="font-size: 13px; line-height: 1.6; color: #ef4444; margin-top: 0;">
              ⚠️ Vì lý do an toàn, vui lòng <strong>không chia sẻ mã này</strong> cho bất kỳ ai.
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />
            <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center; line-height: 1.5;">
              Nếu bạn không yêu cầu khôi phục mật khẩu, vui lòng bỏ qua email này hoặc liên hệ Văn phòng Đoàn khoa (X7.16) để được hỗ trợ.
            </p>
          </div>
        </div>
      </div>
    `,
  };
}
