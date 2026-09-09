import unittest

from backend.app import create_app, db


class ClinixApiTest(unittest.TestCase):
    def setUp(self):
        self.app = create_app(
            {"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"}
        )
        self.client = self.app.test_client()

    def test_health_endpoint(self):
        response = self.client.get("/api/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["status"], "ok")

    def test_demo_login_and_protected_dashboard(self):
        response = self.client.post(
            "/api/auth/login",
            json={"email": "demo@clinix.health", "password": "clinixdemo"},
        )
        self.assertEqual(response.status_code, 200)
        dashboard = self.client.get("/api/dashboard")
        self.assertEqual(dashboard.status_code, 200)
        self.assertIn("stats", dashboard.json)

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()


if __name__ == "__main__":
    unittest.main()