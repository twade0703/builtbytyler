/* Markets demo v5: one chart, a watchlist, key stats and alerts.
   Data is data.js (fetch.py): two years of daily OHLC per symbol plus the last session
   in 5-minute bars, all public. The session is replayed: the clock starts early in the
   afternoon so the day chart is already drawn, runs to the close, holds, and starts over.
   Contract with software.html: it iframes this page (?embed = transparent page, frame
   fills the iframe), takes no input in the small preview, and opens it full size in a
   dialog. The page plays a tour on its own; the first touch hands over the controls. */
(()=>{
"use strict";
const EMBED=new URLSearchParams(location.search).has("embed");
if(EMBED)document.documentElement.classList.add("embed");
const D=window.MKT,$=id=>document.getElementById(id),root=document.documentElement;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>1-Math.pow(1-clamp(t,0,1),3);
const RM=matchMedia("(prefers-reduced-motion: reduce)").matches;
const ALL={};[...D.stocks,...D.indices].forEach(s=>ALL[s.sym]=s);
const WL=D.stocks.map(s=>s.sym),IX=D.indices.map(s=>s.sym);
const KIND=s=>s==="BTC-USD"?"Crypto":IX.includes(s)?"Index":"Stock";
const TITLE=s=>KIND(s)==="Index"?ALL[s].name:s;          /* S&P 500 / NVDA / BTC-USD */
const SUB=s=>KIND(s)==="Index"?"Index":ALL[s].name;
const NY="America/New_York";

/* ---------- formatting: one Intl formatter per option set, made once */
const _f=new Map();
const DF=o=>{const k="d"+JSON.stringify(o);let f=_f.get(k);if(!f)_f.set(k,f=new Intl.DateTimeFormat("en-US",o));return f};
const NF=o=>{const k="n"+JSON.stringify(o);let f=_f.get(k);if(!f)_f.set(k,f=new Intl.NumberFormat("en-US",o));return f};
const fp=p=>p==null||!isFinite(p)?"—":NF({minimumFractionDigits:2,maximumFractionDigits:2}).format(p);
const sg=x=>x>=0?"+":"−";
const arrow=x=>x>=0?"▲":"▼";
const cls=x=>x>=0?"up":"dn";
const fpct=x=>`${sg(x)}${Math.abs(x).toFixed(2)}%`;
const fvol=v=>v>=1e9?(v/1e9).toFixed(2)+"B":v>=1e6?(v/1e6).toFixed(1)+"M":NF({}).format(Math.round(v));
const ftime=t=>DF({hour:"numeric",minute:"2-digit",timeZone:NY}).format(new Date(t*1000));
const fhour=t=>DF({hour:"numeric",timeZone:NY}).format(new Date(t*1000));
const fday=t=>DF({month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(t*1000));
const fmd=t=>DF({month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(t*1000));
const fmon=t=>DF({month:"short",timeZone:"UTC"}).format(new Date(t*1000));
const fyr=t=>DF({year:"numeric",timeZone:"UTC"}).format(new Date(t*1000));

/* ---------- the replay clock */
const F0=.62,RUN=150000,HOLD=6000;
let clock=0;
const frac=()=>F0+(1-F0)*Math.min(clock/RUN,1);
/* Catmull-Rom through the 5-minute closes: the price moves smoothly between bars */
function interp(a,f){const x=clamp(f,0,1)*(a.length-1),i=Math.floor(x),t=x-i,g=k=>a[clamp(k,0,a.length-1)],p0=g(i-1),p1=g(i),p2=g(i+1),p3=g(i+2);
  return p1+.5*t*(p2-p0+t*(2*p0-5*p1+4*p2-p3+t*(3*(p1-p2)+p3-p0)))}
const px=s=>interp(ALL[s].ic,frac());
const prev=s=>ALL[s].prev;
const dayChg=s=>px(s)-prev(s),dayPct=s=>(px(s)/prev(s)-1)*100;
const tAt=(s,f)=>{const it=ALL[s].it;return lerp(it[0],it[it.length-1],f)};
function dayHL(s){const a=ALL[s].ic,f=frac(),k=Math.floor(f*(a.length-1)),p=px(s);let lo=p,hi=p;
  for(let i=0;i<=k;i++){if(a[i]<lo)lo=a[i];if(a[i]>hi)hi=a[i]}return[lo,hi]}
/* the session so far, as points on a 0..1 session axis */
function dayPts(s){const a=ALL[s].ic,n=a.length,f=frac(),k=Math.floor(f*(n-1)),out=[];
  for(let i=0;i<=k;i++)out.push({x:i/(n-1),y:a[i],t:ALL[s].it[i]});
  if(f*(n-1)>k+1e-6)out.push({x:f,y:px(s),t:tAt(s,f),live:1});else out[out.length-1].live=1;
  return out}
/* daily bars; the last one is today's and is built from the replay so far */
const RANGES=[["1D","1D",0],["1M","1M",21],["3M","3M",63],["1Y","1Y",252],["2Y","2Y",1e9]];
const RWORD={"1M":"past month","3M":"past 3 months","1Y":"past year","2Y":"past 2 years"};
const RN=r=>RANGES.find(x=>x[0]===r)[2];
function bars(s,N){const d=ALL[s],n=d.c.length,st=Math.max(0,n-N),[lo,hi]=dayHL(s),out=[];
  for(let i=st;i<n-1;i++)out.push({t:d.t[i],o:d.o[i],h:d.h[i],l:d.l[i],c:d.c[i],v:d.v[i]});
  out.push({t:d.t[n-1],o:d.o[n-1],h:Math.max(hi,d.o[n-1]),l:Math.min(lo,d.o[n-1]),c:px(s),v:d.v[n-1]*frac(),live:1});
  return out}
function rangeBase(s,N){const c=ALL[s].c,n=c.length;return c[Math.max(0,n-1-N)]}

/* ---------- key stats that do not move with the replay, made once per symbol */
const STAT={};
function statics(s){if(STAT[s])return STAT[s];const d=ALL[s],n=d.c.length;
  const v30=d.v.slice(n-31,n-1),avgV=v30.reduce((a,b)=>a+b,0)/v30.length;
  const c=d.c.slice(n-32,n-1),r=[];for(let i=1;i<c.length;i++)r.push(Math.log(c[i]/c[i-1]));
  const m=r.reduce((a,b)=>a+b,0)/r.length,sd=Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/(r.length-1));
  const yh=Math.max(...d.h.slice(n-252,n-1)),yl=Math.min(...d.l.slice(n-252,n-1));
  return STAT[s]={open:d.o[n-1],avgV,vol:sd*Math.sqrt(s==="BTC-USD"?365:252)*100,yh,yl}}

/* ---------- alerts: levels the replayed session really crosses, worked out from the data */
const ALERTS=(()=>{const step=p=>p<20?.05:p<100?.25:p<500?.5:p<2000?1:p<10000?5:p<50000?25:50;
  /* a level 75% of the way to the furthest point the price reached in [fa,fb], and when it first got there */
  function cand(s,fa,fb){const a=ALL[s].ic,p0=interp(a,fa);let mx=-Infinity,mn=Infinity;
    for(let f=fa;f<=fb;f+=1/800){const v=interp(a,f);if(v>mx)mx=v;if(v<mn)mn=v}
    const st=step(p0),up=Math.floor((p0+(mx-p0)*.75)/st)*st,dn=Math.ceil((p0-(p0-mn)*.75)/st)*st;
    const mu=(up-p0)/p0,md=(p0-dn)/p0,dir=mu>=md?1:-1,lv=dir>0?up:dn,mag=Math.max(mu,md);
    let tf=null;for(let f=fa;f<=fb;f+=1/1600){const v=interp(a,f);if(dir>0?v>=lv:v<=lv){tf=f;break}}
    return{s,dir,lv,tf,mag}}
  const all=[...WL,...IX];
  /* one that went off this morning, before the replay starts */
  const early=all.map(s=>cand(s,0,F0-.02)).filter(c=>c.tf!=null&&c.mag>=.004&&c.tf>.03).sort((a,b)=>b.mag-a.mag);
  /* two that go off while it plays: the first to fire, and the biggest move */
  const not=(c,...x)=>!x.some(y=>y&&y.s===c.s);
  const first=all.map(s=>cand(s,F0,F0+.1)).filter(c=>c.tf!=null&&c.mag>=.001&&c.tf>F0+.02&&not(c,early[0])).sort((a,b)=>b.mag-a.mag)[0];
  const big=all.map(s=>cand(s,F0,1)).filter(c=>c.tf!=null&&c.mag>=.002&&c.tf>F0+.03&&c.tf<.985&&not(c,early[0],first)).sort((a,b)=>b.mag-a.mag)[0];
  const pick=[early[0],first,big].filter(Boolean).sort((a,b)=>a.tf-b.tf);
  /* and one this session never reaches, so the list shows both states */
  const w=WL.find(s=>!pick.some(p=>p.s===s));
  if(w){const a=ALL[w].ic;let mn=Infinity;for(let f=0;f<=1;f+=1/800)mn=Math.min(mn,interp(a,f));
    const st=step(mn);pick.push({s:w,dir:-1,lv:Math.floor(mn*.988/st)*st,tf:null})}
  return pick})();

/* ---------- the fixed frame, scaled to its host like a video */
const stage=$("stage");let SC=1;
function fit(){const flow=innerWidth<760&&innerHeight>innerWidth*1.05;root.classList.toggle("flow",flow);
  if(flow){SC=1;stage.style.transform="none"}
  else{const m=EMBED?0:24;SC=clamp(Math.min((innerWidth-2*m)/1312,(innerHeight-2*m)/832),.1,EMBED?4:1.25);
    stage.style.transform=`translate(-50%,-50%) scale(${SC})`}
  sizeCv()}

/* ---------- view state */
const view={s:"NVDA",r:"1D",t:"line"};
const shownType=()=>view.r==="1D"?"line":view.t;
let rev0=-1e9,yS=null,hover=null;

/* ---------- build the static DOM */
const tape=$("tape"),rows=$("rows");
tape.innerHTML=IX.map(s=>`<button class="ix" data-s="${s}" type="button"><span>${ALL[s].name}</span><b data-k="p"></b><em data-k="c"></em></button>`).join("");
rows.innerHTML=WL.map(s=>`<button class="row" data-s="${s}" type="button"><div class="n"><b>${s}</b><span>${ALL[s].name}</span></div>
  <svg viewBox="0 0 72 26" preserveAspectRatio="none" aria-hidden="true"><path class="b" d="" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1" stroke-dasharray="1.5 2.5" vector-effect="non-scaling-stroke"/><path class="l" d="" fill="none" stroke-width="1.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
  <div class="p"><b data-k="p"></b><em data-k="c"></em></div></button>`).join("");
$("wlN").textContent=WL.length+" symbols";
$("ranges").innerHTML=RANGES.map(([k,l])=>`<button type="button" data-r="${k}">${l}</button>`).join("");
$("types").innerHTML=`<button type="button" data-t="line">Line</button><button type="button" data-t="candle">Candles</button>`;
const SDEF=[["open","Open"],["prev","Prev close"],["day","Day range"],["yr","52-week range"],["avgv","Avg volume (30D)"],["vol","Volatility (30D)"]];
$("stats").innerHTML=SDEF.map(([k,l])=>`<div class="st"><dt>${l}</dt><dd data-k="${k}"></dd>${k==="day"||k==="yr"?`<div class="rng" data-r="${k}"><i></i></div>`:""}</div>`).join("");
const CHECK=`<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
$("alerts").innerHTML=ALERTS.map((a,i)=>`<div class="al" data-i="${i}"><div class="c"><b>${TITLE(a.s)}</b><span>${a.dir>0?"Above":"Below"} ${fp(a.lv)}</span></div><div class="s"><b></b><span></span></div></div>`).join("");
$("alN").textContent=ALERTS.length+" active";
const S0=ALL.NVDA;
const speed=Math.round((S0.it[S0.it.length-1]-S0.it[0])*(1-F0)/(RUN/1000));
$("src").textContent=`Public market data · ${fday(S0.t[S0.t.length-1])} session, replayed at ${speed}× speed · Not live prices`;

/* ---------- selecting things */
function setView(v,anim=true){const was=view.s+view.r+shownType();Object.assign(view,v);
  if(was!==view.s+view.r+shownType()){rev0=anim&&!RM?performance.now():-1e9;yS=null;tipKey=null}
  const s=view.s;$("sym").textContent=TITLE(s);$("nm").textContent=SUB(s);$("kind").textContent=KIND(s);
  document.querySelectorAll(".row,.ix").forEach(b=>b.classList.toggle("on",b.dataset.s===s));
  document.querySelectorAll("#ranges button").forEach(b=>{const on=b.dataset.r===view.r;b.classList.toggle("on",on);b.setAttribute("aria-selected",on)});
  document.querySelectorAll("#types button").forEach(b=>{const on=b.dataset.t===shownType();b.classList.toggle("on",on);b.setAttribute("aria-selected",on);
    if(b.dataset.t==="candle"){b.disabled=view.r==="1D";b.title=view.r==="1D"?"The replay has 5-minute closes, not intraday candles":""}});
  $("ckey").classList.toggle("show",shownType()==="candle");
  readouts(true)}

/* ---------- read-outs: written five times a second, which is as fast as a quote is read */
function setTxt(el,t){if(el.textContent!==t)el.textContent=t}
function setCls(el,k){if(!el.classList.contains(k)){el.classList.remove("up","dn","fl");el.classList.add(k)}}
function readouts(){const s=view.s,p=px(s),d=dayChg(s),pc=dayPct(s);
  setTxt($("px"),fp(p));
  const ch=$("chg"),ct=`${arrow(d)} ${sg(d)}${fp(Math.abs(d))} (${fpct(pc)})`;
  if(ch._t!==ct){ch._t=ct;ch.innerHTML=`${ct}<span>Today</span>`;setCls(ch,cls(d))}
  const rc=$("rchg");if(view.r==="1D"){if(rc._t!==""){rc._t="";rc.innerHTML="";}}
  else{const b=rangeBase(s,RN(view.r)),x=(p/b-1)*100,t=`${arrow(x)} ${fpct(x)}`;
    if(rc._t!==t+view.r){rc._t=t+view.r;rc.innerHTML=`${t}<span>${RWORD[view.r]}</span>`;setCls(rc,cls(x))}}
  const st=statics(s),[lo,hi]=dayHL(s),yh=Math.max(st.yh,hi),yl=Math.min(st.yl,lo),q=k=>document.querySelector(`#stats [data-k="${k}"]`);
  setTxt(q("open"),fp(st.open));setTxt(q("prev"),fp(prev(s)));
  setTxt(q("day"),`${fp(lo)} – ${fp(hi)}`);setTxt(q("yr"),`${fp(yl)} – ${fp(yh)}`);
  setTxt(q("avgv"),fvol(st.avgV));setTxt(q("vol"),st.vol.toFixed(1)+"%");
  document.querySelector('#stats [data-r="day"] i').style.left=(hi>lo?(p-lo)/(hi-lo)*100:50)+"%";
  document.querySelector('#stats [data-r="yr"] i').style.left=(yh>yl?(p-yl)/(yh-yl)*100:50)+"%";
  for(const b of document.querySelectorAll(".row,.ix")){const x=b.dataset.s,v=dayPct(x);
    setTxt(b.querySelector('[data-k="p"]'),fp(px(x)));const e=b.querySelector('[data-k="c"]');setTxt(e,`${arrow(v)} ${fpct(v)}`);setCls(e,cls(v))}
  const f=frac();
  ALERTS.forEach((a,i)=>{const el=document.querySelector(`.al[data-i="${i}"]`),hit=a.tf!=null&&f>=a.tf;
    if(hit!==!!el._hit){el._hit=hit;el.classList.toggle("hit",hit);
      if(hit&&el._init){el.classList.remove("flash");void el.offsetWidth;el.classList.add("flash");clearTimeout(el._ft);el._ft=setTimeout(()=>el.classList.remove("flash"),2500)}}
    if(hit)el.querySelector(".s").innerHTML=`<b>${CHECK}Triggered</b><span>${ftime(tAt(a.s,a.tf))} ET</span>`;
    else{const dist=Math.abs(px(a.s)/a.lv-1)*100,t=`${dist.toFixed(2)}% away`;if(el._d!==t){el._d=t;el.querySelector(".s").innerHTML=`<b>Waiting</b><span>${t}</span>`}}
    el._init=true});
  const sess=$("sess"),closed=clock>=RUN;sess.classList.toggle("closed",closed);
  setTxt($("sessL"),`${fmd(S0.t[S0.t.length-1])} · ${closed?"Closed":"Replay"}`);setTxt($("sessT"),ftime(tAt("NVDA",frac()))+" ET")}

/* sparklines: the session so far against the previous close, on a fixed scale */
const SPK={};
function sparks(){for(const b of rows.children){const s=b.dataset.s,a=ALL[s].ic,n=a.length;
  let k=SPK[s];if(!k){let lo=Math.min(prev(s),...a),hi=Math.max(prev(s),...a);k=SPK[s]={lo,hi};
    const y=v=>(24-(v-lo)/(hi-lo)*22).toFixed(2);b.querySelector(".b").setAttribute("d",`M0 ${y(prev(s))}H72`);k.y=y}
  const pts=dayPts(s);b.querySelector(".l").setAttribute("d","M"+pts.map(p=>`${(p.x*72).toFixed(2)} ${k.y(p.y)}`).join("L"));
  b.querySelector(".l").setAttribute("stroke",s===view.s?"#5FE6FF":"rgba(232,238,246,.6)")}}

/* ---------- the chart */
const cv=$("cv"),cx=cv.getContext("2d"),box=$("chart");let CW=1,CH=1,K=1;
function sizeCv(){CW=Math.max(1,box.clientWidth);CH=Math.max(1,box.clientHeight);K=(devicePixelRatio||1)*SC;
  const w=Math.round(CW*K),h=Math.round(CH*K);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}}
if("ResizeObserver"in window)new ResizeObserver(sizeCv).observe(box);
function niceStep(r){const p=Math.pow(10,Math.floor(Math.log10(r))),f=r/p;return(f<1.5?1:f<3?2:f<7?5:10)*p}
const C={ink:"#E8EEF6",mu:"#8D99AB",dim:"#5D687A",ac:"#5FE6FF",up:"#56C292",dn:"#E8846E",bg:"#060A10",grid:"rgba(150,200,230,.07)"};
const FONT=w=>`${w} 11.5px "Instrument Sans", system-ui, sans-serif`;
function label(x,y,t,col,align="left",bg=true){cx.font=FONT(500);cx.textAlign=align;cx.textBaseline="middle";
  if(bg){const w=cx.measureText(t).width,x0=align==="left"?x:align==="right"?x-w:x-w/2;cx.fillStyle=C.bg;cx.fillRect(x0-4,y-8,w+8,16)}
  cx.fillStyle=col;cx.fillText(t,x,y)}
let tipKey=null;const tip=$("tip");
function draw(now){
  const s=view.s,ty=shownType(),day=view.r==="1D",p=px(s),AX=64,TOP=22,BOT=26,pw=CW-AX,y0=TOP,y1=CH-BOT;
  cx.setTransform(K,0,0,K,0,0);cx.clearRect(0,0,CW,CH);if(pw<40||y1-y0<40)return;
  const pts=day?dayPts(s):null,bs=day?null:bars(s,RN(view.r)),N=bs?bs.length:0,slot=bs?pw/N:0;
  const vH=day?0:(y1-y0)*.16,py1=day?y1:y1-vH-14;
  /* the y range, eased so a new high stretches the scale instead of jolting it */
  let lo=Infinity,hi=-Infinity;const see=v=>{if(v<lo)lo=v;if(v>hi)hi=v};
  if(day){pts.forEach(q=>see(q.y));see(prev(s))}else if(ty==="candle")bs.forEach(b=>{see(b.h);see(b.l)});else bs.forEach(b=>see(b.c));
  const al=ALERTS.find(a=>a.s===s);if(al&&al.lv>lo-(hi-lo)*.6&&al.lv<hi+(hi-lo)*.6)see(al.lv);
  let span=Math.max(hi-lo,p*.004);const tl=lo-span*.08,th=hi+span*.1;
  if(!yS)yS={lo:tl,hi:th};else{yS.lo+=(tl-yS.lo)*.08;yS.hi+=(th-yS.hi)*.08}
  const L=yS.lo,H=yS.hi,Y=v=>py1-(v-L)/(H-L)*(py1-y0);
  const X=day?(f=>f*pw):(i=>slot*(i+.5));
  /* grid and price axis */
  const st=niceStep((H-L)/5);cx.font=FONT(400);cx.textBaseline="middle";cx.textAlign="left";
  const tagY=Y(p);
  for(let v=Math.ceil(L/st)*st;v<=H;v+=st){const y=Math.round(Y(v))+.5;if(y<y0-2||y>py1+2)continue;
    cx.fillStyle=C.grid;cx.fillRect(0,y,pw,1);if(Math.abs(y-tagY)>13){cx.fillStyle=C.dim;cx.fillText(fp(v),pw+12,y)}}
  cx.fillStyle="rgba(150,200,230,.12)";cx.fillRect(0,Math.round(y1)+.5,pw,1);
  /* time axis */
  cx.fillStyle=C.dim;cx.textAlign="center";const xl=[];
  if(day){const it=ALL[s].it,n=it.length;for(let i=1;i<n;i++)if(it[i]%3600===0)xl.push([i/(n-1)*pw,fhour(it[i])])}
  else{bs.forEach((b,i)=>{if(N<=30){if((N-1-i)%5===0)xl.push([X(i),fmd(b.t)])}
    else if(i&&fmon(b.t)!==fmon(bs[i-1].t)){const m=fmon(b.t);xl.push([X(i),m==="Jan"?fyr(b.t):m])}})}
  let lastX=-1e9;for(const[x,t]of xl){if(x-lastX<58||x<18||x>pw-18)continue;cx.fillText(t,x,y1+15);lastX=x}
  /* the drawing, revealed left to right when the view changes */
  const r=ease((now-rev0)/700);
  cx.save();cx.beginPath();cx.rect(-2,0,pw*r+2,CH);cx.clip();
  let endX,endY;
  if(day||ty==="line"){const P=day?pts.map(q=>[X(q.x),Y(q.y)]):bs.map((b,i)=>[X(i),Y(b.c)]);
    const g=cx.createLinearGradient(0,y0,0,py1);g.addColorStop(0,"rgba(95,230,255,.10)");g.addColorStop(1,"rgba(95,230,255,0)");
    cx.beginPath();P.forEach(([a,b],i)=>i?cx.lineTo(a,b):cx.moveTo(a,b));cx.lineTo(P[P.length-1][0],py1);cx.lineTo(P[0][0],py1);cx.closePath();cx.fillStyle=g;cx.fill();
    cx.beginPath();P.forEach(([a,b],i)=>i?cx.lineTo(a,b):cx.moveTo(a,b));cx.strokeStyle=C.ac;cx.lineWidth=1.7;cx.lineJoin="round";cx.stroke();
    [endX,endY]=P[P.length-1]}
  else{const bw=Math.max(1,Math.min(14,slot*.64));
    bs.forEach((b,i)=>{const x=Math.round(X(i))+.5,up=b.c>=b.o,col=up?C.up:C.dn,yo=Y(b.o),yc=Y(b.c),top=Math.min(yo,yc),h=Math.max(1,Math.abs(yc-yo));
      cx.strokeStyle=col;cx.lineWidth=1;cx.beginPath();cx.moveTo(x,Y(b.h));cx.lineTo(x,top);cx.moveTo(x,top+h);cx.lineTo(x,Y(b.l));cx.stroke();
      if(up){cx.fillStyle=C.bg;cx.fillRect(x-bw/2,top,bw,h);cx.strokeRect(Math.round(x-bw/2)+.5,Math.round(top)+.5,Math.round(bw)-1,Math.max(1,Math.round(h)-1))}
      else{cx.fillStyle=col;cx.fillRect(x-bw/2,top,bw,h)}});
    endX=X(N-1);endY=Y(p)}
  if(!day){const vm=Math.max(...bs.map(b=>b.v)),bw=Math.max(1,slot*.64);
    bs.forEach((b,i)=>{const h=b.v/vm*vH;cx.fillStyle=b.live?"rgba(95,230,255,.35)":"rgba(150,200,230,.16)";cx.fillRect(X(i)-bw/2,y1-h,bw,h)})}
  cx.restore();
  if(!day)label(0,py1+8,"Volume",C.dim,"left",false);
  /* reference lines, each labelled where it is drawn */
  if(day){const y=Math.round(Y(prev(s)))+.5;cx.strokeStyle="rgba(232,238,246,.32)";cx.lineWidth=1;cx.setLineDash([3,4]);cx.beginPath();cx.moveTo(0,y);cx.lineTo(pw,y);cx.stroke();cx.setLineDash([]);
    label(4,y<y0+12?y+11:y-11,`Prev close ${fp(prev(s))}`,C.mu)}
  if(al&&r>=1){const y=Math.round(Y(al.lv))+.5;if(y>y0-4&&y<py1+4){const hit=al.tf!=null&&frac()>=al.tf;
    cx.strokeStyle=hit?"rgba(95,230,255,.5)":"rgba(232,238,246,.28)";cx.setLineDash([1,3]);cx.beginPath();cx.moveTo(0,y);cx.lineTo(pw,y);cx.stroke();cx.setLineDash([]);
    label(pw-6,y-11,`Alert: ${al.dir>0?"above":"below"} ${fp(al.lv)}${hit?" · triggered":""}`,hit?C.ac:C.mu,"right");
    if(hit&&day){const hx=X(al.tf);cx.strokeStyle=C.ac;cx.lineWidth=1.4;cx.beginPath();cx.arc(hx,Y(al.lv),4.5,0,7);cx.stroke()}}}
  /* last price: a dotted rule to the axis and a tag on it */
  if(r>=1){cx.strokeStyle="rgba(95,230,255,.4)";cx.lineWidth=1;cx.setLineDash([1,3]);cx.beginPath();cx.moveTo(endX+6,Math.round(endY)+.5);cx.lineTo(pw,Math.round(endY)+.5);cx.stroke();cx.setLineDash([]);
    if(day||ty==="line"){if(!RM&&clock<RUN){const ph=((now%2400)/2400);cx.strokeStyle=`rgba(95,230,255,${.5*(1-ph)})`;cx.lineWidth=1;cx.beginPath();cx.arc(endX,endY,3.5+ph*10,0,7);cx.stroke()}
      cx.fillStyle=C.ac;cx.beginPath();cx.arc(endX,endY,3.5,0,7);cx.fill();cx.strokeStyle=C.bg;cx.lineWidth=1.5;cx.stroke()}}
  const ty_=clamp(tagY,y0+2,py1);cx.fillStyle=C.ac;cx.beginPath();cx.roundRect?cx.roundRect(pw+4,ty_-10,AX-6,20,4):cx.rect(pw+4,ty_-10,AX-6,20);cx.fill();
  cx.font=FONT(600);cx.fillStyle="#04070C";cx.textAlign="center";cx.textBaseline="middle";cx.fillText(fp(p),pw+4+(AX-6)/2,ty_+.5);
  /* hover */
  if(hover&&r>=1&&hover.x>=0&&hover.x<=pw){let i,x,v,key,html;
    if(day){i=0;let bd=1e9;pts.forEach((q,j)=>{const d=Math.abs(X(q.x)-hover.x);if(d<bd){bd=d;i=j}});const q=pts[i];x=X(q.x);v=q.y;key=s+"d"+i+(q.live?Math.round(clock/400):"");
      const c=(v/prev(s)-1)*100;html=`<div class="t">${ftime(q.t)} ET${q.live?" · now":""}</div><div><span>Price</span>${fp(v)}</div><div><span>vs prev close</span><b class="${cls(c)}">${arrow(c)} ${fpct(c)}</b></div>`}
    else{i=clamp(Math.floor(hover.x/slot),0,N-1);const b=bs[i];x=X(i);v=b.c;key=s+view.r+i+(b.live?Math.round(clock/400):"");
      const c=i?(b.c/bs[i-1].c-1)*100:(b.c/b.o-1)*100;
      html=`<div class="t">${fday(b.t)}${b.live?" · today":""}</div><div><span>Open</span>${fp(b.o)}</div><div><span>High</span>${fp(b.h)}</div><div><span>Low</span>${fp(b.l)}</div><div><span>Close</span>${fp(b.c)}</div><div><span>Change</span><b class="${cls(c)}">${arrow(c)} ${fpct(c)}</b></div><div><span>Volume</span>${b.live?"in progress":fvol(b.v)}</div>`}
    cx.strokeStyle="rgba(232,238,246,.25)";cx.lineWidth=1;cx.beginPath();cx.moveTo(Math.round(x)+.5,y0);cx.lineTo(Math.round(x)+.5,y1);cx.stroke();
    cx.fillStyle=C.ink;cx.beginPath();cx.arc(x,Y(v),3,0,7);cx.fill();
    if(key!==tipKey){tipKey=key;tip.innerHTML=html}
    const tw=tip.offsetWidth||150;tip.style.left=(x+16+tw>pw?x-16-tw:x+16)+"px";tip.classList.add("show")}
  else if(tip.classList.contains("show")){tip.classList.remove("show");tipKey=null}}
const toCv=e=>{const r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*CW,y:(e.clientY-r.top)/r.height*CH}};
cv.addEventListener("pointermove",e=>{hover=toCv(e)});
cv.addEventListener("pointerleave",()=>{hover=null});
cv.addEventListener("pointerdown",e=>{hover=toCv(e)});

