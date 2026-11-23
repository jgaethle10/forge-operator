# Evercraft Demand Desk

Run `node sites/demand-desk/server.mjs` on an Evercraft-owned host with Node.js 22 or newer. Open `http://127.0.0.1:8797/` on that host. The service binds to IPv4 loopback and accepts the literal loopback host. Use it on a trusted, single-operator machine. Private access from other devices requires an authenticated Evercraft access route and explicit origin configuration.

The default state directory is `evercraft/demand-desk` under the host's XDG state directory. Set `EVERCRAFT_DEMAND_DESK_STATE` to an absolute path to override it, or `EVERCRAFT_DEMAND_DESK_PORT` to override the port. Run one service instance per state directory. Browser-only users can migrate their data with **Export workspace** followed by **Import workspace** at the owned origin.

Systemia can poll `GET /api/systemia/queue` on the same host and use the revision to detect a changed workspace. The queue contains ranked actions and no message contents. This service provides the feed. Registering a recurring Systemia consumer is a separate host operation. `GET /health` reports the local service revision.

The desk records outreach and replies entered by its operator. It has no delivery integration.
