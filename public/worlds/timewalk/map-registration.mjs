/**
 * Evercraft Timewalk historical-map registration workbench.
 *
 * Pure, dependency-free math for independently reviewed pixel-to-projected
 * coordinate control points. NOT an automatic georeferencer, GIS survey,
 * scene renderer, or authoritative World Engine transform.
 *
 * Output is ALWAYS "draft_requires_review" until another system performs
 * evidence/copyright/date checks and explicitly admits the result.
 */
export const MAP_REGISTRATION_SCHEMA='evercraft.timewalk.map-registration-draft.v1';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const fail=reason=>{throw new Error('timewalk_map_registration_'+reason)};
const safeId=s=>typeof s==='string'&&/^[a-z][a-z0-9-]{2,70}$/.test(s);
const matching=(a,b)=>['city','region','country'].every(k=>String(a?.[k]||'').trim().toLowerCase()===String(b?.[k]||'').trim().toLowerCase() && String(a?.[k]||'').trim()!=='');
const rounded=n=>Math.round(n*1e7)/1e7;

function solve3(m,rhs) {
  const a=m.map((row,i)=>[...row,rhs[i]]);
  const diag=[];
  for(let col=0;col<3;col++){
    let pivot=col;
    for(let row=col+1;row<3;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(Math.abs(a[pivot][col])<1e-8)fail('collinear_or_singular_control_points');
    if(pivot!==col)[a[col],a[pivot]]=[a[pivot],a[col]];
    const value=a[col][col];
    diag.push(Math.abs(value));
    for(let j=col;j<4;j++)a[col][j]/=value;
    for(let row=0;row<3;row++)if(row!==col){
      const factor=a[row][col];
      for(let j=col;j<4;j++)a[row][j]-=factor*a[col][j];
    }
  }
  return a.map(row=>row[3]);
}
function leastSquares(points,targetKey){
  // Normalize pixel centers to reduce conditioning problems with large scans.
  const meanX=points.reduce((v,p)=>v+p.pixelX,0)/points.length;
  const meanY=points.reduce((v,p)=>v+p.pixelY,0)/points.length;
  const spread=Math.max(1,...points.map(p=>Math.hypot(p.pixelX-meanX,p.pixelY-meanY)));
  const samples=points.map(p=>[1,(p.pixelX-meanX)/spread,(p.pixelY-meanY)/spread]);
  const normal=Array.from({length:3},()=>[0,0,0]);
  const rhs=[0,0,0];
  for(let i=0;i<points.length;i++){
    for(let j=0;j<3;j++){
      rhs[j]+=samples[i][j]*points[i][targetKey];
      for(let k=0;k<3;k++)normal[j][k]+=samples[i][j]*samples[i][k];
    }
  }
  const c=solve3(normal,rhs);
  return [c[0]-(c[1]*meanX+c[2]*meanY)/spread,c[1]/spread,c[2]/spread];
}

export function registerHistoricalMapDraft(input){
  if(!input||input.schema!==MAP_REGISTRATION_SCHEMA)fail('invalid_schema');
  if(!safeId(input.sheetId)||!safeId(input.worldId))fail('invalid_ids');
  if(!Number.isInteger(input.mapEditionYear)||input.mapEditionYear<1700||input.mapEditionYear>2100)
    fail('invalid_map_year');
  if(!Number.isInteger(input.sceneTargetYear)||input.sceneTargetYear<1700||input.sceneTargetYear>2100)
    fail('invalid_target_year');
  if(!input.collectionUrl?.startsWith('https://')||!input.sheetUrl?.startsWith('https://'))
    fail('unlinked_sheet');
  if(input.sheetIndexVerified!==true||input.sheetInspected!==true)
    fail('unreviewed_sheet_index');
  if(!matching(input.jurisdiction,{city:'Yakima',region:'WA',country:'US'}))
    fail('wrong_city');
  if(!/^EPSG:[0-9]{4,6}$/.test(String(input.projectedCrs||'')))
    fail('missing_projected_crs');
  if(!Array.isArray(input.controls)||input.controls.length<4||input.controls.length>30)
    fail('insufficient_controls');
  const ids=new Set();
  for(const p of input.controls){
    if(!safeId(p.id)||ids.has(p.id))fail('duplicate_or_invalid_control');
    ids.add(p.id);
    if([p.pixelX,p.pixelY,p.easting,p.northing].some(v=>!finite(v)))
      fail('nonfinite_coordinate');
    if(p.pixelX<0||p.pixelY<0||p.pixelX>50000||p.pixelY>50000)
      fail('pixel_out_of_range');
    if(!p.surveySourceUrl?.startsWith('https://')||!p.mapFeatureNote||p.mapFeatureNote.length<10)
      fail('control_without_provenance');
    if(p.checkedByReviewer!==true)fail('control_not_reviewed');
  }
  const east=leastSquares(input.controls,'easting');
  const north=leastSquares(input.controls,'northing');
  const predict=(x,y)=>({easting:east[0]+east[1]*x+east[2]*y,
                         northing:north[0]+north[1]*x+north[2]*y});
  const determinant=east[1]*north[2]-east[2]*north[1];
  if(!finite(determinant)||Math.abs(determinant)<1e-10)
    fail('degenerate_transform');
  const errors=input.controls.map(p=>{
    const mapped=predict(p.pixelX,p.pixelY);
    return {id:p.id,residualMeters:rounded(Math.hypot(mapped.easting-p.easting,
                                                       mapped.northing-p.northing))};
  });
  const rmsMeters=Math.sqrt(errors.reduce((sum,p)=>sum+p.residualMeters**2,0)/errors.length);
  const maxResidualMeters=Math.max(...errors.map(p=>p.residualMeters));
  return {
    schema:MAP_REGISTRATION_SCHEMA,
    worldId:input.worldId,sheetId:input.sheetId,
    originalCollectionUrl:input.collectionUrl,originalSheetUrl:input.sheetUrl,
    mapEditionYear:input.mapEditionYear,sceneTargetYear:input.sceneTargetYear,
    jurisdiction:{city:'Yakima',region:'WA',country:'US'},
    projectedCrs:input.projectedCrs,
    // Affine: projected X=a+b*pixelX+c*pixelY, Y=d+e*pixelX+f*pixelY
    affineCoefficients:[...east,...north].map(rounded),
    controlCount:errors.length,
    rmsMeters:rounded(rmsMeters),maxResidualMeters:rounded(maxResidualMeters),
    residuals:errors,
    observedHistoricalAtTargetYear:input.mapEditionYear===input.sceneTargetYear,
    geometryAuthorized:false, productionAuthoritative:false,
    publicMapTileAuthorized:false,reviewStatus:'draft_requires_review',
    warning:'An affine fit does not independently verify original map date, GCP provenance, map distortions, 1960 geometry, or publication rights.'
  };
}

export function mapRegistrationChecklist(input){
  const controls=Array.isArray(input?.controls)?input.controls:[];
  const check=[
    {id:'sheet-id',done:input?.sheetIndexVerified===true&&input?.sheetInspected===true},
    {id:'city',done:matching(input?.jurisdiction,{city:'Yakima',region:'WA',country:'US'})},
    {id:'map-url',done:typeof input?.sheetUrl==='string'&&input.sheetUrl.startsWith('https://')},
    {id:'projected-crs',done:/^EPSG:[0-9]{4,6}$/.test(String(input?.projectedCrs||''))},
    {id:'ground-control',done:controls.length>=4 && controls.every(x=>x.checkedByReviewer===true)},
    {id:'publication-rights',done:input?.publicationRightsReviewed===true}
  ];
  return {sheetId:input?.sheetId||null,checks:check,readyToFit:check.slice(0,5).every(x=>x.done),
          readyToPublish:false,reason:'Final rights, historical-year and accuracy review must occur outside the math fitter.'};
}