/* ---------- the tour: what a person would click, one thing at a time */
/* the day-chart stops go to the symbols that have alerts, so the alert line is seen */
const AS=ALERTS.filter(a=>a.tf!=null).map(a=>a.s);
const TOUR=[
  {s:"NVDA"},
  {s:AS[0]||"MSFT"},
  {s:"AAPL",r:"3M",t:"candle"},
  {s:"GSPC"},
  {s:AS[1]||"META"},
  {s:"TSLA",r:"1Y",t:"line"},
  {s:"AMD",r:"1M",t:"candle"},
  {s:AS[2]||"AMZN"},
  {s:"MSFT"},
  {s:"BTC-USD",r:"3M",t:"line"},
  {s:"PLTR",r:"2Y",t:"line"},
];
const DWELL=6500,SUBSTEP=1500;
const tour={i:0,el:0,on:true,held:false,idle:0,sub:false};
function step(i){tour.i=(i+TOUR.length)%TOUR.length;tour.el=0;tour.sub=false;const t=TOUR[tour.i];setView({s:t.s,r:"1D"})}
function setTourBtn(){$("tour").innerHTML=tour.on
  ?`<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1" width="2.4" height="8" rx=".6" fill="currentColor"/><rect x="6.1" y="1" width="2.4" height="8" rx=".6" fill="currentColor"/></svg>Pause tour`
  :`<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1.2v7.6L8.6 5z" fill="currentColor"/></svg>Play tour`}
