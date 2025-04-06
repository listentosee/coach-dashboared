import { NextResponse } from "next/server"

export async function GET() {
  const baseId = process.env.AIRTABLE_BASE_ID
  const apiKey = process.env.YOUR_ACCESS_TOKEN

  // Check if environment variables are set
  if (!baseId || !apiKey) {
    return NextResponse.json(
      {
        success: false,
        message: "Missing AirTable credentials",
        details: {
          hasBaseId: !!baseId,
          hasApiKey: !!apiKey,
        },
      },
      { status: 400 },
    )
  }

  try {
    // Try to fetch a table to test connection
    const url = `https://api.airtable.com/v0/${baseId}/Students`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        {
          success: false,
          message: `AirTable API error (${response.status})`,
          details: errorText,
        },
        { status: response.status },
      )
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      message: "Successfully connected to AirTable",
      tableInfo: {
        recordCount: data.records?.length || 0,
        offset: data.offset,
      },
    })
  } catch (error) {
    console.error("Error testing AirTable connection:", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}

