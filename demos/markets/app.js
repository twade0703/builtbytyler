/* Markets demo: the director, the replay clock, the charts. Data comes from data.js (fetch.py). */
(()=>{
"use strict";
/* ?embed: transparent page, so the window sits on whatever section hosts it */
if(new URLSearchParams(location.search).has("embed"))document.documentElement.classList.add("embed");
const D=window.MKT, $=id=>document.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), lerp=(a,b,t)=>a+(b-a)*t;
const easeOut=t=>1-Math.pow(1-clamp(t,0,1),3);
const ALL={};[...D.stocks,...D.indices].forEach(s=>ALL[s.sym]=s);
const STOCKS=D.stocks.map(s=>s.sym), IDX=D.indices.map(s=>s.sym);
const NAMES={GSPC:"S&P 500",IXIC:"Nasdaq",DJI:"Dow",RUT:"Russell 2000","BTC-USD":"Bitcoin"};
const SHORT={GSPC:"S&P 500",IXIC:"NASDAQ",DJI:"DOW",RUT:"RUSSELL 2000","BTC-USD":"BITCOIN"};

/* ---------- fit the 1280x800 frame to the viewport */
const stage=$("stage");let SC=1;
function fit(){SC=Math.min((innerWidth-32)/1280,(innerHeight-32)/800,1.25);stage.style.transform=`translate(-50%,-50%) scale(${SC})`;}
addEventListener("resize",()=>{fit();sizeAll()});fit();

/* ---------- the replay clock: the real Sep 25 session, 5-minute bars, played back smoothly */
const REPLAY_MS=70000,OPEN_AT=.42;let clock=REPLAY_MS*OPEN_AT,last=performance.now();
const frac=()=>Math.min(clock/REPLAY_MS,1);
function interp(a,f){const x=f*(a.length-1),i=Math.floor(x),j=Math.min(i+1,a.length-1);return lerp(a[i],a[j],x-i)}
const px=sym=>interp(ALL[sym].ic,frac());
const prev=sym=>ALL[sym].prev;
const dayPct=sym=>(px(sym)/prev(sym)-1)*100;
function sessionTime(){const s=ALL.NVDA,t=lerp(s.it[0],s.it[s.it.length-1],frac());
  return new Date(t*1000).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/New_York"})}
function daily(sym){const c=ALL[sym].c.slice();c[c.length-1]=px(sym);return c}

/* ---------- formatting */
const fp=p=>Math.abs(p)>=1000?p.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):p.toFixed(2);
const fs=(x,d=2)=>(x>=0?"+":"−")+Math.abs(x).toFixed(d);
const fm=x=>(x>=0?"+$":"−$")+Math.abs(x).toLocaleString("en-US",{maximumFractionDigits:0});
const cls=x=>x>1e-9?"up":x<-1e-9?"dn":"fl";
const fdate=t=>new Date(t*1000).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});

/* ---------- smooth numbers: every live figure glides to its target instead of jumping */
const LIVE=new Map();
function live(el,get,fmt,signEl){LIVE.set(el,{get,fmt,cur:null,signEl})}
function tickLive(){for(const[el,o]of LIVE){if(!el.isConnected){LIVE.delete(el);continue}
  const t=o.get();o.cur=o.cur==null?t:o.cur+(t-o.cur)*.14;if(Math.abs(t-o.cur)<Math.abs(t)*1e-6)o.cur=t;
  const txt=o.fmt(o.cur);if(el.textContent!==txt)el.textContent=txt;
  if(o.signEl!==undefined){const s=o.signEl||el,k=cls(o.cur);if(o.k!==k){s.classList.remove("up","dn","fl");s.classList.add(k);o.k=k}}}}

/* ---------- measures */
function rsi(c,n=14){let g=0,l=0;for(let i=c.length-n;i<c.length;i++){const d=c[i]-c[i-1];d>0?g+=d:l-=d}return l?100-100/(1+g/l):100}
function fit63(c){const y=c.slice(-63).map(Math.log),n=y.length;let sx=0,sy=0,sxx=0,sxy=0,syy=0;
  y.forEach((v,i)=>{sx+=i;sy+=v;sxx+=i*i;sxy+=i*v;syy+=v*v});
  const b=(n*sxy-sx*sy)/(n*sxx-sx*sx),r=(n*sxy-sx*sy)/Math.sqrt((n*sxx-sx*sx)*(n*syy-sy*sy));return{b,r2:r*r}}
function sig(sym){const c=daily(sym).slice(-WLEN(sym,"1Y")),p=c[c.length-1],hi=Math.max(...c),lo=Math.min(...c),f=fit63(c);
  return{rsi:rsi(c),rng:(p-lo)/(hi-lo),m1:(p/c[c.length-22]-1)*100,trend:f.r2<.3?"Sideways":f.b>0?"Uptrend":"Downtrend",fitq:f.r2>.6?"clean":"choppy",r2:f.r2,b:f.b}}
function vol(sym){const c=ALL[sym].c.slice(-61),r=[];for(let i=1;i<c.length;i++)r.push(Math.log(c[i]/c[i-1]));
  const m=r.reduce((a,b)=>a+b)/r.length;return Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/(r.length-1)*252)}

/* ---------- an example call, modeled with Black-Scholes from the stock's own realized volatility */
const Ncdf=x=>{const t=1/(1+.2316419*Math.abs(x)),d=.3989423*Math.exp(-x*x/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p};
function bs(S,K,T,s,r=.04){const d1=(Math.log(S/K)+(r+s*s/2)*T)/(s*Math.sqrt(T)),d2=d1-s*Math.sqrt(T);return{v:S*Ncdf(d1)-K*Math.exp(-r*T)*Ncdf(d2),delta:Ncdf(d1)}}
const OPT=(()=>{const sym="NVDA",s=ALL[sym],n=s.c.length,asof=s.t[n-1],exp=Date.UTC(2026,11,18)/1000;
  let ei=n-40;for(let i=n-40;i<n-5;i++)if(s.c[i]<s.c[ei])ei=i;  /* opened on the dip of the last two months */
  const K=Math.ceil(s.c[n-1]*1.08/5)*5,sg=vol(sym),Tn=(exp-asof)/86400/365,Te=(exp-s.t[ei])/86400/365;
  const q=3,prem=bs(s.c[ei],K,Te,sg).v;
  return{sym,K,sg,Tn,q,prem,cost:prem*100*q,be:K+prem,opened:s.t[ei],days:Math.round((exp-asof)/86400),expTxt:"Dec 18, 2026"}})();
const optVal=S=>bs(S,OPT.K,OPT.Tn,OPT.sg);
const optPL=S=>optVal(S).v*100*OPT.q-OPT.cost;

/* ---------- canvas helpers */
function sizeCanvas(cv){const r=cv.parentElement,w=r.clientWidth,h=r.clientHeight,d=(devicePixelRatio||1)*SC;
  if(cv.width!==Math.round(w*d)){cv.width=Math.round(w*d);cv.height=Math.round(h*d)}
  const x=cv.getContext("2d");x.setTransform(d,0,0,d,0,0);return{x,w,h}}
function niceStep(r){const p=Math.pow(10,Math.floor(Math.log10(r))),f=r/p;return(f<1.5?1:f<3?2:f<7?5:10)*p}
function yAxis(x,w,Y,lo,hi,padR,fmt=fp){const st=niceStep((hi-lo)/4);x.font="11.5px JetBrains Mono";x.textBaseline="middle";x.textAlign="left";
  for(let p=Math.ceil(lo/st)*st;p<=hi;p+=st){const y=Math.round(Y(p))+.5;x.strokeStyle="rgba(255,255,255,.05)";x.beginPath();x.moveTo(0,y);x.lineTo(w-padR,y);x.stroke();
    x.fillStyle="#9A9AA2";x.fillText(fmt(p),w-padR+8,y)}}
function line(x,pts,col,wid=1.8,glow=14){x.save();x.beginPath();pts.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));
  x.strokeStyle=col;x.lineWidth=wid;x.lineJoin="round";x.lineCap="round";x.shadowColor=col;x.shadowBlur=glow;x.stroke();x.restore()}
