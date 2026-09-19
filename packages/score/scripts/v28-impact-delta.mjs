import https from 'node:https';
const PROSE=/(^|[\s,>+~])(p|article|blockquote|li|dd|dt|figcaption)\b|prose|lede|measure|reading|note\b|copy\b|body-text|text-block/i;
const STRUCT=/grid|table|row|col\b|flex|swatch|chip|badge|tab\b|nav\b|toolbar|chart|canvas|pre\b|code\b|kbd/i;

// OLD implementation (verbatim logic)
function old28(css){
  const chRe=/max-width\s*:\s*(\d+(?:\.\d+)?)ch/gi; const w=[]; let m;
  while((m=chRe.exec(css))!==null) w.push(parseFloat(m[1]));
  if(!w.length) return 'WARN';
  const inR=w.filter(x=>x>=45&&x<=75), outR=w.filter(x=>x<45||x>75);
  if(inR.length>0) return 'PASS';
  return 'WARN';
}
// NEW implementation
function new28(css){
  const inR=[],outR=[],non=[];
  for(const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const sel=m[1].replace(/\/\*[\s\S]*?\*\//g,'').trim();
    if(sel.startsWith('@')) continue;
    const w=/max-width\s*:\s*(\d+(?:\.\d+)?)ch/i.exec(m[2]);
    if(!w) continue;
    const v=parseFloat(w[1]);
    const isP=PROSE.test(sel)&&!STRUCT.test(sel);
    if(!isP){non.push(v);continue;}
    if(v>=45&&v<=75) inR.push(v); else outR.push(v);
  }
  if(inR.length) return 'PASS';
  return 'WARN';
}
const SITES=[
 ['Designesy','https://www.designesy.org'],
 ['zeroheight','https://zeroheight.com'],
 ['X','https://x.com'],
 ['GitHub Primer','https://primer.style'],
 ['Atlassian DS','https://atlassian.design'],
 ['Wikipedia','https://www.wikipedia.org'],
 ['Apple','https://www.apple.com'],
 ['Vercel','https://vercel.com'],
 ['Figma','https://www.figma.com'],
 ['NYTimes','https://www.nytimes.com'],
 ['Linear','https://linear.app'],
 ['Material 3','https://m3.material.io'],
 ['Stripe','https://stripe.com'],
 ['IBM Carbon','https://carbondesignsystem.com'],
 ['Adobe Spectrum','https://spectrum.adobe.com'],
];
function get(u){return new Promise((res,rej)=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'},timeout:15000},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
let moved=0;
for(const [name,u] of SITES){
  try{
    const html=await get(u);
    const links=[...html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi)].map(m=>m[1]);
    let css='';
    for(const l of links.slice(0,4)){
      const abs=l.startsWith('http')?l:new URL(l,u).href;
      try{ css+=await get(abs); }catch{}
    }
    if(css.length<500){ console.log(`  ${name.padEnd(16)} (no css fetched)`); continue; }
    const o=old28(css), n=new28(css);
    const chg = o!==n;
    if(chg) moved++;
    console.log(`  ${name.padEnd(16)} old=${o.padEnd(5)} new=${n.padEnd(5)} ${chg?'<-- MOVES':''}`);
  }catch(e){ console.log(`  ${name.padEnd(16)} ERR ${e.message.slice(0,30)}`); }
}
console.log(`\n  ${moved} site(s) change verdict`);
