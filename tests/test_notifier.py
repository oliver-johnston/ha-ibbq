import pytest
from unittest.mock import AsyncMock

from src.notifier import Notifier


@pytest.fixture
def ha():
    mock = AsyncMock()
    mock.call_service = AsyncMock()
    return mock


@pytest.mark.asyncio
async def test_send_notification(db, ha):
    """Entity + channel configured -> call_service with correct args."""
    db.set_setting("discord_notify_entity", "robeson_chat")
    db.set_setting("discord_alerts_channel_id", "1483226515461115954")

    notifier = Notifier(ha=ha, db=db)
    await notifier.send("Brisket is done!")

    ha.call_service.assert_awaited_once_with(
        "notify",
        "robeson_chat",
        {"message": "Brisket is done!", "target": "1483226515461115954"},
    )


@pytest.mark.asyncio
async def test_send_strips_notify_prefix(db, ha):
    """Entity 'notify.robeson_chat' -> service name 'robeson_chat'."""
    db.set_setting("discord_notify_entity", "notify.robeson_chat")
    db.set_setting("discord_alerts_channel_id", "1483226515461115954")

    notifier = Notifier(ha=ha, db=db)
    await notifier.send("Temp alert")

    ha.call_service.assert_awaited_once_with(
        "notify",
        "robeson_chat",
        {"message": "Temp alert", "target": "1483226515461115954"},
    )


@pytest.mark.asyncio
async def test_send_no_entity_configured(db, ha):
    """No entity in settings -> call_service not called."""
    notifier = Notifier(ha=ha, db=db)
    await notifier.send("Should be dropped")

    ha.call_service.assert_not_awaited()


@pytest.mark.asyncio
async def test_send_no_channel(db, ha):
    """Entity set but no channel -> data has no 'target' key."""
    db.set_setting("discord_notify_entity", "robeson_chat")

    notifier = Notifier(ha=ha, db=db)
    await notifier.send("No channel message")

    ha.call_service.assert_awaited_once_with(
        "notify",
        "robeson_chat",
        {"message": "No channel message"},
    )
