# Coup de Main — Compilation autonome de la version 2.1.1

[Dépôt public Coup de Main](https://github.com/M4D135/Coup-de-Main)

## Prérequis

- Node.js **22.13 ou plus récent** ; `.nvmrc` sélectionne la branche 22 dans le paquet exporté.
- npm et les dépendances exactes du `package-lock.json`.
- Un navigateur avec Canvas 2D, événements pointeur et décodage PNG/WebP. Web Audio fournit les sons lorsque disponible.

`npm ci` nécessite une connexion pour installer les outils. Le jeu autonome compilé fonctionne ensuite sans CDN, compte de jeu, serveur d’application ni téléchargement d’épisode ou d’enregistrement audio.

## Compiler le projet public

```sh
npm ci
npm run typecheck
npm test
npm run build
# Les trois vérifications sont regroupées par :
npm run check
```

L’entrée `scripts/public-app/main.tsx` monte `app/page.tsx` et importe ses styles. `scripts/public-vite.config.mjs` utilise React et Vite, sans framework serveur. Ce build inclut **trois mondes, chacun parcouru en trois actes**, soit neuf énigmes. Un voyage commence avec douze compagnons ; ses survivants poursuivent dans les actes suivants.

| Sortie | Contenu et destination |
| --- | --- |
| `dist/index.html` | Point d’entrée du dossier statique ; conserver les fichiers associés |
| `dist/offline-play.html` | Code, styles, icônes et médias intégrés dans un HTML autonome |
| `dist/CREDITS.md` / `dist/docs/` | Crédits et notices de distribution |
| `dist/.nojekyll` | Fichier de compatibilité pour les hébergements utilisant cette convention |

`base: './'` permet de servir le dossier à la racine ou dans un sous-dossier. Pour un hébergement statique, copier le contenu web de `dist/`, en laissant de côté `offline-play.html` qui n’est pas nécessaire au site. Pour une ouverture locale, `offline-play.html` peut être déplacé seul. Le HTML illustré est plus volumineux que celui de la V1 : les trois univers visuels y sont embarqués.

`npm run preview` sert le build localement sans le modifier. Ne pas annoncer une version comme déployée uniquement parce que le build ou un workflow a réussi : contrôler aussi la version effectivement servie.

## Médias actifs en V2

| Ressource | Rôle |
| --- | --- |
| `public/worlds/*-art.*` | Trois artworks de référence pour l’accueil et le carnet |
| `public/worlds/*-scene.*` | Trois décors jouables |
| `public/worlds/*-sprites.*` | Trois atlas de personnages, huit poses par atlas |
| `public/worlds/*-props.*` | Accessoires séparés pour les mécanismes animés |
| `public/worlds/manifest.json` | Origine, rôle et empreinte des ressources |
| `public/drawing-hand-hd.webp` | Main et crayon générés, toujours utilisés |
| `public/drawing-hand-hd-manifest.json` | Provenance et caractéristiques de la main |
| `public/favicon.svg` | Icône du jeu |

Le build web conserve les images dans des fichiers séparés : le JavaScript les référence et le navigateur les charge comme des ressources locales du site. Les images ne sont pas encodées en base64 dans ce JavaScript. Pour le seul fichier `offline-play.html`, le build ajoute un dictionnaire unique de ressources intégrées, puis intègre le code et les styles. Chaque image est encodée une seule fois dans ce dictionnaire. Les deux éditions utilisent les mêmes fichiers visuels sources. Les sons sont synthétisés par `lib/worlds/audio.ts` et ne nécessitent aucun fichier audio externe.

Le build injecte dans le HTML les crédits, les notices des dépendances et les manifestes de la main et des mondes. Les fichiers `original-voice.wav` et `original-voice-manifest.json` de l’ancienne aventure ne sont pas embarqués ni exportés dans la distribution V2. Les archives de documentation V1 restent dans le projet historique et sont exclues du paquet public.

Les artworks conservés ont les mêmes pixels que les trois images fournies par l’utilisateur. Les scènes jouables, atlas et accessoires sont des adaptations générées pour l’animation. Voir [CREDITS.md](../CREDITS.md) pour les limites de cette distinction.

## Sauvegardes et comportement hors ligne

Les étoiles finales récompensent les survivants au terme des trois actes, puis le respect du budget d’encre cumulé du voyage. La somme retient l’encre des passages encore présents à la fin de chaque tableau. Les conditions des mécanismes servent à résoudre les actes ; un ancien critère de position finale du moulin ne constitue plus un objectif d’étoile distinct. Les indices et les nouvelles tentatives ne diminuent pas le résultat.

La V2 conserve les parties en cours, résultats, indices consultés et réglages dans `localStorage`, sous une clé distincte de l’ancienne aventure. La version 2.1 enregistre l’acte courant, les résultats des actes achevés et les survivants du voyage. Une partie restaurée reprend en pause. Recommencer un tableau rétablit sa troupe d’entrée et conserve la progression antérieure.

Le menu distingue la reprise du tableau de **Recommencer le voyage entier**. Ce second choix remet les douze compagnons au premier tableau après confirmation et conserve le meilleur résultat.

Les sauvegardes issues du format 2.0 sont reconnues sans être appliquées telles quelles à une campagne différente : le voyage repart au premier acte avec un message explicatif. Les anciens résultats sont distingués des records à trois actes. Les données de l’aventure historique V1 restent séparées.

Le stockage dépend du navigateur et de l’origine du document. Une adresse `file:` peut ne pas disposer des mêmes garanties qu’un site HTTP. L’interface indique lorsque la sauvegarde persistante est indisponible ; le jeu reste jouable. Les données du site, du fichier autonome et de navigateurs différents ne sont pas synchronisées.

Le démarrage de Web Audio demande un geste utilisateur. Le plein écran dépend des capacités du navigateur. Les paramètres d’animation douce tiennent compte de la préférence système de réduction des animations. Les gestes sur la scène ne doivent pas faire défiler la page ; les panneaux de menu conservent leur propre défilement.

## Tests

`scripts/public-test.mjs` découvre les fichiers `tests/**/*.test.ts` et `.spec.ts`, les compile avec TypeScript dans un dossier temporaire CommonJS puis lance le runner de Node. Le dossier temporaire est nettoyé à la fin.

La suite publique regroupe les fichiers `tests/worlds-*.test.ts`. Les contrôles du moteur portent sur les parcours, les effectifs, les files d’attente, le dessin, les gestes protégés, les réglages, la cadence fixe et la reprise. La progression à trois actes, les survivants et les règles d’encre doivent rester cohérents pendant les transitions et les nouvelles tentatives.

Les tests de caméra contrôlent l’accès aux appuis et mécanismes, les bornes de déplacement, le défilement pendant le dessin et les coordonnées invalides. Les tests de guidage couvrent la projection des étiquettes, leur taille en pixels d’écran, les bornes en portrait et en paysage, la protection d’une explication sélectionnée contre les bulles d’attente et la concordance des zones de sélection. Le runner affiche le nombre exact de tests et leur résultat ; les tests historiques V1 restent hors de ce paquet.

Les contrôles automatisés ne remplacent pas les essais de rendu et d’interaction. Avant une livraison, vérifier dans le navigateur :

- L’accueil affiche les trois artworks et ouvre le voyage correspondant.
- Le décor, les personnages, les mécanismes, les appuis et les collisions restent alignés à différentes tailles de fenêtre.
- Le crayon accepte les gestes dans les deux sens ; annuler ou rater un dessin conserve un passage valide précédent.
- Sélectionner un mécanisme ouvre son explication sans le commander ; ses actions sont nommées et les conditions indisponibles sont lisibles.
- Le panneau d’objectif et les repères montrent le tableau courant, sa progression et les attentes. Les petits écrans gardent accès aux commandes et à l’arrivée.
- La Gomme récupère l’encre d’un passage libre et refuse un passage occupé. Son retour d’action correspond à l’état affiché.
- La pause, le retour au menu, la reprise de sauvegarde et la vitesse ×2 gardent un état cohérent.
- Le zoom et le déplacement du décor fonctionnent sur un écran étroit ; aucune action sur la scène ne déclenche le défilement de la page.
- Les sons commencent après un geste, respectent le volume et peuvent être coupés.
- Les neuf actes peuvent être terminés avec les interactions de l’interface ; l’acte suivant conserve les survivants, et recommencer ne réinitialise que le tableau courant.
- Une reprise d’une campagne récente retrouve le bon acte en pause ; une sauvegarde 2.0 n’est pas annoncée comme une campagne 2.1 déjà gagnée.

Les résultats annoncés pour une livraison doivent distinguer le moteur automatisé, le navigateur utilisé et les appareils mobiles réellement essayés.

## Export depuis le checkout du Site

Les commandes du checkout de création restent distinctes de celles du paquet public :

```sh
npm run public:build
npm run public:export -- /chemin/absolu/vers/un-dossier-vide
```

`public:build` produit `work/public-dist/`. L’exporteur suit uniquement les imports actifs de `app/page.tsx`, ajoute les fichiers `tests/worlds-*.test.ts` et leurs dépendances, puis copie une liste explicite de fichiers de compilation, documentation et médias actifs. Les fichiers des mondes sont inclus avec leur manifeste. Les anciens moteurs `lib/trait`, leurs composants, leurs tests et les documents `docs/archive/` ne sont pas inclus dans cette distribution. Leurs sources restent préservées dans le checkout de création.

L’export refuse un dossier de destination non vide. Il ne reprend ni historique Git, identité d’hébergement, variables d’environnement, configuration de serveur, connecteurs ni fichiers de travail. `PUBLIC-MANIFEST.json` énumère les fichiers exportés, leurs tailles et leurs empreintes SHA-256. Son champ `version` désigne le format du manifeste ; `gameVersion` reprend la version du jeu. Le paquet public porte la version **2.1.1** dans `package.json` et `package-lock.json`. Le manifeste des médias indique la même version ; les empreintes des illustrations conservées restent celles de leurs fichiers d’origine.

Dans le dossier exporté, `npm ci && npm run check` vérifie la distribution comme après un clone neuf. Le script d’export et le build locaux ne créent aucune release GitHub et ne déploient pas automatiquement le Site. Ce paquet est destiné à la distribution Coup de Main. Les scripts VPS et le workflow de déploiement de l’ancien projet restent dans son dépôt historique ; ils ne sont pas copiés dans ce paquet.

## Releases publiques

Le paquet exporté comprend `.github/workflows/release-worlds.yml`, nommé **Versions publiques — Coup de Main**. Un push sur `main` qui modifie `package.json` ou ce workflow le déclenche ; un lancement manuel est aussi disponible. La version est lue dans le `package.json` public et doit respecter SemVer. L’entrée `## [version]` correspondante de [CHANGELOG.md](../CHANGELOG.md) est reprise dans les notes de release ; son absence bloque la publication pour éviter des notes sans rapport avec le paquet.

Après `npm ci` et `npm run check`, le workflow prépare :

- `Coup-de-Main-${version}.html`, copie du HTML autonome compilé ;
- `Coup-de-Main-${version}-web.zip`, contenant les fichiers web de `dist/`, sans `offline-play.html` déjà proposé séparément ;
- `SHA256SUMS-${version}.txt`, donnant les empreintes des deux fichiers.

Il crée la release `v${version}` sur le commit qui a été compilé, avec des notes explicatives. Une préversion SemVer est marquée comme préversion GitHub. Une release existante n’est ni modifiée ni réuploadée. Si un tag existe sans release et pointe vers un autre commit, le workflow s’arrête au lieu de lui associer les mauvais fichiers. Une erreur réseau ou d’autorisation ne vaut pas absence de release.

Le workflow utilise `GITHUB_REPOSITORY` et le commit du lancement : il publie dans le dépôt où il est installé. Il ne référence ni ne met à jour l’ancien dépôt, son domaine ou sa branche de déploiement. Un hébergement web du nouveau jeu doit être configuré séparément des releases.

## Préserver la V1.6.1

Le dépôt [Coup de Main](https://github.com/M4D135/Coup-de-Main) contient les trois mondes autonomes. Pour retrouver intégralement l’ancienne application, utiliser le [dépôt historique Un-seul-trait](https://github.com/M4D135/Un-seul-trait) ou sa release V1.6.1 avec ses propres sources, médias, manifeste et outils de compilation.

Ne pas associer un HTML compilé en V1 à un paquet nommé V2, ni reconstruire une release V1 avec les scripts et l’entrée V2. Garder les releases et archives historiques identifiables. Les anciennes sauvegardes restent séparées des données V2.

Les documents de référence V1.6.1 sont conservés dans le projet historique et dans les archives du checkout de création. Ils ne sont pas copiés dans le nouveau paquet public. Les instructions de cette page décrivent uniquement Coup de Main.
