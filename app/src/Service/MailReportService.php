<?php

namespace App\Service;

use App\Entity\MailReport;
use App\Entity\MailServer;
use App\Entity\Node;
use App\Entity\ReportTheme;
use App\Entity\User;
use App\Repository\MailReportRepository;
use App\Service\SystemUpdateScoreCalculator;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mailer\Mailer;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

class MailReportService
{
    public function __construct(
        private readonly MailReportRepository $repository,
        private readonly EntityManagerInterface $em,
        private readonly MailServerService $mailServerService,
        private readonly SystemUpdateScoreCalculator $systemUpdateScoreCalculator,
    ) {
    }

    /** @return list<MailReport> */
    public function listByContext(int $contextId): array
    {
        $context = $this->em->getRepository(\App\Entity\Context::class)->find($contextId);
        if ($context === null) return [];
        return $this->repository->findByContext($context);
    }

    public function findById(int $id): ?MailReport
    {
        return $this->repository->find($id);
    }

    public function save(MailReport $report): void
    {
        $report->setUpdatedAt(new \DateTimeImmutable());
        if ($report->getId() === null) {
            $this->em->persist($report);
        }
        $this->em->flush();
    }

    public function delete(MailReport $report): void
    {
        $this->em->remove($report);
        $this->em->flush();
    }

