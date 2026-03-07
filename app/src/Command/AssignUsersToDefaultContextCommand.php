<?php

namespace App\Command;

use App\Repository\ContextRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:assign-users-default-context',
    description: 'Assign all users to the Default context',
)]
class AssignUsersToDefaultContextCommand extends Command
{
    public function __construct(
        private readonly ContextRepository $contextRepository,
        private readonly UserRepository $userRepository,
        private readonly EntityManagerInterface $em,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $default = $this->contextRepository->findOneBy(['isDefault' => true]);

        if (!$default) {
            $output->writeln('<error>No default context found</error>');
            return Command::FAILURE;
        }

        $users = $this->userRepository->findAll();
        $added = 0;

        foreach ($users as $user) {
            if (!$default->getUsers()->contains($user)) {
                $default->addUser($user);
                $added++;
            }
        }

        $this->em->flush();

        $output->writeln("<info>Added $added user(s) to context \"{$default->getName()}\"</info>");

        return Command::SUCCESS;
    }
}
