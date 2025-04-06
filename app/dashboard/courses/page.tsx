import { Suspense } from "react"
import { getCourses } from "@/app/actions/airtable-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"
import { Progress } from "@/components/ui/progress"

async function CoursesTable() {
  const courses = await getCourses()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Difficulty</TableHead>
          <TableHead>Enrollment</TableHead>
          <TableHead>Completion Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courses.length > 0 ? (
          courses.map((course) => (
            <TableRow key={course.id}>
              <TableCell className="font-medium">{course.fields.Title}</TableCell>
              <TableCell>{course.fields.Duration || "N/A"}</TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    course.fields.Difficulty === "Beginner"
                      ? "bg-green-100 text-green-800"
                      : course.fields.Difficulty === "Intermediate"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {course.fields.Difficulty || "Beginner"}
                </span>
              </TableCell>
              <TableCell>{course.fields.Enrollment || 0}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={course.fields.CompletionRate || 0} className="h-2" />
                  <span className="text-sm">{course.fields.CompletionRate || 0}%</span>
                </div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={5} className="text-center">
              No courses found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

function CoursesTableSkeleton() {
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

export default function CoursesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Course
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Courses</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<CoursesTableSkeleton />}>
            <CoursesTable />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}

