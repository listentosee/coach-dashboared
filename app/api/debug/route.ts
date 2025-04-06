import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    env: {
      nodeEnv: process.env.NODE_ENV,
      hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
      nextAuthUrl: process.env.NEXTAUTH_URL,
      hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
      hasAirtableClientId: !!process.env.AIRTABLE_CLIENT_ID,
      hasAirtableClientSecret: !!process.env.AIRTABLE_CLIENT_SECRET,
      hasAirtableBaseId: !!process.env.AIRTABLE_BASE_ID,
      hasAccessToken: !!process.env.YOUR_ACCESS_TOKEN,
    },
  })
}

