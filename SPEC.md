# Les 66 Légions — Spécification technique

Jeu grandeur nature d'Halloween (mélange Among Us / Loup-Garou) pour **30 joueurs + 1 MJ**, durée 3 h, dans une grande salle découpée en zones. Ce document contient tout ce qu'il faut pour coder la plateforme. Il fait foi : en cas de doute, demander au MJ plutôt qu'inventer une règle.

---

## 1. Vue d'ensemble

Une seule application web, ouverte dans le navigateur du téléphone (aucune installation). Quatre surfaces partagent la même base temps réel :

| Surface | Route | Utilisateur | Rôle |
| --- | --- | --- | --- |
| Interface joueur | `/play` | 30 joueurs (mobile) | Rôle, pouvoirs, indices, scanner, vote, messageries, mode Esprit |
| Écran principal | `/screen` | TV / vidéoprojecteur (16:9, 1920×1080) | Diffusion publique, jamais de donnée secrète |
| Panneau MJ | `/mj` (protégé par mot de passe en variable d'env) | Le MJ (laptop) | Vue totale, déclenchements, réglages, corrections |
| Routes QR | `/q/[code]` | Tout scan | Résout le code selon qui scanne |

### Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase : Postgres + Realtime (Broadcast + Postgres Changes)
- Déploiement Vercel. URL de base dans `NEXT_PUBLIC_BASE_URL` (le domaine n'est pas encore choisi).
- Toute la logique de jeu côté serveur (Route Handlers / Server Actions avec la clé service role). Les clients ne lisent jamais les tables directement : ils reçoivent des vues filtrées.

### Sécurité (niveau soirée entre amis, mais solide)

- Chaque badge a un `token` aléatoire (32 caractères). Le premier scan d'un badge `B..` lie le téléphone à ce joueur via un cookie httpOnly contenant le token.
- Un joueur ne peut **jamais** recevoir le rôle d'un autre, sauf via un pouvoir qui le révèle.
- Canaux Realtime Broadcast aux noms non devinables : `screen` (public), `player:{token}`, `legion:{legionSecret}`, `spirits:{spiritsSecret}`, `mj:{mjSecret}`.
- RLS activée sur toutes les tables, aucune policy pour `anon` (tout passe par le serveur).

### Horloge du jeu (tick)

Le panneau MJ reste ouvert toute la soirée et appelle `POST /api/tick` chaque seconde. Le tick :
- résout les morts différées (`dies_at` dépassé),
- fait avancer les chronos (conseil, éclipse, missions éclair, cooldown du Conclave),
- déclenche les événements programmés (actes, conseils d'office, missions éclair),
- diffuse l'état de l'écran.
Le tick doit être idempotent (verrou / transaction) pour supporter un double appel.

---

## 2. Déroulé de la partie

Temps exprimés depuis le lancement par le MJ (T+0). Tous les horaires sont des réglages modifiables dans le panneau MJ.

| Heure | Phase | Effets système |
| --- | --- | --- |
| T+0:00 | `lobby` | Les joueurs scannent leur badge, saisissent leur prénom. Le MJ voit la liste |
| (bouton MJ) | `roles` | Attribution aléatoire des 30 rôles (ou manuelle). Chacun voit son rôle + tutoriel 60 s |
| T+0:15 | `intro` | Écran : vidéo d'intro (fichier dans `/public/videos/intro.mp4`) |
| T+0:22 | `act1` | Missions ouvertes, indices 1–3. Meurtres bloqués 8 min |
| T+0:30 | | Meurtres possibles |
| T+0:40 | | Mission éclair « La Veillée des 7 » |
| T+0:50 | | Conseil d'office |
| T+1:05 | `act2` | Indices 4–7. Éclipses et Pacte disponibles. Écran : interlude registre |
| T+1:20 | | Mission éclair « Le Jugement de Salomon » |
| T+1:30 | | Conseil d'office |
| T+1:45 | | Mission éclair codée (Cryptographe / Kabbaliste) |
| T+1:55 | | Conseil d'office |
| T+2:05 | `act3` | Testament du Notaire à l'écran, message Atbash, indices 8–10 |
| T+2:15 | | Fragments du Carnet activés |
| T+2:35 | | Dernier conseil « L'Accusation » (débat 6 min) |
| T+2:45 | `verdict` | Questionnaire final sur tous les téléphones (vivants + Esprits) |
| T+2:55 | `finale` | Révélations question par question, puis vidéo finale |

Un conseil d'office est sauté s'il y a eu un conseil dans les 10 min précédentes.

---

## 3. Camps et rôles (30)

Camps : `legion` (5), `neutral` (3), `witness` (22). « Une fois par acte » = remis à zéro à chaque changement d'acte.

### 3.1 La Légion (5)

Communs à tous les agents :
- Voient les 4 autres agents et leur nom goétique.
- Chat secret « Le Conclave ».
- **Meurtre partagé** : un seul meurtre disponible pour toute la Légion, cooldown 12 min (réglable). Un agent scanne le badge d'une victime → la victime meurt à `scanned_at + 90 s`. Le cooldown démarre au scan.
- Peuvent scanner les QR de missions : le scan est enregistré (visible par le Domestique) mais ne compte jamais.
- Scanner un fragment du Carnet actif le **brûle**.
- Ont 5 « phrases de couverture » pour le châtiment de la Confession.

| id | Nom | Pouvoir | Limite |
| --- | --- | --- | --- |
| `baal` | Baal, le Premier Roi | Invisibilité : à activer avant ou pendant un conseil ; les votes contre lui sont annulés et l'écran affiche 0 | 1/partie |
| `paimon` | Paimon, Maître des Langues | Fausse prophétie : rédige un texte (titre + corps, 280 car. max) qui s'affiche à l'écran au format « Indice » | 1/acte |
| `beleth` | Beleth, le Roi Terrible | Éclipse : 3 min, écran rouge, tous les scans de missions refusés | 1/acte (à partir de l'acte 2) |
| `purson` | Purson, qui voit le passé | Voyance : scanne un badge et lit le rôle exact | 1/acte |
| `asmodee` | Asmodée, le Corrupteur | Pacte : choisit un Témoin vivant ; celui-ci reçoit une proposition (accepter / refuser, 60 s). Accepte → camp `legion`, perd son pouvoir, rejoint le Conclave. Refuse ou expire → il est notifié qu'un agent a tenté de le corrompre, sans savoir qui | 1/partie (à partir de l'acte 2) |

### 3.2 Les Neutres (3)

| id | Nom | Objectif | Pouvoir |
| --- | --- | --- | --- |
| `judas` | Judas | Être expulsé par vote avant l'acte 3 | Apparaît `legion` à l'Inquisiteur. Bouton « Faux rôle » : son interface affiche un rôle de Témoin crédible (choisi parmi la liste) tant qu'il le maintient |
| `plume` | La Plume, journaliste | Scanner lui-même au moins 2 fragments du Carnet | Reçoit 1 fait vrai par acte (pool défini par le MJ) et peut le publier en « Scoop » à l'écran |
| `alchimiste` | L'Alchimiste | Posséder les 7 métaux à la fin | Les 7 détenteurs de métal peuvent lui céder leur métal en scannant son badge (action volontaire). Chaque métal reçu = 1 question oui/non envoyée au MJ, à laquelle le MJ répond depuis son panneau |

### 3.3 Les Témoins (22)

| id | Nom | Pouvoir | Limite | Indice / métal |
| --- | --- | --- | --- | --- |
| `inquisiteur` | L'Inquisiteur | Scanne un badge → camp (`witness` / `legion` / `neutral` ; Judas répond `legion`) | 1/acte | — |
| `medium` | Le Médium | Reçoit les messages des Esprits (1 mot par Esprit toutes les 10 min) | — | Relais |
| `sorciere` | La Sorcière d'Endor | Potion de vie : ressuscite un Esprit mort depuis < 5 min. Malédiction : tue un joueur (mort différée 90 s, comme un meurtre) | 1 chacune/partie | 2B |
| `exorciste` | L'Exorciste | Cercle de sel : protège un badge (pas le sien deux actes de suite) pour l'acte en cours | 1/acte | — |
| `archiviste` | L'Archiviste | Voit un symbole ✶ sur les fausses prophéties dans son flux d'indices | passif | — |
| `cryptographe` | Le Cryptographe | Possède les clés Atbash, chiffre maçonnique (pigpen), morse ; reçoit la traduction des messages codés « Planche » | passif | 8A |
| `legiste` | Le Légiste | Scanne un corps → heure de la mort + 1re lettre du prénom réel du tueur | 1/acte | 1B, 2A, 7B |
| `kabbaliste` | Le Kabbaliste | Table de gématrie + lexique hébreu dans son interface | passif | 8B |
| `astrologue` | L'Astrologue | Alerte 2 min avant chaque Éclipse (l'Éclipse est donc programmée avec 2 min de préavis côté serveur) | passif | 5B, métal Étain (Jupiter) |
| `cartomancienne` | La Cartomancienne | Tire 1 arcane par acte (contenu prédéfini) | 1/acte | 10B, métal Cuivre (Vénus) |
| `templier` | Le Templier | Non nobis : annule le résultat d'un vote (dans les 30 s après l'annonce) | 1/partie | 4A, métal Fer (Mars) |
| `frere` | Le Frère de la Loge | Vote double. Connaît l'identité du Templier | passif | — |
| `elie` | Le Prophète Élie | Duel du Carmel : désigne un suspect, l'écran annonce le duel ; si le suspect est `legion` → expulsé, sinon Élie meurt | 1/partie | 4B |
| `majordome` | Le Majordome | Ferme une zone 5 min (aucun meurtre possible sur un joueur qui a déclaré cette zone) | 1/acte | 1A, métal Plomb (Saturne) |
| `domestique` | Le Domestique | Consulte les 3 derniers scans d'une station de mission (nom + valide / non compté) | 1/acte | 6A, métal Mercure |
| `capitaine` | Le Capitaine | Évacuation : un joueur est mis hors jeu 10 min (ne peut ni tuer ni mourir ni scanner) | 1/partie | 5A, métal Argent (Lune) |
| `notaire` | Le Notaire | Enveloppe scellée ouverte en acte 3. S'il meurt avant, elle s'affiche automatiquement à l'écran | — | 7A, 9A, métal Or (Soleil) |
| `technicien` | Le Technicien | Stoppe une Éclipse en cours. Débloque l'image caméra (indice 6B) après 3 missions validées par lui | 1/acte (stop) | 6B |
| `garde` | Le Garde du corps | Choisit un protégé par acte ; si le protégé est visé, c'est le Garde qui meurt | 1/acte | — |
| `confesseur` | Le Confesseur | Boîte de confession : tout joueur peut lui écrire anonymement. 1 fois : révèle le rôle du dernier expéditeur | 1/partie | 9B |
| `veilleur` | Le Veilleur | Après chaque meurtre, reçoit la zone où il a eu lieu | passif | — |
| `martyr` | Le Martyr | À sa mort, choisit un joueur dont le camp s'affiche à l'écran | à la mort | — |

### 3.4 Zone du joueur

Pas de géolocalisation. Une zone est associée à un joueur quand il scanne un QR de zone (`Z-...`) ou de mission de cette zone. La victime d'un meurtre peut aussi corriger sa zone au moment de sa mort (sélecteur). Utilisé par le Veilleur et le Majordome.

---

## 4. Mécaniques

### 4.1 Meurtre

1. Agent scanne `B..` d'une victime vivante.
2. Vérifs : phase active, cooldown Conclave libre, victime vivante et non évacuée, tueur non évacué.
3. Protections, dans l'ordre : zone fermée par le Majordome → Cercle de sel (Exorciste) → Garde du corps (le Garde devient la victime). Si bloqué : cooldown consommé quand même, la Légion reçoit la raison (« cercle de sel », « zone fermée »).
4. `dies_at = now + 90 s`. Le tueur et la victime ne voient rien pendant ces 90 s.
5. À `dies_at` : le téléphone de la victime vibre (`navigator.vibrate`) et affiche plein écran « Tu es mort. Mets ton voile et agenouille-toi. » + sélecteur de zone. Statut `corpse`.
6. Le Veilleur reçoit la zone. Si la victime est le Notaire avant l'acte 3 → testament à l'écran. Si c'est le Martyr → il choisit un joueur à révéler.

### 4.2 Signalement et cloche

- Un joueur vivant scanne le badge d'un `corpse` → bouton « Signaler » → conseil immédiat.
- Bouton « Cloche d'urgence » : 1 fois par joueur et par partie.
- À l'ouverture d'un conseil, tous les `corpse` passent `spirit`.

### 4.3 Conseil

1. Écran « Glas » 10 s (son de cloche, nom du corps).
2. Débat 4 min (6 min pour l'Accusation), chrono à l'écran. Les châtiments en cours s'affichent.
3. Vote 60 s sur les téléphones des vivants : un joueur vivant ou « personne ». Frère = 2 voix ; joueur Marqué = votes contre lui ×2 ; Baal invisible = votes contre lui à 0.
4. Écran : barres qui montent en direct pendant le dépouillement (animation 8 s même si tout est déjà connu).
5. Résultat : si le plus voté a ≥ 40 % des voix exprimées → expulsion. Sinon → roue des châtiments sur le plus voté. Égalité en tête → personne.
6. Fenêtre de 30 s pour le Templier (Non nobis).
7. Expulsion : l'écran affiche « X n'était pas un agent de l'Ordre » ou « X servait le Premier Roi ». Judas expulsé avant l'acte 3 → écran de victoire de Judas (le jeu continue). L'expulsé passe `spirit`.

### 4.4 Châtiments (roue)

| id | Effet | Durée |
| --- | --- | --- |
| `baillon` | Ne parle plus, écrit sur ardoise | Jusqu'au prochain conseil |
| `aveugle` | Yeux bandés pendant le prochain débat | 1 conseil |
| `confession` | L'app tire une phrase de son interface (phrase de couverture pour la Légion) à lire à voix haute | Immédiat |
| `marque` | Nom en rouge à l'écran, votes contre lui ×2 | Jusqu'au prochain conseil |
| `exil` | Évacué 5 min | 5 min |

### 4.5 Esprits

- Interface noire, voile violet. Pas de vote aux conseils, mais vote au verdict final.
- 4 Missions de l'au-delà (`E1`–`E4`), chacune vaut 0,5 dans la jauge.
- Envoi d'un mot (1 seul mot, 24 car. max) au Médium toutes les 10 min.
- Peuvent être ressuscités par la Sorcière dans les 5 min.

### 4.6 Missions

- 24 missions (4 par zone) + 4 missions d'Esprits. Jauge = (missions témoins + 0,5 × missions esprits) / 24, plafonnée à 100 %.
- Valider : scanner le QR de la mission → énoncé court → saisir la réponse (comparaison normalisée : minuscules, sans accents ni espaces). 3 essais, puis verrou 2 min pour ce joueur sur cette mission.
- Une mission validée l'est pour tout le monde.
- Seuils : 33 % → indice bonus de l'acte 2 en avance ; 66 % → image caméra + arcane bonus ; 100 % → Révélation (nom goétique d'un agent vivant tiré au hasard + initiale de son prénom).
- Éclipse en cours → scans de mission refusés.

### 4.7 Missions éclair (écran)

| id | Contenu | Validation |
| --- | --- | --- |
| `veillee7` | 7 joueurs en cercle à la Chapelle 30 s, dans les 3 min | Le MJ valide ou invalide d'un clic. Échec → la Légion gagne une Éclipse gratuite |
| `salomon` | 2 joueurs tirés au hasard se défendent mutuellement 30 s chacun ; vote rapide 20 s | Le gagnant reçoit un indice privé choisi par le MJ |
| `balthazar` | Un mot s'écrit lettre par lettre à l'écran | Premier à le taper dans l'app → vote double au prochain conseil |
| `silence` | 2 min de silence total | Le MJ peut marquer manuellement un joueur qui a parlé |
| `etoiles` | Constellation à l'écran | Seul l'Astrologue reçoit la traduction (zone de la prochaine Éclipse) |
| `nombres` | « 144 · 66 » | Seul le Kabbaliste a la clé (Kedem en gématrie = 144 ; 66 légions) |
| `planche` | Message en chiffre maçonnique | Seul le Cryptographe reçoit la traduction |

### 4.8 Indices

Un indice = `code`, `title`, `body` (markdown), `image?`, `act` (1/2/3), `visibility` (`public` | liste de rôles), `variants` (contenu différent selon le rôle qui scanne un QR d'indice), `is_fake`.

Chaîne d'indices (chaque moitié est délivrée dans l'interface du détenteur à l'ouverture de l'acte, ou via un QR) :

| # | Moitié A | Moitié B | Acte |
| --- | --- | --- | --- |
| 1 | Majordome : 7 cierges neufs de 24 cm posés à 21h00 | Légiste : à minuit 6 cierges à 6 cm, celui près du corps à 17 cm | 1 |
| 2 | Légiste : pupilles normales, bouche engourdie, arythmie | Sorcière : herbier belladone vs aconit | 1 |
| 3 | Vidéo : fleur violette d'Ilan | QR `I-ACONIT` (Serre) : planche botanique de l'aconit | 1 |
| 4 | Templier : plan du manoir avec passage | Élie : « Le livre qui a vaincu Baal ouvre la porte » | 2 |
| 5 | Capitaine : la vedette a besoin de 1,20 m d'eau | Astrologue : basse mer 22h15, ponton à sec 21h30–23h30 (QR `I-MAREES` complet pour lui seul) | 2 |
| 6 | Domestique : caméras coupées 22h00–22h20 | Technicien : image de 22h08, silhouette à la fleur (`I-CAMERA`) | 2 |
| 7 | Notaire : Malkin doit 2 M€ à la Fondation | Légiste : certificat signé en 12 min | 2 |
| 8 | Cryptographe : `HVIZKSRMV` (Atbash de SERAPHINE) | Kabbaliste : Kedem = « Orient » ; Baal règne à l'Orient, 66 légions | 3 |
| 9 | Notaire : enveloppe, le Carnet devait partir à l'aube | Confesseur : Lucien voulait quitter l'Ordre | 3 |
| 10 | Inscription MENE TEKEL UPHARSIN | Cartomancienne : l'arcane de la Justice tient une balance | 3 |

Le texte définitif de chaque indice sera fourni dans `content/clues.ts` ; prévoir des placeholders.

### 4.9 Fragments du Carnet

- `F-MENE`, `F-TEKEL`, `F-UPHARSIN`. États : `inactive` → (T+2:15) `active` → `saved` (scan par non-Légion) ou `burned` (scan par Légion).
- Le scanneur est enregistré (pour La Plume).
- L'écran affiche 3 cases de fragments.

### 4.10 Verdict et victoire

Questionnaire à T+2:45 (vivants + Esprits, 2 min) :
1. Qui a tué Lucien ? (6 suspects) + Avec quoi ? (belladone, aconit, ciguë, mandragore)
2. Qui est le Premier Roi ? (6 suspects)
3. Fragments sauvés : calculé.

Réponse de la salle = réponse majoritaire. Solution : Ilan Morrow + aconit ; Séraphine Halloran.

| Camp | Victoire immédiate | Victoire au verdict |
| --- | --- | --- |
| Témoins | 5 agents (et convertis) expulsés ou morts | ≥ 2 questions justes sur 3 (Q1 juste = suspect ET poison) ET ≥ 2 fragments sauvés |
| Légion | Agents vivants ≥ Témoins vivants | ≥ 2 fragments brûlés, ou ≤ 1 question juste |
| Judas | Expulsé avant l'acte 3 | — |
| La Plume | — | A scanné lui-même ≥ 2 fragments |
| L'Alchimiste | — | Possède 7 métaux |

Titres de fin : meilleur enquêteur (bonnes réponses individuelles), meilleur menteur (agent ayant survécu le plus longtemps), Esprit le plus bavard (messages au Médium), candidats retenus par l'Ordre (choisis par le MJ).

---

## 5. Écran principal (`/screen`)

Plein écran, aucune interaction, bouton « Activer le son » au premier chargement. Ambiance : noir, or, rouge sang, typographie à empattement gothique pour les titres. Animations soignées (c'est le cœur de l'ambiance).

Bandeau permanent : les 3 questions, horloge de la nuit (22h00 → 06h00 répartie sur la durée du jeu), jauge des missions, vivants / Esprits, 3 cases de fragments, acte en cours.

Modes : `video`, `veille` (scène de crime), `glas`, `conseil` (débat + vote + verdict), `expulsion`, `roue`, `indice`, `fausse_prophetie` (rendu strictement identique à `indice`), `eclipse` (rouge, sceau de Baal qui pulse, compte à rebours), `scoop` (une de journal signée La Plume), `mission_eclair`, `message_code`, `testament`, `revelation`, `martyr`, `duel`, `judas_win`, `verdict`, `finale` (vidéo `/public/videos/finale.mp4` puis titres de fin).

Le MJ peut forcer n'importe quel mode et pousser un indice ou un texte libre.

---

## 6. Interface joueur (`/play`)

Mobile first, grande lisibilité dans le noir (fond sombre, contraste fort), aucun écran ne doit trahir le rôle à quelqu'un qui regarde par-dessus l'épaule : bouton « Cacher » (affiche un faux écran neutre) toujours accessible.

Onglets :
- **Rôle** : nom, illustration (placeholder), camp, objectif, pouvoirs avec compteurs et boutons.
- **Indices** : flux personnel (indices publics + privés + traductions), avec ✶ pour l'Archiviste.
- **Scanner** : caméra (lib `html5-qrcode` ou équivalent) ; scanner un badge propose les actions disponibles pour ce rôle (tuer, voyance, inquisition, protéger, céder un métal…).
- **Missions** : liste par zone, statut.
- **Messages** : Conclave (Légion), boîte du Médium, boîte de confession, réponses du MJ (Alchimiste).
- **Vote** : s'ouvre automatiquement pendant un conseil.

États plein écran : mort, châtiment en cours, évacué, proposition de Pacte, verdict final.

---

## 7. Panneau MJ (`/mj`)

- Lancer / mettre en pause / réinitialiser la partie. Le tick tourne ici.
- Lobby : joueurs connectés, attribution des rôles (auto ou glisser-déposer).
- Tableau de tous les joueurs : rôle, camp, statut, zone, protections, pouvoirs restants. Actions manuelles : tuer, ressusciter, marquer, évacuer, changer de rôle.
- Timeline des événements programmés, modifiable (décaler, déclencher maintenant, annuler).
- Réglages : cooldown du Conclave, délai de mort, durées de débat/vote.
- Pilotage de l'écran : forcer un mode, pousser un indice, « Murmure de l'au-delà » (indice gratuit).
- File d'attente : questions de l'Alchimiste, missions éclair à valider.
- Journal complet de toutes les actions (pour arbitrer et pour le récit de fin de soirée).

---

## 8. QR codes

Format : `${NEXT_PUBLIC_BASE_URL}/q/${CODE}`.

| Catégorie | Codes | Nombre |
| --- | --- | --- |
| Badges | `B01`–`B34` | 34 |
| Missions | `M-BIB-1..4`, `M-CHA-1..4`, `M-SER-1..4`, `M-PON-1..4`, `M-ARC-1..4`, `M-SAL-1..4` | 24 |
| Missions d'Esprits | `E1`–`E4` | 4 |
| Indices physiques | `I-ACONIT`, `I-MAREES`, `I-REGISTRE`, `I-PLAN`, `I-CAMERA`, `I-EXLIBRIS` | 6 |
| Zones | `Z-BIB`, `Z-CHA`, `Z-SER`, `Z-PON`, `Z-ARC`, `Z-SAL` | 6 |
| Fragments | `F-MENE`, `F-TEKEL`, `F-UPHARSIN` | 3 |

Script `npm run qr` (`scripts/generate-qr.ts`) : génère `qr/qr-print.pdf` en A4 avec traits de coupe, correction d'erreur H, noir sur blanc. Badges au format 85×55 mm (QR 40 mm + code en petit), missions et Esprits en A6, indices en A5, zones en A4, fragments 40×40 mm sans texte. Lit l'URL de base dans l'env.

Comportement de `/q/[code]` :
- Pas de cookie + `B..` → lie ce badge au téléphone (si libre) puis `/play`.
- Pas de cookie + autre code → page « Scanne d'abord ton badge ».
- Cookie + `B..` d'un autre → ouvre le menu d'actions sur ce joueur.
- Cookie + `B..` de soi → `/play`.
- `M-`, `E`, `I-`, `Z-`, `F-` → action correspondante dans `/play`.

---

## 9. Modèle de données (proposition)

`game` (singleton : phase, act, started_at, paused, settings jsonb, screen_state jsonb, conclave_cooldown_until, mission_progress, secrets des canaux) · `players` (badge_code, token, name, role, camp, status `alive|corpse|spirit|expelled`, zone, evacuated_until, flags jsonb, metals text[]) · `power_uses` · `kills` (killer, victim, scanned_at, dies_at, zone, blocked_reason, resolved) · `missions` · `mission_scans` · `clues` · `player_clues` · `councils` · `votes` · `chastisements` · `fragments` · `messages` (canal, from, to, body) · `scheduled_events` · `verdict_answers` · `event_log`.

---

## 10. Contenu

Tout le texte de jeu vit dans `content/` (TypeScript typé) : `roles.ts`, `clues.ts`, `missions.ts` (énoncé + réponse), `flash.ts`, `cover-lines.ts`, `tarot.ts`, `scoops.ts`. Commencer avec des placeholders clairement marqués `TODO_TEXTE` ; le texte final sera fourni séparément. Les missions et suspects sont décrits dans le dossier de conception.

Suspects (pour le verdict) : Séraphine Halloran, Ilan Morrow, Dr Ezra Malkin, Mère Agathe (la Sibylle), Sénateur Corvin Ashby, Noé Halloran.

---

## 11. Jalons

1. **v1 — squelette jouable** : schéma Supabase, badges + cookie, lobby, attribution des rôles, interface rôle, scanner, meurtre différé, signalement, conseil + vote + expulsion, jauge des missions, écran (veille, glas, conseil, expulsion), panneau MJ minimal + tick, script QR.
2. **v2 — tous les pouvoirs** : les 30 rôles, châtiments, Esprits et Médium, Éclipses, fausses prophéties, Pacte, indices par acte, missions éclair, fragments, verdict, finale.
3. **v3 — finitions** : animations de l'écran, sons, mode « Cacher », robustesse (reconnexion, double tick, téléphone qui s'éteint), page de test qui simule 30 joueurs avec des bots pour la répétition.

Critère de fin de chaque jalon : une partie simulée de bout en bout avec le script de bots, sans erreur.
