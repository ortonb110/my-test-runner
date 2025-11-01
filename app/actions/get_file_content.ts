"use server";

import { fetchWithRetry } from "@/lib/fetch_with_retries"; // adjust path
import { GitHubAPIError } from "@/lib/github-api";
import { auth } from "@/auth";

/**
 * Fetch the raw file content from a GitHub file download URL.
 *
 * This function authenticates via the server-side `auth()` helper to obtain
 * an access token (if available) and sends it as a Bearer token when
 * requesting the file. The underlying request uses `fetchWithRetry` which
 * implements retry logic and basic rate-limit handling.
 *
 * @example
 * const content = await getFileContent(file.download_url);
 * console.log(content.slice(0, 200));
 *
 * @param {string} downloadUrl - The raw/download URL for the file (usually
 *   provided as `download_url` from the GitHub API).
 * @returns {Promise<string>} Resolves with the file's text content.
 * @throws {GitHubAPIError} Throws a `GitHubAPIError` when the request fails or
 *   when the response is not OK. In development mode, non-GitHubAPIError
 *   exceptions are logged before rethrowing a generic `GitHubAPIError`.
 */
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
