import { readFileSync, writeFileSync } from 'node:fs';
const d = JSON.parse(readFileSync('games.json', 'utf8'));
const out = `/* GAME RADAR — live data (IGDB) */
(function(){
  const TODAY = ${JSON.stringify(d.today)};
  const DATED = ${JSON.stringify(d.games)};
  const ANNOUNCED = ${JSON.stringify(d.announced)};
  window.GR = { TODAY, DATED, ANNOUNCED };
})();
`;
writeFileSync('data.js', out);
console.log(`✅ data.js — ${d.games.length} + ${d.announced.length} لعبة`);