function area(x,pts,rgb,bottom,top){if(pts.length<2)return;const g=x.createLinearGradient(0,top,0,bottom);g.addColorStop(0,`rgba(${rgb},.26)`);g.addColorStop(1,`rgba(${rgb},0)`);
  x.beginPath();pts.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.lineTo(pts[pts.length-1][0],bottom);x.lineTo(pts[0][0],bottom);x.closePath();x.fillStyle=g;x.fill()}
function endDot(x,a,b,col,rgb,now){const k=(now%1800)/1800;x.beginPath();x.arc(a,b,4+k*14,0,7);x.fillStyle=`rgba(${rgb},${.35*(1-k)})`;x.fill();
  x.beginPath();x.arc(a,b,4,0,7);x.fillStyle=col;x.shadowColor=col;x.shadowBlur=12;x.fill();x.shadowBlur=0}

/* ---------- cards */
const WIN={"1D":0,"1M":22,"6M":127,"1Y":253};
/* bars in a window; crypto trades every day, so its year is 365 bars not 252 */
const WLEN=(sym,w)=>w==="1D"?0:Math.round((WIN[w]-1)*(sym==="BTC-USD"?365/252:1))+1;

/* ---------- technicals, computed from the real daily bars (today's bar is the replayed session) */
function bars(sym){const s=ALL[sym],n=s.c.length,p=px(sym),o=s.o.slice(),h=s.h.slice(),l=s.l.slice(),c=s.c.slice();
  const k=Math.floor(frac()*(s.ic.length-1)),seen=s.ic.slice(0,k+1).concat([p]);
  c[n-1]=p;h[n-1]=Math.max(o[n-1],...seen);l[n-1]=Math.min(o[n-1],...seen);return{o,h,l,c,t:s.t}}
function smaArr(c,k){const r=new Array(c.length).fill(null);let s=0;for(let i=0;i<c.length;i++){s+=c[i];if(i>=k)s-=c[i-k];if(i>=k-1)r[i]=s/k}return r}
function emaArr(c,k){const a=2/(k+1),r=[];let e=c[0];for(let i=0;i<c.length;i++){e=i?c[i]*a+e*(1-a):c[0];r.push(e)}return r}
function bbArr(c,k=20,m=2){const mid=smaArr(c,k),up=[],dn=[],sd=[];
  for(let i=0;i<c.length;i++){if(mid[i]==null){up.push(null);dn.push(null);sd.push(null);continue}
    let v=0;for(let j=i-k+1;j<=i;j++)v+=(c[j]-mid[i])**2;const s=Math.sqrt(v/k);sd.push(s);up.push(mid[i]+m*s);dn.push(mid[i]-m*s)}return{mid,up,dn,sd}}
function macdArr(c){const e12=emaArr(c,12),e26=emaArr(c,26),m=c.map((_,i)=>e12[i]-e26[i]),sg=emaArr(m,9);return{e12,e26,m,sg,h:m.map((v,i)=>v-sg[i])}}
function tech(sym){const b=bars(sym);return{...b,s50:smaArr(b.c,50),s200:smaArr(b.c,200),bb:bbArr(b.c),md:macdArr(b.c)}}
const IND=["candle","bb","s50","s200","macd"];
const INDN={candle:["Candles","#00C805"],bb:["Bollinger","#D2D2DC"],s50:["SMA 50","#FFD60A"],s200:["SMA 200","#6BB3FF"],macd:["MACD","#FFFFFF"]};
function setInd(c,k,on){const o=c._ind[k];if(!!o.on===!!on)return;o.on=on?1:0;o.t=performance.now();
  const b=c.querySelector(`.chips [data-i="${k}"]`);if(b)b.classList.toggle("on",!!on)}
/* r = how far across it has drawn, a = how visible it is */
function ik(c,k,now,dur=1600){const o=c._ind[k];if(!o.t)return{r:0,a:0};const p=now-o.t;return o.on?{r:easeOut(p/dur),a:1}:{r:1,a:1-easeOut(p/450)}}
function morph(c,k,now,dur=1100){const o=c._ind[k];if(!o.t)return 0;const p=now-o.t;return o.on?easeOut(p/dur):1-easeOut(p/600)}
function feed(c,now,html,key){if(now-(c._ft||0)<48||!c._hud||key===c._fk)return;c._ft=now;c._fk=key;  /* one line per bar, never the same bar twice */
  const d=document.createElement("div");d.innerHTML=html;
  c._hud.prepend(d);while(c._hud.children.length>6)c._hud.lastChild.remove();c._hud.classList.add("show");
  clearTimeout(c._hudT);c._hudT=setTimeout(()=>c._hud&&c._hud.classList.remove("show"),1600)}
const cards=[$("cA"),$("cB")];let front=$("cB"),swapT=null;
function sizeAll(){cards.forEach(c=>c._cv&&sizeCanvas(c._cv))}

