import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const error = searchParams.get("error") || "unknown"

  console.error("Sign-in error:", {
    error,
    params: Object.fromEntries(searchParams.entries()),
  })

  // Redirect to the error page with the error parameters
  const errorPageUrl = new URL("/auth/error", request.url)
  searchParams.forEach((value, key) => {
    errorPageUrl.searchParams.append(key, value)
  })

  return NextResponse.redirect(errorPageUrl)
}

