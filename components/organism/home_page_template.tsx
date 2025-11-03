"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, AlertCircle, Github } from "lucide-react";
import { AuthModal } from "@/components/molecules/auth-modal";
import { SearchRepos } from "@/components/molecules/search-repos";
import { ScanResults } from "@/components/molecules/scan-results";
import { scanRepositoryForSecrets, getRateLimitInfo } from "@/lib/github-api";
import { signOut } from "next-auth/react";

interface SecretMatch {
  file: string;
  line: number;
  content: string;
  type: string;
  name: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

type AppState = "search" | "scanning" | "results";

export default function Home() {
  const { data: session } = useSession();
  const [appState, setAppState] = useState<AppState>("search");
  const [selectedRepo, setSelectedRepo] = useState<{
    owner: string;
    repo: string;
  } | null>(null);
  const [secrets, setSecrets] = useState<SecretMatch[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [error, setError] = useState("");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [rateLimit, setRateLimit] = useState<{
    limit: number;
    remaining: number;
    reset: number;
  } | null>(null);

  const fetchRateLimit = async (token?: string) => {
    const rateLimitInfo: {
      limit: number;
      remaining: number;
      reset: number;
    } = await getRateLimitInfo(token);
    setRateLimit(rateLimitInfo);
  };

  const handleSelectRepo = async (owner: string, repo: string) => {
    setSelectedRepo({ owner, repo });
    setAppState("scanning");
    setError("");
    setScanProgress("Initializing scan...");
    setIsScanning(true);

    try {
      const results = await scanRepositoryForSecrets(
        owner,
        repo,
        setScanProgress
      );
      setSecrets(results);
      setAppState("results");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to scan repository"
      );
      setAppState("search");
    } finally {
      setIsScanning(false);
    }
  };

  const handleReset = () => {
    setAppState("search");
    setSelectedRepo(null);
    setSecrets([]);
    setError("");
    setScanProgress("");
  };

  useEffect(() => {
    if (session) {
      setIsAuthenticated(true);
      // fetch immediately
      fetchRateLimit(session.accessToken);
    }
  }, [session]);

  useEffect(() => {
    // refresh periodically
    const interval = setInterval(
      () => fetchRateLimit(session?.accessToken || ""),
      60000
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 space-y-4">
          {/* Top Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
              <div className="bg-red-500 p-2 rounded-lg w-fit mx-auto sm:mx-0 mb-2 sm:mb-0">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div className="text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                  Secret Scanner
                </h1>
                <p className="text-slate-400 text-sm sm:text-base">
                  Scan public/private (owned) repositories for exposed secrets
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 text-center sm:text-right">
              <div className="text-sm mb-2 sm:mb-0">
                <p className="text-slate-400">API Requests</p>
                <p
                  className={`font-semibold ${
                    rateLimit?.remaining && rateLimit?.remaining < 10
                      ? "text-red-400"
                      : "text-green-400"
                  }`}
                >
                  {rateLimit?.remaining} / {rateLimit?.limit}
                </p>
              </div>
              {isAuthenticated && (
                <Button
                  variant="outline"
                  onClick={() => signOut()}
                  className="text-slate-300 border-slate-600 hover:bg-slate-700 bg-transparent w-full sm:w-auto"
                >
                  Logout
                </Button>
              )}
            </div>
          </div>

          {/* Info Alert */}
          <Alert className="bg-blue-900/30 border-blue-700 text-blue-100">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <AlertDescription className="text-sm">
              This tool helps identify potential API keys and secrets in public
              repositories. Use responsibly and only on repositories you have
              permission to scan.
            </AlertDescription>
          </Alert>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card className="p-6 bg-slate-800 border-slate-700 sticky top-8">
              <h2 className="font-semibold text-white mb-4 text-lg text-center sm:text-left">
                How it works
              </h2>
              <ol className="space-y-3 text-sm text-slate-300">
                {[
                  "Search for a public GitHub repository",
                  "We scan files for potential secrets",
                  "Review findings and create an issue",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-6 pt-6 border-t border-slate-700">
                <p className="text-xs text-slate-400 mb-3 text-center sm:text-left">
                  {isAuthenticated
                    ? `Authenticated as ${
                        session?.user?.name || session?.user?.email
                      }.`
                    : "Authenticate with GitHub to create issues directly from the scan results."}
                </p>
                <Button
                  onClick={() => setAuthModalOpen(true)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                  variant={isAuthenticated ? "outline" : "default"}
                  disabled={isAuthenticated}
                >
                  <Github className="w-4 h-4 mr-2" />
                  {isAuthenticated ? "Authenticated" : "Authenticate"}
                </Button>
              </div>
            </Card>
          </div>

          {/* Main Panel */}
          <div className="lg:col-span-2">
            <Card className="p-6 bg-slate-800 border-slate-700">
              {appState === "search" && (
                <div>
                  <h2 className="text-xl font-semibold text-white mb-4">
                    Search Repository
                  </h2>
                  <SearchRepos
                    onSelectRepo={handleSelectRepo}
                    isLoading={isScanning}
                  />
                </div>
              )}

              {appState === "scanning" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-red-500 mx-auto sm:mx-0" />
                    <div className="text-center sm:text-left">
                      <h2 className="text-xl font-semibold text-white">
                        Scanning Repository
                      </h2>
                      <p className="text-sm text-slate-400">
                        {selectedRepo?.owner}/{selectedRepo?.repo}
                      </p>
                    </div>
                  </div>
                  <div className="bg-slate-700 rounded p-4">
                    <p className="text-sm text-slate-300 font-mono break-all">
                      {scanProgress}
                    </p>
                  </div>
                </div>
              )}

              {appState === "results" && selectedRepo && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="text-center sm:text-left">
                      <h2 className="text-xl font-semibold text-white">
                        Scan Results
                      </h2>
                      <p className="text-sm text-slate-400">
                        {selectedRepo.owner}/{selectedRepo.repo}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      className="text-slate-300 border-slate-600 hover:bg-slate-700 bg-transparent w-full sm:w-auto"
                    >
                      New Scan
                    </Button>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <ScanResults
                    owner={selectedRepo.owner}
                    repo={selectedRepo.repo}
                    secrets={secrets}
                    onOpenAuthModal={() => setAuthModalOpen(true)}
                  />
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </main>
  );
}
