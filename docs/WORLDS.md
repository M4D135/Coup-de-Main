# Coup de Main — Les trois mondes de la version 2.0.0

Le [projet Coup de Main](https://github.com/M4D135/Coup-de-Main) propose trois premiers stages, un par monde. Chaque stage commence avec douze compagnons autonomes. L’objectif est d’en conduire au moins dix au refuge, avec la possibilité de réunir les douze.

## Règles communes

Le joueur prépare des passages entre les appuis dessinés dans le décor, puis libère la troupe. Les personnages choisissent le chemin indiqué par les aiguillages. Ils attendent lorsqu’un passage manque ou qu’une condition mécanique n’est pas satisfaite.

Le trait reste un geste manuel : sa géométrie devient le parcours des personnages entre deux appuis. Le dessin fonctionne dans les deux sens, avec un lissage léger et une tolérance à la précision tactile. Les limites d’encre et le corridor de chaque passage empêchent de relier arbitrairement l’entrée à la sortie en contournant toute l’énigme.

Une pause suspend la simulation tout en laissant préparer le décor. Les mécanismes se commandent par un clic ou un toucher sur leur poignée. Les modes proposés, leurs conditions et leur état sont définis dans `lib/worlds/levels.ts` et évalués par le moteur. Les dessins et changements de réglage peuvent être annulés ; le jeu protège un passage encore occupé. L’annulation ne remonte pas le temps de la troupe.

Les indices sont facultatifs et progressifs : observation, piste, puis solution. Ils ne diminuent pas les étoiles, et recommencer n’inflige pas de malus. Une étoile récompense le sauvetage d’au moins dix compagnons ; deux étoiles récompensent celui des douze ; la troisième exige aussi l’objectif de maîtrise affiché. Les menus et les parties sont en français. Les sauvegardes V2 sont distinctes de celles de l’aventure V1.

Les compagnons bloqués sur une branche devenue inactive peuvent revenir à pied vers l’aiguillage, puis suivre la nouvelle orientation. Ce retour emprunte les chemins réellement construits ; il ne téléporte pas la troupe.

## I — Les Boucles

**Premier stage : Le poids de l’entraide.** Papier crème, encre bleu nuit, accents corail et petites créatures en forme de boucles.

La troupe atteint un aiguillage. La route supérieure rejoint un pont à dessiner ; la route descendante mène à une nacelle. Le poids de trois Boucles permet au mécanisme de soutenir le passage. Le cliquet conserve ensuite ce réglage pour libérer les porteuses.

Le problème à résoudre consiste à faire contribuer une partie du groupe sans la laisser dans la nacelle. Deux passages sont à dessiner : la passerelle supérieure et le retour des porteuses. Un pont dessiné ne suffit pas tant que son mécanisme n’a pas atteint la position nécessaire.

<details>
<summary>Solution du premier stage</summary>

1. Dessiner la passerelle supérieure et le retour depuis la nacelle.
2. Orienter l’aiguillage vers la nacelle et libérer la troupe.
3. Attendre que trois Boucles occupent la nacelle, puis enclencher le cliquet.
4. Renvoyer la troupe restante vers la route supérieure.
5. Laisser le mécanisme atteindre sa position et les porteuses rejoindre le refuge par leur trait de retour.

</details>

La maîtrise de ce stage demande les douze compagnons sauvés et au plus **930 unités d’encre** dans les traits validés.

## II — Petits Plis

**Premier stage : Le vent a ses raisons.** Origamis, strates de papier, carton et teintes naturelles.

Le déflecteur propose trois orientations : vent de face, souffle vers le moulin, ou passage à l’abri. Le moulin peut relever le soutien du chemin supérieur. Son taquet maintient la corde afin de réorienter ensuite le vent. L’aiguillage permet aussi d’emprunter un détour inférieur.

Ce stage propose deux solutions complètes pour sauver la troupe. La route haute demande une séquence de réglages. La route basse demande un autre trait et un souffle écarté. La sortie vérifie l’arrivée des compagnons, sans exiger l’utilisation d’un mécanisme qui n’appartient pas au chemin choisi.

<details>
<summary>Solutions du premier stage</summary>

**Route haute :** dessiner le pont de papier, diriger le souffle vers le moulin, lancer la simulation et attendre la montée. Bloquer le taquet, puis placer le déflecteur sur « À l’abri ». La troupe peut franchir le pont puis descendre vers le refuge.

**Route basse :** dessiner la rampe du grand détour, orienter l’aiguillage vers le bas et placer le déflecteur sur « À l’abri ». Libérer la troupe ; le moulin et son taquet ne sont pas nécessaires à cette solution.

</details>

La maîtrise demande les douze compagnons sauvés, au plus **660 unités d’encre**, le mécanisme du moulin relevé, le taquet bloqué et le vent à l’abri. La route basse seule permet de terminer et de sauver les douze ; obtenir la troisième étoile demande aussi de résoudre le mécanisme du moulin.

## III — Les Veilleurs

**Premier stage : La mécanique du soir.** Atelier nocturne en bois et laiton, petits automates lumineux et éclairage chaud.

Le répartiteur mène vers la balance, l’ascenseur ou le passage inférieur. Deux Veilleurs sur la balance libèrent le frein de l’ascenseur. Le cran conserve ce réglage et un trait de retour permet de récupérer les deux porteuses.

L’ascenseur transporte au maximum trois compagnons à la fois. Le joueur doit le faire monter, laisser sortir les passagers et le rappeler. La route supérieure rejoint le refuge par une passerelle lumineuse. Le trajet inférieur comporte une barrière et un balancier : ce chemin demande d’observer le rythme du danger et de libérer de petits groupes lorsque le balancier s’éloigne, en refermant la barrière entre deux passages, puis de dessiner la remontée vers le refuge.

<details>
<summary>Solution par la route supérieure</summary>

1. Dessiner la rampe d’accès à la balance, le retour des deux porteuses et le pont lumineux vers la maison.
2. Envoyer les premiers compagnons vers la balance et libérer la troupe.
3. Avec deux Veilleurs sur le plateau, enclencher le cran de sécurité puis orienter le répartiteur vers l’ascenseur.
4. Attendre l’arrivée des passagers sur l’ascenseur ; monter avec un groupe de trois lorsque possible.
5. Laisser les passagers sortir en haut, puis redescendre chercher le groupe suivant. Le dernier voyage peut compter moins de trois passagers.
6. Laisser les deux porteuses rejoindre le palier par leur trait de retour et réunir tout le monde au refuge.

</details>

La maîtrise demande les douze compagnons sauvés et au plus **1 150 unités d’encre**.

## Ressources et animation

Chaque monde possède un artwork de référence, un décor jouable, un atlas de huit poses et des accessoires séparés. L’animation combine ces ressources avec les états réels de la simulation. Les images fixes de référence restent visibles dans le carnet ; les scènes jouables sont des adaptations pour le jeu.

Le moteur partage la géométrie du balancier entre le rendu et la collision. Les compagnons sur une plateforme ou un trait suivent le trajet utilisé par la simulation. Les petites voix et effets de matière sont synthétisés localement ; aucun enregistrement issu d’un autre jeu n’est requis.

## Étendre l’univers

Cette livraison contient **un stage par monde**, et non une campagne complète de plusieurs stages dans chacun. Les niveaux, indices, règles de mécanismes et ressources visuelles sont séparés afin de permettre cet enrichissement. Une extension à plusieurs stages par monde devra également donner à chaque stage sa propre identité de sauvegarde et son entrée dans l’interface : les sauvegardes actuelles sont identifiées par le monde.

## Vérification

La suite distribuée contient **24 tests** : 16 dans `tests/worlds-engine.test.ts` et 8 dans `tests/worlds-camera.test.ts`. Elle exerce les parcours complets, les deux solutions de Petits Plis, les routes des Veilleurs, les retours vers les aiguillages, les files d’attente, les dessins, les annulations protégées, la sauvegarde et la reprise. La simulation est comparée à différentes fréquences d’affichage. La caméra est contrôlée en portrait et en paysage, notamment pour atteindre les appuis après un zoom et déplacer la vue pendant un tracé. Les tests du projet historique ne sont pas inclus dans cette distribution.

Les vérifications du moteur ne suffisent pas à juger la lisibilité visuelle, la précision sur écran tactile ou l’équilibre subjectif de la difficulté. Les résultats de validation d’une livraison doivent préciser séparément les contrôles automatisés et les essais réalisés dans le navigateur.
