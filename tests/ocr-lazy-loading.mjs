import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const capture=fs.readFileSync('assets/ae-pick-capture.js','utf8');
assert.doesNotMatch(html,/<script[^>]+src="assets\/ae-pick-capture-parser\.js/, 'The parser must not block the initial page load');
assert.match(html, /<script src="assets\/ae-pick-capture\.js/, 'The screenshot editor UI still mounts immediately');
assert.match(capture, /new URL\('ae-pick-capture-parser\.js\?v=/, 'The parser is requested from its original assets directory');
assert.match(capture, /Promise\.all\(\[engine\(\),parser\(\)\]\)/, 'OCR parser and worker load together after the upload');
assert.match(capture, /parserPromise=null/, 'A failed parser load remains retryable');
console.log('PASS: 73 KB OCR parser deferred until screenshot upload; editor remains eager.');
