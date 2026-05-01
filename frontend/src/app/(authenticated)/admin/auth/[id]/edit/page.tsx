"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { ArrowLeft, Loader2, Check, Trash2, Plus, KeyRound, AlertCircle, CheckCircle2 } from "lucide-react";

interface Provider {
  id: number;
  slug: string;
  name: string;
  enabled: boolean;
  discoveryUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  scopes: string;
  buttonLabel: string | null;
  buttonColor: string | null;
  buttonIconUrl: string | null;
  claimUsername: string;
  claimEmail: string;
  claimFirstname: string;
  claimLastname: string;
  claimRoles: string;
  claimGroups: string | null;
  requiredRole: string | null;
  autoProvisioning: boolean;
  defaultContextId: number | null;
  isReady: boolean;
}

interface RoleMapping { id: number; claimValue: string; grantedRole: string; priority: number; }
interface ContextMapping { id: number; claimValue: string; contextId: number; contextName: string | null; }
interface ContextOption { id: number; name: string; }
interface TestResult {
  ok: boolean;
  issuer?: string | null;
  authorizationEndpoint?: string | null;
  tokenEndpoint?: string | null;
  jwksUri?: string | null;
  userinfoEndpoint?: string | null;
  error?: string;
}

type Tab = "general" | "appearance" | "roles" | "contexts" | "test";
const SECRET_PLACEHOLDER = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
const AVAILABLE_ROLES = ["ROLE_ADMIN"] as const;

interface AppearanceTemplate {
  id: string;
  name: string;
  label: string;
  color: string;
  iconUrl: string;
}

const APPEARANCE_TEMPLATES: AppearanceTemplate[] = [
  { id: "google",     name: "Google",     label: "Sign in with Google",     color: "#ffffff", iconUrl: "https://cdn.simpleicons.org/google" },
  { id: "microsoft",  name: "Microsoft",  label: "Sign in with Microsoft",  color: "#ffffff", iconUrl: "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2023%2023%22%3E%3Cpath%20fill%3D%22%23F25022%22%20d%3D%22M0%200h11v11H0z%22%2F%3E%3Cpath%20fill%3D%22%237FBA00%22%20d%3D%22M12%200h11v11H12z%22%2F%3E%3Cpath%20fill%3D%22%2300A4EF%22%20d%3D%22M0%2012h11v11H0z%22%2F%3E%3Cpath%20fill%3D%22%23FFB900%22%20d%3D%22M12%2012h11v11H12z%22%2F%3E%3C%2Fsvg%3E" },
  { id: "apple",      name: "Apple",      label: "Sign in with Apple",      color: "#000000", iconUrl: "https://cdn.simpleicons.org/apple/ffffff" },
  { id: "github",     name: "GitHub",     label: "Sign in with GitHub",     color: "#24292f", iconUrl: "https://cdn.simpleicons.org/github/ffffff" },
  { id: "gitlab",     name: "GitLab",     label: "Sign in with GitLab",     color: "#FC6D26", iconUrl: "https://cdn.simpleicons.org/gitlab/ffffff" },
  { id: "keycloak",   name: "Keycloak",   label: "Sign in with Keycloak",   color: "#4D4D4D", iconUrl: "https://cdn.simpleicons.org/keycloak/ffffff" },
  { id: "authentik",  name: "Authentik",  label: "Sign in with Authentik",  color: "#FD4B2D", iconUrl: "https://cdn.simpleicons.org/authentik/ffffff" },
  { id: "auth0",      name: "Auth0",      label: "Sign in with Auth0",      color: "#EB5424", iconUrl: "https://cdn.simpleicons.org/auth0/ffffff" },
  { id: "okta",       name: "Okta",       label: "Sign in with Okta",       color: "#007DC1", iconUrl: "https://cdn.simpleicons.org/okta/ffffff" },
  { id: "discord",    name: "Discord",    label: "Sign in with Discord",    color: "#5865F2", iconUrl: "https://cdn.simpleicons.org/discord/ffffff" },
];

function pickTextColor(bg: string | null | undefined): string {
  if (!bg) return "";
  const hex = bg.replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#ffffff";
}

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const thClass = "px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider";

