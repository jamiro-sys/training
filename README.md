# Plan Paris 27

Persönlicher Trainingsplan als Web App: Fussball, Gym, Rolle, Knie Reha und HYROX Paris 2027.

**App:** https://jamiro-sys.github.io/training/

- Plan, Phasen und Übungen kommen aus `data/plan.json`.
- Garmin Werte, Archiv, Coach Notiz und Logbuch liegen im privaten Repository `training-data`. Der Workflow «Garmin Sync» holt sie zweimal täglich über intervals.icu (Secrets `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`, `DATA_REPO_TOKEN`).
- Das Logbuch bleibt im Browser des Geräts. Export und Import gibt es unter Fortschritt.

Auf dem iPhone: Seite in Safari öffnen, Teilen, «Zum Home Bildschirm». Dann läuft sie wie eine App.
