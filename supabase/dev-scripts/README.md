# supabase/dev-scripts

**Not migrations.** Files in this folder are one-off, controlled, developer-only
SQL utilities that you run by hand against the Supabase project (e.g. in the
Supabase Studio SQL Editor).

They are intentionally **outside `supabase/migrations/`** so they cannot be
applied by `supabase db push` / CI and won't become part of the schema history.

## multi_office_poc_seed.sql

Proof-of-concept seed for verifying whether one broker user can already belong
to more than one office without changing app code.

It:

1. Looks up the broker by `auth.users.email = 'karend453@gmail.com'`
   (the real login email for the "John Broker / Pro Realty" test persona).
2. Creates (or reuses) an office named **"Multi Office Test Office"** with
   the minimum NOT NULL fields, leaving billing/Stripe fields empty so the
   broker billing gate ignores it.
3. Inserts an active `office_memberships` row connecting that same user_id
   to the new office as `role='broker'`, `status='active'`.
4. **Does not touch `user_profiles.office_id`** — that is the whole point of
   the test (find out whether `office_memberships` alone can drive the app).
5. Prints a summary of all of the user's offices and memberships.

The script is idempotent: rerun it as many times as you like.

### Run it

Supabase Studio → SQL Editor → paste contents → Run.

### What you'll see in the app afterward

* The user logs in normally — DB writes don't change auth.
* Settings should load (settings tabs read via membership-aware
  `getOfficeForSettingsTabs`, which falls back to `user_profiles.office_id`).
* The header office switcher will **still show only one office** for this
  broker. `loadDashboardOfficeOptions` in `src/app/pages/Dashboard.tsx`
  hard-codes brokers to a single option:
  `return { options: [{ id: o.id, label: ... }], roleKey };`
* Transactions for the second office will **not** appear, because the
  `transactions_select_by_role` RLS policy keys off
  `user_profiles.office_id`, not `office_memberships`.

Both of those are the expected blockers — they confirm what's wired up vs.
what would have to change to ship real multi-office.

## multi_office_poc_cleanup.sql

Removes the test office row and its memberships. Safe to run any time. Only
deletes offices whose name is `Multi Office Test Office` **and** whose
`billing_admin_note` was written by the seed script.

## Backfilling `offices.billing_monthly_amount_cents`

`offices.billing_monthly_amount_cents` (added in
`20260514120000_offices_billing_monthly_amount_cents.sql`) is webhook-maintained:
`api/billing/webhook.ts` writes it on `checkout.session.completed`,
`customer.subscription.*`, and `invoice.payment_*` events.

For offices that already had a Stripe subscription **before** that webhook
update shipped (e.g. Apex Realty Group), the column will be NULL until the
next Stripe event fires. To populate it immediately, signed-in as a BTQ
admin POST to the admin-only endpoint:

```
POST /api/billing/sync-subscription-snapshot
Authorization: Bearer <btq_admin access_token>
Content-Type: application/json

{ "officeId": "<office-uuid>" }   // omit to backfill every office
```

It retrieves each office's Stripe subscription with `items.data.price`
expanded, runs the shared `subscriptionMonthlyAmountSnapshot` helper, and
writes `billing_monthly_amount_cents` + `billing_currency` back onto the
office row. Same math the Stripe webhook and Settings → My Wallet use.
