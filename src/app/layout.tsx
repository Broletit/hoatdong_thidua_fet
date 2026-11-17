import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppToaster from "@/components/shared/AppToaster";
import FormUxGuard from "@/components/shared/FormUxGuard";
import GlobalInteractionLoading from "@/components/shared/GlobalInteractionLoading";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_BASE_URL ||
    (process.env.NODE_ENV === "production" ? "https://thidua.tuoitrefetiuh.com" : "http://localhost:3000")
  ),
  title: "Hệ thống thi đua FET",
  description: "HỆ THỐNG QUẢN LÝ HOẠT ĐỘNG VÀ XÉT THI ĐUA - KHEN THƯỞNG - Khoa Công nghệ Điện tử - Trường Đại học Công nghiệp TP. Hồ Chí Minh",
  icons: {
    icon: [
      { url: "/Logo.png", type: "image/png" },
    ],
    shortcut: "/Logo.png",
    apple: "/Logo.png",
  },
  openGraph: {
    title: "Hệ thống thi đua FET",
    description: "HỆ THỐNG QUẢN LÝ HOẠT ĐỘNG VÀ XÉT THI ĐUA - KHEN THƯỞNG FET",
    url: "https://thidua.tuoitrefetiuh.com",
    siteName: "Hệ thống thi đua FET",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Hệ thống thi đua FET",
      },
    ],
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hệ thống thi đua FET",
    description: "HỆ THỐNG QUẢN LÝ HOẠT ĐỘNG VÀ XÉT THI ĐUA - KHEN THƯỞNG FET",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <GlobalInteractionLoading />
        {children}
        <AppToaster />
        <FormUxGuard />
      </body>
    </html>
  );
}
