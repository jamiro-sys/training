# Plan Paris 27

Statische Trainings App (GitHub Pages, Branch `main`, Root). Kein Build Schritt.

- `index.html`, `assets/styles.css`, `assets/app.js`: App
- `data/plan.json`: Phasen, Einheiten, Übungen, Knie Stufen
- `data/garmin.json`: Garmin Werte (täglich aktualisiert)
- `data/coach.json`: Coach Notiz für die Startseite

## Schreibstil
Deutsch (Schweiz). Kein scharfes s (immer "ss"), keine Gedankenstriche (– oder —) und kein " - " als Satzzeichen.

## Tägliches Update
1. Garmin Daten kommen automatisch: Der Workflow `.github/workflows/garmin-sync.yml` holt sie zweimal täglich über intervals.icu (`scripts/garmin-sync.mjs`, Secrets `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`) und schreibt `data/garmin.json`. Für das Coaching zuerst `git pull`, dann diese Datei lesen. Ist sie leer (`updated: null`), nichts ändern.
2. Aufbau von `data/garmin.json`:
   ```json
   {
     "updated": "ISO Zeit",
     "source": "intervals.icu (Garmin)",
     "readiness": { "score": 0, "label": "Gut", "hrv": 0, "restingHr": 0, "sleepH": 0, "bodyBattery": 0 },
     "days": [ { "date": "YYYY-MM-DD", "hrv": 0, "restingHr": 0, "sleepH": 0, "runKm": 0, "bikeMin": 0 } ],
     "activities": [ { "date": "YYYY-MM-DD", "type": "running", "name": "Lauf", "durMin": 0, "km": 0, "avgHr": 0 } ]
   }
   ```
   `days`: letzte 42 Tage, aufsteigend. `activities`: letzte 14, neueste zuerst. Fehlende Werte als `null`.
3. `data/coach.json` mit einer kurzen Nachricht (2 bis 3 Sätze) zum heutigen Tag: Tagesform, was heute ansteht, eine konkrete Anpassung falls nötig.
4. Nur wenn die Daten es klar verlangen (z.B. HRV mehrere Tage deutlich unter Basis, Knieprobleme, verpasste Woche): `data/plan.json` anpassen, `version` erhöhen und `updated` setzen. Fussballtage (Vorbereitung Mo, Di, Do ab 18.1.2027) nie verschieben.
5. Commit auf `main` mit kurzer Nachricht ("Update Garmin YYYY-MM-DD") und pushen.

## Athlet
Hyrox Doubles Paris (8. bis 12. April 2027). Fussball Vorbereitung ab Mitte Januar 3× pro Woche (Mo, Di, Do), Saison ab April mit 2 Trainings plus Spiel. Knie links aussen (Verdacht Läuferknie), Laufen nur nach Knie Stufe. Ziele: Ausdauer für Fussball, Körperfett senken. Gym ca. 60 Min, mittleres Niveau, kein Sled im Gym. Rollentrainer vorhanden.
