// إصدار: 2026-10-29.1 · الاختبار
/* mn-dialog.js — نوافذ «مُنجز المدرسي» الداخلية بدل نوافذ المتصفح الأصلية (alert/confirm/prompt)
   السبب: نافذة المتصفح الأصلية تعرض عنوان الموقع («… يعرض موقع») ولا يمكن تغييره من الكود.
   الاستخدام: alert(msg) يعمل كما هو (غير حاجز) — await mnConfirm(msg) → true/false — await mnPrompt(msg, def) → نص أو null */
(function(){
  if(window.__mnDialogLoaded) return; window.__mnDialogLoaded = true;
  var BRAND = 'مُنجز المدرسي';
  var queue = [], showing = false;

  function css(){
    if(document.getElementById('mnDlgCss')) return;
    var st = document.createElement('style'); st.id = 'mnDlgCss';
    st.textContent =
      '#mnDlgOv{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:18px;direction:rtl;font-family:inherit}'+
      '#mnDlg{background:var(--surface,var(--card,#fff));color:var(--fg,var(--text,#1f2937));width:100%;max-width:400px;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden;border:1px solid var(--line,#e5e7eb)}'+
      '#mnDlg .mnT{padding:13px 18px;font-weight:800;font-size:15px;background:var(--accent,#0b7a63);color:#fff;text-align:center;letter-spacing:.2px}'+
      '#mnDlg .mnM{padding:18px 18px 8px;font-size:15px;line-height:1.9;white-space:pre-wrap;word-break:break-word;max-height:55vh;overflow:auto}'+
      '#mnDlg .mnI{display:block;width:calc(100% - 36px);margin:4px 18px 8px;padding:11px 12px;border:1.5px solid var(--line,#d1d5db);border-radius:10px;font:inherit;font-size:15px;background:var(--surface-2,#f9fafb);color:inherit;box-sizing:border-box}'+
      '#mnDlg .mnB{display:flex;gap:8px;padding:10px 18px 16px}'+
      '#mnDlg .mnB button{flex:1;padding:11px 8px;border-radius:10px;font:inherit;font-weight:700;font-size:14.5px;cursor:pointer;border:1.5px solid var(--accent,#0b7a63)}'+
      '#mnDlg .mnOk{background:var(--accent,#0b7a63);color:#fff}'+
      '#mnDlg .mnNo{background:transparent;color:var(--accent,#0b7a63)}';
    (document.head||document.documentElement).appendChild(st);
  }

  function next(){
    if(showing || !queue.length) return;
    if(!document.body){ document.addEventListener('DOMContentLoaded', next, {once:true}); return; }
    showing = true; css();
    var q = queue.shift();
    var ov = document.createElement('div'); ov.id = 'mnDlgOv';
    var box = document.createElement('div'); box.id = 'mnDlg'; box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
    var t = document.createElement('div'); t.className = 'mnT'; t.textContent = BRAND;
    var m = document.createElement('div'); m.className = 'mnM'; m.textContent = String(q.msg == null ? '' : q.msg);
    box.appendChild(t); box.appendChild(m);
    var inp = null;
    if(q.kind === 'prompt'){ inp = document.createElement('input'); inp.className = 'mnI'; inp.type = 'text'; inp.value = q.def == null ? '' : String(q.def); box.appendChild(inp); }
    var bar = document.createElement('div'); bar.className = 'mnB';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'mnOk'; ok.textContent = q.kind === 'alert' ? 'حسنًا' : 'موافق';
    var no = null;
    if(q.kind !== 'alert'){ no = document.createElement('button'); no.type = 'button'; no.className = 'mnNo'; no.textContent = 'إلغاء'; }
    if(no) bar.appendChild(no); bar.appendChild(ok); box.appendChild(bar); ov.appendChild(box);
    var prevFocus = document.activeElement;
    function done(val){
      document.removeEventListener('keydown', onKey, true);
      if(ov.parentNode) ov.parentNode.removeChild(ov);
      showing = false;
      try{ if(prevFocus && prevFocus.focus) prevFocus.focus(); }catch(e){}
      try{ q.resolve(val); }catch(e){}
      next();
    }
    function onKey(e){
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); done(q.kind === 'confirm' ? false : (q.kind === 'prompt' ? null : undefined)); }
      else if(e.key === 'Enter' && e.target !== no){ e.preventDefault(); e.stopPropagation(); ok.click(); }
    }
    ok.onclick = function(){ done(q.kind === 'confirm' ? true : (q.kind === 'prompt' ? inp.value : undefined)); };
    if(no) no.onclick = function(){ done(q.kind === 'confirm' ? false : null); };
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    setTimeout(function(){ try{ (inp || ok).focus(); if(inp) inp.select(); }catch(e){} }, 30);
  }

  function enqueue(kind, msg, def){
    return new Promise(function(resolve){ queue.push({kind:kind, msg:msg, def:def, resolve:resolve}); next(); });
  }

  window.mnAlert = function(msg){ return enqueue('alert', msg); };
  window.mnConfirm = function(msg){ return enqueue('confirm', msg); };
  window.mnPrompt = function(msg, def){ return enqueue('prompt', msg, def); };
  // alert القديم يبقى يعمل كما هو (غير حاجز)، لكن بنافذة داخلية
  window.alert = function(msg){ enqueue('alert', msg); };
  // أي استدعاء confirm/prompt متبقٍّ (لا ينبغي وجوده) لا يعرض نافذة المتصفح: يُرفض بأمان
  window.confirm = function(msg){ try{ console.warn('confirm() الأصلي محظور — استخدم await mnConfirm'); }catch(e){} return false; };
  window.prompt = function(msg){ try{ console.warn('prompt() الأصلي محظور — استخدم await mnPrompt'); }catch(e){} return null; };
})();
