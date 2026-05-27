# Vendor Plugins — Design Document

> Statut : **Draft** — à valider avant implémentation
> Auteur : Thibault Chevalleraud
> Cible : Auditix 5.x

## 1. Contexte et objectifs

Auditix supporte aujourd'hui un système de "Vendor Plugins" très limité : un plugin (codé en dur dans le code source) implémente `VendorPluginInterface` et expose uniquement des **données de cycle de vie** (`fetchLifecycleData()`) pour alimenter le scoring *System Updates*. Le seul plugin existant est `ExtremeNetworksPlugin`, compilé dans l'application.

Cette approche montre ses limites :

- Aucun moyen pour un éditeur tiers (Cisco, Aruba, Juniper, etc.) d'ajouter un connecteur sans modifier le code source d'Auditix.
- Aucun moyen pour la communauté de contribuer des packs vendor.
- La granularité est trop fine : un vendor a souvent besoin de bien plus que des dates de fin de vie — il a aussi des commandes d'extraction (`show version`, `show inventory`, …) et des règles de parsing (regex pour extraire la version OS, l'inventaire, etc.) qui lui sont spécifiques.

### Objectifs

1. Permettre l'installation de **plugins via upload d'un ZIP** depuis l'interface d'administration.
2. Étendre la notion de plugin : un Vendor Plugin peut désormais fournir, en plus du lifecycle, des **commandes** et des **règles d'extraction** pré-configurées pour son périmètre.
3. Permettre à chaque plugin d'exposer une **page de configuration** rendue dynamiquement dans le frontend.
4. Poser les fondations d'un futur **marketplace** (plugins officiels signés vs. communautaires non signés).
5. Garantir la sécurité de la chaîne : permissions, signatures optionnelles, isolation des fichiers.

### Non-objectifs (hors-périmètre v1)

