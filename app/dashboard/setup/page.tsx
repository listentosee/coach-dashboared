import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export default function SetupPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">AirTable Setup Guide</h1>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Important</AlertTitle>
        <AlertDescription>
          AirTable has moved from personal API tokens to OAuth 2.0 for authentication. This guide will help you set up
          OAuth for your application.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Step 1: Create an OAuth Application in AirTable</CardTitle>
          <CardDescription>Set up your OAuth credentials in AirTable</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Go to{" "}
              <a
                href="https://airtable.com/create/oauth"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                https://airtable.com/create/oauth
              </a>
            </li>
            <li>Click "Create an OAuth application"</li>
            <li>
              Fill in the required information:
              <ul className="list-disc list-inside ml-6 mt-1">
                <li>Application Name: "Cyber Coach Dashboard"</li>
                <li>
                  Redirect URL: Your application's callback URL (e.g., https://your-app.vercel.app/api/auth/callback)
                </li>
                <li>
                  Scopes: Select at least "data.records:read" (and "data.records:write" if you need to create/update
                  records)
                </li>
              </ul>
            </li>
            <li>Click "Create OAuth application"</li>
            <li>Save your Client ID and Client Secret</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2: Implement OAuth Flow</CardTitle>
          <CardDescription>Set up the OAuth flow in your application</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            For a Next.js application, you'll need to implement the OAuth flow to get an access token. You can use
            libraries like NextAuth.js or implement it manually.
          </p>

          <div className="bg-muted p-4 rounded-md">
            <h4 className="font-medium mb-2">Manual Implementation Example:</h4>
            <ol className="list-decimal list-inside space-y-2">
              <li>Create an API route for initiating the OAuth flow</li>
              <li>Create a callback route to handle the OAuth response</li>
              <li>Store the access token securely</li>
              <li>Use the access token for AirTable API requests</li>
            </ol>
          </div>

          <p className="text-sm text-muted-foreground">
            For a production application, consider using a library like NextAuth.js which handles many security concerns
            automatically.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 3: Get an Access Token</CardTitle>
          <CardDescription>Obtain an access token for AirTable API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Once your OAuth flow is implemented, you'll receive an access token that can be used to authenticate with
            the AirTable API.
          </p>

          <div className="bg-muted p-4 rounded-md">
            <h4 className="font-medium mb-2">Access Token Usage:</h4>
            <pre className="text-sm overflow-x-auto p-2">
              {`
// Example of using the access token
const response = await fetch('https://api.airtable.com/v0/YOUR_BASE_ID/YOUR_TABLE', {
  headers: {
    'Authorization': 'Bearer YOUR_ACCESS_TOKEN',
    'Content-Type': 'application/json'
  }
});
              `}
            </pre>
          </div>

          <p className="text-sm text-muted-foreground">
            Store this token securely in your environment variables as AIRTABLE_API_KEY.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 4: Set Up Your AirTable Base</CardTitle>
          <CardDescription>Configure your AirTable base for the dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>Your AirTable base should have the following tables with these fields:</p>

          <div className="space-y-3">
            <div>
              <h4 className="font-medium">Students Table</h4>
              <ul className="list-disc list-inside ml-4">
                <li>Name (Single line text)</li>
                <li>Email (Single line text)</li>
                <li>Status (Single select)</li>
                <li>Progress (Number)</li>
                <li>LastActive (Date)</li>
                <li>CoachId (Link to Coaches table)</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium">Coaches Table</h4>
              <ul className="list-disc list-inside ml-4">
                <li>Name (Single line text)</li>
                <li>Email (Single line text)</li>
                <li>Specialty (Single line text)</li>
                <li>StudentsCount (Number)</li>
                <li>Rating (Number)</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium">Courses Table</h4>
              <ul className="list-disc list-inside ml-4">
                <li>Title (Single line text)</li>
                <li>Description (Long text)</li>
                <li>Duration (Single line text)</li>
                <li>Difficulty (Single select)</li>
                <li>Enrollment (Number)</li>
                <li>CompletionRate (Number)</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium">Activities Table</h4>
              <ul className="list-disc list-inside ml-4">
                <li>Type (Single line text)</li>
                <li>StudentId (Link to Students table)</li>
                <li>CoachId (Link to Coaches table)</li>
                <li>CourseId (Link to Courses table)</li>
                <li>Date (Date)</li>
                <li>Notes (Long text)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Link href="/dashboard/debug" className="text-blue-500 hover:underline">
          Go to Debug Page →
        </Link>
      </div>
    </div>
  )
}

