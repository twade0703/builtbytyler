/* Front Desk demo: an AI phone assistant for a trades business, told as a self-playing story.
   Everything is fictional: the business, the callers (555-01xx numbers), the week. No network calls. */
(()=>{
"use strict";
/* ?embed: transparent page, so the window sits on whatever section hosts it */
if(new URLSearchParams(location.search).has("embed"))document.documentElement.classList.add("embed");
const $=id=>document.getElementById(id), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

/* ---------- fit the 1280x800 frame to the viewport */
const stage=$("stage");let SC=1;
function fit(){SC=Math.max(.1,Math.min((innerWidth-32)/1280,(innerHeight-32)/800,1.25));stage.style.transform=`translate(-50%,-50%) scale(${SC})`}
addEventListener("resize",()=>{fit();sizeWave()});fit();

/* ---------- the business, its week and the tools it's wired to */
const BIZ="Acme Home Services",TECH="Luis",LINK="acmehomeservices.example";
const DAYS=[["MON",28],["TUE",29],["WED",30],["THU",1],["FRI",2]],DNAME=["Today","Tue","Wed","Thu","Fri"],H0=8,H1=18;
const CONN=["Google Calendar","Slack","Teams","Jobber","QuickBooks"];
const BASE=[[0,8,10,"Drain clean","Patel"],[0,10,12,"Water heater install","Ruiz"],[0,13,15,"Estimate","Chen"],
  [1,10,13,"Repipe","Alvarez"],[1,14,16,"Toilet repair","Nguyen"],
  [2,8,10,"Faucet swap","Brooks"],[2,12,14,"Sewer camera","Diaz"],[2,15,17,"Estimate","Moore"],
  [3,8,10,"Disposal","Ortega"],[3,15,17,"Water softener","Park"],
  [4,8,11,"Remodel rough-in","Grant"],[4,13,15,"Leak detection","Silva"]];
const h12=h=>`${h>12?h-12:h}`, ap=h=>h>=12?"PM":"AM";
const range=(s,e)=>`${h12(s)}${ap(s)===ap(e)?"":" "+ap(s)}–${h12(e)} ${ap(e)}`;
const slotTxt=(d,s,e)=>`${DNAME[d]} · ${range(s,e)}`;

/* ---------- three callers; every call follows the same ten beats */
const GREET=`Thanks for calling ${BIZ}. I'm the virtual assistant. What's going on?`;
const SCRIPTS=[
 {label:"Burst pipe",clock:"2:14 PM",lock:"2:16",now:14.3,ring:"On the first ring, even when you're under a sink.",
  caller:{name:"Maria Lopez",first:"Maria",ini:"ML",phone:"(831) 555-0142"},addr:"418 Cedar St",
  issue:"Leak under kitchen sink",urg:"Urgent · water shut off",slot:[0,16,18],job:"Leak repair",value:350,
  lines:[GREET,"Hi, water's leaking under my kitchen sink and it's all over the floor.",
   "Sorry about that. Is it the pipe or the faucet, and can you shut the valve under the sink?","It's the pipe. I just turned the valve off.",
   "Good call. What's your name and the address?","Maria Lopez, 418 Cedar Street.",
   "Thanks, Maria. I can get someone there today between 4 and 6, or tomorrow 8 to 10. Which works?","Today, please.",
   `You're booked for today, 4 to 6. I'll text you a confirmation now, and ${TECH} will text when he's on the way.`,"Perfect, thank you!"],
  sms:[`Hi Maria, you're booked with ${BIZ} today, 4–6 PM, at 418 Cedar St. Reply C to confirm or R to reschedule.`,"C. Thank you so much!","Today 3:58 PM",
   `${TECH} is on the way to 418 Cedar St. ETA 4:20 PM.`],
  review:"Luis was great. Fixed it fast and cleaned up after. Five stars!"},
 {label:"No heat",clock:"9:40 PM",lock:"9:42",now:null,ring:"On the first ring, even at 9:40 at night.",
  caller:{name:"Dan Whitfield",first:"Dan",ini:"DW",phone:"(831) 555-0163"},addr:"72 Laurel Dr",
  issue:"Furnace not heating",urg:"Standard · household OK",slot:[1,8,10],job:"No-heat service call",value:425,
  lines:[GREET,"Our furnace stopped working and the house is getting cold.",
   "I can help. Is everyone in the home okay, and does the thermostat show an error?","We're fine. It says it's calling for heat but nothing comes out.",
   "Got it. What's your name and the address?","Dan Whitfield, 72 Laurel Drive.",
   "Thanks, Dan. It's after hours, so I can send someone tonight at the emergency rate, or book tomorrow 8 to 10 AM.","Tomorrow morning is fine.",
   "Done. You're booked tomorrow, 8 to 10 AM. I'll text a confirmation now and a reminder in the morning.","Great, thanks."],
  sms:[`Hi Dan, you're booked with ${BIZ} tomorrow, 8–10 AM, at 72 Laurel Dr. Reply C to confirm or R to reschedule.`,"C","Tomorrow 7:30 AM",
   `Good morning Dan. ${TECH} arrives between 8 and 10 today and will text when he's 15 minutes out.`],
  review:"Heat's back on and Luis explained everything. Leaving a review now."},
 {label:"Tankless quote",clock:"10:05 AM",lock:"10:07",now:10.1,ring:"Day or night, on the first ring.",
  caller:{name:"Priya Raman",first:"Priya",ini:"PR",phone:"(831) 555-0119"},addr:"1190 Oak Knoll Rd",
  issue:"Tankless water heater quote",urg:"Estimate · gas, family of 4",slot:[3,13,15],job:"Tankless estimate",value:4800,
  lines:[GREET,"Hi, our water heater is fifteen years old. I'd like a quote on going tankless.",
   "Happy to help. Is it gas or electric, and how many people live in the home?","Gas, and there are four of us.",
   "Perfect. The estimate is free and in person. What's your name and the address?","Priya Raman, 1190 Oak Knoll Road.",
   "Thanks, Priya. I have Thursday 1 to 3, or Friday 3 to 5. Which is better?","Thursday works.",
   "You're set for Thursday, 1 to 3. I'll text you a confirmation with what to expect.","Thank you!"],
  sms:[`Hi Priya, your free tankless estimate with ${BIZ} is Thursday, 1–3 PM, at 1190 Oak Knoll Rd. Reply C to confirm.`,"Confirmed, thanks!","Wednesday 5:00 PM",
   `Reminder: your estimate is tomorrow, 1–3 PM. ${TECH} will text when he's on the way.`],
  review:"Luis walked us through every option. Really appreciated it!"},
];

/* ---------- the workflow each story walks through: [key, title, what it does, the tool it uses] */
const STEPS={
 call:[["answer","Answer the call","Picks up on the first ring, 24/7, and says it's a virtual assistant.","Your number"],
  ["understand","Understand the problem","Turns what the caller says into a job description.",""],
  ["triage","Triage the urgency","Asks the safety questions you would: is the water off, is anyone at risk.",""],
  ["calendar","Check your calendar","Reads your real free and busy time and offers the soonest slots that fit.","Google Calendar"],
  ["book","Book the job","Writes the appointment into your calendar. No double-booking.","Google Calendar"],
  ["text","Text the customer","Confirmation now, a reminder later, an on-the-way text when your tech leaves.","SMS"],
  ["notify","Tell you and the team","A summary on your phone and a post in your team chat.","Slack · Teams"],
  ["log","Log the job","Creates the job and the customer in your job software, with the call attached.","Jobber · QuickBooks"]],
 missed:[["missed","Missed call","You were on a job and the call rang out.","Your number"],
  ["textback","Text back in seconds","A friendly text goes out before they dial the next company.","SMS"],
  ["understand","Understand the reply","Reads their message and works out what the job is.",""],
  ["calendar","Offer times","Suggests open slots straight from your calendar.","Google Calendar"],
  ["book","Book the job","Books it the moment they pick a time.","Google Calendar"],
  ["notify","Tell the team","The recovered call lands in your team chat as a booked job.","Teams"]],
 review:[["done","Job complete","Your tech taps complete, or the appointment ends.","Jobber"],
  ["wait","Wait two hours","Gives the customer time to see the work.",""],
  ["ask","Ask for the review","A thank-you text with your review link, to every customer.","SMS · Google review link"],
  ["reply","Read the reply","Praise is thanked. A complaint comes straight to you.",""],
  ["notify","Tell you","You see every review as it lands.","Slack"]],
 day:[["d1","Calls answered","Every call picked up or texted back.","Your number"],["d2","Jobs booked","Straight onto the calendar.","Google Calendar"],
  ["d3","Missed calls recovered","Texted back and turned into work.","SMS"],["d4","Jobs logged","Customer, job and invoice ready to go.","Jobber · QuickBooks"],
  ["d5","Reviews requested","Every finished job gets asked.","SMS"]],
};

/* ---------- the story clock: everything is scheduled on it, so Pause freezes the whole scene */
const st={si:0,E:0,dur:1,ev:[],fi:0,ty:[],speak:[],paused:false,script:0,callT0:null,callEnded:false,ring:false,booking:null,jobNo:1042};
const at=(t,fn)=>st.ev.push({t,fn});
function typeIn(el,text,t0,dur,done){st.ty.push({el,w:text.split(" "),t0,dur,done,n:-1,fin:0})}

/* ---------- smooth counters */
const K={calls:37,booked:21,texts:64,missed:0,value:8420},KC={...K};
function bump(id){const e=$(id);if(!e)return;e.classList.remove("bump");void e.offsetWidth;e.classList.add("bump")}
function tickK(){if(!$("kCalls"))return;for(const k in K){KC[k]+=(K[k]-KC[k])*.1;if(Math.abs(K[k]-KC[k])<.5)KC[k]=K[k]}
  $("kCalls").textContent=Math.round(KC.calls);$("kBooked").textContent=Math.round(KC.booked);$("kTexts").textContent=Math.round(KC.texts);
  $("kMissed").textContent=Math.round(KC.missed);$("kValue").textContent="$"+Math.round(KC.value).toLocaleString("en-US")}
if($("conn"))$("conn").innerHTML=CONN.map(c=>`<span data-c="${c}">${c}</span>`).join("");
function lightTool(tool){if(!tool||!$("conn"))return;tool.split(" · ").forEach(n=>{const e=$("conn").querySelector(`[data-c="${n}"]`);if(!e)return;
  e.classList.add("lit");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("lit"),2200)})}

/* ---------- views swap like a deck */
/* ---------- the pipeline: stages laid left to right on one track, and a camera that pans along it */
const TRACK=$("track"),STAGES=["vCall","vHeard","vCal","vSms","vOwn"];let focused=[];
function buildTrack(ids,first){if(TRACK.dataset.built){TRACK.classList.add("fade");setTimeout(()=>{layTrack(ids,first);TRACK.classList.remove("fade")},450)}else{TRACK.dataset.built=1;layTrack(ids,first)}}
function layTrack(ids,first){TRACK.classList.add("nt");TRACK.querySelectorAll(".link").forEach(l=>l.remove());
  STAGES.forEach(id=>{$(id).style.display=ids.includes(id)?"":"none";$(id).classList.remove("on")});
  ids.forEach((id,i)=>{if(i){const l=document.createElement("div");l.className="link";l.dataset.to=id;l.innerHTML="<i></i>";TRACK.appendChild(l)}TRACK.appendChild($(id))});
  focused=[];focus(first||[ids[0]],true);void TRACK.offsetWidth;requestAnimationFrame(()=>TRACK.classList.remove("nt"))}
function pulse(to){const lk=TRACK.querySelector(`.link[data-to="${to}"]`);if(!lk)return;lk.classList.remove("go");void lk.offsetWidth;lk.classList.add("go","done")}
/* centre the camera on these stages; if they can't all fit, pull back until they do */
let storyFocus=[];
function focus(ids,instant,byViewer){if(!byViewer)storyFocus=ids.slice();if(st.hold&&!byViewer)return;const els=ids.map($),box=$("deck"),bw=box.clientWidth,bh=box.clientHeight;
  const l=Math.min(...els.map(e=>e.offsetLeft)),r=Math.max(...els.map(e=>e.offsetLeft+e.offsetWidth));
  const s=Math.min(1,(bw-60)/(r-l)),x=bw/2-s*(l+r)/2,y=(1-s)*(bh-14)/2*0;
  if(instant)TRACK.classList.add("nt");TRACK.style.transform=`translate(${x}px,${y}px) scale(${s})`;
  if(instant){void TRACK.offsetWidth;TRACK.classList.remove("nt")}
  else ids.forEach(id=>{if(!focused.includes(id))pulse(id)});
  STAGES.forEach(id=>$(id).classList.toggle("on",ids.includes(id)));focused=ids.slice()}
const showView=id=>focus([id]);
STAGES.forEach(id=>$(id).addEventListener("click",e=>{if($(id).classList.contains("on"))return;e.preventDefault();e.stopPropagation();
  explore([id])},true));

/* ---------- caption: words rise in; a shared prefix stays put */
let capH="",capP="";
function words(el,txt,keep){const k=keep&&txt.startsWith(keep)?keep:"";
  el.innerHTML=(k?`<span>${k}</span>`:"")+txt.slice(k.length).split(/(\s+)/).map((w,i)=>w.trim()?`<span class="w" style="animation-delay:${i*45}ms">${w}</span>`:w).join("")}
function caption(h,p){if(h!==capH)words($("capH"),h,"");words($("capP"),p,h===capH?capP:"");capH=h;capP=p}

/* ---------- workflow panel */
let stepEls={},stepOrder=[],stepTool={};
/* short labels for the step strip; the full title and what it does sit in the hover tip */
const SHORTS={answer:"Answer",understand:"Understand",triage:"Triage",calendar:"Check calendar",book:"Book",text:"Text customer",notify:"Tell you",log:"Log the job",
  missed:"Missed call",textback:"Text back",done:"Job done",wait:"Wait 2 hours",ask:"Ask for review",reply:"Read reply",d1:"Calls",d2:"Bookings",d3:"Recovered",d4:"Logged",d5:"Reviews"};
const STAGE_OF={answer:["vCall","vHeard"],understand:["vCall","vHeard"],triage:["vCall","vHeard"],calendar:["vCal"],book:["vCal"],text:["vSms"],notify:["vOwn"],log:["vOwn"],
  missed:["vCall"],textback:["vSms"],done:["vCal"],wait:["vCal"],ask:["vSms"],reply:["vSms"],d1:["vCall"],d2:["vCal"],d3:["vSms"],d4:["vHeard"],d5:["vOwn"]};
/* the viewer takes the camera: it flies to the stage and holds there until they step away */
function explore(ids){ids=ids.filter(id=>$(id).style.display!=="none");if(!ids.length)return;st.hold=true;st.idle=0;st.paused=true;setPlay();focus(ids,false,true)}
function setSteps(key){stepEls={};stepTool={};stepOrder=STEPS[key].map(s=>s[0]);
  $("steps").innerHTML=STEPS[key].map(([k,t,tip,tool])=>{stepTool[k]=tool;return`<div class="sp" data-k="${k}"><i>✓</i><div><b>${SHORTS[k]||t}</b>${tool?`<small>${tool}</small>`:""}</div><div class="tip"><b style="color:#fff">${t}</b><br>${tip}<br><span style="color:var(--ac2)">Click to see this step</span></div></div>`}).join("");
  $("steps").querySelectorAll(".sp").forEach(e=>{stepEls[e.dataset.k]=e;e.onclick=()=>explore(STAGE_OF[e.dataset.k]||[])})}
const clk=()=>{const s=Math.max(0,st.E/1000);return`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`};
function stepOn(k){const e=stepEls[k];if(e&&!e.classList.contains("done")){e.classList.add("active");lightTool(stepTool[k])}}
function stepDone(k,detail){const e=stepEls[k];if(!e)return;e.classList.remove("active");e.classList.add("done");
  if(detail)e.querySelector(".tip").insertAdjacentHTML("beforeend",`<br><b style="color:#fff;font-weight:600">${detail}</b>`)}

/* ---------- call view */
const FIELDS=[["name","Name"],["phone","Phone"],["addr","Address"],["issue","Issue"],["urg","Urgency"],["slot","Booked"]];
function resetCall(c){$("tkNo").textContent="New job";const a=$("cAv");a.textContent="?";a.className="av ring";$("cName").textContent="New caller";$("cPhone").textContent=c.phone;
  $("tx").innerHTML="";$("fields").innerHTML=FIELDS.map(([k,l])=>`<div class="fld" data-f="${k}"><small>${l}</small><b></b></div>`).join("");
  st.callT0=null;st.callEnded=false;st.ring=true}
function setStat(cls,txt){$("cStat").className="status "+cls;$("cStatT").textContent=txt}
function field(k,v){const r=$("fields").querySelector(`[data-f="${k}"]`);if(!r)return;pulse("vHeard");
  r.classList.add("hit");typeIn(r.querySelector("b"),v,st.E,380);setTimeout(()=>r.classList.remove("hit"),60)}
function bubble(who,label){const d=document.createElement("div");d.className="msg "+(who==="ai"?"ai":"c");d.innerHTML=`<small>${label}</small><p></p>`;
  $("tx").appendChild(d);while($("tx").children.length>7)$("tx").firstChild.remove();return d.querySelector("p")}

/* ---------- the customer's iPhone: the business texts arrive grey, their replies go out blue */
function resetThread(c,time,lab,h,p,chk){$("sTime").textContent=time;$("thread").innerHTML="";
  $("sLab").textContent=lab;$("sH").textContent=h;$("sP").textContent=p;$("sChk").innerHTML=chk.map(t=>`<div><i>✓</i>${t}</div>`).join("")}
function chk(i){const e=$("sChk").children[i];if(e)e.classList.add("on")}
function sms(kind,text,t){const th=$("thread"),trim=()=>{while(th.children.length>10)th.firstChild.remove()};
  if(kind==="stamp"){at(t,()=>{const d=document.createElement("div");d.className="stamp";d.innerHTML=`<b>Text Message</b> · ${text}`;th.appendChild(d);trim()});return}
  let ty;at(t-800,()=>{ty=document.createElement("div");ty.className="im typing"+(kind==="me"?" me":"");ty.innerHTML="<i></i><i></i><i></i>";th.appendChild(ty)});
  at(t,()=>{ty&&ty.remove();th.querySelectorAll(".deliv").forEach(x=>x.remove());
    const d=document.createElement("div");d.className="im "+kind;d.textContent=text;th.appendChild(d);
    if(kind==="me"){const dl=document.createElement("div");dl.className="deliv";dl.textContent="Delivered";th.appendChild(dl)}
    else{K.texts++;bump("tTexts");lightTool("SMS")}trim()})}

/* ---------- the owner's lock screen and the team chat */
const PHONE_ICO=`<svg width="11" height="11" viewBox="0 0 16 16"><path d="M4.2 1.5l2 3.3-1.4 1.6c.9 1.9 2.5 3.5 4.4 4.4l1.6-1.4 3.3 2-1 2.9C7.7 14.5 1.5 8.3 1.3 2.5z" fill="#fff"/></svg>`;
function resetOwner(time,date){$("lkT").textContent=time;$("lkD").textContent=date||"Monday, September 28";$("notes").innerHTML="";$("chIn").innerHTML=""}
function note(title,body,ago="now"){const n=document.createElement("div");n.className="note";
  n.innerHTML=`<header><i>${PHONE_ICO}</i>Front Desk<span>${ago}</span></header><b>${title}</b>${Array.isArray(body)?`<ul>${body.map(x=>`<li>${x}</li>`).join("")}</ul>`:`<p>${body}</p>`}`;
  $("notes").prepend(n);while($("notes").children.length>3)$("notes").lastChild.remove()}
function chatMode(m){const c=$("chat");c.classList.toggle("teams",m==="teams");
  $("chName").textContent=m==="teams"?"Dispatch  ›  New jobs":"# new-jobs";$("chSub").textContent=m==="teams"?"Microsoft Teams":"Slack";
  $("chSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.c===m));lightTool(m==="teams"?"Teams":"Slack")}
$("chSeg").querySelectorAll("button").forEach(b=>b.onclick=()=>chatMode(b.dataset.c));
function post(text,fields,acts,time="now"){const p=document.createElement("div");p.className="post";
  p.innerHTML=`<div class="pav">FD</div><div><header><b>Front Desk</b><em>APP</em><span>${time}</span></header><p>${text}</p>
    ${fields?`<div class="att">${fields.map(([k,v])=>`<div><small>${k}</small><span>${v}</span></div>`).join("")}</div>`:""}
    ${acts?`<div class="acts">${acts.map((a,i)=>`<button class="${i?"":"pri"}">${a}</button>`).join("")}</div>`:""}</div>`;
  p.querySelectorAll(".acts button").forEach(b=>b.onclick=()=>{b.classList.remove("pri");b.classList.add("did");b.textContent="✓ "+b.textContent.replace(/^Assign to/,"Assigned to")});
  $("chIn").appendChild(p);while($("chIn").children.length>3)$("chIn").firstChild.remove()}

/* ---------- Google-Calendar-style week; events live in one overlay so a moved booking slides across days */
function renderCal(extra,nowH){$("gcHd").innerHTML="<div></div>"+DAYS.map(([d,n],i)=>`<div class="${i?"":"today"}"><small>${d}</small><b>${n}</b></div>`).join("");
  $("gcBody").innerHTML=`<div class="gc-hrs">${Array.from({length:H1-H0},(_,i)=>i?`<span style="top:${i*10}%">${h12(H0+i)} ${ap(H0+i)}</span>`:"").join("")}</div>`+
    DAYS.map(()=>`<div class="gc-col"></div>`).join("")+`<div class="gc-ov" id="ov"></div>`;
  const ov=$("ov");
  extra.concat(BASE.map(b=>({d:b[0],s:b[1],e:b[2],t:b[3],w:b[4]}))).forEach(b=>{const e=document.createElement("div");e.className="ev"+(b.cls?" "+b.cls:"");
    e.innerHTML=`<b>${b.t}</b>${range(b.s,b.e)} · ${b.w}`;place(e,b.d,b.s,b.e);ov.appendChild(e);if(b.cur)st.booking={...b,el:e}});
  freeSlots();
  if(nowH!=null){const n=document.createElement("div");n.className="now";n.style.left="0";n.style.width="calc(20% - 2px)";n.style.top=((nowH-H0)/(H1-H0)*100)+"%";ov.appendChild(n)}}
function place(e,d,s,en){e.style.left=`calc(${d*20}% + 3px)`;e.style.width="calc(20% - 7px)";e.style.top=`calc(${(s-H0)/(H1-H0)*100}% + 1px)`;e.style.height=`calc(${(en-s)/(H1-H0)*100}% - 3px)`}
function freeSlots(){const ov=$("ov");ov.querySelectorAll(".free").forEach(f=>f.remove());const b=st.booking,all=BASE.map(x=>({d:x[0],s:x[1],e:x[2]})).concat(b?[b]:[]);
  for(const d of [0,1,2,3,4])for(const s of [8,10,12,14,16]){if(all.some(x=>x.d===d&&x.s<s+2&&x.e>s))continue;
    const f=document.createElement("button");f.className="free";f.textContent="+ Move here";place(f,d,s,s+2);f.onclick=()=>moveTo(d,s);ov.prepend(f)}}
function moveTo(d,s){const b=st.booking;if(!b)return;const len=b.e-b.s;b.d=d;b.s=s;b.e=s+len;place(b.el,d,s,s+len);
  b.el.innerHTML=`<b>${b.t}</b>${range(s,s+len)} · ${b.w}`;const txt=slotTxt(d,s,s+len);
  $("gcSync").innerHTML=`<i>✓</i>Moved to ${txt} · customer re-texted`;K.texts++;bump("tTexts");lightTool("Google Calendar");
  const r=$("fields").querySelector('[data-f="slot"] b');if(r)r.textContent=txt;freeSlots()}
const SYNC=`<i>✓</i>Synced with Google Calendar`;

/* ---------- waveform: who is talking */
const wv=$("wv");let wx,ww,wh,bars=new Array(72).fill(0);
function sizeWave(){const r=wv.parentElement,d=(devicePixelRatio||1)*SC;ww=r.clientWidth;wh=r.clientHeight;wv.width=Math.round(ww*d);wv.height=Math.round(wh*d);wx=wv.getContext("2d");wx.setTransform(d,0,0,d,0,0)}
function drawWave(now){if(!wx||!focused.includes("vCall"))return;const sp=st.speak.find(s=>st.E>=s[0]&&st.E<=s[1]),who=sp&&sp[2];
  wx.clearRect(0,0,ww,wh);const n=bars.length,bw=ww/n,mid=wh/2;
  for(let i=0;i<n;i++){let a=.05;
    if(who&&!st.paused)a=.18+.82*Math.abs(Math.sin(i*.9+now/70)*Math.sin(i*.37+now/130))*(0.55+0.45*Math.sin(i/n*Math.PI));
    else if(st.ring)a=.05+.14*Math.max(0,Math.sin(now/180-i*.25));
    bars[i]+=(a-bars[i])*.25;const h=bars[i]*wh*.92;if(h<3)continue;
    wx.fillStyle=who==="ai"?"#0A84FF":who==="c"?"#FFFFFF":st.ring?"#64B5FF":"#2a2e38";wx.globalAlpha=who?.95:.8;
    wx.beginPath();wx.roundRect(i*bw+bw*.24,mid-h/2,bw*.52,h,2);wx.fill()}
  wx.globalAlpha=1;wx.fillStyle=who==="ai"?"rgba(10,132,255,.35)":"rgba(255,255,255,.12)";wx.fillRect(0,mid-.5,ww,1);
  if(st.callT0!=null&&!st.callEnded){const s=(st.E-st.callT0)/1000;$("cStatT").textContent=`Assistant on the call · ${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`}}

/* ================= the stories ================= */
function buildCall(S){const c=S.caller,[sd,ss,se]=S.slot,slot=slotTxt(sd,ss,se);
  buildTrack(["vCall","vHeard","vCal","vSms","vOwn"],["vCall","vHeard"]);setSteps("call");resetCall(c);renderCal([],S.now);$("gcSync").innerHTML=SYNC;setStat("ringing",`Incoming call · ${S.clock}`);
  caption("It answers every call.",S.ring);
  let t=1900;
  at(t,()=>{st.ring=false;$("cAv").classList.remove("ring");setStat("live","Assistant on the call");st.callT0=st.E;
    stepOn("answer");K.calls++;bump("tCalls");field("phone",c.phone)});
  const onEnd=[()=>stepDone("answer","Picked up in 0.9s"),()=>{field("issue",S.issue);stepDone("understand",S.issue)},null,
    ()=>{field("urg",S.urg);stepDone("triage",S.urg)},null,()=>{field("name",c.name);field("addr",S.addr);$("cName").textContent=c.name;$("cAv").textContent=c.ini},
    ()=>stepDone("calendar","2 open slots offered"),null,()=>{field("slot",slot);stepDone("book",slot)},null];
  const onStart=[null,()=>{stepOn("understand");caption("It understands the job.","What's wrong, how urgent, who and where.")},()=>stepOn("triage"),null,null,null,
    ()=>{stepOn("calendar");caption("It books it.","Only the times you actually have free.")},null,()=>stepOn("book"),null];
  S.lines.forEach((text,i)=>{const who=i%2?"c":"ai",n=text.split(" ").length,dur=n*(who==="ai"?200:230)+250,t0=t;
    at(t0,()=>{onStart[i]&&onStart[i]();const p=bubble(who,who==="ai"?"Assistant":(i>=5?c.first:"Caller"));typeIn(p,text,t0,dur,onEnd[i])});
    st.speak.push([t0,t0+dur,who]);t+=dur+460});
  at(t+200,()=>{const s=(st.E-st.callT0)/1000;st.callEnded=true;setStat("",`Call ended · ${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`)});
  const tCal=t+1300;
  at(tCal,()=>{renderCal([{d:sd,s:ss,e:se,t:S.job,w:c.name,cls:"new",cur:1}],S.now);$("gcSync").innerHTML=SYNC;showView("vCal");lightTool("Google Calendar");
    caption("It books it.","Straight into your Google Calendar. No double-booking.");K.booked++;K.value+=S.value;bump("tBooked");bump("tValue")});
  const tS=tCal+4000;
  at(tS,()=>{resetThread(c,S.lock,`What ${c.first} sees`,"Confirmed before they hang up.","The customer gets it in writing, confirms with one letter, and hears from your tech when he's on the way.",
    ["Confirmation sent","Customer confirmed","On-the-way text"]);showView("vSms");stepOn("text");
    caption("It texts the customer.","Confirmation now, a heads-up when your tech is on the way.")});
  sms("stamp","Today "+S.clock,tS+300);
  sms("biz",S.sms[0],tS+1300);at(tS+1400,()=>{stepDone("text","Confirmation sent");chk(0)});
  sms("me",S.sms[1],tS+3300);at(tS+3400,()=>chk(1));
  sms("stamp",S.sms[2],tS+4200);sms("biz",S.sms[3],tS+5300);at(tS+5400,()=>chk(2));
  const tO=tS+7400;
  at(tO,()=>{resetOwner(S.lock);chatMode("slack");showView("vOwn");stepOn("notify");caption("And it tells you, and your team.","On your lock screen, and in Slack or Teams.")});
  at(tO+700,()=>note(`New job booked · ${S.job}`,`${c.name} · ${S.addr} · ${slot}`));
  at(tO+1500,()=>post(`New job booked for <b>${slot}</b>. Details below.`,
    [["Customer",c.name],["Address",S.addr],["Issue",S.issue],["Urgency",S.urg]],[`Assign to ${TECH}`,"Listen to call"]));
  at(tO+2300,()=>stepDone("notify","Phone + team chat"));
  at(tO+3000,()=>stepOn("log"));at(tO+3800,()=>{const n=st.jobNo++;stepDone("log",`Job #${n} created`);$("tkNo").textContent=`Job #${n}`;note("Job logged",`#${n} · ${S.job} · est. $${S.value.toLocaleString("en-US")}`)});
  return tO+7200}

function buildMissed(){const c={name:"James Kim",first:"James",ini:"JK",phone:"(831) 555-0187"};
  buildTrack(["vCall","vSms","vCal","vOwn"]);setSteps("missed");resetCall(c);renderCal([],11.05);$("gcSync").innerHTML=SYNC;setStat("ringing","Incoming call · 11:02 AM · you're on a job");
  caption("Rather answer yourself?","It covers every call you miss.");stepOn("missed");
  at(3400,()=>{st.ring=false;$("cAv").classList.remove("ring");setStat("missed","Missed call");stepDone("missed","Rang out at 11:02 AM");stepOn("textback")});
  const tS=4300;
  at(tS,()=>{resetThread(c,"11:02",`What ${c.first} sees`,"Texted back in 4 seconds.","Before they call the next company, they already have a reply and a way to book.",
    ["Texted back","Job understood","Booked"]);showView("vSms");caption("Rather answer yourself?","It texts back every missed call in seconds.")});
  sms("stamp","Today 11:02 AM",tS+300);
  sms("biz",`Hi, this is ${BIZ}. Sorry we missed you, we're on a job right now. What can we help with? You can also book here: ${LINK}/book`,tS+1300);
  at(tS+1400,()=>{stepDone("textback","Sent 4s after the missed call");chk(0)});
  at(tS+2900,()=>stepOn("understand"));
  sms("me","Water heater is making a banging noise. Can someone look at it this week?",tS+3900);
  at(tS+4300,()=>{stepDone("understand","Water heater noise");chk(1);stepOn("calendar")});
  sms("biz","We can do Thursday 10 AM–12 PM or Friday 3–5 PM. Which works?",tS+5600);at(tS+5700,()=>stepDone("calendar","2 open slots offered"));
  sms("me","Thursday please",tS+7300);at(tS+7400,()=>stepOn("book"));
  sms("biz",`You're booked Thursday, 10 AM–12 PM. ${TECH} will text when he's on the way.`,tS+8800);
  at(tS+8900,()=>{stepDone("book","Thu · 10 AM–12 PM");chk(2)});
  const tC=tS+10400;
  at(tC,()=>{renderCal([{d:3,s:10,e:12,t:"Water heater noise",w:c.name,cls:"new",cur:1}],11.05);$("gcSync").innerHTML=SYNC;showView("vCal");
    caption("Rather answer yourself?","A missed call just became a booked job.");K.booked++;K.value+=275;bump("tBooked");bump("tValue");bump("tMissed")});
  const tO=tC+3600;
  at(tO,()=>{resetOwner("11:04");chatMode("teams");showView("vOwn");stepOn("notify");caption("Rather answer yourself?","Your team sees it the moment it's booked.")});
  at(tO+700,()=>note("Missed call recovered",`${c.name} booked Thu, 10 AM–12 PM · water heater noise`));
  at(tO+1400,()=>{post("A missed call was texted back and booked.",[["Customer",c.name],["When","Thu · 10 AM–12 PM"],["Issue","Water heater banging"],["Source","Missed call · 11:02 AM"]],[`Assign to ${TECH}`,"Open thread"]);
    stepDone("notify","Posted to Teams")});
  return tO+5600}

function buildReview(S){const c=S.caller,[sd,ss,se]=S.slot;
  renderCal([{d:sd,s:ss,e:se,t:S.job,w:c.name,cls:"done",cur:1}],null);$("gcSync").innerHTML=`<i>✓</i>${TECH} marked it complete`;buildTrack(["vCal","vSms","vOwn"]);
  setSteps("review");stepOn("done");
  caption("After the job, it asks for the review.","Every customer, every time, without you remembering.");
  at(900,()=>stepDone("done",`${TECH} marked it complete`));at(1400,()=>stepOn("wait"));at(3000,()=>stepDone("wait","Waited 2 hours"));
  const tS=3300;
  at(tS,()=>{resetThread(c,"6:48",`What ${c.first} sees`,"Asked while the work is fresh.","Every customer gets your review link. If a reply is a complaint, it comes straight to you.",
    ["Thank-you sent","Review link included","Reply read"]);showView("vSms");stepOn("ask")});
  sms("stamp","Today 6:48 PM",tS+400);
  sms("biz",`Thanks for choosing ${BIZ}, ${c.first}! Was everything taken care of? A quick review helps a small business a lot: ${LINK}/review`,tS+1600);
  at(tS+1700,()=>{stepDone("ask","Sent with your review link");chk(0);chk(1)});
  at(tS+2400,()=>stepOn("reply"));sms("me",S.review,tS+3800);at(tS+4300,()=>{stepDone("reply","Happy customer");chk(2)});
  const tO=tS+5800;
  at(tO,()=>{resetOwner("6:52");chatMode("slack");showView("vOwn");stepOn("notify");caption("After the job, it asks for the review.","You just watch them come in.")});
  at(tO+700,()=>note("New ★★★★★ review",`“${S.review}” · ${c.first} ${c.name.split(" ")[1][0]}.`));
  at(tO+1400,()=>{post(`New 5-star review from ${c.first} ${c.name.split(" ")[1][0]}. for <b>${S.job}</b>.`,[["Tech",TECH],["Review",`“${S.review}”`]],["Say thanks"]);stepDone("notify","Review on your phone")});
  return tO+5200}

function buildDay(){resetOwner("7:30");chatMode("teams");buildTrack(STAGES,["vCal"]);setSteps("day");
  /* the finale pulls back to show the whole pipeline, then settles on your phone */
  at(200,()=>focus(STAGES));at(3600,()=>focus(["vOwn"]));
  caption("Software that works while you do.","Built around your business. We'll build yours.");
  const det=["6 answered · 0 unanswered","4 booked · $5,850","1 turned into a job","4 jobs · 4 customers","3 asked · 1 new 5-star"];
  STEPS.day.forEach(([k],i)=>{at(300+i*380,()=>stepOn(k));at(680+i*380,()=>stepDone(k,det[i]))});
  at(800,()=>note(`Today at ${BIZ}`,["6 calls answered, none left unanswered","4 jobs booked, $5,850 on the calendar","1 missed call turned into a job","1 new 5-star review"],"7:30 PM"));
  at(1600,()=>post("Daily summary for your team.",[["Calls","6 answered · 0 missed"],["Booked","4 jobs · $5,850"],["Texts","11 sent for you"],["Reviews","1 new 5-star"]],null,"7:30 PM"));
  return 7800}

const STORIES=[{label:"Answers calls",b:()=>buildCall(SCRIPTS[st.script])},{label:"Missed calls",b:buildMissed},
  {label:"Reviews",b:()=>buildReview(SCRIPTS[st.script])},{label:"Your day",b:buildDay}];

function start(i){st.si=i;st.E=0;st.ev=[];st.fi=0;st.ty=[];st.speak=[];st.ring=false;st.booking=null;
  st.dur=STORIES[i].b();st.ev.sort((a,b)=>a.t-b.t);
  tabEls.forEach((b,k)=>{b.classList.toggle("on",k===i);b.querySelector("u").style.width="0"});
  pillEls.forEach((b,k)=>b.classList.toggle("on",k===st.script))}
function next(){let i=st.si+1;if(i>=STORIES.length){i=0;st.script=(st.script+1)%SCRIPTS.length}start(i)}

/* ---------- controls */
$("pills").innerHTML=SCRIPTS.map((s,i)=>`<button data-i="${i}">${s.label}</button>`).join("");
const pillEls=[...$("pills").children];pillEls.forEach(b=>b.onclick=()=>{st.script=+b.dataset.i;st.paused=false;setPlay();start(0)});
$("tabs").insertAdjacentHTML("afterbegin",STORIES.map((s,i)=>`<button data-s="${i}">${s.label}<u></u></button>`).join(""));
const tabEls=[...$("tabs").querySelectorAll("[data-s]")];tabEls.forEach(b=>b.onclick=()=>{st.paused=false;setPlay();start(+b.dataset.s)});
function setPlay(){$("play").innerHTML=st.paused?"▶&nbsp;Play":"❚❚&nbsp;Pause"}
$("play").onclick=()=>{st.paused=!st.paused;if(!st.paused&&st.hold){st.hold=false;focus(storyFocus)}setPlay()};
document.addEventListener("pointermove",()=>{st.idle=0});

/* ---------- one loop */
let last=performance.now();
function step(dt){st.E+=dt;
  while(st.fi<st.ev.length&&st.ev[st.fi].t<=st.E)st.ev[st.fi++].fn();
  for(const t of st.ty){if(st.E<t.t0)continue;const n=clamp(Math.ceil((st.E-t.t0)/t.dur*t.w.length),0,t.w.length);
    if(n!==t.n){t.n=n;t.el.textContent=t.w.slice(0,n).join(" ")}if(n===t.w.length&&!t.fin){t.fin=1;t.done&&t.done()}}
  if(_w||st.E>=st.dur){const u=tabEls[st.si]&&tabEls[st.si].querySelector("u");if(u)u.style.width=Math.min(100,st.E/st.dur*100)+"%"}
  if(st.E>=st.dur)next()}
/* PERF GATE: site speed, 2026-09-27. KEEP THIS when the demo is re-exported.
   The loop used to run at the display's rate, always: 144 draws a second on a
   144 Hz monitor, on screen or not. It now draws at most ~90 times a second,
   evenly paced (every second frame at 120 and 144 Hz, every frame at 60 and
   90), and not at all while the demo is scrolled out of view or the tab is
   hidden. frame() clamps its dt, so a pause costs the reel nothing. Inside an
   iframe the observer's root is the TOP page's viewport, which is the point. */
let _on=true,_wait=false,_drawn=0;
function gate(){if(_wait)return;_wait=true;requestAnimationFrame(now=>{_wait=false;
  if(!_on||document.hidden)return;
  if(now-_drawn<11){gate();return}
  _drawn=now;frame(now)})}
if("IntersectionObserver"in window)new IntersectionObserver(e=>{_on=e[e.length-1].isIntersecting;if(_on)gate()},{rootMargin:"120px"}).observe(document.documentElement);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)gate()});
/* Someone touching the demo is looking at it: never leave it stopped under their hand. */
["pointerdown","pointermove","wheel","keydown"].forEach(t=>addEventListener(t,()=>{if(!_on){_on=true}gate()},{passive:true,capture:true}));
/* PERF (keep on re-export): the tab underline is a width, so writing it is
   layout. It is written 15 times a second; _w says when. */
let _w=true,_wAt=0;
/* One bad frame must never freeze the demo: whatever a frame throws, the
   next one is still scheduled, and the error is reported once. */
let _errs=0;
function frame(now){
  try{const dt=Math.min(now-last,100);last=now;_w=now-_wAt>=66;if(_w)_wAt=now;if(!st.paused)step(dt);
  if(st.hold){st.idle+=dt;if(st.idle>6500){st.hold=false;st.paused=false;setPlay();focus(storyFocus)}}tickK();drawWave(now);}
  catch(e){if(_errs++<3&&window.console)console.error("front desk demo: a frame failed and was skipped",e)}
  gate()}
/* for checking a moment without waiting for it: demoSeek(story, ms) */
window.demoSeek=(i,ms)=>{start(i);for(let e=0;e<ms;e+=40)step(40)};
setPlay();
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{sizeWave();start(0);gate()});
})();
