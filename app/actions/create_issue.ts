"use server";

import { auth } from "@/auth";
import { fetchWithRetry } from "@/lib/fetch_with_retries";

export interface SecretMatch {
  file: string;
  line: number;
  content: string;
  type: string;
  name: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

/**
 * Create a GitHub issue summarizing detected secrets for a repository.
 *
 * This is a server-side action that authenticates via the `auth()` helper to
 * obtain a GitHub access token. If no token is available the function returns
 * `{ success: false, error: 'GitHub token required to create issues' }` and
 * does not attempt to create an issue.
 *
 * The function groups the provided `secrets` by type, builds a Markdown
 * formatted issue body with findings and recommended remediation steps, and
 * posts it to the repository's issues endpoint using `fetchWithRetry`.
 *
 * @param {string} owner - Repository owner (user or organization).
 * @param {string} repo - Repository name.
 * @param {SecretMatch[]} secrets - Array of detected secret matches to include in the issue.
 * @returns {Promise<{ success: boolean; issueUrl?: string; error?: string }>} Resolves
 *   with an object containing `success` and, on success, the created
 *   `issueUrl`. On failure returns `success: false` and an `error` message.
 * @example
 * const res = await createGitHubIssueServerAction('my-org', 'my-repo', matches);
 * if (res.success) console.log('Created issue at', res.issueUrl);
 */

export async function createGitHubIssueServerAction(
  owner: string,
  repo: string,
  secrets: SecretMatch[]
): Promise<{ success: boolean; issueUrl?: string; error?: string }> {
  const session = await auth();
  const token = session?.accessToken;

  if (!token) {
    return { success: false, error: "GitHub token required to create issues" };
  }

  // 🧩 Group secrets by type
  const secretsByType = secrets.reduce((acc, secret) => {
    if (!acc[secret.type]) acc[secret.type] = [];
    acc[secret.type].push(secret);
    return acc;
  }, {} as Record<string, SecretMatch[]>);

  // Build Markdown table for each secret type
  const tableSection = Object.entries(secretsByType)
    .map(([type, matches]) => {
      const tableRows = matches
        .map(
          (m) =>
            `| \`${m.file}\` | ${
              m.description
            } | **${m.severity.toUpperCase()}** |`
        )
        .join("\n");

      return `#### ${matches[0].name} (${type})

| File | Description | Severity |
|------|--------------|-----------|
${tableRows}
`;
    })
    .join("\n\n");

  // 🧾 Full issue body
  const body = `## Security Alert: Potential Secrets Detected

This repository appears to contain potential API keys, tokens, or other sensitive information that should not be committed to version control.

### Findings Summary
- **Total matches**: ${secrets.length}
- **Types detected**: ${Object.keys(secretsByType).join(", ")}

---

### 📄 Detailed Findings

${tableSection}

---

### Recommended Actions
1. **Rotate all exposed credentials** immediately.
2. **Remove secrets from git history** using \`git filter-branch\` or \`BFG Repo-Cleaner\`.
3. **Move secrets to environment variables** or a secret manager (e.g., GitHub Secrets, AWS Secrets Manager).
4. **Enable secret scanning** in repository settings.
5. **Review recent commits** for any unauthorized access.

### Resources
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [Removing sensitive data from git](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)

---

*This issue was created automatically by the **Repo Secret Scanner** tool.*
`;

  try {
    const response = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          title: "Security Alert: Potential Secrets Detected",
          body,
          labels: ["security", "bug"],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 410 || errText.includes("Issues are disabled")) {
        return {
          success: false,
          error:
            "Issues are disabled for this repository. Please enable GitHub Issues to allow automated reporting.",
        };
      }
      throw new Error(`GitHub API Error: ${response.status} ${errText}`);
    }

    const issue = await response.json();
    return { success: true, issueUrl: issue.html_url };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error creating GitHub issue:", error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
