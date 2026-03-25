import React, { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "../ui/utils";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

interface DashboardSidebarProps {
  logo?: ReactNode;
  sections: NavSection[];
  footer?: ReactNode;
}

export function DashboardSidebar({ logo, sections, footer }: DashboardSidebarProps) {
  const location = useLocation();

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        {logo || (
          <div className="text-xl font-semibold">Dashboard</div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {sections.map((section, idx) => (
          <div key={idx} className="mb-6">
            {section.title && (
              <div className="px-6 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {section.title}
              </div>
            )}
            <ul className="space-y-1 px-3">
              {section.items
                .filter(
                  (item, i, arr) => arr.findIndex((x) => x.href === item.href) === i
                )
                .map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <li key={`${item.href}-${item.label}`}>
                    <Link
                      to={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                        isActive
                          ? "bg-slate-800 text-white font-medium"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="bg-slate-700 text-slate-200 text-xs px-2 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {footer && (
        <div className="p-4 border-t border-slate-800">
          {footer}
        </div>
      )}
    </aside>
  );
}
