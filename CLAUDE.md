# Plan Paris 27

Statische Trainings App (GitHub Pages, Branch `main`, Root). Kein Build Schritt.

- `index.html`, `assets/styles.css`, `assets/app.js`: App
- `data/plan.json`: Phasen, Einheiten, Übungen, Knie Stufen
- Persönliche Daten liegen NICHT hier, sondern im privaten Repository `jamiro-sys/training-data`:
  `garmin.json` (letzte 42 Tage), `garmin-history.json` (Archiv aller Tage und Aktivitäten, wird nie gekürzt), `coach.json` (Coach Notiz), `logbuch.json` (Einträge der App), `profil.json` (Pulszonen nach dem klassischen 5 Zonen Modell in Prozent der HFmax, vom Garmin Sync bei jedem Lauf automatisch neu berechnet; dazu Tempi, Ruhepuls, HRV Basis, Schlafziel; die App setzt die Werte in "Zone N" und Tempo Begriffe der Einheiten ein). Die App liest sie mit dem Schlüssel aus den Einstellungen. Nie persönliche Daten ins öffentliche Repository schreiben.

## Schreibstil
Deutsch (Schweiz). Kein scharfes s (immer "ss"), keine Gedankenstriche (– oder —) und kein " - " als Satzzeichen.

## Tägliches Update
1. Garmin Daten kommen automatisch: Der Workflow `.github/workflows/garmin-sync.yml` holt sie um 00:00, 06:15 (fürs Morgenbriefing um 06:40) und 12:00 Uhr Schweizer Zeit über intervals.icu (`scripts/garmin-sync.mjs`, Secrets `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`) (Secret `DATA_REPO_TOKEN` für das private Repository) und schreibt `garmin.json` und `garmin-history.json` ins private Repository `jamiro-sys/training-data`. Für das Coaching dieses Repository klonen und die Dateien dort lesen. Ist sie leer (`updated: null`), nichts ändern.
2. Aufbau von `garmin.json`:
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
3. `coach.json` im privaten Repository mit einer kurzen Nachricht (2 bis 3 Sätze) zum heutigen Tag: Tagesform, was heute ansteht, eine konkrete Anpassung falls nötig.
4. Nur wenn die Daten es klar verlangen (z.B. HRV mehrere Tage deutlich unter Basis, Knieprobleme, verpasste Woche): `data/plan.json` anpassen, `version` erhöhen und `updated` setzen. Fussballtage (Vorbereitung Mo, Di, Do ab 18.1.2027) nie verschieben.
5. coach.json im privaten Repository committen und pushen ("Coach YYYY-MM-DD"). Änderungen an plan.json im öffentlichen Repository.

## Athlet
Hyrox Doubles Paris (8. bis 12. April 2027). Fussball Vorbereitung ab Mitte Januar 3× pro Woche (Mo, Di, Do), Saison ab April mit 2 Trainings plus Spiel. Knie links aussen (Verdacht Läuferknie), Laufen nur nach Knie Stufe. Ziele: Ausdauer für Fussball, Körperfett senken. Gym ca. 60 Min, mittleres Niveau. Gym: gym80 Maschinen (Bein: Squat, Beinpresse, Hip Thrust, Beinbeuger, Beinstrecker, Wadenpresse; Oberkörper: Bankdrücken liegend, Rudern sitzend, Seitheben, Butterfly schräg, Reverse Butterfly, Curl Pult SZ), Kabelturm mit Latzug und Rudern, Kabelzug mit 2 verstellbaren Armen, 3 Kabelzüge, 2 Squat Racks, 2 Bänke, Kurzhanteln, Kettlebells, SkiErg, Rudergerät, Velo, Laufband, Sandsäcke, Medizinbälle, Klimmzugstange. Kein Sled. Rollentrainer zuhause.
