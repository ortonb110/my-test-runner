# Repo Secret Scanner

A web-based tool that scans public GitHub repositories for exposed secrets, API keys, and other sensitive information.  
Built with **Next.js**, using **GitHub OAuth** for authentication.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

### ENV Requirements
#### Authentication configuration
AUTH_SECRET=your-random-secret-key
AUTH_GITHUB_ID=your-github-oauth-client-id
AUTH_GITHUB_SECRET=your-github-oauth-client-secret
AUTH_URL=http://localhost:3000

#### Generate here -> https://github.com/settings/developers

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Assumptions and Limitations

- Only scans **text-based files** (e.g., `.js`, `.ts`, `.py`, `.env`, `.json`, etc.).  
- Skips large/binary files and common folders like `node_modules`, `dist`, `.git`, etc.  
- **GitHub API rate limits** may affect large scans.  
- No backend server — all actions use **Next.js Server Actions** and GitHub APIs.  

---

## Future Improvements

If given more time, I would:

- Integrate **real-time progress tracking** for large scans.  
- Enhance detection patterns using **machine learning-based secret classification**.  
- Add **report export (PDF/CSV)** and **email notifications**.  
- Improve performance with **parallel file scanning** and **caching**.
- Implement **slug-based redirect flow** — if a user initiates a scan or tries to create an issue while not logged in, they would be redirected to GitHub login with a callback URL and returned to the original scan page upon successful authentication.
