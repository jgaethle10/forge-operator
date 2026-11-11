# Aqua Field Notebook mobile owner video review | RC14 reference

**Source:** owner-supplied private iPhone screen recording, 14.57 sec, 512x1108 pixels, inspected in this ChatGPT conversation. **Do not copy the recording into the public repository or distribute it.**

Observed: RC13 opens in iPhone's in-app file preview; the initial Evercraft Aqua hero and one-meter form display. The native units picker opens with US gallons, liters and cubic meters. The user scrolls to the explanatory content and returns to the chat. The video does not include a saved meter reading, export, application restart, or verification that localStorage persists.

Engineering implications:
- Reduce mobile scroll before the first action.
- Provide recovery entrypoints **before** notebook creation, as the file preview can lose its local state.
- Use backup methods that work without a functioning download capability, including copyable text, while honestly warning that clipboard success is not durable storage.
- Keep meter information private and require independent field evidence.

RC14 acceptance: start button visible in 390x844 Chromium first viewport (~590 px); fresh no-state page can restore both a validated pasted JSON backup and an imported JSON file. Invalid/corrupt/future data blocked. Actual RC14 on an iPhone or native Safari still untested.
