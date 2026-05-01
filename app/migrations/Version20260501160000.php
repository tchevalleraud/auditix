<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260501160000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add mail_report and mail_report_node tables, and mail report ids on schedule';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE mail_report (
                id SERIAL NOT NULL,
                context_id INT NOT NULL,
                theme_id INT NOT NULL,
                mail_server_id INT DEFAULT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT DEFAULT NULL,
                locale VARCHAR(10) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                preheader VARCHAR(255) DEFAULT NULL,
                type VARCHAR(10) NOT NULL,
                blocks JSON NOT NULL,
                recipient_user_ids JSON DEFAULT NULL,
                recipient_external_emails JSON DEFAULT NULL,
                sending_status VARCHAR(20) DEFAULT NULL,
                last_error TEXT DEFAULT NULL,
                last_sent_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
                send_history JSON DEFAULT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
                PRIMARY KEY(id)
            )
        SQL);

        $this->addSql('CREATE INDEX idx_mail_report_context ON mail_report (context_id)');
        $this->addSql('CREATE INDEX idx_mail_report_theme ON mail_report (theme_id)');
        $this->addSql('CREATE INDEX idx_mail_report_mail_server ON mail_report (mail_server_id)');

        $this->addSql('ALTER TABLE mail_report ADD CONSTRAINT fk_mail_report_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE mail_report ADD CONSTRAINT fk_mail_report_theme FOREIGN KEY (theme_id) REFERENCES report_theme (id)');
        $this->addSql('ALTER TABLE mail_report ADD CONSTRAINT fk_mail_report_mail_server FOREIGN KEY (mail_server_id) REFERENCES mail_server (id) ON DELETE SET NULL');

        $this->addSql(<<<'SQL'
            CREATE TABLE mail_report_node (
                mail_report_id INT NOT NULL,
                node_id INT NOT NULL,
                PRIMARY KEY(mail_report_id, node_id)
            )
        SQL);
        $this->addSql('CREATE INDEX idx_mail_report_node_report ON mail_report_node (mail_report_id)');
        $this->addSql('CREATE INDEX idx_mail_report_node_node ON mail_report_node (node_id)');
        $this->addSql('ALTER TABLE mail_report_node ADD CONSTRAINT fk_mrn_report FOREIGN KEY (mail_report_id) REFERENCES mail_report (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE mail_report_node ADD CONSTRAINT fk_mrn_node FOREIGN KEY (node_id) REFERENCES node (id) ON DELETE CASCADE');

        $this->addSql('ALTER TABLE schedule ADD COLUMN mail_report_ids JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE schedule DROP COLUMN IF EXISTS mail_report_ids');
        $this->addSql('DROP TABLE IF EXISTS mail_report_node');
        $this->addSql('DROP TABLE IF EXISTS mail_report');
    }
}
