import {writeFile} from 'node:fs/promises';
import {fetchAggregateResources,queueToGeoJSON,screenAggregateResources} from './mineral-intelligence.mjs';

const county=process.argv[2]||'Grant';
const prefix=process.argv[3]||'evermaps-aggregate';
try {
  const data=await fetchAggregateResources({county});
  const screened=screenAggregateResources(data);
  await Promise.all([
    writeFile(prefix+'.screen.json',JSON.stringify(screened,null,2)+'\n'),
    writeFile(prefix+'.geojson',JSON.stringify(queueToGeoJSON(screened),null,2)+'\n')
  ]);
  console.log(JSON.stringify({
    county,...screened.counts,source_complete:data.metadata.complete,
    output:[prefix+'.screen.json',prefix+'.geojson']
  },null,2));
  if (!data.metadata.complete) process.exitCode=2;
} catch(error) {
  console.error('Aggregate screening aborted: '+error.message);
  process.exitCode=1;
}
