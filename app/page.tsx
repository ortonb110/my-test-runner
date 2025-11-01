import { Metadata } from "next";
import HomePageTemplate from "@/components/organism/home_page_template";

export const metadata: Metadata = {
  title:
    "Repo Secret Scanner | Detect Leaked API Keys & Sensitive Data Instantly",
  description:
    "Scan your GitHub, GitLab, or Bitbucket repositories for exposed API keys, secrets, and sensitive information. Prevent data leaks and secure your code in seconds with Repo Secret Scanner.",
  keywords: [
    "secret scanner",
    "repo scanner",
    "GitHub secret scanner",
    "leaked API keys",
    "sensitive data detection",
    "security audit tool",
    "code security scanner",
    "detect secrets",
    "DevSecOps tool",
  ],
  openGraph: {
    title: "Repo Secret Scanner — Secure Your Repositories",
    description:
      "Automatically detect and remove leaked API keys, tokens, and passwords from your repositories before they cause harm.",
    url: "https://placeholder.com", //TODO: Replace with your actual URL
    siteName: "Repo Secret Scanner",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Repo Secret Scanner — Scan & Secure Your Repos Instantly",
    description:
      "Find and remove exposed secrets from your code repositories before attackers do. Try Repo Secret Scanner free.",
  },
};

export default function Home() {
  return <HomePageTemplate />;
}
