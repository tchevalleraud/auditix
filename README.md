# Auditix

Auditix est une plateforme d'audit et de conformite reseau. Elle permet de gerer un parc d'equipements reseau, de collecter automatiquement leurs configurations via SSH, et d'analyser leur conformite selon des regles definies.

## Architecture

Le projet est compose de trois briques principales, orchestrees par Docker Compose :

```
┌─────────────────────────────────────────────────────────┐
│                      Nginx (port 80)                    │
│                     Reverse Proxy                       │
├──────────────────┬──────────────────┬───────────────────┤
│  /api/*          │  /.well-known/   │  /*               │
│  Symfony (PHP)   │  mercure         │  Next.js (Node)   │
│  Backend API     │  Mercure SSE     │  Frontend         │
├──────────────────┴──────────────────┴───────────────────┤
│              PostgreSQL  │  RabbitMQ                    │
│              Base de     │  File de messages            │
│              donnees     │  (workers async)             │
└─────────────────────────────────────────────────────────┘
```

| Service | Technologie | Role |
|---------|-------------|------|
| **Backend** | Symfony 7.2 / PHP 8.3 | API REST, logique metier, securite |
| **Frontend** | Next.js 15 / React 19 | Interface utilisateur SPA |
| **Base de donnees** | PostgreSQL 16 | Persistance des donnees |
| **Message broker** | RabbitMQ 3.13 | Execution asynchrone des taches |
| **Temps reel** | Mercure | Server-Sent Events (SSE) |
| **Reverse proxy** | Nginx 1.26 | Routage, point d'entree unique |

## Fonctionnalites

### Gestion du parc
- **Noeuds** : inventaire des equipements reseau (IP, constructeur, modele, profil)
- **Constructeurs & Modeles** : catalogue d'equipements avec logos
- **Profils** : regroupement de credentials (SSH/SNMP) pour l'acces aux equipements
- **Contextes** : multi-tenancy, chaque contexte isole ses propres donnees

### Collecte de configurations
- **Connexion SSH** via phpseclib3 avec support des scripts de connexion par modele
- **Regles de collecte** : dossiers et commandes organisables en arborescence
- **Association automatique et manuelle** des commandes aux modeles d'equipements
- **Stockage fichier** : chaque commande produit un fichier texte, organise par regle
- **Tags multiples** par collecte avec unicite par contexte
- **Execution asynchrone** via workers RabbitMQ dedies (scalables)

### Monitoring
- **Ping ICMP** des equipements avec mise a jour temps reel
- **Indicateurs visuels** dans le tableau des noeuds (statut collecte, joignabilite)

### Temps reel
- **Mercure SSE** pour les mises a jour instantanees (progression des collectes, resultats de ping, taches admin)

### Administration
- **Gestion des utilisateurs** et des contextes
- **Tableau des taches** unifie (taches + collectes)
- **Health check** et **logs** systeme

