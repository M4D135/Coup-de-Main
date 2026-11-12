# Coup de Main — Crédits et création sonore

**Version 3.1.0**

[Sources de Coup de Main](https://github.com/M4D135/Coup-de-Main)

Cette version associe trois grands mondes, le dessin de passages, des mécanismes de coopération et une troupe de compagnons autonomes. Les références du projet historique restent dans ses [crédits V1.6.1](https://github.com/M4D135/Un-seul-trait/blob/v1.6.1/CREDITS.md) ; elles ne décrivent pas les médias distribués avec le jeu actuel.

## Artworks et images

Les artworks **Les Boucles**, **Petits Plis** et **Les Veilleurs** ont été fournis et validés par l’utilisateur à la reprise du projet. Ce sont les références de création transmises pour le jeu ; leur présence n’attribue pas leur réalisation manuelle à l’utilisateur.

| Ressource | Usage |
| --- | --- |
| `public/worlds/*-art.png` | Références originales et choix des mondes |
| `public/worlds/*-scene.png` | Trois premières scènes complètes d’origine, affichées comme des planches entières |
| `public/worlds/*-tableau-[2-5].webp` | Douze nouvelles compositions complètes qui prolongent les trois mondes |
| `public/worlds/*-sprites.png` | Atlas de huit poses par famille de personnages |
| `public/worlds/*-props.png` | Accessoires séparés des mécanismes |
| `public/worlds/manifest.json` | Provenance, dimensions, rôles et empreintes SHA-256 |
| `docs/art-plis-prompts.json` / `docs/art-tableaux-prompts.json` | Prompts et références de création des nouveaux tableaux |

Les trois `*-art.png` conservent les pixels des images transmises, de **1 672 × 941 pixels**. Les scènes nettoyées, sprites et accessoires sont des adaptations générées avec l’aide de l’IA à partir de ces références. Leurs fichiers PNG sont conservés sans modification.

La version 3.1 rétablit chaque `*-scene.png` comme premier tableau complet. Douze illustrations supplémentaires ont été générées avec l’outil intégré **image_gen**, en prenant les artworks d’origine comme références de matière et de composition et les guides de parcours comme contraintes. Elles sont distribuées en WebP. Chaque monde comprend cinq tableaux de **3 200 × 1 800 unités logiques** ; le cadrage montre une planche à la fois et les chemins sont positionnés sur ses sols.

Les prompts des douze nouvelles illustrations sont conservés dans les deux fichiers JSON cités ci-dessus. Les prompts historiques des scènes, sprites et accessoires ne figurent pas dans ce checkout : ils ne sont pas reconstitués. Les personnages animés, les traits du joueur et les parties mobiles des mécanismes sont rendus séparément au-dessus des scènes.

## Main et crayon

La main photographique est une image générée provenant d’une itération antérieure du projet. Elle suit le geste du joueur ; elle n’est ni une capture d’un dessin animé ni une prise de vues de son créateur.

- Image : [`public/drawing-hand-hd.webp`](public/drawing-hand-hd.webp).
- Origine et caractéristiques : [`public/drawing-hand-hd-manifest.json`](public/drawing-hand-hd-manifest.json).

## Musiques originales

Les trois partitions de [`lib/worlds/audio-score.ts`](lib/worlds/audio-score.ts) ont été écrites pour cette version. Chaque thème comprend 32 mesures : seize mesures mélodiques et seize mesures de réponse originales, une progression harmonique, une basse alternée, des accords pincés et des percussions douces. La version 3.2.0 adopte des mélodies majeures plus joyeuses, des attaques courtes et une réverbération musicale réduite.

| Monde | Palette sonore synthétique |
| --- | --- |
| Les Boucles | Piano bondissant en ré majeur, 116 BPM, basse alternée et bois doux |
| Petits Plis | Flûte en sol majeur, 124 BPM, accords à contretemps et brosses discrètes |
| Les Veilleurs | Piano jouet en fa majeur, 108 BPM, swing léger et percussions de bois |

Ces noms décrivent des timbres synthétisés ; aucun enregistrement d’instrument ni morceau existant n’est chargé. Les oscillateurs, enveloppes, harmoniques, filtres et réverbérations procédurales sont créés localement par [`lib/worlds/audio.ts`](lib/worlds/audio.ts).

## Bruitages et voix des compagnons

Le crayon, les pas, le papier, le bois, les mécanismes et les confirmations utilisent du bruit filtré et des résonances synthétiques. Les petites voix combinent un fondamental, des formants et des variations de hauteur. Elles expriment des réactions de départ, d’hésitation, d’arrivée ou de réunion ; leur registre varie avec l’identité du compagnon.

Aucun extrait vocal de La Linea, aucun son de Lemmings et aucune voix clonée d’un interprète ne sont utilisés. Les anciens fichiers `original-voice.wav` et leur manifeste restent exclus de la distribution publique actuelle.

Les volumes de musique, bruitages et voix sont indépendants. Le champ d’écoute suit la région visible grâce à [`lib/worlds/audio-space.ts`](lib/worlds/audio-space.ts). Le nombre de sources est limité et les sons programmés sont annulés quand la page est masquée ou le monde désactivé. Le son commence après une interaction autorisée par le navigateur.

Les tests de partitions et de cycle de vie ne constituent pas une validation subjective à l’écoute.

## Logiciels et identité

React, React DOM et Lucide React conservent leurs licences respectives. Vite, TypeScript et Tailwind CSS servent à la compilation. Les [notices des dépendances](docs/THIRD-PARTY-NOTICES.md) sont incluses dans la distribution et dans le HTML autonome.

Le projet porte le nom **Coup de Main**. Les comparaisons avec d’autres jeux de guidage décrivent un principe de gameplay ; elles ne signifient aucune affiliation ni licence de leurs marques. Ce document décrit la provenance des ressources, sans prétendre établir la disponibilité juridique du nom ni accorder des droits sur des œuvres tierces.

L’ancienne aventure et ses crédits restent dans le [dépôt historique](https://github.com/M4D135/Un-seul-trait). Ses archives, extraits sonores et anciens modules ne sont pas copiés dans ce paquet.
