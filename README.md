# Coup de Main

**Version 3.1.3 · Un crayon. Trois mondes. Douze compagnons à guider.**

[Sources et versions publiques](https://github.com/M4D135/Coup-de-Main)

Coup de Main est un jeu de réflexion en français. Les compagnons avancent seuls ; le joueur dessine leurs passages, oriente les groupes et actionne les mécanismes. Chaque monde est un long voyage de **cinq tableaux illustrés complets**, avec plusieurs énigmes reliées et un refuge final. La même troupe continue d’une page à l’autre, en gardant ses dessins, ses groupes et les réglages des mécanismes. Les trois mondes réunissent **quinze compositions** : les trois premières scènes d’origine et douze nouvelles illustrations.

| Monde | Voyage | Matière et ambiance |
| --- | --- | --- |
| **Les Boucles** | Le grand fil | Papier crème, encre bleu nuit, entraide et équilibres ; piano doux et cordes |
| **Petits Plis** | Le pays des vents | Origamis, souffles, moulins et passages de papier ; flûte et cordes pincées |
| **Les Veilleurs** | La longue veille | Atelier de bois et de laiton, transports et balanciers ; célesta et harmonies nocturnes |

Les trois mondes sont accessibles dès l’accueil. Chacun commence avec **12 compagnons** et se termine au refuge du cinquième tableau. Les réseaux associent des actions locales à des effets plus loin sur le parcours : observer la troupe et explorer le décor fait partie du jeu.

## Les gestes

- **Toucher un mécanisme** pour agir. Son état, ses mouvements et ses repères dans le décor montrent le résultat. Certains relais sont activés automatiquement par l’arrivée des compagnons.
- **Tracer depuis un appui** jusqu’à son partenaire pour construire un passage. Le dessin peut commencer des deux côtés ; sa géométrie devient le chemin parcouru.
- **Glisser le décor** pour explorer le tableau. Pincer avec deux doigts ou utiliser la molette pour zoomer. Les flèches et les cinq petits repères tournent les pages ; un glissement prolongé au bord fait de même.
- **Retrouver les compagnons** grâce aux petites pastilles latérales signalant les groupes en attente hors champ, ou au bouton de recentrage.
- **Toucher un compagnon** pour lui faire faire un coucou et lire brièvement la raison de son attente. Ses petites réactions ne modifient pas la solution du puzzle.
- **Mettre en pause** pour réfléchir et préparer les dessins. La vitesse ×2 accélère les déplacements.
- **Activer la Gomme**, puis toucher un trait libre pour récupérer son encre. Un passage occupé ou nécessaire à un retour déjà engagé reste protégé.

Les compagnons attendent lorsqu’un passage manque ou qu’un mécanisme n’est pas prêt. Modifier un aiguillage peut faire revenir les groupes bloqués vers un autre chemin. Le jeu conserve les positions réelles de la troupe.

Le monde dispose d’une réserve d’encre commune, visible sur la jauge du crayon. Effacer les passages déjà quittés permet de réutiliser cette réserve plus loin. La limite propre à chaque trait et son corridor de construction restent indiqués par les appuis. Un dessin refusé conserve le passage valide précédent. **Annuler** revient sur le dernier dessin ou réglage, sans rembobiner la troupe.

| Action | Clavier |
| --- | --- |
| Libérer la troupe / pause / reprendre | Espace ou P |
| Annuler le dernier geste | Z ou Retour arrière |
| Alterner gomme et crayon | E |
| Alterner vitesse ×1 / ×2 | F |
| Retrouver un groupe | R |
| Déplacer la caméra | Flèches |
| Tableau précédent / suivant | Page précédente / Page suivante |
| Ouvrir ou fermer la pause | Échap |

## Souvenirs et progression

Tourner une page conserve la troupe et l’état du voyage. Le titre montre le tableau courant sur cinq ; le compteur **Au refuge** apparaît à la dernière page ou dès qu’un compagnon est sauvé. Lorsque tous les survivants ont franchi un repère de fin de réseau, le jeu conserve automatiquement un **souvenir**. Le menu de pause permet de revenir à ce point avec l’état de la troupe, des dessins et des mécanismes qui y a été enregistré.

**Recommencer** repart au début du monde avec les douze compagnons, après confirmation. Le meilleur résultat reste conservé. Une partie retrouvée dans ce navigateur reprend au calme. Les parties 3.0 compatibles sont recalées sur les nouvelles illustrations en conservant les mêmes chemins, compagnons, dessins et réglages. Les anciennes parties V1/V2, construites sur d’autres parcours, repartent du début avec un message explicatif.

Un taquet qui a déjà soutenu le passage de la troupe reste engagé : une annulation ne peut plus couper cet appui derrière un groupe déjà avancé. La reprise d’une partie concernée rétablit seulement les appuis dont l’utilisation avait été enregistrée, sans résoudre les mécanismes encore intacts.

La version 3.1.1 répare aussi les parties où un compagnon revenu à un aiguillage occupait encore son ancien chemin : il libère ce passage au chargement, sans changer de position ni résoudre le mécanisme. Les autres compagnons peuvent alors terminer leur retour.

La version 3.1.2 corrige les balances qui retenaient leurs porteurs malgré la borne locale allumée : leur libération dépend désormais de cette borne visible, du cran verrouillé et du passage de retour tracé. Aucune action dans le tableau suivant n’est nécessaire. Une partie déjà enregistrée dans cette situation reprend avec ses personnages, ses tracés et ses réglages.

Les étoiles dépendent uniquement du nombre de compagnons arrivés au refuge :

| Compagnons sauvés | Résultat |
| --- | --- |
| 10 | Une étoile |
| 11 | Deux étoiles |
| 12 | Trois étoiles |

L’encre sert à construire le chemin ; elle n’ajoute pas de condition cachée aux étoiles. Revenir à un souvenir ou recommencer ne retire pas d’étoiles.

Les parties, meilleurs résultats et réglages sont enregistrés localement. Le fichier hors ligne, le site et les différents navigateurs ne partagent pas automatiquement leur progression. Si le navigateur refuse le stockage, le jeu reste jouable et le signale.

## Musiques, matières et petites voix

Chaque monde possède une musique originale, composée de phrases mélodiques, d’une réponse, d’harmonies, de basses et de textures discrètes. Les arrangements et les nuances évoluent au fil du voyage. Les timbres sont synthétisés localement avec Web Audio.

Les pas, le crayon, le papier, le bois et les mécanismes ont leurs propres matières sonores. Les compagnons réagissent par de petites voix originales à leur départ, à une hésitation, à une arrivée ou à la réunion finale. Leur registre varie avec leur identité ; aucun enregistrement de voix ou morceau de musique extérieur n’est utilisé.

La pause propose **trois volumes indépendants : Musique, Bruitages et Voix**, ainsi qu’une coupure générale. L’audio commence après une interaction. Les effets tiennent compte de la région visible ; les événements éloignés sont atténués ou ignorés. Masquer la page arrête les sons programmés, sans les rejouer en rafale au retour.

## Les trois directions artistiques

Les trois premières scènes complètes sont rétablies : la vallée d’encre des Boucles, le théâtre de papier des Petits Plis et l’atelier nocturne des Veilleurs. Leurs PNG sont conservés intacts, tout comme les artworks de référence, les atlas de personnages à **huit poses** et les accessoires. Quatre nouvelles illustrations complètes prolongent chaque monde, dans sa matière et son ambiance.

Chaque tableau est une planche de **3 200 × 1 800 unités logiques** ; les cinq tableaux forment le parcours de **16 000 × 1 800 unités**. Les chemins sont placés sur leurs sols et la caméra reste dans une seule image à la fois. Elle remplit l’écran, avec du glissement et du zoom pour explorer les cadrages plus étroits.

Les compagnons marchent, attendent, se saluent et réagissent aux mécanismes proches en utilisant les poses et les visages d’origine. La préférence de réduction des animations est disponible dans la pause. Les prompts des nouveaux tableaux et les empreintes des médias accompagnent les sources.

Voir [CREDITS.md](CREDITS.md) pour les ressources et la création sonore, [CHANGELOG.md](CHANGELOG.md) pour l’historique des versions.

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
| `components/worlds/` | Choix des mondes et version affichée |
| `lib/worlds/` | Parcours, tableaux, simulation, dessin, rendu, audio et sauvegarde |
| `public/worlds/` | Artworks et scènes d’origine PNG, douze tableaux WebP, atlas, accessoires et manifeste de provenance |
| `docs/art-*-prompts.json` | Prompts et références de génération des nouveaux tableaux |
| `public/drawing-hand-hd.webp` | Main générée utilisée pour le dessin |
| `tests/worlds-*.test.ts` | Parcours, réseaux, souvenirs, caméra et cycle de vie audio |
| `scripts/public-*` | Entrée autonome, compilation et tests |
| `PUBLIC-MANIFEST.json` | Version du jeu, fichiers exportés, tailles et empreintes SHA-256 |
| `CHANGELOG.md` | Changements de chaque version, repris dans les releases |

Le paquet public contient le code actif des trois mondes, leurs tests et les fixtures nécessaires à la compatibilité des sauvegardes. Les contrôles de simulation sont complétés par les tests de caméra et de sélection : accès aux appuis, repères dans la zone visible, priorité des mécanismes et coordonnées des interactions. Des scénarios de mauvais réglages, d’annulation et de reprise complètent les parcours idéaux. Les résultats d’une livraison doivent distinguer ces contrôles automatisés des interactions réellement essayées dans un navigateur. Les anciens modules, tests, médias audio et archives documentaires restent dans le projet historique ; ils ne sont pas copiés dans ce dépôt.

Le workflow **Vérification du jeu** exécute les types, tests et build. Le workflow **Versions publiques — Coup de Main** compile et crée une release après un push sur `main` qui modifie `package.json` ou ce workflow, ou lors d’un lancement manuel. Il publie le HTML autonome, le ZIP web et leurs empreintes SHA-256 pour la version déclarée, avec l’entrée correspondante de [CHANGELOG.md](CHANGELOG.md). Une release déjà présente est conservée sans écrasement. Le build et l’export locaux ne déclenchent pas cette publication à eux seuls.

Le déploiement de l’ancien projet appartient à son dépôt historique. Ses scripts VPS et son workflow de publication sur l’ancien domaine ne sont pas inclus dans la nouvelle distribution Coup de Main. L’hébergement du nouveau jeu est distinct de la publication des packs GitHub ; une compilation réussie ne prouve pas qu’un serveur a récupéré une version.

Les règles des grandes cartes et leurs réseaux sont décrits dans [WORLDS.md](docs/WORLDS.md). Voir [BUILD.md](docs/BUILD.md) pour la distribution, [CREDITS.md](CREDITS.md) pour les ressources et [THIRD-PARTY-NOTICES.md](docs/THIRD-PARTY-NOTICES.md) pour les dépendances.

## Historique V1

La version 1.6.1 était une aventure à personnage directement contrôlé, avec douze chapitres. Coup de Main développe les trois mondes autonomes ; **l’ancienne campagne n’est pas proposée dans ses menus**. Le dépôt et les releases historiques de cette version restent distincts de [Coup de Main](https://github.com/M4D135/Coup-de-Main). L’ancien code, ses médias et ses archives restent conservés dans le projet historique ; ils ne font pas partie du paquet public de ces trois mondes.

- [Documentation publique V1.6.1](https://github.com/M4D135/Un-seul-trait/blob/v1.6.1/README.md)
- [Crédits et provenance V1.6.1](https://github.com/M4D135/Un-seul-trait/blob/v1.6.1/CREDITS.md)

Les médias audio originaux utilisés par l’ancienne aventure ne sont pas utilisés ni distribués dans le paquet actuel. Ils ne sont pas supprimés de l’historique du projet.
