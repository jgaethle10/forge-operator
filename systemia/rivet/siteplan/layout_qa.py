import argparse,hashlib,itertools,json
from pathlib import Path
from paths import DATA_ROOT, COMPILER_ROOT
import fitz

ROOT=DATA_ROOT
TITLE_LABELS=('PROJECT','SITE','ADDRESS','PARCEL','STATUS','DATE','DRAWN','CHECK','REFERENCE','DRAWING')
TITLE_X_MIN=1036.0
TITLE_X_MAX=1210.0
MIN_RULE_LABEL_GAP_PT=10.0
MIN_LABEL_VALUE_GAP_PT=6.0
MIN_TITLE_LABEL_FONT_PT=6.2
MIN_TITLE_VALUE_FONT_PT=7.0

def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1<<20),b''): h.update(b)
 return h.hexdigest()

def area(a,b):
 x0=max(a[0],b[0]);y0=max(a[1],b[1]);x1=min(a[2],b[2]);y1=min(a[3],b[3]);return max(0,x1-x0)*max(0,y1-y0)

def title_block_spacing(pg,spans):
 rules=[]
 for drawing in pg.get_drawings():
  for item in drawing.get('items',[]):
   try:
    if item[0]!='l':
     continue
    a,b=item[1],item[2]
    if abs(float(a.y)-float(b.y))>.5:
     continue
    x0,x1=sorted((float(a.x),float(b.x)))
    if x0>=TITLE_X_MIN and x1<=TITLE_X_MAX and (x1-x0)>=120:
     rules.append(round((float(a.y)+float(b.y))/2,3))
   except Exception:
    continue
 rules=sorted(set(rules))
 labels={}
 for s in spans:
  if s['t'] in TITLE_LABELS and s['b'][0]>=TITLE_X_MIN:
   labels[s['t']]=s
 metrics=[]
 for label in TITLE_LABELS:
  s=labels.get(label)
  if not s:
   metrics.append({'label':label,'missing':True})
   continue
  origin_y=float((s.get('origin') or (0,s['b'][3]))[1])
  above=[y for y in rules if y<=origin_y+.1]
  rule_y=max(above) if above else None
  rule_gap=None if rule_y is None else round(origin_y-rule_y,3)
  next_rule=min([y for y in rules if y>origin_y+.1] or [10**9])
  value_candidates=[
   q for q in spans
   if q is not s
   and q['t'] not in TITLE_LABELS
   and q['b'][0]>=TITLE_X_MIN
   and float((q.get('origin') or (0,q['b'][3]))[1])>origin_y+.1
   and float((q.get('origin') or (0,q['b'][3]))[1])<next_rule-.1
  ]
  value_gap=None
  value_text=None
  value_font_pt=None
  if value_candidates:
   q=min(value_candidates,key=lambda z:float((z.get('origin') or (0,z['b'][3]))[1]))
   value_y=float((q.get('origin') or (0,q['b'][3]))[1])
   value_gap=round(value_y-origin_y,3)
   value_text=q['t']
   value_font_pt=round(float(q.get('z',0)),3)
  metrics.append({'label':label,'missing':False,'rule_y':rule_y,'label_origin_y':round(origin_y,3),'label_font_pt':round(float(s.get('z',0)),3),'rule_to_label_gap_pt':rule_gap,'label_to_value_gap_pt':value_gap,'first_value_span':value_text,'first_value_font_pt':value_font_pt})
 valid_rule=[m['rule_to_label_gap_pt'] for m in metrics if not m.get('missing') and m.get('rule_to_label_gap_pt') is not None]
 valid_value=[m['label_to_value_gap_pt'] for m in metrics if not m.get('missing') and m.get('label_to_value_gap_pt') is not None and m['label']!='DRAWING']
 return {
  'rules_detected':len(rules),
  'labels_expected':len(TITLE_LABELS),
  'labels_detected':sum(1 for m in metrics if not m.get('missing')),
  'min_rule_to_label_gap_pt':round(min(valid_rule),3) if valid_rule else None,
  'min_label_to_value_gap_pt':round(min(valid_value),3) if valid_value else None,
  'min_label_font_pt':round(min([m['label_font_pt'] for m in metrics if not m.get('missing')]),3) if any(not m.get('missing') for m in metrics) else None,
  'min_value_font_pt':round(min([m['first_value_font_pt'] for m in metrics if not m.get('missing') and m.get('first_value_font_pt') is not None]),3) if any((not m.get('missing') and m.get('first_value_font_pt') is not None) for m in metrics) else None,
  'fields':metrics
 }

