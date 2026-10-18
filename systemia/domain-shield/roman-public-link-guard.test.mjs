import test from 'node:test';
import assert from 'node:assert/strict';
import {isBrokenOriginalUrl,findUnsafeLinks,auditPublicLinks,RECOVERY_ENTRY,SECONDARY_ENTRY} from './roman-public-link-guard.mjs';

test('detects true public outbound navigation into broken Roman apex and www',()=>{
 for(const url of ['https://voteroman.com/','http://www.voteroman.com/events','https://voteroman.com?tag=old'])assert.equal(isBrokenOriginalUrl(url),true,url);
 const html='<a href="https://voteroman.com/">old</a><form action="http://www.voteroman.com/join"></form><script>window.location.href = "https://voteroman.com/";</script>';
 assert.equal(findUnsafeLinks(html).length,3);
});
test('preserves donation, campaign email, plain quotes, alternate hosts and third-party links',()=>{
 for(const u of ['https://donate.voteroman.com/','mailto:contact@voteroman.com','https://voteroman.com.evil.test/','https://fabric.systemiacommandcenters.com/go/roman',SECONDARY_ENTRY])assert.equal(isBrokenOriginalUrl(u),false,u);
 assert.deepEqual(findUnsafeLinks('<p>voteroman.com previously hosted the website.</p><a href="https://donate.voteroman.com/">Donation</a><a href="mailto:contact@voteroman.com">Email</a><a href="https://fabric.systemiacommandcenters.com/go/roman">Recovery</a>'),[]);
});
test('real published source contains no deliberate navigation to suspended apex',()=>{
 const root=new URL('../../',import.meta.url);
 const summary=auditPublicLinks(new URL('../../',import.meta.url).pathname.replace(/\/systemia\/$/,''));
 // Use process cwd, the canonical repository root in CI.
 const canonical=auditPublicLinks(process.cwd());
 assert.ok(canonical.files_scanned>0);
 assert.equal(canonical.broken_apex_public_links,0,JSON.stringify(canonical.errors));
 assert.equal(canonical.recovery_entry,RECOVERY_ENTRY);
 assert.equal(canonical.original_domain_globally_repaired,false);
});
