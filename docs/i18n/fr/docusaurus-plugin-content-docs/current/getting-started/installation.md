---
sidebar_position: 2
---

# Installation

Ce guide vous accompagne dans le deploiement d'Auditix avec Docker Compose.

## 1. Cloner le depot

```bash
git clone https://github.com/tchevalleraud/auditix.git
cd auditix
```

## 2. Configurer l'environnement

Creez un fichier `.env` a la racine du projet :

```bash
cp .env.example .env
```

Editez le fichier `.env` avec vos parametres :

```env title=".env"
# Mode d'environnement
APP_ENV=prod

# URL de base (definissez l'IP ou le domaine de votre serveur)
DEFAULT_URI=http://votre-ip-serveur

# Port HTTP expose (defaut : 80)
HTTP_PORT=80

# Identifiants PostgreSQL
POSTGRES_DB=auditix
POSTGRES_USER=auditix
POSTGRES_PASSWORD=changez-pour-un-mot-de-passe-fort

# Identifiants RabbitMQ
RABBITMQ_USER=auditix
RABBITMQ_PASSWORD=changez-pour-un-mot-de-passe-fort

# Replicas des workers (ajustez selon vos besoins)
WORKER_SCHEDULER_REPLICAS=1
WORKER_MONITORING_REPLICAS=1
WORKER_COLLECTOR_REPLICAS=4
WORKER_COMPLIANCE_REPLICAS=2
WORKER_GENERATOR_REPLICAS=1
```

:::warning
Changez toujours les mots de passe par defaut de PostgreSQL et RabbitMQ en environnement de production.
:::

## 3. Demarrer l'application

```bash
make up
```

Le premier demarrage va :
1. Construire les images Docker
2. Telecharger les images de base necessaires
3. Installer les dependances PHP et Node.js
4. Executer les migrations de base de donnees
5. Creer l'utilisateur admin par defaut
6. Compiler le frontend Next.js pour la production
7. Prechauffer le cache Symfony

:::info
Le premier demarrage peut prendre plusieurs minutes selon les performances de votre serveur. Vous pouvez suivre la progression avec :
```bash
docker logs -f auditix-php-1
docker logs -f auditix-node-1
```
:::

## 4. Verifier l'installation

Verifiez que tous les containers sont en cours d'execution :

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

## 5. Acceder a l'interface

Ouvrez votre navigateur et allez a :

```
http://votre-ip-serveur
```

Connectez-vous avec les identifiants par defaut :

| Champ              | Valeur     |
|--------------------|------------|
| Nom d'utilisateur  | `admin`    |
| Mot de passe       | `password` |

:::danger
Changez le mot de passe admin par defaut immediatement apres votre premiere connexion via les parametres du **Profil**.
:::

## Mise a jour

Pour mettre a jour Auditix vers une nouvelle version :

```bash
make upgrade
```

Cette commande va telecharger les dernieres modifications, reconstruire les containers, vider le cache, appliquer les migrations et redemarrer tous les services.

## Depannage

### Page "Update in progress"

C'est la page de secours Nginx 502 affichee pendant que le container Node.js compile le frontend. Attendez quelques minutes :

```bash
docker logs -f auditix-node-1
```

Lorsque vous voyez `Ready in XXXms`, l'application est prete.

### Reinitialisation complete

Pour repartir d'un etat completement propre :

```bash
make down
rm -rf data/postgres data/rabbitmq data/collections
make up
```

:::warning
Cela supprimera toutes vos donnees, y compris les noeuds, collectes, rapports et resultats de conformite.
:::
