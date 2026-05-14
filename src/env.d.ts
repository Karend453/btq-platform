/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    /**
     * Partner Demo Mode visibility flag. When set to "1"/"true", the UI hides
     * transaction-management-specific workflow details (compliance counters,
     * finalize actions, checklist statuses, etc.) so BTQ is presented as a
     * brokerage operations / orchestration platform. Presentation only — no
     * backend permission changes. See `src/lib/partnerDemoMode.ts`.
     */
    readonly VITE_PARTNER_DEMO_MODE?: string
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }