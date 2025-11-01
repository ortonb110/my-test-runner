"use server";

import { fetchWithRetry } from "@/lib/fetch_with_retries";
import type { GitHubFile } from "@/lib/github-api";
import { auth } from "@/auth";

export async function getRepositoryFiles(
  owner: string,
  repo: string,
  path = ""
): Promise<GitHubFile[]> {
  // ✅ Get GitHub access token from NextAuth session
  const session = await auth();
  const token = session?.accessToken;

  if (!token) {
    throw new Error("GitHub token required to fetch repository files");
  }

  try {
    const response = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  } catch (error) {
    console.error("❌ Failed to fetch repository files:", error);
    throw new Error(
      error instanceof Error
        ? error.message
        : "Failed to fetch repository files"
    );
  }
}
