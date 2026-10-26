/* A continuous desktop story. Every record and assistant answer is synthetic. */
import { DOC, FOLDER, MARK } from './parts';
import { currentStage, DESCRIPTIONS, STAGES, stageSpan } from '../../src/extension/popup/model';
import { LABELS, PLAN, WEIGHTS, percentOf, type RunState } from '../../src/extension/shared/state';
const FPS = 60, END = 56;
const narration = [
  { at: .55, text: 'A new doctor. On Thursday. Where do you even begin?' },
  { at: 6.1, text: 'Years of records. And one appointment to prepare for.' },
  { at: 11.4, text: 'Log in to Maccabi Online, and start your export.' },
  { at: 17.2, text: 'Your medical file, results, and documents. Together, on your computer.' },
  { at: 23, text: 'Open the folder in an assistant you choose. Then ask about Thursday.' },
  { at: 29.2, text: 'A follow-up worth checking. An approval about to expire. A note from years ago.' },
  { at: 37.4, text: 'Each question names its source, so you can check it.' },
  { at: 43, text: 'Now you have a starting point. You and your doctor decide what comes next.' },
  { at: 49.3, text: 'Health Records Export for Maccabi. Free, on the Chrome Web Store.' },
];
const mark = `<svg viewBox="0 0 24 24">${MARK}</svg>`;
const records = [['Medical file','1988',620,170,-13],['Visit notes','2011',1020,170,9],['Test results','2016',1380,390,-7],['Prescriptions','2023',730,650,6],['Approval','2026',1190,690,-4]];
const questions = [
  ['Do I still need that blood sugar re-test?', 'visit-summaries/ · 2 Mar 2026<br>test-results/list.json', 30.9],
  ['Can I use this physiotherapy approval before it expires?', 'approvals/ · Valid until 15 Nov 2026', 34.1],
  ['Please check the old penicillin rash note.', 'medical-file.pdf · Page 14 · March 2011', 37.9],
] as const;
const stage = document.createElement('main'); stage.id='stage';
stage.innerHTML=`<div id="world">
<div class="actor calendar"><div class="calendar-top"><span>YOUR NEXT APPOINTMENT</span><span>◷</span></div><div class="calendar-main"><div class="weekday">Thursday</div><div class="appointment"><span class="time">09:00</span>New doctor</div><div class="calendar-status">Bring your medical history</div></div></div>
<div class="actor note"><small>BEFORE THE APPOINTMENT</small><div class="note-question"></div></div>
${records.map(([title,year,x,y,angle],i)=>`<div class="actor record" data-x="${x}" data-y="${y}" data-angle="${angle}" data-i="${i}"><div class="record-type">HEALTH RECORD ${DOC}</div><h3>${title}</h3><div class="lines"><i></i><i></i><i></i></div><span class="record-year">${year}</span></div>`).join('')}
<div class="actor browser"><div class="window-tabs"><i></i><i></i><i></i><span class="window-tab">Health portal</span></div><div class="toolbar"><span>‹</span><span>›</span><span>↻</span><span class="address">health-portal.example</span><span class="pin">${mark}</span></div><div class="site-bar">Your health portal</div><div class="site-nav"><div>Overview</div><div class="active">My medical records</div><div>Appointments</div></div><div class="site-page"><h3>Your medical records</h3><div class="site-row"><strong>Test results</strong><small>Results and history</small></div><div class="site-row"><strong>Visit summaries</strong><small>Documents and follow-ups</small></div><div class="site-row"><strong>Medical file</strong><small>Your full history</small></div></div><iframe title="Actual extension popup, synthetic account" src="/src/extension/popup/popup.html?state=ready"></iframe><div class="browser-note"><b>Actual extension UI</b> · Demo sped up · Keep the portal open and in front<br>Orders your medical file; you will get a text. Usually a few minutes, up to 20.</div></div>
<div class="actor zip"><div class="zip-art">${DOC}</div><div class="zip-label">maccabi-export.zip</div><small class="zip-meta">486 files · Saved on your computer</small></div>
<div class="actor assistant"><div class="assistant-bar"><span>Your chosen assistant</span><small>Illustrative assistant · After export</small></div><div class="folder-pill">${FOLDER}maccabi-export</div><div class="file-list">${['README.md','medical-file.pdf','test-results/','visit-summaries/','approvals/','medications-and-prescriptions/'].map((name,i)=>`<div class="file-row ${i===0?'readme':''}">${i<2?DOC:FOLDER}${name}</div>`).join('')}</div><div class="prompt"></div><div class="reading">Reading your selected files…</div><div class="extract"><small></small><h3></h3><p></p><div class="source-path"></div></div><div class="save-brief">Save brief ↓</div></div>
<div class="permission"><h3>Open this folder in your assistant?</h3><p>You choose what to share.<br>Check the service’s data settings first.</p><div class="permission-actions"><span>Cancel</span><span class="primary">Open folder</span></div></div>
<svg class="thread"><path d="M990 660 C1060 660 1050 480 1120 480"/></svg>
<div class="actor brief"><div class="brief-file">${DOC}For Thursday.pdf</div><div class="brief-stamp">Saved locally ✓</div><h2>For Thursday</h2><p class="brief-sub">Questions for my new doctor</p>${questions.map(([text,source],i)=>`<div class="brief-row"><div class="brief-question"><b>${i+1}</b><span>${text}</span></div><div class="brief-source">${source}</div></div>`).join('')}<div class="brief-footer"><span>Check each source with your doctor</span><span>1 / 1</span></div></div>
<div class="actor end-copy"><h1>Walk in with<br><em>better questions.</em></h1><div class="end-product">${mark}Health Records Export for Maccabi</div><div class="cta">Free on the Chrome Web Store ↗</div><div class="url">maccabi.ronirachmani.com</div></div>
<svg class="cursor" viewBox="0 0 34 44"><path d="M3 2v33l9-9 7 15 7-3-7-14h13z" fill="#083f92" stroke="white" stroke-width="2"/></svg><div class="click-ring"></div>
</div><div id="caption"></div><div id="disclaimer"><span>Synthetic records · Illustrative assistant output</span><span>Independent, unofficial extension · Not affiliated with Maccabi</span></div>`;
document.body.append(stage);
const q = <T extends Element = HTMLElement>(s:string)=>stage.querySelector<T>(s)!;
const all = (s:string)=>Array.from(stage.querySelectorAll<HTMLElement>(s));
const clamp=(u:number)=>Math.max(0,Math.min(1,u));
const ease=(t:number,a:number,b:number)=>{const u=clamp((t-a)/(b-a));return u*u*(3-2*u);};
const lerp=(a:number,b:number,u:number)=>a+(b-a)*u;
function actor(s:string,opacity:number,x=0,y=0,scale=1,rotate=0){const el=q(s);el.style.opacity=String(clamp(opacity));el.style.transform=`translate(${x}px,${y}px) scale(${scale}) rotate(${rotate}deg)`;}
function typed(s:string,text:string,u:number){q(s).textContent=text.slice(0,Math.floor(text.length*clamp(u)));}
const frame=q<HTMLIFrameElement>('iframe');
const BASE_TIME=Date.parse('2026-09-17T09:00:00Z');
let clickTarget={x:1599,y:457};
function runAt(t:number):RunState|null {
  if(t<13.2)return null;
  const u=clamp((t-13.2)/6), total=PLAN.reduce((n,s)=>n+WEIGHTS[s],0), target=u*total;
  let before=0,next=0;
  for(;next<PLAN.length-1&&target>before+WEIGHTS[PLAN[next]];next++)before+=WEIGHTS[PLAN[next]];
  const step=PLAN[next],fraction=clamp((target-before)/WEIGHTS[step]),parts=Object.keys(DESCRIPTIONS[step]);
  const part=parts[Math.min(parts.length-1,Math.floor(fraction*parts.length))],detail=part?LABELS[step]+': '+part:undefined;
  const filesByKey:Record<string,number>={};
  for(let i=1;i<currentStage({next,detail});i++){const stage=STAGES[i],part=stage.parts?.at(-1),span=stageSpan(i);filesByKey[part?stage.steps.at(-1)+':'+part:stage.steps[0]]=Math.max(1,Math.round(486*(span.end-span.start)/100));}
  return {id:'synthetic-film',status:u===1?'done':step==='save'?'saving':'running',tabId:1,ctx:{},next:u===1?PLAN.length:next,nextStep:PLAN[next],startedAt:new Date(BASE_TIME).toISOString(),finishedAt:u===1?new Date(BASE_TIME+540000).toISOString():undefined,percent:u===1?100:percentOf(next,fraction,1),stepDone:fraction,stepTotal:1,detail,filesByKey,fileCount:Math.round(u*486),byteCount:Math.round(u*38400000),zipBytes:u===1?38400000:undefined,zipName:'maccabi-export-2026-09-17.zip',problems:[],problemCount:0};
}
function sizePopup(){frame.style.width=frame.contentDocument!.body.offsetWidth+'px';frame.style.height=Math.min(600,Math.ceil(frame.contentDocument!.body.getBoundingClientRect().height))+'px';}
const extracts=[
  ['VISIT NOTE · 2 MAR 2026','“Re-test in April.”','No later result found <span class="highlight">in this export</span>.','visit-summaries/ + test-results/list.json'],
  ['PHYSIOTHERAPY APPROVAL','Valid until <span class="highlight">15 Nov 2026</span>','A date to discuss before the approval expires.','approvals/'],
  ['MEDICAL FILE · PAGE 14','March 2011: <span class="highlight">rash after penicillin</span>','An old recorded reaction to check with your doctor.','medical-file.pdf · p. 14'],
];
function draw(t:number){
  const pull=ease(t,5.8,9.5),end=ease(t,48.5,52),resolve=ease(t,42,46.8);
  q('#world').style.transform=`translate(${lerp(-170,0,pull)}px,${lerp(-80,0,pull)}px) scale(${lerp(1.2,1,pull)})`;
  actor('.calendar',1,lerp(0,-630,pull),lerp(0,-45,pull),lerp(1,.58,pull));
  actor('.note',1,lerp(0,-690,pull),lerp(0,-120,pull)+350*end,lerp(1,.65,pull),-3);
  typed('.note-question',t<43?'Where do I begin?':'Ready for Thursday.',t<43?ease(t,1.5,3.7):ease(t,43,44.5));
  q('.calendar-status').textContent=t<43?'Bring your medical history':'Appointment brief ready ✓';
  all('.record').forEach((el,i)=>{const u=ease(t,6.2+i*.28,7.2+i*.28),out=ease(t,9.3,11);el.style.left=el.dataset.x+'px';el.style.top=el.dataset.y+'px';el.style.opacity=String(u*(1-out));el.style.transform=`translateY(${(1-u)*110}px) rotate(${el.dataset.angle}deg) scale(${.8+.2*u})`;});
  const browserIn=ease(t,9,11),browserOut=ease(t,21,23.5);
  actor('.browser',browserIn*(1-browserOut),lerp(650,0,browserIn)-browserOut*100,0,1-.1*browserOut);
  (frame.contentWindow as unknown as {Date:DateConstructor}).Date.now=()=>BASE_TIME+Math.round(clamp((t-13.2)/6)*540000);
  if(t===0||(t>=9&&t<23.5)){(frame.contentWindow as unknown as {demoRun:(r:RunState|null)=>void}).demoRun(runAt(t));sizePopup();for(const a of frame.contentDocument!.getAnimations()){if('transitionProperty'in a)a.finish();else{a.pause();a.currentTime=t*1000;}}}
  const zipIn=ease(t,20.9,21.8),zipMove=ease(t,21.2,23.3),zipOut=ease(t,24,25.2);
  actor('.zip',zipIn*(1-zipOut),lerp(0,-710,zipMove),lerp(0,50,zipMove),lerp(.6,1,zipMove),lerp(8,-3,zipMove));
  const ai=ease(t,23.5,25.3),ao=ease(t,42.5,47);
  actor('.assistant',ai*(1-ao),0,lerp(70,0,ai),1-.06*ao);
  actor('.permission',ease(t,24,24.5)*(1-ease(t,25.5,26)),0,(1-ease(t,24,24.5))*30);
  actor('.file-list',1-ease(t,26.4,27.2));
  actor('.prompt',ease(t,26.6,27.1));typed('.prompt','Help me prepare for Thursday. What should I ask?',ease(t,26.7,28.5));
  actor('.reading',ease(t,28.5,29));q('.reading').textContent=t<39?'Reading across your selected files…':'Three questions, with sources.';
  const idx=t<33.4?0:t<37?1:2,starts=[29.7,33.4,37];
  const extract=q('.extract'); extract.querySelector('small')!.textContent=extracts[idx][0];extract.querySelector('h3')!.innerHTML=extracts[idx][1];extract.querySelector('p')!.innerHTML=extracts[idx][2];extract.querySelector('.source-path')!.textContent=extracts[idx][3];
  actor('.extract',ease(t,29.7,30.2),0,(1-ease(t,starts[idx],starts[idx]+.4))*15);
  const briefIn=ease(t,29,29.7);actor('.brief',briefIn,lerp(0,-460,resolve)+lerp(0,-510,end),lerp(0,-55,resolve)+lerp(0,120,end),lerp(1,.95,resolve)*lerp(1,.67,end),lerp(0,-2,end));
  all('.brief-row').forEach((el,i)=>{const u=ease(t,questions[i][2],questions[i][2]+.6);el.style.opacity=String(u);el.style.transform=`translateY(${(1-u)*12}px)`;});
  actor('.brief-stamp',ease(t,42,42.4));actor('.save-brief',ease(t,39,39.6));
  const path=q<SVGPathElement>('.thread path'),thread=ease(t,starts[idx]+.3,starts[idx]+1),threadOut=ease(t,starts[idx]+2,starts[idx]+2.7);
  path.setAttribute('d',`M990 660 C1060 660 1050 ${480+idx*130} 1120 ${480+idx*130}`);path.style.strokeDasharray='550';path.style.strokeDashoffset=String(550*(1-thread));q<SVGElement>('.thread').style.opacity=String(thread*(1-threadOut)*(1-ao));
  actor('.end-copy',end,0,(1-end)*35);
  q('#caption').textContent=t>=26&&t<42?'Example workflow in an assistant that supports local files':t>=42&&t<49?'Your starting point. You and your doctor decide what comes next.':'';
  const cursor=q('.cursor'),ring=q('.click-ring');let pos={x:0,y:0},alpha=0,click=0;
  if(t>=11.5&&t<14){const u=ease(t,11.5,13.2);pos={x:lerp(1400,clickTarget.x,u),y:lerp(740,clickTarget.y,u)};alpha=ease(t,11.5,11.8)*(1-ease(t,13.5,14));click=13.2;}
  else if(t>=24.5&&t<26.2){const u=ease(t,24.5,25.5);pos={x:lerp(1300,1180,u),y:lerp(700,580,u)};alpha=ease(t,24.5,24.8)*(1-ease(t,25.8,26.2));click=25.5;}
  else if(t>=40.5&&t<42.5){const u=ease(t,40.5,42);pos={x:lerp(750,540,u),y:lerp(780,898,u)};alpha=ease(t,40.5,40.8)*(1-ease(t,42,42.5));click=42;}
  cursor.style.opacity=String(alpha);cursor.style.transform=`translate(${pos.x}px,${pos.y}px)`;ring.style.left=pos.x-20+'px';ring.style.top=pos.y-20+'px';ring.style.opacity=String(click&&t>=click?(1-ease(t,click,click+.4)):0);ring.style.transform=`scale(${.4+ease(t,click,click+.4)})`;
}
async function main(){
  await document.fonts.load('500 83px Roboto');await document.fonts.ready;
  for(let i=0;i<200;i++){if((frame.contentWindow as unknown as {demoRun?:unknown})?.demoRun&&frame.contentDocument?.querySelector('#view > :not(.loading)'))break;if(i===199)throw Error('Popup not ready');await new Promise(r=>setTimeout(r,25));}
  await frame.contentDocument!.fonts.ready;sizePopup();
  const b=frame.contentDocument!.querySelector('button')!.getBoundingClientRect(),f=frame.getBoundingClientRect();clickTarget={x:f.x+(b.x+b.width/2)*1.15,y:f.y+(b.y+b.height/2)*1.15};
  (window as unknown as {video:unknown}).video={fps:FPS,frames:FPS*END,holds:[[52,END]],soundtrack:{duration:END,narration,sounds:[{at:6.3,kind:'suck',dur:.5},{at:10,kind:'whoosh',dur:.6},{at:13.2,kind:'click'},{at:19.2,kind:'chime'},{at:21.5,kind:'pop'},{at:25.5,kind:'click'},{at:30.9,kind:'tick'},{at:34.1,kind:'tick'},{at:37.9,kind:'tick'},{at:42,kind:'click'},{at:49.5,kind:'shimmer'}],scenes:{answer:0,cards:6,browser:11,runFrom:13.2,open:21,uses:27,ask:37.9,privacy:41,close:49,end:END}},async at(n:number){draw(n/FPS);await new Promise(r=>setTimeout(r,0));await new Promise(r=>requestAnimationFrame(r));}};
  draw(0);document.documentElement.dataset.ready='1';
}
main().catch(error=>{document.documentElement.dataset.ready='error: '+String(error);});
