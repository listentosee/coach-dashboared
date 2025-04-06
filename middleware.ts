import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  // Skip middleware for all auth-related paths and API routes
  if (
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/api/") ||
    request.nextUrl.pathname === "/"
  ) {
    return NextResponse.next()
  }

  // For dashboard routes, redirect to sign in if not authenticated
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    // For now, just redirect to sign in without checking auth
    // This simplifies the middleware to rule it out as a cause
    const url = new URL("/auth/signin", request.url)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

