// إصدار: 2026-10-16.4 · الاختبار
/* الترويسة الموحَّدة للنماذج المطبوعة (البند ٤).
   الشكل: لوحة داكنة بانحناء سفلي — يمين: (المملكة / الوزارة / إدارة التعليم / المدرسة) موسَّطة، وسط: شعار الوزارة،
   يسار: (العام الدراسي / الفصل الدراسي ومعهما بنود النموذج مثل المادة والصف) محاذاة يمين، وتحتها لوحة عنوان النموذج.
   نسخة طباعة خفيفة (إطار فقط وشعار ملوّن) لتوفير الحبر، يختارها المستخدم من نافذة الطباعة ويُحفظ اختياره.
   الاستعمال:  const ctx = await FormHdr.resolve({db, session, period});
               html = FormHdr.doc({ title, formTitle, ctx, extra:[['المادة','..']], body, landscape:true, signatures:true })
   أو للدمج في صفحة قائمة:  FormHdr.css() + FormHdr.header({formTitle, ctx, extra}) + FormHdr.optionBar() + FormHdr.script() */
(function(g){
  'use strict';
  const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const AR = n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
  const LS_KEY = 'fh_light';
  const abs = f=>{ try{ return new URL(f, g.location.href).href; }catch(e){ return f; } };
  const termName = p=>p==='second'?'الفصل الدراسي الثاني':'الفصل الدراسي الأول';
  const yearTxt = y=>{ y=String(y||'').trim(); if(!y) return ''; y=AR(y); return /هـ|ه/.test(y)?y:y+'هـ'; };
  const schoolTxt = n=>{ n=String(n||'').trim(); if(!n) return 'مدرسة'; return /^مدرسة|^ثانوية|^متوسطة|^ابتدائية|^مجمع|^روضة|^مدارس/.test(n)?n:'مدرسة '+n; };

  /* ---------- جمع بيانات الترويسة من النظام (تُخزَّن لكل مدرسة وفصل) ---------- */
  const CACHE = {};
  async function resolve(o){
    o = o||{}; const db=o.db, ss=o.session||{}, sid=ss.schoolId||null, period=o.period||ss.period||'first';
    const key = (sid||'solo')+'|'+period;
    if(CACHE[key] && !o.fresh) return CACHE[key];
    const r = { edu:'', school:'', year:'', term:termName(period), principal:'', teacher:ss.username||'', schoolId:sid, period };
    if(db && sid){
      try{ const s=await db.collection('schoolData').doc(sid).get(); if(s.exists){ const d=s.data(); r.edu=d.eduDept||''; r.school=d.name||''; r.year=d.year||''; } }catch(e){}
      try{
        if(g.UsersAPI){ const q=await g.UsersAPI.listSnap(sid);
          const m=q.docs.map(d=>Object.assign({id:d.id},d.data())).find(u=>u.role==='schoolAdmin' && u.active!==false && (u.adminSchools||[]).includes(sid));
          if(m) r.principal=m.username||''; }
      }catch(e){}
    }
    if(db && !r.year){ try{ const c=await db.collection('settings').doc('academicCalendar').get(); if(c.exists) r.year=c.data().year||''; }catch(e){} }
    CACHE[key]=r; return r;
  }

  /* ---------- الأنماط ---------- */
  function css(){ return `
.fh{position:relative;background:#17475e;color:#fff;border-radius:0 0 34px 34px;border-right:3px solid #2fb58a;border-bottom:4px solid #2fb58a;border-left:3px solid #2d7fb8;padding:0 10px 30px;margin:0 0 34px;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:Tahoma,Arial,sans-serif}
.fh .fh-strip{height:6px;margin:0 -10px;background:linear-gradient(90deg,#2d7fb8,#2fb58a)}
.fh .fh-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:12px}
.fh .fh-r{width:32%;flex:none;text-align:center;font-size:15px;line-height:1.7;font-weight:600}
.fh .fh-l{width:32%;flex:none;text-align:right;font-size:15px;line-height:1.7;font-weight:600}
.fh .fh-c{flex:1;display:flex;justify-content:center}.fh .fh-c img{height:76px;width:auto;max-width:100%;display:block}
.fh .fh-c .fh-lc{display:none}
.fh .fh-pill{position:absolute;left:50%;bottom:-22px;transform:translateX(-50%);background:#17475e;color:#fff;border:2px solid #2fb58a;border-bottom:4px solid #2fb58a;border-radius:6px;padding:7px 40px;font-size:18px;font-weight:700;white-space:nowrap}
body.fh-light .fh,.fh.fh-lt{background:#fff;color:#111;border:2px solid #17475e}
body.fh-light .fh .fh-strip,.fh.fh-lt .fh-strip{background:#17475e;height:3px;margin:0 -10px}
body.fh-light .fh .fh-pill,.fh.fh-lt .fh-pill{background:#fff;color:#111;border:2px solid #17475e}
body.fh-light .fh .fh-c .fh-wc,.fh.fh-lt .fh-c .fh-wc{display:none}body.fh-light .fh .fh-c .fh-lc,.fh.fh-lt .fh-c .fh-lc{display:block}
.fh-opt{display:flex;gap:16px;align-items:center;font:700 13px Tahoma,Arial;margin:0 0 10px;padding:6px 10px;background:#f1f6f5;border:1px solid #d5e0dd;border-radius:8px}
.fh-opt label{cursor:pointer}
.fh-sig{display:flex;justify-content:space-between;margin-top:26px;font:700 14px Tahoma,Arial}
@media print{.fh-opt{display:none !important}}
`; }

  /* ---------- الترويسة نفسها ---------- */
  function header(o){
    const c=o.ctx||{}, extra=(o.extra||[]).filter(x=>x&&x[1]!=null&&String(x[1])!=='');
    const right = [ 'المملكة العربية السعودية', 'وزارة التعليم' ]
      .concat(c.edu?[c.edu]:['الإدارة العامة للتعليم']).concat([schoolTxt(c.school)]).map(esc).join('<br>');
    const left = extra.map(x=>esc(x[0])+': '+esc(x[1])).concat(['العام الدراسي '+esc(yearTxt(c.year)||'—'), esc(c.term||'')]).join('<br>');
    return '<div class="fh'+(o.light?' fh-lt':'')+'"><div class="fh-strip"></div><div class="fh-row"><div class="fh-r">'+right+'</div>'
      +'<div class="fh-c"><img class="fh-wc" src="'+abs('moe-logo-white.png')+'" alt=""><img class="fh-lc" src="'+abs('moe-logo-color.png')+'" alt=""></div>'
      +'<div class="fh-l">'+left+'</div></div><div class="fh-pill">'+esc(o.formTitle||'')+'</div></div>';
  }
  /* شريط الاختيار (لا يُطبع) + سكربت تطبيقه وحفظه */
  function optionBar(noPrintBtn){
    return '<div class="fh-opt"><span>خيار الطباعة:</span><label><input type="radio" name="fhm" value="dark"> نسخة ملونة</label><label><input type="radio" name="fhm" value="light"> نسخة خفيفة (توفير حبر)</label>'+(noPrintBtn?'':'<button type="button" onclick="window.print()" style="margin-inline-start:auto;padding:6px 16px;border:0;border-radius:7px;background:#17475e;color:#fff;font:700 13px Tahoma,Arial;cursor:pointer">🖨️ طباعة</button>')+'</div>';
  }
  function script(){
    return '<script>(function(){var K="'+LS_KEY+'",l=false;try{l=localStorage.getItem(K)==="1"}catch(e){}'
      +'function ap(){document.body.classList.toggle("fh-light",l);var r=document.querySelectorAll("input[name=fhm]");for(var i=0;i<r.length;i++)r[i].checked=(r[i].value==="light")===l}'
      +'document.addEventListener("change",function(e){if(e.target&&e.target.name==="fhm"){l=e.target.value==="light";try{localStorage.setItem(K,l?"1":"0")}catch(x){}ap()}});ap()})();<\/script>';
  }
  function signatures(c, teacherLabel){
    return '<div class="fh-sig"><span>'+esc(teacherLabel||'معلم المادة')+': '+esc(c.teacher||'')+'</span><span>قائد المدرسة: '+esc(c.principal||'')+'</span></div>';
  }
  /* مستند طباعة كامل: ترويسة + محتوى (+ تواقيع اختيارية) */
  function doc(o){
    const c=o.ctx||{};
    return '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+esc(o.title||o.formTitle||'')+'</title><style>'
      +'@page{size:A4 '+(o.landscape?'landscape':'portrait')+';margin:'+(o.margin||'10mm')+'}body{font-family:Tahoma,Arial,sans-serif;color:#111;margin:0;padding:8px}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
      +css()+(o.extraCss||'')+'</style></head><body>'+optionBar(o.noPrintBtn)+header(o)+(o.body||'')+(o.signatures?signatures(c,o.teacherLabel):'')+script()+'</body></html>';
  }
  function lightPref(){ try{ return localStorage.getItem(LS_KEY)==='1'; }catch(e){ return false; } }
  g.FormHdr = { lightPref, resolve, css, header, optionBar, script, signatures, doc, termName, yearTxt, schoolTxt };
})(window);
