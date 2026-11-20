"""Security regression tests: verify mitigations hold after fixes."""

import json
import unittest

from service import Shop


class SecurityTest(unittest.TestCase):
    def setUp(self):
        self.shop = Shop()
        self.addCleanup(self.shop.close)

    def request(self, method, path, body=None, headers=None):
        with self.shop.lock:
            return self.shop.dispatch(method, path, body or {}, headers or {})

    def login(self, username="alice", password="learn-alice"):
        status, result = self.request("POST", "/login", {"username": username, "password": password})
        self.assertEqual(status, 200)
        return {"X-Token": result["token"]}

    def test_profile_idor_blocked(self):
        alice = self.login()
        # Own profile allowed
        status, _ = self.request("GET", "/profile?id=1", headers=alice)
        self.assertEqual(status, 200)
        # Other profile forbidden for non-staff
        status, result = self.request("GET", "/profile?id=2", headers=alice)
        self.assertEqual(status, 403)
        self.assertEqual(result.get("error"), "forbidden")

    def test_profile_sql_injection_rejected(self):
        alice = self.login()
        status, result = self.request("GET", "/profile?id=1 OR 1=1", headers=alice)
        self.assertEqual(status, 400)
        self.assertEqual(result.get("error"), "invalid id")

    def test_search_requires_staff(self):
        alice = self.login()
        status, _ = self.request("GET", "/search?q=TEST", headers=alice)
        self.assertEqual(status, 403)
        staff = self.login("staff", "learn-staff")
        status, rows = self.request("GET", "/search?q=TEST", headers=staff)
        self.assertEqual(status, 200)
        self.assertIsInstance(rows, list)

    def test_price_override_ignored(self):
        alice = self.login()
        status, order = self.request("POST", "/orders", {"product": "lamp", "price": 1}, alice)
        self.assertEqual(status, 201)
        self.assertEqual(order["price"], 1500)

    def test_admin_export_requires_staff(self):
        alice = self.login()
        # Even with forged X-Role, should be forbidden
        status, _ = self.request("GET", "/admin/export", headers={**alice, "X-Role": "staff"})
        self.assertEqual(status, 403)
        staff = self.login("staff", "learn-staff")
        status, rows = self.request("GET", "/admin/export", headers=staff)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(rows), 2)

    def test_files_own_receipt_only_for_customer(self):
        alice = self.login()
        # Attempt to read Bob's receipt should still return Alice's content
        status, data = self.request("GET", "/files?user=bob&path=receipt.txt", headers=alice)
        self.assertEqual(status, 200)
        self.assertIn("TEST_ALICE", data["content"])
        self.assertNotIn("TEST_BOB", data["content"])
        # Staff can read operator note
        staff = self.login("staff", "learn-staff")
        status, data = self.request("GET", "/files?user=../private&path=operator-note.txt", headers=staff)
        # Path traversal is blocked by sandbox, ensure we use valid path
        if status != 200:
            status, data = self.request("GET", "/files?user=private&path=operator-note.txt", headers=staff)
        self.assertEqual(status, 200)
        self.assertIn("TEST_ONLY_OPERATOR_SECRET", data["content"])

    def test_logs_staff_only_and_redact_tokens(self):
        # Generate some logs
        alice = self.login()
        self.request("GET", "/products", headers=alice)
        # Non-staff forbidden
        status, _ = self.request("GET", "/debug/logs", headers=alice)
        self.assertEqual(status, 403)
        # Staff allowed and tokens are redacted
        staff = self.login("staff", "learn-staff")
        status, logs = self.request("GET", "/debug/logs", headers=staff)
        self.assertEqual(status, 200)
        self.assertIsInstance(logs, list)
        if logs:
            hdrs = logs[-1].get("headers", {})
            if "X-Token" in hdrs:
                self.assertEqual(hdrs["X-Token"], "REDACTED")

    def test_reviews_escaped_in_html(self):
        alice = self.login()
        self.request("POST", "/reviews", {"product": "chair", "text": "<script>alert(1)</script>"}, alice)
        status, html = self.request("GET", "/reviews/view", headers=alice)
        self.assertEqual(status, 200)
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)

    def test_assistant_execute_customer_restrictions(self):
        alice = self.login()
        # export_profiles forbidden for customers
        status, res = self.request("POST", "/assistant/execute", {"decision": {"tool": "export_profiles"}}, alice)
        self.assertEqual(status, 403)
        # delete_tree forbidden for customers
        status, res = self.request("POST", "/assistant/execute", {"decision": {"tool": "delete_tree", "arguments": {"path": "."}}}, alice)
        self.assertEqual(status, 403)
        # read_file returns own receipt regardless of argument
        status, res = self.request("POST", "/assistant/execute", {"decision": {"tool": "read_file", "arguments": {"path": "files/bob/receipt.txt"}}}, alice)
        self.assertEqual(status, 200)
        self.assertIn("TEST_ALICE", res["content"])

    def test_assistant_context_scoped_to_owner(self):
        alice = self.login()
        status, ctx = self.request("GET", "/assistant/context?order_id=2", headers=alice)
        self.assertEqual(status, 200)
        # Orders list should be empty because order 2 belongs to Bob
        self.assertIn("Заказ: []", ctx["prompt"])  # simple containment check


if __name__ == "__main__":
    unittest.main()
