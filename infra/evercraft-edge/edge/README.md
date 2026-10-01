# Evercraft Edge HTTP front door

The public hostname is an alias. The permanent identity is the `evercraft://` service URI.

The router accepts a Host header only when that host is uniquely registered to a service. It forwards only to an endpoint currently marked healthy. Unknown hosts return 404; registered services without a healthy endpoint return 503 rather than silently falling through.

TLS termination sits in front of this router. SNI/hostname selection must use the same canonical front-door registry. ACME certificate automation may request only DNS-01 records scoped to an already-authorized hostname.

No public hostname is populated merely because it looks desirable. Public root-domain control must be independently verified first.
