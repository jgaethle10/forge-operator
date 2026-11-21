import Foundation
import Combine

final class SweepStore: ObservableObject {
    @Published private(set) var nearSample: SweepSample?
    @Published private(set) var awaySample: SweepSample?
    @Published private(set) var notes: String = ""
    @Published private(set) var completedChecks: Set<String> = []

    private let storageKey = "jeep-sentinel-evidence-v1"

    private struct StoredEvidence: Codable {
        var near: SweepSample?
        var away: SweepSample?
        var notes: String
        var completedChecks: Set<String>
    }

    init() {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let value = try? JSONDecoder().decode(StoredEvidence.self, from: data) else { return }
        nearSample = value.near
        awaySample = value.away
        notes = value.notes
        completedChecks = value.completedChecks
    }

    func record(_ sample: SweepSample) {
        switch sample.zone {
        case .jeep:
            nearSample = sample
            awaySample = nil // Prevent comparing a new session with a previous control.
        case .away: awaySample = sample
        }
        persist()
    }

    func setNotes(_ text: String) { notes = text; persist() }
    func toggleCheck(_ id: String) {
        if completedChecks.contains(id) { completedChecks.remove(id) }
        else { completedChecks.insert(id) }
        persist()
    }
    func clear() {
        nearSample = nil
        awaySample = nil
        notes = ""
        completedChecks = []
        persist()
    }

    var findings: [ComparisonFinding] { SweepAnalyzer.compare(near: nearSample, away: awaySample) }
    var controlIsComparable: Bool { SweepAnalyzer.controlIsComparable(near: nearSample, away: awaySample) }

    var report: String {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .medium
        var lines: [String] = [
            "JEEP SENTINEL | USER OBSERVATIONS",
            "Exported: \(f.string(from: Date()))",
            "This report is not a tracker-detection verdict or forensic certification.",
            "No location coordinates were collected.", ""
        ]
        for sample in [nearSample, awaySample].compactMap({ $0 }) {
            lines.append("\(sample.zone.rawValue) | \(f.string(from: sample.startedAt)) to \(f.string(from: sample.endedAt))")
            for r in sample.records.sorted(by: { $0.averageRSSI > $1.averageRSSI }) {
                lines.append("  \(r.name) | app identifier \(r.id) | average \(Int(r.averageRSSI.rounded())) dBm | strongest \(r.strongestRSSI) dBm | \(r.samples) readings")
            }
            lines.append("")
        }
        lines.append("Signal comparison valid: \(controlIsComparable ? "Yes, preliminary only" : "No, insufficient or stale control")")
        lines.append("INTERPRETATION (NOT PROOF)")
        lines += findings.map { "\($0.record.name) (\($0.record.shortID)): \($0.heading). \($0.explanation)" }
        lines += ["", "MANUAL CHECKS", completedChecks.sorted().joined(separator: ", "), "", "NOTES", notes]
        return lines.joined(separator: "\n")
    }

    private func persist() {
        let value = StoredEvidence(near: nearSample, away: awaySample, notes: notes, completedChecks: completedChecks)
        if let data = try? JSONEncoder().encode(value) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }
}