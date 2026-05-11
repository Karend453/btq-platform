/**
 * Resource Center static configuration.
 *
 * First-pass: this file is the single source of truth for the Resource Center page. The shape is
 * intentionally close to what a future Supabase schema would look like (one row per item, one row
 * per section, with `sortOrder` + `audience` columns) so we can lift this into a table later
 * without restructuring the UI.
 *
 * When migrating to Supabase, expected mapping:
 *   - `resource_sections` table  -> ResourceSection
 *   - `resource_items` table     -> ResourceItem (FK -> resource_sections.id)
 *   - `audience` becomes a text[] column (or a join table) of the same enum values
 */

export type ResourceAudience = "Agent" | "Admin" | "Broker";

export type ResourceProvider =
  | "btq"
  | "lofty"
  | "skyslope"
  | "dotloop"
  | "landvoice";

export interface ResourceItem {
  id: string;
  title: string;
  description: string;
  /** Empty string is allowed for not-yet-published items; UI renders a "Coming soon" state. */
  url: string;
  provider: ResourceProvider;
  audience: ResourceAudience[];
  /** Optional display hint, e.g. "5 min", "12 min video". */
  duration?: string;
  /** When true, the item shows a "Featured" badge and is hoisted within its section. */
  featured?: boolean;
  /**
   * Optional sub-heading within a section (e.g. "Forms" vs "Transaction Management" for the
   * SkySlope provider). The page groups items by `category` when at least one item in the
   * section has it set; otherwise items render as a flat list. Maps cleanly to a future
   * `resource_items.category` text column in Supabase.
   */
  category?: string;
  sortOrder: number;
}

export interface ResourceSection {
  id: string;
  title: string;
  /** Short blurb shown under the section title in the accordion header. */
  description?: string;
  provider: ResourceProvider;
  sortOrder: number;
  items: ResourceItem[];
}

/**
 * Initial Resource Center sections. Items are placeholders so the page has structure to render;
 * empty `url` values are intentional — those rows display a "Coming soon" affordance instead of
 * an Open action. Replace placeholder copy + URLs incrementally without changing the schema.
 */
