"""Permission slugs and the default set each role carries.

Roles are a convenience over these slugs, never a replacement: every access
check in the MIS asks about a slug, so a company can widen or narrow one
person's access without inventing a new role.
"""

CUSTOMERS_VIEW = "customers.view"
CUSTOMERS_CREATE = "customers.create"
CUSTOMERS_EDIT = "customers.edit"
CUSTOMERS_DELETE = "customers.delete"

APPLICATIONS_VIEW = "applications.view"
APPLICATIONS_VIEW_ASSIGNED = "applications.view_assigned"
APPLICATIONS_CREATE = "applications.create"
APPLICATIONS_EDIT = "applications.edit"
APPLICATIONS_ASSIGN = "applications.assign"
APPLICATIONS_VERIFY = "applications.verify"
APPLICATIONS_APPROVE = "applications.approve"

DOCUMENTS_VIEW = "documents.view"
DOCUMENTS_VERIFY = "documents.verify"
DOCUMENTS_REJECT = "documents.reject"
DOCUMENTS_REQUEST = "documents.request"

EMAILS_SEND = "emails.send"
EMAILS_TEMPLATES_MANAGE = "emails.templates.manage"

PAYMENTS_VIEW = "payments.view"
PAYMENTS_MANAGE = "payments.manage"
RECEIPTS_GENERATE = "receipts.generate"

REPORTS_VIEW = "reports.view"
REPORTS_EXPORT = "reports.export"

CMS_PAGES_MANAGE = "cms.pages.manage"
CMS_NEWS_MANAGE = "cms.news.manage"
CMS_EVENTS_MANAGE = "cms.events.manage"
CMS_ACTIVITIES_MANAGE = "cms.activities.manage"
CMS_SERVICES_MANAGE = "cms.services.manage"
CMS_GALLERY_MANAGE = "cms.gallery.manage"
CMS_CONTACT_MANAGE = "cms.contact.manage"

VISAS_MANAGE = "visas.manage"

USERS_VIEW = "users.view"
USERS_CREATE = "users.create"
USERS_EDIT = "users.edit"
USERS_DELETE = "users.delete"

AUDIT_VIEW = "audit.view"

ALL_PERMISSIONS = frozenset(
    value
    for name, value in list(globals().items())
    if name.isupper() and name != "ALL_PERMISSIONS" and isinstance(value, str)
)

_CMS_PERMISSIONS = frozenset(
    {
        CMS_PAGES_MANAGE,
        CMS_NEWS_MANAGE,
        CMS_EVENTS_MANAGE,
        CMS_ACTIVITIES_MANAGE,
        CMS_SERVICES_MANAGE,
        CMS_GALLERY_MANAGE,
        CMS_CONTACT_MANAGE,
    }
)

# A CMS manager edits the public site and, per the spec, sees no customer or
# application data unless an admin grants it explicitly.
_ROLE_PERMISSIONS = {
    "super_admin": ALL_PERMISSIONS,
    # An admin runs the business; only removing people is held back.
    "admin": ALL_PERMISSIONS - {USERS_DELETE},
    "visa_officer": frozenset(
        {
            CUSTOMERS_VIEW,
            APPLICATIONS_VIEW_ASSIGNED,
            APPLICATIONS_EDIT,
            # Verifying and deciding are separately permissioned, so an
            # individual officer can have either revoked without inventing
            # a new role.
            APPLICATIONS_VERIFY,
            APPLICATIONS_APPROVE,
            DOCUMENTS_VIEW,
            DOCUMENTS_VERIFY,
            DOCUMENTS_REJECT,
            DOCUMENTS_REQUEST,
            EMAILS_SEND,
            PAYMENTS_VIEW,
        }
    ),
    "cms_manager": _CMS_PERMISSIONS | {VISAS_MANAGE},
    "customer": frozenset(),
}


def permissions_for_role(role):
    return set(_ROLE_PERMISSIONS.get(role, frozenset()))
