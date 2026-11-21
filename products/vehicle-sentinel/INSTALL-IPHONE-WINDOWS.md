# Vehicle Sentinel v0.2: HP Windows to iPhone private test

**Status:** Source-beta installation instructions. Vehicle Sentinel is **not** a proven hidden-tracker detector. The iPhone app observes some nearby Bluetooth Low Energy advertisements. A missing or present signal is not proof of whether anyone is tracking you.

## Hardware and accounts

- Existing HP Windows 11 laptop, USB data cable, and iPhone (iOS 17 or later).
- Access to the Evercraft GitHub repository's Actions workflow artifact.
- A free Apple Account can sign a personal test app. Apple Developer Program enrollment is **not** required for the personal sideloading route, but signed free-account apps generally need renewal after **7 days**.
- A trusted Windows sideloading tool. One documented option is Sideloadly: https://sideloadly.io/ (independent third party, **not** made or audited by Evercraft). Carefully review the vendor and its handling of Apple Account authentication before proceeding. A separate Apple Account may reduce exposure; never send us credentials or two-factor codes.

## Get the build

1. In GitHub, open the run for the workflow `Vehicle Sentinel beta verification` on branch `feat/vehicle-sentinel-quickcheck-v0-2`.
2. Confirm the `Review-only iOS simulator build and source tests` job passed, including **Compile real-device iPhone app without signing**.
3. Scroll to **Artifacts** and download `vehicle-sentinel-v0.2-unsigned-device-ipa`. GitHub provides a ZIP containing `VehicleSentinel-v0.2-UNSIGNED.ipa`; extract the IPA.
4. This file **cannot** be installed directly by tapping on the iPhone. It is explicitly **unsigned** and needs a signing/install workflow on your own computer.
5. Do not substitute an IPA from a random site.

## Install on the iPhone through Windows

1. On Windows, install the necessary Apple USB connectivity components from an official Apple source. Sideloadly's documented Windows route may require the **web installer** versions of Apple's iTunes and iCloud rather than Microsoft Store variants.
2. Install Sideloadly from its **official** site only if you are comfortable entrusting the third-party tool with the personal-signing workflow.
3. Connect the unlocked iPhone with a data-capable USB cable. Tap **Trust** on the iPhone only if it is your HP computer.
4. Load the unsigned IPA in Sideloadly, select the connected iPhone, then follow the tool's Apple Account / two-factor verification and installation prompts **on your own devices**. Do not send Apple Account passwords, app-specific passwords or verification codes to GitHub, ChatGPT, Evercraft, or an agent.
5. If prompted, enable **Settings > Privacy & Security > Developer Mode** on the iPhone, restart if requested, and complete the on-device trust prompts. Availability and wording vary by iOS release.
6. Open **Vehicle Sentinel**, allow Bluetooth permission, and verify the screen reports that Bluetooth is ready.

If a tool fails at this step, do not downgrade device security or bypass Apple security controls. Recheck the official instructions and stop if you see unexpected account/installation prompts.

## Real-device acceptance check

1. Confirm the **Check** tab provides Apple Find My unwanted-tracker guidance. Use iOS's built-in tracking alerts independently of this app.
2. With a known, consented BLE accessory nearby, start a **60-second** beside-Jeep scan and save it. Keep the app in the foreground.
3. Leave the vehicle and keys in place. Move the iPhone at least 50 feet away, and run another **60-second** scan within 30 minutes.
4. Confirm the **Review** tab reports the comparison without claiming that any device is a tracker or that the Jeep is safe.
5. Verify permission denial, a short scan, a scan without readable observations, and switching apps are handled without false tracking alerts.
6. Export the observations, inspect the contents, then clear local data and verify it has disappeared. Avoid posting Bluetooth observations publicly.
7. Report an actual observation, a crash, or a confusing warning in the beta PR. Do **not** report a simulated or unverified detection as a confirmed tracker.

## What this does NOT establish

- It does not confirm a hidden AirTag, GPS tracker, OBD tracker, cellular modem, or wiring.
- No unattended/background scans or automated tracking notifications are implemented.
- A clean scan does not prove your vehicle is clear.
- Do not infer the identity or intent of another person from radio observations.
- If you find suspicious hardware, avoid disturbing unfamiliar wiring; photograph evidence if safe and consider a mechanic or law enforcement.

## Release gates

The GitHub Actions hosted-Mac build only validates source and packages an **unsigned** app. It does not sign, install, run on a physical iPhone, verify CoreBluetooth performance, or certify consumer security claims.

**No public launch, customer billing, or automatic-tracker-detection claims are authorized by this guide.**
