"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { cn } from "../../components/ui/utils";

/** Minimal shape for attach picker; matches checklist row fields used here. */
export type ChecklistPickerItem = {
  id: string;
  name: string;
  archivedAt?: string | null;
};

type ChecklistItemSearchPickerProps = {
  id?: string;
  items: ChecklistPickerItem[];
  selectedItem: ChecklistPickerItem | null;
  onSelect: (item: ChecklistPickerItem) => void;
  disabled?: boolean;
  placeholder?: string;
  /**
   * When the search matches no checklist item, offer labeling the selected inbox document
   * (display name only). Does not create checklist rows.
   */
  onSaveAsLabeledDocument?: (label: string) => void | Promise<void>;
  /** When false, the save-as-labeled row is shown disabled (e.g. no unattached document selected). */
  saveAsLabeledAllowed?: boolean;
};

function filterItems(items: ChecklistPickerItem[], query: string): ChecklistPickerItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.name.toLowerCase().includes(q));
}

export function ChecklistItemSearchPicker({
  id,
  items,
  selectedItem,
  onSelect,
  disabled = false,
  placeholder = "Select a checklist item…",
  onSaveAsLabeledDocument,
  saveAsLabeledAllowed = false,
}: ChecklistItemSearchPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState<number | undefined>(undefined);

  const activeItems = useMemo(
    () => items.filter((i) => i.archivedAt == null || String(i.archivedAt).trim() === ""),
    [items]
  );

  const filtered = useMemo(() => filterItems(activeItems, search), [activeItems, search]);

  const trimmedSearch = search.trim();
  const noChecklistMatch = trimmedSearch.length > 0 && filtered.length === 0;
  const showSaveLabeledRow = Boolean(onSaveAsLabeledDocument && noChecklistMatch);
  const totalRows = filtered.length + (showSaveLabeledRow ? 1 : 0);

  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    setHighlighted(0);
  }, [search, open, filtered.length, showSaveLabeledRow]);

  useEffect(() => {
    if (!open) return;
    const idRaf = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select?.();
    });
    return () => cancelAnimationFrame(idRaf);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-index="${highlighted}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open, filtered, showSaveLabeledRow]);

  useLayoutEffect(() => {
    if (!open) return;
    const w = triggerRef.current?.offsetWidth;
    if (w && w > 0) setPanelWidth(w);
  }, [open]);

  function commitSelection(item: ChecklistPickerItem) {
    onSelect(item);
    setOpen(false);
    setSearch("");
  }

  async function commitSaveAsLabeled() {
    if (!onSaveAsLabeledDocument || !trimmedSearch) return;
    if (!saveAsLabeledAllowed) return;
    await onSaveAsLabeledDocument(trimmedSearch);
    setOpen(false);
    setSearch("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (totalRows === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % totalRows);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + totalRows) % totalRows);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted < filtered.length) {
        const item = filtered[highlighted];
        if (item) commitSelection(item);
      } else if (showSaveLabeledRow && saveAsLabeledAllowed) {
        void commitSaveAsLabeled();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  const displayLabel = selectedItem?.name ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full min-w-0 items-center rounded-md border border-slate-200 bg-white px-3 text-left text-sm shadow-xs transition-colors",
            "outline-none hover:bg-slate-50/80 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/25",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !displayLabel && "text-slate-500"
          )}
        >
          <span className="truncate">{displayLabel || placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="z-50 min-w-[220px] max-w-[min(92vw,360px)] border border-slate-200 p-0 shadow-md"
        style={panelWidth ? { width: panelWidth } : undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={() => setSearch("")}
      >
        <div className="flex flex-col" onKeyDown={handleKeyDown}>
          <div className="border-b border-slate-100 px-2 py-1.5">
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls="checklist-picker-list"
              className={cn(
                "h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none",
                "placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/25"
              )}
            />
          </div>
          <div
            id="checklist-picker-list"
            ref={listRef}
            role="listbox"
            className="max-h-[min(240px,40vh)] overflow-y-auto py-1"
          >
            {activeItems.length === 0 && !showSaveLabeledRow ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">No checklist items</div>
            ) : filtered.length === 0 && !showSaveLabeledRow ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">No matching items</div>
            ) : (
              <>
                {filtered.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    data-index={index}
                    aria-selected={highlighted === index}
                    className={cn(
                      "flex w-full cursor-default items-center px-2.5 py-1 text-left text-sm leading-tight text-slate-900",
                      "hover:bg-slate-100",
                      highlighted === index && "bg-slate-100"
                    )}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => commitSelection(item)}
                  >
                    <span className="min-w-0 truncate">{item.name}</span>
                  </button>
                ))}
                {showSaveLabeledRow && onSaveAsLabeledDocument && (
                  <button
                    type="button"
                    role="option"
                    data-index={filtered.length}
                    aria-selected={highlighted === filtered.length}
                    disabled={!saveAsLabeledAllowed || disabled}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-t border-slate-100 px-2.5 py-1.5 text-left text-xs leading-snug",
                      saveAsLabeledAllowed && !disabled
                        ? "cursor-default text-slate-800 hover:bg-slate-100"
                        : "cursor-not-allowed text-slate-400",
                      highlighted === filtered.length && saveAsLabeledAllowed && !disabled && "bg-slate-100"
                    )}
                    onMouseEnter={() => setHighlighted(filtered.length)}
                    onClick={() => {
                      if (saveAsLabeledAllowed && !disabled) void commitSaveAsLabeled();
                    }}
                  >
                    <span className="font-medium">
                      Save as labeled document: ‘{trimmedSearch}’
                    </span>
                    {!saveAsLabeledAllowed && (
                      <span className="text-[11px] font-normal text-slate-500">
                        Select an unattached document below first
                      </span>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
