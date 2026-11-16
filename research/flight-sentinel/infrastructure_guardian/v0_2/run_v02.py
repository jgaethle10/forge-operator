"""Write synthetic evidence for the v0.2 dependency trust exercise."""
import json
from pathlib import Path
from cases_v02 import campaign

if __name__=='__main__':
    r=campaign()
    p=Path(__file__).with_name('evidence-v02.json')
    p.write_text(json.dumps(r,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print('Wrote',p)
    print('Scenarios:',r['scenario_count'])
    for x in r['cases']:
        print(f"{x['case']}: {x['advisory']} / unexpected critical losses: {x['unexpected_losses']}")
