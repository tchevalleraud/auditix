"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  Save,
  CheckCircle2,
  BookOpen,
  LayoutList,
  Settings,
  Trash2,
  ToggleLeft,
  ToggleRight,
  FileSpreadsheet,
  Presentation,
  X,
  Plus,
  Tag,
  Play,
  Eye,
  FileText,
} from "lucide-react";

import StructureEditor, { type ReportBlock } from "@/components/StructureEditor";

interface ReportDetail {
  id: number;
  name: string;
  description: string | null;
  type: string;
  title: string;
  subtitle: string | null;
  showTableOfContents: boolean;
  showAuthorsPage: boolean;
  showRevisionPage: boolean;
  showIllustrationsPage: boolean;
  tags: string[] | null;
  blocks: ReportBlock[];
  theme: { id: number; name: string } | null;
  generatingStatus: string | null;
  generatedAt: string | null;
  generatedFile: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface ThemeOption {
  id: number;
  name: string;
  isDefault: boolean;
}

const tabKeys = ["general", "structure", "live", "settings"] as const;
type TabKey = (typeof tabKeys)[number];

export default function ReportDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { current } = useAppContext();
  const reportId = Number(id);

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // General tab fields
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [docType, setDocType] = useState<"word" | "powerpoint">("word");
  const [showToc, setShowToc] = useState(true);
  const [showAuthors, setShowAuthors] = useState(true);
  const [showRevision, setShowRevision] = useState(false);
  const [showIllustrations, setShowIllustrations] = useState(false);
  const [selectedThemeId, setSelectedThemeId] = useState<number | null>(null);

