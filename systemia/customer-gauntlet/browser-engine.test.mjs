import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRenderedSnapshot, RENDERED_CHECKS } from './browser-engine.mjs';

test('rendered browser contract covers the human-visible checks', () => {
  for (const required of [
    'rendered_screenshot_capture',
    'visual_clipping',
    'javascript_console_errors',
    'keyboard_tab_order',
    'broken_image_scan',
    'blank_state_scan',
    'rendered_brand_metadata'
  ]) assert.ok(RENDERED_CHECKS.includes(required));
});

test('flags placeholder branding and blank rendered state', () => {
  const findings=evaluateRenderedSnapshot({
    title:'Base44 APP',
    visible_text_chars:0,
    interactive_count:0,
    visible_image_count:0,
    horizontal_overflow_px:0,
    clipped_interactive_count:0,
    broken_image_count:0,
    page_error_count:0,
    console_error_count:0,
    focus_order_count:0
  },{viewport:'desktop'});
  assert.ok(findings.some(f=>f.code==='severe_brand_mismatch' && f.severity==='P1'));
  assert.ok(findings.some(f=>f.code==='rendered_blank_state' && f.severity==='P1'));
});

test('mobile overflow is a blocker while a clean snapshot stays clean', () => {
  const bad=evaluateRenderedSnapshot({
    title:'RIVET',
    visible_text_chars:400,
    interactive_count:4,
    visible_image_count:1,
    horizontal_overflow_px:96,
    clipped_interactive_count:1,
    broken_image_count:0,
    page_error_count:0,
    console_error_count:0,
    focus_order_count:3
  },{viewport:'mobile'});
  assert.ok(bad.some(f=>f.code==='mobile_blocker' && f.severity==='P1'));

  const clean=evaluateRenderedSnapshot({
    title:'RIVET',
    visible_text_chars:400,
    interactive_count:4,
    visible_image_count:1,
    horizontal_overflow_px:0,
    clipped_interactive_count:0,
    broken_image_count:0,
    page_error_count:0,
    console_error_count:0,
    focus_order_count:3,
    placeholder_copy:false
  },{viewport:'desktop'});
  assert.deepEqual(clean,[]);
});
