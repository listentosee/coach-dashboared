"use client"

import { AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface ErrorCardProps {
  title: string
  description?: string
  retryAction?: () => void
}

export function ErrorCard({ title, description, retryAction }: ErrorCardProps) {
  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            There was an error connecting to AirTable. Please check your API key and base ID.
          </AlertDescription>
        </Alert>
        {retryAction && (
          <Button onClick={retryAction} className="mt-4">
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

