"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function DebugPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; details?: any } | null>(null)

  const testConnection = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch("/api/debug/airtable")
      const data = await response.json()

      setResult({
        success: response.ok,
        message: data.message || JSON.stringify(data),
        details: data,
      })
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Debug AirTable Connection</h1>
      </div>

      <Tabs defaultValue="test">
        <TabsList>
          <TabsTrigger value="test">Connection Test</TabsTrigger>
          <TabsTrigger value="troubleshoot">Troubleshooting</TabsTrigger>
          <TabsTrigger value="env">Environment Variables</TabsTrigger>
        </TabsList>

        <TabsContent value="test">
          <Card>
            <CardHeader>
              <CardTitle>AirTable Connection Test</CardTitle>
              <CardDescription>Test your AirTable API connection to diagnose any issues</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                This will attempt to connect to your AirTable base using your OAuth token and base ID. If there are any
                issues, the error details will be displayed.
              </p>

              {result && (
                <Alert variant={result.success ? "default" : "destructive"} className="my-4">
                  {result.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <AlertTitle>{result.success ? "Success" : "Error"}</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">
                    {result.message}
                    {result.details && !result.success && (
                      <div className="mt-2 p-2 bg-destructive/10 rounded text-xs font-mono overflow-auto">
                        {JSON.stringify(result.details, null, 2)}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={testConnection} disabled={loading}>
                {loading ? "Testing..." : "Test Connection"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="troubleshoot">
          <Card>
            <CardHeader>
              <CardTitle>Troubleshooting Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium">1. Check OAuth Token</h3>
                  <p className="text-sm text-muted-foreground">
                    AirTable now uses OAuth 2.0 for authentication. Ensure your OAuth token is valid and has the correct
                    scopes.
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 ml-4">
                    <li>
                      Go to{" "}
                      <a
                        href="https://airtable.com/developers/web/api/oauth-reference"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        AirTable OAuth Documentation
                      </a>
                    </li>
                    <li>Create an OAuth application in your AirTable account</li>
                    <li>Request a token with "data.records:read" scope at minimum</li>
                    <li>Store the OAuth token in your environment variables</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium">2. Verify Base ID</h3>
                  <p className="text-sm text-muted-foreground">
                    Make sure your AirTable Base ID is correct. You can find this in the AirTable API documentation.
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 ml-4">
                    <li>Open your base in Airtable</li>
                    <li>Click "Help" in the top-right corner</li>
                    <li>Select "API documentation"</li>
                    <li>The base ID is in the URL and in the "Introduction" section</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium">3. Check Table Names</h3>
                  <p className="text-sm text-muted-foreground">
                    Ensure your table names match exactly what's in AirTable. Table names are case-sensitive. The
                    application expects tables named: "Students", "Coaches", "Courses", and "Activities".
                  </p>
                </div>

                <div>
                  <h3 className="font-medium">4. Check Field Names</h3>
                  <p className="text-sm text-muted-foreground">
                    Field names in AirTable must match the ones expected by the application. Review the schema
                    definitions in the code to ensure they match your AirTable structure.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="env">
          <Card>
            <CardHeader>
              <CardTitle>Environment Variables</CardTitle>
              <CardDescription>Check your environment variable configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium">Required Variables</h3>
                  <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 ml-4">
                    <li>
                      <code className="bg-muted px-1 py-0.5 rounded">AIRTABLE_API_KEY</code> - Your AirTable OAuth token
                    </li>
                    <li>
                      <code className="bg-muted px-1 py-0.5 rounded">AIRTABLE_BASE_ID</code> - The ID of your AirTable
                      base
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium">How to Set Environment Variables</h3>
                  <p className="text-sm text-muted-foreground">
                    In Vercel, you can set environment variables in your project settings:
                  </p>
                  <ol className="list-decimal list-inside text-sm text-muted-foreground mt-2 ml-4">
                    <li>Go to your Vercel project dashboard</li>
                    <li>Click on "Settings" tab</li>
                    <li>Select "Environment Variables" from the sidebar</li>
                    <li>Add both AIRTABLE_API_KEY and AIRTABLE_BASE_ID</li>
                    <li>Click "Save" and redeploy your application</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

