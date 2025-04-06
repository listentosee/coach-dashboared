import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function IndexPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-3xl font-bold">Cyber Coach Dashboard</h1>
        <p className="mt-4 text-muted-foreground">
          Welcome to the Cyber Coach Dashboard. Click below to access your dashboard.
        </p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </div>
  )
}

