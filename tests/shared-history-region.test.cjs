const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { SharedHistoryRegion } = require('../.test-build/shared-history/SharedHistoryRegion.js');

test('one shared region preserves caller-owned BOX navigation and exposes its meaning', () => {
  const html = renderToStaticMarkup(React.createElement(SharedHistoryRegion, {
    presentation: 'workflow-navigation',
    workflowNavigation: React.createElement('button', { 'aria-pressed': true }, 'TB'),
  }));
  assert.equal((html.match(/<aside/g) || []).length, 1);
  assert.match(html, /aria-label="Construction history"/);
  assert.match(html, /aria-label="Workflow groups"/);
  assert.match(html, /BOX workflow-group navigation; persistent construction operations are not yet available/);
  assert.match(html, /<button aria-pressed="true">TB<\/button>/);
  assert.match(html, /<p[^>]*hidden=""/);
});

test('Drawing exposes an accurate empty state and hides workflow controls from interaction', () => {
  const html = renderToStaticMarkup(React.createElement(SharedHistoryRegion, {
    presentation: 'operations-unavailable', workflowNavigation: React.createElement('button', null, 'TB'),
  }));
  assert.equal((html.match(/<aside/g) || []).length, 1);
  assert.match(html, /workflow-history-content" hidden="" inert=""/);
  assert.match(html, /Construction history will appear here when persistent operations are available/);
  assert.doesNotMatch(html, /<p[^>]*hidden=/);
  assert.match(html, /tabindex="0"/);
});
