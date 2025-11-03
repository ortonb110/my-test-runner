"use server";

import { fetchWithRetry } from "@/lib/fetch_with_retries";
import type { GitHubFile } from "@/lib/github-api";
import { auth } from "@/auth";


/**
   * Fetch the list of files & directories for a repository path using the
   * GitHub Contents API.
   *
   * This server-side helper obtains a GitHub access token via `auth()` (if
   * available) and includes it as a Bearer token to increase rate limits and
   * access private repositories when permitted. It uses `fetchWithRetry` so
   * transient errors and rate limits are retried according to the helper's
   * strategy.
   *
   * The GitHub Contents API returns either an array (for directories) or a
   * single object (for a file). This function normalizes the result to always
   * return an array of `GitHubFile` objects.
   *
   * @example
   * const files = await getRepositoryFiles('owner', 'repo', 'src');
   * files.forEach(f => console.log(f.path, f.type));
   *
   * @param {string} owner - Repository owner (user or organization).
   * @param {string} repo - Repository name.
   * @param {string} [path=""] - Optional path inside the repository to list.
   * @returns {Promise<GitHubFile[]>} Resolves with an array of `GitHubFile`
   *   objects representing files and directories at the requested path.
   * @throws {Error} Throws when the GitHub API responds with a non-OK status
   *   or when the network/request fails.
   */
export async function getRepositoryFiles(
  owner: string,
  repo: string,
  path = ""
): Promise<GitHubFile[]> {
  //Get GitHub access token from session
  const session = await auth();
  const token = session?.accessToken;

  try {
    const response = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          // Check if token exists before adding Authorization header
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    console.error("Failed to fetch repository files:", error);
    throw new Error(
      error instanceof Error
        ? error.message
        : "Failed to fetch repository files"
    );
  }
}
