export type StoredTransaction = {
    id: string;
    type: string;
    status: string;
    propertyIdentifier: string;
    primaryClientName: string;
    primaryClientEmail: string;
    intakeEmail: string;
    createdAt: string;
    updatedAt: string;
  };
  
  const STORAGE_KEY = "btq_transactions";
  
  export function getStoredTransactions(): StoredTransaction[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (error) {
      console.error("Failed to read transactions from localStorage:", error);
      return [];
    }
  }
  
  export function saveStoredTransactions(transactions: StoredTransaction[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    } catch (error) {
      console.error("Failed to save transactions to localStorage:", error);
    }
  }
  
  export function addStoredTransaction(transaction: StoredTransaction) {
    const existing = getStoredTransactions();
    saveStoredTransactions([transaction, ...existing]);
  }
  
  export function getStoredTransactionById(id: string) {
    const transactions = getStoredTransactions();
    return transactions.find((txn) => txn.id === id) || null;
  }
  export type TransactionListItem = {
    id: string;
    identifier: string;
    type: string;
    owner: string;
    organizationName: string;
    organizationId: string;
    status: string;
    statusLabel: string;
    dueDate: string;
    lastActivity: string;
    isArchived: boolean;
    archivedAt: string | null;
    archivedBy: string | null;
    missingCount: number;
    rejectedCount: number;
  };
  
  export function mapStoredTransactionToListItem(
    txn: StoredTransaction
  ): TransactionListItem {
    return {
      id: txn.id,
      identifier: txn.propertyIdentifier,
      type: txn.type,
      owner: txn.primaryClientName,
      organizationName: "New Transaction",
      organizationId: "local",
      status: "active",
      statusLabel: txn.status,
      dueDate: txn.createdAt,
      lastActivity: "Just created",
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      missingCount: 0,
      rejectedCount: 0,
    };
  }