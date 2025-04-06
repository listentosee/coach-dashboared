import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    message: "NextAuth.js API",
    endpoints: [
      "/api/auth/signin",
      "/api/auth/callback",
      "/api/auth/signout",
      "/api/auth/session",
      "/api/auth/csrf",
      "/api/auth/providers",
      "/api/auth/test",
    ],
    documentation: "https://next-auth.js.org/",
    note: "This is an API endpoint for NextAuth.js authentication. It should not be accessed directly.",
  })
}

