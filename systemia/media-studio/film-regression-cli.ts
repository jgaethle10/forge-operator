import fs from 'node:fs';
import path from 'node:path';
import {
  captureFilmBenchmark,
  compareFilmBenchmark,
  type FilmBenchmarkRunInput,
  type FilmBenchmarkSnapshot,
} from './film-regression-lab.js';

function read<T>(filePath:string){
  return JSON.parse(fs.readFileSync(path.resolve(filePath),'utf8')) as T;
}

function write(filePath:string,value:unknown){
  const full=path.resolve(filePath);
  fs.mkdirSync(path.dirname(full),{recursive:true});
  fs.writeFileSync(full,JSON.stringify(value,null,2)+'\n','utf8');
}

const [command,a,b,c]=process.argv.slice(2);
try{
  if(command==='capture'&&a&&b){
    const snapshot=captureFilmBenchmark(read<FilmBenchmarkRunInput>(a));
    write(b,snapshot);
    console.log('Benchmark '+snapshot.status+': '+snapshot.snapshotDigest);
    if(snapshot.status!=='accepted') process.exitCode=2;
  }else if(command==='compare'&&a&&b&&c){
    const comparison=compareFilmBenchmark({
      baseline:read<FilmBenchmarkSnapshot>(a),
      current:read<FilmBenchmarkSnapshot>(b),
    });
    write(c,comparison);
    console.log('Comparison '+comparison.status+': '+comparison.comparisonDigest);
    if(comparison.status!=='accepted') process.exitCode=2;
  }else{
    console.error('Usage: film-regression-cli.ts capture <run.json> <snapshot.json> | compare <baseline.json> <current.json> <comparison.json>');
    process.exitCode=1;
  }
}catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
}
