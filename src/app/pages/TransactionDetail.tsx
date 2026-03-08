import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  Mail,
  Copy,
  ExternalLink,
  User,
  Building2,
  XCircle,
  Activity as ActivityIcon,
  Filter,
  ChevronDown,
  ChevronUp,
  Upload,
  Trash2,
  Eye,
  MessageSquare,
  Save,
  AlertTriangle,
  Inbox,
  Paperclip,
  Link,
  Search,
  X,
  Archive,
  Download,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { getStoredTransactionById } from "../../lib/transactionStorage";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/ui/collapsible";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";

interface InboxDocument {
  id: string;
  filename: string;
  receivedAt: Date;
  isAttached: boolean;
  attachedToItemId?: string;
}

interface Comment {
  id: string;
  authorRole: "Admin" | "Agent";
  authorName: string;
  createdAt: Date;
  message: string;
  visibility: "Internal" | "Shared";
  type?: "Comment" | "StatusChange" | "System";
  unread?: {
    Admin?: boolean;
    Agent?: boolean;
  };
}

interface ChecklistItem {
  id: string;
  name: string;
  status: "complete" | "pending" | "rejected";
  updatedAt: string;
  requirement: "required" | "optional";
  reviewStatus: "pending" | "rejected" | "complete" | "waived";
  notes: ItemNote[];
  comments: Comment[];
  version: number;
  attachedDocument?: {
    id: string;
    filename: string;
    version: number;
    updatedAt: Date;
    previousVersion?: number;
  };
  suggestedDocument?: {
    id: string;
    filename: string;
    confidence: "high" | "low";
  };
}

interface ItemNote {
  id: string;
  author: string;
  timestamp: Date;
  content: string;
}

interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  actor: "System" | "Agent" | "Admin";
  category: "docs" | "forms" | "system";
  type: string;
  message: string;
  meta?: {
    docName?: string;
    fromStatus?: string;
    toStatus?: string;
    [key: string]: any;
  };
}

type ActivityFilter = "all" | "docs" | "forms" | "system" | "transaction";
type InboxFilter = "all" | "unattached" | "recent";

