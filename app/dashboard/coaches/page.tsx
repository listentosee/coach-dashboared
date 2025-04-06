import { Suspense } from "react"
import { getCoaches } from "@/app/actions/airtable-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

async function CoachesTable() {
  const coaches = await getCoaches()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Coach</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Specialty</TableHead>
          <TableHead>Students</TableHead>
          <TableHead>Rating</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {coaches.length > 0 ? (
          coaches.map((coach) => (
            <TableRow key={coach.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{coach.fields.Name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="font-medium">{coach.fields.Name}</div>
                </div>
              </TableCell>
              <TableCell>{coach.fields.Email || "N/A"}</TableCell>
              <TableCell>{coach.fields.Specialty || "General"}</TableCell>
              <TableCell>{coach.fields.StudentsCount || 0}</TableCell>
              <TableCell>
                <div className="flex items-center">
                  {Array(5)
                    .fill(0)
                    .map((_, i) => (
                      <svg
                        key={i}
                        className={`h-4 w-4 ${i < (coach.fields.Rating || 0) ? "text-yellow-400" : "text-gray-300"}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
                      </svg>
                    ))}
                </div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={5} className="text-center">
              No coaches found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

function CoachesTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Skeleton className="h-8 w-full" />
      </div>
      {Array(5)
        .fill(0)
        .map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
    </div>
  )
}

export default function CoachesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Coaches</h1>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Coach
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Coaches</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<CoachesTableSkeleton />}>
            <CoachesTable />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}