### Interface
- **6 langues** : francais, anglais, espagnol, allemand, italien, japonais
- **Dark mode** natif
- **Responsive** avec Tailwind CSS

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) >= 24.0
- [Docker Compose](https://docs.docker.com/compose/install/) >= 2.20

## Installation

### 1. Cloner le depot

```bash
git clone https://github.com/tchevalleraud/auditix.git
cd auditix
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

Editer le fichier `.env` selon vos besoins. Les valeurs par defaut fonctionnent pour le developpement local :

```env
APP_ENV=dev

# PostgreSQL
POSTGRES_DB=auditix
POSTGRES_USER=auditix
POSTGRES_PASSWORD=auditix

# RabbitMQ
RABBITMQ_USER=auditix
RABBITMQ_PASSWORD=auditix
```

### 3. Demarrer l'application

```bash
make up
```

Cette commande :
- Construit les images Docker
- Demarre tous les services (base de donnees, message broker, backend, frontend, workers)
- Execute les migrations Doctrine
- Cree l'utilisateur par defaut

### 4. Acceder a l'application

| URL | Service |
|-----|---------|
| http://localhost | Application (frontend) |
| http://localhost/api | API Symfony |
| http://localhost:15672 | RabbitMQ Management |

**Credentials par defaut** : `admin` / `admin`

## Commandes utiles

```bash
make up              # Demarrer tous les services
make down            # Arreter tous les services
make restart         # Redemarrer tous les services
make build           # Reconstruire les images Docker
make logs            # Afficher les logs de tous les services
make logs-php        # Afficher les logs PHP
make logs-workers    # Afficher les logs des workers
make console         # Ouvrir un shell dans le conteneur PHP
make sf CMD="..."    # Executer une commande Symfony (ex: make sf CMD="cache:clear")
make composer CMD="..." # Executer une commande Composer
```

## Structure du projet

```
auditix/
├── app/                          # Backend Symfony
│   ├── config/                   # Configuration Symfony
│   ├── migrations/               # Migrations Doctrine
│   ├── src/
│   │   ├── Command/              # Commandes console (scheduler, cleanup)
│   │   ├── Controller/Api/       # Controleurs API REST
│   │   ├── Entity/               # Entites Doctrine (Node, Collection, etc.)
│   │   ├── Message/              # Messages asynchrones
│   │   ├── MessageHandler/       # Handlers des workers
│   │   ├── Repository/           # Repositories Doctrine
│   │   └── Security/             # Authentification
│   └── composer.json
├── frontend/                     # Frontend Next.js
│   ├── src/
│   │   ├── app/                  # Pages (App Router)
│   │   │   ├── (authenticated)/  # Pages protegees
│   │   │   │   ├── nodes/        # Gestion des noeuds
│   │   │   │   ├── manufacturers/# Constructeurs
│   │   │   │   ├── models/       # Modeles
│   │   │   │   ├── profiles/     # Profils
│   │   │   │   ├── collection-commands/ # Commandes de collecte
│   │   │   │   └── admin/        # Administration
│   │   │   └── login/            # Page de connexion
│   │   ├── components/           # Composants React
│   │   └── i18n/                 # Fichiers de traduction (6 langues)
│   └── package.json
├── docker/                       # Fichiers Docker
│   ├── nginx/default.conf        # Configuration Nginx
│   ├── php/Dockerfile            # Image PHP 8.3 + extensions
│   └── node/Dockerfile           # Image Node 22
├── data/                         # Volumes Docker (ignore par git)
│   └── collections/              # Fichiers de collecte (monte dans les workers)
├── docker-compose.yml
├── Makefile
└── .env.example
```

## Workers

L'application utilise plusieurs workers asynchrones via RabbitMQ :

| Worker | Transport | Replicas | Role |
|--------|-----------|----------|------|
| `worker-scheduler` | — | 1 | Planification du monitoring |
| `worker-monitoring` | `monitoring` | 1 | Execution des pings ICMP |
| `worker-collector` | `collector` | 2 | Collecte SSH des configurations |
| `worker-generator` | `generator` | 1 | Generation (reserve) |
| `worker-cleanup` | — | 1 | Nettoyage des taches |

Les replicas du worker-collector peuvent etre augmentes dans le `.env` pour paralleliser les collectes :

```env
WORKER_COLLECTOR_REPLICAS=4
```

## Flux de collecte

```
1. L'utilisateur selectionne des noeuds et lance une collecte
2. Le backend cree des entites Collection et dispatch des messages
3. Les workers collector consomment les messages :
   a. Connexion SSH a l'equipement
   b. Execution du script de connexion (selon le modele)
   c. Execution de chaque commande de collecte
   d. Stockage des resultats en fichiers (1 dossier/regle, 1 fichier/commande)
   e. Mise a jour en temps reel via Mercure
4. L'utilisateur visualise les resultats dans l'interface
```

## Technologies

**Backend** : PHP 8.3, Symfony 7.2, Doctrine ORM, phpseclib3, Messenger + AMQP

**Frontend** : Node 22, Next.js 15, React 19, TypeScript 5.7, Tailwind CSS 4

**Infrastructure** : Docker, Nginx, PostgreSQL 16, RabbitMQ 3.13, Mercure

## License

This project is licensed under the [MIT License](LICENSE).
