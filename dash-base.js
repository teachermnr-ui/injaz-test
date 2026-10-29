// إصدار: 2026-10-29.1 · الاختبار (خيار bare: بلا الشريط العلوي لصفحات لها ترويستها الخاصة)
/* أساس مشترك لصفحات اللوحات (الوكلاء، الموجه الطلابي، منصة النشاط المدرسي، الإرشاد الصحي).
   - يقرأ جلسة cls_session، ويتحقق من الحساب والصلاحية، ويعرض شريطًا علويًا موحّدًا.
   - يشغّل حارس الفصل الدراسي (SemGuard) فيُغطّى الفصل المغلق كاملًا.
   الاستعمال:
     Dash.boot({ title:'الوكلاء', allow:(u,ctx,sid)=>true|'رسالة منع', render:async env=>{ env.main.innerHTML = ...; } });
   env = { db, sid, session, me:{id,name,role}, user, ctx, period, main, school }  */
(function(g){
  'use strict';
  const FB = g.FB_CONFIG;
  const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arN = n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
  const dk = d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const dayLabel = k=>{ try{ return new Date(k+'T12:00:00').toLocaleDateString('ar',{weekday:'long',day:'numeric',month:'long'}); }catch(e){ return k; } };
  const periodLabel = p=>p==='second'?'الفصل الدراسي الثاني':'الفصل الدراسي الأول';
  const CSS = `
:root{--bg:#f4f7f6;--surface:#fff;--brand:#0f766e;--brand-2:#0b5a54;--brand-l:#d5ece9;--ink:#15242b;--muted:#5b6f76;--line:#d8e2e0;--r:14px;--shadow:0 1px 2px rgba(16,40,40,.06),0 8px 24px rgba(16,40,40,.06)}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:'Tajawal',"Segoe UI",Tahoma,system-ui,sans-serif;background:var(--bg);color:var(--ink);font-size:14.5px;line-height:1.6;min-height:100vh}
button{font-family:inherit;cursor:pointer;border:none}
.hidden{display:none !important}
.dh-boot{min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--muted);text-align:center;padding:20px}
.dh-spin{display:inline-block;width:22px;height:22px;border:3px solid var(--line);border-top-color:var(--brand);border-radius:50%;animation:dhsp 1s linear infinite}
@keyframes dhsp{to{transform:rotate(360deg)}}
.dh-top{position:sticky;top:0;z-index:40;background:var(--brand);color:#fff;padding:10px 18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dh-top h1{margin:0;font-size:17px;font-weight:800;white-space:nowrap}
.dh-badge{background:rgba(255,255,255,.15);padding:5px 12px;border-radius:20px;font-size:13px;font-weight:600;white-space:nowrap}
.dh-btn{background:rgba(255,255,255,.17);color:#fff;padding:7px 14px;border-radius:10px;font-weight:700;font-size:13px;white-space:nowrap}
.dh-main{max-width:1100px;margin:0 auto;padding:16px 16px 60px}
.dh-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px;margin-bottom:14px;box-shadow:var(--shadow)}
.dh-card h3{margin:0 0 8px;font-size:15.5px}
.dh-sub{color:var(--muted);font-size:12.5px}
.dh-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.dh-stat{display:block;text-decoration:none;color:inherit;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:12px;text-align:center;box-shadow:var(--shadow)}
.dh-stat b{display:block;font-size:26px;line-height:1.2;color:var(--brand)}
.dh-stat span{font-size:12.5px;color:var(--muted);font-weight:700}
.dh-stat.warn b{color:#b45309}.dh-stat.bad b{color:#b42318}
.dh-grid{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}.dh-grid>*{flex:1 1 360px;min-width:0}
.dh-links{display:flex;gap:8px;flex-wrap:wrap}
.dh-link{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13.5px;padding:8px 14px;border-radius:10px;border:1.5px solid var(--brand);background:#fff;color:var(--brand);text-decoration:none}
.dh-list{display:flex;flex-direction:column;gap:6px}
.dh-item{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:13.5px}
.dh-item .m{color:var(--muted);font-size:12px}
.dh-chip{display:inline-flex;align-items:center;font-size:12px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap;background:var(--brand-l);color:var(--brand-2)}
.dh-chip.warn{background:#fdf0d5;color:#b45309}.dh-chip.bad{background:#fde4e1;color:#b42318}
.dh-empty{color:var(--muted);font-size:13px;padding:8px 0}
.dh-soon{text-align:center;padding:30px 16px}.dh-soon .ic{font-size:44px}.dh-soon p{color:var(--muted);line-height:1.9}
`;
  let _db = null;
  function fatal(msg){
    const b = document.getElementById('dhBoot');
    if(b){ b.classList.remove('hidden'); b.innerHTML = '<div class="dh-card" style="max-width:460px;text-align:center"><h3>'+esc(msg)+'</h3><button class="dh-btn" style="background:var(--brand)" onclick="location.href=\'index.html\'">العودة للرئيسية</button></div>'; }
  }
  function boot(opts){
    /* bare: لصفحة لها أنماطها الكاملة (مثل وكيل الشؤون المدرسية) — لا نحقن أنماط اللوحات كي لا تُغيّر ألوانها ولا خطها */
    const BARE_CSS = '.hidden{display:none !important}.dh-boot{min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#5b6d66;text-align:center;padding:20px;font-family:Tajawal,system-ui,sans-serif}.dh-spin{display:inline-block;width:22px;height:22px;border:3px solid #d8e3de;border-top-color:#3f6659;border-radius:50%;animation:dhsp 1s linear infinite}@keyframes dhsp{to{transform:rotate(360deg)}}.dh-card{background:#fff;border:1px solid #d8e3de;border-radius:14px;padding:14px;margin:14px}.dh-btn{background:#3f6659;color:#fff;padding:7px 14px;border-radius:10px;font-weight:700;border:none;cursor:pointer}';
    const st = document.createElement('style'); st.textContent = opts.bare ? BARE_CSS : CSS; document.head.appendChild(st);
    document.body.innerHTML = '<div id="dhBoot" class="dh-boot"><div class="dh-spin"></div><div>جارٍ التحميل...</div></div>'
      + '<div id="dhApp" class="hidden">'+(opts.bare?'':'<div class="dh-top"><button class="dh-btn" id="dhBack">← الموقع</button><h1>'+esc(opts.title)+'</h1>'
      + '<span class="dh-badge" id="dhSchool"></span><span class="dh-badge" id="dhPeriod"></span></div>')+'<div class="dh-main" id="dhMain"'+(opts.bare?' style="max-width:none;padding:0"':'')+'></div></div>';
    let s=null; try{ s = JSON.parse(localStorage.getItem('cls_session')||'null'); }catch(e){}
    if(!s || !s.userId){ location.replace('index.html'); return; }
    if(s.role==='soloTeacher' || s.role==='admin' || !s.schoolId){ fatal('هذه الصفحة خاصة بموظفي المدرسة.'); return; }
    try{ firebase.initializeApp(FB); _db = firebase.firestore(); }catch(e){ fatal('تعذّر الاتصال بقاعدة البيانات.'); return; }
    firebase.auth().onAuthStateChanged(async au=>{
      if(!au){ try{ localStorage.removeItem('cls_session'); }catch(e){} location.replace('index.html'); return; }
      try{
        const us = await _db.collection('users').doc(s.userId).get();
        if(!us.exists || us.data().authUid !== au.uid){ await firebase.auth().signOut(); location.replace('index.html'); return; }
        const u = us.data();
        if(u.active===false){ fatal('حسابك موقوف.'); return; }
        const sid = s.schoolId;
        const ctx = (u.schools||{})[sid] || null;
        const isSA = u.role==='schoolAdmin' && (u.adminSchools||[]).includes(sid);
        if(!isSA && (!ctx || ctx.active===false)){ fatal('لا يمكن الوصول لهذه المدرسة.'); return; }
        const verdict = opts.allow ? opts.allow(u, ctx, sid, isSA) : true;
        if(verdict !== true){ fatal(typeof verdict==='string' ? verdict : 'ليست لديك صلاحية الوصول لهذه الصفحة.'); return; }
        const period = s.period || 'first';
        const env = { db:_db, sid, session:s, me:{ id:us.id, name:u.username||'', role:isSA?'schoolAdmin':(ctx&&ctx.role)||'' }, user:u, ctx, period, isSA,
          main:document.getElementById('dhMain'), school:{ name:sid } };
        try{ const sd = await _db.collection('schoolData').doc(sid).get(); if(sd.exists) env.school = Object.assign({}, sd.data(), { name: sd.data().name||sid }); }catch(e){}
        if(!opts.bare){
          document.getElementById('dhBack').onclick = ()=>location.href='index.html';
          document.getElementById('dhSchool').textContent = env.school.name;
          document.getElementById('dhPeriod').textContent = periodLabel(period);
        }
        document.getElementById('dhBoot').classList.add('hidden'); document.getElementById('dhApp').classList.remove('hidden');
        try{ if(g.SemGuard) g.SemGuard.start(); }catch(e){}
        await opts.render(env);
      }catch(e){ console.error(e); fatal('تعذّر التحميل: '+(e.message||e)); }
    });
  }
  /* بطاقة «قيد الإعداد» لصفحة بلا محتوى بعد */
  function soon(ic, title, text){ return '<div class="dh-card dh-soon"><div class="ic">'+ic+'</div><h2>'+esc(title)+'</h2><p>'+esc(text||'هذه الصفحة قيد الإعداد، وسيُحدَّد محتواها لاحقًا.')+'</p></div>'; }
  const stat = (label, value, href, tone)=>'<a class="dh-stat '+(tone||'')+'" href="'+esc(href||'#')+'"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></a>';
  const link = (href, label)=>'<a class="dh-link" href="'+esc(href)+'">'+label+'</a>';
  g.Dash = { boot, esc, arN, dk, dayLabel, periodLabel, soon, stat, link };
})(window);
