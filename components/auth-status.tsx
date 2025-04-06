"use client"

import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { signIn, signOut } from "next-auth/react"

export function AuthStatus() {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return <div>Loading...</div>
  }

  if (status === "unauthenticated") {
    return <Button onClick={() => signIn("airtable")}>Sign in with AirTable</Button>
  }

  return (
    <div className="flex items-center gap-4">
      <div>Signed in as: {session?.user?.name || "User"}</div>
      <Button variant="outline" size="sm" onClick={() => signOut()}>
        Sign out
      </Button>
    </div>
  )
}

