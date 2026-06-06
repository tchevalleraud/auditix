"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import FolderPicker from "@/components/FolderPicker";
import { PluginManagedBanner } from "@/components/PluginManagedBanner";
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
  Pencil,
  Terminal,
  Play,
  FlaskConical,
  AlertCircle,
  Search,
  Server,
  ChevronDown,
  ChevronUp,
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
  Languages,
  Workflow,
  Wand2,
} from "lucide-react";
import AssistedExtractModal, { AssistedExtractResult } from "@/components/AssistedExtractModal";

interface ExtractItem {
  id: number;
  name: string;
  regex: string;
  multiline: boolean;
  keyMode: "manual" | "extract";
  keyManual: string | null;
  keyExtractId: number | null;
  keyGroup: number | null;
  keyLabel: string | null;
  valueGroup: number | null;
  valueMap: { label: string; group: number }[] | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryKeyLabel: string | null;
  nodeField: string | null;
  nodeFieldGroup: number | null;
  extractMode: "line" | "block";
  blockSeparator: string | null;
  blockKeyGroup: number | null;
  blockKeyTemplate: string | null;
  blockCaptures: BlockCapture[] | null;
  position: number;
}

interface BlockCapture {
  name: string;
  regex: string;
  group: number;
}

interface InventoryCategory {
  id: number;
  name: string;
  keyLabel: string | null;
}

interface TranslationCondition {
  operator: string;
  value: string;
}

interface TranslationBlock {
  type: "if" | "else_if" | "else";
  logic?: "and" | "or";
  conditions?: TranslationCondition[];
  result: { value: string | null };
  children?: TranslationBlock[];
}

interface TranslationEntry {
  extractId: number;
  extractName: string;
  conditionTree: { blocks: TranslationBlock[] };
}

interface ConditionItem {
  type: "inventory";
  inventoryCategoryId: number | null;
  inventoryKey: string;
  inventoryColumn: string;
  // "single" (default): test the exact (key, column) cell.
  // "all": test the column across every entry of the category, aggregated
  // with `inventoryMatch` ("all" = every value must satisfy, "any" = one).
  inventoryKeyMode?: "single" | "all";
  inventoryMatch?: "all" | "any";
  operator: string;
  value: string;
  nodeManufacturerId?: number | null;
  nodeModelId?: number | null;
  nodeTagId?: number | null;
}

type ConditionAction =
  | { type: "set_tag"; tagId: number | null }
  | {
      type: "set_inventory";
      categoryId: number | null;
      key: string;
      column: string;
      value: string;
      // "single" (default): write to the exact (key, column) cell.
      // "all": iterate over every row already produced by THIS rule on the
      // selected category and stamp the column with the value. Used to mark
      // static metadata (e.g. MSTP instance ID) when the source command
      // doesn't include it explicitly.
      keyMode?: "single" | "all";
    };

type ConditionResult = ConditionAction[] | null;

interface ConditionBlock {
  // "always": unconditional, no conditions to edit, the result is applied
  // regardless. Rendered first in the editor, evaluated first at runtime.
  type: "if" | "else_if" | "else" | "always";
  logic?: "and" | "or";
  conditions?: ConditionItem[];
  result: ConditionResult;
  children?: ConditionBlock[];
}

interface ConditionTree {
  blocks: ConditionBlock[];
}

interface RuleDetail {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  source: "local" | "ssh";
  command: string | null;
  folderId: number | null;
  extracts: ExtractItem[];
  translations: TranslationEntry[] | null;
  conditionTree: ConditionTree | null;
  managedByPlugin: string | null;
  createdAt: string;
}

interface NodeTagItem {
  id: number;
  name: string;
  color: string;
}

interface InventoryStructureEntry {
  key: string;
  columns: string[];
}

interface InventoryStructureCategory {
  categoryId: number | null;
  categoryName: string;
  entries: InventoryStructureEntry[];
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

const tabKeys = ["collect", "extracts", "translations", "conditions", "test", "edit"] as const;
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
  const [folderId, setFolderId] = useState<number | null>(null);
  const [ruleFolderTree, setRuleFolderTree] = useState<{ id: number; name: string; type: "custom" | "manufacturer" | "model"; children: any[] }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Collect fields
  const [source, setSource] = useState<"local" | "ssh">("local");
  const [command, setCommand] = useState("");
  const [savingCollect, setSavingCollect] = useState(false);
  const [savedCollect, setSavedCollect] = useState(false);

