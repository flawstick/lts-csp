"use client";

import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type FilterOption = {
  label: string;
  value: string;
};

type DocumentsFilterCardProps = {
  filterLabel: string;
  filterOptions: FilterOption[];
  filterValue: string;
  onFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  resultLabel?: string;
  searchPlaceholder: string;
  searchValue: string;
};

export function DocumentsFilterCard({
  filterLabel,
  filterOptions,
  filterValue,
  onFilterChange,
  onSearchChange,
  resultLabel,
  searchPlaceholder,
  searchValue,
}: DocumentsFilterCardProps) {
  const selectedOption =
    filterOptions.find((option) => option.value === filterValue)?.label ?? filterOptions[0]?.label ?? "All";

  return (
    <section className="portal-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 border-muted-foreground/20 bg-background/75 pl-8 text-sm"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 cursor-pointer border-muted-foreground/20 bg-background/75"
            >
              <SlidersHorizontal className="size-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{filterLabel}</span>
              <span className="max-w-32 truncate text-sm">{selectedOption}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-2 p-3">
            <p className="text-xs font-medium text-muted-foreground">Filter options</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full cursor-pointer justify-between border-muted-foreground/20 bg-background/75"
                >
                  <span className="truncate">{selectedOption}</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>{filterLabel}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={filterValue} onValueChange={onFilterChange}>
                  {filterOptions.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                      className="cursor-pointer"
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-xs text-muted-foreground">Use search and filters together for faster drill-down.</p>
          </PopoverContent>
        </Popover>

        {resultLabel ? (
          <span className="inline-flex h-9 items-center rounded-md border border-muted-foreground/20 bg-background/75 px-2.5 text-xs text-muted-foreground">
            {resultLabel}
          </span>
        ) : null}
    </div>
    </section>
  );
}

export type { FilterOption };