$("tour").onclick=()=>{tour.on=!tour.on;tour.held=!tour.on;tour.idle=0;setTourBtn();if(tour.on)step(tour.i+1)};
function took(){if(tour.on){tour.on=false;setTourBtn()}tour.idle=0}
rows.addEventListener("click",e=>{const b=e.target.closest(".row");if(b){took();setView({s:b.dataset.s})}});
tape.addEventListener("click",e=>{const b=e.target.closest(".ix");if(b){took();setView({s:b.dataset.s})}});
$("ranges").addEventListener("click",e=>{const b=e.target.closest("button");if(b){took();setView({r:b.dataset.r})}});
$("types").addEventListener("click",e=>{const b=e.target.closest("button");if(b&&!b.disabled){took();setView({t:b.dataset.t})}});
cv.addEventListener("pointerdown",took);
["pointermove","keydown","wheel"].forEach(t=>addEventListener(t,()=>{tour.idle=0},{passive:true}));

/* ---------- search */
const q=$("q"),ql=$("qList");let qSel=0,qRes=[];
function qShow(){const t=q.value.trim().toLowerCase(),all=[...WL,...IX];
  qRes=all.filter(s=>!t||s.toLowerCase().includes(t)||ALL[s].name.toLowerCase().includes(t)).slice(0,6);qSel=0;
  ql.innerHTML=qRes.map((s,i)=>`<li data-s="${s}" class="${i===qSel?"on":""}"><b>${TITLE(s)}</b><span>${SUB(s)}</span></li>`).join("")||`<li><span>No match in this demo</span></li>`;ql.classList.add("show")}
