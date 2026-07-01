import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { Role } from "@/generated/prisma/client";
import { addDays } from "@/lib/plans";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  events: {
    async createUser({ user }) {
      // Give every new user a 3-day free trial
      if (user.id) {
        await db.user.update({
          where: { id: user.id },
          data: { trialEndsAt: addDays(new Date(), 3) },
        });
      }
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as unknown as { role: Role }).role;
        session.user.isActive = (user as unknown as { isActive: boolean }).isActive;
        const dbUser = user as unknown as { planExpiry: Date | null; trialEndsAt: Date | null };
        session.user.planExpiry = dbUser.planExpiry ? dbUser.planExpiry.toISOString() : null;
        session.user.trialEndsAt = dbUser.trialEndsAt ? dbUser.trialEndsAt.toISOString() : null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
