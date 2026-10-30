// Testumgebung: jsdom + node-canvas + Fake-WebGL
const fs = require('fs'), path = require('path');
const { JSDOM } = require('../pkg/node_modules/jsdom');
const root = path.join(__dirname, '..');
module.exports = function makeEnv(opts) {
  opts = opts || {};
  const body = fs.readFileSync(path.join(root, 'src/body.html'), 'utf8');
  const head = fs.readFileSync(path.join(root, 'src/head.html'), 'utf8');
  const dom = new JSDOM('<!doctype html><html lang="de"><head><meta charset="utf-8">' + head + '</head><body>' + body + '</body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/' });
  const w = dom.window;
  const logs = [], errs = [];
  w.console.log = (...a) => logs.push(a.join(' ')); w.console.warn = (...a) => errs.push('WARN ' + a.join(' ')); w.console.error = (...a) => errs.push('ERR ' + a.map(x => x && x.stack || x).join(' '));
  w.ResizeObserver = class { constructor(f) { this.f = f; } observe() { } disconnect() { } };
  w.matchMedia = () => ({ matches: false, addEventListener() { }, addListener() { } });
  w.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }; };
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 800; } }); Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 600; } });
  w.HTMLElement.prototype.setPointerCapture = function () { }; w.HTMLElement.prototype.releasePointerCapture = function () { };
  w.Element.prototype.setPointerCapture = function () { };
  w.eval(fs.readFileSync(path.join(root, 'pkg/node_modules/three/build/three.min.js'), 'utf8'));
  ['controls/OrbitControls', 'controls/TransformControls', 'exporters/GLTFExporter', 'loaders/GLTFLoader', 'loaders/OBJLoader', 'loaders/STLLoader'].forEach(f => w.eval(fs.readFileSync(path.join(root, 'pkg/node_modules/three/examples/js/' + f + '.js'), 'utf8')));
  w.THREE.WebGLRenderer = class { constructor() { this.domElement = w.document.createElement('canvas'); this.domElement.width = 800; this.domElement.height = 600; this.renders = 0; this.shadowMap = {}; } setPixelRatio() { } setSize() { } render() { this.renders++; } dispose() { } };
  w.TextDecoder = w.TextDecoder || require('util').TextDecoder; w.TextEncoder = w.TextEncoder || require('util').TextEncoder;
  const mods = fs.readFileSync(path.join(root, 'dist/modules.js'), 'utf8');
  const run = '(function(){' + mods + '\n})()';
  return { dom, w, logs, errs, boot() { w.eval(run); return w.Formwerk3D; } };
};
