/* إصدار: 2026-10-16.7 · الاختبار — «اقترح بالذكاء الاصطناعي»: زر عام يملأ أي حقل نصي عبر الدالة aiSuggest.
   الاستعمال: AIFill.attach({ field: عنصر الحقل, kind: 'نوع الاقتراح', schoolId, getCtx: ()=>({title, domain}), label: 'نص الزر' })
   - يتطلب تحميل firebase-functions-compat.js قبله. المفتاح والحدود في الخادم، فلا شيء سري هنا.
   - الاقتراح مسودة: يُملأ الحقل فقط ولا يُحفظ شيء حتى يضغط المستخدم حفظ/نشر. */
(function(g){
  'use strict';
  const toast = m => (g.ACT && g.ACT.toast) ? g.ACT.toast(m) : (typeof g.toast === 'function' ? g.toast(m) : alert(m));
  const ask = m => (g.mnConfirm ? g.mnConfirm(m) : Promise.resolve(g.confirm(m)));
  async function suggest(kind, schoolId, ctx){
    if(!(g.firebase && firebase.functions)) throw new Error('خدمة الاقتراح غير متاحة في هذه الصفحة.');
    const r = await firebase.functions().httpsCallable('aiSuggest')(Object.assign({ kind, schoolId }, ctx||{}));
    return r.data || {};
  }
  function attach(o){
    const f = o.field; if(!f || f.__aiFill) return null; f.__aiFill = true;
    // أيقونة صغيرة في زاوية الحقل (أعلى اليسار) بدل زر نصي؛ والمرجع/المتبقي يظهران تحت الحقل بخط صغير.
    const wrap = document.createElement('div'); wrap.className = 'ai-fill-wrap'; wrap.style.cssText = 'position:relative';
    f.parentNode.insertBefore(wrap, f); wrap.appendChild(f);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ai-fill-ico';
    btn.textContent = '✨'; btn.title = o.title || 'اقتراح بالذكاء الاصطناعي'; btn.setAttribute('aria-label', btn.title);
    btn.style.cssText = 'position:absolute;top:6px;left:6px;width:28px;height:28px;padding:0;border:1px solid #cfd8dc;border-radius:50%;background:#fff;cursor:pointer;font-size:15px;line-height:26px;text-align:center;opacity:.85;box-shadow:0 1px 3px rgba(0,0,0,.12)';
    wrap.appendChild(btn);
    const note = document.createElement('div'); note.className = 'ai-fill-note dh-sub'; note.style.cssText = 'font-size:12px;margin:2px 0 0';
    wrap.insertAdjacentElement('afterend', note);
    btn.addEventListener('click', async ()=>{
      const ctx = o.getCtx ? o.getCtx() : {};
      if(o.need && !o.need(ctx)){ toast(o.needMsg || 'أكمل البيانات المطلوبة أولًا.'); return; }
      if(f.value.trim() && !(await ask('سيُستبدل النص الحالي بالاقتراح. متابعة؟'))) return;
      const old = btn.textContent; btn.disabled = true; btn.textContent = '⏳'; note.textContent = '';
      try{
        const r = await suggest(o.kind, o.schoolId, ctx);
        f.value = r.text || ''; f.dispatchEvent(new Event('input', { bubbles:true }));
        note.textContent = 'اقتراح بالذكاء الاصطناعي — راجعه وعدّله قبل الاعتماد'+(typeof r.remainingToday==='number' ? ' (المتبقي لمدرستك اليوم: '+r.remainingToday+')' : '');
      }catch(e){
        const m = (e && e.message) ? String(e.message).replace(/^.*?:\s*(?=[؀-ۿ])/, '') : '';
        toast(m || 'تعذّر الاقتراح الآن، حاول لاحقًا.');
      }
      btn.disabled = false; btn.textContent = old;
    });
    return { button: btn, note };
  }
  g.AIFill = { attach, suggest };
})(window);
