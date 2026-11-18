import type { Metadata } from "next";
import MaintenanceClient from "./MaintenanceClient";

export const metadata: Metadata = {
  title: "Bảo trì nâng cấp hệ thống – FET IUH",
  description: "Hệ thống Quản lý Hoạt động & Xét Thi đua – Khen thưởng Khoa Công nghệ Điện tử đang được bảo trì nâng cấp định kỳ.",
};

export default function MaintenancePage() {
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true";

  return <MaintenanceClient isMaintenanceMode={isMaintenanceMode} />;
}