  // Extract fields
  const [extracts, setExtracts] = useState<ExtractItem[]>([]);
  const [editingExtract, setEditingExtract] = useState<ExtractItem | null>(null);
  const [extractName, setExtractName] = useState("");
  const [extractRegex, setExtractRegex] = useState("");
  const [extractMultiline, setExtractMultiline] = useState(false);
  const [extractMode, setExtractMode] = useState<"line" | "block">("line");
  const [blockSeparator, setBlockSeparator] = useState("");
  const [blockKeyGroup, setBlockKeyGroup] = useState<number | null>(1);
  const [blockKeyTemplate, setBlockKeyTemplate] = useState("");
  const [blockCaptures, setBlockCaptures] = useState<BlockCapture[]>([]);
  const [extractGroups, setExtractGroups] = useState<{ isKey: boolean; label: string }[]>([]);
  const [extractKeyTemplate, setExtractKeyTemplate] = useState("");
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
  const [nodeTags, setNodeTags] = useState<NodeTagItem[]>([]);
  const [inventoryStructure, setInventoryStructure] = useState<InventoryStructureCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [savingExtract, setSavingExtract] = useState(false);
  const [showAssistedModal, setShowAssistedModal] = useState(false);

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
      setFolderId(data.folderId);
      setSource(data.source);
      setCommand(data.command ?? "");
      setExtracts(data.extracts ?? []);
    }
    setLoading(false);
  }, [ruleId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!current) return;
    (async () => {
      const res = await fetch(`/api/collection-rules/tree?context=${current.id}`);
      if (res.ok) {
        const data = await res.json();
        setRuleFolderTree(data.folders ?? []);
      }
    })();
  }, [current]);

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

  const loadNodeTags = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/node-tags?context=${current.id}`);
    if (res.ok) setNodeTags(await res.json());
  }, [current]);

  const readOnly = !!rule?.managedByPlugin;

  // The `enabled` flag stays editable even for plugin-managed rules (backend
  // allows it). For managed rules the full-form Save is disabled, so persist
  // the toggle on its own via an enabled-only PUT.
  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    if (!readOnly) return;
    const res = await fetch(`/api/collection-rules/${ruleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (res.ok) setRule(await res.json());
  };

  const saveEdit = async () => {
    if (!name.trim() || readOnly) return;
    setSaving(true);
    try {
      const body = { name, description: description || null, enabled, folderId };
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
    if (readOnly) return;
    setSavingCollect(true);
    try {
      const body = {
        source,
        command: command || null,
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

  const loadInventoryStructure = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/inventory-categories/structure?context=${current.id}`);
    if (res.ok) setInventoryStructure(await res.json());
  }, [current]);

  useEffect(() => {
    if (activeTab === "conditions") {
      loadCategories();
      loadNodeTags();
      loadInventoryStructure();
    }
  }, [activeTab, loadCategories, loadNodeTags, loadInventoryStructure]);

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
    if (!extractName.trim() || !extractRegex.trim() || readOnly) return;
    setSavingExtract(true);
    // Build keyGroup and valueMap from extractGroups
    const keyIdx = extractGroups.findIndex((g) => g.isKey);
    let valueNum = 0;
    const valueMappings = extractGroups
      .map((g, i) => ({ label: g.label, group: i + 1, isKey: g.isKey }))
      .filter((g) => !g.isKey)
      .map((g) => ({ label: g.label.trim() || `Value#${++valueNum}`, group: g.group }));

    const hasKeyTemplate = keyIdx < 0 && extractKeyTemplate.trim();
    const payload = {
      name: extractName,
      regex: extractRegex,
      multiline: extractMultiline,
      extractMode: extractMode,
      blockSeparator: extractMode === "block" ? (blockSeparator || null) : null,
      blockKeyGroup: extractMode === "block" ? blockKeyGroup : null,
      blockKeyTemplate: extractMode === "block" && blockKeyTemplate.trim() !== "" ? blockKeyTemplate.trim() : null,
      blockCaptures: extractMode === "block" && blockCaptures.length > 0
        ? blockCaptures.filter((c) => c.name.trim() !== "" && c.regex.trim() !== "")
        : null,
      keyMode: keyIdx >= 0 ? "extract" as const : "manual" as const,
      keyManual: hasKeyTemplate ? extractKeyTemplate.trim() : null,
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
    setExtractMode("line");
    setBlockSeparator("");
    setBlockKeyGroup(1);
    setBlockKeyTemplate("");
    setBlockCaptures([]);
    setExtractGroups([]);
    setExtractKeyTemplate("");
    setExtractCategoryId(null);
    setExtractCategoryKeyLabel("");
    setExtractNodeField("");
    setExtractNodeFieldGroup(null);
    setShowNodeFieldMapping(false);
    setShowNewCategory(false);
    setNewCategoryName("");
  };

  const duplicateExtract = async (ext: ExtractItem) => {
    if (readOnly) return;
    const payload = {
      name: `${ext.name} (copie)`,
      regex: ext.regex,
      multiline: ext.multiline,
      extractMode: ext.extractMode,
      blockSeparator: ext.blockSeparator,
      blockKeyGroup: ext.blockKeyGroup,
      blockKeyTemplate: ext.blockKeyTemplate,
      blockCaptures: ext.blockCaptures,
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
    if (readOnly) return;
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
    if (readOnly) { setDraggedExtractId(null); setDragOverExtractId(null); return; }
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
    setExtractMode(e.extractMode || "line");
    setBlockSeparator(e.blockSeparator || "");
    setBlockKeyGroup(e.blockKeyGroup ?? 1);
    setBlockKeyTemplate(e.blockKeyTemplate || "");
    setBlockCaptures(e.blockCaptures ?? []);
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

    // Mark key group or load key template
    if (e.keyMode === "extract" && e.keyGroup) {
      const ki = e.keyGroup - 1;
      if (ki >= 0 && ki < groups.length) groups[ki].isKey = true;
      setExtractKeyTemplate("");
    } else {
      setExtractKeyTemplate(e.keyManual || "");
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

  const openAssistedExtract = () => {
    loadCategories();
    setShowAssistedModal(true);
  };

  const applyAssistedResult = (result: AssistedExtractResult) => {
    setShowAssistedModal(false);
    setEditingExtract(null);
    resetExtractForm();
    setExtractName(result.name);
    setExtractRegex(result.regex);
    setExtractMode(result.extractMode);
    setBlockSeparator(result.blockSeparator ?? "");
    setBlockKeyGroup(result.blockKeyGroup ?? 1);
    setBlockKeyTemplate("");

    // Determine total group count from columns + optional keyGroup
    const maxColGroup = result.columns.reduce((m, c) => Math.max(m, c.group), 0);
    const maxGroup = Math.max(maxColGroup, result.keyGroup ?? 0);
    const groups = Array.from({ length: maxGroup }, () => ({ isKey: false, label: "" }));
    result.columns.forEach((c) => {
      const i = c.group - 1;
      if (i >= 0 && i < groups.length) groups[i] = { isKey: false, label: c.label };
    });
    if (result.keyGroup && result.keyGroup > 0 && result.keyGroup <= groups.length) {
      groups[result.keyGroup - 1] = { isKey: true, label: groups[result.keyGroup - 1].label || "key" };
    }
    setExtractGroups(groups);

    // Key handling: if keyMode is "manual" + keyManual provided, fill the key template
    if (result.keyMode === "manual" && result.keyManual) {
      setExtractKeyTemplate(result.keyManual);
    }

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
    translation: { original: string; translated: string; hasTranslation: boolean } | null;
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
            let k = ext.keyManual || ext.name;
            // Resolve template variables $1, $2, etc.
            if (k && /\$\d/.test(k)) {
              k = k.replace(/\$(\d+)/g, (_, n) => match[Number(n)] ?? "");
            }
            key = k;
          }

          // Compute translation info for the primary value
          let translationInfo: MatchDetail["translation"] = null;
          const hasTranslation = rule?.translations?.some((tr) => tr.extractId === ext.id) ?? false;
          if (hasTranslation) {
            const vg = ext.keyMode === "extract" ? (ext.valueGroup ?? 2) : (ext.valueGroup ?? 1);
            const originalVal = ext.valueMap && ext.valueMap.length > 0
              ? (match[ext.valueMap[0].group] ?? "")
              : (match[vg] ?? match[1] ?? match[0]);
            const translatedVal = applyFrontendTranslation(rule, ext.id, originalVal);
            translationInfo = { original: originalVal, translated: translatedVal, hasTranslation: true };
          }

          matchDetails.push({
            matchId: mid,
            extractIdx: idx,
            extractName: ext.name,
            regex: ext.regex,
            fullMatch: match[0],
            groups,
            key,
            translation: translationInfo,
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
      const cols: ExtractColumns = hasValueMap
        ? ext.valueMap!.map((vm) => ({ colKey: `col:${vm.label}`, label: vm.label }))
        : [{ colKey: "col:Value#1", label: "Value#1" }];
      allExtractColumns[ext.id] = cols;

      const processMatch = (m: RegExpExecArray, blockKey: string | null) => {
        let key: string;
        if (blockKey) {
          // In block mode, the key comes from the block separator capture group
          key = blockKey;
          if (/\$\d/.test(key)) {
            key = key.replace(/\$(\d+)/g, (_, n) => m[Number(n)] ?? "");
          }
        } else if (ext.keyMode === "extract") {
          const kg = ext.keyGroup ?? 1;
          key = m[kg] ?? m[0];
        } else {
          key = ext.keyManual || ext.name;
          if (/\$\d/.test(key)) {
            key = key.replace(/\$(\d+)/g, (_, n) => m[Number(n)] ?? "");
          }
        }
        const columns: Record<string, string> = {};
        if (hasValueMap) {
          ext.valueMap!.forEach((vm) => {
            let val = m[vm.group] ?? "";
            val = applyFrontendTranslation(rule, ext.id, val);
            columns[`col:${vm.label}`] = val;
          });
        } else {
          const vg = ext.keyMode === "extract" ? (ext.valueGroup ?? 2) : (ext.valueGroup ?? 1);
          let val = m[vg] ?? m[1] ?? m[0];
          val = applyFrontendTranslation(rule, ext.id, val);
          columns["col:Value#1"] = val;
        }
        rows.push({ key, columns });
      };

      const applyRegexOnText = (fragment: string, blockKey: string | null) => {
        try {
          const flags = ext.multiline ? "gs" : "g";
          const re = new RegExp(ext.regex, flags);
          for (const rawLine of fragment.split("\n")) {
            const line = rawLine.replace(/\r$/, "");
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(line)) !== null) {
              processMatch(m, blockKey);
              if (m[0].length === 0) re.lastIndex++;
            }
          }
        } catch {
          // invalid regex
        }
      };

      if (ext.extractMode === "block" && ext.blockSeparator) {
        // Block mode: split text into blocks, then apply regex within each block
        try {
          const sepRe = new RegExp(ext.blockSeparator, "gm");
          const sepMatches: { index: number; groups: string[] }[] = [];
          let sm: RegExpExecArray | null;
          while ((sm = sepRe.exec(text)) !== null) {
            const groups: string[] = [];
            for (let gi = 0; gi < sm.length; gi++) groups.push(sm[gi] ?? "");
            sepMatches.push({ index: sm.index, groups });
            if (sm[0].length === 0) sepRe.lastIndex++;
          }

          for (let bi = 0; bi < sepMatches.length; bi++) {
            const start = sepMatches[bi].index;
            const end = sepMatches[bi + 1]?.index ?? text.length;
            const blockText = text.substring(start, end);

            // Evaluate per-block named captures (block body, /m mode), then
            // expose them to the template as ${name}.
            const vars: Record<string, string> = {};
            for (const cap of (ext.blockCaptures ?? [])) {
              if (!cap.name || !cap.regex) continue;
              try {
                const cm = new RegExp(cap.regex, "m").exec(blockText);
                vars[cap.name] = (cm?.[cap.group ?? 1] ?? "").trim();
              } catch {
                vars[cap.name] = "";
              }
            }

            let bKey: string | null = null;
            const tpl = ext.blockKeyTemplate?.trim();
            if (tpl) {
              // Mirror backend ordering: ${name} first, then $1, $2, … so a
              // numeric placeholder inside a name doesn't get partially consumed.
              bKey = tpl
                .replace(/\$\{([^}]+)\}/g, (_, name) => vars[name] ?? "")
                .replace(/\$(\d+)/g, (_, n) => {
                  const idx = Number(n);
                  return (sepMatches[bi].groups[idx] ?? "").trim();
                })
                .trim();
            } else {
              const bkg = ext.blockKeyGroup ?? 1;
              if (sepMatches[bi].groups[bkg] !== undefined) {
                bKey = sepMatches[bi].groups[bkg].trim();
              }
            }

            applyRegexOnText(blockText, bKey);
          }
        } catch {
          // invalid block separator regex
        }
      } else {
        // Line mode (default)
        applyRegexOnText(text, null);
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
    { key: "translations", label: t("collection_rules.tabTranslations"), icon: <Languages className="h-4 w-4" /> },
    { key: "conditions", label: t("collection_rules.tabConditions"), icon: <Workflow className="h-4 w-4" /> },
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
    <div className={`space-y-6 ${activeTab === "test" ? "flex flex-col h-[calc(100vh-7rem)]" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
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

      {readOnly && <PluginManagedBanner pluginId={rule.managedByPlugin!} />}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 shrink-0">
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
                disabled={readOnly}
                placeholder={t("collection_rules.namePlaceholder")}
                className={`${inputCls} disabled:opacity-60 disabled:cursor-not-allowed`}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.description")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={readOnly}
                placeholder={t("collection_rules.descriptionPlaceholder")}
                className={`${inputCls} resize-none disabled:opacity-60 disabled:cursor-not-allowed`}
              />
            </div>
            {/* The enabled toggle stays active even for plugin-managed rules. */}
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" onClick={toggleEnabled}>
                {enabled ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
              </button>
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {enabled ? t("collection_rules.enabled") : t("collection_rules.disabled")}
              </span>
            </label>
            <div className={`space-y-1.5 ${readOnly ? "opacity-60 pointer-events-none" : ""}`}>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.folder")}</label>
              <FolderPicker folders={ruleFolderTree} value={folderId} onChange={setFolderId} rootLabel={t("collection_rules.noFolder")} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={saveEdit}
              disabled={saving || !name.trim() || readOnly}
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
                  disabled={readOnly}
                  className={`flex items-center gap-2.5 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all flex-1 disabled:opacity-60 disabled:cursor-not-allowed ${
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
                  disabled={readOnly}
                  className={`flex items-center gap-2.5 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all flex-1 disabled:opacity-60 disabled:cursor-not-allowed ${
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
              <input type="text" value={command} onChange={(e) => setCommand(e.target.value)} disabled={readOnly} placeholder={t("collection_rules.commandPlaceholder")} className={`${inputCls} disabled:opacity-60 disabled:cursor-not-allowed`} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
            <button onClick={saveCollect} disabled={savingCollect || readOnly} className={btnPrimaryCls}>
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
              <div className="flex items-center gap-2">
                <button
                  onClick={openAssistedExtract}
                  disabled={readOnly}
                  className="flex items-center gap-2 rounded-lg border border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Wand2 className="h-4 w-4" />
                  {t("collection_rules.assistedAddExtract")}
                </button>
                <button onClick={openNewExtract} disabled={readOnly} className={btnPrimaryCls}>
                  <Plus className="h-4 w-4" />
                  {t("collection_rules.addExtract")}
                </button>
              </div>
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
                              draggable={!readOnly}
                              onDragStart={(e) => {
                                if (readOnly) { e.preventDefault(); return; }
                                setDraggedExtractId(ext.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragOver={(e) => {
                                if (readOnly) return;
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
                              <div className={`text-slate-300 dark:text-slate-600 ${readOnly ? "opacity-40 cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:text-slate-400 dark:hover:text-slate-500"}`}>
                                <GripVertical className="h-4 w-4" />
                              </div>
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${HIGHLIGHT_COLORS[globalIdx % HIGHLIGHT_COLORS.length].bg}`} />
                              <div className={`flex-1 min-w-0 ${readOnly ? "" : "cursor-pointer"}`} onClick={() => { if (!readOnly) openEditExtract(ext); }}>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{ext.name}</span>
                                  {ext.multiline && (
                                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">M</span>
                                  )}
                                </div>
                                <code className="text-xs text-slate-500 dark:text-slate-400 font-mono">{ext.regex}</code>
                              </div>
                              {!readOnly && (
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
                              )}
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

          {/* Assisted extract modal */}
          {showAssistedModal && rule && current && (
            <AssistedExtractModal
              ruleId={ruleId}
              contextId={current.id}
              ruleSource={rule.source}
              ruleCommand={rule.command}
              initialOutput={testResult?.success ? testResult.output ?? null : null}
              initialNodeId={selectedNodeId}
              onAccept={applyAssistedResult}
              onClose={() => setShowAssistedModal(false)}
            />
          )}

          {/* Extract modal */}
          {showExtractModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={() => { setShowExtractModal(false); setEditingExtract(null); resetExtractForm(); }} />
              <div className="relative z-10 w-[65vw] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
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
                      {/* Extract mode: Line vs Block */}
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collection_rules.extractModeLabel")}</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setExtractMode("line")}
                            className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                              extractMode === "line"
                                ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {t("collection_rules.extractModeLine")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setExtractMode("block")}
                            className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                              extractMode === "block"
                                ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {t("collection_rules.extractModeBlock")}
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {extractMode === "line" ? t("collection_rules.extractModeLineDesc") : t("collection_rules.extractModeBlockDesc")}
                        </p>
                      </div>

                      {/* Block separator (only in block mode) */}
                      {extractMode === "block" && (
                        <div className="space-y-3 rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 p-3">
                          <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-blue-700 dark:text-blue-300">{t("collection_rules.blockSeparator")}</label>
                            <input
                              type="text"
                              value={blockSeparator}
                              onChange={(e) => setBlockSeparator(e.target.value)}
                              placeholder={t("collection_rules.blockSeparatorPlaceholder")}
                              className={`${inputCls} font-mono`}
                            />
                            <p className="text-xs text-slate-400 dark:text-slate-500">{t("collection_rules.blockSeparatorHint")}</p>
                          </div>

                          {/* Dynamic capture groups from blockSeparator */}
                          {(() => {
                            let count = 0;
                            let esc = false;
                            let inCC = false;
                            for (let i = 0; i < blockSeparator.length; i++) {
                              const ch = blockSeparator[i];
                              if (esc) { esc = false; continue; }
                              if (ch === "\\") { esc = true; continue; }
                              if (ch === "[") { inCC = true; continue; }
                              if (ch === "]") { inCC = false; continue; }
                              if (inCC) continue;
                              if (ch === "(" && blockSeparator[i + 1] !== "?") count++;
                            }
                            if (count === 0) return null;
                            return (
                              <div className="space-y-2">
                                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300">
                                  {t("collection_rules.blockKeyGroup")}
                                </label>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t("collection_rules.blockKeyGroupHint")}</p>
                                <div className="flex flex-wrap gap-2">
                                  {Array.from({ length: count }, (_, i) => i + 1).map((g) => (
                                    <button
                                      key={g}
                                      type="button"
                                      onClick={() => setBlockKeyGroup(g)}
                                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono font-medium transition-all ${
                                        (blockKeyGroup ?? 1) === g
                                          ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500"
                                      }`}
                                    >
                                      <span>${g}</span>
                                      {(blockKeyGroup ?? 1) === g && (
                                        <span className="text-[10px] font-sans font-normal opacity-80">← {t("collection_rules.blockKeySelected")}</span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                                {(blockKeyGroup ?? 1) <= count && (
                                  <div className="flex items-center gap-2 mt-1 text-xs">
                                    <span className="text-slate-500 dark:text-slate-400">{t("collection_rules.blockKeyPreview")}:</span>
                                    <code className="rounded bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 font-mono text-blue-700 dark:text-blue-300 font-semibold">
                                      ${blockKeyGroup ?? 1}
                                    </code>
                                    <span className="text-slate-400 dark:text-slate-500">→ ex. &quot;1/1&quot;, &quot;1/2&quot;, &quot;1/3&quot;, ...</span>
                                  </div>
                                )}

                                <div className="pt-3 mt-3 border-t border-blue-200/50 dark:border-blue-500/20 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                      {t("collection_rules.blockCaptures")}
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => setBlockCaptures((cs) => [...cs, { name: "", regex: "", group: 1 }])}
                                      className="flex items-center gap-1 rounded border border-dashed border-slate-300 dark:border-slate-600 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500 transition-colors"
                                    >
                                      <Plus className="h-3 w-3" />
                                      {t("collection_rules.blockCapturesAdd")}
                                    </button>
                                  </div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("collection_rules.blockCapturesHint")}</p>
                                  {blockCaptures.length === 0 && (
                                    <p className="text-[11px] italic text-slate-400 dark:text-slate-500">{t("collection_rules.blockCapturesEmpty")}</p>
                                  )}
                                  {blockCaptures.map((cap, ci) => (
                                    <div key={ci} className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2">
                                      <div className="flex flex-col gap-0.5">
                                        <button
                                          type="button"
                                          disabled={ci === 0}
                                          onClick={() => setBlockCaptures((cs) => {
                                            const next = [...cs];
                                            [next[ci - 1], next[ci]] = [next[ci], next[ci - 1]];
                                            return next;
                                          })}
                                          className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                          <ChevronUp className="h-3 w-3" />
                                        </button>
                                        <button
                                          type="button"
                                          disabled={ci === blockCaptures.length - 1}
                                          onClick={() => setBlockCaptures((cs) => {
                                            const next = [...cs];
                                            [next[ci + 1], next[ci]] = [next[ci], next[ci + 1]];
                                            return next;
                                          })}
                                          className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                          <ChevronDown className="h-3 w-3" />
                                        </button>
                                      </div>
                                      <input
                                        type="text"
                                        value={cap.name}
                                        onChange={(e) => setBlockCaptures((cs) => cs.map((c, i) => i === ci ? { ...c, name: e.target.value } : c))}
                                        placeholder={t("collection_rules.blockCapturesName")}
                                        className="w-28 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono"
                                      />
                                      <input
                                        type="text"
                                        value={cap.regex}
                                        onChange={(e) => setBlockCaptures((cs) => cs.map((c, i) => i === ci ? { ...c, regex: e.target.value } : c))}
                                        placeholder={t("collection_rules.blockCapturesRegex")}
                                        className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono"
                                      />
                                      <input
                                        type="number"
                                        min={1}
                                        max={20}
                                        value={cap.group}
                                        onChange={(e) => setBlockCaptures((cs) => cs.map((c, i) => i === ci ? { ...c, group: Number(e.target.value) || 1 } : c))}
                                        title={t("collection_rules.blockCapturesGroup")}
                                        className="w-12 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono text-center"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setBlockCaptures((cs) => cs.filter((_, i) => i !== ci))}
                                        className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>

                                <div className="pt-3 mt-3 border-t border-blue-200/50 dark:border-blue-500/20 space-y-1.5">
                                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                    {t("collection_rules.blockKeyTemplate")}
                                  </label>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("collection_rules.blockKeyTemplateHint")}</p>
                                  <input
                                    type="text"
                                    value={blockKeyTemplate}
                                    onChange={(e) => setBlockKeyTemplate(e.target.value)}
                                    placeholder={t("collection_rules.blockKeyTemplatePlaceholder")}
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-400 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-colors"
                                  />
                                  {blockCaptures.length > 0 && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {t("collection_rules.blockCapturesAvailable")}:{" "}
                                      {blockCaptures.filter((c) => c.name.trim()).map((c, i) => (
                                        <code key={i} className="ml-1 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px]">
                                          ${`{${c.name}}`}
                                        </code>
                                      ))}
                                    </p>
                                  )}
                                  {blockKeyTemplate.trim() !== "" && (
                                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                      {t("collection_rules.blockKeyTemplateActive")}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                          <Regex className="h-4 w-4" />
                          {extractMode === "block" ? t("collection_rules.extractRegexBlock") : t("collection_rules.extractRegex")}
                        </label>
                        <input
                          type="text"
                          value={extractRegex}
                          onChange={(e) => setExtractRegex(e.target.value)}
                          placeholder={extractMode === "block" ? t("collection_rules.extractRegexBlockPlaceholder") : t("collection_rules.extractRegexPlaceholder")}
                          className={`${inputCls} font-mono`}
                        />
                        {extractMode === "block" && (
                          <p className="text-xs text-slate-400 dark:text-slate-500">{t("collection_rules.extractRegexBlockHint")}</p>
                        )}
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

                      {/* Block mode: key comes from separator, show info banner instead of key picker */}
                      {extractMode === "block" && blockKeyGroup != null && detectedGroupCount > 0 && (
                        <div className="rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">{t("collection_rules.blockKeyInfo")}</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {t("collection_rules.blockKeyInfoDesc")}
                            {" "}<code className="rounded bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 font-mono text-blue-700 dark:text-blue-300 font-semibold">${blockKeyGroup}</code>
                            {" "}{t("collection_rules.blockKeyInfoSuffix")}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t("collection_rules.blockKeyInfoValues")}</p>
                          {/* Still show value column mapping for extraction regex groups */}
                          <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-500/20">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{t("collection_rules.extractGroupValuesOnly")}</label>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 w-12">#</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("collection_rules.extractMappingLabel")}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {extractGroups.map((g, gIdx) => (
                                    <tr key={gIdx}>
                                      <td className="px-3 py-2"><code className="text-xs font-mono text-slate-500 dark:text-slate-400">${gIdx + 1}</code></td>
                                      <td className="px-3 py-2">
                                        <input
                                          type="text"
                                          value={g.label}
                                          onChange={(e) => {
                                            const next = [...extractGroups];
                                            next[gIdx] = { ...next[gIdx], label: e.target.value };
                                            setExtractGroups(next);
                                          }}
                                          placeholder={`Value#${gIdx + 1}`}
                                          className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors"
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Capture groups (line mode or block mode without blockKeyGroup) */}
                      {!(extractMode === "block" && blockKeyGroup != null) && detectedGroupCount > 0 && (
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
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="radio"
                              name="keyGroup"
                              checked={!extractGroups.some((g) => g.isKey)}
                              onChange={() => setExtractGroups(extractGroups.map((g) => ({ ...g, isKey: false })))}
                              className="h-4 w-4 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600 focus:ring-slate-500 cursor-pointer"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400">{t("collection_rules.extractKeyTemplate")}</span>
                            <input
                              type="text"
                              value={extractKeyTemplate}
                              onChange={(e) => { setExtractKeyTemplate(e.target.value); setExtractGroups(extractGroups.map((g) => ({ ...g, isKey: false }))); }}
                              placeholder="$1-$2"
                              className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors"
                            />
                          </div>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{t("collection_rules.extractKeyTemplateHelp")}</p>
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
                                <option value="productModel">{t("collection_rules.extractNodeFieldProductModel")}</option>
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
                    disabled={savingExtract || !extractName.trim() || !extractRegex.trim() || readOnly}
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

      {/* Translations tab */}
      {activeTab === "translations" && rule && (
        <TranslationsTab
          rule={rule}
          readOnly={readOnly}
          onSave={async (translations) => {
            await fetch(`/api/collection-rules/${ruleId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ translations }),
            });
            setRule({ ...rule, translations });
          }}
          t={t}
        />
      )}

      {/* Conditions tab */}
      {activeTab === "conditions" && rule && (
        <ConditionsTab
          rule={rule}
          readOnly={readOnly}
          categories={categories}
          tags={nodeTags}
          inventoryStructure={inventoryStructure}
          onSave={async (conditionTree) => {
            await fetch(`/api/collection-rules/${ruleId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ conditionTree }),
            });
            setRule({ ...rule, conditionTree });
          }}
          t={t}
        />
      )}

      {/* Test tab */}
      {activeTab === "test" && (
        <div className="flex flex-col flex-1 min-h-0 gap-4">
          {/* Node selector + execute */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm shrink-0">
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
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex-1 min-h-0 flex flex-col">
              {/* Result header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
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
                <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
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
                <div className="flex-1 min-h-0 flex">
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

                          {/* Translation */}
                          {detail.translation?.hasTranslation && (
                            <div>
                              <span className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{t("collection_rules.tabTranslations")}</span>
                              <div className="rounded-md bg-slate-100/60 dark:bg-slate-800/40 px-2.5 py-2 space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-slate-400 shrink-0">in:</span>
                                  <code className="font-mono text-slate-600 dark:text-slate-400 break-all">{detail.translation.original}</code>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-slate-400 shrink-0">out:</span>
                                  <code className={`font-mono break-all ${detail.translation.original !== detail.translation.translated ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-slate-600 dark:text-slate-400"}`}>
                                    {detail.translation.translated}
                                  </code>
                                </div>
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
                <div className="flex-1 min-h-0">
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
const inputClsCompactBase = "rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const inputClsCompact = inputClsCompactBase + " w-full";
const selectClsBase = "rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const selectCls = selectClsBase + " w-full";
const btnPrimaryCls = "flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors";

const smallInput = "rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors";

const blockColors: Record<string, { border: string; bg: string; badge: string }> = {
  always: { border: "border-l-emerald-500", bg: "bg-emerald-50/50 dark:bg-emerald-500/5", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  if: { border: "border-l-blue-500", bg: "bg-blue-50/50 dark:bg-blue-500/5", badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  else_if: { border: "border-l-amber-500", bg: "bg-amber-50/50 dark:bg-amber-500/5", badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  else: { border: "border-l-slate-400", bg: "bg-slate-50/50 dark:bg-slate-500/5", badge: "bg-slate-200 text-slate-600 dark:bg-slate-600/30 dark:text-slate-300" },
};

const logicBadge = (logic: "and" | "or" | undefined) => logic === "or"
  ? "text-violet-500 bg-violet-50 dark:bg-violet-500/10"
  : "text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10";

const logicToggleBadge = (logic: "and" | "or" | undefined) => logic === "or"
  ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
  : "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300";

/* ─── Translation evaluation (shared by test tab and components) ─── */

function applyFrontendTranslation(rule: RuleDetail | null, extractId: number, value: string): string {
  if (!rule?.translations) return value;
  const tr = rule.translations.find((t) => t.extractId === extractId);
  if (!tr?.conditionTree?.blocks) return value;
  return evaluateTranslationBlocks(tr.conditionTree.blocks, value) ?? value;
}

function evaluateTranslationBlocks(blocks: TranslationBlock[], value: string): string | null {
  for (const block of blocks) {
    if (block.type === "else") {
      return block.result.value ?? value;
    }
    const logic = block.logic ?? "and";
    const conditions = block.conditions ?? [];
    if (evaluateTranslationConditions(conditions, value, logic)) {
      if (block.children?.length) {
        return evaluateTranslationBlocks(block.children, value);
      }
      return block.result.value ?? value;
    }
  }
  return null;
}

function evaluateTranslationConditions(conditions: TranslationCondition[], value: string, logic: string): boolean {
  if (conditions.length === 0) return true;
  for (const cond of conditions) {
    const result = compareTranslationValue(value, cond.operator, cond.value);
    if (logic === "or" && result) return true;
    if (logic === "and" && !result) return false;
  }
  return logic === "and";
}

function compareTranslationValue(value: string, operator: string, compareValue: string): boolean {
  switch (operator) {
    case "equals": return value === compareValue;
    case "not_equals": return value !== compareValue;
    case "contains": return value.includes(compareValue);
    case "not_contains": return !value.includes(compareValue);
    case "matches": try { return new RegExp(compareValue).test(value); } catch { return false; }
    case "greater_than": return parseFloat(value) > parseFloat(compareValue);
    case "less_than": return parseFloat(value) < parseFloat(compareValue);
    case "is_empty": return value === "";
    case "is_not_empty": return value !== "";
    default: return false;
  }
}

/* ─── Translations Tab ─── */

const OPERATORS = [
  { key: "equals", label: "equals" },
  { key: "not_equals", label: "not equals" },
  { key: "contains", label: "contains" },
  { key: "not_contains", label: "not contains" },
  { key: "matches", label: "matches (regex)" },
  { key: "greater_than", label: ">" },
  { key: "less_than", label: "<" },
  { key: "is_empty", label: "is empty", noValue: true },
  { key: "is_not_empty", label: "is not empty", noValue: true },
];

function TranslationsTab({ rule, readOnly, onSave, t }: {
  rule: RuleDetail;
  readOnly: boolean;
  onSave: (translations: TranslationEntry[]) => Promise<void>;
  t: (k: string) => string;
}) {
  const [translations, setTranslations] = useState<TranslationEntry[]>(rule.translations ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingExtractId, setAddingExtractId] = useState("");

  const extracts = rule.extracts;
  const usedExtractIds = translations.map((tr) => tr.extractId);
  const availableExtracts = extracts.filter((e) => !usedExtractIds.includes(e.id));

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    await onSave(translations);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addTranslation = () => {
    const extId = Number(addingExtractId);
    const ext = extracts.find((e) => e.id === extId);
    if (!ext) return;
    setTranslations([...translations, {
      extractId: ext.id,
      extractName: ext.name,
      conditionTree: {
        blocks: [{
          type: "if",
          logic: "and",
          conditions: [{ operator: "contains", value: "" }],
          result: { value: "" },
        }],
      },
    }]);
    setAddingExtractId("");
  };

  const removeTranslation = (idx: number) => {
    setTranslations(translations.filter((_, i) => i !== idx));
  };

  const updateTranslation = (idx: number, entry: TranslationEntry) => {
    setTranslations(translations.map((tr, i) => i === idx ? entry : tr));
  };

  return (
    <div className="space-y-6">
      {/* Add translation */}
      <div className="flex items-center gap-3">
        <select value={addingExtractId} onChange={(e) => setAddingExtractId(e.target.value)} disabled={readOnly} className={inputCls + " max-w-xs disabled:opacity-60 disabled:cursor-not-allowed"}>
          <option value="">{t("collection_rules.translationSelectExtract")}</option>
          {availableExtracts.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button onClick={addTranslation} disabled={!addingExtractId || readOnly}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 disabled:opacity-50">
          <Plus className="h-4 w-4" /> {t("collection_rules.translationAdd")}
        </button>
      </div>

      {translations.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-400">{t("collection_rules.translationNoTranslations")}</div>
      )}

      {translations.map((tr, idx) => (
        <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tr.extractName}</span>
              <span className="text-xs text-slate-400 ml-2">({t("collection_rules.translationExtract")})</span>
            </div>
            <button onClick={() => removeTranslation(idx)} disabled={readOnly} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 disabled:cursor-not-allowed">
              <Trash2 className="h-4 w-4 text-red-400" />
            </button>
          </div>
          <div className={`p-6 ${readOnly ? "opacity-60 pointer-events-none" : ""}`}>
            <TranslationBlockEditor
              blocks={tr.conditionTree.blocks}
              onChange={(blocks) => updateTranslation(idx, { ...tr, conditionTree: { blocks } })}
              t={t}
            />
          </div>
        </div>
      ))}

      {translations.length > 0 && (
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving || readOnly} className={btnPrimaryCls}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? t("common.save") : t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
}

function TranslationBlockEditor({ blocks, onChange, t }: {
  blocks: TranslationBlock[];
  onChange: (blocks: TranslationBlock[]) => void;
  t: (k: string) => string;
}) {
  const [editingCond, setEditingCond] = useState<string | null>(null);
  const [editingResult, setEditingResult] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const noValueOps = new Set(OPERATORS.filter((o) => (o as any).noValue).map((o) => o.key));
  const opLabel = (key: string) => OPERATORS.find((o) => o.key === key)?.label ?? key;

  const updateBlock = (idx: number, block: TranslationBlock) => {
    onChange(blocks.map((b, i) => i === idx ? block : b));
  };

  const removeBlock = (idx: number) => {
    onChange(blocks.filter((_, i) => i !== idx));
  };

  const reorderBlocks = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const next = [...blocks];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    next.forEach((b, i) => {
      if (i === 0 && b.type === "else_if") b.type = "if";
      else if (i > 0 && b.type === "if") b.type = "else_if";
    });
    onChange(next);
  };

  const addElseIf = () => {
    const insertIdx = blocks.findIndex((b) => b.type === "else");
    const newBlock: TranslationBlock = {
      type: "else_if", logic: "and",
      conditions: [{ operator: "contains", value: "" }],
      result: { value: "" },
    };
    if (insertIdx >= 0) {
      const newBlocks = [...blocks];
      newBlocks.splice(insertIdx, 0, newBlock);
      onChange(newBlocks);
    } else {
      onChange([...blocks, newBlock]);
    }
  };

  const addElse = () => {
    if (blocks.some((b) => b.type === "else")) return;
    onChange([...blocks, { type: "else", result: { value: null } }]);
  };

  const blockLabel = (type: TranslationBlock["type"]) =>
    type === "if" ? t("collection_rules.translationIf")
    : type === "else_if" ? t("collection_rules.translationElseIf")
    : t("collection_rules.translationElse");

  const hasElse = blocks.some((b) => b.type === "else");

  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        const colors = blockColors[block.type] || blockColors.if;
        const conditions = block.conditions ?? [];

        return (
          <div
            key={idx}
            className={`border-l-4 ${colors.border} rounded-lg border border-slate-200 dark:border-slate-700 ${colors.bg} ${dragOverIdx === idx && dragIdx !== idx ? "ring-2 ring-blue-400" : ""}`}
            draggable
            onDragStart={(e) => { setDragIdx(idx); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => { e.preventDefault(); setDragOverIdx(null); if (dragIdx !== null && dragIdx !== idx) reorderBlocks(dragIdx, idx); setDragIdx(null); }}
            onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
          >
            {/* Block header */}
            <div className="flex items-center justify-between px-4 py-2.5 cursor-grab active:cursor-grabbing">
              <div className="flex items-center gap-2">
                <GripVertical className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${colors.badge}`}>
                  {blockLabel(block.type)}
                </span>
                {block.type !== "else" && conditions.length > 1 && (
                  <button
                    onClick={() => updateBlock(idx, { ...block, logic: block.logic === "and" ? "or" : "and" })}
                    className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${logicToggleBadge(block.logic)}`}
                  >
                    {block.logic === "or" ? t("compliance_rules.logicOr") : t("compliance_rules.logicAnd")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                {block.type !== "else" && (
                  <button
                    onClick={() => {
                      const newConds = [...conditions, { operator: "contains", value: "" }];
                      updateBlock(idx, { ...block, conditions: newConds });
                      setEditingCond(`${idx}-${newConds.length - 1}`);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                    title={t("collection_rules.translationAddCondition")}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                {idx > 0 && (
                  <button
                    onClick={() => removeBlock(idx)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-100/50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Conditions (not for else) */}
            {block.type !== "else" && conditions.length > 0 && (
              <div className="px-4 pb-3 space-y-2">
                {conditions.map((cond, ci) => {
                  const condKey = `${idx}-${ci}`;
                  const isEditing = editingCond === condKey;
                  const noValue = noValueOps.has(cond.operator);

                  return (
                    <div key={ci}>
                      {!isEditing && (
                        <div
                          className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
                          onClick={() => setEditingCond(condKey)}
                        >
                          {ci > 0 && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${logicBadge(block.logic)}`}>
                              {block.logic === "or" ? t("compliance_rules.logicOr") : t("compliance_rules.logicAnd")}
                            </span>
                          )}
                          <span className="text-[10px] font-semibold text-slate-400 uppercase shrink-0">{opLabel(cond.operator)}</span>
                          {!noValue && (
                            <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 truncate">&quot;{cond.value}&quot;</span>
                          )}
                          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Pencil className="h-3 w-3 text-slate-400" />
                            {conditions.length > 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newConds = conditions.filter((_, j) => j !== ci);
                                  updateBlock(idx, { ...block, conditions: newConds });
                                }}
                                className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {isEditing && (
                        <div className="rounded-lg border-2 border-blue-300 dark:border-blue-500/40 bg-white dark:bg-slate-900 p-3 space-y-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Test</span>
                            <select
                              value={cond.operator}
                              onChange={(e) => {
                                const newConds = [...conditions];
                                newConds[ci] = { ...cond, operator: e.target.value };
                                updateBlock(idx, { ...block, conditions: newConds });
                              }}
                              className={`${smallInput} min-w-[160px]`}
                            >
                              {OPERATORS.map((op) => <option key={op.key} value={op.key}>{op.label}</option>)}
                            </select>
                            {!noValue && (
                              <input
                                type="text"
                                value={cond.value}
                                onChange={(e) => {
                                  const newConds = [...conditions];
                                  newConds[ci] = { ...cond, value: e.target.value };
                                  updateBlock(idx, { ...block, conditions: newConds });
                                }}
                                placeholder={t("collection_rules.translationValue")}
                                className={`${smallInput} flex-1 font-mono`}
                              />
                            )}
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            {conditions.length > 1 && (
                              <button
                                onClick={() => {
                                  setEditingCond(null);
                                  const newConds = conditions.filter((_, j) => j !== ci);
                                  updateBlock(idx, { ...block, conditions: newConds });
                                }}
                                className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                                {t("common.delete")}
                              </button>
                            )}
                            <button onClick={() => setEditingCond(null)} className="ml-auto flex items-center gap-1 rounded-md bg-slate-900 dark:bg-white px-3 py-1 text-[11px] font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                              <CheckCircle2 className="h-3 w-3" />
                              OK
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Result value */}
            {(() => {
              const resultKey = `${idx}`;
              const isEditingResult = editingResult === resultKey;
              const value = block.result.value;

              return isEditingResult ? (
                <div className="mx-4 mb-3 rounded-lg border-2 border-blue-300 dark:border-blue-500/40 bg-white dark:bg-slate-900 p-3 space-y-2">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase">{t("collection_rules.translationResult")}</label>
                  <input
                    type="text"
                    value={value ?? ""}
                    onChange={(e) => updateBlock(idx, { ...block, result: { value: e.target.value || null } })}
                    placeholder={t("collection_rules.translationKeepOriginal")}
                    className={`${smallInput} w-full font-mono`}
                  />
                  <div className="flex justify-end pt-1">
                    <button onClick={() => setEditingResult(null)} className="flex items-center gap-1 rounded-md bg-slate-900 dark:bg-white px-3 py-1 text-[11px] font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                      <CheckCircle2 className="h-3 w-3" />
                      OK
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="mx-4 mb-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
                  onClick={() => setEditingResult(resultKey)}
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shrink-0">
                      {t("collection_rules.translationResult")}
                    </span>
                    {value ? (
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">&quot;{value}&quot;</span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500 italic">{t("collection_rules.translationKeepOriginal")}</span>
                    )}
                    <Pencil className="h-3 w-3 text-slate-400 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* Add buttons */}
      <div className="flex items-center gap-2 pl-2">
        <button
          onClick={addElseIf}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-dashed border-slate-300 dark:border-slate-600 transition-colors"
        >
          <Plus className="h-3 w-3" />
          {t("collection_rules.translationAddElseIf")}
        </button>
        {!hasElse && (
          <button
            onClick={addElse}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-dashed border-slate-300 dark:border-slate-600 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t("collection_rules.translationAddElse")}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Suggest field: select if options exist, otherwise free input ─── */

function SuggestField({ value, options, onChange, placeholder, className }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const hasOptions = options.length > 0;
  const inSelect = hasOptions && !editing && (value === "" || options.includes(value));
  const cls = className ?? "";

  if (!inSelect) {
    return (
      <div className={`flex items-center gap-1 ${cls}`}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClsCompactBase + " flex-1 min-w-0"}
        />
        {hasOptions && (
          <button type="button" onClick={() => setEditing(false)}
            title="Retour à la liste"
            className="px-1.5 py-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 min-w-0 ${cls}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClsBase + " flex-1 min-w-0"}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <button type="button" onClick={() => setEditing(true)}
        title="Saisir une valeur libre"
        className="px-1.5 py-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ─── Conditions Tab (collection rule conditionTree) ─── */

const COND_OPERATORS = [
  { key: "equals", label: "equals" },
  { key: "not_equals", label: "not equals" },
  { key: "contains", label: "contains" },
  { key: "not_contains", label: "not contains" },
  { key: "matches", label: "matches (regex)" },
  { key: "greater_than", label: ">" },
  { key: "less_than", label: "<" },
  { key: "exists", label: "exists", noValue: true },
  { key: "not_exists", label: "not exists", noValue: true },
  { key: "is_empty", label: "is empty", noValue: true },
  { key: "is_not_empty", label: "is not empty", noValue: true },
];

const emptyInventoryCondition = (): ConditionItem => ({
  type: "inventory",
  inventoryCategoryId: null,
  inventoryKey: "",
  inventoryColumn: "Value#1",
  operator: "equals",
  value: "",
});

const emptyAction = (): ConditionAction => ({ type: "set_tag", tagId: null });
const defaultResult = (): ConditionResult => [emptyAction()];

/** Normalize legacy single-action result to a list. */
const normalizeResult = (r: any): ConditionAction[] => {
  if (!r) return [];
  if (Array.isArray(r)) return r as ConditionAction[];
  if (typeof r === "object" && "type" in r) return [r as ConditionAction];
  return [];
};
const normalizeBlock = (b: ConditionBlock): ConditionBlock => ({
  ...b,
  result: normalizeResult(b.result),
  children: b.children?.map(normalizeBlock),
});

function ConditionsTab({ rule, readOnly, categories, tags, inventoryStructure, onSave, t }: {
  rule: RuleDetail;
  readOnly: boolean;
  categories: InventoryCategory[];
  tags: NodeTagItem[];
  inventoryStructure: InventoryStructureCategory[];
  onSave: (tree: ConditionTree | null) => Promise<void>;
  t: (k: string) => string;
}) {
  const [blocks, setBlocks] = useState<ConditionBlock[]>(
    rule.conditionTree?.blocks
      ? rule.conditionTree.blocks.map(normalizeBlock)
      : [{
          type: "if",
          logic: "and",
          conditions: [emptyInventoryCondition()],
          result: defaultResult(),
        }]
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await onSave(blocks.length === 0 ? null : { blocks });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t("collection_rules.conditionsHelp")}
        </p>
        <div className={readOnly ? "opacity-60 pointer-events-none" : ""}>
          <ConditionBlockEditor
            blocks={blocks}
            onChange={setBlocks}
            categories={categories}
            tags={tags}
            inventoryStructure={inventoryStructure}
            t={t}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving || readOnly} className={btnPrimaryCls}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

function ConditionBlockEditor({ blocks, onChange, categories, tags, inventoryStructure, t }: {
  blocks: ConditionBlock[];
  onChange: (blocks: ConditionBlock[]) => void;
  categories: InventoryCategory[];
  tags: NodeTagItem[];
  inventoryStructure: InventoryStructureCategory[];
  t: (k: string) => string;
}) {
  const [editingCond, setEditingCond] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const noValueOps = new Set(COND_OPERATORS.filter((o) => (o as any).noValue).map((o) => o.key));
  const opLabel = (key: string) => COND_OPERATORS.find((o) => o.key === key)?.label ?? key;

  const reorderBlocks = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const next = [...blocks];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    // "always" blocks always live at the top — stable-sort them up front.
    next.sort((a, b) => {
      if (a.type === "always" && b.type !== "always") return -1;
      if (b.type === "always" && a.type !== "always") return 1;
      return 0;
    });
    // First non-always block must be "if"; later conditionals stay "else_if" or terminal "else".
    const firstCondIdx = next.findIndex((b) => b.type !== "always");
    next.forEach((b, i) => {
      if (i === firstCondIdx && b.type === "else_if") b.type = "if";
      else if (firstCondIdx >= 0 && i > firstCondIdx && b.type === "if") b.type = "else_if";
    });
    onChange(next);
  };

  const lookupKeys = (catId: number | null): string[] => {
    if (!catId) return [];
    const cat = inventoryStructure.find((c) => c.categoryId === catId);
    return cat ? Array.from(new Set(cat.entries.map((e) => e.key))).sort() : [];
  };
  const lookupColumns = (catId: number | null, key?: string): string[] => {
    if (!catId) return [];
    const cat = inventoryStructure.find((c) => c.categoryId === catId);
    if (!cat) return [];
    if (key) {
      const entry = cat.entries.find((e) => e.key === key);
      if (entry) return Array.from(new Set(entry.columns)).sort();
    }
    const all = new Set<string>();
    cat.entries.forEach((e) => e.columns.forEach((c) => all.add(c)));
    return Array.from(all).sort();
  };
  const updateBlock = (idx: number, block: ConditionBlock) => {
    onChange(blocks.map((b, i) => i === idx ? block : b));
  };

  const removeBlock = (idx: number) => {
    onChange(blocks.filter((_, i) => i !== idx));
  };

  const addElseIf = () => {
    const insertIdx = blocks.findIndex((b) => b.type === "else");
    const newBlock: ConditionBlock = {
      type: "else_if",
      logic: "and",
      conditions: [emptyInventoryCondition()],
      result: defaultResult(),
    };
    if (insertIdx >= 0) {
      const next = [...blocks];
      next.splice(insertIdx, 0, newBlock);
      onChange(next);
    } else {
      onChange([...blocks, newBlock]);
    }
  };

  const addElse = () => {
    if (blocks.some((b) => b.type === "else")) return;
    onChange([...blocks, { type: "else", result: defaultResult() }]);
  };

  const blockLabel = (type: ConditionBlock["type"]) =>
    type === "always" ? t("collection_rules.translationAlways")
    : type === "if" ? t("collection_rules.translationIf")
    : type === "else_if" ? t("collection_rules.translationElseIf")
    : t("collection_rules.translationElse");

  const hasElse = blocks.some((b) => b.type === "else");

  const addAlways = () => {
    // Always blocks live at the top of the list, before any if/else_if/else.
    // Stable position keeps the UI predictable and matches runtime ordering.
    const firstConditional = blocks.findIndex((b) => b.type !== "always");
    const newBlock: ConditionBlock = { type: "always", result: defaultResult() };
    const next = [...blocks];
    if (firstConditional === -1) {
      next.push(newBlock);
    } else {
      next.splice(firstConditional, 0, newBlock);
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        const colors = blockColors[block.type] || blockColors.if;
        const conditions = block.conditions ?? [];

        return (
          <div
            key={idx}
            className={`border-l-4 ${colors.border} rounded-lg border border-slate-200 dark:border-slate-700 ${colors.bg} ${dragOverIdx === idx && dragIdx !== idx ? "ring-2 ring-blue-400" : ""}`}
            draggable={block.type !== "always"}
            onDragStart={(e) => { if (block.type === "always") return; setDragIdx(idx); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => { e.preventDefault(); setDragOverIdx(null); if (dragIdx !== null && dragIdx !== idx) reorderBlocks(dragIdx, idx); setDragIdx(null); }}
            onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
          >
            <div className={`flex items-center justify-between px-4 py-2.5 ${block.type === "always" ? "" : "cursor-grab active:cursor-grabbing"}`}>
              <div className="flex items-center gap-2">
                {block.type !== "always" && <GripVertical className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />}
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${colors.badge}`}>
                  {blockLabel(block.type)}
                </span>
                {block.type !== "else" && block.type !== "always" && conditions.length > 1 && (
                  <button
                    onClick={() => updateBlock(idx, { ...block, logic: block.logic === "and" ? "or" : "and" })}
                    className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${logicToggleBadge(block.logic)}`}
                  >
                    {block.logic === "or" ? t("compliance_rules.logicOr") : t("compliance_rules.logicAnd")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                {block.type !== "else" && block.type !== "always" && (
                  <button
                    onClick={() => {
                      const next = [...conditions, emptyInventoryCondition()];
                      updateBlock(idx, { ...block, conditions: next });
                      setEditingCond(`${idx}-${next.length - 1}`);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                    title={t("collection_rules.translationAddCondition")}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                {(idx > 0 || block.type === "always") && (
                  <button
                    onClick={() => removeBlock(idx)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-100/50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {block.type !== "else" && block.type !== "always" && conditions.length > 0 && (
              <div className="px-4 pb-3 space-y-2">
                {conditions.map((cond, ci) => {
                  const condKey = `${idx}-${ci}`;
                  const isEditing = editingCond === condKey;
                  const noValue = noValueOps.has(cond.operator);
                  const keyOptions = lookupKeys(cond.inventoryCategoryId);
                  const columnOptions = lookupColumns(cond.inventoryCategoryId, cond.inventoryKey);
                  const catName = inventoryStructure.find((c) => c.categoryId === cond.inventoryCategoryId)?.categoryName
                    ?? categories.find((c) => c.id === cond.inventoryCategoryId)?.name;

                  return (
                    <div key={ci}>
                      {!isEditing && (
                        <div
                          className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
                          onClick={() => setEditingCond(condKey)}
                        >
                          {ci > 0 && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${logicBadge(block.logic)}`}>
                              {block.logic === "or" ? t("compliance_rules.logicOr") : t("compliance_rules.logicAnd")}
                            </span>
                          )}
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            INV
                          </span>
                          <span className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                            {`${catName || "?"} / ${(cond.inventoryKeyMode ?? "single") === "all" ? "∗" : (cond.inventoryKey || "?")}`}
                            {cond.inventoryColumn && cond.inventoryColumn !== "Value#1" ? ` [${cond.inventoryColumn}]` : ""}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400 uppercase shrink-0">
                            {(cond.inventoryKeyMode ?? "single") === "all" ? `${(cond.inventoryMatch ?? "all") === "any" ? "ANY" : "ALL"} ` : ""}{opLabel(cond.operator)}
                          </span>
                          {!noValue && (
                            <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 truncate">&quot;{cond.value}&quot;</span>
                          )}
                          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Pencil className="h-3 w-3 text-slate-400" />
                            {conditions.length > 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = conditions.filter((_, j) => j !== ci);
                                  updateBlock(idx, { ...block, conditions: next });
                                }}
                                className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {isEditing && (
                        <div className="rounded-lg border-2 border-blue-300 dark:border-blue-500/40 bg-white dark:bg-slate-900 p-3 space-y-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Cat.</span>
                              <select
                                value={cond.inventoryCategoryId ?? ""}
                                onChange={(e) => {
                                  const next = [...conditions];
                                  next[ci] = { ...cond, inventoryCategoryId: e.target.value ? Number(e.target.value) : null, inventoryKey: "", inventoryColumn: "" };
                                  updateBlock(idx, { ...block, conditions: next });
                                }}
                                className={`${smallInput} max-w-[180px]`}
                              >
                                <option value="">--</option>
                                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">{t("collection_rules.conditionKey")}</span>
                              <select
                                value={cond.inventoryKeyMode ?? "single"}
                                onChange={(e) => {
                                  const mode = e.target.value as "single" | "all";
                                  const next = [...conditions];
                                  next[ci] = {
                                    ...cond,
                                    inventoryKeyMode: mode,
                                    inventoryKey: mode === "all" ? "" : cond.inventoryKey,
                                    // "Value#1" is the legacy default and rarely a real column on
                                    // multi-column categories; clear it so the column dropdown shows.
                                    inventoryColumn: mode === "all" && cond.inventoryColumn === "Value#1" ? "" : cond.inventoryColumn,
                                  };
                                  updateBlock(idx, { ...block, conditions: next });
                                }}
                                className={`${smallInput} max-w-[170px]`}
                                title={t("collection_rules.conditionKeyMode")}
                              >
                                <option value="single">{t("collection_rules.conditionKeyModeSingle")}</option>
                                <option value="all">{t("collection_rules.conditionKeyModeAllKeys")}</option>
                              </select>
                              {(cond.inventoryKeyMode ?? "single") === "single" && (
                                <SuggestField
                                  value={cond.inventoryKey}
                                  options={keyOptions}
                                  placeholder="--"
                                  onChange={(v) => {
                                    const next = [...conditions];
                                    next[ci] = { ...cond, inventoryKey: v };
                                    updateBlock(idx, { ...block, conditions: next });
                                  }}
                                  className="max-w-[180px]"
                                />
                              )}
                            </div>
                            {(cond.inventoryKeyMode ?? "single") === "all" && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">{t("collection_rules.conditionMatch")}</span>
                                <select
                                  value={cond.inventoryMatch ?? "all"}
                                  onChange={(e) => {
                                    const next = [...conditions];
                                    next[ci] = { ...cond, inventoryMatch: e.target.value as "all" | "any" };
                                    updateBlock(idx, { ...block, conditions: next });
                                  }}
                                  className={`${smallInput} max-w-[170px]`}
                                >
                                  <option value="all">{t("collection_rules.conditionMatchAll")}</option>
                                  <option value="any">{t("collection_rules.conditionMatchAny")}</option>
                                </select>
                              </div>
                            )}
                            {((cond.inventoryKeyMode ?? "single") === "all" || columnOptions.length > 1 || (cond.inventoryColumn && cond.inventoryColumn !== "Value#1")) && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Col.</span>
                                <SuggestField
                                  value={cond.inventoryColumn}
                                  options={columnOptions}
                                  placeholder="Value#1"
                                  onChange={(v) => {
                                    const next = [...conditions];
                                    next[ci] = { ...cond, inventoryColumn: v };
                                    updateBlock(idx, { ...block, conditions: next });
                                  }}
                                  className="max-w-[140px]"
                                />
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Test</span>
                            <select
                              value={cond.operator}
                              onChange={(e) => {
                                const next = [...conditions];
                                next[ci] = { ...cond, operator: e.target.value };
                                updateBlock(idx, { ...block, conditions: next });
                              }}
                              className={`${smallInput} min-w-[160px]`}
                            >
                              {COND_OPERATORS.map((op) => <option key={op.key} value={op.key}>{op.label}</option>)}
                            </select>
                            {!noValue && (
                              <input
                                type="text"
                                value={cond.value}
                                onChange={(e) => {
                                  const next = [...conditions];
                                  next[ci] = { ...cond, value: e.target.value };
                                  updateBlock(idx, { ...block, conditions: next });
                                }}
                                placeholder={t("collection_rules.translationValue")}
                                className={`${smallInput} flex-1 font-mono`}
                              />
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            {conditions.length > 1 && (
                              <button
                                onClick={() => {
                                  setEditingCond(null);
                                  const next = conditions.filter((_, j) => j !== ci);
                                  updateBlock(idx, { ...block, conditions: next });
                                }}
                                className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                                {t("common.delete")}
                              </button>
                            )}
                            <button onClick={() => setEditingCond(null)} className="ml-auto flex items-center gap-1 rounded-md bg-slate-900 dark:bg-white px-3 py-1 text-[11px] font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                              <CheckCircle2 className="h-3 w-3" />
                              OK
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-4 pb-3">
              <ConditionResultEditor
                resultKey={`${idx}`}
                result={block.result}
                tags={tags}
                categories={categories}
                inventoryStructure={inventoryStructure}
                onChange={(result) => updateBlock(idx, { ...block, result })}
                t={t}
              />
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2 pl-2 flex-wrap">
        <button
          onClick={addAlways}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-dashed border-slate-300 dark:border-slate-600 transition-colors"
        >
          <Plus className="h-3 w-3" />
          {t("collection_rules.translationAddAlways")}
        </button>
        <button
          onClick={addElseIf}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-dashed border-slate-300 dark:border-slate-600 transition-colors"
        >
          <Plus className="h-3 w-3" />
          {t("collection_rules.translationAddElseIf")}
        </button>
        {!hasElse && (
          <button
            onClick={addElse}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-dashed border-slate-300 dark:border-slate-600 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t("collection_rules.translationAddElse")}
          </button>
        )}
      </div>
    </div>
  );
}

function ConditionResultEditor({ resultKey, result, tags, categories, inventoryStructure, onChange, t }: {
  resultKey: string;
  result: ConditionResult;
  tags: NodeTagItem[];
  categories: InventoryCategory[];
  inventoryStructure: InventoryStructureCategory[];
  onChange: (r: ConditionResult) => void;
  t: (k: string) => string;
}) {
  const actions = normalizeResult(result);
  const [editingAction, setEditingAction] = useState<string | null>(null);

  const updateAction = (i: number, next: ConditionAction) => {
    onChange(actions.map((a, idx) => idx === i ? next : a));
  };
  const removeAction = (i: number) => {
    const next = actions.filter((_, idx) => idx !== i);
    onChange(next.length === 0 ? null : next);
  };
  const addAction = () => {
    onChange([...actions, emptyAction()]);
    setEditingAction(`${resultKey}-${actions.length}`);
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
          {t("collection_rules.conditionThen")}
        </span>
        <button
          type="button"
          onClick={addAction}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
          title={t("collection_rules.conditionAddAction")}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {actions.length === 0 && (
        <p className="text-xs italic text-slate-400 dark:text-slate-500">
          {t("collection_rules.conditionNoAction")}
        </p>
      )}

      <div className="space-y-2">
        {actions.map((action, i) => {
          const aKey = `${resultKey}-${i}`;
          return (
            <ConditionActionRow
              key={i}
              actionKey={aKey}
              isEditing={editingAction === aKey}
              setEditing={(open) => setEditingAction(open ? aKey : null)}
              action={action}
              tags={tags}
              categories={categories}
              inventoryStructure={inventoryStructure}
              onChange={(next) => updateAction(i, next)}
              onRemove={() => { setEditingAction(null); removeAction(i); }}
              t={t}
            />
          );
        })}
      </div>
    </div>
  );
}

function ConditionActionRow({ action, tags, categories, inventoryStructure, isEditing, setEditing, onChange, onRemove, t }: {
  actionKey: string;
  isEditing: boolean;
  setEditing: (open: boolean) => void;
  action: ConditionAction;
  tags: NodeTagItem[];
  categories: InventoryCategory[];
  inventoryStructure: InventoryStructureCategory[];
  onChange: (a: ConditionAction) => void;
  onRemove: () => void;
  t: (k: string) => string;
}) {
  const inv = action.type === "set_inventory" ? action : null;
  const cat = inv?.categoryId
    ? inventoryStructure.find((c) => c.categoryId === inv.categoryId)
    : null;
  const keyOptions = cat ? Array.from(new Set(cat.entries.map((e) => e.key))).sort() : [];
  const colOptions = (() => {
    if (!cat) return [];
    if (inv?.key) {
      const entry = cat.entries.find((e) => e.key === inv.key);
      if (entry) return Array.from(new Set(entry.columns)).sort();
    }
    const all = new Set<string>();
    cat.entries.forEach((e) => e.columns.forEach((c) => all.add(c)));
    return Array.from(all).sort();
  })();

  const switchType = (next: "set_tag" | "set_inventory") => {
    if (next === "set_tag") {
      onChange({ type: "set_tag", tagId: null });
    } else {
      onChange({ type: "set_inventory", categoryId: null, key: "", column: "Value#1", value: "" });
    }
  };

  if (!isEditing) {
    if (action.type === "set_tag") {
      const tg = tags.find((tt) => tt.id === action.tagId);
      return (
        <div
          className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
          onClick={() => setEditing(true)}
        >
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400">
            TAG
          </span>
          {tg ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0"
              style={{ backgroundColor: `${tg.color}20`, color: tg.color }}
            >
              {tg.name}
            </span>
          ) : (
            <span className="text-xs text-slate-400 italic">{t("collection_rules.conditionSelectTag")}</span>
          )}
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Pencil className="h-3 w-3 text-slate-400" />
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors"
              title={t("collection_rules.conditionRemoveAction")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      );
    }

    const catName = inventoryStructure.find((c) => c.categoryId === action.categoryId)?.categoryName
      ?? categories.find((c) => c.id === action.categoryId)?.name;
    const keyLabel = (action.keyMode ?? "single") === "all"
      ? t("collection_rules.conditionKeyModeAll")
      : (action.key || "?");
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
        onClick={() => setEditing(true)}
      >
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
          INV
        </span>
        <span className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
          {`${catName || "?"} / ${keyLabel}`}
          {action.column && action.column !== "Value#1" ? ` [${action.column}]` : ""}
        </span>
        <span className="text-[10px] font-semibold text-slate-400 uppercase shrink-0">=</span>
        <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 truncate">&quot;{action.value ?? ""}&quot;</span>
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Pencil className="h-3 w-3 text-slate-400" />
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors"
            title={t("collection_rules.conditionRemoveAction")}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-blue-300 dark:border-blue-500/40 bg-white dark:bg-slate-900 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Type</span>
        <select
          value={action.type}
          onChange={(e) => switchType(e.target.value as "set_tag" | "set_inventory")}
          className={`${smallInput} min-w-[200px]`}
        >
          <option value="set_tag">{t("collection_rules.conditionResultTag")}</option>
          <option value="set_inventory">{t("collection_rules.conditionResultInventory")}</option>
        </select>
      </div>

      {action.type === "set_tag" && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Tag</span>
          <select
            value={action.tagId ?? ""}
            onChange={(e) => onChange({ type: "set_tag", tagId: e.target.value ? Number(e.target.value) : null })}
            className={`${smallInput} flex-1`}
          >
            <option value="">{t("collection_rules.conditionSelectTag")}</option>
            {tags.map((tg) => (
              <option key={tg.id} value={tg.id}>{tg.name}</option>
            ))}
          </select>
        </div>
      )}

      {action.type === "set_inventory" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Cat.</span>
              <select
                value={action.categoryId ?? ""}
                onChange={(e) => onChange({ ...action, categoryId: e.target.value ? Number(e.target.value) : null })}
                className={`${smallInput} max-w-[180px]`}
              >
                <option value="">--</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">{t("collection_rules.conditionKey")}</span>
              <select
                value={action.keyMode ?? "single"}
                onChange={(e) => {
                  const next = e.target.value as "single" | "all";
                  onChange({
                    ...action,
                    keyMode: next,
                    key: next === "all" ? "" : action.key,
                  });
                }}
                className={`${smallInput} min-w-[180px]`}
                title={t("collection_rules.conditionKeyMode")}
              >
                <option value="single">{t("collection_rules.conditionKeyModeSingle")}</option>
                <option value="all">{t("collection_rules.conditionKeyModeAll")}</option>
              </select>
              {(action.keyMode ?? "single") === "single" && (
                <SuggestField
                  value={action.key ?? ""}
                  options={keyOptions}
                  placeholder="--"
                  onChange={(v) => onChange({ ...action, key: v })}
                  className="max-w-[180px]"
                />
              )}
            </div>
            {(colOptions.length > 1 || (action.column && action.column !== "Value#1")) && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Col.</span>
                <SuggestField
                  value={action.column ?? "Value#1"}
                  options={colOptions}
                  placeholder="Value#1"
                  onChange={(v) => onChange({ ...action, column: v })}
                  className="max-w-[140px]"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">{t("collection_rules.conditionValue")}</span>
            <input
              type="text"
              value={action.value ?? ""}
              onChange={(e) => onChange({ ...action, value: e.target.value })}
              placeholder={t("collection_rules.conditionValue")}
              className={`${smallInput} flex-1 font-mono`}
            />
          </div>
        </>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-3 w-3" />
          {t("common.delete")}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="ml-auto flex items-center gap-1 rounded-md bg-slate-900 dark:bg-white px-3 py-1 text-[11px] font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <CheckCircle2 className="h-3 w-3" />
          OK
        </button>
      </div>
    </div>
  );
}
