"""Owner notifications, reconciled through Hermes and the project's GitHub door.

Only needs_input/capability blocks reach the owner. State records deliveries, never
board state; retries read the board again. The plugin supplies board lifecycle events.
"""
import fcntl
import json
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


def reconcile(*, board=None, remind=False, **kwargs):
    from hermes_cli import kanban_db as kb
    from hermes_cli.config import get_hermes_home, load_config_readonly
    home = Path(get_hermes_home())
    config = load_config_readonly() or {}
    owner = config.get("owner") or {}
    if not owner:
        if remind:
            log.warning("no owner configured; run create-open-autonomy setup to choose an owner notification door")
        return
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
            reminders = []
            reminder_chat = None
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
                    events = kb.list_events(conn, task_id)
                    event = next((e for e in reversed(events) if e.kind == "blocked"), None)
                    reason = (event.payload or {}).get("reason", "") if event else ""
                    ask = f"{task.title}\n\n{reason}\n\nAfter resolving this request: `hermes kanban unblock {task_id}`."
                    if owner.get("discord") and os.environ.get("DISCORD_BOT_TOKEN"):
                        if not entry.get("chat"):
                            base = os.environ.get("DISCORD_API_BASE", "https://discord.com/api/v10").rstrip("/")
                            req = Request(base + "/users/@me/channels", data=json.dumps({"recipient_id": str(owner["discord"])}).encode(),
                                          headers={"Authorization": "Bot " + os.environ["DISCORD_BOT_TOKEN"], "Content-Type": "application/json"})
                            with urlopen(req, timeout=15) as response:
                                entry["chat"] = str(json.load(response)["id"])
                        chat = entry["chat"]
                        prior = next((s for s in kb.list_notify_subs(conn, task_id) if s["platform"] == "discord" and s["chat_id"] == chat), None)
                        kb.add_notify_sub(conn, task_id=task_id, platform="discord", chat_id=chat,
                                          user_id=str(owner["discord"]), chat_type="dm", notifier_profile="default", delivery_mode="notify+wake")
                        if not prior and event:
                            # Subscribe normally, then include just the block that triggered this subscription.
                            sub = next(s for s in kb.list_notify_subs(conn, task_id) if s["platform"] == "discord" and s["chat_id"] == chat)
                            kb.rewind_notify_cursor(conn, task_id=task_id, platform="discord", chat_id=chat,
                                                    claimed_cursor=sub["last_event_id"], old_cursor=event.id - 1)
                        if remind:
                            reminders.append(ask)
                            reminder_chat = chat
                    elif owner.get("github") and os.environ.get("GITHUB_TOKEN"):
                        if not entry.get("issue"):
                            issue = community(project, "issue", "open", task_id, task.title, ask, str(owner["github"]))
                            entry["issue"] = issue["number"]
                        elif remind:
                            community(project, "issue", "remind", str(entry["issue"]), ask)
                    else:
                        raise RuntimeError("owner has no reachable door; run create-open-autonomy setup to configure Discord or the GitHub App")
                    state[key] = entry
                except Exception:
                    log.exception("cannot deliver owner escalation for %s", task_id)
                    if entry:
                        state[key] = entry
            if reminders:
                from cron.jobs import create_job
                model = config.get("model") or {}
                if isinstance(model, str):
                    model = {"default": model}
                create_job(prompt="Tell the owner, in one message, the exact actions needed below. Do not unblock tasks or perform the actions.\n\n" + "\n\n".join(reminders),
                           schedule="in 1m", repeat=1, name="owner-reminder", deliver=f"discord:{reminder_chat}",
                           model=model.get("default"), provider=model.get("provider"), workdir=str(project))
            temp = state_path.with_suffix(".tmp")
            temp.write_text(json.dumps(state, indent=2) + "\n")
            temp.replace(state_path)
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
    reconcile(remind="remind" in sys.argv[1:])
