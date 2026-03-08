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
  FileSearch,
  Save,
  CheckCircle2,
  Monitor,
  Wifi,
  Tag,
  Pencil,
  Terminal,
  Play,
  FlaskConical,
  AlertCircle,
  Search,
  Server,
  ChevronDown,
  Plus,
  Trash2,
  Regex,
  ScanSearch,
  X,
  GripVertical,
  FileText,
  Table2,
  ChevronRight,
  FolderOpen,
  Copy,
} from "lucide-react";

interface ExtractItem {
  id: number;
  name: string;
  regex: string;
  multiline: boolean;
  keyMode: "manual" | "extract";
  keyManual: string | null;
  keyExtractId: number | null;
  keyGroup: number | null;
  valueGroup: number | null;
  valueMap: { label: string; group: number }[] | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryKeyLabel: string | null;
  nodeField: string | null;
  nodeFieldGroup: number | null;
  position: number;
}

interface InventoryCategory {
  id: number;
  name: string;
  keyLabel: string | null;
}

interface RuleDetail {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  source: "local" | "ssh";
  command: string | null;
  tag: string | null;
  folderId: number | null;
  extracts: ExtractItem[];
  createdAt: string;
}

interface NodeItem {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
  manufacturer: { id: number; name: string } | null;
  model: { id: number; name: string } | null;
}

