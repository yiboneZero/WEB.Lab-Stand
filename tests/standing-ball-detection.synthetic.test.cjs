const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const width = 220, height = 220, center = {x: 110, y: 108}, radius = 28;
const pixels = new Uint8ClampedArray(width * height * 4);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const index = (y * width + x) * 4;
  const ball = Math.hypot(x - center.x, y - center.y) <= radius && y <= center.y + radius * .42;
  const value = ball ? 238 : 72;
  pixels[index] = value; pixels[index + 1] = value; pixels[index + 2] = value; pixels[index + 3] = 255;
}

const noop = () => {};
const element = new Proxy({
  width, height, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '',
  style: {}, classList: {add: noop, remove: noop, toggle: noop},
  addEventListener: noop, removeEventListener: noop, querySelector() { return element; },
  getContext() { return {drawImage: noop, getImageData() { return {data: pixels}; }}; }
}, {get(target, key) { return key in target ? target[key] : noop; }});
const sandbox = {
  console, Uint8Array, Uint16Array, Uint8ClampedArray, Float32Array, Math, Number,
  performance: {now: () => 0},
  document: {querySelectorAll: () => [], querySelector: () => element, createElement: () => element, addEventListener: noop},
  window: {addEventListener: noop, removeEventListener: noop}, navigator: {}, alert: noop,
  Image: function Image() {}, URL: {createObjectURL: noop, revokeObjectURL: noop}, setTimeout: noop
};
vm.createContext(sandbox);
const source = fs.readFileSync('app.v3.js', 'utf8');
vm.runInContext(`${source}\nthis.result=detectStandingBallFromArcs(this.syntheticPixels,${width},${height},${center.x},${center.y},72);this.defaultScale=BALL_DEFAULT_SCALE;`, Object.assign(sandbox, {syntheticPixels: pixels}));

assert(sandbox.result, 'standing ball detector should restore an occluded ball');
assert(Math.abs(sandbox.result.x - center.x) <= 3, `unexpected center x: ${sandbox.result.x}`);
assert(Math.abs(sandbox.result.y - center.y) <= 3, `unexpected center y: ${sandbox.result.y}`);
assert(Math.abs(sandbox.result.radius - radius) <= 3, `expected radius about ${radius}, got ${sandbox.result.radius}`);
assert.strictEqual(sandbox.result.method, 'standing-upper-side-arcs');
assert.strictEqual(sandbox.defaultScale, 1.02, 'automatic ball size should default to 102%');
console.log('Synthetic standing ball detection test passed.');
