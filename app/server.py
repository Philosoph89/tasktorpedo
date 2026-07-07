#!/usr/bin/env python3
"""TaskTorpedo – Aufgabenplaner für Kinder als Home Assistant Add-on.

Nur Python-Standardbibliothek, Daten als JSON in /data (atomare Writes).
Alle URLs sind relativ, damit die App hinter dem Home-Assistant-Ingress-Proxy
mit dynamischem Pfad-Präfix funktioniert.
"""

import json
import os
import re
import threading
import urllib.request
import uuid
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8099"))
DATA_DIR = os.environ.get("DATA_DIR", "/data")
DATA_FILE = os.path.join(DATA_DIR, "tasktorpedo.json")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}

CATEGORIES = {"haushalt", "schule", "freizeit", "termine"}

_lock = threading.Lock()


def default_data():
    return {
        "kids": [],
        "tasks": [],
        "completions": {},
        "rewards": [],
        "redemptions": [],
        "settings": {"pin": None},
    }


def load_data():
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default_data()
    base = default_data()
    base.update(data)
    return base


def save_data(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, DATA_FILE)


def new_id():
    return uuid.uuid4().hex[:10]


def parse_date(value):
    """YYYY-MM-DD -> date, sonst None."""
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def task_on_date(task, day):
    """Ist die Aufgabe an diesem Datum fällig? (weekday: Montag = 0)"""
    rec = task.get("recurrence") or {}
    if rec.get("type") == "once":
        return rec.get("date") == day.isoformat()
    days = rec.get("days") or []
    return day.weekday() in days


def kid_day_tasks(data, kid_id, day):
    return [
        t for t in data["tasks"]
        if t.get("kidId") == kid_id and task_on_date(t, day)
    ]


def completions_for(data, day_iso):
    return data["completions"].get(day_iso, {})