export const RESOURCE_CENTER_SECTIONS: ResourceSection[] = [
  {
    id: "getting-started-btq",
    title: "Getting Started with BTQ",
    description: "Onboarding, account setup, and a tour of the BTQ platform.",
    provider: "btq",
    sortOrder: 10,
    items: [
      {
        id: "btq-welcome-tour",
        title: "Welcome tour: your first day on BTQ",
        description: "A short walkthrough of the dashboard, transactions, and settings.",
        url: "",
        provider: "btq",
        audience: ["Agent", "Admin", "Broker"],
        duration: "5 min",
        featured: true,
        sortOrder: 10,
      },
      {
        id: "btq-account-setup",
        title: "Set up your account and profile",
        description: "Profile photo, contact info, GCI goal, and forms provider preference.",
        url: "",
        provider: "btq",
        audience: ["Agent", "Broker"],
        duration: "3 min",
        sortOrder: 20,
      },
      {
        id: "btq-invite-team",
        title: "Invite agents and assign roles",
        description: "How to add team members and pick the right role for each seat.",
        url: "",
        provider: "btq",
        audience: ["Admin", "Broker"],
        duration: "4 min",
        sortOrder: 30,
      },
    ],
  },
  {
    id: "lofty",
    title: "Lofty",
    description: "CRM, lead routing, and marketing automation guides.",
    provider: "lofty",
    sortOrder: 20,
    items: [
      {
        id: "lofty-overview",
        title: "Lofty overview for BTQ agents",
        description: "What Lofty is, how it connects to BTQ, and where each feature lives.",
        url: "",
        provider: "lofty",
        audience: ["Agent", "Admin", "Broker"],
        sortOrder: 10,
      },
      {
        id: "lofty-lead-routing",
        title: "Configure lead routing rules",
        description: "Round-robin, source-based routing, and escalation timeouts.",
        url: "",
        provider: "lofty",
        audience: ["Admin", "Broker"],
        duration: "8 min",
        sortOrder: 20,
      },
    ],
  },
  {
    id: "skyslope",
    title: "SkySlope",
    description: "Forms, transaction management & broker compliance.",
    provider: "skyslope",
    sortOrder: 30,
    items: [
      {
        id: "skyslope-forms-library",
        title: "Forms Library",
        description: "Browse the full library of SkySlope Forms templates.",
        url: "https://support.skyslope.com/support/solutions/156000559649",
        provider: "skyslope",
        audience: ["Agent", "Broker"],
        category: "Forms",
        featured: true,
        sortOrder: 10,
      },
      {
        id: "skyslope-agent-onboarding",
        title: "Agent Onboarding",
        description: "Register for the SkySlope Forms agent onboarding webinar.",
        url: "https://skyslope.ewebinar.com/webinar/agent-onboarding-skyslope-forms-12373/register/thankyou/16343535?data=aHFJUm9lcG5MZFR4UExtQm1MWkU5YiUyQnduVmI3YkY2NnpSTzcyMUFDOTYlMkJmdzRnQjFuaWlYTThWWENqJTJGZ3NVS2ZTSSUyQmhwcExYcGdjem85YWtUcHhDNm1ObzZQUDFjYnJBcjNKUWFkckFwS3F4aHNiSGxUVG0yJTJGNGNzVEhEOUhMYVZ5aHBmTEFuWHU1T3MyMmdqME0zZlNENzZtMVZLRGNMeFhmbEtFamJwVWJlRHJLenV5cGlnNGZrNGtDR1FUNnRndmtvT3ZwZ1EzTUlKSGRQRDRMdzRHTkxES3luckV5N1dZSUs5U2ZTRVNxaUFaSFZaZjdxNzRZR3o2RWhRRUhnd2FpYUlKdWNZJTJGSHI5ZVY4Y0xieGZicG9Ka3QzJTJCQ1k0eThZaXVCNkhFMjZ1Tk1DTGxSeWFxbCUyRlIzVjE5MjVEZ2tKMlBTOWQ1T24lMkZqWEhYVDhUZjlqJTJCTDclMkZVQkxaZEltZW5DMHRyZWlCTlIwJTJCZGlvRFlkVUM5TjRBbmszTEMlMkZBUGhhSHFYWDJUVWhQVWNXOFlraWltVjNCVmxwaVVDR3l6JTJGJTJCUHlSJTJCUU4ydmcyMFlPdzhmZlVxWFh4b2czTiUyRmUxUmt4SkYlMkJEVHJ6QWtqcCUyQjlTemJuRTkzN0ZxT0dFclhrdmpIUmhwRlRkVFNmNm1WZ1JETU1jTmxaUFdPTmxDSlpWUUNQOWJsdnM2NnJhMU14ZXhDTCUyQnFUNEJxN0lCVVl5YmhtcW45Mw%3D%3D",
        provider: "skyslope",
        audience: ["Agent"],
        category: "Forms",
        sortOrder: 20,
      },
      {
        id: "skyslope-forms-walkthrough",
        title: "Forms Walk-Through",
        description: "Step-by-step walk-through of the SkySlope Forms interface.",
        url: "https://support.skyslope.com/support/solutions/articles/156000366292-a-complete-forms-walk-through",
        provider: "skyslope",
        audience: ["Agent", "Broker"],
        category: "Forms",
        sortOrder: 30,
      },
      {
        id: "skyslope-create-forms-templates",
        title: "Create Forms Templates",
        description: "Video tutorial on building reusable forms templates.",
        url: "https://www.youtube.com/watch?v=S1nFhPTxr6s",
        provider: "skyslope",
        audience: ["Admin", "Broker"],
        category: "Forms",
        sortOrder: 40,
      },
      {
        id: "skyslope-insider-hacks",
        title: "SkySlope Insider Hacks for Agents",
        description: "Tips and shortcuts to move faster inside SkySlope.",
        url: "https://support.skyslope.com/support/solutions/articles/156000366431-skyslope-insider-hacks-for-agents",
        provider: "skyslope",
        audience: ["Agent"],
        category: "Transaction Management",
        sortOrder: 50,
      },
      {
        id: "skyslope-convert-listing",
        title: "Convert a Listing to a Transaction",
        description: "Promote an active listing into a SkySlope transaction file.",
        url: "https://support.skyslope.com/support/solutions/articles/156000366436-convert-a-listing-to-a-transaction",
        provider: "skyslope",
        audience: ["Agent", "Broker"],
        category: "Transaction Management",
        sortOrder: 60,
      },
      {
        id: "skyslope-withdraw-listing",
        title: "Withdrawing a Listing",
        description: "How to withdraw an active listing in SkySlope.",
        url: "https://support.skyslope.com/support/solutions/articles/156000366437",
        provider: "skyslope",
        audience: ["Agent", "Broker"],
        category: "Transaction Management",
        sortOrder: 70,
      },
      {
        id: "skyslope-manage-checklists",
        title: "Manage Checklists",
        description: "Create, edit, and assign checklists across SkySlope files.",
        url: "https://support.skyslope.com/support/solutions/articles/156000366262-manage-checklists-create-a-new-checklist",
        provider: "skyslope",
        audience: ["Admin", "Broker"],
        category: "Transaction Management",
        sortOrder: 80,
      },
    ],
  },
  {
    id: "dotloop",
    title: "Dotloop",
    description: "Loops, e-signature, document templates, and workflows.",
    provider: "dotloop",
    sortOrder: 40,
    items: [
      {
        id: "dotloop-training-manuals",
        title: "Training Manuals",
        description: "Videos and training manuals from Dotloop support.",
        url: "https://support.dotloop.com/s/article/Videos-Training-Manuals",
        provider: "dotloop",
        audience: ["Agent", "Admin", "Broker"],
        featured: true,
        sortOrder: 10,
      },
      {
        id: "dotloop-customizing-document-templates",
        title: "Customizing Document Templates",
        description: "Customize document templates for your office's needs.",
        url: "https://support.dotloop.com/s/article/Customizing-Document-Templates",
        provider: "dotloop",
        audience: ["Admin", "Broker"],
        sortOrder: 20,
      },
      {
        id: "dotloop-create-task-templates",
        title: "Create Task Templates",
        description: "Build reusable task templates for your loops.",
        url: "https://support.dotloop.com/s/article/Create-Task-Templates",
        provider: "dotloop",
        audience: ["Admin", "Broker"],
        sortOrder: 30,
      },
      {
        id: "dotloop-loop-templates",
        title: "Loop Templates",
        description: "Create loop templates so new transactions start with the right setup.",
        url: "https://support.dotloop.com/s/article/Loop-Templates",
        provider: "dotloop",
        audience: ["Admin", "Broker"],
        sortOrder: 40,
      },
      {
        id: "dotloop-customizing-workflows",
        title: "Customizing Workflows",
        description: "Configure Dotloop workflows to match your brokerage process.",
        url: "https://support.dotloop.com/s/article/Customizing-Workflows",
        provider: "dotloop",
        audience: ["Admin", "Broker"],
        sortOrder: 50,
      },
    ],
  },
  {
    id: "landvoice",
    title: "Landvoice",
    description: "Prospecting data, FSBO and expired listing leads.",
    provider: "landvoice",
    sortOrder: 50,
    items: [
      {
        id: "landvoice-platform-walkthrough",
        title: "Landvoice Platform Walk-Through",
        description: "Walk-through and signup for the Landvoice platform.",
        url: "https://www.landvoice.com/onboarding/signup",
        provider: "landvoice",
        audience: ["Agent", "Broker"],
        featured: true,
        sortOrder: 10,
      },
    ],
  },
  {
    id: "btq-workflows",
    title: "BTQ Workflows",
    description: "End-to-end playbooks that tie BTQ together with your other tools.",
    provider: "btq",
    sortOrder: 60,
    items: [
      {
        id: "workflow-new-listing",
        title: "New listing intake to live workflow",
        description: "From signed listing agreement to active on the MLS.",
        url: "",
        provider: "btq",
        audience: ["Agent", "Broker"],
        sortOrder: 10,
      },
      {
        id: "workflow-buyer-under-contract",
        title: "Buyer under-contract to close",
        description: "Document checklist, key dates, and the compliance handoff.",
        url: "",
        provider: "btq",
        audience: ["Agent", "Broker"],
        sortOrder: 20,
      },
      {
        id: "workflow-broker-review",
        title: "Broker compliance review cadence",
        description: "A weekly rhythm for reviewing files and clearing exceptions.",
        url: "",
        provider: "btq",
        audience: ["Broker", "Admin"],
        sortOrder: 30,
      },
    ],
  },
];

/**
 * Returns sections (and items inside each) sorted by `sortOrder`, with `featured` items hoisted
 * to the top of their section. Pure helper so the page component stays declarative.
 */
export function getOrderedResourceSections(): ResourceSection[] {
  return [...RESOURCE_CENTER_SECTIONS]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => ({
      ...section,
      items: [...section.items].sort((a, b) => {
        if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
        return a.sortOrder - b.sortOrder;
      }),
    }));
}
