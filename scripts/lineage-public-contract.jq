# Lineage public-surface contract. Parentheses keep contains() scoped to
# .authority_rule rather than piping the entire boolean result to contains().
.public_id == "lineage-founding-pilot-v1" and
.commercial_state == "verification_required" and
.machine_state == "human_handoff_ready" and
.public_url == $url and
.entry_paid_offer.price_usd == 500 and
((.authority_rule // "") | contains("Checkout creation is not proof of payment"))
