from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Page size the MIS lists can override, capped so exports go via reports."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200
