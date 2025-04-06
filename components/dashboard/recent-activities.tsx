import type { Activity } from "@/lib/schemas"
import type { AirtableRecord } from "@/lib/airtable"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface RecentActivitiesProps {
  activities: AirtableRecord<Activity>[]
}

export function RecentActivities({ activities }: RecentActivitiesProps) {
  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader>
        <CardTitle>Recent Activities</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.length > 0 ? (
            activities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4 rounded-lg border p-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{activity.fields.Type.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">{activity.fields.Type}</p>
                  <p className="text-sm text-muted-foreground">{activity.fields.Notes || "No additional details"}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {activity.fields.Date
                    ? new Date(activity.fields.Date).toLocaleDateString()
                    : new Date(activity.createdTime).toLocaleDateString()}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No recent activities</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

