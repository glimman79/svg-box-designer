import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

class TestElement {
  constructor(tagName, attributes = {}, parentElement = null) {
    this.tagName = tagName;
    this.attributes = Object.entries(attributes).map(([name, value]) => ({ name, value }));
    this.parentElement = parentElement;
    this.children = [];
  }
  getAttribute(name) {
    return this.attributes.find((attribute) => attribute.name === name)?.value ?? null;
  }
  removeAttribute(name) {
    this.attributes = this.attributes.filter((attribute) => attribute.name !== name);
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }
  get innerHTML() {
    return this.children.map((child) => child.outerHTML).join('');
  }
  get outerHTML() {
    const attrs = this.attributes.map(({ name, value }) => ` ${name}="${value}"`).join('');
    return `<${this.tagName}${attrs}>${this.innerHTML}</${this.tagName}>`;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector) {
    const tags = selector.split(',').map((tag) => tag.trim().toLowerCase());
    const results = [];
    const visit = (element) => {
      element.children.forEach((child) => {
        if (tags.includes(child.tagName.toLowerCase())) results.push(child);
        visit(child);
      });
    };
    visit(this);
    return results;
  }
}

class TestDocument extends TestElement {}

const parseAttributes = (source) => Object.fromEntries(
  [...source.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)].map((match) => [match[1], match[2]]),
);

class TestDOMParser {
  parseFromString(svgText) {
    const document = new TestDocument('#document');
    const stack = [document];
    for (const match of svgText.matchAll(/<\/?[\w:.-]+[^>]*>/g)) {
      const token = match[0];
      if (token.startsWith('</')) {
        stack.pop();
        continue;
      }
      const [, tagName = '', attributeText = ''] = token.match(/^<([\w:.-]+)([^>]*)\/?\s*>$/) ?? [];
      if (!tagName || token.startsWith('<?') || token.startsWith('<!')) continue;
      const element = new TestElement(tagName, parseAttributes(attributeText), stack.at(-1));
      stack.at(-1).children.push(element);
      if (!token.endsWith('/>')) stack.push(element);
    }
    return document;
  }
}

class TestXMLSerializer {
  serializeToString(element) {
    return element.outerHTML;
  }
}

const svgUtilsSource = readFileSync(resolve(root, 'src/svgUtils.ts'), 'utf8');
const compiledSvgUtils = ts.transpileModule(svgUtilsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const svgUtilsModule = { exports: {} };
vm.runInNewContext(compiledSvgUtils, {
  module: svgUtilsModule,
  exports: svgUtilsModule.exports,
  console,
  DOMParser: TestDOMParser,
  XMLSerializer: TestXMLSerializer,
}, { filename: 'svgUtils.cjs' });

const { parseSvgDocument, applyAffineMatrixToPoint, multiplyAffineMatrices, parseMatrixTransform } = svgUtilsModule.exports;
const round = (value) => Number(value.toFixed(6));
const points = (model) => model.edges.map((edge) => [round(edge.start.x), round(edge.start.y), round(edge.end.x), round(edge.end.y)]);

assert.deepEqual(JSON.parse(JSON.stringify(parseMatrixTransform('matrix(1 2 3 4 5 6)'))), { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, 'space-separated matrix parses');
assert.deepEqual(JSON.parse(JSON.stringify(parseMatrixTransform('matrix(1,2,3,4,5,6)'))), { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, 'comma-separated matrix parses');
assert.deepEqual(JSON.parse(JSON.stringify(applyAffineMatrixToPoint(multiplyAffineMatrices({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 7 }, { a: 2, b: 0, c: 0, d: 2, e: 3, f: 4 }), { x: 1, y: 1 }))), { x: 10, y: 13 }, 'matrices compose and apply in SVG order');

const plain = parseSvgDocument('<svg viewBox="0 0 100 100"><rect x="10" y="20" width="30" height="40"/></svg>');
assert.equal(plain.edges.length, 4, 'plain rect creates four edges');
assert.equal(plain.panels.length, 1, 'plain rect creates one panel');
assert.deepEqual(JSON.parse(JSON.stringify(points(plain)[0])), [10, 20, 40, 20], 'plain rect first edge remains untransformed');

const lightburn = parseSvgDocument('<svg viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="20" transform="matrix(1 0 0 1 5 7)"/></svg>');
assert.equal(lightburn.edges.length, 4, 'LightBurn matrix rect creates four selectable edges');
assert.equal(lightburn.panels.length, 1, 'LightBurn matrix rect creates one panel');
assert.deepEqual(JSON.parse(JSON.stringify(points(lightburn))), [[5, 7, 15, 7], [15, 7, 15, 27], [15, 27, 5, 27], [5, 27, 5, 7]], 'LightBurn rect corners are transformed');

const negativeViewBox = parseSvgDocument('<svg viewBox="-50 -40 100 80"><rect x="0" y="0" width="10" height="20" transform="matrix(1 0 0 1 -5 -7)"/></svg>');
assert.equal(negativeViewBox.viewBox, '-50 -40 100 80', 'negative viewBox is preserved');
assert.equal(negativeViewBox.edges.length, 4, 'negative viewBox transformed rect imports');
assert.equal(negativeViewBox.panels.length, 1, 'negative viewBox transformed rect creates one panel');

const grouped = parseSvgDocument('<svg viewBox="0 0 100 100"><g transform="matrix(1 0 0 1 10 20)"><rect x="0" y="0" width="10" height="20" transform="matrix(2 0 0 2 3 4)"/></g></svg>');
assert.equal(grouped.edges.length, 4, 'grouped matrix rect creates four edges');
assert.equal(grouped.panels.length, 1, 'grouped matrix rect creates one panel');
assert.deepEqual(JSON.parse(JSON.stringify(points(grouped)[0])), [13, 24, 33, 24], 'parent and child matrices compose');

const mixed = parseSvgDocument('<svg viewBox="0 0 100 100"><path d="M 0 0 L 5 0 L 5 5 Z"/><polygon points="10,10 20,10 20,20"/><polyline points="30,30 40,30 40,40"/><line x1="50" y1="50" x2="60" y2="50"/></svg>');
assert.equal(mixed.edges.length, 9, 'paths, polygons, polylines, and lines still parse');

console.log('svg parser rect matrix tests passed');
