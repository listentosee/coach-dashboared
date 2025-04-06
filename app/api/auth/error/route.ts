import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const error = searchParams.get("error") || "direct_access"

  console.error("Auth API error:", {
    error,
    params: Object.fromEntries(searchParams.entries()),
  })

  // If this endpoint is accessed directly without parameters, provide a helpful response
  if (error === "direct_access") {
    return NextResponse.json(
      {
        error: "direct_access",
        message: "This is an authentication error handling endpoint. It should not be accessed directly.",
        help: "If you're seeing this message, you might have navigated to this URL directly. Please go to the sign-in page instead.",
        signInUrl: new URL("/auth/signin", request.url).toString(),
      },
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  }

  // Redirect to the error page with the error parameters
  const errorPageUrl = new URL("/auth/error", request.url)
  searchParams.forEach((value, key) => {
    errorPageUrl.searchParams.append(key, value)
  })

  return NextResponse.redirect(errorPageUrl)
}

