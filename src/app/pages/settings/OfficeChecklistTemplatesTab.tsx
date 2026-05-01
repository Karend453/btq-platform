import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  FileText,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useOptionalSettingsProfile } from "./SettingsProfileContext";
import { useOfficeForSettingsTabs } from "./useOfficeForSettingsTabs";
import {
  archiveOfficeChecklistTemplate,
  cloneBtqMasterTemplateToOffice,
  compareChecklistTemplateItems,
  compareChecklistTemplateSections,
  deleteChecklistTemplateItem,
  deleteChecklistTemplateSectionCascade,
  duplicateOfficeChecklistTemplate,
  fetchChecklistTemplateSectionsAndItems,
  insertChecklistTemplateItem,
  insertChecklistTemplateSection,
  listBtqMasterChecklistTemplates,
  listOfficeChecklistTemplates,
  renameChecklistTemplateSection,
  renameOfficeChecklistTemplate,
  setDefaultOfficeChecklistTemplate,
  updateChecklistTemplateItem,
  updateChecklistTemplateSection,
  type BtqMasterChecklistTemplateRow,
  type OfficeChecklistTemplateRow,
} from "../../../services/checklistTemplates";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

/** Office-only rows; global BTQ (office_id null) never appears in listOfficeChecklistTemplates. */
function isOfficeOwnedTemplate(t: OfficeChecklistTemplateRow): boolean {
  return Boolean(t.office_id?.trim());
}

function getRequirementBadge(requirement: string | null) {
  return requirement === "optional" ? (
    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs">
      Optional
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
      Required
    </Badge>
  );
}

export type OfficeChecklistTemplatesTabProps = {
  /**
   * When true (btq_admin Settings tab), templates are view-only. Brokers use full edit on
   * `/office/checklist-templates`.
   */
  readOnly?: boolean;
};

