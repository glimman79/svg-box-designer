const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { WorkspaceTopBar } = require('../.test-build/workspace-shell/WorkspaceTopBar.js');
const { WorkspaceShell } = require('../.test-build/workspace-shell/WorkspaceShell.js');
const noop = () => {};
const render = (activeWorkspace, canExport = true) => renderToStaticMarkup(React.createElement(WorkspaceTopBar, {
  activeWorkspace, canExport, onSelectWorkspace: noop, onImport: noop, onExport: noop, onClear: noop,
  history: { canUndo: activeWorkspace === 'drawing', canRedo: false, onUndo: noop, onRedo: noop },
}));
const button = (html, label) => html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0];

test('one navigation and command region, with explicit capability and ownership boundaries', () => {
  for (const module of ['drawing', 'construction']) {
    const html = render(module);
    assert.equal((html.match(/<nav /g) || []).length, 1);
    assert.equal((html.match(/aria-label="Project commands"/g) || []).length, 1);
    assert.match(html, /disabled="" title="Puzzle is not implemented"/);
    for (const command of ['Open', 'Save']) assert.match(button(html, command), /disabled=""/);
    assert.match(html, /Clear BOX \/ Construction only; Drawing is preserved/);
    assert.match(html, /Active module history; shared project Undo\/Redo is not implemented/);
    assert.equal(button(html, 'Export').includes('disabled=""'), module === 'drawing');
    assert.equal(button(html, 'Clear').includes('disabled=""'), module === 'drawing');
    const input = html.match(/<input[^>]*type="file"[^>]*>/)[0];
    assert.equal(input.includes('disabled=""'), module === 'drawing');
    assert.match(html, /class="active" aria-pressed="true"/);
  }
  assert.match(button(render('construction', false), 'Export'), /disabled=""/);
});

test('top-bar history reflects the provided module capabilities', () => {
  assert.doesNotMatch(button(render('drawing'), '↶'), /disabled=""/);
  assert.match(button(render('construction'), '↶'), /disabled=""/);
  for (const module of ['drawing', 'construction']) assert.match(button(render(module), '↷'), /disabled=""/);
});

test('viewport and workflow actions do not occupy the global top bar', () => {
  for (const module of ['drawing', 'construction']) {
    assert.doesNotMatch(render(module), />Fit(?: to screen)?<|>Apply<|>Finish[^<]*<|Active module actions/);
  }
});

test('inactive module shell retains its children and removes interaction access', () => {
  const renderShell = active => renderToStaticMarkup(React.createElement(WorkspaceShell, {
    active, className: 'drawing-workspace', label: 'Drawing', children: React.createElement('span', null, 'Document owner'),
  }));
  assert.match(renderShell(false), /hidden="" inert=""/);
  assert.match(renderShell(false), /Document owner/);
  assert.doesNotMatch(renderShell(true), /hidden=|inert=/);
});
