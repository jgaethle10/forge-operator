#!/usr/bin/env node
/**
 * Evercraft client-experience source preflight.
 *
 * Static/read-only. NEVER certifies real browser behavior, pixel quality,
 * device capabilities, accurate published facts, client approval or live HTTPS.
 * This module accepts explicit per-client profiles; do not bake On The Go
 * identity and styling into a universal Evercraft design system.
 */
import fs from 'node:fs';
import process from 'node:process';

export const CLIENT001 = Object.freeze({
  name:'On The Go Mobile Quick Lube',
  businessEmail:'onthegomobileoilchange@outlook.com',
  phoneHref:'tel:+15098335025',
  supportedLanguages:['en','es'],
  publishedServiceCount:8,
  packageValues:['semi','full','client'],
  matrixTypes:['normal','rotation'],
  forbiddenCtaPhrases:['Call Juan','Llamar a Juan','Ask Juan about'],
  sourcePath:'public/clients/on-the-go/review/index.html',
});

export function auditClientExperienceHtml(html,profile=CLIENT001){
  const checks=[];
  const add=(id,pass,explanation,kind='static')=>checks.push({
    id,pass:Boolean(pass),scope:kind,explanation
  });
  const q=(needle)=>html.includes(needle);
  const cta=(name,href)=>{
    const re=new RegExp('<a\\s+[^>]*class="[^"]*'+name+'[^"]*"[^>]*href="'+href.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"','i');
    return re.test(html);
  };
  const nav=html.match(/<a\s+class="nav-phone"\s+href="([^"]+)"[^>]*>/)?.[1]||'';
  const hero=html.match(/<div class="actions">([\s\S]*?)<\/div>/)?.[1]||'';
  const sectionStart=html.indexOf('<div class="contact-card">');
  const contact=sectionStart>=0?html.slice(sectionStart,html.indexOf('</section>',sectionStart)):'';
  const mobileBar=html.match(/<div class="mobile-bar">([\s\S]*?)<\/div>/)?.[1]||'';
  const languageFields=profile.supportedLanguages||['en'];
  add('customer_identity',q(profile.name)&&q('ON THE GO'), 'Business identity appears in public source');
  add('source_language',html.startsWith('<!doctype html>')&&/<html lang="en">/.test(html),'Document has declared language and document structure');
  add('viewport',/name="viewport"[^>]+width=device-width/.test(html),'Responsive viewport specified');
  add('unlisted_review',q('noindex,nofollow,noarchive')&&q('CLIENT REVIEW'),'Owner-review preview not represented as a customer launch');
  add('nav_desktop_nondialer',nav==='#contact','Desktop primary navigation opens usable on-page contact path');
  add('hero_desktop_nondialer',hero.includes('href="#contact"')&&!hero.includes('href="tel:'),'Desktop primary hero action is not phone-only');
  const emailIdx=contact.indexOf('id="emailCta"'),callIdx=contact.indexOf('id="callCta"');
  add('email_first',emailIdx>=0&&callIdx>emailIdx,'Desktop contact prioritizes email before phone');
  add('email_handler',contact.includes('id="emailCta"')&&contact.includes('mailto:'+profile.businessEmail),'Email action points to business contact');
  add('email_fallback',contact.includes('id="copyEmail"')&&contact.includes(profile.businessEmail)&&contact.includes('id="copyFeedback"'),'Business email visible and has copy fallback when mailto unavailable');
  add('phone_alternative',contact.includes(profile.phoneHref)&&mobileBar.includes(profile.phoneHref),'Phone is available as alternative and mobile action');
  add('professional_ctas',!profile.forbiddenCtaPhrases.some(t=>q(t)),'Public controls use business-facing language, not staff shorthand');
  add('mobile_layout',q('@media(max-width:720px)')&&q('class="mobile-bar"'),'Dedicated mobile layout and contact bar exist (rendering unverified)');
  add('business_menu',((html.match(/data-service="/g)||[]).length===profile.publishedServiceCount),'Full known service menu selectors remain intact');
  const matrix=html.match(/const packageMatrix=\{([\s\S]*?)\n\};/)?.[1]||'';
  add('package_matrix',profile.packageValues.every(v=>matrix.includes(v+':{'))&&profile.matrixTypes.every(v=>matrix.includes(v+':{')),'Guided service matcher preserves known combinations');
  add('starting_prices',q('STARTING AT')&&q('DESDE')&&q('Additional quarts'),'Pricing communicates starting amounts and oil surcharge conditions');
  add('bilingual_controls',languageFields.every(lang=>q('id="'+lang+'"'))&&q('document.documentElement.lang=lang'),'Language controls and document language are connected');
  add('bilingual_contact',q("emailCta:'✉  Request service by email'")&&q("emailCta:'✉  Solicitar servicio por correo'")&&q("emailService:'Me interesa:'"),'Both languages include an inquiry action and selected-service wording');
  add('selection_to_inquiry',q("function refreshSelection()")&&q("document.getElementById('emailCta').href='mailto:")&&q('selection?'),'Service selection is included in customer-authored email draft');
  add('keyboard_focus',q(':focus-visible')&&q('aria-live="polite"'),'Source includes focus and live update semantics; browser inspection still required');
  add('no_external_runtime',!/<script[^>]*src\s*=/i.test(html)&&!/\bfetch\s*\(/.test(html)&&!/\bXMLHttpRequest\b/.test(html),'No externally loaded scripts or data API calls');
  add('privacy_and_jargon',!/gtag\(|facebook\.com\/tr\//i.test(html)&&!/refCode|beaconTitle|EC-DIRECT-001|How optional referral tracking would work/i.test(html),'No customer-facing event-tracking jargon or obvious trackers');
  add('not_false_booking',q('Not a live booking service')&&q('This preview does not accept bookings'),'Review accurately discloses non-booking status');
  add('source_only_limit',true,'All checks in this audit are source-level, never browser or launch certification');
  return {
    schema:'evercraft.client-experience.source-preflight.v1',
    profile:profile.name,
    state:checks.every(x=>x.pass)?'source_pass':'source_fail',
    browser_state:'unverified',
    client_approval:'unverified',
    live_state:'unverified',
    failures:checks.filter(x=>!x.pass).map(x=>({id:x.id,reason:x.explanation})),
    checks
  };
}

if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url){
 const html=fs.readFileSync(process.argv[2]||CLIENT001.sourcePath,'utf8');
 const report=auditClientExperienceHtml(html);
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(report.state!=='source_pass')process.exitCode=2;
}
