"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

export default function AuthError() {
  const searchParams = useSearchParams()
  const [errorMessage, setErrorMessage] = useState("An unknown error occurred")

  useEffect(() => {
    const error = searchParams.get("error")

    if (error === "Configuration") {
      setErrorMessage("There is a server configuration error. Please check your OAuth credentials.")
    } else if (error === "AccessDenied") {
      setErrorMessage("You denied access to your AirTable account. Please try again and approve the permissions.")
    } else if (error) {
      setErrorMessage(`Authentication error: ${error}`)
    }
  }, [searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="mx-auto max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4 text-destructive">
            <AlertCircle className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl">Authentication Error</CardTitle>
          <CardDescription>There was a problem signing in with AirTable</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center mb-6">{errorMessage}</p>

          <div className="flex justify-center">
            <Button asChild>
              <Link href="/auth/signin">Try Again</Link>
            </Button>
          </div>
        </CardContent>
        <CardFooter className="text-center text-sm text-muted-foreground">
          <p className="w-full">
            If you continue to experience issues, please check your AirTable OAuth application settings.
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

