# Fallen | Real Product Capture Bridge RC001

Mission: place authentic reviewed Evercraft product pixels into the existing Fallen production chain, replacing generic geometric stand-ins. This is internal source intake, not a new app, public screenshot service, finished advertisement, or release permission.

## Operation
1. Run the existing Evercraft Browser Worker in PUBLIC READ-ONLY mode on an owned public page using include_screenshot=true and include_screenshot_base64=true. Save the entire response JSON privately. A source repository is not proof of a deployed worker. Do not use authenticated handoff, cookies, arbitrary clicks, form posts, or third-party sites.
2. A person reviews the actual PNG at native resolution and phone scale, checks that it shows the correct product and no personal/private data, confirms usage rights, and copies the SHA-256. Code cannot make this aesthetic, privacy, or rights judgment itself.
3. Create a separate approval JSON with the exact schema below. Default booleans must remain false until a real human review. This is a template, not actual approval:

    {
      "schema":"evercraft.fallen.public-product-capture-approval.v1",
      "id":"earthworks-public-demo",
      "approvedOrigin":"https://fabric.systemiacommandcenters.com",
      "approvedPageUrl":"https://fabric.systemiacommandcenters.com/demos/earthworks-autonomy/",
      "reviewedScreenshotSha256":"<actual reviewed screenshot hash>",
      "approvedForInternalCreative":false,
      "personalOrPrivateContentAbsent":false,
      "rights":"owned",
      "reviewerId":"<actual reviewer>",
      "reviewedAt":"<actual ISO timestamp>",
      "productName":"EarthWorks Simulation",
      "viewerPromise":"Show the visible simulation without claiming real machines were controlled."
    }

4. After human review only, run with Node 22+ on Node002 or an authorized machine:

    node systemia/media-studio/public-product-capture.mjs /private/worker-result.json /private/approved-review.json /private/new-capture-output

The output path must not exist yet. Output: original PNG matching reviewed digest; a Fallen MediaProject JSON with a true SourceAsset; an internal review/lineage receipt. Never commit raw worker response or unreviewed imagery to GitHub.

## Boundaries
This importer checks read-only worker shape and integrity SHA, public URL limited to explicit HTTPS origin, HTTP 200, PNG digest/dimensions, review binding, and human-owned/licensed permission assertion. A worker hash is not a signature or independent source authenticity verification. Human review is not independently verified by the machine. A screenshot does not prove capabilities beyond its pixels. No payment, provider generation, authenticated browsing, or publication authority is granted.

Full-size and phone-size art direction, authentic moving footage, intentional cuts, product focus framing (PR #1447), cinematic action coverage (PR #1443), visual tournament, evidence/rights, sound finishing, human sign-off, and Clip distribution remain downstream gates.

Isolated native Node test: node --test systemia/media-studio/public-product-capture.test.mjs
Synthetic tests are not proof of a live product capture or marketing quality.
