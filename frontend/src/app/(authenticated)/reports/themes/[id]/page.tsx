"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  Save,
  CheckCircle2,
  Palette,
  Type,
  Table2,
  PanelTop,
  Trash2,
  Star,
  Bold,
  Italic,
  Settings,
  ToggleLeft,
  ToggleRight,
  FileImage,
  Ruler,
  ChevronDown,
  Layout,
  ListOrdered,
  ImageIcon,
  Upload,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Pilcrow,
  Terminal,
} from "lucide-react";
import CoverPageEditor, { type CoverPageData } from "@/components/CoverPageEditor";

const FONTS = [
  "Calibri",
  "Arial",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Cambria",
  "Garamond",
  "Trebuchet MS",
  "Tahoma",
  "Century Gothic",
  "Palatino Linotype",
  "Book Antiqua",
  "Roboto",
  "Open Sans",
  "Lato",
  "Source Sans Pro",
];

interface HeadingStyle {
  level: number;
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
  background: string;
  spaceBefore: number;
  spaceAfter: number;
}

interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TocLevelStyle {
  level: number;
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
}

interface TocStyle {
  dotLeader: boolean;
  lineSpacing: number;
  levels: TocLevelStyle[];
}

type SlotContentType = "none" | "text" | "variable" | "image" | "pageNumber";
type SlotVariable = "title" | "subtitle" | "date" | "author" | "context";

interface SlotTextStyle {
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
}

interface SlotContent {
  type: SlotContentType;
  text?: string;
  variable?: SlotVariable;
  imageSrc?: string;
  imageMaxHeight?: number;
  style?: SlotTextStyle;
}

interface HeaderFooterConfig {
  enabled: boolean;
  separator: boolean;
  separatorColor: string;
  offset: number;
  left: SlotContent;
  center: SlotContent;
  right: SlotContent;
}

const DEFAULT_SLOT_STYLE: SlotTextStyle = { font: "Calibri", size: 8, bold: false, italic: false, color: "#64748b" };

const DEFAULT_HEADER: HeaderFooterConfig = {
  enabled: true,
  separator: true,
  separatorColor: "#e2e8f0",
  offset: 5,
  left: { type: "variable", variable: "title", style: { ...DEFAULT_SLOT_STYLE } },
  center: { type: "none" },
  right: { type: "none" },
};

const DEFAULT_FOOTER: HeaderFooterConfig = {
  enabled: true,
  separator: true,
  separatorColor: "#e2e8f0",
  offset: 5,
  left: { type: "variable", variable: "title", style: { ...DEFAULT_SLOT_STYLE } },
  center: { type: "none" },
  right: { type: "pageNumber", style: { ...DEFAULT_SLOT_STYLE } },
};

const SLOT_VARIABLES: SlotVariable[] = ["title", "subtitle", "date", "author", "context"];

interface ParagraphStyle {
  alignment: "left" | "center" | "right" | "justify";
  lineBefore: number;
  lineAfter: number;
  blockSpacing: number;
  spaceBefore: number;
  spaceAfter: number;
}

interface ThemeStyles {
  colors: { primary: string; secondary: string };
  body: { font: string; size: number; color: string };
  margins: Margins;
  headingNumbering: boolean;
  toc: TocStyle;
  headings: HeadingStyle[];
  paragraph: ParagraphStyle;
  table: {
    headerBg: string;
    headerColor: string;
    borderColor: string;
    alternateRows: boolean;
    alternateBg: string;
    fontSize: number;
  };
  cliCommand: {
    font: string;
    size: number;
    bgColor: string;
    textColor: string;
    borderColor: string;
    borderRadius: number;
    lineNumberColor: string;
    showLineNumbers: boolean;
    padding: number;
    lineSpacing: number;
    showHeader: boolean;
    headerBgColor: string;
    headerTextColor: string;
  };
  header: HeaderFooterConfig;
  footer: HeaderFooterConfig;
  coverPage: CoverPageData;
}

interface ThemeDetail {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean;
  styles: ThemeStyles;
  createdAt: string;
}

const tabKeys = ["general", "margins", "coverPage", "toc", "header", "footer", "headings", "paragraphs", "tables", "cliCommand", "settings"] as const;
type TabKey = (typeof tabKeys)[number];

