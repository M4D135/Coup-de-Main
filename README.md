# Coup de Main

**Version 2.0.0 · Un crayon. Trois mondes. Douze compagnons à guider.**

[Sources et versions publiques](https://github.com/M4D135/Coup-de-Main)

Coup de Main est un jeu de réflexion en français : les personnages avancent seuls et le joueur dessine leurs passages, répartit la troupe et actionne les mécanismes du décor. La version 2.0.0 ouvre **trois mondes avec un premier stage chacun**. Les trois artworks validés apparaissent dans le choix des mondes et le carnet.

| Monde | Premier stage | Ce qu’il faut comprendre |
| --- | --- | --- |
| **Les Boucles** | Le poids de l’entraide | Répartir la troupe, charger une nacelle, enclencher son cliquet et réunir les compagnons |
| **Petits Plis** | Le vent a ses raisons | Orienter le vent, soutenir la route du moulin ou choisir le détour inférieur |
| **Les Veilleurs** | La mécanique du soir | Libérer un ascenseur avec une balance, transporter la troupe et observer le balancier |

Chaque stage propose **12 compagnons**, avec un objectif d’au moins **10 arrivées au refuge**. Sauver les douze et atteindre la maîtrise offrent deux défis supplémentaires. Les trois mondes sont accessibles dès l’accueil.

## Jouer

1. Choisir un monde puis **Observer le décor**. La troupe attend le signal du joueur.
2. Activer le crayon pour repérer les appuis. Maintenir la souris ou le doigt sur un appui, tracer jusqu’à l’autre et relâcher pour valider. Le tracé peut commencer des deux côtés.
3. Toucher les mécanismes pour changer leur position : aiguillage, déflecteur, taquet, cran, ascenseur ou barrière.
4. Choisir **Libérer la troupe**, puis observer les conséquences. La pause permet de réfléchir et de préparer les traits ; la vitesse ×2 accélère les déplacements.

Les personnages attendent devant un passage manquant ou un mécanisme fermé. Lorsqu’un aiguillage change, les compagnons bloqués sur une branche peuvent revenir à pied au croisement pour prendre la nouvelle route. La géométrie du trait validé détermine le chemin qu’ils parcourent, dans le corridor de construction de ce passage. Chaque trait dispose de sa propre limite d’encre : les appuis et les mécanismes restent nécessaires pour résoudre le stage.

**Annuler** revient sur le dernier dessin ou réglage, sans rembobiner la troupe. Un trait occupé et certaines manœuvres portant encore des compagnons sont protégés. Un dessin refusé ne remplace pas le passage valide précédent. Le menu permet de recommencer le stage tout en gardant le meilleur résultat.

| Action | Raccourcis par défaut |
| --- | --- |
| Libérer la troupe / pause / reprendre | Espace ou P |
| Afficher ou masquer les appuis de dessin | D ou C |
| Annuler le dernier geste | Z ou Retour arrière |
| Alterner vitesse ×1 / ×2 | F ou X |
| Ouvrir les indices | H ou ? |
| Ouvrir le menu / fermer un panneau | Échap |

Les cinq actions principales acceptent deux raccourcis personnalisables dans **Réglages → Raccourcis clavier**. Sur un petit écran, les boutons de zoom agrandissent la scène ; le décor peut ensuite être déplacé au doigt ou avec le curseur de navigation. Le paysage laisse davantage de place au parcours.

## Trois matières, un même univers

Les Boucles associent papier crème, encre bleu nuit et touches corail. Petits Plis utilise papier découpé, origamis et reliefs de carton. Les Veilleurs installe des petits automates lumineux dans un atelier de bois et de laiton.

Chaque monde possède une scène illustrée, un atlas de personnage à **huit poses** et des accessoires séparés pour les mécanismes animés. Les artworks de référence conservent les pixels des trois images fournies. Les décors jouables, sprites et accessoires sont des adaptations générées à partir de ces références ; aucune identité pixel par pixel n’est revendiquée pour les scènes animées.

Les pas, frottements du crayon, mécanismes, petites voix et confirmations sont produits localement avec Web Audio. Le volume, la coupure du son et l’animation douce sont réglables. La première interaction autorise le navigateur à démarrer l’audio. Voir [CREDITS.md](CREDITS.md) pour la provenance des ressources.

## Progression et sauvegarde

Les parties en cours, les meilleurs résultats, les indices consultés et les réglages sont enregistrés dans ce navigateur. Une partie restaurée reprend en pause. Les trois niveaux disposent chacun de trois indices, révélés uniquement à la demande.

Une première étoile récompense la réussite avec au moins dix compagnons, la deuxième le sauvetage des douze. La troisième demande de sauver les douze en respectant l’objectif de maîtrise affiché :

| Monde | Objectif de maîtrise |
| --- | --- |
| Les Boucles | Au plus 930 unités d’encre |
| Petits Plis | Au plus 660 unités d’encre, taquet du moulin bloqué, mécanisme relevé et vent à l’abri |
| Les Veilleurs | Au plus 1 150 unités d’encre |

Les indices et les nouvelles tentatives ne retirent pas d’étoiles. L’encre comptée correspond aux traits validés encore présents dans le stage.

La progression V2 utilise un espace de sauvegarde distinct de l’ancienne aventure. Elle ne convertit ni n’efface les sauvegardes V1. Les données restent liées au navigateur et à l’adresse du jeu ; le fichier hors ligne et le site hébergé ne partagent pas automatiquement leur progression. Si le navigateur refuse le stockage local, la partie reste jouable et l’interface le signale.

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
| `components/worlds/` | Choix des mondes |
| `lib/worlds/` | Stages, simulation, dessin, rendu, audio et sauvegarde |
| `public/worlds/` | Artworks, scènes, atlas, accessoires et manifeste de provenance |
| `public/drawing-hand-hd.webp` | Main générée utilisée pour le dessin |
| `tests/worlds-engine.test.ts` / `worlds-camera.test.ts` | 24 tests du moteur, des parcours et de la caméra |
| `scripts/public-*` | Entrée autonome, compilation et tests |
| `PUBLIC-MANIFEST.json` | Fichiers exportés, tailles et empreintes SHA-256 |

Le paquet public contient uniquement le code actif des trois mondes et les 24 tests qui leur sont consacrés : 16 pour le moteur, 8 pour la caméra. Les anciens modules, tests, médias audio et archives documentaires restent dans le projet historique ; ils ne sont pas copiés dans ce dépôt.

Le workflow **Vérification du jeu** exécute les types, tests et build. Le workflow **Versions publiques — Coup de Main** compile et crée une release après un push sur `main` qui modifie `package.json` ou ce workflow, ou lors d’un lancement manuel. Il publie le HTML autonome, le ZIP web et leurs empreintes SHA-256 pour la version déclarée. Une release déjà présente est conservée sans écrasement. Le build et l’export locaux ne déclenchent pas cette publication à eux seuls.

Le déploiement de l’ancien projet appartient à son dépôt historique. Ses scripts VPS et son workflow de publication sur l’ancien domaine ne sont pas inclus dans la nouvelle distribution Coup de Main. L’hébergement du nouveau jeu est distinct de la publication des packs GitHub ; une compilation réussie ne prouve pas qu’un serveur a récupéré une version.

Le fonctionnement détaillé des stages et leurs solutions repliées se trouvent dans [WORLDS.md](docs/WORLDS.md). Voir [BUILD.md](docs/BUILD.md) pour la distribution, [CREDITS.md](CREDITS.md) pour les ressources et [THIRD-PARTY-NOTICES.md](docs/THIRD-PARTY-NOTICES.md) pour les dépendances.

## Historique V1

La version 1.6.1 était une aventure à personnage directement contrôlé, avec douze chapitres. La V2 remplace son écran de jeu par les trois mondes autonomes ; **l’ancienne campagne n’est pas proposée dans les menus V2**. Le dépôt et les releases historiques de cette version restent distincts de [Coup de Main](https://github.com/M4D135/Coup-de-Main). L’ancien code, ses médias et ses archives restent conservés dans le projet historique ; ils ne font pas partie du paquet public de ces trois mondes.

- [Documentation publique V1.6.1](https://github.com/M4D135/Un-seul-trait/blob/v1.6.1/README.md)
- [Crédits et provenance V1.6.1](https://github.com/M4D135/Un-seul-trait/blob/v1.6.1/CREDITS.md)

Les médias audio originaux utilisés par l’ancienne aventure ne sont pas utilisés ni distribués dans le paquet V2. Ils ne sont pas supprimés de l’historique du projet.
