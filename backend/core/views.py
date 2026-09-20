from pathlib import PurePosixPath

from django.conf import settings
from django.http import Http404
from django.views.static import serve


#: Media folders holding content the public site displays: CMS imagery and
#: the company logo. Everything else under MEDIA_ROOT — customer documents,
#: receipts, official letters, email attachments — is private and reachable
#: only through the permission-checked download views.
PUBLIC_MEDIA_DIRS = frozenset(
    {
        "activities",
        "banners",
        "company",
        "events",
        "gallery",
        "news",
        "services",
        "team",
        "testimonials",
        "visas",
    }
)


def public_media(request, path):
    """Serve CMS imagery in production.

    Django's own media serving is DEBUG-only, but the public site links
    straight at /media/ for logos, banners and visa photographs, so without
    this they 404 once DEBUG is off.

    Only the folders above are served. A request for anything else — most of
    all `documents/` — is refused rather than handed over, so a guessed URL
    cannot reach a customer's passport.
    """
    top = PurePosixPath(path).parts[0] if path else ""
    if top not in PUBLIC_MEDIA_DIRS:
        raise Http404("Not found.")

    return serve(request, path, document_root=settings.MEDIA_ROOT)
