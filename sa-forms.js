// إصدار: 2026-10-27.1 · الاختبار
/* نماذج الشؤون الطلابية المطبوعة (من الدليل الإجرائي) وتسجيل التوقيع الورقي.
   النماذج: رصد المشكلات السلوكية (٥)، تعهد سلوكي (٨)، إشعار ولي الأمر (٩ — سري)، محضر ضبط واقعة (١١ — سري)،
   إبلاغ عن حالة عالية الخطورة (١٤ — سري للغاية)، إجراءات الغياب بعذر (١٥) وبدون عذر (١٦)، تعهد الالتزام بالحضور (١٧).
   الترويسة: الموحَّدة (form-header.js). ختم المدير وتوقيعه: من منصة النشاط المدرسي (activitySigns / activitySignVers).
   التوقيع ورقي: يطبع الوكيل النموذج، ثم يسجّل هنا أن الطالب وولي الأمر (والشهود) وقّعوا، مع رفع صورة الورقة اختياريًا.
   البيانات تحت studentAffairs/{sid}:
     signoffs/{form}__{...}   {form, period, seat, name, className, rows:{key:{student,parent,witnesses,at}}, files:[...]}
     incidents/{vid}          محضر ضبط الواقعة: {place, ev:{photos,videos,chats,other}, witnesses:[{name,job,work}]}
   مرفقات الأوراق الموقعة: studentAffairs/{sid}/signed/{docId}/{ملف} في التخزين (أقل من ٥٠٠ كيلوبايت). */
