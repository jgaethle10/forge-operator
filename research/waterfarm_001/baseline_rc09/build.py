from pathlib import Path
root=Path(__file__).parent
core=(root/'app/core.mjs').read_text()
# Inline the identical tested JS functions, eliminating file-protocol ES-module CORS trouble.
core=core.replace('export const ','const ').replace('export class ','class ').replace('export function ','function ')
html=(root/'app/index.template.html').read_text().replace('__CORE_SCRIPT__',core)
assert '__CORE_SCRIPT__' not in html
output=root.parent/'Evercraft_Aqua_Baseline_RC09.html'
output.write_text(html)
print(output,'bytes',output.stat().st_size)