// إصدار: 2026-10-29.1 · الاختبار
/* =====================================================================
   approvals.js — «التقارير والاعتمادات» لمدير المدرسة (2026-10-29.1)
   مكان واحد لكل ما ينتظر اعتماد المدير: يعاينه، ثم يعتمده أو يرفضه (نهائي ويصل مرسله إشعار) أو يعيده للتعديل.
   الترتيب: الجديد أعلى، ثم المعتمد، ثم المُعاد للتعديل، ثم المرفوض.

   لإضافة اعتماد جديد مستقبلًا: أضف عنصرًا واحدًا إلى SOURCES أدناه (key, label, load, act) ولا تغيّر شيئًا آخر.
   كل عنصر مُحمَّل يعيد: {src, id, title, sub, by, byId, at, st:'new'|'ok'|'no'|'ret', note, rows:[[عنوان، قيمة]], go?:{href,label}, input?:{id,label,value}}
   والدالة act(item, action, note, input) تكتب القرار في مصدر البيانات نفسه (action: ok|no|ret).
   ما لا يُعتمد إلا بختم المدير أو رقم قرار (خطاب التشكيل، محضر اللجنة، الخطط العامة) يظهر هنا بزر «فتح للاعتماد» إلى مكانه.
   ===================================================================== */
(function(g){
  'use strict';
  const A = n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
  const esc = s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dshow = ms=>{ if(!ms) return ''; try{ return A(new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'numeric',year:'numeric'}).format(new Date(ms))); }catch(e){ return ''; } };
  const todayKey = ()=>{ const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const startOfTomorrow = ()=>{ const d = new Date(); d.setHours(0,0,0,0); return d.getTime()+86400000; };
  const KEYLAB = { queue:'الطابور', wait:'الانتظار', cls:'حضور الحصص', sup:'الإشراف', duty:'المناوبة', early:'الانصراف مبكرًا دون استئذان', prep:'تحضير الدرس',
    vis:'الزيارات بين المعلمين', act:'حضور الأنشطة والبرامج', cv:'الزيارات الصفية', rec:'سجل الأعمال', cur:'إكمال المنهج الدراسي', an:'تحليل الدرجات' };
  const SP = {first:'الفصل الدراسي الأول', second:'الفصل الدراسي الثاني'};
  const SECT = [['new','بانتظار قرارك'],['ok','معتمدة'],['ret','أُعيدت للتعديل'],['no','مرفوضة']];
  const TAG = {new:['بانتظار القرار','warn'], ok:['معتمد','ok'], ret:['أُعيد للتعديل','bad'], no:['مرفوض','bad']};

  function make(env){
    const db = env.db, sid = env.sid, period = env.period, me = env.me;
    const sa = db.collection('studentAffairs').doc(sid), sc = db.collection('schoolAffairs').doc(sid);
    const docs = q=>q.get().then(s=>s.docs.map(d=>Object.assign({id:d.id},d.data()))).catch(e=>{ console.warn('approvals', e); return []; });
    const who = ()=>({by:me.id, byName:me.name||me.username||'', at:Date.now()});
    const dec = (action, note)=>{ const t = Date.now(); return action==='ok' ? {approvedAt:t, approvedBy:me.id, approvedByName:me.name||''} : {decidedAt:t, decidedBy:me.id, decidedByName:me.name||'', decisionNote:(note||'').trim()}; };

    const SOURCES = [
      /* ---- قرارات الغياب (وكيل الشؤون الطلابية) ---- */
      { key:'absence', label:'قرار غياب',
        async load(){
          const L = await docs(sa.collection('absence').where('period','==',period));
          return L.filter(x=>x.moved && x.decision).map(x=>{ const d = x.decision, last = (x.actions||[]).slice(-1)[0] || {};
            return {src:'absence', id:x.id, title:'قرار غياب: '+(x.name||''), sub:(x.className||'')+' · أُحيل بتاريخ '+(d.date||''), by:last.byName||'وكيل الشؤون الطلابية', byId:last.by||'', at:d.at||x.updatedAt||0,
              st:({wait:'new',ok:'ok',no:'no',ret:'ret'})[d.st]||'new', note:d.decisionNote||'',
              rows:[['الطالب',x.name],['الصف',x.className],['إجراءات سابقة',(x.actions||[]).map(a=>a.k).join('، ')||'—'],['الإجراء المطلوب','مخاطبة الجهات المختصة بعد غياب عشرة أيام بدون عذر']]}; });
        },
        async act(it, action, note){
          const ref = sa.collection('absence').doc(it.id), s = await ref.get(), d = (s.data()||{}).decision || {};
          await ref.update({decision:Object.assign({}, d, {st:({ok:'ok',no:'no',ret:'ret'})[action]}, action==='ok'?{approvedBy:me.id, approvedByName:me.name, approvedAt:Date.now()}:dec(action,note)), updatedAt:Date.now()});
        } },

      /* ---- تقارير الحالات عالية الخطورة ---- */
      { key:'highRisk', label:'تقرير حالة عالية الخطورة',
        async load(){
          const L = await docs(sa.collection('highRisk').where('period','==',period));
          return L.map(x=>({src:'highRisk', id:x.id, title:'حالة عالية الخطورة: '+(x.name||''), sub:(x.className||'')+(x.type?' · '+x.type:''), by:x.createdByName||'', byId:x.createdBy||'', at:x.resubmittedAt||x.createdAt||0,
            st:({pending:'new',approved:'ok',returned:'ret',rejected:'no'})[x.st]||'new', note:x.returnNote||x.decisionNote||'',
            rows:[['الطالب',x.name],['الصف',x.className],['نوع الحالة',x.type],['وصف الحالة',x.desc],['الراصد',x.observer||x.createdByName],['عدد الإجراءات المتخذة',A((x.checks||[]).length)]]}));
        },
        async act(it, action, note){
          const ref = sa.collection('highRisk').doc(it.id), t = Date.now();
          if(action==='ok') await ref.update({st:'approved', approvedAt:t, approvedBy:me.id, approvedByName:me.name});
          else if(action==='ret') await ref.update({st:'returned', returnedAt:t, returnedBy:me.id, returnedByName:me.name, returnNote:(note||'').trim(), approvedAt:null, approvedBy:null, approvedByName:null});
          else await ref.update({st:'rejected', rejectedAt:t, rejectedBy:me.id, rejectedByName:me.name, decisionNote:(note||'').trim()});
        } },

      /* ---- خطاب تشكيل لجنة التوجيه (رقم القرار والختم: من صفحة الوكيل) ---- */
      { key:'formation', label:'خطاب تشكيل لجنة التوجيه والإرشاد',
        async load(){
          const s = await sa.collection('formation').doc(period).get().catch(()=>null); if(!s || !s.exists) return [];
          const x = s.data(); if(x.st!=='sent' && x.st!=='approved') return [];
          return [{src:'formation', id:s.id, title:'قرار تشكيل لجنة التوجيه والإرشاد', sub:SP[period], by:x.sentByName||x.createdByName||'وكيل الشؤون الطلابية', byId:x.sentBy||x.createdBy||'', at:x.sentAt||x.createdAt||0,
            st:x.st==='approved'?'ok':'new', note:'', rows:[['رئيس اللجنة',(x.pres||{}).name||''],['عدد الأعضاء',A((x.memberIds||[]).length)],['رقم القرار',x.decNo||'—']],
            go:x.st==='sent' ? {href:'student-affairs.html#v', label:'فتح للاعتماد (رقم القرار والختم)'} : null}];
        } },

      /* ---- محاضر لجنة التوجيه (الختم: من صفحة الوكيل) ---- */
      { key:'minutes', label:'محضر لجنة التوجيه والإرشاد',
        async load(){
          const L = await docs(sa.collection('minutes').where('period','==',period));
          return L.filter(x=>x.st==='agentOk' || x.st==='approved').map(x=>{ const c = x.content || {};
            return {src:'minutes', id:x.id, title:'محضر لجنة التوجيه: '+(c.caseText||''), sub:((c.dayName||'')+' '+(c.dateH||'')).trim(), by:x.agentApprovedByName||'وكيل الشؤون الطلابية', byId:x.agentApprovedBy||'', at:x.agentApprovedAt||x.createdAt||0,
              st:x.st==='approved'?'ok':'new', note:'', rows:[['الحالة',c.caseText],['التوصيات',(c.recs||[]).join('؛ ')],['الحاضرون',(c.members||[]).filter(m=>m.present).map(m=>m.name).join('، ')]],
              go:x.st==='agentOk' ? {href:'student-affairs.html#v', label:'فتح للاعتماد (الختم والتوقيع)'} : null}; });
        } },

      /* ---- قرارات الحسم (وكيل الشؤون المدرسية) ---- */
      { key:'deduct', label:'قرار حسم',
        async load(){
          const L = await docs(sc.collection('decisions'));
          return L.filter(x=>!x.period || x.period===period).map(x=>({src:'deduct', id:x.id, title:'قرار حسم: '+(x.empName||''), sub:x.why||'', by:x.createdByName||'وكيل الشؤون المدرسية', byId:x.createdBy||'', at:x.createdAt||0,
            st:({wait:'new',ok:'ok',sent:'ok',no:'no',ret:'ret'})[x.st]||'new', note:x.decisionNote||'',
            rows:[['الموظف',x.empName],['الوظيفة',x.empRole],['السبب',x.why],['أيام الحسم',x.days===''||x.days==null?'يحدده المدير':A(x.days)]],
            input:x.st==='wait'?{label:'عدد أيام الحسم', value:x.days==null?'':x.days}:null}));
        },
        async act(it, action, note, input){
          const ref = sc.collection('decisions').doc(it.id), t = Date.now();
          if(action==='ok'){ const days = Number(String(input==null?'':input).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))); if(isNaN(days)||days<0) throw new Error('أدخل عدد أيام الحسم'); await ref.update({st:'ok', days, approvedAt:t, approvedBy:me.id}); }
          else await ref.update(Object.assign({st:action}, dec(action,note)));
        } },

      /* ---- خطابات الصيانة ---- */
      { key:'maint', label:'خطاب طلب صيانة',
        async load(){
          const L = await docs(sc.collection('maint'));
          return L.filter(x=>x.l && (!x.period || x.period===period)).map(x=>({src:'maint', id:x.id, title:'خطاب طلب صيانة: '+(x.loc||''), sub:x.pri||'', by:x.createdByName||'وكيل الشؤون المدرسية', byId:x.createdBy||'', at:x.lAt||x.createdAt||0,
            st:({wait:'new',ok:'ok',no:'no',ret:'ret'})[x.l]||'new', note:x.decisionNote||'', rows:[['الموقع',x.loc],['وصف العطل',x.d],['الأولوية',x.pri]]}));
        },
        async act(it, action, note){
          await sc.collection('maint').doc(it.id).update(Object.assign({l:action, lAt:Date.now(), lBy:me.id}, action==='ok'?{}:{decisionNote:(note||'').trim()}));
        } },

      /* ---- المساءلات التعليمية ---- */
      { key:'acc', label:'مساءلة تعليمية',
        async load(){
          const L = await docs(db.collection('eduLog').doc(sid).collection('items').where('type','==','acc'));
          return L.filter(x=>!x.period || x.period===period).map(x=>({src:'acc', id:x.id, title:'مساءلة تعليمية: '+(x.empName||''), sub:KEYLAB[x.key]||x.key||'', by:x.createdByName||'وكيل الشؤون التعليمية', byId:x.createdBy||'', at:x.createdAt||0,
            st:({wait:'new',sent:'ok',no:'no',ret:'ret'})[x.status]||'new', note:x.decisionNote||'',
            rows:[['المعلم',x.empName],['البند',KEYLAB[x.key]||x.key],['التاريخ',x.dateText],['التفاصيل',x.detail],['ملاحظة',x.extra]]}));
        },
        async act(it, action, note){
          const ref = db.collection('eduLog').doc(sid).collection('items').doc(it.id);
          if(action==='ok'){ const s = await ref.get(), a = s.data()||{}; await ref.update({status:'sent', approvedAt:Date.now(), approvedBy:me.id, visibleFrom: a.dateKey===todayKey() ? startOfTomorrow() : Date.now()}); }
          else await ref.update(Object.assign({status:action}, dec(action,note)));
        } },

      /* ---- تقرير الحالات الصحية: عند الاعتماد يصدر تعميمًا للتوقيع ---- */
      { key:'health', label:'تقرير الحالات الصحية',
        async load(){
          const L = await docs(db.collection('healthReports').doc(sid).collection('items').where('period','==',period));
          return L.map(x=>({src:'health', id:x.id, title:'حصر الحالات الصحية المزمنة', sub:A(x.count||(x.rows||[]).length)+' طالبًا · '+SP[x.period||period], by:x.createdByName||'الموجه الطلابي', byId:x.createdBy||'', at:x.createdAt||0,
            st:({pending:'new',approved:'ok',rejected:'no',returned:'ret'})[x.st]||'new', note:x.note||'',
            table:{head:['الاسم','رقم الهوية','الصف','الحالة الصحية','إجراءات المتابعة','جوال ولي الأمر'], rows:(x.rows||[]).map(r=>[r.name,r.id,r.cls,r.cond,r.proc,r.phone])}, raw:x}));
        },
        async act(it, action, note){
          const ref = db.collection('healthReports').doc(sid).collection('items').doc(it.id), t = Date.now();
          if(action!=='ok'){ await ref.update({st:action==='no'?'rejected':'returned', note:(note||'').trim(), decidedAt:t, decidedBy:me.id, decidedByName:me.name}); return; }
          const x = it.raw, root = db.collection('circulars').doc(sid), cref = root.collection('items').doc();
          let ids = [];
          try{ const us = await g.UsersAPI.listSnap(sid); ids = us.docs.filter(d=>{ const u = d.data(), c = (u.schools||{})[sid]; return !u.migratedTo && u.active!==false && (u.role==='schoolAdmin' ? (u.adminSchools||[]).includes(sid) : (c && c.active!==false)); }).map(d=>d.id); }catch(e){ console.warn(e); }
          if(!ids.length) throw new Error('تعذّر تحديد موظفي المدرسة لإرسال التعميم');
          await db.runTransaction(async tx=>{
            const sn = await tx.get(root), next = sn.exists ? (sn.data().nextNumber||1) : 1;
            tx.set(root, {nextNumber:next+1}, {merge:true});
            tx.set(cref, {number:next, title:'حصر الحالات الصحية المزمنة للطلاب', mandatory:true, recipients:ids, pageCount:0, type:'healthCases', period,
              health:{school:(env.school&&env.school.name)||'', termText:SP[period]||'', rows:(x.rows||[]).map(r=>({name:r.name, cond:r.cond, proc:r.proc}))},
              createdBy:me.id, createdByName:me.name||'', createdAt:t, approvedAt:t, approvedByName:me.name||''});
          });
          await ref.update({st:'approved', approvedAt:t, approvedBy:me.id, approvedByName:me.name, circId:cref.id});
        } },

      /* ---- تكليفات الأندية (منصة النشاط) ---- */
      { key:'asg', label:'تكليف نادٍ',
        async load(){
          const L = await docs(db.collection('actAssignments').where('schoolId','==',sid).where('period','==',period));
          return L.map(x=>({src:'asg', id:x.id, title:'تكليف نادٍ: '+(x.clubName||''), sub:x.teacherName||'', by:x.createdByName||'رائد النشاط', byId:x.createdBy||'', at:x.ts||x.createdAt||0,
            st:({pending:'new',approved:'ok',cancelled:'no',returned:'ret'})[x.status]||'new', note:x.returnNote||'',
            rows:[['المعلم',x.teacherName],['النادي',x.clubName]].concat((x.programs||[]).map((p,i)=>['البرنامج '+A(i+1), p.name+(p.endDate?' — حتى '+p.endDate:'')]))}));
        },
        async act(it, action, note){
          const ref = db.collection('actAssignments').doc(it.id), t = Date.now();
          if(action==='ok') await ref.update({status:'approved', approvedBy:me.id, approvedByName:me.name, approvedAt:t, updatedAt:t});
          else await ref.update({status:action==='no'?'cancelled':'returned', returnNote:(note||'').trim(), updatedAt:t});
        } },

      /* ---- الخطط المُقدَّمة للاعتماد (الختم: من منصة النشاط) ---- */
      { key:'plans', label:'خطة نشاط مُقدَّمة للاعتماد',
        async load(){
          const out = [];
          const clubs = await docs(db.collection('activityClubs').where('schoolId','==',sid).where('period','==',period));
          clubs.filter(c=>c.planState==='submitted').forEach(c=>out.push({src:'plans', id:c.id, title:'خطة نادي '+(c.name||''), sub:'خطة نادٍ', by:c.planSubmittedByName||'رائد النشاط', byId:'', at:c.planSubmittedAt||0, st:'new', note:'',
            rows:[['النادي',c.name]], go:{href:'activity.html#plan', label:'فتح للاعتماد (الختم والتوقيع)'}}));
          const gen = await docs(db.collection('activityConfig').where('schoolId','==',sid).where('period','==',period));
          gen.filter(c=>c.generalState==='submitted').forEach(c=>out.push({src:'plans', id:c.id, title:'الخطة العامة للأنشطة اللاصفية', sub:SP[period], by:'رائد النشاط', byId:'', at:c.generalSubmittedAt||0, st:'new', note:'', rows:[['الخطة','الخطة العامة']], go:{href:'activity.html#plan', label:'فتح للاعتماد (الختم والتوقيع)'}}));
          return out;
        } }
    ];

    async function loadAll(){
      const r = await Promise.all(SOURCES.map(s=>s.load().catch(e=>{ console.warn('approvals', s.key, e); return []; })));
      return r.flat();
    }
    const srcOf = k=>SOURCES.find(s=>s.key===k);
    /* إشعار المُرسِل برفض أو إعادة (ملاحظة واردة في «التقارير والاعتمادات» لديه) — يُنفَّذ بأفضل جهد */
    async function notify(it, action, note){
      if(!it.byId || it.byId===me.id) return;
      try{
        await db.collection('notes').add({ schoolId:sid, period, fromUserId:me.id, fromName:me.name||'', fromRole:'schoolAdmin',
          recipients:[it.byId], recipientsInfo:[{userId:it.byId, name:it.by||'', role:''}], scope:'report', studentSeat:'', studentName:'', classCode:'', className:'',
          text:(action==='no'?'رفض مدير المدرسة: ':'أعاد مدير المدرسة للتعديل: ')+it.title+(note?'\nالسبب: '+note:''), referralReason:'قرار المدير',
          createdAt:Date.now(), replies:[], readAt:{}, closed:false });
      }catch(e){ console.warn('notify', e); }
    }
    async function decide(it, action, note, input){
      const s = srcOf(it.src); if(!s || !s.act) throw new Error('لا يُعتمد هذا النوع من هنا');
      await s.act(it, action, note, input);
      if(action!=='ok') await notify(it, action, note);
    }
    return { SOURCES, loadAll, decide };
  }

  /* ===== الواجهة ===== */
  function cardHtml(it, open){
    const t = TAG[it.st] || TAG.new;
    const rows = (it.rows||[]).filter(r=>r[1]!=null && String(r[1])!=='').map(r=>'<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px dashed var(--line)"><span style="color:var(--muted);min-width:96px">'+esc(r[0])+'</span><span style="flex:1">'+esc(r[1])+'</span></div>').join('');
    const tbl = it.table ? '<div style="overflow:auto;margin-top:8px"><table style="border-collapse:collapse;width:100%;font-size:12.5px"><thead><tr><th style="border:1px solid var(--line);padding:4px">م</th>'+it.table.head.map(h=>'<th style="border:1px solid var(--line);padding:4px;background:var(--surface-2)">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'
      +it.table.rows.map((r,i)=>'<tr><td style="border:1px solid var(--line);padding:4px">'+A(i+1)+'</td>'+r.map(c=>'<td style="border:1px solid var(--line);padding:4px">'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>' : '';
    let act = '';
    if(it.st==='new'){
      if(it.go) act = '<a class="btn" href="'+esc(it.go.href)+'">'+esc(it.go.label)+'</a>';
      else act = (it.input?'<div class="field" style="margin:6px 0"><label>'+esc(it.input.label)+'</label><input type="text" inputmode="numeric" data-ain="'+esc(it.src+'|'+it.id)+'" value="'+esc(it.input.value)+'" style="max-width:140px"></div>':'')
        +'<div class="field" style="margin:6px 0"><label>ملاحظة (إلزامية عند الرفض أو الإعادة)</label><input type="text" data-anote="'+esc(it.src+'|'+it.id)+'" placeholder="سبب الرفض أو ما يلزم تعديله"></div>'
        +'<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-aok="'+esc(it.src+'|'+it.id)+'">اعتماد</button><button class="btn secondary" data-aret="'+esc(it.src+'|'+it.id)+'">إعادة للتعديل</button><button class="btn secondary" data-ano="'+esc(it.src+'|'+it.id)+'" style="color:#b3261e">رفض نهائي</button></div>';
    }
    return '<div class="card" data-ak="'+esc(it.src+'|'+it.id)+'" style="margin-bottom:10px">'
      +'<div data-atg="'+esc(it.src+'|'+it.id)+'" style="display:flex;align-items:center;gap:8px;cursor:pointer"><div style="flex:1"><div style="font-weight:800">'+esc(it.title)+'</div><div style="color:var(--muted);font-size:12.5px">'+esc(it.sub||'')+(it.by?' · من '+esc(it.by):'')+(it.at?' · '+dshow(it.at)+' هـ':'')+'</div></div>'
      +'<span class="pill '+(t[1]==='ok'?'ok':(t[1]==='warn'?'warn':''))+'" style="'+(t[1]==='bad'?'background:#fde4e4;color:#b3261e':'')+'">'+t[0]+'</span><span style="color:var(--muted)">'+(open?'▴':'▾')+'</span></div>'
      +(open ? '<div style="margin-top:8px">'+rows+tbl+(it.note?'<div style="margin-top:6px;color:#b3261e">ملاحظة المدير: '+esc(it.note)+'</div>':'')+act+'</div>' : '')
      +'</div>';
  }

  /* يرسم القائمة داخل العنصر box */
  async function mount(box, env){
    const M = make(env); let ITEMS = [], OPEN = new Set(), BUSY = false;
    box.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    function draw(){
      const n = ITEMS.filter(i=>i.st==='new').length;
      let h = '<div class="card" style="margin-bottom:12px"><h3 style="margin:0 0 4px">بانتظار اعتمادك <span class="pill warn" id="apCnt">'+A(n)+'</span></h3>'
        +'<p class="sub-note" style="margin:0">كل ما يحتاج اعتمادك يصلك هنا: عاين الطلب ثم اعتمده أو أعده للتعديل أو ارفضه (الرفض نهائي ويصل مرسلَه إشعار).</p></div>';
      SECT.forEach(([k,lab])=>{
        const L = ITEMS.filter(i=>i.st===k).sort((a,b)=>(b.at||0)-(a.at||0));
        if(!L.length && k!=='new') return;
        h += '<div style="margin:12px 0 6px;padding:6px 10px;background:var(--surface-2);border-radius:8px;font-weight:800;font-size:13px;color:var(--brand)">'+lab+' ('+A(L.length)+')</div>'
          +(L.length ? L.map(i=>cardHtml(i, OPEN.has(i.src+'|'+i.id))).join('') : '<div class="empty"><span class="e-emoji">✅</span>لا شيء بانتظار اعتمادك.</div>');
      });
      box.innerHTML = h;
    }
    async function reload(){ ITEMS = await M.loadAll(); draw(); if(g.Appr.onCount) g.Appr.onCount(ITEMS.filter(i=>i.st==='new').length); }
    box.addEventListener('click', async e=>{
      const tg = e.target.closest('[data-atg]');
      if(tg){ const k = tg.dataset.atg; if(OPEN.has(k)) OPEN.delete(k); else OPEN.add(k); draw(); return; }
      const b = e.target.closest('[data-aok],[data-aret],[data-ano]'); if(!b || BUSY) return;
      const key = b.dataset.aok || b.dataset.aret || b.dataset.ano, action = b.dataset.aok ? 'ok' : (b.dataset.aret ? 'ret' : 'no');
      const it = ITEMS.find(i=>(i.src+'|'+i.id)===key); if(!it) return;
      const card = box.querySelector('[data-ak="'+key+'"]'), note = ((card.querySelector('[data-anote]')||{}).value||'').trim(), inp = (card.querySelector('[data-ain]')||{}).value;
      if(action!=='ok' && !note){ if(g.toast) g.toast('اكتب السبب أولًا'); card.querySelector('[data-anote]').focus(); return; }
      BUSY = true; b.disabled = true;
      try{ await M.decide(it, action, note, inp); if(g.toast) g.toast(action==='ok'?'اعتُمد':(action==='ret'?'أُعيد للتعديل':'سُجّل الرفض')); await reload(); }
      catch(er){ console.error(er); if(g.toast) g.toast('تعذّر الحفظ: '+(er&&er.message||er)); b.disabled = false; }
      BUSY = false;
    });
    await reload();
    return { reload, items:()=>ITEMS };
  }
  /* عدّاد ما ينتظر المدير (للشارة) */
  async function pendingCount(env){ try{ const M = make(env); return (await M.loadAll()).filter(i=>i.st==='new').length; }catch(e){ return 0; } }

  g.Appr = { mount, pendingCount, make };
})(window);
