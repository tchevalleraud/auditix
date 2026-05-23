"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  Activity,
  Bot,
  Building2,
  Clock,
  Columns3,
  Cpu,
  FlaskConical,
  Globe,
  HeartPulse,
  History,
  KeyRound,
  ListTodo,
  Mail,
  Radio,
  ScrollText,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  UserCircle,
  Users,
  Wrench,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";

interface NavItem {
  label: string;
  // Either a query-string tab (context section) or a full app route (global section).
  href?: string;
  tab?: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { current, userRoles } = useAppContext();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = userRoles.includes("ROLE_ADMIN");

  const isContextRoot = pathname === "/settings";
  const activeTab = isContextRoot ? (searchParams.get("tab") ?? "general") : null;

  const sections = useMemo<NavSection[]>(() => {
    // Items for the current context — every tab routes back to /settings?tab=<key>.
    // We mirror the historical list from settings/page.tsx so the same set of
    // editable areas is reachable from the new vertical nav.
    const contextItems: NavItem[] = [
      { label: t("settings.tabGeneral"), tab: "general", icon: Settings },
      { label: t("settings.tabMonitoring"), tab: "monitoring", icon: Activity },
      { label: t("settings.tabVulnerability"), tab: "vulnerability", icon: ShieldAlert },
      { label: t("settings.tabSystemUpdates"), tab: "systemUpdates", icon: Wrench },
      { label: t("settings.tabNodeColumns"), tab: "nodeColumns", icon: Columns3 },
    ];
    if (current && !current.isDefault) {
      contextItems.push({ label: t("settings.tabMembers"), tab: "members", icon: Users });
    }
    contextItems.push({ label: t("settings.tabLab"), tab: "lab", icon: FlaskConical });
    contextItems.push({ label: t("settings.tabAiAssistant"), tab: "aiAssistant", icon: Sparkles });
    contextItems.push({ label: t("settings.tabApiTokens"), tab: "apiTokens", icon: KeyRound });

    const out: NavSection[] = [
      { label: t("settings.sectionContext"), items: contextItems },
    ];

    // Admin-only section. The pages themselves are gated by the middleware so
    // hiding the nav for non-admins is purely a UX courtesy.
    if (isAdmin) {
      out.push({
        label: t("settings.sectionGlobal"),
        items: [
          { label: t("sidebar.contexts"), href: "/settings/global/contexts", icon: Building2 },
          { label: t("sidebar.users"), href: "/settings/global/users", icon: UserCircle },
          { label: t("sidebar.authentication"), href: "/settings/global/auth", icon: ShieldCheck },
          { label: t("sidebar.health"), href: "/settings/global/health", icon: HeartPulse },
          { label: t("sidebar.workers"), href: "/settings/global/server/workers", icon: Cpu },
          { label: t("sidebar.nginx"), href: "/settings/global/server/nginx", icon: Globe },
          { label: t("sidebar.logs"), href: "/settings/global/logs", icon: ScrollText },
          { label: t("sidebar.audit"), href: "/settings/global/audit", icon: History },
          { label: t("sidebar.tasks"), href: "/settings/global/tasks", icon: ListTodo },
          { label: t("sidebar.mailServers"), href: "/settings/global/mail", icon: Mail },
          { label: t("sidebar.syslogServers"), href: "/settings/global/syslog", icon: Radio },
          { label: t("sidebar.llmProviders"), href: "/settings/global/llm-providers", icon: Bot },
        ],
      });
    }
    return out;
  }, [t, current, isAdmin]);

  const isItemActive = (item: NavItem): boolean => {
    if (item.tab) return isContextRoot && activeTab === item.tab;
    if (item.href === "/settings/global") return pathname === "/settings/global";
    if (item.href) return pathname.startsWith(item.href);
    return false;
  };

  // The parent (authenticated) layout wraps every page in `<main className="p-6">`
  // and lets the body scroll. For settings we want a two-pane layout with
  // independent scroll on each side, so we cancel the parent padding with
  // -m-6 and pin to viewport height (Topbar = 4rem). Both <aside> and inner
  // <main> own their own overflow-y, giving the user two separate scrollbars.
  return (
    <div className="-m-6 h-[calc(100vh-4rem)] flex overflow-hidden">
      <aside className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 px-3 py-5 overflow-y-auto">
        <h2 className="px-2 mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">{t("settings.title")}</h2>
        <nav className="space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="px-2 mb-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const href = item.tab ? `/settings?tab=${item.tab}` : item.href!;
                  const active = isItemActive(item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                        active
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-medium"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto px-6 py-6">{children}</main>
    </div>
  );
}
