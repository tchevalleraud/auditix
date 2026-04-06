---
sidebar_position: 1
slug: /
---

# Introduction

**Auditix** est une plateforme d'audit de conformite reseau qui vous permet de surveiller, collecter des donnees et evaluer la conformite de vos equipements reseau.

## Fonctionnalites principales

- **Gestion des noeuds** — Enregistrez et organisez vos equipements reseau (routeurs, switches, pare-feu, etc.) avec detection du fabricant et du modele.
- **Collecte automatisee** — Planifiez et executez la collecte de donnees depuis vos noeuds via SSH/SNMP avec des commandes personnalisables.
- **Evaluation de conformite** — Definissez des regles et politiques de conformite, puis evaluez vos noeuds avec un scoring automatique.
- **Monitoring SNMP** — Surveillez la sante de vos equipements avec le polling SNMP pour le CPU, la memoire, la temperature, etc.
- **Generation de rapports** — Generez des rapports de conformite professionnels au format DOCX avec des themes personnalisables.
- **Multi-contexte** — Organisez votre infrastructure en contextes separes pour differentes equipes ou environnements.
- **Multi-langue** — Interface complete disponible en anglais, francais, allemand, espagnol, italien et japonais.

## Architecture

Auditix est construit avec :

- **Backend** : Symfony 7 (PHP 8.3) avec PostgreSQL
- **Frontend** : Next.js 15 avec React et Tailwind CSS
- **File de messages** : RabbitMQ pour le traitement asynchrone (collecte, conformite, monitoring, generation de rapports)
- **Temps reel** : Mercure pour les mises a jour en direct
- **Reverse Proxy** : Nginx

Tous les services tournent sous forme de containers Docker orchestres via Docker Compose.

## Etapes suivantes

- [Prerequis](./getting-started/requirements) — Verifiez ce dont vous avez besoin avant l'installation
- [Installation](./getting-started/installation) — Deployez Auditix avec Docker Compose
- [Premiers pas](./getting-started/first-steps) — Configurez votre premier contexte et ajoutez des noeuds
