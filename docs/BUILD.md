# Coup de Main — Compilation autonome de la version 3.2.2

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

Depuis la version 3.2.0, `mechanicsRevision: 1` identifie aussi l’état du moteur mécanique, indépendamment de `geometryRevision`. La sauvegarde conserve la vitesse des mécanismes, l’angle et la vitesse des roues, la force reçue, l’angle et la vitesse angulaire des pendules, ainsi que le décalage éventuel de leurs appuis. Une reprise de cette révision conserve ces valeurs ; elle ne redémarre pas les mécanismes en mouvement depuis le repos.

Une ancienne sauvegarde V3 dépourvue de `mechanicsRevision` reste reconnue. Les mécanismes en translation, dont l’ancien format ne décrivait pas la vitesse, reprennent avec une vitesse nulle. Pour les plateaux, un décalage d’appui conserve leur position enregistrée et les pieds des compagnons : introduire la course mécanique ne les déplace pas instantanément de sa hauteur. Les pendules retrouvent leur angle **et leur vitesse angulaire** calculables à partir du temps, de la phase et de la période de l’ancien mouvement ; un balancier au centre ne devient donc pas artificiellement immobile. Un frein déjà engagé conserve la pose retenue. Les reprises compatibles gardent les identités, les dessins, les pertes et les retenues acquises ; elles ne résolvent pas les mécanismes encore incomplets. Les anciennes sauvegardes bloquées conservées comme fixtures font partie des régressions de cette livraison.

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

### Résultats de la livraison 3.2.2

La suite complète du projet de création réussit **426 tests sur 426**, sans échec ni test ignoré. La vérification TypeScript et le contrôle des espaces du diff passent. Les 26 nouvelles régressions couvrent le scénario signalé, les gestes de retour, les manipulations tardives et la persistance de l’information d’attente. Les parcours des **quinze tableaux** et les reprises déjà présentes restent validés.

Le problème de sélection tactile est reproduit sur le plateau abaissé des Veilleurs 1 : l’appui de retour est à `(1180, 808)`, près du cran à `(1180, 780)`. Un départ huit pixels au-dessus de l’appui pouvait sélectionner le cran, puis déplacer le décor au glissement. Le candidat de dessin possède désormais sa propre zone de 24 pixels CSS ; le clic conserve son action et le glissement recalcule l’appui mobile. Les tests couvrent toute cette zone, les deux sens du trait, le déplacement du plateau, le défilement de caméra et quatre dimensions : **320 × 568, 375 × 812, 844 × 390 et 2048 × 1177**. Les huit variantes de retour terminent le monde à **12/12**, sans perte ni reprise au souvenir.

Quatre séquences explicites reproduisent les deux porteurs restés sur le plateau et les dix compagnons déjà à droite, avec retour précoce ou tardif et cran précoce ou tardif. Elles sauvegardent et reprennent avant le geste manquant, puis vérifient le passage physique des deux porteurs d’origine. Aucun contrôleur ne dessine ou ne verrouille à leur place pendant cette récupération.

Neuf essais supplémentaires couvrent les six autres tableaux à porteurs, les deux nacelles sans balance et un changement prématuré de l’aiguillage des Veilleurs 1. Ils comprennent des retours absents puis tracés en sens inverse, des effacements et retracés, des paliers saturés et une reprise pendant une descente chargée. Les porteurs et passagers franchissent leur tableau avant toute commande dans le suivant. Les parcours prolongés jusqu’au refuge terminent à **12/12**, sans perte ni reprise.

Les dix tests de feedback vérifient que la raison d’attente reste visible après le délai initial, s’efface lors d’un changement réel et peut réapparaître sans nouvelle annonce d’accessibilité. L’information suit le groupe visible ; un écran vide ne décrit pas des compagnons hors champ. L’observation ne modifie aucun état de la partie.

La vérification dans le navigateur de bureau a repris une sauvegarde, chargé et retenu le plateau, puis tracé le retour depuis la zone proche du cran. Le trait a été accepté et le décor n’a pas défilé à sa place. Les deux porteurs ont quitté le plateau et rejoint la rive droite par ce nouveau trait. Les dimensions mobiles ci-dessus sont vérifiées par des tests de géométrie et d’interaction ; elles ne constituent pas une session sur un iPhone physique. Le parcours complet des quinze tableaux relève des tests automatisés, pas d’une partie manuelle intégrale du navigateur.

