"""Bridge the board's lifecycle to the kit's escalation hook."""
import importlib.util
from pathlib import Path


def register(ctx):
    from hermes_cli.config import get_hermes_home
    path = Path(get_hermes_home()) / "hooks" / "escalate" / "handler.py"
    spec = importlib.util.spec_from_file_location("open_autonomy_escalate", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # The pinned Hermes emits a separate block event and no update event on unblock.
    # The dispatch observer reconciles those transitions and recovers missed deliveries.
    for event in ("on_kanban_task_updated", "kanban_task_blocked", "on_kanban_dispatch_tick"):
        ctx.register_hook(event, module.reconcile)
