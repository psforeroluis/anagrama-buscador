import fs from 'node:fs'; import vm from 'node:vm';
const ROOT = new URL('..', import.meta.url).pathname;
let last=null; const ctx=vm.createContext({self:{postMessage:m=>last=m},console});
vm.runInContext(fs.readFileSync(ROOT+'/public/services/anagramSolver.ts','utf8'),ctx);
const send=d=>{ctx.self.onmessage({data:d});return last;};
send({type:'init',dictionaryText:fs.readFileSync(ROOT+'/public/services/dictionary.txt','utf8')});

const empty=()=>Array(15).fill('.'.repeat(15));
const zeros=empty().map(()=>'0'.repeat(15));
let fallos=0;
const check=(t,ok,detalle='')=>{ console.log(`${ok?'ok  ':'FALLA'} ${t}${detalle?'  '+detalle:''}`); if(!ok) fallos++; };

// 1. apertura: todas por el centro
let r=send({type:'solveBoard',payload:{board:empty(),blanksBoard:zeros,rack:'casitrz',blanks:0,limit:3000}});
check('apertura pasa por el centro', r.data.every(m=>m.tiles.some(t=>t.row===7&&t.col===7)), `${r.total} jugadas`);
check('apertura: mejor = ACTRIZ 34', r.data[0].word==='actriz'&&r.data[0].score===34, `${r.data[0].word} ${r.data[0].score}`);

// 2. medio juego + puntuación conocida
const b=empty(); b[7]='.......casa....';
r=send({type:'solveBoard',payload:{board:b,blanksBoard:zeros,rack:'oleprn',blanks:0,limit:3000,rankBy:'score'}});
check('medio juego: 923 jugadas', r.total===923, String(r.total));
check('medio juego: mejor 40 puntos', r.data[0].score===40, `${r.data[0].word} ${r.data[0].score}`);

// 3. bingo con bonus 35
r=send({type:'solveBoard',payload:{board:b,blanksBoard:zeros,rack:'retinas',blanks:0,limit:3000,rankBy:'score'}});
check('hay bingos', r.data.some(m=>m.bingo));
const bingo=r.data.find(m=>m.bingo);
check('bingo suma 35', bingo.score>=35, `${bingo.word} ${bingo.score}`);

// 4. comodín puntúa 0 y se usa
r=send({type:'solveBoard',payload:{board:b,blanksBoard:zeros,rack:'retina',blanks:1,limit:3000}});
check('usa comodín', r.data.some(m=>m.usedBlanks>0));

// 5. vetos (principal y cruzada)
const palabrasDe=(m)=>{ const g=b.map(x=>x.split('')); for(const t of m.tiles) g[t.row][t.col]=t.letter;
  const out=new Set(); const rec=get=>{ for(let a=0;a<15;a++){ let w=''; for(let bb=0;bb<15;bb++){ const ch=get(a,bb);
    if(ch!=='.') w+=ch; else { if(w.length>1) out.add(w); w=''; } } if(w.length>1) out.add(w); } };
  rec((x,y)=>g[x][y]); rec((y,x)=>g[x][y]); out.delete('casa'); return [...out]; };
for (const veto of [['an'],['casan'],['an','casan','pelon']]) {
  const res=send({type:'solveBoard',payload:{board:b,blanksBoard:zeros,rack:'oleprn',blanks:0,limit:3000,blocked:veto}});
  const set=new Set(veto);
  check(`veto ${JSON.stringify(veto)}`, !res.data.some(m=>palabrasDe(m).some(w=>set.has(w))), `${res.total} jugadas`);
}

// 6. equity
r=send({type:'solveBoard',payload:{board:b,blanksBoard:zeros,rack:'edihaez',blanks:0,limit:50,bagSize:50,rankBy:'equity'}});
check('equity prefiere HEZ sobre HAZ', r.data[0].word==='hez', `${r.data[0].word} eq ${r.data[0].equity}`);
r=send({type:'solveBoard',payload:{board:b,blanksBoard:zeros,rack:'edihaez',blanks:0,limit:50,bagSize:50,rankBy:'score'}});
check('por puntos prefiere HAZ', r.data[0].word==='haz', `${r.data[0].word} ${r.data[0].score}`);
r=send({type:'solveBoard',payload:{board:b,blanksBoard:zeros,rack:'edihaez',blanks:0,limit:50,bagSize:0,rankBy:'equity'}});
check('bolsa vacía: equity = puntos', r.data.every(m=>m.equity===m.score));

