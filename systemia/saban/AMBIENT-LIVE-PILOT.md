# Saban Ambient Live Pilot

This is the first deliberately non-synthetic Ambient Fabric run.

It queries two real public physical-world sources:

- **adsb.lol** for live aircraft ADS-B observations in a bounded test area. The public API is open to everyone and its public data is ODbL 1.0.
- **NOAA Aviation Weather Center Data API** for a live METAR observation from KSEA. The Data API is intended for machine-to-machine access and is rate limited, so the pilot sends one bounded request.
- **NOAA National Data Buoy Center** for the latest public telemetry from Cape Elizabeth buoy 46041, a physical offshore sensor platform.

The pilot converts each observed aircraft and the weather station report into `evercraft.ambient-capability.v1`, then asks the normal resolver for the `observe` operation.

It separately asks for `compute` from the same visible objects. That request must return zero eligible capabilities. This is the important boundary: public observation makes the signal usable, not the underlying device controllable.

## What success means

A successful run proves:

1. Saban can reach multiple real public physical-world feeds.
2. It can discover live, changing aircraft plus fixed physical sensor platforms.
3. It can normalize them into one capability contract.
4. It can admit legitimate observation operations.
5. It does not infer compute/control authority from visibility.

This is not yet the full planetary fabric. BLE, Remote ID radio capture, AIS, public infrastructure feeds, browser workers and additional capacity markets remain separate adapters.
