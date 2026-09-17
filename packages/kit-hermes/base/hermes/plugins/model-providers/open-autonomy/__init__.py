"""Open Autonomy's Hermes model wire."""

from agent.portal_tags import get_conversation_context
from providers import register_provider
from providers.base import ProviderProfile


class OpenAutonomyProfile(ProviderProfile):
    """Name the active Hermes session on every request to the platform."""

    def build_extra_body(
        self, *, session_id: str | None = None, **context
    ) -> dict[str, str]:
        active = session_id or get_conversation_context()
        return {"session_id": active} if active else {}


register_provider(
    OpenAutonomyProfile(
        name="custom",
        display_name="Open Autonomy",
        description="The project's metered Open Autonomy model rail",
        env_vars=("OPEN_AUTONOMY_BASE_URL", "OPEN_AUTONOMY_KEY"),
    )
)
