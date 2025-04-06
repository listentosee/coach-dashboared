import { z } from "zod"

// Schema for a student
export const studentSchema = z.object({
  Name: z.string(),
  Email: z.string().email().optional(),
  Status: z.string().optional(),
  Progress: z.number().optional(),
  LastActive: z.string().optional(),
  CoachId: z.array(z.string()).optional(),
})

// Schema for a coach
export const coachSchema = z.object({
  Name: z.string(),
  Email: z.string().email().optional(),
  Specialty: z.string().optional(),
  StudentsCount: z.number().optional(),
  Rating: z.number().optional(),
})

// Schema for a course
export const courseSchema = z.object({
  Title: z.string(),
  Description: z.string().optional(),
  Duration: z.string().optional(),
  Difficulty: z.string().optional(),
  Enrollment: z.number().optional(),
  CompletionRate: z.number().optional(),
})

// Schema for an activity
export const activitySchema = z.object({
  Type: z.string(),
  StudentId: z.array(z.string()).optional(),
  CoachId: z.array(z.string()).optional(),
  CourseId: z.array(z.string()).optional(),
  Date: z.string().optional(),
  Notes: z.string().optional(),
})

// Types based on schemas
export type Student = z.infer<typeof studentSchema>
export type Coach = z.infer<typeof coachSchema>
export type Course = z.infer<typeof courseSchema>
export type Activity = z.infer<typeof activitySchema>