- Sandbox d'exécution PHP (illusoire à un coût raisonnable, on documente le risque).
- Marketplace fonctionnel (on livre un endpoint stub, l'UI viendra plus tard).
- Versioning multi-actif d'un même plugin (une seule version installée à la fois).
- Hot-reload sans restart des workers (un install/update implique un redémarrage des workers Messenger).

---

## 2. Vue d'ensemble architecturale

```
┌────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                       │
│                                                                 │
│  Settings > Vendor plugins (NEW, global)                        │
│  ├── Liste des plugins installés                                │
│  ├── Upload ZIP                                                 │
│  ├── Badge Officiel/Communautaire                               │
│  └── Page de config par plugin (form généré dynamiquement)      │
│                                                                 │
│  Settings > System updates (inchangé, contextuel)               │
│  └── Active/désactive le plugin pour ce contexte + paramètres   │
└────────────────────────────────────────────────────────────────┘
                                │
                                ▼ HTTP/JSON
┌────────────────────────────────────────────────────────────────┐
│                       BACKEND (Symfony)                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PluginInstaller (NEW)                                   │   │
│  │  Upload ZIP → validation manifest → SHA-256 → signature  │   │
│  │  → extraction vers data/plugins/{id}/{version}/          │   │
│  │  → insertion InstalledPlugin en DB                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  DynamicPluginLoader (NEW, kernel.boot)                  │   │
│  │  Scan data/plugins/ → autoload PSR-4 isolé               │   │
│  │  → instancie les plugins → enregistre dans le Registry   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  VendorPluginRegistry (REFACTORÉ)                        │   │
│  │  Source 1 : plugins statiques (DI tags) — historique     │   │
│  │  Source 2 : plugins dynamiques (chargés depuis FS)       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PluginAssetsImporter (NEW)                              │   │
│  │  À l'activation par contexte :                           │   │
│  │   import des CollectionCommand / CollectionRule depuis   │   │
│  │   les YAML du plugin (flag managed_by_plugin=true)       │   │
│  │  À la désactivation : suppression complète               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Pipeline existant (SyncLifecycle, CollectNode, …) inchangé,    │
│  consomme désormais des plugins venant des deux sources.        │
└────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                ┌───────────────────────────────┐
                │   Filesystem                  │
                │   data/plugins/{id}/{version} │
                │                               │
                │   PostgreSQL                  │
                │   - installed_plugin (NEW)    │
                │   - vendor_plugin (existant)  │
                │   - collection_command (+col) │
                │   - collection_rule (+col)    │
                └───────────────────────────────┘
```

---

## 3. Format d'un plugin

### 3.1 Structure du ZIP

```
extreme-networks-1.2.0.zip
├── plugin.yaml                  ← manifest, OBLIGATOIRE
├── signature.sig                ← signature détachée Ed25519, OPTIONNEL
├── src/                         ← code PHP, OBLIGATOIRE
│   ├── ExtremeNetworksPlugin.php
│   └── Scraper/
│       └── LifecycleScraper.php
├── resources/                   ← assets pré-configurés, OPTIONNEL
│   ├── commands/
│   │   ├── show-version.yaml
│   │   └── show-inventory.yaml
│   └── rules/
│       ├── parse-version.yaml
│       └── parse-inventory.yaml
├── icon.png                     ← icône 128x128, OPTIONNEL (affichée dans le menu)
└── README.md                    ← documentation utilisateur, OPTIONNEL
```

### 3.2 Manifest (`plugin.yaml`)

```yaml
# Métadonnées
identifier: extreme-networks         # unique, kebab-case, [a-z0-9-]+
version: 1.2.0                       # semver strict
name: "Extreme Networks"             # libellé affiché
description: "Connecteur officiel pour les équipements Extreme Networks (EXOS, VOSS)."
author: "Auditix"
homepage: "https://auditix.io/plugins/extreme-networks"
license: "MIT"
icon: icon.png                       # chemin relatif dans le ZIP

# Compatibilité
requires:
  auditix: ">=5.0.0,<6.0.0"          # contrainte semver sur Auditix
  php: ">=8.3"

# Point d'entrée PHP
entrypoint:
  namespace: "Auditix\\Plugin\\ExtremeNetworks"
  class: "ExtremeNetworksPlugin"     # classe principale, dans src/ExtremeNetworksPlugin.php

# Capabilities déclarées (informatif — la vérité reste les interfaces implémentées)
capabilities:
  - lifecycle                        # implémente ProvidesLifecycleData
  - commands                         # implémente ProvidesCommands
  - rules                            # implémente ProvidesExtractionRules
  - configuration                    # implémente ProvidesConfigurationSchema

# Vendors couverts (utilisé pour matcher Editor.name → plugin)
manufacturers:
  - "Extreme Networks"
  - "Extreme"
  - "Enterasys"

# Signature (rempli automatiquement par l'outil de signature)
signature:
  key_id: "auditix-official-2026"    # identifie la clé publique côté Auditix
  algorithm: "ed25519"
  # le fichier signature.sig contient la signature détachée du ZIP sans signature.sig
```

### 3.3 Format d'une commande pré-configurée (`resources/commands/*.yaml`)

```yaml
name: "show version"
description: "Récupère la version EXOS"
commands: |
  show version
folder: "Extreme Networks/EXOS"      # créé si absent (TYPE_MANUFACTURER / TYPE_MODEL)
enabled: true
```

### 3.4 Format d'une règle pré-configurée (`resources/rules/*.yaml`)

```yaml
name: "Parse EXOS version"
description: "Extrait la version OS depuis 'show version'"
folder: "Extreme Networks/EXOS"
source: SSH                          # ou LOCAL
command: "show version"              # match avec une CollectionCommand
enabled: true

extracts:
  - name: "os-version"
    regex: '/Image\s+:\s+ExtremeXOS\s+version\s+(\S+)/'
    multiline: false
    extract_mode: LINE               # ou BLOCK
    key_mode: MANUAL
    key_manual: "version"
    value_group: 1
    node_field: discoveredVersion    # met à jour Node.discoveredVersion
```

---

## 4. Interfaces composables (contrats publics)

L'interface unique `VendorPluginInterface` actuelle est cassée en plusieurs interfaces composables. Un plugin implémente l'interface de base + zéro ou plusieurs interfaces de capabilities.

### 4.1 Interface de base (obligatoire)

```php
namespace App\Plugin;

interface VendorPluginInterface
{
    public function getIdentifier(): string;     // kebab-case, unique
    public function getVersion(): string;         // semver
    public function getDisplayName(): string;
    public function getDescription(): string;
    /** @return string[] */
    public function getSupportedManufacturers(): array;
}
```

### 4.2 Capability : données de cycle de vie

```php
namespace App\Plugin\Capability;

interface ProvidesLifecycleData
{
    /**
     * @return LifecycleData[]
     */
    public function fetchLifecycleData(Context $context, array $configuration): array;
}
```

**Note** : c'est la méthode déjà existante, juste extraite dans une interface dédiée. `ExtremeNetworksPlugin` migre vers ce contrat sans changement métier.

### 4.3 Capability : commandes d'extraction pré-configurées

```php
namespace App\Plugin\Capability;

interface ProvidesCommands
{
    /**
     * Retourne les templates de commandes que ce plugin propose d'installer.
     * Appelé une fois à l'activation du plugin dans un contexte.
     *
     * @return CommandTemplate[]
     */
    public function provideCommands(): array;
}

final class CommandTemplate
{
    public function __construct(
        public readonly string $name,
        public readonly string $description,
        public readonly string $commands,         // contenu multiligne
        public readonly string $folderPath,       // ex: "Extreme Networks/EXOS"
        public readonly bool $enabled = true,
    ) {}
}
```

### 4.4 Capability : règles d'extraction pré-configurées

```php
namespace App\Plugin\Capability;

interface ProvidesExtractionRules
{
    /**
     * @return RuleTemplate[]
     */
    public function provideRules(): array;
}

final class RuleTemplate
{
    public function __construct(
        public readonly string $name,
        public readonly string $description,
        public readonly string $folderPath,
        public readonly string $source,          // 'LOCAL' | 'SSH'
        public readonly ?string $command,
        public readonly bool $enabled,
        /** @var ExtractTemplate[] */
        public readonly array $extracts,
    ) {}
}
```

### 4.5 Capability : page de configuration

```php
namespace App\Plugin\Capability;

interface ProvidesConfigurationSchema
{
    /**
     * Schéma JSON (subset) décrivant les champs de configuration.
     * Rendu par le frontend via un form generator générique.
     */
    public function getConfigurationSchema(): array;
}
```

Format du schéma (volontairement simple) :

```php
[
    'fields' => [
        [
            'name' => 'api_key',
            'type' => 'password',              // text | password | number | boolean | select | textarea
            'label' => 'API Key',
            'help' => 'Clé API fournie par Extreme Networks',
            'required' => true,
            'default' => null,
        ],
        [
            'name' => 'region',
            'type' => 'select',
            'label' => 'Région',
            'options' => [
                ['value' => 'us', 'label' => 'États-Unis'],
                ['value' => 'eu', 'label' => 'Europe'],
            ],
            'default' => 'eu',
        ],
    ],
]
```

### 4.6 Conventions

- Toutes les méthodes sont **idempotentes** : appelables plusieurs fois sans effet de bord.
- Aucune méthode ne doit avoir d'effet de bord en dehors de retourner ses données (pas d'écriture en DB, pas d'appel HTTP non nécessaire).
- Pour `fetchLifecycleData()`, les appels HTTP sont attendus mais doivent respecter un timeout raisonnable (60s max).

---

## 5. Modèle de données

### 5.1 Nouvelle entité : `InstalledPlugin`

Représente un plugin **installé sur l'instance** (niveau global, indépendant du contexte).

```sql
CREATE TABLE installed_plugin (
    id              SERIAL PRIMARY KEY,
    identifier      VARCHAR(128) NOT NULL UNIQUE,
    version         VARCHAR(32)  NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    author          VARCHAR(255),
    homepage        TEXT,
    license         VARCHAR(64),

    manifest        JSONB        NOT NULL,            -- copie complète du plugin.yaml
    archive_path    VARCHAR(512) NOT NULL,            -- ex: data/plugins/extreme-networks/1.2.0/

    sha256          CHAR(64)     NOT NULL,            -- hash du ZIP d'origine
    signature_status VARCHAR(32) NOT NULL,            -- 'official' | 'community' | 'invalid'
    signature_key_id VARCHAR(128),                    -- clé publique utilisée pour la vérif

    installed_by_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    installed_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

Une seule version d'un plugin est installée à la fois (contrainte UNIQUE sur `identifier`). Un update remplace l'entrée et le dossier filesystem.

### 5.2 Entité existante : `VendorPlugin` (inchangée)

Reste la table d'**activation par contexte**. Le `plugin_identifier` doit matcher un `InstalledPlugin.identifier` actif (sinon ligne ignorée au runtime, avec warning dans les logs).

### 5.3 Modifications sur `CollectionCommand` et `CollectionRule`

Ajout d'un flag pour distinguer les objets gérés par un plugin des objets créés par l'utilisateur :

```sql
ALTER TABLE collection_command
    ADD COLUMN managed_by_plugin VARCHAR(128) NULL;  -- identifier du plugin, NULL si user-created

ALTER TABLE collection_rule
    ADD COLUMN managed_by_plugin VARCHAR(128) NULL;

CREATE INDEX idx_collection_command_managed_by_plugin
    ON collection_command(managed_by_plugin);
CREATE INDEX idx_collection_rule_managed_by_plugin
    ON collection_rule(managed_by_plugin);
```

**Règles métier associées** :

- Si `managed_by_plugin IS NOT NULL` : l'UI affiche un badge "Géré par {plugin}" et désactive l'édition. Seuls les champs `enabled` (boolean) restent modifiables.
- À la **désactivation** du plugin dans un contexte : suppression de tous les `collection_command` et `collection_rule` où `managed_by_plugin = ?` ET `context_id = ?`.
- À la **désinstallation** du plugin de l'instance : refus si au moins un contexte l'a encore activé. L'admin doit désactiver d'abord.
- À l'**update** d'un plugin : pour chaque contexte qui l'avait activé, on rejoue désactivation puis activation (= suppression puis re-import des templates). Garantit la cohérence sans gérer de conflit.

### 5.4 Dossiers `CollectionFolder` / `CollectionRuleFolder`

Les dossiers créés par le plugin (pour ranger ses commandes/règles) sont également marqués `managed_by_plugin`. Ils sont supprimés à la désactivation **uniquement s'ils sont vides** (un user pourrait y avoir ajouté ses propres items).

---

## 6. Chargement dynamique des plugins

### 6.1 Cycle au boot du kernel

1. `DynamicPluginLoader::load()` est appelé sur l'event `kernel.boot` (priorité haute).
2. Il interroge le repository `InstalledPluginRepository` pour récupérer les plugins installés et non corrompus.
3. Pour chaque plugin :
   - Vérifie que le dossier `archive_path` existe et que le hash SHA-256 correspond toujours (détection altération).
   - Si OK : enregistre le namespace dans un autoloader PSR-4 isolé (`Symfony\Component\ClassLoader\ClassLoader` ou Composer ClassLoader instancié à la main).
   - Instancie la classe d'entrée (`new {namespace}\\{class}()`).
   - Push dans le `VendorPluginRegistry`.
4. Logs : un plugin qui échoue à charger est marqué `signature_status = 'invalid'` et un warning est émis. Les autres plugins continuent à charger.

### 6.2 Pourquoi pas via DI tags ?

Symfony **compile** son container au build, et le cache est figé. Enregistrer un service en runtime nécessiterait :

- Soit un `bin/console cache:clear` à chaque install (lent, ~30s en prod, et il faut redémarrer les workers Messenger).
- Soit un container compilé à part — complexe et fragile.

L'approche "registre runtime" garde le système simple : les plugins dynamiques contournent le container, on les charge à la main au boot. Les plugins statiques (taggés via DI) continuent de fonctionner.

### 6.3 Redémarrage des workers après install/update

Les workers Messenger doivent recharger leur code → un endpoint d'install déclenche, après réussite, l'envoi d'un signal `SIGTERM` aux workers (déjà gérés par le supervisord du container `worker-scheduler`). Ils redémarrent et chargent le nouveau plugin.

### 6.4 Risque d'autoloader

Deux plugins ne peuvent pas déclarer le même namespace racine. Le `DynamicPluginLoader` détecte les collisions et refuse de charger le plugin en double, en marquant `signature_status = 'invalid'`.

---

## 7. Sécurité

### 7.1 Permissions

- Upload, install, update, désinstall : `ROLE_SUPER_ADMIN` uniquement.
- Activation/désactivation par contexte : `ROLE_ADMIN` (du contexte).
- Lecture (liste des plugins installés, leur statut) : tout utilisateur authentifié sur le contexte concerné.

Toutes les actions admin sont **auditées** : nouvelle table `plugin_audit_log` avec `action`, `plugin_identifier`, `version`, `user_id`, `ip`, `timestamp`, `details JSONB`.

### 7.2 Validation à l'install

1. Taille du ZIP : max 50 MB.
2. Nombre de fichiers : max 1000.
3. Aucun fichier hors du dossier d'extraction (protection zip-slip).
4. Le manifest est obligatoire et valide selon un schéma JSON.
5. `identifier` ne doit pas être déjà installé (sauf si l'opération est explicitement un "update").
6. Le namespace PHP déclaré dans le manifest doit correspondre aux fichiers fournis.
7. Aucune classe ne peut redéclarer une classe existante du namespace `App\`.

### 7.3 Signatures (plugins officiels)

- Auditix embarque une liste de clés publiques Ed25519 dans `config/plugin_keys.yaml`.
- Un plugin officiel inclut `signature.sig` (signature détachée du ZIP **sans** ce fichier).
- À l'install, on vérifie la signature avec la clé `signature.key_id` du manifest.
- Résultat :
  - Signature valide et clé connue → `signature_status = 'official'` → badge vert "Officiel".
  - Pas de signature → `signature_status = 'community'` → badge orange "Communautaire" + écran de confirmation explicite obligatoire à l'install ("Ce plugin n'est pas signé. Il peut exécuter du code arbitraire sur votre serveur Auditix. N'installez que des plugins de sources de confiance.").
  - Signature présente mais invalide → install refusé.

### 7.4 Outil CLI de signature

`php bin/console app:plugin:sign <plugin.zip> <private-key.pem>` — produit le ZIP signé. Utilisé en interne pour signer les plugins officiels avant publication.

### 7.5 Sandboxing (NON fait)

Pas de sandbox PHP. Trop coûteux à mettre en place de manière fiable (php-runkit déprécié, séparation par processus = grosse latence, conteneurs par plugin = overkill pour v1).

**Mitigation par la doc** : la page d'install affiche clairement le risque, la doc explique qu'un plugin a un accès total à l'instance Auditix (BDD comprise), et que l'admin engage sa responsabilité.

---

## 8. Frontend

### 8.1 Nouveau menu

Dans `frontend/src/app/(authenticated)/settings/layout.tsx`, ajouter dans `globalItems` :

```ts
{ label: t("settings.tabVendorPlugins"), tab: "vendorPlugins", icon: Package }
```

La page `Settings > System updates` reste exactement comme aujourd'hui (config du scoring, dates lifecycle, activation par contexte). Le `PluginManager` actuel y reste mais devient un simple sélecteur "quel plugin lifecycle activer pour ce contexte" parmi les plugins installés qui implémentent `ProvidesLifecycleData`.

### 8.2 Page Vendor Plugins (`?tab=vendorPlugins`)

Trois sections :

1. **Plugins installés** : liste avec colonnes Identifier, Version, Author, Capabilities (badges), Signature (badge), Installed at, Actions (Configurer / Mettre à jour / Désinstaller).
2. **Upload** : zone drag & drop, validation côté client (`.zip`, ≤50 MB), POST `/api/admin/vendor-plugins`. Affiche les erreurs de validation backend.
3. **Marketplace** *(stub)* : affiche un placeholder "Bientôt disponible" pour la v1.

### 8.3 Page de configuration d'un plugin

Route : `/settings?tab=vendorPlugins&plugin={identifier}`.

Form généré dynamiquement à partir du schéma retourné par `getConfigurationSchema()`. On crée un composant `<DynamicForm schema={...} value={...} onChange={...} />` qui sait rendre les types `text`, `password`, `number`, `boolean`, `select`, `textarea`.

Bouton "Tester la configuration" optionnel (POST sur un endpoint par plugin si le plugin l'expose — pas en v1).

### 8.4 Indication "managed_by_plugin"

Dans les écrans existants Collection Commands et Collection Rules :

- Badge "Géré par {plugin name}" sur les lignes concernées.
- Champs en lecture seule, sauf `enabled`.
- Tooltip explicatif au survol.

---

## 9. Marketplace (stub v1)

### 9.1 Endpoint

```
GET /api/admin/marketplace/plugins
```

Réponse : liste de plugins disponibles depuis une URL configurée dans `parameters.yaml` (vide par défaut).

```json
{
  "plugins": [
    {
      "identifier": "cisco-ios",
      "name": "Cisco IOS",
      "version": "1.0.0",
      "author": "Auditix",
      "signature_status": "official",
      "description": "...",
      "download_url": "https://marketplace.auditix.io/plugins/cisco-ios-1.0.0.zip"
    }
  ]
}
```

### 9.2 UI

Onglet "Marketplace" caché derrière un feature flag `marketplace_enabled` (off par défaut en v1). L'infra est en place, on activera dans une v2.

---

## 10. Plan d'implémentation par phases

Chaque phase = une PR mergeable indépendamment (back + front + migration + tests).

### Phase 1 — Refactor interfaces & chargement dynamique

**Backend**

- Découper `VendorPluginInterface` en interface de base + capabilities (`ProvidesLifecycleData`, `ProvidesCommands`, `ProvidesExtractionRules`, `ProvidesConfigurationSchema`).
- Adapter `VendorPluginRegistry` pour accepter deux sources (statiques DI + dynamiques runtime).
- Créer `DynamicPluginLoader` (non encore branché — pas de plugins à charger).
- Migrer `ExtremeNetworksPlugin` vers les nouvelles interfaces (sans changement métier).
- Adapter `SyncLifecycleMessageHandler` pour faire un `instanceof ProvidesLifecycleData`.

**Tests** : couvrir le registry hybride et les conversions de capabilities.

**Pas de changement visible côté user.**

### Phase 2 — Install via upload

**Backend**

- Entité + migration `InstalledPlugin` + table `plugin_audit_log`.
- Service `PluginInstaller` : extraction sécurisée, validation manifest, hash SHA-256.
- Endpoint `POST /api/admin/vendor-plugins` (upload), `DELETE /api/admin/vendor-plugins/{identifier}` (désinstall), `GET /api/admin/vendor-plugins` (liste).
- Permission ROLE_SUPER_ADMIN, audit log.
- Brancher `DynamicPluginLoader` au boot.
- Convertir `ExtremeNetworksPlugin` en plugin uploadable par défaut (extrait du code source dans un ZIP livré avec l'install). Garde-fou : si la base est vide au démarrage, installer automatiquement le ZIP d'origine.

### Phase 3 — Commandes & règles pré-configurées

**Backend**

- Ajout des colonnes `managed_by_plugin` aux 4 tables concernées + migration.
- Service `PluginAssetsImporter` (parse YAML, crée les entités).
- Hook activation/désactivation (sur `PUT /api/plugins/{identifier}`) qui importe ou supprime.
- Adaptation des écrans Commands/Rules pour rendre les objets gérés non-éditables (champs en lecture seule sauf `enabled`).

### Phase 4 — Signatures et marketplace stub

**Backend**

- `config/plugin_keys.yaml` avec une clé Auditix d'exemple.
- `SignatureVerifier` Ed25519 (via `sodium_crypto_sign_verify_detached`).
- Endpoint marketplace stub.
- Commande CLI `app:plugin:sign`.

### Phase 5 — Frontend

- Nouveau menu Vendor Plugins (`globalItems`).
- Page liste + upload.
- Page de config dynamique (composant `<DynamicForm>`).
- Badges signature, badges "managed by plugin" dans Commands/Rules.
- I18n (fr + en).

---

## 11. Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Plugin malveillant uploadé par un super-admin compromis | Critique (RCE) | Limiter ROLE_SUPER_ADMIN, audit log, signature pour les plugins officiels, écran de confirmation explicite pour les communautaires |
| Plugin qui plante au boot et empêche le kernel de démarrer | Élevé | Try/catch global dans `DynamicPluginLoader`, marquage `invalid`, log d'erreur, kernel boot normalement |
| Plugin qui consomme toutes les ressources (boucle infinie dans `fetchLifecycleData`) | Moyen | Timeout strict dans le handler async, kill du worker si dépassé |
| Conflit de namespace entre deux plugins | Moyen | Détection à l'install, refus du second |
| Altération du ZIP sur disque après install | Moyen | Re-vérif SHA-256 au boot, marquage `invalid` si mismatch |
| Plugin actif dans un contexte mais désinstallé de l'instance | Faible | La ligne `vendor_plugin` devient orpheline → warning dans les logs, ignoré au runtime, UI affiche un état "Plugin manquant : à réinstaller ou désactiver" |

---

## 12. Annexe — Exemple complet d'un plugin minimal

### `plugin.yaml`

```yaml
identifier: hello-world
version: 0.1.0
name: "Hello World"
description: "Plugin de démonstration."
author: "Anonymous"
license: "MIT"

requires:
  auditix: ">=5.0.0"
  php: ">=8.3"

entrypoint:
  namespace: "Auditix\\Plugin\\HelloWorld"
  class: "HelloWorldPlugin"

capabilities:
  - configuration

manufacturers: []
```

### `src/HelloWorldPlugin.php`

```php
<?php

namespace Auditix\Plugin\HelloWorld;

use App\Plugin\VendorPluginInterface;
use App\Plugin\Capability\ProvidesConfigurationSchema;

final class HelloWorldPlugin implements VendorPluginInterface, ProvidesConfigurationSchema
{
    public function getIdentifier(): string     { return 'hello-world'; }
    public function getVersion(): string         { return '0.1.0'; }
    public function getDisplayName(): string     { return 'Hello World'; }
    public function getDescription(): string     { return 'Plugin de démonstration.'; }
    public function getSupportedManufacturers(): array { return []; }

    public function getConfigurationSchema(): array
    {
        return [
            'fields' => [
                [
                    'name' => 'greeting',
                    'type' => 'text',
                    'label' => 'Message de bienvenue',
                    'default' => 'Hello, world!',
                ],
            ],
        ];
    }
}
```

C'est tout. ZIPpé, uploadé, ce plugin apparaît dans la liste, expose sa page de config — sans fournir ni lifecycle, ni commandes, ni règles.

---

## 13. Décisions figées

- [x] **Stockage des plugins** : `data/plugins/{identifier}/{version}/` à côté de `data/collections/`.
- [x] **Nom du menu frontend** : "Vendor plugins" (cohérent avec le nom interne).
- [x] **Activations orphelines** : garder en DB une `VendorPlugin` dont le plugin a été désinstallé, avec un état "plugin manquant" affiché dans l'UI ; permet la réinstallation sans perdre la config par contexte.
- [x] **Auto-install de l'`ExtremeNetworksPlugin` packagé** au premier démarrage (Phase 2) : oui — préserve la continuité avec l'existant.
- [x] **Versioning du manifest** : champ `manifest_version: 1` obligatoire — permet d'évoluer le format plus tard sans tout casser.

## 14. État d'avancement

- [x] **Phase 1** — Refactor interfaces & registre hybride + squelette DynamicPluginLoader (mergeable, aucun changement visible côté utilisateur).
- [x] **Phase 2** — Install via upload : entité `InstalledPlugin`, endpoints `/api/admin/vendor-plugins` (GET/POST/DELETE, `ROLE_ADMIN`), `PluginInstaller` + `PluginManifestValidator`, `DynamicPluginBootstrapper` (kernel.request + console.command, idempotent), audit via `AuditLog` existant. Stockage `app/var/plugins/{id}/{version}/` (gitignored, partagé entre workers via le volume `./app`). Commandes CLI : `app:plugin:install`, `app:plugin:list`, `app:plugin:uninstall`. **Décalage vs design initial** : (1) on utilise `ROLE_ADMIN` (cohérent avec le reste du projet), pas `ROLE_SUPER_ADMIN` ; (2) repackaging d'`ExtremeNetworksPlugin` en ZIP **reporté** — il garde sa dépendance DI vers `ExtremeNetworksScraper`, qu'on ne peut pas injecter facilement dans un plugin runtime ; ce sera traité en Phase 4 quand on aura un mécanisme d'injection ciblée pour les plugins dynamiques.
- [x] **Phase 3** — Commandes & règles pré-configurées : colonnes `managed_by_plugin` sur `collection_command/_rule/_folder/_rule_folder`, `PluginAssetsImporter` (import/remove avec cache local anti-doublons + flush-per-folder), hook activation/désactivation dans `PluginController::update()`, garde-fou désinstall si activations actives, controllers Command/Rule/Folder qui refusent edit/delete sur objets managés (sauf toggle `enabled`), badges UI violets dans les pages collection-commands et collection-rules, commandes CLI `app:plugin:activate` et `app:plugin:deactivate`.
- [x] **Phase 4** — Signatures Ed25519 + marketplace stub : `config/plugin_keys.yaml` (vide par défaut) chargé par `PluginKeyRegistry`, `PluginSignatureVerifier` (digest SHA-512 déterministe sur le tree extrait sauf `signature.sig`, vérif via `sodium_crypto_sign_verify_detached`), branché dans `PluginInstaller` qui refuse l'install si signature présente + clé inconnue ou invalide. Commandes CLI `app:plugin:keygen` (génère paire Ed25519) et `app:plugin:sign <zip> <priv> <key-id>` (signe et embed `signature.sig` + section `signature` dans `plugin.yaml`). Endpoint `GET /api/admin/marketplace/plugins` (stub : retourne `{enabled:false, plugins:[]}` si `MARKETPLACE_URL` non configurée, sinon proxy l'upstream). Statuts validés E2E : (1) unsigned → `community`, (2) signed-key-unknown → install refusé avec liste des clés connues, (3) signed-key-trusted → `official` avec `signature_key_id` stocké, (4) tampered ZIP → `Signature verification failed.`
- [x] **Phase 5** — Frontend : nouvelle page `/settings/global/vendor-plugins` (entry dans `globalItems` du `SettingsLayout` avec icône Package), composant React avec drag-and-drop ZIP, validation client (extension + taille), modal de confirmation explicite "Install plugin from unknown source" obligatoire avant tout upload, liste des plugins installés avec badges signature (vert `Officiel` / orange `Communautaire` / rouge `Invalide`) et capabilities, désinstallation avec confirm inline. I18n FR+EN (`sidebar.vendorPlugins` + bloc `vendorPlugins.*`). Smoke : route HTTP 307 (redirect login OK = page compile).
- [x] **Phase 5.1** — Form de config dynamique par contexte : nouveau composant `<PluginConfigureModal>` qui rend dynamiquement `getConfigurationSchema()` (types `text`, `password`, `number`, `boolean`, `select`, `textarea`), seed automatique depuis valeur courante ou `default`. Branché dans le `PluginManager` historique (Settings > System Updates) via un bouton "Configurer" visible si le plugin expose un schema non-vide. Sauvegarde via `PUT /api/plugins/{id}?context={ctx}` avec `{configuration: {...}}`. I18n FR+EN.
- [x] **Phase 5.2** — Page contextuelle dédiée `Settings > Vendor plugins` : nouvel onglet contextuel (`tab=vendorPlugins`, icône Package, après System Updates), composant `<VendorPluginsContextual>` en vue cartes (badges version + capabilities + signature, toggle enable/disable, bouton Configurer, bouton Sync pour les plugins lifecycle). Le bloc plugins est retiré de System Updates (remplacé par un lien vers le nouvel onglet). `GET /api/plugins?context=X` enrichi avec `signatureStatus` et `signatureKeyId` lookupés dans `installed_plugin`. I18n FR+EN (`settings.tabVendorPlugins`, `settings.pluginsMovedHelp`, bloc `vendorPluginsCtx.*`).
- [x] **Phase 5.3** — Export de plugin (pour partage / marketplace) : service `PluginPackager` qui re-zippe un dossier extrait, endpoint `GET /api/admin/vendor-plugins/{id}/export` (ROLE_ADMIN, retourne `BinaryFileResponse` avec `Content-Disposition: attachment`), commande CLI `app:plugin:export <id> [output]`, bouton Download dans l'UI globale. **Test E2E critique validé** : un plugin signé exporté puis ré-importé reste `official` avec le même `signature_key_id` — la signature survit au re-zip parce que le digest `PluginSignatureVerifier` est calculé sur le contenu trié des fichiers (sauf `signature.sig`), indépendamment de l'ordre des entrées ZIP.
- [x] **Phase 6** — Catalogue : nouvelles capabilities `ProvidesManufacturers` (création d'`Editor` avec logo copié depuis le ZIP vers `var/uploads/logos/`) et `ProvidesDeviceModels` (résolution du manufacturer par nom via cache local). Migration `managed_by_plugin` ajoutée à `editor` et `device_model`. Controllers Editor + DeviceModel refusent edit/delete sur entités managées. `PluginAssetsImporter` étendu : ordre d'import manufacturers → device models → commands → rules ; ordre de purge inverse (rules → commands → models → manufacturers → folders) ; tout dans une transaction. **Décomposition livrée** : ancien plugin `extreme_networks` monolithique supprimé (et code statique `App\Plugin\Vendor\ExtremeNetworksPlugin` + `ExtremeNetworksScraper`), remplacé par deux plugins séparés : `extreme-networks` (catalogue : manufacturer + 4 OS models + 5 commands Fabric Engine + 2 rules avec extracts) et `extreme-networks-lifecycle` (scraping HTML + PDF EoS). Le user peut installer/activer l'un sans l'autre.
