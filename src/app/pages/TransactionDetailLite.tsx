import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { getTransaction } from "../../services/transactions";
import type { WorkItem } from "../../types/workItem";

export default function TransactionDetailLite() {
  const id = useMemo(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }, []);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<WorkItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        if (!id) {
          if (!cancelled) setItem(null);
          return;
        }
        const data = await getTransaction(id);
        if (!cancelled) setItem(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button variant="outline" onClick={() => window.history.back()}>
          Back
        </Button>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>
          {item?.identifier ?? id ?? "Transaction"}
        </h2>
      </div>

      {loading ? (
        <div style={{ marginTop: 16 }}>Loading…</div>
      ) : !item ? (
        <div style={{ marginTop: 16 }}>Not found.</div>
      ) : (
        <div style={{ marginTop: 16, lineHeight: 1.9 }}>
          <div><b>ID:</b> {item.id}</div>
          <div><b>Type:</b> {item.type}</div>
          <div><b>Owner:</b> {item.owner}</div>
          <div><b>Organization:</b> {item.organizationName}</div>
          <div><b>Status:</b> {item.statusLabel}</div>
          <div><b>Due:</b> {item.dueDate}</div>
          <div><b>Missing:</b> {item.missingCount}</div>
          <div><b>Rejected:</b> {item.rejectedCount}</div>
          <div><b>Last activity:</b> {item.lastActivity}</div>
        </div>
      )}
    </div>
  );
}