(async () => {
'use strict';
const params=new URLSearchParams(location.search);
const condition=(params.get('c')||'').toUpperCase();
const variant=window.FOMNEXX_CONDITIONS[condition];
const isEntry=document.body.dataset.page==='entry';
const preview=params.get('test')==='1';
function fail(message){document.body.textContent=message;}
if(!variant){fail('此链接无效，请使用收到的产品链接。');return;}
const destination=new URL('product.html',location.href);destination.search=params.toString();
if(!isEntry){
 const copy=window.FOMNEXX_COPY[variant.appeal];
 const heading=document.getElementById('ad-title');heading.replaceChildren(document.createTextNode(copy.title[0]),document.createElement('br'));
 const em=document.createElement('em');em.textContent=copy.title[1];heading.append(em);
 document.getElementById('ad-copy').textContent=copy.body;
 document.querySelector('figure img').src='./'+variant.image;
}
if(preview){
 if(isEntry){location.replace(destination.href);return;}
 const notice=document.createElement('div');notice.className='test-notice';notice.textContent='TEST MODE · 测试模式，不记录数据';
 const restart=document.createElement('button');restart.textContent='重新测试';restart.addEventListener('click',()=>location.reload());notice.append(restart);document.body.prepend(notice);
 const dialog=document.getElementById('updates');dialog.addEventListener('cancel',e=>e.preventDefault());
 for(const id of ['yes','no'])document.getElementById(id).addEventListener('click',()=>{dialog.close();document.getElementById('toast').textContent='测试完成，未记录数据。';});
 setTimeout(()=>dialog.showModal(),2500);return;
}
const config=window.FOMNEXX_CONFIG;
let pid=params.get('pid')||null;
if(pid!==null&&!/^[A-Za-z0-9_-]{1,128}$/.test(pid)){fail('匿名编号格式无效，请检查收到的链接。');return;}
let id,storageKey,state;
try{
 if(pid){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fomnexx-factorial-v1:'+pid)));
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const h=Array.from(bytes.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');
  id=h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
 }else{
  id=localStorage.getItem('fomnexx-factorial-v1-id');
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id||'')){id=crypto.randomUUID();localStorage.setItem('fomnexx-factorial-v1-id',id);}
 }
 storageKey='fomnexx-factorial-v1-state-'+id;
 state=JSON.parse(localStorage.getItem(storageKey)||'null');
 if(state&&state.condition!==condition){fail('此浏览器已打开另一份产品链接，请继续使用最初收到的链接。');return;}
 if(!state)state={id,condition,queue:[],answered:false,durationVersion:1};
 localStorage.setItem(storageKey,JSON.stringify(state));
}catch{fail('请允许浏览器本地存储后重新打开页面。');return;}
if(isEntry){
 if(!state.queue.includes('click'))state.queue.push('click');
 const persist=()=>localStorage.setItem(storageKey,JSON.stringify(state));persist();
 async function openProduct(){
  try{
   // An entry visit is evidence of the external link activation, not an on-page details click.
   while(state.queue.length){const event=state.queue[0];
    const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/fomnexx_factorial_record_event',{
     method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabaseKey},credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000),
     body:JSON.stringify({p_session:id,p_condition:condition,p_event:event,p_pid:pid})});
    if(!response.ok)throw Error('save');state.queue.shift();persist();
   }
   location.replace(destination.href);
  }catch{document.getElementById('entry-status').textContent='连接暂时不稳定，正在重试打开产品页面…';setTimeout(openProduct,4000);}
 }
 void openProduct();return;
}
  // Version 1: visible time only. Separate requests never block choices.
  const durationPage = crypto.randomUUID();
  let durationTotal = 0, durationSeq = 0, durationReady = false;
  let visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
  let pageAway = false;
  function checkpointDuration(leaving = false) {
    const now = performance.now();
    if (visibleSince !== null) durationTotal += Math.max(0, now - visibleSince);
    visibleSince = !pageAway && document.visibilityState === 'visible' ? now : null;
    if (!durationReady || preview || state.durationVersion !== 1) return;
    void fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/fomnexx_factorial_record_duration`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabaseKey },
      body: JSON.stringify({ p_session: state.id, p_condition: condition, p_page: durationPage,
        p_sequence: durationSeq++, p_visible_ms: Math.floor(durationTotal), p_version: 1 }),
      credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: leaving,
      signal: AbortSignal.timeout(10000)
    }).catch(() => {}); // Next checkpoint includes the full cumulative time for this page.
  }
  if (!preview && state.durationVersion === 1) {
    document.addEventListener('visibilitychange', () => checkpointDuration(document.visibilityState !== 'visible'));
    window.addEventListener('pagehide', () => { pageAway = true; checkpointDuration(true); });
    window.addEventListener('pageshow', () => { pageAway = false; visibleSince = document.visibilityState === 'visible' ? performance.now() : null; });
    window.addEventListener('online', () => checkpointDuration());
    setInterval(() => { if (document.visibilityState === 'visible' && !pageAway) checkpointDuration(); }, 15000);
  }

  const dialog = document.getElementById('updates');
  const status = document.getElementById('save-status');
  const buttons = [...dialog.querySelectorAll('button')];
  let flushing = false;
  let retry;
  const save = () => localStorage.setItem(storageKey, JSON.stringify(state));
  const enqueue = (event) => { if (!state.queue.includes(event)) state.queue.push(event); save(); void flush(); };
  async function flush() {
    if (flushing) return;
    flushing = true;
    clearTimeout(retry);
    try {
      while (state.queue.length) {
        const event = state.queue[0];
        const response = preview ? { ok: true } : await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/fomnexx_factorial_record_event`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabaseKey },
          body: JSON.stringify({ p_session: state.id, p_condition: condition, p_event: event, p_pid: pid }),
          credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw new Error(`Event recording failed (${response.status})`);
        state.queue.shift();
        if (event === 'page_view') { durationReady = true; checkpointDuration(); }
        if (event === 'clicked_yes' || event === 'clicked_no') {
          state.answered = true;
          dialog.close();
          document.getElementById('toast').textContent = preview ? 'Preview complete. No research data was recorded.' : '谢谢，您的选择已保存。';
          setTimeout(() => { document.getElementById('toast').textContent = ''; }, 4500);
        }
        save();
      }
    } catch {
      if (state.queue.some(e => e.startsWith('clicked_'))) status.textContent = '您的选择正在等待保存，请保持页面打开，我们会自动重试。';
      retry = setTimeout(flush, 4000);
    } finally { flushing = false; }
  }
  // Idempotent in the database: reloads count as one visit within a session.
  enqueue('page_view');
  dialog.addEventListener('cancel', e => e.preventDefault()); // Neither Escape nor backdrop implies “No”.
  setTimeout(() => {
    if (state.answered) return;
    dialog.showModal();
    enqueue('popup_shown');
    if (state.queue.some(e => e.startsWith('clicked_'))) {
      buttons.forEach(b => { b.disabled = true; });
      status.textContent = '正在保存您的选择…';
    }
  }, 2500);
  function choose(event) {
    if (state.answered || state.queue.some(e => e.startsWith('clicked_'))) return;
    buttons.forEach(b => { b.disabled = true; });
    status.textContent = '正在保存您的选择…';
    enqueue(event);
  }
  document.getElementById('yes').addEventListener('click', () => choose('clicked_yes'));
  document.getElementById('no').addEventListener('click', () => choose('clicked_no'));
  window.addEventListener('online', () => { void flush(); });
})();

