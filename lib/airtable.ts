import type { z } from "zod"

// Define the base URL for Airtable API
const AIRTABLE_API_URL = "https://api.airtable.com/v0"

// Type for AirTable record
export type AirtableRecord<T> = {
  id: string
  fields: T
  createdTime: string
}

// Get the AirTable token - either from the environment variable or from the session
function getAirtableToken() {
  return process.env.YOUR_ACCESS_TOKEN
}

// Generic function to fetch records from a table
export async function getRecords<T>(tableName: string, schema?: z.ZodType<T>): Promise<AirtableRecord<T>[]> {
  const baseId = process.env.AIRTABLE_BASE_ID
  const apiKey = getAirtableToken()

  if (!baseId || !apiKey) {
    console.error("Missing AirTable credentials:", {
      hasBaseId: !!baseId,
      hasApiKey: !!apiKey,
    })
    return []
  }

  const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}`

  try {
    console.log(`Fetching data from table: ${tableName}`)

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`AirTable API error (${response.status}):`, errorText)

      // For 403 errors, provide more specific guidance
      if (response.status === 403) {
        console.error(`
          This is likely due to one of the following:
          1. The OAuth token doesn't have permission to access this base
          2. The base ID is incorrect
          3. The table "${tableName}" doesn't exist in this base
          4. The OAuth token doesn't have the required scopes (needs at least data.records:read)
        `)
      }

      throw new Error(`Failed to fetch data: ${response.status}\n${errorText}`)
    }

    const data = await response.json()

    // Validate data if schema is provided
    if (schema) {
      try {
        const records = data.records.map((record: any) => ({
          ...record,
          fields: schema.parse(record.fields),
        }))
        return records
      } catch (validationError) {
        console.error("Schema validation error:", validationError)
        // Return raw data if validation fails
        return data.records
      }
    }

    return data.records
  } catch (error) {
    console.error("Error fetching from Airtable:", error)
    return []
  }
}

// Function to create a new record
export async function createRecord<T>(tableName: string, fields: T): Promise<AirtableRecord<T> | null> {
  const baseId = process.env.AIRTABLE_BASE_ID
  const apiKey = getAirtableToken()

  if (!baseId || !apiKey) {
    console.error("Missing AirTable credentials")
    return null
  }

  const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`AirTable API error (${response.status}):`, errorText)
      throw new Error(`Failed to create record: ${response.status}\n${errorText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error("Error creating record in Airtable:", error)
    return null
  }
}

// Function to update a record
export async function updateRecord<T>(
  tableName: string,
  recordId: string,
  fields: Partial<T>,
): Promise<AirtableRecord<T> | null> {
  const baseId = process.env.AIRTABLE_BASE_ID
  const apiKey = getAirtableToken()

  if (!baseId || !apiKey) {
    console.error("Missing AirTable credentials")
    return null
  }

  const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}/${recordId}`

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`AirTable API error (${response.status}):`, errorText)
      throw new Error(`Failed to update record: ${response.status}\n${errorText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error("Error updating record in Airtable:", error)
    return null
  }
}

