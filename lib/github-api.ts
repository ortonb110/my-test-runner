import { getSession } from "next-auth/react";
import { getRepositoryFiles } from "@/app/actions/get_git_repo_files";
import { getFileContent } from "@/app/actions/get_file_content";
import { SECRET_PATTERNS } from "@/constants/pattern";
interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  url: string;
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  stargazers_count: number;
}

export interface GitHubFile {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  download_url?: string;
}

interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset: number;
}

export class GitHubAPIError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public retryable = false
  ) {
    super(message);
    this.name = "GitHubAPIError";
  }
}

let rateLimitInfo: RateLimitInfo = {
  remaining: 0,
  limit: 0,
  reset: 0,
};

// const requestQueue: Array<() => Promise<any>> = [];
// let isProcessingQueue = false;
// const REQUEST_DELAY = 100; // ms between requests

/**
 * Retrieve the current GitHub API rate limit information.
 *
 * This calls the public `https://api.github.com/rate_limit` endpoint and
 * returns the `rate` object which contains `remaining`, `limit`, and `reset`
 * (timestamp in milliseconds). If a `currentToken` is available, it will be
 * sent as a Bearer token to increase the available rate quota.
 *
 * Example:
 * ```ts
 * const rate = await getRateLimitInfo();
 * console.log(rate.remaining, rate.limit, new Date(rate.reset));
 * ```
 *
 * @returns {Promise<RateLimitInfo>} Resolves to the rate limit info with:
 *  - `remaining`: number of requests left
 *  - `limit`: total allowed requests in the window
 *  - `reset`: unix timestamp (ms) when limit resets
 * @throws {Error} Will reject if the network request fails or GitHub returns
 *   an unexpected body that can't be parsed.
 */
