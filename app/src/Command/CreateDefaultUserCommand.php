<?php

namespace App\Command;

use App\Entity\Context;
use App\Entity\User;
use App\Repository\ContextRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

#[AsCommand(
    name: 'app:create-default-user',
    description: 'Create the default admin user and default context if they do not exist',
)]
class CreateDefaultUserCommand extends Command
{
    public function __construct(
        private EntityManagerInterface $em,
        private UserPasswordHasherInterface $passwordHasher,
        private UserRepository $userRepository,
        private ContextRepository $contextRepository,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        if ($this->userRepository->count() === 0) {
            $user = new User();
            $user->setUsername('admin');
            $user->setRoles(['ROLE_ADMIN']);
            $user->setPassword($this->passwordHasher->hashPassword($user, 'password'));

            $this->em->persist($user);
            $output->writeln('Default admin user created (admin/password).');
        } else {
            $output->writeln('Users already exist, skipping.');
        }

        if ($this->contextRepository->count() === 0) {
            $context = new Context();
            $context->setName('Default');
            $context->setDescription('Contexte par defaut');
            $context->setIsDefault(true);

            $this->em->persist($context);
            $output->writeln('Default context created.');
        } else {
            $output->writeln('Contexts already exist, skipping.');
        }

        $this->em->flush();

        return Command::SUCCESS;
    }
}
