"""Seed the project-owned schedule on startup, preserving runtime job state.

The PM scrum reads ROADMAP.md and queues fleet work. kanban.seed.json is retained
as historical migration input, never replayed into the board. Jobs remain pinned
to the configured model/provider; owner-customized schedule definitions are preserved.
"""

import json
import logging
import re
import time
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


async def handle(event_type: str, context: dict) -> None:
    import os
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
            # The seed is the job's definition: a prompt, a skill, a schedule, a monitor or a delivery that moved in
            # the seed moves in the live job (its id, its history and its enabled state stay); the model pin follows
            # config.yaml. What the seed does not name is left as the operator set it.
            updates = {}
            if not bool(spec.get("no_agent")) and ((job.get("model") or None) != model or (job.get("provider") or None) != provider):
                updates.update({"model": model, "provider": provider})
            for field, live_key in (("prompt", "prompt"), ("skills", "skills"), ("monitor_script", "monitor_script"), ("monitor_url", "monitor_url"), ("script", "script"), ("enabled_toolsets", "enabled_toolsets")):
                if field in spec and (spec.get(field) or None) != (job.get(live_key) or None):
                    updates[live_key] = spec.get(field) or None
            if "deliver" in spec and _deliver_target(name, spec.get("deliver")) != job.get("deliver"):
                updates["deliver"] = _deliver_target(name, spec.get("deliver"))
            if "schedule" in spec and spec.get("schedule") != ((job.get("schedule") or {}).get("display") if isinstance(job.get("schedule"), dict) else job.get("schedule")):
                updates["schedule"] = spec.get("schedule")
            if not updates:
                continue
            try:
                update_job(job["id"], updates)
                repinned += 1
                logger.info("seed: refreshed job '%s' from the seed (%s)", name, ", ".join(sorted(updates)))
            except Exception as e:
                logger.error("seed: failed to refresh job '%s': %s", name, e)
            continue
        try:
            create_job(
                prompt=spec.get("prompt"),
                schedule=spec.get("schedule"),
                name=name,
                deliver=_deliver_target(name, spec.get("deliver")),
                enabled_toolsets=spec.get("enabled_toolsets") or None,
                skills=spec.get("skills") or None,
                skill=spec.get("skill"),
                workdir=os.getcwd(),
                script=spec.get("script"),
                # A monitor job runs its script (or reads its URL) on the schedule and wakes the agent only when the
                # output changed, handing it the diff: how an engagement's brain watches a board without spending.
                monitor_script=spec.get("monitor_script"),
                monitor_url=spec.get("monitor_url"),
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
    _seed_webhooks()


def _seed_webhooks() -> None:
    """The project-owned webhook routes (cron/webhooks.seed.json): a route per entry, created when absent, its
    prompt, skills, deliver, events, script and toolsets refreshed from the seed, its secret kept once made.
    The seed never carries a secret; the route's is generated here and lives only in the home's
    webhook_subscriptions.json, where the sender's door reads it."""
    import secrets as _secrets
    seed_file = _hermes_home() / "cron" / "webhooks.seed.json"
    if not seed_file.exists():
        return
    try:
        data = json.loads(seed_file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        logger.error("seed: failed to read %s: %s", seed_file, e)
        return
    routes = data.get("routes", []) if isinstance(data, dict) else data
    routes = [r for r in routes if isinstance(r, dict) and r.get("name")]
    if not routes:
        return
    try:
        from hermes_cli.webhook import _load_subscriptions, _save_subscriptions
    except Exception as e:  # pragma: no cover - import path depends on runtime
        logger.error("seed: cannot import hermes_cli.webhook: %s", e)
        return
    subs = _load_subscriptions()
    changed = 0
    for spec in routes:
        name = str(spec["name"]).strip().lower().replace(" ", "-")
        existing = subs.get(name) or {}
        route = {
            "description": spec.get("description") or f"Seeded route: {name}",
            "events": [str(e).strip() for e in (spec.get("events") or [])],
            "secret": existing.get("secret") or _secrets.token_urlsafe(32),
            "prompt": spec.get("prompt") or "",
            "skills": [str(x).strip() for x in (spec.get("skills") or [])],
            "deliver": _deliver_target(name, spec.get("deliver") or "log"),
            "created_at": existing.get("created_at") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        if spec.get("script"):
            route["script"] = str(spec["script"]).strip()
        if spec.get("toolsets"):
            route["toolsets"] = [str(x).strip() for x in spec["toolsets"]]
        if spec.get("deliver_only"):
            route["deliver_only"] = True
        if {k: v for k, v in existing.items() if k != "created_at"} != {k: v for k, v in route.items() if k != "created_at"}:
            subs[name] = route
            changed += 1
    if changed:
        _save_subscriptions(subs)
        logger.info("seed: seeded %d webhook route(s) from webhooks.seed.json", changed)