function stockCard(c,v){const s=ALL[v.sym],isIdx=IDX.includes(v.sym),g=sig(v.sym);
  c.querySelector(".c-in").innerHTML=`
  <div class="c-hd"><div><div class="c-sym"><b>${isIdx?SHORT[v.sym]:v.sym}</b>${isIdx?(v.sym==="BTC-USD"?"BTC · USD":"Index"):s.name}</div>
    <div class="c-px" data-l="px"></div><div class="c-chg"><b data-l="chg"></b> <span data-l="per"></span></div></div>
    <div class="tools"><div class="seg">${Object.keys(WIN).map(w=>`<button data-w="${w}" class="${w===v.win?"on":""}">${w}</button>`).join("")}</div>
    ${v.win==="1D"?"":`<div class="chips">${IND.map(k=>`<button data-i="${k}" style="--c:${INDN[k][1]}"><i></i>${INDN[k][0]}</button>`).join("")}</div>`}</div></div>
  <div class="c-ch"><canvas></canvas><div class="hud"></div><div class="tip"></div></div>
  <div class="c-sig">
    <div class="sg"><small>RSI 14</small><b class="${g.rsi>70?"up":g.rsi<30?"dn":""}">${g.rsi.toFixed(0)}<span>${g.rsi>70?"hot":g.rsi<30?"washed out":"balanced"}</span></b><div class="meter rsi"><u data-to="${g.rsi}"></u></div></div>
    <div class="sg"><small>52-week range</small><b>${Math.round(g.rng*100)}%<span>of the way up</span></b><div class="meter"><i data-to="${g.rng*100}" style="background:#fff"></i></div></div>
    <div class="sg"><small>1 month</small><b class="${cls(g.m1)}">${fs(g.m1,1)}%</b><div class="meter"><i data-to="${clamp(Math.abs(g.m1)*2.5,2,100)}" style="background:${g.m1>=0?"var(--ok)":"var(--bad)"}"></i></div></div>
    <div class="sg"><small>Trend · 3 months</small><b class="${g.trend==="Uptrend"?"up":g.trend==="Downtrend"?"dn":""}">${g.trend}<span>${g.fitq}</span></b><div class="meter"><i data-to="${g.r2*100}" style="background:var(--mu)"></i></div></div>
  </div>`;
  const q=k=>c.querySelector(`[data-l="${k}"]`);
  live(q("px"),()=>px(v.sym),fp);
  const base=()=>c._v.win==="1D"?prev(v.sym):(()=>{const d=ALL[v.sym].c;return d[d.length-Math.min(WLEN(v.sym,c._v.win),d.length)]})();  /* same first point the chart draws */
  live(q("chg"),()=>(px(v.sym)/base()-1)*100,x=>`${fs(px(v.sym)-base())} (${fs(x)}%)`,null);
  q("per").textContent={"1D":"today","1M":"past month","6M":"past 6 months","1Y":"past year"}[v.win];
}
function compareCard(c,v){const[a,b]=v.pair;
  c.querySelector(".c-in").innerHTML=`
  <div class="c-hd"><div><div class="c-sym"><b>${SHORT[a]}</b>vs ${SHORT[b]} · past year</div>
    <div class="c-px"><span data-l="ra"></span></div>
    <div class="legend"><span><i style="background:var(--ok)"></i>${NAMES[a]} <b data-l="la"></b></span><span><i style="background:#fff"></i>${NAMES[b]} <b data-l="lb"></b></span></div></div>
    <div class="seg"><button class="on">1Y</button></div></div>
  <div class="c-ch"><canvas></canvas><div class="hud"></div><div class="tip"></div></div>
  <div class="c-sig">
    ${[a,b].map(s=>`<div class="sg"><small>${NAMES[s]} · today</small><b data-l="t${s}"></b><div class="meter"><i data-to="${clamp(Math.abs(dayPct(s))*40,3,100)}" style="background:${dayPct(s)>=0?"var(--ok)":"var(--bad)"}"></i></div></div>`).join("")}
    ${[a,b].map(s=>{const g=sig(s);return`<div class="sg"><small>${NAMES[s]} · RSI</small><b>${g.rsi.toFixed(0)}<span>${g.trend.toLowerCase()}</span></b><div class="meter rsi"><u data-to="${g.rsi}"></u></div></div>`}).join("")}
  </div>`;
  const q=k=>c.querySelector(`[data-l="${k}"]`),yr=s=>(px(s)/ALL[s].c[ALL[s].c.length-WLEN(s,"1Y")]-1)*100;
  live(q("ra"),()=>yr(a),x=>`${fs(x,1)}%`,null);
  live(q("la"),()=>yr(a),x=>`${fs(x,1)}%`,null);live(q("lb"),()=>yr(b),x=>`${fs(x,1)}%`,null);
  [a,b].forEach(s=>live(q("t"+s),()=>dayPct(s),x=>`${fs(x)}%`,null));
}
function optionCard(c){const o=OPT;
  c.querySelector(".c-in").innerHTML=`
  <div class="c-hd"><div><div class="c-sym"><b>${o.sym} $${o.K} Call</b>Expires ${o.expTxt} · ${o.q} contracts</div>
    <div class="c-px" data-l="pl"></div><div class="c-chg"><b data-l="plp"></b> <span>since ${fdate(o.opened).replace(/, \d{4}/,"")} · example position</span></div></div>
    <div class="seg"><button class="on">P/L</button></div></div>
  <div class="c-ch"><canvas></canvas><div class="hud"></div><div class="tip"></div></div>
  <div class="c-sig six">
    <div class="sg"><small>Cost</small><b>$${Math.round(o.cost).toLocaleString()}</b></div>
    <div class="sg"><small>Value now</small><b data-l="val"></b></div>
    <div class="sg"><small>${o.sym} now</small><b data-l="spot"></b></div>
    <div class="sg"><small>Breakeven</small><b>$${fp(o.be)}</b></div>
    <div class="sg"><small>Delta</small><b data-l="dl"></b></div>
    <div class="sg"><small>Days left</small><b>${o.days}</b></div>
  </div>`;
  const q=k=>c.querySelector(`[data-l="${k}"]`),S=()=>c._optS??px(o.sym);
  live(q("pl"),()=>optPL(S()),fm,null);
  live(q("plp"),()=>optPL(S())/o.cost*100,x=>`${fs(x,1)}%`,null);
  live(q("val"),()=>optVal(S()).v*100*o.q,x=>"$"+Math.round(x).toLocaleString());
  live(q("spot"),S,x=>"$"+fp(x));
  live(q("dl"),()=>optVal(S()).delta,x=>x.toFixed(2));
}

function render(c,v){c._v=v;c._rev=0;c._t0=null;c._optS=null;c._sweep=null;c._hover=null;c._lo=null;
  c._ind=Object.fromEntries(IND.map(k=>[k,{on:0,t:0}]));
  ({stock:stockCard,compare:compareCard,option:optionCard})[v.kind](c,v);
  c._cv=c.querySelector("canvas");c._tip=c.querySelector(".tip");sizeCanvas(c._cv);
  c._hud=c.querySelector(".hud");
  c.querySelectorAll(".seg [data-w]").forEach(b=>b.onclick=()=>{userTook();const keep=IND.filter(k=>c._ind[k].on);
    render(c,{...c._v,win:b.dataset.w});arm(c);keep.forEach(k=>setInd(c,k,1))});
  c.querySelectorAll(".chips [data-i]").forEach(b=>b.onclick=()=>{userTook();const k=b.dataset.i;setInd(c,k,!c._ind[k].on)});
  const box=c.querySelector(".c-ch");
  box.onpointermove=e=>{const r=box.getBoundingClientRect();c._hover=(e.clientX-r.left)/r.width;};
  box.onpointerleave=()=>{c._hover=null;c._tip.classList.remove("show")};
}
function arm(c){c._t0=performance.now();c.querySelectorAll(".meter i,.meter u").forEach(m=>{m.style.transition="none";m.tagName==="I"?m.style.width="0":m.style.left="0";
  void m.offsetWidth;m.style.transition="";});
  setTimeout(()=>c.querySelectorAll(".meter i").forEach(m=>m.style.width=m.dataset.to+"%"),60);
  setTimeout(()=>c.querySelectorAll(".meter u").forEach(m=>m.style.left=m.dataset.to+"%"),60)}

