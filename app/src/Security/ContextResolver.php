<?php

namespace App\Security;

use App\Entity\Context;

/**
 * Resolves the Context owning any context-scoped entity. All scoped entities
 * expose a getContext() method; we trust that contract via duck-typing rather
 * than a marker interface to avoid touching every entity class.
 */
class ContextResolver
{
    public function resolve(mixed $subject): ?Context
    {
        if ($subject === null) {
            return null;
        }
        if ($subject instanceof Context) {
            return $subject;
        }
        if (is_object($subject) && method_exists($subject, 'getContext')) {
            $context = $subject->getContext();
            return $context instanceof Context ? $context : null;
        }
        return null;
    }
}
