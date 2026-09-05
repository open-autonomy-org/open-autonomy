"""Seed the schedule and the board from the committed seeds on gateway startup.

Two seeds, both in the agent's home: cron/jobs.seed.json (the schedule) and kanban.seed.json (the board's
starting tasks, in order, each waiting on the one before it). Both are idempotent: a job is matched by name, a
task by its idempotency key `seed:<key>`, so a boot never files twice and the owner's own tasks are untouched.

The Open Autonomy repository commits the schedule definition in
hermes/cron/jobs.seed.json (byte-stable) and git-ignores the runtime store
hermes/cron/jobs.json, which Hermes rewrites on every tick with next_run_at /
last_run_at / fire_claim etc. This hook reconciles the runtime store to the
seed on every gateway boot so the committed definition stays the source of
truth and no scheduler run-state ever churns the commit.

Every seeded job is pinned to the provider and model hermes/config.yaml names,
at creation and again on every boot the config moved: an unpinned job snapshots
the global model when created and Hermes's drift guard skips its fires once the
owner changes the model, stranding the schedule. Pinned, the job runs on the
config's model, and the next boot after a change re-pins it.

Idempotent: it only creates jobs that are in the seed and missing from the
live store (matched by name). It never deletes, pauses, or edits existing
jobs, so runtime state (completed runs, next_run_at) is preserved across
restarts and an operator can still add jobs by hand without the seed
clobbering them.
"""

import json
import logging
import re
from pathlib import Path

logger = logging.getLogger("hooks.seed")


def _hermes_home() -> Path:
    import os
    return Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes")


# A seed may name a delivery platform the project has not configured (the template says `discord`; Discord is
# optional). Hermes blocks such a job before any model call, so the job is created delivering `local` instead —
# the run still happens and the platform's receipts remain the record — and the fallback is logged. Platforms
# are matched by the credential their gateway needs; anything else passes through untouched.
_PLATFORM_CREDENTIALS = {
    "discord": ("DISCORD_BOT_TOKEN",),
    "telegram": ("TELEGRAM_BOT_TOKEN",),
    "slack": ("SLACK_BOT_TOKEN",),
}


def _configured(var: str) -> bool:
    import os
    if os.environ.get(var):
        return True
    env_file = _hermes_home() / ".env"
    try:
        for line in env_file.read_text(encoding="utf-8").splitlines():
            key, _, value = line.strip().partition("=")
            if key == var and value.strip().strip("'\""):
                return True
    except OSError:
        pass
    return False


def _deliver_target(name: str, deliver) -> object:
    platform = str(deliver).strip().lower() if isinstance(deliver, str) else ""
    needs = _PLATFORM_CREDENTIALS.get(platform)
    if not needs or any(_configured(v) for v in needs):
        return deliver
    logger.warning(
        "seed: job '%s' delivers to %s but no %s is configured; delivering locally instead",
        name, platform, " / ".join(needs),
    )
    return "local"


def _config_inference() -> tuple:
    """The model and provider hermes/config.yaml names: what every seeded job is pinned to."""
    try:
        from hermes_cli.config import load_config_readonly
        cfg = load_config_readonly() or {}
    except Exception as e:  # pragma: no cover - import path depends on runtime
        logger.warning("seed: cannot read config.yaml for the model pin: %s", e)
        return None, None
    model = cfg.get("model")
    if isinstance(model, dict):
        return (str(model.get("default") or "").strip() or None, str(model.get("provider") or "").strip() or None)
    if isinstance(model, str):
        return (model.strip() or None, None)
    return None, None


