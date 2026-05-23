"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  BookOpen,
  ChevronRight,
  Loader2,
  Check,
  Search,
  CircleUser,
  UserPlus,
  UserMinus,
  Copy,
  Trash2,
  Key,
} from "lucide-react";
import { NodeColumnsTab } from "@/components/NodeColumnsTab";

interface ContextUser {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  avatar: string | null;
}

interface AiModel {
  id: string;
  name: string;
  contextLength: number | null;
  pricing: { prompt: number; completion: number } | null;
  isFree: boolean;
  /** null when the provider doesn't expose this info (e.g. Ollama). */
  supportsTools: boolean | null;
  description: string | null;
  meta: Record<string, string> | null;
}

interface AiAssistantSummary {
  id: number;
  name: string;
  providerId: number;
  providerName: string;
  providerType: string;
  model: string | null;
  effectiveModel: string | null;
  systemPrompt: string | null;
  enabled: boolean;
  toolsEnabled: boolean;
  toolsSupported: boolean;
}

interface ApiTokenItem {
  id: number;
  name: string;
  tokenPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  expired: boolean;
}

type TabKey = "general" | "monitoring" | "vulnerability" | "systemUpdates" | "nodeColumns" | "members" | "lab" | "aiAssistant" | "apiTokens";

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

const VALID_TABS = ["general", "monitoring", "vulnerability", "systemUpdates", "nodeColumns", "members", "lab", "aiAssistant", "apiTokens"] as const;
const isValidTab = (v: string | null): v is TabKey => !!v && (VALID_TABS as readonly string[]).includes(v);

