<?php

namespace App\Service;

use App\Entity\Context;
use App\Entity\Cve;
use App\Entity\CveDeviceModel;
use App\Entity\DeviceModel;
use App\Entity\Node;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

class CveSyncService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly NvdApiClient $nvdClient,
        private readonly LoggerInterface $logger,
    ) {}

    /**
     * Sync CVEs for all (manufacturer, model) pairs used in the context.
     * @return array{synced: int, new: int, updated: int, errors: string[]}
     */
    public function syncContext(Context $context): array
    {
        $apiKey = $context->getNvdApiKey();
        $summary = ['synced' => 0, 'new' => 0, 'updated' => 0, 'errors' => []];

        // Find all distinct DeviceModels used by nodes in this context
        $models = $this->em->createQuery(
            'SELECT DISTINCT dm FROM App\Entity\DeviceModel dm
             JOIN App\Entity\Node n WITH n.model = dm
             WHERE n.context = :ctx AND dm.manufacturer IS NOT NULL'
        )->setParameter('ctx', $context)->getResult();

        foreach ($models as $model) {
            try {
                $result = $this->syncDeviceModel($model, $context, $apiKey);
                $summary['synced'] += $result['synced'];
                $summary['new'] += $result['new'];
                $summary['updated'] += $result['updated'];
            } catch (\Throwable $e) {
                $error = sprintf('%s %s: %s', $model->getManufacturer()->getName(), $model->getName(), $e->getMessage());
                $summary['errors'][] = $error;
                $this->logger->error('CVE sync failed for model', [
                    'model' => $model->getName(),
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $summary;
    }

    /**
     * Sync CVEs for a specific DeviceModel.
     * Removes old links for this model, then searches NVD and accumulates results.
     * Cleans up orphaned CVEs afterwards.
     * @return array{synced: int, new: int, updated: int}
     */
    public function syncDeviceModel(DeviceModel $model, Context $context, ?string $apiKey = null): array
    {
        // Remove existing links for this model so stale CVEs are cleaned up
        $this->em->createQuery(
            'DELETE FROM App\Entity\CveDeviceModel cdm WHERE cdm.deviceModel = :model'
        )->setParameter('model', $model)->execute();

        $keywords = $this->buildSearchKeywords($model);
        $stats = ['synced' => 0, 'new' => 0, 'updated' => 0];
        $seenCveIds = [];

        foreach ($keywords as $keyword) {
            $this->logger->info('Syncing CVEs for keyword: ' . $keyword);
            $cveDataList = $this->nvdClient->searchAllByKeyword($keyword, $apiKey);
            $this->logger->info(sprintf('Found %d CVEs for keyword "%s"', count($cveDataList), $keyword));

            foreach ($cveDataList as $cveData) {
                if (isset($seenCveIds[$cveData['cveId']])) {
                    continue;
                }
                $seenCveIds[$cveData['cveId']] = true;

                $isNew = $this->upsertCve($cveData, $model, $context);
                $stats['synced']++;
                if ($isNew) {
                    $stats['new']++;
                } else {
                    $stats['updated']++;
                }

                if ($stats['synced'] % 50 === 0) {
                    $this->em->flush();
                }
            }
        }

        $this->em->flush();

        // Clean up orphaned CVEs (no links to any model)
        $this->em->getConnection()->executeStatement(
            'DELETE FROM cve WHERE context_id = ? AND id NOT IN (SELECT cve_id FROM cve_device_model)',
            [$context->getId()]
        );

        return $stats;
    }

    /**
     * Insert or update a CVE, and ensure it's linked to the DeviceModel.
     * @return bool true if new, false if updated
     */
    private function upsertCve(array $data, DeviceModel $model, Context $context): bool
    {
        $cve = $this->em->getRepository(Cve::class)->findOneBy([
            'context' => $context,
            'cveId' => $data['cveId'],
        ]);

        $isNew = false;

        if (!$cve) {
            $cve = new Cve();
            $cve->setContext($context);
            $cve->setCveId($data['cveId']);
            $this->em->persist($cve);
            $isNew = true;
        }

        $cve->setDescription($data['description'] ?? null);
        $cve->setCvssScore($data['cvssScore'] ?? null);
        $cve->setCvssVector($data['cvssVector'] ?? null);
        $cve->setSeverity($data['severity'] ?? 'none');
        $cve->setVersionStartIncluding($data['versionStartIncluding'] ?? null);
        $cve->setVersionEndExcluding($data['versionEndExcluding'] ?? null);
        $cve->setVersionEndIncluding($data['versionEndIncluding'] ?? null);
        $cve->setSyncedAt(new \DateTimeImmutable());

        if (isset($data['publishedAt'])) {
            try {
                $cve->setPublishedAt(new \DateTimeImmutable($data['publishedAt']));
            } catch (\Exception) {}
        }
        if (isset($data['modifiedAt'])) {
            try {
                $cve->setModifiedAt(new \DateTimeImmutable($data['modifiedAt']));
            } catch (\Exception) {}
        }

        // Ensure link to DeviceModel exists
        $existing = $this->em->getRepository(CveDeviceModel::class)->findOneBy([
            'cve' => $cve,
            'deviceModel' => $model,
        ]);

        if (!$existing) {
            $link = new CveDeviceModel();
            $link->setCve($cve);
            $link->setDeviceModel($model);
            $this->em->persist($link);
        }

        return $isNew;
    }

    /**
     * Build a list of search keywords to try, from most specific to most broad.
     * If the model has an explicit nvdKeyword, use only that.
     * Otherwise, auto-generate keywords from vendor + model names.
     * @return string[]
     */
    private function buildSearchKeywords(DeviceModel $model): array
    {
        // User-configured keyword takes priority
        $explicit = $model->getNvdKeyword();
        if ($explicit) {
            return [$explicit];
        }

        $vendor = $model->getManufacturer()?->getName() ?? '';
        $modelName = $model->getName() ?? '';

        // Clean vendor: strip legal suffixes
        $cleanVendor = preg_replace('/\b(Inc\.?|Corp\.?|Systems|Ltd\.?|Co\.?|LLC|GmbH|S\.?A\.?)\b/i', '', $vendor);
        $cleanVendor = trim($cleanVendor);

        // Clean model: strip parentheses content, generic words, slashes
        $cleanModel = preg_replace('/\(.*?\)/', '', $modelName);
        $cleanModel = preg_replace('/\b(all|series|family|line|generation|gen)\b/i', '', $cleanModel);
        $cleanModel = preg_replace('/[\/\\\]/', ' ', $cleanModel);
        $cleanModel = preg_replace('/\s+/', ' ', $cleanModel);
        $cleanModel = trim($cleanModel);

        $keywords = [];

        // Strategy 1: vendor + cleaned model (e.g. "Extreme Networks Fabric Engine")
        if ($cleanVendor && $cleanModel) {
            $keywords[] = $cleanVendor . ' ' . $cleanModel;
        }

        // Strategy 2: vendor only (e.g. "Extreme Networks")
        if ($cleanVendor) {
            $keywords[] = $cleanVendor;
        }

        return array_unique(array_filter($keywords));
    }
}
