# Coup de Main : crédits et médias

**Version 2.1.1**

[Sources de Coup de Main](https://github.com/M4D135/Coup-de-Main)

Cette version comprend trois mondes de dessin et de guidage de compagnons autonomes. Le code actif, les stages et les interactions ont été développés pour Coup de Main. Les références de l’ancienne aventure sont conservées dans les [crédits V1.6.1](https://github.com/M4D135/Un-seul-trait/blob/v1.6.1/CREDITS.md) ; elles ne décrivent pas les médias utilisés par le jeu V2.

## Artworks et ressources visuelles

Les trois artworks **Les Boucles**, **Petits Plis** et **Les Veilleurs** ont été fournis et validés par l’utilisateur à la reprise du projet. Leur présence dans les sources signifie qu’ils constituent les références de création transmises pour cette version ; elle ne constitue pas une attribution de leur réalisation manuelle à l’utilisateur.

| Famille de ressources | Usage |
| --- | --- |
| `public/worlds/*-art.*` | Artworks de référence affichés dans le choix des mondes et le carnet |
| `public/worlds/*-scene.*` | Décors jouables adaptés aux parcours et aux mécanismes |
| `public/worlds/*-sprites.*` | Atlas de huit poses pour animer chaque famille de personnages |
| `public/worlds/*-props.*` | Accessoires séparés utilisés pour les mécanismes animés |
| `public/worlds/manifest.json` | Inventaire, origine et empreintes des ressources retenues |

Les trois fichiers de référence `*-art.png` conservent les pixels des trois images transmises, de **1 672 × 941 pixels**. Les variantes de décor, les atlas et les accessoires ont été générés avec l’aide de l’IA à partir de cette direction artistique, puis intégrés au moteur. Les mouvements et interactions sont calculés par le jeu. Un atlas de poses animé par du code n’est pas une séquence filmée. Les scènes interactives comportent des adaptations : aucune identité pixel par pixel avec les artworks fixes n’est revendiquée pour ces scènes.

## Main et crayon

La main au rendu photographique est une image générée, conservée de l’itération précédente du projet parce qu’elle reste utilisée pour le dessin en V2. Le moteur l’anime en suivant le geste du joueur.

| Élément | Référence |
| --- | --- |
| Ressource | [`public/drawing-hand-hd.webp`](public/drawing-hand-hd.webp) |
| Origine, prompt et caractéristiques | [`public/drawing-hand-hd-manifest.json`](public/drawing-hand-hd-manifest.json) |
| Nature | Image générée avec transparence, animée par le code |

Cette image n’est pas une capture du dessin animé La Linea ni une prise de vues de son créateur.

## Bruitages et petites voix

Les sons actifs de la V2 sont produits par [`lib/worlds/audio.ts`](lib/worlds/audio.ts) avec Web Audio : pas, frottements du crayon, papier, mécanismes, confirmations, petites voix et fin de stage. Ils sont synthétisés à partir d’oscillateurs et de bruit filtré, avec des variations selon le monde et l’action.

La V2 n’utilise aucun enregistrement de voix extrait de La Linea, ni aucun son provenant de Lemmings. Elle ne clone pas la voix d’un interprète. Les fichiers historiques `original-voice.wav` et `original-voice-manifest.json` sont exclus du paquet public V2. Leur présence éventuelle dans le checkout historique ne les rend pas actifs dans le nouveau jeu.

Le son commence après une interaction autorisée par le navigateur. Les vérifications techniques ne constituent pas une validation subjective à l’écoute.

## Identité et inspirations

La conception associe le dessin de passages, la coopération d’une petite troupe et des mécanismes propres aux trois matières. La comparaison avec d’autres jeux de guidage décrit un principe de gameplay. Elle ne signifie aucune affiliation, licence de marque ou approbation de leurs ayants droit.

Le jeu prend le nom **Coup de Main**, avec une distribution propre à ce projet. Les références à `Un-seul-trait` concernent le projet historique et ses archives. Ce document décrit la provenance du contenu ; il ne prétend pas établir la disponibilité juridique de ce nom ni accorder des droits sur des œuvres tierces.

## Logiciels

React, React DOM et Lucide React conservent leurs licences respectives. Le build autonome utilise Vite, TypeScript et Tailwind CSS. Les [notices des dépendances](docs/THIRD-PARTY-NOTICES.md) sont incluses dans la distribution et dans le HTML autonome.

## Conservation de l’ancienne aventure

Les [crédits V1.6.1](https://github.com/M4D135/Un-seul-trait/blob/v1.6.1/CREDITS.md) et la [documentation publique V1.6.1](https://github.com/M4D135/Un-seul-trait/blob/v1.6.1/README.md) restent disponibles dans le dépôt historique et ne sont pas copiés dans la nouvelle distribution. Les références, extraits sonores et limites d’utilisation qui y sont décrits concernent le contenu historique. La campagne V1 n’est pas sélectionnable dans les menus V2.
