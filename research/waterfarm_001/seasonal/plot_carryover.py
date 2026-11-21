"""Reproducible NON-AI static scientific data figure, not documentary film footage."""
import json
from pathlib import Path
import matplotlib.pyplot as plt
rows=json.loads(Path(__file__).with_name('RC07_scenario_results.json').read_text())['cases']
cap=[f'{r["capacity_l"]:,}' for r in rows]
y1=[r['first_year']['delivered_l']/1000 for r in rows]
y2=[r['second_repeat']['delivered_l']/1000 for r in rows]
fig,ax=plt.subplots(figsize=(9,4.7))
pos=list(range(len(rows)))
ax.bar([x-.2 for x in pos],y1,width=.4,label='First model year')
ax.bar([x+.2 for x in pos],y2,width=.4,label='Second synthetic 2024 replay')
ax.set_xticks(pos,cap)
ax.set_xlabel('Tank capacity (liters)')
ax.set_ylabel('Modeled water delivered May–Sep (m³)')
ax.set_title('Evercraft Aqua RC07: Carryover changes a tank-sizing result')
ax.legend(loc='upper left')
ax.grid(axis='y',alpha=.2)
fig.text(.11,.015,'2024 Yakima Airport PRCP; 100 m² roof; 80% capture; 1,000 L/day seasonal demand. Synthetic repeat, not a 2025 forecast.',fontsize=8)
fig.tight_layout(rect=[0,.055,1,1])
fig.savefig(Path(__file__).with_name('RC07_CARRYOVER_GRAPH.png'),dpi=160)