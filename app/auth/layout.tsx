"use client"

import type React from "react"

import { SessionProvider } from "next-auth/react"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SessionProvider>{children}</SessionProvider>
}

