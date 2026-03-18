<?php

namespace App\Controller\Api;

use App\Entity\CompliancePolicy;
use App\Entity\ComplianceRule;
use App\Entity\ComplianceRuleFolder;
use App\Entity\Context;
use App\Entity\InventoryCategory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class CompliancePolicyExportController extends AbstractController
{
    // ─── EXPORT ───────────────────────────────────────────────────────

    #[Route('/api/compliance-policies/{id}/export', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function export(CompliancePolicy $policy, EntityManagerInterface $em): Response
    {
        $ruleRefIndex = 0;
        $ruleRefMap = [];

        // ── Folder tree ──
        $rootFolder = $em->getRepository(ComplianceRuleFolder::class)->findOneBy([
            'policy' => $policy,
            'parent' => null,
        ]);

        $folderData = null;
        if ($rootFolder) {
            $folderData = $this->serializeFolderTree($rootFolder, $em, $ruleRefIndex, $ruleRefMap);
        }

        // ── Extra rules refs ──
        $extraRuleRefs = [];
        foreach ($policy->getExtraRules() as $rule) {
            if (isset($ruleRefMap[$rule->getId()])) {
                $extraRuleRefs[] = $ruleRefMap[$rule->getId()];
            }
        }

        $data = [
            '_format' => 'auditix-compliance-policy-export',
            '_version' => 1,
            '_exportedAt' => (new \DateTimeImmutable())->format('c'),
            'policy' => [
                'name' => $policy->getName(),
                'description' => $policy->getDescription(),
                'enabled' => $policy->isEnabled(),
            ],
            'folder' => $folderData,
            'extraRuleRefs' => $extraRuleRefs,
        ];

        $safeName = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', $policy->getName());
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return new Response($json, Response::HTTP_OK, [
            'Content-Type' => 'application/json',
            'Content-Disposition' => sprintf('attachment; filename="policy-%s.json"', $safeName),
        ]);
    }

    // ─── PREVIEW IMPORT ───────────────────────────────────────────────

    #[Route('/api/compliance-policies/preview-import', methods: ['POST'], priority: 10)]
    public function previewImport(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $file = $request->files->get('file');
        if (!$file) {
            return $this->json(['error' => 'File is required'], Response::HTTP_BAD_REQUEST);
        }

        $json = file_get_contents($file->getPathname());
        $data = json_decode($json, true);
        if (!$data || ($data['_format'] ?? null) !== 'auditix-compliance-policy-export') {
            return $this->json(['error' => 'Invalid export file format'], Response::HTTP_BAD_REQUEST);
        }

        $policyName = $data['policy']['name'] ?? '';
        $existingPolicy = $em->getRepository(CompliancePolicy::class)->findOneBy(['name' => $policyName, 'context' => $context]);

        $ruleCount = 0;
        $folderData = $data['folder'] ?? null;
        if ($folderData) {
            $ruleCount = $this->countRulesInFolder($folderData);
        }

        $categoryNames = [];
        if ($folderData) {
            $this->collectCategoryNames($folderData, $categoryNames);
        }
        $categoryNames = array_unique($categoryNames);

        $categoriesPreview = [];
        foreach ($categoryNames as $catName) {
            $existing = $em->getRepository(InventoryCategory::class)->findOneBy([
                'name' => $catName,
                'context' => $context,
            ]);
            $categoriesPreview[] = [
                'name' => $catName,
                'exists' => $existing !== null,
            ];
        }

        return $this->json([
            'policy' => [
                'name' => $policyName,
                'description' => $data['policy']['description'] ?? null,
                'enabled' => $data['policy']['enabled'] ?? true,
                'exists' => $existingPolicy !== null,
            ],
            'ruleCount' => $ruleCount,
            'extraRuleCount' => count($data['extraRuleRefs'] ?? []),
            'categories' => $categoriesPreview,
            'exportedAt' => $data['_exportedAt'] ?? null,
        ]);
    }

    // ─── IMPORT ───────────────────────────────────────────────────────

    #[Route('/api/compliance-policies/import', methods: ['POST'], priority: 10)]
    public function import(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $file = $request->files->get('file');
        if (!$file) {
            return $this->json(['error' => 'File is required'], Response::HTTP_BAD_REQUEST);
        }

        $json = file_get_contents($file->getPathname());
        $data = json_decode($json, true);
        if (!$data || ($data['_format'] ?? null) !== 'auditix-compliance-policy-export') {
            return $this->json(['error' => 'Invalid export file format'], Response::HTTP_BAD_REQUEST);
        }

        $em->beginTransaction();
        try {
            // ── Phase 1: Create policy ──
            $policy = new CompliancePolicy();
            $policy->setName($data['policy']['name']);
            $policy->setDescription($data['policy']['description'] ?? null);
            $policy->setEnabled($data['policy']['enabled'] ?? true);
            $policy->setContext($context);
            $em->persist($policy);

            // ── Phase 2: Create folder tree + rules ──
            $ruleRefMap = [];
            $folderData = $data['folder'] ?? null;

            if ($folderData) {
                $rootFolder = new ComplianceRuleFolder();
                $rootFolder->setName($policy->getName());
                $rootFolder->setPolicy($policy);
                $rootFolder->setContext($context);
                $em->persist($rootFolder);

                // Import rules in root folder
                foreach ($folderData['rules'] ?? [] as $ruleData) {
                    $rule = $this->createRule($ruleData, $rootFolder, $context, $em);
                    $ruleRefMap[$ruleData['_ref']] = $rule;
                }

                // Import child folders recursively
                $this->importChildFolders($folderData['children'] ?? [], $rootFolder, $context, $em, $ruleRefMap);
            }

            // ── Phase 3: Extra rules associations ──
            foreach ($data['extraRuleRefs'] ?? [] as $ruleRef) {
                if (isset($ruleRefMap[$ruleRef])) {
                    $policy->addExtraRule($ruleRefMap[$ruleRef]);
                }
            }

            $em->flush();
            $em->commit();

            return $this->json([
                'id' => $policy->getId(),
                'name' => $policy->getName(),
                'description' => $policy->getDescription(),
                'enabled' => $policy->isEnabled(),
                'createdAt' => $policy->getCreatedAt()->format('c'),
            ], Response::HTTP_CREATED);

        } catch (\Throwable $e) {
            $em->rollback();
            return $this->json(['error' => 'Import failed: ' . $e->getMessage()], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    // ─── Serialization helpers ────────────────────────────────────────

    private function serializeFolderTree(ComplianceRuleFolder $folder, EntityManagerInterface $em, int &$ruleRefIndex, array &$ruleRefMap): array
    {
        $rules = [];
        foreach ($em->getRepository(ComplianceRule::class)->findBy(['folder' => $folder], ['identifier' => 'ASC', 'name' => 'ASC']) as $rule) {
            $ref = 'rule:' . $ruleRefIndex++;
            $ruleRefMap[$rule->getId()] = $ref;
            $rules[] = $this->serializeRule($rule, $ref);
        }

        $children = [];
        foreach ($em->getRepository(ComplianceRuleFolder::class)->findBy(['parent' => $folder], ['name' => 'ASC']) as $child) {
            $children[] = $this->serializeFolderTree($child, $em, $ruleRefIndex, $ruleRefMap);
        }

        return [
            'name' => $folder->getName(),
            'rules' => $rules,
            'children' => $children,
        ];
    }

    private function serializeRule(ComplianceRule $rule, string $ref): array
    {
        return [
            '_ref' => $ref,
            'identifier' => $rule->getIdentifier(),
            'name' => $rule->getName(),
            'description' => $rule->getDescription(),
            'enabled' => $rule->isEnabled(),
            'sourceType' => $rule->getSourceType(),
            'sourceCategoryName' => $rule->getSourceCategory()?->getName(),
            'sourceKey' => $rule->getSourceKey(),
            'sourceValue' => $rule->getSourceValue(),
            'sourceCommand' => $rule->getSourceCommand(),
            'sourceTag' => $rule->getSourceTag(),
            'sourceRegex' => $rule->getSourceRegex(),
            'sourceResultMode' => $rule->getSourceResultMode(),
            'sourceValueMap' => $rule->getSourceValueMap(),
            'sourceKeyGroup' => $rule->getSourceKeyGroup(),
            'conditionTree' => $rule->getConditionTree(),
            'multiRowMessages' => $rule->getMultiRowMessages(),
        ];
    }

    private function countRulesInFolder(array $folder): int
    {
        $count = count($folder['rules'] ?? []);
        foreach ($folder['children'] ?? [] as $child) {
            $count += $this->countRulesInFolder($child);
        }
        return $count;
    }

    private function collectCategoryNames(array $folder, array &$names): void
    {
        foreach ($folder['rules'] ?? [] as $rule) {
            if (!empty($rule['sourceCategoryName'])) {
                $names[] = $rule['sourceCategoryName'];
            }
        }
        foreach ($folder['children'] ?? [] as $child) {
            $this->collectCategoryNames($child, $names);
        }
    }

    // ─── Import helpers ───────────────────────────────────────────────

    private function createRule(array $data, ComplianceRuleFolder $folder, Context $context, EntityManagerInterface $em): ComplianceRule
    {
        $rule = new ComplianceRule();
        $rule->setIdentifier($data['identifier'] ?? null);
        $rule->setName($data['name']);
        $rule->setDescription($data['description'] ?? null);
        $rule->setEnabled($data['enabled'] ?? true);
        $rule->setSourceType($data['sourceType'] ?? ComplianceRule::SOURCE_NONE);
        $rule->setSourceKey($data['sourceKey'] ?? null);
        $rule->setSourceValue($data['sourceValue'] ?? null);
        $rule->setSourceCommand($data['sourceCommand'] ?? null);
        $rule->setSourceTag($data['sourceTag'] ?? null);
        $rule->setSourceRegex($data['sourceRegex'] ?? null);
        $rule->setSourceResultMode($data['sourceResultMode'] ?? null);
        $rule->setSourceValueMap($data['sourceValueMap'] ?? null);
        $rule->setSourceKeyGroup($data['sourceKeyGroup'] ?? null);
        $rule->setConditionTree($data['conditionTree'] ?? null);
        $rule->setMultiRowMessages($data['multiRowMessages'] ?? null);
        $rule->setFolder($folder);
        $rule->setContext($context);

        if (!empty($data['sourceCategoryName'])) {
            $category = $em->getRepository(InventoryCategory::class)->findOneBy([
                'name' => $data['sourceCategoryName'],
                'context' => $context,
            ]);
            if (!$category) {
                $category = new InventoryCategory();
                $category->setName($data['sourceCategoryName']);
                $category->setContext($context);
                $em->persist($category);
            }
            $rule->setSourceCategory($category);
        }

        $em->persist($rule);
        return $rule;
    }

    private function importChildFolders(array $children, ComplianceRuleFolder $parent, Context $context, EntityManagerInterface $em, array &$ruleRefMap): void
    {
        foreach ($children as $childData) {
            $folder = new ComplianceRuleFolder();
            $folder->setName($childData['name']);
            $folder->setParent($parent);
            $folder->setContext($context);
            $em->persist($folder);

            foreach ($childData['rules'] ?? [] as $ruleData) {
                $rule = $this->createRule($ruleData, $folder, $context, $em);
                $ruleRefMap[$ruleData['_ref']] = $rule;
            }

            $this->importChildFolders($childData['children'] ?? [], $folder, $context, $em, $ruleRefMap);
        }
    }
}
