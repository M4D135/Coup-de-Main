# Coup de Main — Compilation autonome de la version 3.1.0

[Dépôt public Coup de Main](https://github.com/M4D135/Coup-de-Main)

## Prérequis et commandes

Node.js **22.13 ou plus récent**, npm et les dépendances exactes du `package-lock.json` sont nécessaires pour le développement. Le jeu utilise Canvas 2D, les événements pointeur et Web Audio lorsque disponible.

```sh
npm ci
npm run dev
npm run check
# Ou séparément :
npm run typecheck
npm test
npm run build
```

L’entrée `scripts/public-app/main.tsx` monte `app/page.tsx`. React et Vite compilent une application statique qui inclut trois parcours de **16 000 × 1 800 unités**, chacun présenté en cinq tableaux de **3 200 × 1 800 unités**. Les cinq réseaux de mécanismes et la troupe persistent entre les tableaux. L’installation des outils nécessite une connexion ; le jeu compilé fonctionne ensuite sans compte de jeu, CDN ou serveur d’application.

| Sortie | Usage |
| --- | --- |
| `dist/index.html` et ses ressources | Dossier web à servir à la racine ou dans un sous-dossier |
| `dist/offline-play.html` | Fichier autonome à ouvrir directement dans un navigateur |
| `dist/CREDITS.md` et `dist/docs/` | Crédits et notices de distribution |
| `dist/.nojekyll` | Compatibilité avec les hébergements utilisant cette convention |

`base: './'` permet le déploiement dans un sous-dossier. Le ZIP web n’a pas besoin du HTML autonome, distribué séparément. `npm run preview` sert le dossier compilé localement.

## Images et création sonore

Les fichiers `public/worlds/*-art.png`, `*-scene.png`, `*-sprites.png` et `*-props.png` conservent les références, les trois premières scènes complètes, les atlas à huit poses et les accessoires. Douze images `public/worlds/{boucles,plis,veilleurs}-tableau-{2..5}.webp` apportent les compositions suivantes. Le manifeste décrit leur provenance, leurs dimensions et leurs SHA-256. Les prompts des nouveaux tableaux sont conservés dans `docs/art-plis-prompts.json` et `docs/art-tableaux-prompts.json`. La main et son manifeste restent dans `public/`.

Les dessins de production intermédiaires ne sont pas des ressources distribuées. L’export retient explicitement les douze PNG d’origine, les douze tableaux WebP, le manifeste des mondes et la main. Le rendu n’utilise pas de découpes de paysage pour reconstituer le premier tableau : il affiche sa scène complète, puis les éléments animés et les traits du joueur.

Le build web conserve ces images dans des fichiers séparés. Le seul `offline-play.html` embarque un dictionnaire de ressources : chaque image y est encodée une fois, après la déclaration UTF-8, avec le code et les styles intégrés. La déclaration d’encodage reste dans les 1 024 premiers octets.

`lib/worlds/audio-score.ts` contient les trois partitions originales ; `audio.ts` synthétise les instruments, textures, bruitages et voix ; `audio-space.ts` calcule l’écoute autour de la région visible. Aucun fichier de musique ou enregistrement de voix extérieur n’est requis. Le HTML autonome utilise exactement le même moteur sonore que le site.

### API audio

| Méthode | Rôle |
| --- | --- |
| `unlock()` | Créer ou reprendre le contexte après une interaction |
| `setWorld(world)` | Changer de thème et de matière sonore |
| `setMusicVolume(value)` | Volume de musique entre 0 et 1 |
| `setEffectsVolume(value)` | Volume des bruitages entre 0 et 1 |
| `setVoicesVolume(value)` | Volume des voix entre 0 et 1 |
| `setMuted(muted)` | Coupure générale |
| `setVolume(value)` | Volume général conservé pour compatibilité |
| `setActive(active)` | Activer le son du monde courant |
| `setListener({x,y,width,height})` | Centre et étendue de la région visible, en coordonnées monde |
| `play(sound, event)` | Émettre un événement, avec sa position et son identité éventuelles |
| `beginPencil()` / `updatePencil(speed)` / `endPencil()` | Suivre le geste de dessin |
| `dispose()` | Arrêter les sources et retirer les écouteurs |

Le scheduler n’anticipe qu’une courte fenêtre musicale. Les événements éloignés sont filtrés et chaque bus limite sa polyphonie. Masquer la page, couper le son ou quitter le monde annule les sources programmées ; aucune file d’événements n’est rejouée au retour. Le démarrage et les réglages de gain sont progressifs.

## Sauvegardes

La sauvegarde V3 conserve le parcours continu, les dessins, les réglages et le dernier souvenir. Un souvenir physique est validé lorsque tous les survivants ont franchi le repère et qu’aucun passage dangereux n’est encore en cours. Revenir à ce point restaure son état ; recommencer le monde repart avec les douze compagnons et garde le meilleur résultat.

Le format V3 est conservé avec une révision de géométrie distincte. La reprise d’une partie 3.0 compatible reprojette ses unités sur les mêmes chemins et ses dessins entre les nouveaux appuis ; elle conserve les identités, les pertes, les arrivées, les réglages et les souvenirs compatibles. Un trait déjà construit dont la reprojection dépasse la nouvelle réserve n’est pas supprimé pour cette seule raison : le montant existant est enregistré pour la reprise, sans ouvrir un nouveau budget de construction.

Les sauvegardes V1/V2 sont reconnues mais ne transposent pas leurs positions dans ce parcours différent ; le jeu explique le nouveau départ. Les résultats historiques ne sont pas présentés comme des parcours V3 déjà terminés.

Les taquets déjà utilisés restent engagés, y compris après annulation. La restauration peut rétablir un tel appui uniquement lorsque le registre des passages prouve qu’il a servi. Les traits occupés ou réservés à un retour sont protégés ; une ancienne reprise ayant perdu un pont de retour replace le compagnon en attente sur sa rive.

`localStorage` dépend du navigateur et de l’origine. Un fichier `file:` et un site HTTP ne partagent pas automatiquement la progression. Le jeu signale lorsque le stockage persistant est indisponible. L’audio et le plein écran restent soumis aux capacités du navigateur et aux gestes utilisateur.

## Vérification

`scripts/public-test.mjs` découvre les tests, les compile avec TypeScript dans un dossier temporaire puis utilise le runner de Node. L’export public retient les fichiers `tests/worlds-*.test.ts` et leurs dépendances importées, notamment les helpers de parcours.

Les suites couvrent les itinéraires, les réseaux, les identités et effectifs, les limites d’encre, les protections de passages occupés, les souvenirs et la restauration. Les contrôles de caméra et de guidage portent sur les coordonnées, le zoom et les zones de sélection. Les tests audio vérifient les partitions, l’atténuation avec la distance, l’indépendance des volumes, le déverrouillage, l’arrêt des sources et l’absence de rattrapage après une page masquée. Les tests de cycle de vie audio emploient un faux contexte : ils ne remplacent pas une écoute dans un navigateur.

Avant livraison, vérifier également dans le navigateur :

- L’ouverture et la reprise des trois mondes, leurs cinq tableaux, leur refuge et la conservation de la troupe entre les pages.
- Le toucher d’un mécanisme, le tracé depuis un appui, la Gomme et les refus sur un passage occupé.
- Le glissement, le pincement, la molette, les changements de page, le recentrage et les pastilles de groupes hors champ.
- Le cadrage sans bandes unies, l’absence de raccord entre deux illustrations et les cibles tactiles en portrait et en paysage.
- Le coucou au toucher, les réactions des compagnons et la préférence de réduction des animations.
- La pause, la vitesse, le retour à un souvenir et le redémarrage complet.
- Les trois volumes, la coupure générale, le déverrouillage audio et le retour d’un onglet masqué.
- L’absence d’erreurs de console et le chargement correct des images dans le build web et le HTML autonome.

### Résultats de la livraison 3.1.0

La validation du projet de création comprend **249 tests réussis sur 249** dans la suite complète et **60 sur 60** dans la suite ciblée du moteur. Les parcours simulés des trois mondes se terminent avec **12 compagnons sur 12**. Neuf parties enregistrées avec l’ancienne géométrie ont été reprises et terminées avec **12 sur 12** ; 99 traversées anciennes sûres ont été contrôlées sans décès induit ; trois situations devenues dangereuses après le recalage reprennent en attente sur leur rive et demandent une nouvelle libération au bon moment.

Les interactions suivantes ont été effectivement essayées dans le navigateur :

- Petits Plis, premier tableau : dessin des deux ponts, commande du taquet et du déflecteur, puis passage de la troupe.
- Petits Plis, deuxième tableau : dessin des deux ponts, sélection des éclaireurs et commande du vent.
- Affichage en portrait **375 × 812**, en paysage **844 × 390**, et glissement du décor en portrait.
- Toucher du bord d’un plateau de balance : le jeu retourne son état de charge (« 0/2 porteurs… ») sans démarrer un faux trait.

Ces essais ne constituent ni trois parcours manuels complets, ni une validation subjective à l’écoute. Les vérifications audio automatisées utilisent un contexte simulé ; aucune écoute audio complète n’est annoncée pour cette livraison.

Le paquet public a été exporté dans un dossier neuf, puis installé avec `npm ci --ignore-scripts` (**48 paquets installés**). `npm run check` s’est terminé avec succès : vérification TypeScript, **92 tests réussis sur 92**, puis compilation Vite. Le HTML autonome embarque **25 images**, identiques aux fichiers de la distribution web. Les captures de QA et les PNG intermédiaires de génération ne font pas partie de cet export public.

Le runner affiche le nombre exact de tests de la livraison. Les résultats publiés doivent distinguer les tests automatisés, les interactions effectivement essayées et les limites de la validation sonore ou mobile.

## Export depuis le projet de création

```sh
npm run public:build
npm run public:export -- /chemin/absolu/vers/un-dossier-vide
```

Le premier script produit `work/public-dist/`. L’exporteur suit les imports actifs de l’interface et des tests publics, puis copie une liste explicite de scripts, documents, prompts de génération et médias. Les fichiers intermédiaires `*-tableau-*.png` ne sont pas exportés : seuls les douze tableaux finaux WebP sont retenus. Il refuse de remplacer un dossier non vide.

Le paquet ne contient ni historique Git, identité d’hébergement, variables d’environnement, connecteurs, ancien moteur, médias audio historiques ni archives de création. Les anciennes sources restent dans leurs projets et historiques. `PUBLIC-MANIFEST.json` énumère les fichiers, tailles et SHA-256. Son champ `version` désigne le format du manifeste ; `gameVersion` reprend **3.1.0**, comme le package, le lock et le manifeste des médias.

Dans un export neuf, `npm ci && npm run check` vérifie la distribution publique. L’export et le build locaux ne publient ni release ni site à eux seuls.

## Releases

Le workflow `.github/workflows/release-worlds.yml` se déclenche sur `main` lors d’un changement de `package.json` ou du workflow, ou manuellement. Il valide la version SemVer, vérifie qu’une release n’existe pas déjà, installe les dépendances et lance `npm run check`.

Il prépare ensuite :

- `Coup-de-Main-${version}.html`, le HTML autonome ;
- `Coup-de-Main-${version}-web.zip`, le dossier web sans le HTML autonome déjà proposé séparément ;
- `SHA256SUMS-${version}.txt`, les empreintes de ces deux fichiers.

Les notes reprennent l’entrée `## [version]` correspondante de [CHANGELOG.md](../CHANGELOG.md). Une entrée absente bloque la publication. La release `v${version}` vise le commit compilé ; une release existante n’est pas écrasée. Un tag préexistant pointant vers un autre commit bloque également la publication. Les préversions SemVer sont marquées comme telles.

Le dépôt cible vient de `GITHUB_REPOSITORY`. L’hébergement web et les releases sont distincts : une compilation réussie ne prouve pas qu’un site sert déjà cette version. Les anciennes releases restent identifiables et ne doivent pas recevoir un fichier compilé avec la nouvelle entrée.
