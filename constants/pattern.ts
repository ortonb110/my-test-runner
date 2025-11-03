/**
 * Secret detection patterns used by the repository scanner.
 *
 * Each entry in this array describes a secret-like pattern that the scanner
 * should flag when matched. The expected object shape is:
 *
 * {
 *   id: string,           // unique identifier for the pattern
 *   name: string,         // human-friendly name
 *   regex: RegExp,        // regular expression to detect the secret
 *   description: string,  // short explanation of what the secret is
 *   severity: string      // severity level: 'low' | 'medium' | 'high' | 'critical'
 * }
 *
 * Notes:
 * - The `severity` field is used for UI/reporting only and does not affect
 *   the detection algorithm.
 *
 * Example usage:
 * for (const pattern of SECRET_PATTERNS) {
 *   if (pattern.regex.test(line)) {
 *     // record match
 *     if (pattern.regex.global) pattern.regex.lastIndex = 0;
 *   }
 * }
 *
 * @type {{id: string; name: string; regex: RegExp; description: string; severity: string}[]}
 */
export const SECRET_PATTERNS: {
  id: string;
  name: string;
  regex: RegExp;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}[] = [
  {
    id: "aws_access_key",
    name: "AWS Access Key ID",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    description:
      "Identifies an AWS user and can grant access to cloud resources.",
    severity: "high",
  },
  {
    id: "aws_secret_key",
    name: "AWS Secret Access Key",
    regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    description: "AWS secret key used with access key ID for authentication.",
    severity: "high",
  },
  {
    id: "gcp_api_key",
    name: "Google Cloud API Key",
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    description: "Used to authenticate Google Cloud and Maps API requests.",
    severity: "medium",
  },
  {
    id: "azure_storage_key",
    name: "Azure Storage Account Key",
    regex: /\bE[0-9A-Za-z+\/]{87}==\b/g,
    description: "Can grant full access to Azure Storage resources.",
    severity: "high",
  },

  // --- Payment / Finance ---
  {
    id: "stripe_secret_key",
    name: "Stripe Secret Key",
    regex: /\bsk_(live|test)_[0-9A-Za-z]{20,}\b/g,
    description: "Used to access Stripe API and modify payments or refunds.",
    severity: "high",
  },
  {
    id: "paypal_access_token",
    name: "PayPal Access Token",
    regex: /EAACEdEose0cBA[0-9A-Za-z]+/g,
    description: "PayPal tokens may allow unauthorized access to payment APIs.",
    severity: "high",
  },
  {
    id: "square_access_token",
    name: "Square Access Token",
    regex: /\bEAAA[a-zA-Z0-9]{60,}\b/g,
    description: "Square API tokens can authorize financial transactions.",
    severity: "high",
  },

  // --- Developer Platforms ---
  {
    id: "github_pat",
    name: "GitHub Personal Access Token",
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
    description: "Used to access GitHub APIs with user-level permissions.",
    severity: "high",
  },
  {
    id: "gitlab_token",
    name: "GitLab Personal Access Token",
    regex: /\bglpat-[A-Za-z0-9\-_]{20,}\b/g,
    description: "Grants access to GitLab API with user privileges.",
    severity: "high",
  },
  {
    id: "bitbucket_token",
    name: "Bitbucket Access Token",
    regex: /\bATBB[A-Za-z0-9=_-]+/g,
    description: "Access token for Bitbucket repositories or pipelines.",
    severity: "high",
  },

  // --- Messaging & Communication ---
  {
    id: "slack_token",
    name: "Slack Token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,48}\b/g,
    description: "Slack tokens allow access to workspaces and channels.",
    severity: "high",
  },
  {
    id: "discord_token",
    name: "Discord Bot/User Token",
    regex: /\b[Mm][Tt]\.[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{27}\b/g,
    description: "Can be used to impersonate bots or users in Discord.",
    severity: "high",
  },
  {
    id: "telegram_bot_token",
    name: "Telegram Bot Token",
    regex: /\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b/g,
    description: "Used to control Telegram bots or send messages as them.",
    severity: "high",
  },

  // --- Authentication & Crypto ---
  {
    id: "private_key",
    name: "Private RSA/SSH Key",
    regex: /-----BEGIN( RSA| DSA| EC)? PRIVATE KEY-----/g,
    description: "Private cryptographic key — must never be shared.",
    severity: "critical",
  },
  {
    id: "jwt_token",
    name: "JWT Token",
    regex: /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
    description: "Encoded JSON Web Token possibly containing auth credentials.",
    severity: "medium",
  },
  {
    id: "oauth_token",
    name: "OAuth Access Token",
    regex: /\bya29\.[0-9A-Za-z\-_]+\b/g,
    description: "OAuth token that can authenticate API requests.",
    severity: "high",
  },

  // --- Databases & Configs ---
  {
    id: "database_url",
    name: "Database Connection URL",
    regex:
      /\b(?:postgres|mysql|mongodb|mssql|oracle|redis|couchdb|neo4j|jdbc):\/\/[^\s'"]+\b/gi,
    description: "Contains credentials and host info for databases.",
    severity: "high",
  },
  {
    id: "firebase_url",
    name: "Firebase Database URL",
    regex: /https:\/\/[a-z0-9-]+\.firebaseio\.com/g,
    description: "Points to Firebase backend database endpoint.",
    severity: "medium",
  },
  {
    id: "twilio_api_key",
    name: "Twilio API Key",
    regex: /\bSK[0-9a-fA-F]{32}\b/g,
    description: "Used to authenticate Twilio API requests.",
    severity: "high",
  },
  {
    id: "sendgrid_api_key",
    name: "SendGrid API Key",
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    description: "Allows sending of emails via SendGrid API.",
    severity: "high",
  },

  // --- Generic Catch-All ---
  {
    id: "generic_keyword",
    name: "Generic Secret Keyword",
    regex:
      /\b(api[-_]?key|secret[-_]?key|client[-_]?secret|auth[-_]?token|access[-_]?key|private[-_]?key|password|credentials)\b/gi,
    description: "Generic keyword indicating potential secret nearby.",
    severity: "low",
  },
];
