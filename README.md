# 🚀 TaskTorpedo – Home Assistant Add-on Repository

Aufgabenplaner für Kinder als Home Assistant Add-on. Details siehe
[tasktorpedo/README.md](tasktorpedo/README.md).

## Repository-Struktur

```
├── repository.yaml          # macht diesen Ordner zum HA-Add-on-Repository
└── tasktorpedo/             # das Add-on
    ├── config.yaml          # Add-on-Manifest (Ingress, Architekturen, …)
    ├── Dockerfile           # Alpine-Base + Python 3, keine weiteren Abhängigkeiten
    ├── build.yaml           # Base-Images je Architektur
    ├── icon.png / logo.png  # Store-Grafiken
    ├── DOCS.md              # Anleitung (im Add-on-Store sichtbar)
    └── app/
        ├── server.py        # HTTP-Server + REST-API (nur Python-Stdlib)
        └── static/          # Frontend (Vanilla JS, kein Build-Schritt)
```

## Installation in Home Assistant

1. Dieses Repository auf GitHub veröffentlichen (öffentlich oder mit Zugriff
   für die HA-Instanz).
2. In Home Assistant: **Einstellungen → Add-ons → Add-on Store → ⋮ →
   Repositories** → GitHub-URL eintragen.
3. **TaskTorpedo** installieren, starten – fertig. Die App erscheint in der
   Seitenleiste.

Alternativ für lokale Tests: den Ordner `tasktorpedo/` nach
`/addons/tasktorpedo` auf der HA-Instanz kopieren (Samba/SSH-Add-on) und im
Store unter „Lokale Add-ons“ installieren.

## Lokal entwickeln (ohne Home Assistant)

```bash
DATA_DIR=/tmp/tt-data PORT=8099 python3 tasktorpedo/app/server.py
# → http://localhost:8099
```
