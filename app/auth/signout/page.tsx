"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { LogOut } from "lucide-react"

export default function SignOut() {
  const [isLoading, setIsLoading] = useState(false)

  const handleSignOut = async () => {
    setIsLoading(true)
    await signOut({ callbackUrl: "/auth/signin" })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="mx-auto max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <LogOut className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl">Sign Out</CardTitle>
          <CardDescription>Are you sure you want to sign out?</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <Button onClick={handleSignOut} disabled={isLoading} className="w-full">
            {isLoading ? "Signing out..." : "Sign Out"}
          </Button>
        </CardContent>
        <CardFooter className="text-center text-sm text-muted-foreground">
          <p className="w-full">You will need to sign in again to access the dashboard.</p>
        </CardFooter>
      </Card>
    </div>
  )
}