export async function getRateLimitInfo(token?: string): Promise<RateLimitInfo> {
  // Fetch latest rate limit info or return default
  const response = await fetch("https://api.github.com/rate_limit", {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  const data = await response.json();
  return data.rate;
}

// async function processRequestQueue() {
//   if (isProcessingQueue || requestQueue.length === 0) return;

//   isProcessingQueue = true;
//   while (requestQueue.length > 0) {
//     const request = requestQueue.shift();
//     if (request) {
//       try {
//         await request();
//       } catch (error) {
//         console.error("[v0] Queue request failed:", error);
//       }
//       // Delay between requests to avoid rate limiting
//       await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY));
//     }
//   }
//   isProcessingQueue = false;
// }

/**
 * Fetch data with retry and basic GitHub rate-limit handling.
 *
 * Behavior summary:
 * - Checks a cached `rateLimitInfo` before issuing requests and throws a
 *   retryable `GitHubAPIError` when the client is currently rate-limited.
 * - Uses the native `fetch` API to perform the request, then reads GitHub
 *   rate-limit headers (`x-ratelimit-remaining`, `x-ratelimit-limit`,
 *   `x-ratelimit-reset`) and updates the in-memory `rateLimitInfo` object.
 * - On HTTP 429 (Too Many Requests) the function waits for `Retry-After` or
 *   uses exponential backoff, then retries. For other 5xx errors it retries
 *   with exponential backoff as well. Non-retryable errors (like 401/403/404)
 *   throw a `GitHubAPIError` immediately.
 *
 * Example:
 * ```ts
 * const res = await fetchWithRetry('https://api.github.com/user', { headers: { Accept: 'application/vnd.github.v3+json' } });
 * const data = await res.json();
 * ```
 *
 * @param {string} url - Request URL.
 * @param {RequestInit} [options={}] - Fetch options (headers, method, body, etc.).
 * @param {number} [maxRetries=3] - Maximum number of attempts before failing.
 * @returns {Promise<Response>} Resolves with the successful fetch Response.
 * @throws {GitHubAPIError|Error} Throws a `GitHubAPIError` when GitHub
 *   responds with an error (non-ok) or when rate-limiting prevents requests.
 *   If all retries fail, the last error is re-thrown.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Check rate limit before making request
      if (rateLimitInfo.remaining <= 1 && Date.now() < rateLimitInfo.reset) {
        const waitTime = Math.ceil((rateLimitInfo.reset - Date.now()) / 1000);
        throw new GitHubAPIError(
          429,
          `Rate limit exceeded. Please wait ${waitTime} seconds before trying again.`,
          true
        );
      }

      const response = await fetch(url, options);

      const remaining = response.headers.get("x-ratelimit-remaining");
      const limit = response.headers.get("x-ratelimit-limit");
      const reset = response.headers.get("x-ratelimit-reset");

      if (remaining && limit && reset) {
        rateLimitInfo = {
          remaining: Number.parseInt(remaining, 10),
          limit: Number.parseInt(limit, 10),
          reset: Number.parseInt(reset, 10) * 1000,
        };
      }

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const waitTime = retryAfter
          ? Number.parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      // Handle other errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.message ||
          {
            401: "Invalid GitHub token. Please check your authentication.",
            403: "Access denied. Check your token permissions.",
            404: "Repository not found.",
            500: "GitHub API server error. Please try again later.",
          }[response.status] ||
          `GitHub API error: ${response.status}`;

        const retryable = response.status >= 500 || response.status === 429;
        throw new GitHubAPIError(response.status, errorMessage, retryable);
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      // Don't retry non-retryable errors
      if (error instanceof GitHubAPIError && !error.retryable) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff
      const waitTime = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError || new Error("Failed to fetch from GitHub API");
}

/**
 * Search GitHub repositories using the public GitHub Search API.
 *
 * This helper wraps the GitHub search endpoint and returns the parsed JSON
 * response. It uses the internal `fetchWithRetry` utility which applies rate
 * limit checks and exponential backoff for transient errors. If a `currentToken`
 * is present it will be included as an Authorization header to increase rate
 * limits and access private results (subject to token scope).
 *
 * @example
 * const results = await searchRepositories('react', 1);
 * console.log(results.total_count, results.items.length);
 *
 * @param {string} query - The search query string (see GitHub search syntax).
 * @param {number} [page=1] - Optional results page number (1-based).
 * @returns {Promise<{ total_count: number; incomplete_results: boolean; items: GitHubRepository[] }>} Resolves
 *   with the GitHub search result object containing `total_count`,
 *   `incomplete_results`, and `items` (array of `GitHubRepository`).
 * @throws {GitHubAPIError} Throws a `GitHubAPIError` when the GitHub API
 *   returns a non-OK response or when network/fetch errors occur.
 */
export async function searchRepositories(
  query: string,
  page = 1
): Promise<{
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepository[];
}> {
  const session = await getSession();
  const currentToken = session?.accessToken as string | undefined;
  try {
    const response = await fetchWithRetry(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(
        query
      )}&sort=stars&order=desc&per_page=10&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(currentToken && { Authorization: `token ${currentToken}` }),
        },
      }
    );

    if (!response.ok) {
      throw new GitHubAPIError(
        response.status,
        "Failed to fetch repositories",
        false
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof GitHubAPIError) throw error;
    throw new GitHubAPIError(0, "Failed to search repositories", false);
  }
}

