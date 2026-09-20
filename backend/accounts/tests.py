"""Account administration, and the privilege boundaries around it."""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from audit.models import AuditLog
from customers.models import CustomerProfile

User = get_user_model()


class AccountAdministrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.super_admin = User.objects.create_user(
            email="super@acct.test",
            password="StrongPass2026!",
            role=User.Role.SUPER_ADMIN,
            first_name="Amina",
            last_name="Rahimi",
        )
        cls.admin = User.objects.create_user(
            email="admin@acct.test",
            password="StrongPass2026!",
            role=User.Role.ADMIN,
            first_name="Sara",
            last_name="Karim",
        )
        cls.officer = User.objects.create_user(
            email="officer@acct.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
        )
        cls.cms_manager = User.objects.create_user(
            email="cms@acct.test",
            password="StrongPass2026!",
            role=User.Role.CMS_MANAGER,
        )
        cls.customer_user = User.objects.create_user(
            email="customer@acct.test", password="StrongPass2026!"
        )
        CustomerProfile.objects.create(user=cls.customer_user)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    # --- listing ----------------------------------------------------------

    def test_admin_can_list_accounts(self):
        response = self.client_for(self.admin).get("/api/accounts/")

        self.assertEqual(response.status_code, 200)
        emails = {row["email"] for row in response.data["results"]}
        self.assertIn("officer@acct.test", emails)
        self.assertIn("super@acct.test", emails)

    def test_accounts_can_be_filtered_by_role(self):
        response = self.client_for(self.admin).get("/api/accounts/?role=visa_officer")

        roles = {row["role"] for row in response.data["results"]}
        self.assertEqual(roles, {"visa_officer"})

    def test_officer_cannot_list_accounts(self):
        response = self.client_for(self.officer).get("/api/accounts/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_customer_cannot_reach_account_administration(self):
        response = self.client_for(self.customer_user).get("/api/accounts/")
        self.assertEqual(response.status_code, 403)

    def test_listing_shows_effective_permissions(self):
        response = self.client_for(self.admin).get("/api/accounts/")

        officer = next(
            row for row in response.data["results"] if row["email"] == "officer@acct.test"
        )
        self.assertIn("documents.verify", officer["effective_permissions"])
        self.assertNotIn("users.create", officer["effective_permissions"])

    # --- creation ---------------------------------------------------------

    def test_admin_can_create_a_staff_account(self):
        response = self.client_for(self.admin).post(
            "/api/accounts/",
            {
                "email": "newofficer@acct.test",
                "first_name": "Omar",
                "last_name": "Yilmaz",
                "role": "visa_officer",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        created = User.objects.get(email="newofficer@acct.test")
        self.assertEqual(created.role, User.Role.VISA_OFFICER)

        # A password is generated and returned once so it can be handed over.
        self.assertIn("initial_password", response.data)
        self.assertTrue(created.check_password(response.data["initial_password"]))

    def test_created_account_can_sign_in_with_the_issued_password(self):
        response = self.client_for(self.admin).post(
            "/api/accounts/",
            {"email": "signin@acct.test", "role": "admin"},
            format="json",
        )
        password = response.data["initial_password"]

        login = APIClient().post(
            "/api/auth/login/",
            {"email": "signin@acct.test", "password": password},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_customer_accounts_cannot_be_created_here(self):
        """Customers arrive through public signup, which builds their profile."""
        response = self.client_for(self.admin).post(
            "/api/accounts/",
            {"email": "nope@acct.test", "role": "customer"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("role", response.data)

    def test_duplicate_email_is_rejected(self):
        response = self.client_for(self.admin).post(
            "/api/accounts/",
            {"email": "officer@acct.test", "role": "admin"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_weak_password_is_rejected(self):
        response = self.client_for(self.admin).post(
            "/api/accounts/",
            {"email": "weak@acct.test", "role": "admin", "password": "123"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_officer_cannot_create_accounts(self):
        response = self.client_for(self.officer).post(
            "/api/accounts/",
            {"email": "sneaky@acct.test", "role": "admin"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    # --- privilege boundaries --------------------------------------------

    def test_admin_cannot_create_a_super_admin(self):
        """Otherwise an admin could grant themselves unrestricted access."""
        response = self.client_for(self.admin).post(
            "/api/accounts/",
            {"email": "escalate@acct.test", "role": "super_admin"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(email="escalate@acct.test").exists())

    def test_admin_cannot_promote_someone_to_super_admin(self):
        response = self.client_for(self.admin).patch(
            f"/api/accounts/{self.officer.pk}/",
            {"role": "super_admin"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.officer.refresh_from_db()
        self.assertEqual(self.officer.role, User.Role.VISA_OFFICER)

    def test_admin_cannot_demote_a_super_admin(self):
        response = self.client_for(self.admin).patch(
            f"/api/accounts/{self.super_admin.pk}/",
            {"role": "visa_officer"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.super_admin.refresh_from_db()
        self.assertEqual(self.super_admin.role, User.Role.SUPER_ADMIN)

    def test_super_admin_can_create_another_super_admin(self):
        response = self.client_for(self.super_admin).post(
            "/api/accounts/",
            {"email": "second@acct.test", "role": "super_admin"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        created = User.objects.get(email="second@acct.test")
        self.assertTrue(created.is_superuser)

    def test_admin_cannot_reset_a_super_admins_password(self):
        response = self.client_for(self.admin).post(
            f"/api/accounts/{self.super_admin.pk}/set-password/", {}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_staff_role_cannot_become_a_customer_role(self):
        response = self.client_for(self.super_admin).patch(
            f"/api/accounts/{self.officer.pk}/",
            {"role": "customer"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    # --- editing ----------------------------------------------------------

    def test_role_change_updates_effective_permissions(self):
        response = self.client_for(self.super_admin).patch(
            f"/api/accounts/{self.officer.pk}/",
            {"role": "admin"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("reports.view", response.data["effective_permissions"])

    def test_extra_permission_widens_access_without_changing_role(self):
        response = self.client_for(self.super_admin).patch(
            f"/api/accounts/{self.officer.pk}/",
            {"extra_permissions": ["reports.view"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.officer.refresh_from_db()
        self.assertEqual(self.officer.role, User.Role.VISA_OFFICER)
        self.assertTrue(self.officer.has_perm_slug("reports.view"))

    def test_denied_permission_narrows_a_role(self):
        response = self.client_for(self.super_admin).patch(
            f"/api/accounts/{self.officer.pk}/",
            {"denied_permissions": ["documents.reject"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.officer.refresh_from_db()
        self.assertFalse(self.officer.has_perm_slug("documents.reject"))

    def test_unknown_permission_is_rejected(self):
        """A typo would sit in the record reading as granted access."""
        response = self.client_for(self.super_admin).patch(
            f"/api/accounts/{self.officer.pk}/",
            {"extra_permissions": ["reports.viwe"]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("extra_permissions", response.data)

    def test_role_promotion_grants_the_django_admin_flags(self):
        self.client_for(self.super_admin).patch(
            f"/api/accounts/{self.admin.pk}/", {"role": "super_admin"}, format="json"
        )

        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_superuser)
        self.assertTrue(self.admin.is_staff)

    def test_demotion_removes_the_django_admin_flags(self):
        promoted = User.objects.create_user(
            email="demote@acct.test",
            password="StrongPass2026!",
            role=User.Role.SUPER_ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        self.client_for(self.super_admin).patch(
            f"/api/accounts/{promoted.pk}/", {"role": "admin"}, format="json"
        )

        promoted.refresh_from_db()
        self.assertFalse(promoted.is_superuser)
        self.assertFalse(promoted.is_staff)

    # --- deactivation -----------------------------------------------------

    def test_delete_deactivates_rather_than_removing(self):
        """History references the actor; a hard delete would orphan it."""
        response = self.client_for(self.super_admin).delete(
            f"/api/accounts/{self.officer.pk}/"
        )

        self.assertEqual(response.status_code, 204)
        self.officer.refresh_from_db()
        self.assertFalse(self.officer.is_active)
        self.assertTrue(User.objects.filter(pk=self.officer.pk).exists())

    def test_cannot_deactivate_your_own_account(self):
        response = self.client_for(self.super_admin).delete(
            f"/api/accounts/{self.super_admin.pk}/"
        )

        self.assertEqual(response.status_code, 400)
        self.super_admin.refresh_from_db()
        self.assertTrue(self.super_admin.is_active)

    def test_deactivated_account_cannot_sign_in(self):
        self.client_for(self.super_admin).delete(f"/api/accounts/{self.officer.pk}/")

        login = APIClient().post(
            "/api/auth/login/",
            {"email": "officer@acct.test", "password": "StrongPass2026!"},
            format="json",
        )
        self.assertEqual(login.status_code, 401)

    def test_account_can_be_reactivated(self):
        self.client_for(self.super_admin).delete(f"/api/accounts/{self.officer.pk}/")
        response = self.client_for(self.super_admin).post(
            f"/api/accounts/{self.officer.pk}/activate/"
        )

        self.assertEqual(response.status_code, 200)
        self.officer.refresh_from_db()
        self.assertTrue(self.officer.is_active)

    # --- password reset ---------------------------------------------------

    def test_administrator_can_issue_a_new_password(self):
        response = self.client_for(self.super_admin).post(
            f"/api/accounts/{self.officer.pk}/set-password/", {}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        password = response.data["password"]
        self.assertGreaterEqual(len(password), 12)

        self.officer.refresh_from_db()
        self.assertTrue(self.officer.check_password(password))

    def test_issued_password_is_audited_without_recording_it(self):
        AuditLog.objects.all().delete()

        response = self.client_for(self.super_admin).post(
            f"/api/accounts/{self.officer.pk}/set-password/", {}, format="json"
        )
        password = response.data["password"]

        entry = AuditLog.objects.get(module="accounts", field_name="password")
        self.assertEqual(entry.actor, self.super_admin)
        # The password itself must never reach the log.
        self.assertNotIn(password, entry.new_value)
        self.assertNotIn(password, entry.description)

    # --- reference data ---------------------------------------------------

    def test_permission_catalogue_is_grouped_for_the_editor(self):
        response = self.client_for(self.admin).get("/api/accounts/permissions/")

        self.assertEqual(response.status_code, 200)
        groups = {group["name"] for group in response.data["groups"]}
        self.assertIn("applications", groups)
        self.assertIn("documents", groups)

        roles = {role["value"] for role in response.data["roles"]}
        self.assertIn("visa_officer", roles)

    def test_login_history_is_visible_to_administrators(self):
        APIClient().post(
            "/api/auth/login/",
            {"email": "officer@acct.test", "password": "StrongPass2026!"},
            format="json",
        )

        response = self.client_for(self.admin).get(
            f"/api/accounts/{self.officer.pk}/login-history/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data), 1)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class ForgotPasswordTests(TestCase):
    """Resetting a forgotten password by email."""

    def setUp(self):
        # The endpoint is rate limited, and DRF keeps the counter in the cache
        # between tests — without this, whichever test runs fourth is
        # throttled rather than exercised.
        from django.core.cache import cache

        cache.clear()

        self.user = User.objects.create_user(
            email="locked.out@test.local",
            password="OriginalPass2026!",
            first_name="Sara",
            last_name="Noori",
        )

    def ask(self, email):
        return self.client.post(
            "/api/auth/forgot-password/", {"email": email}, format="json"
        )

    def test_a_new_password_is_issued_and_emailed(self):
        from django.core import mail

        mail.outbox.clear()
        response = self.ask(self.user.email)
        self.assertEqual(response.status_code, 200)

        self.user.refresh_from_db()
        self.assertFalse(self.user.check_password("OriginalPass2026!"))

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("locked.out@test.local", mail.outbox[0].to)

    def test_the_emailed_password_actually_works(self):
        """A password the customer cannot sign in with is worse than none."""
        import re

        from django.core import mail

        mail.outbox.clear()
        self.ask(self.user.email)

        match = re.search(r"Temporary password: (\S+)", mail.outbox[0].body)
        self.assertIsNotNone(match)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(match.group(1)))

    def test_the_email_carries_a_link_to_sign_in(self):
        from django.core import mail

        mail.outbox.clear()
        self.ask(self.user.email)
        self.assertIn("/login", mail.outbox[0].body)

    def test_an_unknown_address_is_answered_the_same_way(self):
        """Otherwise this becomes a way to discover who holds an account."""
        from django.core import mail

        mail.outbox.clear()
        known = self.ask(self.user.email)

        mail.outbox.clear()
        unknown = self.ask("nobody@test.local")

        self.assertEqual(unknown.status_code, known.status_code)
        self.assertEqual(unknown.data["detail"], known.data["detail"])
        self.assertEqual(len(mail.outbox), 0)

    def test_an_inactive_account_is_not_reset(self):
        from django.core import mail

        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        mail.outbox.clear()
        self.assertEqual(self.ask(self.user.email).status_code, 200)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OriginalPass2026!"))
        self.assertEqual(len(mail.outbox), 0)

    def test_repeated_requests_are_throttled(self):
        """Each call changes a real password, so this cannot be spammed."""
        codes = [self.ask(self.user.email).status_code for _ in range(7)]
        self.assertIn(429, codes)

    def test_the_address_is_matched_regardless_of_case(self):
        from django.core import mail

        mail.outbox.clear()
        self.ask("Locked.Out@Test.Local")

        self.user.refresh_from_db()
        self.assertFalse(self.user.check_password("OriginalPass2026!"))
        self.assertEqual(len(mail.outbox), 1)