L’export autonome 3.2.2 a reçu une installation neuve avec `npm ci --ignore-scripts` (**48 paquets**). `npm run check` réussit : TypeScript, **269 tests sur 269**, aucun ignoré, puis compilation Vite. Le HTML autonome embarque **25 images**, identiques aux fichiers web. Les 24 images des mondes sont identiques octet pour octet à la version 3.2.1. Le compte rendu final est recopié dans l’export et son manifeste recalculé sans modification du code validé.

### Résultats de la livraison 3.2.1

La suite complète du projet de création réussit **400 tests sur 400**, sans échec ni test ignoré. La vérification TypeScript passe. Les parcours automatisés des trois mondes restent terminables à **12/12**, avec les scénarios de perturbation et de reprise conservés.

Un défaut a été reproduit dans le premier tableau des Petits Plis par les actions normales du jeu : après coupure du vent pendant la traversée, un compagnon quittait le tablier à 56,1 % de sa course, 86,47 unités sous le palier, puis marchait dans l’air. La sortie vérifie maintenant le contact et la vitesse de l’appui. Quatre nouvelles régressions contrôlent l’attente portée par le tablier, la reprise d’une sauvegarde dans cette position, les raccords des deux demi-ponts et la sortie par une charnière fixe encore accessible. Le jeu n’actionne pas de mécanisme à la place du joueur et aucun nouveau champ de sauvegarde n’est nécessaire.

Trois nouveaux tests Canvas ont reproduit les défauts de transmission de la version 3.2.0, puis passent avec les corrections. Ils suivent les traits effectivement dessinés : les cinq pédales sont reliées à leur moyeu mobile ; le tambour du vent des Veilleurs 4 est distinct de la poulie et de la manivelle de la nacelle ; les dix tambours de contrepoids tournent selon l’allongement de leur véritable brin de suspension, même oblique. Les fichiers d’illustration ne sont pas modifiés.

Le contrôle sonore complémentaire est reproductible dans le projet et l’export public :

```sh
node scripts/qa-audio-scheduler.mjs
```

Il exécute les vraies méthodes de synthèse et de programmation sur un contexte Web Audio instrumenté, en appelant deux fois chaque étape de programmation pour rechercher les doublons. Sur 32 mesures, les Boucles émettent **581 notes sur 581**, les Petits Plis **742 sur 742** et les Veilleurs **738 sur 738**. Aucune note ne manque ou n’est doublonnée ; les maxima sont respectivement 11, 13 et 13 voix. Le masquage arrête toutes les sources et le retour programme une fenêtre normale sans rattrapage. Le script ne produit aucun PCM : ses estimations d’enveloppe ne constituent ni une mesure d’écrêtage, ni une écoute subjective. Les thèmes et le comportement audio de 3.2.0 sont conservés, y compris la musique pendant le menu de pause pour régler son volume.

La vérification visuelle de cette livraison est **partielle**. Les premier et quatrième tableaux des Veilleurs ont été inspectés dans le navigateur avant les corrections finales. L’aperçu local a ensuite refusé de servir des images existantes des Boucles et des Petits Plis ; une ouverture directe de `worlds/boucles-scene.png` a retourné « Cannot GET », alors que le fichier est présent dans le projet. La commande de nouvelle tentative n’a pas résolu ce problème. Les changements finaux de rendu sont donc couverts par les tests Canvas, sans nouvelle capture complète du navigateur. Cette limite de l’aperçu n’est pas présentée comme une validation visuelle réussie ni comme un défaut établi du paquet publié.

L’export autonome 3.2.1 a reçu une installation neuve avec `npm ci --ignore-scripts` (**48 paquets**). `npm run check` réussit : TypeScript, **243 tests sur 243**, aucun ignoré, puis compilation Vite. Le HTML autonome embarque **25 images**, identiques aux fichiers web ; les 24 images des mondes sont également identiques octet pour octet aux fichiers publiés en 3.2.0. Le contrôle sonore complémentaire fonctionne dans cet export. Le compte rendu final est recopié et son manifeste recalculé sans modification du code validé.

### Résultats de la livraison précédente 3.2.0

La suite complète du projet de création réussit **393 tests sur 393**. La vérification TypeScript réussit également. Ces résultats concernent les sources du projet de création ; la vérification de l’export autonome est distincte.

