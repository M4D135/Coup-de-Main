# Coup de Main

**Version 2.1.1 · Un crayon. Trois mondes. Douze compagnons à guider.**

[Sources et versions publiques](https://github.com/M4D135/Coup-de-Main)

Coup de Main est un jeu de réflexion en français. Les personnages avancent seuls ; le joueur dessine leurs passages, répartit la troupe et commande les mécanismes du décor. Chaque monde propose désormais **un voyage en trois actes**, soit **neuf énigmes**. Chaque tableau introduit une nouvelle situation à comprendre et de nouveaux gestes à préparer.

| Monde | Les trois actes du voyage | Principe |
| --- | --- | --- |
| **Les Boucles** | Le poids de l’entraide ; Les éclaireurs des rives ; Le dernier fil | Faire contribuer une partie de la troupe, ouvrir la route des autres et récupérer l’encre d’un passage devenu inutile |
| **Petits Plis** | Le vent a ses raisons ; Le moulin et le verrou ; Les deux équipes | Orienter le vent, maintenir une passerelle et coordonner deux groupes |
| **Les Veilleurs** | La mécanique du soir ; Le passage du balancier ; L’atelier à l’unisson | Utiliser la balance et l’ascenseur, maîtriser le danger puis réunir les deux itinéraires |

Les trois mondes sont accessibles depuis l’accueil. Un voyage commence avec **12 compagnons**. Les survivants poursuivent dans l’acte suivant ; une perte n’est pas annulée au changement de tableau. Le sauvetage d’au moins dix compagnons au terme du voyage valide sa réussite.

## Jouer

1. Choisir un monde et lire l’objectif du premier tableau. La troupe attend le signal du joueur ; les dessins et les réglages peuvent être préparés avant son départ.
2. Afficher les appuis avec le crayon. Maintenir la souris ou le doigt sur un appui, rejoindre son partenaire et relâcher pour valider. Le geste peut commencer des deux côtés. La jauge indique l’encre du trait pendant le dessin.
3. **Sélectionner un mécanisme pour le comprendre**, puis choisir une commande nommée dans sa fiche. La sélection seule ne change rien. La fiche présente son rôle, son état et les conditions des actions disponibles.
4. Choisir **Libérer la troupe**. Le panneau d’objectif suit la progression ; les repères du décor aident à identifier le départ, l’arrivée et les attentes. La pause permet de réfléchir et de dessiner ; la vitesse ×2 accélère les déplacements.
5. Quand l’acte est résolu, poursuivre vers le tableau suivant. Le voyage est terminé après son troisième acte.

Les compagnons attendent devant un passage manquant ou un mécanisme fermé. Quand un aiguillage change, ceux qui sont bloqués sur une branche peuvent revenir à pied au croisement pour prendre la nouvelle route. Le trait validé devient leur chemin à l’intérieur du corridor du passage. Les appuis, la longueur de trait disponible et les mécanismes font partie de l’énigme.

Certaines bornes sont automatiques : elles affichent le nombre d’éclaireurs attendus et déclenchent leur verrou ou leur frein dès l’arrivée de la petite équipe. Leur fiche explique cette condition ; elles ne demandent pas de commande manuelle.

**La Gomme** permet de choisir un passage dessiné par son nom et d’en récupérer l’encre. Un passage occupé reste protégé. **Annuler** revient sur le dernier dessin ou réglage sans rembobiner la troupe. Un dessin refusé conserve le passage valide précédent. Recommencer le tableau rétablit sa troupe d’entrée et conserve les actes déjà achevés.

Pour récupérer des compagnons perdus dans un acte précédent, le menu propose aussi **Recommencer le voyage entier**. Cette action repart du premier tableau avec les douze compagnons, après confirmation, tout en conservant le meilleur résultat.

| Action | Raccourcis par défaut |
| --- | --- |
| Libérer la troupe / pause / reprendre | Espace ou P |
| Afficher ou masquer les appuis de dessin | D ou C |
| Annuler le dernier geste | Z ou Retour arrière |
| Alterner vitesse ×1 / ×2 | F ou X |
| Ouvrir les indices | H ou ? |
| Ouvrir le menu / fermer un panneau | Échap |

Les cinq actions principales acceptent deux raccourcis personnalisables dans **Réglages → Raccourcis clavier**. Sur petit écran, le zoom agrandit la scène ; le décor peut ensuite être déplacé au doigt ou avec le curseur de navigation. Les commandes nommées des mécanismes sont également accessibles depuis le panneau d’objectif.

## Progression, étoiles et sauvegarde

Les trois actes forment un même voyage. Les étapes achevées, la troupe restante et le tableau en cours restent identifiables. Le jeu conserve la partie et les réglages dans ce navigateur ; une restauration reprend en pause.

Les étoiles finales sont attribuées après les trois actes :

- **Une étoile** : réussir le voyage avec au moins dix compagnons.
- **Deux étoiles** : ramener les douze compagnons.
- **Trois étoiles** : ramener les douze et respecter le budget d’encre cumulé annoncé pour le voyage.

Le compteur additionne l’encre des traits encore présents à la fin de chaque acte. La Gomme rend l’encre d’un passage retiré dans le tableau en cours. Un repère d’économie local ne constitue pas une pénalité supplémentaire si le total du voyage reste dans son budget. Les indices et les nouvelles tentatives ne retirent pas d’étoiles.

Les sauvegardes et résultats de la version 2.0 ne valident pas automatiquement les nouveaux voyages à trois actes. Une ancienne partie reprend prudemment au début du voyage avec un message explicatif ; les anciens résultats sont distingués des résultats de la nouvelle campagne. Les sauvegardes de l’aventure historique V1 restent séparées.

Les données dépendent du navigateur et de l’adresse du jeu. Le fichier hors ligne et le site hébergé ne partagent pas automatiquement leur progression. Si le navigateur refuse le stockage local, la partie reste jouable et l’interface le signale.

## Trois matières, un même univers

Les Boucles associent papier crème, encre bleu nuit et touches corail. Petits Plis utilise papier découpé, origamis et reliefs de carton. Les Veilleurs installe des automates lumineux dans un atelier de bois et de laiton.

Les trois artworks de référence, les scènes illustrées, les atlas à **huit poses** et les accessoires animés sont conservés. Les artworks gardent les pixels des images fournies. Les scènes jouables, sprites et accessoires sont des adaptations générées à partir de ces références ; aucune identité pixel par pixel n’est revendiquée pour les scènes animées.

Les pas, frottements du crayon, mécanismes, petites voix et confirmations sont produits localement avec Web Audio. Le volume, la coupure du son et l’animation douce sont réglables. La première interaction autorise le navigateur à démarrer l’audio. Voir [CREDITS.md](CREDITS.md) pour les ressources et [CHANGELOG.md](CHANGELOG.md) pour l’historique des versions.

## Installer et compiler

Node.js **22.13 ou plus récent** et npm sont nécessaires pour le développement. Les versions des dépendances sont enregistrées dans `package-lock.json`.

```sh
npm ci
npm run dev
```

Pour vérifier et compiler le projet :

```sh
npm run check
# ou séparément :
npm run typecheck
npm test
npm run build
```

Le build crée deux formes du jeu :

| Sortie | Usage |
| --- | --- |
| `dist/index.html` et ses fichiers associés | Dossier à servir sur un hébergement statique |
| `dist/offline-play.html` | Fichier autonome à ouvrir directement dans un navigateur |

Le fichier hors ligne embarque le code, les styles, les illustrations, les atlas de personnages et la main. Les sons sont procéduraux. Aucun compte de jeu, clé API ou service distant n’est nécessaire pour jouer après la compilation. `npm ci` nécessite une connexion pour installer les dépendances de développement.

`npm run preview` permet de contrôler le dossier compilé sur un serveur local. Le fichier autonome peut être déplacé seul ; un navigateur peut toutefois limiter le stockage local pour une adresse `file:`. La progression n’est pas automatiquement partagée avec le site hébergé.

## Structure du paquet

| Fichier ou dossier | Rôle |
| --- | --- |
| `app/page.tsx` / `app/globals.css` | Interface française, menus, vue et interactions |
| `components/worlds/` | Choix des mondes, objectifs et fiches des mécanismes |
| `lib/worlds/` | Stages, simulation, dessin, rendu, audio et sauvegarde |
| `public/worlds/` | Artworks, scènes, atlas, accessoires et manifeste de provenance |
| `public/drawing-hand-hd.webp` | Main générée utilisée pour le dessin |
| `tests/worlds-*.test.ts` | Parcours, progression, sauvegarde, caméra et étiquettes du décor |
| `scripts/public-*` | Entrée autonome, compilation et tests |
| `PUBLIC-MANIFEST.json` | Version du jeu, fichiers exportés, tailles et empreintes SHA-256 |
| `CHANGELOG.md` | Changements de chaque version, repris dans les releases |

Le paquet public contient uniquement le code actif des trois mondes et leurs tests. Les contrôles de simulation sont complétés par les tests de caméra et de placement des étiquettes : accès aux appuis, repères dans la zone visible, priorité des mécanismes et sélection cohérente avec leur rendu. Les anciens modules, tests, médias audio et archives documentaires restent dans le projet historique ; ils ne sont pas copiés dans ce dépôt.

Le workflow **Vérification du jeu** exécute les types, tests et build. Le workflow **Versions publiques — Coup de Main** compile et crée une release après un push sur `main` qui modifie `package.json` ou ce workflow, ou lors d’un lancement manuel. Il publie le HTML autonome, le ZIP web et leurs empreintes SHA-256 pour la version déclarée, avec l’entrée correspondante de [CHANGELOG.md](CHANGELOG.md). Une release déjà présente est conservée sans écrasement. Le build et l’export locaux ne déclenchent pas cette publication à eux seuls.

Le déploiement de l’ancien projet appartient à son dépôt historique. Ses scripts VPS et son workflow de publication sur l’ancien domaine ne sont pas inclus dans la nouvelle distribution Coup de Main. L’hébergement du nouveau jeu est distinct de la publication des packs GitHub ; une compilation réussie ne prouve pas qu’un serveur a récupéré une version.

Le fonctionnement des neuf énigmes et leurs solutions repliées se trouvent dans [WORLDS.md](docs/WORLDS.md). Voir [BUILD.md](docs/BUILD.md) pour la distribution, [CREDITS.md](CREDITS.md) pour les ressources et [THIRD-PARTY-NOTICES.md](docs/THIRD-PARTY-NOTICES.md) pour les dépendances.

## Historique V1

La version 1.6.1 était une aventure à personnage directement contrôlé, avec douze chapitres. La V2 remplace son écran de jeu par les trois mondes autonomes ; **l’ancienne campagne n’est pas proposée dans les menus V2**. Le dépôt et les releases historiques de cette version restent distincts de [Coup de Main](https://github.com/M4D135/Coup-de-Main). L’ancien code, ses médias et ses archives restent conservés dans le projet historique ; ils ne font pas partie du paquet public de ces trois mondes.

- [Documentation publique V1.6.1](https://github.com/M4D135/Un-seul-trait/blob/v1.6.1/README.md)
- [Crédits et provenance V1.6.1](https://github.com/M4D135/Un-seul-trait/blob/v1.6.1/CREDITS.md)

Les médias audio originaux utilisés par l’ancienne aventure ne sont pas utilisés ni distribués dans le paquet V2. Ils ne sont pas supprimés de l’historique du projet.
