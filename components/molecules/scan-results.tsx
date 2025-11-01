"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Copy, Check, Github } from "lucide-react";
import { useSession } from "next-auth/react";
import { createGitHubIssueServerAction } from "@/app/actions/create_issue";

interface SecretMatch {
  file: string;
  line: number;
  content: string;
  type: string;
}

interface ScanResultsProps {
  owner: string;
  repo: string;
  secrets: SecretMatch[];
  isLoading?: boolean;
  onOpenAuthModal: () => void;
}

export function ScanResults({
  owner,
  repo,
  secrets,
  isLoading,
  onOpenAuthModal,
}: ScanResultsProps) {
  const { data: session } = useSession();
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [issueCreated, setIssueCreated] = useState(false);
  const [issueUrl, setIssueUrl] = useState("");
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const secretsByType = secrets.reduce((acc, secret) => {
    if (!acc[secret.type]) acc[secret.type] = [];
    acc[secret.type].push(secret);
    return acc;
  }, {} as Record<string, SecretMatch[]>);

  const handleCreateIssue = async () => {
    if (!session) {
      onOpenAuthModal();
      return;
    }

    setError("");
    setIsCreatingIssue(true);
    try {
      const result = await createGitHubIssueServerAction(owner, repo, secrets);
      if (result.success && result.issueUrl) {
        setIssueCreated(true);
        setIssueUrl(result.issueUrl);
      } else {
        setError(result.error || "Failed to create issue");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create issue");
    } finally {
      setIsCreatingIssue(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (secrets.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No potential secrets detected in this repository.</p>
          <p className="text-sm mt-1">This is a good sign!</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Found {secrets.length} potential secret
          {secrets.length !== 1 ? "s" : ""} in{" "}
          {Object.keys(secretsByType).length} category
          {Object.keys(secretsByType).length !== 1 ? "ies" : "y"}
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {issueCreated && (
        <Alert className="bg-green-50 border-green-200 text-green-900">
          <Check className="h-4 w-4" />
          <AlertDescription>
            Issue created successfully!{" "}
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:opacity-80"
            >
              View issue
            </a>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {Object.entries(secretsByType).map(([type, matches]) => (
          <Card key={type} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">{type}</Badge>
                <span className="text-sm text-muted-foreground">
                  {matches.length} match{matches.length !== 1 ? "es" : ""}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {matches.map((match, idx) => (
                <div
                  key={`${match.file}-${match.line}-${idx}`}
                  className="bg-muted p-3 rounded text-sm font-mono text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {match.file}:{match.line}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(match.content, idx)}
                      className="h-6 w-6 p-0"
                    >
                      {copiedIndex === idx ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                  <div className="text-foreground break-all">
                    {match.content}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Button
        onClick={handleCreateIssue}
        disabled={isCreatingIssue || issueCreated}
        className="w-full"
        size="lg"
      >
        {isCreatingIssue ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Creating Issue...
          </>
        ) : issueCreated ? (
          <>
            <Check className="w-4 h-4 mr-2" />
            Issue Created
          </>
        ) : (
          <>
            <Github className="w-4 h-4 mr-2" />
            Create GitHub Issue
          </>
        )}
      </Button>
    </div>
  );
}
