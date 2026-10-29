// إصدار: 2026-10-20.1 · الاختبار
/* نماذج الموظفين الموقَّعة (وكيل الشؤون المدرسية): تنبيه خطي، تعهد خطي (١)، تعهد خطي (٢)، لفت نظر.
   قالب واحد للتعهدين ولفت النظر يتغيّر عنوانه ونصه فقط، وبالترويسة الموحَّدة (form-header.js).
   الاستعمال:  StaffDocs.make(kind, {empName, minutes, dateText}) → {kind,title,text,needSign}
               StaffDocs.html(doc, ctx)  → محتوى النموذج (HTML) للعرض أو الطباعة، ويتضمن التوقيع إن وُجد
               StaffDocs.print(doc, ctx) → يفتح نافذة الطباعة بالترويسة الموحَّدة
   وكذلك قرار الحسم (نموذج ١٩) وخطاب طلب الصيانة (نموذج ٢٧):  StaffDocs.printDecision(dec, ctx) / StaffDocs.printMaint(m, ctx)  */
(function(g){
  'use strict';
  const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const AR = n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
  const KINDS = {
    warn:      { title:'تنبيه خطي',      needSign:false },
    pledge1:   { title:'تعهد خطي (١)',   needSign:true },
    pledge2:   { title:'تعهد خطي (٢)',   needSign:true },
    attention: { title:'لفت نظر',        needSign:true }
  };
  const LEVEL_KIND = { 'تنبيه خطي':'warn', 'تعهد خطي (١)':'pledge1', 'تعهد خطي (٢)':'pledge2', 'لفت نظر':'attention' };

  /* نص الفقرة بحسب النوع. التعهدان بصيغة «أتعهد…»، ولفت النظر بصيغة «نلفت نظركم…» */
  function paragraph(kind, name, minutes){
    const m = AR(minutes||0);
    if(kind==='warn') return 'المكرم / '+name+' وفقه الله.\nالسلام عليكم ورحمة الله وبركاته، وبعد:\nنظرًا لتأخركم وبلوغ مجموع دقائق التأخر والخروج المبكر ('+m+' دقيقة)، وجب تنبيهكم خطيًا. ولكم تحياتي.';
    if(kind==='pledge1') return 'أتعهد أنا / '+name+' بعدم التأخر عن الدوام وعن الحصص، وإذا تكرر ذلك أتحمل ما يترتب عليه من إجراءات نظامية.';
    if(kind==='pledge2') return 'أتعهد أنا / '+name+' للمرة الثانية بعدم التأخر عن الدوام وعن الحصص، وإذا تكرر ذلك أتحمل ما يترتب عليه من إجراءات نظامية.';
    return 'المكرم / '+name+' وفقه الله.\nنلفت نظركم لتكرار تأخركم، علمًا بأنه سبق تنبيهكم وأخذ التعهد عليكم، مع رفع الغياب للحسم.';
  }
  function make(kind, o){
    const k = KINDS[kind]; if(!k) throw new Error('نوع غير معروف');
    return { kind, title:k.title, needSign:k.needSign, text:paragraph(kind, o.empName, o.minutes) };
  }
  const para = t=>String(t||'').split('\n').map(x=>'<p style="margin:6px 0;line-height:2">'+esc(x)+'</p>').join('');
  const CSS = '.sd{font:15px Tahoma,Arial,sans-serif;color:#111}.sd table{border-collapse:collapse;width:100%;margin:8px 0}.sd th,.sd td{border:1px solid #888;padding:6px 8px;text-align:right;font-size:14px}.sd th{background:#eef2f1}'
    +'.sd .sg{display:flex;justify-content:space-between;gap:20px;margin-top:26px;align-items:flex-end}.sd .sg>div{flex:1;text-align:center;min-height:90px;font-weight:700}.sd .sg img{max-height:80px;max-width:220px;display:block;margin:4px auto}.sd .mut{color:#555;font-size:13px}';
  /* محتوى النموذج. doc: {kind,title,text,empName,empRole,minutes,dateText,status,signature,signedAt} */
  function html(d, c){
    c = c||{};
    const k = KINDS[d.kind]||{};
    const mins = d.minutes!=null ? '<tr><th>مجموع الدقائق</th><td>'+AR(d.minutes)+' دقيقة</td></tr>' : '';
    let sig;
    if(k.needSign){
      sig = '<div>الموظف<br>'+esc(d.empName||'')+'<br>'+(d.signature?'<img src="'+d.signature+'" alt="">':'<span class="mut">لم يوقّع بعد</span>')+'</div>'
        + '<div>قائد المدرسة<br>'+esc(c.principal||'')+'</div>';
    }else{
      sig = '<div>الموظف<br>'+esc(d.empName||'')+'<br>'+(d.status==='signed'?'<span class="mut">أكّد الاطلاع</span>':'<span class="mut">لم يؤكد الاطلاع بعد</span>')+'</div>'
        + '<div>قائد المدرسة<br>'+esc(c.principal||'')+'</div>';
    }
    return '<div class="sd"><style>'+CSS+'</style><table><tr><th>الاسم</th><td>'+esc(d.empName||'')+'</td><th>العمل الحالي</th><td>'+esc(d.empRole||'')+'</td></tr>'+mins
      +'<tr><th>التاريخ</th><td colspan="3">'+esc(d.dateText||'')+'</td></tr></table>'+para(d.text)+'<div class="sg">'+sig+'</div></div>';
  }
  function openWin(htmlStr){
    const w = g.open('', '_blank'); if(!w){ g.alert && g.alert('اسمح بالنوافذ المنبثقة للطباعة'); return; }
    w.document.open(); w.document.write(htmlStr); w.document.close();
  }
  function print(d, c){
    openWin(g.FormHdr.doc({ title:d.title, formTitle:d.title, ctx:c||{}, body:html(d, c), margin:'10mm' }));
  }

  /* ---- قرار حسم مجموع ساعات التأخر والخروج المبكر (نموذج ١٩) ---- */
  function decisionBody(dec, c){
    const hist = (dec.hist||[]);
    const total = hist.length ? hist[hist.length-1].min : 0;
    const hrs = AR(Math.floor(total/60))+' ساعة'+(total%60?' و'+AR(total%60)+' دقيقة':'');
    const rows = hist.map(x=>'<tr><td>'+esc(x.k)+'</td><td>'+AR(x.min)+'</td><td>'+esc(x.date||'')+'</td></tr>').join('');
    return '<div class="sd"><style>'+CSS+'</style>'
      +'<table><tr><th>الاسم</th><td>'+esc(dec.empName||'')+'</td><th>العمل الحالي</th><td>'+esc(dec.empRole||'')+'</td></tr></table>'
      +'<p style="line-height:2.1">إن مدير المدرسة '+esc(c.principal||'………')+'<br>بناءً على صلاحياته، وبناءً على المادة (٢١) من نظام الخدمة المدنية، وبناءً على موافقة معالي الوزير على إعطاء بعض الصلاحيات لمديري المدارس بالقرار رقم ١/١١٣٩ وتاريخ ١٤٣١/٢/١٧هـ، وبلوغ ساعات التأخر عن العمل والخروج المبكر من العمل ('+hrs+')، وحيث إن عذره غير مقبول، وبمقتضى النظام.</p>'
      +'<p><b>يقرر ما يلي:</b></p>'
      +'<p style="line-height:2.1">(١) حسم مدة الغياب الموضحة بعاليه وعددها ('+(dec.days!=null&&dec.days!==''?AR(dec.days):'…')+') يومًا من راتبه.<br>(٢) على إدارة شؤون الموظفين (تنفيذ الأنظمة) تنفيذ إجراء الحسم واستبعاده من خدماته، وأصل القرار لملفه بالإدارة مع الأساس.</p>'
      +'<p>والله الموفق.</p>'
      +(rows?'<p><b>الأساس: سجل الإجراءات السابقة في ملف الموظف</b></p><table><thead><tr><th>الإجراء</th><th>الدقائق</th><th>التاريخ</th></tr></thead><tbody>'+rows+'</tbody></table>':'')
      +'<div class="sg"><div>الرئيس المباشر<br>'+esc(c.principal||'')+'<br><span class="mut">الختم والتوقيع</span></div></div>'
      +'<p class="mut">صورة للموظفين لمتابعة تنفيذ الحسم (تنفيذ الأنظمة) — صورة لمكتب التعليم — صورة لملفه بالمدرسة.</p></div>';
  }
  function printDecision(dec, c){
    openWin(g.FormHdr.doc({ title:'قرار حسم', formTitle:'قرار حسم مجموع ساعات تأخر وخروج مبكر', ctx:c||{}, body:decisionBody(dec, c||{}), margin:'10mm' }));
  }

  /* ---- خطاب طلب صيانة (نموذج ٢٧) ---- */
  function printMaint(m, c){
    c = c||{};
    const body = '<div class="sd"><style>'+CSS+'</style>'
      +'<p>المكرم / مدير الإدارة المختصة بالصيانة وفقه الله</p><p>السلام عليكم ورحمة الله وبركاته، وبعد:</p>'
      +'<p style="line-height:2">نأمل تكليف فريق الصيانة بعمل ما يلي:</p>'
      +'<table><tr><th>الموقع</th><td>'+esc(m.loc||'')+'</td></tr><tr><th>وصف العطل</th><td>'+esc(m.d||'')+'</td></tr><tr><th>نوع الطلب</th><td>'+(m.pri==='عاجلة'?'عاجل':'عادي')+'</td></tr>'
      +'<tr><th>تاريخ الرفع</th><td>'+esc(m.dateText||'')+'</td></tr></table>'
      +'<p>ولكم تحياتي.</p><div class="sg"><div>وكيل الشؤون المدرسية<br>'+esc(m.byName||'')+'</div><div>قائد المدرسة<br>'+esc(c.principal||'')+'<br><span class="mut">الاعتماد</span></div></div></div>';
    openWin(g.FormHdr.doc({ title:'طلب صيانة', formTitle:'طلب صيانة', ctx:c, body, margin:'10mm' }));
  }

  /* لوحة توقيع باليد (إصبع/قلم) — تُعيد وعدًا بصورة PNG أو null عند الإلغاء. تُرسم داخل عنصر host */
  function signPad(host, onSave, onCancel){
    host.innerHTML = '<div style="text-align:center"><canvas id="sdCv" width="520" height="220" style="width:100%;max-width:520px;touch-action:none;background:#fff;border:1.5px dashed #888;border-radius:10px"></canvas><br>'
      +'<button type="button" class="dh-link" id="sdClr" style="margin:8px 4px">مسح</button><button type="button" class="dh-link" id="sdOk" style="margin:8px 4px;background:#0f766e;color:#fff">حفظ التوقيع</button><button type="button" class="dh-link" id="sdNo" style="margin:8px 4px">إلغاء</button></div>';
    const cv = host.querySelector('#sdCv'), cx = cv.getContext('2d'); cx.lineWidth=2.4; cx.lineCap='round'; cx.strokeStyle='#15242b';
    let dr=false, has=false;
    const pos = e=>{ const r=cv.getBoundingClientRect(); return { x:(e.clientX-r.left)*(cv.width/r.width), y:(e.clientY-r.top)*(cv.height/r.height) }; };
    cv.addEventListener('pointerdown', e=>{ dr=true; has=true; const p=pos(e); cx.beginPath(); cx.moveTo(p.x,p.y); e.preventDefault(); });
    cv.addEventListener('pointermove', e=>{ if(!dr) return; const p=pos(e); cx.lineTo(p.x,p.y); cx.stroke(); e.preventDefault(); });
    g.addEventListener('pointerup', ()=>{ dr=false; });
    host.querySelector('#sdClr').onclick = ()=>{ cx.clearRect(0,0,cv.width,cv.height); has=false; };
    host.querySelector('#sdNo').onclick = ()=>{ host.innerHTML=''; if(onCancel) onCancel(); };
    host.querySelector('#sdOk').onclick = ()=>{ if(!has){ if(g.alert) g.alert('ارسم توقيعك أولًا'); return; } onSave(cv.toDataURL('image/png')); };
  }

  g.StaffDocs = { KINDS, LEVEL_KIND, make, html, print, printDecision, printMaint, signPad, paragraph };
})(window);