Les parcours automatisés des **trois mondes et de leurs quinze tableaux** se terminent à **12 compagnons sauvés sur 12**, sans perte ni recommencement. Le contrôleur séquentiel agit uniquement sur le tableau courant, dessine de vraies courbes et recharge une sauvegarde à chaque frontière. Les scénarios de perturbation, les reprises des anciennes sauvegardes réellement bloquées et les doubles balances restent vérifiés avec la nouvelle mécanique. Un parcours comportant deux collisions volontairement provoquées termine à **10/12**, sans perte supplémentaire. La nuance de file devant la porte suivante à la sortie du premier tableau des Veilleurs, documentée en 3.1.2, reste explicitement contrôlée : aucun porteur n’y demeure isolé et aucun souvenir n’est accordé avant la réunion réelle.

Les tests mécaniques vérifient la direction et la portée du souffle, le travail progressif de la roue réceptrice, l’inertie après coupure, la retenue du taquet et la nécessité d’atteindre la butée avant son engagement. Ils contrôlent la descente des plateaux sous leur charge, le contact des deux demi-ponts, les deux occupants réels des pédales, la montée plus lente d’une nacelle chargée et sa descente lorsque le câble est déroulé. Le frein du pendule ne peut retenir qu’un angle sûr effectivement atteint ; une session prolongée conserve une oscillation exploitable. Les tests de reprise vérifient les états mécaniques enregistrés et la migration des pendules anciens, y compris au centre et avec un frein déjà engagé.

Deux scénarios ciblés éprouvent les nacelles autonomes du premier tableau des Veilleurs et du quatrième tableau des Boucles sans charger leur contrepoids. La file supérieure accueille six compagnons et la nacelle trois ; trois restent sur le chemin inférieur. Après changement d’aiguillage et descente réelle de la nacelle chargée, deux compagnons reviennent à pied charger le plateau, puis les douze finissent le monde. Les positions des passagers pendant la descente sont vérifiées. Ces essais ne prétendent pas démontrer un réembarquement depuis le palier supérieur : la récupération observée utilise le chemin inférieur réellement disponible.

Les tests Canvas suivent les mêmes appuis mobiles que la marche et le dessin. Ils contrôlent notamment l’arrivée du souffle sur une roue locale distincte, le déplacement des plateaux et de leurs points de tracé, l’ancrage de la nacelle, la sélection des véritables demi-ponts par la Gomme et la pause des animations. Les dépendances de mécanismes restent dans leur propre tableau. Les tests de parcours gardent les ventilateurs en marche pendant les traversées : le souffle qui relève un support ne devient pas une interdiction de marcher.

Dans le navigateur, **le premier tableau des Petits Plis a été joué manuellement** : les douze attendaient devant le pont abaissé ; actionner le ventilateur a entraîné la roue réceptrice, le câble et le tablier ; les douze ont ensuite traversé avec le ventilateur toujours en marche. Le taquet a maintenu le support après coupure du souffle. L’inspection du cinquième tableau des Petits Plis confirme l’absence de ventilateur et la présence de deux demi-ponts articulés distincts, commandés par leurs deux contrepoids.

L’accueil, le menu de pause, l’aide et les trois réglages de volume ont été examinés dans des cadres de navigateur **375 × 812** et **844 × 390**. Les commandes musicales ont été manipulées. Les trois nouvelles partitions et le cycle de vie audio sont couverts par les tests, avec un faux contexte Web Audio pour le scheduler et les sources ; **aucune écoute subjective des trois thèmes n’est revendiquée** pour cette validation.

Les quinze tableaux parcourus intégralement ci-dessus sont des simulations automatisées. Les essais manuels de cette livraison portent sur le premier tableau des Petits Plis, les inspections de mécanismes et les contrôles d’interface décrits ici. Ils ne constituent ni quinze parcours manuels, ni un essai sur iPhone physique, ni une preuve d’absence de tout état imprévu.

L’export autonome 3.2.0 a reçu une installation neuve avec `npm ci --ignore-scripts` (**48 paquets**). `npm run check` réussit : TypeScript, **236 tests sur 236**, aucun ignoré, puis compilation Vite. Le HTML autonome embarque les mêmes **25 images** que le paquet web. Ce compte rendu final est recopié dans l’export et ses empreintes sont recalculées ; aucun code validé n’est modifié. Les captures de contrôle restent dans le projet de création.