(function(g){
  'use strict';
  const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nl = s=>esc(s).replace(/\n/g,'<br>');
  const MAXF = 512000, OKF = /^(application\/pdf|image\/(jpeg|png|webp))$/;
  const PLAB = {student:'الطالب', parent:'ولي الأمر', witnesses:'الشهود'};
  const HCK = ['تبليغ إدارة التعليم','تبليغ الجهات الأمنية','تبليغ الحماية من العنف الأسري وحماية الطفل','تبليغ وزارة الصحة','التواصل مع الأسرة لإخطارها بوضع الحالة','عقد اجتماع طارئ للجنة التوجيه والإرشاد لدراسة الحالة ووضع خطة لمعالجتها بالتكامل مع الجهات ذات العلاقة','رفع بلاغ عن الحالة في الأنظمة التقنية الخاصة بالبلاغات'];
  const CSS = '.f{font-size:15px;line-height:2.2;margin:6px 0;padding:0 9mm}.sgs.e{justify-content:flex-end}.sgs.m{justify-content:center}.sgs.e .sgb,.sgs.m .sgb{flex:0 0 auto;min-width:230px}.sgs .stp{flex:0 0 auto;min-width:170px}.sgs.lt .sgb:not(.stp){flex:0 0 auto;min-width:260px}.f .ln{margin:3px 0}.dots{display:inline-block;min-width:110px;border-bottom:1px dotted #444;padding:0 6px;text-align:center}'
    +'.f table{width:100%;border-collapse:collapse;margin:10px 0}.f th,.f td{border:1.5px solid #17475e;padding:6px 8px;text-align:center;font-size:13px;vertical-align:top}.f th{background:#eaf2f4}.f td{height:46px}'
    +'.f td.l{text-align:right}.sgs{display:flex;justify-content:space-between;gap:14px;margin-top:30px}.sgb{flex:1;font-size:14px;line-height:2.3}.sgb .t{font-weight:700;margin-bottom:2px}'
    +'.sgb img.sg{max-height:62px;max-width:150px;vertical-align:middle}.stbox{display:inline-block;min-width:110px;min-height:62px;vertical-align:middle;border:1px dashed #999}.stbox img{max-height:90px;max-width:150px;display:block}'
    +'.sec{text-align:center;font-weight:700;font-size:16px;margin:4px 0}.ev span{margin-inline-end:18px}.f ol{margin:4px 0 8px;padding-right:26px}.f .box{display:inline-block;width:14px;height:14px;border:1.5px solid #17475e;vertical-align:middle;margin-inline-start:4px;text-align:center;line-height:12px;font-size:13px}';

  function make(C){
    const A = C.A, db = C.db, sid = C.sid;
    const soCol = C.base.collection('signoffs'), inCol = C.base.collection('incidents');
    let SO = new Map(), INC = new Map(), MG = null;

    async function load(){
      const [s, i] = await Promise.all([ soCol.get().catch(()=>({docs:[]})), inCol.get().catch(()=>({docs:[]})) ]);
      SO = new Map(s.docs.map(d=>[d.id, d.data()])); INC = new Map(i.docs.map(d=>[d.id, d.data()]));
    }

    /* ---- ختم المدير وتوقيعه: من منصة النشاط المدرسي ---- */
    async function mgr(){
      if(MG) return MG;
      const out = {sig:'', stamp:''};
      try{
        const q = await db.collection('activitySigns').where('schoolId','==',sid).get(), ptr = {};
        q.docs.forEach(d=>{ const x=d.data(); if(x.kind==='principal' || x.kind==='stamp') ptr[x.kind]=x; });
        const get = async p=>{ if(!p || !p.verId) return ''; try{ const d=await db.collection('activitySignVers').doc(p.verId).get(); return d.exists ? (d.data().data||'') : ''; }catch(e){ return ''; } };
        const r = await Promise.all([get(ptr.principal), get(ptr.stamp)]); out.sig = r[0]; out.stamp = r[1];
      }catch(e){ console.warn(e); }
      if(!out.sig && !out.stamp && C.fallback){ const f = C.fallback(); if(f) out.sig = f; }
      if(!out.sig && !out.stamp) C.toast('لم يُرفع ختم المدير وتوقيعه في منصة النشاط المدرسي، فسيُطبع النموذج بدونهما');
      MG = out; return out;
    }

    /* ---- مكونات الطباعة ---- */
    const dots = (v,w)=>'<span class="dots"'+(w?' style="min-width:'+w+'px"':'')+'>'+(v?esc(v):'&nbsp;')+'</span>';
    const today = ()=>A(C.hijL(C.dk))+' هـ';
    /* كتلة المدير: o.nodate بدون تاريخ، o.stamp = 'box' (خانة الختم دائمًا) أو 'opt' (الختم عند وجوده فقط) أو 'none' */
    const mgrBlock = (M,ctx,o)=>{ o = o||{}; const sm = o.stamp||'box';
      return '<div class="sgb"><div class="t">مدير/مديرة المدرسة</div><div>الاسم: '+dots(ctx.principal,150)+'</div><div>التوقيع: '+(M.sig?'<img class="sg" src="'+M.sig+'" alt="">':dots('',130))+'</div>'
        +(sm==='box'?'<div>الختم: <span class="stbox">'+(M.stamp?'<img src="'+M.stamp+'" alt="">':'')+'</span></div>':(sm==='opt'&&M.stamp?'<div>الختم: <span class="stbox"><img src="'+M.stamp+'" alt=""></span></div>':''))
        +(o.nodate?'':'<div>التاريخ: '+dots(today(),130)+'</div>')+'</div>'; };
    /* صف المدير وحده: يمين الصفحة ممنوع، حسب النموذج الأصلي: e = يسار، m = وسط. الختم بجانب الكتلة إن وُجد */
    const mgrRow = (M,ctx,al,o)=>'<div class="sgs '+(al||'e')+'">'+(M.stamp?'<div class="sgb stp"><div class="t">&nbsp;</div><span class="stbox"><img src="'+M.stamp+'" alt=""></span></div>':'')+mgrBlock(M,ctx,Object.assign({stamp:'none'},o||{}))+'</div>';
    /* خطاب بختم في اليمين واسم المدير وتوقيعه في اليسار (الإشعار والدعوة) */
    const mgrLetter = (M,ctx,o)=>'<div class="sgs lt"><div class="sgb stp"><div class="t">الختم</div><span class="stbox">'+(M.stamp?'<img src="'+M.stamp+'" alt="">':'')+'</span></div>'+mgrBlock(M,ctx,Object.assign({stamp:'none'},o||{}))+'</div>';
    const partyBlock = (t,name)=>'<div class="sgb"><div class="t">'+t+'</div><div>الاسم: '+dots(name||'',150)+'</div><div>التوقيع: '+dots('',130)+'</div><div>التاريخ: '+dots('',130)+'</div></div>';
    const secret = t=>'<div class="sec">'+t+'</div>';
    const ck = on=>'<span class="box">'+(on?'✓':'')+'</span>';
    async function docHtml(formTitle, period, extra, build){
      const [ctx, M] = await Promise.all([ g.FormHdr.resolve({db, session:C.env.session, period}), mgr() ]);
      return g.FormHdr.doc({ title:formTitle, formTitle, ctx, extra:extra||[], body:'<div class="f">'+build(ctx, M)+'</div>', extraCss:CSS });
    }
    async function printDoc(formTitle, period, extra, build, pre){
      const w = g.open('', '_blank'); if(!w){ C.toast('اسمح بالنوافذ المنبثقة للطباعة'); return; }
      try{ w.document.write('<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:Tahoma,Arial;padding:24px">جارٍ تحضير النموذج…</body>'); }catch(e){}
      try{ if(pre) await pre(); const html = await docHtml(formTitle, period, extra, build); w.document.open(); w.document.write(html); w.document.close(); }
      catch(e){ try{ w.close(); }catch(x){} C.fail(e); }
    }

    /* ---- ٥: رصد المشكلات السلوكية (لكل طالب في فصل دراسي) ---- */
    function printV5(seat, per){
      const vs = C.vl().filter(v=>v.seat===seat && v.period===per).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)); if(!vs.length) return;
      const f = vs[0];
      return printDoc('نموذج رصد مشكلة سلوكية', per, [], (ctx,M)=>{
        const rows = vs.map(v=>{ const I=C.vInfo(v);
          return '<tr><td class="l">'+esc(v.w)+'</td><td>الدرجة '+C.DEGN[v.d]+'</td><td>'+A(esc(v.dateH||''))+'</td><td>'+A(I.pts)+'</td><td class="l">'+esc(I.act)+'</td><td>'+A(esc(v.dateH||''))+'</td><td></td><td></td></tr>'; }).join('');
        return '<div class="ln">اسم الطالب/الطالبة: '+dots(f.name,330)+'</div><div class="ln">الصف: '+dots(f.className,150)+' الفصل: '+dots(C.PN[per],170)+'</div>'
          +'<table><thead><tr><th>المشكلة السلوكية</th><th>نوعها ودرجتها</th><th>تاريخها</th><th>درجات السلوك المحسومة</th><th>الإجراءات المتخذة</th><th>تاريخ الإجراء</th><th>توقيع الطالب</th><th>توقيع ولي الأمر</th></tr></thead><tbody>'+rows+'</tbody></table>'
          +mgrRow(M,ctx,'m'); });
    }
    /* ---- ٨: تعهد سلوكي (لكل مخالفة) ---- */
    function printPledge(v){
      return printDoc('تعهد سلوكي', v.period, [], (ctx,M)=>
        '<div class="ln">أنا الطالب/الطالبة: '+dots(v.name,360)+'</div><div class="ln">بالصف: '+dots(v.className,200)+'</div>'
        +'<div class="ln">أنني قمت في يوم '+dots(v.dayName,110)+' الموافق '+dots(A(v.dateH||''),130)+' هـ</div>'
        +'<div class="ln">بمشكلة سلوكية من الدرجة '+dots(C.DEGN[v.d],90)+'</div><div class="ln">وهي: '+dots(v.w,420)+'</div>'
        +'<div class="ln">وأتعهد بعدم تكرار أي مشكلة سلوكية مستقبلاً وعلى ذلك جرى التوقيع.</div>'
        +'<div class="sgs">'+partyBlock('الطالب/الطالبة',v.name)+partyBlock('ولي الأمر','')+mgrBlock(M,ctx,{stamp:'opt'})+'</div>');
    }
    /* ---- ٩: إشعار ولي الأمر بمشكلة سلوكية (سري) ---- */
    function printNotice(v){
      const I = C.vInfo(v), items = String(I.act||'').split(/،\s*/).map(x=>x.replace(/^و(?=[ء-ي])/, '').trim()).filter(Boolean);
      return printDoc('إشعار ولي أمر الطالب/الطالبة بمشكلة سلوكية', v.period, [], (ctx,M)=>
        secret('سري')+'<div class="ln">المكرم ولي أمر الطالب/الطالبة: '+dots(v.name,330)+'</div><div class="ln">بالصف: '+dots(v.className,200)+'</div>'
        +'<div class="ln" style="text-align:center">السلام عليكم ورحمة الله وبركاته</div>'
        +'<div class="ln">نشعركم بأن الطالب/الطالبة قام/قامت بمشكلة سلوكية من الدرجة '+dots(C.DEGN[v.d],90)+'</div><div class="ln">وهي: '+dots(v.w,420)+'</div>'
        +'<div class="ln">وقد قُررت الإجراءات التالية حياله/حيالها وفق ما ورد في قواعد السلوك والمواظبة:</div><ol>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol>'
        +'<div class="ln">لذا يرجى منكم المتابعة والتعاون مع المدرسة بما يسهم في انضباط سلوك ابنكم/ابنتكم.</div>'
        +mgrLetter(M,ctx,{nodate:true}));
    }
    /* ---- خطاب دعوة ولي الأمر (بديل الإشعار، يختاره الوكيل) ---- */
    function printInvite(v, inv){
      inv = inv||{};
      return printDoc('خطاب دعوة ولي الأمر', v.period, [], (ctx,M)=>
        '<div class="ln">المكرم ولي أمر الطالب/الطالبة: '+dots(v.name,330)+'</div><div class="ln">بالصف: '+dots(v.className,200)+'</div>'
        +'<div class="ln" style="text-align:center">السلام عليكم ورحمة الله وبركاته</div>'
        +'<div class="ln">نأمل منكم الحضور إلى المدرسة في يوم '+dots(inv.day||'',110)+' الموافق '+dots(inv.dateH?A(inv.dateH)+' هـ':'',150)+'</div>'
        +'<div class="ln">لمقابلة مدير/مديرة المدرسة، وذلك بهدف '+dots(inv.purpose||'',380)+'</div>'
        +'<div class="ln" style="text-align:center;margin-top:18px">شاكرين لكم تعاونكم معنا لتحقيق مصلحة الطالب.</div>'
        +mgrLetter(M,ctx)
        +'<div class="ln" style="margin-top:26px"><b>رد ولي الأمر:</b></div>'
        +'<div class="ln">'+ck(false)+' أقر بالعلم، وسأحضر في الموعد المحدد.</div>'
        +'<div class="ln">'+ck(false)+' أقر بالعلم، وأرغب بتغيير الموعد (خلال نفس الأسبوع)، وذلك في يوم '+dots('',100)+' الموافق '+dots('',130)+' هـ</div>'
        +'<div class="sgs m">'+partyBlock('ولي الأمر','')+'</div>');
    }
    /* ---- ١١: محضر ضبط واقعة (سري) ---- */
    function printIncident(v){
      const x = INC.get(v.id); if(!x) return; const ev = x.ev||{}, ws = (x.witnesses||[]).slice(0,7);
      if(!ws.length) ws.push({});
      return printDoc('محضر ضبط واقعة', v.period, [], (ctx,M)=>
        secret('سري')+'<div class="ln">اسم الطالب/الطالبة: '+dots(v.name,330)+'</div><div class="ln">المرحلة: '+dots(v.stage||'',150)+' الصف: '+dots(v.className,170)+'</div>'
        +'<div class="ln">المشكلة السلوكية: '+dots(v.w,330)+' درجتها: '+dots(C.DEGN[v.d],80)+'</div>'
        +'<div class="ln ev">نوع المشاهدة المضبوطة: <span>'+ck(ev.photos)+' صور</span><span>'+ck(ev.videos)+' مقاطع فيديو</span><span>'+ck(ev.chats)+' محادثات</span><span>'+ck(!!ev.other)+' أخرى '+dots(ev.other||'',170)+'</span></div>'
        +'<div class="ln">مكان ضبط الواقعة: '+dots(x.place||'',360)+'</div><div class="ln">شهود الواقعة:</div>'
        +'<table><thead><tr><th style="width:36px">م</th><th>الاسم</th><th>الوظيفة</th><th>العمل المسند إليه</th><th>التوقيع</th></tr></thead><tbody>'+ws.map((w,i)=>'<tr style="height:30px"><td style="height:30px">'+A(i+1)+'</td><td style="height:30px">'+esc(w.name||'')+'</td><td style="height:30px">'+esc(w.job||'')+'</td><td style="height:30px">'+esc(w.work||'')+'</td><td style="height:30px"></td></tr>').join('')+'</tbody></table>'
        +'<div class="sgs">'+partyBlock('الطالب/الطالبة',v.name)+partyBlock('ولي الأمر','')+mgrBlock(M,ctx,{stamp:'opt'})+'</div>');
    }
    /* ---- ١٤: إبلاغ عن حالة عالية الخطورة (سري للغاية) — بعد اعتماد المدير ---- */
    const fmtT = t=>{ if(!t) return ''; const p=String(t).split(':'), h=+p[0]; return A((h%12||12)+'،'+p[1])+(h<12?' ص':' م'); };
    const dkOf = ms=>{ const at=new Date(ms||Date.now()); return at.getFullYear()+'-'+String(at.getMonth()+1).padStart(2,'0')+'-'+String(at.getDate()).padStart(2,'0'); };
    const tmOf = ms=>{ const at=new Date(ms||Date.now()); return String(at.getHours()).padStart(2,'0')+':'+String(at.getMinutes()).padStart(2,'0'); };
    function highBuild(h){
      const od = h.obsDate || dkOf(h.createdAt), ot = h.obsTime || tmOf(h.createdAt);
      return (ctx,M)=>
        secret('(سري للغاية)')+'<div class="ln">اسم الطالب/الطالبة: '+dots(h.name,330)+'</div><div class="ln">الصف الدراسي: '+dots(h.className,250)+'</div>'
        +(h.type?'<div class="ln">نوع الحالة: '+dots(h.type,300)+'</div>':'')
        +'<div class="ln">وصف الحالة:</div><div style="border-bottom:1px dotted #444;min-height:64px;padding:2px 6px;line-height:2">'+nl(h.desc||'')+'</div>'
        +'<div class="ln">اسم راصد الحالة: '+dots(h.observer||h.createdByName||'',300)+'</div><div class="ln">تاريخ الرصد: '+dots(A(C.hijL(od))+' هـ',150)+' وقت الرصد: '+dots(fmtT(ot),100)+'</div>'
        +'<div class="ln">الإجراءات المتخذة مع الحالة:</div>'+HCK.map((t,i)=>'<div class="ln">'+ck((h.checks||[]).includes(i))+' '+esc(t)+'.</div>').join('')
        +mgrRow(M,ctx,'e');
    }
    function printHigh(h){
      if(h.st!=='approved'){ C.toast('الطباعة بعد اعتماد المدير للتقرير'); return; }
      return printDoc('نموذج إبلاغ عن حالة عالية الخطورة', h.period, [], highBuild(h));
    }
    /* معاينة النموذج بالختم والتوقيع داخل نافذة الصفحة (بعد الاعتماد) */
    async function previewHigh(h){
      if(h.st!=='approved'){ C.toast('المعاينة بعد اعتماد المدير للتقرير'); return; }
      try{
        const html = await docHtml('نموذج إبلاغ عن حالة عالية الخطورة', h.period, [], highBuild(h));
        if(!document.getElementById('hpOv')) document.body.insertAdjacentHTML('beforeend','<div class="ov" id="hpOv" hidden><div class="box" role="dialog" aria-modal="true" aria-label="معاينة النموذج" style="max-width:860px;width:96%;max-height:94vh;display:flex;flex-direction:column;gap:8px"><iframe id="hpFr" title="معاينة النموذج" style="flex:1;min-height:60vh;width:100%;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe><div class="row"><button type="button" class="btn solid" id="hpPr">طباعة</button><button type="button" class="btn" id="hpX">إغلاق</button></div></div></div>');
        document.getElementById('hpX').onclick = ()=>{ document.getElementById('hpOv').hidden = true; document.getElementById('hpFr').srcdoc = ''; };
        document.getElementById('hpPr').onclick = ()=>{ try{ const fr=document.getElementById('hpFr'); fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){ C.toast('تعذّرت الطباعة من المعاينة'); } };
        document.getElementById('hpFr').srcdoc = html; document.getElementById('hpOv').hidden = false;
      }catch(e){ C.fail(e); }
    }
    /* ---- محضر اجتماع لجنة التوجيه (بعد اعتماد المدير) ---- */
    function printMn(m, getSig){
      if(m.st!=='approved'){ C.toast('الطباعة بعد اعتماد المحضر'); return; }
      const c = m.content||{}; let sg = {};
      const ol = L=>'<ol>'+(L||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol>';
      return printDoc('محضر اجتماع لجنة التوجيه والإرشاد', m.period||C.period, [], (ctx,M)=>{
        const rows = (c.members||[]).filter(x=>x.present).map((x,i)=>'<tr><td>'+A(i+1)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.role)+'</td><td>'+(sg[x.id]&&sg[x.id].image?'<img src="'+sg[x.id].image+'" style="height:34px" alt="">':'')+'</td></tr>').join('');
        return '<table><tr><th>اليوم</th><td>'+esc(c.dayName||'')+'</td><th>التاريخ</th><td>'+A(esc(c.dateH||''))+' هـ</td><th>الوقت</th><td>'+fmtT(c.time)+'</td></tr>'+(c.place?'<tr><th>المكان</th><td colspan="5">'+esc(c.place)+'</td></tr>':'')+'</table>'
          +'<div class="ln"><b>نقاط النقاش خلال الاجتماع:</b></div>'+ol(c.points)+'<div class="ln"><b>ومما سبق تم إقرار والموافقة على التوصيات التالية وهي:</b></div>'+ol(c.recs)
          +'<div class="ln"><b>وبذلك تم التوقيع على المحضر والتوصيات:</b></div><table><thead><tr><th>م</th><th>الاسم</th><th>عمله في اللجنة</th><th>التوقيع</th></tr></thead><tbody>'+rows+'</tbody></table>'
          +mgrRow(M,Object.assign({},ctx,{principal:m.approvedByName||ctx.principal}),'e'); }, async()=>{ sg = (typeof getSig==='function' ? await getSig() : getSig) || {}; });
    }
    /* ---- قرار تشكيل لجنة التوجيه والإرشاد (بعد اعتماد المدير) ---- */
    function printFormation(fm, getSig){
      if(!fm || fm.st!=='approved'){ C.toast('الطباعة بعد اعتماد المدير للخطاب'); return; }
      let sg = {}; const img = id=>sg[id]&&sg[id].image ? '<img class="sg" src="'+sg[id].image+'" alt="">' : '';
      const mem = [{id:fm.edu.id, name:fm.edu.name, job:'وكيل الشؤون التعليمية'},{id:fm.cn.id, name:fm.cn.name, job:'الموجه الطلابي'}]
        .concat((fm.t||[]).map(x=>({id:x.id, name:x.name, job:'معلم'})));
      return printDoc('قرار تشكيل لجنة التوجيه والإرشاد', fm.period||C.period, [['رقم القرار',A(fm.decNo||'')],['التاريخ',fm.decDate?A(C.hijL(fm.decDate))+' هـ':'']], (ctx,M)=>{
        const rows = mem.map((x,i)=>'<tr><td>'+A(i+1)+'</td><td class="l">'+esc(x.name)+'</td><td>'+esc(x.job)+'</td><td>'+(x.job==='الموجه الطلابي'?'مقررًا':'عضوًا')+'</td><td>'+img(x.id)+'</td></tr>').join('');
        return '<div class="ln">الموضوع: <b>تشكيل لجنة التوجيه والإرشاد بالمدرسة</b></div>'
          +'<div class="ln">بناءً على ما ورد في الدليل الإجرائي لقواعد السلوك والمواظبة، ولتحقيق بيئة مدرسية آمنة، تقرر تشكيل لجنة التوجيه والإرشاد للعام الدراسي '+esc(g.FormHdr.yearTxt(ctx.year)||'')+' على النحو الآتي:</div>'
          +'<div class="ln"><b>رئيس اللجنة:</b> '+dots(fm.pres.name,260)+' '+img(fm.pres.id)+'</div>'
          +'<table><thead><tr><th>م</th><th>الاسم</th><th>الصفة</th><th>العمل في اللجنة</th><th>التوقيع</th></tr></thead><tbody>'+rows+'</tbody></table>'
          +'<div class="ln">وعلى اللجنة مباشرة مهامها وفق ما ورد في الدليل الإجرائي، وعلى الله الاعتماد.</div>'
          +'<div class="sgs"><div class="sgb"><div class="t">رئيس اللجنة</div><div>الاسم: '+dots(fm.pres.name,150)+'</div><div>التوقيع: '+(img(fm.pres.id)||dots('',130))+'</div></div>'
          +mgrBlock(M,Object.assign({},ctx,{principal:fm.approvedByName||ctx.principal}))+'</div>'; }, async()=>{ sg = (typeof getSig==='function' ? await getSig() : getSig) || {}; });
    }
    /* ---- ١٥ و١٦: إجراءات الغياب بعذر وبدون عذر ---- */
    const LVL16 = [{key:'3',label:'٣ أيام',k:0},{key:'3c',label:'٣ أيام متصلة',k:-1},{key:'5',label:'٥ أيام',k:1},{key:'10',label:'١٠ أيام',k:2}];
    const LVL15 = [{key:'3',label:'٣ أيام'},{key:'5',label:'٥ أيام'},{key:'10',label:'١٠ أيام'}];
    function printAbs(s, withExcuse){
      const acts = (s.doc && s.doc.actions) || [], un = C.un(s), exn = C.exn(s), st = C.stageOf(s.seat);
      return printDoc(withExcuse ? 'نموذج إجراءات الغياب بعذر' : 'نموذج إجراءات الغياب بدون عذر', C.period, [], (ctx,M)=>{
        const head = '<div class="ln">اسم الطالب/الطالبة: '+dots(s.name,330)+'</div><div class="ln">المرحلة: '+dots(st,140)+' الصف: '+dots(s.cls,170)+'</div>';
        let table;
        if(withExcuse){
          table = '<table><thead><tr><th>عدد أيام الغياب</th><th>الإجراء المتخذ</th><th>تاريخ الإجراء</th><th>توقيع الطالب</th><th>توقيع ولي الأمر</th></tr></thead><tbody>'
            +LVL15.map(r=>'<tr><td>'+r.label+'</td><td></td><td></td><td></td><td></td></tr>').join('')+'</tbody></table>';
        }else{
          table = '<table><thead><tr><th>عدد أيام الغياب</th><th>الإجراء المتخذ</th><th>تاريخ الإجراء</th><th>توقيع الطالب</th><th>توقيع ولي الأمر</th><th>عدد درجات المواظبة المحسومة</th></tr></thead><tbody>'
            +LVL16.map(r=>{ const h = r.k>=0 ? acts.find(a=>a.k===r.k) : null, L = h ? C.LV[h.k] : null;
              return '<tr><td>'+r.label+'</td><td class="l">'+(L?esc(L.k+': '+L.v):'')+'</td><td>'+(h&&h.date?A(C.hijL(h.date)):'')+'</td><td></td><td></td><td>'+(h?A(h.n):'')+'</td></tr>'; }).join('')+'</tbody></table>';
        }
        return head+table+mgrRow(M,ctx,'e'); });
    }
    /* ---- ١٧: تعهد الالتزام بالحضور ---- */
    function printAtt(s){
      const exm = C.exMap(s), uds = (s.dates||[]).filter(d=>!exm[d]).slice().sort(), un = uds.length;
      return printDoc('تعهد الالتزام بالحضور', C.period, [], (ctx,M)=>
        '<div class="ln">أنا الطالب/الطالبة: '+dots(s.name,360)+'</div><div class="ln">بالصف: '+dots(s.cls,200)+'</div>'
        +'<div class="ln">أنني تغيبت عن الحضور للمدرسة بدون عذر لمدة '+dots(A(un),60)+' أيام، بتاريخ '+dots(uds.map(d=>A(C.hijL(d))).join('، ')+(uds.length?' هـ':''),300)+'</div>'
        +'<div class="ln">وأتعهد بالالتزام بالخطة التربوية والعلاجية المقدمة لتحسين الحضور، وعلى ذلك جرى التوقيع.</div>'
        +'<div class="sgs">'+partyBlock('الطالب/الطالبة',s.name)+partyBlock('ولي الأمر','')+mgrBlock(M,ctx,{stamp:'opt'})+'</div>');
    }

    /* ---- تسجيل التوقيع الورقي ---- */
    const soOf = id=>SO.get(id)||{rows:{},files:[]};
    function soTags(id, parties, keys){
      const d = soOf(id), rows = d.rows||{}; let tot = 0, ok = 0;
      keys.forEach(k=>parties.forEach(p=>{ tot++; if(rows[k] && rows[k][p]) ok++; }));
      const full = tot>0 && ok===tot;
      return '<span class="tag '+(full?'ok':(ok?'warn':''))+'">التواقيع: '+(full?'مكتملة':'ناقصة')+'</span>'+((d.files||[]).length?'<span class="tag">📎 '+A(d.files.length)+'</span>':'');
    }
    /* تنسيق صفوف النماذج داخل البطاقات: صف مستقل لكل نموذج (العنوان والحالة ثم الأزرار) */
    (function css(){ if(document.getElementById('safCss')) return; const st = document.createElement('style'); st.id = 'safCss';
      st.textContent = '.frow{border:1px solid var(--line,#d5ddd9);border-radius:10px;padding:8px 10px;margin:6px 0;background:#fff;display:flex;flex-direction:column;gap:6px}.frow .fh{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:space-between}.frow .fb{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.frow select{font:inherit;padding:6px 8px;border:1px solid var(--line,#ccd6d1);border-radius:8px;background:#fff;max-width:100%}details>summary.blu{color:#1a5fb4;font-weight:700}';
      document.head.appendChild(st); })();
    const frow = (title, tags, btns)=>'<div class="frow"><div class="fh"><b>'+title+'</b><span>'+tags+'</span></div><div class="fb">'+btns+'</div></div>';
    const LT = new Map();
    function ensureOv(){
      if(document.getElementById('soOv')) return;
      document.body.insertAdjacentHTML('beforeend',
        '<div class="ov" id="soOv" hidden><div class="box" role="dialog" aria-modal="true" aria-labelledby="soT" style="max-width:600px;max-height:90vh;overflow:auto"><strong id="soT"></strong><div class="muted" id="soSub"></div>'
        +'<div class="muted">يوقّع الأطراف ورقيًا بعد الطباعة، وهنا يُسجَّل من وقّع. رفع صورة الورقة الموقَّعة اختياري.</div><div id="soRows" style="display:flex;flex-direction:column;gap:8px"></div>'
        +'<label class="muted" for="soFile">رفع الورقة الموقَّعة (اختياري)</label><input type="file" id="soFile" accept="image/*,.pdf"><div class="muted">صورة أو PDF بحجم أقل من ٥٠٠ كيلوبايت.</div><div id="soFiles"></div>'
        +'<div class="row"><button type="button" class="btn solid" id="soSave">حفظ</button><button type="button" class="btn" id="soX">إغلاق</button></div></div></div>'
        +'<div class="ov" id="ivOv" hidden><div class="box" role="dialog" aria-modal="true" aria-labelledby="ivT" style="max-width:520px"><strong id="ivT">دعوة ولي الأمر</strong><div class="muted" id="ivSub"></div>'
        +'<label class="muted" for="ivD">تاريخ الحضور المطلوب</label><input type="date" id="ivD" class="ci" style="width:100%"><div class="muted" id="ivH"></div>'
        +'<label class="muted" for="ivP">هدف المقابلة</label><input type="text" id="ivP" class="ci" style="width:100%" maxlength="160">'
        +'<div class="row"><button type="button" class="btn solid" id="ivGo">طباعة الدعوة</button><button type="button" class="btn" id="ivX">إغلاق</button></div></div></div>'
        +'<div class="ov" id="inOv" hidden><div class="box" role="dialog" aria-modal="true" aria-labelledby="inT" style="max-width:600px;max-height:90vh;overflow:auto"><strong id="inT">محضر ضبط واقعة</strong><div class="muted" id="inSub"></div>'
        +'<label class="muted" for="inPl">مكان ضبط الواقعة</label><input type="text" id="inPl" class="ci" style="width:100%">'
        +'<label class="muted">نوع المشاهدة المضبوطة</label><div style="display:flex;flex-wrap:wrap;gap:12px"><label><input type="checkbox" id="inE1"> صور</label><label><input type="checkbox" id="inE2"> مقاطع فيديو</label><label><input type="checkbox" id="inE3"> محادثات</label></div>'
        +'<label class="muted" for="inE4">أخرى (اكتبها إن وُجدت)</label><input type="text" id="inE4" class="ci" style="width:100%">'
        +'<label class="muted">شهود الواقعة (حتى ٧)</label><div id="inWs" style="display:flex;flex-direction:column;gap:6px"></div><div class="row"><button type="button" class="btn" id="inAddW">+ شاهد</button></div>'
        +'<div class="row"><button type="button" class="btn solid" id="inSave">حفظ المحضر</button><button type="button" class="btn" id="inX">إغلاق</button></div></div></div>');
      document.getElementById('soX').onclick = ()=>document.getElementById('soOv').hidden = true;
      document.getElementById('inX').onclick = ()=>document.getElementById('inOv').hidden = true;
      document.getElementById('ivX').onclick = ()=>document.getElementById('ivOv').hidden = true;
      document.getElementById('ivD').addEventListener('input', ()=>{ const d = document.getElementById('ivD').value; document.getElementById('ivH').textContent = d ? C.dayOf(d)+' '+A(C.hijL(d))+' هـ' : ''; });
      document.getElementById('ivGo').onclick = ()=>{ const v = IV, d = document.getElementById('ivD').value, pu = document.getElementById('ivP').value.trim();
        if(!v) return; if(!d){ C.toast('اختر تاريخ الحضور'); return; } if(!pu){ C.toast('اكتب هدف المقابلة'); return; }
        document.getElementById('ivOv').hidden = true; printInvite(v, {day:C.dayOf(d), dateH:C.hijL(d), purpose:pu}); };
      document.getElementById('soSave').onclick = soSave;
      document.getElementById('inAddW').onclick = ()=>wRow({});
      document.getElementById('inSave').onclick = inSave;
      document.getElementById('inWs').addEventListener('click', e=>{ const b=e.target.closest('[data-rmw]'); if(b) b.parentElement.remove(); });
    }
    let IV = null;
    function openInvite(v){ ensureOv(); IV = v; document.getElementById('ivSub').textContent = v.name+' · '+v.className; document.getElementById('ivD').value = ''; document.getElementById('ivH').textContent = ''; document.getElementById('ivP').value = ''; document.getElementById('ivOv').hidden = false; }
    let SP = null;   // مواصفة نافذة التوقيع الحالية
    function specOf(form, ref){
      const v = ()=>C.vl().find(x=>x.id===ref);
      if(form==='pledge'||form==='notice'||form==='incident'){ const x=v(); if(!x) return null;
        const t = {pledge:'التعهد السلوكي',notice:'خطاب ولي الأمر',incident:'محضر ضبط الواقعة'}[form];
        return {id:form+'__'+ref, form, period:x.period, seat:x.seat, name:x.name, cls:x.className, title:t+' — '+x.name, sub:x.w,
          parties: form==='notice'?['parent']:(form==='incident'?['student','parent','witnesses']:['student','parent']), rows:[{key:'main',label:t}]}; }
      if(form==='v5'){ const [per,seat]=ref.split('|'); const vs=C.vl().filter(x=>x.seat===seat && x.period===per).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)); if(!vs.length) return null;
        return {id:'v5__'+per+'__'+seat, form, period:per, seat, name:vs[0].name, cls:vs[0].className, title:'رصد المشكلات السلوكية — '+vs[0].name, sub:C.PN[per], parties:['student','parent'], rows:vs.map(x=>({key:x.id,label:x.w}))}; }
      if(form==='abs15'||form==='abs16'||form==='att17'){ const s=C.absOf(ref); if(!s) return null;
        const t = {abs15:'إجراءات الغياب بعذر',abs16:'إجراءات الغياب بدون عذر',att17:'تعهد الالتزام بالحضور'}[form];
        return {id:form+'__'+C.period+'__'+s.seat, form, period:C.period, seat:s.seat, name:s.name, cls:s.cls, title:t+' — '+s.name, sub:C.PN[C.period], parties:['student','parent'],
          rows: form==='abs15' ? LVL15.map(r=>({key:r.key,label:r.label})) : (form==='abs16' ? LVL16.map(r=>({key:r.key,label:r.label})) : [{key:'main',label:t}])}; }
      return null;
    }
    function openSign(form, ref){
      const sp = specOf(form, ref); if(!sp) return; SP = sp; ensureOv();
      const d = soOf(sp.id), edit = C.canEdit();
      document.getElementById('soT').textContent = sp.title; document.getElementById('soSub').textContent = sp.cls+' · '+(sp.sub||'');
      document.getElementById('soRows').innerHTML = sp.rows.map(r=>'<div class="drow"><span class="dl" style="flex:1">'+esc(r.label)+'</span>'
        +sp.parties.map(p=>'<label style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-so="'+esc(r.key)+'|'+p+'"'+((d.rows||{})[r.key]&&(d.rows||{})[r.key][p]?' checked':'')+(edit?'':' disabled')+'> '+PLAB[p]+'</label>').join('')+'</div>').join('');
      document.getElementById('soFile').value = ''; document.getElementById('soFile').disabled = !edit; document.getElementById('soSave').hidden = !edit;
      soFilesDraw(d); document.getElementById('soOv').hidden = false;
    }
    function soFilesDraw(d){
      document.getElementById('soFiles').innerHTML = (d.files||[]).map(f=>'<div class="muted">📎 <a href="'+esc(f.url)+'" target="_blank" rel="noopener">'+esc(f.name||'ملف')+'</a></div>').join('');
    }
    async function soSave(){
      if(!SP || !C.canEdit()) return; const sp = SP, old = soOf(sp.id), now = Date.now(), rows = {};
      sp.rows.forEach(r=>{ const prev = (old.rows||{})[r.key]||{}, o = {};
        sp.parties.forEach(p=>{ const on = !!document.querySelector('[data-so="'+r.key+'|'+p+'"]:checked'); o[p] = on; if(on) o[p+'At'] = prev[p] ? (prev[p+'At']||now) : now; });
        rows[r.key] = o; });
      const f = document.getElementById('soFile').files[0], btn = document.getElementById('soSave');
      if(f && !OKF.test(f.type||'')){ C.toast('النوع غير مقبول: المسموح PDF أو صورة (JPG أو PNG)'); return; }
      if(f && f.size>=MAXF){ C.toast('حجم الملف أكبر من ٥٠٠ كيلوبايت. صغّره ثم أعد المحاولة'); return; }
      btn.disabled = true;
      try{
        const files = (old.files||[]).slice();
        if(f){ const safe = now+'_'+String(f.name||'file').replace(/[^\w.\-؀-ۿ]+/g,'_').slice(-60), path = 'studentAffairs/'+sid+'/signed/'+sp.id+'/'+safe, ref = g.firebase.storage().ref(path);
          await ref.put(f,{contentType:f.type}); files.push({path, url:await ref.getDownloadURL(), name:f.name||'', size:f.size, at:now}); }
        const rec = {form:sp.form, period:sp.period, seat:sp.seat, name:sp.name, className:sp.cls, rows, files, updatedAt:now, updatedBy:C.env.me.id};
        await soCol.doc(sp.id).set(rec); SO.set(sp.id, rec);
        document.getElementById('soFile').value = ''; soFilesDraw(rec); C.toast('سُجّلت التواقيع'); C.onChange();
      }catch(er){ C.fail(er); }
      btn.disabled = false;
    }

    /* ---- نافذة محضر ضبط الواقعة ---- */
    let INV = null;
    const wRow = w=>{ const ws = document.getElementById('inWs'); if(ws.children.length>=7){ C.toast('الحد الأقصى ٧ شهود'); return; }
      ws.insertAdjacentHTML('beforeend','<div class="row r1"><input type="text" class="ci inwn" placeholder="الاسم" value="'+esc(w.name||'')+'" style="flex:1;min-width:90px"><input type="text" class="ci inwj" placeholder="الوظيفة" value="'+esc(w.job||'')+'" style="flex:1;min-width:90px"><input type="text" class="ci inww" placeholder="العمل المسند إليه" value="'+esc(w.work||'')+'" style="flex:1;min-width:90px"><button type="button" class="btn" data-rmw="1">×</button></div>'); };
    function openIncident(vid){
      const v = C.vl().find(x=>x.id===vid); if(!v) return; INV = v; ensureOv();
      const x = INC.get(vid)||{}, ev = x.ev||{}, edit = C.canEdit();
      document.getElementById('inSub').textContent = v.name+' · '+v.className+' · '+v.w; document.getElementById('inPl').value = x.place||'';
      document.getElementById('inE1').checked = !!ev.photos; document.getElementById('inE2').checked = !!ev.videos; document.getElementById('inE3').checked = !!ev.chats; document.getElementById('inE4').value = ev.other||'';
      document.getElementById('inWs').innerHTML = ''; (x.witnesses||[]).forEach(wRow); if(!(x.witnesses||[]).length) wRow({});
      document.getElementById('inSave').hidden = !edit; document.getElementById('inAddW').hidden = !edit; document.getElementById('inOv').hidden = false;
    }
    async function inSave(){
      const v = INV; if(!v || !C.canEdit()) return; const place = document.getElementById('inPl').value.trim();
      if(!place){ C.toast('اكتب مكان ضبط الواقعة'); return; }
      const witnesses = [...document.querySelectorAll('#inWs .row')].map(r=>({name:r.querySelector('.inwn').value.trim(), job:r.querySelector('.inwj').value.trim(), work:r.querySelector('.inww').value.trim()})).filter(w=>w.name||w.job||w.work).slice(0,7);
      const rec = {period:v.period, seat:v.seat, name:v.name, className:v.className, stage:v.stage||'', vid:v.id, w:v.w, d:v.d, place,
        ev:{photos:document.getElementById('inE1').checked, videos:document.getElementById('inE2').checked, chats:document.getElementById('inE3').checked, other:document.getElementById('inE4').value.trim()},
        witnesses, updatedAt:Date.now(), updatedBy:C.env.me.id, updatedByName:C.env.me.name};
      document.getElementById('inSave').disabled = true;
      try{ const old = INC.get(v.id); await inCol.doc(v.id).set(Object.assign({createdAt:(old&&old.createdAt)||Date.now()}, rec)); INC.set(v.id, Object.assign({createdAt:(old&&old.createdAt)||Date.now()}, rec)); }
      catch(er){ C.fail(er); document.getElementById('inSave').disabled=false; return; }
      document.getElementById('inSave').disabled = false; document.getElementById('inOv').hidden = true; C.toast('حُفظ محضر ضبط الواقعة'); C.onChange();
    }

    /* ---- واجهات تُحقن في بطاقات الصفحة ---- */
    const bt = (act, lab, cls)=>'<button type="button" class="btn'+(cls?' '+cls:'')+'" data-saf="'+esc(act)+'">'+lab+'</button>';
    function rowForms(v){
      const edit = C.canEdit(), has = INC.has(v.id), lt = LT.get(v.id)||'n';
      return '<details class="fm"><summary class="muted blu">نماذج المخالفة</summary>'
        +frow('التعهد السلوكي', soTags('pledge__'+v.id,['student','parent'],['main']), bt('pl|'+v.id,'طباعة')+bt('so|pledge|'+v.id,'التواقيع'))
        +frow('خطاب ولي الأمر (سري)', soTags('notice__'+v.id,['parent'],['main']), '<select data-lt="'+esc(v.id)+'" aria-label="نوع الخطاب"><option value="n"'+(lt==='n'?' selected':'')+'>إشعار بمشكلة سلوكية</option><option value="i"'+(lt==='i'?' selected':'')+'>دعوة ولي الأمر</option></select>'+bt('pn|'+v.id,'طباعة')+bt('so|notice|'+v.id,'التواقيع'))
        +frow('محضر ضبط الواقعة (سري)', has?'<span class="tag ok">محفوظ</span>'+soTags('incident__'+v.id,['student','parent','witnesses'],['main']):'<span class="tag">لم يُعدّ</span>',
          ((edit||has)?bt('ine|'+v.id,has?(edit?'تعديل':'عرض'):'إعداد'):'')+(has?bt('inp|'+v.id,'طباعة')+bt('so|incident|'+v.id,'التواقيع'):''))
        +'</details>';
    }
    function v5Html(seat, per){
      const keys = C.vl().filter(v=>v.seat===seat && v.period===per).map(v=>v.id); if(!keys.length) return '';
      return frow('نموذج رصد المشكلات السلوكية', soTags('v5__'+per+'__'+seat,['student','parent'],keys), bt('v5|'+per+'|'+seat,'طباعة')+bt('so|v5|'+per+'|'+seat,'التواقيع'));
    }
    function hrBtn(h){ return h.st==='approved' ? '<div class="row">'+bt('hv|'+h.id,'معاينة النموذج')+bt('hr|'+h.id,'طباعة التقرير')+'</div>' : ''; }
    function absHtml(s){
      return '<div class="dp"><div class="t">نماذج الغياب</div>'
        +frow('إجراءات الغياب بدون عذر', soTags('abs16__'+C.period+'__'+s.seat,['student','parent'],LVL16.map(r=>r.key)), bt('a16|'+s.seat,'طباعة')+bt('so|abs16|'+s.seat,'التواقيع'))
        +frow('إجراءات الغياب بعذر', soTags('abs15__'+C.period+'__'+s.seat,['student','parent'],LVL15.map(r=>r.key)), bt('a15|'+s.seat,'طباعة')+bt('so|abs15|'+s.seat,'التواقيع'))
        +frow('تعهد الالتزام بالحضور', soTags('att17__'+C.period+'__'+s.seat,['student','parent'],['main']), bt('a17|'+s.seat,'طباعة')+bt('so|att17|'+s.seat,'التواقيع'))+'</div>';
    }

    /* ---- مستمع واحد للأزرار ---- */
    document.addEventListener('change', e=>{ const t = e.target.closest && e.target.closest('[data-lt]'); if(t) LT.set(t.dataset.lt, t.value); });
    document.addEventListener('click', e=>{
      const b = e.target.closest('[data-saf]'); if(!b) return; const p = b.dataset.saf.split('|'), vOf = id=>C.vl().find(x=>x.id===id);
      switch(p[0]){
        case 'pl': { const v=vOf(p[1]); if(v) printPledge(v); break; }
        case 'pn': { const v=vOf(p[1]); if(!v) break; const sel = b.closest('.frow') && b.closest('.frow').querySelector('[data-lt]'); if(sel && sel.value==='i') openInvite(v); else printNotice(v); break; }
        case 'inp': { const v=vOf(p[1]); if(v) printIncident(v); break; }
        case 'ine': openIncident(p[1]); break;
        case 'v5': printV5(p[2], p[1]); break;
        case 'hr': { const h=C.hr().find(x=>x.id===p[1]); if(h) printHigh(h); break; }
        case 'hv': { const h=C.hr().find(x=>x.id===p[1]); if(h) previewHigh(h); break; }
        case 'a16': { const s=C.absOf(p[1]); if(s) printAbs(s,false); break; }
        case 'a15': { const s=C.absOf(p[1]); if(s) printAbs(s,true); break; }
        case 'a17': { const s=C.absOf(p[1]); if(s) printAtt(s); break; }
        case 'so': openSign(p[1], p[1]==='v5' ? p[2]+'|'+p[3] : p[2]); break;
      }
    });
    return { load, mgr, hasMgr:async()=>{ const m=await mgr(); return !!(m.sig||m.stamp); }, printMn, printFormation, previewHigh, rowForms, v5Html, hrBtn, absHtml, printV5, printPledge, printNotice, printInvite, printIncident, printHigh, printAbs, printAtt, _so:()=>SO, _inc:()=>INC };
  }
  g.SAForms = { make, HCK };
})(window);
