# Checklist — test sur vrais téléphones (3-4 personnes)

But : valider le v1 en conditions réelles avant la soirée. Durée : 30-45 min.

## Matériel

- [ ] Laptop du **MJ** sur `https://les66legions.vercel.app/mj` (onglet **toujours ouvert** : c'est lui qui fait tourner l'horloge).
- [ ] **TV** branchée au laptop (HDMI, 2e fenêtre) ou navigateur de la TV sur `/screen`, en plein écran (F11).
- [ ] **4 téléphones** joueurs (un iPhone et un Android si possible), données mobiles ou Wi-Fi de la salle. Le MJ joue aussi D sur son propre téléphone : il faut 3 votants vivants après le meurtre pour pouvoir expulser quelqu'un.
- [ ] Imprimés : badges **B01 à B05** (B05 sert au test « badge déjà pris »), la zone **Z-CHA** et la mission **M-CHA-1** (extraits de `qr-print.pdf`).

Rôles des testeurs :

| Qui | Appareil | Badge | Rôle à distribuer |
| --- | --- | --- | --- |
| MJ | laptop + TV | — | — |
| Joueur A | téléphone | B01 | Baal (Légion, le tueur) |
| Joueur B | téléphone | B02 | Le Légiste (victime) |
| Joueur C | téléphone | B03 | Le Notaire (celui qui signale) |
| MJ = joueur D | son téléphone | B04 | Le Médium |

## 0. Préparation (MJ)

- [ ] `/mj` → mot de passe → le panneau s'affiche, la pastille **tick OK** est verte.
- [ ] **Reset total** (confirmer).
- [ ] TV : `/screen` affiche « Les 66 Légions » et le bandeau (3 questions, 22h00, jauge 0 %, 0 vivant). Cliquer **Activer le son**.

## 1. Scan de badge

- [ ] A, B, C et D scannent leur badge **avec l'appareil photo natif** du téléphone (pas d'application) → le lien s'ouvre → page « Ton prénom ».
- [ ] Chacun saisit son prénom → « Bienvenue, … ».
- [ ] Panneau MJ : les 4 joueurs apparaissent avec leur prénom.
- [ ] **Badge déjà pris** : en navigation privée, scanner le badge B01 → message « Ce badge est déjà lié à un autre téléphone ».
- [ ] **Scanner le badge d'un autre** : A scanne B05 (libre) → « Badge libre ou inconnu ».
- [ ] **Scanner un QR sans badge** : en navigation privée, scanner Z-CHA → « Scanne d'abord ton badge ».

## 2. Rôles et lancement

L'attribution automatique demande 22 joueurs minimum. Pour le test, on distribue les rôles à la main.

- [ ] MJ → **Sélection manuelle…** → tout décocher sauf **Baal, Le Légiste, Le Notaire, Le Médium** → **Distribuer ces 4 rôles**.
- [ ] Dans le tableau, corriger avec les menus déroulants pour obtenir A = Baal, B = Légiste, C = Notaire, D = Médium.
- [ ] Sur chaque téléphone, l'onglet **Rôle** montre le bon rôle. A voit le bloc « Le Conclave » ; B, C et D ne le voient pas.
- [ ] **Confidentialité** : B regarde l'écran de C → aucun autre rôle que celui de C n'est visible nulle part.
- [ ] MJ → **Lancer** → T+0:00, phase `intro`.
- [ ] Timeline : sur **Acte 1**, cliquer **maintenant** ; puis sur **Meurtres possibles**, cliquer **maintenant** (pour ne pas attendre 15 min).
- [ ] TV : « ACTE I » s'affiche dans le bandeau.

## 3. Zone et mission

- [ ] B scanne **Z-CHA** → « Zone enregistrée ». Panneau MJ : zone de B = CHA.
- [ ] C scanne **M-CHA-1** → l'énoncé et un champ de réponse s'affichent. Répondre `faux` 3 fois → « verrouillée 2 min ».
- [ ] A (Légion) scanne M-CHA-1 et répond `TODO_TEXTE` → « ne compte pas pour toi » ; la jauge reste à 0 %.
- [ ] B scanne M-CHA-1 et répond `TODO_TEXTE` → « Mission validée » ; la jauge de la TV passe à 4 %.