export function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [copySuccess, setCopySuccess] = useState(false);
  const [lastZipFormsLaunchAt, setLastZipFormsLaunchAt] = useState<Date | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  
  // Admin Review Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [reviewRequirement, setReviewRequirement] = useState<"required" | "optional">("required");
  const [reviewStatus, setReviewStatus] = useState<"pending" | "rejected" | "complete" | "waived">("pending");
  const [reviewNote, setReviewNote] = useState("");
  const [waivedReason, setWaivedReason] = useState("");
  const [notifyAgent, setNotifyAgent] = useState(true);

  // Attach Document Drawer State
  const [isAttachDrawerOpen, setIsAttachDrawerOpen] = useState(false);
  const [attachTargetItem, setAttachTargetItem] = useState<ChecklistItem | null>(null);
  const [selectedDocumentForAttach, setSelectedDocumentForAttach] = useState<string | null>(null);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [inboxSearchQuery, setInboxSearchQuery] = useState("");

  // Comments Thread Drawer State
  const [isCommentsDrawerOpen, setIsCommentsDrawerOpen] = useState(false);
  const [commentsTargetItem, setCommentsTargetItem] = useState<ChecklistItem | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<"Internal" | "Shared">("Shared");
  const [notifyAgentOnComment, setNotifyAgentOnComment] = useState(true);

  // Archive Modal State
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [archiveMetadata, setArchiveMetadata] = useState<{
    archivedAt: Date | null;
    archivedBy: { name: string; role: string } | null;
    archiveReceipt: {
      transactionSummary: {
        identifier: string;
        id: string;
        office: string;
        assignedAgent: string;
        status: string;
      };
      documentSummary: {
        requiredComplete: number;
        requiredWaived: number;
        optionalComplete: number;
        totalDocuments: number;
      };
      activityLogCount: number;
    } | null;
    archivedActivityLog: ActivityLogEntry[];
  }>({
    archivedAt: null,
    archivedBy: null,
    archiveReceipt: null,
    archivedActivityLog: [],
  });

  // Transaction-level operational fields
  const [transactionStatus, setTransactionStatus] = useState<"Pre-Contract" | "Under Contract" | "Closed" | "Archived">("Pre-Contract");
  const [assignedAdmin, setAssignedAdmin] = useState("Karen Admin");
  const [closingDate, setClosingDate] = useState<string>("2026-03-08"); // Mock: 5 days out (triggers needs attention)
  const [contractDate, setContractDate] = useState<string>("2026-03-01"); // Mock: 2 days ago

  // Mock current user role (controllable via dropdown)
  const [currentUserRole, setCurrentUserRole] = useState<"Admin" | "Agent">("Admin");
  const currentUserName = currentUserRole === "Admin" ? "Admin User" : "Sarah Johnson";

  // Mock transaction database lookup
  const mockTransactionDatabase: Record<string, any> = {
    "TXN-2401": {
      id: "TXN-2401",
      identifier: "123 Oak Street, Chicago, IL",
      type: "Sale",
      status: "Pre-Contract",
      clientName: "Sarah Johnson",
      clientEmail: "sarah.j@email.com",
      assignedAgent: "Sarah Johnson",
      office: "Downtown Chicago Office",
      intakeEmail: "txn-2401@docs.btq.app",
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    "TXN-2402": {
      id: "TXN-2402",
      identifier: "456 Maple Ave, Chicago, IL",
      type: "Purchase",
      status: "Pre-Contract",
      clientName: "Michael Chen",
      clientEmail: "m.chen@email.com",
      assignedAgent: "Michael Chen",
      office: "Northside Office",
      intakeEmail: "txn-2402@docs.btq.app",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    "TXN-2403": {
      id: "TXN-2403",
      identifier: "789 Pine Road, Evanston, IL",
      type: "Sale",
      status: "Under Contract",
      clientName: "Emily Rodriguez",
      clientEmail: "emily.r@email.com",
      assignedAgent: "Emily Rodriguez",
      office: "West End Office",
      intakeEmail: "txn-2403@docs.btq.app",
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
    "TXN-2404": {
      id: "TXN-2404",
      identifier: "321 Birch Lane, Oak Park, IL",
      type: "Lease",
      status: "Pre-Contract",
      clientName: "David Kim",
      clientEmail: "d.kim@email.com",
      assignedAgent: "David Kim",
      office: "Downtown Chicago Office",
      intakeEmail: "txn-2404@docs.btq.app",
      createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    },
    "TXN-2405": {
      id: "TXN-2405",
      identifier: "654 Cedar Court, Naperville, IL",
      type: "Sale",
      status: "Pre-Contract",
      clientName: "Jessica Martinez",
      clientEmail: "j.martinez@email.com",
      assignedAgent: "Jessica Martinez",
      office: "Northside Office",
      intakeEmail: "txn-2405@docs.btq.app",
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  };

  // Look up transaction or use default
  const storedTransaction = id ? getStoredTransactionById(id) : null;

const mockTransaction = id && mockTransactionDatabase[id]
  ? mockTransactionDatabase[id]
  : storedTransaction
  ? {
      id: storedTransaction.id,
      identifier: storedTransaction.propertyIdentifier,
      type: storedTransaction.type,
      status: storedTransaction.status,
      clientName: storedTransaction.primaryClientName,
      clientEmail: storedTransaction.primaryClientEmail,
      assignedAgent: "Unassigned",
      office: "New Transaction",
      intakeEmail: storedTransaction.intakeEmail,
      createdAt: storedTransaction.createdAt,
    }
  : id
  ? null
  : {
      id: "TXN-123",
      identifier: "123 Main Street, Chicago, IL 60601",
      type: "Purchase",
      status: "Pre-Contract",
      clientName: "John Smith",
      clientEmail: "john.smith@email.com",
      assignedAgent: "Sarah Johnson",
      office: "Downtown Chicago Office",
      intakeEmail: "txn-123@docs.btq.app",
      createdAt: new Date().toISOString(),
    };

  // Get assigned agent name from transaction
  const assignedAgentName = mockTransaction?.assignedAgent || "Sarah Johnson";

  // Document Inbox
  const [inboxDocuments, setInboxDocuments] = useState<InboxDocument[]>([
    {
      id: "inbox-1",
      filename: "Property_Disclosure_Form.pdf",
      receivedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
      isAttached: false,
    },
    {
      id: "inbox-2",
      filename: "Title_Search_Report.pdf",
      receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      isAttached: false,
    },
    {
      id: "inbox-3",
      filename: "Inspection_Report_Final.pdf",
      receivedAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      isAttached: false,
    },
    {
      id: "inbox-4",
      filename: "HOA_Bylaws_2025.pdf",
      receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      isAttached: false,
    },
    {
      id: "inbox-5",
      filename: "Wire_Transfer_Instructions.pdf",
      receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      isAttached: false,
    },
  ]);

  // Mock checklist items with suggested attachments
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    {
      id: "1",
      name: "Purchase Agreement",
      status: "complete",
      updatedAt: "2 hours ago",
      requirement: "required",
      reviewStatus: "complete",
      notes: [],
      comments: [],
      version: 1,
      attachedDocument: {
        id: "attached-1",
        filename: "Purchase_Agreement_Signed.pdf",
        version: 2,
        updatedAt: new Date(Date.now() - 31 * 60 * 1000), // 31 min ago
      },
    },
    {
      id: "2",
      name: "Pre-Approval Letter",
      status: "complete",
      updatedAt: "3 hours ago",
      requirement: "required",
      reviewStatus: "complete",
      notes: [],
      comments: [],
      version: 1,
      attachedDocument: {
        id: "attached-2",
        filename: "Pre_Approval_Letter.pdf",
        version: 1,
        updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
      },
    },
    {
      id: "3",
      name: "Property Disclosure",
      status: "pending",
      updatedAt: "Not submitted",
      requirement: "required",
      reviewStatus: "pending",
      notes: [],
      comments: [
        {
          id: "comment-3-1",
          authorRole: "Agent",
          authorName: "Sarah Johnson",
          createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
          message: "I've requested this from the seller's agent. Should have it by end of day.",
          visibility: "Shared",
          type: "Comment",
        },
        {
          id: "comment-3-2",
          authorRole: "Admin",
          authorName: "Admin User",
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          message: "Thanks. This is a high priority item - closing is next week.",
          visibility: "Shared",
          type: "Comment",
        },
        {
          id: "comment-3-3",
          authorRole: "Admin",
          authorName: "Admin User",
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
          message: "Internal note: Need to escalate if not received by tomorrow.",
          visibility: "Internal",
          type: "Comment",
        },
      ],
      version: 1,
      suggestedDocument: {
        id: "inbox-1",
        filename: "Property_Disclosure_Form.pdf",
        confidence: "high",
      },
    },
    {
      id: "4",
      name: "Inspection Report",
      status: "pending",
      updatedAt: "Not submitted",
      requirement: "optional",
      reviewStatus: "pending",
      notes: [],
      comments: [],
      version: 1,
      suggestedDocument: {
        id: "inbox-3",
        filename: "Inspection_Report_Final.pdf",
        confidence: "low",
      },
    },
    {
      id: "5",
      name: "Title Search",
      status: "pending",
      updatedAt: "Not submitted",
      requirement: "required",
      reviewStatus: "pending",
      notes: [],
      comments: [],
      version: 1,
      suggestedDocument: {
        id: "inbox-2",
        filename: "Title_Search_Report.pdf",
        confidence: "high",
      },
    },
    {
      id: "6",
      name: "Insurance Certificate",
      status: "rejected",
      updatedAt: "1 day ago",
      requirement: "required",
      reviewStatus: "rejected",
      notes: [],
      comments: [
        {
          id: "comment-6-1",
          authorRole: "Agent",
          authorName: "Sarah Johnson",
          createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000), // 36 hours ago
          message: "Uploaded the insurance certificate from the buyer. Please review when you get a chance.",
          visibility: "Shared",
          type: "Comment",
        },
        {
          id: "comment-6-2",
          authorRole: "Admin",
          authorName: "Admin User",
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
          message: "Rejected: Missing signature on page 2. Please resubmit with all required signatures.",
          visibility: "Shared",
          type: "StatusChange",
        },
        {
          id: "comment-6-3",
          authorRole: "Agent",
          authorName: "Sarah Johnson",
          createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
          message: "Got it - I've reached out to the insurance company for a signed version. Will upload as soon as I receive it.",
          visibility: "Shared",
          type: "Comment",
        },
        {
          id: "comment-6-4",
          authorRole: "Admin",
          authorName: "Admin User",
          createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
          message: "Internal: Called insurance company directly to expedite. Should have by EOD.",
          visibility: "Internal",
          type: "Comment",
        },
        {
          id: "comment-6-5",
          authorRole: "Admin",
          authorName: "Admin User",
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          message: "Please ensure the signature is on page 2, bottom right corner. This is required by the underwriter.",
          visibility: "Shared",
          type: "Comment",
          unread: {
            Agent: true,
          },
        },
      ],
      version: 1,
    },
    {
      id: "7",
      name: "Earnest Money Deposit Receipt",
      status: "complete",
      updatedAt: "1 day ago",
      requirement: "required",
      reviewStatus: "complete",
      notes: [],
      comments: [],
      version: 1,
      attachedDocument: {
        id: "attached-3",
        filename: "Earnest_Money_Receipt.pdf",
        version: 1,
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      },
    },
    {
      id: "8",
      name: "HOA Addendum",
      status: "pending",
      updatedAt: "Not submitted",
      requirement: "optional",
      reviewStatus: "waived",
      notes: [],
      comments: [
        {
          id: "comment-8-1",
          authorRole: "Admin",
          authorName: "Admin User",
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          message: "Waived: Property is not in an HOA. This document is not applicable.",
          visibility: "Shared",
          type: "StatusChange",
        },
      ],
      version: 1,
    },
  ]);

  // Seed activity log on mount
  useEffect(() => {
    const now = new Date();
    const seedActivities: ActivityLogEntry[] = [
      {
        id: "act-1",
        timestamp: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        actor: "System",
        category: "system",
        type: "TRANSACTION_CREATED",
        message: "Transaction created",
      },
      {
        id: "act-2",
        timestamp: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 1000),
        actor: "System",
        category: "system",
        type: "CHECKLIST_APPLIED",
        message: "Purchase checklist applied",
        meta: { checklistType: "Purchase" },
      },
      {
        id: "act-2a",
        timestamp: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 2000),
        actor: "Admin",
        category: "transaction",
        type: "ADMIN_ASSIGNED",
        message: "Assigned Admin changed: (none) → Karen Admin",
        meta: { to: "Karen Admin" },
      },
      {
        id: "act-3",
        timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        actor: "Agent",
        category: "docs",
        type: "DOC_RECEIVED",
        message: 'Document received: "Purchase Agreement.pdf"',
        meta: { docName: "Purchase Agreement.pdf" },
      },
      {
        id: "act-4",
        timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 3600000),
        actor: "Admin",
        category: "docs",
        type: "DOC_REVIEWED",
        message: 'Admin approved "Purchase Agreement"',
        meta: { docName: "Purchase Agreement" },
      },
      {
        id: "act-5",
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        actor: "Agent",
        category: "docs",
        type: "DOC_RECEIVED",
        message: 'Document received: "Earnest Money Deposit Receipt.pdf"',
        meta: { docName: "Earnest Money Deposit Receipt.pdf" },
      },
      {
        id: "act-6",
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 3600000),
        actor: "Admin",
        category: "docs",
        type: "DOC_REVIEWED",
        message: 'Admin approved "Earnest Money Deposit Receipt"',
        meta: { docName: "Earnest Money Deposit Receipt" },
      },
      {
        id: "act-7",
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 7200000),
        actor: "Admin",
        category: "docs",
        type: "DOC_REJECTED",
        message: 'Admin rejected "Insurance Certificate": missing signature',
        meta: { docName: "Insurance Certificate", reason: "missing signature" },
      },
      {
        id: "act-8",
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 + 7300000),
        actor: "Admin",
        category: "docs",
        type: "AGENT_NOTIFIED",
        message: 'Agent notified to review: "Insurance Certificate"',
        meta: { docName: "Insurance Certificate" },
      },
      {
        id: "act-9",
        timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        actor: "Admin",
        category: "docs",
        type: "DOC_WAIVED",
        message: 'Admin waived "HOA Addendum": not applicable (no HOA)',
        meta: { docName: "HOA Addendum", reason: "not applicable (no HOA)" },
      },
    ];
    setActivityLog(seedActivities);
  }, []);

  const addActivityEntry = (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => {
    const newEntry: ActivityLogEntry = {
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...entry,
    };
    setActivityLog((prev) => [newEntry, ...prev]);
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(mockTransaction.intakeEmail);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleLaunchZipForms = () => {
    setLastZipFormsLaunchAt(new Date());
    addActivityEntry({
      actor: "Agent",
      category: "forms",
      type: "ZIPFORMS_LAUNCHED",
      message: "ZipForms session launched",
    });
    toast.success("ZipForms session launched. Activity logged.");
  };

  const handleSimulateDocReceived = () => {
    const mockDocNames = [
      "Title Report.pdf",
      "Inspection Report.pdf",
      "Appraisal Document.pdf",
      "HOA Documents.pdf",
      "Wire Instructions.pdf",
    ];
    const randomDoc = mockDocNames[Math.floor(Math.random() * mockDocNames.length)];
    addActivityEntry({
      actor: "Agent",
      category: "docs",
      type: "DOC_RECEIVED",
      message: `Document received: "${randomDoc}"`,
      meta: { docName: randomDoc },
    });
    toast.success(`Document received: ${randomDoc}`);
  };

  const handleSimulateDocDeleted = () => {
    const mockDocNames = [
      "Draft Contract.pdf",
      "Outdated Disclosure.pdf",
      "Test Document.pdf",
      "Duplicate Form.pdf",
    ];
    const randomDoc = mockDocNames[Math.floor(Math.random() * mockDocNames.length)];
    addActivityEntry({
      actor: "Admin",
      category: "docs",
      type: "DOC_DELETED",
      message: `Document deleted: "${randomDoc}"`,
      meta: { docName: randomDoc },
    });
    toast.info(`Document deleted: ${randomDoc}`);
  };

  const handleSimulateAgentUpload = (itemId: string) => {
    const item = checklistItems.find((i) => i.id === itemId);
    if (!item) return;

    const isResubmission = item.reviewStatus === "rejected" || item.version > 1;
    const newVersion = item.version + 1;

    // Update item: increment version, set to pending review
    setChecklistItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, reviewStatus: "pending" as const, updatedAt: "Just now", version: newVersion }
          : i
      )
    );

    // Log activity with version
    addActivityEntry({
      actor: "Agent",
      category: "docs",
      type: isResubmission ? "DOC_RESUBMITTED" : "DOC_RECEIVED",
      message: isResubmission
        ? `Agent resubmitted "${item.name}" (v${newVersion})`
        : `Document received: "${item.name}.pdf" (v${newVersion})`,
      meta: { docName: item.name, version: newVersion },
    });
    
    toast.success(
      isResubmission
        ? `Agent resubmitted: ${item.name} (v${newVersion})`
        : `Document uploaded: ${item.name} (v${newVersion})`
    );
  };

  const handleOpenReviewModal = (item: ChecklistItem) => {
    setSelectedItem(item);
    setReviewRequirement(item.requirement);
    setReviewStatus(item.reviewStatus);
    setReviewNote("");
    setWaivedReason("");
    setNotifyAgent(true);
    setIsReviewModalOpen(true);
  };

  const handleSaveReview = () => {
    if (!selectedItem) return;

    // Validation
    if (reviewStatus === "rejected" && !reviewNote.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    if (reviewStatus === "waived" && !waivedReason.trim()) {
      toast.error("Please provide a reason for waiving this requirement");
      return;
    }

    // Enforce status rules: cannot be "pending" or "complete" without attachment
    if (!selectedItem.attachedDocument && (reviewStatus === "pending" || reviewStatus === "complete")) {
      toast.error(`Cannot mark as "${reviewStatus === "pending" ? "Pending Review" : "Complete"}" without an attached document`);
      return;
    }

    // Update checklist item
    setChecklistItems((prev) => {
      const updatedItems = prev.map((item) => {
        if (item.id === selectedItem.id) {
          const updatedComments = [...item.comments];
          
          // Create status change comment for rejected or waived status
          if (reviewStatus === "rejected" && reviewNote.trim()) {
            updatedComments.push({
              id: `comment-${item.id}-${Date.now()}`,
              authorRole: "Admin",
              authorName: currentUserName,
              createdAt: new Date(),
              message: `Rejected: ${reviewNote.trim()}`,
              visibility: "Shared",
              type: "StatusChange",
              unread: {
                Agent: true,
              },
            });
          } else if (reviewStatus === "waived" && waivedReason.trim()) {
            updatedComments.push({
              id: `comment-${item.id}-${Date.now()}`,
              authorRole: "Admin",
              authorName: currentUserName,
              createdAt: new Date(),
              message: `Waived: ${waivedReason.trim()}`,
              visibility: "Shared",
              type: "StatusChange",
              unread: {
                Agent: true,
              },
            });
          }

          const updatedItem = {
            ...item,
            requirement: reviewRequirement,
            reviewStatus: reviewStatus,
            comments: updatedComments,
            updatedAt: "Just now",
          };

          // Update commentsTargetItem if the comments drawer is open for this item
          if (commentsTargetItem?.id === selectedItem.id) {
            setCommentsTargetItem(updatedItem);
          }

          return updatedItem;
        }
        return item;
      });

      return updatedItems;
    });

    // Track what changed
    const requirementChanged = selectedItem.requirement !== reviewRequirement;
    const statusChanged = selectedItem.reviewStatus !== reviewStatus;

    // Log requirement change
    if (requirementChanged) {
      addActivityEntry({
        actor: "Admin",
        category: "docs",
        type: "CHECKLIST_ITEM_REQUIREMENT_CHANGED",
        message: `Admin marked "${selectedItem.name}" as ${reviewRequirement === "required" ? "Required" : "Optional"}`,
        meta: {
          docName: selectedItem.name,
          fromRequirement: selectedItem.requirement,
          toRequirement: reviewRequirement,
        },
      });
    }

    // Log status change with specific type
    if (statusChanged) {
      let activityType = "CHECKLIST_ITEM_STATUS_CHANGED";
      let message = "";

      switch (reviewStatus) {
        case "complete":
          activityType = "DOC_REVIEWED";
          message = `Admin approved "${selectedItem.name}"`;
          break;
        case "rejected":
          activityType = "DOC_REJECTED";
          message = `Admin rejected "${selectedItem.name}": ${reviewNote}`;
          break;
        case "waived":
          activityType = "DOC_WAIVED";
          message = `Admin waived "${selectedItem.name}": ${waivedReason}`;
          break;
        case "pending":
          message = `Admin set "${selectedItem.name}" to Pending Review`;
          break;
      }

      addActivityEntry({
        actor: "Admin",
        category: "docs",
        type: activityType,
        message,
        meta: {
          docName: selectedItem.name,
          fromStatus: selectedItem.reviewStatus,
          toStatus: reviewStatus,
          reason: reviewNote || waivedReason || undefined,
        },
      });
    }

    // Handle agent notification
    if (notifyAgent && reviewStatus === "rejected") {
      addActivityEntry({
        actor: "Admin",
        category: "docs",
        type: "AGENT_NOTIFIED",
        message: `Notification sent to Agent: ${assignedAgentName} — Document rejected: ${selectedItem.name}`,
        meta: {
          agentName: assignedAgentName,
          checklistItem: selectedItem.name,
          notificationType: "rejection",
        },
      });
      toast.success("Agent notified (demo)");
    }

    toast.success("Review saved successfully");
    setIsReviewModalOpen(false);
    setSelectedItem(null);
  };

  // Attach Document Functions
  const handleOpenAttachDrawer = (fromItem?: ChecklistItem) => {
    setAttachTargetItem(fromItem || null);
    setSelectedDocumentForAttach(null);
    setInboxSearchQuery("");
    setInboxFilter("unattached");
    setIsAttachDrawerOpen(true);
  };

  const handleAttachSuggested = (item: ChecklistItem) => {
    if (!item.suggestedDocument) return;

    const inboxDoc = inboxDocuments.find((doc) => doc.id === item.suggestedDocument?.id);
    if (!inboxDoc) return;

    // Calculate version: if already has attachment, increment; otherwise start at 1
    const isReplacement = !!item.attachedDocument;
    const previousVersion = item.attachedDocument?.version;
    const newVersion = isReplacement ? item.attachedDocument!.version + 1 : 1;
    const previousStatus = item.reviewStatus;

    // Determine new review status based on workflow rules
    let newReviewStatus = item.reviewStatus;
    let statusAutoReset = false;

    if (!isReplacement) {
      // First attachment: auto-set to "Pending Review"
      newReviewStatus = "pending";
    } else if (previousStatus === "complete" || previousStatus === "rejected") {
      // Auto-reset to "Pending Review" if replacing a complete or rejected document
      newReviewStatus = "pending";
      statusAutoReset = true;
    }

    // Update checklist item
    setChecklistItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              attachedDocument: {
                id: inboxDoc.id,
                filename: inboxDoc.filename,
                version: newVersion,
                updatedAt: new Date(),
                previousVersion: isReplacement ? previousVersion : undefined,
              },
              reviewStatus: newReviewStatus,
              suggestedDocument: undefined,
              updatedAt: "Just now",
            }
          : i
      )
    );

    // Mark inbox document as attached
    setInboxDocuments((prev) =>
      prev.map((doc) =>
        doc.id === inboxDoc.id
          ? { ...doc, isAttached: true, attachedToItemId: item.id }
          : doc
      )
    );

    // Log activity
    if (isReplacement) {
      addActivityEntry({
        actor: currentUserRole,
        category: "docs",
        type: "DOC_REPLACED",
        message: `${currentUserRole} replaced document on "${item.name}" (v${previousVersion} → v${newVersion})`,
        meta: {
          docName: inboxDoc.filename,
          checklistItem: item.name,
          previousVersion,
          newVersion,
        },
      });
    } else {
      addActivityEntry({
        actor: currentUserRole,
        category: "docs",
        type: "DOC_ATTACHED",
        message: `${currentUserRole} attached "${inboxDoc.filename}" to "${item.name}" (v${newVersion})`,
        meta: {
          docName: inboxDoc.filename,
          checklistItem: item.name,
          version: newVersion,
        },
      });
    }

    // Log status auto-reset if applicable
    if (statusAutoReset) {
      addActivityEntry({
        actor: "System",
        category: "docs",
        type: "STATUS_AUTO_RESET",
        message: `Status auto-reset to Pending Review due to new upload on "${item.name}"`,
        meta: {
          checklistItem: item.name,
          previousStatus,
          newStatus: "pending",
        },
      });
    }

    toast.success(
      isReplacement
        ? `Replaced document on "${item.name}" (v${newVersion})`
        : `Attached "${inboxDoc.filename}" to "${item.name}" (v${newVersion})`
    );
  };

  const handleAttachDocument = () => {
    if (!selectedDocumentForAttach) {
      toast.error("Please select a document to attach");
      return;
    }

    if (!attachTargetItem) {
      toast.error("Please select a checklist item");
      return;
    }

    const inboxDoc = inboxDocuments.find((doc) => doc.id === selectedDocumentForAttach);
    if (!inboxDoc) return;

    // Calculate version: if already has attachment, increment; otherwise start at 1
    const isReplacement = !!attachTargetItem.attachedDocument;
    const previousVersion = attachTargetItem.attachedDocument?.version;
    const newVersion = isReplacement ? attachTargetItem.attachedDocument!.version + 1 : 1;
    const previousStatus = attachTargetItem.reviewStatus;

    // Determine new review status based on workflow rules
    let newReviewStatus = attachTargetItem.reviewStatus;
    let statusAutoReset = false;

    if (!isReplacement) {
      // First attachment: auto-set to "Pending Review"
      newReviewStatus = "pending";
    } else if (previousStatus === "complete" || previousStatus === "rejected") {
      // Auto-reset to "Pending Review" if replacing a complete or rejected document
      newReviewStatus = "pending";
      statusAutoReset = true;
    }

    // Update checklist item
    setChecklistItems((prev) =>
      prev.map((i) =>
        i.id === attachTargetItem.id
          ? {
              ...i,
              attachedDocument: {
                id: inboxDoc.id,
                filename: inboxDoc.filename,
                version: newVersion,
                updatedAt: new Date(),
                previousVersion: isReplacement ? previousVersion : undefined,
              },
              reviewStatus: newReviewStatus,
              suggestedDocument: undefined,
              updatedAt: "Just now",
            }
          : i
      )
    );

    // Mark inbox document as attached
    setInboxDocuments((prev) =>
      prev.map((doc) =>
        doc.id === inboxDoc.id
          ? { ...doc, isAttached: true, attachedToItemId: attachTargetItem.id }
          : doc
      )
    );

    // Log activity
    if (isReplacement) {
      addActivityEntry({
        actor: currentUserRole,
        category: "docs",
        type: "DOC_REPLACED",
        message: `${currentUserRole} replaced document on "${attachTargetItem.name}" (v${previousVersion} → v${newVersion})`,
        meta: {
          docName: inboxDoc.filename,
          checklistItem: attachTargetItem.name,
          previousVersion,
          newVersion,
        },
      });
    } else {
      addActivityEntry({
        actor: currentUserRole,
        category: "docs",
        type: "DOC_ATTACHED",
        message: `${currentUserRole} attached "${inboxDoc.filename}" to "${attachTargetItem.name}" (v${newVersion})`,
        meta: {
          docName: inboxDoc.filename,
          checklistItem: attachTargetItem.name,
          version: newVersion,
        },
      });
    }

    // Log status auto-reset if applicable
    if (statusAutoReset) {
      addActivityEntry({
        actor: "System",
        category: "docs",
        type: "STATUS_AUTO_RESET",
        message: `Status auto-reset to Pending Review due to new upload on "${attachTargetItem.name}"`,
        meta: {
          checklistItem: attachTargetItem.name,
          previousStatus,
          newStatus: "pending",
        },
      });
    }

    toast.success(
      isReplacement
        ? `Replaced document on "${attachTargetItem.name}" (v${newVersion})`
        : `Attached "${inboxDoc.filename}" to "${attachTargetItem.name}" (v${newVersion})`
    );
    setIsAttachDrawerOpen(false);
    setAttachTargetItem(null);
    setSelectedDocumentForAttach(null);
  };

  const handleOpenComments = (item: ChecklistItem) => {
    // Mark comments as read for the current user role
    setChecklistItems((prev) =>
      prev.map((checklistItem) => {
        if (checklistItem.id === item.id) {
          return {
            ...checklistItem,
            comments: checklistItem.comments.map((comment) => ({
              ...comment,
              unread: {
                ...comment.unread,
                [currentUserRole]: false,
              },
            })),
          };
        }
        return checklistItem;
      })
    );

    // Update the item being passed to the drawer
    const updatedItem = {
      ...item,
      comments: item.comments.map((comment) => ({
        ...comment,
        unread: {
          ...comment.unread,
          [currentUserRole]: false,
        },
      })),
    };

    setCommentsTargetItem(updatedItem);
    setIsCommentsDrawerOpen(true);
    setNewCommentText("");
    setCommentVisibility("Shared");
    setNotifyAgentOnComment(true);
  };

  const handlePostComment = () => {
    if (!commentsTargetItem || !newCommentText.trim()) {
      toast.error("Please enter a comment");
      return;
    }

    const newComment: Comment = {
      id: `comment-${commentsTargetItem.id}-${Date.now()}`,
      authorRole: currentUserRole,
      authorName: currentUserName,
      createdAt: new Date(),
      message: newCommentText.trim(),
      visibility: currentUserRole === "Agent" ? "Shared" : commentVisibility,
      type: "Comment",
      unread: {
        // Mark as unread for the opposite role if shared
        Admin: currentUserRole === "Agent",
        Agent: currentUserRole === "Admin" && commentVisibility === "Shared",
      },
    };

    // Update checklist items with new comment
    setChecklistItems((prev) =>
      prev.map((item) =>
        item.id === commentsTargetItem.id
          ? { ...item, comments: [...item.comments, newComment] }
          : item
      )
    );

    // Update the commentsTargetItem state so the drawer reflects the new comment
    setCommentsTargetItem({
      ...commentsTargetItem,
      comments: [...commentsTargetItem.comments, newComment],
    });

    // Log activity
    addActivityEntry({
      actor: currentUserRole,
      category: "docs",
      type: "COMMENT_ADDED",
      message: `${currentUserRole} added a ${commentVisibility.toLowerCase()} comment on "${commentsTargetItem.name}"`,
      meta: {
        checklistItem: commentsTargetItem.name,
        visibility: commentVisibility,
      },
    });

    // Handle agent notification for Admin shared comments
    if (currentUserRole === "Admin" && commentVisibility === "Shared" && notifyAgentOnComment) {
      addActivityEntry({
        actor: "Admin",
        category: "docs",
        type: "AGENT_NOTIFIED",
        message: `Notification sent to Agent: ${assignedAgentName} — New comment on ${commentsTargetItem.name}`,
        meta: {
          agentName: assignedAgentName,
          checklistItem: commentsTargetItem.name,
          notificationType: "comment",
        },
      });
      toast.success("Agent notified (demo)");
    }

    setNewCommentText("");
    toast.success("Comment posted");
  };

  // Helper to check if item has unread comments for current role
  const hasUnreadComments = (item: ChecklistItem): boolean => {
    return item.comments.some((comment) => {
      // Check if comment is visible to current role
      const isVisible =
        currentUserRole === "Admin" ||
        (currentUserRole === "Agent" && comment.visibility === "Shared");
      
      // Check if unread for current role
      return isVisible && comment.unread?.[currentUserRole] === true;
    });
  };

  // Compute needsAttention based on rules
  const needsAttention = (() => {
    const now = new Date();
    const closingDateObj = closingDate ? new Date(closingDate) : null;
    const daysUntilClosing = closingDateObj 
      ? Math.ceil((closingDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Rule 1: Any REQUIRED checklist item is Rejected
    const hasRejectedRequired = checklistItems.some(
      (item) => item.requirement === "required" && item.reviewStatus === "rejected"
    );

    // Rule 2: Any REQUIRED item is Pending Review AND has been pending > 48 hours
    const hasStalePendingRequired = checklistItems.some((item) => {
      if (item.requirement !== "required" || item.reviewStatus !== "pending") {
        return false;
      }
      
      // Check if item has been pending > 48 hours
      if (item.attachedDocument?.updatedAt) {
        const hoursSinceUpdate = (now.getTime() - item.attachedDocument.updatedAt.getTime()) / (1000 * 60 * 60);
        return hoursSinceUpdate > 48;
      }
      
      return false;
    });

    // Rule 3: Closing date within 7 days AND any REQUIRED items not Complete/Waived
    const hasIncompleteNearClosing = 
      daysUntilClosing !== null && 
      daysUntilClosing <= 7 && 
      daysUntilClosing >= 0 &&
      checklistItems.some(
        (item) => 
          item.requirement === "required" && 
          item.reviewStatus !== "complete" && 
          item.reviewStatus !== "waived"
      );

    return hasRejectedRequired || hasStalePendingRequired || hasIncompleteNearClosing;
  })();

  // Transaction field change handlers
  const handleStatusChange = (newStatus: typeof transactionStatus) => {
    // Validate if trying to close
    if (newStatus === "Closed") {
      const validation = canCloseTransaction();
      if (!validation.allowed) {
        toast.error("Cannot close: required documents need attention");
        return;
      }
    }

    const oldStatus = transactionStatus;
    setTransactionStatus(newStatus);
    
    addActivityEntry({
      actor: currentUserRole,
      category: "transaction",
      type: "STATUS_CHANGE",
      message: `Transaction status changed: ${oldStatus} → ${newStatus}`,
      meta: {
        from: oldStatus,
        to: newStatus,
      },
    });
    
    toast.success(`Status updated to ${newStatus}`);
  };

  const handleAssignedAdminChange = (newAdmin: string) => {
    const oldAdmin = assignedAdmin;
    setAssignedAdmin(newAdmin);
    
    addActivityEntry({
      actor: currentUserRole,
      category: "transaction",
      type: "ADMIN_ASSIGNED",
      message: `Assigned Admin changed: ${oldAdmin} → ${newAdmin}`,
      meta: {
        from: oldAdmin,
        to: newAdmin,
      },
    });
    
    toast.success(`Admin assigned: ${newAdmin}`);
  };

  const handleClosingDateChange = (newDate: string) => {
    setClosingDate(newDate);
    
    addActivityEntry({
      actor: currentUserRole,
      category: "transaction",
      type: "DATE_UPDATED",
      message: `Closing date updated: ${newDate}`,
      meta: {
        date: newDate,
        field: "closing",
      },
    });
    
    toast.success("Closing date updated");
  };

  const handleContractDateChange = (newDate: string) => {
    setContractDate(newDate);
    
    addActivityEntry({
      actor: currentUserRole,
      category: "transaction",
      type: "DATE_UPDATED",
      message: `Contract date updated: ${newDate}`,
      meta: {
        date: newDate,
        field: "contract",
      },
    });
    
    toast.success("Contract date updated");
  };

  // Archive handlers
  const handleOpenArchiveModal = () => {
    // Validate before opening modal
    const validation = canArchiveTransaction();
    if (!validation.allowed) {
      toast.error("Cannot archive: " + validation.issues[0]);
      return;
    }

    setIsArchiveModalOpen(true);
  };

  const handleArchiveTransaction = () => {
    const now = new Date();
    
    // Calculate document summary
    const requiredItems = checklistItems.filter(item => item.requirement === "required");
    const optionalItems = checklistItems.filter(item => item.requirement === "optional");
    
    const documentSummary = {
      requiredComplete: requiredItems.filter(item => item.reviewStatus === "complete").length,
      requiredWaived: requiredItems.filter(item => item.reviewStatus === "waived").length,
      optionalComplete: optionalItems.filter(item => item.reviewStatus === "complete").length,
      totalDocuments: checklistItems.length,
    };
    
    // Create archive receipt
    const archiveReceipt = {
      transactionSummary: {
        identifier: mockTransaction?.identifier || "Unknown",
        id: id || "Unknown",
        office: mockTransaction?.office || "Unknown Office",
        assignedAgent: mockTransaction?.assignedAgent || assignedAgentName,
        status: "Closed",
      },
      documentSummary,
      activityLogCount: activityLog.length,
    };
    
    // Snapshot activity log
    const archivedActivityLog = [...activityLog];
    
    // Create closeout package activity entry
    addActivityEntry({
      actor: currentUserRole,
      category: "transaction",
      type: "CLOSEOUT_CREATED",
      message: "Closeout package created",
      meta: {
        packageType: "full",
      },
    });

    // Archive transaction with full metadata
    setTransactionStatus("Archived");
    setArchiveMetadata({
      archivedAt: now,
      archivedBy: { name: currentUserName, role: currentUserRole },
      archiveReceipt,
      archivedActivityLog,
    });

    addActivityEntry({
      actor: currentUserRole,
      category: "transaction",
      type: "TRANSACTION_ARCHIVED",
      message: "Transaction archived",
      meta: {
        archivedBy: currentUserName,
      },
    });

    setIsArchiveModalOpen(false);
    toast.success("Archived. Receipt saved.");
    
    // Navigate back to transactions list with archived filter
    setTimeout(() => {
      navigate("/transactions?filter=archived");
    }, 500);
  };

  const handleDownloadArchivePackage = () => {
    // Generate archive package as JSON
    const archivePackage = {
      transaction: {
        id: id || "Unknown",
        identifier: mockTransaction?.identifier || "Unknown",
        type: mockTransaction?.type || "Unknown",
        status: transactionStatus,
        office: mockTransaction?.office || "Unknown Office",
        assignedAgent: assignedAgentName,
        closingDate,
        contractDate,
        assignedAdmin,
      },
      archivedMetadata: archiveMetadata,
      checklistItems: checklistItems.map(item => ({
        id: item.id,
        name: item.name,
        requirement: item.requirement,
        reviewStatus: item.reviewStatus,
        attachedDocument: item.attachedDocument,
        version: item.version,
      })),
      activityLog: archiveMetadata.archivedActivityLog.length > 0 
        ? archiveMetadata.archivedActivityLog 
        : activityLog,
      archivedAt: new Date().toISOString(),
    };

    // Create and download blob
    const blob = new Blob([JSON.stringify(archivePackage, null, 2)], { 
      type: "application/json" 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `archive-${id || "transaction"}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Archive package downloaded");
  };

  // Check if transaction is read-only (archived)
  const isReadOnly = transactionStatus === "Archived";

  // Workflow integrity validation
  const canCloseTransaction = () => {
    const requiredItems = checklistItems.filter((item) => item.requirement === "required");
    
    const issues: string[] = [];
    
    // Check for missing attachments on required items (suggested doesn't count as attached)
    const missingAttachments = requiredItems.filter(
      (item) => !item.attachedDocument
    );
    if (missingAttachments.length > 0) {
      issues.push(`${missingAttachments.length} required document${missingAttachments.length > 1 ? 's' : ''} need${missingAttachments.length === 1 ? 's' : ''} attachment`);
    }
    
    // Check for rejected required items
    const rejectedItems = requiredItems.filter((item) => item.reviewStatus === "rejected");
    if (rejectedItems.length > 0) {
      issues.push(`${rejectedItems.length} required document${rejectedItems.length > 1 ? 's are' : ' is'} rejected`);
    }
    
    // Check for pending review on required items
    const pendingItems = requiredItems.filter(
      (item) => item.attachedDocument && item.reviewStatus === "pending"
    );
    if (pendingItems.length > 0) {
      issues.push(`${pendingItems.length} required document${pendingItems.length > 1 ? 's are' : ' is'} pending review`);
    }
    
    return {
      allowed: issues.length === 0,
      issues,
    };
  };

  const canArchiveTransaction = () => {
    // Must be closed first
    if (transactionStatus !== "Closed") {
      return {
        allowed: false,
        issues: ["Transaction must be Closed before archiving"],
      };
    }
    
    // Must also pass all close validation checks
    const closeCheck = canCloseTransaction();
    if (!closeCheck.allowed) {
      return {
        allowed: false,
        issues: ["All required documents must be complete", ...closeCheck.issues],
      };
    }
    
    return {
      allowed: true,
      issues: [],
    };
  };

  const closeValidation = canCloseTransaction();
  const archiveValidation = canArchiveTransaction();

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} ${diffMins === 1 ? "minute" : "minutes"} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
    } else {
      return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
    }
  };

  const formatLaunchTimestamp = (date: Date | null) => {
    if (!date) return "Never Launched";

    return date.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatActivityTimestamp = (date: Date) => {
    return date.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "pre-contract":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "active":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "pending":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "closed":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const getReviewStatusBadge = (reviewStatus: string) => {
    switch (reviewStatus) {
      case "complete":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border">
            Complete
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 border">
            Rejected
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 border">
            Pending Review
          </Badge>
        );
      case "waived":
        return (
          <Badge className="bg-slate-50 text-slate-700 border-slate-300 border">
            Waived / Not Required
          </Badge>
        );
      default:
        return null;
    }
  };

  const getRequirementBadge = (requirement: string) => {
    return requirement === "required" ? (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
        Required
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs">
        Optional
      </Badge>
    );
  };

  const getChecklistIcon = (reviewStatus: string) => {
    switch (reviewStatus) {
      case "complete":
        return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
      case "rejected":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "waived":
        return <XCircle className="h-5 w-5 text-slate-400" />;
      case "pending":
      default:
        return <Clock className="h-5 w-5 text-amber-600" />;
    }
  };

  const getActivityIcon = (category: string) => {
    switch (category) {
      case "docs":
        return <FileText className="h-4 w-4" />;
      case "forms":
        return <ExternalLink className="h-4 w-4" />;
      case "system":
        return <ActivityIcon className="h-4 w-4" />;
      default:
        return <ActivityIcon className="h-4 w-4" />;
    }
  };

  const getActivityColor = (category: string) => {
    switch (category) {
      case "docs":
        return "bg-blue-100 text-blue-700";
      case "forms":
        return "bg-purple-100 text-purple-700";
      case "transaction":
        return "bg-emerald-100 text-emerald-700";
      case "system":
        return "bg-slate-100 text-slate-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const filteredActivities =
    activityFilter === "all"
      ? activityLog
      : activityLog.filter((a) => a.category === activityFilter);

  const completedCount = checklistItems.filter(
    (item) => item.reviewStatus === "complete"
  ).length;
  const totalCount = checklistItems.length;

  // Calculate risk counts: only required items, exclude waived
  const missingDocumentsCount = checklistItems.filter(
    (item) => item.requirement === "required" && item.reviewStatus === "pending"
  ).length;

  const rejectedDocumentsCount = checklistItems.filter(
    (item) => item.requirement === "required" && item.reviewStatus === "rejected"
  ).length;

  const hasActionRequired = missingDocumentsCount > 0 || rejectedDocumentsCount > 0;

  // Inbox calculations
  const unattachedDocuments = inboxDocuments.filter((doc) => !doc.isAttached);
  const unattachedCount = unattachedDocuments.length;
  const previewInboxDocs = unattachedDocuments.slice(0, 3);

  // Filtered inbox for drawer
  const getFilteredInboxDocuments = () => {
    let filtered = inboxDocuments;

    // Apply filter
    if (inboxFilter === "unattached") {
      filtered = filtered.filter((doc) => !doc.isAttached);
    } else if (inboxFilter === "recent") {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((doc) => doc.receivedAt >= twoDaysAgo);
    }

    // Apply search
    if (inboxSearchQuery.trim()) {
      filtered = filtered.filter((doc) =>
        doc.filename.toLowerCase().includes(inboxSearchQuery.toLowerCase())
      );
    }

    return filtered;
  };

  const filteredInboxDocuments = getFilteredInboxDocuments();

  // If transaction not found, show error state
  if (!mockTransaction) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-6 min-h-screen">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mb-4">
            <XCircle className="h-16 w-16 text-slate-400 mx-auto" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">
            Transaction Not Found
          </h2>
          <p className="text-slate-600 mb-6">
            The transaction with ID <span className="font-mono font-medium">{id}</span> could not be found in the system.
          </p>
          <Button onClick={() => navigate("/transactions")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Transactions
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Back Button */}
        <Button
          variant="outline"
          onClick={() => navigate("/transactions")}
          className="mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Transactions
        </Button>

        {/* Page Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-semibold text-slate-900">
                {mockTransaction.identifier}
              </h1>
              <Badge
                className={`${getStatusColor(mockTransaction.status)} border`}
              >
                {mockTransaction.status}
              </Badge>
              {needsAttention && (
                <Badge className="bg-red-600 text-white border-0">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Needs Attention
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                <span>{mockTransaction.type}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                <span>{mockTransaction.assignedAgent}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                <span>{mockTransaction.office}</span>
              </div>
            </div>
          </div>
          <Button onClick={handleLaunchZipForms} disabled={isReadOnly}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Launch ZipForms
          </Button>
        </div>

        {/* Needs Attention Banner */}
        {needsAttention && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-1">Action Required</h3>
                  <p className="text-sm text-red-700">
                    This transaction requires attention. Check for rejected documents, stale pending items, or incomplete requirements near closing.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transaction Operational Controls */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Transaction Controls</CardTitle>
              {currentUserRole === "Admin" && !isReadOnly && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleOpenArchiveModal}
                          disabled={!archiveValidation.allowed}
                          className="text-slate-700 border-slate-300"
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Archive Transaction
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!archiveValidation.allowed && (
                      <TooltipContent>
                        <div className="text-sm max-w-xs">
                          <p className="font-medium mb-1">Cannot archive:</p>
                          <ul className="space-y-0.5">
                            {archiveValidation.issues.map((issue, idx) => (
                              <li key={idx}>• {issue}</li>
                            ))}
                          </ul>
                        </div>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Ready to Close Indicator */}
              {!isReadOnly && transactionStatus !== "Closed" && transactionStatus !== "Archived" && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50">
                  {closeValidation.allowed ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-900">Ready to Close</p>
                        <p className="text-xs text-green-700 mt-0.5">All required documents are complete</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-slate-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">Not Ready to Close</p>
                        <ul className="text-xs text-slate-600 mt-1 space-y-0.5">
                          {closeValidation.issues.map((issue, idx) => (
                            <li key={idx}>• {issue}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Status Dropdown */}
                <div>
                  <Label htmlFor="transaction-status" className="text-sm font-medium text-slate-700 mb-1.5 block">
                    Status
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Select value={transactionStatus} onValueChange={handleStatusChange} disabled={isReadOnly}>
                            <SelectTrigger id="transaction-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pre-Contract">Pre-Contract</SelectItem>
                              <SelectItem value="Under Contract">Under Contract</SelectItem>
                              <SelectItem value="Closed" disabled={!closeValidation.allowed}>
                                Closed {!closeValidation.allowed && "🔒"}
                              </SelectItem>
                              <SelectItem value="Archived" disabled>Archived (use Archive button)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TooltipTrigger>
                      {!closeValidation.allowed && transactionStatus !== "Closed" && (
                        <TooltipContent side="right">
                          <p className="text-sm">Resolve required document issues before closing</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Assigned Admin Dropdown */}
                <div>
                <Label htmlFor="assigned-admin" className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Assigned Admin
                </Label>
                <Select value={assignedAdmin} onValueChange={handleAssignedAdminChange} disabled={isReadOnly}>
                  <SelectTrigger id="assigned-admin">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Karen Admin">Karen Admin</SelectItem>
                    <SelectItem value="Tina Review">Tina Review</SelectItem>
                    <SelectItem value="Jordan Ops">Jordan Ops</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Closing Date */}
              <div>
                <Label htmlFor="closing-date" className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Closing Date
                </Label>
                <Input
                  id="closing-date"
                  type="date"
                  value={closingDate}
                  onChange={(e) => handleClosingDateChange(e.target.value)}
                  disabled={isReadOnly}
                />
              </div>

              {/* Contract Date */}
              <div>
                <Label htmlFor="contract-date" className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Contract Date
                </Label>
                <Input
                  id="contract-date"
                  type="date"
                  value={contractDate}
                  onChange={(e) => handleContractDateChange(e.target.value)}
                  disabled={isReadOnly}
                />
              </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Archive Receipt Section (visible when archived) */}
        {isReadOnly && archiveMetadata.archivedAt && archiveMetadata.archiveReceipt && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Archive className="h-5 w-5 text-blue-700" />
                Archive Receipt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Archive Metadata */}
                <div className="text-sm text-slate-700">
                  <p className="mb-1">
                    <span className="font-medium">Archived on:</span>{" "}
                    {archiveMetadata.archivedAt.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p>
                    <span className="font-medium">By:</span>{" "}
                    {archiveMetadata.archivedBy?.name} ({archiveMetadata.archivedBy?.role})
                  </p>
                </div>

                {/* Transaction Summary */}
                <div className="bg-white border border-blue-200 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">Transaction Summary</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-slate-600">Transaction:</span>
                      <p className="text-slate-900 text-xs">{archiveMetadata.archiveReceipt.transactionSummary.identifier}</p>
                    </div>
                    <div>
                      <span className="text-slate-600">ID:</span>
                      <p className="text-slate-900 text-xs">{archiveMetadata.archiveReceipt.transactionSummary.id}</p>
                    </div>
                    <div>
                      <span className="text-slate-600">Office:</span>
                      <p className="text-slate-900 text-xs">{archiveMetadata.archiveReceipt.transactionSummary.office}</p>
                    </div>
                    <div>
                      <span className="text-slate-600">Agent:</span>
                      <p className="text-slate-900 text-xs">{archiveMetadata.archiveReceipt.transactionSummary.assignedAgent}</p>
                    </div>
                  </div>
                </div>

                {/* Document Summary */}
                <div className="bg-white border border-blue-200 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">Document Summary</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Required (Complete):</span>
                      <span className="text-slate-900 font-medium">{archiveMetadata.archiveReceipt.documentSummary.requiredComplete}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Required (Waived):</span>
                      <span className="text-slate-900 font-medium">{archiveMetadata.archiveReceipt.documentSummary.requiredWaived}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Optional (Complete):</span>
                      <span className="text-slate-900 font-medium">{archiveMetadata.archiveReceipt.documentSummary.optionalComplete}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total:</span>
                      <span className="text-slate-900 font-medium">{archiveMetadata.archiveReceipt.documentSummary.totalDocuments}</span>
                    </div>
                    <div className="col-span-2 flex justify-between pt-2 border-t border-blue-200">
                      <span className="text-slate-600">Activity Log Entries:</span>
                      <span className="text-slate-900 font-medium">{archiveMetadata.archiveReceipt.activityLogCount}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={handleDownloadArchivePackage}>
                    <Download className="h-4 w-4 mr-2" />
                    Download Archive Package
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      // Open activity log showing archived snapshot
                      toast.info("Viewing archived activity log with " + archiveMetadata.archivedActivityLog.length + " entries");
                    }}
                  >
                    <ActivityIcon className="h-4 w-4 mr-2" />
                    View Archived Activity Log
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Demo Actions - Collapsible */}
        <Collapsible open={isDemoOpen} onOpenChange={setIsDemoOpen}>
          <Card className="border-dashed border-2 border-slate-300 bg-slate-50">
            <CardHeader className="pb-3">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full text-left hover:opacity-70 transition-opacity">
                  <CardTitle className="text-sm font-medium text-slate-700">
                    Demo Actions (Testing Only)
                  </CardTitle>
                  {isDemoOpen ? (
                    <ChevronUp className="h-4 w-4 text-slate-600" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-600" />
                  )}
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div>
                  <p className="text-xs text-slate-600 mb-2">General Actions:</p>
                  <div className="flex gap-3 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSimulateDocReceived}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Simulate Doc Received
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSimulateDocDeleted}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Simulate Doc Deleted
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-2">
                    Simulate Agent Upload (sets to Pending Review):
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {checklistItems.map((item) => (
                      <Button
                        key={item.id}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSimulateAgentUpload(item.id)}
                        className="text-xs"
                      >
                        {item.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Risk Summary Card */}
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Risk Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {missingDocumentsCount}
                  </div>
                  <div className="text-sm text-slate-600">Missing Documents</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {rejectedDocumentsCount}
                  </div>
                  <div className="text-sm text-slate-600">Rejected Documents</div>
                </div>
              </div>
            </div>
            {hasActionRequired && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  <strong>Action Required:</strong> This transaction has
                  outstanding compliance issues that need attention.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Demo Controls (Development Only) */}
        <Card className="border border-slate-300 bg-slate-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">
              Demo Controls (Development Only) – Role Simulation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Label htmlFor="currentRole" className="text-sm text-slate-700 whitespace-nowrap">
                Current Role:
              </Label>
              <Select
                value={currentUserRole}
                onValueChange={(value: "Admin" | "Agent") => setCurrentUserRole(value)}
              >
                <SelectTrigger id="currentRole" className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Agent">Agent</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-slate-500">
                ({currentUserRole === "Admin" ? "Can review and manage documents" : "Can view documents and notes"})
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Generated Intake Email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5" />
              Generated Intake Email
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 font-mono text-sm text-blue-600 bg-blue-50 px-4 py-3 rounded-lg border border-blue-200">
                  {mockTransaction.intakeEmail}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyEmail}
                  className="flex-shrink-0"
                >
                  {copySuccess ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-sm text-slate-600">
                Send documents to this email address to automatically attach them
                to this transaction. All emails sent to this address will be parsed
                and filed accordingly.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Document Inbox */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Inbox className="h-5 w-5" />
                  Document Inbox
                </CardTitle>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  Unattached: {unattachedCount}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenAttachDrawer()}
                >
                  <Inbox className="h-4 w-4 mr-2" />
                  View Inbox
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenAttachDrawer()}
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  Attach from Inbox
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {previewInboxDocs.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Inbox className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>No unattached documents in inbox</p>
              </div>
            ) : (
              <div className="space-y-3">
                {previewInboxDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900 text-sm">
                          {doc.filename}
                        </div>
                        <div className="text-xs text-slate-600">
                          {formatRelativeTime(doc.receivedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs">
                        Unattached
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAttachDrawer()}
                      >
                        <Paperclip className="h-3 w-3 mr-1.5" />
                        Attach
                      </Button>
                    </div>
                  </div>
                ))}
                {unattachedCount > 3 && (
                  <button
                    onClick={() => handleOpenAttachDrawer()}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View all inbox documents ({unattachedCount})
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents - Enhanced with Attachment States */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Documents
              </CardTitle>
              <div className="text-sm text-slate-600">
                {completedCount} of {totalCount} complete
              </div>
            </div>
            <div className="mt-3 w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-emerald-600 h-2 rounded-full transition-all"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {checklistItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {getChecklistIcon(item.reviewStatus)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900">
                          {item.name}
                        </span>
                        {getRequirementBadge(item.requirement)}
                        {item.version > 1 && (
                          <span className="text-xs text-slate-500 font-mono">
                            v{item.version}
                          </span>
                        )}
                        {item.suggestedDocument && (
                          <Badge className="bg-blue-50 text-blue-700 border-blue-200 border text-xs">
                            Suggested {item.suggestedDocument.confidence === "high" ? "(High confidence)" : "(Low confidence)"}
                          </Badge>
                        )}
                        {!item.attachedDocument && !item.suggestedDocument && (
                          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-300 text-xs">
                            Needs attachment
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-slate-600">{item.updatedAt}</div>
                      {item.attachedDocument && (
                        <div className="mt-2 space-y-1">
                          <div className="p-2 bg-slate-100 rounded border border-slate-200">
                            <div className="flex items-center gap-1.5 text-xs text-slate-700">
                              <Paperclip className="h-3 w-3 flex-shrink-0" />
                              <span className="font-medium">Attached:</span>
                              <span className="text-slate-900 font-medium">{item.attachedDocument.filename}</span>
                              <span className="text-slate-400">•</span>
                              <span>Version: {item.attachedDocument.version}</span>
                              <span className="text-slate-400">•</span>
                              <span>Last updated: {formatRelativeTime(item.attachedDocument.updatedAt)}</span>
                            </div>
                          </div>
                          {item.attachedDocument.previousVersion && 
                           item.attachedDocument.version > 1 &&
                           (new Date().getTime() - item.attachedDocument.updatedAt.getTime()) < 24 * 60 * 60 * 1000 && (
                            <div className="flex items-center gap-1.5 text-xs text-blue-600 pl-2">
                              <AlertCircle className="h-3 w-3 flex-shrink-0" />
                              <span>Replaced v{item.attachedDocument.previousVersion}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {item.suggestedDocument && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-600">
                          <Link className="h-3 w-3" />
                          <span>Suggested: {item.suggestedDocument.filename}</span>
                        </div>
                      )}
                      {(() => {
                        // Find most recent rejected/waived status change comment
                        const statusChangeComments = item.comments
                          .filter((c) => c.type === "StatusChange" && (c.message.startsWith("Rejected:") || c.message.startsWith("Waived:")))
                          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                        const latestStatusComment = statusChangeComments[0];
                        
                        return latestStatusComment && (item.reviewStatus === "rejected" || item.reviewStatus === "waived") ? (
                          <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-600 bg-slate-100 px-2 py-1.5 rounded border border-slate-200">
                            <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-1 flex-1">
                              {latestStatusComment.message}
                            </span>
                            <button
                              onClick={() => handleOpenComments(item)}
                              className="text-blue-600 hover:text-blue-700 hover:underline font-medium whitespace-nowrap ml-2"
                            >
                              View thread
                            </button>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getReviewStatusBadge(item.reviewStatus)}
                    {item.suggestedDocument && !isReadOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAttachSuggested(item)}
                      >
                        <Paperclip className="h-4 w-4 mr-2" />
                        Attach
                      </Button>
                    )}
                    {!item.attachedDocument && !item.suggestedDocument && !isReadOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAttachDrawer(item)}
                      >
                        <Paperclip className="h-4 w-4 mr-2" />
                        Attach
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenComments(item)}
                      className="relative"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Comments
                      {hasUnreadComments(item) && (
                        <span className="absolute top-1 right-1 h-2 w-2 bg-blue-600 rounded-full" />
                      )}
                      {item.comments.length > 0 && (
                        <Badge className="ml-2 bg-blue-600 text-white border-0 h-5 min-w-[20px] px-1.5">
                          {item.comments.length}
                        </Badge>
                      )}
                    </Button>
                    {currentUserRole === "Admin" && !isReadOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenReviewModal(item)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Review
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Activity Log */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ActivityIcon className="h-5 w-5" />
                Activity
              </CardTitle>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <div className="flex gap-2">
                  <button
                    onClick={() => setActivityFilter("all")}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      activityFilter === "all"
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setActivityFilter("docs")}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      activityFilter === "docs"
                        ? "bg-blue-600 text-white"
                        : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                    }`}
                  >
                    Docs
                  </button>
                  <button
                    onClick={() => setActivityFilter("forms")}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      activityFilter === "forms"
                        ? "bg-purple-600 text-white"
                        : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                    }`}
                  >
                    Forms
                  </button>
                  <button
                    onClick={() => setActivityFilter("system")}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      activityFilter === "system"
                        ? "bg-slate-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    System
                  </button>
                  <button
                    onClick={() => setActivityFilter("transaction")}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      activityFilter === "transaction"
                        ? "bg-emerald-600 text-white"
                        : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    }`}
                  >
                    Transaction
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No activity to display
                </div>
              ) : (
                filteredActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-lg ${getActivityColor(
                        activity.category
                      )} flex items-center justify-center`}
                    >
                      {getActivityIcon(activity.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {activity.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                            <span className="font-medium">{activity.actor}</span>
                            <span className="text-slate-400">•</span>
                            <span>
                              {formatActivityTimestamp(activity.timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Transaction Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Transaction Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-sm text-slate-600 mb-1">Transaction ID</div>
                <div className="font-medium text-slate-900 font-mono text-sm">
                  {mockTransaction.id}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Created Date</div>
                <div className="font-medium text-slate-900">
                  {new Date(mockTransaction.createdAt).toLocaleDateString(
                    "en-US",
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    }
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Primary Client</div>
                <div className="font-medium text-slate-900">
                  {mockTransaction.clientName}
                </div>
                <div className="text-sm text-slate-600">
                  {mockTransaction.clientEmail}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Assigned Agent</div>
                <div className="font-medium text-slate-900">
                  {mockTransaction.assignedAgent}
                </div>
                <div className="text-sm text-slate-600">
                  {mockTransaction.office}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">
                  Last ZipForms Launch
                </div>
                <div
                  className={`font-medium ${
                    lastZipFormsLaunchAt ? "text-slate-900" : "text-slate-500"
                  }`}
                >
                  {formatLaunchTimestamp(lastZipFormsLaunchAt)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Review Modal */}
      <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Document</DialogTitle>
            <DialogDescription>
              Review and update the status of "{selectedItem?.name}"
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6 py-4">
              {/* Document Name */}
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Document Name
                </Label>
                <div className="mt-1.5 text-lg font-semibold text-slate-900">
                  {selectedItem.name}
                </div>
              </div>

              {/* Requirement Toggle */}
              {currentUserRole === "Admin" && (
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">
                    Requirement Level
                  </Label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setReviewRequirement("required")}
                      className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewRequirement === "required"
                          ? "border-blue-600 bg-blue-50 text-blue-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold">Required</div>
                      <div className="text-xs mt-1 opacity-70">
                        Must be provided
                      </div>
                    </button>
                    <button
                      onClick={() => setReviewRequirement("optional")}
                      className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewRequirement === "optional"
                          ? "border-slate-600 bg-slate-50 text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-semibold">Optional</div>
                      <div className="text-xs mt-1 opacity-70">
                        Nice to have
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Review Status */}
              {currentUserRole === "Admin" && (
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">
                    Review Status
                  </Label>
                  {!selectedItem.attachedDocument && (
                    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-800">
                        <strong>No attachment:</strong> This item cannot be marked as "Pending Review" or "Complete" without an attached document. Please attach a document first or mark as "Waived".
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        if (!selectedItem.attachedDocument) {
                          toast.error("Cannot set to Pending Review without an attachment");
                          return;
                        }
                        setReviewStatus("pending");
                        setNotifyAgent(false);
                      }}
                      disabled={!selectedItem.attachedDocument}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewStatus === "pending"
                          ? "border-amber-600 bg-amber-50 text-amber-900"
                          : !selectedItem.attachedDocument
                          ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Pending Review
                    </button>
                    <button
                      onClick={() => {
                        if (!selectedItem.attachedDocument) {
                          toast.error("Cannot mark as Complete without an attachment");
                          return;
                        }
                        setReviewStatus("complete");
                        setNotifyAgent(false);
                      }}
                      disabled={!selectedItem.attachedDocument}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewStatus === "complete"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                          : !selectedItem.attachedDocument
                          ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Complete
                    </button>
                    <button
                      onClick={() => {
                        setReviewStatus("rejected");
                        setNotifyAgent(true);
                      }}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewStatus === "rejected"
                          ? "border-red-600 bg-red-50 text-red-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Rejected
                    </button>
                    <button
                      onClick={() => {
                        setReviewStatus("waived");
                        setNotifyAgent(false);
                      }}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        reviewStatus === "waived"
                          ? "border-slate-600 bg-slate-50 text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Waived / Not Required
                    </button>
                  </div>
                </div>
              )}

              {/* Rejection Note */}
              {reviewStatus === "rejected" && currentUserRole === "Admin" && (
                <div>
                  <Label htmlFor="reviewNote" className="text-sm font-medium text-slate-700">
                    Rejection Reason <span className="text-red-600">*</span>
                  </Label>
                  <Textarea
                    id="reviewNote"
                    placeholder="Explain what needs to be fixed..."
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    className="mt-1.5 min-h-[100px]"
                  />
                  <p className="text-xs text-slate-600 mt-1.5">
                    This note will be visible to the agent and logged in activity.
                  </p>
                </div>
              )}

              {/* Waived Reason */}
              {reviewStatus === "waived" && currentUserRole === "Admin" && (
                <div>
                  <Label htmlFor="waivedReason" className="text-sm font-medium text-slate-700">
                    Waived Reason <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    id="waivedReason"
                    placeholder="e.g., Property is not in an HOA"
                    value={waivedReason}
                    onChange={(e) => setWaivedReason(e.target.value)}
                    className="mt-1.5"
                  />
                  <p className="text-xs text-slate-600 mt-1.5">
                    Briefly explain why this document is not needed.
                  </p>
                </div>
              )}

              {/* Notify Agent Checkbox */}
              {reviewStatus === "rejected" && currentUserRole === "Admin" && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <Checkbox
                    id="notifyAgent"
                    checked={notifyAgent}
                    onCheckedChange={(checked) => setNotifyAgent(checked as boolean)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="notifyAgent"
                      className="text-sm font-medium text-slate-900 cursor-pointer"
                    >
                      Notify Agent
                    </label>
                    <p className="text-xs text-slate-600 mt-1">
                      Send notification to the assigned agent about this rejection
                    </p>
                  </div>
                </div>
              )}

              {/* Previous Status Changes */}
              {(() => {
                const statusChangeComments = selectedItem.comments.filter((c) => c.type === "StatusChange");
                return statusChangeComments.length > 0 ? (
                  <div>
                    <Label className="text-sm font-medium text-slate-700 mb-2 block">
                      Previous Status Changes
                    </Label>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {statusChangeComments.map((comment) => (
                        <div
                          key={comment.id}
                          className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                        >
                          <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                            <span className="font-medium">{comment.authorName}</span>
                            <Badge className="bg-slate-600 text-white border-0 text-xs h-4 px-1.5">
                              {comment.authorRole}
                            </Badge>
                            <span className="text-slate-400">•</span>
                            <span>
                              {formatRelativeTime(comment.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-900">{comment.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsReviewModalOpen(false)}
            >
              Cancel
            </Button>
            {currentUserRole === "Admin" && (
              <Button onClick={handleSaveReview}>
                <Save className="h-4 w-4 mr-2" />
                Save Review
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Transaction Offsite Modal */}
      <Dialog open={isArchiveModalOpen} onOpenChange={setIsArchiveModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Archive transaction offsite
            </DialogTitle>
            <DialogDescription>
              Archiving removes this transaction from active storage. You should save the Archive Package for your records.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Transaction Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Transaction Summary</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-slate-600">Transaction:</span>
                  <p className="text-slate-900 font-medium">{mockTransaction?.identifier || "Unknown"}</p>
                </div>
                <div>
                  <span className="text-slate-600">Transaction ID:</span>
                  <p className="text-slate-900 font-medium">{id}</p>
                </div>
                <div>
                  <span className="text-slate-600">Office:</span>
                  <p className="text-slate-900">{mockTransaction?.office || "Unknown Office"}</p>
                </div>
                <div>
                  <span className="text-slate-600">Assigned Agent:</span>
                  <p className="text-slate-900">{assignedAgentName}</p>
                </div>
                <div>
                  <span className="text-slate-600">Status:</span>
                  <p className="text-slate-900 font-medium text-green-700">Closed</p>
                </div>
                <div>
                  <span className="text-slate-600">Closing Date:</span>
                  <p className="text-slate-900">{new Date(closingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-200">
                  <span className="text-slate-600">Archived by:</span>
                  <p className="text-slate-900">{currentUserName} ({currentUserRole})</p>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-600">Archived at:</span>
                  <p className="text-slate-900">{new Date().toLocaleString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric', 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    hour12: true 
                  })}</p>
                </div>
              </div>
            </div>

            {/* Document Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">Document Summary</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Required (Complete):</span>
                  <span className="text-slate-900 font-medium">
                    {checklistItems.filter(item => item.requirement === "required" && item.reviewStatus === "complete").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Required (Waived):</span>
                  <span className="text-slate-900 font-medium">
                    {checklistItems.filter(item => item.requirement === "required" && item.reviewStatus === "waived").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Optional (Complete):</span>
                  <span className="text-slate-900 font-medium">
                    {checklistItems.filter(item => item.requirement === "optional" && item.reviewStatus === "complete").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Documents:</span>
                  <span className="text-slate-900 font-medium">{checklistItems.length}</span>
                </div>
                <div className="col-span-2 flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-600">Activity Log Entries:</span>
                  <span className="text-slate-900 font-medium">{activityLog.length}</span>
                </div>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                <strong>Important:</strong> Once archived, this transaction becomes read-only and cannot be edited.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsArchiveModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadArchivePackage}
              className="text-slate-700"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Archive Package
            </Button>
            <Button
              onClick={handleArchiveTransaction}
              className="bg-slate-900 hover:bg-slate-800"
            >
              <Archive className="h-4 w-4 mr-2" />
              Confirm Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attach Document Drawer */}
      <Sheet open={isAttachDrawerOpen} onOpenChange={setIsAttachDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Attach a Document</SheetTitle>
            <SheetDescription>
              {attachTargetItem
                ? `Select a document to attach to "${attachTargetItem.name}"`
                : "Select a document from inbox"}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-6">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search inbox documents..."
                value={inboxSearchQuery}
                onChange={(e) => setInboxSearchQuery(e.target.value)}
                className="pl-9"
              />
              {inboxSearchQuery && (
                <button
                  onClick={() => setInboxSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <div className="flex gap-2">
                <button
                  onClick={() => setInboxFilter("all")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    inboxFilter === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setInboxFilter("unattached")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    inboxFilter === "unattached"
                      ? "bg-blue-600 text-white"
                      : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  }`}
                >
                  Unattached
                </button>
                <button
                  onClick={() => setInboxFilter("recent")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    inboxFilter === "recent"
                      ? "bg-purple-600 text-white"
                      : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                  }`}
                >
                  Recent
                </button>
              </div>
            </div>

            {/* Attach To (when launched from inbox) */}
            {!attachTargetItem && (
              <div>
                <Label htmlFor="attachTo" className="text-sm font-medium text-slate-700 mb-2 block">
                  Attach to checklist item
                </Label>
                <Select
                  value={attachTargetItem?.id || ""}
                  onValueChange={(value) => {
                    const item = checklistItems.find((i) => i.id === value);
                    setAttachTargetItem(item || null);
                  }}
                >
                  <SelectTrigger id="attachTo">
                    <SelectValue placeholder="Select a checklist item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {checklistItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Attach To Preview (when launched from checklist) */}
            {attachTargetItem && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-xs text-blue-700 font-medium mb-1">
                  Attach to:
                </div>
                <div className="font-medium text-blue-900">
                  {attachTargetItem.name}
                </div>
              </div>
            )}

            {/* Document List */}
            <div>
              <Label className="text-sm font-medium text-slate-700 mb-3 block">
                Inbox Documents ({filteredInboxDocuments.length})
              </Label>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredInboxDocuments.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Inbox className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-sm">No documents found</p>
                  </div>
                ) : (
                  filteredInboxDocuments.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDocumentForAttach(doc.id)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selectedDocumentForAttach === doc.id
                          ? "border-blue-600 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <FileText className={`h-5 w-5 flex-shrink-0 ${
                          selectedDocumentForAttach === doc.id
                            ? "text-blue-600"
                            : "text-slate-600"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-sm ${
                            selectedDocumentForAttach === doc.id
                              ? "text-blue-900"
                              : "text-slate-900"
                          }`}>
                            {doc.filename}
                          </div>
                          <div className="text-xs text-slate-600 mt-1">
                            {formatRelativeTime(doc.receivedAt)}
                          </div>
                          {doc.isAttached && (
                            <Badge className="mt-2 bg-slate-100 text-slate-600 border-slate-200 text-xs">
                              Already Attached
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setIsAttachDrawerOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAttachDocument}>
              <Paperclip className="h-4 w-4 mr-2" />
              Attach Document
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Comments Thread Drawer */}
      <Sheet open={isCommentsDrawerOpen} onOpenChange={setIsCommentsDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Document Thread — {commentsTargetItem?.name}
            </SheetTitle>
            <SheetDescription>
              Conversation between Admin and Agent about this document
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Comments List */}
            <div className="space-y-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-2">
              {commentsTargetItem && commentsTargetItem.comments.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p>No comments yet. Start the conversation!</p>
                </div>
              )}
              {commentsTargetItem?.comments
                .filter((comment) => {
                  // Filter based on role permissions
                  if (currentUserRole === "Agent") {
                    return comment.visibility === "Shared";
                  }
                  return true; // Admin sees all
                })
                .map((comment, index) => (
                  <div
                    key={comment.id}
                    className={`flex gap-3 ${
                      comment.authorRole === "Admin"
                        ? "flex-row"
                        : "flex-row-reverse"
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                        comment.authorRole === "Admin"
                          ? "bg-slate-700 text-white"
                          : "bg-blue-600 text-white"
                      }`}
                    >
                      {comment.authorName.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div
                      className={`flex-1 max-w-[80%] ${
                        comment.authorRole === "Admin"
                          ? "text-left"
                          : "text-right"
                      }`}
                    >
                      <div
                        className={`inline-block p-3 rounded-lg ${
                          comment.authorRole === "Admin"
                            ? "bg-slate-100 text-slate-900"
                            : "bg-blue-50 text-slate-900"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">
                            {comment.authorName}
                          </span>
                          <Badge
                            className={`text-xs h-5 ${
                              comment.authorRole === "Admin"
                                ? "bg-slate-600 text-white border-0"
                                : "bg-blue-600 text-white border-0"
                            }`}
                          >
                            {comment.authorRole}
                          </Badge>
                          {comment.visibility === "Internal" && (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs h-5">
                              Internal
                            </Badge>
                          )}
                          {comment.type === "StatusChange" && (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs h-5">
                              Status Change
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap">
                          {comment.message}
                        </p>
                        <div className="text-xs text-slate-500 mt-1.5">
                          {formatRelativeTime(comment.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {/* Composer */}
            {isReadOnly ? (
              <div className="border-t pt-4">
                <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-slate-600">
                    <Archive className="h-4 w-4 inline mr-1" />
                    This transaction is archived. Comments are read-only.
                  </p>
                </div>
              </div>
            ) : (
              <div className="border-t pt-4 space-y-3">
                <Label htmlFor="new-comment" className="text-sm font-medium text-slate-700">
                  Add Comment
                </Label>
                <Textarea
                  id="new-comment"
                  placeholder="Type your message..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                
                {/* Visibility Toggle (Admin Only) */}
                {currentUserRole === "Admin" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="share-with-agent"
                        checked={commentVisibility === "Shared"}
                        onCheckedChange={(checked) =>
                          setCommentVisibility(checked ? "Shared" : "Internal")
                        }
                      />
                      <Label
                        htmlFor="share-with-agent"
                        className="text-sm text-slate-700 font-normal cursor-pointer"
                      >
                        Shared with Agent
                        {commentVisibility === "Internal" && (
                          <span className="ml-2 text-xs text-amber-600 font-medium">
                            (Internal only)
                          </span>
                        )}
                      </Label>
                    </div>
                    {commentVisibility === "Shared" && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="notify-agent-comment"
                          checked={notifyAgentOnComment}
                          onCheckedChange={(checked) =>
                            setNotifyAgentOnComment(checked === true)
                          }
                        />
                        <Label
                          htmlFor="notify-agent-comment"
                          className="text-sm text-slate-700 font-normal cursor-pointer"
                        >
                          Notify Agent
                        </Label>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={handlePostComment}
                  className="w-full"
                  disabled={!newCommentText.trim()}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Post Comment
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
