(() => {
'use strict';
const condition='A';
  const config = window.FOMNEXX_CONFIG;
  const preview = config?.preview === true;
  if (preview) {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent = 'PREVIEW ONLY · No research data is recorded.';
    document.body.prepend(notice);
  }
  if (!preview && (!config?.supabaseUrl || !config?.supabaseKey)) {
    console.error('FOMNEXX setup incomplete: configure Supabase before recruiting participants.');
    return; // Never pretend unrecorded responses have been saved.
  }
  const roundKey='fomnexx-gh-qa-20261028-round';
let round=Number(sessionStorage.getItem(roundKey)||'1');
if(!Number.isInteger(round)||round<1||round>20)round=1;
const qaId='f0280000-1028-4000-8000-'+String(round).padStart(12,'0');
const storageKey='fomnexx-gh-qa-20261028-'+round;
const notice=document.createElement('div');notice.className='test-notice';
const label=document.createElement('span');label.textContent='真实保存测试 · 第 '+round+'/20 轮 · 不计入正式统计';
const restart=document.createElement('button');restart.textContent='重新测试（新一轮）';
restart.disabled=round>=20;
restart.addEventListener('click',()=>{sessionStorage.setItem(roundKey,String(round+1));location.reload();});
notice.append(label,restart);document.body.prepend(notice);
  let state;
  try {
    state = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (!state || state.id !== qaId) state = { id: qaId, queue: [], answered: false, durationVersion: 1 };
    sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    console.error('Session storage unavailable. Event collection cannot safely begin.');
    return;
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
    void fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/fomnexx_record_duration`, {
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
  const save = () => sessionStorage.setItem(storageKey, JSON.stringify(state));
  const enqueue = (event) => { if (!state.queue.includes(event)) state.queue.push(event); save(); void flush(); };
  async function flush() {
    if (flushing) return;
    flushing = true;
    clearTimeout(retry);
    try {
      while (state.queue.length) {
        const event = state.queue[0];
        const response = preview ? { ok: true } : await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/fomnexx_record_event`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabaseKey },
          body: JSON.stringify({ p_session: state.id, p_condition: condition, p_event: event }),
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

