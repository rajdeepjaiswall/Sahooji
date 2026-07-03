"""Sahu Sales backend API tests — auth, tags, contacts, events, reminders, invoices, team, debug."""
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests


API = None  # populated via fixture


def _api(api_url):
    global API
    API = api_url


# ---------- Auth ----------
class TestAuth:
    def test_admin_login_or_register(self, admin_ctx):
        assert admin_ctx["user"]["role"] == "admin", f"first user should be admin: {admin_ctx['user']}"
        assert admin_ctx.get("token") and admin_ctx.get("refresh_token")

    def test_second_user_is_team_member(self, second_user_ctx):
        assert second_user_ctx["user"]["role"] == "team_member"

    def test_login_wrong_password(self, http, api_url, admin_ctx):
        r = http.post(f"{api_url}/auth/login",
                      json={"email": admin_ctx["email"], "password": "wrong-pw-xyz"})
        assert r.status_code == 401

    def test_get_me(self, http, api_url, admin_headers):
        r = http.get(f"{api_url}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body.get("role") == "admin"
        assert "_id" not in body

    def test_refresh_rotates(self, http, api_url, admin_ctx):
        r = http.post(f"{api_url}/auth/refresh",
                      json={"refresh_token": admin_ctx["refresh_token"]})
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d and "refresh_token" in d
        # update session token to keep other tests working
        admin_ctx["token"] = d["access_token"]
        admin_ctx["refresh_token"] = d["refresh_token"]

    def test_patch_me(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}", "Content-Type": "application/json"}
        r = http.patch(f"{api_url}/auth/me", headers=headers,
                       json={"full_name": "Sahu Admin", "mobile": "9999999999",
                             "vibrate": True, "floating_assistant": True})
        assert r.status_code == 200
        d = r.json()
        assert d["mobile"] == "9999999999"
        assert d["floating_assistant"] is True

    def test_password_change_wrong_current(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}", "Content-Type": "application/json"}
        r = http.post(f"{api_url}/auth/password-change", headers=headers,
                      json={"current_password": "bad", "new_password": "NewPass@2026"})
        assert r.status_code == 400

    def test_password_change_ok_then_revert(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}", "Content-Type": "application/json"}
        new_pw = "Sahu@Temp2026"
        r = http.post(f"{api_url}/auth/password-change", headers=headers,
                      json={"current_password": admin_ctx["password"], "new_password": new_pw})
        assert r.status_code == 200
        # revert (login with new, then change back)
        r2 = http.post(f"{api_url}/auth/login",
                       json={"email": admin_ctx["email"], "password": new_pw})
        assert r2.status_code == 200
        new_token = r2.json()["access_token"]
        h2 = {"Authorization": f"Bearer {new_token}", "Content-Type": "application/json"}
        r3 = http.post(f"{api_url}/auth/password-change", headers=h2,
                       json={"current_password": new_pw, "new_password": admin_ctx["password"]})
        assert r3.status_code == 200
        # refresh session token
        r4 = http.post(f"{api_url}/auth/login",
                       json={"email": admin_ctx["email"], "password": admin_ctx["password"]})
        admin_ctx["token"] = r4.json()["access_token"]
        admin_ctx["refresh_token"] = r4.json()["refresh_token"]


# ---------- Tags ----------
class TestTags:
    EXPECTED = {
        "Call": "#F97316", "Demo Call": "#3B82F6", "Payment Collection": "#22C55E",
        "Payment Request": "#EAB308", "AMC Renewal": "#EF4444", "Follow Up": "#8B5CF6",
        "Installation": "#10B981", "Meeting": "#EC4899",
    }

    def test_seeded_tags(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}"}
        r = http.get(f"{api_url}/tags", headers=headers)
        assert r.status_code == 200
        tags = r.json()
        assert isinstance(tags, list)
        by_name = {t["name"]: t for t in tags}
        for name, color in self.EXPECTED.items():
            assert name in by_name, f"missing tag: {name}"
            assert by_name[name]["color"].upper() == color.upper(), f"color mismatch for {name}"
            assert "_id" not in by_name[name]


# ---------- Contacts ----------
class TestContacts:
    def test_crud_and_bulk(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}", "Content-Type": "application/json"}
        # create
        payload = {"full_name": "TEST Contact Alpha", "mobile": "9111111111",
                   "email": "alpha@test.com", "city": "Delhi"}
        r = http.post(f"{api_url}/contacts", headers=headers, json=payload)
        assert r.status_code == 200
        c = r.json()
        cid = c["id"]
        assert c["full_name"] == payload["full_name"]
        assert "_id" not in c

        # list scope=mine
        r = http.get(f"{api_url}/contacts?scope=mine", headers=headers)
        assert r.status_code == 200
        assert any(x["id"] == cid for x in r.json())

        # patch
        r = http.patch(f"{api_url}/contacts/{cid}", headers=headers,
                       json={**payload, "city": "Mumbai"})
        assert r.status_code == 200
        assert r.json()["city"] == "Mumbai"

        # bulk
        bulk_names = [f"TEST Bulk {i}" for i in range(3)]
        r = http.post(f"{api_url}/contacts/bulk", headers=headers,
                      json={"contacts": [{"full_name": n} for n in bulk_names]})
        assert r.status_code == 200
        assert r.json()["inserted"] == 3

        # delete
        r = http.delete(f"{api_url}/contacts/{cid}", headers=headers)
        assert r.status_code == 200
        # verify 404
        r = http.get(f"{api_url}/contacts/{cid}", headers=headers)
        assert r.status_code == 404


# ---------- Events + Reminders ----------
@pytest.fixture(scope="module")
def seed_contact_and_tag(http, api_url, admin_ctx):
    headers = {"Authorization": f"Bearer {admin_ctx['token']}", "Content-Type": "application/json"}
    rc = http.post(f"{api_url}/contacts", headers=headers,
                   json={"full_name": "TEST Event Contact", "mobile": "9222222222"})
    assert rc.status_code == 200
    contact = rc.json()
    rt = http.get(f"{api_url}/tags", headers=headers)
    tag = rt.json()[0]
    return {"contact": contact, "tag": tag, "headers": headers}


class TestEvents:
    def test_create_event_with_reminders(self, http, api_url, seed_contact_and_tag):
        headers = seed_contact_and_tag["headers"]
        future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        remind_at = (datetime.now(timezone.utc) + timedelta(minutes=90)).isoformat()
        payload = {
            "contact_id": seed_contact_and_tag["contact"]["id"],
            "tag_id": seed_contact_and_tag["tag"]["id"],
            "title": "TEST Follow up call",
            "description": "test event",
            "event_at": future,
            "reminders": [{"remind_at": remind_at}],
        }
        r = http.post(f"{api_url}/events", headers=headers, json=payload)
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev["title"] == payload["title"]
        assert ev["contact"]["id"] == payload["contact_id"]
        assert ev["tag"]["id"] == payload["tag_id"]
        assert len(ev["reminders"]) == 1
        assert ev.get("assignee") is not None
        pytest.event_id = ev["id"]
        pytest.reminder_id = ev["reminders"][0]["id"]

    def test_event_status_completed(self, http, api_url, seed_contact_and_tag):
        headers = seed_contact_and_tag["headers"]
        r = http.patch(f"{api_url}/events/{pytest.event_id}/status", headers=headers,
                       json={"status": "completed"})
        assert r.status_code == 200
        assert r.json()["status"] == "completed"


class TestReminders:
    def test_list_mine_pending(self, http, api_url, admin_ctx, seed_contact_and_tag):
        # create a fresh event so a pending reminder exists
        headers = seed_contact_and_tag["headers"]
        future = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
        remind_at = (datetime.now(timezone.utc) + timedelta(minutes=120)).isoformat()
        r = http.post(f"{api_url}/events", headers=headers, json={
            "contact_id": seed_contact_and_tag["contact"]["id"],
            "tag_id": seed_contact_and_tag["tag"]["id"],
            "title": "TEST Reminder Event",
            "event_at": future,
            "reminders": [{"remind_at": remind_at}],
        })
        assert r.status_code == 200
        rid = r.json()["reminders"][0]["id"]
        pytest.reminder_id_2 = rid

        r = http.get(f"{api_url}/reminders?scope=mine&status=pending", headers=headers)
        assert r.status_code == 200
        assert any(x["id"] == rid for x in r.json())

    def test_snooze_reminder(self, http, api_url, seed_contact_and_tag):
        headers = seed_contact_and_tag["headers"]
        rid = pytest.reminder_id_2
        r = http.post(f"{api_url}/reminders/{rid}/action", headers=headers,
                      json={"action": "snoozed", "snooze_minutes": 30})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "snoozed"
        # Snoozed remind_at should be roughly now + 30min (within 2 min tolerance)
        new_at = datetime.fromisoformat(d["remind_at"])
        expected = datetime.now(timezone.utc) + timedelta(minutes=30)
        assert abs((new_at - expected).total_seconds()) < 120, \
            f"snooze remind_at {new_at} not near {expected}"

    def test_delegate_reminder(self, http, api_url, second_user_ctx, seed_contact_and_tag):
        headers = seed_contact_and_tag["headers"]
        rid = pytest.reminder_id_2
        r = http.post(f"{api_url}/reminders/{rid}/action", headers=headers,
                      json={"action": "delegated", "delegate_to": second_user_ctx["user"]["id"]})
        assert r.status_code == 200

    def test_end_reminder(self, http, api_url, seed_contact_and_tag):
        headers = seed_contact_and_tag["headers"]
        rid = pytest.reminder_id_2
        r = http.post(f"{api_url}/reminders/{rid}/action", headers=headers,
                      json={"action": "ended"})
        assert r.status_code == 200
        assert r.json()["status"] == "archived"

    def test_activity(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}"}
        r = http.get(f"{api_url}/activity", headers=headers)
        assert r.status_code == 200
        acts = r.json()
        assert len(acts) >= 1
        top = acts[0]
        assert "actor" in top and top["actor"] is not None
        assert "event_title" in top or top.get("event_title") is None


# ---------- Products ----------
class TestProducts:
    def test_crud(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}", "Content-Type": "application/json"}
        r = http.post(f"{api_url}/products", headers=headers,
                      json={"name": "TEST Widget", "unit_price": 100.0, "tax_percent": 18.0})
        assert r.status_code == 200
        p = r.json()
        pid = p["id"]
        assert p["unit_price"] == 100.0
        r = http.get(f"{api_url}/products", headers=headers)
        assert any(x["id"] == pid for x in r.json())
        r = http.patch(f"{api_url}/products/{pid}", headers=headers,
                       json={"name": "TEST Widget", "unit_price": 150.0, "tax_percent": 18.0})
        assert r.status_code == 200 and r.json()["unit_price"] == 150.0
        r = http.delete(f"{api_url}/products/{pid}", headers=headers)
        assert r.status_code == 200


# ---------- Invoices ----------
class TestInvoices:
    def test_create_invoice_and_number(self, http, api_url, admin_ctx, seed_contact_and_tag):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}", "Content-Type": "application/json"}
        invoice_date = datetime.now(timezone.utc).isoformat()
        r = http.post(f"{api_url}/invoices", headers=headers, json={
            "contact_id": seed_contact_and_tag["contact"]["id"],
            "invoice_date": invoice_date,
            "items": [{"name": "TEST Item", "qty": 2, "unit_price": 100, "tax_percent": 18,
                       "row_tax": 36, "row_total": 236}],
            "subtotal": 200, "tax_total": 36, "discount": 0, "grand_total": 236,
            "status": "draft",
        })
        assert r.status_code == 200, r.text
        inv = r.json()
        pytest.invoice_id = inv["id"]
        assert inv["invoice_number"].startswith("INV-")
        # verify format INV-YYYYMM-NNN
        parts = inv["invoice_number"].split("-")
        assert len(parts) == 3 and len(parts[1]) == 6 and len(parts[2]) == 3
        # FY: Apr→Mar
        month = datetime.now(timezone.utc).month
        fy = inv["financial_year"]
        assert "-" in fy
        # embedded contact
        assert inv["contact"] and inv["contact"]["id"] == seed_contact_and_tag["contact"]["id"]

    def test_list_draft_filter(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}"}
        r = http.get(f"{api_url}/invoices?status=draft", headers=headers)
        assert r.status_code == 200
        assert all(x["status"] == "draft" for x in r.json())