export default function SettingsPage() {
  const { t } = useI18n();
  const { current, reload } = useAppContext();
  const searchParams = useSearchParams();
  // Tab state is driven by ?tab=… so the vertical nav in the layout can deep-link
  // to a section. Falls back to "general" when the param is missing or unknown.
  const urlTab = searchParams.get("tab");
  const tab: TabKey = isValidTab(urlTab) ? urlTab : "general";

  // General
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Monitoring
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);

  // General — render switch for the floating "Suggest a feature" button.
  // The flag is part of the General save payload, alongside name/description.
  const [feedbackButtonEnabled, setFeedbackButtonEnabled] = useState(true);

  // Data Retention & Poll intervals
  const [snmpRetentionMinutes, setSnmpRetentionMinutes] = useState(120);
  const [snmpPollIntervalSeconds, setSnmpPollIntervalSeconds] = useState(60);
  const [icmpPollIntervalSeconds, setIcmpPollIntervalSeconds] = useState(60);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionSaved, setRetentionSaved] = useState(false);

  // Vulnerability
  const [vulnEnabled, setVulnEnabled] = useState(false);
  const [nvdApiKey, setNvdApiKey] = useState("");
  const [vulnSyncInterval, setVulnSyncInterval] = useState(24);
  const [vulnWeight, setVulnWeight] = useState(0.3);
  const [vulnSaving, setVulnSaving] = useState(false);
  const [vulnSaved, setVulnSaved] = useState(false);
  const [vulnSyncing, setVulnSyncing] = useState(false);

  // System Updates
  const [suEnabled, setSuEnabled] = useState(false);
  const [suWeight, setSuWeight] = useState(0.0);
  const [suSaving, setSuSaving] = useState(false);
  const [suSaved, setSuSaved] = useState(false);
  const [plugins, setPlugins] = useState<any[]>([]);
  const [pluginSyncing, setPluginSyncing] = useState<string | null>(null);

  // Lab
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [labCopied, setLabCopied] = useState(false);
  const [labSaving, setLabSaving] = useState(false);
  const [labSaved, setLabSaved] = useState(false);

  // Members
  const [allUsers, setAllUsers] = useState<ContextUser[]>([]);
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [membersSaving, setMembersSaving] = useState(false);
  const [membersSuccess, setMembersSuccess] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  // AI Assistants — multi-config per context. The tab lists the configured
  // assistants and lets the admin add / edit / remove them via a modal.
  const [assistants, setAssistants] = useState<AiAssistantSummary[]>([]);
  const [assistantEditing, setAssistantEditing] = useState<AiAssistantSummary | "new" | null>(null);
  const [assistantsLoading, setAssistantsLoading] = useState(false);
  const [aiProviders, setAiProviders] = useState<{ id: number; name: string; type: string; defaultModel: string | null; enabled: boolean }[]>([]);

  // API Tokens
  const [apiTokens, setApiTokens] = useState<ApiTokenItem[]>([]);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenExpiry, setNewTokenExpiry] = useState("none");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenCreating, setTokenCreating] = useState(false);

  useEffect(() => {
    if (current) {
      setName(current.name);
      setDescription(current.description ?? "");
      setMonitoringEnabled(current.monitoringEnabled);
      setFeedbackButtonEnabled(current.feedbackButtonEnabled ?? true);
      setSnmpRetentionMinutes(current.snmpRetentionMinutes ?? 120);
      setSnmpPollIntervalSeconds(current.snmpPollIntervalSeconds ?? 60);
      setIcmpPollIntervalSeconds(current.icmpPollIntervalSeconds ?? 60);
      setIsDefault(current.isDefault);
      setVulnEnabled(current.vulnerabilityEnabled ?? false);
      setNvdApiKey(current.nvdApiKey ?? "");
      setVulnSyncInterval(current.vulnerabilitySyncIntervalHours ?? 24);
      setVulnWeight(current.vulnerabilityScoreWeight ?? 0.3);
      setSuEnabled(current.systemUpdateEnabled ?? false);
      setSuWeight(current.systemUpdateScoreWeight ?? 0.0);
      setPublicEnabled(current.publicEnabled ?? false);
      setPublicToken(current.publicToken ?? null);
    }
  }, [current]);

  const loadMembers = useCallback(async () => {
    if (!current) return;
    const [usersRes, membersRes] = await Promise.all([
      fetch("/api/users"),
      fetch(`/api/contexts/${current.id}/users`),
    ]);
    if (usersRes.ok) setAllUsers(await usersRes.json());
    if (membersRes.ok) {
      const members: ContextUser[] = await membersRes.json();
      setMemberIds(new Set(members.map((u) => u.id)));
    }
  }, [current]);

  useEffect(() => {
    if (tab === "members") loadMembers();
  }, [tab, loadMembers]);

  const loadApiTokens = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/api-tokens?context=${current.id}`);
    if (res.ok) setApiTokens(await res.json());
  }, [current]);

  useEffect(() => {
    if (tab === "apiTokens") loadApiTokens();
  }, [tab, loadApiTokens]);

  // Providers are admin-managed; the assistant editor needs to pick one.
  // Load once when the tab opens.
  useEffect(() => {
    if (tab !== "aiAssistant") return;
    (async () => {
      const res = await fetch("/api/admin/llm/providers");
      if (res.ok) setAiProviders(await res.json());
    })();
  }, [tab]);

  const loadAssistants = useCallback(async () => {
    if (!current) return;
    setAssistantsLoading(true);
    try {
      const res = await fetch(`/api/contexts/${current.id}/ai-assistants`);
      if (res.ok) setAssistants(await res.json());
      else setAssistants([]);
    } finally {
      setAssistantsLoading(false);
    }
  }, [current]);

  useEffect(() => {
    if (tab === "aiAssistant") loadAssistants();
  }, [tab, loadAssistants]);

  const deleteAssistant = async (a: AiAssistantSummary) => {
    if (!confirm(t("settings.aiConfirmDelete", { name: a.name }))) return;
    await fetch(`/api/ai-assistants/${a.id}`, { method: "DELETE" });
    await loadAssistants();
  };

  const toggleAssistantEnabled = async (a: AiAssistantSummary) => {
    await fetch(`/api/ai-assistants/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !a.enabled }),
    });
    await loadAssistants();
  };

  const handleCreateToken = async () => {
    if (!current || !newTokenName.trim()) return;
    setTokenCreating(true);
    setCreatedToken(null);
    try {
      let expiresAt: string | null = null;
      if (newTokenExpiry !== "none") {
        const d = new Date();
        if (newTokenExpiry === "30d") d.setDate(d.getDate() + 30);
        else if (newTokenExpiry === "90d") d.setDate(d.getDate() + 90);
        else if (newTokenExpiry === "1y") d.setFullYear(d.getFullYear() + 1);
        expiresAt = d.toISOString();
      }
      const res = await fetch(`/api/api-tokens?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTokenName.trim(), expiresAt }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedToken(data.plaintext);
        setNewTokenName("");
        setNewTokenExpiry("none");
        await loadApiTokens();
      }
    } finally {
      setTokenCreating(false);
    }
  };

  const handleRevokeToken = async (tokenId: number) => {
    const res = await fetch(`/api/api-tokens/${tokenId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setApiTokens((prev) => prev.filter((t) => t.id !== tokenId));
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !name.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/contexts/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, monitoringEnabled, feedbackButtonEnabled }),
      });
      if (res.ok) {
        await reload();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  // Toggle is now local-only; the consolidated Monitoring tab persists
  // monitoringEnabled together with the poll/retention intervals via
  // handleSaveMonitoring, triggered from the header Save button.
  const toggleMonitoring = () => setMonitoringEnabled((v) => !v);

  const toggleMember = (userId: number) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const saveMembers = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!current) return;
    setMembersSaving(true);
    setMembersSuccess(false);
    try {
      const res = await fetch(`/api/contexts/${current.id}/users`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(memberIds) }),
      });
      if (res.ok) {
        setMembersSuccess(true);
        await reload();
        setTimeout(() => setMembersSuccess(false), 3000);
      }
    } finally {
      setMembersSaving(false);
    }
  };

  // Unified save for the merged Monitoring tab: pushes monitoringEnabled +
  // the three intervals in a single PUT. Replaces the old toggle-on-flip
  // auto-save and the separate retention save.
  const handleSaveMonitoring = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!current) return;
    setRetentionSaving(true);
    setRetentionSaved(false);
    try {
      const res = await fetch(`/api/contexts/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, monitoringEnabled, snmpRetentionMinutes, snmpPollIntervalSeconds, icmpPollIntervalSeconds }),
      });
      if (res.ok) {
        await reload();
        setRetentionSaved(true);
        setTimeout(() => setRetentionSaved(false), 2000);
      }
    } finally {
      setRetentionSaving(false);
    }
  };

  const handleSaveVulnerability = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!current?.id) return;
    setVulnSaving(true);
    try {
      const res = await fetch(`/api/contexts/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: current.name,
          vulnerabilityEnabled: vulnEnabled,
          nvdApiKey: nvdApiKey || null,
          vulnerabilitySyncIntervalHours: vulnSyncInterval,
          vulnerabilityScoreWeight: vulnWeight,
        }),
      });
      if (res.ok) {
        setVulnSaved(true);
        setTimeout(() => setVulnSaved(false), 2000);
        reload();
      }
    } finally {
      setVulnSaving(false);
    }
  };

  const handleSaveSystemUpdates = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!current) return;
    setSuSaving(true);
    try {
      const compW = Math.round((1 - vulnWeight - suWeight) * 100) / 100;
      await fetch(`/api/contexts/${current.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: current.name,
          systemUpdateEnabled: suEnabled,
          complianceScoreWeight: Math.max(0, compW),
          vulnerabilityScoreWeight: vulnWeight,
          systemUpdateScoreWeight: suWeight,
        }),
      });
    } finally {
      setSuSaving(false);
      setSuSaved(true);
      reload();
      setTimeout(() => setSuSaved(false), 2000);
    }
  };

  const handleSaveLab = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!current) return;
    setLabSaving(true);
    setLabSaved(false);
    try {
      const res = await fetch(`/api/contexts/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, description: description || null, monitoringEnabled,
          publicEnabled,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPublicToken(data.publicToken);
        await reload();
        setLabSaved(true);
        setTimeout(() => setLabSaved(false), 2000);
      }
    } finally {
      setLabSaving(false);
    }
  };

  const regenerateToken = async () => {
    if (!current) return;
    const res = await fetch(`/api/contexts/${current.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, description: description || null, monitoringEnabled,
        regenerateToken: true,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setPublicToken(data.publicToken);
      await reload();
    }
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (u.firstName ?? "").toLowerCase().includes(memberSearch.toLowerCase()) ||
      (u.lastName ?? "").toLowerCase().includes(memberSearch.toLowerCase())
  );

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: t("settings.tabGeneral") },
    { key: "monitoring", label: t("settings.tabMonitoring") },
    { key: "vulnerability", label: t("settings.tabVulnerability") },
    { key: "systemUpdates", label: t("settings.tabSystemUpdates") },
    { key: "nodeColumns" as TabKey, label: t("settings.tabNodeColumns") },
    ...(!isDefault ? [{ key: "members" as TabKey, label: t("settings.tabMembers") }] : []),
    { key: "lab" as TabKey, label: t("settings.tabLab") },
    { key: "aiAssistant" as TabKey, label: t("settings.tabAiAssistant") },
    { key: "apiTokens" as TabKey, label: t("settings.tabApiTokens") },
  ];

  if (!current) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  // Locate the current tab's label so we can show it as a subheading. The
  // vertical nav (in the layout) already highlights the active item; this just
  // gives the content pane its own title.
  const activeLabel = tabs.find((item) => item.key === tab)?.label ?? "";

  // Save action descriptor per tab. Each entry pairs a form id (so the header
  // button can submit the matching <form> via the HTML5 `form` attribute) with
  // the tab-local saving/saved state and any extra disable condition. Tabs
  // without a save action (nodeColumns, apiTokens) get null.
  const SAVE_ACTIONS: Partial<Record<TabKey, { formId: string; saving: boolean; saved: boolean; disabled?: boolean }>> = {
    general: { formId: "settings-form-general", saving, saved, disabled: !name.trim() },
    monitoring: { formId: "settings-form-monitoring", saving: retentionSaving, saved: retentionSaved },
    vulnerability: { formId: "settings-form-vulnerability", saving: vulnSaving, saved: vulnSaved },
    systemUpdates: { formId: "settings-form-systemUpdates", saving: suSaving, saved: suSaved },
    members: { formId: "settings-form-members", saving: membersSaving, saved: membersSuccess },
    lab: { formId: "settings-form-lab", saving: labSaving, saved: labSaved },
  };
  const saveAction = SAVE_ACTIONS[tab];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{activeLabel}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("settings.subtitle", { name: current.name })}
          </p>
        </div>
        {saveAction && (
          <button
            type="submit"
            form={saveAction.formId}
            disabled={saveAction.saving || saveAction.disabled}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {saveAction.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saveAction.saved ? <Check className="h-4 w-4" /> : null}
            {saveAction.saved ? t("settings.saved") : t("common.save")}
          </button>
        )}
      </div>

      {/* General tab */}
      {tab === "general" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <form id="settings-form-general" onSubmit={handleSaveGeneral} className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className={labelClass}>{t("settings.nameLabel")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>{t("settings.descriptionLabel")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder={t("settings.descriptionPlaceholder")}
              />
            </div>
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("settings.feedbackButtonLabel")}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t("settings.feedbackButtonHelp")}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={feedbackButtonEnabled}
                onClick={() => setFeedbackButtonEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                  feedbackButtonEnabled ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                    feedbackButtonEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Monitoring tab */}
      {tab === "monitoring" && (
        <form id="settings-form-monitoring" onSubmit={handleSaveMonitoring} className="space-y-4">
          {/* Enable switch */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("settings.monitoringLabel")}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t("settings.monitoringHelp")}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={monitoringEnabled}
                onClick={toggleMonitoring}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                  monitoringEnabled ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                    monitoringEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Poll / retention intervals — kept editable even when monitoring
              is off so the user can pre-configure values before enabling. */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("settings.retentionTitle")}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t("settings.retentionHelp")}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("settings.icmpIntervalLabel")}</label>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("settings.icmpIntervalHelp")}</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="5"
                    max="3600"
                    value={icmpPollIntervalSeconds}
                    onChange={(e) => setIcmpPollIntervalSeconds(Math.max(5, Number(e.target.value)))}
                    className="w-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">{t("settings.seconds")}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("settings.pollIntervalLabel")}</label>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("settings.pollIntervalHelp")}</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="5"
                    max="3600"
                    value={snmpPollIntervalSeconds}
                    onChange={(e) => setSnmpPollIntervalSeconds(Math.max(5, Number(e.target.value)))}
                    className="w-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">{t("settings.seconds")}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("settings.snmpRetentionLabel")}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="43200"
                    value={snmpRetentionMinutes}
                    onChange={(e) => setSnmpRetentionMinutes(Math.max(1, Number(e.target.value)))}
                    className="w-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">{t("settings.minutes")}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    ({Math.floor(snmpRetentionMinutes / 60)}{t("settings.hours")}{snmpRetentionMinutes % 60 > 0 ? ` ${snmpRetentionMinutes % 60}min` : ""})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Members tab */}
      {tab === "members" && (
        <form id="settings-form-members" onSubmit={saveMembers} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t("settings.tabMembers")}
              </h2>
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                {memberIds.size}
              </span>
            </div>
          </div>

          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t("settings.searchMembers")}
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredUsers.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <CircleUser className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">{t("settings.noUsers")}</p>
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isMember = memberIds.has(user.id);
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between px-6 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {user.avatar ? (
                        <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <CircleUser className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.username}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {user.username}
                          {user.roles.includes("ROLE_ADMIN") && (
                            <span className="ml-2 text-slate-500 dark:text-slate-400">Admin</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {isMember && isDefault ? (
                      <span className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 dark:text-slate-500">
                        <Check className="h-4 w-4" />
                        {t("settings.memberLocked")}
                      </span>
                    ) : (
                      <button
                        onClick={() => toggleMember(user.id)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                          isMember
                            ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                            : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                        }`}
                      >
                        {isMember ? (
                          <>
                            <UserMinus className="h-4 w-4" />
                            {t("settings.removeMember")}
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4" />
                            {t("settings.addMember")}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </form>
      )}

      {tab === "vulnerability" && (
        <form id="settings-form-vulnerability" onSubmit={handleSaveVulnerability} className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t("settings.tabVulnerability")}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("settings.vulnEnabledHelp")}</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className={labelClass}>{t("settings.vulnEnabled")}</label>
                </div>
                <button
                  type="button"
                  onClick={() => setVulnEnabled(!vulnEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${vulnEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${vulnEnabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {vulnEnabled && (
                <>
                  {/* NVD API Key */}
                  <div>
                    <label className={labelClass}>{t("settings.vulnApiKey")}</label>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t("settings.vulnApiKeyHelp")}</p>
                    <input
                      type="password"
                      value={nvdApiKey}
                      onChange={(e) => setNvdApiKey(e.target.value)}
                      className={inputClass}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    />
                  </div>

                  {/* Sync interval */}
                  <div>
                    <label className={labelClass}>{t("settings.vulnSyncInterval")}</label>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t("settings.vulnSyncIntervalHelp")}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={vulnSyncInterval}
                        onChange={(e) => setVulnSyncInterval(Math.max(1, parseInt(e.target.value) || 1))}
                        className={inputClass + " w-24"}
                      />
                      <span className="text-sm text-slate-500 dark:text-slate-400">{t("settings.hours")}</span>
                    </div>
                  </div>

                  {/* Score weights */}
                  <div>
                    <label className={labelClass}>{t("settings.vulnWeightLabel")}</label>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t("settings.vulnWeightHelp")}</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400">{t("settings.complianceWeight")}</label>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          value={Math.round((1 - vulnWeight) * 100) / 100}
                          onChange={(e) => {
                            const cw = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                            setVulnWeight(Math.round((1 - cw) * 100) / 100);
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400">{t("settings.vulnerabilityWeight")}</label>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          value={vulnWeight}
                          onChange={(e) => setVulnWeight(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sync now */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={async () => {
                        if (!current?.id) return;
                        setVulnSyncing(true);
                        await fetch("/api/vulnerabilities/sync", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ contextId: current.id }),
                        });
                        setTimeout(() => setVulnSyncing(false), 2000);
                      }}
                      disabled={vulnSyncing}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      {vulnSyncing ? t("settings.vulnSyncing") : t("settings.vulnSyncNow")}
                    </button>
                    {current?.lastVulnerabilitySyncAt && (
                      <span className="text-xs text-slate-400">
                        {t("settings.vulnLastSync").replace("{date}", new Date(current.lastVulnerabilitySyncAt).toLocaleString())}
                      </span>
                    )}
                    {!current?.lastVulnerabilitySyncAt && (
                      <span className="text-xs text-slate-400">{t("settings.vulnNeverSynced")}</span>
                    )}
                  </div>
                </>
              )}

            </div>
          </div>
        </form>
      )}

      {tab === "systemUpdates" && (
        <form id="settings-form-systemUpdates" onSubmit={handleSaveSystemUpdates} className="space-y-6">
          {/* Enable toggle */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("settings.systemUpdateEnabled")}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.systemUpdateEnabledHelp")}</p>
              </div>
              <button type="button" onClick={() => setSuEnabled(!suEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${suEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${suEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {/* Score weights (all 3) */}
            <div>
              <label className={labelClass}>{t("settings.vulnWeightLabel")}</label>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t("settings.vulnWeightHelp")}</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">{t("settings.complianceWeight")}</label>
                  <input type="number" min={0} max={1} step={0.05}
                    value={Math.round((1 - vulnWeight - suWeight) * 100) / 100}
                    onChange={(e) => {
                      const cw = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      const remaining = Math.max(0, 1 - cw);
                      const ratio = vulnWeight + suWeight > 0 ? vulnWeight / (vulnWeight + suWeight) : 0.5;
                      setVulnWeight(Math.round(remaining * ratio * 100) / 100);
                      setSuWeight(Math.round(remaining * (1 - ratio) * 100) / 100);
                    }}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">{t("settings.vulnerabilityWeight")}</label>
                  <input type="number" min={0} max={1} step={0.05}
                    value={vulnWeight}
                    onChange={(e) => {
                      const vw = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      setVulnWeight(vw);
                      const compW = Math.round((1 - vw - suWeight) * 100) / 100;
                      if (compW < 0) setSuWeight(Math.round((1 - vw) * 100) / 100);
                    }}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">{t("settings.systemUpdateWeight")}</label>
                  <input type="number" min={0} max={1} step={0.05}
                    value={suWeight}
                    onChange={(e) => {
                      const sw = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      setSuWeight(sw);
                      const compW = Math.round((1 - vulnWeight - sw) * 100) / 100;
                      if (compW < 0) setVulnWeight(Math.round((1 - sw) * 100) / 100);
                    }}
                    className={inputClass} />
                </div>
              </div>
            </div>

          </div>

          {/* Vendor plugins */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("settings.pluginsTitle")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.pluginsHelp")}</p>
            <PluginManager contextId={current?.id} t={t} plugins={plugins} setPlugins={setPlugins} pluginSyncing={pluginSyncing} setPluginSyncing={setPluginSyncing} />
          </div>
        </form>
      )}

      {tab === "nodeColumns" && current && (
        <NodeColumnsTab contextId={current.id} />
      )}

      {tab === "apiTokens" && (
        <div className="space-y-6">
          {/* Documentation link — moved here from the sidebar so tokens and
              the public API reference live in one place. */}
          <Link
            href="/documentation"
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm px-6 py-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-slate-500 dark:text-slate-400" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("settings.apiDocsTitle")}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("settings.apiDocsDesc")}</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>

          {/* Create token form */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("settings.apiTokensTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.apiTokensDesc")}</p>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <label className={labelClass}>{t("settings.apiTokenName")}</label>
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder={t("settings.apiTokenNamePlaceholder")}
                  className={inputClass}
                />
              </div>
              <div className="w-48 space-y-1.5">
                <label className={labelClass}>{t("settings.apiTokenExpires")}</label>
                <select
                  value={newTokenExpiry}
                  onChange={(e) => setNewTokenExpiry(e.target.value)}
                  className={inputClass}
                >
                  <option value="none">{t("settings.apiTokenNoExpiry")}</option>
                  <option value="30d">{t("settings.apiToken30Days")}</option>
                  <option value="90d">{t("settings.apiToken90Days")}</option>
                  <option value="1y">{t("settings.apiToken1Year")}</option>
                </select>
              </div>
              <button
                onClick={handleCreateToken}
                disabled={tokenCreating || !newTokenName.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {tokenCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                <Key className="h-4 w-4" />
                {t("settings.apiTokenCreate")}
              </button>
            </div>

            {/* One-time token display */}
            {createdToken && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 space-y-2">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{t("settings.apiTokenCreated")}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 select-all">
                    {createdToken}
                  </code>
                  <button
                    onClick={() => {
                      if (navigator.clipboard && window.isSecureContext) {
                        navigator.clipboard.writeText(createdToken).then(() => {
                          setTokenCopied(true);
                          setTimeout(() => setTokenCopied(false), 2000);
                        });
                      } else {
                        const textArea = document.createElement("textarea");
                        textArea.value = createdToken;
                        textArea.style.position = "fixed";
                        textArea.style.left = "-9999px";
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand("copy");
                        document.body.removeChild(textArea);
                        setTokenCopied(true);
                        setTimeout(() => setTokenCopied(false), 2000);
                      }
                    }}
                    className="shrink-0 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    {tokenCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Token list */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            {apiTokens.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Key className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">{t("settings.apiTokenNoTokens")}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {apiTokens.map((token) => (
                  <div key={token.id} className="flex items-center justify-between px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{token.name}</span>
                        <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
                          {token.tokenPrefix}...
                        </code>
                        {token.expired && (
                          <span className="rounded-full bg-red-100 dark:bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                            {t("settings.apiTokenExpiredAt")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                        <span>{new Date(token.createdAt).toLocaleDateString()}</span>
                        <span>
                          {token.lastUsedAt
                            ? t("settings.apiTokenLastUsed", { date: new Date(token.lastUsedAt).toLocaleDateString() })
                            : t("settings.apiTokenNeverUsed")}
                        </span>
                        {token.expiresAt && !token.expired && (
                          <span>{t("settings.apiTokenExpiresAt", { date: new Date(token.expiresAt).toLocaleDateString() })}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(t("settings.apiTokenConfirmRevoke"))) {
                          handleRevokeToken(token.id);
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("settings.apiTokenRevoke")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "lab" && (
        <form id="settings-form-lab" onSubmit={handleSaveLab} className="space-y-6">
          {/* Enable/Disable */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("settings.labTitle")}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.labDesc")}</p>
              </div>
              <button
                onClick={() => setPublicEnabled(!publicEnabled)}
                className="p-1"
              >
                {publicEnabled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    <Check className="h-3 w-3" />
                    {t("settings.labActive")}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t("settings.labInactive")}
                  </span>
                )}
              </button>
            </div>
          </div>

          {publicEnabled && (
            <>
              {/* Public URL */}
              {publicToken && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("settings.labUrl")}</h2>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/lab/${publicToken}`}
                      className={`${inputClass} font-mono text-xs`}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/lab/${publicToken}`;
                        if (navigator.clipboard && window.isSecureContext) {
                          navigator.clipboard.writeText(url).then(() => {
                            setLabCopied(true);
                            setTimeout(() => setLabCopied(false), 2000);
                          });
                        } else {
                          // Fallback for non-HTTPS contexts
                          const textArea = document.createElement("textarea");
                          textArea.value = url;
                          textArea.style.position = "fixed";
                          textArea.style.left = "-9999px";
                          document.body.appendChild(textArea);
                          textArea.select();
                          document.execCommand("copy");
                          document.body.removeChild(textArea);
                          setLabCopied(true);
                          setTimeout(() => setLabCopied(false), 2000);
                        }
                      }}
                      className="shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      {labCopied ? <Check className="h-4 w-4 text-emerald-500" /> : t("settings.labCopy")}
                    </button>
                  </div>
                  <button
                    onClick={regenerateToken}
                    className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {t("settings.labRegenerate")}
                  </button>
                </div>
              )}
            </>
          )}

        </form>
      )}

      {tab === "aiAssistant" && current && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.aiAssistantsDesc")}</p>
            <button
              type="button"
              onClick={() => setAssistantEditing("new")}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100"
            >
              + {t("settings.aiAddAssistant")}
            </button>
          </div>

          {assistantsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : assistants.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.aiNoAssistants")}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
              {assistants.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.name}</h3>
                      {!a.enabled && (
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {t("llm.statusDisabled")}
                        </span>
                      )}
                      {a.toolsEnabled && (
                        <span className="rounded-full bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-500/20">
                          {t("settings.aiBadgeTools")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {a.providerName} ({a.providerType}) · {a.effectiveModel ?? t("settings.aiNoModel")}
                    </p>
                    {a.systemPrompt && (
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 line-clamp-1">{a.systemPrompt}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleAssistantEnabled(a)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${a.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                      aria-label={t("settings.aiToggle")}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${a.enabled ? "translate-x-5" : "translate-x-1"}`} />
                    </button>
                    <button
                      onClick={() => setAssistantEditing(a)}
                      className="rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {t("llm.edit")}
                    </button>
                    <button
                      onClick={() => deleteAssistant(a)}
                      className="rounded-lg p-2 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {assistantEditing && (
            <AssistantEditorModal
              contextId={current.id}
              providers={aiProviders}
              assistant={assistantEditing === "new" ? null : assistantEditing}
              onClose={() => setAssistantEditing(null)}
              onSaved={async () => {
                setAssistantEditing(null);
                await loadAssistants();
              }}
              t={t}
              inputClass={inputClass}
              labelClass={labelClass}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Assistant editor modal ─── */

interface AssistantEditorProvider {
  id: number;
  name: string;
  type: string;
  defaultModel: string | null;
  enabled: boolean;
}

function AssistantEditorModal({
  contextId,
  providers,
  assistant,
  onClose,
  onSaved,
  t,
  inputClass,
  labelClass,
}: {
  contextId: number;
  providers: AssistantEditorProvider[];
  assistant: AiAssistantSummary | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  t: (k: string, v?: Record<string, string>) => string;
  inputClass: string;
  labelClass: string;
}) {
  const isNew = assistant === null;
  const [name, setName] = useState(assistant?.name ?? "");
  const [providerId, setProviderId] = useState<number | null>(assistant?.providerId ?? providers.find((p) => p.enabled)?.id ?? null);
  const [model, setModel] = useState(assistant?.model ?? "");
  const [systemPrompt, setSystemPrompt] = useState(assistant?.systemPrompt ?? "");
  const [enabled, setEnabled] = useState(assistant?.enabled ?? true);
  const [toolsEnabled, setToolsEnabled] = useState(assistant?.toolsEnabled ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tool-calling only works on OpenAI-compatible providers (OpenRouter,
  // OpenAI). Anthropic and Ollama-native use other dialects we haven't wired
  // yet — we surface that as a hint instead of just silently disabling.
  const selectedProviderType = providers.find((p) => p.id === providerId)?.type ?? null;
  const toolsSupportedHere = selectedProviderType === "openrouter" || selectedProviderType === "openai";

  const [models, setModels] = useState<AiModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const [search, setSearch] = useState("");

  // Refresh the model list when the chosen provider changes. Same caveat as
  // before — some providers expose a /v1/models endpoint with rich metadata,
  // others don't, so we fall back to a free-text input.
  useEffect(() => {
    if (!providerId) {
      setModels([]);
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/llm/providers/${providerId}/models`);
        if (res.ok) {
          setModels(await res.json());
        } else {
          const data = await res.json().catch(() => ({}));
          setModels([]);
          setModelsError(data.error ?? `HTTP ${res.status}`);
        }
      } catch (e: any) {
        setModels([]);
        setModelsError(e?.message ?? String(e));
      } finally {
        setModelsLoading(false);
      }
    })();
  }, [providerId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !providerId) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        providerId,
        model: model || null,
        systemPrompt: systemPrompt || null,
        enabled,
        toolsEnabled,
      };
      const url = isNew
        ? `/api/contexts/${contextId}/ai-assistants`
        : `/api/ai-assistants/${assistant!.id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await onSaved();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {isNew ? t("settings.aiAddAssistant") : t("settings.aiEditAssistant")}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            ×
          </button>
        </div>
        <form onSubmit={save} className="space-y-4 p-6">
          <div className="space-y-1.5">
            <label className={labelClass}>{t("settings.aiAssistantName")}</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required placeholder={t("settings.aiAssistantNamePlaceholder")} />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>{t("settings.aiProvider")}</label>
            <select
              className={inputClass}
              value={providerId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setProviderId(v === "" ? null : Number(v));
                setModel("");
              }}
            >
              <option value="">— {t("settings.aiNoProvider")} —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.enabled}>
                  {p.name} ({p.type}){!p.enabled ? ` · ${t("llm.statusDisabled")}` : ""}
                </option>
              ))}
            </select>
          </div>

          {providerId && (
            <div className="space-y-1.5">
              <label className={labelClass}>{t("settings.aiModel")}</label>
              <p className="text-xs text-slate-400 dark:text-slate-500">{t("settings.aiModelHelp")}</p>
              {modelsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("settings.aiLoadingModels")}
                </div>
              ) : models.length > 0 ? (
                <AiModelPicker
                  models={models}
                  value={model}
                  onChange={setModel}
                  onlyFree={onlyFree}
                  setOnlyFree={setOnlyFree}
                  search={search}
                  setSearch={setSearch}
                  toolsRequired={toolsEnabled}
                  t={t}
                />
              ) : (
                <>
                  <input className={inputClass} value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("settings.aiModelPlaceholder")} />
                  {modelsError && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{t("settings.aiModelsListError", { error: modelsError })}</p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className={labelClass}>{t("settings.aiSystemPrompt")}</label>
            <p className="text-xs text-slate-400 dark:text-slate-500">{t("settings.aiSystemPromptHelp")}</p>
            <textarea
              rows={5}
              className={`${inputClass} resize-y`}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t("settings.aiSystemPromptPlaceholder")}
            />
          </div>

          <div className="flex items-start justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("settings.aiToolsEnabled")}</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t("settings.aiToolsEnabledHelp")}</p>
              {!toolsSupportedHere && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t("settings.aiToolsUnsupported")}</p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={toolsEnabled}
              onClick={() => setToolsEnabled((v) => !v)}
              disabled={!toolsSupportedHere}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${toolsEnabled ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${toolsEnabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("llm.fieldEnabled")}</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t("settings.aiAssistantEnabledHelp")}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {error && <p className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !providerId}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── AI model picker ─── */

function formatPricePerMillion(perToken: number | null): string {
  if (perToken === null) return "";
  const perMillion = perToken * 1_000_000;
  if (perMillion === 0) return "$0";
  if (perMillion < 0.01) return `$${perMillion.toFixed(4)}`;
  if (perMillion < 1) return `$${perMillion.toFixed(3)}`;
  return `$${perMillion.toFixed(2)}`;
}

function formatContextLength(tokens: number | null): string {
  if (!tokens) return "";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

/**
 * A dropdown for picking an AI model. Closed by default — clicking the trigger
 * opens a panel anchored beneath it that shows the same enriched list (search,
 * "free only" filter, per-row badges). The trigger summarises the current
 * selection so the dropdown collapses back to a single line when not interacting.
 */
function AiModelPicker({
  models,
  value,
  onChange,
  onlyFree,
  setOnlyFree,
  search,
  setSearch,
  toolsRequired,
  t,
}: {
  models: AiModel[];
  value: string;
  onChange: (id: string) => void;
  onlyFree: boolean;
  setOnlyFree: (v: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
  /**
   * When the assistant has tools enabled, default the "tools only" filter
   * to true. This prevents the user from picking a model that will then
   * error out at chat time with "no endpoints support tool use".
   */
  toolsRequired: boolean;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  const [open, setOpen] = useState(false);
  const [toolsOnly, setToolsOnly] = useState(toolsRequired);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep `toolsOnly` in sync if the parent toggles tools after the picker
  // has been mounted — flipping tools on retroactively narrows the list.
  useEffect(() => {
    if (toolsRequired) setToolsOnly(true);
  }, [toolsRequired]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = models.filter((m) => {
    if (onlyFree && !m.isFree) return false;
    // `supportsTools === null` means the provider didn't tell us — keep it
    // in the list rather than hiding a potentially-working model.
    if (toolsOnly && m.supportsTools === false) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return m.id.toLowerCase().includes(s) || m.name.toLowerCase().includes(s);
  });
  const freeCount = models.filter((m) => m.isFree).length;
  const toolsCount = models.filter((m) => m.supportsTools === true).length;
  const selected = models.find((m) => m.id === value) ?? null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-left text-sm text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 flex-wrap min-w-0">
          {selected ? (
            <>
              <span className="font-medium truncate">{selected.name}</span>
              {selected.isFree && (
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                  {t("settings.aiBadgeFree")}
                </span>
              )}
              {selected.supportsTools === true && (
                <span className="rounded-full bg-indigo-100 dark:bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                  {t("settings.aiBadgeTools")}
                </span>
              )}
              {toolsRequired && selected.supportsTools === false && (
                <span className="rounded-full bg-red-100 dark:bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">
                  {t("settings.aiBadgeNoTools")}
                </span>
              )}
              {selected.contextLength && (
                <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">
                  {formatContextLength(selected.contextLength)} {t("settings.aiTokens")}
                </span>
              )}
              {selected.pricing && !selected.isFree && (
                <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">
                  {t("settings.aiPricePerMillion", {
                    in: formatPricePerMillion(selected.pricing.prompt),
                    out: formatPricePerMillion(selected.pricing.completion),
                  })}
                </span>
              )}
            </>
          ) : (
            <span className="italic text-slate-500 dark:text-slate-400">— {t("settings.aiUseProviderDefault")} —</span>
          )}
        </span>
        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
          <div className="border-b border-slate-100 dark:border-slate-800 p-2 flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              placeholder={t("settings.aiSearchModelsPlaceholder")}
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
            />
            <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyFree}
                onChange={(e) => setOnlyFree(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              {t("settings.aiOnlyFree")}
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                {freeCount}
              </span>
            </label>
            <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={toolsOnly}
                onChange={(e) => setToolsOnly(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              {t("settings.aiOnlyTools")}
              <span className="rounded-full bg-indigo-100 dark:bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-300">
                {toolsCount}
              </span>
            </label>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                value === ""
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              <span className="italic">— {t("settings.aiUseProviderDefault")} —</span>
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-slate-400">{t("settings.aiNoModelMatch")}</div>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col gap-1 px-3 py-2 text-left text-sm transition-colors ${
                    value === m.id
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{m.name}</span>
                    {m.isFree && (
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        {t("settings.aiBadgeFree")}
                      </span>
                    )}
                    {m.supportsTools === true && (
                      <span className="rounded-full bg-indigo-100 dark:bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                        {t("settings.aiBadgeTools")}
                      </span>
                    )}
                    {m.contextLength && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                        {formatContextLength(m.contextLength)} {t("settings.aiTokens")}
                      </span>
                    )}
                    {m.pricing && !m.isFree && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                        {t("settings.aiPricePerMillion", {
                          in: formatPricePerMillion(m.pricing.prompt),
                          out: formatPricePerMillion(m.pricing.completion),
                        })}
                      </span>
                    )}
                    {m.meta?.parameters && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                        {m.meta.parameters}
                      </span>
                    )}
                    {m.meta?.quantization && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                        {m.meta.quantization}
                      </span>
                    )}
                  </div>
                  {m.id !== m.name && (
                    <code className="text-[11px] text-slate-400 dark:text-slate-500">{m.id}</code>
                  )}
                  {m.description && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{m.description}</span>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            {t("settings.aiModelCount", { shown: String(filtered.length), total: String(models.length) })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Plugin Manager ─── */

function PluginManager({ contextId, t, plugins, setPlugins, pluginSyncing, setPluginSyncing }: {
  contextId: number | undefined;
  t: (k: string, v?: Record<string, string>) => string;
  plugins: any[];
  setPlugins: (p: any[]) => void;
  pluginSyncing: string | null;
  setPluginSyncing: (s: string | null) => void;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!contextId || loaded) return;
    (async () => {
      const res = await fetch(`/api/plugins?context=${contextId}`, { credentials: "include" });
      if (res.ok) setPlugins(await res.json());
      setLoaded(true);
    })();
  }, [contextId, loaded, setPlugins]);

  const togglePlugin = async (identifier: string, enabled: boolean) => {
    await fetch(`/api/plugins/${identifier}?context=${contextId}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setPlugins(plugins.map((p) => p.identifier === identifier ? { ...p, enabled } : p));
  };

  const syncPlugin = async (identifier: string) => {
    setPluginSyncing(identifier);
    await fetch(`/api/plugins/${identifier}/sync?context=${contextId}`, {
      method: "POST", credentials: "include",
    });
    setTimeout(() => setPluginSyncing(null), 3000);
  };

  if (!loaded) return <div className="text-sm text-slate-400">...</div>;
  if (plugins.length === 0) return <p className="text-sm text-slate-400">{t("settings.pluginNoPlugins")}</p>;

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {plugins.map((plugin) => (
        <div key={plugin.identifier} className="flex items-center justify-between py-3">
          <div>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{plugin.displayName}</span>
            <span className="ml-2 text-xs text-slate-400">{plugin.supportedManufacturers?.join(", ")}</span>
            {plugin.lastSyncAt && (
              <p className="text-xs text-slate-400 mt-0.5">
                {t("settings.pluginLastSync", { date: new Date(plugin.lastSyncAt).toLocaleString() })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => togglePlugin(plugin.identifier, !plugin.enabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${plugin.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}>
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${plugin.enabled ? "translate-x-5" : "translate-x-1"}`} />
            </button>
            {plugin.enabled && (
              <button onClick={() => syncPlugin(plugin.identifier)}
                disabled={pluginSyncing === plugin.identifier}
                className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50">
                {pluginSyncing === plugin.identifier ? t("settings.pluginSyncing") : t("settings.pluginSyncNow")}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
