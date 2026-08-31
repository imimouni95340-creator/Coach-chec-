# Coach d'Échecs IA — Phase 1

Prototype jouable : un humain affronte Stockfish (vrai moteur, pas de simulation) à un niveau
de difficulté choisi parmi 11 paliers Elo (100 à 2100).

## Stack

- **Frontend** : React + TypeScript (Vite), `react-chessboard` pour le rendu de l'échiquier.
- **Backend** : Python + FastAPI.
- **Moteur** : Stockfish, piloté via `python-chess` (`chess.engine`).
- **Base de données** : SQLite (via SQLAlchemy), remplaçable par Postgres en changeant une seule
  variable d'environnement.

## Architecture

```
backend/app/
  engine/    → StockfishEngine (parle UNIQUEMENT à Stockfish) + DifficultyProfile (calibration Elo)
  game/      → règles, état de partie, PGN (ne connaît ni HTTP ni Stockfish directement)
  db/        → modèles SQLAlchemy + persistance des parties terminées
  api/       → routes FastAPI + schémas Pydantic (couche fine, aucune logique métier)
  core/      → configuration (chemin Stockfish, URL base de données, ...)
frontend/src/
  api/       → client HTTP typé
  components/→ SetupScreen, Board, GameScreen, MoveHistory, PlayerPanel, StatusBanner
  types/     → types miroir des schémas backend
```

## Prérequis

- Python 3.11+
- Node.js 20+
- Stockfish installé sur la machine (le backend le détecte automatiquement via `PATH`, ou via
  `/usr/games/stockfish`) :
  ```bash
  sudo apt-get install stockfish
  ```

## Lancer le backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

L'API est disponible sur `http://localhost:8000` (documentation interactive sur
`http://localhost:8000/docs`). Une base SQLite `chess_coach.db` est créée automatiquement au
premier démarrage.

## Lancer le frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # VITE_API_URL=http://localhost:8000
npm run dev
```

Ouvrez `http://localhost:5173`.

## Lancer les tests backend

```bash
cd backend
source .venv/bin/activate
pytest
```

23 tests couvrent : mapping des 11 niveaux Elo, échec/échec et mat/pat, nulles (matériel
insuffisant, 50 coups), roque, prise en passant, promotion, coups illégaux, abandon, et le
parcours complet de l'API (création de partie, coups, réponse du moteur, sauvegarde PGN).

## Ce qui a été construit

- Échiquier interactif (clic ou glisser-déposer), choix des Blancs/Noirs, 11 niveaux Elo (100 à
  2100), historique des coups, temps de réflexion de l'IA, horloges cumulées, abandon (avec
  confirmation), nouvelle partie.
- Détection correcte de : échec, échec et mat, pat, nulle (matériel insuffisant, 50 coups,
  répétition), roque, prise en passant, promotion (choix de la pièce).
- Chaque partie terminée est enregistrée en PGN (position initiale, coups, résultat, couleur du
  joueur, niveau Elo de l'IA, date, temps utilisé).

## Calibration Elo — avertissement important

Stockfish ne descend nativement (`UCI_Elo`) qu'à ~1320 Elo. Pour les paliers 100 à 1300, la force
est réduite via une combinaison de `Skill Level`, profondeur/temps de recherche limités, et une
probabilité de jouer un coup volontairement sous-optimal (`app/engine/difficulty.py`). **Ce n'est
pas un calibrage scientifique** : c'est une première approximation documentée, à affiner plus
tard par des parties moteur-contre-moteur mesurées.

## Limites connues / à corriger ensuite

- Les parties actives vivent en mémoire (un seul processus/worker) ; redémarrer le backend perd
  les parties en cours (les parties terminées, elles, sont bien en base).
- Pas d'authentification / multi-utilisateur : Phase 1 est mono-utilisateur local.
- Le calibrage Elo bas (100–1300) est une approximation à valider par des tests statistiques
  ultérieurs (Phase 2+).
- Pas d'horloge de partie avec incrément (les "horloges" affichent le temps cumulé utilisé, pas
  un compte à rebours façon blitz).
- Analyse post-partie, coach pédagogique, mémoire joueur, exercices, dashboard, import Chess.com
  : non implémentés (prévus phases 2 à 8), mais l'architecture (séparation engine/game/db/api) est
  pensée pour les accueillir sans réécriture.
