import React, { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { getCurrentOffice, getOfficeById, type Office } from "../../../services/offices";
import { useOptionalSettingsProfile } from "./SettingsProfileContext";
import {
  archiveOfficeChecklistTemplate,
  cloneBtqMasterTemplateToOffice,
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
  type BtqMasterChecklistTemplateRow,
  type OfficeChecklistTemplateRow,
} from "../../../services/checklistTemplates";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
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

/** Matches transaction checklist “Not Submitted” styling; inert on template settings. */
function inertReviewBadge() {
  return (
    <Badge className="bg-slate-50 text-slate-600 border-slate-300 border pointer-events-none opacity-60">
      Not Submitted
    </Badge>
  );
}

function InertTransactionActionIcons() {
  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-1.5 pointer-events-none opacity-40">
      <span className="inline-flex h-8 w-8 items-center justify-center" title="Attach document">
        <Paperclip className="h-4 w-4 text-slate-600" aria-hidden />
      </span>
      <span className="inline-flex h-8 w-8 items-center justify-center relative" title="Comments">
        <MessageSquare className="h-4 w-4 text-slate-600" aria-hidden />
      </span>
      <span className="inline-flex h-8 w-8 items-center justify-center" title="Review document">
        <Eye className="h-4 w-4 text-slate-600" aria-hidden />
      </span>
      <span className="inline-flex h-8 w-8 items-center justify-center" title="Archive item">
        <Archive className="h-4 w-4 text-slate-600" aria-hidden />
      </span>
    </div>
  );
}

