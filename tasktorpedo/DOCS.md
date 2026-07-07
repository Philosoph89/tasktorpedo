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

5. Unter **🎁 Belohnungen** festlegen, wofür die Sterne eingelöst werden
   können – z. B. „30 Min. Medienzeit“ für 50 ⭐ oder „Kinoabend“ für 200 ⭐.

## Bedienung für Kinder

- Aufgabe antippen = erledigt ✓ (nochmal antippen macht es rückgängig).
- Der Fortschrittsring oben zeigt, wie viel schon geschafft ist.
- Sind alle Aufgaben erledigt, gibt es Konfetti 🎉.
- ⭐ zeigt das Sterne-Guthaben (verdient minus ausgegeben),
  🏅 das Level, 🔥 die Streak-Tage in Folge.
- Ein Tipp auf das ⭐-Guthaben öffnet den **Sterne-Shop**: Dort sehen Kinder
  alle Belohnungen und lösen sie selbst ein, sobald genug Sterne da sind.
- Der Balken unter dem Namen zeigt den Fortschritt zum nächsten **Level**.
  Level steigen mit allen jemals verdienten Sternen – Belohnungen einlösen
  kostet also nie Level-Fortschritt.
- Mit ‹ › kann man in andere Tage schauen (z. B. „Was ist morgen?“).
- Der Umschalter **Tag / Woche** oben rechts wechselt zwischen der
  Tagesansicht (eine Spalte pro Kind) und der Wochenansicht (Wochenplan-Raster
  mit einer Zeile pro Kind). Auch dort kann direkt abgehakt werden; in der
  Wochenansicht blättern ‹ › wochenweise.

## Eltern-PIN

Unter **🔧 Optionen → PIN ändern** kann eine 4–8-stellige PIN gesetzt werden.
Danach ist der Eltern-Bereich geschützt – Kinder können weiterhin abhaken,
aber nichts verändern. Leere PIN speichern entfernt den Schutz.
Die PIN wird auch serverseitig geprüft.

## Kiosk-Betrieb (Echo Show, Wandtablets)

Geräte wie der Echo Show 15 wechseln nach kurzer Inaktivität automatisch
zurück zu ihrem eigenen Startbildschirm. Dagegen gibt es unter
**🔧 Optionen → Display wach halten** einen Schalter:

- Eine **stumme Audio-Schleife** hält die „Medienwiedergabe aktiv“-Erkennung
  am Leben – das ist der Mechanismus, der auf Fire-OS-Geräten (Echo Show)
  tatsächlich den Rücksprung zum Alexa-Homescreen verhindert.
- Zusätzlich wird, wo der Browser es erlaubt, die **Screen Wake Lock API**
  genutzt, um das Display-Timeout zu unterdrücken.

Die Einstellung gilt **nur für das Gerät, auf dem sie aktiviert wurde**
(z. B. einmalig auf dem Echo Show einschalten – Handys bleiben unberührt)
und bleibt auch nach einem Neuladen der Seite aktiv. Ein ☕-Symbol in der
Kopfzeile zeigt, dass der Modus läuft.

Hinweis: Ein Ton ist dabei nie zu hören – die Schleife ist stumm und wird
direkt im Browser erzeugt, es wird nichts heruntergeladen oder gestreamt.

## Belohnungen & Einlösungen (Eltern)

Unter **🎁 Belohnungen** im Eltern-Bereich:

- Belohnungen anlegen/bearbeiten (Name, Symbol, Kosten in Sternen).
- Unter **Zuletzt eingelöst** steht, wer wann was eingelöst hat.
  Mit ↩️ lässt sich eine Einlösung zurücknehmen – das Kind bekommt die
  Sterne zurück (z. B. bei versehentlichem Antippen).

## Automationen mit Home Assistant

TaskTorpedo feuert Events auf dem Home-Assistant-Event-Bus – ideal für
Durchsagen, Licht-Effekte oder Benachrichtigungen:

| Event | Wann | Daten |
|---|---|---|
| `tasktorpedo_task_done` | Aufgabe abgehakt | `kid`, `task`, `category`, `points`, `date`, `all_done` |
| `tasktorpedo_all_done` | Alle Aufgaben des Tages erledigt | `kid`, `date`, `tasks` |
| `tasktorpedo_reward_redeemed` | Belohnung eingelöst | `kid`, `reward`, `cost`, `stars_left` |

Beispiel-Automation (TTS-Durchsage, wenn ein Kind alles geschafft hat):

```yaml
automation:
  - alias: "TaskTorpedo: Tages-Jubel"
    trigger:
      - platform: event
        event_type: tasktorpedo_all_done
    action:
      - service: tts.speak
        target:
          entity_id: tts.home_assistant_cloud
        data:
          media_player_entity_id: media_player.wohnzimmer
          message: "{{ trigger.event.data.kid }} hat heute alles geschafft. Super!"
```

## Daten & Backup

Alle Daten liegen in `/data/tasktorpedo.json` und sind damit automatisch in
Home-Assistant-Backups enthalten. Das Add-on spricht ausschließlich die
lokale Home-Assistant-API an (nur zum Feuern der Events) und sendet nichts
ins Internet.

## Tipps

- Auf einem Wandtablet die Ansicht einfach geöffnet lassen – sie
  aktualisiert sich jede Minute von selbst (auch der Tageswechsel).
- Punkte-Empfehlung: kleine Aufgaben 5 ⭐, normale 10 ⭐, große 20 ⭐.
- Belohnungs-Empfehlung: kleine Belohnungen ab 50 ⭐ (Eis, Extra-Medienzeit),
  große ab 200–500 ⭐ (Kinoabend, Ausflug) – so lernen Kinder auch sparen.