function same(a,b){return a&&b&&JSON.stringify(a)===JSON.stringify(b)}
function show(v,fast){
  if(same(front._v,v))return;
  const next=cards.find(c=>c!==front),cur=front,deck=$("deck");
  if(swapT){clearTimeout(swapT);swapT=null;cards.forEach(c=>{if(c.classList.contains("out")){c.classList.add("nt");c.classList.remove("out");c.classList.add("back");void c.offsetWidth;c.classList.remove("nt")}})}
  deck.classList.toggle("fast",!!fast);
  render(next,v);
  next.classList.remove("back");next.classList.add("front");cur.classList.remove("front","glow");cur.classList.add("out");
  front=next;arm(next);syncList();
  swapT=setTimeout(()=>{cur.classList.add("nt");cur.classList.remove("out");cur.classList.add("back");void cur.offsetWidth;cur.classList.remove("nt");swapT=null},fast?480:820);
}

/* ---------- drawing, every frame */
function drawCard(c,now){if(!c._v||!c._cv)return;const{x,w,h}=sizeCanvas(c._cv),v=c._v;
  const rev=c._t0?easeOut((now-c._t0)/(c.parentElement.classList.contains("fast")?900:1500)):0;
  x.clearRect(0,0,w,h);
  if(v.kind==="option")return drawOption(c,x,w,h,rev,now);
  if(v.kind==="stock"&&v.win!=="1D")return drawTech(c,x,w,h,rev,now);
  const padR=74,padB=24,top=8,ph=h-padB-top;
  let series,sl,base,labels,times,second=null;
  if(v.kind==="compare"){const[a,b]=v.pair,A=daily(a).slice(-WLEN(a,"1Y")),B=daily(b).slice(-WLEN(b,"1Y"));series=A.map(p=>(p/A[0]-1)*100);second=B.map(p=>(p/B[0]-1)*100);sl=series.length;base=0;times=ALL[a].t.slice(-WLEN(a,"1Y"))}
  else if(v.win==="1D"){const s=ALL[v.sym],n=s.ic.length,xf=frac()*(n-1),k=Math.floor(xf);series=s.ic.slice(0,k+1);series.push(px(v.sym));if(xf===k)series.pop();
    sl=n;base=prev(v.sym);times=s.it}
  else{const d=daily(v.sym),k=Math.min(WIN[v.win],d.length);series=d.slice(-k);sl=series.length;base=series[0];times=ALL[v.sym].t.slice(-k)}
  const pool=v.kind==="compare"?series.concat(second):v.win==="1D"?ALL[v.sym].ic.concat([base]):series;
  let lo=Math.min(...pool),hi=Math.max(...pool);const pd=(hi-lo)*.08;lo-=pd;hi+=pd;
  const X=i=>(w-padR)*(i/(sl-1)),Y=p=>top+(hi-p)/(hi-lo)*ph;
  yAxis(x,w,Y,lo,hi,padR,v.kind==="compare"?(p=>fs(p,0)+"%"):fp);
  /* x labels */
  x.fillStyle="#9A9AA2";x.font="11.5px JetBrains Mono";x.textAlign="center";x.textBaseline="alphabetic";
  for(let k=0;k<4;k++){const i=Math.round((sl-1)*k/3),t=times[i];if(t==null)continue;
    const lab=v.win==="1D"&&v.kind!=="compare"?new Date(t*1000).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/New_York"}):new Date(t*1000).toLocaleDateString("en-US",{month:"short",year:v.win==="1M"?undefined:"2-digit",day:v.win==="1M"?"numeric":undefined,timeZone:"UTC"});
    x.fillText(lab,clamp(X(i),26,w-padR-26),h-5)}
  if(v.kind==="compare"||v.win==="1D"){const y=Y(base);x.setLineDash([2,5]);x.strokeStyle="rgba(255,255,255,.25)";x.beginPath();x.moveTo(0,y);x.lineTo(w-padR,y);x.stroke();x.setLineDash([]);
    x.fillStyle="#B8B8BF";x.textAlign="left";x.fillText(v.kind==="compare"?"start":"prev close",4,y-6)}
  const endV=series[series.length-1],upw=endV>=base,col=upw?"#00C805":"#FF5000",rgb=upw?"0,200,5":"255,80,0";
  const upTo=Math.max(1,Math.floor(rev*(series.length-1)));
  const pts=series.slice(0,upTo+1).map((p,i)=>[X(i),Y(p)]);
  if(rev<1&&upTo<series.length-1){const f=rev*(series.length-1)-upTo,a=series[upTo],b=series[upTo+1];pts.push([X(upTo+f),Y(lerp(a,b,f))])}
  if(v.kind==="compare"){const A="#00C805";const p2=second.slice(0,upTo+1).map((p,i)=>[X(i),Y(p)]);
    area(x,pts,"0,200,5",top+ph,top);line(x,p2,"rgba(255,255,255,.85)",1.5,8);line(x,pts,A,1.8,14);
    const e=pts[pts.length-1];endDot(x,e[0],e[1],A,"0,200,5",now);const e2=p2[p2.length-1];x.beginPath();x.arc(e2[0],e2[1],3.5,0,7);x.fillStyle="#fff";x.fill()}
  else{area(x,pts,rgb,top+ph,top);line(x,pts,col);const e=pts[pts.length-1];endDot(x,e[0],e[1],col,rgb,now);
    if(rev>=1){const ly=Y(endV);x.fillStyle=col;x.beginPath();x.roundRect(w-padR+3,ly-10,padR-4,20,4);x.fill();
      x.fillStyle="#000";x.font="600 12px JetBrains Mono";x.textBaseline="middle";x.textAlign="left";x.fillText(fp(endV),w-padR+8,ly)}}
  /* crosshair */
  if(c._hover!=null&&rev>=1){const i=clamp(Math.round(c._hover*(w)/(w-padR)*(sl-1)),0,series.length-1),hx=X(i),hy=Y(series[i]);
    x.strokeStyle="rgba(255,255,255,.3)";x.beginPath();x.moveTo(hx+.5,top);x.lineTo(hx+.5,top+ph);x.stroke();
    x.beginPath();x.arc(hx,hy,4.5,0,7);x.fillStyle="#fff";x.fill();
    const t=times[i],when=v.win==="1D"&&v.kind!=="compare"?new Date(t*1000).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/New_York"}):fdate(t);
    const chg=v.kind==="compare"?series[i]:(series[i]/base-1)*100;
    c._tip.innerHTML=v.kind==="compare"?`<span>${when}</span><br>${NAMES[v.pair[0]]} <b class="${cls(series[i])}">${fs(series[i],1)}%</b><br>${NAMES[v.pair[1]]} <b class="${cls(second[i])}">${fs(second[i],1)}%</b>`
      :`<span>${when}</span><br><b>$${fp(series[i])}</b> <b class="${cls(chg)}">${fs(chg)}%</b>`;
    c._tip.classList.add("show");const tw=c._tip.offsetWidth;c._tip.style.left=(hx+14+tw>w-padR?hx-14-tw:hx+14)+"px";c._tip.style.top=clamp(hy-50,0,h-60)+"px"}
}
function drawOption(c,x,w,h,rev,now){const o=OPT,padR=80,padB=24,top=10,ph=h-padB-top,S0=px(o.sym);
  const lo=S0*.8,hi=S0*1.28,xs=[];for(let i=0;i<=120;i++)xs.push(lerp(lo,hi,i/120));
  const today=xs.map(optPL),expiry=xs.map(s=>Math.max(s-o.K,0)*100*o.q-o.cost);
  let ymin=Math.min(...today,...expiry),ymax=Math.max(...today,...expiry);const pd=(ymax-ymin)*.08;ymin-=pd;ymax+=pd;
  const X=s=>(s-lo)/(hi-lo)*(w-padR),Y=v=>top+(ymax-v)/(ymax-ymin)*ph;
  yAxis(x,w,Y,ymin,ymax,padR,v=>(v>=0?"+":"−")+"$"+Math.abs(v/1000).toFixed(v%1000?1:0)+"k");
  x.fillStyle="#9A9AA2";x.font="11.5px JetBrains Mono";x.textAlign="center";x.textBaseline="alphabetic";
  for(let k=0;k<5;k++){const s=lerp(lo,hi,k/4);x.fillText("$"+s.toFixed(0),clamp(X(s),22,w-padR-22),h-5)}
  const y0=Y(0);x.strokeStyle="rgba(255,255,255,.28)";x.beginPath();x.moveTo(0,y0);x.lineTo(w-padR,y0);x.stroke();
  [[o.K,"strike"],[o.be,"breakeven"]].forEach(([s,l])=>{const a=X(s);x.setLineDash([2,5]);x.strokeStyle="rgba(255,255,255,.22)";x.beginPath();x.moveTo(a,top);x.lineTo(a,top+ph);x.stroke();x.setLineDash([]);
    x.fillStyle="#B8B8BF";x.textAlign="left";x.fillText(`${l} $${s.toFixed(0)}`,a+5,top+10+(l==="breakeven"?14:0))});
  const n=Math.max(2,Math.round(rev*today.length)),pt=today.slice(0,n).map((v,i)=>[X(xs[i]),Y(v)]),pe=expiry.slice(0,n).map((v,i)=>[X(xs[i]),Y(v)]);
  /* shade gain green, loss orange */
  x.save();x.beginPath();x.rect(0,top,w-padR,y0-top);x.clip();area(x,pt,"0,200,5",y0,top);x.restore();
  x.save();x.beginPath();x.rect(0,y0,w-padR,top+ph-y0);x.clip();
  x.beginPath();pt.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.lineTo(pt[pt.length-1][0],y0);x.lineTo(pt[0][0],y0);x.closePath();x.fillStyle="rgba(255,80,0,.16)";x.fill();x.restore();
  x.setLineDash([4,4]);line(x,pe,"rgba(255,255,255,.4)",1.2,0);x.setLineDash([]);
  line(x,pt,"#00C805",2,16);
  /* the marker: live price, a what-if sweep during the scene, or wherever the pointer is */
  let S=S0,what=false;
  if(c._hover!=null){S=lerp(lo,hi,clamp(c._hover*w/(w-padR),0,1));what=true}
  else if(c._sweep){const t=(now-c._sweep)/7000;if(t<1){S=S0*(1+.16*(1-Math.cos(2*Math.PI*t))/2);what=t>.08&&t<.92}else c._sweep=null}
  c._optS=Math.abs(S-S0)<.005?null:S;
  if(rev>=1){const a=X(S),pl=optPL(S),b=Y(pl),col=pl>=0?"#00C805":"#FF5000";
    x.strokeStyle="rgba(255,255,255,.35)";x.beginPath();x.moveTo(a+.5,top);x.lineTo(a+.5,top+ph);x.stroke();
    endDot(x,a,b,col,pl>=0?"0,200,5":"255,80,0",now);
    const lab=what?`If ${o.sym} is $${fp(S)}`:`${o.sym} now $${fp(S)}`;x.font="600 12.5px JetBrains Mono";const tw=x.measureText(lab).width+18;
    const lx=a+12+tw>w-padR?a-12-tw:a+12;x.fillStyle="rgba(12,12,14,.92)";x.strokeStyle="rgba(255,255,255,.14)";x.beginPath();x.roundRect(lx,clamp(b-38,top,top+ph-44),tw,40,6);x.fill();x.stroke();
    x.fillStyle="#fff";x.textAlign="left";x.textBaseline="middle";x.fillText(lab,lx+9,clamp(b-38,top,top+ph-44)+13);
    x.fillStyle=col;x.fillText(fm(pl),lx+9,clamp(b-38,top,top+ph-44)+28)}
}

