"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import { MailEditor, type Block } from "@/components/MailEditor";
import {
  ArrowLeft,
  Loader2,
  Save,
  Send,
  Smartphone,
  Monitor,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface MailReport {
  id: number;
  name: string;
  subject: string;
  preheader: string | null;
  description: string | null;
  locale: string;
  type: string;
  blocks: Block[];
  recipientUserIds: number[];
  recipientExternalEmails: string[];
  sendingStatus: string | null;
  lastSentAt: string | null;
  lastError: string | null;
  theme: { id: number; name: string };
  mailServer: { id: number; name: string } | null;
  sendHistory: Array<{ at: string; recipients?: string[]; count?: number; status: string; error?: string }>;
}

interface ContextUser {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface ThemeRef { id: number; name: string }
interface MailServerRef { id: number; name: string; enabled: boolean }

type Tab = "general" | "editor" | "history";

export default function MailReportDetailPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);

  const [report, setReport] = useState<MailReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [tab, setTab] = useState<Tab>("general");
  const [contextUsers, setContextUsers] = useState<ContextUser[]>([]);
  const [themes, setThemes] = useState<ThemeRef[]>([]);
  const [servers, setServers] = useState<MailServerRef[]>([]);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendNotice, setSendNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const dateLocale =
    locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/mail-reports/${id}`);
    if (res.ok) {
      const data = await res.json();
      setReport(data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/mail-reports/recipients/users?context=${current.id}`).then(async (r) => {
      if (r.ok) setContextUsers(await r.json());
    });
    fetch(`/api/report-themes?context=${current.id}`).then(async (r) => {
      if (r.ok) setThemes(await r.json());
    });
    fetch(`/api/mail-reports/mail-servers`).then(async (r) => {
      if (r.ok) setServers(await r.json());
    }).catch(() => setServers([]));
  }, [current]);

  const update = (patch: Partial<MailReport>) => setReport((r) => (r ? { ...r, ...patch } : r));

  const save = async () => {
    if (!report) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/mail-reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: report.name,
          subject: report.subject,
          preheader: report.preheader,
          description: report.description,
          blocks: report.blocks,
          themeId: report.theme.id,
          mailServerId: report.mailServer ? report.mailServer.id : null,
          recipientUserIds: report.recipientUserIds,
          recipientExternalEmails: report.recipientExternalEmails,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    if (!report) return;
    setSendBusy(true);
    setSendNotice(null);
    try {
      const res = await fetch(`/api/mail-reports/${report.id}/send`, { method: "POST" });
      if (res.ok) {
        setSendNotice({ kind: "ok", text: t("mail_reports.sendSuccess") });
        setTimeout(load, 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setSendNotice({ kind: "err", text: data.error ? `${t("mail_reports.sendError")}: ${data.error}` : t("mail_reports.sendError") });
      }
    } catch (e) {
      setSendNotice({ kind: "err", text: t("mail_reports.sendError") });
    } finally {
      setSendBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }
  if (!report) return null;

  const tabBtn = (k: Tab, label: string) => (
    <button
      onClick={() => setTab(k)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        tab === k
          ? "border-blue-500 text-slate-900 dark:text-white"
          : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/reports/mail")} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="h-4 w-4 text-slate-500" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{report.name}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{report.subject || "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sendNotice && (
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
              sendNotice.kind === "ok"
                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300"
            }`}>
              {sendNotice.kind === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {sendNotice.text}
            </span>
          )}
          <button
            onClick={send}
            disabled={sendBusy || !report.mailServer}
            title={!report.mailServer ? t("mail_reports.noServerWarning") : undefined}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {sendBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sendBusy ? t("mail_reports.sending") : t("mail_reports.send")}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savedFlash ? t("mail_reports.saved") : t("mail_reports.save")}
          </button>
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-1">
        {tabBtn("general", t("mail_reports.tab_general"))}
        {tabBtn("editor", t("mail_reports.tab_editor"))}
        {tabBtn("history", t("mail_reports.tab_history"))}
      </div>

      {tab === "general" && (
        <GeneralTab
          report={report}
          themes={themes}
          servers={servers}
          contextUsers={contextUsers}
          onChange={update}
        />
      )}

      {tab === "editor" && current && (
        <EditorTab report={report} onChange={update} contextId={current.id} />
      )}

      {tab === "history" && (
        <HistoryTab report={report} dateLocale={dateLocale} />
      )}
    </div>
  );
}

function GeneralTab({
  report,
  themes,
  servers,
  contextUsers,
  onChange,
}: {
  report: MailReport;
  themes: ThemeRef[];
  servers: MailServerRef[];
  contextUsers: ContextUser[];
  onChange: (patch: Partial<MailReport>) => void;
}) {
  const { t } = useI18n();
  const [externalDraft, setExternalDraft] = useState("");

  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400/30";
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5";
  const card = "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5";

  const toggleUser = (userId: number) => {
    const ids = report.recipientUserIds.includes(userId)
      ? report.recipientUserIds.filter((x) => x !== userId)
      : [...report.recipientUserIds, userId];
    onChange({ recipientUserIds: ids });
  };

  const addExternal = (raw: string) => {
    const cleaned = raw.trim().replace(/[,;]+$/, "");
    if (!cleaned) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return;
    if (report.recipientExternalEmails.includes(cleaned)) return;
    onChange({ recipientExternalEmails: [...report.recipientExternalEmails, cleaned] });
    setExternalDraft("");
  };

  const removeExternal = (email: string) => {
    onChange({ recipientExternalEmails: report.recipientExternalEmails.filter((e) => e !== email) });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{t("mail_reports.general_section")}</h2>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>{t("mail_reports.name")}</label>
            <input className={inputCls} value={report.name} onChange={(e) => onChange({ name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>{t("mail_reports.subject")}</label>
            <input className={inputCls} value={report.subject} onChange={(e) => onChange({ subject: e.target.value })} placeholder={t("mail_reports.subjectPlaceholder")} />
          </div>
          <div>
            <label className={labelCls}>{t("mail_reports.preheader")}</label>
            <input className={inputCls} value={report.preheader ?? ""} onChange={(e) => onChange({ preheader: e.target.value })} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("mail_reports.preheaderHint")}</p>
          </div>
          <div>
            <label className={labelCls}>{t("mail_reports.theme")}</label>
            <select
              className={inputCls}
              value={report.theme.id}
              onChange={(e) => {
                const tId = parseInt(e.target.value, 10);
                const tn = themes.find((x) => x.id === tId);
                if (tn) onChange({ theme: { id: tn.id, name: tn.name } });
              }}
            >
              {themes.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{t("mail_reports.delivery_section")}</h2>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>{t("mail_reports.mailServer")}</label>
            <select
              className={inputCls}
              value={report.mailServer ? report.mailServer.id : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) { onChange({ mailServer: null }); return; }
                const srv = servers.find((s) => s.id === parseInt(v, 10));
                onChange({ mailServer: srv ? { id: srv.id, name: srv.name } : null });
              }}
            >
              <option value="">{t("mail_reports.mailServerNone")}</option>
              {servers.filter((s) => s.enabled).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("mail_reports.mailServerHint")}</p>
          </div>
          {!report.mailServer && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {t("mail_reports.noServerWarning")}
            </div>
          )}
        </div>
      </section>

      <section className={`${card} lg:col-span-2`}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{t("mail_reports.recipients_section")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelCls}>{t("mail_reports.contextUsers")}</label>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 max-h-60 overflow-y-auto bg-slate-50/50 dark:bg-slate-800/30">
              {contextUsers.length === 0 ? (
                <div className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">—</div>
              ) : (
                contextUsers.map((u) => {
                  const checked = report.recipientUserIds.includes(u.id);
                  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username;
                  return (
                    <label key={u.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors ${u.email ? "" : "opacity-60"}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!u.email}
                        onChange={() => toggleUser(u.id)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{fullName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email ?? "—"}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("mail_reports.externalEmails")}</label>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 min-h-[42px]">
              {report.recipientExternalEmails.map((email) => (
                <span key={email} className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 text-xs px-2 py-0.5">
                  {email}
                  <button onClick={() => removeExternal(email)} className="hover:text-blue-900 dark:hover:text-blue-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={externalDraft}
                onChange={(e) => setExternalDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addExternal(externalDraft);
                  } else if (e.key === "Backspace" && !externalDraft && report.recipientExternalEmails.length > 0) {
                    removeExternal(report.recipientExternalEmails[report.recipientExternalEmails.length - 1]);
                  }
                }}
                onBlur={() => addExternal(externalDraft)}
                placeholder={t("mail_reports.externalEmailPlaceholder")}
                className="flex-1 min-w-[160px] bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("mail_reports.externalEmailsHint")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function EditorTab({ report, onChange, contextId }: { report: MailReport; onChange: (patch: Partial<MailReport>) => void; contextId: number }) {
  const { t } = useI18n();
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const payload = useMemo(
    () => ({ blocks: report.blocks, subject: report.subject, preheader: report.preheader, themeId: report.theme.id }),
    [report.blocks, report.subject, report.preheader, report.theme.id]
  );

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mail-reports/preview?context=${contextId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) setPreviewHtml(await res.text());
      } catch {/* ignore */}
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [payload, contextId]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-[70vh]">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 overflow-y-auto max-h-[80vh]">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t("mail_reports.blocks_section")}</h2>
        <MailEditor blocks={report.blocks} onChange={(blocks) => onChange({ blocks })} />
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/40 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("mail_reports.preview")}</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDevice("desktop")}
              className={`p-1.5 rounded ${device === "desktop" ? "bg-slate-200 dark:bg-slate-700" : "hover:bg-slate-100 dark:hover:bg-slate-800"} transition-colors`}
              title={t("mail_reports.previewDesktop")}
            >
              <Monitor className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </button>
            <button
              onClick={() => setDevice("mobile")}
              className={`p-1.5 rounded ${device === "mobile" ? "bg-slate-200 dark:bg-slate-700" : "hover:bg-slate-100 dark:hover:bg-slate-800"} transition-colors`}
              title={t("mail_reports.previewMobile")}
            >
              <Smartphone className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </button>
          </div>
        </div>
        <div className="flex-1 flex justify-center items-start p-3 overflow-auto">
          <iframe
            title="mail-preview"
            srcDoc={previewHtml}
            className="bg-white shadow-md transition-all"
            style={{
              width: device === "desktop" ? "100%" : 380,
              maxWidth: device === "desktop" ? 720 : 380,
              minHeight: "70vh",
              border: 0,
              borderRadius: 8,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ report, dateLocale }: { report: MailReport; dateLocale: string }) {
  const { t } = useI18n();
  const card = "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden";

  if (!report.sendHistory || report.sendHistory.length === 0) {
    return (
      <div className={`${card} p-12 text-center`}>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("mail_reports.historyEmpty")}</p>
      </div>
    );
  }

  return (
    <div className={card}>
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
            <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("mail_reports.historyAt")}</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("mail_reports.status")}</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("mail_reports.historyRecipients")}</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("mail_reports.historyError")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {[...report.sendHistory].reverse().map((h, idx) => (
            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
              <td className="px-5 py-3 text-sm text-slate-700 dark:text-slate-300">{new Date(h.at).toLocaleString(dateLocale)}</td>
              <td className="px-5 py-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  h.status === "sent"
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300"
                }`}>
                  {h.status === "sent" ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {h.status === "sent" ? t("mail_reports.statusSent") : t("mail_reports.statusFailed")}
                </span>
              </td>
              <td className="px-5 py-3 text-sm text-slate-700 dark:text-slate-300 max-w-md">
                {h.recipients ? (
                  <span title={h.recipients.join(", ")}>{h.count} · {h.recipients.slice(0, 3).join(", ")}{(h.recipients.length > 3) ? "…" : ""}</span>
                ) : "—"}
              </td>
              <td className="px-5 py-3 text-xs text-red-600 dark:text-red-400 max-w-md truncate" title={h.error}>{h.error || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