### Résultats de la livraison précédente 3.1.3

La suite complète du projet de création réussit **374 tests sur 374**, sans échec ni test ignoré. La vérification TypeScript réussit. Les neuf nouvelles régressions concernent les ventilateurs ; les parcours séquentiels des quinze tableaux et les sauvegardes auparavant bloquées restent validés. Les trois mondes simulés se terminent à **12 sauvés sur 12**, sans recommencement.

Les tests de rendu enregistrent les commandes Canvas effectivement émises. Ils vérifient l’absence de souffle à l’arrêt même après verrouillage du taquet, son immobilité en pause, sa direction, le maintien de la pose en mouvements doux, le pivot des sprites et le découpage des pales sur plusieurs angles. Les centres visibles des ventilateurs des Petits Plis 2 et des Veilleurs 4 restent sélectionnables aux échelles mobiles testées. Le premier ventilateur des Petits Plis conserve sa commande par le déflecteur.

Les positions mesurées sont aussi contrôlées visuellement dans le navigateur : les tests géométriques seuls ne prouvent pas l’alignement avec une illustration. Les fichiers d’images et les coordonnées de simulation sont inchangés.

Cette reprise a permis d’ouvrir le bon projet dans Chromium. Les deux ponts du premier tableau des Petits Plis ont été dessinés avec les gestes de l’interface ; le moulin a été actionné, le taquet verrouillé et le moulin arrêté, puis la troupe a emprunté les passages. Le ventilateur du quatrième tableau des Veilleurs a été activé et arrêté en touchant son moyeu visible. L’accueil, la navigation et la pause ont aussi été examinés dans des cadres **375 × 812** et **844 × 390**. En paysage, le deuxième ventilateur des Petits Plis a été commandé directement sur son moyeu : son souffle part vers la gauche et disparaît à l’arrêt. La coupure générale et le réglage Musique ont été manipulés dans la pause, puis le retour aux mondes et la reprise de la partie ont été vérifiés.

L’export autonome 3.1.3 a reçu une installation neuve avec `npm ci --ignore-scripts`. `npm run check` réussit : TypeScript, **217 tests sur 217**, aucun ignoré, puis compilation Vite. Le HTML autonome embarque les mêmes **25 images** que le paquet web. La présente mise à jour documentaire est recopiée dans l’export et ses empreintes sont recalculées ; elle ne modifie aucun code déjà validé. Les captures de contrôle restent dans le projet de création.

Ces contrôles sont des interactions de navigateur et des simulations automatisées. Ils ne sont pas présentés comme quinze parcours manuels, un essai sur iPhone physique ou une écoute subjective complète des trois musiques. La nuance de congestion devant la porte suivante des Veilleurs décrite en 3.1.2 reste valable.

### Résultats de la livraison précédente 3.1.2

La suite complète du projet de création réussit **365 tests sur 365**, sans échec ni test ignoré. La vérification TypeScript et `git diff --check` réussissent. Les quinze illustrations, les atlas et les données de géométrie sont inchangés.

Le cas signalé sur la capture de « Le premier nœud » a été reproduit sous 3.1.1 avec trois vrais tracés courbes, trois porteurs sur le plateau, neuf compagnons devant et la borne locale allumée. La sauvegarde est conservée dans `tests/fixtures/worlds-playability-curved-v311.json`. Rejouer cette même sauvegarde avec les anciennes règles laisse les trois porteurs derrière après cent secondes supplémentaires. Avec les règles 3.1.2, les douze franchissent le souvenir du premier tableau, sans nouveau clic de puzzle, sans changement de position au chargement et sans actionner le moulin du tableau suivant.

Un second blocage a été reproduit après le remplissage du deuxième plateau d’une double balance avant le premier. Le rappel s’arrêtait à l’aiguillage intermédiaire. `tests/fixtures/worlds-double-balance-stuck-v4.json` conserve la partie réellement bloquée ; la reprise corrigée fait revenir le porteur manquant à pied, puis le parcours peut se terminer à douze. Le premier plateau reste à verrouiller par le joueur.

