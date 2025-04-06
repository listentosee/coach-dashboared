"use server"

import { getRecords } from "@/lib/airtable"
import {
  type Student,
  type Coach,
  type Course,
  type Activity,
  studentSchema,
  coachSchema,
  courseSchema,
  activitySchema,
} from "@/lib/schemas"

// Fetch students
export async function getStudents() {
  try {
    return await getRecords<Student>("Students", studentSchema)
  } catch (error) {
    console.error("Error fetching students:", error)
    return []
  }
}

// Fetch coaches
export async function getCoaches() {
  try {
    return await getRecords<Coach>("Coaches", coachSchema)
  } catch (error) {
    console.error("Error fetching coaches:", error)
    return []
  }
}

// Fetch courses
export async function getCourses() {
  try {
    return await getRecords<Course>("Courses", courseSchema)
  } catch (error) {
    console.error("Error fetching courses:", error)
    return []
  }
}

// Fetch activities
export async function getActivities() {
  try {
    return await getRecords<Activity>("Activities", activitySchema)
  } catch (error) {
    console.error("Error fetching activities:", error)
    return []
  }
}

// Get dashboard stats
export async function getDashboardStats() {
  try {
    const students = await getStudents()
    const coaches = await getCoaches()
    const courses = await getCourses()
    const activities = await getActivities()

    return {
      totalStudents: students.length,
      totalCoaches: coaches.length,
      totalCourses: courses.length,
      recentActivities: activities.slice(0, 5),
      activeStudents: students.filter((s) => s.fields.Status === "Active").length,
      completionRate:
        courses.length > 0
          ? courses.reduce((acc, course) => acc + (course.fields.CompletionRate || 0), 0) / courses.length
          : 0,
    }
  } catch (error) {
    console.error("Error fetching dashboard stats:", error)
    return {
      totalStudents: 0,
      totalCoaches: 0,
      totalCourses: 0,
      recentActivities: [],
      activeStudents: 0,
      completionRate: 0,
    }
  }
}

