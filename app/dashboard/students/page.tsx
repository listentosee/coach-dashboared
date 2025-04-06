import { Suspense } from "react"
import { getStudents } from "@/app/actions/airtable-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"

async function StudentsTable() {
  const students = await getStudents()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Last Active</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.length > 0 ? (
          students.map((student) => (
            <TableRow key={student.id}>
              <TableCell className="font-medium">{student.fields.Name}</TableCell>
              <TableCell>{student.fields.Email || "N/A"}</TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    student.fields.Status === "Active" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {student.fields.Status || "Pending"}
                </span>
              </TableCell>
              <TableCell>{student.fields.Progress || 0}%</TableCell>
              <TableCell>{student.fields.LastActive || "Never"}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={5} className="text-center">
              No students found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

function StudentsTableSkeleton() {
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

export default function StudentsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Students</h1>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Student
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Students</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<StudentsTableSkeleton />}>
            <StudentsTable />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}

