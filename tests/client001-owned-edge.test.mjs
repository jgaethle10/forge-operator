import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';

const root=path.resolve('.');
const caddy=fs.readFileSync(path.join(root,'infra/evercraft-edge/client001-on-the-go/Caddyfile.example'),'utf8');
const stage=fs.readFileSync(path.join(root,'scripts/stage-client001-owned-edge.sh'),'utf8');
const review=fs.readFileSync(path.join(root,'public/clients/on-the-go/review/index.html'),'utf8');
const readme=fs.readFileSync(path.join(root,'infra/evercraft-edge/client001-on-the-go/README.md'),'utf8');

test('On The Go host is controlled by client-specific, unapproved-until-proven domain variable',()=>{
 assert.match(caddy,/\{\$CLIENT001_DOMAIN\}, www\.\{\$CLIENT001_DOMAIN\}/);
 assert.match(caddy,/\@www host www\.\{\$CLIENT001_DOMAIN\}/);
 assert.match(caddy,/redir \@www https:\/\/\{\$CLIENT001_DOMAIN\}\{uri\} 308/);
 assert.doesNotMatch(caddy,/^\s*(?:http:\/\/|https:\/\/)?onthegoquicklube\.com[,\s{]/m);
 assert.doesNotMatch(caddy,/^\s*tls\s+internal/m);
});
test('local static byte serving, no GitHub Pages or reverse proxy runtime',()=>{
 assert.match(caddy,/root \* \/srv\/evercraft\/client001\/current/);
 assert.match(caddy,/file_server/);
 assert.match(caddy,/handle \//);
 assert.match(caddy,/respond 404/);
 assert.doesNotMatch(caddy,/reverse_proxy|github\.io|base44|onrender\.com|theengagency\.com/i);
 assert.match(caddy,/X-Robots-Tag "noindex, nofollow, noarchive"/);
 assert.match(caddy,/handle \/robots\.txt/);
 assert.match(caddy,/handle \/healthz/);
});
test('staging is content-addressed and not a deploy or DNS authority',()=>{
 assert.match(stage,/sha256sum "\$SRC"/);
 assert.match(stage,/DEST="\$ROOT\/\$SOURCE_SHA"/);
 assert.match(stage,/cmp -- "\$SRC" "\$DEST\/index\.html"/);
 assert.match(stage,/test "\$SOURCE_SHA" = "\$STAGED_SHA"/);
 assert.match(stage,/\/srv\/evercraft\/client001\/releases/);
 assert.doesNotMatch(stage,/caddy (?:reload|run|start)|systemctl|ionos|curl|https?:\/\/|ln -s|\/current\/index\.html/);
 assert.match(stage,/public_deploy=false/);
 assert.match(stage,/dns_modified=false/);
 assert.equal(execFileSync('bash',['-n','scripts/stage-client001-owned-edge.sh'],{cwd:root}).length,0);
});
test('preview is self-contained and unapproved for customer promotion',()=>{
 assert.match(review,/<title>On The Go Mobile Quick Lube \| Client Preview V4\.1<\/title>/);
 assert.match(review,/noindex,nofollow,noarchive/);
 assert.match(review,/onthegomobileoilchange@outlook\.com/);
 assert.match(review,/tel:\+15098335025/);
 assert.doesNotMatch(review,/<script[^>]*\bsrc\s*=/i);
 assert.match(readme,/NOT DEPLOYED; DOMAIN UNSELECTED; DNS\/TLS\/PUBLICATION HOLD/);
 assert.match(readme,/owner.*approval|Juan.*explicit/i);
 assert.match(readme,/not.*existing website|does.*not.*change.*existing site/i);
});
