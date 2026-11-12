import test from 'node:test';
import assert from 'node:assert/strict';
import {SKY_VERTEX_SHADER,SKY_FRAGMENT_SHADER,skyModeIndex} from '../public/worlds/sky-atmosphere.mjs';
import {initialWorld,applyCommand} from '../public/worlds/world-core.mjs';

test('atmosphere supports each existing persisted sky state without schema changes',()=>{
 assert.equal(skyModeIndex('day'),0);
 assert.equal(skyModeIndex('sunset'),1);
 assert.equal(skyModeIndex('night'),2);
 for(const mode of ['day','sunset','night']){
  const world=mode==='day'?initialWorld():applyCommand(initialWorld(),'sky '+mode).world;
  assert.equal(skyModeIndex(world.sky),skyModeIndex(mode));
 }
});

test('GPU atmosphere is WebGL2 fullscreen-only, without textures, external data, or depth output',()=>{
 assert.match(SKY_VERTEX_SHADER,/^#version 300 es/);
 assert.match(SKY_FRAGMENT_SHADER,/^#version 300 es/);
 assert.match(SKY_VERTEX_SHADER,/gl_VertexID/);
 for(const uniform of ['resolution','yaw','pitch','skyMode'])assert.match(SKY_FRAGMENT_SHADER,new RegExp('uniform (?:vec2|float) '+uniform));
 assert.match(SKY_FRAGMENT_SHADER,/frag=vec4/);
 assert.doesNotMatch(SKY_FRAGMENT_SHADER,/sampler|texture\(|gl_FragDepth|fetch\(/);
});
