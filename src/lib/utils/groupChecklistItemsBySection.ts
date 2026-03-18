export type GroupedChecklistSection = {
    sectionId: string;
    sectionTitle: string;
    sortOrder: number;
    items: {
      id: string;
      name: string;
      requirement: string | null;
      sortOrder: number;
      status?: "pending" | "complete";
    }[];
  };
  
  export function groupChecklistItemsBySection(
    items: any[]
  ): GroupedChecklistSection[] {
    const sectionMap = new Map<string, GroupedChecklistSection>();
  
    for (const item of items) {
      const sectionId = item.section_id ?? "unassigned";
      const sectionTitle = item.section?.name ?? "Other";
      const sectionSortOrder = item.section?.sort_order ?? 9999;
  
      if (!sectionMap.has(sectionId)) {
        sectionMap.set(sectionId, {
          sectionId,
          sectionTitle,
          sortOrder: sectionSortOrder,
          items: [],
        });
      }
  
      sectionMap.get(sectionId)!.items.push({
        id: item.id,
        name: item.name,
        requirement: item.requirement ?? null,
        sortOrder: item.sort_order ?? 9999,
        status: "pending",
      });
    }
  
    return Array.from(sectionMap.values())
      .map((section) => ({
        ...section,
        items: section.items.sort((a, b) => a.sortOrder - b.sortOrder),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }