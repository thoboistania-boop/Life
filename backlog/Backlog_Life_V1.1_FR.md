# Life : V1 et backlog

Version 1.1 du 2026-10-24. Tri fait d'après ce qui existe réellement dans l'application aujourd'hui.
Règle : ce qui est construit = V1 ; tout le reste = backlog.

## Historique des versions

| Version | Date | Changement |
|---|---|---|
| 1.0 | 2026-10-24 | Création du backlog avec 4 idées (fichier Backlog_Life.md) |
| 1.1 | 2026-10-24 | Tri complet de la liste fonctionnelle entre V1 et backlog |

---

## Partie 1. La V1 (ce qui existe dans Life)

### Principes et design
- Application web installable sur le téléphone (pensée mobile d'abord), nom Life.
- Design glassmorphism (transparences, coins arrondis) avec la palette #FFECCD, #FCD9F7, #E3E2E2, #CAFAFF, #FFFEFB, #FFFFFF (et quelques couleurs en plus pour les catégories).
- Compte avec mail et mot de passe, données sauvegardées en ligne.
- Premier lancement guidé : choix des catégories, rythme de la journée, tâches d'exemple en option.

### Navigation (barre du bas)
- Tâches, Calendrier, Home au centre avec le logo, Discuter, Réglages.
- Écart avec la liste : il y a 5 onglets au lieu de 4 (l'onglet « Discuter » s'ajoute).

### Page Home
- Logo, barre de progression des tâches du jour (faites / total), bouton « Créer une tâche ».
- « Ma journée » en timeline horaire : réveil, bloc travail discret (avec trajet), tâches du jour triées par priorité, coucher.
- Carte de tâche : cercle à cocher, nom, couleur et emoji de la catégorie, durée.
- Menu 3 points : modifier, ou remplacer par une tâche prévue plus tard d'effort similaire.
- Clic sur une tâche : fiche de détail.
- Aperçu réduit des 3 jours suivants (nombre de tâches, durée totale, météo).
- Petit lien « Voir la vue calendaire ».
- En plus : météo du jour, boutons « Alléger » et « Replanifier », message « Tout est fait 🎉 » qui propose d'ajouter des tâches, barre « Demande quelque chose à Life ».

### Catégories et tâches
- Boutons « Créer une tâche », « Créer une catégorie », « Historique ».
- Liste des catégories (triées par priorité, avec le nombre de tâches en cours).
- Page d'une catégorie : ses tâches (avec sous-tâches en arbre), tâches terminées repliées, bouton « Créer une tâche ».
- Historique des tâches validées sur les 60 derniers jours.
- Catégories de départ : Organisation perso, Travail & projets perso, Maison & ménage, Bien-être, Loisirs & sorties.

### Création d'une catégorie
- Nom, emoji, description, couleur (8 couleurs au choix), priorité de 1 à 10 avec comparaison aux autres catégories.

### Création d'une tâche
- Nom, catégorie principale et autres catégories.
- Ponctuelle (jour prévu, date limite) ou récurrente (tous les X jours, certains jours de la semaine, un jour du mois), heure précise en option.
- Durée en minutes (raccourcis 10 min à 2 h) et effort de 1 à 5 : c'est la « difficulté » de la liste.
- Priorité de 1 à 10, avec les priorités des autres tâches de la même catégorie.
- « Obligatoire » (gardée même les jours chargés) et « Faisable au travail ».
- Description.
- Sous-tâches : en ajouter, ou dire que la tâche est la sous-tâche d'une autre.

### Règles de priorité
- La catégorie l'emporte sur la tâche.
- 3 règles au choix dans les réglages : la catégorie toujours d'abord ; sauf urgence (date limite à 2 jours ou moins) ; sauf urgence et une place pour chaque catégorie (règle conseillée, par défaut).

### Planification automatique
- Life remplit la journée toute seule, le matin même, dans les créneaux libres.
- Respect du réveil, du travail, du trajet et du coucher.
- Tâches « faisables au travail » placées pendant le travail.
- Pas plus de 2 tâches exigeantes par jour, sauf si elles sont obligatoires.
- Charge adaptée : si beaucoup de tâches ne sont pas faites, la journée est allégée ; si tout est fait, Life en ajoute. Réglage manuel « Alléger » / « Ajoute-moi des tâches ».

### Calendrier
- Vue semaine et vue mois, avec la météo des jours à venir ; clic sur un jour pour voir son contenu ; jours passés = tâches validées.

### Notifications et alertes
- Alerte 10 minutes avant chaque tâche à heure précise : dans la page (avec son) et en vraie notification sur le téléphone.
- Bouton pour activer les notifications et envoyer une notification test.

### Réglages
- Réveil, coucher, travail (horaires et jours), temps de trajet, ville.
- Règle de priorité, charge de la journée, masquer les tâches faites, alertes et son.
- Import des données, déconnexion, tout effacer.

### Discussion et recherche internet (version simple, avec Claude)
- Onglet « Discuter » et barre de la Home : le message est transmis à Claude, qui répond et peut créer, modifier ou cocher des tâches, quand Claude Code est ouvert sur le PC.
- Dans une tâche, « Recherche internet » : Claude cherche horaires, prix, lieu et besoin de réserver, et écrit la réponse dans la tâche.
- Ce n'est pas encore une IA intégrée à l'appli : sans Claude Code ouvert, pas de réponse (voir backlog, partie IA).

---

## Partie 2. Le backlog (tout ce qui n'est pas dans la V1)

Le numéro entre crochets renvoie à la section de la liste fonctionnelle.

### Tâches et planification
- [6] Image sur une tâche : la case existe dans le formulaire mais ne marche pas dans la version actuelle.
- [8] Classement des tâches en 3 types (obligatoires quotidiennes, loisirs, ponctuelles obligatoires) : aujourd'hui seulement une case « Obligatoire ».
- [8] Durées moyennes par type de tâche, établies à partir d'études.
- [11] Formulaire de création différent selon la catégorie.
- [11] Autres préférences d'interface (aujourd'hui seulement « masquer les tâches faites »).
- [Backlog 1.0] Rangement automatique par mot-clé, ou Life demande dans quelle catégorie ranger.
- [Backlog 1.0] Envoyer un lien (publication, site) : Life lit la page et l'ajoute à une tâche.

### Calendrier et notifications
- [9] Liaison avec un calendrier extérieur (Google, Outlook, iPhone).
- [10] Alertes contextuelles (au-delà du rappel 10 minutes avant).
- [10] Rappels pour les tâches sans heure précise.
- [Backlog 1.0] Messages et appels de Life, surtout le discours du réveil et le discours du coucher (prioritaire).

### Médicaments et traitements [12]
- Catégorie dédiée (retirée de la version actuelle).
- Rappels de prise et d'achat, ordonnances en PDF, suivi des traitements.

### École et études [13]
- Catégorie dédiée (retirée de la version actuelle).
- Devoirs et échéances, soutenances, rapport de master en étapes avec rétro-planning, révisions et examens, documents (PDF, notes).

### Ménage et maintenance [14]
- Organisation par pièce ou par type de tâche (aujourd'hui : simples tâches dans la catégorie Maison & ménage).

### Loisirs [15]
- Lecture : liste de souhaits, livre en cours, livres finis avec avis, où acheter, lecture répartie sur plusieurs jours, question « Tu as fini ce livre ? » avec 3 réponses.
- Films et séries : à voir, en cours, vus avec avis.
- Activités : recherche automatique des billets, prix, horaires et lieu, besoin de réserver, placement à un moment libre, rappel pour prendre les billets à temps. Aujourd'hui seule la recherche « à la demande » par Claude existe.
- Proposition de l'activité suivante une fois une tâche terminée (pour tous les types de tâches).

### Bien-être [16]
- Cycle menstruel : suivi, humeur et énergie par phase, activités adaptées (retiré de la version actuelle).
- Routine soins visage et peau dédiée (aujourd'hui : simple tâche récurrente).
- Sport : programmes, objectifs, suivi de progression.
- Perte de poids : objectifs et suivi.
- Santé générale, hydratation, sommeil.

### Organisation personnelle [17]
- Dates importantes et anniversaires avec idées cadeaux par personne.
- Listes par thème et listes de la semaine.
- Objectifs personnels.
- Voyages : destinations, réservations, itinéraires, budget.

### Météo et adaptation [18]
- Adapter le planning selon la météo, recommandations de vêtements et d'activités, intérieur ou extérieur. (La météo est déjà affichée dans la V1, mais elle ne change rien au planning.)

### Idées [19]
- Stockage et développement des idées, suivi des projets personnels.
- Bingo visuel : cases à repérer, modes personnel / collaboratif / compétitif, points, animation et case verrouillée.

### Finances et budget [20]
- Budget du quotidien et des courses, objectifs d'épargne, factures, impôts et démarches.
- [Backlog 1.0] Connexion au compte courant pour voir le solde et prévoir le budget du mois, de la semaine ou du jour (en lecture seule, via un service bancaire agréé, jamais avec les identifiants recopiés).

### Vêtements et mode [21]
- Garde-robe, liste d'achats, entretien, tenues par occasion et selon la météo.

### Social et réseaux [22]
- Connexion aux posts Instagram et TikTok, sauvegarde d'idées et de tendances, challenges et tutoriels.

### Souvenirs et impressions [23]
- Boîte à souvenirs avec photos, notes et timeline.
- Propositions après un événement : albums, livres, goodies, cartes postales.
- Impressions utiles : listes et to-do mises en page, plannings imprimables, étiquettes.
- Comparaison de services d'impression, jeu de cartes personnalisé, bibliothèque de modèles et export pour impression pro.

### IA intégrée [24]
- IA directement dans l'appli, qui marche sans Claude Code ouvert sur le PC.
- Arbre de dialogue complet : activité en langage naturel → bonne catégorie → recherche des infos → place dans le calendrier → rappels. (La V1 en fait une partie via Claude : créer la tâche dans la bonne catégorie et chercher sur internet.)
- Suggestions d'activités à la fin d'une tâche.
- « Aide-moi » et « Découper en étapes » dans une tâche : boutons prévus dans le code, mais inactifs dans la version actuelle.

---

## Points à trancher

1. Onglet « Discuter » : on le garde dans la V1 (5 onglets) ou on revient aux 4 onglets de la liste ?
2. Ta liste dit « pas d'IA conversationnelle en V1 », mais la discussion avec Claude existe. Je l'ai laissée dans la V1 comme version simple : à confirmer.
3. Ajustement de la charge (liste, section 24) : il marche déjà sans IA, par calcul, donc je l'ai classé en V1.