    /** Render the mail HTML. */
    public function renderHtml(MailReport $report): string
    {
        $theme = $this->resolveMailStyles($report->getTheme());
        $blocksHtml = '';
        foreach ($report->getBlocks() as $block) {
            $blocksHtml .= $this->renderBlock($block, $theme, $report);
        }

        $bodyBg = $this->color($theme['bodyBg'] ?? '#f4f6f8');
        $containerBg = $this->color($theme['containerBg'] ?? '#ffffff');
        $containerWidth = (int) ($theme['containerWidth'] ?? 600);
        $fontFamily = $theme['fontFamily'] ?? 'Arial, Helvetica, sans-serif';
        $fontSize = (int) ($theme['fontSize'] ?? 14);
        $textColor = $this->color($theme['textColor'] ?? '#1e293b');
        $subject = $this->esc($report->getSubject());
        $preheader = $this->esc($report->getPreheader() ?? '');

        return <<<HTML
<!DOCTYPE html>
<html lang="{$report->getLocale()}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{$subject}</title>
</head>
<body style="margin:0;padding:0;background:{$bodyBg};font-family:{$fontFamily};font-size:{$fontSize}px;color:{$textColor};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:{$bodyBg};">{$preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{$bodyBg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="{$containerWidth}" cellpadding="0" cellspacing="0" border="0" style="background:{$containerBg};max-width:{$containerWidth}px;width:100%;border-radius:8px;overflow:hidden;">
{$blocksHtml}
</table>
</td></tr>
</table>
</body>
</html>
HTML;
    }

    /** Send the mail report (synchronously). Returns ['recipients' => [...], 'count' => N]. */
    public function send(MailReport $report): array
    {
        $server = $report->getMailServer();
        if (!$server instanceof MailServer) {
            throw new \RuntimeException('No mail server configured for this report.');
        }
        if (!$server->isEnabled()) {
            throw new \RuntimeException('The mail server is disabled.');
        }

        $recipients = $this->resolveRecipients($report);
        if (empty($recipients)) {
            throw new \RuntimeException('No recipient resolved for this report.');
        }

        $transport = $this->mailServerService->createTransport($server);
        $mailer = new Mailer($transport);

        $from = $server->getFromName()
            ? new Address((string) $server->getFromEmail(), (string) $server->getFromName())
            : new Address((string) $server->getFromEmail());

        $html = $this->renderHtml($report);
        $textFallback = strip_tags(preg_replace('/<style[\s\S]*?<\/style>/i', '', $html) ?? '');
        $subject = $report->getSubject() !== '' ? $report->getSubject() : $report->getName();
        $mode = $server->getAddressingMode();

        $build = function () use ($from, $subject, $html, $textFallback): Email {
            return (new Email())
                ->from($from)
                ->subject($subject)
                ->html($html)
                ->text($textFallback);
        };

        if ($mode === MailServer::ADDRESSING_MAIL_MERGE) {
            foreach ($recipients as $rcpt) {
                $email = $build();
                $email->addTo($rcpt);
                $mailer->send($email);
            }
        } elseif ($mode === MailServer::ADDRESSING_BCC) {
            $email = $build();
            $email->to($from);
            foreach ($recipients as $rcpt) {
                $email->addBcc($rcpt);
            }
            $mailer->send($email);
        } else {
            $email = $build();
            foreach ($recipients as $rcpt) {
                $email->addTo($rcpt);
            }
            $mailer->send($email);
        }

        $now = new \DateTimeImmutable();
        $history = $report->getSendHistory() ?? [];
        $history[] = [
            'at' => $now->format(\DateTimeInterface::ATOM),
            'recipients' => $recipients,
            'count' => count($recipients),
            'status' => 'sent',
            'mode' => $mode,
        ];
        if (count($history) > 50) {
            $history = array_slice($history, -50);
        }

        $report->setSendHistory($history);
        $report->setLastSentAt($now);
        $report->setSendingStatus(MailReport::STATUS_SENT);
        $report->setLastError(null);
        $this->em->flush();

        return ['recipients' => $recipients, 'count' => count($recipients)];
    }

    /** Resolve final recipient list (context users + external emails). */
    public function resolveRecipients(MailReport $report): array
    {
        $emails = [];

        $userIds = $report->getRecipientUserIds() ?? [];
        if (!empty($userIds)) {
            $users = $this->em->getRepository(User::class)->findBy(['id' => $userIds]);
            foreach ($users as $user) {
                $email = $this->extractUserEmail($user);
                if ($email !== null) {
                    $emails[] = $email;
                }
            }
        }

        foreach ($report->getRecipientExternalEmails() ?? [] as $external) {
            $external = trim((string) $external);
            if ($external !== '' && filter_var($external, FILTER_VALIDATE_EMAIL)) {
                $emails[] = $external;
            }
        }

        return array_values(array_unique($emails));
    }

    public function extractUserEmail(User $user): ?string
    {
        $claims = method_exists($user, 'getOidcClaims') ? $user->getOidcClaims() : null;
        if (is_array($claims) && isset($claims['email']) && filter_var($claims['email'], FILTER_VALIDATE_EMAIL)) {
            return (string) $claims['email'];
        }
        $username = $user->getUserIdentifier();
        if (filter_var($username, FILTER_VALIDATE_EMAIL)) {
            return $username;
        }
        return null;
    }

    private function resolveMailStyles(ReportTheme $theme): array
    {
        $styles = $theme->getStyles();
        return $styles['mail'] ?? ReportTheme::DEFAULT_STYLES['mail'];
    }

    private function renderBlock(array $block, array $theme, MailReport $report): string
    {
        $type = (string) ($block['type'] ?? '');
        return match ($type) {
            'header' => $this->blockHeader($block, $theme),
            'heading' => $this->blockHeading($block, $theme),
            'paragraph' => $this->blockParagraph($block, $theme),
            'image' => $this->blockImage($block),
            'button' => $this->blockButton($block, $theme),
            'divider' => $this->blockDivider($theme),
            'spacer' => $this->blockSpacer($block),
            'columns' => $this->blockColumns($block, $theme, $report),
            'compliance_score' => $this->blockComplianceScore($block, $theme, $report),
            'top_nodes' => $this->blockTopNodes($block, $theme, $report),
            'kpi_tiles' => $this->blockKpiTiles($block, $theme, $report),
            'action_list' => $this->blockActionList($block, $theme),
            'footer' => $this->blockFooter($block, $theme),
            'node_detail' => $this->blockNodeDetail($block, $theme, $report),
            'policy_ranking' => $this->blockPolicyRanking($block, $theme, $report),
            'recent_cves' => $this->blockRecentCves($block, $theme, $report),
            'cve_distribution' => $this->blockCveDistribution($block, $theme, $report),
            'system_updates' => $this->blockSystemUpdates($block, $theme, $report),
            default => '',
        };
    }

    private function blockHeader(array $b, array $theme): string
    {
        $title = $this->esc((string) ($b['title'] ?? ''));
        $subtitle = $this->esc((string) ($b['subtitle'] ?? ''));
        $logo = (string) ($b['logoUrl'] ?? '');
        $bg = $this->color($b['background'] ?? ($theme['headerBg'] ?? '#1e293b'));
        $color = $this->color($b['color'] ?? '#ffffff');
        $align = $this->align($b['align'] ?? 'center');

        if ($logo !== '') {
            $url = $this->esc($logo);
            $logoHtml = '<img src="' . $url . '" alt="" style="display:block;max-height:48px;margin:0 auto 12px;">';
        } else {
            $logoHtml = $this->renderDefaultBrand($color);
        }
        $subHtml = $subtitle !== '' ? '<div style="opacity:0.85;font-size:14px;margin-top:6px;">' . $subtitle . '</div>' : '';

        return <<<HTML
<tr><td style="background:{$bg};color:{$color};padding:32px 24px;text-align:{$align};">
{$logoHtml}
<div style="font-size:24px;font-weight:700;line-height:1.2;">{$title}</div>
{$subHtml}
</td></tr>
HTML;
    }

    private function renderDefaultBrand(string $color): string
    {
        $stroke = $this->esc($color);
        return <<<HTML
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 14px;">
<tr>
<td valign="middle" style="padding-right:8px;line-height:0;">
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="{$stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
<path d="m9 12 2 2 4-4"/>
</svg>
</td>
<td valign="middle" style="font-size:18px;font-weight:700;letter-spacing:0.3px;color:{$stroke};font-family:Arial,Helvetica,sans-serif;">Auditix</td>
</tr>
</table>
HTML;
    }

    private function blockHeading(array $b, array $theme): string
    {
        $level = max(1, min(4, (int) ($b['level'] ?? 2)));
        $sizes = [1 => 26, 2 => 22, 3 => 18, 4 => 16];
        $size = $sizes[$level];
        $text = $this->esc((string) ($b['text'] ?? ''));
        $color = $this->color($b['color'] ?? ($theme['textColor'] ?? '#1e293b'));
        $align = $this->align($b['align'] ?? 'left');
        return <<<HTML
<tr><td style="padding:16px 24px 4px;">
<div style="font-size:{$size}px;font-weight:700;color:{$color};line-height:1.3;text-align:{$align};">{$text}</div>
</td></tr>
HTML;
    }

    private function blockParagraph(array $b, array $theme): string
    {
        $text = nl2br($this->esc((string) ($b['text'] ?? '')));
        $color = $this->color($b['color'] ?? ($theme['textColor'] ?? '#1e293b'));
        $align = $this->align($b['align'] ?? 'left');
        $size = (int) ($b['size'] ?? ($theme['fontSize'] ?? 14));
        return <<<HTML
<tr><td style="padding:8px 24px;">
<div style="font-size:{$size}px;line-height:1.6;color:{$color};text-align:{$align};">{$text}</div>
</td></tr>
HTML;
    }

    private function blockImage(array $b): string
    {
        $src = $this->esc((string) ($b['src'] ?? ''));
        $alt = $this->esc((string) ($b['alt'] ?? ''));
        $width = isset($b['width']) ? 'max-width:' . (int) $b['width'] . 'px;' : 'max-width:100%;';
        $align = $this->align($b['align'] ?? 'center');
        if ($src === '') return '';
        return <<<HTML
<tr><td style="padding:12px 24px;text-align:{$align};">
<img src="{$src}" alt="{$alt}" style="display:inline-block;{$width}height:auto;border:0;">
</td></tr>
HTML;
    }

    private function blockButton(array $b, array $theme): string
    {
        $label = $this->esc((string) ($b['label'] ?? 'Click here'));
        $href = $this->esc((string) ($b['href'] ?? '#'));
        $btn = $theme['button'] ?? [];
        $bg = $this->color($b['bg'] ?? ($btn['bg'] ?? '#3b82f6'));
        $color = $this->color($b['color'] ?? ($btn['color'] ?? '#ffffff'));
        $radius = (int) ($btn['radius'] ?? 6);
        $py = (int) ($btn['paddingY'] ?? 12);
        $px = (int) ($btn['paddingX'] ?? 24);
        $align = $this->align($b['align'] ?? 'center');
        return <<<HTML
<tr><td style="padding:16px 24px;text-align:{$align};">
<a href="{$href}" target="_blank" style="display:inline-block;background:{$bg};color:{$color};text-decoration:none;font-weight:600;padding:{$py}px {$px}px;border-radius:{$radius}px;font-size:15px;">{$label}</a>
</td></tr>
HTML;
    }

    private function blockDivider(array $theme): string
    {
        $c = $this->color($theme['dividerColor'] ?? '#e2e8f0');
        return <<<HTML
<tr><td style="padding:8px 24px;">
<div style="border-top:1px solid {$c};font-size:0;line-height:0;">&nbsp;</div>
</td></tr>
HTML;
    }

    private function blockSpacer(array $b): string
    {
        $h = max(4, min(120, (int) ($b['height'] ?? 16)));
        return <<<HTML
<tr><td style="height:{$h}px;line-height:{$h}px;font-size:0;">&nbsp;</td></tr>
HTML;
    }

    private function blockColumns(array $b, array $theme, MailReport $report): string
    {
        $cols = $b['columns'] ?? [];
        if (!is_array($cols) || count($cols) === 0) return '';
        $count = max(2, min(3, count($cols)));
        $width = (int) (100 / $count);

        $cells = '';
        foreach ($cols as $col) {
            $colBlocks = is_array($col['blocks'] ?? null) ? $col['blocks'] : [];
            $inner = '';
            foreach ($colBlocks as $cb) {
                $inner .= $this->renderInnerBlock($cb, $theme, $report);
            }
            $cells .= '<td valign="top" style="width:' . $width . '%;padding:8px;">' . $inner . '</td>';
        }
        return <<<HTML
<tr><td style="padding:8px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>{$cells}</tr>
</table>
</td></tr>
HTML;
    }

    private function renderInnerBlock(array $block, array $theme, MailReport $report): string
    {
        $type = (string) ($block['type'] ?? '');
        return match ($type) {
            'heading' => $this->innerHeading($block, $theme),
            'paragraph' => $this->innerParagraph($block, $theme),
            'image' => $this->innerImage($block),
            'kpi' => $this->innerKpi($block, $theme),
            'button' => $this->innerButton($block, $theme),
            default => '',
        };
    }

    private function innerHeading(array $b, array $theme): string
    {
        $level = max(2, min(4, (int) ($b['level'] ?? 3)));
        $sizes = [2 => 20, 3 => 17, 4 => 15];
        $size = $sizes[$level];
        $text = $this->esc((string) ($b['text'] ?? ''));
        $color = $this->color($b['color'] ?? ($theme['textColor'] ?? '#1e293b'));
        return '<div style="font-size:' . $size . 'px;font-weight:700;color:' . $color . ';margin:0 0 8px;line-height:1.3;">' . $text . '</div>';
    }

    private function innerParagraph(array $b, array $theme): string
    {
        $text = nl2br($this->esc((string) ($b['text'] ?? '')));
        $color = $this->color($b['color'] ?? ($theme['textColor'] ?? '#1e293b'));
        return '<div style="font-size:14px;line-height:1.6;color:' . $color . ';margin:0 0 8px;">' . $text . '</div>';
    }

    private function innerImage(array $b): string
    {
        $src = $this->esc((string) ($b['src'] ?? ''));
        if ($src === '') return '';
        return '<img src="' . $src . '" alt="" style="display:block;max-width:100%;height:auto;margin:0 0 8px;">';
    }

    private function innerKpi(array $b, array $theme): string
    {
        $label = $this->esc((string) ($b['label'] ?? ''));
        $value = $this->esc((string) ($b['value'] ?? ''));
        $card = $theme['card'] ?? [];
        $bg = $this->color($card['bg'] ?? '#f8fafc');
        $border = $this->color($card['borderColor'] ?? '#e2e8f0');
        $radius = (int) ($card['radius'] ?? 8);
        $accent = $this->color($b['accent'] ?? ($theme['linkColor'] ?? '#3b82f6'));
        return <<<HTML
<div style="background:{$bg};border:1px solid {$border};border-radius:{$radius}px;padding:14px;text-align:center;">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:4px;">{$label}</div>
<div style="font-size:24px;font-weight:700;color:{$accent};line-height:1;">{$value}</div>
</div>
HTML;
    }

    private function innerButton(array $b, array $theme): string
    {
        $label = $this->esc((string) ($b['label'] ?? 'Click here'));
        $href = $this->esc((string) ($b['href'] ?? '#'));
        $btn = $theme['button'] ?? [];
        $bg = $this->color($btn['bg'] ?? '#3b82f6');
        $color = $this->color($btn['color'] ?? '#ffffff');
        $radius = (int) ($btn['radius'] ?? 6);
        return '<a href="' . $href . '" target="_blank" style="display:inline-block;background:' . $bg . ';color:' . $color . ';text-decoration:none;font-weight:600;padding:10px 18px;border-radius:' . $radius . 'px;font-size:14px;">' . $label . '</a>';
    }

    private function blockComplianceScore(array $b, array $theme, MailReport $report): string
    {
        $stats = $this->computeContextComplianceStats($report);
        $score = $stats['percent'];
        $compliant = $stats['compliant'];
        $total = $stats['total'];
        $colors = $theme['compliance'] ?? [];
        $color = $this->color(
            $score >= 80 ? ($colors['goodColor'] ?? '#16a34a')
            : ($score >= 50 ? ($colors['warnColor'] ?? '#f59e0b') : ($colors['badColor'] ?? '#dc2626'))
        );
        $title = $this->esc((string) ($b['title'] ?? 'Compliance level'));
        $rounded = (int) round($score);

        return <<<HTML
<tr><td style="padding:12px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
<tr><td style="padding:20px;text-align:center;">
<div style="font-size:13px;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;margin-bottom:6px;">{$title}</div>
<div style="font-size:48px;font-weight:800;color:{$color};line-height:1;">{$rounded}%</div>
<div style="font-size:13px;color:#64748b;margin-top:6px;">{$compliant} / {$total} compliant nodes</div>
<div style="margin:14px auto 0;height:8px;width:80%;background:#e2e8f0;border-radius:999px;overflow:hidden;">
<div style="height:8px;width:{$rounded}%;background:{$color};border-radius:999px;font-size:0;line-height:0;">&nbsp;</div>
</div>
</td></tr></table>
</td></tr>
HTML;
    }

    private function blockTopNodes(array $b, array $theme, MailReport $report): string
    {
        $direction = (($b['direction'] ?? 'best') === 'worst') ? 'worst' : 'best';
        $limit = max(1, min(10, (int) ($b['limit'] ?? 5)));
        $title = $this->esc((string) ($b['title'] ?? ($direction === 'best' ? 'Top compliant nodes' : 'Least compliant nodes')));
        $nodes = $this->fetchRankedNodes($report, $direction, $limit);

        if (empty($nodes)) {
            return $this->emptyStateBlock($title, 'No node has been evaluated yet.');
        }

        $rows = '';
        $colors = $theme['compliance'] ?? [];
        $i = 0;
        foreach ($nodes as $n) {
            $i++;
            $label = (string) ($n['name'] ?? '');
            if ($label === '') $label = (string) ($n['hostname'] ?? '');
            if ($label === '') $label = (string) ($n['ipAddress'] ?? '—');
            $secondary = '';
            if ($label !== ($n['ipAddress'] ?? '') && !empty($n['ipAddress'])) {
                $secondary = $this->esc((string) $n['ipAddress']);
            }
            $name = $this->esc($label);
            $score = $this->esc((string) ($n['score'] ?? '—'));
            $bgScore = $this->color(in_array($score, ['A', 'B'], true) ? ($colors['goodColor'] ?? '#16a34a') : (in_array($score, ['C', 'D'], true) ? ($colors['warnColor'] ?? '#f59e0b') : ($colors['badColor'] ?? '#dc2626')));
            $secLine = $secondary !== '' ? '<div style="font-size:12px;color:#64748b;font-weight:400;margin-top:2px;">' . $secondary . '</div>' : '';
            $rows .= <<<ROW
<tr>
<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;width:32px;color:#94a3b8;font-weight:700;vertical-align:top;">#{$i}</td>
<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">
{$name}{$secLine}
</td>
<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;vertical-align:top;">
<span style="display:inline-block;background:{$bgScore};color:#ffffff;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:700;">{$score}</span>
</td>
</tr>
ROW;
        }

        return <<<HTML
<tr><td style="padding:12px 24px;">
<div style="font-size:16px;font-weight:700;margin-bottom:8px;">{$title}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;font-size:14px;">
{$rows}
</table>
</td></tr>
HTML;
    }

    private function emptyStateBlock(string $title, string $hint): string
    {
        $title = $this->esc($title);
        $hint = $this->esc($hint);
        return <<<HTML
<tr><td style="padding:12px 24px;">
<div style="font-size:16px;font-weight:700;margin-bottom:8px;">{$title}</div>
<div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:16px;text-align:center;color:#94a3b8;font-size:13px;">{$hint}</div>
</td></tr>
HTML;
    }

    private function blockKpiTiles(array $b, array $theme, MailReport $report): string
    {
        $stats = $this->computeContextComplianceStats($report);
        $total = $stats['total'];
        $compliant = $stats['compliant'];
        $nonCompliant = max(0, $total - $compliant);
        $percent = (int) round($stats['percent']);

        $tiles = [
            ['label' => 'Nodes', 'value' => (string) $total, 'accent' => $theme['textColor'] ?? '#1e293b'],
            ['label' => 'Compliant', 'value' => (string) $compliant, 'accent' => $theme['compliance']['goodColor'] ?? '#16a34a'],
            ['label' => 'Non compliant', 'value' => (string) $nonCompliant, 'accent' => $theme['compliance']['badColor'] ?? '#dc2626'],
            ['label' => 'Score', 'value' => $percent . '%', 'accent' => $theme['linkColor'] ?? '#3b82f6'],
        ];

        $cells = '';
        foreach ($tiles as $t) {
            $cells .= '<td valign="top" style="width:25%;padding:6px;">' . $this->innerKpi($t, $theme) . '</td>';
        }
        return <<<HTML
<tr><td style="padding:12px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>{$cells}</tr>
</table>
</td></tr>
HTML;
    }

    private function blockActionList(array $b, array $theme): string
    {
        $title = $this->esc((string) ($b['title'] ?? 'Recommended actions'));
        $items = is_array($b['items'] ?? null) ? $b['items'] : [];
        if (empty($items)) return '';

        $accent = $this->color($theme['linkColor'] ?? '#3b82f6');
        $lines = '';
        foreach ($items as $it) {
            $text = $this->esc((string) (is_array($it) ? ($it['text'] ?? '') : $it));
            if ($text === '') continue;
            $lines .= <<<L
<tr><td valign="top" style="padding:6px 0;width:24px;color:{$accent};font-weight:700;">▸</td>
<td valign="top" style="padding:6px 0;font-size:14px;line-height:1.5;">{$text}</td></tr>
L;
        }

        return <<<HTML
<tr><td style="padding:12px 24px;">
<div style="font-size:16px;font-weight:700;margin-bottom:6px;">{$title}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
{$lines}
</table>
</td></tr>
HTML;
    }

    private function blockFooter(array $b, array $theme): string
    {
        $text = nl2br($this->esc((string) ($b['text'] ?? '')));
        $f = $theme['footer'] ?? [];
        $bg = $this->color($f['bg'] ?? '#f1f5f9');
        $color = $this->color($f['color'] ?? '#64748b');
        $size = (int) ($f['fontSize'] ?? 12);
        $align = $this->align($b['align'] ?? 'center');
        return <<<HTML
<tr><td style="background:{$bg};color:{$color};font-size:{$size}px;line-height:1.5;padding:18px 24px;text-align:{$align};">
{$text}
</td></tr>
HTML;
    }

    private function blockNodeDetail(array $b, array $theme, MailReport $report): string
    {
        $nodeId = isset($b['nodeId']) && $b['nodeId'] !== '' ? (int) $b['nodeId'] : null;
        $node = null;
        if ($nodeId !== null) {
            $candidate = $this->em->getRepository(Node::class)->find($nodeId);
            if ($candidate instanceof Node && $candidate->getContext() && $candidate->getContext()->getId() === $report->getContext()->getId()) {
                $node = $candidate;
            }
        } elseif ($report->getNodes()->count() > 0) {
            $node = $report->getNodes()->first();
        }

        $title = $this->esc((string) ($b['title'] ?? 'Node detail'));
        if (!$node instanceof Node) {
            return $this->emptyStateBlock($title, 'Pick a node in this block options.');
        }

        $name = $node->getName() ?: ($node->getHostname() ?: ($node->getIpAddress() ?? '—'));
        $secondary = $node->getIpAddress() && $node->getIpAddress() !== $name ? $node->getIpAddress() : '';

        $colors = $theme['compliance'] ?? [];
        $cardBg = $this->color($theme['card']['bg'] ?? '#f8fafc');
        $cardBorder = $this->color($theme['card']['borderColor'] ?? '#e2e8f0');

        $scoreCells = '';
        $tiles = [
            ['label' => 'Global', 'value' => $node->getScore() ?? '—'],
            ['label' => 'Compliance', 'value' => $node->getComplianceScore() ?? '—'],
            ['label' => 'Security', 'value' => $node->getVulnerabilityScore() ?? '—'],
            ['label' => 'Updates', 'value' => $node->getSystemUpdateScore() ?? '—'],
        ];
        foreach ($tiles as $tile) {
            $val = (string) $tile['value'];
            $accent = $this->color(in_array($val, ['A', 'B'], true) ? ($colors['goodColor'] ?? '#16a34a') : (in_array($val, ['C', 'D'], true) ? ($colors['warnColor'] ?? '#f59e0b') : (in_array($val, ['E', 'F'], true) ? ($colors['badColor'] ?? '#dc2626') : '#94a3b8')));
            $label = $this->esc($tile['label']);
            $value = $this->esc($val);
            $scoreCells .= <<<TILE
<td valign="top" style="width:25%;padding:6px;">
<div style="background:{$cardBg};border:1px solid {$cardBorder};border-radius:8px;padding:14px;text-align:center;">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:6px;">{$label}</div>
<div style="font-size:28px;font-weight:800;color:{$accent};line-height:1;">{$value}</div>
</div>
</td>
TILE;
        }

        $context = $report->getContext();
        $failedRules = $this->em->getRepository(\App\Entity\ComplianceResult::class)->createQueryBuilder('r')
            ->select('r', 'rule', 'policy')
            ->leftJoin('r.rule', 'rule')
            ->leftJoin('r.policy', 'policy')
            ->andWhere('r.node = :node')
            ->andWhere("r.status IN ('non_compliant', 'error')")
            ->setParameter('node', $node)
            ->orderBy("CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 WHEN 'info' THEN 4 ELSE 5 END", 'ASC')
            ->setMaxResults((int) ($b['limit'] ?? 5))
            ->getQuery()->getResult();

        $rulesRows = '';
        foreach ($failedRules as $r) {
            /** @var \App\Entity\ComplianceResult $r */
            $sev = (string) ($r->getSeverity() ?? '—');
            $sevColor = $this->color(match ($sev) {
                'critical' => '#dc2626',
                'high' => '#ea580c',
                'medium' => '#f59e0b',
                'low' => '#3b82f6',
                'info' => '#64748b',
                default => '#94a3b8',
            });
            $ruleName = $this->esc((string) (method_exists($r, 'getRule') && $r->getRule() ? $r->getRule()->getName() : '—'));
            $message = $this->esc((string) ($r->getMessage() ?? ''));
            $messageHtml = $message !== '' ? '<div style="font-size:12px;color:#64748b;margin-top:2px;">' . mb_strimwidth($message, 0, 140, '…') . '</div>' : '';
            $rulesRows .= <<<ROW
<tr>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;width:80px;">
<span style="display:inline-block;background:{$sevColor};color:#ffffff;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;">{$sev}</span>
</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">
<div style="font-weight:600;">{$ruleName}</div>
{$messageHtml}
</td>
</tr>
ROW;
        }

        $secondaryHtml = $secondary !== '' ? '<div style="font-size:13px;color:#64748b;margin-top:2px;">' . $this->esc($secondary) . '</div>' : '';
        $rulesSection = $rulesRows !== ''
            ? <<<SEC
<div style="font-size:13px;font-weight:700;margin:18px 0 6px;color:#1e293b;">Top non-compliant rules</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
{$rulesRows}
</table>
SEC
            : '<div style="font-size:13px;color:#64748b;margin-top:14px;text-align:center;font-style:italic;">No failing rule.</div>';

        return <<<HTML
<tr><td style="padding:12px 24px;">
<div style="font-size:16px;font-weight:700;margin-bottom:4px;">{$title}</div>
<div style="font-size:14px;font-weight:600;color:#1e293b;">{$this->esc($name)}</div>
{$secondaryHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
<tr>{$scoreCells}</tr>
</table>
{$rulesSection}
</td></tr>
HTML;
    }

    private function blockPolicyRanking(array $b, array $theme, MailReport $report): string
    {
        $direction = (($b['direction'] ?? 'best') === 'worst') ? 'worst' : 'best';
        $limit = max(1, min(10, (int) ($b['limit'] ?? 5)));
        $title = $this->esc((string) ($b['title'] ?? ($direction === 'best' ? 'Best policies' : 'Worst policies')));

        $rows = $this->em->getConnection()->executeQuery(
            "SELECT p.id AS id, p.name AS name,
                    COUNT(r.id) AS total,
                    SUM(CASE WHEN r.status = 'compliant' THEN 1 ELSE 0 END) AS compliant
             FROM compliance_policy p
             LEFT JOIN compliance_result r ON r.policy_id = p.id AND r.status IN ('compliant', 'non_compliant')
             WHERE p.context_id = :ctx AND p.enabled = TRUE
             GROUP BY p.id, p.name
             HAVING COUNT(r.id) > 0
             ORDER BY (CASE WHEN COUNT(r.id) = 0 THEN -1 ELSE 100.0 * SUM(CASE WHEN r.status = 'compliant' THEN 1 ELSE 0 END) / COUNT(r.id) END) " . ($direction === 'best' ? 'DESC' : 'ASC') . ", p.name ASC
             LIMIT :lim",
            ['ctx' => $report->getContext()->getId(), 'lim' => $limit],
            ['ctx' => \Doctrine\DBAL\ParameterType::INTEGER, 'lim' => \Doctrine\DBAL\ParameterType::INTEGER]
        )->fetchAllAssociative();

        if (empty($rows)) {
            return $this->emptyStateBlock($title, 'No policy evaluation yet.');
        }

        $colors = $theme['compliance'] ?? [];
        $bars = '';
        $i = 0;
        foreach ($rows as $row) {
            $i++;
            $total = (int) $row['total'];
            $compliant = (int) $row['compliant'];
            $percent = $total > 0 ? (int) round(100 * $compliant / $total) : 0;
            $color = $this->color($percent >= 80 ? ($colors['goodColor'] ?? '#16a34a') : ($percent >= 50 ? ($colors['warnColor'] ?? '#f59e0b') : ($colors['badColor'] ?? '#dc2626')));
            $name = $this->esc((string) $row['name']);
            $bars .= <<<ROW
<tr>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;width:32px;color:#94a3b8;font-weight:700;vertical-align:top;">#{$i}</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">
<div style="display:flex;justify-content:space-between;font-weight:600;margin-bottom:6px;">
<span>{$name}</span><span style="color:{$color};">{$percent}%</span>
</div>
<div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
<div style="height:6px;width:{$percent}%;background:{$color};border-radius:999px;font-size:0;line-height:0;">&nbsp;</div>
</div>
<div style="font-size:11px;color:#64748b;margin-top:4px;">{$compliant} / {$total} compliant results</div>
</td>
</tr>
ROW;
        }

        return <<<HTML
<tr><td style="padding:12px 24px;">
<div style="font-size:16px;font-weight:700;margin-bottom:8px;">{$title}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
{$bars}
</table>
</td></tr>
HTML;
    }

    private function blockRecentCves(array $b, array $theme, MailReport $report): string
    {
        $limit = max(1, min(20, (int) ($b['limit'] ?? 5)));
        $minSeverity = (string) ($b['minSeverity'] ?? 'low');
        $title = $this->esc((string) ($b['title'] ?? 'Latest vulnerabilities'));
        $sevOrder = ['none' => 0, 'low' => 1, 'medium' => 2, 'high' => 3, 'critical' => 4];
        $minRank = $sevOrder[$minSeverity] ?? 1;
        $allowedSev = array_keys(array_filter($sevOrder, static fn ($v) => $v >= $minRank));

        $rows = $this->em->getConnection()->executeQuery(
            "SELECT c.id, c.cve_id, c.severity, c.cvss_score, c.description, c.published_at
             FROM cve c
             WHERE c.context_id = :ctx
               AND c.severity IN (:sev)
               AND EXISTS (
                   SELECT 1 FROM cve_device_model cdm
                   JOIN node n ON n.model_id = cdm.device_model_id
                   WHERE cdm.cve_id = c.id AND n.context_id = :ctx
               )
             ORDER BY c.published_at DESC NULLS LAST, c.id DESC
             LIMIT :lim",
            ['ctx' => $report->getContext()->getId(), 'sev' => $allowedSev, 'lim' => $limit],
            ['ctx' => \Doctrine\DBAL\ParameterType::INTEGER, 'sev' => \Doctrine\DBAL\ArrayParameterType::STRING, 'lim' => \Doctrine\DBAL\ParameterType::INTEGER]
        )->fetchAllAssociative();

        if (empty($rows)) {
            return $this->emptyStateBlock($title, 'No CVE matches your devices yet.');
        }

        $cells = '';
        foreach ($rows as $row) {
            $sev = (string) ($row['severity'] ?? 'none');
            $sevColor = $this->color(match ($sev) {
                'critical' => '#dc2626',
                'high' => '#ea580c',
                'medium' => '#f59e0b',
                'low' => '#3b82f6',
                default => '#94a3b8',
            });
            $cveId = $this->esc((string) ($row['cve_id'] ?? ''));
            $score = $row['cvss_score'] !== null ? number_format((float) $row['cvss_score'], 1) : '—';
            $desc = $this->esc(mb_strimwidth(trim((string) ($row['description'] ?? '')), 0, 180, '…'));
            $published = $row['published_at'] ? (new \DateTimeImmutable((string) $row['published_at']))->format('Y-m-d') : '—';

            $cells .= <<<ROW
<tr>
<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;width:90px;">
<span style="display:inline-block;background:{$sevColor};color:#ffffff;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;">{$sev}</span>
<div style="font-size:11px;color:#64748b;margin-top:4px;">CVSS {$score}</div>
</td>
<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:13px;">
<div style="font-weight:700;color:#1e293b;">{$cveId}</div>
<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">{$published}</div>
<div style="color:#475569;">{$desc}</div>
</td>
</tr>
ROW;
        }

        return <<<HTML
<tr><td style="padding:12px 24px;">
<div style="font-size:16px;font-weight:700;margin-bottom:8px;">{$title}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
{$cells}
</table>
</td></tr>
HTML;
    }

    private function blockCveDistribution(array $b, array $theme, MailReport $report): string
    {
        $title = $this->esc((string) ($b['title'] ?? 'Vulnerability distribution'));

        $rows = $this->em->getConnection()->executeQuery(
            "SELECT c.severity AS sev, COUNT(DISTINCT c.id) AS cnt
             FROM cve c
             WHERE c.context_id = :ctx
               AND EXISTS (
                   SELECT 1 FROM cve_device_model cdm
                   JOIN node n ON n.model_id = cdm.device_model_id
                   WHERE cdm.cve_id = c.id AND n.context_id = :ctx
               )
             GROUP BY c.severity",
            ['ctx' => $report->getContext()->getId()],
            ['ctx' => \Doctrine\DBAL\ParameterType::INTEGER]
        )->fetchAllAssociative();

        $counts = ['critical' => 0, 'high' => 0, 'medium' => 0, 'low' => 0, 'none' => 0];
        $total = 0;
        foreach ($rows as $r) {
            $sev = (string) $r['sev'];
            if (isset($counts[$sev])) {
                $counts[$sev] = (int) $r['cnt'];
                $total += (int) $r['cnt'];
            }
        }

        if ($total === 0) {
            return $this->emptyStateBlock($title, 'No CVE matches your devices yet.');
        }

        $palette = [
            'critical' => '#dc2626',
            'high' => '#ea580c',
            'medium' => '#f59e0b',
            'low' => '#3b82f6',
            'none' => '#94a3b8',
        ];

        $bars = '';
        foreach ($counts as $sev => $cnt) {
            $percent = $total > 0 ? (int) round(100 * $cnt / $total) : 0;
            $color = $this->color($palette[$sev]);
            $bars .= <<<ROW
<tr>
<td style="padding:6px 0;font-size:12px;width:80px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;">{$sev}</td>
<td style="padding:6px 0;">
<div style="height:18px;background:#e2e8f0;border-radius:4px;overflow:hidden;position:relative;">
<div style="height:18px;width:{$percent}%;background:{$color};border-radius:4px;font-size:0;line-height:0;">&nbsp;</div>
</div>
</td>
<td style="padding:6px 0 6px 12px;font-size:13px;font-weight:700;color:#1e293b;width:60px;text-align:right;">{$cnt}</td>
</tr>
ROW;
        }

        return <<<HTML
<tr><td style="padding:12px 24px;">
<div style="font-size:16px;font-weight:700;margin-bottom:8px;">{$title}</div>
<div style="font-size:12px;color:#64748b;margin-bottom:8px;">{$total} CVE total</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
{$bars}
</table>
</td></tr>
HTML;
    }

    private function blockSystemUpdates(array $b, array $theme, MailReport $report): string
    {
        $title = $this->esc((string) ($b['title'] ?? 'System updates & lifecycle'));
        $months = max(1, min(36, (int) ($b['monthsAhead'] ?? 6)));
        $limit = max(1, min(20, (int) ($b['limit'] ?? 5)));

        $context = $report->getContext();
        $now = new \DateTimeImmutable('now');
        $deadline = $now->modify('+' . $months . ' months');

        $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context]);

        $eolItems = [];
        $updateItems = [];
        foreach ($nodes as $node) {
            $range = $this->systemUpdateScoreCalculator->findProductRange($node);
            if ($range === null) continue;

            $eol = $range->getEndOfLifeDate();
            $eosup = $range->getEndOfSupportDate();
            $approachingEol = $eol !== null && $eol >= $now && $eol <= $deadline;
            $approachingEosup = $eosup !== null && $eosup >= $now && $eosup <= $deadline;
            if ($approachingEol || $approachingEosup) {
                $when = $approachingEol ? $eol : $eosup;
                $kind = $approachingEol ? 'EoL' : 'EoSupport';
                $eolItems[] = [
                    'label' => $node->getName() ?: ($node->getHostname() ?: ($node->getIpAddress() ?? '—')),
                    'rangeName' => $range->getName(),
                    'kind' => $kind,
                    'when' => $when,
                    'sortKey' => $when ? $when->getTimestamp() : PHP_INT_MAX,
                ];
            }

            $cur = $node->getDiscoveredVersion();
            $rec = $range->getRecommendedVersion();
            if ($cur && $rec && version_compare((string) $cur, (string) $rec, '<')) {
                $updateItems[] = [
                    'label' => $node->getName() ?: ($node->getHostname() ?: ($node->getIpAddress() ?? '—')),
                    'current' => $cur,
                    'target' => $rec,
                ];
            }
        }

        usort($eolItems, static fn ($a, $b) => $a['sortKey'] <=> $b['sortKey']);
        $eolItems = array_slice($eolItems, 0, $limit);
        $updateItems = array_slice($updateItems, 0, $limit);

        $eolRowsHtml = '';
        foreach ($eolItems as $row) {
            $name = $this->esc((string) $row['label']);
            $rangeName = $this->esc((string) $row['rangeName']);
            $when = $row['when'] ? $row['when']->format('Y-m-d') : '—';
            $kind = $row['kind'];
            $eolRowsHtml .= <<<ROW
<tr>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:13px;">
<div style="font-weight:600;">{$name}</div>
<div style="font-size:11px;color:#64748b;margin-top:2px;">{$rangeName} · {$kind} · {$when}</div>
</td>
</tr>
ROW;
        }

        $updateRowsHtml = '';
        foreach ($updateItems as $row) {
            $label = $this->esc((string) $row['label']);
            $current = $this->esc((string) $row['current']);
            $target = $this->esc((string) $row['target']);
            $updateRowsHtml .= <<<ROW
<tr>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:13px;">
<div style="font-weight:600;">{$label}</div>
<div style="font-size:11px;color:#64748b;margin-top:2px;">{$current} → <span style="color:#16a34a;font-weight:700;">{$target}</span></div>
</td>
</tr>
ROW;
        }

        if ($eolRowsHtml === '' && $updateRowsHtml === '') {
            return $this->emptyStateBlock($title, 'No EoL within ' . $months . ' months and no pending update.');
        }

        $eolSection = $eolRowsHtml !== ''
            ? <<<SEC
<div style="font-size:13px;font-weight:700;margin:6px 0;color:#dc2626;">⚠ Approaching end-of-life ({$months} months)</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #fecaca;border-radius:10px;overflow:hidden;margin-bottom:12px;">
{$eolRowsHtml}
</table>
SEC
            : '';

        $updateSection = $updateRowsHtml !== ''
            ? <<<SEC
<div style="font-size:13px;font-weight:700;margin:6px 0;color:#0891b2;">⤴ Pending updates</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #bae6fd;border-radius:10px;overflow:hidden;">
{$updateRowsHtml}
</table>
SEC
            : '';

        return <<<HTML
<tr><td style="padding:12px 24px;">
<div style="font-size:16px;font-weight:700;margin-bottom:8px;">{$title}</div>
{$eolSection}
{$updateSection}
</td></tr>
HTML;
    }

    private function fetchRankedNodes(MailReport $report, string $direction, int $limit): array
    {
        $context = $report->getContext();
        $qb = $this->em->getRepository(Node::class)->createQueryBuilder('n')
            ->andWhere('n.context = :ctx')
            ->setParameter('ctx', $context)
            ->setMaxResults($limit);

        $order = $direction === 'best' ? 'ASC' : 'DESC';
        $qb->andWhere('n.complianceScore IS NOT NULL')
            ->orderBy('n.complianceScore', $order)
            ->addOrderBy('n.name', 'ASC');

        $nodes = $qb->getQuery()->getResult();
        $rows = [];
        foreach ($nodes as $n) {
            /** @var Node $n */
            $rows[] = [
                'id' => $n->getId(),
                'name' => $n->getName(),
                'hostname' => $n->getHostname(),
                'ipAddress' => $n->getIpAddress(),
                'score' => $n->getComplianceScore() ?? '—',
            ];
        }
        return $rows;
    }

    private function computeContextComplianceStats(MailReport $report): array
    {
        $context = $report->getContext();
        $rows = $this->em->getRepository(Node::class)->createQueryBuilder('n')
            ->select('n.complianceScore AS score')
            ->andWhere('n.context = :ctx')
            ->setParameter('ctx', $context)
            ->getQuery()->getArrayResult();

        $total = count($rows);
        $compliant = 0;
        foreach ($rows as $r) {
            if (in_array($r['score'] ?? null, ['A', 'B'], true)) {
                $compliant++;
            }
        }
        $percent = $total > 0 ? (100 * $compliant / $total) : 0.0;
        return ['total' => $total, 'compliant' => $compliant, 'percent' => $percent];
    }

    private function esc(string $v): string
    {
        return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private function color(string $v): string
    {
        return preg_match('/^#[0-9a-fA-F]{3,8}$/', $v) ? $v : '#000000';
    }

    private function align(string $v): string
    {
        return in_array($v, ['left', 'center', 'right'], true) ? $v : 'left';
    }
}
