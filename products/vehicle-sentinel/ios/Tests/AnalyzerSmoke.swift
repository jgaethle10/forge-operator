import Foundation

func record(_ id: String, _ values: [Int]) -> BeaconRecord {
    var result = BeaconRecord(id: id, name: "Demo accessory", rssi: values[0], hasManufacturerData: false)
    for value in values.dropFirst() { result.add(name: "Demo accessory", rssi: value, hasManufacturerData: false) }
    return result
}
func sample(_ zone: SweepZone, _ start: Date, duration: TimeInterval = 60, records: [BeaconRecord]) -> SweepSample {
    SweepSample(zone: zone, startedAt: start, endedAt: start.addingTimeInterval(duration), records: records)
}
@main struct SmokeCheck {
    static func main() {
        let base = Date(timeIntervalSince1970: 1_800_000_000)
        let near = sample(.jeep, base, records: [record("a", [-48, -50, -52]), record("b", [-71, -72, -70]), record("c", [-65, -66, -65])])
        let away = sample(.away, base.addingTimeInterval(120), records: [record("a", [-83, -82, -80]), record("b", [-70, -71, -72])])
        let findings = SweepAnalyzer.compare(near: near, away: away)
        precondition(SweepAnalyzer.controlIsComparable(near: near, away: away))
        precondition(findings.count == 3)
        precondition(findings.first?.id == "a")
        precondition(findings.first?.isWorthChecking == true)
        precondition(findings.first?.difference ?? 0 > 12)
        precondition(findings.first(where: { $0.id == "b" })?.isWorthChecking == false)
        precondition(findings.first(where: { $0.id == "c" })?.isWorthChecking == false, "single-location readings must not be flagged")
        // A good-looking signal is NOT enough if the scans happened too far apart.
        let stale = sample(.away, base.addingTimeInterval(7200), records: [record("a", [-90, -85, -86])])
        precondition(!SweepAnalyzer.controlIsComparable(near: near, away: stale))
        precondition(SweepAnalyzer.compare(near: near, away: stale).allSatisfy { !$0.isWorthChecking })
        let short = sample(.away, base.addingTimeInterval(120), duration: 4, records: [record("a", [-90, -85, -86])])
        precondition(!SweepAnalyzer.controlIsComparable(near: near, away: short))
        let empty = sample(.away, base.addingTimeInterval(120), records: [])
        precondition(!SweepAnalyzer.controlIsComparable(near: near, away: empty))
        let backwards = sample(.away, base.addingTimeInterval(-120), records: [record("a", [-90, -85, -86])])
        precondition(!SweepAnalyzer.controlIsComparable(near: near, away: backwards))
        precondition(SweepAnalyzer.compare(near: nil, away: away).isEmpty)
        print("PASS: proximity heuristic + invalid/stale/short/empty/reversed sessions are handled without false alerts")
    }
}