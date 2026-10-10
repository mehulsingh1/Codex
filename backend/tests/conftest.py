import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class RateLimitError(Exception):
    """Stand-in: the engine recognises Groq's rate limit by class name."""


class FakeGroq:
    """Scripted chat client. Each item is a reply string or an Exception to raise; records every call."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kw):
        self.calls.append(kw)
        item = self.replies.pop(0)
        if isinstance(item, BaseException):
            raise item
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=item))])


@pytest.fixture
def fake_groq(monkeypatch):
    from app import turn_engine as TE

    real_sleep = TE.asyncio.sleep

    async def fast_sleep(_):  # retry back-offs should not slow the tests
        await real_sleep(0)

    monkeypatch.setattr(TE.asyncio, "sleep", fast_sleep)

    def install(replies):
        fake = FakeGroq(replies)
        monkeypatch.setattr(TE, "_client", fake)
        return fake

    return install
