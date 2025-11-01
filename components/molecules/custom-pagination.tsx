"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface CustomPaginationProps {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export function CustomPagination({
  totalPages,
  currentPage,
  onPageChange,
}: CustomPaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | "ellipsis")[] = [];

  // Always include page 1
  pages.push(1);

  // Decide which middle pages to show
  if (totalPages <= 5) {
    for (let i = 2; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // If currentPage is near the beginning
    if (currentPage <= 3) {
      pages.push(2, 3, 4, "ellipsis", totalPages);
    }
    // If currentPage is near the end
    else if (currentPage >= totalPages - 2) {
      pages.push("ellipsis");
      for (let i = totalPages - 3; i <= totalPages; i++) {
        pages.push(i);
      }
    }
    // If currentPage is somewhere in the middle
    else {
      pages.push(
        "ellipsis",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "ellipsis",
        totalPages
      );
    }
  }

  return (
    <Pagination>
      <PaginationContent>
        {/* Previous Button */}
        <PaginationItem>
          <PaginationPrevious
            className={`${
              currentPage === 1 ? "pointer-events-none opacity-50" : ""
            } text-[1.2rem] font-light text-white`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (currentPage > 1) onPageChange(currentPage - 1);
            }}
          />
        </PaginationItem>

        {/* Page Numbers */}
        {pages.map((page, idx) => (
          <PaginationItem key={idx}>
            {page === "ellipsis" ? (
              <PaginationEllipsis className={"text-[1rem] font-light"} />
            ) : (
              <PaginationLink
                className={"text-[1rem] font-light"}
                href="#"
                isActive={page === currentPage}
                onClick={(e) => {
                  e.preventDefault();
                  onPageChange(page);
                }}
              >
                {page}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}

        {/* Next Button */}
        <PaginationItem>
          <PaginationNext
            className={`${
              currentPage === totalPages ? "pointer-events-none opacity-50" : ""
            } text-[1.2rem] font-light text-white`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (currentPage < totalPages) onPageChange(currentPage + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
