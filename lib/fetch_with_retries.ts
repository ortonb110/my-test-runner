export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (i < retries - 1) await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("GitHub API request failed after multiple retries");
}