| Contrôle ajouté | Cas | Résultat |
| --- | ---: | --- |
| Sauvegarde 3.1.1 avec borne locale allumée ; courbes larges et en S ; reprises pendant charge, activation et retour ; dessin tardif inversé et Undo | 12 | Réunion locale sans commande suivante |
| Doubles balances : trois mondes × deux positions du second aiguillage, plus sauvegarde réellement bloquée | 7 | Douze sauvés, aucun recommencement |
| Contrôleur séquentiel limité au tableau courant, courbes et sauvegarde à chaque transition | 15 tableaux dans 3 parcours | Trois mondes terminés à 12/12, aucune perte |
| Messages d’attente : causes distinctes, file courbe, pause, huit secondes, absence de répétition et pendule hors champ | 7 | États observés sans mutation du jeu |

Les **60 scénarios de perturbation conservés de 3.1.1** passent également : 57 arrivent à 12/12 ; les trois scénarios qui libèrent volontairement un éclaireur dans le balancier arrivent à 11/12, sans perte supplémentaire. Un audit exploratoire de **90 séquences sur les quinze réseaux** a aussi exercé 4 326 traits validés, 2 947 redessins et 1 956 annulations ; 89 redessins ont été refusés normalement parce qu’un compagnon avait rejoint le passage pendant le geste. Les régressions ciblées et les sauvegardes restent dans le dépôt.

Le parcours séquentiel n’actionne pas les tableaux futurs. Quatorze tableaux regroupent les douze au souvenir avant tout geste dans le suivant. À la sortie du premier tableau des Veilleurs, les douze ont quitté le pont et les plateaux ; la file devant la porte suivante peut remonter avant le souvenir (11/12 l’ont franchi dans ce parcours). Aucun porteur ne reste isolé. Après reprise, l’ouverture de cette porte, devenue le mécanisme du tableau courant, fait repartir toute la troupe. Ce cas de congestion est explicitement vérifié ; il n’est ni compté comme un souvenir acquis prématurément, ni corrigé en déplaçant les personnages.

Ces parcours sont des simulations automatisées utilisant les actions publiques du jeu. Ils complètent les essais de sélection et de caméra en formats mobiles ; ils ne constituent pas des essais sur un iPhone physique. La vérification manuelle de cette livraison n’a pas pu être menée dans cette session : la prévisualisation locale annoncée par l’environnement a affiché un autre projet dans le navigateur, y compris après rechargement, puis l’accès au Site privé publié a demandé une connexion ChatGPT absente du navigateur de test. Les résultats ci-dessus ne sont donc pas présentés comme trois parcours manuels complets.

L’export public 3.1.2 a reçu une installation neuve avec `npm ci --ignore-scripts` (**48 paquets**). `npm run check` réussit : TypeScript, **208 tests sur 208**, aucun ignoré, puis compilation Vite. Le HTML autonome embarque les mêmes **25 images** que la distribution web. La mise à jour finale de ce compte rendu est recopiée dans l’export et son manifeste est recalculé ; elle ne modifie pas le code validé.

### Résultats de la livraison précédente 3.1.1

La suite complète du projet de création réussit **321 tests sur 321**, sans test ignoré. La vérification TypeScript et le contrôle des espaces du diff réussissent également. Les tests publics sont inclus dans cette suite ; l’export autonome reçoit ensuite sa propre installation et sa propre vérification.

La nouvelle matrice de jouabilité comprend **60 scénarios sur les quinze tableaux**. Chaque point de départ est une sauvegarde obtenue en parcourant réellement la simulation depuis le début ; les tests ne déplacent aucun compagnon et n’activent pas les relais par affectation directe. Les perturbations sont effectuées par les mêmes commandes que le jeu, puis un contrôleur de parcours reprend ces commandes pour vérifier l’arrivée au refuge.

| Situation vérifiée | Scénarios | Résultat |
| --- | ---: | --- |
| Dessin dans l’autre sens, gomme, annulation et rechargement | 15 | Douze sauvés, aucune perte |
| Changements répétés de routes et de commandes pendant les déplacements | 15 | Douze sauvés, aucune perte |
| Vent et taquet pendant la montée en puissance | 6 | Douze sauvés, aucune perte |
| Nacelle inversée à l’embarquement, à mi-course ou au palier haut | 12 | Douze sauvés, aucune perte |
| Doubles balances partiellement chargées, traits et aiguillages modifiés, deux rechargements | 6 | Douze sauvés, aucune perte |
| Pause et rechargement pendant un passage sous un balancier | 3 | Douze sauvés, aucune perte |
| Un éclaireur volontairement libéré au mauvais moment sous un balancier | 3 | Onze sauvés après une collision réelle, aucune perte supplémentaire |

