'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import React from 'react';
import { C } from '../../lib/tokens';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export function Pagination({ currentPage, totalPages, onPageChange, isLoading = false }: PaginationProps) {
  // Don't render anything if there's only 1 page
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t py-3 px-4" style={{ borderColor: C.border }}>
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
          className="btn-secondary"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || isLoading}
          className="btn-secondary"
        >
          Next
        </button>
      </div>
      
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm" style={{ color: C.textMuted }}>
            Showing page <span className="font-medium" style={{ color: C.textPrimary }}>{currentPage}</span> of <span className="font-medium" style={{ color: C.textPrimary }}>{totalPages}</span>
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-sm focus:z-20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              style={{ color: C.textMuted, border: `1px solid ${C.border}`, backgroundColor: '#fff' }}
            >
              <span className="sr-only">Previous</span>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages || isLoading}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-sm focus:z-20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              style={{ color: C.textMuted, border: `1px solid ${C.border}`, backgroundColor: '#fff' }}
            >
              <span className="sr-only">Next</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
