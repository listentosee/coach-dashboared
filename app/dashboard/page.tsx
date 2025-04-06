import { Suspense } from "react"
import { Users, GraduationCap, BookOpen, BarChart3 } from "lucide-react"
import { getDashboardStats } from "../actions/airtable-actions"
import { StatCard } from "@/components/dashboard/stat-card"
import { RecentActivities } from "@/components/dashboard/recent-activities"
import { ProgressChart } from "@/components/dashboard/progress-chart"
import { ErrorCard } from "@/components/dashboard/error-card"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

async function DashboardContent() {
  try {
    const stats = await getDashboardStats()

    // If we have no data at all, it might indicate an API error
    if (stats.totalStudents === 0 && stats.totalCoaches === 0 && stats.totalCourses === 0) {
      return (
        <ErrorCard
          title="Unable to load dashboard data"
          description="There was an error connecting to AirTable or no data was found."
        />
      )
    }

    return (
      <>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Students"
            value={stats.totalStudents}
            icon={Users}
            description="Active learners on the platform"
            trend={{ value: 12, isPositive: true }}
          />
          <StatCard
            title="Total Coaches"
            value={stats.totalCoaches}
            icon={GraduationCap}
            description="Expert mentors and instructors"
            trend={{ value: 5, isPositive: true }}
          />
          <StatCard
            title="Total Courses"
            value={stats.totalCourses}
            icon={BookOpen}
            description="Available learning materials"
            trend={{ value: 3, isPositive: true }}
          />
          <StatCard
            title="Completion Rate"
            value={`${Math.round(stats.completionRate * 100)}%`}
            icon={BarChart3}
            description="Average course completion"
            trend={{ value: 8, isPositive: true }}
          />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <RecentActivities activities={stats.recentActivities} />
          <ProgressChart />
        </div>
      </>
    )
  } catch (error) {
    console.error("Error rendering dashboard:", error)
    return <ErrorCard title="Dashboard Error" description="There was an error loading the dashboard data." />
  }
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array(4)
          .fill(0)
          .map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-1 md:col-span-2">
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array(3)
                .fill(0)
                .map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-1 md:col-span-2 lg:col-span-1">
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[350px] w-full" />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  )
}

