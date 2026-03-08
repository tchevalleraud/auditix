"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Loader2,
  ArrowLeft,
  ToggleLeft,
  ToggleRight,
  Save,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Filter,
  Trash2,
  Ban,
  Package,
  FileText,
  Play,
  Search,
  Server,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  Hash,
  Terminal,
  Plus,
  X,
  GitBranch,
  FolderOpen,
  HelpCircle,
  Rows3,
} from "lucide-react";

interface RuleDetail {
  id: number;
  identifier: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  sourceType: string;
  sourceCategoryId: number | null;
  sourceCategoryName: string | null;
  sourceKey: string | null;
  sourceValue: string | null;
  sourceCommand: string | null;
  sourceTag: string | null;
  sourceRegex: string | null;
  sourceResultMode: string | null;
  sourceValueMap: { group: number; label: string }[] | null;
  sourceKeyGroup: number | null;
  conditionTree: ConditionTree | null;
  multiRowMessages: Record<string, string> | null;
  folderId: number | null;
  createdAt: string;
}

interface ConditionTree { blocks: ConditionBlock[]; }
interface ConditionBlock {
  type: "if" | "else_if" | "else";
  logic: "and" | "or";
  conditions: ConditionItem[];
  children: ConditionBlock[];
  result: ConditionResult | null;
}
interface ConditionItem {
  field: string;
  operator: string;
  value: string | null;
}
interface ConditionResult {
  status: "compliant" | "non_compliant" | "error" | "not_applicable";
  message: string;
  severity?: "info" | "low" | "medium" | "high" | "critical";
}

interface CategoryItem { id: number; name: string; keyLabel: string | null; }
interface NodeItem { id: number; name: string | null; ipAddress: string; hostname: string | null; manufacturer: { id: number; name: string; logo: string | null } | null; }
interface FolderOption { id: number; name: string; depth: number; }

const tabKeys = ["general", "datasource", "conditions"] as const;
type TabKey = (typeof tabKeys)[number];

