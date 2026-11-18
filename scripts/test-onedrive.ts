import { config } from "dotenv";
config();
config({ path: ".env.local" });

import { OneDriveStorageProvider, getOneDriveConfig } from "@/server/storage/oneDriveStorage";

async function runOneDriveDiagnostics() {
  console.log("=== BẮT ĐẦU KIỂM TRA LƯU TRỮ ONEDRIVE ===");

  console.log("\n1. Đọc biến môi trường:");
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() || "";
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() || "";
  const driveId = process.env.MICROSOFT_DRIVE_ID?.trim() || "";
  const userEmail = process.env.MICROSOFT_USER_EMAIL?.trim() || "";
  const siteId = process.env.MICROSOFT_SITE_ID?.trim() || "";
  const storageRoot = process.env.MICROSOFT_STORAGE_ROOT?.trim() || "thiduafet/evidence";

  console.log(`- MICROSOFT_TENANT_ID:     ${tenantId ? tenantId.slice(0, 8) + "..." : "[CHƯA CÀI]"}`);
  console.log(`- MICROSOFT_CLIENT_ID:     ${clientId ? clientId.slice(0, 8) + "..." : "[CHƯA CÀI]"}`);
  console.log(`- MICROSOFT_CLIENT_SECRET: ${clientSecret ? "******" : "[CHƯA CÀI]"}`);
  console.log(`- MICROSOFT_DRIVE_ID:      ${driveId || "[Để trống - tự động tìm]"}`);
  console.log(`- MICROSOFT_USER_EMAIL:    ${userEmail || "[Để trống]"}`);
  console.log(`- MICROSOFT_SITE_ID:       ${siteId || "[Để trống]"}`);
  console.log(`- MICROSOFT_STORAGE_ROOT:  ${storageRoot}`);

  if (!tenantId || !clientId || !clientSecret) {
    console.error("\n❌ LỖI: Thiếu biến môi trường bắt buộc (TENANT_ID, CLIENT_ID, CLIENT_SECRET) trong file .env hoặc .env.local.");
    console.error("Vui lòng cấu hình các giá trị này trước khi chạy kiểm tra.");
    process.exit(1);
  }

  try {
    const provider = new OneDriveStorageProvider();

    console.log("\n2. Kiểm tra xác thực Token & kết nối Drive...");
    const testKey = `test/diagnostics-${Date.now()}.txt`;
    const testContent = Buffer.from("Test nội dung minh chứng thiduafet lúc " + new Date().toISOString(), "utf8");

    console.log("\n3. Thử tải lên tệp mẫu nhỏ (< 4MB)...");
    const metaSmall = await provider.put(testKey, testContent, "text/plain");
    console.log("✅ Tải lên tệp mẫu thành công!");
    console.log(`   - Kích thước: ${metaSmall.size} bytes`);
    console.log(`   - MimeType:   ${metaSmall.mimeType}`);
    console.log(`   - ETag:       ${metaSmall.etag}`);

    console.log("\n4. Kiểm tra lấy đường dẫn tải trực tiếp (getDirectUrl)...");
    const directUrl = await provider.getDirectUrl(testKey);
    console.log("✅ Lấy link trực tiếp thành công!");
    console.log(`   - Direct URL: ${directUrl.slice(0, 80)}...`);

    console.log("\n5. Thử nghiệm Upload Session với tệp lớn (4.5 MB)...");
    const largeBuffer = Buffer.alloc(4.5 * 1024 * 1024, "A");
    const largeKey = `test/large-${Date.now()}.bin`;
    const metaLarge = await provider.put(largeKey, largeBuffer, "application/octet-stream");
    console.log("✅ Upload Session hoàn tất thành công!");
    console.log(`   - Kích thước: ${(metaLarge.size / (1024 * 1024)).toFixed(2)} MB`);

    console.log("\n6. Dọn dẹp tệp kiểm tra trên OneDrive...");
    await provider.delete(testKey);
    await provider.delete(largeKey);
    console.log("✅ Đã dọn dẹp tệp kiểm tra.");

    console.log("\n🎉 TẤT CẢ KIỂM TRA LƯU TRỮ ONEDRIVE ĐỀU THÀNH CÔNG VÀ SẴN SÀNG SỬ DỤNG!");
  } catch (error) {
    console.error("\n❌ KIỂM TRA THẤT BẠI:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

runOneDriveDiagnostics().catch(console.error);
