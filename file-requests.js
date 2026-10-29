/* إصدار: 2026-10-21.2 · الاختبار — طلبات الملفات: الوكيل يطلب، المعلم يرفع (PDF أو صور حتى ٥٠٠ كيلوبايت)، الوكيل يعاين ويعتمد أو يعيد
   fileRequests/{sid}/items/{id}: {kind,title,period,gradesPeriod?,empId,empName,deadline,note,status('req'|'wait'|'ok'|'ret'),
     files:[{path,url,name,size,type,classLabel?,st?('wait'|'ok'|'ret'),note?}],createdAt,createdBy,uploadedAt,agentNote,reviewedAt,remindedAt}
   التخزين: fileRequests/{sid}/{id}/{اسم الملف} */
(function(g){
  const MAX = 512000; // ٥٠٠ كيلوبايت
  const OK_TYPES = /^(application\/pdf|image\/(jpeg|png|webp))$/;
  const KINDS = {
    visits:     { title:'الزيارات بين المعلمين',               multi:false },
    worklog:    { title:'سجل الأعمال',                         multi:false },
    completion: { title:'إكمال المنهج الدراسي',                multi:false },
    grades:     { title:'تحليل الدرجات',                       multi:true  },
    plan:       { title:'الخطة الفصلية لتوزيع المادة الدراسية', multi:false }
  };
  const ST = { req:'مطلوب', wait:'بانتظار الاعتماد', ok:'معتمد', ret:'معاد للتعديل' };
  const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const AR = n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
  const dateOf = ms=>{ try{ return new Date(ms).toLocaleDateString('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'long',year:'numeric'}); }catch(e){ return ''; } };
  const col = (db,sid)=>db.collection('fileRequests').doc(sid).collection('items');
  const overdue = r=> (r.status==='req'||r.status==='ret') && r.deadline && Date.now() > r.deadline;
  const sizeText = b=> b>=1048576 ? AR((b/1048576).toFixed(1))+' ميجا' : AR(Math.max(1,Math.round(b/1024)))+' كيلو';

  /* حالة كل ملف (لتحليل الدرجات: لكل صف حالته)؛ الملفات القديمة بلا st تتبع حالة الطلب */
  const fst = (r,f)=> f.st || (r.status==='ok' ? 'ok' : (r.status==='ret' ? 'ret' : 'wait'));
  const lab = x=>String(x||'').trim();
  const coveredLabels = r=>new Set((r.files||[]).filter(f=>fst(r,f)==='wait'||fst(r,f)==='ok').map(f=>lab(f.classLabel)));
  const remainingOf = (r,classes)=>{ const c = coveredLabels(r); return (classes||[]).filter(x=>!c.has(lab(x))); };
  /* هل ما زال الطلب مفتوحًا للرفع؟ */
  const isOpen = (r,classes)=> r.status==='req' || r.status==='ret' || (r.kind==='grades' && r.status==='wait' && remainingOf(r,classes).length>0);
  /* الحالة المشتقة لطلب تحليل الدرجات بعد اعتماد/إعادة ملف */
  function derive(files, classes){
    const sts = files.map(f=>f.st||'wait');
    if(sts.includes('ret')) return 'ret';
    if(sts.includes('wait')) return 'wait';
    const c = new Set(files.filter(f=>f.st==='ok').map(f=>lab(f.classLabel)));
    return (classes||[]).some(x=>!c.has(lab(x))) ? 'req' : 'ok';
  }
  function checkFile(f){
    if(!f) return 'لم يُختر ملف.';
    if(!OK_TYPES.test(f.type||'')) return 'النوع غير مقبول: المسموح PDF أو صورة (JPG أو PNG).';
    if(f.size > MAX) return 'حجم الملف أكبر من ٥٠٠ كيلوبايت. صغّر الملف أو اضغطه ثم أعد المحاولة.';
    return '';
  }
  function chip(r, classes){
    const od = r.status==='req' && overdue(r);
    const partial = r.kind==='grades' && r.status!=='ret' && (r.files||[]).length && remainingOf(r,classes).length && classes && classes.length;
    const cls = r.status==='ok' ? 'ok' : (od||r.status==='ret'||partial) ? 'bad' : '';
    const txt = od ? 'متأخر عن الموعد' : (partial ? 'مطلوب رفع بقية الصفوف' : (ST[r.status]||''));
    return '<span class="dh-chip '+cls+'">'+esc(txt)+'</span>';
  }
  const FST = { wait:'بانتظار الاعتماد', ok:'معتمد', ret:'معاد للتعديل' };
  function fileLinks(r){
    return (r.files||[]).map((f,i)=>'<a class="dh-link" href="'+esc(f.url)+'" target="_blank" rel="noopener">معاينة'+(r.files.length>1||f.classLabel?' ('+esc(f.classLabel||('ملف '+AR(i+1)))+(r.kind==='grades'?' — '+FST[fst(r,f)]:'')+')':'')+'</a>').join(' ');
  }

  /* ---------- طلب جديد (الوكيل) ---------- */
  async function create(db, sid, me, o){
    // o: {kind, period, gradesPeriod, empIds:[{id,name}], deadline(ms), note}
    const k = KINDS[o.kind]; if(!k) throw new Error('نوع ملف غير معروف');
    if(!o.empIds || !o.empIds.length) throw new Error('اختر معلمًا واحدًا على الأقل.');
    const batch = db.batch(), now = Date.now();
    o.empIds.forEach(e=>{
      const ref = col(db,sid).doc();
      batch.set(ref, {
        kind:o.kind, title:k.title + (o.kind==='grades' && o.gradesPeriod ? ' — ' + (o.gradesPeriod==='second'?'الفترة الثانية':'الفترة الأولى') : ''),
        period:o.period||'', gradesPeriod:o.gradesPeriod||'', empId:e.id, empName:e.name||'',
        deadline:o.deadline||0, note:o.note||'', status:'req', files:[], createdAt:now, createdBy:me.id
      });
    });
    await batch.commit();
    return o.empIds.length;
  }
  /* طلب واحد فقط لكل بطاقة في الفصل (وتحليل الدرجات لكل فترة): هل لهذا المعلم طلب قائم؟ */
  const reqOf = (existing,kind,gp,empId)=>existing.find(r=>r.kind===kind && r.empId===empId && (kind!=='grades' || (r.gradesPeriod||'first')===(gp||'first')));
  /* اكتمل ما طُلب منه (ما رفعه ينتظر الاعتماد أو معتمد، ولتحليل الدرجات كل صفوفه) */
  function complete(r, e){
    if(!r) return false;
    if(r.kind==='grades') return !(e.cl||[]).length ? (r.status==='wait'||r.status==='ok') && (r.files||[]).length>0 : remainingOf(r,e.cl).length===0;
    return r.status==='wait' || r.status==='ok';
  }
  /* نافذة الطلب/التذكير. employees: [{id,name,cl}] (معلمو الجدول المنشور فقط)، existing: طلبات الفصل
     أول طلب لهذه البطاقة: «الجميع» أو «معلمون محددون» وينزل الطلب بلا إشعار.
     بعد قيام الطلب: «الجميع» مجمَّد، ويبقى «من لم يرفع» و«معلمون محددون» ويُرسل إشعار نصي فوري لمن بقي عليه شيء. */
  function openCreate(host, ctx, kind, employees, existing, onDone, hooks){
    hooks = hooks||{};
    const k = KINDS[kind];
    existing = existing||[];
    host.innerHTML = '<div class="dh-card" id="frCreate"><h3>طلب ملف: '+esc(k.title)+'</h3>'
      + (kind==='grades' ? '<div style="margin:6px 0">الفترة: <label><input type="radio" name="frGP" value="first" checked> الأولى</label> <label><input type="radio" name="frGP" value="second"> الثانية</label></div>' : '')
      + '<div style="margin:6px 0">المستلمون: '
      + '<label id="frLAll"><input type="radio" name="frTo" value="all"> الجميع</label> '
      + '<label id="frLNot"><input type="radio" name="frTo" value="notyet"> من لم يرفع</label> '
      + '<label><input type="radio" name="frTo" value="pick"> معلمون محددون</label></div>'
      + '<div class="m" id="frHint"></div>'
      + '<div id="frPick" style="display:none;max-height:180px;overflow:auto;border:1px solid #cfd8dc;border-radius:8px;padding:6px;margin:6px 0"></div>'
      + '<div style="margin:6px 0">آخر موعد للرفع: <input type="date" id="frDl"></div>'
      + '<div style="margin:6px 0"><textarea id="frNote" rows="2" style="width:100%" placeholder="ملاحظة للمعلم (اختياري، بأسلوب لطيف)"></textarea></div>'
      + '<div class="dh-links"><button class="dh-link" id="frSend" style="background:#0f766e;color:#fff">إرسال الطلب</button><button class="dh-link" id="frCancel">إلغاء</button></div>'
      + '<div id="frMsg" class="m"></div></div>';
    const q = s=>host.querySelector(s);
    const gpNow = ()=> kind==='grades' ? host.querySelector('input[name=frGP]:checked').value : '';
    const reqs = ()=>existing.filter(r=>r.kind===kind && (kind!=='grades' || (r.gradesPeriod||'first')===gpNow()));
    const isFirst = ()=>reqs().length===0;
    const incomplete = ()=>employees.filter(e=>!complete(reqOf(existing,kind,gpNow(),e.id), e));
    function refresh(){
      const first = isFirst(), radios = host.querySelectorAll('input[name=frTo]');
      q('#frLAll').style.display = '';
      q('#frLAll input').disabled = !first;
      q('#frLAll').style.opacity = first ? '' : '.45';
      q('#frLAll').title = first ? '' : 'الطلب قائم؛ خيار «الجميع» مجمَّد';
      q('#frLNot').style.display = first ? 'none' : '';
      const cur = host.querySelector('input[name=frTo]:checked');
      if(!cur || (cur.value==='all' && !first) || (cur.value==='notyet' && first)) host.querySelector('input[name=frTo][value='+(first?'all':'notyet')+']').checked = true;
      q('#frHint').textContent = first
        ? 'سينزل الطلب عند المعلمين في «ملفات مطلوبة» دون إرسال إشعار. المستلمون معلمو الجدول المدرسي فقط.'
        : 'الطلب قائم. سيصل المعلمين الذين لم يكملوا الرفع إشعار نصي فورًا، ولا يُرسل لمن أرفق كل ما طُلب منه.';
      q('#frSend').textContent = first ? 'إنزال الطلب' : 'إرسال الإشعار';
      const list = first ? employees : incomplete();
      q('#frPick').innerHTML = list.length ? list.map(e=>'<label style="display:block"><input type="checkbox" data-e="'+esc(e.id)+'"> '+esc(e.name)+'</label>').join('') : '<div class="m">لا أحد بقي عليه شيء.</div>';
      q('#frPick').style.display = host.querySelector('input[name=frTo]:checked').value==='pick' ? 'block' : 'none';
    }
    host.querySelectorAll('input[name=frTo]').forEach(r=>r.onchange=refresh);
    host.querySelectorAll('input[name=frGP]').forEach(r=>r.onchange=refresh);
    refresh();
    q('#frCancel').onclick = ()=>{ host.innerHTML=''; };
    q('#frSend').onclick = async ()=>{
      const first = isFirst(), gp = gpNow();
      const to = host.querySelector('input[name=frTo]:checked').value;
      let list;
      if(to==='all') list = employees;
      else if(to==='notyet') list = incomplete();
      else { const ids = [...host.querySelectorAll('[data-e]:checked')].map(x=>x.dataset.e); list = employees.filter(e=>ids.includes(e.id)); }
      if(!first) list = list.filter(e=>!complete(reqOf(existing,kind,gp,e.id), e));
      let skipped = 0;
      if(hooks.before){ const r = hooks.before(list, { kind, gp, first }); list = r.list; skipped = r.skipped||0; }
      if(!list.length){ q('#frMsg').textContent = hooks.emptyMsg || 'لا يوجد من يُرسل إليه.'; return; }
      const dl = q('#frDl').value ? new Date(q('#frDl').value+'T23:59:59').getTime() : 0;
      q('#frSend').disabled = true;
      try{
        // الطلب مرة واحدة فقط: لا يُنشأ طلب ثانٍ لمن لديه طلب قائم لهذه البطاقة (ولتحليل الدرجات لهذه الفترة)
        const fresh = list.filter(e=>!reqOf(existing,kind,gp,e.id));
        if(fresh.length) await create(ctx.db, ctx.sid, ctx.me, { kind, period:ctx.period, gradesPeriod:gp, empIds:fresh, deadline:dl, note:q('#frNote').value.trim() });
        if(!first && hooks.after) await hooks.after(list, { kind, gp, first });
        host.innerHTML = '';
        onDone && onDone(list.length, skipped, first);
      }catch(e){ q('#frMsg').textContent = e.message||String(e); q('#frSend').disabled = false; }
    };
  }

  /* ---------- المعلم: ملفات مطلوبة ---------- */
  async function uploadOne(ctx, r, file, classLabel){
    const err = checkFile(file); if(err) throw new Error(err);
    if(!g.firebase || !firebase.storage) throw new Error('خدمة رفع الملفات غير متاحة.');
    const safe = Date.now()+'_'+String(file.name||'file').replace(/[^\w.\-؀-ۿ]+/g,'_').slice(-60);
    const path = 'fileRequests/'+ctx.sid+'/'+r.id+'/'+safe;
    const ref = firebase.storage().ref(path);
    await ref.put(file, { contentType:file.type });
    const url = await ref.getDownloadURL();
    return { path, url, name:file.name||'', size:file.size, type:file.type, classLabel:classLabel||'', st:'wait' };
  }
  /* فصول المعلم من النسخة المنشورة للجدول (لاختيارها عند رفع تحليل الدرجات) */
  async function myClasses(db, sid, period, uid){
    try{
      const s = await db.collection('timetables').doc(sid).collection('data').doc(period+'_published').get();
      if(!s.exists) return [];
      const p = JSON.parse(s.data().value||'null') || {};
      const L = ((p.byUser||{})[uid]||{}).lessons || [];
      return [...new Set(L.map(l=>l.cl||l.c).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ar'));
    }catch(e){ return []; }
  }
  async function mountMine(host, ctx, onChange){
    if(!ctx.classes) ctx.classes = await myClasses(ctx.db, ctx.sid, ctx.period||'first', ctx.me.id);
    let rows = [];
    try{ const sn = await col(ctx.db,ctx.sid).where('empId','==',ctx.me.id).get(); rows = sn.docs.map(d=>({id:d.id,...d.data()})); }
    catch(e){ console.warn(e); }
    rows.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const open = rows.filter(r=>isOpen(r, ctx.classes));
    host.innerHTML = '<div class="dh-card" id="frMine"><h3>ملفات مطلوبة</h3>'
      + (rows.length ? '<div class="dh-list">' + rows.map(r=>{
          const can = isOpen(r, ctx.classes);
          const rem = r.kind==='grades' && ctx.classes && ctx.classes.length ? remainingOf(r, ctx.classes) : [];
          return '<div class="dh-item" data-r="'+esc(r.id)+'" style="flex-wrap:wrap"><div>'+esc(r.title)
            + '<div class="m">'+(r.deadline?'آخر موعد: '+esc(dateOf(r.deadline)):'دون موعد محدد')+(r.note?' · '+esc(r.note):'')+'</div>'
            + ((r.files||[]).some(f=>fst(r,f)==='ret') ? '<div class="m" style="color:#b91c1c">ملاحظة الوكيل: '+esc(r.agentNote||(r.files.filter(f=>f.st==='ret')[0]||{}).note||'يلزم التعديل')+'</div>' : (r.status==='ret' && r.agentNote ? '<div class="m" style="color:#b91c1c">ملاحظة الوكيل: '+esc(r.agentNote)+'</div>' : ''))
            + (rem.length && (r.files||[]).length ? '<div class="m">الصفوف المتبقية: '+esc(rem.join('، '))+'</div>' : '')
            + ((r.files||[]).length ? '<div class="m">'+fileLinks(r)+'</div>' : '')
            + '</div><div>'+chip(r, ctx.classes)+(can?' <button class="dh-link" data-up="'+esc(r.id)+'">'+(r.status==='ret'?'رفع من جديد':'رفع الملف')+'</button>':'')+'</div><div class="frSlot" style="flex:0 0 100%"></div></div>';
        }).join('') + '</div>' : '<div class="dh-empty">لا ملفات مطلوبة منك حاليًا.</div>')
      + '</div>';
    /* نموذج الرفع يظهر داخل بطاقة الطلب نفسها، ونموذج واحد فقط مفتوح */
    host.querySelectorAll('[data-up]').forEach(b=>b.onclick = ()=>{
      host.querySelectorAll('.frSlot').forEach(x=>{ x.innerHTML=''; });
      const slot = b.closest('.dh-item').querySelector('.frSlot');
      uploadForm(slot, ctx, rows.find(x=>x.id===b.dataset.up), ()=>{ mountMine(host, ctx, onChange); onChange&&onChange(); });
      try{ slot.scrollIntoView({ behavior:'smooth', block:'nearest' }); }catch(e){}
    });
    return { total:rows.length, pending:open.length, rows };
  }
  function uploadForm(box, ctx, r, done){
    const multi = KINDS[r.kind] && KINDS[r.kind].multi;
    // تحليل الدرجات: الصف الذي رُفع (بانتظار الاعتماد أو معتمد) لا يُرفع مرة ثانية
    const covered = multi ? coveredLabels(r) : new Set();
    const avail = multi ? (ctx.classes||[]).filter(c=>!covered.has(lab(c))) : [];
    if(multi && ctx.classes && ctx.classes.length && !avail.length){ box.innerHTML = '<div class="m">رُفعت ملفات جميع صفوفك لهذه الفترة.</div>'; return; }
    box.innerHTML = '<div style="border-top:1px solid #cfd8dc;margin-top:10px;padding-top:10px"><b>'+esc(r.title)+'</b>'
      + '<div class="m">PDF أو صورة، وبحد أقصى ٥٠٠ كيلوبايت للملف'+(multi?'، وملف لكل صف (لا يُرفع الصف أكثر من مرة)':'')+'.</div>'
      + '<div id="frRows"></div>'
      + (multi ? '<button class="dh-link" id="frAdd">+ إضافة ملف آخر</button>' : '')
      + '<div class="dh-links" style="margin-top:8px"><button class="dh-link" id="frGo" style="background:#0f766e;color:#fff">إرسال للاعتماد</button><button class="dh-link" id="frX">إلغاء</button></div>'
      + '<div class="m" id="frErr" style="color:#b91c1c"></div></div>';
    const rowsEl = box.querySelector('#frRows');
    const addRow = ()=>{ const d = document.createElement('div'); d.style.margin='6px 0';
      d.innerHTML = (multi ? (ctx.classes && ctx.classes.length
          ? '<select class="frCls" style="margin-inline-end:6px"><option value="">— اختر الصف والشعبة —</option>'+avail.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select> '
          : '<input type="text" class="frCls" placeholder="الصف والشعبة (مثال: ٣/أ)" style="width:120px;margin-inline-end:6px"> ') : '')+'<input type="file" class="frFile" accept="application/pdf,image/jpeg,image/png,image/webp">';
      rowsEl.appendChild(d); };
    addRow();
    if(multi) box.querySelector('#frAdd').onclick = addRow;
    box.querySelector('#frX').onclick = ()=>{ box.innerHTML=''; };
    box.querySelector('#frGo').onclick = async ()=>{
      const err = box.querySelector('#frErr'); err.textContent = '';
      const items = [...rowsEl.children].map(d=>({ file:(d.querySelector('.frFile').files||[])[0], cls:(d.querySelector('.frCls')||{value:''}).value.trim() })).filter(x=>x.file);
      if(!items.length){ err.textContent = 'اختر ملفًا أولًا.'; return; }
      const seen = new Set();
      for(const it of items){
        const e = checkFile(it.file); if(e){ err.textContent = e; return; }
        if(multi){
          if(!it.cls){ err.textContent = 'اكتب الصف والشعبة لكل ملف.'; return; }
          if(covered.has(lab(it.cls))){ err.textContent = 'سبق رفع ملف الصف «'+it.cls+'» لهذه الفترة.'; return; }
          if(seen.has(lab(it.cls))){ err.textContent = 'الصف «'+it.cls+'» مكرر في هذا الرفع.'; return; }
          seen.add(lab(it.cls));
        }
      }
      box.querySelector('#frGo').disabled = true; err.textContent = 'جارٍ الرفع…';
      try{
        const added = [];
        for(const it of items) added.push(await uploadOne(ctx, r, it.file, it.cls));
        let files = added;
        if(multi){
          // يُستبدل ملف الصف المعاد للتعديل بالجديد، وتبقى بقية الملفات كما هي
          const re = new Set(added.map(f=>lab(f.classLabel)));
          files = (r.files||[]).filter(f=>!re.has(lab(f.classLabel))).map(f=>Object.assign({}, f, { st:fst(r,f) })).concat(added);
        }
        await col(ctx.db,ctx.sid).doc(r.id).update({ files, status:'wait', uploadedAt:Date.now() });
        done && done();
      }catch(e){ console.error(e); err.textContent = 'تعذّر الرفع: '+(e.message||e); box.querySelector('#frGo').disabled = false; }
    };
  }

  /* ---------- الوكيل: المراجعة ---------- */
  async function loadAll(db, sid, period){
    const sn = await col(db,sid).get();
    return sn.docs.map(d=>({id:d.id,...d.data()})).filter(r=>!period || !r.period || r.period===period);
  }
  /* fileIdx: لتحليل الدرجات يُعتمد أو يُعاد كل ملف صف على حدة؛ classes: فصول المعلم من الجدول لتحديد اكتمال الطلب */
  async function review(db, sid, me, r, ok, note, fileIdx, classes){
    if(r.kind==='grades' && fileIdx!=null){
      const files = (r.files||[]).map((f,i)=>{
        const o = Object.assign({}, f, { st:fst(r,f) });
        if(i===fileIdx){ o.st = ok ? 'ok' : 'ret'; o.note = ok ? '' : (note||''); }
        return o;
      });
      const status = derive(files, classes);
      await col(db,sid).doc(r.id).update({ files, status, agentNote: ok ? (r.agentNote||'') : (note||''), reviewedAt:Date.now(), reviewedBy:me.id });
      return;
    }
    await col(db,sid).doc(r.id).update({ status: ok?'ok':'ret', agentNote: ok?'':(note||''), reviewedAt:Date.now(), reviewedBy:me.id });
  }
  async function remind(db, sid, r){
    await col(db,sid).doc(r.id).update({ remindedAt:Date.now() });
  }

  g.FileReq = { KINDS, ST, FST, MAX, checkFile, overdue, chip, fileLinks, create, openCreate, mountMine, uploadForm, loadAll, review, remind, col, sizeText, myClasses, fst, isOpen, remainingOf, coveredLabels, complete, reqOf };
})(typeof window!=='undefined' ? window : globalThis);
