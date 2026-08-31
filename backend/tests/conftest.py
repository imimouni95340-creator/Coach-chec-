import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["COACH_DATABASE_URL"] = f"sqlite:///{_tmp_db.name}"

import pytest

from app.core.config import get_settings

get_settings.cache_clear()


@pytest.fixture(autouse=True, scope="session")
def _init_database():
    from app.db.database import init_db

    init_db()
    yield