## 4. Meurtre différé

- [ ] A ouvre l'onglet **Scanner** et scanne le badge de B → bouton rouge **Tuer** → confirmer → message discret.
- [ ] **Pendant 90 s**, rien ne change chez B (le téléphone ne réagit pas). La TV affiche toujours 4 vivants.
- [ ] A rescanne C → « Tuer » grisé, avec « Le Conclave doit attendre 11 min… ».
- [ ] Après 90 s, le téléphone de B **vibre** (Android ; l'iPhone ne vibre pas depuis un navigateur) et passe en plein écran : « Tu es mort. Mets ton voile et agenouille-toi. »
- [ ] B choisit sa zone (La Chapelle) → l'écran reste noir.
- [ ] Panneau MJ, section Meurtres : ligne « A → B · … · CHA ✓ ».

## 5. Signalement

- [ ] C scanne le badge de B → bouton **Signaler le corps** → appuyer.
- [ ] TV : **Le Glas**, « Corps signalé par C », « ✝ B ».
- [ ] Après 10 s : chrono du débat (4:00) à la TV ; bandeau rouge « Conseil — Débat » sur les téléphones.
- [ ] B (désormais Esprit) voit l'interface Esprit, sans onglet Vote.
- [ ] Pour ne pas attendre 4 min, MJ → **Étape suivante**.

## 6. Vote

- [ ] Les téléphones de A, C et D basculent seuls sur l'onglet **Vote**. La TV affiche « VOTEZ », le chrono de 60 s et « 0 / 3 voix exprimées ». B (Esprit) ne vote pas.
- [ ] Chacun ne se voit pas dans la liste (pas d'auto-vote).
- [ ] C vote **A**, D vote **C**, A vote **Personne** → la TV affiche « 3 / 3 ».
- [ ] D change d'avis et vote **A** → le changement est accepté (résultat attendu : A 2 voix, Personne 1 → 67 % ≥ 40 %).
- [ ] À la fin du vote, la TV affiche les **barres qui montent pendant 8 s**, puis « A — 67 % ».

## 7. Expulsion

- [ ] 30 s après le résultat, la TV affiche **EXPULSION** et « A servait le Premier Roi ».
- [ ] Le téléphone de A passe en interface Esprit.
- [ ] Panneau MJ : alerte **« Tous les agents de la Légion sont éliminés »**, avec les boutons **Continuer** et **Passer au verdict**. La TV n'annonce rien.
- [ ] Cliquer **Continuer** → l'alerte passe en grisé.
- [ ] *(Variante, si le temps le permet : Reset (garder joueurs), redistribuer les rôles, refaire un conseil où les votes sont 1 / 1 / Personne → « Personne n'est expulsé » à cause de l'égalité.)*

## 8. Écran sur la TV

- [ ] Texte lisible à 5 m, sans débordement en 1920×1080.
- [ ] Le chrono avance sans saccade et l'horloge de la nuit progresse.
- [ ] MJ → **Pause** → « PAUSE » apparaît à la TV et les chronos se figent ; **Reprendre** → ils repartent.
- [ ] MJ → texte libre « Test » + **Forcer veille** → le texte s'affiche à la TV ; **Retour auto**.

## 9. Robustesse

- [ ] Verrouiller un téléphone 1 min puis le rouvrir → l'état est à jour en quelques secondes.
- [ ] Couper le Wi-Fi d'un téléphone (passage en 4G) → l'app continue de fonctionner.
- [ ] Recharger `/mj` → la partie continue et le tick repasse au vert.

## À noter pendant le test

| # | Étape | Téléphone (modèle, navigateur) | Problème constaté |
| --- | --- | --- | --- |
| | | | |
