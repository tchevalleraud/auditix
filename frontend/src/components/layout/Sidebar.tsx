"use client";

import { useEffect, useRef, useState } from "react";
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
  Database,
  Tags,
  Settings,
  ClipboardCheck,
  BookOpen,
  FileBarChart,
  Palette,
  Calendar,
  FlaskConical,
  ChevronDown,
  FolderTree,
  Network,
  ShieldAlert,
  RefreshCw,
  Layers,
  Code2,
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
      { key: "sidebar.topology", href: "/topology", icon: Network },
      { key: "sidebar.nodes", href: "/nodes", icon: Server },
    ],
  },
  {
    label: "sidebar.catNodes",
    items: [
      { key: "sidebar.manufacturers", href: "/manufacturers", icon: Box },
      { key: "sidebar.models", href: "/models", icon: Cpu },
      { key: "sidebar.profiles", href: "/profiles", icon: KeyRound },
      { key: "sidebar.tags", href: "/tags", icon: Tags },
      { key: "sidebar.inventoryCategories", href: "/inventory-categories", icon: FolderTree },
    ],
  },
  {
    label: "sidebar.catCollections",
    items: [
      { key: "sidebar.collections", href: "/collections", icon: Database },
      { key: "sidebar.collectionCommands", href: "/collection-commands", icon: Terminal },
      { key: "sidebar.collectionRules", href: "/collection-rules", icon: FileSearch },
    ],
  },
  {
    label: "sidebar.catCompliance",
    items: [
      { key: "sidebar.compliancePolicies", href: "/compliance/policies", icon: BookOpen },
      { key: "sidebar.complianceRules", href: "/compliance/rules", icon: ClipboardCheck },
    ],
  },
  {
    label: "sidebar.catVulnerabilities",
    items: [
      { key: "sidebar.vulnerabilities", href: "/vulnerabilities", icon: ShieldAlert },
    ],
  },
  {
    label: "sidebar.catSystemUpdates",
    items: [
      { key: "sidebar.productRanges", href: "/product-ranges", icon: Layers },
    ],
  },
  {
    label: "sidebar.catReports",
    items: [
      { key: "sidebar.reports", href: "/reports/list", icon: FileBarChart },
      { key: "sidebar.reportThemes", href: "/reports/themes", icon: Palette },
    ],
  },
  {
    label: "sidebar.catAutomation",
    items: [
      { key: "sidebar.schedules", href: "/schedules", icon: Calendar },
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

function CollapsibleSection({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || !innerRef.current) return;

    if (firstRender.current) {
      firstRender.current = false;
      outer.style.height = isOpen ? "auto" : "0px";
      return;
    }

    if (isOpen) {
      const target = innerRef.current.offsetHeight;
      outer.style.height = "0px";
      // force reflow so the browser registers 0px before animating
      void outer.offsetHeight;
      outer.style.height = `${target}px`;

      const onEnd = () => {
        outer.style.height = "auto";
        outer.removeEventListener("transitionend", onEnd);
      };
      outer.addEventListener("transitionend", onEnd);
    } else {
      // pin to current height first
      outer.style.height = `${outer.scrollHeight}px`;
      // force reflow
      void outer.offsetHeight;
      outer.style.height = "0px";
    }
  }, [isOpen]);

  return (
    <div
      ref={outerRef}
      style={{ overflow: "hidden", transition: "height 200ms ease-in-out" }}
    >
      <div ref={innerRef} className="space-y-0.5">{children}</div>
    </div>
  );
}

function isItemActive(itemHref: string, pathname: string): boolean {
  if (itemHref === "/admin") return pathname === "/admin";
  if (itemHref === "/") return pathname === "/";
  return pathname.startsWith(itemHref);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { adminMode, setAdminMode, current } = useAppContext();
  const { t } = useI18n();
  const [versionStatus, setVersionStatus] = useState<{ upToDate: boolean; latest: string | null } | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  useEffect(() => {
    const nav = adminMode ? adminNav : contextNav;
    const active = nav.find(
      (cat) => cat.label && cat.items.some((item) => isItemActive(item.href, pathname))
    );
    setOpenCategory(active?.label ?? null);
  }, [adminMode]);

  const toggleCategory = (label: string) => {
    setOpenCategory((prev) => (prev === label ? null : label));
  };

  useEffect(() => {
    const isAdminPath = pathname.startsWith("/admin");
    if (isAdminPath !== adminMode) {
      setAdminMode(isAdminPath);
    }
  }, [pathname, adminMode, setAdminMode]);

  useEffect(() => {
    const check = () => {
      if (!navigator.onLine) { setVersionStatus(null); return; }
      fetch("/version-check")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data && data.latest) setVersionStatus({ upToDate: data.upToDate, latest: data.latest }); else setVersionStatus(null); })
        .catch(() => setVersionStatus(null));
    };
    check();
    const interval = setInterval(check, 3600_000); // every hour
    const onOnline = () => check();
    const onOffline = () => setVersionStatus(null);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { clearInterval(interval); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

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

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {navigation.map((category, i) => {
          const renderItems = (items: NavItem[]) =>
            items.map((item) => {
              const isActive = isItemActive(item.href, pathname);
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
            });

          if (!category.label) {
            return (
              <div key={i} className="space-y-0.5">
                {renderItems(category.items)}
              </div>
            );
          }

          const isOpen = openCategory === category.label;

          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => toggleCategory(category.label)}
                aria-expanded={isOpen}
                className="flex items-center justify-between w-full mb-1 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <span>{t(category.label)}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
                />
              </button>
              <CollapsibleSection isOpen={isOpen}>
                {renderItems(category.items)}
              </CollapsibleSection>
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-3 space-y-0.5">
        {!adminMode && current?.publicEnabled && (
          <Link
            href="/labs"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/labs")
                ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            }`}
          >
            <FlaskConical className="h-5 w-5 shrink-0" />
            {t("sidebar.labs")}
          </Link>
        )}
        {!adminMode && (
          <Link
            href="/documentation"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/documentation")
                ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            }`}
          >
            <Code2 className="h-5 w-5 shrink-0" />
            {t("sidebar.api")}
          </Link>
        )}
        {!adminMode && (
          <Link
            href="/settings"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/settings")
                ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            }`}
          >
            <Settings className="h-5 w-5 shrink-0" />
            {t("sidebar.settings")}
          </Link>
        )}
        <div className="border-t border-slate-200 dark:border-slate-800 mt-3 pt-3">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs text-slate-400 dark:text-slate-500">Auditix v{process.env.APP_VERSION}</span>
            {versionStatus && (
              versionStatus.upToDate ? (
                <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">latest</span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">update</span>
              )
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
