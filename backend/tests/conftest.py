"""Shared fixtures for Sahu Sales backend tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://native-alarm-demo.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_url():
    return API


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_ctx(http):
    """Ensure an admin user exists. If DB already has users, register a new one (won't be admin)
    and try to login with the seeded admin from test_credentials.md."""
    admin_email = "admin@sahusales.com"
    admin_pw = "Sahu@2026"
    # Try login first
    r = http.post(f"{API}/auth/login", json={"email": admin_email, "password": admin_pw})
    if r.status_code == 200:
        data = r.json()
        return {"email": admin_email, "password": admin_pw, "token": data["access_token"],
                "refresh_token": data["refresh_token"], "user": data["user"]}
    # Try register (works if DB fresh -> becomes admin)
    r = http.post(f"{API}/auth/register", json={
        "full_name": "Sahu Admin", "email": admin_email,
        "password": admin_pw, "organisation_name": "Sahu Sales",
    })
    if r.status_code == 200:
        data = r.json()
        return {"email": admin_email, "password": admin_pw, "token": data["access_token"],
                "refresh_token": data["refresh_token"], "user": data["user"]}
    pytest.skip(f"Cannot obtain admin credentials: {r.status_code} {r.text}")


@pytest.fixture(scope="session")
def admin_headers(admin_ctx):
    return {"Authorization": f"Bearer {admin_ctx['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def second_user_ctx(http):
    """Register a fresh second user; should be team_member if admin already exists."""
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@sahusales.com"
    pw = "Team@2026"
    r = http.post(f"{API}/auth/register", json={
        "full_name": "TEST Second User", "email": email, "password": pw,
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "password": pw, "token": data["access_token"],
            "refresh_token": data["refresh_token"], "user": data["user"]}


@pytest.fixture(scope="session")
def user_headers(second_user_ctx):
    return {"Authorization": f"Bearer {second_user_ctx['token']}", "Content-Type": "application/json"}
