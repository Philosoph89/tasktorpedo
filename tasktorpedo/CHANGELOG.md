# Changelog

## 1.2.0 – 2026-07-06

- ☕ Neue Option „Display wach halten“ für Kiosk-Geräte (z. B. Echo Show,
  Wandtablets): stumme Audio-Schleife hält die Medienwiedergabe aktiv, damit
  Fire OS nicht zum Alexa-Homescreen zurückwechselt; zusätzlich wird – wo
  erlaubt – die Screen Wake Lock API genutzt
- Die Einstellung gilt pro Gerät und übersteht Neuladen; ein ☕-Symbol in der
  Kopfzeile zeigt den aktiven Zustand

## 1.1.0 – 2026-07-06

- 📆 Neue Wochenansicht: Raster mit Wochentagen als Spalten und einer Zeile
  pro Kind, Aufgaben direkt abhakbar, Heute-Spalte hervorgehoben
- 🔀 Umschalter Tag/Woche in der Kopfzeile (Auswahl wird gemerkt)
- ‹ › blättert in der Wochenansicht wochenweise, Klick auf die Datumsanzeige
  springt zurück zu heute / zur aktuellen Woche

## 1.0.0 – 2026-07-06

Erste Version 🚀

- Spalten-Board pro Kind mit zeitlich sortierten Aufgaben
- Kategorien: Haushalt, Schule, Freizeit, Termine
- Wiederholungen (täglich, Mo–Fr, Wochenende, einzelne Tage, einmalig)
- Sterne-Punktesystem, Wochenpunkte, Streaks, Konfetti
- Eltern-Bereich mit optionaler PIN (serverseitig geprüft)
- Dark Mode, responsive Layout, Auto-Refresh für Wandtablets
- Ingress-Integration, Daten in /data (backup-fähig)
