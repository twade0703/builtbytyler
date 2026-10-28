/* AI Receptionist demo: one call to a made-up plumber, played as a story that loops.
   The wording is the real product's (06 Ventures/front-desk): the greeting, the time
   pitch and the sign-off from app.py, the leak question from triage.py, the price
   answer from brain.py, the texts from finish() and handle_text(). Nothing here does
   anything the product doesn't. Fictional business, 555-01xx numbers, no network calls. */
(()=>{
"use strict";
const EMBED=new URLSearchParams(location.search).has("embed"),root=document.documentElement;
/* ?embed: transparent page, so the window sits on whatever section hosts it */
if(EMBED)root.classList.add("embed");
const $=id=>document.getElementById(id);
const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ---------- fit the window to the viewport: 1312x832, or stacked at phone width */
const stage=$("stage");
function fit(){const iw=innerWidth,ih=innerHeight,port=!EMBED&&iw<760&&iw<ih;
  root.classList.toggle("portrait",port);
  const m=EMBED?0:port?10:24,W=port?680:1312,H=port?Math.round(Math.max(1220,Math.min(1600,W*(ih-2*m)/(iw-2*m)))):832;
  stage.style.width=W+"px";stage.style.height=H+"px";
  const s=Math.max(.1,Math.min((iw-2*m)/W,(ih-2*m)/H,EMBED?2:1.25));
  stage.style.transform=`translate(-50%,-50%) scale(${s})`}
addEventListener("resize",fit);fit();

/* ---------- the business and its calendar */
const BIZ="Pell Creek Plumbing & Heating",H0=8,H1=18;
const WD=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],MO=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const day=k=>{const d=new Date(Date.now()+k*864e5);return`${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}`};
const JOBS=[[0,8,10,"Drain Clean","Patel"],[0,10,12,"Water Heater","Ruiz"],[0,12,14,"Toilet Repair","Chen"],[0,16,18,"Estimate","Alvarez"],
  [1,10,12,"Disposal","Brooks"],[1,14,16,"Sewer Camera","Diaz"],[1,16,18,"Faucet Swap","Moore"]];
const pct=h=>(h-H0)/(H1-H0)*100;
const lanes=[];let nowEl;
$("ticks").innerHTML=[8,10,12,14,16,18].map(h=>`<span style="left:${pct(h)}%">${h>12?h-12:h} ${h<12?"AM":"PM"}</span>`).join("");
[0,1].forEach(k=>{const r=el("div","day",`<small>${k?"Tomorrow":"Today"}<b>${day(k)}</b></small>`),l=el("div","lane");r.appendChild(l);$("days").appendChild(r);lanes.push(l)});
JOBS.forEach(([d,s,e,t,w])=>addJob(d,s,e,t,w));
nowEl=el("div","now");lanes[0].appendChild(nowEl);
function addJob(d,s,e,t,sub,cls){const j=el("div","job"+(cls?" "+cls:""),`<b>${esc(t)}</b><small>${esc(sub)}</small>`);
  j.style.left=`calc(${pct(s)}% + 3px)`;j.style.width=`calc(${pct(e)-pct(s)}% - 6px)`;lanes[d].appendChild(j);return j}
function setNow(h){nowEl.style.opacity=h>H0&&h<H1?1:0;nowEl.style.left=pct(Math.max(H0,Math.min(H1,h)))+"%"}
const B={o1:null,o2:null};
function resetBoard(){document.querySelectorAll(".job.offer,.job.booked").forEach(j=>j.remove());B.o1=B.o2=null}
function offer(){B.o1=addJob(0,14,16,"Option 1","Held","offer");B.o2=addJob(1,8,10,"Option 2","Held","offer")}
function release(){if(B.o2){B.o2.classList.add("gone");const g=B.o2;at(st.E+700,()=>g.remove());B.o2=null}}
function booked(title,tag){if(!B.o1)B.o1=addJob(0,14,16,"","","offer");B.o1.className="job booked";B.o1.innerHTML=`<b>${esc(title)}</b><small>${esc(tag)}</small>`}
function ensureBooked(){if(!document.querySelector(".job.booked")){resetBoard();booked("Leak Under Kitchen Sink","Confirmed")}}

/* ---------- the story clock: everything runs on it, so Pause freezes the whole scene */
const st={E:0,dur:1,ev:[],fi:0,ty:[],speak:[],steps:[],paused:false,k:0,callT0:null,live:false,ring:false,building:true};
/* while a story is being laid out, events are just collected (and sorted once); once it plays,
   anything scheduled from inside an event is slotted into the queue in time order */
function at(t,fn){if(st.building){st.ev.push({t,fn});return}let i=st.ev.length;while(i>st.fi&&st.ev[i-1].t>t)i--;st.ev.splice(i,0,{t,fn})}
function typeIn(e,text,t0,dur,done){st.ty.push({e,w:text.split(" "),t0,dur,done,n:-1,fin:0})}

/* ---------- the story line and the steps under it */
let capH="";
function words(e,txt){e.innerHTML=txt.split(/(\s+)/).map((w,i)=>w.trim()?`<span class="w" style="animation-delay:${i*40}ms">${esc(w)}</span>`:w).join("")}
function caption(t,h,p){at(t,()=>{if(h!==capH){words($("capH"),h);capH=h}words($("capP"),p)})}
let railEls=[];
function rail(labels){$("rail").innerHTML=labels.map((l,i)=>`<div class="st"><u></u><i></i><small>0${i+1}</small>${l}</div>`).join("");railEls=[...$("rail").children]}
function stepOn(i,t){st.steps.push({i,t});at(t,()=>railEls.forEach((e,k)=>{e.classList.toggle("done",k<i);e.classList.toggle("on",k===i)}))}

/* ---------- the call */
const PHONE_SVG=$("cAv").innerHTML;
function resetCall(num,when){st.num=num;st.when=when;const a=$("cAv");a.className="av ring";a.innerHTML=PHONE_SVG;
  $("cWho").textContent="Incoming call";$("cSub").textContent=`${num} · ${when}`;
  pill("ringing","Ringing");$("tx").innerHTML="";st.callT0=null;st.live=false;st.ring=true;$("callc").classList.remove("after")}
function pill(cls,txt){$("pill").className="pill "+cls;$("pillT").textContent=txt}
const clock=()=>{const s=Math.round((st.E-st.callT0)/1000*4);return`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`};
function answer(t){at(t,()=>{st.ring=false;st.live=true;st.callT0=st.E;$("cAv").classList.remove("ring");$("cWho").textContent=st.num;$("cSub").textContent=`${st.when} · new caller`;pill("live","Live 0:00")})}
function endCall(t,word,cls){at(t,()=>{st.live=false;pill(cls||"ended",`${word} ${clock()}`)})}
function known(t,name,ini){at(t,()=>{$("cWho").textContent=name;$("cSub").textContent=`${st.num} · ${st.when}`;const a=$("cAv");a.textContent=ini})}
function trim(box,n){while(box.children.length>n)box.firstChild.remove()}
/* a line of the transcript, typed as it's spoken; returns when it finishes */
function say(who,text,t,label,done){const n=text.split(" ").length,dur=n*(who==="ai"?118:150)+180;
  at(t,()=>{const d=el("div","ln "+who,`<small>${who==="ai"?"Receptionist":esc(label||"Caller")}</small><p></p>`);$("tx").appendChild(d);trim($("tx"),12);typeIn(d.querySelector("p"),text,t,dur,done)});
  st.speak.push([t,t+dur,who]);return t+dur}
function note(text,t,warn){at(t,()=>{$("tx").appendChild(el("div","ev"+(warn?" warn":""),`<span>${esc(text)}</span>`));trim($("tx"),12)})}

/* ---------- the job ticket */
const ROWS={main:[["issue","Issue"],["off","Water off"],["urg","Urgency"],["asked","Asked"],["name","Name"],["addr","Address"],["time","Time"]],
  hang:[["issue","Issue"],["urg","Urgency"],["end","Call"],["back","Text-back"],["own","You"]],
  gas:[["issue","Issue"],["urg","Urgency"],["told","Told"],["book","Booking"],["own","You"]]};
function rows(k){$("rows").innerHTML=ROWS[k].map(([f,l])=>`<div class="row" data-f="${f}"><small>${l}</small><b></b></div>`).join("");
  $("tkT").textContent="New call";$("tkT").className="ph-t";$("tkS").innerHTML=""}
/* v: plain text (typed in), or {html}; em: a quiet note after it */
function field(f,v,t,em){at(t,()=>{if(typeof v==="function")v=v();const r=$("rows").querySelector(`[data-f="${f}"]`);if(!r)return;const b=r.querySelector("b");
  r.classList.add("hit");at(st.E+1100,()=>r.classList.remove("hit"));
  const tail=()=>{if(em)b.insertAdjacentHTML("beforeend",` <em>· ${esc(em)}</em>`)};
  if(typeof v==="string"){b.textContent="";typeIn(b,v,st.E,Math.min(700,v.split(" ").length*90+120),tail)}else{b.innerHTML=v.html;tail()}})}
const TAG=(cls,txt)=>`<span class="tag ${cls}">${esc(txt)}</span>`;
function title(t,txt){at(t,()=>{const h=$("tkT");h.className="";h.textContent="";typeIn(h,txt,st.E,520)})}
function state(t,html){at(t,()=>{$("tkS").innerHTML=html})}

/* ---------- the phones that get texts after the call */
const SB=`<svg width="40" height="11" viewBox="0 0 40 11"><rect x="0" y="7" width="3" height="4" rx="1" fill="#fff"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="#fff"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="#fff"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="#fff"/><rect x="20.5" y=".5" width="16" height="10" rx="3" stroke="#fff" stroke-opacity=".45" fill="none"/><rect x="22" y="2" width="11" height="7" rx="1.5" fill="#fff"/><rect x="37.5" y="3.5" width="1.6" height="4" rx=".8" fill="#fff" fill-opacity=".45"/></svg>`;
let threads=[];
function phones(t,list){at(t,()=>{const box=$("phones");box.innerHTML="";threads=[];
  list.forEach(p=>{const ph=el("div","phone",`<span class="lab">${esc(p.lab)}</span><div class="scr"><div class="scr-in"><div class="sb"><span>${p.time}</span>${SB}</div>
    <div class="mh"><i>${p.ini}</i><small>${esc(p.contact)}</small></div><div class="th"><div class="th-in"></div></div></div></div>`);
    box.appendChild(ph);threads.push(ph.querySelector(".th-in"))});
  $("callc").classList.add("after")})}
function sms(i,kind,text,t){
  if(kind==="stamp"){at(t,()=>threads[i]&&threads[i].appendChild(el("div","stamp",text)));return}
  let dots;if(kind==="in")at(t-750,()=>{dots=el("div","bub in dots","<i></i><i></i><i></i>");threads[i]&&threads[i].appendChild(dots)});
  at(t,()=>{const th=threads[i];if(!th)return;dots&&dots.remove();th.querySelectorAll(".deliv").forEach(x=>x.remove());
    const b=el("div","bub "+kind);b.textContent=text;th.appendChild(b);if(kind==="out")th.appendChild(el("div","deliv","Delivered"));trim(th,8)})}

/* ================= the stories ================= */
const GREET=`Hi, thanks for calling ${BIZ}. How can I help?`;

function storyMain(){
  rail(["Answers","Asks","Offers times","Books","Texts"]);rows("main");resetCall("(831) 555-0142","11:20 AM");resetBoard();setNow(11.33);
  caption(0,"The phone rings. It picks up.","Missed calls forward to it, and it answers in your business's name.");stepOn(0,0);
  let t=1900;answer(t);
  t=say("ai",GREET,t+250)+300;
  stepOn(1,t);caption(t,"It asks what a dispatcher would.","Urgency comes from the caller's own words: leak, flooding, no heat.");
  t=say("c","Hi. Water's leaking under my kitchen sink, it's all over the floor.",t);
  field("issue","Water leaking under the kitchen sink",t);note('Urgent: heard "leaking"',t+250,1);
  field("urg",{html:TAG("warn","Urgent")},t+350,'heard "leaking"');t+=650;
  t=say("ai","Oh no, okay. Let's get that taken care of. Have you been able to shut the water off yet?",t)+300;
  t=say("c","Yeah, I turned the valve under the sink.",t);field("off","Yes",t,"turned the valve");t+=350;
  stepOn(2,t);caption(t,"Two real openings from your calendar.","The two soonest free times, and how busy the day is. Never a time that's taken.");
  note("Calendar: holding today 2–4 PM and tomorrow 8–10 AM",t);at(t+150,offer);t+=500;
  t=say("ai","Good, that'll keep the damage down. We've only got one opening left today, the soonest I can get someone out is today between 2 and 4 PM. I also have tomorrow between 8 and 10 AM. Which works better for you?",t)+300;
  t=say("c","Today. How much is it going to cost?",t);
  at(t,release);field("time","Today, 2–4 PM",t,"held");field("asked","How much is it going to cost?",t+200);
  caption(t,"Questions answered. Prices never quoted.","It answers from your business's facts, then carries on where it was.");note("Price question: answered, no quote given",t+250);t+=550;
  t=say("ai","I can't give you an exact price over the phone, because it depends on what the tech finds. They'll give you the price before any work starts. Can I get your name?",t)+300;
  stepOn(3,t);caption(t,"Booked into the held time.","Name and address, then straight onto your calendar.");
  t=say("c","Maria Lopez.",t,"Caller");known(t,"Maria Lopez","ML");field("name","Maria Lopez",t);t+=300;
  t=say("ai","And what's the address where you need us?",t,"")+300;
  t=say("c","418 Cedar Street.",t,"Maria");field("addr","418 Cedar Street",t,"about 12 min drive");
  at(t+150,()=>booked("Maria Lopez","Booked"));field("time",{html:TAG("ok","Booked")},t+150,"today, 2–4 PM");state(t+150,TAG("ok","Booked"));
  note("Booked: today 2–4 PM, on your calendar",t+300);t+=650;
  t=say("ai",`Okay, you're all set for today between 2 and 4 PM at 418 Cedar Street. You'll get a text confirming it. Thanks for calling ${BIZ}, Maria.`,t);
  endCall(t+250,"Ended");t+=1100;
  /* after the call: the two texts, and the job title written for the calendar */
  stepOn(4,t);caption(t,"A text for them. A summary for you.","They reply C to confirm or R to reschedule. A job title goes on the calendar.");
  phones(t,[{lab:"Maria's phone",contact:BIZ,ini:"PC",time:"11:22"},{lab:"Your phone",contact:"AI Receptionist",ini:"AI",time:"11:22"}]);
  sms(0,"stamp","<b>Text Message</b> · Today 11:22 AM",t+250);sms(1,"stamp","<b>Text Message</b> · Today 11:22 AM",t+250);
  sms(0,"in",`Hi Maria, you're booked with ${BIZ} today between 2 and 4 PM at 418 Cedar Street. Reply C to confirm or R to reschedule.`,t+1200);
  sms(1,"in",`New booking: Maria Lopez, today between 2 and 4 PM at 418 Cedar Street. Water leaking under the kitchen sink. Water off: Yeah, I turned the valve under the sink. Asked "How much is it going to cost". About 12 min drive. URGENT. Caller (831) 555-0142.`,t+2300);
  title(t+3000,"Leak Under Kitchen Sink");at(t+3000,()=>booked("Leak Under Kitchen Sink","Booked"));
  sms(0,"out","C",t+4300);at(t+4700,()=>booked("Leak Under Kitchen Sink","Confirmed"));state(t+4700,TAG("ok","Confirmed"));
  return t+7000}

function storyHang(){
  rail(["Answers","Caller hangs up","Texts them back","Tells you"]);rows("hang");resetCall("(831) 555-0187","3:10 PM");ensureBooked();setNow(15.17);
  caption(0,"Hung up before booking? It texts them back.","So the job isn't lost, and you hear about it.");stepOn(0,0);
  let t=1500;answer(t);
  t=say("ai",GREET,t+250)+300;
  t=say("c","Hi, my kitchen drain's backed up again.",t);field("issue","Kitchen drain backed up again",t);
  field("urg",{html:TAG("warn","Urgent")},t+250,'heard "backed up"');t+=450;
  t=say("ai","Okay, that's no fun. We can help. Is it just one drain, or are a few of them backing up at once?",t);
  stepOn(1,t+300);endCall(t+300,"Hung up","alert");note("Caller hung up before booking",t+350,1);field("end",()=>"Hung up at "+clock(),t+300,"nothing booked");t+=1300;
  stepOn(2,t);phones(t,[{lab:"Their phone",contact:BIZ,ini:"PC",time:"3:11"},{lab:"Your phone",contact:"AI Receptionist",ini:"AI",time:"3:11"}]);
  sms(0,"stamp","<b>Text Message</b> · Today 3:11 PM",t+250);sms(1,"stamp","<b>Text Message</b> · Today 3:11 PM",t+250);
  sms(0,"in",`Sorry we got cut off at ${BIZ}. Reply here and we'll get you sorted.`,t+1100);field("back","Sent",t+1100,"the moment they hung up");
  stepOn(3,t+2300);sms(1,"in","Missed call from (831) 555-0187, about: my kitchen drain's backed up again. We texted them back.",t+2300);
  field("own","Texted",t+2300);title(t+1600,"Kitchen Drain Backed Up");state(t+2300,TAG("ok","Texted back"));
  return t+5800}

function storyGas(){
  rail(["Answers","Hears the danger","Safety steps","Alerts you"]);rows("gas");resetCall("(831) 555-0175","7:12 PM");ensureBooked();setNow(19.2);
  caption(0,"Gas, sparks or smoke: no booking.","Safety steps for the caller, and an alert to you right away. After hours too.");stepOn(0,0);
  let t=1500;answer(t);
  t=say("ai",GREET,t+250)+300;
  t=say("c","Hi, I think I smell gas by the water heater.",t);stepOn(1,t);
  field("issue","Smells gas by the water heater",t);note('Safety call: heard "smell gas"',t+250,1);
  field("urg",{html:TAG("warn","Safety call")},t+350);t+=650;
  stepOn(2,t);
  t=say("ai",`If you smell gas, see sparks or smoke, please leave the building now and call 911 or the utility from outside. I'm alerting ${BIZ} right now so someone calls you back.`,t);
  field("told","Leave, call 911 or the utility",t-1500);field("book","None",t-1200,"safety first");
  endCall(t+250,"Ended");t+=1100;
  stepOn(3,t);phones(t,[{lab:"Your phone",contact:"AI Receptionist",ini:"AI",time:"7:13"}]);
  sms(0,"stamp","<b>Text Message</b> · Today 7:13 PM",t+250);
  sms(0,"in",'SAFETY CALL from (831) 555-0175: "Hi, I think I smell gas by the water heater". They were told to leave and call 911 or the utility. Call them back now.',t+1100);
  field("own","Alert texted",t+1100,"call them back now");title(t+600,"Gas Smell By Water Heater");state(t+1100,TAG("warn","Safety call"));
  return t+5400}

const STORIES=[storyMain,storyHang,storyGas],ORDER=[0,1,0,2];
function start(i){st.E=0;st.ev=[];st.fi=0;st.ty=[];st.speak=[];st.steps=[];st.building=true;
  st.dur=STORIES[i]();st.ev.sort((a,b)=>a.t-b.t);st.steps.sort((a,b)=>a.t-b.t);st.building=false}
function next(){st.k=(st.k+1)%ORDER.length;start(ORDER[st.k])}

/* ---------- pause */
function setPlay(){$("play").classList.toggle("paused",st.paused);$("playT").textContent=st.paused?"Play":"Pause";root.classList.toggle("paused",st.paused)}
$("play").onclick=()=>{st.paused=!st.paused;setPlay()};

/* ---------- the voice meter: who is talking */
const bars=$("bars");for(let i=0;i<14;i++)bars.appendChild(el("i"));const barEls=[...bars.children],lvl=new Array(14).fill(.12);
let spkWho;
function drawMeter(now){const sp=st.speak.find(s=>st.E>=s[0]&&st.E<=s[1]),who=sp&&sp[2];
  if(who!==spkWho){spkWho=who;bars.className="bars "+(who||"");$("spk").textContent=who==="ai"?"Receptionist":who==="c"?"Caller":""}
  for(let i=0;i<14;i++){let a=.12;
    if(who&&!st.paused)a=.22+.78*Math.abs(Math.sin(i*.9+now/75)*Math.sin(i*.37+now/140));
    else if(st.ring&&!st.paused)a=.12+.3*Math.max(0,Math.sin(now/160-i*.45));
    lvl[i]+=(a-lvl[i])*.3;barEls[i].style.transform=`scaleY(${lvl[i].toFixed(3)})`}}

/* ---------- one loop */
function step(dt){st.E+=dt;
  while(st.fi<st.ev.length&&st.ev[st.fi].t<=st.E)st.ev[st.fi++].fn();
  for(const t of st.ty){if(st.E<t.t0||t.fin)continue;const n=Math.max(0,Math.min(t.w.length,Math.ceil((st.E-t.t0)/t.dur*t.w.length)));
    if(n!==t.n){t.n=n;t.e.textContent=t.w.slice(0,n).join(" ")}if(n===t.w.length){t.fin=1;t.done&&t.done()}}
  if(st.E>=st.dur)next()}
function drawRail(){const s=st.steps;let c=-1;for(let k=0;k<s.length;k++)if(s[k].t<=st.E)c=k;
  if(c<0||!railEls[s[c].i])return;const end=c+1<s.length?s[c+1].t:st.dur;
  railEls[s[c].i].querySelector("u").style.width=Math.min(100,(st.E-s[c].t)/Math.max(1,end-s[c].t)*100)+"%"}
/* PERF GATE: site speed, 2026-09-27. KEEP THIS when the demo is re-exported.
   At most ~90 draws a second, evenly paced, and none while the demo is scrolled
   out of view or the tab is hidden. frame() clamps its dt, so a pause costs the
   story nothing. Inside an iframe the observer's root is the TOP page's viewport. */
let last=performance.now(),_on=true,_wait=false,_drawn=0,_errs=0,_slow=0;
function gate(){if(_wait)return;_wait=true;requestAnimationFrame(now=>{_wait=false;
  if(!_on||document.hidden)return;
  if(now-_drawn<11){gate();return}
  _drawn=now;frame(now)})}
if("IntersectionObserver"in window)new IntersectionObserver(e=>{_on=e[e.length-1].isIntersecting;if(_on)gate()},{rootMargin:"120px"}).observe(root);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)gate()});
["pointerdown","pointermove","wheel","keydown"].forEach(t=>addEventListener(t,()=>{if(!_on)_on=true;gate()},{passive:true,capture:true}));
/* One bad frame must never freeze the demo: the next one is still scheduled. */
function frame(now){
  try{const dt=Math.min(now-last,100);last=now;if(!st.paused)step(dt);
    if(st.live&&st.callT0!=null)$("pillT").textContent="Live "+clock();
    drawMeter(now);if(++_slow%4===0)drawRail()}
  catch(e){if(_errs++<3&&window.console)console.error("AI receptionist demo: a frame failed and was skipped",e)}
  gate()}
/* for checking a moment without waiting for it: demoSeek(story, ms), story 0 = booked call, 1 = hang-up, 2 = gas */
window.demoSeek=(i,ms)=>{st.k=Math.max(0,ORDER.indexOf(i));start(i);for(let e=0;e<ms;e+=40)step(40);drawRail();return st.dur};
setPlay();
(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>{start(ORDER[0]);gate()});
})();
