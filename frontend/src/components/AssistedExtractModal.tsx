"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  Loader2,
  X,
  Wand2,
  Sparkles,
  Cpu,
  Play,
  Server,
  Search,
  ChevronDown,
  Check,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ScanSearch,
  Monitor,
  Wifi,
  Table2,
  AlignLeft,
} from "lucide-react";

interface NodeItem {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
  manufacturer: { id: number; name: string } | null;
  model: { id: number; name: string } | null;
}

interface LlmProviderItem {
  id: number;
  name: string;
  type: string;
  defaultModel: string | null;
}

interface LlmModelItem {
  id: string;
  name?: string;
  contextLength?: number | null;
  isFree?: boolean;
}

export interface AssistedExtractResult {
  name: string;
  regex: string;
  extractMode: "line" | "block";
  blockSeparator: string | null;
  blockKeyGroup: number | null;
  columns: { label: string; group: number }[];
  keyMode?: "manual" | "extract" | null;
  keyManual?: string | null;
  keyGroup?: number | null;
}

interface Props {
  ruleId: string;
  contextId: number;
  ruleSource: "local" | "ssh";
  ruleCommand: string | null;
  initialOutput?: string | null;
  initialNodeId?: number | null;
  onAccept: (result: AssistedExtractResult) => void;
  onClose: () => void;
}

type Mode = "deterministic" | "ai";
type Structure = "table" | "keyvalue";
type Step = "mode" | "node" | "headers" | "examples" | "annotate" | "preview";

const STEPS_TABLE: Step[] = ["mode", "node", "headers", "examples", "preview"];
const STEPS_KEYVALUE: Step[] = ["mode", "node", "examples", "annotate", "preview"];