export default function ThemeDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const themeId = Number(id);

  const [theme, setTheme] = useState<ThemeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);

  // Editable styles (deep clone from theme)
  const [styles, setStyles] = useState<ThemeStyles | null>(null);
  const [themeName, setThemeName] = useState("");
  const [themeDescription, setThemeDescription] = useState("");

  const loadTheme = useCallback(async () => {
    const res = await fetch(`/api/report-themes/${themeId}`);
    if (!res.ok) {
      router.push("/reports/themes");
      return;
    }
    const data: ThemeDetail = await res.json();
    setTheme(data);
    const parsed = JSON.parse(JSON.stringify(data.styles));
    if (!parsed.margins) parsed.margins = { top: 20, bottom: 20, left: 20, right: 20 };
    if (parsed.headingNumbering === undefined) parsed.headingNumbering = true;
    if (!parsed.toc) parsed.toc = { dotLeader: true, lineSpacing: 8, levels: [] };
    if (!parsed.toc.levels || parsed.toc.levels.length === 0) {
      parsed.toc.levels = [
        { level: 1, font: "Calibri", size: 12, bold: true, italic: false, color: "#1e293b" },
        { level: 2, font: "Calibri", size: 11, bold: false, italic: false, color: "#1e293b" },
        { level: 3, font: "Calibri", size: 10, bold: false, italic: false, color: "#334155" },
        { level: 4, font: "Calibri", size: 10, bold: false, italic: true, color: "#334155" },
        { level: 5, font: "Calibri", size: 9, bold: false, italic: true, color: "#475569" },
        { level: 6, font: "Calibri", size: 9, bold: false, italic: true, color: "#475569" },
      ];
    }
    if (!parsed.coverPage) parsed.coverPage = { background: "#ffffff", elements: [] };
    if (!parsed.paragraph) parsed.paragraph = { alignment: "left", lineBefore: 0, lineAfter: 0, blockSpacing: 4, spaceBefore: 2, spaceAfter: 2 };
    if (parsed.paragraph) {
      if (parsed.paragraph.blockSpacing === undefined) parsed.paragraph.blockSpacing = 4;
      if (parsed.paragraph.lineBefore === undefined) parsed.paragraph.lineBefore = 0;
      if (parsed.paragraph.lineAfter === undefined) parsed.paragraph.lineAfter = 0;
    }
    if (!parsed.table) parsed.table = { headerBg: '#1e293b', headerColor: '#ffffff', borderColor: '#e2e8f0', alternateRows: true, alternateBg: '#f8fafc', fontSize: 0 };
    if (parsed.table && parsed.table.fontSize === undefined) parsed.table.fontSize = 0;
    if (!parsed.cliCommand) parsed.cliCommand = { font: 'Consolas', size: 9, bgColor: '#f1f5f9', textColor: '#1e293b', borderColor: '#e2e8f0', borderRadius: 2, lineNumberColor: '#94a3b8', showLineNumbers: true, padding: 3, lineSpacing: 1.4, showHeader: true, headerBgColor: '#1e293b', headerTextColor: '#ffffff' };
    if (parsed.cliCommand.padding === undefined) parsed.cliCommand.padding = 3;
    if (parsed.cliCommand.lineSpacing === undefined) parsed.cliCommand.lineSpacing = 1.4;
    if (parsed.cliCommand.showHeader === undefined) parsed.cliCommand.showHeader = true;
    if (parsed.cliCommand.headerBgColor === undefined) parsed.cliCommand.headerBgColor = '#1e293b';
    if (parsed.cliCommand.headerTextColor === undefined) parsed.cliCommand.headerTextColor = '#ffffff';
    // Migrate old header format to slot-based
    if (parsed.header && !parsed.header.left) {
      const oldColor = parsed.header.color || "#64748b";
      parsed.header = {
        enabled: parsed.header.enabled ?? true,
        separator: parsed.header.separator ?? true,
        separatorColor: parsed.header.separatorColor ?? "#e2e8f0",
        offset: 5,
        left: { type: "variable", variable: "title", style: { ...DEFAULT_SLOT_STYLE, color: oldColor } },
        center: { type: "none" },
        right: { type: "none" },
      };
    }
    if (!parsed.header) parsed.header = JSON.parse(JSON.stringify(DEFAULT_HEADER));
    if (parsed.header.offset === undefined) parsed.header.offset = 5;
    // Migrate old footer format to slot-based
    if (parsed.footer && !parsed.footer.left) {
      const oldColor = parsed.footer.color || "#64748b";
      parsed.footer = {
        enabled: parsed.footer.enabled ?? true,
        separator: parsed.footer.separator ?? true,
        separatorColor: parsed.footer.separatorColor ?? "#e2e8f0",
        offset: 5,
        left: { type: "variable", variable: "title", style: { ...DEFAULT_SLOT_STYLE, color: oldColor } },
        center: { type: "none" },
        right: parsed.footer.showPageNumbers !== false
          ? { type: "pageNumber", style: { ...DEFAULT_SLOT_STYLE, color: oldColor } }
          : { type: "none" },
      };
    }
    if (!parsed.footer) parsed.footer = JSON.parse(JSON.stringify(DEFAULT_FOOTER));
    if (parsed.footer.offset === undefined) parsed.footer.offset = 5;
    // Ensure heading styles have new fields
    if (parsed.headings) {
      parsed.headings = parsed.headings.map((h: Partial<HeadingStyle>) => ({
        ...h,
        background: h.background ?? "",
        spaceBefore: h.spaceBefore ?? 4,
        spaceAfter: h.spaceAfter ?? 2,
      }));
    }
    setStyles(parsed);
    setThemeName(data.name);
    setThemeDescription(data.description || "");
    setLoading(false);
  }, [themeId, router]);

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  const handleSave = async () => {
    if (!styles) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/report-themes/${themeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: themeName.trim() || theme?.name,
          description: themeDescription.trim() || null,
          styles,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTheme(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await fetch(`/api/report-themes/${themeId}`, { method: "DELETE" });
    router.push("/reports/themes");
  };

  const updateStyle = <K extends keyof ThemeStyles>(section: K, value: ThemeStyles[K]) => {
    if (!styles) return;
    setStyles({ ...styles, [section]: value });
  };

  const updateHeading = (level: number, field: keyof HeadingStyle, value: string | number | boolean) => {
    if (!styles) return;
    const headings = styles.headings.map((h) =>
      h.level === level ? { ...h, [field]: value } : h
    );
    setStyles({ ...styles, headings });
  };

  const updateTocLevel = (level: number, field: keyof TocLevelStyle, value: string | number | boolean) => {
    if (!styles) return;
    const levels = styles.toc.levels.map((l) =>
      l.level === level ? { ...l, [field]: value } : l
    );
    setStyles({ ...styles, toc: { ...styles.toc, levels } });
  };

  const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";
  const selectClass = inputClass;

  if (loading || !theme || !styles) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  const layoutSubTabs: TabKey[] = ["margins", "coverPage", "toc", "header", "footer"];
  const isLayoutActive = layoutSubTabs.includes(activeTab);

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/reports/themes"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-slate-400" />
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{theme.name}</h1>
            {theme.isDefault && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              {t("report_themes.saved")}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("common.save")}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex justify-between border-b border-slate-200 dark:border-slate-800">
        <div className="flex gap-1">
          {/* General */}
          <button
            onClick={() => setActiveTab("general")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "general"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Palette className="h-4 w-4" />
            {t("report_themes.tabGeneral")}
          </button>

          {/* Mise en page – dropdown */}
          <div className="relative">
            <button
              onClick={() => setLayoutMenuOpen(!layoutMenuOpen)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isLayoutActive
                  ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Layout className="h-4 w-4" />
              {t("report_themes.tabLayout")}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${layoutMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {layoutMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setLayoutMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-40 min-w-[200px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg py-1">
                  <button
                    onClick={() => { setActiveTab("margins"); setLayoutMenuOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                      activeTab === "margins" ? "text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50 font-medium" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <Ruler className="h-4 w-4" />
                    {t("report_themes.tabMargins")}
                  </button>
                  <button
                    onClick={() => { setActiveTab("coverPage"); setLayoutMenuOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                      activeTab === "coverPage" ? "text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50 font-medium" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <FileImage className="h-4 w-4" />
                    {t("report_themes.tabCoverPage")}
                  </button>
                  <button
                    onClick={() => { setActiveTab("toc"); setLayoutMenuOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                      activeTab === "toc" ? "text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50 font-medium" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <ListOrdered className="h-4 w-4" />
                    {t("report_themes.tabToc")}
                  </button>
                  <button
                    onClick={() => { setActiveTab("header"); setLayoutMenuOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                      activeTab === "header" ? "text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50 font-medium" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <PanelTop className="h-4 w-4" />
                    {t("report_themes.tabHeader")}
                  </button>
                  <button
                    onClick={() => { setActiveTab("footer"); setLayoutMenuOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                      activeTab === "footer" ? "text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50 font-medium" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <PanelTop className="h-4 w-4 rotate-180" />
                    {t("report_themes.tabFooter")}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Headings */}
          <button
            onClick={() => setActiveTab("headings")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "headings"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Type className="h-4 w-4" />
            {t("report_themes.tabHeadings")}
          </button>

          {/* Paragraphs */}
          <button
            onClick={() => setActiveTab("paragraphs")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "paragraphs"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Pilcrow className="h-4 w-4" />
            {t("report_themes.tabParagraphs")}
          </button>

          {/* Tables */}
          <button
            onClick={() => setActiveTab("tables")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "tables"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Table2 className="h-4 w-4" />
            {t("report_themes.tabTables")}
          </button>

          {/* CMD / Scripts */}
          <button
            onClick={() => setActiveTab("cliCommand")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "cliCommand"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Terminal className="h-4 w-4" />
            {t("report_themes.tabCliCommand")}
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === "settings"
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Settings className="h-4 w-4" />
            {t("report_themes.tabSettings")}
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "general" && (
        <div className="flex-1 min-h-0 flex gap-6">
          {/* Left column – 60% config */}
          <div className="w-[60%] overflow-y-auto space-y-6 pr-2">
            {/* Colors */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.colorsSection")}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>{t("report_themes.primaryColor")}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={styles.colors.primary}
                      onChange={(e) => updateStyle("colors", { ...styles.colors, primary: e.target.value })}
                      className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={styles.colors.primary}
                      onChange={(e) => updateStyle("colors", { ...styles.colors, primary: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.secondaryColor")}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={styles.colors.secondary}
                      onChange={(e) => updateStyle("colors", { ...styles.colors, secondary: e.target.value })}
                      className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={styles.colors.secondary}
                      onChange={(e) => updateStyle("colors", { ...styles.colors, secondary: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Body typography */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.bodySection")}</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>{t("report_themes.fontFamily")}</label>
                  <select
                    value={styles.body.font}
                    onChange={(e) => updateStyle("body", { ...styles.body, font: e.target.value })}
                    className={selectClass}
                  >
                    {FONTS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.fontSize")}</label>
                  <input
                    type="number"
                    value={styles.body.size}
                    onChange={(e) => updateStyle("body", { ...styles.body, size: Number(e.target.value) })}
                    min={8}
                    max={24}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.fontColor")}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={styles.body.color}
                      onChange={(e) => updateStyle("body", { ...styles.body, color: e.target.value })}
                      className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={styles.body.color}
                      onChange={(e) => updateStyle("body", { ...styles.body, color: e.target.value })}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column – 40% A4 preview */}
          <div className="w-[40%] min-h-0">
            <PagePreview styles={styles} />
          </div>
        </div>
      )}

      {activeTab === "margins" && (
        <div className="flex-1 min-h-0 flex gap-6">
          <div className="w-[60%] overflow-y-auto space-y-6 pr-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.marginsSection")}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("report_themes.marginsDesc")}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>{t("report_themes.marginTop")}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={styles.margins.top} onChange={(e) => updateStyle("margins", { ...styles.margins, top: Number(e.target.value) })} min={0} max={80} step={1} className={inputClass} />
                    <span className="text-xs text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.marginBottom")}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={styles.margins.bottom} onChange={(e) => updateStyle("margins", { ...styles.margins, bottom: Number(e.target.value) })} min={0} max={80} step={1} className={inputClass} />
                    <span className="text-xs text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.marginLeft")}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={styles.margins.left} onChange={(e) => updateStyle("margins", { ...styles.margins, left: Number(e.target.value) })} min={0} max={80} step={1} className={inputClass} />
                    <span className="text-xs text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.marginRight")}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={styles.margins.right} onChange={(e) => updateStyle("margins", { ...styles.margins, right: Number(e.target.value) })} min={0} max={80} step={1} className={inputClass} />
                    <span className="text-xs text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="w-[40%] min-h-0">
            <PagePreview styles={styles} />
          </div>
        </div>
      )}

      {activeTab === "headings" && (
        <div className="flex-1 min-h-0 flex gap-6">
          <div className="w-[60%] overflow-y-auto space-y-6 pr-2">
            {/* Heading numbering */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.headingOptions")}</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" onClick={() => updateStyle("headingNumbering", !styles.headingNumbering)}>
                  {styles.headingNumbering ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">{t("report_themes.headingNumbering")}</span>
              </label>
            </div>

            {/* Heading styles per level */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-6">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.headingStyles")}</h2>
              {styles.headings.map((h) => (
                <div key={h.level} className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500 w-8">H{h.level}</span>
                    <div className="flex-1 grid grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t("report_themes.fontFamily")}</label>
                        <select value={h.font} onChange={(e) => updateHeading(h.level, "font", e.target.value)} className={`${selectClass} text-xs py-2`}>
                          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t("report_themes.fontSize")}</label>
                        <input type="number" value={h.size} onChange={(e) => updateHeading(h.level, "size", Number(e.target.value))} min={8} max={72} className={`${inputClass} text-xs py-2`} />
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => updateHeading(h.level, "bold", !h.bold)} className={`p-2 rounded-lg border transition-colors ${h.bold ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`} title={t("report_themes.bold")}><Bold className="h-4 w-4" /></button>
                        <button type="button" onClick={() => updateHeading(h.level, "italic", !h.italic)} className={`p-2 rounded-lg border transition-colors ${h.italic ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`} title={t("report_themes.italic")}><Italic className="h-4 w-4" /></button>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t("report_themes.fontColor")}</label>
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={h.color} onChange={(e) => updateHeading(h.level, "color", e.target.value)} className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 cursor-pointer" />
                          <input type="text" value={h.color} onChange={(e) => updateHeading(h.level, "color", e.target.value)} className={`${inputClass} text-xs py-2 font-mono`} />
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Second row: background + spacing */}
                  <div className="flex items-end gap-3 ml-11">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t("report_themes.headingBackground")}</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={h.background || "#ffffff"} onChange={(e) => updateHeading(h.level, "background", e.target.value)} className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 cursor-pointer" />
                        <input type="text" value={h.background} onChange={(e) => updateHeading(h.level, "background", e.target.value)} placeholder={t("report_themes.noBackground")} className={`${inputClass} text-xs py-2 font-mono`} />
                      </div>
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t("report_themes.spaceBefore")}</label>
                      <div className="flex items-center gap-1">
                        <input type="number" value={h.spaceBefore} onChange={(e) => updateHeading(h.level, "spaceBefore", Number(e.target.value))} min={0} max={30} step={0.5} className={`${inputClass} text-xs py-2`} />
                        <span className="text-[10px] text-slate-400">mm</span>
                      </div>
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t("report_themes.spaceAfter")}</label>
                      <div className="flex items-center gap-1">
                        <input type="number" value={h.spaceAfter} onChange={(e) => updateHeading(h.level, "spaceAfter", Number(e.target.value))} min={0} max={30} step={0.5} className={`${inputClass} text-xs py-2`} />
                        <span className="text-[10px] text-slate-400">mm</span>
                      </div>
                    </div>
                  </div>
                  {h.level < 6 && <div className="border-b border-slate-100 dark:border-slate-800" />}
                </div>
              ))}
            </div>
          </div>
          <div className="w-[40%] min-h-0">
            <PagePreview styles={styles} />
          </div>
        </div>
      )}

      {activeTab === "paragraphs" && (
        <div className="flex-1 min-h-0 flex gap-6">
          <div className="w-[60%] overflow-y-auto space-y-6 pr-2">
            {/* Paragraph alignment */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.paragraphStyles")}</h2>
              <div>
                <label className={labelClass}>{t("report_themes.paragraphAlignment")}</label>
                <div className="flex items-center gap-2 mt-1">
                  {([
                    { value: "left" as const, icon: AlignLeft, label: t("report_themes.alignLeft") },
                    { value: "center" as const, icon: AlignCenter, label: t("report_themes.alignCenter") },
                    { value: "right" as const, icon: AlignRight, label: t("report_themes.alignRight") },
                    { value: "justify" as const, icon: AlignJustify, label: t("report_themes.alignJustify") },
                  ]).map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateStyle("paragraph", { ...styles.paragraph, alignment: value })}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                        styles.paragraph.alignment === value
                          ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-medium"
                          : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                      title={label}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Line spacing (per <p> inside a block) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.lineSpacing")}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("report_themes.lineSpacingDesc")}</p>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className={labelClass}>{t("report_themes.lineBefore")}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={styles.paragraph.lineBefore}
                      onChange={(e) => updateStyle("paragraph", { ...styles.paragraph, lineBefore: Number(e.target.value) })}
                      min={0}
                      max={20}
                      step={0.5}
                      className={inputClass}
                    />
                    <span className="text-xs text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.lineAfter")}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={styles.paragraph.lineAfter}
                      onChange={(e) => updateStyle("paragraph", { ...styles.paragraph, lineAfter: Number(e.target.value) })}
                      min={0}
                      max={20}
                      step={0.5}
                      className={inputClass}
                    />
                    <span className="text-xs text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Block spacing (between consecutive paragraph blocks) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.blockSpacing")}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("report_themes.blockSpacingDesc")}</p>
              <div className="max-w-[200px]">
                <label className={labelClass}>{t("report_themes.blockSpacingLabel")}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={styles.paragraph.blockSpacing}
                    onChange={(e) => updateStyle("paragraph", { ...styles.paragraph, blockSpacing: Number(e.target.value) })}
                    min={0}
                    max={30}
                    step={0.5}
                    className={inputClass}
                  />
                  <span className="text-xs text-slate-400 shrink-0">mm</span>
                </div>
              </div>
            </div>

            {/* Group spacing (before first / after last paragraph block) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.groupSpacing")}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("report_themes.groupSpacingDesc")}</p>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className={labelClass}>{t("report_themes.spaceBefore")}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={styles.paragraph.spaceBefore}
                      onChange={(e) => updateStyle("paragraph", { ...styles.paragraph, spaceBefore: Number(e.target.value) })}
                      min={0}
                      max={30}
                      step={0.5}
                      className={inputClass}
                    />
                    <span className="text-xs text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.spaceAfter")}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={styles.paragraph.spaceAfter}
                      onChange={(e) => updateStyle("paragraph", { ...styles.paragraph, spaceAfter: Number(e.target.value) })}
                      min={0}
                      max={30}
                      step={0.5}
                      className={inputClass}
                    />
                    <span className="text-xs text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="w-[40%] min-h-0">
            <PagePreview styles={styles} />
          </div>
        </div>
      )}

      {activeTab === "tables" && (
        <div className="flex-1 min-h-0 flex gap-6">
          <div className="w-[60%] overflow-y-auto space-y-6 pr-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.tableStyles")}</h2>
              <div>
                <label className={labelClass}>{t("report_themes.tableFontSize")}</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={styles.table.fontSize} onChange={(e) => updateStyle("table", { ...styles.table, fontSize: Number(e.target.value) })} min={0} max={24} className={inputClass} />
                  <span className="text-xs text-slate-400 shrink-0">{t("report_themes.tableFontSizeHint")}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>{t("report_themes.tableHeaderBg")}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={styles.table.headerBg} onChange={(e) => updateStyle("table", { ...styles.table, headerBg: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                    <input type="text" value={styles.table.headerBg} onChange={(e) => updateStyle("table", { ...styles.table, headerBg: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.tableHeaderColor")}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={styles.table.headerColor} onChange={(e) => updateStyle("table", { ...styles.table, headerColor: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                    <input type="text" value={styles.table.headerColor} onChange={(e) => updateStyle("table", { ...styles.table, headerColor: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.tableBorderColor")}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={styles.table.borderColor} onChange={(e) => updateStyle("table", { ...styles.table, borderColor: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                    <input type="text" value={styles.table.borderColor} onChange={(e) => updateStyle("table", { ...styles.table, borderColor: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.tableAlternateBg")}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={styles.table.alternateBg} onChange={(e) => updateStyle("table", { ...styles.table, alternateBg: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                    <input type="text" value={styles.table.alternateBg} onChange={(e) => updateStyle("table", { ...styles.table, alternateBg: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" onClick={() => updateStyle("table", { ...styles.table, alternateRows: !styles.table.alternateRows })}>
                  {styles.table.alternateRows ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">{t("report_themes.tableAlternateRows")}</span>
              </label>
            </div>
          </div>
          <div className="w-[40%] min-h-0">
            <PagePreview styles={styles} />
          </div>
        </div>
      )}

      {activeTab === "toc" && (
        <div className="flex-1 min-h-0 flex gap-6">
          <div className="w-[60%] overflow-y-auto space-y-6 pr-2">
            {/* TOC general settings */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.tocSettings")}</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" onClick={() => updateStyle("toc", { ...styles.toc, dotLeader: !styles.toc.dotLeader })}>
                  {styles.toc.dotLeader ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">{t("report_themes.tocDotLeader")}</span>
              </label>
              <div className="max-w-xs">
                <label className={labelClass}>{t("report_themes.tocLineSpacing")}</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={styles.toc.lineSpacing} onChange={(e) => updateStyle("toc", { ...styles.toc, lineSpacing: Number(e.target.value) })} min={4} max={20} step={1} className={inputClass} />
                  <span className="text-xs text-slate-400 shrink-0">mm</span>
                </div>
              </div>
            </div>

            {/* Per-level TOC styles */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.tocLevelStyles")}</h2>
              {styles.toc.levels.map((l) => (
                <div key={l.level} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500 w-8">{t("report_themes.tocLevelN", { n: String(l.level) })}</span>
                    <div className="flex-1 grid grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t("report_themes.fontFamily")}</label>
                        <select value={l.font} onChange={(e) => updateTocLevel(l.level, "font", e.target.value)} className={`${selectClass} text-xs py-2`}>
                          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t("report_themes.fontSize")}</label>
                        <input type="number" value={l.size} onChange={(e) => updateTocLevel(l.level, "size", Number(e.target.value))} min={6} max={24} className={`${inputClass} text-xs py-2`} />
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => updateTocLevel(l.level, "bold", !l.bold)} className={`p-2 rounded-lg border transition-colors ${l.bold ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`} title={t("report_themes.bold")}><Bold className="h-4 w-4" /></button>
                        <button type="button" onClick={() => updateTocLevel(l.level, "italic", !l.italic)} className={`p-2 rounded-lg border transition-colors ${l.italic ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`} title={t("report_themes.italic")}><Italic className="h-4 w-4" /></button>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t("report_themes.fontColor")}</label>
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={l.color} onChange={(e) => updateTocLevel(l.level, "color", e.target.value)} className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 cursor-pointer" />
                          <input type="text" value={l.color} onChange={(e) => updateTocLevel(l.level, "color", e.target.value)} className={`${inputClass} text-xs py-2 font-mono`} />
                        </div>
                      </div>
                    </div>
                  </div>
                  {l.level < 6 && <div className="border-b border-slate-100 dark:border-slate-800" />}
                </div>
              ))}
            </div>
          </div>
          <div className="w-[40%] min-h-0">
            <TocPreview styles={styles} />
          </div>
        </div>
      )}

      {(activeTab === "header" || activeTab === "footer") && (() => {
        const section = activeTab as "header" | "footer";
        const config = styles[section];
        const updateConfig = (patch: Partial<HeaderFooterConfig>) => updateStyle(section, { ...config, ...patch });
        const updateSlot = (pos: "left" | "center" | "right", slot: SlotContent) => updateConfig({ [pos]: slot });

        const renderSlotEditor = (pos: "left" | "center" | "right") => {
          const slot = config[pos];
          const update = (patch: Partial<SlotContent>) => updateSlot(pos, { ...slot, ...patch });
          const updateSlotStyle = (field: keyof SlotTextStyle, v: string | number | boolean) =>
            update({ style: { ...(slot.style || DEFAULT_SLOT_STYLE), [field]: v } });
          const st = slot.style || DEFAULT_SLOT_STYLE;

          const styleEditor = (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <select value={st.font} onChange={(e) => updateSlotStyle("font", e.target.value)} className={`${selectClass} text-xs py-1.5 w-36`}>
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <input type="number" value={st.size} onChange={(e) => updateSlotStyle("size", Number(e.target.value))} min={5} max={20} className={`${inputClass} text-xs py-1.5 w-16`} title="pt" />
              <button type="button" onClick={() => updateSlotStyle("bold", !st.bold)} className={`p-1.5 rounded-lg border transition-colors ${st.bold ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}><Bold className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => updateSlotStyle("italic", !st.italic)} className={`p-1.5 rounded-lg border transition-colors ${st.italic ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}><Italic className="h-3.5 w-3.5" /></button>
              <input type="color" value={st.color} onChange={(e) => updateSlotStyle("color", e.target.value)} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer" />
              <input type="text" value={st.color} onChange={(e) => updateSlotStyle("color", e.target.value)} className={`${inputClass} text-xs py-1.5 font-mono w-24`} />
            </div>
          );

          const posLabel = t(`report_themes.slot${pos.charAt(0).toUpperCase() + pos.slice(1)}` as "report_themes.slotLeft");

          return (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500 w-16 shrink-0">{posLabel}</h3>
                <select
                  value={slot.type}
                  onChange={(e) => {
                    const newType = e.target.value as SlotContentType;
                    const base: SlotContent = { type: newType };
                    if (newType === "text") { base.text = ""; base.style = { ...DEFAULT_SLOT_STYLE }; }
                    if (newType === "variable") { base.variable = "title"; base.style = { ...DEFAULT_SLOT_STYLE }; }
                    if (newType === "pageNumber") { base.style = { ...DEFAULT_SLOT_STYLE }; }
                    if (newType === "image") { base.imageSrc = ""; base.imageMaxHeight = 8; }
                    updateSlot(pos, base);
                  }}
                  className={`${selectClass} text-xs py-1.5 flex-1`}
                >
                  <option value="none">{t("report_themes.slotTypeNone")}</option>
                  <option value="text">{t("report_themes.slotTypeText")}</option>
                  <option value="variable">{t("report_themes.slotTypeVariable")}</option>
                  <option value="image">{t("report_themes.slotTypeImage")}</option>
                  <option value="pageNumber">{t("report_themes.slotTypePageNumber")}</option>
                </select>
              </div>

              {slot.type === "text" && (
                <>
                  <input type="text" value={slot.text || ""} onChange={(e) => update({ text: e.target.value })} className={`${inputClass} text-xs py-1.5`} placeholder="Mon texte..." />
                  {styleEditor}
                </>
              )}

              {slot.type === "variable" && (
                <>
                  <select value={slot.variable || "title"} onChange={(e) => update({ variable: e.target.value as SlotVariable })} className={`${selectClass} text-xs py-1.5`}>
                    {SLOT_VARIABLES.map((v) => <option key={v} value={v}>{t(`report_themes.var${v.charAt(0).toUpperCase() + v.slice(1)}` as "report_themes.varTitle")}</option>)}
                  </select>
                  {styleEditor}
                </>
              )}

              {slot.type === "pageNumber" && styleEditor}

              {slot.type === "image" && (
                <div className="space-y-3">
                  {slot.imageSrc ? (
                    <div className="relative rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800">
                      <img src={slot.imageSrc} alt="" className="w-full h-20 object-contain" />
                      <button
                        type="button"
                        onClick={async () => {
                          const filename = slot.imageSrc?.split("/").pop();
                          if (filename) {
                            await fetch(`/api/cover-page-images/${filename}`, { method: "DELETE" });
                          }
                          update({ imageSrc: "" });
                        }}
                        className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-3 cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 transition-colors">
                      <Upload className="h-4 w-4 text-slate-400" />
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t("report_themes.slotTypeImage")}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const formData = new FormData();
                          formData.append("image", file);
                          const res = await fetch("/api/cover-page-images", { method: "POST", body: formData });
                          if (res.ok) {
                            const data = await res.json();
                            update({ imageSrc: data.url });
                          }
                        }}
                      />
                    </label>
                  )}
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{t("report_themes.slotImageMaxHeight")}</label>
                    <input type="number" value={slot.imageMaxHeight || 8} onChange={(e) => update({ imageMaxHeight: Number(e.target.value) })} min={3} max={20} className={`${inputClass} text-xs py-1.5 w-24`} />
                  </div>
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="flex-1 min-h-0 flex gap-6">
            <div className="w-[60%] overflow-y-auto space-y-6 pr-2">
              {/* Enable + separator */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t(section === "header" ? "report_themes.headerSection" : "report_themes.footerSection")}</h2>
                  <button type="button" onClick={() => updateConfig({ enabled: !config.enabled })}>
                    {config.enabled ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                  </button>
                </div>
                {config.enabled && (
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <button type="button" onClick={() => updateConfig({ separator: !config.separator })}>
                        {config.separator ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                      </button>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{t("report_themes.showSeparator")}</span>
                    </label>
                    {config.separator && (
                      <div className="max-w-xs">
                        <label className={labelClass}>{t("report_themes.separatorColor")}</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={config.separatorColor} onChange={(e) => updateConfig({ separatorColor: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                          <input type="text" value={config.separatorColor} onChange={(e) => updateConfig({ separatorColor: e.target.value })} className={`${inputClass} font-mono`} />
                        </div>
                      </div>
                    )}
                    <div className="max-w-xs">
                      <label className={labelClass}>{t("report_themes.hfOffset")}</label>
                      <div className="flex items-center gap-2">
                        <input type="number" value={config.offset} onChange={(e) => updateConfig({ offset: Number(e.target.value) })} min={0} max={40} step={1} className={`${inputClass} w-20`} />
                        <span className="text-xs text-slate-400">mm</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Slots */}
              {config.enabled && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-3">
                  {renderSlotEditor("left")}
                  {renderSlotEditor("center")}
                  {renderSlotEditor("right")}
                </div>
              )}
            </div>
            <div className="w-[40%] min-h-0">
              <PagePreview styles={styles} />
            </div>
          </div>
        );
      })()}

      {activeTab === "coverPage" && (
        <div className="flex-1 min-h-0">
          <CoverPageEditor
            data={styles.coverPage}
            margins={styles.margins}
            onChange={(coverPage) => updateStyle("coverPage", coverPage)}
            t={t}
          />
        </div>
      )}

      {activeTab === "cliCommand" && (
        <div className="flex-1 min-h-0 flex gap-6">
          <div className="w-[60%] overflow-y-auto space-y-6 pr-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.cliStyles")}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>{t("report_themes.fontFamily")}</label>
                  <select value={styles.cliCommand.font} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, font: e.target.value })} className={selectClass}>
                    {["Consolas", "Courier New", "Courier", ...FONTS].filter((v, i, a) => a.indexOf(v) === i).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.fontSize")}</label>
                  <input type="number" value={styles.cliCommand.size} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, size: Number(e.target.value) })} min={6} max={20} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.cliBgColor")}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={styles.cliCommand.bgColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, bgColor: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                    <input type="text" value={styles.cliCommand.bgColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, bgColor: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.cliTextColor")}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={styles.cliCommand.textColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, textColor: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                    <input type="text" value={styles.cliCommand.textColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, textColor: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.cliBorderColor")}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={styles.cliCommand.borderColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, borderColor: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                    <input type="text" value={styles.cliCommand.borderColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, borderColor: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.cliLineNumberColor")}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={styles.cliCommand.lineNumberColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, lineNumberColor: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                    <input type="text" value={styles.cliCommand.lineNumberColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, lineNumberColor: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>{t("report_themes.cliBorderRadius")}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={styles.cliCommand.borderRadius} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, borderRadius: Number(e.target.value) })} min={0} max={10} className={inputClass} />
                    <span className="text-xs text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.cliPadding")}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={styles.cliCommand.padding} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, padding: Number(e.target.value) })} min={0} max={20} step={0.5} className={inputClass} />
                    <span className="text-xs text-slate-400 shrink-0">mm</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t("report_themes.cliLineSpacing")}</label>
                  <input type="number" value={styles.cliCommand.lineSpacing} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, lineSpacing: Number(e.target.value) })} min={1} max={3} step={0.1} className={inputClass} />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" onClick={() => updateStyle("cliCommand", { ...styles.cliCommand, showLineNumbers: !styles.cliCommand.showLineNumbers })}>
                  {styles.cliCommand.showLineNumbers ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">{t("report_themes.cliShowLineNumbers")}</span>
              </label>
            </div>

            {/* Header section */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.cliHeaderSection")}</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" onClick={() => updateStyle("cliCommand", { ...styles.cliCommand, showHeader: !styles.cliCommand.showHeader })}>
                  {styles.cliCommand.showHeader ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">{t("report_themes.cliShowHeader")}</span>
              </label>
              {styles.cliCommand.showHeader && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>{t("report_themes.cliHeaderBgColor")}</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={styles.cliCommand.headerBgColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, headerBgColor: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                      <input type="text" value={styles.cliCommand.headerBgColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, headerBgColor: e.target.value })} className={`${inputClass} font-mono`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t("report_themes.cliHeaderTextColor")}</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={styles.cliCommand.headerTextColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, headerTextColor: e.target.value })} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                      <input type="text" value={styles.cliCommand.headerTextColor} onChange={(e) => updateStyle("cliCommand", { ...styles.cliCommand, headerTextColor: e.target.value })} className={`${inputClass} font-mono`} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.preview")}</h2>
              <div
                className="overflow-hidden"
                style={{
                  border: `1px solid ${styles.cliCommand.borderColor}`,
                  borderRadius: `${styles.cliCommand.borderRadius * 2}px`,
                }}
              >
                {/* Header bar */}
                {styles.cliCommand.showHeader && (
                  <div
                    style={{
                      backgroundColor: styles.cliCommand.headerBgColor,
                      color: styles.cliCommand.headerTextColor,
                      fontFamily: styles.cliCommand.font,
                      fontSize: `${styles.cliCommand.size + 1}px`,
                      padding: `${Math.max(styles.cliCommand.padding * 1.5, 6)}px ${styles.cliCommand.padding * 4}px`,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: `1px solid ${styles.cliCommand.borderColor}`,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>show interfaces status</span>
                    <span style={{ opacity: 0.7, fontSize: `${styles.cliCommand.size}px` }}>SW-CORE-01</span>
                  </div>
                )}
                {/* Body */}
                <div
                  style={{
                    backgroundColor: styles.cliCommand.bgColor,
                    fontFamily: styles.cliCommand.font,
                    fontSize: `${styles.cliCommand.size + 2}px`,
                    color: styles.cliCommand.textColor,
                    padding: `${styles.cliCommand.padding * 3}px ${styles.cliCommand.padding * 4}px`,
                    lineHeight: styles.cliCommand.lineSpacing,
                  }}
                >
                  {["Port      Name    Status    Vlan", "Gi1/0/1   UPLINK  connected trunk", "Gi1/0/2   PC-01   connected 10", "Gi1/0/3   SRV-01  connected 20"].map((line, i) => (
                    <div key={i} className="flex whitespace-pre">
                      {styles.cliCommand.showLineNumbers && (
                        <span style={{ color: styles.cliCommand.lineNumberColor, width: 28, textAlign: "right", paddingRight: 12, userSelect: "none", flexShrink: 0, display: "inline-block" }}>{i + 1}</span>
                      )}
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="w-[40%] min-h-0">
            <PagePreview styles={styles} />
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.settingsGeneral")}</h2>
            <div className="space-y-1.5">
              <label className={labelClass}>{t("report_themes.colName")}</label>
              <input type="text" value={themeName} onChange={(e) => setThemeName(e.target.value)} placeholder={t("report_themes.namePlaceholder")} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>{t("report_themes.colDescription")}</label>
              <textarea value={themeDescription} onChange={(e) => setThemeDescription(e.target.value)} rows={3} placeholder={t("report_themes.descriptionPlaceholder")} className={`${inputClass} resize-none`} />
            </div>
          </div>



          {!theme.isDefault && (
            <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5 p-6 space-y-3">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">{t("report_themes.dangerZone")}</h3>
              <p className="text-sm text-red-600/80 dark:text-red-400/80">{t("report_themes.dangerZoneDesc")}</p>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                {t("report_themes.deleteTheme")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("report_themes.confirmDelete", { name: theme.name })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteConfirm(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// A4 page preview (210×297mm) – fits available container space
const A4_W = 210;
const A4_H = 297;
const A4_RATIO = A4_H / A4_W; // ≈ 1.414

function SlotPreview({ slot, ptToPx, bodyFont }: { slot: SlotContent; ptToPx: (pt: number) => number; bodyFont: string }) {
  if (slot.type === "none") return <span />;
  const st = slot.style || DEFAULT_SLOT_STYLE;
  const fontSize = Math.max(ptToPx(st.size), 5);
  const baseStyle: React.CSSProperties = {
    fontFamily: st.font || bodyFont,
    fontSize,
    fontWeight: st.bold ? "bold" : "normal",
    fontStyle: st.italic ? "italic" : "normal",
    color: st.color,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  if (slot.type === "text") return <span style={baseStyle}>{slot.text || ""}</span>;
  if (slot.type === "variable") {
    const samples: Record<string, string> = { title: "Audit Report", subtitle: "Q1 2026", date: "11/03/2026", author: "Auditix", context: "Client" };
    return <span style={baseStyle}>{samples[slot.variable || "title"]}</span>;
  }
  if (slot.type === "pageNumber") return <span style={baseStyle}>1 / 5</span>;
  if (slot.type === "image") return <ImageIcon style={{ width: fontSize * 1.5, height: fontSize * 1.5, color: "#94a3b8" }} />;
  return <span />;
}

function HeaderFooterBar({ config, scale, ptToPx, bodyFont, mLeft, mRight, isHeader }: {
  config: HeaderFooterConfig;
  scale: number;
  ptToPx: (pt: number) => number;
  bodyFont: string;
  mLeft: number;
  mRight: number;
  isHeader: boolean;
}) {
  if (!config.enabled) return null;
  const offsetPx = (config.offset ?? 5) * scale;
  const barH = 5 * scale;
  return (
    <div
      className="absolute left-0 right-0 flex items-center px-1"
      style={{
        ...(isHeader ? { top: offsetPx } : { bottom: offsetPx }),
        height: barH,
        marginLeft: mLeft,
        marginRight: mRight,
      }}
    >
      {config.separator && (
        <div
          className={`absolute left-0 right-0 ${isHeader ? "bottom-0" : "top-0"}`}
          style={{ height: 1, backgroundColor: config.separatorColor }}
        />
      )}
      <div className="flex-1 text-left">
        <SlotPreview slot={config.left} ptToPx={ptToPx} bodyFont={bodyFont} />
      </div>
      <div className="flex-1 text-center">
        <SlotPreview slot={config.center} ptToPx={ptToPx} bodyFont={bodyFont} />
      </div>
      <div className="flex-1 text-right">
        <SlotPreview slot={config.right} ptToPx={ptToPx} bodyFont={bodyFont} />
      </div>
    </div>
  );
}

function TocPreview({ styles }: { styles: ThemeStyles }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let previewW = 0;
  let previewH = 0;
  if (dims) {
    const byWidth = { w: dims.w, h: dims.w * A4_RATIO };
    const byHeight = { w: dims.h / A4_RATIO, h: dims.h };
    if (byWidth.h <= dims.h) {
      previewW = byWidth.w;
      previewH = byWidth.h;
    } else {
      previewW = byHeight.w;
      previewH = byHeight.h;
    }
  }

  const scale = previewW / A4_W;
  const ptToPx = (pt: number) => pt * 0.3528 * scale;

  const mTop = styles.margins.top * scale;
  const mBottom = styles.margins.bottom * scale;
  const mLeft = styles.margins.left * scale;
  const mRight = styles.margins.right * scale;

  const TOC_ENTRIES = [
    { level: 1, title: "Introduction", number: "1." },
    { level: 2, title: "Contexte", number: "1.1." },
    { level: 3, title: "Objectifs", number: "1.1.1." },
    { level: 1, title: "Methodologie", number: "2." },
    { level: 2, title: "Approche", number: "2.1." },
    { level: 3, title: "Outils utilises", number: "2.1.1." },
    { level: 4, title: "Scanners reseau", number: "2.1.1.1." },
    { level: 2, title: "Perimetre", number: "2.2." },
    { level: 1, title: "Resultats", number: "3." },
    { level: 2, title: "Synthese", number: "3.1." },
    { level: 3, title: "Points critiques", number: "3.1.1." },
    { level: 4, title: "Vulnerabilites", number: "3.1.1.1." },
    { level: 5, title: "CVE identifies", number: "3.1.1.1.1." },
    { level: 6, title: "Detail CVE-2026-001", number: "3.1.1.1.1.1." },
    { level: 1, title: "Recommandations", number: "4." },
    { level: 1, title: "Annexes", number: "5." },
  ];

  // Get TOC level style with fallback
  const getTocLevelStyle = (level: number): TocLevelStyle => {
    return styles.toc.levels.find((l) => l.level === level) || styles.toc.levels[0] || { level, font: "Calibri", size: 11, bold: false, italic: false, color: "#1e293b" };
  };

  return (
    <div ref={containerRef} className="w-full h-full flex items-start justify-center">
      {dims && previewW > 0 && (
        <div
          className="bg-white border border-slate-300 dark:border-slate-600 shadow-md relative select-none overflow-hidden"
          style={{ width: previewW, height: previewH }}
        >
          {/* Margin guides */}
          <div
            className="absolute border border-dashed border-blue-300/50"
            style={{ top: mTop, left: mLeft, right: mRight, bottom: mBottom }}
          />

          {/* Content area */}
          <div
            className="absolute flex flex-col overflow-hidden"
            style={{ top: mTop, left: mLeft, right: mRight, bottom: mBottom }}
          >
            {/* TOC Title */}
            {(() => {
              const h1 = styles.headings[0];
              return (
                <p
                  className="leading-tight"
                  style={{
                    fontFamily: h1?.font || "Calibri",
                    fontSize: ptToPx(h1?.size || 26),
                    fontWeight: h1?.bold !== false ? "bold" : "normal",
                    fontStyle: h1?.italic ? "italic" : "normal",
                    color: h1?.color || "#1e293b",
                    marginBottom: 6 * scale,
                  }}
                >
                  Table des matieres
                </p>
              );
            })()}

            {/* TOC entries */}
            {TOC_ENTRIES.map((entry, i) => {
              const tocLevel = getTocLevelStyle(entry.level);
              const indent = (entry.level - 1) * 6 * scale;
              const lineH = styles.toc.lineSpacing * scale;
              const fSize = ptToPx(tocLevel.size);
              const pageNum = 2 + Math.floor(i * 1.3);

              return (
                <div
                  key={i}
                  className="flex items-baseline"
                  style={{
                    paddingLeft: indent,
                    height: lineH,
                    fontFamily: tocLevel.font,
                    fontSize: fSize,
                    fontWeight: tocLevel.bold ? "bold" : "normal",
                    fontStyle: tocLevel.italic ? "italic" : "normal",
                    color: tocLevel.color,
                  }}
                >
                  <span className="shrink-0 whitespace-nowrap">
                    {styles.headingNumbering ? `${entry.number} ` : ""}{entry.title}
                  </span>
                  <span className="flex-1 min-w-0 mx-0.5" style={{ overflow: "hidden", whiteSpace: "nowrap", opacity: styles.toc.dotLeader ? 0.5 : 0, fontSize: fSize * 0.9, letterSpacing: "0.5px" }}>
                    {styles.toc.dotLeader ? " .".repeat(200) : ""}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={{ minWidth: ptToPx(6) }}>
                    {pageNum}
                  </span>
                </div>
              );
            })}
          </div>

          <HeaderFooterBar config={styles.header} scale={scale} ptToPx={ptToPx} bodyFont={styles.body.font} mLeft={mLeft} mRight={mRight} isHeader />
          <HeaderFooterBar config={styles.footer} scale={scale} ptToPx={ptToPx} bodyFont={styles.body.font} mLeft={mLeft} mRight={mRight} isHeader={false} />
        </div>
      )}
    </div>
  );
}

function PagePreview({ styles }: { styles: ThemeStyles }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute best fit: fill width or height while keeping A4 ratio
  let previewW = 0;
  let previewH = 0;
  if (dims) {
    const byWidth = { w: dims.w, h: dims.w * A4_RATIO };
    const byHeight = { w: dims.h / A4_RATIO, h: dims.h };
    if (byWidth.h <= dims.h) {
      previewW = byWidth.w;
      previewH = byWidth.h;
    } else {
      previewW = byHeight.w;
      previewH = byHeight.h;
    }
  }

  const scale = previewW / A4_W;
  const ptToPx = (pt: number) => pt * 0.3528 * scale;

  const mTop = styles.margins.top * scale;
  const mBottom = styles.margins.bottom * scale;
  const mLeft = styles.margins.left * scale;
  const mRight = styles.margins.right * scale;

  const HEADING_LABELS = ["Introduction", "Contexte", "Objectifs", "Methodologie", "Resultats", "Annexes"];
  const HEADING_NUMBERS = ["1.", "1.1.", "1.1.1.", "1.1.1.1.", "1.1.1.1.1.", "1.1.1.1.1.1."];

  return (
    <div ref={containerRef} className="w-full h-full flex items-start justify-center">
      {dims && previewW > 0 && (
        <div
          className="bg-white border border-slate-300 dark:border-slate-600 shadow-md relative select-none overflow-hidden"
          style={{ width: previewW, height: previewH }}
        >
          {/* Margin guides */}
          <div
            className="absolute border border-dashed border-blue-300/50"
            style={{ top: mTop, left: mLeft, right: mRight, bottom: mBottom }}
          />

          {/* Content area */}
          <div
            className="absolute flex flex-col overflow-hidden"
            style={{ top: mTop, left: mLeft, right: mRight, bottom: mBottom }}
          >
            {styles.headings.map((h, i) => (
              <div key={h.level}>
                <p
                  className="leading-tight"
                  style={{
                    fontFamily: h.font,
                    fontSize: ptToPx(h.size),
                    fontWeight: h.bold ? "bold" : "normal",
                    fontStyle: h.italic ? "italic" : "normal",
                    color: h.color,
                    backgroundColor: h.background || "transparent",
                    padding: h.background ? `${scale * 0.5}px ${scale * 1}px` : undefined,
                    marginTop: (h.spaceBefore ?? 4) * scale,
                    marginBottom: (h.spaceAfter ?? 2) * scale,
                  }}
                >
                  {styles.headingNumbering ? `${HEADING_NUMBERS[i]} ` : ""}{HEADING_LABELS[i]}
                </p>
                <p
                  className="leading-relaxed"
                  style={{
                    fontFamily: styles.body.font,
                    fontSize: ptToPx(styles.body.size),
                    color: styles.body.color,
                  }}
                >
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                </p>
              </div>
            ))}

            {/* Table preview */}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: styles.body.font,
                fontSize: ptToPx(styles.body.size),
                color: styles.body.color,
                marginBottom: ptToPx(3),
              }}
            >
              <thead>
                <tr>
                  {["Col. A", "Col. B", "Col. C"].map((col) => (
                    <th
                      key={col}
                      style={{
                        backgroundColor: styles.table.headerBg,
                        color: styles.table.headerColor,
                        padding: `${ptToPx(1.5)}px ${ptToPx(2)}px`,
                        textAlign: "left",
                        fontWeight: 600,
                        borderBottom: `1px solid ${styles.table.borderColor}`,
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((i) => (
                  <tr key={i}>
                    {["Ligne " + (i + 1), "Donnee", "Valeur"].map((cell, j) => (
                      <td
                        key={j}
                        style={{
                          padding: `${ptToPx(1.5)}px ${ptToPx(2)}px`,
                          borderBottom: `1px solid ${styles.table.borderColor}`,
                          backgroundColor: styles.table.alternateRows && i % 2 === 1 ? styles.table.alternateBg : "transparent",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* CLI command preview */}
            <div
              style={{
                border: `${Math.max(0.5 * scale, 0.5)}px solid ${styles.cliCommand.borderColor}`,
                borderRadius: styles.cliCommand.borderRadius * scale,
                overflow: "hidden",
                marginBottom: ptToPx(3),
              }}
            >
              {styles.cliCommand.showHeader && (
                <div
                  style={{
                    backgroundColor: styles.cliCommand.headerBgColor,
                    color: styles.cliCommand.headerTextColor,
                    fontFamily: styles.cliCommand.font,
                    fontSize: ptToPx(styles.cliCommand.size * 0.9),
                    padding: `${styles.cliCommand.padding * scale * 0.4}px ${styles.cliCommand.padding * scale * 0.6}px`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    lineHeight: 1.3,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>show version</span>
                  <span style={{ opacity: 0.7, fontSize: ptToPx(styles.cliCommand.size * 0.75) }}>SW-01</span>
                </div>
              )}
              <div
                style={{
                  backgroundColor: styles.cliCommand.bgColor,
                  fontFamily: styles.cliCommand.font,
                  fontSize: ptToPx(styles.cliCommand.size * 0.85),
                  color: styles.cliCommand.textColor,
                  padding: `${styles.cliCommand.padding * scale * 0.5}px ${styles.cliCommand.padding * scale * 0.6}px`,
                  lineHeight: styles.cliCommand.lineSpacing,
                }}
              >
                {["Version: 8.10.2", "Uptime: 42 days"].map((line, i) => (
                  <div key={i} className="flex whitespace-pre">
                    {styles.cliCommand.showLineNumbers && (
                      <span style={{ color: styles.cliCommand.lineNumberColor, width: ptToPx(styles.cliCommand.size * 2.5), textAlign: "right", paddingRight: ptToPx(2), userSelect: "none", flexShrink: 0, display: "inline-block" }}>{i + 1}</span>
                    )}
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Decorative secondary color bar */}
            <div
              className="mt-auto"
              style={{
                height: 2 * scale,
                backgroundColor: styles.colors.secondary,
                borderRadius: 1,
              }}
            />
          </div>

          <HeaderFooterBar config={styles.header} scale={scale} ptToPx={ptToPx} bodyFont={styles.body.font} mLeft={mLeft} mRight={mRight} isHeader />
          <HeaderFooterBar config={styles.footer} scale={scale} ptToPx={ptToPx} bodyFont={styles.body.font} mLeft={mLeft} mRight={mRight} isHeader={false} />
        </div>
      )}
    </div>
  );
}
