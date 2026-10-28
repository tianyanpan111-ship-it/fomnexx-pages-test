(async () => {
'use strict';
const params=new URLSearchParams(location.search);
const pathCondition=/\/(hr|he|lr|le)\.html$/i.exec(new URL(location.href).pathname)?.[1]?.toUpperCase();
const fixedCondition=pathCondition||document.body.dataset.condition;
const condition=(fixedCondition||params.get('c')||params.get('group')||'').toUpperCase();
const variant=window.FOMNEXX_CONDITIONS[condition];
const isEntry=document.body.dataset.page==='entry';
const preview=params.get('test')==='1';
function fail(message){document.body.textContent=message;}
if(!variant){fail('此链接无效，请使用收到的产品链接。');return;}
if(!fixedCondition){
 const copy=window.FOMNEXX_COPY[variant.appeal];
 const heading=document.getElementById('ad-title');heading.replaceChildren(document.createTextNode(copy.title[0]),document.createElement('br'));
 const em=document.createElement('em');em.textContent=copy.title[1];heading.append(em);
 document.getElementById('ad-copy').textContent=copy.body;
 document.querySelector('figure img').src='./'+variant.image;
}
if(preview){
 const notice=document.createElement('div');notice.className='test-notice';notice.textContent='TEST MODE · 测试模式，不记录数据';
 const restart=document.createElement('button');restart.textContent='重新测试';restart.addEventListener('click',()=>location.reload());notice.append(restart);document.body.prepend(notice);
 const dialog=document.getElementById('updates');dialog.addEventListener('cancel',e=>e.preventDefault());
 for(const id of ['yes','no'])document.getElementById(id).addEventListener('click',()=>{dialog.close();document.getElementById('toast').textContent='测试完成，未记录数据。';});
 setTimeout(()=>dialog.showModal(),2500);return;
}
const config=window.FOMNEXX_CONFIG;
let pid=params.get('pid')||null;
if(pid!==null&&!/^[A-Za-z0-9_-]{1,128}$/.test(pid)){fail('匿名编号格式无效，请检查收到的链接。');return;}
// pid is solely supplied by Credamo. A visit UUID is not a participant ID.
const id=crypto.randomUUID();
let storageKey,state;
try{
 let browserKey=localStorage.getItem('fomnexx-missing-pid-browser');
 if(!pid&&!browserKey){browserKey=crypto.randomUUID();localStorage.setItem('fomnexx-missing-pid-browser',browserKey);}
 storageKey='fomnexx-factorial-v4:'+condition+':'+(pid?'pid:'+pid:'missing:'+browserKey);
 state=JSON.parse(localStorage.getItem(storageKey)||'null')||{queue:[],answered:false,durationVersion:1};
 // Keep pending events with their original visit ID across refreshes.
 state.id=id;state.condition=condition;
 localStorage.setItem(storageKey,JSON.stringify(state));
}catch{fail('请允许浏览器本地存储后重新打开页面。');return;}
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
  const enqueue = (event) => { if (!state.queue.some(x=>x.event===event&&x.visit===id)) state.queue.push({event,visit:id}); save(); void flush(); };
  async function flush() {
    if (flushing) return;
    flushing = true;
    clearTimeout(retry);
    try {
      while (state.queue.length) {
        const item = state.queue[0];
        const event = item.event;
        const response = preview ? { ok: true } : await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/fomnexx_factorial_record_event`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabaseKey },
          body: JSON.stringify({ p_session: item.visit, p_condition: condition, p_event: event, p_pid: pid }),
          credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw new Error(`Event recording failed (${response.status})`);
        state.queue.shift();
        if (event === 'page_view' && item.visit === id) { durationReady = true; checkpointDuration(); }
        if (event === 'clicked_yes' || event === 'clicked_no') {
          state.answered = true;
          dialog.close();
          document.getElementById('toast').textContent = preview ? 'Preview complete. No research data was recorded.' : '谢谢，您的选择已保存。';
          setTimeout(() => { document.getElementById('toast').textContent = ''; }, 4500);
        }
        save();
      }
    } catch {
      if (state.queue.some(e => e.event.startsWith('clicked_'))) status.textContent = '您的选择正在等待保存，请保持页面打开，我们会自动重试。';
      retry = setTimeout(flush, 4000);
    } finally { flushing = false; }
  }
  // One UUID per page load preserves repeat visits; retries for that visit stay idempotent.
  // Render immediately; persist entry activation and page view in order in the background.
  if(isEntry) enqueue('click');
  enqueue('page_view');
  dialog.addEventListener('cancel', e => e.preventDefault()); // Neither Escape nor backdrop implies “No”.
  setTimeout(() => {
    if (state.answered) return;
    dialog.showModal();
    enqueue('popup_shown');
    if (state.queue.some(e => e.event.startsWith('clicked_'))) {
      buttons.forEach(b => { b.disabled = true; });
      status.textContent = '正在保存您的选择…';
    }
  }, 2500);
  function choose(event) {
    if (state.answered || state.queue.some(e => e.event.startsWith('clicked_'))) return;
    buttons.forEach(b => { b.disabled = true; });
    status.textContent = '正在保存您的选择…';
    enqueue(event);
  }
  document.getElementById('yes').addEventListener('click', () => choose('clicked_yes'));
  document.getElementById('no').addEventListener('click', () => choose('clicked_no'));
  window.addEventListener('online', () => { void flush(); });
})();

