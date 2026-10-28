(() => {
'use strict';
const config=window.FOMNEXX_CONFIG;
const key='fomnexx-github-qa-v1';
let state;
try {state=JSON.parse(sessionStorage.getItem(key)||'null');} catch {}
if(!state) state={id:'f0030000'+crypto.randomUUID().slice(8),queue:[],answered:false};
const save=()=>sessionStorage.setItem(key,JSON.stringify(state));
save();
const notice=document.createElement('div');notice.className='test-notice';
const label=document.createElement('span');label.textContent='QA 实测 · 写入测试数据，不计入正式统计 · 编号 '+state.id.slice(-8);
const restart=document.createElement('button');restart.textContent='新一轮测试';restart.onclick=()=>{sessionStorage.removeItem(key);location.reload();};
notice.append(label,restart);document.body.prepend(notice);
const dialog=document.getElementById('updates'),status=document.getElementById('save-status'),toast=document.getElementById('toast');
const buttons=[...dialog.querySelectorAll('button')];let busy=false;
async function flush(){if(busy)return;busy=true;try{while(state.queue.length){const event=state.queue[0];const r=await fetch(config.supabaseUrl+'/rest/v1/rpc/fomnexx_record_qa_event',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabaseKey},credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000),body:JSON.stringify({p_session:state.id,p_condition:'A',p_event:event})});if(!r.ok)throw Error('HTTP '+r.status);state.queue.shift();save();if(event.startsWith('clicked_')){state.answered=true;save();dialog.close();toast.textContent='Supabase 已确认保存：'+(event==='clicked_yes'?'Yes':'No')+'（仅测试）';}else{label.textContent='QA 实测 · '+event+' 已保存 · 编号 '+state.id.slice(-8);}}}catch(e){status.textContent='保存失败（'+e.message+'）。请点击重试；未显示成功就不要当作已保存。';label.textContent='QA 实测 · 保存失败 · 编号 '+state.id.slice(-8);retry.hidden=false;}finally{busy=false;}}
const retry=document.createElement('button');retry.textContent='重试保存';retry.hidden=true;retry.onclick=()=>{retry.hidden=true;void flush();};notice.append(retry);
function enqueue(e){if(!state.queue.includes(e))state.queue.push(e);save();void flush();}
enqueue('page_view');
dialog.addEventListener('cancel',e=>e.preventDefault());
setTimeout(()=>{if(state.answered){toast.textContent='本轮已经回答。点击“新一轮测试”可继续。';return;}dialog.showModal();enqueue('popup_shown');if(state.queue.some(e=>e.startsWith('clicked_')))buttons.forEach(b=>b.disabled=true);},2500);
function choose(e){if(state.answered||state.queue.some(x=>x.startsWith('clicked_')))return;buttons.forEach(b=>b.disabled=true);status.textContent='正在保存测试选择…';enqueue(e);}
document.getElementById('yes').onclick=()=>choose('clicked_yes');document.getElementById('no').onclick=()=>choose('clicked_no');
})();