/* ---------- a daily chart with its technicals: line or candles, bands, averages, MACD */
function drawTech(c,x,w,h,rev,now){const v=c._v,T=tech(v.sym),N=T.c.length,k=Math.min(WLEN(v.sym,v.win),N),off=N-k;
  const padR=74,padB=24,top=8,ph=h-padB-top,Xw=w-padR,X=i=>Xw*(i/(k-1));
  const ck=morph(c,"candle",now),mk=morph(c,"macd",now,900),bb=ik(c,"bb",now),s50=ik(c,"s50",now),s200=ik(c,"s200",now),md=ik(c,"macd",now);
  const mainH=ph*(1-.3*mk);
  /* the scale eases toward whatever is showing, so adding an average zooms the view instead of jumping it */
  let lo=Infinity,hi=-Infinity;const acc=a=>{for(let i=off;i<N;i++){const y=a[i];if(y!=null){if(y<lo)lo=y;if(y>hi)hi=y}}};
  if(ck>.01){acc(T.l);acc(T.h)}else acc(T.c);
  if(bb.a>.01){acc(T.bb.up);acc(T.bb.dn)}if(s50.a>.01)acc(T.s50);if(s200.a>.01)acc(T.s200);
  const pd=(hi-lo)*.07;lo-=pd;hi+=pd;
  if(c._lo==null){c._lo=lo;c._hi=hi}else{c._lo+=(lo-c._lo)*.09;c._hi+=(hi-c._hi)*.09}
  const L=c._lo,H=c._hi,Y=p=>top+(H-p)/(H-L)*mainH;
  yAxis(x,w,Y,L,H,padR);
  const times=T.t.slice(off);
  x.fillStyle="#9A9AA2";x.font="11.5px JetBrains Mono";x.textAlign="center";x.textBaseline="alphabetic";
  for(let j=0;j<4;j++){const i=Math.round((k-1)*j/3);x.fillText(new Date(times[i]*1000).toLocaleDateString("en-US",{month:"short",day:v.win==="1M"?"numeric":undefined,year:v.win==="1M"?undefined:"2-digit",timeZone:"UTC"}),clamp(X(i),26,Xw-26),h-5)}
  const series=T.c.slice(off),base=series[0],endV=series[k-1],upw=endV>=base,col=upw?"#00C805":"#FF5000",rgb=upw?"0,200,5":"255,80,0";
  const pts=(arr,r)=>{const out=[],fi=r*(k-1);for(let i=0;i<=Math.floor(fi);i++){const y=arr[off+i];if(y!=null)out.push([X(i),Y(y)])}return out};
  x.save();x.beginPath();x.rect(0,0,Xw*rev+1,top+mainH+1);x.clip();
  /* Bollinger: the band fill first, then its edges and the dashed mean */
  if(bb.a>.01){const U=pts(T.bb.up,bb.r),Dn=pts(T.bb.dn,bb.r),M=pts(T.bb.mid,bb.r);
    if(U.length>1){x.globalAlpha=bb.a;x.beginPath();U.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));for(let i=Dn.length-1;i>=0;i--)x.lineTo(Dn[i][0],Dn[i][1]);
      x.closePath();x.fillStyle="rgba(210,210,230,.06)";x.fill();line(x,U,"rgba(210,210,220,.6)",1,0);line(x,Dn,"rgba(210,210,220,.6)",1,0);
      x.setLineDash([3,4]);line(x,M,"rgba(255,255,255,.28)",1,0);x.setLineDash([]);x.globalAlpha=1}}
  /* the price: the line fades out as the candles grow out of it, oldest first */
  if(ck<.99){x.globalAlpha=1-ck;const P=series.map((p,i)=>[X(i),Y(p)]);area(x,P,rgb,top+mainH,top);line(x,P,col);x.globalAlpha=1}
  if(ck>.01){const bw=Math.max(1.2,Xw/k*.62);
    for(let i=0;i<k;i++){const g=off+i,ki=clamp(ck*1.8-(i/k)*.8,0,1);if(ki<=0)continue;
      const o=T.o[g],cc=T.c[g],up=cc>=o,cl=up?"#00C805":"#FF5000",xc=X(i),yc=Y(cc);
      const yo=lerp(yc,Y(o),ki),yh=lerp(yc,Y(T.h[g]),ki),yl=lerp(yc,Y(T.l[g]),ki);
      x.globalAlpha=Math.min(1,ki*1.6);x.strokeStyle=cl;x.fillStyle=cl;x.lineWidth=1;
      x.beginPath();x.moveTo(Math.round(xc)+.5,yh);x.lineTo(Math.round(xc)+.5,yl);x.stroke();
      x.fillRect(xc-bw/2,Math.min(yo,yc),bw,Math.max(1,Math.abs(yo-yc)))}x.globalAlpha=1}
  /* moving averages */
  [[s50,T.s50,"#FFD60A"],[s200,T.s200,"#6BB3FF"]].forEach(([q,a,cl])=>{if(q.a>.01){x.globalAlpha=q.a;line(x,pts(a,q.r),cl,1.6,8);x.globalAlpha=1}});
  /* the most recent 50/200 cross in view, once both lines have reached it */
  if(s50.a>.01&&s200.a>.01){let ci=null;for(let i=1;i<k;i++){const g=off+i;if(T.s200[g-1]==null)continue;
      if(Math.sign(T.s50[g]-T.s200[g])!==Math.sign(T.s50[g-1]-T.s200[g-1]))ci=i}
    if(ci!=null&&Math.min(s50.r,s200.r)*(k-1)>=ci){const g=off+ci,gold=T.s50[g]>T.s200[g],a=X(ci),b=Y(T.s50[g]),
        p=clamp((now-(c._crossT||(c._crossT=now)))/700,0,1)*Math.min(s50.a,s200.a),lab=(gold?"Golden cross · ":"Death cross · ")+fdate(T.t[g]).replace(/, \d{4}/,"");
      x.globalAlpha=p;x.beginPath();x.arc(a,b,5+6*(1-p),0,7);x.strokeStyle=gold?"#FFD60A":"#FF5000";x.lineWidth=1.5;x.stroke();x.lineWidth=1;
      x.font="600 12px JetBrains Mono";const tw=x.measureText(lab).width+16,lx=clamp(a-tw/2,0,Xw-tw),ly=b+14;
      x.fillStyle="rgba(12,12,14,.9)";x.strokeStyle="rgba(255,214,10,.4)";x.beginPath();x.roundRect(lx,ly,tw,20,10);x.fill();x.stroke();
      x.fillStyle=gold?"#FFD60A":"#FF5000";x.textAlign="left";x.textBaseline="middle";x.fillText(lab,lx+8,ly+10);x.globalAlpha=1}
    else c._crossT=null}
  x.restore();
  if(rev>=1){const ly=Y(endV);x.fillStyle=col;x.beginPath();x.roundRect(w-padR+3,ly-10,padR-4,20,4);x.fill();
    x.fillStyle="#000";x.font="600 12px JetBrains Mono";x.textBaseline="middle";x.textAlign="left";x.fillText(fp(endV),w-padR+8,ly);
    if(ck<.5){x.globalAlpha=1-ck*2;endDot(x,X(k-1),ly,col,rgb,now);x.globalAlpha=1}}
  /* MACD pane slides up from under the price */
  if(mk>.02){const pt=top+mainH+12,phm=top+ph-pt;if(phm>10){const M=T.md;let A=0;for(let i=off;i<N;i++)A=Math.max(A,Math.abs(M.m[i]),Math.abs(M.sg[i]));
      const Ym=q=>pt+phm/2-q/A*phm/2*.88,y0=Ym(0),fi=Math.floor(md.r*(k-1)),bw=Math.max(1.2,Xw/k*.62);
      x.globalAlpha=mk;x.strokeStyle="rgba(255,255,255,.08)";x.beginPath();x.moveTo(0,pt-6.5);x.lineTo(Xw,pt-6.5);x.stroke();
      x.strokeStyle="rgba(255,255,255,.18)";x.beginPath();x.moveTo(0,y0+.5);x.lineTo(Xw,y0+.5);x.stroke();
      for(let i=0;i<=fi;i++){const q=M.h[off+i];x.fillStyle=q>=0?"rgba(0,200,5,.55)":"rgba(255,80,0,.55)";x.fillRect(X(i)-bw/2,Math.min(y0,Ym(q)),bw,Math.abs(Ym(q)-y0))}
      const lm=[],ls=[];for(let i=0;i<=fi;i++){lm.push([X(i),Ym(M.m[off+i])]);ls.push([X(i),Ym(M.sg[off+i])])}
      line(x,lm,"#FFFFFF",1.3,6);x.setLineDash([3,3]);line(x,ls,"rgba(255,214,10,.8)",1.1,0);x.setLineDash([]);
      x.fillStyle="#B8B8BF";x.font="11.5px JetBrains Mono";x.textAlign="left";x.textBaseline="top";x.fillText(`MACD 12 26 9   ${M.m[N-1].toFixed(2)}  signal ${M.sg[N-1].toFixed(2)}`,4,pt-2);
      x.globalAlpha=1}}
  /* legend: the live value of everything switched on */
  const hi_=c._hover!=null&&rev>=1?clamp(Math.round(c._hover*w/Xw*(k-1)),0,k-1):k-1,gh=off+hi_;
  let lx=4;x.font="12px JetBrains Mono";x.textBaseline="top";x.textAlign="left";
  [[bb,`BB 20 2  ${fp(T.bb.up[gh])} / ${fp(T.bb.dn[gh])}`,"#D2D2DC"],[s50,`SMA 50  ${fp(T.s50[gh])}`,"#FFD60A"],[s200,`SMA 200  ${T.s200[gh]==null?"—":fp(T.s200[gh])}`,"#6BB3FF"]]
    .forEach(([q,t,cl])=>{if(q.a<=.01)return;x.globalAlpha=q.a;x.fillStyle=cl;x.fillText(t,lx,top+2);lx+=x.measureText(t).width+18;x.globalAlpha=1});
  /* the readout: the calculation behind whatever is drawing right now, bar by bar */
  const drawing=IND.filter(q=>c._ind[q].on&&(q==="candle"?ck<1:ik(c,q,now).r<1)&&c._ind[q].t);
  if(drawing.length&&rev>=1){c._fc=(c._fc||0)+1;const q=drawing[c._fc%drawing.length],r=q==="candle"?ck:ik(c,q,now).r,g=off+Math.floor(r*(k-1));
    const d=`<span>${new Date(T.t[g]*1000).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"})}</span>`;
    const html={candle:()=>`${d}O ${fp(T.o[g])}  H ${fp(T.h[g])}  L ${fp(T.l[g])}  C <b style="--k:${T.c[g]>=T.o[g]?"#00C805":"#FF5000"}">${fp(T.c[g])}</b>`,
      bb:()=>T.bb.mid[g]==null?"":`${d}μ20 ${fp(T.bb.mid[g])}  σ ${T.bb.sd[g].toFixed(2)}  ±2σ <b style="--k:#D2D2DC">${fp(T.bb.up[g])} / ${fp(T.bb.dn[g])}</b>`,
      s50:()=>T.s50[g]==null?"":`${d}Σ close[50] ÷ 50 = <b style="--k:#FFD60A">${fp(T.s50[g])}</b>`,
      s200:()=>T.s200[g]==null?"":`${d}Σ close[200] ÷ 200 = <b style="--k:#6BB3FF">${fp(T.s200[g])}</b>`,
      macd:()=>`${d}EMA12 ${fp(T.md.e12[g])} − EMA26 ${fp(T.md.e26[g])} = <b>${T.md.m[g].toFixed(2)}</b>  sig ${T.md.sg[g].toFixed(2)}`}[q]();
    if(html)feed(c,now,html,q+g)}
  /* crosshair */
  if(c._hover!=null&&rev>=1){const hx=X(hi_),hy=Y(T.c[gh]);
    x.strokeStyle="rgba(255,255,255,.3)";x.beginPath();x.moveTo(hx+.5,top);x.lineTo(hx+.5,top+ph);x.stroke();
    x.beginPath();x.arc(hx,hy,4.5,0,7);x.fillStyle="#fff";x.fill();
    const chg=(T.c[gh]/base-1)*100;
    c._tip.innerHTML=`<span>${fdate(T.t[gh])}</span><br>`+(ck>.5?`<span>O</span> ${fp(T.o[gh])} <span>H</span> ${fp(T.h[gh])}<br><span>L</span> ${fp(T.l[gh])} <span>C</span> <b>${fp(T.c[gh])}</b>`:`<b>$${fp(T.c[gh])}</b>`)+
      ` <b class="${cls(chg)}">${fs(chg)}%</b>`+(md.a>.01?`<br><span>MACD</span> ${T.md.m[gh].toFixed(2)}`:"");
    c._tip.classList.add("show");const tw=c._tip.offsetWidth;c._tip.style.left=(hx+14+tw>Xw?hx-14-tw:hx+14)+"px";c._tip.style.top=clamp(hy-60,0,h-80)+"px"}
}