export default function EditProviderPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useI18n();
  const providerId = params.id as string;

  const [tab, setTab] = useState<Tab>("general");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [roles, setRoles] = useState<RoleMapping[]>([]);
  const [contexts, setContexts] = useState<ContextMapping[]>([]);
  const [allContexts, setAllContexts] = useState<ContextOption[]>([]);
  const [secretInput, setSecretInput] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p, r, cm, ctx] = await Promise.all([
      fetch(`/api/admin/oidc/providers/${providerId}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/admin/oidc/providers/${providerId}/role-mappings`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/admin/oidc/providers/${providerId}/context-mappings`).then((res) => (res.ok ? res.json() : [])),
      fetch("/api/contexts").then((res) => (res.ok ? res.json() : [])),
    ]);
    setProvider(p);
    setRoles(r);
    setContexts(cm);
    setAllContexts(ctx);
    setLoading(false);
  }, [providerId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const save = async () => {
    if (!provider) return;
    setSaving(true);
    setSaved(false);
    const payload: Record<string, unknown> = {
      name: provider.name,
      slug: provider.slug,
      enabled: provider.enabled,
      discoveryUrl: provider.discoveryUrl,
      clientId: provider.clientId,
      scopes: provider.scopes,
      buttonLabel: provider.buttonLabel,
      buttonColor: provider.buttonColor,
      buttonIconUrl: provider.buttonIconUrl,
      claimUsername: provider.claimUsername,
      claimEmail: provider.claimEmail,
      claimFirstname: provider.claimFirstname,
      claimLastname: provider.claimLastname,
      claimRoles: provider.claimRoles,
      claimGroups: provider.claimGroups,
      requiredRole: provider.requiredRole,
      autoProvisioning: provider.autoProvisioning,
      defaultContextId: provider.defaultContextId,
    };
    if (secretInput !== null) payload.clientSecret = secretInput;

    const res = await fetch(`/api/admin/oidc/providers/${providerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setProvider(await res.json());
      setSecretInput(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" /></div>;
  if (!provider) return null;

  const callbackUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/auth/oidc/${provider.slug}/callback`
    : `/api/auth/oidc/${provider.slug}/callback`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/auth" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" />
          {t("admin_oidc.back")}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{provider.name}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{provider.slug}</code>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {t("admin_oidc.save")}
            </button>
            {saved && <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /> {t("admin_oidc.saved")}</span>}
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex gap-1">
          {([
            ["general", t("admin_oidc.tabGeneral")],
            ["appearance", t("admin_oidc.tabAppearance")],
            ["roles", t("admin_oidc.tabRoles")],
            ["contexts", t("admin_oidc.tabContexts")],
            ["test", t("admin_oidc.tabTest")],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "general" && <GeneralTab provider={provider} setProvider={setProvider} contexts={allContexts} secretInput={secretInput} setSecretInput={setSecretInput} callbackUrl={callbackUrl} />}
      {tab === "appearance" && <AppearanceTab provider={provider} setProvider={setProvider} />}
      {tab === "roles" && <RolesTab providerId={providerId} mappings={roles} reload={loadAll} />}
      {tab === "contexts" && <ContextsTab providerId={providerId} mappings={contexts} options={allContexts} reload={loadAll} />}
      {tab === "test" && <TestTab providerId={providerId} discoveryUrl={provider.discoveryUrl} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-500" />
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
    </label>
  );
}

function GeneralTab({ provider, setProvider, contexts, secretInput, setSecretInput, callbackUrl }: {
  provider: Provider; setProvider: (p: Provider) => void; contexts: ContextOption[];
  secretInput: string | null; setSecretInput: (v: string | null) => void; callbackUrl: string;
}) {
  const { t } = useI18n();
  const update = <K extends keyof Provider>(k: K, v: Provider[K]) => setProvider({ ...provider, [k]: v });

  return (
    <div className="space-y-6">
      <Section title={t("admin_oidc.sectionActivation")}>
        <Toggle label={t("admin_oidc.enableProvider")} checked={provider.enabled} onChange={(v) => update("enabled", v)} />
      </Section>

      <Section title={t("admin_oidc.sectionIdentity")}>
        <Field label={t("admin_oidc.callbackUrl")} hint={t("admin_oidc.callbackUrlHint")}>
          <input className={`${inputClass} font-mono text-xs`} value={callbackUrl} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
        </Field>
        <Field label={t("admin_oidc.discoveryUrl")} hint={t("admin_oidc.discoveryUrlHint")}>
          <input className={inputClass} value={provider.discoveryUrl ?? ""} onChange={(e) => update("discoveryUrl", e.target.value || null)} />
        </Field>
        <Field label={t("admin_oidc.clientId")}>
          <input className={inputClass} value={provider.clientId ?? ""} onChange={(e) => update("clientId", e.target.value || null)} />
        </Field>
        <Field label={t("admin_oidc.clientSecret")}>
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            placeholder={provider.clientSecret === SECRET_PLACEHOLDER ? t("admin_oidc.clientSecretSet") : t("admin_oidc.clientSecretEnter")}
            value={secretInput ?? ""}
            onChange={(e) => setSecretInput(e.target.value)}
          />
          {provider.clientSecret === SECRET_PLACEHOLDER && secretInput === null && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("admin_oidc.clientSecretReplace")}</p>
          )}
        </Field>
        <Field label={t("admin_oidc.scopes")} hint={t("admin_oidc.scopesHint")}>
          <input className={inputClass} value={provider.scopes} onChange={(e) => update("scopes", e.target.value)} />
        </Field>
      </Section>

      <Section title={t("admin_oidc.sectionClaims")}>
        <Field label={t("admin_oidc.claimUsername")}>
          <input className={inputClass} value={provider.claimUsername} onChange={(e) => update("claimUsername", e.target.value)} />
        </Field>
        <Field label={t("admin_oidc.claimEmail")}>
          <input className={inputClass} value={provider.claimEmail} onChange={(e) => update("claimEmail", e.target.value)} />
        </Field>
        <Field label={t("admin_oidc.claimFirstname")}>
          <input className={inputClass} value={provider.claimFirstname} onChange={(e) => update("claimFirstname", e.target.value)} />
        </Field>
        <Field label={t("admin_oidc.claimLastname")}>
          <input className={inputClass} value={provider.claimLastname} onChange={(e) => update("claimLastname", e.target.value)} />
        </Field>
        <Field label={t("admin_oidc.claimRoles")} hint={t("admin_oidc.claimRolesHint")}>
          <input className={inputClass} value={provider.claimRoles} onChange={(e) => update("claimRoles", e.target.value)} />
        </Field>
        <Field label={t("admin_oidc.claimGroups")} hint={t("admin_oidc.claimGroupsHint")}>
          <input className={inputClass} value={provider.claimGroups ?? ""} onChange={(e) => update("claimGroups", e.target.value || null)} placeholder="Ex: groups" />
        </Field>
      </Section>

      <Section title={t("admin_oidc.sectionAccess")}>
        <Field label={t("admin_oidc.requiredRole")} hint={t("admin_oidc.requiredRoleHint")}>
          <input className={inputClass} value={provider.requiredRole ?? ""} onChange={(e) => update("requiredRole", e.target.value || null)} placeholder="auditix-user" />
        </Field>
        <Toggle label={t("admin_oidc.autoProvisioning")} checked={provider.autoProvisioning} onChange={(v) => update("autoProvisioning", v)} />
        <Field label={t("admin_oidc.defaultContext")} hint={t("admin_oidc.defaultContextHint")}>
          <select className={inputClass} value={provider.defaultContextId ?? ""} onChange={(e) => update("defaultContextId", e.target.value ? parseInt(e.target.value) : null)}>
            <option value="">{t("admin_oidc.noneOption")}</option>
            {contexts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </Section>
    </div>
  );
}

function AppearanceTab({ provider, setProvider }: { provider: Provider; setProvider: (p: Provider) => void }) {
  const { t } = useI18n();
  const update = <K extends keyof Provider>(k: K, v: Provider[K]) => setProvider({ ...provider, [k]: v });
  const previewLabel = provider.buttonLabel ?? t("auth.ssoLogin");
  const previewBg = provider.buttonColor || undefined;
  const previewTextColor = pickTextColor(provider.buttonColor);

  const applyTemplate = (tpl: AppearanceTemplate) => {
    setProvider({
      ...provider,
      buttonLabel: tpl.label,
      buttonColor: tpl.color,
      buttonIconUrl: tpl.iconUrl,
    });
  };

  const reset = () => {
    setProvider({ ...provider, buttonLabel: null, buttonColor: null, buttonIconUrl: null });
  };

  return (
    <div className="space-y-6">
      <Section title={t("admin_oidc.templates")}>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("admin_oidc.templatesHint")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {APPEARANCE_TEMPLATES.map((tpl) => {
            const txt = pickTextColor(tpl.color);
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="group flex flex-col items-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-sm transition-all"
                title={`${t("admin_oidc.useTemplate")} : ${tpl.name}`}
              >
                <div
                  className="flex items-center justify-center w-full h-10 rounded-md border"
                  style={{ backgroundColor: tpl.color, color: txt, borderColor: tpl.color === "#ffffff" ? "#e2e8f0" : tpl.color }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tpl.iconUrl} alt="" className="h-5 w-5 object-contain" />
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{tpl.name}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={reset} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline">
          {t("admin_oidc.resetAppearance")}
        </button>
      </Section>

      <Section title={t("admin_oidc.sectionAppearance")}>
        <Field label={t("admin_oidc.buttonLabel")} hint={t("admin_oidc.buttonLabelHint")}>
          <input className={inputClass} value={provider.buttonLabel ?? ""} onChange={(e) => update("buttonLabel", e.target.value || null)} placeholder={t("admin_oidc.buttonLabelPlaceholder")} />
        </Field>
        <Field label={t("admin_oidc.buttonColor")} hint={t("admin_oidc.buttonColorHint")}>
          <div className="flex gap-2">
            <input
              type="color"
              value={provider.buttonColor && /^#[0-9a-f]{6}$/i.test(provider.buttonColor) ? provider.buttonColor : "#2563eb"}
              onChange={(e) => update("buttonColor", e.target.value)}
              className="h-10 w-12 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            />
            <input className={inputClass} value={provider.buttonColor ?? ""} onChange={(e) => update("buttonColor", e.target.value || null)} placeholder="#2563eb" />
          </div>
        </Field>
        <Field label={t("admin_oidc.buttonIconUrl")} hint={t("admin_oidc.buttonIconUrlHint")}>
          <input className={inputClass} value={provider.buttonIconUrl ?? ""} onChange={(e) => update("buttonIconUrl", e.target.value || null)} placeholder="https://example.com/icon.svg" />
        </Field>
      </Section>

      <Section title={t("admin_oidc.preview")}>
        <div className="flex items-center justify-center p-8 rounded-lg bg-slate-50 dark:bg-slate-950">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors min-w-[280px]"
            style={previewBg ? { backgroundColor: previewBg, color: previewTextColor, borderColor: previewBg === "#ffffff" ? "#e2e8f0" : previewBg } : undefined}
          >
            {provider.buttonIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={provider.buttonIconUrl} alt="" className="h-4 w-4 object-contain" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {previewLabel}
          </button>
        </div>
      </Section>
    </div>
  );
}

function RolesTab({ providerId, mappings, reload }: { providerId: string; mappings: RoleMapping[]; reload: () => Promise<void> }) {
  const { t } = useI18n();
  const [claim, setClaim] = useState("");
  const [role, setRole] = useState<string>(AVAILABLE_ROLES[0]);
  const [priority, setPriority] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const res = await fetch(`/api/admin/oidc/providers/${providerId}/role-mappings`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimValue: claim.trim(), grantedRole: role.trim(), priority }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Error"); return; }
    setClaim(""); await reload();
  };
  const remove = async (id: number) => {
    await fetch(`/api/admin/oidc/role-mappings/${id}`, { method: "DELETE" });
    await reload();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">{t("admin_oidc.rolesIntro")}</p>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className={thClass}>{t("admin_oidc.claimValue")}</th>
              <th className={thClass}>{t("admin_oidc.grantedRole")}</th>
              <th className={thClass}>{t("admin_oidc.priority")}</th>
              <th className={`${thClass} text-right`}>{t("admin_oidc.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {mappings.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-sm text-slate-400 dark:text-slate-500">{t("admin_oidc.noRoleMappings")}</td></tr>
            ) : mappings.map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-3 text-sm"><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{m.claimValue}</code></td>
                <td className="px-5 py-3 text-sm"><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{m.grantedRole}</code></td>
                <td className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400">{m.priority}</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => remove(m.id)} className="rounded-lg p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("admin_oidc.addMapping")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className={inputClass} placeholder={t("admin_oidc.claimValue")} value={claim} onChange={(e) => setClaim(e.target.value)} />
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
            {AVAILABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className={inputClass} type="number" value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 0)} placeholder={t("admin_oidc.priority")} />
          <button onClick={add} disabled={!claim.trim()} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50">
            <Plus className="h-4 w-4" /> {t("admin_oidc.add")}
          </button>
        </div>
        {error && <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400"><AlertCircle className="h-4 w-4" /> {error}</p>}
      </div>
    </div>
  );
}

function ContextsTab({ providerId, mappings, options, reload }: { providerId: string; mappings: ContextMapping[]; options: ContextOption[]; reload: () => Promise<void> }) {
  const { t } = useI18n();
  const [claim, setClaim] = useState("");
  const [contextId, setContextId] = useState<number>(options[0]?.id ?? 0);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const res = await fetch(`/api/admin/oidc/providers/${providerId}/context-mappings`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimValue: claim.trim(), contextId }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Error"); return; }
    setClaim(""); await reload();
  };
  const remove = async (id: number) => {
    await fetch(`/api/admin/oidc/context-mappings/${id}`, { method: "DELETE" });
    await reload();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">{t("admin_oidc.contextsIntro")}</p>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className={thClass}>{t("admin_oidc.claimValue")}</th>
              <th className={thClass}>{t("admin_oidc.context")}</th>
              <th className={`${thClass} text-right`}>{t("admin_oidc.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {mappings.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-12 text-center text-sm text-slate-400 dark:text-slate-500">{t("admin_oidc.noContextMappings")}</td></tr>
            ) : mappings.map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-3 text-sm"><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{m.claimValue}</code></td>
                <td className="px-5 py-3 text-sm">{m.contextName ?? `#${m.contextId}`}</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => remove(m.id)} className="rounded-lg p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("admin_oidc.addMapping")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className={inputClass} placeholder={t("admin_oidc.claimValue")} value={claim} onChange={(e) => setClaim(e.target.value)} />
          <select className={inputClass} value={contextId} onChange={(e) => setContextId(parseInt(e.target.value))}>
            {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={add} disabled={!claim.trim() || !contextId} className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50">
            <Plus className="h-4 w-4" /> {t("admin_oidc.add")}
          </button>
        </div>
        {error && <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400"><AlertCircle className="h-4 w-4" /> {error}</p>}
      </div>
    </div>
  );
}

function TestTab({ providerId, discoveryUrl }: { providerId: string; discoveryUrl: string | null }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(discoveryUrl ?? "");
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    const res = await fetch(`/api/admin/oidc/providers/${providerId}/test`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discoveryUrl: url.trim() }),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "Invalid response" }));
    setResult({ ok: res.ok && data.ok !== false, ...data });
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">{t("admin_oidc.testIntro")}</p>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <Field label={t("admin_oidc.discoveryUrl")}>
          <input className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <button onClick={run} disabled={loading || !url.trim()} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {t("admin_oidc.testButton")}
        </button>
      </div>

      {result?.ok && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 space-y-2 text-sm">
          <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> {t("admin_oidc.testSuccess")}
          </p>
          <dl className="grid grid-cols-1 gap-1 text-slate-700 dark:text-slate-300">
            <Detail label={t("admin_oidc.issuer")} value={result.issuer} />
            <Detail label={t("admin_oidc.authorizationEndpoint")} value={result.authorizationEndpoint} />
            <Detail label={t("admin_oidc.tokenEndpoint")} value={result.tokenEndpoint} />
            <Detail label={t("admin_oidc.jwksUri")} value={result.jwksUri} />
            <Detail label={t("admin_oidc.userinfoEndpoint")} value={result.userinfoEndpoint} />
          </dl>
        </div>
      )}
      {result && !result.ok && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-400">
          <p className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> {t("admin_oidc.testError")}</p>
          <p className="mt-1">{result.error ?? "Error"}</p>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
      <dt className="font-medium text-slate-600 dark:text-slate-400 sm:w-48">{label}</dt>
      <dd className="text-xs font-mono text-slate-900 dark:text-slate-200 break-all">{value}</dd>
    </div>
  );
}