type TokenRole = "literal" | "key" | "value";
interface AnnotatedToken {
  text: string;
  offset: number;
  role: TokenRole;
  selectable: boolean;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

const btnPrimaryCls =
  "flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors";

const btnSecondaryCls =
  "flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors";

export default function AssistedExtractModal({
  ruleId,
  contextId,
  ruleSource,
  ruleCommand,
  initialOutput = null,
  initialNodeId = null,
  onAccept,
  onClose,
}: Props) {
  const { t } = useI18n();

  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<Mode>("deterministic");
  const [structure, setStructure] = useState<Structure>("keyvalue");
  const stepOrder = useMemo<Step[]>(
    () => (structure === "keyvalue" ? STEPS_KEYVALUE : STEPS_TABLE),
    [structure]
  );

  // LLM provider/model picker
  const [providers, setProviders] = useState<LlmProviderItem[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerId, setProviderId] = useState<number | null>(null);
  const [models, setModels] = useState<LlmModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [model, setModel] = useState<string>("");

  // Node selection
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(initialNodeId);
  const [nodeSearch, setNodeSearch] = useState("");
  const [nodeDropdownOpen, setNodeDropdownOpen] = useState(false);
  const nodeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [nodeDropdownRect, setNodeDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const openNodeDropdown = () => {
    if (nodeTriggerRef.current) {
      const r = nodeTriggerRef.current.getBoundingClientRect();
      setNodeDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setNodeDropdownOpen((v) => !v);
  };

  // Command run
  const [output, setOutput] = useState<string>(initialOutput ?? "");
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);

  // Line selection
  const [selectedHeaderLines, setSelectedHeaderLines] = useState<Set<number>>(new Set());
  const [selectedExampleLines, setSelectedExampleLines] = useState<Set<number>>(new Set());

  // Annotation (key-value structure)
  const [annotateLineIdx, setAnnotateLineIdx] = useState<number | null>(null);
  const [annotateTokens, setAnnotateTokens] = useState<AnnotatedToken[]>([]);

  // Preview result
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    regex: string;
    extractMode: "line" | "block";
    blockSeparator: string | null;
    blockKeyGroup: number | null;
    columns: { label: string; group: number }[];
    keyMode: "manual" | "extract" | null;
    keyManual: string | null;
    keyGroup: number | null;
    matchedLines: number;
    totalLines: number;
    regexError: string | null;
  } | null>(null);
  const [editingColumns, setEditingColumns] = useState<{ label: string; group: number }[]>([]);
  const [editingRegex, setEditingRegex] = useState<string>("");
  const [extractName, setExtractName] = useState<string>("");

  const outputLines = useMemo(() => (output ? output.split("\n") : []), [output]);

  // Load providers when entering AI mode
  useEffect(() => {
    if (mode !== "ai") return;
    if (providers.length > 0) return;
    setProvidersLoading(true);
    fetch("/api/llm/providers")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LlmProviderItem[]) => {
        setProviders(data);
        if (data.length > 0) {
          setProviderId(data[0].id);
        }
      })
      .finally(() => setProvidersLoading(false));
  }, [mode, providers.length]);

  // Load models when provider changes
  useEffect(() => {
    if (mode !== "ai" || providerId === null) return;
    setModelsLoading(true);
    setModels([]);
    setModel("");
    fetch(`/api/llm/providers/${providerId}/models`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LlmModelItem[]) => {
        setModels(data);
        // Default to provider's defaultModel if available
        const def = providers.find((p) => p.id === providerId)?.defaultModel;
        if (def && data.some((m) => m.id === def)) {
          setModel(def);
        } else if (data.length > 0) {
          setModel(data[0].id);
        }
      })
      .finally(() => setModelsLoading(false));
  }, [providerId, mode, providers]);

  // Load nodes when entering node step
  useEffect(() => {
    if (step !== "node" || nodes.length > 0) return;
    setNodesLoading(true);
    fetch(`/api/nodes?context=${contextId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: NodeItem[]) => setNodes(data))
      .finally(() => setNodesLoading(false));
  }, [step, contextId, nodes.length]);

  const filteredNodes = useMemo(() => {
    if (!nodeSearch.trim()) return nodes;
    const q = nodeSearch.toLowerCase();
    return nodes.filter(
      (n) =>
        (n.name && n.name.toLowerCase().includes(q)) ||
        n.ipAddress.toLowerCase().includes(q) ||
        (n.hostname && n.hostname.toLowerCase().includes(q)) ||
        (n.manufacturer && n.manufacturer.name.toLowerCase().includes(q)) ||
        (n.model && n.model.name.toLowerCase().includes(q))
    );
  }, [nodes, nodeSearch]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const runCommand = useCallback(async () => {
    if (!selectedNodeId) return;
    setExecuting(true);
    setExecuteError(null);
    try {
      const res = await fetch(`/api/collection-rules/${ruleId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: selectedNodeId }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.output) {
        setOutput(data.output);
        setSelectedHeaderLines(new Set());
        setSelectedExampleLines(new Set());
      } else {
        setExecuteError(data.error || t("collection_rules.assistedExecuteFailed"));
      }
    } catch {
      setExecuteError(t("collection_rules.assistedExecuteFailed"));
    } finally {
      setExecuting(false);
    }
  }, [ruleId, selectedNodeId, t]);

  const toggleHeaderLine = (i: number) => {
    setSelectedHeaderLines((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const toggleExampleLine = (i: number) => {
    setSelectedExampleLines((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const generate = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const body: Record<string, unknown> = {
        mode,
        structure,
        output,
      };
      if (structure === "keyvalue") {
        const line = annotateLineIdx !== null ? outputLines[annotateLineIdx] ?? "" : "";
        body.line = line;
        body.tokens = annotateTokens
          .filter((tok) => tok.role !== "literal" || true) // keep all tokens incl. literal for context
          .map((tok) => ({ text: tok.text, offset: tok.offset, role: tok.role }));
      } else {
        body.headers = Array.from(selectedHeaderLines)
          .sort((a, b) => a - b)
          .map((i) => outputLines[i] ?? "");
        body.examples = Array.from(selectedExampleLines)
          .sort((a, b) => a - b)
          .map((i) => outputLines[i] ?? "");
      }
      if (mode === "ai") {
        if (!providerId || !model) {
          setPreviewError(t("collection_rules.assistedNoProvider"));
          setPreviewLoading(false);
          return;
        }
        body.providerId = providerId;
        body.model = model;
      }
      const res = await fetch(`/api/collection-rules/${ruleId}/extract-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error || t("collection_rules.assistedGenerateFailed"));
        return;
      }
      setPreview(data);
      setEditingRegex(data.regex);
      setEditingColumns(data.columns ?? []);

      // Suggest a name based on structure
      if (structure === "keyvalue") {
        const keyTokens = annotateTokens.filter((t) => t.role === "key");
        const literalTokens = annotateTokens.filter((t) => t.role === "literal");
        const hint = (keyTokens.length > 0 ? keyTokens : literalTokens)
          .map((tok) => tok.text)
          .join(" ");
        setExtractName(hint.trim() || data.keyManual || t("collection_rules.assistedDefaultName"));
      } else {
        const headers = Array.from(selectedHeaderLines)
          .sort((a, b) => a - b)
          .map((i) => outputLines[i] ?? "");
        const firstHeader = headers[0] ?? "";
        const tokens = firstHeader.trim().split(/\s+/).slice(0, 4);
        setExtractName(tokens.join(" ") || t("collection_rules.assistedDefaultName"));
      }
    } catch {
      setPreviewError(t("collection_rules.assistedGenerateFailed"));
    } finally {
      setPreviewLoading(false);
    }
  }, [
    mode,
    structure,
    providerId,
    model,
    ruleId,
    output,
    outputLines,
    selectedHeaderLines,
    selectedExampleLines,
    annotateLineIdx,
    annotateTokens,
    t,
  ]);

  // Compute highlighted matches in the preview, using the editingRegex
  const matchedLineIndices = useMemo(() => {
    if (!editingRegex) return new Set<number>();
    const idx = new Set<number>();
    try {
      const re = new RegExp(editingRegex);
      outputLines.forEach((line, i) => {
        if (re.test(line)) idx.add(i);
      });
    } catch {
      /* ignore invalid regex */
    }
    return idx;
  }, [editingRegex, outputLines]);

  const tokenizeForAnnotation = (line: string): AnnotatedToken[] => {
    // Split keeping delimiter positions so the user can mark tokens.
    // We treat `:` and `=` and `,` as standalone tokens; whitespace becomes
    // a non-selectable spacer rendered between selectable tokens.
    const tokens: AnnotatedToken[] = [];
    const regex = /(\s+|[:=,])|([^\s:=,]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const text = match[0];
      const offset = match.index;
      if (match[1] !== undefined) {
        // separator or whitespace
        const isWhitespace = /^\s+$/.test(text);
        tokens.push({
          text,
          offset,
          role: "literal",
          selectable: !isWhitespace,
        });
      } else if (match[2] !== undefined) {
        tokens.push({ text, offset, role: "literal", selectable: true });
      }
    }
    return tokens;
  };

  const nextStep = useCallback(() => {
    const idx = stepOrder.indexOf(step);
    if (idx === -1 || idx === stepOrder.length - 1) return;
    const next = stepOrder[idx + 1];

    // Transition from examples → annotate (keyvalue) initializes the tokens
    // from the first selected line so the user can start clicking right away.
    if (next === "annotate" && structure === "keyvalue") {
      const firstSel = Array.from(selectedExampleLines).sort((a, b) => a - b)[0] ?? null;
      if (firstSel !== null) {
        setAnnotateLineIdx(firstSel);
        setAnnotateTokens(tokenizeForAnnotation(outputLines[firstSel] ?? ""));
      }
    }

    setStep(next);
    if (next === "preview") {
      void generate();
    }
  }, [step, stepOrder, structure, selectedExampleLines, outputLines, generate]);

  const prevStep = useCallback(() => {
    const idx = stepOrder.indexOf(step);
    if (idx <= 0) return;
    setStep(stepOrder[idx - 1]);
  }, [step, stepOrder]);

  const cycleTokenRole = (i: number) => {
    setAnnotateTokens((prev) =>
      prev.map((tok, j) => {
        if (j !== i) return tok;
        if (!tok.selectable || /^\s+$/.test(tok.text)) return tok;
        // 1 click → VALUE (frequent), 2 clicks → KEY (rare), 3 clicks → back to literal.
        const next: TokenRole =
          tok.role === "literal" ? "value" : tok.role === "value" ? "key" : "literal";
        return { ...tok, role: next };
      })
    );
  };

  // If the user already ran a test before opening the workflow, skip the
  // node step entirely — they have the output ready.
  useEffect(() => {
    if (step === "mode" && initialOutput && initialOutput.length > 0) {
      // Don't auto-advance; the user might still want to switch mode.
    }
  }, [step, initialOutput]);

  const canAdvance = useMemo(() => {
    switch (step) {
      case "mode":
        return mode === "deterministic" || (mode === "ai" && providerId !== null && model !== "");
      case "node":
        return output.length > 0;
      case "headers":
        return selectedHeaderLines.size > 0;
      case "examples":
        if (structure === "keyvalue") return selectedExampleLines.size === 1;
        return selectedExampleLines.size > 0;
      case "annotate":
        return (
          annotateLineIdx !== null &&
          annotateTokens.some((tok) => tok.role === "value")
        );
      case "preview":
        return preview !== null && !previewLoading && editingRegex.length > 0;
      default:
        return false;
    }
  }, [
    step,
    mode,
    providerId,
    model,
    output,
    structure,
    selectedHeaderLines,
    selectedExampleLines,
    annotateLineIdx,
    annotateTokens,
    preview,
    previewLoading,
    editingRegex,
  ]);

  const handleAccept = () => {
    if (!preview) return;
    onAccept({
      name: extractName || t("collection_rules.assistedDefaultName"),
      regex: editingRegex,
      extractMode: preview.extractMode,
      blockSeparator: preview.blockSeparator,
      blockKeyGroup: preview.blockKeyGroup,
      columns: editingColumns.map((c) => ({ label: c.label.trim(), group: c.group })),
      keyMode: (preview as { keyMode?: "manual" | "extract" | null }).keyMode ?? null,
      keyManual: (preview as { keyManual?: string | null }).keyManual ?? null,
      keyGroup: (preview as { keyGroup?: number | null }).keyGroup ?? null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-[80vw] max-w-6xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-violet-500" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("collection_rules.assistedTitle")}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 dark:border-slate-800 text-xs">
          {stepOrder.map((s, i) => {
            const isActive = s === step;
            const isPast = stepOrder.indexOf(step) > i;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
                    isActive
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                      : isPast
                      ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {isPast ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                  <span>{t(`collection_rules.assistedStep_${s}`)}</span>
                </div>
                {i < stepOrder.length - 1 && <span className="text-slate-300 dark:text-slate-600">›</span>}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {step === "mode" && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t("collection_rules.assistedStructureLabel")}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setStructure("keyvalue")}
                    className={`text-left rounded-xl border-2 p-4 transition-all ${
                      structure === "keyvalue"
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/10"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <AlignLeft className="h-5 w-5 text-blue-500" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {t("collection_rules.assistedStructureKeyValue")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("collection_rules.assistedStructureKeyValueDesc")}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStructure("table")}
                    className={`text-left rounded-xl border-2 p-4 transition-all ${
                      structure === "table"
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/10"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Table2 className="h-5 w-5 text-blue-500" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {t("collection_rules.assistedStructureTable")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("collection_rules.assistedStructureTableDesc")}
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t("collection_rules.assistedModeLabel")}
                </p>
                <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setMode("deterministic")}
                  className={`text-left rounded-xl border-2 p-5 transition-all ${
                    mode === "deterministic"
                      ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="h-5 w-5 text-emerald-500" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t("collection_rules.assistedModeDeterministic")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("collection_rules.assistedModeDeterministicDesc")}
                  </p>
                </button>

                <button
                  type="button"
                  disabled
                  title={t("collection_rules.assistedModeAiDisabled")}
                  className="text-left rounded-xl border-2 p-5 opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-5 w-5 text-violet-500" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t("collection_rules.assistedModeAi")}
                    </span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">
                      {t("collection_rules.assistedModeAiSoon")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("collection_rules.assistedModeAiDesc")}
                  </p>
                </button>
                </div>
              </div>

              {mode === "ai" && (
                <div className="rounded-lg border border-violet-200 dark:border-violet-500/20 bg-violet-50/30 dark:bg-violet-500/5 p-4 space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("collection_rules.assistedProvider")}
                    </label>
                    {providersLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t("common.loading")}</div>
                    ) : providers.length === 0 ? (
                      <p className="text-xs text-amber-700 dark:text-amber-400">{t("collection_rules.assistedNoProviders")}</p>
                    ) : (
                      <select
                        value={providerId ?? ""}
                        onChange={(e) => setProviderId(Number(e.target.value))}
                        className={inputCls}
                      >
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.type})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {providerId !== null && (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t("collection_rules.assistedModel")}
                      </label>
                      {modelsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t("common.loading")}</div>
                      ) : models.length === 0 ? (
                        <p className="text-xs text-amber-700 dark:text-amber-400">{t("collection_rules.assistedNoModels")}</p>
                      ) : (
                        <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name || m.id}
                              {m.isFree ? " — free" : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === "node" && (
            <div className="space-y-4">
              {!ruleCommand && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{t("collection_rules.assistedNoCommand")}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("collection_rules.testSelectNode")}
                </label>
                <div className="relative">
                  <button
                    ref={nodeTriggerRef}
                    type="button"
                    onClick={openNodeDropdown}
                    className={`${inputCls} flex items-center gap-2 text-left cursor-pointer`}
                  >
                    <Server className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    {selectedNode ? (
                      <div className="flex-1 min-w-0">
                        <span className="truncate">{selectedNode.name || selectedNode.ipAddress}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
                          {selectedNode.ipAddress}
                          {selectedNode.manufacturer && ` — ${selectedNode.manufacturer.name}`}
                          {selectedNode.model && ` ${selectedNode.model.name}`}
                        </span>
                      </div>
                    ) : (
                      <span className="flex-1 text-slate-400 dark:text-slate-500">{t("collection_rules.testSelectNode")}</span>
                    )}
                    <ChevronDown className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform ${nodeDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {nodeDropdownOpen && nodeDropdownRect && (
                    <>
                      {/* Render the dropdown via fixed positioning so it escapes the modal body's overflow-auto context and renders above the footer. */}
                      <div className="fixed inset-0 z-[60]" onClick={() => setNodeDropdownOpen(false)} />
                      <div
                        className="fixed z-[70] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg"
                        style={{ top: nodeDropdownRect.top, left: nodeDropdownRect.left, width: nodeDropdownRect.width }}
                      >
                        <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                              type="text"
                              value={nodeSearch}
                              onChange={(e) => setNodeSearch(e.target.value)}
                              placeholder={t("collection_rules.testSearchNode")}
                              autoFocus
                              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto py-1">
                          {nodesLoading ? (
                            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                          ) : filteredNodes.length === 0 ? (
                            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">{t("collection_rules.testNoNodes")}</p>
                          ) : (
                            filteredNodes.map((node) => (
                              <button
                                key={node.id}
                                type="button"
                                onClick={() => { setSelectedNodeId(node.id); setNodeDropdownOpen(false); setNodeSearch(""); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                                  node.id === selectedNodeId
                                    ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                                    : "hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                <Server className={`h-4 w-4 flex-shrink-0 ${node.id === selectedNodeId ? "text-slate-900 dark:text-white" : "text-slate-400"}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">{node.name || node.ipAddress}</div>
                                  <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                                    {node.ipAddress}
                                    {node.manufacturer && ` — ${node.manufacturer.name}`}
                                    {node.model && ` ${node.model.name}`}
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                  {ruleSource === "local" ? <Monitor className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
                  {ruleSource.toUpperCase()}
                  {ruleCommand && (<><span className="mx-1">·</span><code className="text-xs">{ruleCommand}</code></>)}
                </div>
                <button
                  onClick={runCommand}
                  disabled={executing || !selectedNodeId || !ruleCommand}
                  className={btnPrimaryCls}
                >
                  {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {executing ? t("collection_rules.testExecuting") : t("collection_rules.testExecute")}
                </button>
              </div>

              {executeError && (
                <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{executeError}</span>
                </div>
              )}

              {output && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 max-h-72 overflow-auto">
                  <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 p-3 whitespace-pre">{output}</pre>
                </div>
              )}
            </div>
          )}

          {(step === "headers" || step === "examples") && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 p-3 text-sm text-blue-700 dark:text-blue-400 flex items-start gap-2">
                <ScanSearch className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  {step === "headers"
                    ? t("collection_rules.assistedHeadersHint")
                    : structure === "keyvalue"
                    ? t("collection_rules.assistedExamplesHintSingle")
                    : t("collection_rules.assistedExamplesHint")}
                </span>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 max-h-[55vh] overflow-auto">
                <table className="text-xs font-mono w-full">
                  <tbody>
                    {outputLines.map((line, i) => {
                      const isHeader = selectedHeaderLines.has(i);
                      const isExample = selectedExampleLines.has(i);
                      const activeSet = step === "headers" ? isHeader : isExample;
                      return (
                        <tr
                          key={i}
                          onClick={() => {
                            if (step === "headers") {
                              toggleHeaderLine(i);
                            } else if (structure === "keyvalue") {
                              // single-line selection for keyvalue
                              setSelectedExampleLines(new Set([i]));
                            } else {
                              toggleExampleLine(i);
                            }
                          }}
                          className={`cursor-pointer transition-colors ${
                            activeSet
                              ? step === "headers"
                                ? "bg-amber-200/60 dark:bg-amber-500/30"
                                : "bg-emerald-200/60 dark:bg-emerald-500/30"
                              : isHeader
                              ? "bg-amber-100/40 dark:bg-amber-500/10"
                              : isExample
                              ? "bg-emerald-100/40 dark:bg-emerald-500/10"
                              : "hover:bg-slate-100 dark:hover:bg-slate-700/50"
                          }`}
                        >
                          <td className="px-3 py-0.5 text-slate-400 dark:text-slate-500 select-none w-12 text-right border-r border-slate-200 dark:border-slate-700">
                            {i + 1}
                          </td>
                          <td className="px-3 py-0.5 text-slate-800 dark:text-slate-200 whitespace-pre">{line || " "}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                {step === "headers" && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-amber-200/60 dark:bg-amber-500/30 border border-amber-300 dark:border-amber-600" />
                    <span className="text-slate-500 dark:text-slate-400">
                      {t("collection_rules.assistedHeadersSelected").replace("{count}", String(selectedHeaderLines.size))}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-200/60 dark:bg-emerald-500/30 border border-emerald-300 dark:border-emerald-600" />
                  <span className="text-slate-500 dark:text-slate-400">
                    {t("collection_rules.assistedExamplesSelected").replace("{count}", String(selectedExampleLines.size))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === "annotate" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 p-3 text-sm text-blue-700 dark:text-blue-400 flex items-start gap-2">
                <ScanSearch className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{t("collection_rules.assistedAnnotateHint")}</span>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {t("collection_rules.assistedAnnotateLine")} #{annotateLineIdx !== null ? annotateLineIdx + 1 : "?"}
                </div>
                <div className="font-mono text-sm flex flex-wrap items-baseline gap-y-1">
                  {annotateTokens.map((tok, i) => {
                    if (/^\s+$/.test(tok.text)) {
                      return (
                        <span key={i} className="whitespace-pre text-slate-400 dark:text-slate-600">
                          {tok.text}
                        </span>
                      );
                    }
                    const colorCls =
                      tok.role === "key"
                        ? "bg-amber-200/80 dark:bg-amber-500/40 text-amber-900 dark:text-amber-100 border-amber-400"
                        : tok.role === "value"
                        ? "bg-emerald-200/80 dark:bg-emerald-500/40 text-emerald-900 dark:text-emerald-100 border-emerald-400"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => cycleTokenRole(i)}
                        className={`rounded border px-1.5 py-0.5 transition-colors ${colorCls}`}
                      >
                        {tok.text}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-200/80 dark:bg-emerald-500/40 border border-emerald-400" />
                  <span className="text-slate-500 dark:text-slate-400">{t("collection_rules.assistedTokenValue")} (1)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-amber-200/80 dark:bg-amber-500/40 border border-amber-400" />
                  <span className="text-slate-500 dark:text-slate-400">{t("collection_rules.assistedTokenKey")} (2)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700" />
                  <span className="text-slate-500 dark:text-slate-400">{t("collection_rules.assistedTokenLiteral")}</span>
                </div>
                <span className="text-slate-400 dark:text-slate-500">— {t("collection_rules.assistedTokenCycle")}</span>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {previewLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("collection_rules.assistedGenerating")}
                </div>
              )}
              {previewError && (
                <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}
              {preview && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t("collection_rules.extractName")}
                      </label>
                      <input
                        type="text"
                        value={extractName}
                        onChange={(e) => setExtractName(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t("collection_rules.extractRegex")}
                      </label>
                      <input
                        type="text"
                        value={editingRegex}
                        onChange={(e) => setEditingRegex(e.target.value)}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                  </div>

                  {preview.extractMode === "block" && (
                    <div className="rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 p-3 text-xs space-y-1">
                      <div><span className="font-medium">{t("collection_rules.extractModeBlock")}</span></div>
                      {preview.blockSeparator && (
                        <div><span className="text-slate-500">{t("collection_rules.blockSeparator")}:</span> <code className="font-mono">{preview.blockSeparator}</code></div>
                      )}
                      {preview.blockKeyGroup && (
                        <div><span className="text-slate-500">{t("collection_rules.blockKeyGroup")}:</span> <code className="font-mono">${preview.blockKeyGroup}</code></div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("collection_rules.assistedColumns")}
                    </label>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                      {editingColumns.length === 0 ? (
                        <div className="p-3 text-xs text-slate-400 dark:text-slate-500">{t("collection_rules.assistedNoColumns")}</div>
                      ) : (
                        editingColumns.map((c, i) => (
                          <div key={i} className="flex items-center gap-3 p-2">
                            <code className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 w-12 text-center">
                              ${c.group}
                            </code>
                            <input
                              type="text"
                              value={c.label}
                              onChange={(e) => {
                                const next = [...editingColumns];
                                next[i] = { ...c, label: e.target.value };
                                setEditingColumns(next);
                              }}
                              className={`${inputCls} flex-1`}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 max-h-72 overflow-auto">
                    <table className="text-xs font-mono w-full">
                      <tbody>
                        {outputLines.map((line, i) => {
                          const matched = matchedLineIndices.has(i);
                          return (
                            <tr key={i} className={matched ? "bg-emerald-200/40 dark:bg-emerald-500/20" : ""}>
                              <td className="px-3 py-0.5 text-slate-400 dark:text-slate-500 select-none w-12 text-right border-r border-slate-200 dark:border-slate-700">
                                {i + 1}
                              </td>
                              <td className="px-3 py-0.5 text-slate-800 dark:text-slate-200 whitespace-pre">{line || " "}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-slate-500 dark:text-slate-400">
                        {t("collection_rules.assistedMatchCount")
                          .replace("{matched}", String(matchedLineIndices.size))
                          .replace("{total}", String(outputLines.length))}
                      </span>
                    </div>
                    {preview.regexError && (
                      <div className="text-red-600 dark:text-red-400">{preview.regexError}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={btnSecondaryCls}
            >
              {t("common.cancel")}
            </button>
            {step !== "mode" && (
              <button onClick={prevStep} className={btnSecondaryCls}>
                <ArrowLeft className="h-4 w-4" />
                {t("collection_rules.assistedBack")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step !== "preview" ? (
              <button
                onClick={nextStep}
                disabled={!canAdvance}
                className={btnPrimaryCls}
              >
                {t("collection_rules.assistedNext")}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleAccept}
                disabled={!preview || !!previewError || editingRegex.length === 0}
                className={btnPrimaryCls}
              >
                <Check className="h-4 w-4" />
                {t("collection_rules.assistedAccept")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