def _seed_jobs() -> list:
    seed_file = _hermes_home() / "cron" / "jobs.seed.json"
    if not seed_file.exists():
        return []
    try:
        data = json.loads(seed_file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        logger.error("seed: failed to read %s: %s", seed_file, e)
        return []
    jobs = data.get("jobs", []) if isinstance(data, dict) else data
    return [j for j in jobs if isinstance(j, dict)]


# ---- the board -------------------------------------------------------------------------------------------------

def _seed_tasks() -> tuple:
    seed_file = _hermes_home() / "kanban.seed.json"
    if not seed_file.exists():
        return "dir:/work/project", []
    try:
        data = json.loads(seed_file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        logger.error("seed: failed to read %s: %s", seed_file, e)
        return "dir:/work/project", []
    workspace = str(data.get("workspace") or "dir:/work/project")
    tasks = [t for t in data.get("tasks", []) if isinstance(t, dict) and t.get("key") and t.get("title")]
    return workspace, tasks


def _seed_board() -> None:
    """File every seed task that is not on the board yet, each a child of the one before it, so the dispatcher
    pulls them down one at a time in the seed's order. `hermes kanban create --idempotency-key` returns the
    existing task for a key it has seen, so a second boot changes nothing."""
    import subprocess
    workspace, tasks = _seed_tasks()
    if not tasks:
        return
    subprocess.run(["hermes", "kanban", "init"], capture_output=True, text=True)
    previous = None
    for spec in tasks:
        body = "\n".join(f"- {line}" for line in spec.get("acceptance", []) if isinstance(line, str))
        cmd = ["hermes", "kanban", "create", str(spec["title"]), "--body", body, "--assignee", "default",
               "--workspace", workspace, "--idempotency-key", f"seed:{spec['key']}", "--created-by", "seed",
               "--skill", "develop", "--skill", "review", "--json"]
        if previous:
            cmd += ["--parent", previous]
        if spec.get("triage"):
            cmd.append("--triage")  # filed, not released: the owner's to accept onto the board
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            logger.error("seed: cannot file task '%s': %s", spec["key"], (r.stderr or r.stdout).strip()[-400:])
            return
        m = re.search(r'"id":\s*"([^"]+)"', r.stdout)
        if not m:
            logger.error("seed: no task id in the board's answer for '%s'", spec["key"])
            return
        previous = m.group(1)
    logger.info("seed: the board holds the %d seed task(s)", len(tasks))


async def handle(event_type: str, context: dict) -> None:
    _seed_board()
    try:
        from cron.jobs import create_job, load_jobs, update_job
    except Exception as e:  # pragma: no cover - import path depends on runtime
        logger.error("seed: cannot import cron.jobs: %s", e)
        return

    seed = _seed_jobs()
    if not seed:
        logger.info("seed: no jobs.seed.json present; nothing to seed")
        return

    try:
        live = load_jobs()
    except Exception as e:
        logger.error("seed: cannot load live jobs: %s", e)
        return

    model, provider = _config_inference()
    live_by_name = {j.get("name"): j for j in live if j.get("name")}
    created = 0
    repinned = 0
    for spec in seed:
        name = spec.get("name")
        if not name:
            continue
        job = live_by_name.get(name)
        if job is not None:
            if bool(spec.get("no_agent")) or ((job.get("model") or None) == model and (job.get("provider") or None) == provider):
                continue
            try:
                update_job(job["id"], {"model": model, "provider": provider})
                repinned += 1
                logger.info("seed: re-pinned job '%s' to %s / %s (config.yaml moved)", name, provider, model)
            except Exception as e:
                logger.error("seed: failed to re-pin job '%s': %s", name, e)
            continue
        try:
            create_job(
                prompt=spec.get("prompt"),
                schedule=spec.get("schedule"),
                name=name,
                deliver=_deliver_target(name, spec.get("deliver")),
                skills=spec.get("skills") or None,
                skill=spec.get("skill"),
                workdir=spec.get("workdir"),
                script=spec.get("script"),
                no_agent=bool(spec.get("no_agent")),
                model=None if spec.get("no_agent") else model,
                provider=None if spec.get("no_agent") else provider,
            )
            created += 1
            logger.info("seed: created job '%s' from seed, pinned to %s / %s", name, provider, model)
        except Exception as e:
            logger.error("seed: failed to create job '%s': %s", name, e)

    if created or repinned:
        logger.info("seed: seeded %d job(s) from jobs.seed.json, re-pinned %d", created, repinned)
