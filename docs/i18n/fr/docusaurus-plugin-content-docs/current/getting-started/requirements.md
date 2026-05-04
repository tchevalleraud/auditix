---
sidebar_position: 1
---

# Prérequis

Avant d'installer Auditix, assurez-vous que votre serveur répond aux exigences suivantes.

## Configuration système

| Composant | Minimum | Recommandé |
|---|---|---|
| **OS** | Linux (toute distro) | Ubuntu 22.04+ / Debian 12+ |
| **CPU** | 2 cœurs | 4+ cœurs |
| **RAM** | 2 Go | 4+ Go |
| **Disque** | 10 Go | 20+ Go |

## Logiciels requis

| Logiciel | Version |
|---|---|
| **Docker** | 24.0+ |
| **Docker Compose** | 2.20+ |
| **Git** | 2.0+ |

### Installer Docker

Si Docker n'est pas installé sur votre serveur :

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### Vérifier l'installation

```bash
docker --version
docker compose version
```

## Accès réseau

Auditix nécessite les accès réseau suivants :

- **Sortant** : accès Internet pour télécharger les images Docker (uniquement lors de l'installation/mise à jour).
- **Entrant** : le port HTTP configuré (défaut : `80`) doit être accessible depuis les navigateurs clients.
- **Vers les équipements réseau** : accès SSH (port 22) et/ou SNMP (port 161/UDP) depuis l'hôte Docker vers vos équipements.

## Ports utilisés

| Port | Service | Description |
|---|---|---|
| 80 | Nginx | Interface web (configurable via `HTTP_PORT`). |
| 443 | Nginx | Interface web HTTPS (mode HTTPS). |
| 5432 | PostgreSQL | Base de données (interne uniquement). |
| 5672 | RabbitMQ | File de messages (interne uniquement). |
| 15672 | RabbitMQ | Interface de gestion (interne uniquement). |
| 3000 | Next.js | Frontend (interne uniquement). |
| 9000 | PHP-FPM | Backend (interne uniquement). |

:::info
Seul le port Nginx (défaut `80` ou `443` en HTTPS) doit être exposé à l'extérieur. Tous les autres services communiquent en interne via le réseau Docker.
:::
