import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/server/db/mysql";
import { getActivityPublicId } from "@/server/activities/publicActivityId";
import { detailPagePattern, detailApiPattern, getPagePublicId, resolvePagePublicId } from "@/server/auth/publicPageRoute";
import { validateApiRequest } from "@/server/auth/apiRequestGuard";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Kiểm tra chế độ bảo trì hệ thống
  const isMaintenance = process.env.MAINTENANCE_MODE === "true";
  if (isMaintenance) {
    const isMaintenancePath = pathname === "/maintenance";
    const isStatic =
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/static/") ||
      /\.(?:png|jpg|jpeg|gif|svg|ico|webp)$/i.test(pathname);

    const bypassParam = request.nextUrl.searchParams.get("bypass");
    const secret = process.env.PASSWORD_RESET_SECRET || "maintenance-bypass";
    const hasBypass =
      request.cookies.get("maintenance_bypass")?.value === "1" ||
      (Boolean(secret) && Boolean(bypassParam) && bypassParam === secret);

    if (!isMaintenancePath && !isStatic && !hasBypass) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { message: "Hệ thống đang bảo trì nâng cấp định kỳ. Vui lòng quay lại sau.", maintenance: true },
          { status: 503 }
        );
      }
      return NextResponse.redirect(new URL("/maintenance", request.url));
    }

    if (hasBypass && bypassParam) {
      const res = NextResponse.redirect(new URL(pathname, request.url));
      res.cookies.set("maintenance_bypass", "1", { httpOnly: true, sameSite: "lax", maxAge: 86400 });
      return res;
    }
  }

  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    const invalidRequest = validateApiRequest(request);
    if (invalidRequest) return invalidRequest;
  }
  const numeric = request.nextUrl.pathname.match(/^\/dashboard\/(?:admin|student|class-officer|faculty-officer)\/(activities|officer-activities)\/(\d+)(\/edit)?$/);
  const publicRoute = request.nextUrl.pathname.match(/^\/(a|o)\/([a-f0-9]{32})(\/edit)?$/);
  const pageRoute = request.nextUrl.pathname.match(detailPagePattern);
  const apiRoute = request.nextUrl.pathname.match(detailApiPattern);
  const evidenceRoute = request.nextUrl.pathname.startsWith("/uploads/submissions/");
  const protectedApi = isApi && request.nextUrl.pathname !== "/api/auth/me";
  if (!numeric && !publicRoute && !pageRoute && !apiRoute && !evidenceRoute && !protectedApi) return NextResponse.next();
  const db = getDatabase();
  const session = (await db.first(`SELECT s.login_context,u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.id=? AND s.revoked_at IS NULL AND CAST(s.expires_at AS DATETIME(3))>CURRENT_TIMESTAMP(3) AND u.is_active=1`, [request.cookies.get("thiduafet_session")?.value ?? request.cookies.get("merit_track_session")?.value ?? ""])) as {login_context:string;role:string}|undefined;
  if (!session) return isApi ? NextResponse.json({message:"Vui lòng đăng nhập."}, {status:401}) : NextResponse.redirect(new URL("/login",request.url));
  const adminApi = request.nextUrl.pathname.startsWith("/api/admin/") || (request.nextUrl.pathname === "/api/cohorts" && request.method === "POST");
  if (adminApi && (session.role !== "admin" || session.login_context !== "admin")) return NextResponse.json({message:"Không có quyền truy cập."}, {status:403});
  if (evidenceRoute) {
    const file = (await db.first("SELECT id FROM submission_files WHERE status='ready' AND (file_path=? OR object_key=?) LIMIT 1", [request.nextUrl.pathname, "submissions/legacy/" + request.nextUrl.pathname.split("/").pop()])) as {id:number}|undefined;
    if (!file) return new NextResponse("Không tìm thấy tệp.", {status:404});
    const destination = request.nextUrl.clone();
    destination.pathname = `/api/submissions/files/${file.id}`;
    return NextResponse.rewrite(destination);
  }
  if (pageRoute || apiRoute) {
    if (pageRoute && (pageRoute[2] !== session.login_context.replaceAll("_", "-") || (pageRoute[2] === "admin" && session.role !== "admin") || (pageRoute[2] === "class-officer" && (pageRoute[3] === "reviews" || pageRoute[3] === "submissions")))) return new NextResponse("Không có quyền truy cập.", {status:403});
    if (apiRoute?.[2].startsWith("admin/") && (session.login_context !== "admin" || session.role !== "admin")) return NextResponse.json({message:"Không có quyền truy cập."}, {status:403});
    const route = (pageRoute ?? apiRoute)!;
    const destination = request.nextUrl.clone();
    if (/^\d+$/.test(route[4])) {
      // Preserve existing open forms; their Server Actions still check permissions.
      if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
      const token = (await getPagePublicId(db, request.nextUrl.pathname));
      if (!token) return new NextResponse("Không tìm thấy trang.", {status:404});
      destination.pathname = `${route[1]}${token}${route[5] ?? ""}`;
      return NextResponse.redirect(destination);
    }
    const internalPath = (await resolvePagePublicId(db, request.nextUrl.pathname));
    if (!internalPath) return new NextResponse("Không tìm thấy trang.", {status:404});
    destination.pathname = internalPath;
    return NextResponse.rewrite(destination);
  }
  if (numeric) {
    if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
    const token = (await getActivityPublicId(db,Number(numeric[2])));
    if (!token) return new NextResponse("Không tìm thấy hoạt động.",{status:404});
    const destination = request.nextUrl.clone();
    destination.pathname = `/${numeric[1] === "activities" ? "a" : "o"}/${token}${numeric[3] ?? ""}`;
    return NextResponse.redirect(destination);
  }
  if (!publicRoute) return NextResponse.next();
  const activity = (await db.first("SELECT activity_id FROM activity_public_ids WHERE token=?", [publicRoute[2]])) as {activity_id:number}|undefined;
  if (!activity) return new NextResponse("Không tìm thấy hoạt động.",{status:404});
  const context = ["admin","student","class_officer","faculty_officer"].includes(session.login_context) ? session.login_context : "student";
  if ((publicRoute[3] && context !== "admin") || (publicRoute[1] === "o" && context === "student")) return new NextResponse("Không có quyền truy cập.",{status:403});
  const destination = request.nextUrl.clone();
  destination.pathname = `/dashboard/${context.replaceAll("_","-")}/${publicRoute[1] === "o" ? "officer-activities" : "activities"}/${activity.activity_id}${publicRoute[3] ?? ""}`;
  return NextResponse.rewrite(destination);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
