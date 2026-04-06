---
sidebar_position: 1
---

# Prerequis

Avant d'installer Auditix, assurez-vous que votre serveur repond aux exigences suivantes.

## Configuration systeme

| Composant     | Minimum            | Recommande          |
|---------------|--------------------|---------------------|
| **OS**        | Linux (toute distro) | Ubuntu 22.04+ / Debian 12+ |
| **CPU**       | 2 coeurs           | 4+ coeurs           |
| **RAM**       | 2 Go               | 4+ Go               |
| **Disque**    | 10 Go              | 20+ Go              |

## Logiciels requis

| Logiciel           | Version  |
|--------------------|----------|
| **Docker**         | 24.0+    |
| **Docker Compose** | 2.20+    |
| **Git**            | 2.0+     |

### Installer Docker

Si Docker n'est pas installe sur votre serveur :

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### Verifier l'installation

```bash
docker --version
docker compose version
```

## Acces reseau

Auditix necessite les acces reseau suivants :

- **Sortant** : Acces Internet pour telecharger les images Docker (uniquement lors de l'installation/mise a jour)
- **Entrant** : Le port HTTP configure (defaut : `80`) doit etre accessible depuis les navigateurs clients
- **Vers les equipements reseau** : Acces SSH (port 22) et/ou SNMP (port 161/UDP) depuis l'hote Docker vers vos equipements

## Ports utilises

| Port  | Service    | Description                          |
|-------|------------|--------------------------------------|
| 80    | Nginx      | Interface web (configurable via `HTTP_PORT`) |
| 5432  | PostgreSQL | Base de donnees (interne uniquement) |
| 5672  | RabbitMQ   | File de messages (interne uniquement) |
| 15672 | RabbitMQ   | Interface de gestion (interne uniquement) |
| 3000  | Next.js    | Frontend (interne uniquement)        |
| 9000  | PHP-FPM    | Backend (interne uniquement)         |

:::info
Seul le port Nginx (defaut `80`) doit etre expose a l'exterieur. Tous les autres services communiquent en interne via le reseau Docker.
:::
