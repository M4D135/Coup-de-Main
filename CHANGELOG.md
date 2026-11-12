# Coup de Main — Historique des versions

Les sources et les fichiers prêts à jouer sont publiés dans le [dépôt Coup de Main](https://github.com/M4D135/Coup-de-Main).

## [3.2.1]

### Contact physique pendant la traversée

- Couper le vent au milieu d’une traversée ne permet plus de quitter un pont abaissé pour rejoindre le palier en marchant dans l’air. Le compagnon reste sur le tablier, suit sa position et repart lorsque le contact est rétabli.
- Les deux demi-tabliers sont parcourus séparément. Le vide entre leurs extrémités ne devient plus un segment de chemin implicite ; un compagnon déjà sur la seconde moitié peut rejoindre sa charnière fixe.
- La sauvegarde et la reprise conservent cette attente. Les messages distinguent un palier encore éloigné et deux demi-ponts séparés.

### Transmissions plus lisibles

- Les câbles des deux pédales d’éclaireurs et des trois freins partent du moyeu effectivement dessiné sur leur plateau mobile. Les anciens tambours détachés disparaissent.
- Dans le quatrième tableau des Veilleurs, le pont à vent possède son tambour et son renvoi distincts de la nacelle à manivelle. Les renvois proches d’une manivelle restent séparés visuellement, y compris dans Petits Plis 4.
- Les dix tambours de contrepoids tournent selon la longueur du câble réellement déroulé. Les taquets superposés aux tambours reprennent leur rotation visible.

### Musique et documentation

- Les trois thèmes joyeux de 3.2.0 sont conservés. Un contrôle reproductible exécute les 32 mesures de chaque thème avec le moteur de synthèse et de programmation réel sur un contexte Web Audio instrumenté : aucune note manquante ou doublonnée et aucune rafale au retour d’un onglet masqué.
- La musique reste active pendant la pause pour permettre le réglage du volume. Le script de contrôle décrit ses limites : il ne produit pas de PCM et ne remplace pas une écoute.
- Le guide des trois mondes décrit désormais les transmissions locales et les nouvelles musiques. Les illustrations originales restent identiques.

Les résultats de cette livraison et la limite rencontrée dans l’aperçu du navigateur sont détaillés dans `docs/BUILD.md`.

## [3.2.0]

### Des causes mécaniques visibles

- Les passages articulés suivent une géométrie commune au rendu, à la marche et aux contrôles de contact. Un pont se traverse quand ses extrémités se rejoignent et que son mouvement s’est stabilisé.
- Le souffle possède une source, une direction, une portée et une roue réceptrice. La force reçue entraîne le treuil et le câble du pont ; une roue derrière le ventilateur ou hors de son faisceau ne reçoit aucune force.
- Les sources, déflecteurs, récepteurs, poulies et câbles sont représentés dans leur propre tableau. Les anciens verrouillages à distance entre tableaux ont été retirés.
- Les plateaux descendent sous la charge des porteurs, avec accélération, inertie et amortissement. Les compagnons, les appuis tactiles et les dessins suivent leur déplacement. Les deux balances commandent deux demi-ponts distincts.
- Les nacelles sont hissées par une manivelle visible. Leur charge agit sur le mouvement ; les passagers embarquent et débarquent aux paliers.
- Les éclaireurs appuient réellement à deux sur une pédale. Son câble actionne un pont ou arme la retenue d’un balancier. Le frein dissipe le mouvement et retient le poids à un angle sûr, sans le déplacer artificiellement.
- Un cran bloque une position effectivement atteinte. Les porteurs quittent leur plateau dès que leur retour est construit et le cran engagé, sans attendre une borne sur une autre route.
- Le ventilateur artificiel du dernier tableau des Petits Plis a été retiré : les deux contrepoids entraînent directement les deux tabliers par le treuil existant.

### Trois nouvelles musiques joyeuses

- Trois partitions originales de 32 mesures, avec thèmes et réponses distincts : piano bondissant des Boucles à 116 BPM, flûte légère des Petits Plis à 124 BPM et piano jouet des Veilleurs à 108 BPM.
- Mélodies majeures, basses alternées, accords pincés, contretemps et percussions de bois ou brosses douces. Les Veilleurs quittent leur ancienne ambiance lente en mineur pour un swing léger.
- Attaques plus courtes, réverbération musicale réduite et respirations en fin de phrase. Les trois volumes et la coupure générale restent indépendants.

### Reprise et compréhension

- La sauvegarde V3 conserve une révision mécanique distincte, les vitesses et les poses utiles. Les parties compatibles antérieures conservent leurs compagnons, leurs dessins et leurs retenues.
- Les messages d’attente expliquent le contact manquant ou le mécanisme en mouvement. Le menu de pause décrit la chaîne mécanique du tableau courant.
- Les quinze illustrations complètes, les personnages et leurs atlas sont conservés. Le modèle reste celui de mécanismes 2D guidés et de chemins dessinés, avec des forces et contraintes explicites.
- Les vérifications mécaniques, les parcours et les essais de navigateur de cette livraison sont détaillés dans `docs/BUILD.md`.

### Validation de la livraison

- La suite complète du projet de création réussit 393 tests sur 393 et la vérification TypeScript passe. Les trois mondes et leurs quinze tableaux sont terminés automatiquement à 12/12 ; les reprises anciennes, les courbes, les contrôles locaux et les récupérations après mauvais aiguillage sont conservés.
- Le premier tableau des Petits Plis a été parcouru manuellement dans le navigateur : les douze traversent avec le ventilateur en marche et le taquet retient le pont une fois le souffle coupé. Le menu, l’aide et les trois volumes sont accessibles aux formats 375 × 812 et 844 × 390.
- Ces essais d’interface ne sont pas présentés comme quinze parcours manuels ou une écoute subjective des musiques. La validation de l’export autonome est distincte de celle des sources du projet de création.

## [3.1.3]

### Ventilateurs raccordés à leur état réel

- Le souffle apparaît uniquement quand le ventilateur est alimenté. Un taquet qui maintient le support levé ne produit plus de vent après l’arrêt du moulin.
- Les traits de vent se figent avec la pause. Activer les mouvements doux conserve la position de l’hélice sans la faire revenir brusquement à zéro.
- Les petits ventilateurs des deux premiers tableaux des Petits Plis tournent autour du moyeu de leur carter peint. Les pales restent dans l’ouverture ; le deuxième souffle du bon côté, vers la gauche.
- Dans « Le souffle des braises », l’hélice en laiton est recentrée et réduite pour rester dans le logement du ventilateur. Le grand moulin de papier et les quinze illustrations sont conservés.

### Reprise et validation

- Une erreur de chargement ou de rendu permet de revenir aux trois mondes grâce au bouton « Les mondes », en plus de « Réessayer ».
- Les corrections de porteurs, de doubles balances et de reprise de la version 3.1.2 sont conservées et vérifiées sur les quinze tableaux.
- Des régressions Canvas contrôlent le souffle marche/arrêt avec un taquet engagé, la pause, les mouvements doux, les pivots, la découpe des pales et les cibles tactiles. Les résultats automatisés et les interactions réellement essayées sont détaillés dans `docs/BUILD.md`.

## [3.1.2]

### Réunir les porteurs dans leur propre tableau

- Les balances des Boucles, des Petits Plis et des Veilleurs libèrent maintenant leurs porteurs lorsque leur borne locale est allumée, leur cran verrouillé et leur passage de retour tracé. Une borne allumée ne cache plus une dépendance à un relais dans le tableau suivant.
- Une sauvegarde déjà dans cette situation reprend avec les mêmes personnages et les mêmes courbes. La correction ne recommence pas le monde et n’actionne aucun mécanisme à la place du joueur.

### Récupérer une mauvaise répartition entre deux balances

- Un groupe ayant dépassé deux aiguillages peut revenir charger le premier plateau resté vide après sa réorientation. Le rappel ne s’arrête plus au second aiguillage demeuré inchangé.
- Le retour suit uniquement les chemins réellement parcourus par ces compagnons. Les souvenirs, les plateaux occupés ou verrouillés et les mécanismes à sens unique restent des limites ; personne n’est téléporté.

### Comprendre une attente sans ouvrir de panneau

- Actionner une balance affiche brièvement son état et la condition qui retient encore ses porteurs. Retrouver un groupe hors champ indique aussi sa raison d’attendre.
- Lorsque toute la troupe est immobile, un message discret décrit l’obstacle après huit secondes. Il ne se répète pas tant que la situation reste identique et ne résout aucune énigme.
- La tête d’une file est déterminée par l’avancée sur le vrai tracé, y compris une courbe qui revient vers la gauche. La pause conserve le diagnostic d’un compagnon déjà arrêté.

### Vérification des situations signalées

- Deux sauvegardes réellement bloquées avant correction sont conservées comme régressions : les trois premiers porteurs avec leur borne allumée, et une double balance incomplète après changements d’aiguillage.
- Les parcours sont éprouvés avec courbes larges, tracés en S, dessins inversés ou tardifs, annulations et reprises pendant les déplacements. Un contrôleur séquentiel vérifie aussi les trois voyages en agissant sur un tableau à la fois.
- Les quinze illustrations et les atlas de personnages sont conservés. Le détail des résultats et les limites des essais sont dans `docs/BUILD.md`.

## [3.1.1]

### Les compagnons repartent après un changement de route

- Un compagnon revenu à un aiguillage quitte maintenant réellement son ancien chemin. Il ne peut plus bloquer le retour du suivant tout en conservant une place dans le quota des porteurs.
- Les sauvegardes déjà touchées par ce blocage reprennent sur leur carrefour, sans déplacer la troupe, changer les mécanismes ni recommencer le monde.
- Les messages des balances distinguent un cran verrouillé d’une sortie encore retenue par un relais. Toucher un compagnon qui attend affiche brièvement son état réel, en conservant son coucou.

### Commandes accessibles sur téléphone

- La réserve d’encre est placée dans le cartouche du titre : elle ne recouvre plus la molette sous le plateau.
- Les éléments d’affichage passifs et les espaces entre les boutons laissent passer les gestes vers le décor.
- Toucher le visage d’un porteur s’adresse au compagnon. Toucher la molette ou un bord du plateau agit sur la balance ; un simple tap ne démarre plus un faux trait depuis le bord.

### Parcours éprouvés

- Une nouvelle matrice de régression traverse les quinze tableaux après des dessins inversés, des effacements, des annulations, des changements répétés d’aiguillage, des inversions de nacelle et des reprises de sauvegarde.
- Les doubles balances sont reprises en charge partielle, et les balanciers sont testés après une sauvegarde pendant la traversée ainsi qu’après la perte réelle d’un éclaireur. Les survivants doivent rejoindre le refuge sans perte supplémentaire ni recommencement.
- Les trois mondes conservent leurs quinze illustrations, leurs personnages et leur difficulté. Les résultats exacts des tests et les essais effectués dans le navigateur sont consignés dans `docs/BUILD.md`.

## [3.1.0]

### Retrouver les trois mondes illustrés

- Les trois premières scènes complètes d’origine sont rétablies. Les arbres, falaises, ateliers et maisons ne sont plus prélevés en morceaux pour composer un décor générique.
- Douze nouvelles illustrations complètes prolongent ces scènes : cinq tableaux par monde, quinze au total. Chaque tableau possède sa propre composition, dans la matière de sa famille : encre et papier crème, origamis, ou bois et laiton éclairés à la lampe.
- Les chemins et les points d’interaction sont recalés sur ces compositions. Le parcours logique mesure 16 000 × 1 800 unités ; la troupe, les dessins et les mécanismes persistent entre les cinq tableaux.
- Les PNG d’origine sont conservés. Les nouveaux tableaux sont distribués en WebP ; leur provenance et leurs prompts sont documentés.

### Une caméra qui laisse vivre l’illustration

- Une seule planche occupe l’écran à la fois. La vue reste dans son cadre, avec un bref voile de papier lors du passage au tableau suivant.
- Glisser explore le tableau, pincer ou utiliser la molette ajuste le zoom, et les flèches ou les cinq repères permettent de tourner les pages. Un glissement prolongé au bord change également de tableau.
- Une petite pastille signale les compagnons qui attendent à gauche ou à droite hors du champ. La toucher retrouve leur groupe.
- Le titre montre l’avancée dans les cinq tableaux. Les arrivées au refuge sont distinguées de cette progression locale.

### Des compagnons auxquels donner un coup de main

- Toucher un compagnon lui fait répondre par un coucou et une petite voix.
- Des tempéraments différents rythment les attentes : curiosité, enthousiasme, bâillement, timidité et petite révérence. Un voisin peut répondre, avec des pauses entre ces échanges.
- Les compagnons proches d’un mécanisme réagissent à son mouvement. Une attente qui se termine déclenche un petit bond de soulagement.
- La marche suit la distance et la taille des personnages. Les visages restent ceux des atlas approuvés ; la réduction des animations est respectée.

### Reprises et blocages

- Un taquet ayant déjà soutenu le passage de la troupe reste engagé. Une commande ou une annulation ne peut plus couper à distance un appui déjà utilisé, notamment avant « Le courant contraire ».
- Les sauvegardes concernées rétablissent uniquement les appuis dont l’utilisation est prouvée par les passages enregistrés ; les énigmes encore non résolues restent à résoudre.
- Les chemins réservés à un retour sont protégés contre l’effacement. Une ancienne partie ayant perdu un tel chemin attend sur sa rive, au lieu de marcher dans le vide.
- La migration de géométrie conserve les identités, la progression relative sur les chemins, les mécanismes, les dessins et les souvenirs compatibles lors du recalage sur les illustrations.
- Le jeu affiche la raison réelle d’un refus d’action, au lieu d’un message générique.

## [3.0.0]

### Trois grandes cartes continues

- Chaque monde mesure 16 000 × 900 unités et réunit dix secteurs, cinq réseaux de mécanismes et un refuge final.
- La même troupe traverse la carte. Les groupes, porteurs, relais, souffles et transports peuvent agir sur des passages plus loin dans le décor.
- Des souvenirs sont conservés lorsque tous les survivants ont franchi un repère. Ils permettent de reprendre le parcours avec ses dessins et ses réglages.
- Le score devient direct : dix sauvés donnent une étoile, onze en donnent deux et douze en donnent trois. L’encre reste une ressource de construction, récupérable avec la Gomme.

### Des gestes dans le décor

- Toucher commande un mécanisme, tracer depuis un appui construit un passage, glisser explore et pincer ajuste le zoom.
- La petite carte et le recentrage permettent de retrouver les groupes sur le long parcours.
- L’interface privilégie le décor et un menu de pause compact. Les anciennes étapes séparées, listes d’objectifs et panneaux d’indices sont remplacés par ce parcours continu.
- Les anciennes sauvegardes sont reconnues sans transposer leurs positions dans les nouvelles cartes. Les résultats V3 sont identifiés séparément.

### Une création sonore originale

- Trois thèmes avec mélodies, réponses, harmonies, basses et variations d’arrangement : piano doux, flûte et célesta selon le monde.
- Bruitages de matière et petites voix synthétiques propres aux réactions des compagnons, jusqu’à leur réunion finale.
- Trois volumes indépendants : musique, bruitages et voix, avec coupure générale.
- Écoute centrée sur la région visible, polyphonie limitée et annulation des sons programmés quand la page est masquée.
- Aucun morceau téléchargé, échantillon vocal extérieur ou nouveau PNG n’est requis pour cette version.

### Des compagnons plus expressifs

- La marche suit la distance parcourue et chaque pose conserve son contact au sol. Clignements, regards vers les voisins, petits saluts et réactions à l’arrivée rythment la troupe.
- L’hélice possède un cadre frontal, un seul moyeu et un socle relié à la rive. Sa rotation accélère et ralentit avec la commande.
- Les terrains et les supports suivent les vrais chemins de la simulation, avec les matières peintes, pliées ou boisées de chaque monde.
- Le cadrage et les gestes sont adaptés aux téléphones en portrait et en paysage ; les écritures de sauvegarde préservent les réglages récents d’un autre onglet.

## [2.1.1]

- L’écran titre affiche le numéro de version du jeu sous le nom, pour vérifier d’un coup d’œil la version jouée.

## [2.1.0]

### Des voyages en trois actes

- Chacun des trois mondes propose trois énigmes successives : neuf tableaux à résoudre au total.
- Chaque acte possède son objectif et sa combinaison de passages et de mécanismes. Le contenu supplémentaire vient de nouvelles décisions : éclaireurs, séquences de réglages, partage de l’encre et itinéraires complémentaires.
- La troupe commence chaque voyage avec douze compagnons. Les survivants continuent dans l’acte suivant ; la progression distingue les actes achevés du tableau en cours.
- Le menu permet de recommencer le tableau courant ou de repartir à douze depuis le début du voyage, en conservant le meilleur résultat.

### Des règles visibles dans le décor

- La sélection d’un mécanisme permet de lire son rôle et son état avant de choisir une commande nommée.
- Les objectifs, les conditions des mécanismes et la progression de l’acte sont présentés pendant le jeu.
- La Gomme permet de choisir un trait libre par son nom et de récupérer son encre. Les passages occupés restent protégés.
- Les étoiles finales se calculent après les trois actes, avec un budget d’encre cumulé annoncé pour le voyage.
- Les indices restent facultatifs. Leur consultation et les nouvelles tentatives ne diminuent pas les étoiles.

### Continuité et distribution

- Les trois directions artistiques, leurs artworks, les atlas à huit poses et les accessoires animés sont conservés.
- Les anciennes sauvegardes ne sont pas présentées comme des voyages de trois actes déjà terminés.
- Le paquet public porte la version 2.1.0. Les releases incluent les changements de cette page, le HTML autonome, le ZIP web et leurs empreintes SHA-256.

## [2.0.0]

- Première distribution de Coup de Main dans son propre dépôt public.
- Trois mondes : Les Boucles, Petits Plis et Les Veilleurs, avec un premier tableau chacun.
- Douze compagnons autonomes, passages dessinés, mécanismes de coopération, trois étoiles et sauvegarde locale.
- Trois artworks de référence, scènes adaptées pour le jeu, personnages animés et bruitages procéduraux.
- Fichier HTML autonome et distribution web à ressources séparées.

L’aventure V1.6.1 à contrôle direct reste dans le [dépôt historique](https://github.com/M4D135/Un-seul-trait). Elle ne fait pas partie du paquet Coup de Main.
