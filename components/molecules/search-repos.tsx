"use client";

import type React from "react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Search, AlertCircle, Star } from "lucide-react";
import { searchRepositories } from "@/lib/github-api";
import { CustomPagination } from "@/components/molecules/custom-pagination";

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  stargazers_count: number;
}

interface SearchReposProps {
  onSelectRepo: (owner: string, repo: string) => void;
  isLoading?: boolean;
}

export function SearchRepos({
  onSelectRepo,
  isLoading: parentLoading,
}: SearchReposProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [repos, setRepos] = useState<{
    total_count: number;
    incomplete_results: boolean;
    items: Repository[];
  }>({ total_count: 0, incomplete_results: false, items: [] });
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  const fetchRepos = async (page = 1) => {
    setError("");
    setIsLoading(true);

    try {
      const repos = await searchRepositories(query, page);
      setResults(repos.items || []);
      setRepos(repos);
      setCurrentPage(page);

      if (repos.items.length === 0) {
        setError("No repositories found. Try a different search term.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to search repositories"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setError("Please enter a search query");
      return;
    }
    setHasSearched(true);
    fetchRepos(1);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Search repositories (e.g., 'stripe examples')"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isLoading || parentLoading}
          className="flex-1 text-white"
        />
        <Button type="submit" disabled={isLoading || parentLoading} size="icon">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {hasSearched && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Found {results.length} repositories
          </p>
          <div className="grid gap-2">
            {results.map((repo) => (
              <Card
                key={repo.id}
                className="p-4 hover:bg-accent cursor-pointer transition-colors"
                onClick={() => onSelectRepo(repo.owner.login, repo.name)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Image
                        src={repo.owner.avatar_url || "/placeholder.svg"}
                        alt={repo.owner.login}
                        className="w-5 h-5 rounded-full"
                        width={20}
                        height={20}
                      />
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold hover:underline truncate"
                      >
                        {repo.full_name}
                      </a>
                    </div>
                    {repo.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {repo.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                    <Star className="w-4 h-4" />
                    {repo.stargazers_count}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {hasSearched && results.length === 0 && !error && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No repositories found</p>
        </div>
      )}
      {hasSearched && repos.total_count > 0 && (
        <CustomPagination
          totalPages={Math.ceil(repos.total_count / perPage)}
          currentPage={currentPage}
          onPageChange={(page) => fetchRepos(page)}
        />
      )}
    </div>
  );
}
