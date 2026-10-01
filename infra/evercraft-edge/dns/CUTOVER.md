# Domain cutover gate

A domain is not admitted to Evercraft Edge merely because Evercraft owns it, has a website on it, or can prove Search Console ownership.

Required evidence:
1. registrar/account ownership or equivalent control evidence;
2. observed parent-zone NS delegation;
3. reachable authoritative servers;
4. a fresh `_evercraft-control.<domain>` TXT mutation challenge created through the domain's current control surface;
5. independent observation of the exact nonce;
6. rollback plan and previous NS set captured.

Only then may Systemia mark the domain `edge_eligible`.

Migration is staged. First delegate a disposable canary subdomain to Evercraft nameservers and prove UDP/TCP DNS, authoritative behavior, snapshot consistency, TLS issuance, HTTP routing and rollback. Apex NS cutover is a later action and must preserve mail and verification records.
