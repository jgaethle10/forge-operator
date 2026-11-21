import Foundation
import CoreBluetooth
import Combine

final class BluetoothScanner: NSObject, ObservableObject, CBCentralManagerDelegate {
    @Published private(set) var bluetoothStatus = "Initializing Bluetooth…"
    @Published private(set) var isSampling = false
    @Published private(set) var found: [String: BeaconRecord] = [:]
    @Published private(set) var startedAt: Date?
    @Published private(set) var currentZone: SweepZone = .jeep

    private var central: CBCentralManager!

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    var ready: Bool { central.state == .poweredOn }
    var sortedDevices: [BeaconRecord] { found.values.sorted { $0.averageRSSI > $1.averageRSSI } }

    func start(zone: SweepZone) {
        guard ready, !isSampling else { return }
        currentZone = zone
        found.removeAll()
        startedAt = Date()
        isSampling = true
        bluetoothStatus = "Scanning nearby Bluetooth Low Energy signals…"
        central.scanForPeripherals(withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
    }

    func stop() -> SweepSample? {
        guard isSampling, let startedAt else { return nil }
        central.stopScan()
        isSampling = false
        bluetoothStatus = "Scan stopped. You can now review the saved observations."
        let sample = SweepSample(zone: currentZone, startedAt: startedAt,
            endedAt: Date(), records: sortedDevices)
        self.startedAt = nil
        return sample
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn: bluetoothStatus = "Bluetooth is ready"
        case .poweredOff: bluetoothStatus = "Turn Bluetooth on in Settings"
        case .unauthorized: bluetoothStatus = "Bluetooth permission denied. Enable Jeep Sentinel in Settings."
        case .unsupported: bluetoothStatus = "Bluetooth scanning is unavailable on this device"
        case .resetting: bluetoothStatus = "Bluetooth is resetting"
        case .unknown: bluetoothStatus = "Waiting for Bluetooth"
        @unknown default: bluetoothStatus = "Bluetooth unavailable"
        }
        if central.state != .poweredOn, isSampling {
            central.stopScan()
            isSampling = false
            startedAt = nil
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard isSampling else { return }
        let rssi = RSSI.intValue
        guard rssi < 0, rssi > -127 else { return }
        let id = peripheral.identifier.uuidString
        // iOS supplies an app-scoped identifier, NOT a hardware MAC address.
        let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let name = advertisedName ?? peripheral.name ?? "Unnamed BLE device"
        let hasData = advertisementData[CBAdvertisementDataManufacturerDataKey] != nil
        if var current = found[id] {
            current.add(name: name, rssi: rssi, hasManufacturerData: hasData)
            found[id] = current
        } else if found.count < 400 {
            found[id] = BeaconRecord(id: id, name: name, rssi: rssi, hasManufacturerData: hasData)
        }
    }
}