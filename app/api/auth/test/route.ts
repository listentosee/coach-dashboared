import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../[...nextauth]/route"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    return NextResponse.json({
      authenticated: !!session,
      session,
      env: {
        hasClientId: !!process.env.AIRTABLE_CLIENT_ID,
        hasClientSecret: !!process.env.AIRTABLE_CLIENT_SECRET,
        hasBaseId: !!process.env.AIRTABLE_BASE_ID,
        hasAccessToken: !!process.env.YOUR_ACCESS_TOKEN,
        hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
        hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
      },
    })
  } catch (error) {
    console.error("Auth test error:", error)

    return NextResponse.json(
      {
        error: "Failed to get session",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

