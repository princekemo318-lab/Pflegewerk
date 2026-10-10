/**
 * Verlängert das Ablaufdatum des Session-Cookies bei aktiver Nutzung.
 * Die eigentliche Prüfung der Sitzung erfolgt serverseitig in der Datenbank;
 * hier wird nichts autorisiert.
 */
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_TTL_SECONDS as TTL_SECONDS } from "@/lib/session-cookie";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && request.method === "GET") {
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TTL_SECONDS,
    });
  }
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};
