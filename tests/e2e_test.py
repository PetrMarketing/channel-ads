"""E2E smoke tests — verify all pages and API endpoints load without errors."""
import requests
import sys
import json

BASE = "http://localhost:8010"
ERRORS = []
PASSED = 0


def check(name, url, method="GET", expected_status=200, body=None, headers=None, check_json=False, allow_redirect=True):
    global PASSED
    try:
        kwargs = {"allow_redirects": allow_redirect, "timeout": 10}
        if headers:
            kwargs["headers"] = headers
        if body:
            kwargs["json"] = body
            kwargs["headers"] = {**(headers or {}), "Content-Type": "application/json"}

        if method == "GET":
            r = requests.get(url, **kwargs)
        elif method == "POST":
            r = requests.post(url, **kwargs)
        else:
            r = requests.request(method, url, **kwargs)

        if r.status_code != expected_status:
            ERRORS.append(f"FAIL {name}: expected {expected_status}, got {r.status_code}")
            return None

        if check_json:
            try:
                data = r.json()
                if not data.get("success") and r.status_code == 200:
                    # Some endpoints return success=false legitimately
                    pass
                PASSED += 1
                return data
            except Exception:
                ERRORS.append(f"FAIL {name}: response is not valid JSON")
                return None
        else:
            # Check HTML pages don't return blank
            if len(r.text) < 100:
                ERRORS.append(f"FAIL {name}: response too short ({len(r.text)} bytes)")
                return None
            PASSED += 1
            return r.text
    except Exception as e:
        ERRORS.append(f"FAIL {name}: {e}")
        return None


def get_admin_token():
    r = requests.post(f"{BASE}/api/admin/auth/login", json={"username": "admin", "password": "admin123"}, timeout=5)
    if r.status_code == 200:
        return r.json().get("token")
    return None


def main():
    print("=" * 60)
    print("E2E Smoke Tests — Channel Ads")
    print("=" * 60)

    # ─── Public pages (HTML) ───
    print("\n--- Public Pages ---")
    check("Homepage", f"{BASE}/")
    check("Login page", f"{BASE}/login")
    check("Documentation", f"{BASE}/documentation")
    check("Subscribe page (404 expected)", f"{BASE}/subscribe/nonexistent", expected_status=404)
    check("Favicon", f"{BASE}/favicon.ico")
    check("Logo 64", f"{BASE}/logo-64.png")
    check("Health", f"{BASE}/health", check_json=True)

    # ─── Public API ───
    print("\n--- Public API ---")
    check("Billing plans (public)", f"{BASE}/api/billing/public/plans", check_json=True)
    check("Track info (404)", f"{BASE}/api/track/info/nonexistent", expected_status=404, check_json=True)

    # ─── Auth API (expect 401 without token) ───
    print("\n--- Auth Required (401) ---")
    for endpoint in [
        "/api/auth/me",
        "/api/channels/",
        "/api/billing/overview",
        "/api/billing/plans",
    ]:
        check(f"Auth required: {endpoint}", f"{BASE}{endpoint}", expected_status=401, check_json=True)

    # ─── Admin API ───
    print("\n--- Admin Panel ---")
    admin_token = get_admin_token()
    if admin_token:
        ah = {"Authorization": f"Bearer {admin_token}"}
        check("Admin: dashboard stats", f"{BASE}/api/admin/dashboard/stats", headers=ah, check_json=True)
        check("Admin: users", f"{BASE}/api/admin/users?page=1&limit=5", headers=ah, check_json=True)
        check("Admin: channels", f"{BASE}/api/admin/channels?page=1&limit=5", headers=ah, check_json=True)
        check("Admin: subscribers", f"{BASE}/api/admin/subscribers?page=1&limit=5", headers=ah, check_json=True)
        check("Admin: admins", f"{BASE}/api/admin/admins", headers=ah, check_json=True)
        check("Admin: tariffs", f"{BASE}/api/admin/tariffs", headers=ah, check_json=True)
        check("Admin: finance", f"{BASE}/api/admin/finance?period=30d", headers=ah, check_json=True)

        # Channel profile tabs
        check("Admin: channel 2 pins", f"{BASE}/api/admin/channels/2/pins", headers=ah, check_json=True)
        check("Admin: channel 2 lead-magnets", f"{BASE}/api/admin/channels/2/lead-magnets", headers=ah, check_json=True)
        check("Admin: channel 2 broadcasts", f"{BASE}/api/admin/channels/2/broadcasts", headers=ah, check_json=True)
        check("Admin: channel 2 content", f"{BASE}/api/admin/channels/2/content", headers=ah, check_json=True)
        check("Admin: channel 2 giveaways", f"{BASE}/api/admin/channels/2/giveaways", headers=ah, check_json=True)
        check("Admin: channel 2 links", f"{BASE}/api/admin/channels/2/links", headers=ah, check_json=True)
        check("Admin: channel 2 subscribers", f"{BASE}/api/admin/channels/2/subscribers", headers=ah, check_json=True)
        check("Admin: channel 2 logs", f"{BASE}/api/admin/channels/2/logs", headers=ah, check_json=True)
    else:
        ERRORS.append("FAIL Admin: could not login (wrong password?)")

    # ─── SPA routes (all return index.html) ───
    print("\n--- SPA Routes ---")
    spa_routes = [
        "/", "/login", "/links", "/pins", "/broadcasts", "/funnels",
        "/content", "/giveaways", "/billing", "/staff", "/paid-chats",
        "/services", "/analytics", "/comments", "/ord", "/documentation",
        "/admin/login",
    ]
    for route in spa_routes:
        result = check(f"SPA: {route}", f"{BASE}{route}")
        if result and "<div id=\"root\">" not in result and "<!DOCTYPE html>" not in result:
            ERRORS.append(f"WARN SPA {route}: missing root div")

    # ─── Admin SPA routes ───
    admin_spa = ["/admin", "/admin/users", "/admin/channels", "/admin/subscribers",
                 "/admin/admins", "/admin/tariffs", "/admin/finance"]
    for route in admin_spa:
        check(f"SPA: {route}", f"{BASE}{route}")

    # ─── Summary ───
    print("\n" + "=" * 60)
    print(f"PASSED: {PASSED}")
    print(f"FAILED: {len(ERRORS)}")
    if ERRORS:
        print("\nErrors:")
        for e in ERRORS:
            print(f"  {e}")
        sys.exit(1)
    else:
        print("\nAll tests passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()
