"use server";

import { fetchWithRetry } from "@/lib/fetch_with_retries"; // adjust path
import { GitHubAPIError } from "@/lib/github-api";
import { auth } from "@/auth";

export async function getFileContent(downloadUrl: string): Promise<string> {
    const session = await auth();
    const token = session?.accessToken;

  try {
    const response = await fetchWithRetry(downloadUrl, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });

    if (!response.ok) {
      throw new GitHubAPIError(response.status, "Failed to fetch file content");
    }

    const text = await response.text();
    return text;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      if (error instanceof GitHubAPIError) throw error;
      console.error("Error fetching file content:", error);
    }
    throw new GitHubAPIError(0, "Failed to fetch file content", false);
  }
}