// 6b. defensa: simulación de la respuesta del rival
const defensa=(o={})=>send({type:'solveBoard',payload:{board:b,blanksBoard:zeros,rack:'oleprn',blanks:0,limit:40,bagSize:50,rankBy:'defensa',...o}});
r=defensa();
check('defensa: toda candidata trae riesgo', r.data.every(m=>typeof m.risk==='number'), `${r.data.length} simuladas`);
check('defensa: ordenada por equity neta',
      r.data.every((m,i)=>i===0||r.data[i-1].netEquity>=m.netEquity));
check('defensa: el riesgo discrimina',
      new Set(r.data.map(m=>m.risk)).size>1,
      `entre ${Math.min(...r.data.map(m=>m.risk))} y ${Math.max(...r.data.map(m=>m.risk))}`);
const r2=defensa();
check('defensa: mismo tablero, mismo consejo',
      JSON.stringify(r.data.map(m=>[m.word,m.risk]))===JSON.stringify(r2.data.map(m=>[m.word,m.risk])));

// El camino rápido (solo mejor tanteo) tiene que dar exactamente lo mismo que
// la generación completa: si no, la simulación de la defensa mentiría.
const gTras=b.map(x=>x.split(''));
for(const t of r.data[0].tiles) gTras[t.row][t.col]=t.letter;
const tableroTras=gTras.map(f=>f.join(''));

const completa=send({type:'solveBoard',payload:{board:tableroTras,blanksBoard:zeros,rack:'aeiorst',blanks:0,limit:5000,rankBy:'score'}});
const rapida=vm.runInContext(`(() => {
  const grid=[], blankGrid=[];
  const filas=${JSON.stringify(tableroTras)};
  for (let r=0;r<15;r++){
    const row=new Int8Array(15), brow=new Uint8Array(15);
    for (let c=0;c<15;c++){ const ch=filas[r][c]; row[c]= ch==='.' ? -1 : LETTER_INDEX[ch]; brow[c]=0; }
    grid.push(row); blankGrid.push(brow);
  }
  const counts=new Int32Array(ALPHABET.length);
  for (const ch of 'aeiorst') counts[LETTER_INDEX[ch]]++;
  return bestReply(grid, blankGrid, counts, 0);
})()`, ctx);
check('camino rápido = generación completa', completa.data[0].score===rapida,
      `${completa.data[0].score} vs ${rapida}`);

// 6c. vocabulario de dos letras y consulta al diccionario
const voc=send({type:'boardVocabulary'});
check('vocabulario: solo palabras de dos letras',
      voc.twoLetter.length>0 && voc.twoLetter.every(w=>w.length===2 && !/[kw]/.test(w)),
      `${voc.twoLetter.length} palabras`);
check('vocabulario: incluye AM', voc.twoLetter.includes('am'));
// Ordenado en español: la Ñ va detrás de la N, no al final como por códigos.
check('vocabulario: ordenado en español y sin repetidos',
      new Set(voc.twoLetter).size===voc.twoLetter.length
      && voc.twoLetter.every((w,i)=>i===0||voc.twoLetter[i-1].localeCompare(w,'es')<=0),
      voc.twoLetter.slice(voc.twoLetter.indexOf('na'), voc.twoLetter.indexOf('na')+6).join(' '));

check('checkWord reconoce una palabra real', send({type:'checkWord',payload:{word:'casa'}}).known);
check('checkWord rechaza un invento', !send({type:'checkWord',payload:{word:'xqzpl'}}).known);
check('checkWord rechaza una sola letra', !send({type:'checkWord',payload:{word:'a'}}).known);

// vetar una de dos letras tiene que limpiar sus cruzadas
const conAM=send({type:'solveBoard',payload:{board:b,blanksBoard:zeros,rack:'moretil',blanks:0,limit:5000}});
const sinAM=send({type:'solveBoard',payload:{board:b,blanksBoard:zeros,rack:'moretil',blanks:0,limit:5000,blocked:['am']}});
const formanAM=r=>r.data.filter(m=>palabrasDe(m).includes('am')).length;
check('vetar AM elimina sus cruzadas',
      formanAM(conAM)>0 && formanAM(sinAM)===0,
      `${formanAM(conAM)} jugadas formaban AM, ahora ${formanAM(sinAM)}`);

// 7. atril vacío no rompe
r=send({type:'solveBoard',payload:{board:empty(),blanksBoard:zeros,rack:'',blanks:0}});
check('atril vacío devuelve forma válida', Array.isArray(r.data)&&r.total===0);

// 8. buscador de anagramas sigue vivo
const an=send({type:'solve',payload:{letters:'casa',pattern:'',blanks:0}});
check('buscador de anagramas', an.data.some(w=>w.word==='casa'), `${an.data.length} palabras`);

console.log(fallos===0 ? '\nTODO CORRECTO' : `\n${fallos} FALLOS`);
process.exit(fallos?1:0);