const HIGHLIGHT_COLORS = [
  { bg: "bg-yellow-200/60 dark:bg-yellow-500/30", text: "text-yellow-800 dark:text-yellow-200", badge: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700" },
  { bg: "bg-emerald-200/60 dark:bg-emerald-500/30", text: "text-emerald-800 dark:text-emerald-200", badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700" },
  { bg: "bg-blue-200/60 dark:bg-blue-500/30", text: "text-blue-800 dark:text-blue-200", badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700" },
  { bg: "bg-purple-200/60 dark:bg-purple-500/30", text: "text-purple-800 dark:text-purple-200", badge: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700" },
  { bg: "bg-orange-200/60 dark:bg-orange-500/30", text: "text-orange-800 dark:text-orange-200", badge: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700" },
  { bg: "bg-pink-200/60 dark:bg-pink-500/30", text: "text-pink-800 dark:text-pink-200", badge: "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-700" },
];

const tabKeys = ["collect", "extracts", "test", "edit"] as const;
type TabKey = (typeof tabKeys)[number];

export default function CollectionRuleEditPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const { current } = useAppContext();
  const ruleId = params.id as string;

  const [rule, setRule] = useState<RuleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("collect");

  // Edit fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Collect fields
  const [source, setSource] = useState<"local" | "ssh">("local");
  const [command, setCommand] = useState("");
  const [tag, setTag] = useState("");
  const [savingCollect, setSavingCollect] = useState(false);
  const [savedCollect, setSavedCollect] = useState(false);

  // Extract fields
  const [extracts, setExtracts] = useState<ExtractItem[]>([]);
  const [editingExtract, setEditingExtract] = useState<ExtractItem | null>(null);
  const [extractName, setExtractName] = useState("");
  const [extractRegex, setExtractRegex] = useState("");
  const [extractMultiline, setExtractMultiline] = useState(false);
  const [extractGroups, setExtractGroups] = useState<{ isKey: boolean; label: string }[]>([]);
  const [extractCategoryId, setExtractCategoryId] = useState<number | null>(null);
  const [extractCategoryKeyLabel, setExtractCategoryKeyLabel] = useState("");
  const [extractNodeField, setExtractNodeField] = useState<string>("");
  const [extractNodeFieldGroup, setExtractNodeFieldGroup] = useState<number | null>(null);
  const [showNodeFieldMapping, setShowNodeFieldMapping] = useState(false);

  // Detect capture groups in the regex dynamically
  const detectedGroupCount = useMemo(() => {
    if (!extractRegex) return 0;
    let count = 0;
    let escaped = false;
    let inCharClass = false;
    for (let i = 0; i < extractRegex.length; i++) {
      const ch = extractRegex[i];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === "[") { inCharClass = true; continue; }
      if (ch === "]") { inCharClass = false; continue; }
      if (inCharClass) continue;
      if (ch === "(" && extractRegex[i + 1] !== "?") {
        count++;
      }
    }
    return count;
  }, [extractRegex]);

  // Sync extractGroups when group count changes
  useEffect(() => {
    setExtractGroups((prev) => {
      if (detectedGroupCount === 0) return [];
      const next = Array.from({ length: detectedGroupCount }, (_, i) => {
        if (i < prev.length) return prev[i];
        return { isKey: false, label: "" };
      });
      return next;
    });
  }, [detectedGroupCount]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [savingExtract, setSavingExtract] = useState(false);

  // Accordion & drag-and-drop for extracts tab
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [draggedExtractId, setDraggedExtractId] = useState<number | null>(null);
  const [dragOverExtractId, setDragOverExtractId] = useState<number | null>(null);

  // File tab: selected match detail
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);

  // Inventory sidebar
  const [selectedInventoryCat, setSelectedInventoryCat] = useState(0);

  // Test fields
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [nodeSearch, setNodeSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [resultTab, setResultTab] = useState<"file" | "inventory">("file");
  const [executing, setExecuting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    output?: string;
    error?: string;
    source?: string;
    collectionId?: number;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/collection-rules/${ruleId}`);
    if (res.ok) {
      const data: RuleDetail = await res.json();
      setRule(data);
      setName(data.name);
      setDescription(data.description ?? "");
      setEnabled(data.enabled);
      setSource(data.source);
      setCommand(data.command ?? "");
      setTag(data.tag ?? "");
      setExtracts(data.extracts ?? []);
    }
    setLoading(false);
  }, [ruleId]);

  useEffect(() => { load(); }, [load]);

  const loadNodes = useCallback(async () => {
    if (!current) return;
    setNodesLoading(true);
    const res = await fetch(`/api/nodes?context=${current.id}`);
    if (res.ok) {
      const data = await res.json();
      setNodes(data);
    }
    setNodesLoading(false);
  }, [current]);

  useEffect(() => {
    if (activeTab === "test") {
      loadNodes();
    }
  }, [activeTab, loadNodes]);

  const saveEdit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name, description: description || null, enabled };
      const res = await fetch(`/api/collection-rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setRule(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally { setSaving(false); }
  };

  const saveCollect = async () => {
    setSavingCollect(true);
    try {
      const body = {
        source,
        command: command || null,
        tag: source === "local" ? (tag || null) : null,
      };
      const res = await fetch(`/api/collection-rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setRule(data);
        setSavedCollect(true);
        setTimeout(() => setSavedCollect(false), 2000);
      }
    } finally { setSavingCollect(false); }
  };

  const loadCategories = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/inventory-categories?context=${current.id}`);
    if (res.ok) setCategories(await res.json());
  }, [current]);

  const createCategory = async () => {
    if (!newCategoryName.trim() || !current) return;
    const res = await fetch(`/api/inventory-categories?context=${current.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName }),
    });
    if (res.ok) {
      const cat: InventoryCategory = await res.json();
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setExtractCategoryId(cat.id);
      setNewCategoryName("");
      setShowNewCategory(false);
    }
  };

  const saveExtract = async () => {
    if (!extractName.trim() || !extractRegex.trim()) return;
    setSavingExtract(true);
    // Build keyGroup and valueMap from extractGroups
    const keyIdx = extractGroups.findIndex((g) => g.isKey);
    let valueNum = 0;
    const valueMappings = extractGroups
      .map((g, i) => ({ label: g.label, group: i + 1, isKey: g.isKey }))
      .filter((g) => !g.isKey)
      .map((g) => ({ label: g.label.trim() || `Value#${++valueNum}`, group: g.group }));

    const payload = {
      name: extractName,
      regex: extractRegex,
      multiline: extractMultiline,
      keyMode: keyIdx >= 0 ? "extract" as const : "manual" as const,
      keyManual: null,
      keyExtractId: null,
      keyGroup: keyIdx >= 0 ? keyIdx + 1 : null,
      valueGroup: null,
      valueMap: valueMappings.length > 0 ? valueMappings : null,
      categoryId: extractCategoryId,
      nodeField: !extractMultiline && extractNodeField ? extractNodeField : null,
      nodeFieldGroup: !extractMultiline && extractNodeField && extractNodeFieldGroup ? extractNodeFieldGroup : null,
    };
    try {
      if (editingExtract) {
        const res = await fetch(`/api/collection-rules/${ruleId}/extracts/${editingExtract.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setExtracts((prev) => prev.map((e) => (e.id === data.id ? data : e)));
        }
      } else {
        const res = await fetch(`/api/collection-rules/${ruleId}/extracts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setExtracts((prev) => [...prev, data]);
        }
      }
      setShowExtractModal(false);
      setEditingExtract(null);
      resetExtractForm();
    } finally { setSavingExtract(false); }
  };

  const resetExtractForm = () => {
    setExtractName("");
    setExtractRegex("");
    setExtractMultiline(false);
    setExtractGroups([]);
    setExtractCategoryId(null);
    setExtractCategoryKeyLabel("");
    setExtractNodeField("");
    setExtractNodeFieldGroup(null);
    setShowNodeFieldMapping(false);
    setShowNewCategory(false);
    setNewCategoryName("");
  };

  const duplicateExtract = async (ext: ExtractItem) => {
    const payload = {
      name: `${ext.name} (copie)`,
      regex: ext.regex,
      multiline: ext.multiline,
      keyMode: ext.keyMode,
      keyManual: ext.keyManual,
      keyExtractId: ext.keyExtractId,
      keyGroup: ext.keyGroup,
      valueGroup: ext.valueGroup,
      valueMap: ext.valueMap,
      categoryId: ext.categoryId,
      nodeField: ext.nodeField,
      nodeFieldGroup: ext.nodeFieldGroup,
    };
    const res = await fetch(`/api/collection-rules/${ruleId}/extracts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created: ExtractItem = await res.json();
      setExtracts((prev) => [...prev, created]);
    }
  };

  const deleteExtract = async (id: number) => {
    const res = await fetch(`/api/collection-rules/${ruleId}/extracts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setExtracts((prev) => prev.filter((e) => e.id !== id));
    }
  };

  // Group extracts by category for accordion display
  const extractsByCategory = useMemo(() => {
    const catMap = new Map<string, { catName: string; extracts: ExtractItem[] }>();

    extracts.forEach((ext) => {
      const catKey = ext.categoryId ? String(ext.categoryId) : "__none__";
      const catName = ext.categoryName || t("collection_rules.extractCategoryNone");
      if (!catMap.has(catKey)) {
        catMap.set(catKey, { catName, extracts: [] });
      }
      catMap.get(catKey)!.extracts.push(ext);
    });

    const groups = Array.from(catMap.entries())
      .map(([catKey, v]) => ({ catKey, ...v }))
      .sort((a, b) => {
        if (a.catKey === "__none__") return 1;
        if (b.catKey === "__none__") return -1;
        return a.catName.localeCompare(b.catName);
      });

    return groups;
  }, [extracts, t]);

  const toggleCategory = (catKey: string) => {
    setOpenCategory((prev) => (prev === catKey ? null : catKey));
  };

  const handleExtractDrop = async (targetId: number) => {
    if (draggedExtractId === null || draggedExtractId === targetId) {
      setDraggedExtractId(null);
      setDragOverExtractId(null);
      return;
    }
    const newExtracts = [...extracts];
    const fromIdx = newExtracts.findIndex((e) => e.id === draggedExtractId);
    const toIdx = newExtracts.findIndex((e) => e.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = newExtracts.splice(fromIdx, 1);
    newExtracts.splice(toIdx, 0, moved);
    setExtracts(newExtracts);
    setDraggedExtractId(null);
    setDragOverExtractId(null);
    await fetch(`/api/collection-rules/${ruleId}/extracts/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: newExtracts.map((e) => e.id) }),
    });
  };

  const openEditExtract = (e: ExtractItem) => {
    setEditingExtract(e);
    setExtractName(e.name);
    setExtractRegex(e.regex);
    setExtractMultiline(e.multiline);
    setExtractCategoryId(e.categoryId);
    setExtractCategoryKeyLabel(e.categoryKeyLabel || "");
    setExtractNodeField(e.nodeField || "");
    setExtractNodeFieldGroup(e.nodeFieldGroup);
    setShowNodeFieldMapping(!!e.nodeField);

    // Rebuild extractGroups from saved data
    // Count groups in regex
    let groupCount = 0;
    let esc = false; let inCC = false;
    for (let i = 0; i < e.regex.length; i++) {
      const ch = e.regex[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === "[") { inCC = true; continue; }
      if (ch === "]") { inCC = false; continue; }
      if (inCC) continue;
      if (ch === "(" && e.regex[i + 1] !== "?") groupCount++;
    }

    const groups: { isKey: boolean; label: string }[] = Array.from({ length: groupCount }, () => ({ isKey: false, label: "" }));

    // Mark key group
    if (e.keyMode === "extract" && e.keyGroup) {
      const ki = e.keyGroup - 1;
      if (ki >= 0 && ki < groups.length) groups[ki].isKey = true;
    }

    // Fill value map labels
    if (e.valueMap) {
      e.valueMap.forEach((vm) => {
        const vi = vm.group - 1;
        if (vi >= 0 && vi < groups.length) groups[vi].label = vm.label;
      });
    } else if (e.keyMode === "extract" && e.valueGroup) {
      // Legacy single value: use extract name as label
      const vi = e.valueGroup - 1;
      if (vi >= 0 && vi < groups.length) groups[vi].label = e.name;
    }

    setExtractGroups(groups);
    loadCategories();
    setShowExtractModal(true);
  };

  const openNewExtract = () => {
    setEditingExtract(null);
    resetExtractForm();
    loadCategories();
    setShowExtractModal(true);
  };

  const executeTest = async () => {
    if (!selectedNodeId) return;
    setExecuting(true);
    setTestResult(null);
    setSelectedMatchId(null);
    try {
      const res = await fetch(`/api/collection-rules/${ruleId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: selectedNodeId }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult(data);
      } else {
        setTestResult({ success: false, error: data.error || "Request failed" });
      }
    } catch {
      setTestResult({ success: false, error: "Network error" });
    } finally {
      setExecuting(false);
    }
  };

  // Match detail for file tab click
  type MatchDetail = {
    matchId: number;
    extractIdx: number;
    extractName: string;
    regex: string;
    fullMatch: string;
    groups: { index: number; value: string; label: string; isKey: boolean }[];
    key: string | null;
  };

  // Compute highlighted output for test results
  const highlightedOutput = useMemo(() => {
    if (!testResult?.success || !testResult.output || extracts.length === 0) return null;

    const text = testResult.output;
    const ranges: { start: number; end: number; extractIdx: number; matchId: number }[] = [];
    const matchDetails: MatchDetail[] = [];
    let matchCounter = 0;

    extracts.forEach((ext, idx) => {
      try {
        const processMatch = (match: RegExpExecArray, start: number) => {
          const mid = matchCounter++;
          ranges.push({ start, end: start + match[0].length, extractIdx: idx, matchId: mid });

          // Build group details
          const groups: MatchDetail["groups"] = [];
          for (let g = 1; g < match.length; g++) {
            let label = `Group #${g}`;
            let isKey = false;
            if (ext.keyMode === "extract" && ext.keyGroup === g) {
              isKey = true;
              label = ext.categoryKeyLabel || "Key";
            } else if (ext.valueMap) {
              const vm = ext.valueMap.find((v) => v.group === g);
              if (vm) label = vm.label;
            }
            groups.push({ index: g, value: match[g] ?? "", label, isKey });
          }

          let key: string | null = null;
          if (ext.keyMode === "extract" && ext.keyGroup) {
            key = match[ext.keyGroup] ?? null;
          } else if (ext.keyMode === "manual") {
            key = ext.keyManual || ext.name;
          }

          matchDetails.push({
            matchId: mid,
            extractIdx: idx,
            extractName: ext.name,
            regex: ext.regex,
            fullMatch: match[0],
            groups,
            key,
          });
        };

        {
          // Always run line by line so \s never crosses newlines
          const flags = ext.multiline ? "gs" : "g";
          const re = new RegExp(ext.regex, flags);
          const lines = text.split("\n");
          let offset = 0;
          for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, "");
            re.lastIndex = 0;
            let match;
            while ((match = re.exec(line)) !== null) {
              processMatch(match, offset + match.index);
              if (match[0].length === 0) re.lastIndex++;
            }
            offset += rawLine.length + 1;
          }
        }
      } catch {
        // invalid regex, skip
      }
    });

    if (ranges.length === 0) return null;

    ranges.sort((a, b) => a.start - b.start);

    const segments: { text: string; extractIdx: number | null; matchId: number | null }[] = [];
    let pos = 0;

    for (const range of ranges) {
      if (range.start < pos) continue;
      if (range.start > pos) {
        segments.push({ text: text.slice(pos, range.start), extractIdx: null, matchId: null });
      }
      segments.push({ text: text.slice(range.start, range.end), extractIdx: range.extractIdx, matchId: range.matchId });
      pos = range.end;
    }
    if (pos < text.length) {
      segments.push({ text: text.slice(pos), extractIdx: null, matchId: null });
    }

    return {
      segments,
      matchDetails,
      matchCounts: extracts.map((_ext, i) => ranges.filter((r) => r.extractIdx === i).length),
    };
  }, [testResult, extracts]);

  // Compute inventory data grouped by category
  // Each extract's regex captures groups. When keyMode = "extract":
  //   keyGroup = which capture group is the key (e.g. Ps#1 → group 1)
  //   valueGroup = which capture group is the value (e.g. UP → group 2)
  // We pivot into a table: rows = unique keys, columns = extract names
  const inventoryData = useMemo(() => {
    if (!testResult?.success || !testResult.output || extracts.length === 0) return null;

    const text = testResult.output;

    type InventoryCat = {
      categoryName: string;
      keyLabel: string | null;
      columns: { colKey: string; label: string }[];
      rows: { key: string; values: Record<string, string> }[];
    };

    // For each extract, run regex and collect results
    // When valueMap is set, one match produces multiple column values
    // Column key: "extractId:label" for valueMap, or "extractId" for single value
    type MatchRow = { key: string; columns: Record<string, string> };
    type ExtractColumns = { colKey: string; label: string }[];

    const allMatchRows: Record<number, MatchRow[]> = {};
    const allExtractColumns: Record<number, ExtractColumns> = {};

    extracts.forEach((ext) => {
      const rows: MatchRow[] = [];
      const hasValueMap = ext.valueMap && ext.valueMap.length > 0;

      // Define columns for this extract
      // Use label as colKey so that identical labels across extracts merge into one column
      const cols: ExtractColumns = hasValueMap
        ? ext.valueMap!.map((vm) => ({ colKey: `col:${vm.label}`, label: vm.label }))
        : [{ colKey: "col:Value#1", label: "Value#1" }];
      allExtractColumns[ext.id] = cols;

      const processMatch = (m: RegExpExecArray) => {
        let key: string;
        if (ext.keyMode === "extract") {
          const kg = ext.keyGroup ?? 1;
          key = m[kg] ?? m[0];
        } else {
          key = ext.keyManual || ext.name;
        }
        const columns: Record<string, string> = {};
        if (hasValueMap) {
          ext.valueMap!.forEach((vm) => {
            columns[`col:${vm.label}`] = m[vm.group] ?? "";
          });
        } else {
          const vg = ext.keyMode === "extract" ? (ext.valueGroup ?? 2) : (ext.valueGroup ?? 1);
          columns["col:Value#1"] = m[vg] ?? m[1] ?? m[0];
        }
        rows.push({ key, columns });
      };

      try {
        // Always run line by line so \s never crosses newlines
        const flags = ext.multiline ? "gs" : "g";
        const re = new RegExp(ext.regex, flags);
        for (const rawLine of text.split("\n")) {
          const line = rawLine.replace(/\r$/, "");
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(line)) !== null) {
            processMatch(m);
            if (m[0].length === 0) re.lastIndex++;
          }
        }
      } catch {
        // invalid regex
      }
      allMatchRows[ext.id] = rows;
    });

    // Group extracts by category
    const categoryMap: Record<string, { categoryName: string; extracts: ExtractItem[] }> = {};
    const uncategorizedExtracts: ExtractItem[] = [];

    extracts.forEach((ext) => {
      if (ext.categoryId && ext.categoryName) {
        const catKey = String(ext.categoryId);
        if (!categoryMap[catKey]) {
          categoryMap[catKey] = { categoryName: ext.categoryName, extracts: [] };
        }
        categoryMap[catKey].extracts.push(ext);
      } else {
        uncategorizedExtracts.push(ext);
      }
    });

    const buildTable = (catExtracts: ExtractItem[]): InventoryCat | null => {
      if (catExtracts.length === 0) return null;

      // Flatten all columns from all extracts, deduplicate by colKey
      const columns: { colKey: string; label: string }[] = [];
      const seenColKeys = new Set<string>();
      catExtracts.forEach((ext) => {
        (allExtractColumns[ext.id] ?? []).forEach((col) => {
          if (!seenColKeys.has(col.colKey)) {
            seenColKeys.add(col.colKey);
            columns.push(col);
          }
        });
      });

      // Collect all unique keys in order of first appearance
      const keyOrder: string[] = [];
      const keySet = new Set<string>();
      catExtracts.forEach((ext) => {
        (allMatchRows[ext.id] ?? []).forEach((r) => {
          if (!keySet.has(r.key)) {
            keySet.add(r.key);
            keyOrder.push(r.key);
          }
        });
      });

      if (keyOrder.length === 0) return null;

      // Build rows: for each unique key, gather all column values
      const rows = keyOrder.map((key) => {
        const values: Record<string, string> = {};
        catExtracts.forEach((ext) => {
          const matchRow = (allMatchRows[ext.id] ?? []).find((r) => r.key === key);
          if (matchRow) {
            Object.assign(values, matchRow.columns);
          }
        });
        return { key, values };
      });

      // Get keyLabel from the first extract that has one
      const kl = catExtracts.find((e) => e.categoryKeyLabel)?.categoryKeyLabel ?? null;

      return { categoryName: "", keyLabel: kl, columns, rows };
    };

    const result: InventoryCat[] = [];

    Object.values(categoryMap).forEach((cat) => {
      const table = buildTable(cat.extracts);
      if (table) {
        table.categoryName = cat.categoryName;
        result.push(table);
      }
    });

    if (uncategorizedExtracts.length > 0) {
      const table = buildTable(uncategorizedExtracts);
      if (table) {
        table.categoryName = t("collection_rules.extractCategoryNone");
        result.push(table);
      }
    }

    return result;
  }, [testResult, extracts, t]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" /></div>;
  }

  if (!rule) {
    return (
      <div className="space-y-6">
        <button onClick={() => router.push("/collection-rules")} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {t("common.back")}
        </button>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <FileSearch className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-400 dark:text-slate-500">{t("common.noResult")}</p>
        </div>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "collect", label: t("collection_rules.tabCollect"), icon: <Terminal className="h-4 w-4" /> },
    { key: "extracts", label: t("collection_rules.tabExtracts"), icon: <ScanSearch className="h-4 w-4" /> },
    { key: "test", label: t("collection_rules.tabTest"), icon: <FlaskConical className="h-4 w-4" /> },
    { key: "edit", label: t("collection_rules.tabEdit"), icon: <Pencil className="h-4 w-4" /> },
  ];

  const filteredNodes = nodes.filter((n) => {
    if (!nodeSearch.trim()) return true;
    const q = nodeSearch.toLowerCase();
    return (
      n.name?.toLowerCase().includes(q) ||
      n.ipAddress.toLowerCase().includes(q) ||
      n.hostname?.toLowerCase().includes(q) ||
      n.manufacturer?.name.toLowerCase().includes(q) ||
      n.model?.name.toLowerCase().includes(q)
    );
  });

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/collection-rules")} className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{rule.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t("collection_rules.editRule")}</p>
          </div>
        </div>
        {(saved || savedCollect) && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            {t("collection_rules.saved")}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab.key === "edit" ? "ml-auto" : ""
              } ${
                activeTab === tab.key
                  ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Edit tab */}
      {activeTab === "edit" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.name")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("collection_rules.namePlaceholder")}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.description")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={t("collection_rules.descriptionPlaceholder")}
                className={`${inputCls} resize-none`}
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" onClick={() => setEnabled(!enabled)}>
                {enabled ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
              </button>
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {enabled ? t("collection_rules.enabled") : t("collection_rules.disabled")}
              </span>
            </label>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={saveEdit}
              disabled={saving || !name.trim()}
              className={btnPrimaryCls}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("common.save")}
            </button>
          </div>
        </div>
      )}

      {/* Collect tab */}
      {activeTab === "collect" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.sourceLabel")}</label>
              <p className="text-xs text-slate-400 dark:text-slate-500">{t("collection_rules.sourceHelp")}</p>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setSource("local")}
                  className={`flex items-center gap-2.5 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all flex-1 ${
                    source === "local"
                      ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <Monitor className={`h-5 w-5 ${source === "local" ? "text-slate-900 dark:text-white" : "text-slate-400"}`} />
                  <div className="text-left">
                    <div>{t("collection_rules.sourceLocal")}</div>
                    <div className="text-xs font-normal text-slate-400 dark:text-slate-500">{t("collection_rules.sourceLocalDesc")}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSource("ssh")}
                  className={`flex items-center gap-2.5 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all flex-1 ${
                    source === "ssh"
                      ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                      : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <Wifi className={`h-5 w-5 ${source === "ssh" ? "text-slate-900 dark:text-white" : "text-slate-400"}`} />
                  <div className="text-left">
                    <div>{t("collection_rules.sourceSSH")}</div>
                    <div className="text-xs font-normal text-slate-400 dark:text-slate-500">{t("collection_rules.sourceSSHDesc")}</div>
                  </div>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.commandLabel")}</label>
              <p className="text-xs text-slate-400 dark:text-slate-500">{t("collection_rules.commandHelp")}</p>
              <input type="text" value={command} onChange={(e) => setCommand(e.target.value)} placeholder={t("collection_rules.commandPlaceholder")} className={inputCls} />
            </div>
            {source === "local" && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5"><Tag className="h-4 w-4" />{t("collection_rules.tagLabel")}</span>
                </label>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("collection_rules.tagHelp")}</p>
                <input type="text" value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t("collection_rules.tagPlaceholder")} className={inputCls} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
            <button onClick={saveCollect} disabled={savingCollect} className={btnPrimaryCls}>
              {savingCollect ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("common.save")}
            </button>
          </div>
        </div>
      )}

      {/* Extracts tab */}
      {activeTab === "extracts" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.tabExtracts")}</span>
              <button onClick={openNewExtract} className={btnPrimaryCls}>
                <Plus className="h-4 w-4" />
                {t("collection_rules.addExtract")}
              </button>
            </div>

            {extracts.length === 0 ? (
              <div className="p-12 text-center">
                <ScanSearch className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">{t("collection_rules.noExtracts")}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {extractsByCategory.map((group) => (
                  <div key={group.catKey}>
                    {/* Category accordion header */}
                    <button
                      onClick={() => toggleCategory(group.catKey)}
                      className="w-full flex items-center gap-2 px-6 py-3 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors"
                    >
                      <ChevronRight className={`h-3.5 w-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${openCategory === group.catKey ? "rotate-90" : ""}`} />
                      <FolderOpen className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{group.catName}</span>
                      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 bg-slate-200/60 dark:bg-slate-700/60 rounded-full px-1.5 py-0.5">{group.extracts.length}</span>
                    </button>

                    {/* Extracts list */}
                    {openCategory === group.catKey && (
                      <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                        {group.extracts.map((ext) => {
                          const globalIdx = extracts.findIndex((e) => e.id === ext.id);
                          return (
                            <div
                              key={ext.id}
                              draggable
                              onDragStart={(e) => {
                                setDraggedExtractId(ext.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setDragOverExtractId(ext.id);
                              }}
                              onDragLeave={() => {
                                if (dragOverExtractId === ext.id) setDragOverExtractId(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                handleExtractDrop(ext.id);
                              }}
                              onDragEnd={() => {
                                setDraggedExtractId(null);
                                setDragOverExtractId(null);
                              }}
                              className={`flex items-center gap-3 px-6 py-3 group transition-colors ${
                                draggedExtractId === ext.id ? "opacity-40" : ""
                              } ${
                                dragOverExtractId === ext.id && draggedExtractId !== ext.id
                                  ? "border-t-2 border-t-blue-400 dark:border-t-blue-500 bg-blue-50/30 dark:bg-blue-900/10"
                                  : ""
                              }`}
                            >
                              <div className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-500">
                                <GripVertical className="h-4 w-4" />
                              </div>
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${HIGHLIGHT_COLORS[globalIdx % HIGHLIGHT_COLORS.length].bg}`} />
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditExtract(ext)}>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{ext.name}</span>
                                  {ext.multiline && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">M</span>
                                  )}
                                </div>
                                <code className="text-xs text-slate-500 dark:text-slate-400 font-mono">{ext.regex}</code>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEditExtract(ext)}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => duplicateExtract(ext)}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => { if (confirm(t("collection_rules.deleteExtract"))) deleteExtract(ext.id); }}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Extract modal */}
          {showExtractModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={() => { setShowExtractModal(false); setEditingExtract(null); resetExtractForm(); }} />
              <div className="relative z-10 w-[50vw] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {editingExtract ? t("collection_rules.editExtract") : t("collection_rules.addExtract")}
                  </h3>
                  <button
                    onClick={() => { setShowExtractModal(false); setEditingExtract(null); resetExtractForm(); }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left column: Name, Regex, Category */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.extractName")}</label>
                        <input
                          type="text"
                          value={extractName}
                          onChange={(e) => setExtractName(e.target.value)}
                          placeholder={t("collection_rules.extractNamePlaceholder")}
                          className={inputCls}
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                          <Regex className="h-4 w-4" />
                          {t("collection_rules.extractRegex")}
                        </label>
                        <input
                          type="text"
                          value={extractRegex}
                          onChange={(e) => setExtractRegex(e.target.value)}
                          placeholder={t("collection_rules.extractRegexPlaceholder")}
                          className={`${inputCls} font-mono`}
                        />
                      </div>

                      {/* Inventory category */}
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.extractCategory")}</label>
                        <div className="flex gap-2">
                          <select
                            value={extractCategoryId ?? ""}
                            onChange={(e) => {
                              const id = e.target.value ? Number(e.target.value) : null;
                              setExtractCategoryId(id);
                              const cat = categories.find((c) => c.id === id);
                              setExtractCategoryKeyLabel(cat?.keyLabel || "");
                            }}
                            className={`${inputCls} flex-1`}
                          >
                            <option value="">{t("collection_rules.extractCategoryNone")}</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowNewCategory(!showNewCategory)}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        {showNewCategory && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              placeholder={t("collection_rules.extractCategoryNamePlaceholder")}
                              className={`${inputCls} flex-1`}
                              onKeyDown={(e) => { if (e.key === "Enter") createCategory(); }}
                            />
                            <button
                              type="button"
                              onClick={createCategory}
                              disabled={!newCategoryName.trim()}
                              className={btnPrimaryCls}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                        {extractCategoryId && (
                          <div className="mt-1.5">
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t("collection_rules.extractCategoryKeyLabel")}</label>
                            <input
                              type="text"
                              value={extractCategoryKeyLabel}
                              onChange={(e) => setExtractCategoryKeyLabel(e.target.value)}
                              onBlur={async () => {
                                if (!extractCategoryId) return;
                                const cat = categories.find((c) => c.id === extractCategoryId);
                                if (cat && (extractCategoryKeyLabel.trim() || "") !== (cat.keyLabel || "")) {
                                  await fetch(`/api/inventory-categories/${extractCategoryId}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ keyLabel: extractCategoryKeyLabel.trim() || null }),
                                  });
                                  setCategories(categories.map((c) => c.id === extractCategoryId ? { ...c, keyLabel: extractCategoryKeyLabel.trim() || null } : c));
                                }
                              }}
                              placeholder={t("collection_rules.extractCategoryKeyLabelPlaceholder")}
                              className={`${inputCls} w-full`}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right column: Multiline, Capture groups */}
                    <div className="space-y-4">
                      {/* Multiline toggle */}
                      <label className="flex items-center gap-3 cursor-pointer">
                        <button type="button" onClick={() => setExtractMultiline(!extractMultiline)}>
                          {extractMultiline ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                        </button>
                        <div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.extractMultiline")}</span>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{t("collection_rules.extractMultilineHelp")}</p>
                        </div>
                      </label>

                      {/* Capture groups */}
                      {detectedGroupCount > 0 && (
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.extractCaptureGroups")}</label>
                          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 w-12">#</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 w-14">{t("collection_rules.extractGroupKey")}</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("collection_rules.extractMappingLabel")}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {extractGroups.map((g, gIdx) => (
                                  <tr key={gIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-3 py-2">
                                      <code className="text-xs font-mono text-slate-500 dark:text-slate-400">${gIdx + 1}</code>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <input
                                        type="radio"
                                        name="keyGroup"
                                        checked={g.isKey}
                                        onChange={() => {
                                          setExtractGroups(extractGroups.map((gr, i) => ({
                                            ...gr,
                                            isKey: i === gIdx,
                                          })));
                                        }}
                                        className="h-4 w-4 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600 focus:ring-slate-500 cursor-pointer"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="text"
                                        value={g.label}
                                        onChange={(e) => {
                                          const next = [...extractGroups];
                                          next[gIdx] = { ...next[gIdx], label: e.target.value };
                                          setExtractGroups(next);
                                        }}
                                        disabled={g.isKey}
                                        placeholder={g.isKey ? t("collection_rules.extractGroupKeyPlaceholder") : `Value#${extractGroups.slice(0, gIdx).filter((gr) => !gr.isKey).length + 1}`}
                                        className={`w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors ${g.isKey ? "opacity-50 cursor-not-allowed" : ""}`}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{t("collection_rules.extractCaptureGroupsHelp")}</p>
                        </div>
                      )}

                      {/* Node field mapping collapse (only when multiline is off) */}
                      {!extractMultiline && detectedGroupCount > 0 && (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setShowNodeFieldMapping(!showNodeFieldMapping)}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            <span>{t("collection_rules.extractNodeField")}</span>
                            <ChevronDown className={`h-4 w-4 transition-transform ${showNodeFieldMapping ? "rotate-180" : ""}`} />
                          </button>
                          {showNodeFieldMapping && (
                            <div className="px-3 pb-3 space-y-2">
                              <select
                                value={extractNodeField}
                                onChange={(e) => {
                                  setExtractNodeField(e.target.value);
                                  if (!e.target.value) setExtractNodeFieldGroup(null);
                                  else if (!extractNodeFieldGroup) setExtractNodeFieldGroup(1);
                                }}
                                className={inputCls}
                              >
                                <option value="">{t("collection_rules.extractNodeFieldNone")}</option>
                                <option value="hostname">{t("collection_rules.extractNodeFieldHostname")}</option>
                                <option value="discoveredModel">{t("collection_rules.extractNodeFieldModel")}</option>
                                <option value="discoveredVersion">{t("collection_rules.extractNodeFieldVersion")}</option>
                              </select>
                              {extractNodeField && (
                                <div>
                                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t("collection_rules.extractNodeFieldGroup")}</label>
                                  <select
                                    value={extractNodeFieldGroup ?? 1}
                                    onChange={(e) => setExtractNodeFieldGroup(Number(e.target.value))}
                                    className={inputCls}
                                  >
                                    {Array.from({ length: detectedGroupCount }, (_, i) => (
                                      <option key={i + 1} value={i + 1}>${i + 1}</option>
                                    ))}
                                  </select>
                                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("collection_rules.extractNodeFieldHelp")}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => { setShowExtractModal(false); setEditingExtract(null); resetExtractForm(); }}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={saveExtract}
                    disabled={savingExtract || !extractName.trim() || !extractRegex.trim()}
                    className={btnPrimaryCls}
                  >
                    {savingExtract ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Test tab */}
      {activeTab === "test" && (
        <div className="space-y-4">
          {/* Node selector + execute */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.testSelectNode")}</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
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
                    <ChevronDown className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {dropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                      <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
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
                                onClick={() => { setSelectedNodeId(node.id); setDropdownOpen(false); setNodeSearch(""); }}
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
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-slate-400 dark:text-slate-500">
                {selectedNode && (
                  <span className="flex items-center gap-1.5">
                    {rule.source === "local" ? <Monitor className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
                    {rule.source.toUpperCase()}
                    {rule.command && (
                      <>
                        <span className="mx-1">·</span>
                        <code className="text-xs">{rule.command}</code>
                      </>
                    )}
                  </span>
                )}
              </div>
              <button
                onClick={executeTest}
                disabled={executing || !selectedNodeId || !rule.command}
                className={btnPrimaryCls}
              >
                {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {executing ? t("collection_rules.testExecuting") : t("collection_rules.testExecute")}
              </button>
            </div>
          </div>

          {/* Result */}
          {testResult && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              {/* Result header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t("collection_rules.testOutput")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                  {testResult.source && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                      testResult.source === "local"
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                        : "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                    }`}>
                      {testResult.source === "local" ? <Monitor className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                      {testResult.source.toUpperCase()}
                    </span>
                  )}
                  {testResult.collectionId && (
                    <span>{t("collection_rules.testCollectionId").replace("{id}", String(testResult.collectionId))}</span>
                  )}
                </div>
              </div>

              {/* Sub-tabs file / inventory */}
              {testResult.success && testResult.output && (
                <div className="flex border-b border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => { setResultTab("file"); setSelectedMatchId(null); }}
                    className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      resultTab === "file"
                        ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                        : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {t("collection_rules.resultTabFile")}
                  </button>
                  <button
                    onClick={() => { setResultTab("inventory"); setSelectedInventoryCat(0); }}
                    className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      resultTab === "inventory"
                        ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                        : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    }`}
                  >
                    <Table2 className="h-3.5 w-3.5" />
                    {t("collection_rules.resultTabInventory")}
                  </button>
                </div>
              )}

              {/* File tab content */}
              {testResult.success && testResult.output && resultTab === "file" && (
                <div className="h-[500px] flex">
                  {/* Left: raw file with highlights */}
                  <div className="flex-1 min-w-0 overflow-auto">
                    <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 p-4 whitespace-pre-wrap break-words">
                      {highlightedOutput ? (
                        highlightedOutput.segments.map((seg, i) =>
                          seg.extractIdx !== null ? (
                            <mark
                              key={i}
                              onClick={() => setSelectedMatchId(seg.matchId)}
                              className={`${HIGHLIGHT_COLORS[seg.extractIdx % HIGHLIGHT_COLORS.length].bg} rounded px-0.5 cursor-pointer hover:ring-2 hover:ring-slate-400 dark:hover:ring-slate-500 transition-shadow ${
                                selectedMatchId === seg.matchId ? "ring-2 ring-slate-900 dark:ring-white" : ""
                              }`}
                            >
                              {seg.text}
                            </mark>
                          ) : (
                            <span key={i}>{seg.text}</span>
                          )
                        )
                      ) : (
                        testResult.output
                      )}
                    </pre>
                  </div>

                  {/* Right: match detail panel */}
                  {selectedMatchId !== null && highlightedOutput && (() => {
                    const detail = highlightedOutput.matchDetails.find((d) => d.matchId === selectedMatchId);
                    if (!detail) return null;
                    const color = HIGHLIGHT_COLORS[detail.extractIdx % HIGHLIGHT_COLORS.length];
                    return (
                      <div className="w-[35%] flex-shrink-0 border-l border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 overflow-y-auto">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${color.bg}`} />
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{detail.extractName}</span>
                          </div>
                          <button
                            onClick={() => setSelectedMatchId(null)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="p-4 space-y-4">
                          {/* Regex */}
                          <div>
                            <span className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Regex</span>
                            <code className="block text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1.5 break-all">{detail.regex}</code>
                          </div>

                          {/* Full match */}
                          <div>
                            <span className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Match</span>
                            <code className={`block text-xs font-mono rounded px-2 py-1.5 break-all ${color.badge}`}>{detail.fullMatch}</code>
                          </div>

                          {/* Key */}
                          {detail.key && (
                            <div>
                              <span className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{t("collection_rules.inventoryKey")}</span>
                              <code className="block text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1.5">{detail.key}</code>
                            </div>
                          )}

                          {/* Capture groups */}
                          {detail.groups.length > 0 && (
                            <div>
                              <span className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">{t("collection_rules.extractCaptureGroups")}</span>
                              <div className="space-y-1.5">
                                {detail.groups.map((g) => (
                                  <div key={g.index} className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 ${g.isKey ? "bg-slate-200/60 dark:bg-slate-700/40" : "bg-slate-100/60 dark:bg-slate-800/40"}`}>
                                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0">${g.index}</span>
                                    <div className="min-w-0 flex-1">
                                      <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                        {g.label}
                                        {g.isKey && <span className="ml-1 text-[9px] font-semibold text-slate-900 dark:text-slate-200 bg-slate-300/60 dark:bg-slate-600/60 rounded px-1 py-0.5">KEY</span>}
                                      </span>
                                      <code className="block text-xs font-mono text-slate-800 dark:text-slate-200 break-all">{g.value || <span className="text-slate-300 dark:text-slate-600 italic">vide</span>}</code>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Inventory tab content */}
              {testResult.success && testResult.output && resultTab === "inventory" && (
                <div className="h-[500px]">
                  {inventoryData && inventoryData.length > 0 ? (
                    <div className="flex h-full">
                      {/* Sidebar */}
                      <div className="w-52 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 overflow-y-auto">
                        <nav className="py-2">
                          {inventoryData.map((cat, catIdx) => (
                            <button
                              key={catIdx}
                              onClick={() => setSelectedInventoryCat(catIdx)}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                selectedInventoryCat === catIdx
                                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium border-r-2 border-r-slate-900 dark:border-r-slate-100 shadow-sm"
                                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate">{cat.categoryName}</span>
                                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 bg-slate-200/60 dark:bg-slate-700/60 rounded-full px-1.5 py-0.5 flex-shrink-0">{cat.rows.length}</span>
                              </div>
                            </button>
                          ))}
                        </nav>
                      </div>

                      {/* Table */}
                      <div className="flex-1 min-w-0 overflow-auto">
                        {(() => {
                          const cat = inventoryData[selectedInventoryCat] ?? inventoryData[0];
                          if (!cat) return null;
                          return (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{cat.keyLabel || t("collection_rules.inventoryKey")}</th>
                                  {cat.columns.map((col) => (
                                    <th key={col.colKey} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{col.label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {cat.rows.map((row, rowIdx) => (
                                  <tr key={rowIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                      <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{row.key}</code>
                                    </td>
                                    {cat.columns.map((col) => (
                                      <td key={col.colKey} className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                                        {row.values[col.colKey] ? (
                                          <code className="text-xs font-mono">{row.values[col.colKey]}</code>
                                        ) : (
                                          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Table2 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="text-sm text-slate-400 dark:text-slate-500">{t("collection_rules.inventoryEmpty")}</p>
                    </div>
                  )}
                </div>
              )}

              {/* No output or error */}
              {testResult.success && !testResult.output && (
                <div className="p-4">
                  <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">{t("collection_rules.testNoOutput")}</p>
                </div>
              )}
              {!testResult.success && (
                <div className="p-4">
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
                    <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">{testResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const btnPrimaryCls = "flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors";