def kid_points(data, kid_id):
    """Verdiente Punkte (gesamt + Woche) aus den Erledigungs-Einträgen (robust
    gegen gelöschte Aufgaben, weil Punkte im Eintrag gespeichert sind)."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    total = 0
    week = 0
    for day_iso, entries in data["completions"].items():
        d = parse_date(day_iso)
        for entry in entries.values():
            if entry.get("kidId") != kid_id:
                continue
            pts = int(entry.get("points", 0))
            total += pts
            if d and week_start <= d <= today:
                week += pts
    return total, week


def kid_spent(data, kid_id):
    """Für Belohnungen ausgegebene Sterne."""
    return sum(
        int(r.get("cost", 0))
        for r in data["redemptions"]
        if r.get("kidId") == kid_id
    )


def level_info(earned):
    """Level aus allen jemals verdienten Sternen. Frühe Level kommen schnell
    (50 ⭐), später wird es langsam teurer (max. 200 ⭐ pro Level). Ausgegebene
    Sterne kosten kein Level – Belohnungen einlösen tut nie weh."""
    level = 1
    into = earned
    need = 50
    while into >= need:
        into -= need
        level += 1
        need = min(200, 50 + (level - 1) * 20)
    return {"level": level, "into": into, "next": need}


def kid_streak(data, kid_id, until):
    """Anzahl aufeinanderfolgender Tage (bis `until`), an denen alle fälligen
    Aufgaben erledigt wurden. Tage ohne Aufgaben werden übersprungen."""
    streak = 0
    day = until
    for _ in range(365):
        tasks = kid_day_tasks(data, kid_id, day)
        if tasks:
            done = completions_for(data, day.isoformat())
            if all(t["id"] in done for t in tasks):
                streak += 1
            else:
                break
        day -= timedelta(days=1)
    return streak


def serialize_kid_stats(data, kid):
    earned, week = kid_points(data, kid["id"])
    lvl = level_info(earned)
    return {
        "id": kid["id"],
        "name": kid["name"],
        "emoji": kid.get("emoji", "🙂"),
        "color": kid.get("color", "#6366f1"),
        "stars": max(0, earned - kid_spent(data, kid["id"])),
        "pointsTotal": earned,
        "pointsWeek": week,
        "level": lvl["level"],
        "levelInto": lvl["into"],
        "levelNext": lvl["next"],
    }


def serialize_reward(r):
    return {
        "id": r["id"],
        "title": r["title"],
        "emoji": r.get("emoji", "🎁"),
        "cost": int(r.get("cost", 50)),
    }


def serialize_task(t, done_map):
    return {
        "id": t["id"],
        "title": t["title"],
        "category": t.get("category", "haushalt"),
        "time": t.get("time") or None,
        "points": int(t.get("points", 10)),
        "note": t.get("note") or None,
        "done": t["id"] in done_map,
    }


def build_day_view(data, day):
    day_iso = day.isoformat()
    done_map = completions_for(data, day_iso)
    kids = []
    for kid in data["kids"]:
        entry = serialize_kid_stats(data, kid)
        entry["tasks"] = [
            serialize_task(t, done_map)
            for t in kid_day_tasks(data, kid["id"], day)
        ]
        entry["streak"] = kid_streak(data, kid["id"], day)
        kids.append(entry)
    return {
        "date": day_iso,
        "kids": kids,
        "rewards": [serialize_reward(r) for r in data["rewards"]],
        "hasPin": bool(data["settings"].get("pin")),
    }


def build_week_view(data, start):
    """Wochenansicht: `start` ist der Montag; 7 Tage, Aufgaben pro Kind und Tag."""
    days = [start + timedelta(days=i) for i in range(7)]
    done_maps = [completions_for(data, d.isoformat()) for d in days]
    kids = []
    for kid in data["kids"]:
        entry = serialize_kid_stats(data, kid)
        entry["days"] = [
            [
                serialize_task(t, done_map)
                for t in kid_day_tasks(data, kid["id"], d)
            ]
            for d, done_map in zip(days, done_maps)
        ]
        entry["streak"] = kid_streak(data, kid["id"], date.today())
        kids.append(entry)
    return {
        "start": start.isoformat(),
        "days": [d.isoformat() for d in days],
        "kids": kids,
        "rewards": [serialize_reward(r) for r in data["rewards"]],
        "hasPin": bool(data["settings"].get("pin")),
    }


def fire_ha_event(event, payload):
    """Feuert ein Event auf dem Home-Assistant-Bus (via Supervisor-API).
    Läuft im Hintergrund-Thread und scheitert still – lokal ohne HA gibt es
    schlicht kein SUPERVISOR_TOKEN."""
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        return

    def _post():
        try:
            req = urllib.request.Request(
                f"http://supervisor/core/api/events/{event}",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5).close()
        except Exception:
            pass

    threading.Thread(target=_post, daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "TaskTorpedo"

    # ---------- Helfer ----------

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message, status=400):
        self.send_json({"error": message}, status)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}

    def route(self):
        """Pfad ohne Query, ohne führenden Slash."""
        path = self.path.split("?", 1)[0]
        return path.lstrip("/")

    def query(self):
        parts = self.path.split("?", 1)
        result = {}
        if len(parts) == 2:
            for pair in parts[1].split("&"):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    result[k] = v
        return result

    def check_pin(self, data):
        """True, wenn kein PIN gesetzt ist oder der Header stimmt."""
        pin = data["settings"].get("pin")
        return not pin or self.headers.get("X-Parent-Pin") == pin

    # ---------- Statische Dateien ----------

    def serve_static(self, name):
        if name in ("", "/"):
            name = "index.html"
        safe = os.path.basename(name)
        path = os.path.join(STATIC_DIR, safe)
        if not os.path.isfile(path):
            self.send_error_json("not found", 404)
            return
        ext = os.path.splitext(safe)[1]
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    # ---------- HTTP-Methoden ----------

    def do_GET(self):
        route = self.route()
        if route == "api/day":
            day = parse_date(self.query().get("date", "")) or date.today()
            with _lock:
                data = load_data()
                self.send_json(build_day_view(data, day))
        elif route == "api/week":
            anchor = parse_date(self.query().get("start", "")) or date.today()
            monday = anchor - timedelta(days=anchor.weekday())
            with _lock:
                data = load_data()
                self.send_json(build_week_view(data, monday))
        elif route == "api/admin":
            with _lock:
                data = load_data()
            if not self.check_pin(data):
                return self.send_error_json("pin", 403)
            self.send_json({
                "kids": data["kids"],
                "tasks": data["tasks"],
                "rewards": data["rewards"],
                "redemptions": sorted(
                    data["redemptions"],
                    key=lambda r: r.get("ts", ""),
                    reverse=True,
                ),
            })
        elif route == "api/health":
            self.send_json({"ok": True})
        elif route.startswith("api/"):
            self.send_error_json("not found", 404)
        else:
            self.serve_static(route)

    def do_POST(self):
        route = self.route()
        body = self.read_body()
        with _lock:
            data = load_data()

            if route == "api/toggle":
                self.handle_toggle(data, body)
            elif route == "api/pin/verify":
                ok = not data["settings"].get("pin") or body.get("pin") == data["settings"]["pin"]
                self.send_json({"ok": ok})
            elif route == "api/pin/set":
                if not self.check_pin(data):
                    return self.send_error_json("pin", 403)
                pin = body.get("pin")
                if pin is not None and not re.fullmatch(r"\d{4,8}", str(pin)):
                    return self.send_error_json("PIN muss 4–8 Ziffern haben")
                data["settings"]["pin"] = str(pin) if pin else None
                save_data(data)
                self.send_json({"ok": True})
            elif route == "api/kids":
                if not self.check_pin(data):
                    return self.send_error_json("pin", 403)
                kid = self.validate_kid(body)
                if kid is None:
                    return
                kid["id"] = new_id()
                data["kids"].append(kid)
                save_data(data)
                self.send_json(kid, 201)
            elif route == "api/tasks":
                if not self.check_pin(data):
                    return self.send_error_json("pin", 403)
                created = []
                kid_ids = body.get("kidIds") or ([body["kidId"]] if body.get("kidId") else [])
                valid_ids = {k["id"] for k in data["kids"]}
                for kid_id in kid_ids:
                    if kid_id not in valid_ids:
                        continue
                    task = self.validate_task(body)
                    if task is None:
                        return
                    task["id"] = new_id()
                    task["kidId"] = kid_id
                    data["tasks"].append(task)
                    created.append(task)
                if not created:
                    return self.send_error_json("Mindestens ein Kind auswählen")
                save_data(data)
                self.send_json({"created": created}, 201)
            elif route == "api/rewards":
                if not self.check_pin(data):
                    return self.send_error_json("pin", 403)
                reward = self.validate_reward(body)
                if reward is None:
                    return
                reward["id"] = new_id()
                data["rewards"].append(reward)
                save_data(data)
                self.send_json(reward, 201)
            elif route == "api/redeem":
                self.handle_redeem(data, body)
            else:
                self.send_error_json("not found", 404)

    def do_PUT(self):
        route = self.route()
        body = self.read_body()
        with _lock:
            data = load_data()
            if not self.check_pin(data):
                return self.send_error_json("pin", 403)

            m = re.fullmatch(r"api/kids/(\w+)", route)
            if m:
                for kid in data["kids"]:
                    if kid["id"] == m.group(1):
                        updated = self.validate_kid(body)
                        if updated is None:
                            return
                        kid.update(updated)
                        save_data(data)
                        return self.send_json(kid)
                return self.send_error_json("not found", 404)

            m = re.fullmatch(r"api/tasks/(\w+)", route)
            if m:
                for task in data["tasks"]:
                    if task["id"] == m.group(1):
                        updated = self.validate_task(body)
                        if updated is None:
                            return
                        if body.get("kidId"):
                            task["kidId"] = body["kidId"]
                        task.update(updated)
                        save_data(data)
                        return self.send_json(task)
                return self.send_error_json("not found", 404)

            m = re.fullmatch(r"api/rewards/(\w+)", route)
            if m:
                for reward in data["rewards"]:
                    if reward["id"] == m.group(1):
                        updated = self.validate_reward(body)
                        if updated is None:
                            return
                        reward.update(updated)
                        save_data(data)
                        return self.send_json(reward)
                return self.send_error_json("not found", 404)

            self.send_error_json("not found", 404)

    def do_DELETE(self):
        route = self.route()
        with _lock:
            data = load_data()
            if not self.check_pin(data):
                return self.send_error_json("pin", 403)

            m = re.fullmatch(r"api/kids/(\w+)", route)
            if m:
                kid_id = m.group(1)
                data["kids"] = [k for k in data["kids"] if k["id"] != kid_id]
                data["tasks"] = [t for t in data["tasks"] if t["kidId"] != kid_id]
                save_data(data)
                return self.send_json({"ok": True})

            m = re.fullmatch(r"api/tasks/(\w+)", route)
            if m:
                task_id = m.group(1)
                data["tasks"] = [t for t in data["tasks"] if t["id"] != task_id]
                save_data(data)
                return self.send_json({"ok": True})

            m = re.fullmatch(r"api/rewards/(\w+)", route)
            if m:
                reward_id = m.group(1)
                data["rewards"] = [r for r in data["rewards"] if r["id"] != reward_id]
                save_data(data)
                return self.send_json({"ok": True})

            m = re.fullmatch(r"api/redemptions/(\w+)", route)
            if m:
                red_id = m.group(1)
                data["redemptions"] = [r for r in data["redemptions"] if r["id"] != red_id]
                save_data(data)
                return self.send_json({"ok": True})

            self.send_error_json("not found", 404)

    # ---------- Fach-Logik ----------

    def handle_toggle(self, data, body):
        task_id = body.get("taskId")
        day_iso = body.get("date") or date.today().isoformat()
        if parse_date(day_iso) is None:
            return self.send_error_json("Ungültiges Datum")
        task = next((t for t in data["tasks"] if t["id"] == task_id), None)
        if task is None:
            return self.send_error_json("not found", 404)
        entries = data["completions"].setdefault(day_iso, {})
        if task_id in entries:
            del entries[task_id]
            done = False
        else:
            entries[task_id] = {
                "kidId": task["kidId"],
                "points": int(task.get("points", 10)),
                "ts": datetime.now().isoformat(timespec="seconds"),
            }
            done = True
        if not entries:
            del data["completions"][day_iso]
        save_data(data)

        if done:
            kid = next((k for k in data["kids"] if k["id"] == task["kidId"]), None)
            day = parse_date(day_iso)
            day_tasks = kid_day_tasks(data, task["kidId"], day)
            all_done = all(t["id"] in entries for t in day_tasks)
            if kid:
                fire_ha_event("tasktorpedo_task_done", {
                    "kid": kid["name"],
                    "task": task["title"],
                    "category": task.get("category"),
                    "points": int(task.get("points", 10)),
                    "date": day_iso,
                    "all_done": all_done,
                })
                if all_done:
                    fire_ha_event("tasktorpedo_all_done", {
                        "kid": kid["name"],
                        "date": day_iso,
                        "tasks": len(day_tasks),
                    })
        self.send_json({"ok": True, "done": done})

    def handle_redeem(self, data, body):
        kid = next((k for k in data["kids"] if k["id"] == body.get("kidId")), None)
        reward = next((r for r in data["rewards"] if r["id"] == body.get("rewardId")), None)
        if kid is None or reward is None:
            return self.send_error_json("not found", 404)
        earned, _ = kid_points(data, kid["id"])
        balance = earned - kid_spent(data, kid["id"])
        cost = int(reward.get("cost", 0))
        if balance < cost:
            return self.send_error_json("Noch nicht genug Sterne gesammelt")
        entry = {
            "id": new_id(),
            "kidId": kid["id"],
            "rewardId": reward["id"],
            "title": reward["title"],
            "emoji": reward.get("emoji", "🎁"),
            "cost": cost,
            "ts": datetime.now().isoformat(timespec="seconds"),
        }
        data["redemptions"].append(entry)
        save_data(data)
        fire_ha_event("tasktorpedo_reward_redeemed", {
            "kid": kid["name"],
            "reward": reward["title"],
            "cost": cost,
            "stars_left": balance - cost,
        })
        self.send_json({"ok": True, "balance": balance - cost})

    def validate_kid(self, body):
        name = str(body.get("name") or "").strip()
        if not name or len(name) > 40:
            self.send_error_json("Name fehlt oder ist zu lang")
            return None
        color = str(body.get("color") or "#6366f1")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            color = "#6366f1"
        return {
            "name": name,
            "emoji": str(body.get("emoji") or "🙂")[:8],
            "color": color,
        }

    def validate_reward(self, body):
        title = str(body.get("title") or "").strip()
        if not title or len(title) > 60:
            self.send_error_json("Name fehlt oder ist zu lang")
            return None
        try:
            cost = max(1, min(10000, int(body.get("cost", 50))))
        except (TypeError, ValueError):
            cost = 50
        return {
            "title": title,
            "emoji": str(body.get("emoji") or "🎁")[:8],
            "cost": cost,
        }

    def validate_task(self, body):
        title = str(body.get("title") or "").strip()
        if not title or len(title) > 120:
            self.send_error_json("Titel fehlt oder ist zu lang")
            return None
        category = body.get("category")
        if category not in CATEGORIES:
            self.send_error_json("Ungültige Kategorie")
            return None
        time_str = body.get("time") or None
        if time_str and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", time_str):
            self.send_error_json("Ungültige Uhrzeit")
            return None
        rec = body.get("recurrence") or {}
        if rec.get("type") == "once":
            if parse_date(rec.get("date")) is None:
                self.send_error_json("Einmalige Aufgabe braucht ein Datum")
                return None
            recurrence = {"type": "once", "date": rec["date"]}
        else:
            days = rec.get("days") or []
            days = sorted({d for d in days if isinstance(d, int) and 0 <= d <= 6})
            if not days:
                self.send_error_json("Mindestens einen Wochentag auswählen")
                return None
            recurrence = {"type": "weekly", "days": days}
        try:
            points = max(0, min(100, int(body.get("points", 10))))
        except (TypeError, ValueError):
            points = 10
        return {
            "title": title,
            "category": category,
            "time": time_str,
            "recurrence": recurrence,
            "points": points,
            "note": str(body.get("note") or "").strip()[:200] or None,
        }

    def log_message(self, fmt, *args):
        pass  # kein Request-Log-Spam im Add-on-Log


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"TaskTorpedo läuft auf Port {PORT}, Daten in {DATA_FILE}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
