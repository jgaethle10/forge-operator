# Vehicle Sentinel · beta release gate

## Product value proposition
**Free tier:** Private, guided inspection journal (browser QuickCheck) with export. No device scanning. 
**Future native feature:** Supplementary BLE radio-proximity observations with a clearly stated confidence and known blind spots. Avoid false claims of tracker identification.
**Potential paid lane, NOT LIVE:** Expert-assisted physical vehicle inspections through vetted, insured partners; only charge when such a service, consent, fulfillment, price and refund process are genuinely operational. Explore optional paid evidence-management features after validated demand, not paid safety promises.

## Field test matrix (human evidence required)

| Test | Acceptable behavior | Completed? |
| --- | --- | --- |
| Apple Find My alert guidance | Matches current Apple directions | Reviewed against Apple Support, requires device UX check |
| BLE permissions denied | Scanner does not proceed | Source review only |
| Bluetooth disabled | Scan stopped and state explained | Source review only |
| Phone backgrounded midscan | End incomplete scan, no continuous monitoring claim | Source patched, hardware test pending |
| 30-second near and away samples | Only valid session qualifies for comparison | Unit tested |
| Old/reversed/short/empty control | No flagged proximity findings | Unit tested |
| BLE accessories (watch, buds, dashboard) | No tracker diagnosis | Hardware test pending |
| AirTag in vehicle | Built-in Apple alert and limitations explained | Hardware test pending; do not promise direct detection |
| Cellular/OBD tracker | Explicitly not detectable by BLE alone | Content verified, physical inspection needed |
| Local storage unavailable | Export warning given | Browser runtime test pending |
| Deletion/export on iPhone | User can export, clear and verify | Device test pending |
| App Store listing review | No claims beyond validated behavior | Not started |

## Stop-ship conditions
Any copy saying “detects all tracking devices,” “finds AirTags,” “you are safe,” “untraceable,” “24/7 monitoring,” “automatically detects stalkers,” or “proof somebody is tracking you” is prohibited absent extraordinary independently reproducible proof; this version has none. No paid checkout should suggest that these unproven functions work.

## Distribution plan
1. Keep this v0.2 as a private preview; solicit opt-in beta testers.
2. Validate physical scans on iPhone, false positives and operational safety.
3. Publish free QuickCheck only on Evercraft-controlled domain/hosting with reviewed privacy details and support channel.
4. After validation, offer signed iOS beta build through Apple's supported channel.
5. Integrate Evercraft Payments only for specific delivered capabilities, with receipts/refunds/support ready. Public launch follows validation, not before.