function qPick(s){if(!s)return;took();setView({s});q.value="";ql.classList.remove("show");q.blur()}
q.addEventListener("focus",()=>{took();qShow()});q.addEventListener("input",qShow);
q.addEventListener("blur",()=>setTimeout(()=>ql.classList.remove("show"),120));
q.addEventListener("keydown",e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();qSel=clamp(qSel+(e.key==="ArrowDown"?1:-1),0,Math.max(0,qRes.length-1));
  [...ql.children].forEach((li,i)=>li.classList.toggle("on",i===qSel))}else if(e.key==="Enter")qPick(qRes[qSel]);else if(e.key==="Escape"){q.blur()}});
ql.addEventListener("pointerdown",e=>{const li=e.target.closest("li[data-s]");if(li){e.preventDefault();qPick(li.dataset.s)}});
addEventListener("keydown",e=>{if(e.target===q)return;
  if(e.key==="/"){e.preventDefault();q.focus()}
  else if(e.key==="ArrowDown"||e.key==="ArrowUp"){const i=WL.indexOf(view.s),j=i<0?0:clamp(i+(e.key==="ArrowDown"?1:-1),0,WL.length-1);e.preventDefault();took();setView({s:WL[j]})}});

/* ---------- one loop drives everything.
   PERF GATE (site speed, keep): at most ~60 draws a second, ~30 when nothing is
   moving fast, and none while the frame is scrolled out of view or the tab is hidden.
   Inside an iframe the observer's root is the top page's viewport, which is the point. */
