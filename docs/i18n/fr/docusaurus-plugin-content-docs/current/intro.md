---
sidebar_position: 1
---

# Introduction

**Auditix** est une plateforme d'audit de conformité réseau qui vous permet de collecter des données depuis vos équipements, de les évaluer face à des politiques personnalisées ou normatives, de visualiser votre topologie et de transmettre les résultats aux équipes opérationnelles et décisionnelles.

## Fonctionnalités principales

### Inventaire & données
- **Gestion des nœuds** — enregistrez routeurs, commutateurs, pare-feux ; détection automatique du fabricant et du modèle.
- **Collecte automatisée** — planifiez des collectes SSH/SNMP via des règles réutilisables ; imports en masse ZIP et CSV.
- **Catégories d'inventaire** — jeux de données typés (`interfaces`, `lldp_neighbors`, `installed_software`, …) avec colonnes personnalisables et tri par colonne, par contexte.
- **Suivi du cycle de vie** — chronologies EoS / EoSM / EoL et score « system updates » configurable, alimentés par les [plugins fournisseurs](./guide/inventory/lifecycle).

### Topologie
- **Carte interactive** — vue Cytoscape avec filtres par protocole (LLDP, OSPF, ISIS, BGP, STP), [règles de génération de liens](./guide/topology/link-rules), liens manuels, étiquettes d'aires déplaçables et arêtes zébrées multi-aires ISIS.

### Conformité
- **Règles et politiques** — éditeur visuel de match-rules, jointures multi-sources, débogage des blocs imbriqués.
- **Auto-assignation** — les politiques s'attachent automatiquement aux nœuds correspondants.

### Rapports & notifications
- **Rapports PDF** — éditeur par blocs avec graphiques, chronologie de cycle de vie, matrice de conformité, tableau de statut, recommandations et blocs topologie. Tri par colonne sur les tableaux d'inventaire, duplication de blocs.
- **Rapports e-mail** — même éditeur, sortie HTML, modes d'adressage TO / BCC / fusion.
- **Administration SMTP** — configurez plusieurs serveurs sortants TLS/SSL avec bouton de test.
- **Plannings** — phases collect/extract découplées, sélection de nœuds partagée, interface à onglets.

### Authentification & sécurité
- **OIDC multi-fournisseur** — branchez autant d'IdP que nécessaire (Azure AD, Keycloak, Google, …) avec mappings de contexte.
- **IdP interne** — politique de mot de passe et timeout d'inactivité GUI configurables.
- **2FA TOTP** — RFC 6238 avec codes de secours.
- **API REST publique v1** — authentification par jetons, Swagger UI à `/api/doc`, jetons [scopés à un seul contexte](./api/authentication).
- **Journal d'audit** — chaque événement de sécurité enregistré, parcourable, exportable.
- **Forwarding syslog** — pousse les entrées d'audit vers un ou plusieurs collecteurs SIEM en UDP/TCP/TLS.

### Opérations
- **Gestion NGINX** — basculez HTTP/HTTPS, installez les certificats SSL depuis l'interface.
- **Administration des pools de workers** — pilotez en direct collector / monitoring / generator (replicas × processus).
- **Export/import de contextes** — packagez un contexte complet (règles, politiques, profils, plannings, rapports) en archive ZIP.
- **`make status`** — tableau synthétique CLI rapide sur la santé et la consommation des conteneurs.

### Multi-langue
- Interface disponible en anglais, français, allemand, espagnol, italien et japonais, avec clés de traduction imbriquées et fallback anglais.

## Architecture

- **Backend** — Symfony 7 (PHP 8.3) avec PostgreSQL.
- **Frontend** — Next.js 15 avec React et Tailwind CSS.
- **File de messages** — RabbitMQ (collecte, conformité, monitoring, génération de rapports).
- **Temps réel** — Mercure pour les mises à jour live.
- **Reverse proxy** — NGINX.

Tous les services tournent sous forme de conteneurs Docker orchestrés via Docker Compose.

## Étapes suivantes

- [Prérequis](./getting-started/requirements)
- [Installation](./getting-started/installation)
- [Premiers pas](./getting-started/first-steps)
