from pathlib import Path
r=Path(__file__).parent
c=(r/'app/core.mjs').read_text()
t=(r/'app/index.template.html').read_text()
assert t.count('/*__CORE__*/')==1
(r/'Evercraft_Aqua_RC12_One_Meter_Field_Kit.html').write_text(t.replace('/*__CORE__*/',c))
