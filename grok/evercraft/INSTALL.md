# Install Evercraft in Grok Build

Evercraft publishes a read-only Grok marketplace directly from this repository.

## Add the marketplace

```bash
grok plugin marketplace add jgaethle10/forge-operator
```

## Install the Evercraft plugin

```bash
grok plugin install evercraft --trust
```

The installed plugin connects to:

`https://findmypart.base44.app/functions/evercraftCapabilityDiscoveryMcp`

This connector is deliberately read-only. It can match user problems to current public Evercraft capabilities and return public interoperability information, but it cannot create checkout, charges, subscriptions, entitlements, purchases, outreach, or publication.

Evercraft Machine Commerce is a separate MCP surface for hosts and workflows whose policies permit human-confirmed digital-service commerce.