/**
 * Scan a GitHub repository for potential secrets (API keys, tokens, private keys, etc.).
 *
 * The scanner walks the repository tree up to 3 levels deep and scans up to a
 * maximum number of files (controlled by an internal `maxFiles` variable) to
 * avoid excessive API usage and rate limiting. It only examines files with
 * common text/code extensions and skips common build/vendor directories and
 * lock/config files.
 *
 * For each line that matches one of the regexes in `SECRET_PATTERNS`, a
 * SecretMatch is added to the returned array. Each match includes the file
 * path, 1-based line number, a truncated preview of the line (first 100
 * characters), and the detected secret `type` (the key in `SECRET_PATTERNS`).
 *
 * Note: the function logs non-fatal scanning errors and will continue scanning
 * other files if an individual file fails to load. However, directory-level
 * errors are re-thrown so callers can decide how to handle critical failures.
 *
 * @example
 * const matches = await scanRepositoryForSecrets('owner', 'repo', (msg) => console.log(msg));
 *
 * @param {string} owner - GitHub repository owner (user or org).
 * @param {string} repo - Repository name.
 * @param {(message: string) => void} [onProgress] - Optional callback invoked
 *   with progress messages (directory/file being scanned). Useful for UI
 *   progress updates or logging.
 * @returns {Promise<SecretMatch[]>} Promise that resolves to an array of
 *   SecretMatch objects describing the detected secrets. Each object has the
 *   shape: { file: string, line: number, content: string, type: string }.
 * @throws Will re-throw directory-level errors so callers can handle critical
 *   failures (e.g. permission or network errors). Individual file read errors
 *   are logged and do not stop the overall scan.
 */
export async function scanRepositoryForSecrets(
  owner: string,
  repo: string,
  onProgress?: (message: string) => void
): Promise<
  {
    file: string;
    line: number;
    content: string;
    type: string;
    name: string;
    description: string;
    severity: "low" | "medium" | "high" | "critical";
  }[]
> {
  const secrets: any[] = [];
  const scannedFiles = new Set<string>();
  const maxFiles = 100;

  async function scanDirectory(path = "", depth = 0) {
    if (depth > 3 || scannedFiles.size >= maxFiles) return;

    const SKIP_DIRS = [
      ".git",
      "node_modules",
      ".venv",
      "venv",
      "dist",
      "build",
      ".next",
    ];
    const SKIP_FILES = [
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      ".DS_Store",
      "package.json",
    ];
    try {
      onProgress?.(`Scanning directory: ${path || "root"}`);
      const files = await getRepositoryFiles(owner, repo, path);

      for (const file of files) {
        if (scannedFiles.size >= maxFiles) break;
        if (file.type === "dir" && SKIP_DIRS.includes(file.name)) continue;
        if (file.type === "file" && SKIP_FILES.includes(file.name)) continue;

        if (file.type === "file") {
          const textExtensions = [
            ".js",
            ".ts",
            ".tsx",
            ".jsx",
            ".py",
            ".java",
            ".go",
            ".rb",
            ".php",
            ".env",
            ".yml",
            ".yaml",
            ".json",
            ".xml",
            ".sh",
            ".bash",
            ".sql",
            ".properties",
            ".conf",
            ".config",
            ".txt",
            ".md",
            ".dockerfile",
          ];

          const hasTextExtension = textExtensions.some((ext) =>
            file.name.toLowerCase().endsWith(ext)
          );
          if (!hasTextExtension) continue;

          scannedFiles.add(file.path);
          onProgress?.(`Scanning file: ${file.name}`);

          try {
            if (file.download_url) {
              const content = await getFileContent(file.download_url);
              const lines = content.split("\n");
              lines.forEach((line, lineIndex) => {
                SECRET_PATTERNS.forEach((pattern) => {
                  if (pattern.regex.test(line)) {
                    secrets.push({
                      file: file.path,
                      line: lineIndex + 1,
                      content: line.substring(0, 100),
                      type: pattern.id,
                      name: pattern.name,
                      description: pattern.description,
                      severity: pattern.severity,
                    });
                    if (pattern.regex.global) pattern.regex.lastIndex = 0;
                  }
                });
              });
            }
          } catch (error) {
            if (process.env.NODE_ENV === "development") {
              console.error(`[v0] Error scanning file ${file.path}:`, error);
            }
          }
        } else if (file.type === "dir" && depth < 3) {
          await scanDirectory(file.path, depth + 1);
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error(`[v0] Error scanning directory ${path}:`, error);
      }
      throw error;
    }
  }

  await scanDirectory();
  return secrets;
}