const blockColors: Record<string, { border: string; bg: string; badge: string }> = {
  if: { border: "border-l-blue-500", bg: "bg-blue-50/50 dark:bg-blue-500/5", badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  else_if: { border: "border-l-amber-500", bg: "bg-amber-50/50 dark:bg-amber-500/5", badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  else: { border: "border-l-slate-400", bg: "bg-slate-50/50 dark:bg-slate-500/5", badge: "bg-slate-200 text-slate-600 dark:bg-slate-600/30 dark:text-slate-300" },
};

const statusColors: Record<string, string> = {
  compliant: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30",
  non_compliant: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30",
  error: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
  not_applicable: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-600/20 dark:text-slate-300 dark:border-slate-500/30",
};

const severityColors: Record<string, string> = {
  info: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30",
  low: "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/30",
  medium: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
  high: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30",
  critical: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30",
};

interface BlockListProps {
  blocks: ConditionBlock[];
  parentPath: number[];
  depth: number;
  t: (key: string) => string;
  operators: { key: string; noValue: boolean }[];
  statuses: { key: ConditionResult["status"]; color: string }[];
  severities: { key: NonNullable<ConditionResult["severity"]>; color: string }[];
  availableFields: { key: string; label: string }[];
  inputCls: string;
  onUpdate: (path: number[], updater: (b: ConditionBlock) => ConditionBlock) => void;
  onRemove: (path: number[]) => void;
  onAddSibling: (parentPath: number[], type: "else_if" | "else") => void;
  onAddNestedIf: (path: number[]) => void;
}

function ConditionBlockList({ blocks, parentPath, depth, t, operators, statuses, severities, availableFields, inputCls, onUpdate, onRemove, onAddSibling, onAddNestedIf }: BlockListProps) {
  const hasElse = blocks.some((b) => b.type === "else");
  const smallInput = "rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors";

  return (
    <div className="space-y-2">
      {blocks.map((block, bIdx) => {
        const path = [...parentPath, bIdx];
        const colors = blockColors[block.type] || blockColors.if;
        const noValueOps = new Set(operators.filter((o) => o.noValue).map((o) => o.key));

        return (
          <div key={bIdx} className={`border-l-4 ${colors.border} rounded-lg border border-slate-200 dark:border-slate-700 ${colors.bg}`}>
            {/* Block header */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${colors.badge}`}>
                  {t(`compliance_rules.block${block.type === "else_if" ? "ElseIf" : block.type.charAt(0).toUpperCase() + block.type.slice(1)}`)}
                </span>
                {block.type !== "else" && block.conditions.length > 1 && (
                  <button
                    onClick={() => onUpdate(path, (b) => ({ ...b, logic: b.logic === "and" ? "or" : "and" }))}
                    className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${block.logic === "and" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300" : "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"}`}
                  >
                    {t(`compliance_rules.logic${block.logic === "and" ? "And" : "Or"}`)}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!block.children.length && block.result && (
                  <button
                    onClick={() => onAddNestedIf(path)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                    title={t("compliance_rules.addNestedIf")}
                  >
                    <GitBranch className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={() => onRemove(path)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-100/50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Conditions */}
            {block.type !== "else" && (
              <div className="px-4 pb-3 space-y-2">
                {block.conditions.map((cond, cIdx) => (
                  <div key={cIdx} className="flex items-center gap-2">
                    {cIdx > 0 && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${block.logic === "and" ? "text-indigo-500" : "text-violet-500"}`}>
                        {t(`compliance_rules.logic${block.logic === "and" ? "And" : "Or"}`)}
                      </span>
                    )}
                    <select
                      value={cond.field}
                      onChange={(e) => onUpdate(path, (b) => {
                        const cs = [...b.conditions];
                        cs[cIdx] = { ...cs[cIdx], field: e.target.value };
                        return { ...b, conditions: cs };
                      })}
                      className={`${smallInput} min-w-[120px]`}
                    >
                      {availableFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select
                      value={cond.operator}
                      onChange={(e) => onUpdate(path, (b) => {
                        const cs = [...b.conditions];
                        cs[cIdx] = { ...cs[cIdx], operator: e.target.value, value: noValueOps.has(e.target.value) ? null : cs[cIdx].value };
                        return { ...b, conditions: cs };
                      })}
                      className={`${smallInput} min-w-[140px]`}
                    >
                      {operators.map((o) => <option key={o.key} value={o.key}>{t(`compliance_rules.operator_${o.key}`)}</option>)}
                    </select>
                    {!noValueOps.has(cond.operator) && (
                      <input
                        type="text"
                        value={cond.value ?? ""}
                        onChange={(e) => onUpdate(path, (b) => {
                          const cs = [...b.conditions];
                          cs[cIdx] = { ...cs[cIdx], value: e.target.value };
                          return { ...b, conditions: cs };
                        })}
                        placeholder="..."
                        className={`${smallInput} flex-1 font-mono`}
                      />
                    )}
                    {block.conditions.length > 1 && (
                      <button
                        onClick={() => onUpdate(path, (b) => ({ ...b, conditions: b.conditions.filter((_, i) => i !== cIdx) }))}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => onUpdate(path, (b) => ({
                    ...b,
                    conditions: [...b.conditions, { field: availableFields[0]?.key || "$value", operator: "equals", value: "" }],
                  }))}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  {t("compliance_rules.addConditionRow")}
                </button>
              </div>
            )}

            {/* Nested children */}
            {block.children.length > 0 && (
              <div className="px-4 pb-3">
                <ConditionBlockList
                  blocks={block.children}
                  parentPath={path}
                  depth={depth + 1}
                  t={t}
                  operators={operators}
                  statuses={statuses}
                  severities={severities}
                  availableFields={availableFields}
                  inputCls={inputCls}
                  onUpdate={onUpdate}
                  onRemove={(childPath) => {
                    onUpdate(path, (b) => {
                      const newChildren = b.children.filter((_, i) => i !== childPath[childPath.length - 1]);
                      if (newChildren.length === 0) {
                        return { ...b, children: [], result: { status: "compliant", message: "" } };
                      }
                      return { ...b, children: newChildren };
                    });
                  }}
                  onAddSibling={(_, type) => {
                    onUpdate(path, (b) => {
                      const newBlock: ConditionBlock = {
                        type,
                        logic: "and",
                        conditions: type === "else" ? [] : [{ field: availableFields[0]?.key || "$value", operator: "equals", value: "" }],
                        children: [],
                        result: { status: "compliant", message: "" },
                      };
                      return { ...b, children: [...b.children, newBlock] };
                    });
                  }}
                  onAddNestedIf={(childPath) => {
                    onUpdate(childPath, (b) => {
                      const newIf: ConditionBlock = {
                        type: "if",
                        logic: "and",
                        conditions: [{ field: availableFields[0]?.key || "$value", operator: "equals", value: "" }],
                        children: [],
                        result: { status: "compliant", message: "" },
                      };
                      return { ...b, children: [...b.children, newIf], result: null };
                    });
                  }}
                />
              </div>
            )}

            {/* Result (terminal block) */}
            {block.result && (
              <div className="mx-4 mb-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {statuses.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => onUpdate(path, (b) => ({
                        ...b,
                        result: { ...b.result!, status: s.key, severity: s.key === "non_compliant" ? (b.result?.severity || "medium") : undefined },
                      }))}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${block.result?.status === s.key ? statusColors[s.key] : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-600"}`}
                    >
                      {t(`compliance_rules.status_${s.key}`)}
                    </button>
                  ))}
                </div>

                {block.result.status === "non_compliant" && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">{t("compliance_rules.resultSeverity")}:</span>
                    {severities.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => onUpdate(path, (b) => ({ ...b, result: { ...b.result!, severity: s.key } }))}
                        className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${block.result?.severity === s.key ? severityColors[s.key] : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-600"}`}
                      >
                        {t(`compliance_rules.severity_${s.key}`)}
                      </button>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  value={block.result.message}
                  onChange={(e) => onUpdate(path, (b) => ({ ...b, result: { ...b.result!, message: e.target.value } }))}
                  placeholder={t("compliance_rules.resultMessagePlaceholder")}
                  className={`${smallInput} w-full`}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Add ELSE IF / ELSE buttons */}
      {blocks.length > 0 && (
        <div className="flex items-center gap-2 pl-2">
          <button
            onClick={() => onAddSibling(parentPath, "else_if")}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-dashed border-slate-300 dark:border-slate-600 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t("compliance_rules.addElseIf")}
          </button>
          {!hasElse && (
            <button
              onClick={() => onAddSibling(parentPath, "else")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-dashed border-slate-300 dark:border-slate-600 transition-colors"
            >
              <Plus className="h-3 w-3" />
              {t("compliance_rules.addElse")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ComplianceRuleEditPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const { current } = useAppContext();
  const ruleId = params.id as string;

  const [rule, setRule] = useState<RuleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  // Edit fields
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Source fields
  const [sourceType, setSourceType] = useState("none");
  const [sourceCategoryId, setSourceCategoryId] = useState<number | null>(null);
  const [sourceKey, setSourceKey] = useState("");
  const [sourceValue, setSourceValue] = useState("");
  const [sourceCommand, setSourceCommand] = useState("");
  const [sourceTag, setSourceTag] = useState("");
  const [sourceRegex, setSourceRegex] = useState("");
  const [sourceResultMode, setSourceResultMode] = useState("capture");
  const [captureGroups, setCaptureGroups] = useState<{ isKey: boolean; label: string }[]>([]);
  const [savingSource, setSavingSource] = useState(false);
  const [savedSource, setSavedSource] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  // Test
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [testNodeId, setTestNodeId] = useState<number | null>(null);
  const [testNodeSearch, setTestNodeSearch] = useState("");
  const [showNodeDropdown, setShowNodeDropdown] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  // Capture groups detection
  const detectedGroupCount = useMemo(() => {
    if (!sourceRegex) return 0;
    let count = 0, escaped = false, inCharClass = false;
    for (let i = 0; i < sourceRegex.length; i++) {
      const ch = sourceRegex[i];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === "[") { inCharClass = true; continue; }
      if (ch === "]") { inCharClass = false; continue; }
      if (inCharClass) continue;
      if (ch === "(" && sourceRegex[i + 1] !== "?") count++;
    }
    return count;
  }, [sourceRegex]);

  useEffect(() => {
    setCaptureGroups((prev) => {
      if (detectedGroupCount === 0) return [];
      return Array.from({ length: detectedGroupCount }, (_, i) =>
        i < prev.length ? prev[i] : { isKey: false, label: "" }
      );
    });
  }, [detectedGroupCount]);

  // Conditions
  const [conditionTree, setConditionTree] = useState<ConditionTree | null>(null);
  const [savingConditions, setSavingConditions] = useState(false);
  const [savedConditions, setSavedConditions] = useState(false);

  // Evaluate
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evalNodeSearch, setEvalNodeSearch] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<Record<string, unknown> | null>(null);

  // Multi-row messages
  const [multiRowMessages, setMultiRowMessages] = useState<Record<string, string>>({});
  const [showMultiRowModal, setShowMultiRowModal] = useState(false);
  const [savingMultiRow, setSavingMultiRow] = useState(false);

  // Help
  const [showConditionsHelp, setShowConditionsHelp] = useState(false);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const loadRule = useCallback(async () => {
    const res = await fetch(`/api/compliance-rules/${ruleId}`);
    if (res.ok) {
      const data: RuleDetail = await res.json();
      setRule(data);
      setIdentifier(data.identifier || "");
      setName(data.name);
      setDescription(data.description || "");
      setEnabled(data.enabled);
      setFolderId(data.folderId);
      setSourceType(data.sourceType || "none");
      setSourceCategoryId(data.sourceCategoryId);
      setSourceKey(data.sourceKey || "");
      setSourceValue(data.sourceValue || "");
      setSourceCommand(data.sourceCommand || "");
      setSourceTag(data.sourceTag || "");
      setSourceRegex(data.sourceRegex || "");
      setSourceResultMode(data.sourceResultMode || "capture");
      // Reconstruct captureGroups from saved valueMap
      const regex = data.sourceRegex || "";
      let groupCount = 0, esc = false, inCC = false;
      for (let i = 0; i < regex.length; i++) {
        const ch = regex[i];
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === "[") { inCC = true; continue; }
        if (ch === "]") { inCC = false; continue; }
        if (inCC) continue;
        if (ch === "(" && regex[i + 1] !== "?") groupCount++;
      }
      const groups = Array.from({ length: groupCount }, () => ({ isKey: false, label: "" }));
      if (data.sourceKeyGroup !== null && data.sourceKeyGroup !== undefined) {
        const ki = data.sourceKeyGroup - 1;
        if (ki >= 0 && ki < groups.length) groups[ki].isKey = true;
      }
      if (data.sourceValueMap) {
        data.sourceValueMap.forEach((vm: { group: number; label: string }) => {
          const vi = vm.group - 1;
          if (vi >= 0 && vi < groups.length) groups[vi].label = vm.label;
        });
      }
      setCaptureGroups(groups);
      setConditionTree(data.conditionTree || null);
      setMultiRowMessages(data.multiRowMessages || {});
    }
    setLoading(false);
  }, [ruleId]);

  const loadCategories = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/inventory-categories?context=${current.id}`);
    if (res.ok) setCategories(await res.json());
  }, [current]);

  const loadNodes = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/nodes?context=${current.id}`);
    if (res.ok) setNodes(await res.json());
  }, [current]);

  const loadFolders = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/compliance-rules/tree?context=${current.id}`);
    if (!res.ok) return;
    const tree = await res.json();
    const flat: FolderOption[] = [];
    const flatten = (folders: { id: number; name: string; children: unknown[] }[], depth: number) => {
      for (const f of folders) {
        flat.push({ id: f.id, name: f.name, depth });
        if (f.children) flatten(f.children as typeof folders, depth + 1);
      }
    };
    flatten(tree.folders || [], 0);
    setFolders(flat);
  }, [current]);

  useEffect(() => { loadRule(); }, [loadRule]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (activeTab === "datasource" || activeTab === "conditions") {
      loadNodes();
    }
    if (activeTab === "datasource") {
      loadCategories();
    }
  }, [activeTab, loadCategories, loadNodes]);

  const saveGeneral = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/compliance-rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() || null, name: name.trim(), description: description.trim() || null, enabled, folderId }),
      });
      if (res.ok) {
        const data = await res.json();
        setRule(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally { setSaving(false); }
  };

  const saveSource = async () => {
    setSavingSource(true);
    try {
      const body: Record<string, unknown> = { sourceType };
      if (sourceType === "inventory") {
        body.sourceCategoryId = sourceCategoryId;
        body.sourceKey = sourceKey || null;
        body.sourceValue = sourceValue || null;
      } else if (sourceType === "collection" || sourceType === "ssh") {
        body.sourceCommand = sourceCommand || null;
        body.sourceTag = sourceType === "collection" ? (sourceTag || null) : null;
        body.sourceRegex = sourceRegex || null;
        body.sourceResultMode = sourceResultMode;
        // Build valueMap from captureGroups (exclude key group)
        if (sourceResultMode === "capture" && captureGroups.length > 0) {
          const keyIdx = captureGroups.findIndex((g) => g.isKey);
          let valNum = 0;
          const vm = captureGroups
            .map((g, i) => ({ group: i + 1, label: g.label, isKey: g.isKey }))
            .filter((g) => !g.isKey)
            .map((g) => ({ group: g.group, label: g.label.trim() || `Value#${++valNum}` }));
          body.sourceValueMap = vm.length > 0 ? vm : null;
          body.sourceKeyGroup = keyIdx >= 0 ? keyIdx + 1 : null;
        } else {
          body.sourceValueMap = null;
          body.sourceKeyGroup = null;
        }
      }
      if (sourceType === "none") {
        body.sourceCategoryId = null;
        body.sourceKey = null;
        body.sourceValue = null;
        body.sourceCommand = null;
        body.sourceTag = null;
        body.sourceRegex = null;
        body.sourceResultMode = null;
        body.sourceValueMap = null;
      }
      const res = await fetch(`/api/compliance-rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setRule(data);
        setSavedSource(true);
        setTimeout(() => setSavedSource(false), 2000);
      }
    } finally { setSavingSource(false); }
  };

  const runTest = async () => {
    if (!testNodeId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/compliance-rules/${ruleId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: testNodeId }),
      });
      setTestResult(await res.json());
    } finally { setTesting(false); }
  };

  const handleDelete = async () => {
    await fetch(`/api/compliance-rules/${ruleId}`, { method: "DELETE" });
    router.push("/compliance/rules");
  };

  const saveConditions = async () => {
    setSavingConditions(true);
    try {
      const res = await fetch(`/api/compliance-rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditionTree }),
      });
      if (res.ok) {
        const data = await res.json();
        setRule(data);
        setSavedConditions(true);
        setTimeout(() => setSavedConditions(false), 2000);
      }
    } finally { setSavingConditions(false); }
  };

  const runEvaluate = async (nodeId: number) => {
    setEvaluating(true);
    setEvalResult(null);
    try {
      const res = await fetch(`/api/compliance-rules/${ruleId}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      });
      setEvalResult(await res.json());
    } finally { setEvaluating(false); }
  };

  const filteredEvalNodes = nodes.filter((n) => {
    const q = evalNodeSearch.toLowerCase();
    return !q || (n.name && n.name.toLowerCase().includes(q)) || n.ipAddress.includes(q) || (n.hostname && n.hostname.toLowerCase().includes(q));
  });

  const operators = [
    { key: "equals", noValue: false },
    { key: "not_equals", noValue: false },
    { key: "contains", noValue: false },
    { key: "not_contains", noValue: false },
    { key: "matches", noValue: false },
    { key: "greater_than", noValue: false },
    { key: "less_than", noValue: false },
    { key: "exists", noValue: true },
    { key: "not_exists", noValue: true },
    { key: "is_empty", noValue: true },
    { key: "is_not_empty", noValue: true },
  ];

  const statuses: { key: ConditionResult["status"]; color: string }[] = [
    { key: "compliant", color: "emerald" },
    { key: "non_compliant", color: "red" },
    { key: "error", color: "amber" },
    { key: "not_applicable", color: "slate" },
  ];

  const severities: { key: NonNullable<ConditionResult["severity"]>; color: string }[] = [
    { key: "info", color: "blue" },
    { key: "low", color: "sky" },
    { key: "medium", color: "amber" },
    { key: "high", color: "orange" },
    { key: "critical", color: "red" },
  ];

  const availableFields = useMemo(() => {
    const st = rule?.sourceType || sourceType;
    const rm = rule?.sourceResultMode || sourceResultMode;
    if (st === "none") return [];
    if (st === "inventory") return [{ key: "$value", label: t("compliance_rules.fieldValue") }];
    if (rm === "match") return [{ key: "$match", label: t("compliance_rules.fieldMatch") }];
    if (rm === "count") return [{ key: "$count", label: t("compliance_rules.fieldCount") }];
    const fields = [{ key: "$value", label: t("compliance_rules.fieldValue") }];
    const vm = rule?.sourceValueMap;
    if (vm) {
      vm.forEach((m) => fields.push({ key: m.label, label: m.label }));
    }
    if (rule?.sourceKeyGroup) {
      fields.push({ key: "$key", label: t("compliance_rules.fieldKey") });
    }
    return fields;
  }, [rule, sourceType, sourceResultMode, t]);

  const makeEmptyBlock = (type: ConditionBlock["type"]): ConditionBlock => ({
    type,
    logic: "and",
    conditions: type === "else" ? [] : [{ field: availableFields[0]?.key || "$value", operator: "equals", value: "" }],
    children: [],
    result: { status: "compliant", message: "" },
  });

  const cloneTree = (tree: ConditionTree): ConditionTree => JSON.parse(JSON.stringify(tree));

  const updateBlockAtPath = (tree: ConditionTree, path: number[], updater: (b: ConditionBlock) => ConditionBlock): ConditionTree => {
    const t2 = cloneTree(tree);
    let blocks = t2.blocks;
    for (let i = 0; i < path.length - 1; i++) blocks = blocks[path[i]].children;
    blocks[path[path.length - 1]] = updater(blocks[path[path.length - 1]]);
    return t2;
  };

  const addBlockAtPath = (tree: ConditionTree, parentPath: number[], type: "else_if" | "else"): ConditionTree => {
    const t2 = cloneTree(tree);
    let blocks = t2.blocks;
    for (const idx of parentPath) blocks = blocks[idx].children;
    blocks.push(makeEmptyBlock(type));
    return t2;
  };

  const removeBlockAtPath = (tree: ConditionTree, path: number[]): ConditionTree => {
    const t2 = cloneTree(tree);
    let blocks = t2.blocks;
    for (let i = 0; i < path.length - 1; i++) blocks = blocks[path[i]].children;
    blocks.splice(path[path.length - 1], 1);
    return t2;
  };

  const addNestedIfAtPath = (tree: ConditionTree, path: number[]): ConditionTree => {
    const t2 = cloneTree(tree);
    let blocks = t2.blocks;
    for (let i = 0; i < path.length - 1; i++) blocks = blocks[path[i]].children;
    const block = blocks[path[path.length - 1]];
    block.children.push(makeEmptyBlock("if"));
    block.result = null;
    return t2;
  };

  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300";

  const tabs = [
    { key: "general" as TabKey, label: t("compliance_rules.tabGeneral"), icon: <ClipboardCheck className="h-4 w-4" /> },
    { key: "datasource" as TabKey, label: t("compliance_rules.tabDatasource"), icon: <Database className="h-4 w-4" /> },
    { key: "conditions" as TabKey, label: t("compliance_rules.tabConditions"), icon: <Filter className="h-4 w-4" /> },
  ];

  const filteredNodes = nodes.filter((n) => {
    const q = testNodeSearch.toLowerCase();
    return !q || (n.name && n.name.toLowerCase().includes(q)) || n.ipAddress.includes(q) || (n.hostname && n.hostname.toLowerCase().includes(q));
  });
  const selectedNode = nodes.find((n) => n.id === testNodeId);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" /></div>;
  }
  if (!rule) {
    return <div className="flex items-center justify-center py-20"><p className="text-sm text-slate-500">{t("common.noResult")}</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/compliance/rules")} className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{rule.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t("compliance_rules.editRule")}
              {rule.description && <span> | {rule.description}</span>}
            </p>
          </div>
        </div>
        {(saved || savedSource || savedConditions) && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            {t("compliance_rules.saved")}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 shrink-0">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab.key ? "border-slate-900 dark:border-white text-slate-900 dark:text-white" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* General tab */}
      {activeTab === "general" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className={labelCls}>{t("compliance_rules.identifier")}</label>
                <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t("compliance_rules.identifierPlaceholder")} className={`${inputCls} font-mono`} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>{t("compliance_rules.name")}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("compliance_rules.namePlaceholder")} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>{t("compliance_rules.description")}</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={t("compliance_rules.descriptionPlaceholder")} className={`${inputCls} resize-none`} />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" onClick={() => setEnabled(!enabled)}>
                  {enabled ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">{enabled ? t("compliance_rules.enabled") : t("compliance_rules.disabled")}</span>
              </label>
              <div className="space-y-1.5">
                <label className={labelCls}>
                  <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4" />{t("compliance_rules.folder")}</span>
                </label>
                <select
                  value={folderId ?? ""}
                  onChange={(e) => setFolderId(e.target.value ? Number(e.target.value) : null)}
                  className={inputCls}
                >
                  <option value="">{t("compliance_rules.noFolder")}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {"—".repeat(f.depth)} {f.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("compliance_rules.folderHelp")}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
              <button onClick={saveGeneral} disabled={saving || !name.trim()} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("common.save")}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">{t("compliance_rules.dangerZone")}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.dangerZoneDesc")}</p>
                </div>
                <button onClick={() => setDeleteConfirm(true)} className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                  <Trash2 className="h-4 w-4" />
                  {t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data source tab */}
      {activeTab === "datasource" && (
        <div className="space-y-6">
          {/* Source type selector */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.tabDatasource")}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.datasourceHelp")}</p>
                </div>
                <button onClick={saveSource} disabled={savingSource} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                  {savingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t("common.save")}
                </button>
              </div>

              <div className="flex gap-3">
                {[
                  { key: "none", icon: <Ban className="h-4 w-4" />, label: t("compliance_rules.datasourceNone") },
                  { key: "inventory", icon: <Package className="h-4 w-4" />, label: t("compliance_rules.dsInventory") },
                  { key: "collection", icon: <FileText className="h-4 w-4" />, label: t("compliance_rules.dsCollection") },
                  { key: "ssh", icon: <Terminal className="h-4 w-4" />, label: t("compliance_rules.dsSSH") },
                ].map((opt) => (
                  <button key={opt.key} onClick={() => setSourceType(opt.key)}
                    className={`flex-1 flex items-center gap-3 p-4 rounded-lg border transition-colors ${sourceType === opt.key ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"}`}
                  >
                    <span className={sourceType === opt.key ? "text-slate-900 dark:text-white" : "text-slate-400"}>{opt.icon}</span>
                    <span className={`text-sm font-medium ${sourceType === opt.key ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>{opt.label}</span>
                  </button>
                ))}
              </div>

              {/* Inventory fields */}
              {sourceType === "inventory" && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className={labelCls}>{t("compliance_rules.dsCategory")}</label>
                    <select value={sourceCategoryId ?? ""} onChange={(e) => setSourceCategoryId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                      <option value="">{t("compliance_rules.dsCategorySelect")}</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>{t("compliance_rules.dsKey")}</label>
                    <input type="text" value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} placeholder={t("compliance_rules.dsKeyPlaceholder")} className={`${inputCls} font-mono`} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>{t("compliance_rules.dsValue")}</label>
                    <input type="text" value={sourceValue} onChange={(e) => setSourceValue(e.target.value)} placeholder="Value#1" className={inputCls} />
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t("compliance_rules.dsValueHelp")}</p>
                  </div>
                </div>
              )}

              {/* Collection / SSH fields — two-column layout */}
              {(sourceType === "collection" || sourceType === "ssh") && (
                <div className="grid grid-cols-5 gap-6 pt-2">
                  {/* Left column 60% — configuration */}
                  <div className="col-span-3 space-y-4">
                    {sourceType === "ssh" && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">{t("compliance_rules.dsSSHDesc")}</p>
                    )}
                    <div className="space-y-1.5">
                      <label className={labelCls}>{t("compliance_rules.dsCommand")}</label>
                      <input type="text" value={sourceCommand} onChange={(e) => setSourceCommand(e.target.value)} placeholder={t("compliance_rules.dsCommandPlaceholder")} className={`${inputCls} font-mono`} />
                    </div>
                    {sourceType === "collection" && (
                      <div className="space-y-1.5">
                        <label className={labelCls}>{t("compliance_rules.dsTag")}</label>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{t("compliance_rules.dsTagHelp")}</p>
                        <input type="text" value={sourceTag} onChange={(e) => setSourceTag(e.target.value)} placeholder="latest" className={inputCls} />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className={labelCls}>{t("compliance_rules.dsRegex")}</label>
                      <input type="text" value={sourceRegex} onChange={(e) => setSourceRegex(e.target.value)} placeholder={t("compliance_rules.dsRegexPlaceholder")} className={`${inputCls} font-mono`} />
                      {detectedGroupCount > 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{detectedGroupCount} groupe{detectedGroupCount > 1 ? "s" : ""} de capture</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>{t("compliance_rules.dsResultMode")}</label>
                      <div className="flex gap-3">
                        {[
                          { key: "capture", label: t("compliance_rules.dsCapture") },
                          { key: "match", label: t("compliance_rules.dsMatch") },
                          { key: "count", label: t("compliance_rules.dsCount") },
                        ].map((opt) => (
                          <button key={opt.key} onClick={() => setSourceResultMode(opt.key)}
                            className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${sourceResultMode === opt.key ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right column 40% — capture groups */}
                  <div className="col-span-2">
                    <div className="space-y-2">
                      <label className={labelCls}>{t("compliance_rules.dsValueMap")}</label>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{t("compliance_rules.dsValueMapHelp")}</p>
                      {detectedGroupCount > 0 && sourceResultMode === "capture" ? (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-800/50">
                                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 w-12">#</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-14">{t("compliance_rules.dsGroupKey")}</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{t("compliance_rules.dsMappingLabel")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {captureGroups.map((g, gIdx) => (
                                <tr key={gIdx} className={g.isKey ? "bg-amber-50/50 dark:bg-amber-500/5" : ""}>
                                  <td className="px-3 py-2">
                                    <code className="text-xs font-mono text-slate-500 dark:text-slate-400">${gIdx + 1}</code>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <input
                                      type="radio"
                                      name="captureKeyGroup"
                                      checked={g.isKey}
                                      onChange={() => {
                                        setCaptureGroups(captureGroups.map((gr, i) => ({
                                          ...gr,
                                          isKey: i === gIdx,
                                        })));
                                      }}
                                      className="h-3.5 w-3.5 accent-amber-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="text"
                                      value={g.label}
                                      onChange={(e) => {
                                        const next = [...captureGroups];
                                        next[gIdx] = { ...next[gIdx], label: e.target.value };
                                        setCaptureGroups(next);
                                      }}
                                      disabled={g.isKey}
                                      placeholder={g.isKey ? t("compliance_rules.dsGroupKeyPlaceholder") : `Value#${gIdx + 1}`}
                                      className={`w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors ${g.isKey ? "opacity-50 cursor-not-allowed" : ""}`}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">{t("compliance_rules.dsGroupKeyHelp")}</p>
                        </div>
                      ) : detectedGroupCount === 0 ? (
                        <div className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                          <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                          <p className="text-xs text-slate-400 dark:text-slate-500">{t("compliance_rules.dsNoGroups")}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                          <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                          <p className="text-xs text-slate-400 dark:text-slate-500">{t("compliance_rules.dsCaptureOnly")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Test section */}
          {sourceType !== "none" && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.testTitle")}</h3>
                <div className="flex items-center gap-3">
                  {/* Node selector */}
                  <div className="relative flex-1">
                    <button onClick={() => setShowNodeDropdown(!showNodeDropdown)}
                      className={`${inputCls} flex items-center justify-between text-left`}
                    >
                      <span className={selectedNode ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}>
                        {selectedNode
                          ? `${selectedNode.name || selectedNode.hostname || selectedNode.ipAddress}${(selectedNode.name || selectedNode.hostname) ? ` — ${selectedNode.ipAddress}` : ""}`
                          : t("compliance_rules.testSelectNode")}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    </button>
                    {showNodeDropdown && (
                      <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                        <div className="p-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input type="text" value={testNodeSearch} onChange={(e) => setTestNodeSearch(e.target.value)}
                              placeholder={t("compliance_rules.testSearchNode")}
                              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 pl-8 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                            />
                          </div>
                        </div>
                        {filteredNodes.length === 0 ? (
                          <div className="px-3 py-4 text-center text-sm text-slate-400">{t("compliance_rules.testNoNodes")}</div>
                        ) : (
                          filteredNodes.slice(0, 20).map((n) => (
                            <button key={n.id} onClick={() => { setTestNodeId(n.id); setShowNodeDropdown(false); setTestNodeSearch(""); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                              {n.manufacturer?.logo ? (
                                <img src={`/api/logos/${n.manufacturer.logo}`} alt={n.manufacturer.name} className="h-4 w-4 object-contain shrink-0" />
                              ) : (
                                <Server className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              )}
                              <span className="truncate">{n.name || n.hostname || n.ipAddress}</span>
                              {(n.name || n.hostname) && <span className="text-xs text-slate-400 truncate">{n.ipAddress}</span>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={runTest} disabled={!testNodeId || testing}
                    className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {t("compliance_rules.testExecute")}
                  </button>
                </div>

                {/* Test result */}
                {testResult && (
                  <div className="space-y-3">
                    {!(testResult as Record<string, unknown>).success ? (
                      <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5">
                        <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-400">{String((testResult as Record<string, unknown>).error)}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t("compliance_rules.testSuccess")}</span>
                          {selectedNode && (
                            <span className="text-xs text-slate-400">
                              {selectedNode.name || selectedNode.hostname || selectedNode.ipAddress}{(selectedNode.name || selectedNode.hostname) ? ` — ${selectedNode.ipAddress}` : ""}
                            </span>
                          )}
                          {Boolean((testResult as Record<string, unknown>).collectionId) && (
                            <span className="text-xs text-slate-400">Collection #{String((testResult as Record<string, unknown>).collectionId)}</span>
                          )}
                        </div>

                        {/* Result display */}
                        {(testResult as Record<string, unknown>).resultMode === "match" && (
                          <div className={`flex items-center gap-3 p-4 rounded-lg border ${(testResult as Record<string, unknown>).result ? "border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5" : "border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5"}`}>
                            {(testResult as Record<string, unknown>).result
                              ? <CheckCircle className="h-5 w-5 text-emerald-500" />
                              : <AlertCircle className="h-5 w-5 text-red-500" />}
                            <span className={`text-sm font-medium ${(testResult as Record<string, unknown>).result ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                              {(testResult as Record<string, unknown>).result ? "True" : "False"}
                            </span>
                          </div>
                        )}

                        {(testResult as Record<string, unknown>).resultMode === "count" && (
                          <div className="flex items-center gap-3 p-4 rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/5">
                            <Hash className="h-5 w-5 text-blue-500" />
                            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                              {t("compliance_rules.testCount")}: {String((testResult as Record<string, unknown>).result)}
                            </span>
                          </div>
                        )}

                        {(testResult as Record<string, unknown>).resultMode === "capture" && (
                          <div className="space-y-2">
                            <p className="text-xs text-slate-400">{t("compliance_rules.testCaptured")}: {String((testResult as Record<string, unknown>).matchCount)}</p>
                            {Array.isArray((testResult as Record<string, unknown>).result) && (
                              (() => {
                                const results = (testResult as Record<string, unknown>).result as unknown[];
                                if (results.length === 0) return <p className="text-sm text-slate-400">{t("compliance_rules.testNoMatch")}</p>;
                                const first = results[0];
                                if (typeof first === "object" && first !== null) {
                                  const keys = Object.keys(first as Record<string, unknown>);
                                  return (
                                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="bg-slate-50 dark:bg-slate-800/50">
                                            {keys.map((k) => <th key={k} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{k}</th>)}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                          {results.map((row, i) => (
                                            <tr key={i}>
                                              {keys.map((k) => <td key={k} className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono text-xs">{String((row as Record<string, unknown>)[k] ?? "")}</td>)}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  );
                                }
                                return (
                                  <div className="space-y-1">
                                    {results.map((v, i) => (
                                      <div key={i} className="px-3 py-1.5 rounded bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-700 dark:text-slate-300">{String(v)}</div>
                                    ))}
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        )}

                        {/* Inventory result */}
                        {String((testResult as Record<string, unknown>).sourceType) === "inventory" && (
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                            <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                              {(testResult as Record<string, unknown>).result !== null
                                ? (Array.isArray((testResult as Record<string, unknown>).result)
                                  ? ((testResult as Record<string, unknown>).result as string[]).join(", ")
                                  : String((testResult as Record<string, unknown>).result))
                                : t("compliance_rules.testNoMatch")}
                            </p>
                          </div>
                        )}

                        {/* Raw output */}
                        {Boolean((testResult as Record<string, unknown>).rawOutput) && (
                          <details className="group">
                            <summary className="text-xs text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">{t("compliance_rules.testRawOutput")}</summary>
                            <pre className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 overflow-x-auto max-h-60 overflow-y-auto font-mono whitespace-pre-wrap">
                              {(() => {
                                const raw = String((testResult as Record<string, unknown>).rawOutput);
                                if (!sourceRegex) return raw;
                                try {
                                  const re = new RegExp(sourceRegex, "gm");
                                  const parts: React.ReactNode[] = [];
                                  let lastIndex = 0;
                                  let match: RegExpExecArray | null;
                                  let key = 0;
                                  while ((match = re.exec(raw)) !== null) {
                                    if (match.index > lastIndex) parts.push(raw.slice(lastIndex, match.index));
                                    parts.push(<mark key={key++} className="bg-amber-200 dark:bg-amber-500/30 text-amber-900 dark:text-amber-200 rounded-sm px-0.5">{match[0]}</mark>);
                                    lastIndex = re.lastIndex;
                                    if (match[0].length === 0) re.lastIndex++;
                                  }
                                  if (lastIndex < raw.length) parts.push(raw.slice(lastIndex));
                                  return parts.length > 0 ? parts : raw;
                                } catch { return raw; }
                              })()}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conditions tab */}
      {activeTab === "conditions" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.conditionsEditor")}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.conditionsHelp")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowConditionsHelp(true)}
                    className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title={t("compliance_rules.conditionsHelpTitle")}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                  {conditionTree && sourceType !== "none" && (
                    <button
                      onClick={() => { setShowEvalModal(true); setEvalResult(null); setEvalNodeSearch(""); }}
                      className="flex items-center gap-2 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
                    >
                      <Play className="h-4 w-4" />
                      {t("compliance_rules.evaluateRule")}
                    </button>
                  )}
                  {conditionTree && (rule?.sourceType === "collection" || rule?.sourceType === "ssh") && rule?.sourceResultMode === "capture" && rule?.sourceValueMap && rule.sourceValueMap.length >= 2 && (
                    <button
                      onClick={() => setShowMultiRowModal(true)}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Rows3 className="h-4 w-4" />
                      {t("compliance_rules.multiRowBtn")}
                    </button>
                  )}
                  {conditionTree && (
                    <button
                      onClick={async () => {
                        setConditionTree(null);
                        setSavingConditions(true);
                        try {
                          const res = await fetch(`/api/compliance-rules/${ruleId}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ conditionTree: null }),
                          });
                          if (res.ok) {
                            setRule(await res.json());
                            setSavedConditions(true);
                            setTimeout(() => setSavedConditions(false), 2000);
                          }
                        } finally { setSavingConditions(false); }
                      }}
                      className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("compliance_rules.removeAllConditions")}
                    </button>
                  )}
                  {conditionTree && (
                    <button onClick={saveConditions} disabled={savingConditions} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                      {savingConditions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {t("common.save")}
                    </button>
                  )}
                </div>
              </div>

              {sourceType === "none" ? (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5">
                  <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">{t("compliance_rules.noSourceWarning")}</p>
                </div>
              ) : !conditionTree ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <Filter className="h-5 w-5 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("compliance_rules.conditionsNotApplied")}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{t("compliance_rules.conditionsNotAppliedDesc")}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConditionTree({ blocks: [makeEmptyBlock("if")] })}
                    className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    {t("compliance_rules.addCondition")}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <ConditionBlockList
                    blocks={conditionTree.blocks}
                    parentPath={[]}
                    depth={0}
                    t={t}
                    operators={operators}
                    statuses={statuses}
                    severities={severities}
                    availableFields={availableFields}
                    inputCls={inputCls}
                    onUpdate={(path, updater) => setConditionTree((prev) => prev ? updateBlockAtPath(prev, path, updater) : prev)}
                    onRemove={(path) => {
                      setConditionTree((prev) => {
                        if (!prev) return prev;
                        const t2 = removeBlockAtPath(prev, path);
                        if (t2.blocks.length === 0) return null;
                        return t2;
                      });
                    }}
                    onAddSibling={(parentPath, type) => setConditionTree((prev) => prev ? addBlockAtPath(prev, parentPath, type) : prev)}
                    onAddNestedIf={(path) => setConditionTree((prev) => prev ? addNestedIfAtPath(prev, path) : prev)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Multi-row messages modal */}
      {showMultiRowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.multiRowTitle")}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.multiRowDesc")}</p>
              </div>
              <button onClick={() => setShowMultiRowModal(false)} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              {(["compliant", "non_compliant", "error", "not_applicable"] as const).map((status) => (
                <div key={status} className={`p-4 rounded-lg border ${statusColors[status]}`}>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2">
                    {status === "compliant" && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                    {status === "non_compliant" && <AlertCircle className="h-4 w-4 text-red-500" />}
                    {status === "error" && <AlertCircle className="h-4 w-4 text-amber-500" />}
                    {status === "not_applicable" && <Filter className="h-4 w-4 text-slate-400" />}
                    {t(`compliance_rules.status_${status}`)}
                  </label>
                  <input
                    type="text"
                    value={multiRowMessages[status] || ""}
                    onChange={(e) => setMultiRowMessages((prev) => ({ ...prev, [status]: e.target.value }))}
                    placeholder={t("compliance_rules.multiRowMsgPlaceholder")}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setShowMultiRowModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                disabled={savingMultiRow}
                onClick={async () => {
                  setSavingMultiRow(true);
                  try {
                    const cleaned: Record<string, string> = {};
                    for (const [k, v] of Object.entries(multiRowMessages)) {
                      if (v.trim()) cleaned[k] = v.trim();
                    }
                    const res = await fetch(`/api/compliance-rules/${ruleId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ multiRowMessages: Object.keys(cleaned).length > 0 ? cleaned : null }),
                    });
                    if (res.ok) {
                      setRule(await res.json());
                      setSavedConditions(true);
                      setTimeout(() => setSavedConditions(false), 2000);
                      setShowMultiRowModal(false);
                    }
                  } finally { setSavingMultiRow(false); }
                }}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {savingMultiRow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conditions help modal */}
      {showConditionsHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.conditionsHelpTitle")}</h3>
              <button onClick={() => setShowConditionsHelp(false)} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpBlocksTitle")}</h4>
                <p>{t("compliance_rules.helpBlocksDesc")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpLogicTitle")}</h4>
                <p>{t("compliance_rules.helpLogicDesc")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpNestingTitle")}</h4>
                <p>{t("compliance_rules.helpNestingDesc")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpResultTitle")}</h4>
                <p>{t("compliance_rules.helpResultDesc")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpMultiRowTitle")}</h4>
                <p>{t("compliance_rules.helpMultiRowDesc")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpSeverityTitle")}</h4>
                <p>{t("compliance_rules.helpSeverityDesc")}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setShowConditionsHelp(false)} className="rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evaluate modal */}
      {showEvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.evaluateRule")}</h3>
              <button onClick={() => setShowEvalModal(false)} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!evalResult ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.evaluateSelectNode")}</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={evalNodeSearch}
                    onChange={(e) => setEvalNodeSearch(e.target.value)}
                    placeholder={t("compliance_rules.testSearchNode")}
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredEvalNodes.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-slate-400">{t("compliance_rules.testNoNodes")}</div>
                  ) : (
                    filteredEvalNodes.slice(0, 30).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => runEvaluate(n.id)}
                        disabled={evaluating}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                      >
                        {n.manufacturer?.logo ? (
                          <img src={`/api/logos/${n.manufacturer.logo}`} alt={n.manufacturer.name} className="h-5 w-5 object-contain shrink-0" />
                        ) : (
                          <Server className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <div className="text-left min-w-0">
                          <p className="font-medium truncate">{n.name || n.hostname || n.ipAddress}</p>
                          {(n.name || n.hostname) && <p className="text-xs text-slate-400 truncate">{n.ipAddress}</p>}
                        </div>
                        {evaluating && <Loader2 className="h-4 w-4 animate-spin text-slate-400 ml-auto shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {!(evalResult as Record<string, unknown>).success ? (
                  <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-400">{String((evalResult as Record<string, unknown>).error)}</p>
                  </div>
                ) : (() => {
                  const er = evalResult as Record<string, unknown>;
                  const nodeInfo = er.node as Record<string, unknown> | undefined;
                  const evaluation = er.evaluation as Record<string, unknown> | null;
                  const isMultiRow = Boolean(er.multiRow);
                  const rowResults = (er.rowResults || []) as { row: number; fields: Record<string, unknown>; evaluation: Record<string, unknown> | null }[];
                  const status = evaluation?.status as string | undefined;
                  const severity = evaluation?.severity as string | undefined;
                  const message = evaluation?.message as string | undefined;

                  const renderEvalBadge = (ev: Record<string, unknown> | null) => {
                    if (!ev) return <span className="text-xs text-slate-400">—</span>;
                    const s = ev.status as string;
                    const sev = ev.severity as string | undefined;
                    return (
                      <div className="flex items-center gap-1.5">
                        {s === "compliant" && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                        {s === "non_compliant" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                        {s === "error" && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
                        {s === "not_applicable" && <Filter className="h-3.5 w-3.5 text-slate-400" />}
                        <span className="text-xs font-medium">{t(`compliance_rules.status_${s}`)}</span>
                        {sev && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${severityColors[sev] || ""}`}>{t(`compliance_rules.severity_${sev}`)}</span>}
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-3">
                      {/* Node info */}
                      {nodeInfo && (
                        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                          <Server className="h-4 w-4" />
                          <span>{String(nodeInfo.name)}</span>
                          <span className="text-xs">({String(nodeInfo.ipAddress)})</span>
                        </div>
                      )}

                      {/* Aggregated result */}
                      {evaluation ? (
                        <div className={`p-4 rounded-lg border ${statusColors[status || ""] || "border-slate-200 dark:border-slate-700"}`}>
                          <div className="flex items-center gap-2 mb-2">
                            {status === "compliant" && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                            {status === "non_compliant" && <AlertCircle className="h-5 w-5 text-red-500" />}
                            {status === "error" && <AlertCircle className="h-5 w-5 text-amber-500" />}
                            {status === "not_applicable" && <Filter className="h-5 w-5 text-slate-400" />}
                            <span className="text-sm font-semibold">{t(`compliance_rules.status_${status}`)}</span>
                            {severity && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${severityColors[severity] || ""}`}>
                                {t(`compliance_rules.severity_${severity}`)}
                              </span>
                            )}
                            {isMultiRow && (
                              <span className="text-xs text-slate-400 ml-auto">{t("compliance_rules.evaluateRowCount", { count: String(er.rowCount) })}</span>
                            )}
                          </div>
                          {message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                          <AlertCircle className="h-5 w-5 text-slate-400" />
                          <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.evaluateNoMatch")}</p>
                        </div>
                      )}

                      {/* Per-row details */}
                      {isMultiRow && rowResults.length > 0 && (
                        <details className="group">
                          <summary className="text-xs text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">{t("compliance_rules.evaluateDetails")}</summary>
                          <div className="mt-2 space-y-1.5">
                            {rowResults.map((rr) => {
                              const keyVal = rr.fields?.["$key"] as string | undefined;
                              const label = keyVal || `#${rr.row + 1}`;
                              const rowMsg = rr.evaluation?.message as string | undefined;
                              return (
                                <div key={rr.row} className={`px-3 py-2 rounded-lg border text-sm ${
                                  rr.evaluation?.status === "compliant" ? "border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5" :
                                  rr.evaluation?.status === "non_compliant" ? "border-red-200 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5" :
                                  "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                                }`}>
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{label}</span>
                                    {renderEvalBadge(rr.evaluation)}
                                  </div>
                                  {rowMsg && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{rowMsg}</p>}
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setEvalResult(null)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t("compliance_rules.evaluateAnother")}
                  </button>
                  <button
                    onClick={() => setShowEvalModal(false)}
                    className="rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">{t("compliance_rules.confirmDelete", { name: rule.name })}</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteConfirm(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{t("common.cancel")}</button>
              <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
