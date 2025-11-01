// GitHub API client with secure token management and rate limiting
// Tokens are stored in memory only and never persisted

import { getSession } from "next-auth/react";
import { getRepositoryFiles } from "@/app/actions/get_git_repo_files";
import { getFileContent } from "@/app/actions/get_file_content";
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

// In-memory token storage (never persisted)
let currentToken: string | null = null;

let rateLimitInfo: RateLimitInfo = {
  remaining: 0,
  limit: 0,
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
      ...(hasToken() && { Authorization: `Bearer ${currentToken}` }),
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

// Secret detection patterns
const SECRET_PATTERNS = {
  // API Keys
  apiKey: /\bapi[_-]?key['"]?\s*[:=]\s*['"]?([A-Za-z0-9\-_]{16,})['"]?/gi,
  googleApiKey: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  githubToken: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  slackToken: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  stripeKey: /\b(sk|pk)_(live|test)_[0-9A-Za-z]{20,}\b/g,
  twilioKey: /\bSK[0-9a-fA-F]{32}\b/g,
  sendgridKey: /\bSG\.[A-Za-z0-9\-_]{16,}\.[A-Za-z0-9\-_]{16,}\b/g,
  mailchimpKey: /\b[0-9a-f]{32}-us[0-9]{1,2}\b/g,
  firebaseKey: /\bAAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}\b/g,

  // Cloud Provider Keys
  awsAccessKey: /\bAKIA[0-9A-Z]{16}\b/g,
  awsSecretKey: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
  azureKey: /\b[A-Za-z0-9+\/]{88}==\b/g,
  gcpServiceAccount: /"type":\s*"service_account"/g,

  // Private Keys & Certificates
  privateKey:
    /-----BEGIN (RSA|DSA|EC|PGP|OPENSSH|PRIVATE) KEY-----[\s\S]+?-----END (RSA|DSA|EC|PGP|OPENSSH|PRIVATE) KEY-----/g,
  sshKey: /ssh-rsa\s+[A-Za-z0-9+\/]+={0,3}\s*(?:[^\s@]+@[^\s@]+)?/g,

  // Authentication Tokens
  jwtToken: /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
  bearerToken:
    /\bBearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g,
  oauthToken: /\bya29\.[0-9A-Za-z\-_]+\b/g,
  genericToken:
    /\b(access|auth|refresh|secret|session|token)['"]?\s*[:=]\s*['"]?([A-Za-z0-9\-_]{16,})['"]?/gi,

  // Database & Connection Strings
  databaseUrl:
    /\b(?:postgres|mysql|mongodb|mssql|oracle|redis|couchdb|neo4j|jdbc):\/\/[^\s'"]+\b/gi,
  dsn: /\bDSN=['"]?[A-Za-z0-9:_@\/\.\-\?&=]+['"]?/gi,

  // Passwords, Secrets, and Credentials
  password: /\bpass(word)?['"]?\s*[:=]\s*['"]([^'"\s]{6,})['"]?/gi,
  secret: /\bsecret['"]?\s*[:=]\s*['"]([^'"\s]{8,})['"]?/gi,
  credential: /\b(credential|creds)['"]?\s*[:=]\s*['"]([^'"\s]{8,})['"]?/gi,
  encryptionKey:
    /\benc(ryption)?[_-]?key['"]?\s*[:=]\s*['"]?([A-Za-z0-9\-_+/=]{16,})['"]?/gi,

  // Base64 or Random-like Strings (often secrets)
  base64String: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,

  // Generic Keyword-based Secrets
  keyLike:
    /\b(api[-_]?key|secret[-_]?key|client[-_]?secret|auth[-_]?token|access[-_]?key|private[-_]?key|encryption[-_]?key)\b/gi,
};

export async function searchRepositories(
  query: string,
  page = 1
): Promise<{
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepository[];
}> {
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
