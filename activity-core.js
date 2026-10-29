// إصدار: 2026-10-17.5 · الاختبار
/* نواة منصة النشاط المدرسي — مشتركة بين activity.html (الرائد والمدير) وmyactivities.html (المعلم).
   تحوي: الثوابت (الأندية الوزارية، قالب المسار العام)، التاريخ الهجري (أم القرى)، تحميل البيانات وحفظها،
   النوافذ والاختيار المتعدد، ضغط الصور ورفعها إلى Firebase Storage، ونموذج توثيق التنفيذ المطبوع (QR + شواهد). */
(function(g){
  'use strict';
  const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arN = n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
  const $ = (s,r)=>(r||document).querySelector(s);
  const $$ = (s,r)=>Array.from((r||document).querySelectorAll(s));

  /* ---------- الثوابت ---------- */
  const CLUBS_DEFAULT = [
    { key:'scout',    name:'النادي الكشفي',        domain:'النشاط الكشفي',        icon:'⚜️', dom:'كشفي' },
    { key:'sports',   name:'النادي الرياضي',       domain:'الرياضة والصحة',       icon:'🏅', dom:'رياضي' },
    { key:'social',   name:'النادي الاجتماعي',     domain:'المواطنة والحياة',     icon:'🤝', dom:'اجتماعي' },
    { key:'science',  name:'النادي العلمي',        domain:'العلوم والتقنية',      icon:'🔬', dom:'علمي' },
    { key:'art',      name:'النادي الفني',         domain:'الثقافة والفنون',      icon:'🎨', dom:'فني' },
    { key:'cultural', name:'النادي الثقافي',       domain:'الثقافة والفنون',      icon:'📚', dom:'ثقافي' },
    { key:'training', name:'نادي التدريب الطلابي', domain:'المواطنة والحياة',     icon:'🎓', dom:'تدريبي' }
  ];
  const DOMAINS = ['رياضي','اجتماعي','كشفي','علمي','فني','ثقافي','تدريبي'];
  const GENERAL_TEMPLATE = [
    { id:'national_day',     title:'الاحتفاء باليوم الوطني',          freq:'سنوي',  clubs:['social'] },
    { id:'vision_2030',      title:'رؤية المملكة ٢٠٣٠',               freq:'سنوي',  clubs:['training'] },
    { id:'traffic_safety',   title:'أسبوع المرور',                    freq:'سنوي',  clubs:['scout'] },
    { id:'volunteer_work',   title:'العمل التطوعي',                   freq:'فصلي',  clubs:['social'] },
    { id:'school_olympics',  title:'الأولمبياد المدرسي',              freq:'سنوي',  clubs:['sports'] },
    { id:'tree_week',        title:'أسبوع الشجرة',                    freq:'سنوي',  clubs:['science','scout'] },
    { id:'arabic_day',       title:'اليوم العالمي للغة العربية',      freq:'سنوي',  clubs:['cultural'] },
    { id:'anti_drugs',       title:'مكافحة المخدرات',                 freq:'سنوي',  clubs:['social','scout'] },
    { id:'anti_smoking',     title:'مكافحة التدخين',                  freq:'سنوي',  clubs:['sports','science'] },
    { id:'dental_health',    title:'صحة الأسنان',                     freq:'سنوي',  clubs:['science'] },
    { id:'civil_defense',    title:'اليوم العالمي للدفاع المدني',     freq:'سنوي',  clubs:['scout'] },
    { id:'disability_day',   title:'اليوم العالمي لذوي الإعاقة',      freq:'سنوي',  clubs:['social'] },
    { id:'flag_day',         title:'يوم العلم',                       freq:'سنوي',  clubs:['social','cultural'] },
    { id:'founding_day',     title:'يوم التأسيس',                     freq:'سنوي',  clubs:['social','cultural'] }
  ];
  const DAYS = [['sunday','الأحد'],['monday','الاثنين'],['tuesday','الثلاثاء'],['wednesday','الأربعاء'],['thursday','الخميس']];
  const PLAN_ST = { planned:'مخطط', executed:'مُنفَّذ', cancelled:'ملغى' };
  const ST_CLS = { planned:'', executed:'ok', cancelled:'bad' };

  /* ---------- التاريخ ---------- */
  const pad = n=>String(n).padStart(2,'0');
  const today = ()=>{ const d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
  /* تاريخ (بتوقيت مكة) من ميلي ثانية؛ وتاريخ إنشاء بند الخطة: createdAt إن وُجد، وإلا من معرّفه (p + الوقت بالأساس ٣٦) */
  const dateOfMs = ms=>(ms && ms>0) ? new Date(ms+3*3600000).toISOString().slice(0,10) : '';
  const planItemDate = it=>{ if(!it) return ''; if(it.createdAt) return dateOfMs(it.createdAt); const n = parseInt(String(it.id||'').slice(1),36); return (n>1.5e12 && n<4e12) ? dateOfMs(n) : ''; };
  const addDays = (k,n)=>{ const d=new Date(k+'T12:00:00'); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
  /* تقويم أم القرى: ٢٣/٠٣/١٤٤٧هـ */
  function hijri(k, long){
    if(!k) return '';
    try{
      const d = new Date(k+'T12:00:00');
      if(long) return arN(new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn',{day:'numeric',month:'long',year:'numeric'}).format(d)).replace(/\s*هـ?$/,'')+'هـ';
      const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn',{day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(d);
      const m = {}; parts.forEach(p=>{ m[p.type]=p.value; });
      return arN(m.day+'/'+m.month+'/'+m.year)+'هـ';
    }catch(e){ return k; }
  }
  const dayName = k=>{ try{ return new Date(k+'T12:00:00').toLocaleDateString('ar',{weekday:'long'}); }catch(e){ return ''; } };

  /* ---------- الأنماط المشتركة ---------- */
  const CSS = `
.ac-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:12px;border-bottom:1px solid var(--line)}
.ac-tab{flex:none;background:#fff;border:1.5px solid var(--line);color:var(--ink);padding:8px 14px;border-radius:10px;font:700 13.5px Tajawal,system-ui;white-space:nowrap}
.ac-tab.on{background:var(--brand);border-color:var(--brand);color:#fff}
.ac-tab .n{display:inline-block;min-width:18px;padding:0 5px;margin-inline-start:5px;background:#b42318;color:#fff;border-radius:9px;font-size:11px;line-height:18px;text-align:center}
.ac-btn{background:var(--brand);color:#fff;padding:8px 14px;border-radius:10px;font:700 13px Tajawal,system-ui}
.ac-btn.sec{background:#fff;color:var(--brand);border:1.5px solid var(--brand)}
.ac-btn.bad{background:#b42318}.ac-btn.sm{padding:5px 10px;font-size:12px}.ac-btn[disabled]{opacity:.5;cursor:not-allowed}
.ac-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ac-row.sb{justify-content:space-between}
.ac-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.ac-club{border:1px solid var(--line);border-radius:14px;padding:12px;background:#fff;box-shadow:var(--shadow)}
.ac-club .ic{font-size:26px}.ac-club h4{margin:4px 0 2px;font-size:15px}
.ac-tbl{width:100%;border-collapse:collapse;font-size:13px}
.ac-tbl th,.ac-tbl td{border:1px solid var(--line);padding:6px 8px;text-align:right;vertical-align:top}
.ac-tbl th{background:#eef5f4;font-weight:800}
.ac-wrap{overflow-x:auto}
.ac-in,.ac-sel,.ac-ta{width:100%;padding:8px 10px;border:1.5px solid var(--line);border-radius:9px;font:inherit;background:#fff;color:var(--ink)}
.ac-ta{min-height:80px;resize:vertical}
.ac-f{margin-bottom:10px}.ac-f>label{display:block;font-weight:700;font-size:12.5px;margin-bottom:3px;color:var(--muted)}
.ac-2c{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:560px){.ac-2c{grid-template-columns:1fr}}
.ac-ov{position:fixed;inset:0;z-index:900;background:rgba(15,23,42,.5);display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto}
.ac-md{background:#fff;border-radius:16px;width:100%;max-width:560px;margin:auto;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden}
.ac-md.wide{max-width:760px}
.ac-md>h3{margin:0;padding:12px 16px;background:var(--brand);color:#fff;font-size:15.5px}
.ac-md .bd{padding:14px 16px;max-height:68vh;overflow:auto}
.ac-md .ft{display:flex;gap:8px;justify-content:flex-start;padding:10px 16px;border-top:1px solid var(--line);background:#f8fbfa}
.ac-bar{height:12px;border-radius:7px;background:#e3ecea;overflow:hidden}.ac-bar>i{display:block;height:100%;background:var(--brand)}
.ac-pick{border:1.5px solid var(--line);border-radius:10px;padding:6px}
.ac-pick .list{max-height:190px;overflow:auto;margin-top:6px}
.ac-pick label{display:flex;gap:8px;align-items:center;padding:4px 6px;border-radius:7px;font-size:13px}
.ac-pick label:hover{background:#f1f6f5}
.ac-pick .cnt{font-size:12px;color:var(--muted)}
.ac-pick label.ac-lk{opacity:.5;cursor:not-allowed}.ac-pick .ac-xt{margin-inline-start:auto;font:700 11px Tajawal,system-ui;color:#8a5a00;background:#fff3d6;border-radius:6px;padding:1px 6px}
.ac-phb{display:inline-flex;align-items:center;gap:6px;cursor:pointer}.ac-phb.off{opacity:.5;pointer-events:none}
.ac-pick .gh{position:sticky;top:0;background:#e3eef0;color:#17475e;font:800 12.5px Tajawal,system-ui;padding:4px 8px;border-radius:7px;margin-top:4px}
.ac-steps{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--muted);flex-wrap:wrap;margin:6px 0}
.ac-steps b{padding:2px 9px;border-radius:12px;background:#eef2f1}.ac-steps b.on{background:var(--brand-l);color:var(--brand-2)}
.ac-ro .ac-edit{display:none !important}
details.ac-acc{border:1px solid var(--line);border-radius:12px;background:#fff;margin-bottom:8px}
details.ac-acc>summary{cursor:pointer;padding:10px 12px;font-weight:700;display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap}
details.ac-acc .in{padding:4px 12px 12px}
.ac-ph{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.ac-ph .p{position:relative;width:84px;height:84px;border-radius:9px;overflow:hidden;border:1px solid var(--line)}
.ac-ph .p img{width:100%;height:100%;object-fit:cover}
.ac-ph .p button{position:absolute;top:2px;left:2px;background:#b42318;color:#fff;border-radius:50%;width:20px;height:20px;font-size:12px;line-height:20px;padding:0}
/* ===== مظهر منصة النشاط (مستوحى من تصميم النموذج المعتمد) — يخص صفحات النشاط وحدها ===== */
body.act-skin{--brand:#1a6b4a;--brand-2:#145838;--brand-l:#e8f5ee;--bg:#f8f7f4;--surface:#fff;--surface-alt:#f0eee9;--ink:#1a1917;--muted:#6b6860;--line:#e2dfd8;--r:10px;--shadow:0 1px 3px rgba(26,25,23,.06);--shadow-md:0 4px 12px rgba(26,25,23,.08);
  background:var(--bg);color:var(--ink);font-family:'IBM Plex Sans Arabic',Tajawal,system-ui,sans-serif;line-height:1.7}
.act-skin .dh-top{padding:16px 20px;border-radius:0 0 10px 10px;margin-bottom:6px}
.act-skin .dh-top h1{font-family:Tajawal,sans-serif;font-size:1.2rem;font-weight:700}
.act-skin .dh-badge{background:rgba(255,255,255,.2);padding:4px 14px;font-size:.82rem;font-weight:500}
.act-skin .dh-btn{background:rgba(255,255,255,.2);border-radius:20px;font-weight:600}
.act-skin .dh-main{padding:6px 16px 60px}
/* التبويبات الرئيسية: حبوب مفرغة */
.act-skin .ac-tabs{gap:4px;padding:8px 0 4px;margin-bottom:8px;border-bottom:0;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.act-skin .ac-tabs::-webkit-scrollbar{display:none}
.act-skin .ac-tab{background:transparent;color:var(--muted);border:1.5px solid var(--line);padding:8px 16px;border-radius:20px;font:500 .85rem 'IBM Plex Sans Arabic',Tajawal,sans-serif;transition:all .2s}
@media(hover:hover){.act-skin .ac-tab:hover{border-color:var(--brand);color:var(--brand)}.act-skin .ac-tab.on:hover{color:#fff}.act-skin .ac-btn:hover{background:var(--brand-2)}.act-skin .ac-btn.sec:hover{background:var(--brand-l)}.act-skin .ac-club:hover{border-color:var(--brand);box-shadow:var(--shadow-md);transform:translateY(-1px)}.act-skin .ac-club .ac-btn:hover{background:var(--brand);color:#fff}.act-skin .ac-rep .ac-btn:hover{border-color:var(--brand);background:var(--brand-l)}}
.act-skin .ac-tab.on{background:var(--brand);border-color:var(--brand);color:#fff}
.act-skin .ac-tab .n{background:#c0392b}
/* التبويبات الفرعية: شريط مجزَّأ */
.act-skin .ac-tabs.sub{background:var(--surface-alt);border-radius:6px;padding:3px;gap:2px;margin:4px 0 14px}
.act-skin .ac-tabs.sub .ac-tab{flex:1 0 auto;border:0;border-radius:4px;padding:8px 12px;font-size:.8rem;text-align:center;background:transparent;color:var(--muted)}
.act-skin .ac-tabs.sub .ac-tab.on{background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}
/* البطاقات والأرقام */
.act-skin .dh-card{padding:20px;border-radius:var(--r);margin-bottom:12px}
.act-skin .dh-card h3{font-family:Tajawal,sans-serif;font-size:1rem;font-weight:700}
.act-skin .dh-stats{grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-bottom:16px}
.act-skin .dh-stat{padding:20px 16px;border-radius:var(--r)}
.act-skin .dh-stat b{font-family:Tajawal,sans-serif;font-size:2rem;font-weight:800;line-height:1.2}
.act-skin .dh-stat span{font-size:.82rem;font-weight:400;display:block;margin-top:4px}
.act-skin .dh-chip{padding:2px 10px;border-radius:12px;font-size:.75rem;font-weight:600}
.act-skin .dh-chip.ok{background:#e8f8ef;color:#27ae60}.act-skin .dh-chip.warn{background:#fef3e0;color:#c4760e}.act-skin .dh-chip.bad{background:#fdecea;color:#c0392b}
.act-skin .dh-item{border:0;border-bottom:1px solid var(--line);border-radius:0;padding:12px 0}.act-skin .dh-item:last-child{border-bottom:0}
.act-skin .dh-link{border-radius:6px;font-weight:600}
/* الأندية */
.act-skin .ac-grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.act-skin .ac-club{padding:20px 16px;border-radius:var(--r);transition:all .2s}
.act-skin .ac-club .ic{font-size:1.8rem;margin-bottom:8px}.act-skin .ac-club h4{font-family:Tajawal,sans-serif;font-size:.95rem;font-weight:700;margin:0 0 6px}
.act-skin .ac-club .ac-btn{display:block;width:100%;margin-top:4px;background:var(--brand-l);color:var(--brand);border-radius:6px;font-weight:600}
/* الأزرار */
.act-skin .ac-btn{border-radius:6px;font:600 .85rem 'IBM Plex Sans Arabic',Tajawal,sans-serif;padding:9px 18px;transition:all .15s}
.act-skin .ac-btn.sec{background:transparent;color:var(--brand);border:1.5px solid var(--brand)}
.act-skin .ac-btn.bad{background:#c0392b}.act-skin .ac-btn.sm{padding:6px 14px;font-size:.8rem}
/* الجداول */
.act-skin .ac-tbl{font-size:.85rem}
.act-skin .ac-tbl th{background:var(--surface-alt);color:var(--muted);font-size:.8rem;font-weight:600;border:0;border-bottom:2px solid var(--line);padding:10px 12px}
.act-skin .ac-tbl td{border:0;border-bottom:1px solid var(--line);padding:10px 12px}
.act-skin .ac-tbl tr:hover td{background:var(--surface-alt)}
/* النماذج والنوافذ */
.act-skin .ac-in,.act-skin .ac-sel,.act-skin .ac-ta{border:1.5px solid var(--line);border-radius:6px;background:var(--surface-alt);padding:10px 14px;font-size:.85rem}
.act-skin .ac-in:focus,.act-skin .ac-sel:focus,.act-skin .ac-ta:focus{outline:0;border-color:var(--brand)}
.act-skin .ac-f>label{font-weight:600;color:var(--muted)}
.act-skin .ac-ov{background:rgba(0,0,0,.55);padding:24px 12px}
.act-skin .ac-md{border-radius:var(--r);box-shadow:0 20px 60px rgba(0,0,0,.3)}
.act-skin .ac-md>h3{background:var(--surface);color:var(--ink);font-family:Tajawal,sans-serif;font-size:1rem;font-weight:700;padding:16px 20px;border-bottom:1px solid var(--line)}
.act-skin .ac-md .bd{padding:20px}.act-skin .ac-md .ft{background:var(--surface);padding:12px 20px}
.act-skin .ac-bar{height:10px;border-radius:8px;background:var(--surface-alt)}.act-skin .ac-bar>i{border-radius:8px}
.act-skin details.ac-acc{border-radius:var(--r);border-color:var(--line)}
.act-skin .ac-steps b{background:var(--surface-alt)}
/* بطاقة مطويّة بلون حالتها: العنوان + الحالة الأخيرة + أزرار صغيرة، والتفاصيل تُفتح بالضغط على العنوان */
.ac-fold{background:#fff;border:1px solid #e2dfd8;border-inline-start:5px solid var(--fc,#9aa3ab);border-radius:12px;padding:10px 14px 12px;margin-bottom:10px}
.ac-fold>details>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:700;font-size:1rem;padding:2px 0}
.ac-fold>details>summary::-webkit-details-marker{display:none}
.ac-fold .ac-car{font-size:.8rem;color:#6b7280;transition:transform .15s;flex:none}
.ac-fold>details[open] .ac-car{transform:rotate(180deg)}
.ac-fold .ac-fin{padding:6px 0 4px;line-height:1.9;font-size:.9rem}
.ac-fold .ac-fst{display:inline-block;margin-top:4px;padding:3px 11px;border-radius:14px;font-size:.82rem;font-weight:600;background:var(--fb,#eef0f2);color:var(--fc,#5b6670)}
.ac-fold .ac-fact{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.ac-fold .ac-fact .ac-btn{padding:4px 11px;font-size:.78rem;border-radius:6px}
.ac-fold.t-ok{--fc:#1e8449;--fb:#e8f8ef}.ac-fold.t-warn{--fc:#b45309;--fb:#fef3e0}.ac-fold.t-bad{--fc:#c0392b;--fb:#fdecea}.ac-fold.t-info{--fc:#1d5fa8;--fb:#e8f1fb}.ac-fold.t-mute{--fc:#5b6670;--fb:#eef0f2}
/* أزرار التقارير: صفوف كاملة العرض كالنموذج */
.act-skin .ac-rep{display:block}
.act-skin .ac-rep .ac-btn{display:flex;align-items:center;gap:10px;width:100%;padding:14px 16px;margin-bottom:6px;background:var(--surface);color:var(--ink);border:1px solid var(--line);font-weight:500;text-align:right}
.act-skin .ac-rep .ac-sel{display:block;width:100%;margin-bottom:10px}
/* المعاينة فوق الصفحة (لا تخرجك من المنصة) */
.ac-pv{position:fixed;inset:0;z-index:1000;background:#fff;display:flex;flex-direction:column}
.ac-pvbar{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e2dfd8;background:#f8f7f4;font-family:Tajawal,system-ui,sans-serif}
.ac-pvbar b{font-size:.95rem;flex:1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ac-pvf{flex:1;width:100%;border:0;background:#fff}
`;
  function injectCss(){ try{ document.body.classList.add('act-skin'); }catch(e){} if(!document.getElementById('acFont')){ const l=document.createElement('link'); l.id='acFont'; l.rel='stylesheet'; l.href='https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap'; document.head.appendChild(l); } if(document.getElementById('acCss')) return; const s=document.createElement('style'); s.id='acCss'; s.textContent=CSS; document.head.appendChild(s); }


  /* ---------- معاينة داخل الصفحة (بدل نافذة جديدة تُخرج المستخدم من المنصة) ---------- */
  function openPreview(title){
    injectCss();
    const ov = document.createElement('div'); ov.className='ac-pv';
    ov.innerHTML = '<div class="ac-pvbar"><button class="ac-btn sec sm" data-x>← رجوع</button><b>'+esc(title||'معاينة')+'</b><button class="ac-btn sm" data-p>🖨️ طباعة</button></div><iframe class="ac-pvf" title="معاينة"></iframe>';
    document.body.appendChild(ov);
    const prevOv = document.body.style.overflow; document.body.style.overflow='hidden';
    const fr = ov.querySelector('iframe'); let closed = false, pushed = false;
    const cleanup = ()=>{ if(closed) return; closed = true; window.removeEventListener('popstate', onPop); ov.remove(); document.body.style.overflow = prevOv; };
    const onPop = ()=>cleanup();
    try{ history.pushState({ acPv:1 }, ''); pushed = true; }catch(e){}
    if(pushed) window.addEventListener('popstate', onPop);
    const close = ()=>{ if(closed) return; if(pushed && history.state && history.state.acPv) history.back(); else cleanup(); };
    ov.querySelector('[data-x]').onclick = close;
    ov.querySelector('[data-p]').onclick = ()=>{ try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){ toast('تعذّرت الطباعة من هذه المعاينة'); } };
    fr.srcdoc = '<!doctype html><meta charset="utf-8"><p style="font-family:Tahoma;padding:20px">جارٍ تجهيز النموذج...</p>';
    return { setHtml:h=>{ if(!closed) fr.srcdoc = h; }, close, isClosed:()=>closed };
  }
  /* توسيط التبويب النشط في شريطه دون تحريك الصفحة */
  function centerTab(bar, smooth){
    const a = bar && bar.querySelector('.ac-tab.on'); if(!a) return;
    const br = bar.getBoundingClientRect(), ar = a.getBoundingClientRect();
    const d = (ar.left+ar.width/2) - (br.left+br.width/2); if(Math.abs(d) < 2) return;
    try{ bar.scrollTo({ left:bar.scrollLeft+d, behavior:smooth?'smooth':'auto' }); }catch(e){ bar.scrollLeft += d; }
  }
  /* حفظ آخر موضع بالتبويبات (تفضيل عرض خاص بهذا المتصفح) */
  const stKey = (env,page)=>'act.ui.'+env.sid+'.'+env.period+'.'+page;
  function loadState(env,page){ try{ return JSON.parse(localStorage.getItem(stKey(env,page))||'null')||{}; }catch(e){ return {}; } }
  function saveState(env,page,o){ try{ localStorage.setItem(stKey(env,page), JSON.stringify(o)); }catch(e){} }

  /* ---------- نافذة منبثقة ---------- */
  function modal(o){
    injectCss();
    const ov = document.createElement('div'); ov.className='ac-ov';
    ov.innerHTML = '<div class="ac-md'+(o.wide?' wide':'')+'"><h3>'+esc(o.title||'')+'</h3><div class="bd">'+(o.body||'')+'</div><div class="ft"></div></div>';
    const ft = $('.ft', ov);
    const api = { el:ov, close:()=>{ ov.remove(); }, q:s=>$(s,ov), qa:s=>$$(s,ov) };
    (o.buttons||[{label:'إغلاق'}]).forEach(b=>{
      const bt = document.createElement('button'); bt.type='button'; bt.className='ac-btn '+(b.cls||''); bt.textContent=b.label;
      bt.onclick = async ()=>{
        if(!b.onClick){ api.close(); return; }
        bt.disabled = true;
        try{ const r = await b.onClick(api); if(r!==false) api.close(); }
        catch(e){ console.error(e); toast(e&&e.message?e.message:'تعذّر الحفظ'); }
        bt.disabled = false;
      };
      ft.appendChild(bt);
    });
    ov.addEventListener('mousedown', e=>{ if(e.target===ov && o.dismiss!==false && !o.noDismiss) api.close(); });
    document.body.appendChild(ov);
    if(o.onOpen) o.onOpen(api);
    return api;
  }
  function toast(msg){
    let t = document.getElementById('acToast');
    if(!t){ t=document.createElement('div'); t.id='acToast'; t.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#15242b;color:#fff;padding:10px 18px;border-radius:12px;z-index:3000;font:700 13.5px Tajawal,system-ui;max-width:90vw;text-align:center'; document.body.appendChild(t); }
    t.textContent=msg; t.style.display='block'; clearTimeout(t._h); t._h=setTimeout(()=>{ t.style.display='none'; },3200);
  }
  const confirmBox = msg=> (g.mnConfirm ? g.mnConfirm(msg) : Promise.resolve(g.confirm(msg)));

  /* ---------- اختيار متعدد بحث + علامات ---------- */
  /* items: [{id,name,sub}] — selected: Set/array — يعيد {get():[ids], el:html} عبر ACT.pickHtml + ACT.pickInit */
  function pickHtml(pid, items, selected, o){
    o = o||{}; const sel = new Set(selected||[]);
    return '<div class="ac-pick" id="'+pid+'" data-pick="1"><input class="ac-in" placeholder="'+esc(o.ph||'بحث بالاسم...')+'" data-pick-q>'
      +'<div class="cnt" data-pick-cnt></div><div class="list">'
      + (function(){ let last = null, out = '';
          items.forEach(it=>{
            if(it.grp!=null && it.grp!==last){ last = it.grp; out += '<div class="gh" data-gh="'+esc(it.grp)+'">'+esc(it.grp)+'</div>'; }
            out += '<label data-n="'+esc((it.name||'')+' '+(it.sub||''))+'"'+(it.grp!=null?' data-g="'+esc(it.grp)+'"':'')+'><input type="checkbox" value="'+esc(it.id)+'"'+(sel.has(it.id)?' checked':'')+(o.single?' data-single':'')+'><span>'+esc(it.name)+(it.sub?' <span class="cnt">'+esc(it.sub)+'</span>':'')+'</span></label>';
          });
          return out; })()
      + (items.length?'':'<div class="cnt">لا توجد خيارات.</div>')+'</div></div>';
  }
  function pickInit(root, pid){
    const box = $('#'+pid, root); if(!box) return;
    const cnt = ()=>{ $('[data-pick-cnt]',box).textContent = 'المحدد: '+arN($$('input[type=checkbox]:checked',box).length); };
    $('[data-pick-q]',box).addEventListener('input', e=>{
      const q = e.target.value.trim();
      $$('label',box).forEach(l=>{ l.style.display = (!q || l.dataset.n.includes(q)) ? '' : 'none'; });
      /* عناوين الفصول: يبقى عنوان الفصل ظاهرًا ما دام فيه اسم مطابق، ويختفي إن لم يتبقَّ فيه أحد */
      $$('.gh',box).forEach(h=>{ const gname = h.dataset.gh; h.style.display = $$('label',box).some(l=>l.dataset.g===gname && l.style.display!=='none') ? '' : 'none'; });
    });
    box.addEventListener('change', e=>{
      if(e.target.hasAttribute('data-single') && e.target.checked) $$('input[type=checkbox]',box).forEach(c=>{ if(c!==e.target) c.checked=false; });
      cnt();
    });
    cnt();
  }
  const pickGet = (root,pid)=>$$('#'+pid+' input[type=checkbox]:checked', root).map(c=>c.value);

  /* ---------- البيانات ---------- */
  const keyOf = (sid,period)=>sid+'_'+period;
  async function list(env, col, extra){
    let q = env.db.collection(col).where('schoolId','==',env.sid).where('period','==',env.period);
    (extra||[]).forEach(f=>{ q = q.where(f[0],f[1],f[2]); });
    const s = await q.get();
    return s.docs.map(d=>Object.assign({ id:d.id }, d.data()));
  }
  async function getDoc(env, col, id){
    /* استعلام بدل get مفرد: قراءة مستند غير موجود تُرفض بالقواعد (resource فارغ)، أما الاستعلام فيرجع فارغًا بسلام */
    const s = await env.db.collection(col).where('schoolId','==',env.sid).where('period','==',env.period).get();
    const d = s.docs.find(x=>x.id===id);
    return d ? Object.assign({ id:d.id }, d.data()) : null;
  }
  /* إنشاء (id فارغ → معرّف تلقائي) */
  async function create(env, col, data, id){
    const now = Date.now();
    const full = Object.assign({}, data, { schoolId:env.sid, period:env.period, createdAt:now, updatedAt:now, createdBy:env.me.id });
    const ref = id ? env.db.collection(col).doc(id) : env.db.collection(col).doc();
    await ref.set(full);
    return ref.id;
  }
  async function patch(env, col, id, data){
    await env.db.collection(col).doc(id).update(Object.assign({}, data, { updatedAt:Date.now() }));
  }
  /* عدّ سريع: يحمّل ثم يصفّي */
  const by = (arr, f)=>arr.reduce((m,x)=>{ const k=f(x); (m[k]=m[k]||[]).push(x); return m; },{});

  /* موظفو المدرسة: [{id,name,role,perms}] */
  const ROLE_NAMES = { schoolAdmin:'مدير', agent:'وكيل', counselor:'موجه طلابي', assistant:'كادر إداري', teacherAssistant:'مساعد معلم', teacher:'معلم' };
  async function loadStaff(env){
    const out = [];
    try{
      const snap = await g.UsersAPI.listSnap(env.sid);
      snap.forEach(d=>{
        const u = d.data(); const c = (u.schools||{})[env.sid];
        const isAdm = u.role==='schoolAdmin' && (u.adminSchools||[]).includes(env.sid);
        if(!isAdm && (!c || c.active===false)) return;
        out.push({ id:d.id, name:u.username||'', role:isAdm?'schoolAdmin':(c.role||''), perms:(c&&c.permissions)||{} });
      });
    }catch(e){ console.warn('staff', e); }
    out.sort((a,b)=>a.name.localeCompare(b.name,'ar'));
    return out;
  }
  /* روستر المدرسة: {classes:[{code,name}], students:[{seat,name,classCode}]} */
  async function loadRoster(env){
    try{
      const s = await env.db.collection('schoolData').doc('roster_'+env.sid).get();
      const d = s.exists ? JSON.parse(s.data().value||'{}') : {};
      return { classes:(d.classes||[]).map(c=>Object.assign({},c,{code:String(c.code)})), students:(d.students||[]).map(x=>Object.assign({},x,{seat:String(x.seat),classCode:String(x.classCode)})) };
    }catch(e){ return { classes:[], students:[] }; }
  }
  const classLabel = (roster,code)=>{ const c=roster.classes.find(x=>x.code===String(code)); return c ? (c.name||c.code) : String(code); };
  /* طلاب المدرسة مرتَّبون بالفصول (بترتيب الفصول في السجل) ثم بالاسم، مع عنوان فصل لكل مجموعة */
  function studentItems(roster, o){
    o = o||{}; const skip = o.skip||null, tag = o.tag||{}, order = {}; roster.classes.forEach((c,i)=>{ order[c.code]=i; });
    return roster.students.filter(s=>!(skip && skip.has(s.seat)))
      .slice().sort((a,b)=>((order[a.classCode]==null?9999:order[a.classCode])-(order[b.classCode]==null?9999:order[b.classCode])) || (a.name||'').localeCompare(b.name||'','ar'))
      .map(s=>({ id:s.seat, name:s.name, grp:classLabel(roster,s.classCode), sub:tag[s.seat]||'' }));
  }

  /* ---------- الصور: ضغط في المتصفح ثم رفع ---------- */
  const MAX_BYTES = 900*1024;
  function compress(file, maxDim, q){
    return new Promise((res,rej)=>{
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = ()=>{
        let w=img.width, h=img.height; const s=Math.min(1, (maxDim||1280)/Math.max(w,h)); w=Math.max(1,Math.round(w*s)); h=Math.max(1,Math.round(h*s));
        const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h);
        c.toBlob(b=>{ URL.revokeObjectURL(url); b?res(b):rej(new Error('تعذّر ضغط الصورة')); },'image/jpeg',q||0.7);
      };
      img.onerror = ()=>{ URL.revokeObjectURL(url); rej(new Error('ملف الصورة غير صالح')); };
      img.src = url;
    });
  }
  async function compressFit(file){
    let q=0.72, dim=1280, b=await compress(file,dim,q);
    for(let i=0;i<4 && b.size>MAX_BYTES;i++){ q-=0.12; dim=Math.round(dim*0.82); b=await compress(file,dim,Math.max(0.35,q)); }
    if(b.size>MAX_BYTES) throw new Error('الصورة كبيرة جدًا حتى بعد الضغط، اختر صورة أخرى.');
    return b;
  }
  async function uploadPhoto(env, eventId, file){
    if(!g.firebase || !firebase.storage) throw new Error('خدمة رفع الصور غير متاحة.');
    const blob = await compressFit(file);
    const path = 'activities/'+env.sid+'/'+env.period+'/'+eventId+'/'+Date.now()+'_'+Math.random().toString(36).slice(2,7)+'.jpg';
    const ref = firebase.storage().ref(path);
    await ref.put(blob, { contentType:'image/jpeg' });
    const url = await ref.getDownloadURL();
    return { path, url };
  }

  /* ---------- نموذج توثيق التنفيذ (الإدخال) ---------- */
  /* يفتح نافذة توثيق: opts = {env, prefill:{title,domain,clubName}, source:{type,assignmentId,programIdx,openEventId,clubId}, existing, staff, roster, onSaved} */
  async function openDocForm(opts){
    const env = opts.env, ex = opts.existing || null;
    const staff = opts.staff || await loadStaff(env), roster = opts.roster || await loadRoster(env);
    const TD = today();
    const pre = Object.assign({ title:'', domain:'', date:today(), location:'', duration:'', objectives:'', executionSteps:'', evidenceUrl:'', beneficiaries:{type:'طلاب',count:''}, participants:[], executors:[{uid:env.me.id,name:env.me.name,type:'staff'}], photos:[] }, opts.prefill||{}, ex||{});
    /* لا يُوثَّق تنفيذ في يوم لم يأتِ بعد: سقف التاريخ اليوم (أو آخر موعد/انتهاء التكليف إن كان أبكر)، وحدّه الأدنى يوم النشر/الإنشاء */
    const dMax = (opts.dateMax && opts.dateMax < TD) ? opts.dateMax : TD, dMin = opts.dateMin || '';
    if(!ex){ if(pre.date > dMax) pre.date = dMax; if(dMin && pre.date < dMin) pre.date = dMin; }
    let photos = (pre.photos||[]).slice();       // [{path,url}] محفوظة سابقًا
    const newFiles = [];                          // ملفات جديدة بالانتظار
    const pStu = (pre.participants||[]).filter(p=>p.type==='student').map(p=>p.uid);
    const pStf = (pre.participants||[]).filter(p=>p.type==='staff').map(p=>p.uid);
    const exSel = (pre.executors||[]).map(p=>p.uid);
    /* نادٍ: أعضاء النادي من الطلاب محدَّدون مسبقًا في أول توثيق، ويمكن إضافة طلاب آخرين من المدرسة */
    const memSeats = new Set(opts.clubMemberSeats||[]);
    const tagMap = {}; memSeats.forEach(s=>{ tagMap[s]='⭐ عضو'; });
    const stuItems = studentItems(roster, { tag:tagMap });
    const stuSel = ex ? pStu : Array.from(new Set(pStu.concat(Array.from(memSeats))));
    const stfItems = staff.map(s=>({ id:s.id, name:s.name, sub:ROLE_NAMES[s.role]||'' }));
    const OPEN = !!opts.openMode, CLUB = !!opts.clubMode;
    const LKT = opts.lockTitleDomain || opts.lockTitle, LKD = opts.lockTitleDomain || opts.lockDomain;
    const LK = LKT ? ' readonly style="background:#f1f5f7"' : '';
    const extX = pre.extExecutor || {};
    const body = `${opts.infoHtml?'<div class="ac-f" style="background:#eef6f8;border:1px solid #cfe2e8;border-radius:10px;padding:9px 12px;font-size:13px;line-height:1.8">'+opts.infoHtml+'</div>':''}
      <div class="ac-f"><label>اسم البرنامج / المبادرة *</label><input class="ac-in" id="d_title" value="${esc(pre.title)}"${LK}></div>
      <div class="ac-2c">
        <div class="ac-f"><label>المجال *</label><select class="ac-sel" id="d_domain"${LKD?' disabled':''}><option value="">— اختر —</option>${DOMAINS.map(d=>'<option'+(pre.domain===d?' selected':'')+'>'+d+'</option>').join('')}</select></div>
        <div class="ac-f"><label>تاريخ التنفيذ *</label><input type="date" class="ac-in" id="d_date" value="${esc(pre.date)}"${dMin?' min="'+esc(dMin)+'"':''} max="${esc(dMax)}"><div class="dh-sub">${opts.dateHint||'لا يمكن توثيق تنفيذ في يوم لم يأتِ بعد.'}</div></div>
        <div class="ac-f"><label>مكان التنفيذ *</label><input class="ac-in" id="d_loc" value="${esc(pre.location)}"></div>
        <div class="ac-f"><label>مدة التنفيذ *</label><input class="ac-in" id="d_dur" placeholder="مثال: يوم واحد" value="${esc(pre.duration)}"></div>
      </div>
      ${OPEN?`<div class="ac-f"><label>المنفِّذون من موظفي المدرسة (للاطلاع فقط)</label><div class="ac-in" style="height:auto;max-height:190px;overflow:auto;background:#f6f8f9;padding:4px 10px">${(opts.execStatus||[]).length?(opts.execStatus||[]).map(x=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #e6ecee"><span>'+esc(x.name)+'</span><span style="font-weight:700;color:'+(x.on?'#0a7a3d':'#8a949a')+'">'+(x.on?'☑ مفعّل':'☐ لم يوثّق')+'</span></div>').join(''):'<div style="padding:8px;color:#777">لا يوجد موظفون آخرون.</div>'}</div></div>`
      :`<div class="ac-f"><label>المنفِّذون (من موظفي المدرسة) *</label>${pickHtml('d_exec', stfItems, exSel)}</div>`}
      ${CLUB?`<div class="ac-f"><label>منفِّذ من خارج المدرسة (اختياري)</label><div class="ac-2c"><input class="ac-in" id="d_xn" placeholder="اسم المنفِّذ" value="${esc(extX.name||'')}"><input class="ac-in" id="d_xe" placeholder="الجهة" value="${esc(extX.entity||'')}"></div><div class="dh-sub">يُطبع بعد أسماء المنفِّذين.</div></div>`:''}
      <div class="ac-2c">
        <div class="ac-f"><label>نوع المستفيدين</label><select class="ac-sel" id="d_btype">${['طلاب','معلمون','أولياء أمور','مجتمع'].map(t=>'<option'+((pre.beneficiaries||{}).type===t?' selected':'')+'>'+t+'</option>').join('')}</select></div>
        <div class="ac-f"><label>عدد المستفيدين *</label><input type="number" min="0" class="ac-in" id="d_bcount" value="${esc((pre.beneficiaries||{}).count)}"></div>
      </div>
      <div class="ac-f"><label>${CLUB?'الطلاب المشاركون':'الطلاب المشاركون (اختياري)'}</label>${CLUB?'<div class="dh-sub" style="margin-bottom:4px">أعضاء النادي محدَّدون تلقائيًا (يمكنك إلغاء من لم يشارك)، ويمكنك إضافة طلاب آخرين من المدرسة. الطلاب مرتَّبون بالفصول ويمكن البحث بالاسم.</div>':''}${pickHtml('d_stu', stuItems, stuSel)}</div>
      <div class="ac-f"><label>المعلمون المشاركون (اختياري)</label>${OPEN?'<div class="dh-sub" style="margin-bottom:4px">يصل كل معلم تختاره إشعار داخل صفحته ليؤكد مشاركته، ولا يُحسب موثّقًا إلا بعد تأكيده.</div>':''}${pickHtml('d_stf', stfItems.filter(x=>!OPEN||x.id!==env.me.id), pStf)}</div>
      <div class="ac-f"><label>الأهداف *</label><textarea class="ac-ta" id="d_obj">${esc(pre.objectives)}</textarea></div>
      <div class="ac-f"><label>خطوات التنفيذ / الوصف *</label><textarea class="ac-ta" id="d_steps">${esc(pre.executionSteps)}</textarea></div>
      <div class="ac-f"><label>صور الشواهد * (الأولى إلزامية، وحد أقصى صورتان — تُضغط تلقائيًا)</label>
        <div class="dh-sub" style="color:#b45309;font-weight:700;margin:0 0 4px">⚠ اختر الصور التي تثبت وجود الموثَّقين (المنفِّذين والمشاركين).</div>
        <div class="ac-row" style="align-items:center;gap:10px;position:relative"><label class="ac-btn sec sm ac-phb" id="d_fbtn" for="d_file">📷 إضافة صورة</label><span class="dh-sub" id="d_phc"></span><input type="file" accept="image/*" id="d_file" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;clip:rect(0 0 0 0);inset-inline-start:0;top:0"></div><div class="ac-ph" id="d_ph"></div></div>
      <div class="ac-f"><label>رابط الشواهد (اختياري — يُولَّد منه رمز QR في النسخة المطبوعة)</label><input class="ac-in" id="d_url" placeholder="https://" value="${esc(pre.evidenceUrl)}"></div>`;
    const m = modal({ title: ex?'تعديل توثيق التنفيذ':'توثيق التنفيذ', body, wide:true, noDismiss:true,
      buttons:[
        { label: ex?'حفظ التعديل':(opts.autoApprove?'حفظ التوثيق':'إرسال التوثيق للاعتماد'), onClick: async api=>{
          const v = id=>api.q('#'+id).value.trim();
          const miss = [];
          if(!v('d_title')) miss.push('اسم البرنامج'); if(!v('d_domain')) miss.push('المجال'); if(!v('d_date')) miss.push('التاريخ');
          if(!v('d_loc')) miss.push('مكان التنفيذ'); if(!v('d_dur')) miss.push('مدة التنفيذ'); if(!v('d_bcount')) miss.push('عدد المستفيدين');
          if(!v('d_obj')) miss.push('الأهداف'); if(!v('d_steps')) miss.push('خطوات التنفيذ');
          const execIds = OPEN ? [env.me.id] : pickGet(api.el,'d_exec'); if(!execIds.length) miss.push('المنفِّذون');
          if(photos.length+newFiles.length<1) miss.push('صورة الشاهد الأول');
          if(miss.length){ toast('أكمل الحقول: '+miss.join('، ')); return false; }
          { const dv = v('d_date'), td = today();
            if(dv > td){ toast('لا يمكن توثيق تنفيذ في يوم لم يأتِ بعد.'); return false; }
            if(dMin && dv < dMin){ toast((opts.minMsg||'لا يمكن أن يسبق تاريخ التنفيذ تاريخ الإنشاء')+' ('+hijri(dMin)+').'); return false; }
            if(opts.dateMax && dv > opts.dateMax){ toast((opts.maxMsg||'لا يمكن أن يتجاوز تاريخ التنفيذ آخر موعد')+' ('+hijri(opts.dateMax)+').'); return false; } }
          const url = v('d_url'); if(url && !/^https?:\/\//i.test(url)){ toast('رابط الشواهد يجب أن يبدأ بـ http:// أو https://'); return false; }
          const nameOf = id=>id===env.me.id ? env.me.name : ((staff.find(s=>s.id===id)||{}).name||'');
          const stuName = seat=>(roster.students.find(s=>s.seat===seat)||{}).name||'';
          const execs = execIds.map(id=>({ uid:id, name:nameOf(id), type:'staff' }));
          const parts = pickGet(api.el,'d_stu').map(s=>({ uid:s, name:stuName(s), type:'student' }))
            .concat(pickGet(api.el,'d_stf').filter(s=>!execIds.includes(s)).map(s=>({ uid:s, name:nameOf(s), type:'staff' })));
          const base = ex ? ex.id : (opts.eventId || env.db.collection('activityEvents').doc().id);
          if(opts.beforeSave){ const bad = await opts.beforeSave(); if(bad){ toast(bad); return false; } }
          const up = [];
          for(const f of newFiles){ up.push(await uploadPhoto(env, base, f)); }
          const data = {
            title:v('d_title'), domain:v('d_domain'), date:v('d_date'), location:v('d_loc'), duration:v('d_dur'),
            beneficiaries:{ type:api.q('#d_btype').value, count:Number(v('d_bcount'))||0 },
            participants:parts, executors:execs, participantCount:(Number(v('d_bcount'))||0),
            objectives:v('d_obj'), executionSteps:v('d_steps'), evidenceUrl:url, photos:photos.concat(up),
            executedBy:env.me.id, executedByName:env.me.name, description:v('d_steps')
          };
          if(OPEN) data.partUids = parts.filter(p=>p.type==='staff').map(p=>p.uid);
          if(CLUB){ const xn = (api.q('#d_xn').value||'').trim(), xe = (api.q('#d_xe').value||'').trim(); data.extExecutor = xn ? { name:xn, entity:xe } : null; }
          if(opts.autoApprove && !ex) Object.assign(data, await approvalStamp(env, opts.council));
          if(ex){ await patch(env,'activityEvents',ex.id, Object.assign(data,{ approvalStatus: (opts.autoApprove?ex.approvalStatus:'pending'), returnNote:'' })); }
          else {
            const s = opts.source||{};
            await create(env,'activityEvents', Object.assign(data,{
              clubId:s.clubId||null, planItemId:s.planItemId||null, track:s.track||'specialized', sourceType:s.type||'open',
              generalEventId:s.generalEventId||null,
              assignmentId:s.assignmentId||null, programIdx:(s.programIdx==null?null:s.programIdx), openEventId:s.openEventId||null,
              documentedBy:env.me.id, documentedByName:env.me.name, status:'done', viaTeacher:!!s.viaTeacher,
              approvalStatus: opts.autoApprove?'approved':'pending',
              approvedBy: opts.autoApprove?env.me.id:null, approvedByName: opts.autoApprove?env.me.name:null, approvedAt: opts.autoApprove?Date.now():null
            }), base);
            if(opts.onCreated) await opts.onCreated(base);
          }
          if(opts.afterSave) await opts.afterSave(base, data);
          toast(opts.autoApprove?'تم تسجيل الفعالية واعتمادها':'تم حفظ التوثيق وإرساله لرائد النشاط'); if(opts.onSaved) await opts.onSaved(); return true;
        } },
        { label:'إلغاء', cls:'sec' }
      ],
      onOpen: api=>{
        ['d_exec','d_stu','d_stf'].forEach(id=>pickInit(api.el,id));
        /* المنفِّذ لا يكون مشاركًا والعكس: من اختير في قائمة يُعطَّل في الأخرى (المنفِّذ هو الأسبق) */
        const xtag = (c,t)=>{ const l = c.closest('label'); if(!l) return; let x = l.querySelector('.ac-xt'); if(t){ if(!x){ x=document.createElement('span'); x.className='ac-xt'; l.appendChild(x); } x.textContent=t; } else if(x) x.remove(); l.classList.toggle('ac-lk', !!t); };
        const recount = id=>{ const b = api.q('#'+id); if(b) b.querySelector('[data-pick-cnt]').textContent = 'المحدد: '+arN(pickGet(api.el,id).length); };
        const syncXP = ()=>{
          const bx = api.q('#d_exec'), bs = api.q('#d_stf'); if(!bx || !bs) return;
          const exOn = new Set(pickGet(api.el,'d_exec'));
          bs.querySelectorAll('input[type=checkbox]').forEach(c=>{ const lk = exOn.has(c.value); if(lk) c.checked=false; c.disabled=lk; xtag(c, lk?'منفِّذ':''); });
          const stOn = new Set(pickGet(api.el,'d_stf'));
          bx.querySelectorAll('input[type=checkbox]').forEach(c=>{ const lk = !c.checked && stOn.has(c.value); c.disabled=lk; xtag(c, lk?'مشارك':''); });
          recount('d_exec'); recount('d_stf');
        };
        api.el.addEventListener('change', e=>{ if(e.target.closest('#d_exec') || e.target.closest('#d_stf')) syncXP(); });
        syncXP();
        const draw = ()=>{
          const n = photos.length+newFiles.length, full = n>=2;
          api.q('#d_phc').textContent = arN(n)+'/'+arN(2)+(full?' — اكتمل العدد':'');
          api.q('#d_fbtn').classList.toggle('off', full); api.q('#d_file').disabled = full;
          const host = api.q('#d_ph'); host.innerHTML='';
          photos.forEach((p,i)=>{ const d=document.createElement('div'); d.className='p'; d.innerHTML='<img src="'+esc(p.url)+'"><button type="button" title="حذف">×</button>'; d.querySelector('button').onclick=()=>{ photos.splice(i,1); draw(); }; host.appendChild(d); });
          newFiles.forEach((f,i)=>{ const d=document.createElement('div'); d.className='p'; const u=URL.createObjectURL(f); d.innerHTML='<img src="'+u+'"><button type="button" title="حذف">×</button>'; d.querySelector('button').onclick=()=>{ newFiles.splice(i,1); draw(); }; host.appendChild(d); });
        };
        api.q('#d_file').addEventListener('change', e=>{
          Array.from(e.target.files||[]).forEach(f=>{ if(photos.length+newFiles.length<2) newFiles.push(f); else toast('الحد الأقصى صورتان لكل توثيق.'); });
          e.target.value=''; draw();
        });
        draw();
      }
    });
    return m;
  }

  /* أ/ قبل أسماء المعلمين (لا تتكرر إن وُجدت) */
  const ustaz = n => { n = String(n||'').trim(); return !n ? '' : (/^أ\s*[\/.]/.test(n) ? n : 'أ/'+n); };
  /* بطاقة مطويّة افتراضيًا: عنوان + حالة ملوّنة + أزرار صغيرة ظاهرة؛ التفاصيل (body) داخل الطيّ.
     tone: ok | warn | bad | info | mute */
  function foldCard(o){
    return '<div class="ac-fold t-'+(o.tone||'mute')+'"><details><summary><span>'+esc(o.title)+'</span><span class="ac-car">▾</span></summary><div class="ac-fin">'+(o.body||'')+'</div></details>'
      +'<span class="ac-fst">'+(o.status||'')+'</span>'+(o.actions?'<div class="ac-fact">'+o.actions+'</div>':'')+'</div>';
  }

  /* علامة «وثّق»: صاحب التوثيق، أو مشارك أكّد مشاركته. المدعو غير المؤكِّد لا يُحسب */
  const markDone = m => (m.role||'owner')!=='participant' || m.confirm==='confirmed';
  const markPartPending = m => (m.role||'owner')==='participant' && m.confirm==='invited';

  /* ---------- نموذج التوثيق المطبوع ---------- */
  function qrImg(url){
    try{ if(!url || typeof g.qrcode!=='function') return ''; const q=g.qrcode(0,'M'); q.addData(url); q.make(); return q.createDataURL(4,2); }catch(e){ return ''; }
  }
  function docFormBody(ev, o){
    o = o||{};
    const names0 = a=>(a||[]).map(x=>ustaz(x.name)).filter(Boolean);
    const xe = ev.extExecutor && ev.extExecutor.name ? (ev.extExecutor.name+(ev.extExecutor.entity?' ('+ev.extExecutor.entity+')':'')) : '';
    const names = a=>names0(a).concat(xe?[xe]:[]).join('، ');
    const stuN = (ev.participants||[]).filter(p=>p.type==='student').length;
    /* النموذج واحد عند كل من يفتحه: لا يتغير بحسب المشاهد. من اعتذر أو رُفعت مشاركته لا يظهر */
    const conf = o.conf || null, gone = o.gone || null;
    const stfList = (ev.participants||[]).filter(p=>p.type==='staff' && !(gone && gone.has(p.uid)));
    const stfNames = stfList.map(x=>ustaz(x.name)+((conf && x.uid!==ev.documentedBy && !conf.has(x.uid))?' (لم يؤكد بعد)':'')).filter(s=>s.trim()).join('، ');
    const parts = [stuN?('طلاب (عددهم '+arN(stuN)+')'):'', stfNames].filter(Boolean).join(' — ') || '—';
    const ph = (ev.photos||[]).slice(0,2);
    const qr = qrImg(ev.evidenceUrl);
    const sg = o.sig || {};
    const row = (k,v)=>'<tr><th style="width:30%">'+esc(k)+'</th><td>'+esc(v||'—')+'</td></tr>';
    return `<style>
.df{width:100%;border-collapse:collapse;font-size:14px;margin-top:6px}.df th,.df td{border:1.5px solid #17475e;padding:7px 10px;text-align:right}.df th{background:#eaf2f4}
.df .big{height:90px;vertical-align:top;white-space:pre-wrap}.dfp{display:flex;gap:14px;justify-content:center;padding:10px}.dfp .ph{width:46%;height:200px;border:1.5px dashed #17475e;display:flex;align-items:center;justify-content:center;color:#777;font-size:13px;overflow:hidden}
.dfp .ph img{width:100%;height:100%;object-fit:contain}.dfq{display:flex;gap:14px;align-items:center;padding:6px 10px;font-size:13px;word-break:break-all}.dfq img{width:90px;height:90px}
</style><table class="df">
${row('اسم البرنامج / المبادرة', ev.title)}
${row('المنفِّذ / المنفِّذون', names(ev.executors && ev.executors.length ? ev.executors : [{name:ev.documentedByName}]))}
${row('المشاركون', parts)}
${row('مكان التنفيذ', ev.location)}
${row('مدة التنفيذ', ev.duration)}
${row('تاريخ التنفيذ', hijri(ev.date,true)+(ev.date?' — الموافق '+arN(ev.date):''))}
${row('المجال', ev.domain)}
${row('المستفيدون / عددهم', ((ev.beneficiaries||{}).type||'')+' — '+arN((ev.beneficiaries||{}).count||0))}
<tr><th colspan="2">الأهداف</th></tr><tr><td colspan="2" class="big">${esc(ev.objectives)}</td></tr>
<tr><th colspan="2">خطوات التنفيذ / الوصف</th></tr><tr><td colspan="2" class="big">${esc(ev.executionSteps||ev.description)}</td></tr>
<tr><th colspan="2">الشواهد</th></tr>
<tr><td colspan="2"><div class="dfp">${[0,1].map(i=>'<div class="ph">'+(ph[i]?'<img src="'+esc(ph[i].url)+'">':(i===0?'صورة الشاهد الأول':'صورة الشاهد الثاني (اختياري)'))+'</div>').join('')}</div>
${(ev.evidenceUrl && qr)?'<div class="dfq"><img src="'+qr+'" alt="QR"><div>امسح الرمز للاطلاع على الشواهد</div></div>':''}</td></tr>
</table>
<div class="fh-sig" style="margin-top:28px"><span>رائد النشاط: ${esc(o.coordinator||'')}<br><br>التوقيع: ${sg.coord?'<img src="'+sg.coord+'" style="height:58px;vertical-align:middle">':'____________'}</span><span>قائد المدرسة: ${esc(o.principal||'')}<br><br>التوقيع: ${sg.principal?'<img src="'+sg.principal+'" style="height:58px;vertical-align:middle">':'____________'}</span></div>
${sg.stamp?'<div style="text-align:center;margin-top:8px"><img src="'+sg.stamp+'" style="height:110px"></div>':''}`;
  }
  async function printDoc(env, ev, o){
    const w = openPreview('نموذج توثيق تنفيذ برنامج / مبادرة');
    const ctx = await g.FormHdr.resolve({ db:env.db, session:env.session, period:env.period });
    const coord = ev.approvedByName || (o&&o.coordinator) || '';
    let conf = null, gone = null;
    if(ev.openEventId && (ev.partUids||[]).length){
      try{
        const q = await env.db.collection('actOpenMarks').where('schoolId','==',env.sid).where('period','==',env.period).get();
        const ms = q.docs.map(d=>d.data()).filter(m=>m.openEventId===ev.openEventId && (m.role||'owner')==='participant');
        conf = new Set(ms.filter(m=>m.confirm==='confirmed').map(m=>m.uid));
        gone = new Set(ms.filter(m=>m.confirm==='declined' || m.confirm==='released').map(m=>m.uid));
      }catch(e){ conf = null; gone = null; }
    }
    const sig = ev.approvalStatus==='approved' ? await sigSnapshot(env, ev) : {};
    const html = g.FormHdr.doc({ title:'نموذج توثيق تنفيذ برنامج / مبادرة', formTitle:'نموذج توثيق تنفيذ برنامج / مبادرة', ctx, noPrintBtn:true, body:docFormBody(ev,{coordinator:coord, principal:ev.principalName||ctx.principal, conf, gone, sig}) });
    w.setHtml(html);
  }
  /* طباعة جدول عام بترويسة النموذج الموحدة */
  async function printPage(env, formTitle, body, opts){
    const w = openPreview(formTitle);
    const ctx = await g.FormHdr.resolve({ db:env.db, session:env.session, period:env.period });
    const css = '.pt{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}.pt th,.pt td{border:1.5px solid #17475e;padding:6px 9px;text-align:right}.pt th{background:#eaf2f4}.pp{font-size:15px;line-height:2;margin:8px 4px}';
    const html = g.FormHdr.doc(Object.assign({ title:formTitle, formTitle, ctx, body, extraCss:css, noPrintBtn:true }, opts||{}));
    w.setHtml(html);
    return ctx;
  }


  /* ---------- الختم والتوقيعان (صور محفوظة بنسخ ثابتة لا تتغير) ----------
     activitySigns/{مؤشر}: الحالي لكل نوع (coord لكل فصل، principal و stamp للمدرسة).
     activitySignVers/{نسخة}: نسخة ثابتة لا تُعدَّل؛ تُنسخ إشارتها داخل الفعالية لحظة الاعتماد فتبقى النماذج القديمة كما هي. */
  const sigPtrId = (env,kind)=> kind==='coord' ? env.sid+'_'+env.period+'_coord' : env.sid+'_'+kind;
  async function sigPointers(env){
    const q = await env.db.collection('activitySigns').where('schoolId','==',env.sid).get();
    const out = {}; q.docs.forEach(d=>{ const x=Object.assign({id:d.id},d.data()); if(x.kind==='coord'){ if(x.period===env.period) out.coord=x; } else out[x.kind]=x; });
    return out;
  }
  async function sigSave(env, kind, mode, dataUrl){
    const now = Date.now(), vid = env.sid+'_'+kind+'_'+now;
    const base = { schoolId:env.sid, kind, uid:env.me.id, name:env.me.name||'', mode, createdAt:now };
    if(kind==='coord') base.period = env.period;
    await env.db.collection('activitySignVers').doc(vid).set(Object.assign({ data:dataUrl }, base));
    await env.db.collection('activitySigns').doc(sigPtrId(env,kind)).set(Object.assign({ verId:vid, updatedAt:now }, base));
    return vid;
  }
  async function sigClear(env, kind){ await env.db.collection('activitySigns').doc(sigPtrId(env,kind)).delete(); }
  async function sigVerData(env, vid){
    if(!vid) return '';
    try{ const d = await env.db.collection('activitySignVers').doc(vid).get(); return d.exists ? (d.data().data||'') : ''; }catch(e){ return ''; }
  }
  async function sigSnapshot(env, ev){
    const v = ev.sigVers || {}; if(!v.coord && !v.principal && !v.stamp) return {};
    const [coord, principal, stamp] = await Promise.all([sigVerData(env,v.coord), sigVerData(env,v.principal), sigVerData(env,v.stamp)]);
    return { coord, principal, stamp };
  }
  /* نسخة الاعتماد: لا يُنسخ إلا توقيع صاحبه الحالي — أمين السر الحالي، وقائد المدرسة المسجَّل رئيسًا للمجلس */
  async function sigForApproval(env, council){
    let p = {}; try{ p = await sigPointers(env); }catch(e){ return {}; }
    const out = {};
    if(p.coord && p.coord.uid===env.me.id && (!council || council.secretaryId===env.me.id)) out.coord = p.coord.verId;
    if(p.principal && p.principal.verId && (!council || !council.chairId || p.principal.uid===council.chairId)) out.principal = p.principal.verId;
    if(p.stamp && p.stamp.verId) out.stamp = p.stamp.verId;
    return out;
  }
  /* ختم الاعتماد للنموذج: نسخ التواقيع والختم الثابتة + اسم قائد المدرسة وقت الاعتماد */
  async function approvalStamp(env, council){
    let pn = ''; try{ const cx = await g.FormHdr.resolve({ db:env.db, session:env.session, period:env.period }); pn = cx.principal||''; }catch(e){}
    let sv = {}; try{ sv = await sigForApproval(env, council); }catch(e){}
    return { sigVers:sv, principalName:pn };
  }
  function loadImg(file){
    return new Promise((res,rej)=>{ const r=new FileReader(); r.onerror=rej; r.onload=()=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=r.result; }; r.readAsDataURL(file); });
  }
  /* صورة → PNG شفاف الخلفية بحجم محدود (تُزال الخلفية البيضاء/الفاتحة) */
  async function sigFromFile(file, maxW, maxH, keepBg){
    const im = await loadImg(file), k = Math.min(1, maxW/im.width, maxH/im.height);
    const c = document.createElement('canvas'); c.width = Math.max(1,Math.round(im.width*k)); c.height = Math.max(1,Math.round(im.height*k));
    const x = c.getContext('2d'); x.drawImage(im,0,0,c.width,c.height);
    if(!keepBg){
      const d = x.getImageData(0,0,c.width,c.height), a = d.data;
      for(let i=0;i<a.length;i+=4){ const m = Math.min(a[i],a[i+1],a[i+2]); if(m>225) a[i+3]=0; else if(m>180) a[i+3]=Math.round(a[i+3]*(225-m)/45); }
      x.putImageData(d,0,0);
    }
    return c.toDataURL('image/png');
  }
  const SIG_NAMES = { coord:'توقيع رائد النشاط', principal:'توقيع قائد المدرسة', stamp:'ختم المدرسة' };
  /* نافذة رفع: صورة أو رسم باليد (واحد فقط)، والختم صورة فقط */
  function sigDialog(env, kind, onDone){
    const stamp = kind==='stamp';
    const body = (stamp?'<div class="dh-sub">ارفع صورة واضحة للختم (يُفضَّل ختم على ورقة بيضاء). تُزال الخلفية تلقائيًا.</div>'
      : '<div class="ac-row" style="margin-bottom:8px"><label><input type="radio" name="sg_m" value="image" checked> رفع صورة التوقيع</label><label style="margin-inline-start:14px"><input type="radio" name="sg_m" value="draw"> رسم باليد</label></div>')
      +'<div id="sg_img"><input type="file" accept="image/*" id="sg_file" class="ac-in"></div>'
      +(stamp?'':'<div id="sg_drw" style="display:none"><canvas id="sg_cv" width="360" height="160" style="width:100%;max-width:360px;height:auto;background:#fff;border:1.5px dashed #17475e;border-radius:8px;touch-action:none"></canvas><div class="ac-row" style="margin-top:6px"><button type="button" class="ac-btn sec sm" id="sg_clr">مسح</button></div></div>')
      +'<div style="margin-top:10px"><div class="dh-sub">المعاينة:</div><div style="background:#fff;border:1px solid #cfd8dc;border-radius:8px;min-height:70px;display:flex;align-items:center;justify-content:center;padding:6px"><img id="sg_prev" alt="" style="max-height:110px;display:none"><span id="sg_none" class="dh-sub">لا شيء بعد</span></div></div>'
      +'<div class="dh-sub" style="margin-top:6px">يُحفظ خيار واحد فقط، ويحلّ الجديد محل السابق.</div>';
    let dataUrl = '', mode = 'image', drew = false;
    const setPrev = (api,u)=>{ dataUrl=u; const im=api.q('#sg_prev'), no=api.q('#sg_none'); im.src=u||''; im.style.display=u?'':'none'; no.style.display=u?'none':''; };
    modal({ title: SIG_NAMES[kind], body, noDismiss:true, onOpen: api=>{
      const file = api.q('#sg_file');
      file.addEventListener('change', async ()=>{ if(!file.files[0]) return; try{ setPrev(api, await sigFromFile(file.files[0], stamp?260:360, stamp?260:160, false)); }catch(e){ toast('تعذّر قراءة الصورة.'); } });
      if(stamp) return;
      const cv = api.q('#sg_cv'), cx = cv.getContext('2d'); cx.lineWidth=2.6; cx.lineCap='round'; cx.lineJoin='round'; cx.strokeStyle='#10243a';
      let on=false, lx=0, ly=0;
      const pt = e=>{ const r=cv.getBoundingClientRect(); return [ (e.clientX-r.left)*cv.width/r.width, (e.clientY-r.top)*cv.height/r.height ]; };
      cv.addEventListener('pointerdown', e=>{ on=true; [lx,ly]=pt(e); cv.setPointerCapture&&cv.setPointerCapture(e.pointerId); e.preventDefault(); });
      cv.addEventListener('pointermove', e=>{ if(!on) return; const [x,y]=pt(e); cx.beginPath(); cx.moveTo(lx,ly); cx.lineTo(x,y); cx.stroke(); lx=x; ly=y; drew=true; e.preventDefault(); });
      const up = ()=>{ if(on){ on=false; if(mode==='draw' && drew) setPrev(api, cv.toDataURL('image/png')); } };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      api.q('#sg_clr').addEventListener('click', ()=>{ cx.clearRect(0,0,cv.width,cv.height); drew=false; if(mode==='draw') setPrev(api,''); });
      api.el.querySelectorAll('input[name="sg_m"]').forEach(r=>r.addEventListener('change', ()=>{
        mode = r.value; if(!r.checked) return;
        api.q('#sg_img').style.display = mode==='image'?'':'none'; api.q('#sg_drw').style.display = mode==='draw'?'':'none';
        setPrev(api, mode==='draw' ? (drew?cv.toDataURL('image/png'):'') : '');
        if(mode==='image') file.value='';
      }));
    }, buttons:[{ label:'حفظ', onClick: async api=>{
      if(!dataUrl){ toast(mode==='draw'?'ارسم توقيعك أولًا.':'اختر صورة أولًا.'); return false; }
      if(dataUrl.length>190000){ toast('الصورة كبيرة، جرّب صورة أصغر.'); return false; }
      try{ await sigSave(env, kind, stamp?'image':mode, dataUrl); }catch(e){ console.warn('sigSave',e); toast('تعذّر الحفظ، تأكد من الصلاحية.'); return false; }
      toast('تم حفظ '+SIG_NAMES[kind]); if(onDone) await onDone(); return true; } },{ label:'إلغاء', cls:'sec' }] });
  }

  g.ACT = { esc, arN, $, $$, CLUBS_DEFAULT, DOMAINS, GENERAL_TEMPLATE, DAYS, PLAN_ST, ST_CLS, ROLE_NAMES,
    today, dateOfMs, planItemDate, addDays, hijri, dayName, injectCss, openPreview, centerTab, loadState, saveState, modal, toast, confirmBox, pickHtml, pickInit, pickGet,
    keyOf, list, getDoc, create, patch, by, loadStaff, loadRoster, classLabel,
    compress, compressFit, uploadPhoto, openDocForm, docFormBody, printDoc, ustaz, foldCard, printPage, qrImg, markDone, markPartPending,
    SIG_NAMES, sigPointers, sigSave, sigClear, sigVerData, sigSnapshot, sigForApproval, sigDialog, approvalStamp, studentItems };
})(window);
