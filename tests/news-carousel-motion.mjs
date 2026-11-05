import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const source = fs.readFileSync('index.html', 'utf8').match(/<script id="ae-home-news-carousel-motion">([\s\S]*?)<\/script>/)[1];
for (const [body, cls] of [['ae-is-home','ae-home-news-carousel'], ['ae-is-nfl','ae-sport-news-carousel'], ['ae-is-football','ae-sport-news-carousel']]) {
  const w = new Window();
  w.document.body.className = body;
  w.document.body.innerHTML = `<div id="articlesGrid" class="${cls}"></div>`;
  const track = w.document.getElementById('articlesGrid');
  Object.defineProperty(track,'scrollWidth',{value:1000});
  Object.defineProperty(track,'clientWidth',{value:300});
  Object.defineProperty(w.document,'hidden',{value:false});
  let left = 0, next;
  Object.defineProperty(track,'scrollLeft',{get:()=>left,set:v=>{left=Math.round(v);}});
  w.matchMedia = () => ({matches:false});
  w.IntersectionObserver = class {observe() {}};
  // No observer means the lightweight loop assumes it is visible.
  delete w.IntersectionObserver;
  w.requestAnimationFrame = fn => {next=fn;};
  w.eval(source);
  for (let i=1;i<=100;i++) next(i*16);
  assert(left>25, body + ': fractional motion must accumulate even with integer scrollLeft');
  w.happyDOM.abort();
}
console.log('PASS: automatic news motion advances on Home, NFL and football with rounded browser scrolling.');
