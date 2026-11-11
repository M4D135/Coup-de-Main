# Coup de Main — Compilation autonome de la version 3.0.0

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

L’entrée `scripts/public-app/main.tsx` monte `app/page.tsx`. React et Vite compilent une application statique qui inclut trois cartes de **16 000 × 900 unités**, dix secteurs et cinq réseaux par monde. L’installation des outils nécessite une connexion ; le jeu compilé fonctionne ensuite sans compte de jeu, CDN ou serveur d’application.

| Sortie | Usage |
| --- | --- |
| `dist/index.html` et ses ressources | Dossier web à servir à la racine ou dans un sous-dossier |
| `dist/offline-play.html` | Fichier autonome à ouvrir directement dans un navigateur |
| `dist/CREDITS.md` et `dist/docs/` | Crédits et notices de distribution |
| `dist/.nojekyll` | Compatibilité avec les hébergements utilisant cette convention |

`base: './'` permet le déploiement dans un sous-dossier. Le ZIP web n’a pas besoin du HTML autonome, distribué séparément. `npm run preview` sert le dossier compilé localement.

## Images et création sonore

Les fichiers `public/worlds/*-art.png`, `*-scene.png`, `*-sprites.png` et `*-props.png` fournissent les références, décors, atlas à huit poses et accessoires. Le manifeste décrit leur provenance, leurs dimensions et leurs SHA-256. La main et son manifeste restent dans `public/`.

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

Les positions des anciennes versions ne sont pas appliquées aux nouvelles cartes. Le jeu reconnaît leur format et explique le nouveau départ. Les résultats historiques ne sont pas présentés comme des parcours V3 déjà terminés.

`localStorage` dépend du navigateur et de l’origine. Un fichier `file:` et un site HTTP ne partagent pas automatiquement la progression. Le jeu signale lorsque le stockage persistant est indisponible. L’audio et le plein écran restent soumis aux capacités du navigateur et aux gestes utilisateur.

## Vérification

`scripts/public-test.mjs` découvre les tests, les compile avec TypeScript dans un dossier temporaire puis utilise le runner de Node. L’export public retient les fichiers `tests/worlds-*.test.ts` et leurs dépendances importées, notamment les helpers de parcours.

Les suites couvrent les itinéraires, les réseaux, les identités et effectifs, les limites d’encre, les protections de passages occupés, les souvenirs et la restauration. Les contrôles de caméra et de guidage portent sur les coordonnées, le zoom et les zones de sélection. Les tests audio vérifient les partitions, l’atténuation avec la distance, l’indépendance des volumes, le déverrouillage, l’arrêt des sources et l’absence de rattrapage après une page masquée. Les tests de cycle de vie audio emploient un faux contexte : ils ne remplacent pas une écoute dans un navigateur.

Avant livraison, vérifier également dans le navigateur :

- L’ouverture et la reprise des trois cartes, leur refuge et leur progression continue.
- Le toucher d’un mécanisme, le tracé depuis un appui, la Gomme et les refus sur un passage occupé.
- Le glissement, le pincement, la molette, la petite carte et le recentrage sur les groupes.
- La pause, la vitesse, le retour à un souvenir et le redémarrage complet.
- Les trois volumes, la coupure générale, le déverrouillage audio et le retour d’un onglet masqué.
- L’absence d’erreurs de console et le chargement correct des images dans le build web et le HTML autonome.

Le runner affiche le nombre exact de tests de la livraison. Les résultats publiés doivent distinguer les tests automatisés, les interactions effectivement essayées et les limites de la validation sonore ou mobile.

## Export depuis le projet de création

```sh
npm run public:build
npm run public:export -- /chemin/absolu/vers/un-dossier-vide
```

Le premier script produit `work/public-dist/`. L’exporteur suit les imports actifs de l’interface et des tests publics, puis copie une liste explicite de scripts, documents et médias. Il refuse de remplacer un dossier non vide.

Le paquet ne contient ni historique Git, identité d’hébergement, variables d’environnement, connecteurs, ancien moteur, médias audio historiques ni archives de création. Les anciennes sources restent dans leurs projets et historiques. `PUBLIC-MANIFEST.json` énumère les fichiers, tailles et SHA-256. Son champ `version` désigne le format du manifeste ; `gameVersion` reprend **3.0.0**, comme le package, le lock et le manifeste des médias.

Dans un export neuf, `npm ci && npm run check` vérifie la distribution publique. L’export et le build locaux ne publient ni release ni site à eux seuls.

## Releases

Le workflow `.github/workflows/release-worlds.yml` se déclenche sur `main` lors d’un changement de `package.json` ou du workflow, ou manuellement. Il valide la version SemVer, vérifie qu’une release n’existe pas déjà, installe les dépendances et lance `npm run check`.

Il prépare ensuite :

- `Coup-de-Main-${version}.html`, le HTML autonome ;
- `Coup-de-Main-${version}-web.zip`, le dossier web sans le HTML autonome déjà proposé séparément ;
- `SHA256SUMS-${version}.txt`, les empreintes de ces deux fichiers.

Les notes reprennent l’entrée `## [version]` correspondante de [CHANGELOG.md](../CHANGELOG.md). Une entrée absente bloque la publication. La release `v${version}` vise le commit compilé ; une release existante n’est pas écrasée. Un tag préexistant pointant vers un autre commit bloque également la publication. Les préversions SemVer sont marquées comme telles.

Le dépôt cible vient de `GITHUB_REPOSITORY`. L’hébergement web et les releases sont distincts : une compilation réussie ne prouve pas qu’un site sert déjà cette version. Les anciennes releases restent identifiables et ne doivent pas recevoir un fichier compilé avec la nouvelle entrée.
