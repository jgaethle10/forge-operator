import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('public/mesh/ai-boardroom');
const css=fs.readFileSync(path.join(root,'heritage.css'),'utf8');
const pages=[
 {file:path.join(root,'index.html'),href:'./heritage.css',className:'boardroom-heritage'},
 {file:path.join(root,'compare/index.html'),href:'../heritage.css',className:'boardroom-heritage comparison'},
 {file:path.resolve('public/mesh/checkout-ready/ai-boardroom-standard/index.html'),href:'../../ai-boardroom/heritage.css',className:'boardroom-heritage checkout',exactPrice:'$250',stripe:'https://buy.stripe.com/14AdRaaYC68lcDO0E44AU08'},
 {file:path.resolve('public/mesh/checkout-ready/ai-boardroom-financial-modeling/index.html'),href:'../../ai-boardroom/heritage.css',className:'boardroom-heritage checkout',exactPrice:'$500',stripe:'https://buy.stripe.com/3cIbJ2feSfIVcDO1I84AU09'}
];
test('luxury palette is coherent without outside fonts or scripts',()=>{
 for(const value of ['#10100f','#ccad72','#f2e6cf','#28221b'])assert.ok(css.includes(value),'missing brand token '+value);
 assert.ok(css.includes('prefers-reduced-motion'));
 assert.doesNotMatch(css,/@import\s|url\(\s*https?:\/\//i);
});
for(const x of pages){
 test('heritage stylesheet resolves locally: '+path.relative(process.cwd(),x.file),()=>{
  const content=fs.readFileSync(x.file,'utf8');
  assert.ok(content.includes('class="'+x.className+'"'));
  assert.ok(content.includes('href="'+x.href+'"'));
  const actual=path.resolve(path.dirname(x.file),x.href);
  assert.equal(actual,path.resolve(root,'heritage.css'));
  assert.ok(fs.existsSync(actual));
  if(x.exactPrice)assert.ok(content.includes(x.exactPrice));
  if(x.stripe)assert.ok(content.includes(x.stripe));
 });
}
