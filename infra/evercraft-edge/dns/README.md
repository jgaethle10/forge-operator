# Authoritative DNS plane

Evercraft Edge DNS is authoritative-only in the initial release. It is not an open recursive resolver.

The control plane stores structured zones. The zone compiler emits standards-compatible zone material for authoritative nodes. Publication is serial-based, atomic and reversible.

Baseline:
- UDP and TCP DNS
- SOA/NS/A/AAAA/CNAME/TXT/MX/CAA/SRV
- negative answers and authoritative flags
- AXFR/IXFR design compatibility
- DNSSEC-ready signing pipeline
- DNS NOTIFY-ready replication
- independent external canaries

TLS is handled separately through ACME automation. DNS-01 challenge records are created through the same audited zone mutation path.

Promotion rule: a zone or route is not called live until an external probe can resolve it through the delegated authoritative chain.
