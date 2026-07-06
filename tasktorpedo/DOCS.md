# TaskTorpedo – Dokumentation

## Erste Schritte

1. Add-on starten und über die Seitenleiste öffnen.
2. Auf **Loslegen** (oder das ⚙️ oben rechts) klicken → Eltern-Bereich.
3. Unter **👧 Kinder** die Kinder mit Name, Avatar und Farbe anlegen.
4. Unter **📝 Aufgaben** Aufgaben erstellen:
   - **Für wen?** – beim Anlegen können mehrere Kinder gleichzeitig gewählt
     werden (die Aufgabe wird für jedes Kind einzeln angelegt).
   - **Kategorie** – Haushalt, Schule, Freizeit oder Termine.
   - **Uhrzeit** – optional; Aufgaben ohne Uhrzeit erscheinen unter
     „Irgendwann heute“.
   - **Sterne** – Belohnungspunkte fürs Abhaken.
   - **Wiederholung** – täglich, Mo–Fr, Wochenende, frei wählbare Tage
     oder einmalig an einem Datum (z. B. Zahnarzttermin).

## Bedienung für Kinder

- Aufgabe antippen = erledigt ✓ (nochmal antippen macht es rückgängig).
- Der Fortschrittsring oben zeigt, wie viel schon geschafft ist.
- Sind alle Aufgaben erledigt, gibt es Konfetti 🎉.
- ⭐ zählt alle jemals verdienten Sterne, 🔥 die Streak-Tage in Folge.
- Mit ‹ › kann man in andere Tage schauen (z. B. „Was ist morgen?“).

## Eltern-PIN

Unter **🔧 Optionen → PIN ändern** kann eine 4–8-stellige PIN gesetzt werden.
Danach ist der Eltern-Bereich geschützt – Kinder können weiterhin abhaken,
aber nichts verändern. Leere PIN speichern entfernt den Schutz.
Die PIN wird auch serverseitig geprüft.

## Daten & Backup

Alle Daten liegen in `/data/tasktorpedo.json` und sind damit automatisch in
Home-Assistant-Backups enthalten. Das Add-on braucht keinerlei Zugriff auf
die Home-Assistant-API und sendet nichts ins Internet.

## Tipps

- Auf einem Wandtablet die Ansicht einfach geöffnet lassen – sie
  aktualisiert sich jede Minute von selbst (auch der Tageswechsel).
- Punkte-Empfehlung: kleine Aufgaben 5 ⭐, normale 10 ⭐, große 20 ⭐.
  Was die Sterne wert sind (Taschengeld, Medienzeit, Ausflug), entscheidet ihr.