export function OfficeChecklistTemplatesTab({ readOnly = false }: OfficeChecklistTemplatesTabProps) {
  const settingsProfile = useOptionalSettingsProfile();
  const { office } = useOfficeForSettingsTabs(settingsProfile?.profile?.office_id);
  const [templates, setTemplates] = useState<OfficeChecklistTemplateRow[]>([]);
  const [btqMasters, setBtqMasters] = useState<BtqMasterChecklistTemplateRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [btqMasterSelectKey, setBtqMasterSelectKey] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [sectionsByTemplateId, setSectionsByTemplateId] = useState<
    Record<string, NonNullable<Awaited<ReturnType<typeof fetchChecklistTemplateSectionsAndItems>> | null>>
  >({});

  const refreshOfficeTemplates = useCallback(async (officeId: string) => {
    const rows = await listOfficeChecklistTemplates(officeId);
    setTemplates(rows.filter((t) => !t.archived_at && isOfficeOwnedTemplate(t)));
  }, []);

  useEffect(() => {
    if (!office?.id) {
      if (office === null) setListLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setListLoading(true);
      const rows = await listOfficeChecklistTemplates(office.id);
      if (cancelled) return;
      if (!readOnly) {
        const btq = await listBtqMasterChecklistTemplates();
        if (cancelled) return;
        setBtqMasters(btq);
      } else {
        setBtqMasters([]);
      }
      setTemplates(rows.filter((t) => !t.archived_at && isOfficeOwnedTemplate(t)));
      setListLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [office?.id, readOnly]);

  // Add from BTQ → clone_btq_starter_to_office (not ensure_office_checklist_template_from_btq). Office comes from getCurrentOffice() on this route (no Settings profile provider).
  const handleBtqMasterSelect = async (btqTemplateId: string) => {
    if (readOnly || !office?.id) return;
    if (import.meta.env.DEV) {
      console.log("[OfficeChecklistTemplatesTab] Add from BTQ — office.id passed to clone RPC", {
        officeIdFromGetCurrentOfficeOrSettings: office.id,
      });
    }
    setBtqMasterSelectKey((k) => k + 1);
    const { templateId, error } = await cloneBtqMasterTemplateToOffice(office.id, btqTemplateId);
    if (error || !templateId) {
      toast.error(error?.message ?? "Could not create template from BTQ");
      return;
    }
    toast.success("Template added — edit below");
    await refreshOfficeTemplates(office.id);
    const raw = await fetchChecklistTemplateSectionsAndItems(templateId);
    setSectionsByTemplateId((prev) => ({ ...prev, [templateId]: raw ?? null }));
  };

  const toggleCard = async (templateId: string) => {
    const willExpand = !expandedIds.has(templateId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
    if (willExpand && sectionsByTemplateId[templateId] === undefined) {
      const raw = await fetchChecklistTemplateSectionsAndItems(templateId);
      setSectionsByTemplateId((prev) => ({ ...prev, [templateId]: raw ?? null }));
    }
  };

  const refreshStructureForTemplate = async (templateId: string) => {
    const raw = await fetchChecklistTemplateSectionsAndItems(templateId);
    setSectionsByTemplateId((prev) => ({ ...prev, [templateId]: raw ?? null }));
    if (office?.id) await refreshOfficeTemplates(office.id);
  };

  if (office === undefined) {
    return (
      <div className="flex items-center gap-2 text-slate-600 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!office) {
    return (
      <p className="text-sm text-slate-600">
        No office linked to your profile. Checklist templates are available once you have an office assignment.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Office checklist templates
          </CardTitle>
          <CardDescription>
          
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!readOnly ? (
            <div className="flex flex-wrap gap-4 items-end border-b border-slate-100 pb-4">
              <div className="grid gap-1.5 min-w-[16rem]">
                <Label htmlFor="btq-master-select">Add from BTQ</Label>
                {btqMasters.length > 0 ? (
                  <Select key={btqMasterSelectKey} onValueChange={(v) => void handleBtqMasterSelect(v)}>
                    <SelectTrigger id="btq-master-select" className="w-[min(100%,22rem)]">
                      <SelectValue placeholder="Choose a BTQ template to add…" />
                    </SelectTrigger>
                    <SelectContent>
                      {btqMasters.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          <span className="text-slate-500"> — {s.checklist_type}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-slate-600">
                    No BTQ templates are available in the database. Contact support if this persists.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {listLoading ? (
            <div className="flex items-center gap-2 text-slate-600 text-sm py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading saved templates…
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-600 py-4">
              {readOnly
                ? "No office checklist templates for this office yet."
                : "No office checklist templates yet. Use “Add from BTQ” above to create your first one."}
            </p>
          ) : (
            <ul className="space-y-3">
              {templates.map((t) => (
                <OfficeTemplateCard
                  key={t.id}
                  readOnly={readOnly}
                  template={t}
                  expanded={expandedIds.has(t.id)}
                  sections={sectionsByTemplateId[t.id]}
                  onToggle={() => void toggleCard(t.id)}
                  onRefreshList={() => refreshOfficeTemplates(office.id)}
                  onRefreshStructure={() => refreshStructureForTemplate(t.id)}
                  onDuplicate={async () => {
                    const { newTemplateId, error } = await duplicateOfficeChecklistTemplate(t.id, office.id);
                    if (error || !newTemplateId) {
                      toast.error(error?.message ?? "Duplicate failed");
                      return;
                    }
                    toast.success("Template duplicated");
                    await refreshOfficeTemplates(office.id);
                    const raw = await fetchChecklistTemplateSectionsAndItems(newTemplateId);
                    setSectionsByTemplateId((prev) => ({ ...prev, [newTemplateId]: raw ?? null }));
                  }}
                  onArchive={async () => {
                    if (!confirm("Archive this template? It will no longer be available for new transactions.")) return;
                    const { error } = await archiveOfficeChecklistTemplate(t.id);
                    if (error) toast.error(error.message);
                    else {
                      toast.success("Template archived");
                      setExpandedIds((prev) => {
                        const next = new Set(prev);
                        next.delete(t.id);
                        return next;
                      });
                      setSectionsByTemplateId((prev) => {
                        const { [t.id]: _, ...rest } = prev;
                        return rest;
                      });
                      await refreshOfficeTemplates(office.id);
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OfficeTemplateCard({
  readOnly,
  template,
  expanded,
  sections,
  onToggle,
  onRefreshList,
  onRefreshStructure,
  onDuplicate,
  onArchive,
}: {
  readOnly: boolean;
  template: OfficeChecklistTemplateRow;
  expanded: boolean;
  sections: Awaited<ReturnType<typeof fetchChecklistTemplateSectionsAndItems>> | undefined;
  onToggle: () => void;
  onRefreshList: () => Promise<void>;
  onRefreshStructure: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const [nameDraft, setNameDraft] = useState(template.name);

  useEffect(() => {
    setNameDraft(template.name);
  }, [template.name]);

  return (
    <li className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex w-full items-center gap-2 p-3 text-left hover:bg-slate-50/80 transition-colors">
        <button
          type="button"
          className="flex flex-1 min-w-0 items-center gap-2 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="text-slate-500 shrink-0">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          <FileText className="h-4 w-4 text-slate-500 shrink-0" />
          <span className="font-medium text-slate-900 truncate">{template.name}</span>
          <span className="text-xs font-normal text-slate-500 shrink-0">{template.checklist_type}</span>
          {template.is_default_for_type ? (
            <Badge className="ml-1 shrink-0 bg-emerald-50 text-emerald-800 border-emerald-200 text-xs">Default</Badge>
          ) : null}
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-slate-100 px-3 py-3 space-y-3 bg-slate-50/50">
          {!readOnly ? (
            <div className="flex flex-wrap gap-2 items-end justify-between gap-y-3">
              <div className="flex flex-wrap gap-2 items-end flex-1 min-w-[12rem]">
                <div className="grid gap-1.5 flex-1 min-w-[12rem] max-w-md">
                  <Label className="text-xs">Template name</Label>
                  <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const { error } = await renameOfficeChecklistTemplate(template.id, nameDraft);
                    if (error) toast.error(error.message);
                    else {
                      toast.success("Saved");
                      await onRefreshList();
                    }
                  }}
                >
                  Save name
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const { error } = await setDefaultOfficeChecklistTemplate(template.id);
                    if (error) toast.error(error.message);
                    else {
                      toast.success("Default updated");
                      await onRefreshList();
                    }
                  }}
                >
                  Set default
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void onDuplicate()}>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Duplicate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-700 border-red-200"
                  onClick={() => void onArchive()}
                >
                  Archive
                </Button>
              </div>
            </div>
          ) : null}

          {sections === undefined ? (
            <div className="flex items-center gap-2 text-slate-600 text-sm py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading checklist…
            </div>
          ) : sections === null ? (
            <p className="text-sm text-slate-600">Could not load checklist structure.</p>
            ) : (
            <OfficeTemplateEditor
              readOnly={readOnly}
              templateId={template.id}
              sections={sections}
              onRefreshStructure={onRefreshStructure}
            />
          )}
        </div>
      ) : null}
    </li>
  );
}

/** In-place move for reordering sections/items in the template editor. */
function arrayMove<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) {
    return [...arr];
  }
  const next = [...arr];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

function OfficeTemplateEditor({
  readOnly,
  templateId,
  sections,
  onRefreshStructure,
}: {
  readOnly: boolean;
  templateId: string;
  sections: NonNullable<Awaited<ReturnType<typeof fetchChecklistTemplateSectionsAndItems>>>;
  onRefreshStructure: () => Promise<void>;
}) {
  const secs = [...sections.sections].sort(compareChecklistTemplateSections);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionNameDraft, setSectionNameDraft] = useState("");
  const sectionEditSkipBlurCommitRef = useRef(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemNameDraft, setItemNameDraft] = useState("");
  const itemEditSkipBlurCommitRef = useRef(false);

  const editableNameTriggerClass =
    "w-full min-h-8 min-w-0 max-w-[20rem] rounded-md px-1.5 py-0.5 text-left outline-none transition-colors hover:bg-slate-200/40 focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-1";

  const editableItemNameTriggerClass =
    "min-h-8 min-w-0 flex-1 rounded-md px-1.5 py-0.5 text-left outline-none transition-colors hover:bg-slate-200/40 focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-1";

  async function persistSectionOrder(ordered: typeof secs) {
    const results = await Promise.all(
      ordered.map((s, idx) => updateChecklistTemplateSection({ sectionId: s.id, sortOrder: idx }))
    );
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) {
      toast.error(firstErr.message);
      return;
    }
    await onRefreshStructure();
  }

  async function persistItemOrderInSection(orderedItems: (typeof sections.items)[number][]) {
    const results = await Promise.all(
      orderedItems.map((it, idx) => updateChecklistTemplateItem({ itemId: it.id, sortOrder: idx }))
    );
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) {
      toast.error(firstErr.message);
      return;
    }
    await onRefreshStructure();
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <FileText className="h-5 w-5 shrink-0 text-slate-600" />
          Checklist structure
        </CardTitle>
        {!readOnly ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={async () => {
              const nextSort =
                secs.length > 0 ? Math.max(...secs.map((s) => s.sort_order ?? 0)) + 1 : 0;
              const { id, error } = await insertChecklistTemplateSection({
                templateId,
                name: "New section",
                sortOrder: nextSort,
              });
              if (error || !id) toast.error(error?.message ?? "Could not add section");
              else await onRefreshStructure();
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add section
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {secs.map((sec, sectionIndex) => {
          const items = sections.items
            .filter((i) => i.section_id === sec.id)
            .sort(compareChecklistTemplateItems);
          const isFirstSection = sectionIndex === 0;
          const isLastSection = sectionIndex >= secs.length - 1;
          return (
            <div key={sec.id}>
              <div
                className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-2 ${
                  sectionIndex === 0 ? "pt-0" : "pt-2 border-t border-slate-200/80"
                }`}
              >
                <div className="min-w-0 w-full max-w-[20rem] sm:w-auto">
                  {readOnly ? (
                    <span className="block truncate text-xs font-semibold uppercase tracking-wider text-slate-700">
                      {sec.name ?? "—"}
                    </span>
                  ) : editingSectionId === sec.id ? (
                    <Input
                      autoFocus
                      value={sectionNameDraft}
                      onChange={(e) => setSectionNameDraft(e.target.value)}
                      className="h-8 w-full max-w-[20rem] min-w-0 border-slate-200 text-xs font-semibold uppercase tracking-wider"
                      title={sec.name ?? ""}
                      aria-label="Section name"
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          sectionEditSkipBlurCommitRef.current = true;
                          setSectionNameDraft(sec.name ?? "");
                          setEditingSectionId(null);
                        }
                      }}
                      onBlur={(e) => {
                        const raw = e.currentTarget.value;
                        void (async () => {
                          if (sectionEditSkipBlurCommitRef.current) {
                            sectionEditSkipBlurCommitRef.current = false;
                            return;
                          }
                          const v = raw.trim();
                          if (!v || v === sec.name) {
                            setEditingSectionId(null);
                            return;
                          }
                          const { error } = await renameChecklistTemplateSection(sec.id, v);
                          if (error) {
                            toast.error(error.message);
                            return;
                          }
                          await onRefreshStructure();
                          setEditingSectionId(null);
                        })();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`${editableNameTriggerClass} truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-slate-800`}
                      title={sec.name ?? ""}
                      onClick={() => {
                        setEditingItemId(null);
                        setEditingSectionId(sec.id);
                        setSectionNameDraft(sec.name ?? "");
                      }}
                    >
                      <span className="block truncate">{sec.name ?? "—"}</span>
                    </button>
                  )}
                </div>
                {!readOnly ? (
                  <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-slate-600"
                      onClick={async () => {
                        const nextSort =
                          items.length > 0 ? Math.max(...items.map((i) => i.sort_order ?? 0)) + 1 : 0;
                        const { id: newId, error } = await insertChecklistTemplateItem({
                          templateId,
                          sectionId: sec.id,
                          name: "New item",
                          requirement: "required",
                          sortOrder: nextSort,
                        });
                        if (error || !newId) toast.error(error?.message ?? "Could not add item");
                        else await onRefreshStructure();
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add item
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 text-xs text-red-600 hover:text-red-700"
                      onClick={async () => {
                        if (!confirm("Delete this section and its items?")) return;
                        const { error } = await deleteChecklistTemplateSectionCascade(sec.id, templateId);
                        if (error) toast.error(error.message);
                        else await onRefreshStructure();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete section
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-slate-600"
                          aria-label="Section reorder"
                        >
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Open section actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          disabled={isFirstSection}
                          onSelect={() => {
                            if (isFirstSection) return;
                            void persistSectionOrder(arrayMove(secs, sectionIndex, sectionIndex - 1));
                          }}
                        >
                          Move section up
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isLastSection}
                          onSelect={() => {
                            if (isLastSection) return;
                            void persistSectionOrder(arrayMove(secs, sectionIndex, sectionIndex + 1));
                          }}
                        >
                          Move section down
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                {items.map((it, itemIndex) => {
                  const isFirstItem = itemIndex === 0;
                  const isLastItem = itemIndex >= items.length - 1;
                  return (
                    <div
                      key={it.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-h-8 min-w-0">
                          {readOnly ? (
                            <span className="min-w-0 truncate font-medium text-slate-900" title={it.name}>
                              {it.name}
                            </span>
                          ) : editingItemId === it.id ? (
                            <Input
                              autoFocus
                              value={itemNameDraft}
                              onChange={(e) => setItemNameDraft(e.target.value)}
                              className="h-8 min-w-0 flex-1 border-slate-200 px-2 py-1 text-base font-medium leading-none text-slate-900 md:text-sm"
                              aria-label="Checklist item name"
                              onFocus={(e) => e.currentTarget.select()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  itemEditSkipBlurCommitRef.current = true;
                                  setItemNameDraft(it.name);
                                  setEditingItemId(null);
                                }
                              }}
                              onBlur={(e) => {
                                const raw = e.currentTarget.value;
                                void (async () => {
                                  if (itemEditSkipBlurCommitRef.current) {
                                    itemEditSkipBlurCommitRef.current = false;
                                    return;
                                  }
                                  const v = raw.trim();
                                  if (!v || v === it.name) {
                                    setEditingItemId(null);
                                    return;
                                  }
                                  const { error } = await updateChecklistTemplateItem({
                                    itemId: it.id,
                                    name: v,
                                  });
                                  if (error) {
                                    toast.error(error.message);
                                    return;
                                  }
                                  await onRefreshStructure();
                                  setEditingItemId(null);
                                })();
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className={editableItemNameTriggerClass}
                              onClick={() => {
                                setEditingSectionId(null);
                                setEditingItemId(it.id);
                                setItemNameDraft(it.name);
                              }}
                            >
                              <span className="block min-w-0 truncate font-medium text-slate-900" title={it.name}>
                                {it.name}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
                        {readOnly ? (
                          getRequirementBadge(it.requirement)
                        ) : (
                          <>
                            <button
                              type="button"
                              className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                              title="Click to toggle required / optional"
                              onClick={async () => {
                                const next = it.requirement === "optional" ? "required" : "optional";
                                const { error } = await updateChecklistTemplateItem({
                                  itemId: it.id,
                                  requirement: next,
                                });
                                if (error) toast.error(error.message);
                                else await onRefreshStructure();
                              }}
                            >
                              {getRequirementBadge(it.requirement)}
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-red-600 hover:text-red-700"
                              title="Delete item"
                              onClick={async () => {
                                if (!confirm("Delete this item?")) return;
                                const { error } = await deleteChecklistTemplateItem(it.id);
                                if (error) toast.error(error.message);
                                else await onRefreshStructure();
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete item</span>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 text-slate-600"
                                  aria-label="Item reorder"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                  <span className="sr-only">Open item actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  disabled={isFirstItem}
                                  onSelect={() => {
                                    if (isFirstItem) return;
                                    void persistItemOrderInSection(
                                      arrayMove(items, itemIndex, itemIndex - 1)
                                    );
                                  }}
                                >
                                  Move up
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={isLastItem}
                                  onSelect={() => {
                                    if (isLastItem) return;
                                    void persistItemOrderInSection(
                                      arrayMove(items, itemIndex, itemIndex + 1)
                                    );
                                  }}
                                >
                                  Move down
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
