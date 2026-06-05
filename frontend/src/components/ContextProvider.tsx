"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";
import { useI18n, type Locale } from "@/components/I18nProvider";

/** How an ACL/ACE identifier is resolved from the inventory. */
export type AclIdMode = "key" | "column";

export interface AclSourceConfig {
  categoryId: number | null;
  /** "key" = use the inventory entry key, "column" = use a value column. */
  idMode?: AclIdMode;
  idCol?: string | null;
  nameCol?: string | null;
  typeCol?: string | null;
  defaultActionCol?: string | null;
  portsCol?: string | null;
  vlansCol?: string | null;
  vniCol?: string | null;
}

/** Role of a configured field entry in the firewall-style ACE display. */
export type AclEntryRole =
  | "source"
  | "destination"
  | "service"
  | "protocol"
  | "port"
  | "portSrc"
  | "portDst"
  | "qualifier"
  | "detail";

/** One add/remove config entry: a role pointing at a single inventory column. */
export interface AclFieldEntry {
  role: AclEntryRole;
  column: string;
}

export interface AceSourceConfig {
  categoryId: number | null;
  idMode?: AclIdMode;
  idCol?: string | null;
  parentRefCol?: string | null;
  nameCol?: string | null;
  /** Primary action column (drives permit/deny colouring). */
  actionCol?: string | null;
  /** Optional delimiter to split a single action cell into several actions. */
  actionDelimiter?: string | null;
  enabledCol?: string | null;
  /**
   * Ordered list of field entries. Each maps a role (source/destination/service
   * /qualifier/detail) to a single column; the row key is dynamic (one ACE per
   * inventory row). Add several source entries to aggregate (e.g. src-ip + src-mac).
   */
  entries?: AclFieldEntry[];
}

export interface AclConfig {
  aclSource?: AclSourceConfig;
  aceSource?: AceSourceConfig;
}

export interface AppContext {
  id: number;
  name: string;
  description: string | null;
  monitoringEnabled: boolean;
  snmpRetentionMinutes: number;
  snmpPollIntervalSeconds: number;
  icmpPollIntervalSeconds: number;
  isDefault: boolean;
  publicEnabled: boolean;
  publicToken: string | null;
  feedbackButtonEnabled: boolean;
  userCount: number;
  createdAt: string;
  vulnerabilityEnabled: boolean;
  nvdApiKey: string | null;
  vulnerabilitySyncIntervalHours: number;
  vulnerabilityScoreWeight: number;
  complianceScoreWeight: number;
  systemUpdateEnabled: boolean;
  systemUpdateScoreWeight: number;
  lastVulnerabilitySyncAt: string | null;
  lastVulnerabilitySyncStatus: string | null;
  aclEnabled: boolean;
  aclConfig: AclConfig | null;
}

export interface UserInfo {
  username: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  avatar: string | null;
  locale: string | null;
  theme: string | null;
  preferences: Record<string, unknown> | null;
}

interface ContextValue {
  contexts: AppContext[];
  current: AppContext | null;
  setCurrent: (ctx: AppContext | null) => void;
  reload: () => Promise<AppContext[] | void>;
  reloadUser: () => Promise<void>;
  userRoles: string[];
  userInfo: UserInfo | null;
}

const Ctx = createContext<ContextValue>({
  contexts: [],
  current: null,
  setCurrent: () => {},
  reload: async () => {},
  reloadUser: async () => {},
  userRoles: [],
  userInfo: null,
});

export function useAppContext() {
  return useContext(Ctx);
}

export default function ContextProvider({ children }: { children: React.ReactNode }) {
  const [contexts, setContexts] = useState<AppContext[]>([]);
  const [current, setCurrentState] = useState<AppContext | null>(null);
  const [mounted, setMounted] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const { setTheme } = useTheme();
  const { setLocale } = useI18n();
  const prefsApplied = useRef(false);

  const reloadUser = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = await res.json();
        if (data?.roles) {
          setUserRoles(data.roles);
          setUserInfo({
            username: data.username,
            firstName: data.firstName ?? null,
            lastName: data.lastName ?? null,
            roles: data.roles,
            avatar: data.avatar ?? null,
            locale: data.locale ?? null,
            theme: data.theme ?? null,
            preferences: data.preferences ?? null,
          });

          // Apply user preferences on first load
          if (!prefsApplied.current) {
            prefsApplied.current = true;
            if (data.locale) {
              setLocale(data.locale as Locale);
            }
            if (data.theme) {
              setTheme(data.theme as ThemeMode);
            }
          }
        }
      }
    } catch {}
  }, [setLocale, setTheme]);

  const currentRef = useRef(current);
  currentRef.current = current;

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/contexts");
      if (res.ok) {
        const data: AppContext[] = await res.json();

        // Only update contexts if data actually changed (prevents unnecessary re-renders)
        setContexts((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });

        // Update current context with fresh data, or fallback if no longer accessible
        const cur = currentRef.current;
        if (cur) {
          const updated = data.find((c) => c.id === cur.id);
          if (updated) {
            // Only update if data actually changed (prevents downstream useEffect re-runs)
            setCurrentState((prev) => {
              if (prev && JSON.stringify(prev) === JSON.stringify(updated)) return prev;
              return updated;
            });
          } else {
            const fallback = data[0] ?? null;
            setCurrentState(fallback);
            if (fallback) {
              localStorage.setItem("currentContextId", String(fallback.id));
            } else {
              localStorage.removeItem("currentContextId");
            }
          }
        }

        return data;
      }
    } catch {}
    return [];
  }, []);

  useEffect(() => {
    reloadUser();

    reload().then((data) => {
      if (data && data.length > 0) {
        const storedId = localStorage.getItem("currentContextId");
        const found = storedId ? data.find((c) => c.id === Number(storedId)) : null;
        setCurrentState(found ?? data[0]);
      }
      setMounted(true);
    });
  }, [reload, reloadUser]);

  // Refresh contexts on window focus and every 30s
  useEffect(() => {
    const onFocus = () => { reload(); };
    window.addEventListener("focus", onFocus);

    const interval = setInterval(reload, 30_000);

    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [reload]);

  const setCurrent = (ctx: AppContext | null) => {
    setCurrentState(ctx);
    if (ctx) {
      localStorage.setItem("currentContextId", String(ctx.id));
    } else {
      localStorage.removeItem("currentContextId");
    }
  };

  if (!mounted) return null;

  return (
    <Ctx.Provider value={{ contexts, current, setCurrent, reload, reloadUser, userRoles, userInfo }}>
      {children}
    </Ctx.Provider>
  );
}
