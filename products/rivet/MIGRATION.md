# RIVET migration boundary

This directory is the GitHub source-of-truth snapshot for RIVET's move into the Systemia → Forge/Yard → Evercraft Compute release path.

The `base44/` directory and Base44 SDK calls are retained temporarily as a legacy compatibility adapter so current report, payment, auth and AliEV contracts are not broken during the move. Do not add new platform capabilities to Base44. New reusable infrastructure belongs in the Evercraft capability fabric and should be consumed through bounded contracts.

Release readiness still requires lint and type checks, the RIVET security gate, the RIVET/AliEV pipeline contract gate, production dependency audit and independent live-route verification before the release is described as working.

Brand migration is separated from backend/runtime extraction so visual changes cannot silently rewrite report-generation or payment authority.
