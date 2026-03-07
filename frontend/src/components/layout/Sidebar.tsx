"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  Building2,
  Users,
  Box,
  Cpu,
  KeyRound,
  Server,
  HeartPulse,
  ScrollText,
  ListTodo,
  Terminal,
  FileSearch,
} from "lucide-react";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
}

interface NavCategory {
  label: string;
  items: NavItem[];
}

const contextNav: NavCategory[] = [
  {
    label: "",
    items: [
      { key: "sidebar.dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "sidebar.catNodes",
    items: [
      { key: "sidebar.manufacturers", href: "/manufacturers", icon: Box },
      { key: "sidebar.models", href: "/models", icon: Cpu },
      { key: "sidebar.nodes", href: "/nodes", icon: Server },
      { key: "sidebar.profiles", href: "/profiles", icon: KeyRound },
      { key: "sidebar.collectionCommands", href: "/collection-commands", icon: Terminal },
      { key: "sidebar.collectionRules", href: "/collection-rules", icon: FileSearch },
    ],
  },
];

const adminNav: NavCategory[] = [
  {
    label: "sidebar.catGeneral",
    items: [
      { key: "sidebar.dashboard", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    label: "sidebar.catManagement",
    items: [
      { key: "sidebar.contexts", href: "/admin/contexts", icon: Building2 },
      { key: "sidebar.users", href: "/admin/users", icon: Users },
    ],
  },
  {
    label: "sidebar.catServer",
    items: [
      { key: "sidebar.health", href: "/admin/health", icon: HeartPulse },
      { key: "sidebar.logs", href: "/admin/logs", icon: ScrollText },
      { key: "sidebar.tasks", href: "/admin/tasks", icon: ListTodo },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { adminMode, setAdminMode } = useAppContext();
  const { t } = useI18n();

  useEffect(() => {
    const isAdminPath = pathname.startsWith("/admin");
    if (isAdminPath !== adminMode) {
      setAdminMode(isAdminPath);
    }
  }, [pathname, adminMode, setAdminMode]);

  const navigation = adminMode ? adminNav : contextNav;

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      <div className="flex h-16 items-center gap-3 px-6 border-b border-slate-200 dark:border-slate-800">
        <ShieldCheck className="h-8 w-8 text-slate-900 dark:text-white" />
        <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
          Auditix
        </span>
      </div>

      {adminMode && (
        <div className="mx-4 mt-4 mb-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {t("sidebar.administration")}
          </h2>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {navigation.map((category, i) => (
          <div key={i}>
            {category.label && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t(category.label)}
              </p>
            )}
            <div className="space-y-0.5">
              {category.items.map((item) => {
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {t(item.key)}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-4">
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">{t("common.version")}</p>
      </div>
    </aside>
  );
}
