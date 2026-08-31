# Coach d'Échecs IA — Phase 1

Application d'échecs jouable contre **Stockfish** (le vrai moteur, aucune simulation), à 11
niveaux Elo, qui **tourne entièrement sur l'appareil** : pas de serveur, pas d'ordinateur allumé,
pas de connexion Internet une fois installée.

## Comment ça marche

Stockfish est embarqué sous forme **WebAssembly** et s'exécute dans un Web Worker, dans le
navigateur du téléphone. Les règles sont assurées par `chess.js`, et les parties terminées sont
archivées en PGN dans le stockage de l'appareil. L'application est une **PWA** : installée sur
l'écran d'accueil, elle se lance et se joue hors ligne (mode avion inclus).

Poids de l'installation hors ligne : **~1,1 Mo** (dont 546 Ko pour le moteur).

## Installer sur votre téléphone

L'app doit être servie une première fois en HTTPS pour pouvoir s'installer. Le plus simple est
GitHub Pages, gratuit :

1. Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
2. Onglet **Actions → « Publier la PWA sur GitHub Pages » → Run workflow**.
   Ce workflow est **à déclenchement manuel** : rien n'est publié sans votre action, car publier
   rend l'application accessible publiquement.
3. Ouvrez l'URL fournie sur votre téléphone, puis :
   - **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».
   - **Android (Chrome)** : menu ⋮ → « Installer l'application ».
4. Lancez-la une fois avec du réseau (elle met le moteur en cache), puis elle fonctionne hors
   ligne indéfiniment.

## Développement en local

```bash
cd frontend
npm install
npm run dev      # copie le moteur WASM puis lance Vite sur http://localhost:5173
```

Autres commandes :

```bash
npm run build         # build de production (PWA + service worker)
npm test              # 30 tests unitaires (règles, calibration, archivage)
npm run test:offline  # test bout-en-bout : joue une partie réseau coupé
```

Le test hors ligne a besoin d'un build servi en statique et d'un Chromium :

```bash
npm run build && (cd dist && python3 -m http.server 8900) &
npx playwright install chromium    # ou CHROMIUM_PATH=/chemin/vers/chromium
npm run test:offline
```

## Architecture

```
frontend/src/
  engine/    → stockfishEngine.ts (seul module parlant UCI, via Web Worker WASM)
               difficulty.ts      (DifficultyProfile : les 11 paliers Elo)
  game/      → gameSession.ts     (règles, état, PGN — via chess.js)
               storage.ts         (archivage des parties sur l'appareil)
               localGameApi.ts    (orchestration ; l'UI ignore où tourne le moteur)
  components/→ SetupScreen, Board, GameScreen, MoveHistory, PlayerPanel, StatusBanner
  types/     → types partagés
frontend/e2e/ → test hors ligne bout-en-bout
backend/      → API FastAPI (voir « Statut du backend » plus bas)
```

La séparation moteur / règles / interface est la même qu'avant : `engine/` calcule des coups,
`game/` connaît les règles et l'état, les composants affichent. Rien d'autre que
`stockfishEngine.ts` ne parle au moteur.

## Fonctionnalités

- Choix des Blancs ou des Noirs, 11 niveaux Elo (100 à 2100).
- Échiquier interactif au doigt (touchez la pièce puis la case ; les coups légaux s'affichent) ou
  au glisser-déposer.
- Historique des coups, temps de réflexion du moteur, horloges, abandon avec confirmation,
  nouvelle partie.
- Détection : échec, échec et mat, pat, nulle (matériel insuffisant, 50 coups, répétition),
  roque, prise en passant, promotion avec choix de la pièce.
- Chaque partie terminée est enregistrée en PGN (position initiale, coups, résultat, couleur,
  niveau de l'IA, date, temps utilisé).

## Calibration Elo — avertissement important

**Ce n'est pas un calibrage scientifique.** Les niveaux sont une première approximation
documentée, conçue pour être ajustée après mesure.

Le build WebAssembly utilisé (`stockfish.js` 10.0.2) **n'expose pas** `UCI_LimitStrength` /
`UCI_Elo` — vérifié en lisant sa liste d'options UCI à l'exécution. La force est donc modulée par
trois leviers seulement, dans `frontend/src/engine/difficulty.ts` :

- `skillLevel` (0-20), le réglage natif de Stockfish ;
- `depth` / `movetimeMs`, qui bornent la recherche (et garantissent que l'interface ne bloque
  jamais sur un téléphone lent) ;
- une probabilité de jouer un coup volontairement sous-optimal, choisi parmi les meilleurs coups
  (MultiPV), car même à `skillLevel` 0 le moteur ne commet pas les erreurs d'un débutant.

L'étiquette Elo est une **cible**, pas une garantie. L'affiner demande de mesurer les résultats
réels et d'ajuster ce tableau — c'est pourquoi il tient en une seule table remplaçable.

## Statut du backend

Le dossier `backend/` (FastAPI + python-chess + Stockfish natif + SQLite) **n'est plus nécessaire
pour jouer** : la Phase 1 est désormais 100 % autonome sur l'appareil. Il est conservé car il
reste la base des phases suivantes qui gagnent à tourner côté serveur (analyse profonde d'une
partie, coach pédagogique s'appuyant sur un LLM, statistiques cumulées entre appareils). Ses 25
tests passent toujours (`cd backend && pytest`). Si vous préférez une base de code strictement
minimale, il peut être supprimé sans impact sur l'application.

## Limites connues

- La calibration Elo basse (100–1300) reste à valider par des mesures réelles.
- Les parties archivées vivent dans le stockage du navigateur : vider les données du site les
  efface, et elles ne se synchronisent pas entre appareils.
- Les « horloges » affichent le temps cumulé utilisé, pas un compte à rebours de blitz avec
  incrément.
- Le glisser-déposer tactile n'a pas été validé sur un appareil physique ; le jeu au toucher
  (case puis case) est le mode testé.
- Phases 2 à 8 (analyse, coach, mémoire, faiblesses, exercices, dashboard, import Chess.com) :
  non implémentées, mais l'architecture est prête à les accueillir.
