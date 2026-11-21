import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: anyone without a session cookie is sent to /login.
// The cookie itself is verified against MongoDB on every page and action.
export function proxy(req: NextRequest) {
  if (!req.cookies.get("dd_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/|favicon.ico|icon|robots.txt).*)"],
};
