import React, { useMemo } from "react";
import {
  Building2,
  ExternalLink,
  FileSignature,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { Card, CardContent } from "../components/ui/card";
import {
  getOrderedResourceSections,
  type ResourceAudience,
  type ResourceItem,
  type ResourceProvider,
  type ResourceSection,
} from "../../lib/resourceCenterConfig";

/**
 * Per-provider visual identity. UI tokens are colocated with the page (not in the config) so the
 * data file stays portable to Supabase.
 *
 *   - `iconBg` / `iconFg`        — round icon tile in the section header
 *   - `accent` / `accentHover`   — left-edge color stripe on each resource tile; deepens on hover
 *   - `ringHover`                — faint provider-colored outline that appears on hover
 *   - `tint`                     — soft per-provider tile background at rest
 */
const PROVIDER_VISUAL: Record<
  ResourceProvider,
  {
    icon: LucideIcon;
    iconBg: string;
    iconFg: string;
    accent: string;
    accentHover: string;
    ringHover: string;
    tint: string;
  }
> = {
  btq: {
    icon: Sparkles,
    iconBg: "bg-slate-100",
    iconFg: "text-slate-700",
    accent: "border-l-slate-400",
    accentHover: "hover:border-l-slate-600",
    ringHover: "hover:ring-slate-300",
    tint: "bg-slate-50",
  },
  lofty: {
    icon: Building2,
    iconBg: "bg-amber-50",
    iconFg: "text-amber-700",
    accent: "border-l-amber-400",
    accentHover: "hover:border-l-amber-600",
    ringHover: "hover:ring-amber-200",
    tint: "bg-amber-50/60",
  },
  skyslope: {
    icon: ShieldCheck,
    iconBg: "bg-sky-50",
    iconFg: "text-sky-700",
    accent: "border-l-sky-400",
    accentHover: "hover:border-l-sky-600",
    ringHover: "hover:ring-sky-200",
    tint: "bg-sky-50/60",
  },
  dotloop: {
    icon: FileSignature,
    iconBg: "bg-emerald-50",
    iconFg: "text-emerald-700",
    accent: "border-l-emerald-400",
    accentHover: "hover:border-l-emerald-600",
    ringHover: "hover:ring-emerald-200",
    tint: "bg-emerald-50/60",
  },
  landvoice: {
    icon: PhoneCall,
    iconBg: "bg-violet-50",
    iconFg: "text-violet-700",
    accent: "border-l-violet-400",
    accentHover: "hover:border-l-violet-600",
    ringHover: "hover:ring-violet-200",
    tint: "bg-violet-50/60",
  },
};

interface ProviderTileTokens {
  accent: string;
  accentHover: string;
  ringHover: string;
  tint: string;
}

/**
 * Audience icons for the "Best for" inline row. Note: `Building2` is reused as both the Lofty
 * provider section glyph and the Broker audience glyph — that's intentional and matches the
 * spec; the contexts (large colored tile vs. tiny inline text) are visually distinct.
 */
const AUDIENCE_ICON: Record<ResourceAudience, LucideIcon> = {
  Agent: User,
  Admin: ShieldCheck,
  Broker: Building2,
};

/** http/https only — anything else (empty, mailto, javascript:) makes the tile non-clickable. */
function parseHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function BestForRow({ audience }: { audience: ResourceAudience[] }) {
  if (audience.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-slate-500">
      <span className="text-slate-400">Best for:</span>
      {audience.map((aud, i) => {
        const Icon = AUDIENCE_ICON[aud];
        return (
          <span key={aud} className="inline-flex items-center gap-1 text-slate-600">
            <Icon className="h-3 w-3 text-slate-400" aria-hidden />
            <span>{aud}</span>
            {i < audience.length - 1 ? (
              <span className="ml-1 text-slate-300" aria-hidden>
                •
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function TileBody({ item }: { item: ResourceItem }) {
  return (
    <>
      <div className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900 transition-colors duration-[120ms] ease-out group-hover:text-blue-700">
          {item.title}
        </span>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
      </div>
      <div className="mt-auto pt-1">
        <BestForRow audience={item.audience} />
        {item.duration ? (
          <p className="mt-1 text-xs text-slate-400">{item.duration}</p>
        ) : null}
      </div>
    </>
  );
}

/**
 * Resource tile. When a valid http(s) URL is present the entire tile is the link (the title,
 * description, and "Best for" row are all click targets). Items without a usable URL render as
 * a dimmed, non-interactive tile with a small "Coming soon" caption.
 */
function ResourceTile({
  item,
  tokens,
}: {
  item: ResourceItem;
  tokens: ProviderTileTokens;
}) {
  const href = parseHttpUrl(item.url);

  // Common layout for both link and div variants; keeps height even in the 2-col grid.
  const baseClass = `group flex h-full flex-col gap-2 rounded-lg border-l-[3px] px-4 py-3.5 ${tokens.accent} ${tokens.tint}`;

  if (href) {
    // Calm but clearly clickable hover. No movement/scale. Layered cues:
    //   1. Resting shadow-sm gives the hover shadow something to build from.
    //   2. hover:shadow-md → clearly elevated.
    //   3. hover:border-l-*-600 → deepens the provider accent stripe.
    //   4. hover:ring-1 in the provider color → faint colored outline halo.
    //   5. Title shifts to blue-700 (handled in TileBody via group-hover).
    // All animated together at ~120ms ease-out.
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClass} ${tokens.accentHover} ${tokens.ringHover} cursor-pointer no-underline shadow-sm transition-[box-shadow,border-color] duration-[120ms] ease-out hover:shadow-md hover:ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2`}
      >
        <TileBody item={item} />
      </a>
    );
  }

  return (
    <div className={`${baseClass} opacity-80`} aria-disabled="true">
      <TileBody item={item} />
      <p className="mt-1 text-xs text-slate-400">Coming soon</p>
    </div>
  );
}

/**
 * Group items by `category`, preserving the input order. Items without a category land in a
 * single leading bucket whose key is the empty string. Returned as an ordered array of
 * `[categoryLabel, items]` so React can render predictable subheaders.
 */
function groupItemsByCategory(items: ResourceItem[]): Array<[string, ResourceItem[]]> {
  const order: string[] = [];
  const buckets = new Map<string, ResourceItem[]>();
  for (const item of items) {
    const key = item.category ?? "";
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }
  return order.map((key) => [key, buckets.get(key)!]);
}

function ItemsGrid({
  items,
  tokens,
}: {
  items: ResourceItem[];
  tokens: ProviderTileTokens;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items.map((item) => (
        <ResourceTile key={item.id} item={item} tokens={tokens} />
      ))}
    </div>
  );
}

/**
 * Short, fading horizontal line that follows a subsection label. Caps at ~30% of the row width
 * so it stays decorative instead of acting as a full-width divider.
 */
function CategoryHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h4>
      <div
        className="h-px w-1/3 max-w-[30%] bg-gradient-to-r from-slate-200 to-transparent"
        aria-hidden
      />
    </div>
  );
}

function ResourceSectionBody({ section }: { section: ResourceSection }) {
  const visual = PROVIDER_VISUAL[section.provider];
  const tokens: ProviderTileTokens = {
    accent: visual.accent,
    accentHover: visual.accentHover,
    ringHover: visual.ringHover,
    tint: visual.tint,
  };
  const hasCategories = section.items.some((item) => !!item.category);

  if (section.items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        No resources in this section yet.
      </p>
    );
  }

  if (!hasCategories) {
    return <ItemsGrid items={section.items} tokens={tokens} />;
  }

  return (
    <div className="space-y-6">
      {groupItemsByCategory(section.items).map(([categoryLabel, items]) => (
        <div key={categoryLabel || "__uncategorized__"} className="space-y-3">
          {categoryLabel ? <CategoryHeader label={categoryLabel} /> : null}
          <ItemsGrid items={items} tokens={tokens} />
        </div>
      ))}
    </div>
  );
}

function ResourceSectionHeader({ section }: { section: ResourceSection }) {
  const visual = PROVIDER_VISUAL[section.provider];
  const Icon = visual.icon;
  const itemCount = section.items.length;

  return (
    <div className="flex w-full items-center gap-3 pr-2 text-left">
      <div className={`rounded-lg p-2 shrink-0 ${visual.iconBg} ${visual.iconFg}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-slate-900">{section.title}</span>
          <span className="text-xs font-medium text-slate-500">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </div>
        {section.description ? (
          <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ResourceCenter() {
  const sections = useMemo(() => getOrderedResourceSections(), []);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl">
        <header>
          <h1 className="text-3xl font-semibold text-slate-900">Resource Center</h1>
          <p className="mt-1 text-sm text-slate-500">
            Training, tools, and support resources for your brokerage workflow.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400">
            <ExternalLink className="h-3 w-3" aria-hidden />
            Resources open in a new tab.
          </p>
        </header>

        <Card className="mt-6 border-slate-200 bg-white shadow-sm">
          <CardContent className="p-2 sm:p-4">
            {/* All providers collapsed by default so the page reads as a full provider library. */}
            <Accordion type="multiple" className="w-full">
              {sections.map((section) => (
                <AccordionItem
                  key={section.id}
                  value={section.id}
                  className="border-slate-200"
                >
                  <AccordionTrigger className="px-2 py-4 hover:no-underline">
                    <ResourceSectionHeader section={section} />
                  </AccordionTrigger>
                  <AccordionContent className="px-2 pb-4">
                    <ResourceSectionBody section={section} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-400">
          Need something that isn't here? Have a suggestion? Email{" "}
          <a
            href="mailto:suggestions@brokerteq.com"
            className="font-medium text-slate-600 underline-offset-2 hover:text-blue-700 hover:underline"
          >
            suggestions@brokerteq.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export default ResourceCenter;
