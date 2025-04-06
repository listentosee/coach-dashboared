import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-3xl font-bold">Cyber Coach Dashboard</h1>
        <p className="mt-4 text-muted-foreground">
          Welcome to the Cyber Coach Dashboard. Click below to access your dashboard.
        </p>
        <div className="mt-6 space-y-4">
          <Button asChild className="w-full">
            <Link href="/auth/signin">Sign In</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/api/debug">Check Configuration</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

