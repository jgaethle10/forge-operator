import Foundation

enum SweepZone: String, Codable, CaseIterable, Identifiable {
    case jeep = "Beside Jeep"
    case away = "Away from Jeep"

    var id: String { rawValue }
    var subtitle: String {
        switch self {
        case .jeep: return "Stand by the Jeep with the engine off."
        case .away: return "Move at least 50 feet away, without the Jeep or its keys."
        }
    }
}

struct BeaconRecord: Identifiable, Codable, Equatable {
    let id: String
    var name: String
    var samples: Int
    var totalRSSI: Int
    var strongestRSSI: Int
    var lastSeen: Date
    var hasManufacturerData: Bool

    init(id: String, name: String, rssi: Int, hasManufacturerData: Bool, at date: Date = Date()) {
        self.id = id
        self.name = name
        self.samples = 1
        self.totalRSSI = rssi
        self.strongestRSSI = rssi
        self.lastSeen = date
        self.hasManufacturerData = hasManufacturerData
    }

    mutating func add(name: String, rssi: Int, hasManufacturerData: Bool, at date: Date = Date()) {
        if self.name == "Unnamed BLE device" && name != "Unnamed BLE device" { self.name = name }
        samples += 1
        totalRSSI += rssi
        strongestRSSI = max(strongestRSSI, rssi)
        lastSeen = date
        self.hasManufacturerData = self.hasManufacturerData || hasManufacturerData
    }

    var averageRSSI: Double { samples > 0 ? Double(totalRSSI) / Double(samples) : -127 }
    var signalLabel: String { "\(Int(averageRSSI.rounded())) dBm average" }
    var shortID: String { String(id.prefix(8)) }
}

struct SweepSample: Identifiable, Codable {
    let id: UUID
    let zone: SweepZone
    let startedAt: Date
    let endedAt: Date
    let records: [BeaconRecord]

    init(zone: SweepZone, startedAt: Date, endedAt: Date, records: [BeaconRecord]) {
        id = UUID()
        self.zone = zone
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.records = records
    }
}

struct ComparisonFinding: Identifiable {
    let id: String
    let record: BeaconRecord
    let heading: String
    let explanation: String
    let isWorthChecking: Bool
    let difference: Double?
}

enum SweepAnalyzer {
    // Two comparable samples must represent one continuous, deliberate session.
    // This is a validity check for a signal comparison, not a tracker classifier.
    static func controlIsComparable(near: SweepSample?, away: SweepSample?) -> Bool {
        guard let near, let away else { return false }
        let nearDuration = near.endedAt.timeIntervalSince(near.startedAt)
        let awayDuration = away.endedAt.timeIntervalSince(away.startedAt)
        let gap = away.startedAt.timeIntervalSince(near.endedAt)
        return near.zone == .jeep && away.zone == .away
            && nearDuration >= 30 && awayDuration >= 30
            && gap >= 0 && gap <= 1800
            && !near.records.isEmpty && !away.records.isEmpty
    }

    static func compare(near: SweepSample?, away: SweepSample?) -> [ComparisonFinding] {
        guard let near else { return [] }
        let comparable = controlIsComparable(near: near, away: away)
        let control = Dictionary(uniqueKeysWithValues: (comparable ? away?.records ?? [] : []).map { ($0.id, $0) })
        return near.records.map { record in
            guard comparable else {
                return ComparisonFinding(id: record.id, record: record,
                    heading: "Observation only · no valid control",
                    explanation: "Both scans need 30+ seconds, a nonempty set of signals, and to be completed in order within 30 minutes. This is not evidence of a tracker.",
                    isWorthChecking: false, difference: nil)
            }
            if let other = control[record.id] {
                let delta = record.averageRSSI - other.averageRSSI
                if record.samples >= 3 && other.samples >= 3 && delta >= 12 {
                    return ComparisonFinding(id: record.id, record: record,
                        heading: "Stronger beside Jeep",
                        explanation: "This same BLE identifier averaged \(Int(delta.rounded())) dB stronger beside the Jeep. That suggests proximity, not proof of a tracker.",
                        isWorthChecking: true, difference: delta)
                }
                return ComparisonFinding(id: record.id, record: record,
                    heading: "Seen in both locations",
                    explanation: "Signal comparison is inconclusive. Bluetooth readings fluctuate with distance, bodies and metal.",
                    isWorthChecking: false, difference: delta)
            }
            return ComparisonFinding(id: record.id, record: record,
                heading: "Seen only beside Jeep",
                explanation: "Not observed during the control scan. Could be ordinary electronics, an intermittent transmitter, or radio interference; not a tracker identification.",
                isWorthChecking: false, difference: nil)
        }.sorted { a, b in
            if a.isWorthChecking != b.isWorthChecking { return a.isWorthChecking }
            return a.record.averageRSSI > b.record.averageRSSI
        }
    }
}