import SwiftUI

private let ink = Color(red: 0.09, green: 0.16, blue: 0.22)
private let accent = Color(red: 0.03, green: 0.55, blue: 0.58)

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var scanner = BluetoothScanner()
    @StateObject private var store = SweepStore()
    @State private var zone: SweepZone = .jeep
    @State private var confirmReset = false

    var body: some View {
        TabView {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        header
                        caution
                        VStack(alignment: .leading, spacing: 12) {
                            Text("1. Choose where you are").font(.headline)
                            Picker("Scan location", selection: $zone) {
                                ForEach(SweepZone.allCases) { zone in
                                    Text(zone.rawValue).tag(zone)
                                }
                            }.pickerStyle(.segmented).disabled(scanner.isSampling)
                            Text(zone.subtitle).font(.subheadline).foregroundStyle(.secondary)
                            HStack(spacing: 8) {
                                Circle().fill(scanner.ready ? Color.green : Color.orange).frame(width: 8, height: 8)
                                Text(scanner.bluetoothStatus).font(.caption)
                            }
                            if scanner.isSampling, let start = scanner.startedAt {
                                TimelineView(.periodic(from: .now, by: 1)) { context in
                                    Text("Scanning for \(Int(context.date.timeIntervalSince(start))) seconds · \(scanner.found.count) devices")
                                        .font(.subheadline.monospacedDigit())
                                }
                            }
                            Button {
                                if scanner.isSampling {
                                    if let sample = scanner.stop() { store.record(sample) }
                                } else {
                                    scanner.start(zone: zone)
                                }
                            } label: {
                                Label(scanner.isSampling ? "Finish and save scan" : "Start BLE scan", systemImage: scanner.isSampling ? "stop.fill" : "waveform.path")
                                    .frame(maxWidth: .infinity).padding(.vertical, 6)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(scanner.isSampling ? ink : accent)
                            .disabled(!scanner.isSampling && !scanner.ready)
                            Text("Scan beside the Jeep for about 60 seconds, save it, then scan 50+ feet away without the vehicle or keys. Keep the app open; switching apps stops a scan.")
                                .font(.caption).foregroundStyle(.secondary)
                        }.padding(16).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                        sampleStatus
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Live nearby BLE devices").font(.headline)
                            if scanner.sortedDevices.isEmpty {
                                Text("Start a scan to see discoverable Bluetooth Low Energy devices. Some trackers will not appear.")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            } else {
                                ForEach(scanner.sortedDevices.prefix(30)) { record in
                                    DeviceRow(record: record)
                                    Divider()
                                }
                            }
                        }.padding(16).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                    }.padding()
                }
                .background(Color(.systemGroupedBackground))
                .navigationTitle("Vehicle Sentinel")
            }
            .tabItem { Label("Scan", systemImage: "dot.radiowaves.left.and.right") }

            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Compare the two scans").font(.title2.bold())
                        Text("These are nearby radio observations, not an identification of a tracker or proof someone is following you.")
                            .foregroundStyle(.secondary)
                        if store.nearSample == nil {
                            statusPanel("Start with a beside-Jeep scan", "Use the Scan tab while standing by the vehicle.")
                        } else if store.awaySample == nil {
                            statusPanel("Control scan needed", "Repeat the scan 50+ feet away without the vehicle or its keys.")
                        } else if !store.controlIsComparable {
                            statusPanel("Comparison unavailable", "Run both scans for 30+ seconds, in order and within 30 minutes. Scan beside Jeep first, then away without your keys. Both scans must capture BLE signals.")
                        } else {
                            let count = store.findings.filter(\.isWorthChecking).count
                            statusPanel("\(count) proximity signal\(count == 1 ? "" : "s") for manual review", "Even a stronger signal can come from the car's electronics, keys, phones or accessories. A negative scan cannot rule out trackers.")
                        }
                        ForEach(store.findings) { item in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Image(systemName: item.isWorthChecking ? "scope" : "waveform")
                                        .foregroundStyle(item.isWorthChecking ? accent : Color.secondary)
                                    Text(item.heading).font(.headline)
                                }
                                Text(item.record.name).font(.subheadline.bold())
                                Text(item.explanation).font(.subheadline).foregroundStyle(.secondary)
                                Text("ID \(item.record.shortID) · \(item.record.signalLabel) · \(item.record.samples) readings")
                                    .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Observations and notes").font(.headline)
                            TextEditor(text: Binding(get: { store.notes }, set: { store.setNotes($0) }))
                                .frame(minHeight: 110).scrollContentBackground(.hidden)
                                .padding(8).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
                            ShareLink(item: store.report) {
                                Label("Export observations", systemImage: "square.and.arrow.up")
                                    .frame(maxWidth: .infinity)
                            }.buttonStyle(.borderedProminent).tint(accent)
                            Button("Clear local observations", role: .destructive) { confirmReset = true }
                                .font(.footnote)
                        }
                    }.padding()
                }
                .navigationTitle("Review")
                .background(Color(.systemGroupedBackground))
                .confirmationDialog("Remove all saved scans, notes and checks on this phone?", isPresented: $confirmReset) {
                    Button("Delete local observations", role: .destructive) { store.clear() }
                }
            }
            .tabItem { Label("Review", systemImage: "doc.text.magnifyingglass") }

            NavigationStack {
                List {
                    Section {
                        Label("Open Find My → Items → Unknown Items Detected with You", systemImage: "location.magnifyingglass")
                        Text("Settings → Notifications → Tracking Notifications: enable alerts. Keep Bluetooth and Location Services on and Airplane Mode off.")
                            .font(.subheadline).foregroundStyle(.secondary)
                        Link("Apple's instructions for unwanted-tracker alerts", destination: URL(string: "https://support.apple.com/en-us/119874")!)
                    } header: { Text("Use iPhone's built-in tracker detection") }

                    Section("Visual Jeep check") {
                        ForEach(inspectionChecks, id: \.id) { check in
                            Button {
                                store.toggleCheck(check.id)
                            } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: store.completedChecks.contains(check.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(store.completedChecks.contains(check.id) ? accent : .secondary)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(check.name).foregroundStyle(.primary)
                                        Text(check.detail).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    Section("Know the limits") {
                        Text("Bluetooth scans cannot reliably identify AirTags. Apple tags change identifiers, and iOS hides hardware MAC addresses. Cellular/GPS trackers, OBD trackers and wired devices may be silent to this scan.")
                        Text("If you locate an unfamiliar device, photograph it and any labels before handling it. Avoid touching unfamiliar wiring. A trusted mechanic can inspect the vehicle safely.")
                        Text("If you feel threatened, go to a safe public location and contact local police or emergency services. Don't confront someone based on radio readings alone.")
                    }.font(.subheadline)
                }
                .navigationTitle("Vehicle check")
            }
            .tabItem { Label("Check", systemImage: "checklist") }
        }
        .tint(accent)
        .onChange(of: scenePhase) { _, phase in
            // Foreground-only behavior: stop and preserve any partial scan rather
            // than implying that recording continues when the app is backgrounded.
            if phase != .active && scanner.isSampling, let sample = scanner.stop() {
                store.record(sample)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("A calm, evidence-first check").font(.title2.bold()).foregroundStyle(ink)
            Text("Bluetooth signal sweep + vehicle checklist. All scan records stay on your device unless you export them.")
                .font(.subheadline).foregroundStyle(.secondary)
        }
    }

    private var caution: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "info.circle.fill").foregroundStyle(accent)
            Text("This cannot say whether someone is tracking you. For AirTags and compatible trackers, iPhone's built-in unwanted-tracking alerts are the primary check.")
                .font(.subheadline)
        }.padding(12).background(accent.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
    }

    private var sampleStatus: some View {
        HStack(spacing: 12) {
            samplePill(title: "Beside Jeep", sample: store.nearSample)
            samplePill(title: "Control (away)", sample: store.awaySample)
        }
    }

    private func samplePill(title: String, sample: SweepSample?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.bold())
            Text(sample == nil ? "Not saved" : "\(sample!.records.count) devices saved")
                .font(.caption).foregroundStyle(sample == nil ? Color.secondary : accent)
        }.frame(maxWidth: .infinity, alignment: .leading)
            .padding(12).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func statusPanel(_ title: String, _ message: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            Text(message).font(.subheadline).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading)
            .padding(15).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
}