/* ---------- the top strip and the list */
const ixEl={};
$("ixs").innerHTML=IDX.map(s=>`<button class="ix" data-s="${s}"><small>${NAMES[s]}</small><b data-l="v"></b><em data-l="p"></em><svg viewBox="0 0 64 26" preserveAspectRatio="none"><polyline fill="none" stroke-width="1.4" stroke-linejoin="round"/></svg></button>`).join("");
document.querySelectorAll(".ix").forEach(b=>{const s=b.dataset.s;ixEl[s]=b;
  live(b.querySelector('[data-l="v"]'),()=>px(s),fp);live(b.querySelector('[data-l="p"]'),()=>dayPct(s),x=>`${fs(x)}%`,null);
  b.onclick=()=>{userTook();show(s==="GSPC"||s==="IXIC"?{kind:"compare",pair:["GSPC","IXIC"]}:{kind:"stock",sym:s,win:"1Y"})}});
function ixSparks(){IDX.forEach(s=>{const a=ALL[s],n=a.ic.length,k=Math.max(2,Math.round(frac()*(n-1))+1),sl=a.ic.slice(0,k);
  const all=a.ic.concat([a.prev]),mn=Math.min(...all),mx=Math.max(...all);
  const pl=ixEl[s].querySelector("polyline");pl.setAttribute("points",sl.map((p,i)=>`${(i/(n-1)*64).toFixed(1)},${(24-(p-mn)/(mx-mn)*22).toFixed(1)}`).join(" "));
  pl.setAttribute("stroke",sl[sl.length-1]>=a.prev?"#00C805":"#FF5000")})}

