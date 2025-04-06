import NextAuth from "next-auth"
import type { NextAuthOptions } from "next-auth"
import AirtableProvider from "next-auth/providers/airtable"

export const authOptions: NextAuthOptions = {
  providers: [
    AirtableProvider({
      clientId: process.env.AIRTABLE_CLIENT_ID!,
      clientSecret: process.env.AIRTABLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }

