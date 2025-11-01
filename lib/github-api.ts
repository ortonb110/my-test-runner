// GitHub API client with secure token management and rate limiting
// Tokens are stored in memory only and never persisted

import { getSession } from "next-auth/react";

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

interface GitHubFile {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  download_url?: string;
}

interface SecretMatch {
  file: string;
  line: number;
  content: string;
  type: string;
}

interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset: number;
}

class GitHubAPIError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public retryable = false
  ) {
    super(message);
    this.name = "GitHubAPIError";
  }
}

// In-memory token storage (never persisted)
let currentToken: string | null = null;

let rateLimitInfo: RateLimitInfo = {
  remaining: 60,
  limit: 60,
  reset: 0,
};

const requestQueue: Array<() => Promise<any>> = [];
let isProcessingQueue = false;
const REQUEST_DELAY = 100; // ms between requests

export function setGitHubToken(token: string) {
  currentToken = token;
}

export function clearGitHubToken() {
  currentToken = null;
}

export function hasToken(): boolean {
  return currentToken !== null;
}

/**
 * Automatically syncs the GitHub token from the current NextAuth session
 * (client or server)
 */
export async function syncGitHubAuthToken() {
  try {
    const session = await getSession();
    if (session?.accessToken) {
      setGitHubToken(session.accessToken);
    } else {
      if (process.env.NODE_ENV === "development") {
        console.info(
          "[GitHubAPI] Using unauthenticated (limited) GitHub access ⚠️"
        );
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[GitHubAPI] Failed to sync token:", err);
    }
  }
}

export async function getRateLimitInfo(): Promise<RateLimitInfo> {
  // Fetch latest rate limit info or return default
  const response = await fetch("https://api.github.com/rate_limit", {
    headers: {
      ...(hasToken() && { Authorization: `token ${currentToken}` }),
    },
  });
  const data = await response.json();
  return data.rate;
}

async function processRequestQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;

  isProcessingQueue = true;
  while (requestQueue.length > 0) {
    const request = requestQueue.shift();
    if (request) {
      try {
        await request();
      } catch (error) {
        console.error("[v0] Queue request failed:", error);
      }
      // Delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY));
    }
  }
  isProcessingQueue = false;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Check rate limit before making request
      if (
        rateLimitInfo.remaining <= 1 &&
        Date.now() < rateLimitInfo.reset
      ) {
        const waitTime = Math.ceil(
          (rateLimitInfo.reset - Date.now()) / 1000
        );
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

// Secret detection patterns
const SECRET_PATTERNS = {
  apiKey: /api[_-]?key['"]?\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{20,})['"]?/gi,
  awsKey: /AKIA[0-9A-Z]{16}/g,
  privateKey: /-----BEGIN (RSA|DSA|EC|PGP|OPENSSH) PRIVATE KEY-----/g,
  stripeKey: /(sk_live_|pk_live_)[a-zA-Z0-9]{20,}/g,
  githubToken: /ghp_[a-zA-Z0-9]{36}/g,
  jwtToken: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
  password: /password['"]?\s*[:=]\s*['"]([^'"]{8,})['"]?/gi,
  databaseUrl: /(postgres|mysql|mongodb):\/\/[^\s]+/gi,
  slackToken: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,34}/g,
};

export async function searchRepositories(
  query: string
): Promise<GitHubRepository[]> {
  try {
    const response = await fetchWithRetry(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(
        query
      )}&sort=stars&order=desc&per_page=10`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(currentToken && { Authorization: `token ${currentToken}` }),
        },
      }
    );

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    if (error instanceof GitHubAPIError) {
      throw error;
    }
    throw new GitHubAPIError(0, "Failed to search repositories", false);
  }
}

export async function getRepositoryFiles(
  owner: string,
  repo: string,
  path = ""
): Promise<GitHubFile[]> {
  try {
    const response = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(currentToken && { Authorization: `token ${currentToken}` }),
        },
      }
    );

    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  } catch (error) {
    if (error instanceof GitHubAPIError) {
      throw error;
    }
    throw new GitHubAPIError(0, "Failed to fetch repository files", false);
  }
}

export async function getFileContent(downloadUrl: string): Promise<string> {
  try {
    const response = await fetchWithRetry(downloadUrl, {
      headers: {
        ...(currentToken && { Authorization: `token ${currentToken}` }),
      },
    });

    return response.text();
  } catch (error) {
    if (error instanceof GitHubAPIError) {
      throw error;
    }
    throw new GitHubAPIError(0, "Failed to fetch file content", false);
  }
}

export async function scanRepositoryForSecrets(
  owner: string,
  repo: string,
  onProgress?: (message: string) => void
): Promise<SecretMatch[]> {
  const secrets: SecretMatch[] = [];
  const scannedFiles = new Set<string>();
  const maxFiles = 100; // Limit to prevent rate limiting

  async function scanDirectory(path = "", depth = 0) {
    if (depth > 3 || scannedFiles.size >= maxFiles) return;

    try {
      onProgress?.(`Scanning directory: ${path || "root"}`);
      const files = await getRepositoryFiles(owner, repo, path);

      for (const file of files) {
        if (scannedFiles.size >= maxFiles) break;

        // Skip common non-code directories
        if (
          file.type === "dir" &&
          [
            ".git",
            "node_modules",
            ".venv",
            "venv",
            "dist",
            "build",
            ".next",
          ].includes(file.name)
        ) {
          continue;
        }

        if (file.type === "file") {
          // Only scan text files
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
                Object.entries(SECRET_PATTERNS).forEach(([type, pattern]) => {
                  if (pattern.test(line)) {
                    secrets.push({
                      file: file.path,
                      line: lineIndex + 1,
                      content: line.substring(0, 100),
                      type,
                    });
                    // Reset regex for global patterns
                    if (pattern.global) pattern.lastIndex = 0;
                  }
                });
              });
            }
          } catch (error) {
            console.error(`[v0] Error scanning file ${file.path}:`, error);
            // Continue scanning other files even if one fails
          }
        } else if (file.type === "dir" && depth < 3) {
          await scanDirectory(file.path, depth + 1);
        }
      }
    } catch (error) {
      console.error(`[v0] Error scanning directory ${path}:`, error);
      // Re-throw to let caller handle critical errors
      throw error;
    }
  }

  await scanDirectory();
  return secrets;
}

export async function createGitHubIssue(
  owner: string,
  repo: string,
  secrets: SecretMatch[]
): Promise<{ success: boolean; issueUrl?: string; error?: string }> {
  if (!currentToken) {
    return { success: false, error: "GitHub token required to create issues" };
  }

  const secretsByType = secrets.reduce((acc, secret) => {
    if (!acc[secret.type]) acc[secret.type] = [];
    acc[secret.type].push(secret);
    return acc;
  }, {} as Record<string, SecretMatch[]>);

  const body = `## Security Alert: Potential Secrets Detected

This repository appears to contain potential API keys, tokens, or other sensitive information that should not be committed to version control.

### Findings Summary
- **Total matches**: ${secrets.length}
- **Types detected**: ${Object.keys(secretsByType).join(", ")}

### Detected Files
${Object.entries(secretsByType)
  .map(([type, matches]) => {
    const files = [...new Set(matches.map((m) => m.file))];
    return `**${type}** (${matches.length} matches)\n${files
      .map((f) => `- \`${f}\``)
      .join("\n")}`;
  })
  .join("\n\n")}

### Recommended Actions
1. **Rotate all exposed credentials** immediately
2. **Remove secrets from git history** using \`git filter-branch\` or \`BFG Repo-Cleaner\`
3. **Move secrets to environment variables** or a secret manager (e.g., GitHub Secrets, AWS Secrets Manager)
4. **Enable secret scanning** in repository settings
5. **Review recent commits** for any unauthorized access

### Resources
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [Removing sensitive data from git](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)

---
*This issue was created by the Public Repo Secret Hunter tool.*`;

  try {
    const response = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${currentToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Security Alert: Potential Secrets Detected",
          body,
          labels: ["security", "bug"],
        }),
      }
    );

    const issue = await response.json();
    return {
      success: true,
      issueUrl: issue.html_url,
    };
  } catch (error) {
    if (error instanceof GitHubAPIError) {
      return {
        success: false,
        error: error.message,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
