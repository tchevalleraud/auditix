---
sidebar_position: 3
---

# Premiers pas

Apres avoir installe Auditix, suivez ces etapes pour configurer votre environnement.

## 1. Connexion

Accedez a votre instance Auditix et connectez-vous avec les identifiants par defaut :

- **Nom d'utilisateur** : `admin`
- **Mot de passe** : `password`

## 2. Changer votre mot de passe

Allez dans votre **Profil** (cliquez sur votre avatar en haut a droite) et changez le mot de passe par defaut.

## 3. Configurer votre contexte

Un contexte par defaut nomme "Default" est cree automatiquement. Vous pouvez le personnaliser :

1. Cliquez sur le **selecteur de contexte** dans la barre superieure
2. Allez dans l'onglet **Parametres** du contexte
3. Modifiez le nom et la description
4. Activez le **Monitoring** si vous souhaitez le monitoring SNMP/ICMP

## 4. Ajouter des fabricants et modeles

Avant d'ajouter des noeuds, configurez votre bibliotheque d'equipements :

1. Allez dans **Fabricants** dans la barre laterale
2. Creez des fabricants (ex : Cisco, Juniper, Fortinet)
3. Pour chaque fabricant, ajoutez des **Modeles** avec leurs scripts de connexion et commandes de collecte

## 5. Ajouter votre premier noeud

1. Allez dans **Noeuds** dans la barre laterale
2. Cliquez sur **Nouveau noeud**
3. Remplissez les informations :
   - **Adresse IP** (obligatoire)
   - **Nom** / **Hostname** (optionnel)
   - **Fabricant** et **Modele**
   - **Profil** (identifiants SSH)

## 6. Lancer une collecte

Une fois votre noeud configure avec un modele et un profil :

1. Ouvrez la page de detail du noeud
2. Cliquez sur le bouton **Actions**
3. Selectionnez **Collecter**
4. Ajoutez optionnellement des tags pour organiser la collecte
5. Cliquez sur **Demarrer**

La collecte s'executera en arriere-plan. Vous pouvez suivre sa progression dans l'onglet **Collectes**.

## 7. Evaluer la conformite

Apres avoir configure les politiques et regles de conformite :

1. Ouvrez la page de detail d'un noeud
2. Cliquez sur le bouton **Actions**
3. Selectionnez **Evaluer la conformite**

Le score de conformite apparaitra une fois l'evaluation terminee.

## Etapes suivantes

- [Guide utilisateur](../guide/dashboard) — Explorez toutes les fonctionnalites de l'application
- [Variables d'environnement](../admin/environment-variables) — Ajustez votre deploiement