let _on=true,_wait=false,_drawn=0,last=performance.now(),roAt=0,spAt=0,_errs=0;
function gate(){if(_wait)return;_wait=true;requestAnimationFrame(now=>{_wait=false;if(!_on||document.hidden)return;
  const busy=hover||now-rev0<800;if(now-_drawn<(busy?14:30)){gate();return}_drawn=now;frame(now)})}
if("IntersectionObserver"in window)new IntersectionObserver(e=>{_on=e[e.length-1].isIntersecting;if(_on)gate()},{rootMargin:"120px"}).observe(root);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)gate()});
["pointerdown","pointermove","wheel","keydown"].forEach(t=>addEventListener(t,()=>{_on=true;gate()},{passive:true,capture:true}));
function frame(now){
  try{const dt=Math.min(now-last,100);last=now;
    clock+=dt;if(clock>=RUN+HOLD){clock=0;if(view.r==="1D")rev0=RM?-1e9:now;yS=null}
    if(tour.on){tour.el+=dt;const t=TOUR[tour.i];
      if(!tour.sub&&t.r&&tour.el>SUBSTEP){tour.sub=true;setView({r:t.r,t:t.t})}
      if(tour.el>=DWELL+(t.r?SUBSTEP:0))step(tour.i+1)}
    else if(!tour.held){tour.idle+=dt;if(tour.idle>15000&&document.activeElement!==q){tour.on=true;setTourBtn();step(tour.i+1)}}
    if(now-roAt>200){roAt=now;readouts()}
    if(now-spAt>500){spAt=now;sparks()}
    draw(now)}
  catch(e){hover=null;if(_errs++<3&&window.console)console.error("markets demo: a frame failed and was skipped",e)}
  gate()}

addEventListener("resize",fit);
setTourBtn();setView({s:"NVDA",r:"1D",t:"line"},false);
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{fit();sparks();readouts();gate()});
fit();sparks();gate();
})();