$("rows").innerHTML=STOCKS.map(s=>{const c=ALL[s].c.slice(-22),mn=Math.min(...c),mx=Math.max(...c),up=c[c.length-1]>=c[0];
  return `<button class="row" data-s="${s}"><div><b>${s}</b><small>${ALL[s].name}</small></div>
  <svg viewBox="0 0 66 24" width="66" height="24"><polyline points="${c.map((p,i)=>`${(i/21*66).toFixed(1)},${(22-(p-mn)/(mx-mn)*20).toFixed(1)}`).join(" ")}" fill="none" stroke="${up?"#00C805":"#FF5000"}" stroke-width="1.3" stroke-linejoin="round"/></svg>
  <div class="p"><b data-l="v"></b><span class="pill" data-l="p"></span></div></button>`}).join("");
document.querySelectorAll(".row").forEach(r=>{const s=r.dataset.s;
  live(r.querySelector('[data-l="v"]'),()=>px(s),fp);
  const pill=r.querySelector('[data-l="p"]');live(pill,()=>dayPct(s),x=>`${fs(x)}%`,null);
  r.onclick=()=>{userTook();show({kind:"stock",sym:s,win:front._v&&front._v.win&&front._v.kind==="stock"?front._v.win:"1Y"})}});
function syncList(){const v=front._v||{};const on=v.kind==="stock"||v.kind==="option"?v.sym||OPT.sym:null;
  document.querySelectorAll(".row").forEach(r=>r.classList.toggle("on",r.dataset.s===on));
  document.querySelectorAll(".ix").forEach(b=>b.classList.toggle("on",v.kind==="compare"?v.pair.includes(b.dataset.s):v.sym===b.dataset.s))}

