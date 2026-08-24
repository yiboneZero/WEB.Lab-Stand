const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const width = 400, height = 500;
const pixels = new Uint8ClampedArray(width * height * 4);
for (let i = 0; i < width * height; i++) {
  pixels[i * 4] = 220; pixels[i * 4 + 1] = 220; pixels[i * 4 + 2] = 220; pixels[i * 4 + 3] = 255;
}
function paint(x, y, value) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4; pixels[i] = value; pixels[i + 1] = value; pixels[i + 2] = value;
}
const expectedAngle = 79.5, angle = expectedAngle * Math.PI / 180, bottom = {x: 150, y: 440};
for (let t = 0; t < 380; t++) {
  const cx = bottom.x + Math.cos(angle) * t, cy = bottom.y - Math.sin(angle) * t;
  for (let o = -5; o <= 5; o++) {
    paint(Math.round(cx + Math.sin(angle) * o), Math.round(cy + Math.cos(angle) * o), 35);
  }
}
for (let y = 438; y < 456; y++) for (let x = 110; x < 195; x++) paint(x, y, 45);

const noop = () => {};
const element = new Proxy({
  width, height, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '',
  style: {}, classList: {add: noop, remove: noop, toggle: noop},
  addEventListener: noop, removeEventListener: noop, querySelector() { return element; },
  getContext() { return {drawImage: noop, getImageData() { return {data: pixels}; }}; },
  getBoundingClientRect() { return {left: 0, top: 0, width, height}; }
}, {get(target, key) { return key in target ? target[key] : noop; }});
const sandbox = {
  console, Uint8Array, Uint16Array, Uint8ClampedArray, Float32Array, Math, Number,
  performance: {now: () => 0},
  document: {querySelectorAll: () => [], querySelector: () => element, createElement: () => element, addEventListener: noop},
  window: {addEventListener: noop, removeEventListener: noop}, navigator: {}, alert: noop,
  Image: function Image() {}, URL: {createObjectURL: noop, revokeObjectURL: noop}, setTimeout: noop
};
vm.createContext(sandbox);
const source = fs.readFileSync('app.stand.v3.js', 'utf8');
vm.runInContext(`${source}\nimage={};photoCanvas.width=${width};photoCanvas.height=${height};this.result=detectShaftAutomatic();`, sandbox);
assert(sandbox.result, 'automatic detector should return a result');
assert(sandbox.result.ok, `automatic detector failed: ${sandbox.result.reason}`);
assert(Math.abs(sandbox.result.rawAngle - expectedAngle) <= 2, `expected about ${expectedAngle}°, got ${sandbox.result.rawAngle}°`);
assert(sandbox.result.start.y < sandbox.result.end.y, 'detected segment should end near the head');
console.log('Synthetic shaft detection test passed.');