# ---------- Team ----------
class TestTeam:
    def test_admin_creates_member(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}", "Content-Type": "application/json"}
        email = f"TEST_team_{uuid.uuid4().hex[:8]}@sahusales.com"
        r = http.post(f"{api_url}/team", headers=headers, json={
            "email": email, "full_name": "TEST Team X", "password": "Team@2026",
            "role": "team_member",
        })
        assert r.status_code == 200, r.text
        m = r.json()
        pytest.member_id = m["id"]
        # patch permissions
        r = http.patch(f"{api_url}/team/{m['id']}", headers=headers,
                       json={"permissions": {"contacts": True, "events": False, "reminders": True,
                                             "invoices": False, "team": False}, "is_disabled": False})
        assert r.status_code == 200
        # reset password
        r = http.post(f"{api_url}/team/{m['id']}/reset-password", headers=headers,
                      json={"new_password": "NewTeam@2026"})
        assert r.status_code == 200

    def test_non_admin_cannot_create(self, http, api_url, user_headers):
        r = http.post(f"{api_url}/team", headers=user_headers, json={
            "email": f"TEST_nope_{uuid.uuid4().hex[:6]}@x.com",
            "full_name": "no", "password": "Pass@2026",
        })
        assert r.status_code == 403


# ---------- Debug + _id scrubbing ----------
class TestDebug:
    def test_debug_counts(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}"}
        r = http.get(f"{api_url}/debug/counts", headers=headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("profiles", "contacts", "events", "reminders", "invoices", "products",
                  "event_tags", "reminder_activity"):
            assert k in d

    def test_no_underscore_id_leaks(self, http, api_url, admin_ctx):
        headers = {"Authorization": f"Bearer {admin_ctx['token']}"}
        for path in ("/tags", "/contacts", "/events", "/reminders", "/products",
                     "/invoices", "/activity", "/team"):
            r = http.get(f"{api_url}{path}", headers=headers)
            assert r.status_code == 200, path
            body = r.json()
            if isinstance(body, list):
                for row in body:
                    assert "_id" not in row, f"_id leaked at {path}"
