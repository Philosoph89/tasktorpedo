# 🚀 TaskTorpedo

**Aufgabenplaner für Kinder (ca. 8–12 Jahre) als Home Assistant Add-on.**

Jedes Kind bekommt eine eigene Spalte mit seinen Aufgaben des Tages – zeitlich
sortiert, mit großen Häkchen zum Abhaken. Kategorien für Haushalt 🧹,
Schule 📚, Freizeit ⚽ und Termine 📅, dazu Sterne als Belohnung,
Streak-Zähler und Konfetti, wenn alles geschafft ist.

## Features

- 👧👦 Beliebig viele Kinder mit Avatar-Emoji und Farbe
- ✅ Große, touch-freundliche Aufgabenkarten – ideal fürs Wandtablet
- 🕐 Zeitliche Sortierung, Aufgaben ohne Uhrzeit unter „Irgendwann heute“
- 📆 Tages- und Wochenansicht mit einem Klick umschaltbar
- 🔁 Wiederholungen: täglich, Mo–Fr, Wochenende, einzelne Tage oder einmalig
- ⭐ Sterne-Punktesystem mit Wochen- und Gesamtzähler
- 🎁 Sterne-Shop: Eltern legen Belohnungen an, Kinder lösen ihr Guthaben
  selbst ein (mit Einlöse-Historie und Rückgängig-Funktion)
- 🏅 Level-System mit XP-Balken – Belohnungen einlösen kostet nie Level
- 🔥 Streak-Anzeige für aufeinanderfolgende „Alles erledigt“-Tage
- 🎉 Konfetti-Feier, wenn ein Kind alle Aufgaben geschafft hat
- 🏠 Events auf dem Home-Assistant-Bus für eigene Automationen
  (Aufgabe erledigt, alles geschafft, Belohnung eingelöst)
- 🔒 Eltern-Bereich mit optionaler PIN
- ☕ Kiosk-Modus „Display wach halten“ für Echo Show & Wandtablets
- 🌙 Automatischer Dark Mode
- 📱 Responsive: Desktop, Tablet und Smartphone

## Installation

1. In Home Assistant: **Einstellungen → Add-ons → Add-on Store**
2. Menü (⋮) → **Repositories** → URL dieses Repositories hinzufügen
3. **TaskTorpedo** installieren und starten
4. Über die Seitenleiste (🚀 TaskTorpedo) öffnen

## Technik

- Backend: Python 3, nur Standardbibliothek – kein pip, kein npm
- Frontend: Vanilla JS Single-Page-App, ausgeliefert über Home Assistant Ingress
- Daten: JSON in `/data` (persistiert über Updates und Neustarts, atomare Writes)
