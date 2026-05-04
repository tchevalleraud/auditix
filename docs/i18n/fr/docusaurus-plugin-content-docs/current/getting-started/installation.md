---
sidebar_position: 2
---

# Installation

Ce guide vous accompagne dans le déploiement d'Auditix avec Docker Compose.

## 1. Cloner le dépôt

```bash
git clone https://github.com/tchevalleraud/auditix.git
cd auditix
```

## 2. Configurer l'environnement

Créez un fichier `.env` à la racine du projet :

```bash
cp .env.example .env
```

Éditez le fichier `.env` avec vos paramètres :

```env title=".env"
# Mode d'environnement
APP_ENV=prod

# URL de base (définissez l'IP ou le domaine de votre serveur)
DEFAULT_URI=http://votre-ip-serveur

# Port HTTP exposé (défaut : 80)
HTTP_PORT=80

# Identifiants PostgreSQL
POSTGRES_DB=auditix
POSTGRES_USER=auditix
POSTGRES_PASSWORD=changez-pour-un-mot-de-passe-fort

# Identifiants RabbitMQ
RABBITMQ_USER=auditix
RABBITMQ_PASSWORD=changez-pour-un-mot-de-passe-fort

# Replicas et processus des workers
WORKER_SCHEDULER_REPLICAS=1
WORKER_MONITORING_REPLICAS=1
WORKER_COLLECTOR_REPLICAS=4
WORKER_GENERATOR_REPLICAS=1
WORKER_COLLECTOR_PROCESSES=4
WORKER_MONITORING_PROCESSES=4
```

:::warning
Changez toujours les mots de passe par défaut de PostgreSQL et RabbitMQ en environnement de production.
:::

## 3. Démarrer l'application

```bash
make up
```

Le premier démarrage va :
1. Construire les images Docker.
2. Télécharger les images de base nécessaires.
3. Installer les dépendances PHP et Node.js.
4. Exécuter les migrations de base de données.
5. Créer l'utilisateur admin par défaut.
6. Compiler le frontend Next.js pour la production.
7. Préchauffer le cache Symfony.

:::info
Le premier démarrage peut prendre plusieurs minutes. Suivez la progression avec :

```bash
docker logs -f auditix-php-1
docker logs -f auditix-node-1
```
:::

## 4. Vérifier l'installation

```bash
make status
```

Le tableau synthétique affiche l'état, l'uptime et la consommation CPU/mémoire de chaque service.

## 5. Accéder à l'interface

Ouvrez votre navigateur et allez à :

```
http://votre-ip-serveur
```

Connectez-vous avec les identifiants par défaut :

| Champ | Valeur |
|---|---|
| Nom d'utilisateur | `admin` |
| Mot de passe | `password` |

:::danger
Changez le mot de passe admin par défaut immédiatement après votre première connexion via les paramètres du **Compte**.
:::

## Mise à jour

```bash
make upgrade
```

Cette commande télécharge les dernières modifications, reconstruit les conteneurs, vide le cache, applique les migrations et redémarre tous les services.

## Dépannage

### Page « Update in progress »

C'est la page de secours Nginx 502 affichée pendant que le conteneur Node.js compile le frontend. Attendez quelques minutes :

```bash
docker logs -f auditix-node-1
```

Lorsque vous voyez `Ready in XXXms`, l'application est prête.

### Réinitialisation complète

Pour repartir d'un état complètement propre :

```bash
make down
rm -rf data/postgres data/rabbitmq data/collections
make up
```

:::warning
Cela supprimera toutes vos données, y compris les nœuds, collectes, rapports et résultats de conformité.
:::
