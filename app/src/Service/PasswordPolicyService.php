<?php

namespace App\Service;

use App\Entity\AuthSettings;
use App\Repository\AuthSettingsRepository;

class PasswordPolicyService
{
    public function __construct(
        private readonly AuthSettingsRepository $repository,
    ) {
    }

    public function getSettings(): AuthSettings
    {
        return $this->repository->getSingleton();
    }

    /**
     * @return list<string> List of human-readable violations (empty if password is valid)
     */
    public function validate(string $password): array
    {
        $s = $this->getSettings();
        $violations = [];

        $len = mb_strlen($password);
        if ($len < $s->getPasswordMinLength()) {
            $violations[] = sprintf('Password must be at least %d characters.', $s->getPasswordMinLength());
        }
        if ($len > $s->getPasswordMaxLength()) {
            $violations[] = sprintf('Password must be at most %d characters.', $s->getPasswordMaxLength());
        }
        if ($s->isPasswordRequireUppercase() && !preg_match('/[A-Z]/', $password)) {
            $violations[] = 'Password must contain at least one uppercase letter.';
        }
        if ($s->isPasswordRequireLowercase() && !preg_match('/[a-z]/', $password)) {
            $violations[] = 'Password must contain at least one lowercase letter.';
        }
        if ($s->isPasswordRequireDigit() && !preg_match('/[0-9]/', $password)) {
            $violations[] = 'Password must contain at least one digit.';
        }
        if ($s->isPasswordRequireSymbol() && !preg_match('/[^A-Za-z0-9]/', $password)) {
            $violations[] = 'Password must contain at least one symbol.';
        }

        return $violations;
    }
}
