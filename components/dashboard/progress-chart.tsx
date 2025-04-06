"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

const data = [
  {
    name: "Week 1",
    students: 20,
    completion: 15,
  },
  {
    name: "Week 2",
    students: 18,
    completion: 12,
  },
  {
    name: "Week 3",
    students: 25,
    completion: 20,
  },
  {
    name: "Week 4",
    students: 22,
    completion: 18,
  },
  {
    name: "Week 5",
    students: 30,
    completion: 24,
  },
  {
    name: "Week 6",
    students: 28,
    completion: 22,
  },
]

export function ProgressChart() {
  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader>
        <CardTitle>Student Progress</CardTitle>
      </CardHeader>
      <CardContent className="pl-2">
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="students" fill="#8884d8" name="Active Students" />
            <Bar dataKey="completion" fill="#82ca9d" name="Completions" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

