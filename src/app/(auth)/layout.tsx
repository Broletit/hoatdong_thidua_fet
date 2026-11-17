import SiteFooter from "@/components/layout/SiteFooter";

export default function AuthLayout({children}: {children: React.ReactNode}) {
  return <div className="flex min-h-dvh flex-col bg-[#07162c]"><div className="flex flex-1 flex-col [&>main]:flex-1">{children}</div><SiteFooter variant="auth" /></div>;
}