  // Settings tab fields
  const [reportName, setReportName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Structure blocks
  const [blocks, setBlocks] = useState<ReportBlock[]>([]);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; visible: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, visible: true });
    toastTimer.current = setTimeout(() => {
      setToast((prev) => prev ? { ...prev, visible: false } : null);
      setTimeout(() => setToast(null), 300);
    }, 2000);
  }, []);

  // Themes list
  const [themes, setThemes] = useState<ThemeOption[]>([]);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // PDF cache-bust key
  const [pdfKey, setPdfKey] = useState(0);

  const esRef = useRef<EventSource | null>(null);

  const loadReport = useCallback(async () => {
    const res = await fetch(`/api/reports/${reportId}`);
    if (!res.ok) {
      router.push("/reports/list");
      return;
    }
    const data: ReportDetail = await res.json();
    setReport(data);
    setTitle(data.title || "");
    setSubtitle(data.subtitle || "");
    setDocType(data.type as "word" | "powerpoint");
    setShowToc(data.showTableOfContents);
    setShowAuthors(data.showAuthorsPage);
    setShowRevision(data.showRevisionPage);
    setShowIllustrations(data.showIllustrationsPage);
    setSelectedThemeId(data.theme?.id ?? null);
    setReportName(data.name);
    setReportDescription(data.description || "");
    setTags(data.tags || []);
    setBlocks(data.blocks || []);
    setGenerating(!!data.generatingStatus);
    setLoading(false);
  }, [reportId, router]);

  const loadThemes = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/report-themes?context=${current.id}`);
    if (res.ok) {
      const data = await res.json();
      setThemes(data.map((t: { id: number; name: string; isDefault: boolean }) => ({
        id: t.id,
        name: t.name,
        isDefault: t.isDefault,
      })));
    }
  }, [current]);

  useEffect(() => {
    loadReport();
    loadThemes();
  }, [loadReport, loadThemes]);

  // Mercure SSE for generation status
  useEffect(() => {
    const url = new URL("/.well-known/mercure", window.location.origin);
    url.searchParams.append("topic", `reports/${reportId}`);
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === "generation") {
        if (data.status === "running") {
          setGenerating(true);
        } else if (data.status === "completed") {
          setGenerating(false);
          setReport((prev) =>
            prev
              ? {
                  ...prev,
                  generatingStatus: null,
                  generatedAt: data.generatedAt,
                  generatedFile: `reports/${reportId}/report.pdf`,
                }
              : prev
          );
          setPdfKey((k) => k + 1);
        } else if (data.status === "failed") {
          setGenerating(false);
          setReport((prev) =>
            prev ? { ...prev, generatingStatus: null } : prev
          );
        }
      }
    };
    return () => {
      es.close();
    };
  }, [reportId]);

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await fetch(`/api/reports/${reportId}/generate`, { method: "POST" });
    if (!res.ok) {
      setGenerating(false);
    } else {
      const data = await res.json();
      setReport(data);
    }
  };

  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          showTableOfContents: showToc,
          showAuthorsPage: showAuthors,
          showRevisionPage: showRevision,
          showIllustrationsPage: showIllustrations,
          themeId: selectedThemeId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        showToast(t("reports.saved"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reportName.trim(),
          description: reportDescription.trim() || null,
          tags: tags.length > 0 ? tags : null,
          type: docType,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        showToast(t("reports.saved"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBlocks = async (newBlocks: ReportBlock[]) => {
    setBlocks(newBlocks);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: newBlocks }),
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        showToast(t("reports.saved"));
      }
    } catch {
      // silently fail
    }
  };

  const handleDelete = async () => {
    await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
    router.push("/reports/list");
  };

  const addTag = () => {
    const val = tagInput.trim();
    if (val && !tags.includes(val)) {
      setTags([...tags, val]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

  if (loading || !report) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  const leftTabs = [
    { key: "general" as TabKey, label: t("reports.tabGeneral"), icon: <BookOpen className="h-4 w-4" /> },
    { key: "structure" as TabKey, label: t("reports.tabStructure"), icon: <LayoutList className="h-4 w-4" /> },
  ];

  const rightTabs = [
    { key: "live" as TabKey, label: t("reports.tabLive"), icon: <Eye className="h-4 w-4" /> },
    { key: "settings" as TabKey, label: t("reports.tabSettings"), icon: <Settings className="h-4 w-4" /> },
  ];

  const isGenerating = generating || !!report.generatingStatus;
  const hasGeneratedFile = !!report.generatedFile;

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/reports/list"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-slate-400" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              {report.type === "powerpoint" ? (
                <Presentation className="h-5 w-5 text-orange-500" />
              ) : (
                <FileSpreadsheet className="h-5 w-5 text-blue-500" />
              )}
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{report.name}</h1>
            </div>
            {report.description && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{report.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isGenerating ? t("reports.generating") : t("reports.generate")}
        </button>
      </div>

      {/* Tabs + Content */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Main content area */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6">
            <div className="flex gap-1">
              {leftTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === tab.key
                      ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-1">
              {rightTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === tab.key
                      ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          {activeTab === "general" && (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
              {/* Title & Subtitle */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("reports.documentTitle")}</h2>
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("reports.titleLabel")}</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("reports.titlePlaceholder")}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("reports.subtitleLabel")}</label>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder={t("reports.subtitlePlaceholder")}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Theme */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("reports.themeLabel")}</h2>
                <select
                  value={selectedThemeId ?? ""}
                  onChange={(e) => setSelectedThemeId(e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                >
                  <option value="">{t("reports.noTheme")}</option>
                  {themes.map((th) => (
                    <option key={th.id} value={th.id}>
                      {th.name}{th.isDefault ? ` (${t("common.default")})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Document options */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("reports.documentOptions")}</h2>
                <div className="space-y-3">
                  {[
                    { key: "toc", label: t("reports.optionToc"), value: showToc, set: setShowToc },
                    { key: "authors", label: t("reports.optionAuthors"), value: showAuthors, set: setShowAuthors },
                    { key: "revision", label: t("reports.optionRevision"), value: showRevision, set: setShowRevision },
                    { key: "illustrations", label: t("reports.optionIllustrations"), value: showIllustrations, set: setShowIllustrations },
                  ].map((opt) => (
                    <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
                      <button type="button" onClick={() => opt.set(!opt.value)}>
                        {opt.value ? (
                          <ToggleRight className="h-6 w-6 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-slate-400" />
                        )}
                      </button>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Save button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveGeneral}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t("common.save")}
                </button>
              </div>
            </div>
          )}

          {activeTab === "structure" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0">
                <StructureEditor
                  blocks={blocks}
                  onChange={handleSaveBlocks}
                  t={t}
                />
              </div>
            </div>
          )}

          {activeTab === "live" && (
            <div className="flex-1 flex flex-col min-h-0 gap-4">
              {isGenerating ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-12 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t("reports.generatingDesc")}</p>
                </div>
              ) : hasGeneratedFile ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <FileText className="h-4 w-4" />
                      {t("reports.generatedAt", { date: new Date(report.generatedAt!).toLocaleString() })}
                    </div>
                  </div>
                  <iframe
                    key={pdfKey}
                    src={`/api/reports/${reportId}/download#toolbar=1&navpanes=0`}
                    className="w-full border-0 flex-1"
                    title="Report PDF"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-12 flex flex-col items-center justify-center gap-4">
                  <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t("reports.noDocument")}</p>
                  <button
                    onClick={handleGenerate}
                    className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    {t("reports.generate")}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "settings" && (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
              {/* Name & Description */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("reports.settingsGeneral")}</h2>
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("reports.colName")}</label>
                  <input
                    type="text"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                    placeholder={t("reports.namePlaceholder")}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("reports.colDescription")}</label>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    rows={3}
                    placeholder={t("reports.descriptionPlaceholder")}
                    className={`${inputClass} resize-none`}
                  />
                </div>
              </div>

              {/* Document type */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("reports.documentType")}</h2>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDocType("word")}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                      docType === "word"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400"
                        : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <FileSpreadsheet className="h-5 w-5" />
                    Word / PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocType("powerpoint")}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                      docType === "powerpoint"
                        ? "border-orange-500 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400"
                        : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Presentation className="h-5 w-5" />
                    PowerPoint / PDF
                  </button>
                </div>
              </div>

              {/* Tags */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("reports.tagsLabel")}</h2>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      <Tag className="h-3 w-3" />
                      {tag}
                      <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-red-500">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder={t("reports.tagPlaceholder")}
                    className={inputClass}
                  />
                  <button
                    onClick={addTag}
                    disabled={!tagInput.trim()}
                    className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Save button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveSettings}
                  disabled={saving || !reportName.trim()}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t("common.save")}
                </button>
              </div>

              {/* Danger zone */}
              <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5 p-6 space-y-3">
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">{t("reports.dangerZone")}</h3>
                <p className="text-sm text-red-600/80 dark:text-red-400/80">{t("reports.dangerZoneDesc")}</p>
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("reports.deleteReport")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("reports.confirmDelete", { name: report.name })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-300 ${
            toast.visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          {toast.message}
        </div>
      )}
    </div>
  );
}