private struct DeviceRow: View {
    let record: BeaconRecord
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(record.name).font(.subheadline.bold())
                Text("ID \(record.shortID) · \(record.samples) readings")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(Int(record.averageRSSI.rounded())) dBm")
                .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
        }
    }
}

private struct InspectionCheck {
    let id: String
    let name: String
    let detail: String
}

private let inspectionChecks: [InspectionCheck] = [
    .init(id: "interior", name: "Interior and storage", detail: "Under seats, seat pockets, center console, glovebox and cargo area"),
    .init(id: "trunk", name: "Rear cargo and spare tire", detail: "Check accessible compartments and the spare-tire area"),
    .init(id: "obd", name: "OBD-II diagnostic port", detail: "Look for an unfamiliar plug or adapter below the dashboard"),
    .init(id: "exterior", name: "Visible exterior attachments", detail: "Look around wheel wells, bumpers and accessible magnetic mounting spots"),
    .init(id: "wiring", name: "Unknown wiring or modules", detail: "Have a mechanic inspect anything wired into power; do not pull wires"),
    .init(id: "alerts", name: "Review iPhone unwanted-tracker alerts", detail: "Check Find My → Items and any tracking notifications"),
    .init(id: "professional", name: "Professional inspection if concern remains", detail: "Mechanic can inspect underbody and concealed wired devices safely")
]