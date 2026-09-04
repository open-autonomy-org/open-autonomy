"""Seed the cron schedule from the committed jobs.seed.json on gateway startup.

The Open Autonomy repository commits the schedule definition in
hermes/cron/jobs.seed.json (byte-stable) and git-ignores the runtime store
hermes/cron/jobs.json, which Hermes rewrites on every tick with next_run_at /
last_run_at / fire_claim etc. This hook reconciles the runtime store to the
seed on every gateway boot so the committed definition stays the source of
truth and no scheduler run-state ever churns the commit.

Idempotent: it only creates jobs that are in the seed and missing from the
live store (matched by name). It never deletes, pauses, or edits existing
jobs, so runtime state (completed runs, next_run_at) is preserved across
restarts and an operator can still add jobs by hand without the seed
clobbering them.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger("hooks.schedule-seed")


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
        "schedule-seed: job '%s' delivers to %s but no %s is configured; delivering locally instead",
        name, platform, " / ".join(needs),
    )
    return "local"


def _seed_jobs() -> list:
    seed_file = _hermes_home() / "cron" / "jobs.seed.json"
    if not seed_file.exists():
        return []
    try:
        data = json.loads(seed_file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        logger.error("schedule-seed: failed to read %s: %s", seed_file, e)
        return []
    jobs = data.get("jobs", []) if isinstance(data, dict) else data
    return [j for j in jobs if isinstance(j, dict)]


async def handle(event_type: str, context: dict) -> None:
    try:
        from cron.jobs import create_job, load_jobs
    except Exception as e:  # pragma: no cover - import path depends on runtime
        logger.error("schedule-seed: cannot import cron.jobs: %s", e)
        return

    seed = _seed_jobs()
    if not seed:
        logger.info("schedule-seed: no jobs.seed.json present; nothing to seed")
        return

    try:
        live = load_jobs()
    except Exception as e:
        logger.error("schedule-seed: cannot load live jobs: %s", e)
        return

    live_names = {j.get("name") for j in live if j.get("name")}
    created = 0
    for spec in seed:
        name = spec.get("name")
        if not name or name in live_names:
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
            )
            created += 1
            logger.info("schedule-seed: created job '%s' from seed", name)
        except Exception as e:
            logger.error("schedule-seed: failed to create job '%s': %s", name, e)

    if created:
        logger.info("schedule-seed: seeded %d job(s) from jobs.seed.json", created)
