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