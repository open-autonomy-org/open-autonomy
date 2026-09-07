"""Escalate board tasks that need a human through the project's own door.

The gateway hook registers a cheap board-mutation observer and reconciles again
on every dispatcher tick. The tick is necessary because a worker mutates the
shared board in another process. Runtime issue numbers live beside the board,
never in the repository.
"""

import json
import logging
import os
import re
import subprocess
import threading
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("hooks.escalate")
_LOCK = threading.Lock()
_REGISTERED = False
_HUMAN_KINDS = {"needs_input", "capability"}
_SHIP_TITLE = "ship what has landed"


def _home() -> Path:
    return Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes")


def _state_path() -> Path:
    return _home() / "state" / "escalations.json"


def _load_state() -> dict:
    try:
        value = json.loads(_state_path().read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {"tasks": {}}
    except (OSError, ValueError):
        return {"tasks": {}}


def _save_state(state: dict) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _owner() -> dict:
    from hermes_cli.config import load_config_readonly

    value = (load_config_readonly() or {}).get("owner")
    return value if isinstance(value, dict) else {}


def _run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, cwd=os.getcwd())


def _community(*args: str) -> subprocess.CompletedProcess:
    return _run(["bun", ".open-autonomy/community.ts", *args])


def _discord_send(chat_id: str, message: str) -> None:
    token = os.environ.get("DISCORD_BOT_TOKEN", "")
    if not token:
        raise RuntimeError("Discord owner door has no DISCORD_BOT_TOKEN")
    base = os.environ.get("DISCORD_API_URL", "https://discord.com/api/v10").rstrip("/")
    request = urllib.request.Request(
        f"{base}/channels/{chat_id}/messages",
        data=json.dumps({"content": message}).encode(),
        headers={"authorization": f"Bot {token}", "content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10):
        pass


def _human_blocks(board: str | None) -> dict[str, dict]:
    from hermes_cli import kanban_db as kb

    out = {}
    with kb.connect_closing(board=board) as conn:
        rows = conn.execute(
            "SELECT id, title, block_kind FROM tasks WHERE status = 'blocked'"
        ).fetchall()
        for row in rows:
            kind = row["block_kind"]
            if kind not in _HUMAN_KINDS:
                continue
            event = conn.execute(
                "SELECT payload FROM task_events WHERE task_id = ? AND kind IN ('blocked', 'block_loop_detected') ORDER BY id DESC LIMIT 1",
                (row["id"],),
            ).fetchone()
            try:
                payload = json.loads(event["payload"]) if event and event["payload"] else {}
            except (TypeError, ValueError):
                payload = {}
            out[row["id"]] = {
                "title": row["title"],
                "kind": kind,
                "reason": str(payload.get("reason") or "The task needs an owner's action."),
            }
    return out


def _key(board: str | None, task_id: str) -> str:
    return f"{board or 'default'}:{task_id}"


def _ask(block: dict, task_id: str) -> str:
    return (
        f"Owner action required for {task_id}: {block['reason']} "
        f"When it is done, run `hermes kanban unblock {task_id}`."
    )


def _subscribe(board: str | None, task_id: str, user_id: str, message: str) -> str:
    from hermes_cli import kanban_db as kb

    chat_id = os.environ.get("DISCORD_HOME_CHANNEL", "").strip()
    if not chat_id:
        raise RuntimeError("owner.discord is set but DISCORD_HOME_CHANNEL is not configured")
    with kb.connect_closing(board=board) as conn:
        kb.add_notify_sub(
            conn,
            task_id=task_id,
            platform="discord",
            chat_id=chat_id,
            user_id=user_id,
            chat_type="dm",
            notifier_profile="default",
            delivery_mode="notify+wake",
        )
        # A new subscription starts caught up. Rewind it to the blocking event:
        # that terminal event is what wakes the agent as well as notifying.
        with kb.write_txn(conn):
            conn.execute(
                "UPDATE kanban_notify_subs SET last_event_id = COALESCE((SELECT id - 1 FROM task_events WHERE task_id = ? AND kind IN ('blocked', 'block_loop_detected') ORDER BY id DESC LIMIT 1), last_event_id) WHERE task_id = ? AND platform = 'discord' AND chat_id = ? AND thread_id = ''",
                (task_id, task_id, chat_id),
            )
            kb.add_comment(conn, task_id, "escalate", f"<@{user_id}> {message}")
    _discord_send(chat_id, f"<@{user_id}> {message}")
    return chat_id


def _unsubscribe(board: str | None, task_id: str, chat_id: str) -> None:
    from hermes_cli import kanban_db as kb

    with kb.connect_closing(board=board) as conn:
        kb.remove_notify_sub(
            conn, task_id=task_id, platform="discord", chat_id=chat_id
        )


def _open_issue(task_id: str, block: dict, login: str, message: str) -> int | None:
    body = f"{message}\n\n<!-- open-autonomy-block:{task_id} -->"
    result = _community("issue", "open", task_id, block["title"], body, login)
    if result.returncode:
        logger.error("escalate: cannot open issue for %s: %s", task_id, (result.stderr or result.stdout).strip())
        return None
    match = re.search(r"#(\d+)", result.stdout)
    return int(match.group(1)) if match else None


def _close_issue(number: int) -> bool:
    result = _community("issue", "close", str(number))
    if result.returncode:
        logger.error("escalate: cannot close issue #%s: %s", number, (result.stderr or result.stdout).strip())
        return False
    return True


def _reconcile(board: str | None = None) -> set[str]:
    if not _LOCK.acquire(blocking=False):
        return set()
    try:
        blocks = _human_blocks(board)
        owner = _owner()
        state = _load_state()
        tasks = state.setdefault("tasks", {})
        new = set()

        for task_id, block in blocks.items():
            key = _key(board, task_id)
            if key in tasks:
                continue
            message = _ask(block, task_id)
            if owner.get("discord"):
                user_id = str(owner["discord"])
                chat_id = _subscribe(board, task_id, user_id, message)
                tasks[key] = {"task": task_id, "board": board, "door": "discord", "target": chat_id, "user": user_id}
            elif owner.get("github"):
                issue = _open_issue(task_id, block, str(owner["github"]), message)
                if issue is None:
                    continue
                tasks[key] = {"task": task_id, "board": board, "door": "github", "issue": issue}
            else:
                logger.error("escalate: %s needs a human but hermes/config.yaml has no owner door", task_id)
                continue
            new.add(key)

        active = {_key(board, task_id) for task_id in blocks}
        for key, item in list(tasks.items()):
            if item.get("board") != board or key in active:
                continue
            if item.get("door") == "discord":
                _unsubscribe(board, str(item["task"]), str(item["target"]))
            elif item.get("door") == "github" and item.get("issue"):
                if not _close_issue(int(item["issue"])):
                    continue
            del tasks[key]

        _save_state(state)
        return new
    except Exception:
        logger.exception("escalate: reconciliation failed")
        return set()
    finally:
        _LOCK.release()


def _remind(board: str | None, only: set[str] | None = None) -> None:
    from hermes_cli import kanban_db as kb

    blocks = _human_blocks(board)
    state = _load_state()
    for task_id, block in blocks.items():
        key = _key(board, task_id)
        if only is not None and key not in only:
            continue
        item = state.get("tasks", {}).get(key)
        if not item:
            continue
        message = "Still waiting: " + _ask(block, task_id)
        if item.get("door") == "discord":
            with kb.connect_closing(board=board) as conn:
                kb.add_comment(conn, task_id, "pm", message)
            _discord_send(str(item["target"]), f"<@{item.get('user', '')}> {message}")
        elif item.get("door") == "github" and item.get("issue"):
            result = _community("comment", str(item["issue"]), message)
            if result.returncode:
                logger.error("escalate: cannot remind issue #%s: %s", item["issue"], (result.stderr or result.stdout).strip())


def _account_live() -> tuple[str, dict] | None:
    project_config = Path(".open-autonomy/config.yaml")
    if not project_config.exists():
        return None
    text = project_config.read_text(encoding="utf-8")
    account_match = re.search(r"^account:\s*(\S+)", text, re.MULTILINE)
    base = os.environ.get("OPEN_AUTONOMY_BASE_URL", "").rstrip("/")
    if not account_match or not base:
        return None
    url = f"{base}/accounts/{urllib.parse.quote(account_match.group(1), safe='')}"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            value = json.load(response)
    except Exception as exc:
        logger.warning("escalate: cannot read the project account: %s", exc)
        return None
    live = value.get("live") if isinstance(value, dict) else None
    return account_match.group(1), live if isinstance(live, dict) else {}


def _shipping(board: str | None) -> None:
    from hermes_cli import kanban_db as kb

    account_live = _account_live()
    if not account_live:
        return
    _, live = account_live
    ahead = live.get("ahead")
    with kb.connect_closing(board=board) as conn:
        standing = conn.execute(
            "SELECT id, status FROM tasks WHERE title = ? AND created_by = 'pm' AND idempotency_key LIKE 'pm:ship:%' ORDER BY created_at DESC",
            (_SHIP_TITLE,),
        ).fetchall()
    if ahead == 0:
        for row in standing:
            if row["status"] == "blocked":
                cmd = ["hermes", "kanban"]
                if board:
                    cmd += ["--board", board]
                _run([*cmd, "unblock", row["id"]])
        return
    if not isinstance(ahead, int) or ahead <= 0 or not live.get("head"):
        return
    head = str(live["head"])
    date = datetime.now(timezone.utc).strftime("%Y%m%d")
    tag = f"deploy-v{date}"
    action = f"Run `git tag -a {tag} {head} && git push origin {tag}` from the project checkout."
    if any(row["status"] in {"blocked", "ready", "running", "todo"} for row in standing):
        return
    cmd = ["hermes", "kanban"]
    if board:
        cmd += ["--board", board]
    created = _run([
        *cmd,
        "create",
        _SHIP_TITLE,
        "--body",
        f"- {action}\n- The PM unblocks this task when the account's live.ahead returns to zero.",
        "--assignee",
        "default",
        "--workspace",
        f"dir:{os.getcwd()}",
        "--created-by",
        "pm",
        "--idempotency-key",
        f"pm:ship:{head}",
        "--json",
    ])
    if created.returncode:
        logger.error("escalate: cannot create shipping task: %s", (created.stderr or created.stdout).strip())
        return
    match = re.search(r'"id"\s*:\s*"([^"]+)"', created.stdout)
    if not match:
        logger.error("escalate: shipping task answer had no id")
        return
    blocked = _run([*cmd, "block", "--kind", "needs_input", match.group(1), action])
    if blocked.returncode:
        logger.error("escalate: cannot block shipping task: %s", (blocked.stderr or blocked.stdout).strip())


def pm() -> None:
    board = os.environ.get("HERMES_KANBAN_BOARD") or None
    existing = set(_load_state().get("tasks", {}))
    _shipping(board)
    _reconcile(board)
    _remind(board, only=existing)


def _observer(**context) -> None:
    _reconcile(context.get("board"))


def _register_observers() -> None:
    global _REGISTERED
    if _REGISTERED:
        return
    from hermes_cli.plugins import get_plugin_manager

    manager = get_plugin_manager()
    # on_kanban_task_updated is the mutation hook. The dispatcher tick covers
    # mutations committed by worker/CLI processes, which cannot call back into
    # this gateway process.
    for event in (
        "on_kanban_task_updated",
        "on_kanban_dispatch_tick",
        "kanban_task_blocked",
        "kanban_task_completed",
    ):
        manager._hooks.setdefault(event, []).append(_observer)
    _REGISTERED = True


async def handle(event_type: str, context: dict) -> None:
    _register_observers()
    _reconcile(context.get("board"))


if __name__ == "__main__":
    import sys

    if sys.argv[1:] == ["pm"]:
        pm()
    else:
        raise SystemExit("usage: handler.py pm")
