import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],

  callbacks: {
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub ?? ""; // fallback to empty string
        session.user.image = token.picture ?? ""; // fallback to empty string
      }
      return session;
    },

    async jwt({ token, account, profile }) {
      if (account && profile) {
        const ghProfile = profile as any;
        token.id = String(ghProfile.id ?? token.sub ?? ""); // ensure always string
        token.picture = ghProfile.avatar_url ?? token.picture ?? ""; // GitHub uses avatar_url
      }
      return token;
    },
  },

  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
});