live($("kUp"),()=>STOCKS.concat(IDX).filter(s=>dayPct(s)>0).length,x=>Math.round(x));
live($("kDn"),()=>STOCKS.concat(IDX).filter(s=>dayPct(s)<0).length,x=>Math.round(x));

/* ---------- the director: scenes play like an ad until someone takes the wheel */
const SC_=[
 {h:"Every market you care about.",p:"In one calm window.",d:6000,v:{kind:"stock",sym:"NVDA",win:"1D"}},
 {h:"Any stock you want.",p:"Apple.",d:1500,v:{kind:"stock",sym:"AAPL",win:"1Y"},fast:1},
 {h:"Any stock you want.",p:"Apple. Tesla.",d:1500,v:{kind:"stock",sym:"TSLA",win:"1Y"},fast:1},
 {h:"Any stock you want.",p:"Apple. Tesla. Microsoft.",d:1500,v:{kind:"stock",sym:"MSFT",win:"1Y"},fast:1},
 {h:"Any stock you want.",p:"Apple. Tesla. Microsoft. AMD.",d:4200,v:{kind:"stock",sym:"AMD",win:"1Y"},fast:1},
 {h:"Any index you want.",p:"The S&P 500 against the Nasdaq, side by side.",d:5800,v:{kind:"compare",pair:["GSPC","IXIC"]}},
 {h:"Crypto, too.",p:"Bitcoin, around the clock.",d:4200,v:{kind:"stock",sym:"BTC-USD",win:"1Y"}},
 {h:"Every technical, drawn for you.",p:"Candles.",d:3400,v:{kind:"stock",sym:"MSFT",win:"6M"},ind:["candle"]},
 {h:"Every technical, drawn for you.",p:"Candles. Bollinger Bands.",d:3400,v:{kind:"stock",sym:"MSFT",win:"6M"},ind:["candle","bb"]},
 {h:"Every technical, drawn for you.",p:"Candles. Bollinger Bands. The 50 and 200-day.",d:4600,v:{kind:"stock",sym:"MSFT",win:"6M"},ind:["candle","bb","s50","s200"]},
 {h:"Every technical, drawn for you.",p:"Candles. Bollinger Bands. The 50 and 200-day. MACD.",d:5600,v:{kind:"stock",sym:"MSFT",win:"6M"},ind:["candle","bb","s50","s200","macd"]},
 {h:"Track your option calls.",p:"Cost, value, breakeven, and what happens if it runs.",d:8500,v:{kind:"option",sym:"NVDA"},sweep:1},
 {h:"Know where it leans.",p:"RSI, trend and range, measured for you.",d:5500,v:{kind:"stock",sym:"PLTR",win:"6M"},glow:1},
 {h:"Built around the way you watch.",p:"Custom software, made for you.",d:6000,v:{kind:"stock",sym:"META",win:"1D"}},
];
const st={i:-1,el:0,auto:true,hov:false,idle:0};
$("dots").insertAdjacentHTML("afterbegin",SC_.map((_,i)=>`<button data-i="${i}" aria-label="Scene ${i+1}"><i></i></button>`).join(""));
const dotEls=[...$("dots").querySelectorAll("[data-i]")];
dotEls.forEach(b=>b.onclick=()=>{st.auto=true;go(+b.dataset.i);setPlay()});
function words(el,txt,from){const keep=from&&txt.startsWith(from)?from:"";
  el.innerHTML=(keep?`<span>${keep}</span>`:"")+txt.slice(keep.length).split(/(\s+)/).map((w,i)=>w.trim()?`<span class="w" style="animation-delay:${i*45}ms">${w}</span>`:w).join("")}
let capH="",capP="";
function caption(h,p){if(h!==capH)words($("capH"),h,"");words($("capP"),p,h===capH?capP:"");capH=h;capP=p}
function go(i){st.i=(i+SC_.length)%SC_.length;st.el=0;const s=SC_[st.i];
  const stay=same(front._v,s.v);show(s.v,s.fast);caption(s.h,s.p);
  if(s.ind){const c=front;setTimeout(()=>{if(front===c&&SC_[st.i]===s)IND.forEach(k=>setInd(c,k,s.ind.includes(k)))},stay?0:900)}
  if(s.sweep)setTimeout(()=>{if(front._v.kind==="option")front._sweep=performance.now()},1300);
  if(s.glow)setTimeout(()=>{if(SC_[st.i]===s)front.classList.add("glow")},900);
  if(st.i===0)clock=REPLAY_MS*OPEN_AT;  /* each loop opens mid-morning, so the first chart already has a shape */
  dotEls.forEach((d,k)=>{d.classList.toggle("done",k<st.i);d.querySelector("i").style.transform=k<st.i?"scaleX(1)":"scaleX(0)"})}
function setPlay(){$("play").innerHTML=st.auto?"❚❚&nbsp;Pause":"▶&nbsp;Play"}
$("play").onclick=()=>{st.auto=!st.auto;if(st.auto)go(st.i+1);setPlay()};
function userTook(){if(st.auto){st.auto=false;setPlay();caption("Go ahead, click around.","It picks back up when you step away.")}st.idle=0}
$("app").addEventListener("pointermove",()=>{st.idle=0});
$("deck").addEventListener("pointerenter",()=>st.hov=true);$("deck").addEventListener("pointerleave",()=>st.hov=false);
$("lr").onclick=()=>{const w=$("win");w.classList.remove("shake");void w.offsetWidth;w.classList.add("shake")};
$("src").textContent=`Public market data · ${fdate(ALL.NVDA.t[ALL.NVDA.t.length-1])} session replay · option modeled`;

/* ---------- one loop drives everything */
let sparkT=0;
function frame(now){const dt=Math.min(now-last,100);last=now;
  clock+=dt;if(clock>REPLAY_MS+2500)clock=0;
  if(st.auto&&!st.hov){st.el+=dt;const s=SC_[st.i];if(s){dotEls[st.i].querySelector("i").style.transform=`scaleX(${Math.min(st.el/s.d,1)})`;if(st.el>=s.d)go(st.i+1)}}
  if(!st.auto){st.idle+=dt;if(st.idle>9000){st.auto=true;setPlay();go(st.i+1)}}
  tickLive();$("kT").textContent=sessionTime();
  if(now-sparkT>200){ixSparks();sparkT=now}
  cards.forEach(c=>{if(c.classList.contains("front")||c.classList.contains("out"))drawCard(c,now)});
  requestAnimationFrame(frame)}
setPlay();
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{sizeAll();go(0);requestAnimationFrame(frame)});
})();
