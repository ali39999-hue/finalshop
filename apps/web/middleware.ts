import { NextResponse, type NextRequest } from "next/server";

/** Assigns an anonymous visitor id so carts and orders have an owner. */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (!request.cookies.get("fs_visitor")) {
    response.cookies.set("fs_visitor", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
