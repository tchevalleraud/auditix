<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\MailReport;
use App\Entity\MailServer;
use App\Entity\Node;
use App\Entity\ReportTheme;
use App\Entity\User;
use App\Message\SendMailReportMessage;
use App\Service\MailReportService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/mail-reports')]
class MailReportController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MailReportService $service,
    ) {
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $contextId = $request->query->get('context');
        if (!$contextId) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $context = $this->em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }

        $reports = $this->service->listByContext((int) $contextId);
        return $this->json(array_map($this->serializeShort(...), $reports));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->get('context');

        if (!is_array($data) || empty($data['name'])) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }
        $context = $this->em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }
        $defaultTheme = $this->em->getRepository(ReportTheme::class)->findOneBy(['isDefault' => true]);
        if (!$defaultTheme) {
            return $this->json(['error' => 'No default theme found'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $report = new MailReport();
        $report->setName(trim((string) $data['name']));
        $report->setContext($context);
        $report->setTheme($defaultTheme);
        $report->setSubject((string) ($data['subject'] ?? $data['name']));
        if (isset($data['locale']) && is_string($data['locale'])) {
            $report->setLocale($data['locale']);
        }
        $report->setBlocks($this->defaultBlocks());

        $this->service->save($report);
        return $this->json($this->serialize($report), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function show(int $id): JsonResponse
    {
        $report = $this->service->findById($id);
        if ($report === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        return $this->json($this->serialize($report));
    }

    #[Route('/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $report = $this->service->findById($id);
        if ($report === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid body'], Response::HTTP_BAD_REQUEST);
        }

        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name !== '') $report->setName($name);
        }
        if (array_key_exists('description', $data)) {
            $report->setDescription($data['description'] !== null ? (string) $data['description'] : null);
        }
        if (array_key_exists('subject', $data)) {
            $report->setSubject((string) $data['subject']);
        }
        if (array_key_exists('preheader', $data)) {
            $report->setPreheader($data['preheader'] !== null ? (string) $data['preheader'] : null);
        }
        if (isset($data['locale']) && is_string($data['locale'])) {
            $report->setLocale($data['locale']);
        }
        if (isset($data['type']) && in_array($data['type'], [MailReport::TYPE_GENERAL, MailReport::TYPE_NODE], true)) {
            $report->setType($data['type']);
        }
        if (array_key_exists('blocks', $data) && is_array($data['blocks'])) {
            $report->setBlocks($data['blocks']);
        }
        if (array_key_exists('themeId', $data) && $data['themeId']) {
            $theme = $this->em->getRepository(ReportTheme::class)->find($data['themeId']);
            if ($theme) $report->setTheme($theme);
        }
        if (array_key_exists('mailServerId', $data)) {
            if ($data['mailServerId'] === null) {
                $report->setMailServer(null);
            } else {
                $server = $this->em->getRepository(MailServer::class)->find($data['mailServerId']);
                if ($server) $report->setMailServer($server);
            }
        }
        if (array_key_exists('recipientUserIds', $data)) {
            $ids = is_array($data['recipientUserIds']) ? array_values(array_map('intval', $data['recipientUserIds'])) : null;
            $report->setRecipientUserIds($ids);
        }
        if (array_key_exists('recipientExternalEmails', $data)) {
            $emails = is_array($data['recipientExternalEmails']) ? array_values(array_filter(array_map('trim', array_map('strval', $data['recipientExternalEmails'])))) : null;
            $report->setRecipientExternalEmails($emails);
        }
        if (array_key_exists('nodeIds', $data) && is_array($data['nodeIds'])) {
            foreach ($report->getNodes()->toArray() as $existing) {
                $report->removeNode($existing);
            }
            foreach ($data['nodeIds'] as $nodeId) {
                $node = $this->em->getRepository(Node::class)->find($nodeId);
                if ($node) $report->addNode($node);
            }
        }

        $this->service->save($report);
        return $this->json($this->serialize($report));
    }

    #[Route('/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function delete(int $id): JsonResponse
    {
        $report = $this->service->findById($id);
        if ($report === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $this->service->delete($report);
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/preview', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function preview(int $id): Response
    {
        $report = $this->service->findById($id);
        if ($report === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $html = $this->service->renderHtml($report);
        return new Response($html, 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }

    #[Route('/preview', methods: ['POST'])]
    public function previewAdHoc(Request $request): Response
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid body'], Response::HTTP_BAD_REQUEST);
        }
        $contextId = $request->query->get('context');
        $context = $this->em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }
        $themeId = $data['themeId'] ?? null;
        $theme = $themeId ? $this->em->getRepository(ReportTheme::class)->find($themeId) : null;
        if (!$theme) {
            $theme = $this->em->getRepository(ReportTheme::class)->findOneBy(['isDefault' => true]);
        }
        if (!$theme) {
            return $this->json(['error' => 'No theme'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $report = new MailReport();
        $report->setName('preview');
        $report->setContext($context);
        $report->setTheme($theme);
        $report->setSubject((string) ($data['subject'] ?? ''));
        $report->setPreheader($data['preheader'] ?? null);
        $report->setBlocks(is_array($data['blocks'] ?? null) ? $data['blocks'] : []);

        $html = $this->service->renderHtml($report);
        return new Response($html, 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }

    #[Route('/{id}/send', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function send(int $id, MessageBusInterface $bus): JsonResponse
    {
        $report = $this->service->findById($id);
        if ($report === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        if ($report->getMailServer() === null) {
            return $this->json(['error' => 'No mail server configured'], Response::HTTP_BAD_REQUEST);
        }
        if ($report->getSendingStatus() === MailReport::STATUS_SENDING) {
            return $this->json(['error' => 'Send already in progress'], Response::HTTP_CONFLICT);
        }

        $report->setSendingStatus(MailReport::STATUS_PENDING);
        $this->em->flush();

        $bus->dispatch(new SendMailReportMessage($report->getId()));
        return $this->json($this->serialize($report));
    }

    #[Route('/nodes', methods: ['GET'])]
    public function availableNodes(Request $request): JsonResponse
    {
        $contextId = $request->query->get('context');
        $context = $this->em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }
        $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context], ['name' => 'ASC']);
        return $this->json(array_map(static fn (Node $n) => [
            'id' => $n->getId(),
            'name' => $n->getName(),
            'hostname' => $n->getHostname(),
            'ipAddress' => $n->getIpAddress(),
        ], $nodes));
    }

    #[Route('/mail-servers', methods: ['GET'])]
    public function availableMailServers(): JsonResponse
    {
        $servers = $this->em->getRepository(MailServer::class)->findBy([], ['name' => 'ASC']);
        return $this->json(array_map(static fn (MailServer $s) => [
            'id' => $s->getId(),
            'name' => $s->getName(),
            'enabled' => $s->isEnabled(),
        ], $servers));
    }

    #[Route('/recipients/users', methods: ['GET'])]
    public function recipientUsers(Request $request): JsonResponse
    {
        $contextId = $request->query->get('context');
        $context = $this->em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }

        $rows = [];
        foreach ($context->getUsers() as $user) {
            /** @var User $user */
            $rows[] = [
                'id' => $user->getId(),
                'username' => $user->getUserIdentifier(),
                'firstName' => $user->getFirstName(),
                'lastName' => $user->getLastName(),
                'email' => $this->service->extractUserEmail($user),
            ];
        }
        return $this->json($rows);
    }

    private function serializeShort(MailReport $r): array
    {
        return [
            'id' => $r->getId(),
            'name' => $r->getName(),
            'description' => $r->getDescription(),
            'subject' => $r->getSubject(),
            'type' => $r->getType(),
            'sendingStatus' => $r->getSendingStatus(),
            'lastSentAt' => $r->getLastSentAt()?->format('c'),
            'lastError' => $r->getLastError(),
            'createdAt' => $r->getCreatedAt()->format('c'),
            'updatedAt' => $r->getUpdatedAt()?->format('c'),
            'theme' => ['id' => $r->getTheme()->getId(), 'name' => $r->getTheme()->getName()],
            'mailServer' => $r->getMailServer() ? ['id' => $r->getMailServer()->getId(), 'name' => $r->getMailServer()->getName()] : null,
        ];
    }

    private function serialize(MailReport $r): array
    {
        $nodes = [];
        foreach ($r->getNodes() as $node) {
            $nodes[] = ['id' => $node->getId(), 'name' => $node->getName(), 'ipAddress' => $node->getIpAddress()];
        }
        return array_merge($this->serializeShort($r), [
            'preheader' => $r->getPreheader(),
            'locale' => $r->getLocale(),
            'blocks' => $r->getBlocks(),
            'recipientUserIds' => $r->getRecipientUserIds() ?? [],
            'recipientExternalEmails' => $r->getRecipientExternalEmails() ?? [],
            'nodes' => $nodes,
            'sendHistory' => $r->getSendHistory() ?? [],
        ]);
    }

    private function defaultBlocks(): array
    {
        return [
            ['type' => 'header', 'title' => 'Network compliance report', 'subtitle' => 'Weekly summary', 'align' => 'center', 'background' => '#1e293b', 'color' => '#ffffff'],
            ['type' => 'kpi_tiles'],
            ['type' => 'compliance_score', 'title' => 'Overall compliance'],
            ['type' => 'top_nodes', 'direction' => 'best', 'limit' => 5, 'title' => 'Top compliant nodes'],
            ['type' => 'top_nodes', 'direction' => 'worst', 'limit' => 5, 'title' => 'Least compliant nodes'],
            ['type' => 'divider'],
            ['type' => 'paragraph', 'text' => 'You can edit this report in Auditix.'],
            ['type' => 'footer', 'text' => 'Sent by Auditix · Do not reply to this email.', 'align' => 'center'],
        ];
    }
}