Les **60 cas aboutissent sans recommencer**. Cinq régressions ciblées vérifient en plus les changements rapides à ×1 et ×2, les refus de déverrouillage sous une troupe engagée, les raisons d’attente et la reprise d’une sauvegarde qui bloquait effectivement avant le correctif. Cette dernière conserve le temps et les coordonnées, libère l’ancien chemin occupé à tort, puis finit à **12/12**. La balance reste à actionner par le joueur. Sept tests de sélection et de caméra couvrent les commandes des trois mondes et le cas de trois porteurs en attente dans quatre formats de téléphone.

Dans le navigateur, le premier réseau des Boucles a été manipulé avec dessin des passages, charge des trois porteurs, verrouillage de la molette, toucher d’un visage et changement d’aiguillage. Le diagnostic « Le relais plus loin retient encore les porteurs » est apparu sans modifier le cran. Dans le deuxième tableau, les deux passages ont été tracés et le moulin puis son taquet actionnés. Le retour au premier tableau a permis de constater le plateau vide et le départ de ses anciens porteurs sur leur trait de retour. Le cadrage, le glissement, le retour vers un groupe et les commandes ont été vérifiés en portrait **375 × 812** et paysage **844 × 390**, dans un navigateur Chromium avec un cadre aux dimensions mobiles.

Cette validation tactile ne constitue pas un essai sur un iPhone physique. Les parcours exhaustifs des quinze tableaux décrits ci-dessus sont des simulations automatisées ; ils ne démontrent pas l’absence de tout état imprévu possible. Les images de production et les règles de difficulté restent identiques à celles de la version 3.1.0.

L’export public 3.1.1 a été installé dans un dossier neuf avec `npm ci --ignore-scripts` (**48 paquets**), puis vérifié avec `npm run check` : TypeScript, **164 tests réussis sur 164**, aucun ignoré, et compilation Vite réussie. Le HTML autonome contient les mêmes **25 images** que la distribution web. Les dernières mises à jour du présent compte rendu sont ensuite recopiées dans l’export, son manifeste est recalculé et les fichiers de distribution sont reconstruits sans modifier le code testé.

### Résultats de la livraison précédente 3.1.0

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

Le paquet ne contient ni historique Git, identité d’hébergement, variables d’environnement, connecteurs, ancien moteur, médias audio historiques ni archives de création. Les anciennes sources restent dans leurs projets et historiques. `PUBLIC-MANIFEST.json` énumère les fichiers, tailles et SHA-256. Son champ `version` désigne le format du manifeste ; `gameVersion` reprend **3.2.2**, comme le package, le lock et le manifeste des médias.

Dans un export neuf, `npm ci && npm run check` vérifie la distribution publique. L’export et le build locaux ne publient ni release ni site à eux seuls.

## Releases

Le workflow `.github/workflows/release-worlds.yml` se déclenche sur `main` lors d’un changement de `package.json` ou du workflow, ou manuellement. Il valide la version SemVer, vérifie qu’une release n’existe pas déjà, installe les dépendances et lance `npm run check`.

Il prépare ensuite :

- `Coup-de-Main-${version}.html`, le HTML autonome ;
- `Coup-de-Main-${version}-web.zip`, le dossier web sans le HTML autonome déjà proposé séparément ;
- `SHA256SUMS-${version}.txt`, les empreintes de ces deux fichiers.

Les notes reprennent l’entrée `## [version]` correspondante de [CHANGELOG.md](../CHANGELOG.md). Une entrée absente bloque la publication. La release `v${version}` vise le commit compilé ; une release existante n’est pas écrasée. Un tag préexistant pointant vers un autre commit bloque également la publication. Les préversions SemVer sont marquées comme telles.

Le dépôt cible vient de `GITHUB_REPOSITORY`. L’hébergement web et les releases sont distincts : une compilation réussie ne prouve pas qu’un site sert déjà cette version. Les anciennes releases restent identifiables et ne doivent pas recevoir un fichier compilé avec la nouvelle entrée.
