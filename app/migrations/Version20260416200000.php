<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260416200000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create api_token table for public API authentication';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS api_token (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                token_hash VARCHAR(64) NOT NULL,
                token_prefix VARCHAR(8) NOT NULL,
                user_id INT NOT NULL,
                context_id INT NOT NULL,
                expires_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
                last_used_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_api_token_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE,
                CONSTRAINT fk_api_token_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE
            )
        SQL);

        $this->addSql('CREATE UNIQUE INDEX IF NOT EXISTS uniq_api_token_hash ON api_token (token_hash)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_api_token_hash ON api_token (token_hash)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_api_token_user ON api_token (user_id)');

        $this->addSql(<<<'SQL'
            COMMENT ON COLUMN api_token.expires_at IS '(DC2Type:datetime_immutable)'
        SQL);
        $this->addSql(<<<'SQL'
            COMMENT ON COLUMN api_token.last_used_at IS '(DC2Type:datetime_immutable)'
        SQL);
        $this->addSql(<<<'SQL'
            COMMENT ON COLUMN api_token.created_at IS '(DC2Type:datetime_immutable)'
        SQL);
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS api_token');
    }
}
