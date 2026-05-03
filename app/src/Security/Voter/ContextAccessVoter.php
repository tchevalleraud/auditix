<?php

namespace App\Security\Voter;

use App\Entity\Context;
use App\Entity\User;
use App\Security\ContextResolver;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\AccessDecisionManagerInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

class ContextAccessVoter extends Voter
{
    public const ACCESS = 'CONTEXT_ACCESS';

    public function __construct(
        private readonly ContextResolver $resolver,
        private readonly AccessDecisionManagerInterface $decisionManager,
    ) {}

    protected function supports(string $attribute, mixed $subject): bool
    {
        if ($attribute !== self::ACCESS) {
            return false;
        }
        return $subject === null
            || $subject instanceof Context
            || (is_object($subject) && method_exists($subject, 'getContext'));
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool
    {
        $user = $token->getUser();
        if (!$user instanceof User) {
            return false;
        }

        if ($this->decisionManager->decide($token, ['ROLE_ADMIN'])) {
            return true;
        }

        $context = $this->resolver->resolve($subject);
        if ($context === null) {
            // No context attached to the subject — deny by default for non-admins.
            return false;
        }

        foreach ($user->getContexts() as $userContext) {
            if ($userContext->getId() === $context->getId()) {
                return true;
            }
        }
        return false;
    }
}
