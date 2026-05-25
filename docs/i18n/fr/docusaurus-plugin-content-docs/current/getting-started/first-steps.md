---
sidebar_position: 3
---

# Premiers pas

Après avoir installé Auditix, suivez ces étapes pour configurer votre environnement.

## 1. Connexion

Accédez à votre instance Auditix et connectez-vous avec les identifiants par défaut :

- **Nom d'utilisateur** : `admin`
- **Mot de passe** : `password`

## 2. Changer votre mot de passe

Allez dans **Compte → Sécurité** (cliquez sur votre avatar en haut à droite) et changez le mot de passe par défaut. Activez la [2FA TOTP](../admin/authentication/2fa) dans la foulée si votre stratégie le permet.

## 3. Configurer votre contexte

Un contexte par défaut nommé « Default » est créé automatiquement. Vous pouvez le personnaliser :

1. Cliquez sur le **sélecteur de contexte** dans la barre supérieure.
2. Allez dans l'onglet **Paramètres** du contexte.
3. Modifiez le nom et la description.
4. Activez le **Monitoring** si vous souhaitez le polling SNMP/ICMP.

## 4. Ajouter fabricants et modèles

Avant d'ajouter des nœuds, configurez votre bibliothèque d'équipements :

1. Allez dans **Fabricants** dans la barre latérale.
2. Créez des fabricants (ex. Cisco, Juniper, Fortinet).
3. Pour chaque fabricant, ajoutez des **Modèles** avec leurs scripts de connexion et commandes de collecte.

## 5. Ajouter votre premier nœud

Vous pouvez créer les nœuds un par un, ou tous d'un coup via un import CSV depuis la liste des nœuds.

1. Allez dans **Nœuds** dans la barre latérale.
2. Cliquez sur **Nouveau nœud**.
3. Remplissez les informations :
   - **Adresse IP** (obligatoire),
   - **Nom** / **Hostname** (optionnel),
   - **Fabricant** et **Modèle**,
   - **Profil** (identifiants SSH).

## 6. Tester le profil

Avant de lancer une collecte, vérifiez le profil avec **Profil → Tester** : Auditix tente une connexion live et reporte la latence et le banner SSH/SNMP — c'est le moyen le plus rapide de détecter une mauvaise crédential ou un firewall qui filtre.

## 7. Lancer une collecte

1. Ouvrez la page de détail du nœud.
2. Cliquez sur **Actions → Collecter**.
3. Suivez la progression dans l'onglet **Collectes** (mises à jour live via Mercure).

## 8. Évaluer la conformité

Après avoir configuré politiques et règles de conformité :

1. Ouvrez la page de détail d'un nœud.
2. Cliquez sur **Actions → Évaluer la conformité**.

Le score de conformité apparaîtra une fois l'évaluation terminée.

## 9. Automatiser

Plutôt que de tout déclencher à la main, créez un [planning](../guide/schedules) qui enchaîne collecte → extraction → conformité → rapport → e-mail à la fréquence souhaitée.

## Étapes suivantes

- [Guide utilisateur](../guide/dashboard) — explorez toutes les fonctionnalités.
- [Variables d'environnement](../admin/environment-variables) — ajustez votre déploiement.
- [API REST](../api/overview) — automatisez Auditix depuis vos scripts.
