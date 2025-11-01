"use server";

import { auth } from "@/auth";
import { fetchWithRetry } from "@/lib/fetch_with_retries";

export interface SecretMatch {
  file: string;
  line: number;
  content: string;
  type: string;
}

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

  // 🧩 Group secrets by type for better formatting
  const secretsByType = secrets.reduce((acc, secret) => {
    if (!acc[secret.type]) acc[secret.type] = [];
    acc[secret.type].push(secret);
    return acc;
  }, {} as Record<string, SecretMatch[]>);

  // 📝 Build the issue body
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
*This issue was created by the Repo Secret Scanner tool.*`;

  try {
    const response = await fetch(
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
