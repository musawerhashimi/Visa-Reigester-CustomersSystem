"""The one place the branch visibility rule is written down.

Every MIS list that holds branch-partitioned work runs its queryset through
`scope_to_branch`, so the rule cannot drift between modules.
"""


def sees_all_branches(user):
    """True when this user's own branch is the general one.

    Access follows the branch a user is attached to, not their role: a visa
    officer in the general branch sees everything, an admin posted to a single
    branch does not. Customers never reach these lists at all.
    """
    if not user.is_authenticated or user.is_customer:
        return False
    branch = user.branch
    return branch is not None and branch.is_general


def scope_to_branch(queryset, user, field="branch"):
    """Narrow `queryset` to the user's branch unless they see all of them.

    `field` is the lookup reaching the branch from this model, so related rows
    pass something like "application__branch".
    """
    if sees_all_branches(user):
        return queryset
    if user.branch_id is None:
        # Staff with no branch yet would otherwise see the whole system.
        return queryset.none()
    return queryset.filter(**{field: user.branch_id})


def office_email(application):
    """The inbox that should hear about this application.

    Resolved in the order the office can actually change things:

    1. The branch handling it — that is the office that will act on it.
    2. The company address set in the MIS, editable by staff at any time.
    3. COMPANY_NOTIFICATION_EMAIL from the environment, as a deployment-level
       fallback for an install where nobody has filled the MIS in yet.

    The environment deliberately comes last. It can only be changed by
    redeploying, so letting it win would make the address in Settings look
    editable while silently having no effect.
    """
    from django.conf import settings

    branch_email = getattr(application.branch, "email", "") or ""
    if branch_email:
        return branch_email

    from cms.models import CompanyInfo

    company = CompanyInfo.load().email or ""
    if company:
        return company

    return getattr(settings, "COMPANY_NOTIFICATION_EMAIL", "") or ""
