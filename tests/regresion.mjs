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

// 7. atril vacío no rompe
r=send({type:'solveBoard',payload:{board:empty(),blanksBoard:zeros,rack:'',blanks:0}});
check('atril vacío devuelve forma válida', Array.isArray(r.data)&&r.total===0);

// 8. buscador de anagramas sigue vivo
const an=send({type:'solve',payload:{letters:'casa',pattern:'',blanks:0}});
check('buscador de anagramas', an.data.some(w=>w.word==='casa'), `${an.data.length} palabras`);

console.log(fallos===0 ? '\nTODO CORRECTO' : `\n${fallos} FALLOS`);
process.exit(fallos?1:0);
