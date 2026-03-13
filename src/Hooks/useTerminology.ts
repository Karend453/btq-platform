import { useEffect, useState } from "react";
import { getWorkspaceSettings } from "../services/workspaceSettings";

type Terminology = {
  organization_label: string;
  record_label_singular: string;
  record_label_plural: string;
  section_label_singular: string;
  section_label_plural: string;
  item_label_singular: string;
  item_label_plural: string;
  client_label: string;
  reviewer_label: string;
  admin_label: string;
};

export function useTerminology() {
  const [terms, setTerms] = useState<Terminology | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getWorkspaceSettings();
        setTerms(data);
      } catch (error) {
        console.error("Failed to load terminology:", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { terms, loading };
}