def scan(p):
 d=fitz.open(p); out=[]
 for pn,pg in enumerate(d):
  spans=[]
  for bi,b in enumerate(pg.get_text('dict').get('blocks',[])):
   for li,line in enumerate(b.get('lines',[])):
    for si,s in enumerate(line.get('spans',[])):
     t=' '.join((s.get('text') or '').split())
     if t:
      spans.append({'t':t,'b':tuple(map(float,s['bbox'])),'origin':tuple(map(float,s.get('origin') or (s['bbox'][0],s['bbox'][3]))),'z':float(s.get('size',0)),'block':bi,'line':li,'span':si})
  ovs=[]
  for i,j in itertools.combinations(range(len(spans)),2):
   a,b=spans[i],spans[j]
   if a['block']==b['block']: continue
   ia=area(a['b'],b['b'])
   if ia<=0: continue
   aa=max(1,(a['b'][2]-a['b'][0])*(a['b'][3]-a['b'][1]));bb=max(1,(b['b'][2]-b['b'][0])*(b['b'][3]-b['b'][1]));f=ia/min(aa,bb)
   if ia>=2 and f>=.08: ovs.append({'a':a['t'],'b':b['t'],'intersection_area':round(ia,2),'fraction':round(f,3)})
  r=pg.rect
  outside=[s for s in spans if s['b'][0]<r.x0-.1 or s['b'][1]<r.y0-.1 or s['b'][2]>r.x1+.1 or s['b'][3]>r.y1+.1]
  imgs=[]
  for im in pg.get_images(full=True):
   try:
    for rr in pg.get_image_rects(im[0]): imgs.append((rr.width*rr.height)/(r.width*r.height))
   except: pass
  pix=pg.get_pixmap(matrix=fitz.Matrix(.35,.35),colorspace=fitz.csGRAY,alpha=False)
  samples=memoryview(pix.samples)
  ink=sum(1 for v in samples if v<235)/max(1,len(samples))
  dark=sum(1 for v in samples if v<195)/max(1,len(samples))
  tb=title_block_spacing(pg,spans)
  out.append({'page':pn+1,'span_count':len(spans),'min_font_pt':round(min([s['z'] for s in spans] or [0]),3),'outside_count':len(outside),'overlap_count':len(ovs),'overlaps':sorted(ovs,key=lambda x:x['intersection_area'],reverse=True),'largest_image_fraction':round(max(imgs or [0]),4),'visual_ink_fraction':round(ink,4),'visual_dark_fraction':round(dark,4),'title_block':tb})
 return out

def main():
 a=argparse.ArgumentParser();a.add_argument('--site',type=int,required=True);a.add_argument('--render-dir',default=str(COMPILER_ROOT/'render'));x=a.parse_args()
 rd=Path(x.render_dir); od=COMPILER_ROOT/'receipts';od.mkdir(parents=True,exist_ok=True); n=x.site
 fs={'s0':rd/f'RIVET_Site_{n:02d}_VDOT_S0_Site_Plan.pdf','a0':rd/f'RIVET_Site_{n:02d}_VDOT_A0_Area_Map.pdf','pair':rd/f'RIVET_Site_{n:02d}_VDOT_Founder_Review_2pg.pdf'}
 for p in fs.values():
  if not p.exists(): raise RuntimeError('missing '+str(p))
 s0=scan(fs['s0']);a0=scan(fs['a0']);fails=[]
 for k,pages in [('S0',s0),('A0',a0)]:
  for p in pages:
   if p['outside_count']: fails.append(k+'_OUTSIDE_TEXT')
   if p['overlap_count']: fails.append(k+'_TEXT_OVERLAP')
   if p['largest_image_fraction']<=0: fails.append(k+'_NO_IMAGE')
   if p['min_font_pt'] and p['min_font_pt']<4: fails.append(k+'_FONT_LT_4PT')
   tb=p['title_block']
   if tb['labels_detected']<len(TITLE_LABELS): fails.append(k+'_TITLEBLOCK_FIELDS_MISSING')
   if tb['min_rule_to_label_gap_pt'] is None or tb['min_rule_to_label_gap_pt']<MIN_RULE_LABEL_GAP_PT: fails.append(k+'_TITLEBLOCK_RULE_LABEL_GAP')
   if tb['min_label_to_value_gap_pt'] is None or tb['min_label_to_value_gap_pt']<MIN_LABEL_VALUE_GAP_PT: fails.append(k+'_TITLEBLOCK_LABEL_VALUE_GAP')
   if tb['min_label_font_pt'] is None or tb['min_label_font_pt']<MIN_TITLE_LABEL_FONT_PT: fails.append(k+'_TITLEBLOCK_LABEL_FONT_TOO_SMALL')
   if tb['min_value_font_pt'] is None or tb['min_value_font_pt']<MIN_TITLE_VALUE_FONT_PT: fails.append(k+'_TITLEBLOCK_VALUE_FONT_TOO_SMALL')
   if k=='S0' and p['largest_image_fraction']<.35: fails.append('S0_AERIAL_NOT_DOMINANT')
   if k=='A0' and p['largest_image_fraction']<.45: fails.append('A0_CONTEXT_IMAGE_NOT_DOMINANT')
   if k=='S0' and p['visual_ink_fraction']<.08: fails.append('S0_VISUALLY_WASHED_OUT')
   if k=='A0' and p['visual_ink_fraction']<.06: fails.append('A0_VISUALLY_WASHED_OUT')
 rec={'qa_version':'KSS-LAYOUT-QA-v3.1-titleblock-legibility','site':n,'contract':{'min_rule_to_label_gap_pt':MIN_RULE_LABEL_GAP_PT,'min_label_to_value_gap_pt':MIN_LABEL_VALUE_GAP_PT,'min_title_label_font_pt':MIN_TITLE_LABEL_FONT_PT,'min_title_value_font_pt':MIN_TITLE_VALUE_FONT_PT},'artifacts':{k:{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size} for k,p in fs.items()},'s0':s0,'a0':a0,'failures':sorted(set(fails)),'layout_pass':not fails}
 dst=od/f'site_{n:02d}_layout_qa.json';dst.write_text(json.dumps(rec,indent=2))
 print(json.dumps({'site':n,'layout_pass':not fails,'failures':sorted(set(fails)),'s0_title_block':s0[0]['title_block'],'a0_title_block':a0[0]['title_block'],'receipt':str(dst),'receipt_sha256':sha(dst)},indent=2))
 if fails: raise SystemExit(2)

if __name__=='__main__': main()