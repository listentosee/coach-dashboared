"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GraduationCap } from "lucide-react"

export default function SignIn() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Use the direct approach without redirects first
      const result = await signIn("airtable", { redirect: false })

      if (result?.error) {
        setError(result.error)
        console.error("Sign-in error:", result.error)
      } else if (result?.url) {
        window.location.href = result.url
      }
    } catch (err) {
      console.error("Sign-in exception:", err)
      setError("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="mx-auto max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <GraduationCap className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl">Cyber Coach Dashboard</CardTitle>
          <CardDescription>Sign in with your AirTable account</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          {error && <div className="w-full p-3 text-sm bg-red-100 text-red-800 rounded-md">Error: {error}</div>}

          <Button onClick={handleSignIn} disabled={isLoading} className="w-full">
            {isLoading ? "Signing in..." : "Sign in with AirTable"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

