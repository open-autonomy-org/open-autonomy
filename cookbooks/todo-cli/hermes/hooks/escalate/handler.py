"""Deliver owner requests to the destination explicitly selected by PM.

Only needs_input/capability blocks reach the owner. State records deliveries, never
board state; retries read the board again. The plugin supplies board lifecycle events.
The setup-written PM skill owns outreach policy. Credentials never select a channel.
"""
import fcntl
import json
import time
import logging
import os
import subprocess
from pathlib import Path
from urllib.request import Request, urlopen

log = logging.getLogger("hooks.escalate")


def community(project, *args):
    result = subprocess.run(["bun", str(project / ".open-autonomy/community.ts"), *args],
                            cwd=project, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return json.loads(result.stdout)


def reconcile(*, board=None, remind=False, route=None, **kwargs):
    from hermes_cli import kanban_db as kb
    from hermes_cli.config import get_hermes_home, load_config_readonly
    home = Path(get_hermes_home())
    config = load_config_readonly() or {}
    project = Path.cwd()
    if not (project / ".open-autonomy/community.ts").is_file():
        project = Path(os.environ.get("TERMINAL_CWD") or project)
    state_path = home / "escalations.json"
    with (home / "escalations.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        state = json.loads(state_path.read_text()) if state_path.exists() else {}
        conn = kb.connect(board=board)
        try:
            tasks = {t.id: t for t in kb.list_tasks(conn, include_archived=True)}
            prefix = f"{board or kb.get_current_board()}:"
            reminders = {}
            failures = []
            for task_id in sorted(set(tasks) | {k[len(prefix):] for k in state if k.startswith(prefix)}):
                task = tasks.get(task_id)
                key = prefix + task_id
                entry = state.get(key, {})
                blocked = task and task.status == "blocked" and task.block_kind in ("needs_input", "capability")
                try:
                    if not blocked:
                        if entry.get("chat"):
                            kb.remove_notify_sub(conn, task_id=task_id, platform="discord", chat_id=entry["chat"])
                        if entry.get("issue"):
                            community(project, "issue", "close", str(entry["issue"]))
                        state.pop(key, None)
                        continue
                    # Events may retry a PM-selected destination, but cannot choose one.
                    if entry and not entry.get("route"):
                        raise RuntimeError("legacy delivery receipt has no explicit PM route; reconcile its existing conversation before redispatch")
                    if route and entry.get("route") and entry["route"] != route:
                        raise RuntimeError("PM destination or follow-up changed; reconcile the existing conversation before redispatch")
                    selected = entry.get("route") or route
                    if not selected:
                        if remind:
                            raise RuntimeError("no PM-selected destination; follow the setup-written outreach policy in the PM skill")
                        continue
                    entry["route"] = selected
                    events = kb.list_events(conn, task_id)
                    event = next((e for e in reversed(events) if e.kind == "blocked"), None)
                    reason = (event.payload or {}).get("reason", "") if event else ""
                    if (task.body or "").startswith(("<!-- open-autonomy:ship -->", "<!-- open-autonomy:ship:", "<!-- open-autonomy:kit-review:")):
                        marker = "<!-- open-autonomy:owner-request -->"
                        comments = sorted(kb.list_comments(conn, task_id), key=lambda c: c.id)
                        latest = next((c for c in reversed(comments) if c.author == "pm" and c.body.startswith(marker)), None)
                        if latest:
                            reason = latest.body[len(marker):].strip()
                    ask = f"{task.title}\n\n{reason}\n\nAfter resolving this request: `hermes kanban unblock {task_id}`."
                    interval = selected["reminder_hours"] * 3600
                    due = remind and (entry.get("reminded_ask") != ask or time.time() - entry.get("reminded_at", 0) >= interval)
                    if selected["via"] == "discord":
                        if not os.environ.get("DISCORD_BOT_TOKEN"):
                            raise RuntimeError("PM selected Discord but its bot credential is unavailable; no alternate channel is authorized")
                        if not entry.get("chat"):
                            base = os.environ.get("DISCORD_API_BASE", "https://discord.com/api/v10").rstrip("/")
                            req = Request(base + "/users/@me/channels", data=json.dumps({"recipient_id": selected["recipient"]}).encode(),
                                          headers={"Authorization": "Bot " + os.environ["DISCORD_BOT_TOKEN"], "Content-Type": "application/json"})
                            with urlopen(req, timeout=15) as response:
                                entry["chat"] = str(json.load(response)["id"])
                        chat = entry["chat"]
                        prior = next((s for s in kb.list_notify_subs(conn, task_id) if s["platform"] == "discord" and s["chat_id"] == chat), None)
                        kb.add_notify_sub(conn, task_id=task_id, platform="discord", chat_id=chat,
                                          user_id=selected["recipient"], chat_type="dm", notifier_profile="default", delivery_mode="notify+wake")
                        if not prior and event:
                            # Subscribe normally, then include just the block that triggered this subscription.
                            sub = next(s for s in kb.list_notify_subs(conn, task_id) if s["platform"] == "discord" and s["chat_id"] == chat)
                            kb.rewind_notify_cursor(conn, task_id=task_id, platform="discord", chat_id=chat,
                                                    claimed_cursor=sub["last_event_id"], old_cursor=event.id - 1)
                        if due:
                            reminders.setdefault(chat, []).append(ask)
                    elif selected["via"] == "github":
                        if not os.environ.get("GITHUB_TOKEN"):
                            raise RuntimeError("PM selected GitHub but its credential is unavailable; no alternate channel is authorized")
                        if not entry.get("issue"):
                            issue = community(project, "issue", "open", task_id, task.title, ask, selected["recipient"])
                            entry["issue"] = issue["number"]
                        if entry.get("ask") != ask:
                            community(project, "issue", "update", str(entry["issue"]), task_id, ask)
                            entry["ask"] = ask
                        if due:
                            community(project, "issue", "remind", str(entry["issue"]), ask)
                    else:
                        raise RuntimeError("unsupported PM-selected destination")
                    if due:
                        entry["reminded_at"] = time.time()
                        entry["reminded_ask"] = ask
                    state[key] = entry
                except Exception:
                    failures.append(task_id)
                    log.exception("cannot deliver owner escalation for %s", task_id)
                    if entry:
                        state[key] = entry
            if reminders:
                from cron.jobs import create_job
                model = config.get("model") or {}
                if isinstance(model, str):
                    model = {"default": model}
                for chat, asks in reminders.items():
                    create_job(prompt="Tell the owner, in one message, the exact actions needed below. Do not unblock tasks or perform the actions.\n\n" + "\n\n".join(asks),
                               schedule="in 1m", repeat=1, name="owner-reminder", deliver=f"discord:{chat}",
                               model=model.get("default"), provider=model.get("provider"), workdir=str(project))
            temp = state_path.with_suffix(".tmp")
            temp.write_text(json.dumps(state, indent=2) + "\n")
            temp.replace(state_path)
            if remind and failures:
                raise RuntimeError(f"owner outreach unresolved for {', '.join(failures)}; requests remain blocked")
        finally:
            conn.close()


async def handle(event_type, context):
    reconcile(**context)


if __name__ == "__main__":
    import sys
    from hermes_cli.config import load_env
    # Hermes deliberately removes credentials from terminal tools. A hook launched by
    # the PM restores only its configured doors, the same ones the gateway itself uses.
    saved = load_env()
    for name in ("GITHUB_TOKEN", "GITHUB_API_URL", "DISCORD_BOT_TOKEN", "DISCORD_API_BASE"):
        if saved.get(name):
            os.environ.setdefault(name, saved[name])
    if len(sys.argv) == 3 and sys.argv[1] == "pull-request":
        print(json.dumps(community(Path.cwd(), "pull-request", sys.argv[2])))
    else:
        import argparse
        import math
        import re
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("action", choices=["remind"])
        parser.add_argument("--via", choices=["github", "discord"])
        parser.add_argument("--recipient")
        parser.add_argument("--reminder-hours", type=float)
        args = parser.parse_args()
        route = None
        if any(value is not None for value in (args.via, args.recipient, args.reminder_hours)):
            if not all(value is not None for value in (args.via, args.recipient, args.reminder_hours)):
                parser.error("explicit delivery needs --via, --recipient and --reminder-hours from the PM skill")
            pattern = r"[a-zA-Z0-9][a-zA-Z0-9-]{0,38}" if args.via == "github" else r"\d{17,20}"
            if not re.fullmatch(pattern, args.recipient) or not math.isfinite(args.reminder_hours) or args.reminder_hours < 1:
                parser.error("invalid recipient or reminder interval (minimum 1 hour)")
            route = {"via": args.via, "recipient": args.recipient, "reminder_hours": args.reminder_hours}
        reconcile(remind=True, route=route)
