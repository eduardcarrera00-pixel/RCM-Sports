/* Structured, optional NFL choices for free Takes. Stored in existing public Take body. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const divisions={
 'AFC Este':['BUF','MIA','NE','NYJ'],'AFC Norte':['BAL','CIN','CLE','PIT'],
 'AFC Sur':['HOU','IND','JAX','TEN'],'AFC Oeste':['DEN','KC','LAC','LV'],
 'NFC Este':['DAL','NYG','PHI','WAS'],'NFC Norte':['CHI','DET','GB','MIN'],
 'NFC Sur':['ATL','CAR','NO','TB'],'NFC Oeste':['ARI','LAR','SF','SEA']
 };
 function init() {
   for(const key of ['aeNflDivision','aeNflFeedDivision']){
     const select=$(key);if(!select||select.options.length>1)continue;
     for(const division of Object.keys(divisions))option(select,division,division);
   }
   $('aeNflTitleSuggest')?.addEventListener('click',()=>{
     const form=$('freeTakesForm');if(!form||form.elements.title.value.trim())return;
     const div=$('aeNflDivision')?.value||'';
     const team=$('aeNflTeam')?.value.trim()||'';
     const topic=$('aeNflTopic')?.value.trim()||'';
     const prefix={
       'Pronóstico':'Mi pronóstico sobre ','Debate':'Mi opinión sobre ',
       'Jugador':'El jugador clave de ','Playoffs':'¿Hasta dónde llegará ',
       'Rivalidad':'La rivalidad de ','Análisis':'Mi análisis de '
     }[topic]||'Mi Take sobre ';
     form.elements.title.value=(prefix+(team||div||'la NFL')+(topic==='Playoffs'?'?':'')).slice(0,160);
     form.elements.title.focus();
   });
   $('aeNflFeedDivision')?.addEventListener('change',()=>document.dispatchEvent(new Event('ae:nfl-filter-updated')));
 }
 function visibility(isNFL){
   active=isNFL;
   if($('aeNflTakeOptions'))$('aeNflTakeOptions').hidden=!isNFL;
   if($('aeNflFeedFilterWrap'))$('aeNflFeedFilterWrap').hidden=!isNFL;
   if(!isNFL&&$('aeNflFeedDivision'))$('aeNflFeedDivision').value='';
 }
 function body(text){
   if(!active)return text;
   const div=$('aeNflDivision')?.value||'';
   const team=$('aeNflTeam')?.value.trim()||'';
   const topic=$('aeNflTopic')?.value||'';
   // Everything remains part of the immutable historical Take text, including in public profiles.
   const context=['NFL',div,team,topic].filter(Boolean).join(' · ');
   return context+'\n\n'+text;
 }
 function matches(t){
   if(!active)return true;
   const div=$('aeNflFeedDivision')?.value||'';
   if(!div)return true;
   return typeof t.body==='string' && (t.body.startsWith('NFL · '+div+' ·')||t.body.startsWith('NFL · '+div+'\n'));
 }
 window.aeNflTakes={init,visibility,body,matches};
})();
