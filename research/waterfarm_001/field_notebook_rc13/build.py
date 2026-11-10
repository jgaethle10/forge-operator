from pathlib import Path
p=Path(__file__).parent
s=(p/'app'/'index.template.html').read_text()
core=(p/'app'/'core.mjs').read_text().replace('export ','')
journal=(p/'app'/'journal.mjs').read_text().replace("import {analyzeSingleMeter, FIELDS, UNITS, EvidenceHold, sha256Hex} from './core.mjs';",'').replace('export ','')
assert '/*__CODE__*/' in s
s=s.replace('/*__CODE__*/',core+'\n'+journal)
(p/'Evercraft_Aqua_Field_Notebook_RC13.html').write_text(s)
