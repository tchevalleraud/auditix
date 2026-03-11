<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260311020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Replace individual theme columns with a single styles JSON column';
    }

    public function up(Schema $schema): void
    {
        $defaultStyles = json_encode([
            'colors' => ['primary' => '#1e293b', 'secondary' => '#3b82f6'],
            'body' => ['font' => 'Calibri', 'size' => 11, 'color' => '#1e293b'],
            'headings' => [
                ['level' => 1, 'font' => 'Calibri', 'size' => 26, 'bold' => true, 'italic' => false, 'color' => '#1e293b'],
                ['level' => 2, 'font' => 'Calibri', 'size' => 22, 'bold' => true, 'italic' => false, 'color' => '#1e293b'],
                ['level' => 3, 'font' => 'Calibri', 'size' => 18, 'bold' => true, 'italic' => false, 'color' => '#334155'],
                ['level' => 4, 'font' => 'Calibri', 'size' => 15, 'bold' => true, 'italic' => false, 'color' => '#334155'],
                ['level' => 5, 'font' => 'Calibri', 'size' => 13, 'bold' => true, 'italic' => false, 'color' => '#475569'],
                ['level' => 6, 'font' => 'Calibri', 'size' => 11, 'bold' => true, 'italic' => true, 'color' => '#475569'],
            ],
            'table' => ['headerBg' => '#1e293b', 'headerColor' => '#ffffff', 'borderColor' => '#e2e8f0', 'alternateRows' => true, 'alternateBg' => '#f8fafc'],
            'header' => ['enabled' => true, 'color' => '#64748b', 'separator' => true, 'separatorColor' => '#e2e8f0'],
            'footer' => ['enabled' => true, 'color' => '#64748b', 'separator' => true, 'separatorColor' => '#e2e8f0', 'showPageNumbers' => true],
        ]);

        $this->addSql("ALTER TABLE report_theme ADD styles JSON NOT NULL DEFAULT '{}'");
        $this->addSql('UPDATE report_theme SET styles = :styles', ['styles' => $defaultStyles]);

        $this->addSql('ALTER TABLE report_theme DROP COLUMN primary_color');
        $this->addSql('ALTER TABLE report_theme DROP COLUMN secondary_color');
        $this->addSql('ALTER TABLE report_theme DROP COLUMN font_family');
        $this->addSql('ALTER TABLE report_theme DROP COLUMN heading_font_family');
        $this->addSql('ALTER TABLE report_theme DROP COLUMN font_size');
    }

    public function down(Schema $schema): void
    {
        $this->addSql("ALTER TABLE report_theme ADD primary_color VARCHAR(20) NOT NULL DEFAULT '#1e293b'");
        $this->addSql("ALTER TABLE report_theme ADD secondary_color VARCHAR(20) NOT NULL DEFAULT '#3b82f6'");
        $this->addSql("ALTER TABLE report_theme ADD font_family VARCHAR(100) NOT NULL DEFAULT 'Inter'");
        $this->addSql('ALTER TABLE report_theme ADD heading_font_family VARCHAR(100) DEFAULT NULL');
        $this->addSql('ALTER TABLE report_theme ADD font_size INT NOT NULL DEFAULT 11');
        $this->addSql('ALTER TABLE report_theme DROP COLUMN styles');
    }
}