export function OfficeChecklistTemplatesTab() {
  const settingsProfile = useOptionalSettingsProfile();
  const hasSettingsProfile = settingsProfile !== undefined;
  const officeIdFromSettings = settingsProfile?.profile?.office_id?.trim() ?? "";

  const [office, setOffice] = useState<Office | null | undefined>(undefined);
  const [templates, setTemplates] = useState<OfficeChecklistTemplateRow[]>([]);
  const [btqMasters, setBtqMasters] = useState<BtqMasterChecklistTemplateRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [btqMasterSelectKey, setBtqMasterSelectKey] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [sectionsByTemplateId, setSectionsByTemplateId] = useState<
    Record<string, NonNullable<Awaited<ReturnType<typeof fetchChecklistTemplateSectionsAndItems>> | null>>
  >({});
  const [renameItem, setRenameItem] = useState<{ templateId: string; id: string; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const refreshOfficeTemplates = useCallback(async (officeId: string) => {
    const rows = await listOfficeChecklistTemplates(officeId);
    setTemplates(rows.filter((t) => !t.archived_at && isOfficeOwnedTemplate(t)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let o: Office | null = null;
      if (hasSettingsProfile) {
        o = officeIdFromSettings ? await getOfficeById(officeIdFromSettings) : null;
      } else {
        o = await getCurrentOffice();
      }
      if (!cancelled) setOffice(o);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSettingsProfile, officeIdFromSettings]);

  useEffect(() => {
    if (!office?.id) {
      if (office === null) setListLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setListLoading(true);
      const [rows, btq] = await Promise.all([
        listOfficeChecklistTemplates(office.id),
        listBtqMasterChecklistTemplates(),
      ]);
      if (cancelled) return;
      setBtqMasters(btq);
      setTemplates(rows.filter((t) => !t.archived_at && isOfficeOwnedTemplate(t)));
      setListLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [office?.id]);

  // Add from BTQ → clone_btq_starter_to_office (not ensure_office_checklist_template_from_btq). Office comes from getCurrentOffice() on this route (no Settings profile provider).
  const handleBtqMasterSelect = async (btqTemplateId: string) => {
    if (!office?.id) return;
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

  const handleSaveRenameItem = async () => {
    if (!renameItem) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty");
      return;
    }
    setRenameSaving(true);
    try {
      const { error } = await updateChecklistTemplateItem({ itemId: renameItem.id, name: trimmed });
      if (error) {
        toast.error(error.message);
        return;
      }
      setRenameItem(null);
      await refreshStructureForTemplate(renameItem.templateId);
    } finally {
      setRenameSaving(false);
    }
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
            One checklist per transaction type (Purchase, Listing, Lease, Other). Defaults to the template marked
            default for that type when duplicates exist. Add from BTQ only for a type you do not yet have. Templates
            belong to <span className="font-medium text-slate-800">{office.name}</span> only (global BTQ masters are
            not listed here).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {listLoading ? (
            <div className="flex items-center gap-2 text-slate-600 text-sm py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading saved templates…
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-600 py-4">
              No office checklist templates yet. Use “Add from BTQ” above to create your first one.
            </p>
          ) : (
            <ul className="space-y-3">
              {templates.map((t) => (
                <OfficeTemplateCard
                  key={t.id}
                  template={t}
                  expanded={expandedIds.has(t.id)}
                  sections={sectionsByTemplateId[t.id]}
                  onToggle={() => void toggleCard(t.id)}
                  onRefreshList={() => refreshOfficeTemplates(office.id)}
                  onRefreshStructure={() => refreshStructureForTemplate(t.id)}
                  onRenameItemClick={(item) => {
                    setRenameItem({ templateId: t.id, id: item.id, name: item.name });
                    setRenameDraft(item.name);
                  }}
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

      <Dialog open={!!renameItem} onOpenChange={(open) => !open && setRenameItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename checklist item</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="rename-item-name">Name</Label>
            <Input
              id="rename-item-name"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveRenameItem();
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameItem(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveRenameItem()} disabled={renameSaving}>
              {renameSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OfficeTemplateCard({
  template,
  expanded,
  sections,
  onToggle,
  onRefreshList,
  onRefreshStructure,
  onRenameItemClick,
  onDuplicate,
  onArchive,
}: {
  template: OfficeChecklistTemplateRow;
  expanded: boolean;
  sections: Awaited<ReturnType<typeof fetchChecklistTemplateSectionsAndItems>> | undefined;
  onToggle: () => void;
  onRefreshList: () => Promise<void>;
  onRefreshStructure: () => Promise<void>;
  onRenameItemClick: (item: { id: string; name: string }) => void;
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

          {sections === undefined ? (
            <div className="flex items-center gap-2 text-slate-600 text-sm py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading checklist…
            </div>
          ) : sections === null ? (
            <p className="text-sm text-slate-600">Could not load checklist structure.</p>
          ) : (
            <OfficeTemplateEditor
              templateId={template.id}
              sections={sections}
              onRefreshStructure={onRefreshStructure}
              onRenameItemClick={onRenameItemClick}
            />
          )}
        </div>
      ) : null}
    </li>
  );
}

function OfficeTemplateEditor({
  templateId,
  sections,
  onRefreshStructure,
  onRenameItemClick,
}: {
  templateId: string;
  sections: NonNullable<Awaited<ReturnType<typeof fetchChecklistTemplateSectionsAndItems>>>;
  onRefreshStructure: () => Promise<void>;
  onRenameItemClick: (item: { id: string; name: string }) => void;
}) {
  const secs = [...sections.sections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-slate-900">
          <FileText className="h-5 w-5 text-slate-600" />
          Checklist structure
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {secs.map((sec, sectionIndex) => {
          const items = sections.items
            .filter((i) => i.section_id === sec.id)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          return (
            <div key={sec.id}>
              <div
                className={`flex items-center justify-between gap-2 pb-1 ${
                  sectionIndex === 0 ? "pt-0" : "pt-2"
                }`}
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex-1 min-w-0 flex items-center gap-2">
                  <Input
                    defaultValue={sec.name ?? ""}
                    className="max-w-xl h-8 text-xs font-semibold uppercase tracking-wider border-slate-200"
                    onBlur={async (e) => {
                      const v = e.target.value.trim();
                      if (!v || v === sec.name) return;
                      const { error } = await renameChecklistTemplateSection(sec.id, v);
                      if (error) toast.error(error.message);
                      else await onRefreshStructure();
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs text-red-600 hover:text-red-700"
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
              </div>

              <div className="space-y-2">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="shrink-0 pt-0.5 pointer-events-none opacity-50">
                      <Clock className="h-5 w-5 text-slate-400" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate font-medium text-slate-900" title={it.name}>
                          {it.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-slate-500 hover:text-slate-800"
                          title="Rename item"
                          onClick={() => onRenameItemClick(it)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Rename item</span>
                        </Button>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-nowrap items-center gap-1.5 flex-wrap justify-end">
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
                      {inertReviewBadge()}
                      <InertTransactionActionIcons />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-red-600 hover:text-red-700 pointer-events-auto"
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
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2">
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
              </div>
            </div>
          );
        })}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2"
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
      </CardContent>
    </Card>
  );
}
