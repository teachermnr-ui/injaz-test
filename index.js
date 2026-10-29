// إصدار: 2026-10-29.1 · الاختبار
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();
const nodemailer = require("nodemailer");
const {defineSecret} = require("firebase-functions/params");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const CF_ACCOUNT_ID = defineSecret("CF_ACCOUNT_ID");
const CF_API_TOKEN = defineSecret("CF_API_TOKEN");
/**
 * فك ربط حساب مستخدم فعليًا:
 * - تعطيل حساب Firebase Auth (منع دخول حقيقي فوري)
 * - إرسال بريد فوري بكلمة المرور الجديدة عبر مجموعة "mail" (يتطلب امتداد Trigger Email لاحقًا)
 * يُستدعى فقط من admin العام (نتحقق من صلاحيته داخل الدالة)
 */
exports.unlinkUserAccount = onCall({secrets: [GMAIL_APP_PASSWORD]}, async (request) => {
  // التحقق: المستدعي لازم يكون مسجَّل دخول
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  }

  const callerUid = request.auth.uid;
  const { targetDocId, newPassword } = request.data;

  if (!targetDocId || !newPassword) {
    throw new HttpsError("invalid-argument", "بيانات ناقصة (targetDocId أو newPassword).");
  }

  const db = admin.firestore();

  // التحقق: المستدعي فعلاً admin العام
  const callerDoc = await db.collection("users").doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "هذا الإجراء مقصور على admin العام فقط.");
  }

  // جلب المستند المستهدف
  const targetRef = db.collection("users").doc(targetDocId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", "الحساب المستهدف غير موجود.");
  }
  const targetData = targetSnap.data();
  const targetAuthUid = targetData.authUid;

  if (!targetAuthUid) {
    throw new HttpsError("failed-precondition", "هذا الحساب غير مرتبط ببريد أصلاً.");
  }

  const targetEmail = targetData.email || targetData.googleEmail || null;

  // ١) تعطيل حساب Firebase Auth فعليًا
  await admin.auth().updateUser(targetAuthUid, { disabled: true });

  // ٢) تحديث مستند Firestore: مسح الربط، تسجيل كلمة المرور الجديدة
  await targetRef.update({
    authUid: admin.firestore.FieldValue.delete(),
    email: admin.firestore.FieldValue.delete(),
    googleEmail: admin.firestore.FieldValue.delete(),
    mergeRequestAt: admin.firestore.FieldValue.delete(),
    mergeRequestTarget: admin.firestore.FieldValue.delete(),
    password: newPassword,
    updatedAt: Date.now(),
  });

  let emailSent = false;
  // ٣) إرسال بريد فوري (يتطلب تفعيل امتداد Trigger Email لاحقًا ليعمل فعليًا)
  if (targetEmail) {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "awraqaicom@gmail.com",
        pass: GMAIL_APP_PASSWORD.value(),
      },
    });
    
    // (2026-10-13) فك الربط تم فعليًا؛ فشل البريد لا يُظهَر كفشل للعملية بل يُبلَّغ به المدير ليرسل الكلمة بنفسه
    try {
      await transporter.sendMail({
        from: "awraqaicom@gmail.com",
        to: targetEmail,
        subject: "تم فك ربط حسابك",
        text:
          "تم فك ربط بريدك القديم بناءً على طلبك.\n" +
          "كلمة المرور الأولية الجديدة لإعادة التفعيل: " + newPassword + "\n" +
          "سجّل الدخول من جديد بأي بريد وأدخل رقم هويتك وهذه الكلمة لإكمال التفعيل.",
      });
      emailSent = true;
    } catch (e) {
      console.error("unlinkUserAccount mail", e);
    }
  }

  return { success: true, email: targetEmail, emailSent };
});
const db2 = admin.firestore();

exports.requestMergeLink = onCall(
  {secrets: [GMAIL_APP_PASSWORD]},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
    }
    if (request.auth.token && request.auth.token.firebase && request.auth.token.firebase.sign_in_provider === "anonymous") {
      throw new HttpsError("permission-denied", "هذا الإجراء غير متاح لهذا النوع من الدخول.");
    }
    const callerUid = request.auth.uid;
    const {loginId, confirmEmail} = request.data || {};

    if (!loginId || !/^[0-9]{10,14}$/.test(loginId)) {
      throw new HttpsError("invalid-argument", "رقم هوية غير صالح.");
    }
    if (!confirmEmail) {
      throw new HttpsError("invalid-argument", "لازم تدخل البريد للتأكيد.");
    }

    // (2026-10-13) حدّ للمحاولات: لا تخمين لرقم الهوية والبريد
    const gate = await secGate("mrg_" + callerUid, 8, 30 * 60 * 1000);
    // إيجاد الحساب الآخر المطابق (سيرفريًا، لا نثق بأي شيء من المتصفح)
    const q = await db2.collection("users").where("loginId", "==", loginId).get();
    const otherDoc = q.docs.find((d) =>
      d.id !== callerUid &&
      d.data().authUid &&
      d.data().role !== "admin" &&
      d.data().role !== "schoolAdmin"
    );
    if (!otherDoc) {
      await secFail(gate);
      throw new HttpsError("not-found", "لا يوجد رقم سجل مطابق مرتبط بحساب آخر.");
    }
    const otherData = otherDoc.data();
    const realEmail = otherData.email || otherData.googleEmail || "";
    if (!realEmail || String(confirmEmail).trim().toLowerCase() !== realEmail.trim().toLowerCase()) {
      await secFail(gate);
      throw new HttpsError("permission-denied", "البريد المُدخَل غير صحيح.");
    }

    // (2026-10-13) لا نكتب شيئًا على حساب المستدعي هنا؛ يُحفظ الرقم في طلب الدمج وحده. ولا نُنشئ الطلب إن لم نستطع إيصال الكود.
    const callerDoc = await db2.collection("users").doc(callerUid).get();
    const callerEmail = callerDoc.exists ?
      (callerDoc.data().email || callerDoc.data().googleEmail || "") : "";
    if (!callerEmail) {
      throw new HttpsError("failed-precondition", "حسابك الحالي بلا بريد لإرسال الكود إليه.");
    }

    // توليد كود ٦ أرقام وحفظ طلب الدمج (صالح ٢٤ ساعة)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const mrRef = await db2.collection("mergeRequests").add({
      soloUid: callerUid,
      targetUid: otherDoc.id,
      loginId: loginId,
      code: code,
      used: false,
      createdAt: Date.now(),
      expiresAt: expiresAt,
    });

    // إرسال الكود لبريد الحساب الفردي نفسه؛ إن فشل الإرسال يُلغى الطلب ويُبلَّغ المستخدم (لا طلب معلّق بلا كود وصل)
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "awraqaicom@gmail.com",
          pass: GMAIL_APP_PASSWORD.value(),
        },
      });
      await transporter.sendMail({
        from: "awraqaicom@gmail.com",
        to: callerEmail,
        subject: "كود ربط حسابك بمدرستك",
        text:
          "طلبت ربط حسابك الفردي بحساب مدرسة مرتبط بنفس رقم هويتك.\n" +
          "كود الربط: " + code + "\n" +
          "سجّل الدخول بحسابك الآخر (حساب المدرسة) وأدخل هذا الكود خلال 24 ساعة لإتمام الدمج.",
      });
    } catch (e) {
      console.error("requestMergeLink mail", e);
      await mrRef.delete().catch(() => {});
      throw new HttpsError("unavailable", "تعذّر إرسال الكود إلى بريدك الآن. أعد المحاولة بعد قليل.");
    }

    return {success: true, maskedTarget: maskEmailServer(realEmail)};
  }
);

function maskEmailServer(email) {
  const parts = email.split("@");
  if (parts.length < 2) return email;
  const shown = parts[0].slice(0, 2);
  return shown + "***@" + parts[1];
}

/**
 * تأكيد الدمج: يُستدعى بعد تسجيل الدخول بحساب المدرسة (الهدف)
 * وإدخال كود الربط اللي وصل لبريد الحساب الفردي.
 */
exports.confirmMergeLink = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  }
  if (request.auth.token && request.auth.token.firebase && request.auth.token.firebase.sign_in_provider === "anonymous") {
    throw new HttpsError("permission-denied", "هذا الإجراء غير متاح لهذا النوع من الدخول.");
  }
  const callerUid = request.auth.uid;
  const {code} = request.data || {};

  if (!code) {
    throw new HttpsError("invalid-argument", "أدخل الكود.");
  }

  const db3 = admin.firestore();
  // (2026-10-13) حدّ للمحاولات: كود الدمج من ستة أرقام فلا يُترك للتخمين
  const gate3 = await secGate("mrgc_" + callerUid, 6, 30 * 60 * 1000);

  const q = await db3.collection("mergeRequests")
    .where("targetUid", "==", callerUid)
    .where("code", "==", String(code).trim())
    .where("used", "==", false)
    .get();

  if (q.empty) {
    await secFail(gate3);
    throw new HttpsError("not-found", "الكود غير صحيح.");
  }

  const reqDoc = q.docs[0];
  const reqData = reqDoc.data();

  if (!reqData.expiresAt || Date.now() > reqData.expiresAt) {
    throw new HttpsError("deadline-exceeded", "انتهت صلاحية الكود. أعد المحاولة من جديد من حسابك الفردي.");
  }

  const targetRef = db3.collection("users").doc(callerUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", "حسابك غير موجود.");
  }
  const targetData = targetSnap.data();
  const targetSchools = targetData.schools || {};
  if (!Object.keys(targetSchools).length) {
    throw new HttpsError(
        "failed-precondition",
        "حسابك الحالي فردي بحت بلا أي مدرسة — لا يمكن الدمج بهذا الاتجاه.",
    );
  }

  const soloUid = reqData.soloUid;
  const soloRef = db3.collection("users").doc(soloUid);
  const soloSnap = await soloRef.get();
  if (!soloSnap.exists) {
    throw new HttpsError("not-found", "الحساب الفردي الأصلي لم يعد موجودًا.");
  }
  const soloData = soloSnap.data();

  // نقل سياق solo لحساب الهدف فقط لو ما عنده سياق solo أصلاً (بلا استبدال بيانات موجودة)
  const updatePayload = {updatedAt: Date.now()};
  if (!targetData.solo && soloData.solo) {
    updatePayload.solo = soloData.solo;
  }
  await targetRef.update(updatePayload);

  // تعطيل حساب Auth الخاص بالحساب الفردي (لم يعد يُستخدم للدخول بعد الآن)
  try {
    await admin.auth().updateUser(soloUid, {disabled: true});
  } catch (e) {
    // لو الحساب محذوف مسبقًا من Auth لأي سبب، نكمل بدون توقف
  }

  // تعليم المستند الفردي كمُدمَج
  await soloRef.update({
    migratedTo: callerUid,
    authUid: admin.firestore.FieldValue.delete(),
    email: admin.firestore.FieldValue.delete(),
    googleEmail: admin.firestore.FieldValue.delete(),
    updatedAt: Date.now(),
  });

  // تعليم طلب الدمج كمستخدَم
  await reqDoc.ref.update({used: true, usedAt: Date.now()});

  return {success: true};
});
/**
 * فحص خفيف: هل يوجد طلب دمج معلَّق يستهدف الحساب الحالي؟
 * يرجع true/false فقط — لا يكشف أي تفاصيل عن الطلب للمتصفح.
 */
exports.checkPendingMerge = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  }
  const callerUid = request.auth.uid;
  const db4 = admin.firestore();
  const q = await db4.collection("mergeRequests")
    .where("targetUid", "==", callerUid)
    .where("used", "==", false)
    .get();
  const valid = q.docs.filter((d) => d.data().expiresAt && d.data().expiresAt > Date.now());
  return {pending: valid.length > 0};
});

/* =========================================================================
   ص-١: الأنشطة الرقمية ملك المعلم وتنتقل معه
   ========================================================================= */
const { onSchedule } = require("firebase-functions/v2/scheduler");

/**
 * أرشفة نشاط منشور/مغلق انقطعت صلة صاحبه بطلابه:
 * - نسخة مسودة (المحتوى فقط) في مكتبة المعلم
 * - النشاط يصير archived فيختفي عن الطلاب
 * - التسليمات تُخفى وتُقطع صلة المعلم بها (teacherUid = null)
 */
async function archiveWorksheet(db, wDoc, ownerUid, reason) {
  const w = wDoc.data();
  const FV = admin.firestore.FieldValue;
  await db.collection("worksheets").add({
    createdBy: ownerUid, createdByName: w.createdByName || "", schoolId: null,
    subject: w.subject || "", grade: w.grade || "", title: w.title || "", unit: w.unit || "", lesson: w.lesson || "",
    sourceFileName: w.sourceFileName || "", exercises: w.exercises || [],
    status: "draft", assignedClassIds: [], assignedStudentIds: [], dueDate: null,
    createdAt: FV.serverTimestamp(), publishedAt: null, copiedFrom: wDoc.id, restoredBy: reason,
  });
  const subs = await db.collection("submissions").where("worksheetId", "==", wDoc.id).get();
  for (let i = 0; i < subs.docs.length; i += 400) {
    const batch = db.batch();
    subs.docs.slice(i, i + 400).forEach((s) => batch.update(s.ref, {
      hidden: true, teacherUid: null, archivedTeacherUid: w.createdBy || null, archivedAt: Date.now(),
    }));
    await batch.commit();
  }
  await wDoc.ref.update({ status: "archived", archivedAt: FV.serverTimestamp(), archivedReason: reason });
}

/** هل ما زال صاحب النشاط مرتبطًا بسياق النشر (المدرسة، أو حسابه الفردي)؟ */
function stillLinked(u, sid, schoolExists) {
  if (!u || u.active === false || u.migratedTo) return false;
  if (sid) {
    if (!schoolExists) return false;
    if (u.role === "admin") return true;
    if (u.role === "schoolAdmin") return (u.adminSchools || []).includes(sid);
    const c = (u.schools || {})[sid];
    return !!c && c.active !== false;
  }
  return !!u.solo && u.solo.active !== false;
}

/**
 * كل ساعة: الأنشطة المنشورة/المغلقة لمعلم لم يعد في مدرسة النشر (أُزيل أو أُوقف، أو حُذفت المدرسة)،
 * أو انتهى حسابه الفردي، تُؤرشف: تختفي عنه وعن الطلاب، ويبقى محتواها مسودةً في مكتبته.
 */
exports.archiveDepartedTeachers = onSchedule({ schedule: "every 60 minutes", timeZone: "Asia/Riyadh" }, async () => {
  const db = admin.firestore();
  const snap = await db.collection("worksheets").where("status", "in", ["published", "closed"]).get();
  const userCache = new Map(), schoolCache = new Map();
  const getUser = async (uid) => {
    if (!userCache.has(uid)) { const s = await db.collection("users").doc(uid).get(); userCache.set(uid, s.exists ? s.data() : null); }
    return userCache.get(uid);
  };
  const schoolExists = async (sid) => {
    if (!schoolCache.has(sid)) { const s = await db.collection("schoolData").doc(sid).get(); schoolCache.set(sid, s.exists); }
    return schoolCache.get(sid);
  };
  let archived = 0;
  for (const d of snap.docs) {
    const w = d.data();
    if (!w.createdBy) continue;
    const sid = w.schoolId || null;
    const u = await getUser(w.createdBy);
    if (stillLinked(u, sid, sid ? await schoolExists(sid) : true)) continue;
    try { await archiveWorksheet(db, d, w.createdBy, "departure"); archived++; } catch (e) { console.error("archive", d.id, e); }
  }
  console.log("archiveDepartedTeachers: archived", archived);
});

/**
 * استرجاع أنشطة المعلم وبنك أسئلته من حساب سابق له:
 *  - حساب دُمج في حسابه الحالي (migratedTo = حسابه)، أو
 *  - حساب بنفس البريد المُثبت في رمز الدخول، وحساب Auth الخاص به محذوف أو معطّل.
 * المسودات وبنك الأسئلة تنتقل كما هي؛ المنشور/المغلق يُؤرشف وتُنسخ مسودته للحساب الحالي.
 */
exports.reclaimTeacherContent = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  const uid = request.auth.uid;
  const db = admin.firestore();
  const me = await db.collection("users").doc(uid).get();
  if (!me.exists) return { moved: 0 };
  const olds = new Map();
  (await db.collection("users").where("migratedTo", "==", uid).get()).docs.forEach((d) => olds.set(d.id, true));
  const email = request.auth.token.email || "";
  if (email && request.auth.token.email_verified !== false) {
    const variants = [...new Set([email, email.toLowerCase()])];
    for (const f of ["email", "googleEmail"]) {
      for (const e of variants) {
        const s = await db.collection("users").where(f, "==", e).get();
        for (const d of s.docs) {
          if (d.id === uid || olds.has(d.id)) continue;
          const authUid = d.data().authUid || d.id;
          let dead = false;
          try { dead = !!(await admin.auth().getUser(authUid)).disabled; } catch (err) { dead = err && err.code === "auth/user-not-found"; }
          if (dead) olds.set(d.id, true);
        }
      }
    }
  }
  let moved = 0;
  for (const oldId of olds.keys()) {
    const ws = await db.collection("worksheets").where("createdBy", "==", oldId).get();
    for (const d of ws.docs) {
      const st = d.data().status;
      if (st === "draft") { await d.ref.update({ createdBy: uid, updatedAt: Date.now() }); moved++; }
      else if (st === "published" || st === "closed") { await archiveWorksheet(db, d, uid, "reclaim"); moved++; }
    }
    const qb = await db.collection("questionBank").where("createdBy", "==", oldId).get();
    for (let i = 0; i < qb.docs.length; i += 400) {
      const batch = db.batch();
      qb.docs.slice(i, i + 400).forEach((q) => batch.update(q.ref, { createdBy: uid }));
      await batch.commit();
      moved += Math.min(400, qb.docs.length - i);
    }
  }
  return { moved };
});

/* =========================================================================
   نقل سجلات المعلم عند إعادة ربط حسابه بعد فك الربط (ص-٣٦)
   الشرط (قرار المستخدم): تُنقل السجلات التي في نفس المدرسة ونفس الفترة الحالية ونفس العام الدراسي فقط.
   ما عداها (فترات/أعوام سابقة) يبقى على الحساب القديم كأرشيف ولا يُحذف.
   مصدر الحدود: schoolData/{sid} → yearFromMs/yearToMs و periods[{id,fromMs,toMs}] (إعدادات المدرسة).
   لا حدود معرّفة للعام ⇒ لا يُنقل شيء (الأمان أولًا). سجلات المعلم القديم تُعلَّم transferredTo ولا تُحذف.
   (2026-10-15، البند ٦) يشمل كذلك: الزيارات الصفية (نسخ إلى معرّف جديد) وخطط المناوبة والإشراف (استبدال المعرّف داخل الخطة والنسخة المعتمدة)
   والجدول المنشور والانتظار المنشور («جدولي» و«انتظاري») — كلها للمدرسة والفترة والعام الحاليين فقط.
   لا يشمل إشعارات الغياب (سجلات للطلاب لا للمعلم).
   ========================================================================= */
const TR_REC_COLS = [
  ["attendance", "markedBy"], ["attAlerts", "byUserId"], ["leaves", "byUserId"], ["prepOverrides", "byUserId"],
  ["studentNotes", "fromUserId"], ["notes", "fromUserId"], ["guidanceSessions", "byUserId"], ["guidanceAppointments", "byUserId"],
];
function trCurrentPeriod(school, nowMs) {
  const ps = Array.isArray(school.periods) ? school.periods : [];
  const hit = ps.find((p) => p && p.fromMs != null && p.toMs != null && nowMs >= p.fromMs && nowMs <= p.toMs);
  return hit ? hit.id : (school.activePeriod || "first");
}
function trRecTime(v) {
  if (typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.date)) { const t = Date.parse(v.date.slice(0, 10) + "T12:00:00Z"); if (!isNaN(t)) return t; }
  for (const f of ["ts", "createdAt", "at", "updatedAt"]) if (typeof v[f] === "number") return v[f];
  return null;
}
/** هل السجل ضمن مدرسة/فترة/عام المعلم الحالية؟ */
function trEligible(v, sid, period, school) {
  if (!v || v.schoolId !== sid) return false;
  if (v.period && v.period !== period) return false;
  const t = trRecTime(v);
  if (t == null || school.yearFromMs == null || school.yearToMs == null) return false;
  if (t < school.yearFromMs || t > school.yearToMs) return false;
  if (!v.period) { // سجل بلا حقل فترة: يُحكم عليه بتاريخه داخل حدود الفترة الحالية إن عُرّفت
    const p = (school.periods || []).find((x) => x.id === period);
    if (p && p.fromMs != null && (t < p.fromMs || t > p.toMs)) return false;
  }
  return true;
}
/** يستبدل معرّف الحساب القديم بالجديد داخل كائن/مصفوفة (قيمًا ومفاتيح)؛ يُسقط التكرار الناتج في المصفوفات. */
function trSwapId(v, oldId, newId) {
  let n = 0;
  const walk = (x) => {
    if (typeof x === "string") { if (x === oldId) { n++; return newId; } return x; }
    if (Array.isArray(x)) {
      const out = x.map(walk);
      if (out.length && out.every((e) => typeof e === "string")) return out.filter((e, i) => out.indexOf(e) === i);
      return out;
    }
    if (x && typeof x === "object") {
      const out = {};
      for (const k of Object.keys(x)) {
        const nk = k === oldId ? (n++, newId) : k;
        out[nk] = (nk in out && nk !== k) ? out[nk] : walk(x[k]);
      }
      return out;
    }
    return x;
  };
  const value = walk(v);
  return { value, changed: n };
}
exports.transferTeacherRecords = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  const uid = request.auth.uid;
  const db = admin.firestore();
  const me = await db.collection("users").doc(uid).get();
  if (!me.exists) return { moved: 0, skipped: "no-user" };
  const meData = me.data();
  if (!meData.loginId) return { moved: 0, skipped: "no-login-id" };
  const olds = (await db.collection("users").where("migratedTo", "==", uid).get()).docs
    .filter((d) => d.data().loginId && d.data().loginId === meData.loginId && d.data().schools);
  const now = Date.now();
  const out = { moved: 0, byCollection: {}, skippedSchools: [], conflicts: 0 };
  const bump = (k, n = 1) => { out.byCollection[k] = (out.byCollection[k] || 0) + n; out.moved += n; };
  for (const od of olds) {
    const oldId = od.id;
    for (const sid of Object.keys(od.data().schools || {})) {
      const myCtx = (meData.schools || {})[sid];
      if (!myCtx || myCtx.active === false) continue;
      const ss = await db.collection("schoolData").doc(sid).get();
      const school = ss.exists ? ss.data() : null;
      if (!school || school.yearFromMs == null || school.yearToMs == null) { out.skippedSchools.push({ sid, reason: "no-year-config" }); continue; }
      const period = trCurrentPeriod(school, now);

      // (أ) مستندات المعلم الواحدة (سجل الأعمال، المتابعة، الاختبارات، النتائج): معرّفها يتضمن رقم الحساب ⇒ تُنسخ بمعرّف جديد
      for (const col of ["results", "exams"]) {
        const qs = await db.collection(col).where("userId", "==", oldId).get();
        for (const d of qs.docs) {
          const v = d.data();
          if (v.schoolId !== sid || v.period !== period || v.transferredTo) continue;
          if (typeof v.updatedAt !== "number" || v.updatedAt < school.yearFromMs || v.updatedAt > school.yearToMs) continue;
          const newRef = db.collection(col).doc((v.base || "") + "_" + sid + "_" + period + "_" + uid);
          if (!v.base) continue;
          if ((await newRef.get()).exists) { out.conflicts++; continue; }
          await newRef.set(Object.assign({}, v, { userId: uid, transferredFrom: oldId }));
          await d.ref.update({ transferredTo: uid });
          bump(col);
        }
      }

      // (ب) السجلات المنفردة: يتغيّر حقل صاحب السجل فقط
      for (const [col, f] of TR_REC_COLS) {
        const qs = await db.collection(col).where(f, "==", oldId).get();
        let batch = db.batch(), n = 0;
        for (const d of qs.docs) {
          if (!trEligible(d.data(), sid, period, school)) continue;
          batch.update(d.ref, { [f]: uid, transferredFrom: oldId });
          if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
        }
        if (n % 400 !== 0) await batch.commit();
        if (n) bump(col, n);
      }

      // (ج) ملاحظات أُرسلت إليه (هو مستلم)
      const rn = await db.collection("notes").where("recipients", "array-contains", oldId).get();
      for (const d of rn.docs) {
        const v = d.data();
        if (!trEligible(v, sid, period, school)) continue;
        await d.ref.update({ recipients: (v.recipients || []).map((x) => (x === oldId ? uid : x)) });
        bump("notes-recipient");
      }

      // (د) التعاميم: قائمة المستلمين وتوقيعه (المعرّف = رقم الحساب ⇒ نسخ)
      const items = await db.collection("circulars").doc(sid).collection("items").get();
      for (const it of items.docs) {
        const iv = it.data();
        const t = trRecTime(iv);
        if (t == null || t < school.yearFromMs || t > school.yearToMs) continue;
        const rec = iv.recipients || [];
        if (!rec.includes(oldId)) continue;
        const sigNew = it.ref.collection("signatures").doc(uid);
        const sigOld = await it.ref.collection("signatures").doc(oldId).get();
        if (sigOld.exists && !sigOld.data().transferredTo && !(await sigNew.get()).exists) {
          await sigNew.set(Object.assign({}, sigOld.data(), { transferredFrom: oldId }));
          await sigOld.ref.update({ transferredTo: uid });
          bump("circular-signatures");
        }
        await it.ref.update({ recipients: rec.map((x) => (x === oldId ? uid : x)) });
        bump("circular-recipients");
      }

      // (هـ) الزيارات الصفية: خطة المعلم مستند معرّفه يتضمن رقم الحساب ⇒ نسخ بمعرّف جديد (الأصل يبقى أرشيفًا)
      {
        const vq = await db.collection("classVisits").where("teacherId", "==", oldId).get();
        for (const d of vq.docs) {
          const v = d.data();
          if (v.schoolId !== sid || v.period !== period || v.transferredTo) continue;
          if (typeof v.updatedAt !== "number" || v.updatedAt < school.yearFromMs || v.updatedAt > school.yearToMs) continue;
          const newRef = db.collection("classVisits").doc(sid + "_" + period + "_" + uid);
          if ((await newRef.get()).exists) { out.conflicts++; continue; }
          await newRef.set(Object.assign({}, v, { teacherId: uid, transferredFrom: oldId }));
          await d.ref.update({ transferredTo: uid });
          bump("classVisits");
        }
      }

      // (و) خطط المناوبة والإشراف: استبدال المعرّف القديم بالجديد في الخطة والنسخة المعتمدة (المكلَّفون، الأماكن، القائمة، الملاحظات)
      {
        const dq = await db.collection("dutyPlans").where("schoolId", "==", sid).get();
        for (const d of dq.docs) {
          const v = d.data();
          if (v.period !== period) continue;
          if (typeof v.updatedAt !== "number" || v.updatedAt < school.yearFromMs || v.updatedAt > school.yearToMs) continue;
          const { reassignedFrom: _rf, reassignedAt: _ra, ...rest } = v;   // حقلا التتبّع لا يدخلان في الاستبدال (يبقى التشغيل المتكرر بلا أثر)
          const r = trSwapId(rest, oldId, uid);
          if (!r.changed) continue;
          await d.ref.set(Object.assign({}, r.value, { reassignedFrom: oldId, reassignedAt: now }));
          bump("dutyPlans");
        }
      }

      // (ز) الجدول المنشور والانتظار المنشور: المفتاح byUser = معرّف الحساب ⇒ يُعاد ربطه ليظهر «جدولي»/«انتظاري» فورًا
      for (const suffix of ["_published", "_waitpub"]) {
        const tr = db.collection("timetables").doc(sid).collection("data").doc(period + suffix);
        const ts = await tr.get();
        if (!ts.exists) continue;
        const tv = ts.data();
        let pv; try { pv = JSON.parse(tv.value); } catch (e) { continue; }
        if (!pv || !pv.byUser || !(oldId in pv.byUser)) continue;
        if (typeof pv.publishedAt === "number" && (pv.publishedAt < school.yearFromMs || pv.publishedAt > school.yearToMs)) continue;
        if (!(uid in pv.byUser)) pv.byUser[uid] = pv.byUser[oldId];
        delete pv.byUser[oldId];
        await tr.update({ value: JSON.stringify(pv), rev: now, updatedAt: now });
        bump("timetable" + suffix);
      }
    }
  }
  return out;
});

/* =========================================================================
   حذف الحساب (متطلب متجر Google Play — المرحلة ١، ص-٣٦)
   - المعلم الفردي (بلا أي مدرسة): حذف فوري لبياناته وحساب الدخول.
   - موظف المدرسة: لا يحذف مباشرة (سجلاته تخص المدرسة) ⇒ يُسجَّل طلب في deletionRequests
     ويصل بريدًا إلى info@awraqai.com ليُنفَّذ بفك الربط (🔓) من admin العام. السجل يبقى معلّقًا ويمكن إعادة تفعيله.
   - الطالب والأدمن ومدير المدرسة: يُرفض الطلب برسالة توجّه للجهة المناسبة.
   ========================================================================= */
async function delAllWhere(db, col, field, val) {
  const qs = await db.collection(col).where(field, "==", val).get();
  for (let i = 0; i < qs.docs.length; i += 400) {
    const b = db.batch();
    qs.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  return qs.docs.length;
}
exports.deleteMyAccount = onCall({ secrets: [GMAIL_APP_PASSWORD] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  if (request.data && request.data.confirm !== "حذف") throw new HttpsError("invalid-argument", "لم يتم تأكيد الحذف.");
  const uid = request.auth.uid;
  const db = admin.firestore();
  const meSnap = await db.collection("users").doc(uid).get();
  if (!meSnap.exists) {
    const st = await db.collection("studentAccounts").doc(uid).get();
    if (st.exists) throw new HttpsError("failed-precondition", "حسابات الطلاب تُحذف عبر إدارة المدرسة أو بمراسلة info@awraqai.com.");
    throw new HttpsError("not-found", "لا يوجد حساب مرتبط.");
  }
  const me = meSnap.data();
  if (me.role === "admin" || me.role === "schoolAdmin") {
    throw new HttpsError("failed-precondition", "حسابات الإدارة لا تُحذف من هنا. راسل info@awraqai.com.");
  }
  const schools = Object.keys(me.schools || {});
  if (schools.length) {
    await db.collection("deletionRequests").doc(uid).set({
      uid, loginId: me.loginId || null, username: me.username || "", email: me.email || request.auth.token.email || null,
      schools, hasSolo: !!me.solo, status: "pending", requestedAt: Date.now(),
    });
    try {
      const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: "awraqaicom@gmail.com", pass: GMAIL_APP_PASSWORD.value() } });
      await transporter.sendMail({
        from: "awraqaicom@gmail.com", to: "info@awraqai.com", subject: "طلب حذف حساب — منجز المدرسي",
        text: "طلب حذف حساب موظف\nالاسم: " + (me.username || "") + "\nرقم الهوية: " + (me.loginId || "") +
          "\nالبريد: " + (me.email || request.auth.token.email || "") + "\nالمدارس: " + schools.join(", ") +
          "\nالتنفيذ: فك الربط (🔓) من إدارة المستخدمين ثم تعطيل الحساب. المعرّف: " + uid,
      });
    } catch (e) {
      console.error("deleteMyAccount mail", e);
      // (2026-10-13) لا يضيع الطلب: يُعلَّم بفشل البريد ليراه المسؤول في سجل الطلبات
      await db.collection("deletionRequests").doc(uid).update({ mailFailed: true }).catch(() => {});
    }
    return { mode: "request" };
  }
  if (!me.solo) throw new HttpsError("failed-precondition", "لا توجد بيانات للحذف على هذا الحساب.");
  // حذف فوري للمعلم الفردي
  const counts = {};
  await db.collection("schoolData").doc("roster_solo_" + uid).delete().catch(() => {});
  await db.collection("rosterIndex").doc("solo_" + uid).delete().catch(() => {});
  for (const [c, f] of [["results", "userId"], ["exams", "userId"], ["studentNotes", "fromUserId"], ["attendance", "markedBy"],
    ["worksheets", "createdBy"], ["questionBank", "createdBy"], ["submissions", "teacherUid"], ["pushTokens", "authUid"]]) {
    counts[c] = await delAllWhere(db, c, f, uid);
  }
  await db.collection("users").doc(uid).delete();
  try { await admin.auth().deleteUser(uid); } catch (e) { if (!e || e.code !== "auth/user-not-found") console.error("deleteUser", e); }
  return { mode: "deleted", counts };
});

/* =========================================================================
   ص-١٢: الإشعارات الفورية (تطبيق إنجاز) + التذكير الصباحي + ساعات الهدوء
   - رموز الأجهزة: pushTokens/{رمز} = { uid, authUid, sid, … } — يكتبها pwa.js عند «تفعيل الإشعارات».
   - ساعات الهدوء والإجازات: schoolCalendar/{sid} — بند «الإجازات» (المدير والوكيل).
     ما يقع في ساعات الهدوء يُحفظ في pushQueue ويُرسل عند انتهائها (flushPushQueue كل ١٠ دقائق).
   - الضغط على الإشعار يفتح الصفحة المعنية (fcmOptions.link).
   ملاحظة: محفّزات Firestore (onDocumentWritten) لا تعمل في me-central2 (خلل معروف عند Google)،
   فالتغييرات تُراقَب بدالة مجدولة كل دقيقة (pushWatcher) — الإشعار يصل خلال دقيقة تقريبًا.
   ========================================================================= */
// رابط الموقع حسب المشروع: منصة الاختبار أو المنصة الأساسية
const SITE = (process.env.GCLOUD_PROJECT === "injaz-test-14849") ? "https://test.injaz.awraqai.com/" : "https://injaz.awraqai.com/";
const P_ORD = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة"];
const P_WD = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const arNum = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
const ordP = (p) => P_ORD[+p] || arNum(+p + 1);

// الوقت بتوقيت الرياض (UTC+3 ثابت، بلا توقيت صيفي)
function riyadhNow() {
  const d = new Date(Date.now() + 3 * 3600e3);
  return { key: d.toISOString().slice(0, 10), wd: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function addDaysKey(k, n) { const d = new Date(k + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function hijriDay(k) {
  try {
    return new Date(k + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
  } catch (e) { return k; }
}
function relDay(k) {
  const t = riyadhNow().key;
  return k === t ? "اليوم" : k === addDaysKey(t, 1) ? "غدًا" : hijriDay(k);
}
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };
function fmt12(t) {
  const m = toMin(t); if (m == null) return t || "";
  const h = Math.floor(m / 60), mi = m % 60;
  return arNum(((h + 11) % 12) + 1) + ":" + arNum(String(mi).padStart(2, "0")) + (h >= 12 ? " م" : " ص");
}
const parseVal = (snap) => {
  if (!snap || !snap.exists) return null;
  try { return JSON.parse(snap.data().value || "null"); } catch (e) { return null; }
};
const uniq = (a) => [...new Set((a || []).filter(Boolean))];

async function getCalendar(db, sid) {
  try { const s = await db.collection("schoolCalendar").doc(sid).get(); return s.exists ? s.data() : {}; } catch (e) { return {}; }
}
function isHoliday(cal, k) {
  return (cal.holidays || []).some((h) => h && h.from && h.from <= k && k <= (h.to && h.to >= h.from ? h.to : h.from));
}
// نهاية ساعات الهدوء (بالمللي ثانية) إن كنا داخلها الآن، وإلا null
function quietEnd(cal) {
  const q = cal.quiet || {};
  if (!q.on) return null;
  const f = toMin(q.from), t = toMin(q.to);
  if (f == null || t == null || f === t) return null;
  const now = riyadhNow().min;
  const inside = f < t ? (now >= f && now < t) : (now >= f || now < t);
  if (!inside) return null;
  const diff = (t - now + 1440) % 1440;
  return Date.now() + diff * 60000;
}

async function tokensOf(db, uids) {
  const out = [];
  const list = uniq(uids);
  for (let i = 0; i < list.length; i += 30) {
    const q = await db.collection("pushTokens").where("uid", "in", list.slice(i, i + 30)).get();
    q.docs.forEach((d) => out.push({ token: d.id, uid: d.data().uid }));
  }
  return out;
}
async function sendNow(db, uids, msg) {
  const toks = await tokensOf(db, uids);
  if (!toks.length) return 0;
  const link = SITE + (msg.link || "index.html");
  const notification = { title: msg.title, body: msg.body || "", icon: SITE + "icons/icon-192.png", badge: SITE + "icons/badge-72.png", dir: "rtl", lang: "ar" };
  if (msg.tag) notification.tag = msg.tag;
  let sent = 0;
  for (let i = 0; i < toks.length; i += 500) {
    const chunk = toks.slice(i, i + 500);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: chunk.map((t) => t.token),
      data: { link, title: msg.title, body: msg.body || "" },
      webpush: { headers: { Urgency: "high", TTL: "86400" }, notification, fcmOptions: { link } },
    });
    sent += res.successCount;
    const dead = [];
    res.responses.forEach((r, j) => {
      const c = r.error && r.error.code;
      if (c === "messaging/registration-token-not-registered" || c === "messaging/invalid-registration-token" || c === "messaging/invalid-argument") dead.push(chunk[j].token);
    });
    await Promise.all(dead.map((t) => db.collection("pushTokens").doc(t).delete().catch(() => {})));
  }
  return sent;
}
/** إرسال لمستخدمي مدرسة: فورًا، أو يُؤجَّل لنهاية ساعات الهدوء */
async function notify(db, sid, uids, msg, cal) {
  const list = uniq(uids);
  if (!list.length) return;
  const c = cal || await getCalendar(db, sid);
  const qe = quietEnd(c);
  if (qe) {
    await db.collection("pushQueue").add({ sid, uids: list, msg, sendAt: qe, createdAt: Date.now() });
    return;
  }
  try { await sendNow(db, list, msg); } catch (e) { console.error("push", sid, e); }
}

/* =========================================================================
   مراقب التغييرات — دالة مجدولة كل دقيقة (بدل محفّزات Firestore التي لا تعمل في me-central2)
   ما يتغير يصل إشعاره خلال دقيقة تقريبًا. الحالة السابقة في pushState/* (للخادم فقط).
   أول تشغيل: يسجّل الوضع الحالي بصمت ولا يرسل شيئًا عن الماضي.
   ========================================================================= */
const OVERLAP = 3 * 60 * 1000;   // تداخل زمني آمن لفروق ساعة الأجهزة؛ التكرار يمنعه سجل المعرّفات المُشعَرة

/* (هـ) تغيّر الجدول بعد النشر · (أ) انتظار حُدِّد له عند «اعتماد وإرسال» */
async function hPublished(db, sid, before, after, cal) {
  const bu = (before && before.byUser) || {}, au = (after && after.byUser) || {};
  const changed = [], fresh = [];
  Object.keys(au).forEach((uid) => {
    const sa = (au[uid] || {}).sig || "";
    if (!bu[uid]) fresh.push(uid);
    else if (((bu[uid] || {}).sig || "") !== sa) changed.push(uid);
  });
  await notify(db, sid, fresh, { title: "نُشر جدولك الدراسي", body: "اضغط للاطّلاع على جدولك", link: "myschedule.html", tag: "sched" }, cal);
  await notify(db, sid, changed, { title: "تغيّر جدولك الدراسي", body: "عُدِّل جدولك بعد النشر — اضغط للاطّلاع على التعديل", link: "myschedule.html", tag: "sched" }, cal);
}
async function hWaitDay(db, sid, date, before, after, cal) {
  if (!after || !after.sent || date < riyadhNow().key) return;
  if (before && before.sent && before.sentAt === after.sentAt) return;
  const key = (i) => [i.subUid, i.st, i.p, i.cls].join("|");
  const old = new Set(before && before.sent ? (before.items || []).filter((i) => i.subUid).map(key) : []);
  const byU = {};
  (after.items || []).filter((i) => i.subUid && !old.has(key(i))).forEach((i) => { (byU[i.subUid] = byU[i.subUid] || []).push(i); });
  for (const uid of Object.keys(byU)) {
    const items = byU[uid].sort((a, b) => a.p - b.p);
    await notify(db, sid, [uid], {
      title: "حصة انتظار " + relDay(date),
      body: items.map((i) => "الحصة " + ordP(i.p) + ": " + (i.clsLabel || i.cls || "") + (i.subj ? " (" + i.subj + ")" : "")).join(" · "),
      link: "myday.html", tag: "wait-" + date,
    }, cal);
  }
}
/* (ب) تعميم جديد يحتاج توقيعه (تعميم المناوبة يُغني عنه إشعار الاعتماد) */
async function hCircular(db, sid, c, cal) {
  if (!c || !c.mandatory || c.source === "duty") return;
  const fresh = (c.recipients || []).filter((u) => u !== c.createdBy);
  await notify(db, sid, fresh, { title: "تعميم جديد يحتاج توقيعك", body: "رقم " + arNum(c.number || "") + (c.title ? ": " + c.title : ""), link: "circulars.html", tag: "circ" }, cal);
}
/* (ج) اعتماد المناوبة والإشراف */
async function hDuty(db, sid, d, cal) {
  const pub = d.pub;
  await notify(db, sid, pub.members || d.members || [], {
    title: "اعتُمدت مناوبتك وإشرافك",
    body: (pub.stageLabel ? pub.stageLabel + " — " : "") + (pub.circular ? "وقّع على التعميم رقم " + arNum(pub.circular.number) + " للاستلام" : "اضغط للاطّلاع"),
    link: "myday.html", tag: "duty",
  }, cal);
}
/* (د) زيارة صفية جُدولت له (أو عُدِّل موعدها) */
const visitSig = (v) => (v && v.date ? [v.date, v.p, v.cls].join("|") : "");
async function hVisit(db, sid, v, prev, cal) {
  const today = riyadhNow().key;
  const lines = [];
  [["v1", "الأولى"], ["v2", "الثانية"]].forEach(([k, label]) => {
    const x = v[k];
    if (!visitSig(x) || visitSig(x) === (prev || {})[k] || x.date < today) return;
    lines.push("الزيارة " + label + ": " + relDay(x.date) + (x.p !== "" && x.p != null ? " — الحصة " + ordP(x.p) : ""));
  });
  if (!lines.length) return;
  await notify(db, sid, [v.teacherId], { title: "زيارة صفية مجدولة", body: lines.join(" · "), link: "myday.html", tag: "visit" }, cal);
}
/* (و) تحويل جديد وصله (للمعلم والمدير والوكيل وكل مستلم) */
async function hNote(db, n, cal) {
  const to = (n.recipients || []).filter((u) => u !== n.fromUserId);
  const who = n.studentName ? n.studentName + (n.className ? " — " + n.className : "") : String(n.text || "").slice(0, 80);
  await notify(db, n.schoolId, to, {
    title: n.studentName ? "تحويل جديد" : "ملاحظة جديدة",
    body: (n.fromName ? "من " + n.fromName + ": " : "") + who,
    link: "index.html?tab=received", tag: "note",
  }, cal);
}
/* (ح) طالب حضّره معلم وهو مسجّل غائب — للمدير والوكيل */
async function hAttAlert(db, a, cal) {
  const sid = a.schoolId, to = [];
  const sa = await db.collection("users").where("adminSchools", "array-contains", sid).get();
  sa.docs.forEach((d) => { const u = d.data(); if (u.role === "schoolAdmin" && u.active !== false) to.push(d.id); });
  const ag = await db.collection("users").where(new admin.firestore.FieldPath("schools", sid, "role"), "==", "agent").get();
  ag.docs.forEach((d) => { const u = d.data(); const c = (u.schools || {})[sid] || {}; if (u.active !== false && c.active !== false && !u.migratedTo) to.push(d.id); });
  await notify(db, sid, to, {
    title: "طالب حضّره معلم وهو مسجّل غائب",
    body: (a.name || "") + (a.className ? " — " + a.className : "") + (a.byName ? " · المعلم: " + a.byName : ""),
    link: "index.html?tab=absence", tag: "att",
  }, cal);
}


/* ===== منصة النشاط المدرسي (البند ٧-ب): إشعارات التكليف والتوثيق والخطة ===== */
async function schoolAdminIds(db, sid) {
  const sa = await db.collection("users").where("adminSchools", "array-contains", sid).get();
  return sa.docs.filter((d) => { const u = d.data(); return u.role === "schoolAdmin" && u.active !== false; }).map((d) => d.id);
}
async function actCoordinatorOf(db, sid, period) {
  // رائد النشاط = مقرر مجلس النشاط
  try { const c = await db.collection("activityCouncil").doc(sid + "_" + (period || "first")).get(); return c.exists ? (c.data().secretaryId || null) : null; } catch (e) { return null; }
}
async function hActAssignment(db, a, cal, kind) {
  if (kind === "pending") {
    await notify(db, a.schoolId, await schoolAdminIds(db, a.schoolId), { title: "تكليف نشاط بانتظار اعتمادك", body: (a.teacherName || "") + (a.clubName ? " — " + a.clubName : ""), link: "activity.html", tag: "act" }, cal);
  } else if (kind === "approved" && a.teacherId) {
    await notify(db, a.schoolId, [a.teacherId], { title: "كُلِّفت بنشاط", body: (a.clubName || "") + ((a.programs || [])[0] ? " — " + a.programs[0].name : ""), link: "myactivities.html", tag: "act" }, cal);
  }
}
async function hActEvent(db, e, cal, kind) {
  if (kind === "pending") {
    const to = uniq([await actCoordinatorOf(db, e.schoolId, e.period)]);
    if (to.length) await notify(db, e.schoolId, to, { title: "توثيق نشاط بانتظار اعتمادك", body: (e.documentedByName || "") + " — " + (e.title || ""), link: "activity.html", tag: "act" }, cal);
  } else if (kind === "approved" && e.documentedBy) {
    await notify(db, e.schoolId, [e.documentedBy], { title: "اعتُمد توثيق نشاطك", body: e.title || "", link: "myactivities.html", tag: "act" }, cal);
  } else if (kind === "returned" && e.documentedBy) {
    await notify(db, e.schoolId, [e.documentedBy], { title: "أُعيد توثيق نشاطك للتعديل", body: (e.title || "") + (e.returnNote ? " — " + e.returnNote : ""), link: "myactivities.html", tag: "act" }, cal);
  }
}
async function hActPlan(db, c, cal, kind, label) {
  // label: اسم الخطة (نادٍ أو «فعاليات المسار العام»)
  const what = label || "الخطة العامة للنشاط";
  if (kind === "submitted") {
    await notify(db, c.schoolId, await schoolAdminIds(db, c.schoolId), { title: "خطة نشاط بانتظار اعتمادك", body: what + " — قدّمها رائد النشاط", link: "activity.html", tag: "act" }, cal);
  } else if (kind === "approved" || kind === "returned") {
    const to = uniq([await actCoordinatorOf(db, c.schoolId, c.period)]);
    if (to.length) await notify(db, c.schoolId, to, { title: kind === "approved" ? "اعتُمدت خطة نشاط" : "أُعيدت خطة نشاط للتعديل", body: what + (kind === "returned" && c.__note ? " — " + c.__note : ""), link: "activity.html", tag: "act" }, cal);
  }
}

exports.pushWatcher = onSchedule({ schedule: "every 1 minutes", timeZone: "Asia/Riyadh", timeoutSeconds: 180 }, async () => {
  const db = admin.firestore(), ST = db.collection("pushState");
  const t0 = Date.now();
  const wmRef = ST.doc("wm"), seenRef = ST.doc("seen");
  const wmS = await wmRef.get();
  if (!wmS.exists) {   // أول تشغيل: لا إشعارات عن الماضي
    await wmRef.set({ at: t0 });
    console.log("pushWatcher: baseline");
  }
  const wm = wmS.exists ? (wmS.data().at || t0) : t0;
  const since = wm - OVERLAP;
  const seenS = await seenRef.get();
  const seen = new Set(seenS.exists ? (seenS.data().ids || []) : []);
  const calMemo = {};
  const calOf = async (sid) => (calMemo[sid] = calMemo[sid] || await getCalendar(db, sid));
  const mark = (id) => { if (seen.has(id)) return false; seen.add(id); return true; };
  const baselineOnly = !wmS.exists;
  const { key: today } = riyadhNow();
  const tomorrow = addDaysKey(today, 1);
  const nowMs = Date.now();

  // المدارس
  const schools = await db.collection("schoolData").where("_isSchool", "==", true).get();
  for (const s of schools.docs) {
    const sid = s.id, sd = s.data();
    if (sd.active === false) continue;
    try {
      const period = sd.activePeriod || "first";
      const ttc = db.collection("timetables").doc(sid).collection("data");
      const stRef = ST.doc("s_" + sid);
      const stS = await stRef.get();
      const state = stS.exists ? stS.data() : {};
      const next = { docs: Object.assign({}, state.docs || {}), duty: Object.assign({}, state.duty || {}) };
      let dirty = false;

      // الجدول المنشور + تحديد الانتظار اليومي
      const ids = [period + "_published", period + "_wday_" + today, period + "_wday_" + tomorrow];
      for (const id of ids) {
        const snap = await ttc.doc(id).get();
        if (!snap.exists) continue;
        const raw = snap.data(), rev = raw.rev || 0;
        const prev = next.docs[id];
        if (prev && prev.rev === rev) continue;
        let after = null; try { after = JSON.parse(raw.value || "null"); } catch (e) {}
        if (!after) continue;
        const isPub = id === period + "_published";
        const recent = nowMs - (raw.updatedAt || 0) < 10 * 60 * 1000;
        if (!baselineOnly && (prev || recent)) {
          const cal = await calOf(sid);
          if (isPub) await hPublished(db, sid, prev ? { byUser: prev.sigs } : null, after, cal);
          else await hWaitDay(db, sid, id.split("_wday_")[1], prev ? prev.wd : null, after, cal);
        }
        next.docs[id] = isPub
          ? { rev, sigs: Object.fromEntries(Object.keys(after.byUser || {}).map((u) => [u, { sig: ((after.byUser[u] || {}).sig) || "" }])) }
          : { rev, wd: { sent: !!after.sent, sentAt: after.sentAt || 0, items: (after.items || []).filter((i) => i.subUid).map((i) => ({ subUid: i.subUid, st: i.st, p: i.p, cls: i.cls })) } };
        dirty = true;
      }
      // أيام مضت: نظّف حالتها
      Object.keys(next.docs).forEach((k) => { const m = /_wday_(\d{4}-\d{2}-\d{2})$/.exec(k); if (m && m[1] < today) { delete next.docs[k]; dirty = true; } });

      // التعاميم الجديدة
      const cq = await db.collection("circulars").doc(sid).collection("items").where("createdAt", ">", since).get();
      for (const d of cq.docs) {
        if (!mark("c_" + sid + "_" + d.id)) continue;
        if (!baselineOnly) await hCircular(db, sid, d.data(), await calOf(sid));
      }

      // اعتماد المناوبة
      const dq = await db.collection("dutyPlans").where("schoolId", "==", sid).get();
      for (const d of dq.docs) {
        const v = d.data(); if (!v.pub) continue;
        const at = v.pub.at || 0;
        if (next.duty[d.id] === at) continue;
        const had = next.duty[d.id] != null;
        next.duty[d.id] = at; dirty = true;
        if (!baselineOnly && (had || nowMs - at < 10 * 60 * 1000)) await hDuty(db, sid, v, await calOf(sid));
      }
      if (dirty) await stRef.set(next);
    } catch (e) { console.error("pushWatcher school", sid, e); }
  }

  // الزيارات الصفية (تغيّرت مؤخرًا)
  try {
    const vq = await db.collection("classVisits").where("updatedAt", ">", since).get();
    for (const d of vq.docs) {
      const v = d.data();
      if (v.kind !== "plan" || !v.teacherId || !v.schoolId) continue;
      const vsRef = ST.doc("vs_" + v.schoolId), vsS = await vsRef.get();
      const vs = vsS.exists ? vsS.data() : {};
      const prev = vs[d.id] || null;
      const cur = { v1: visitSig(v.v1), v2: visitSig(v.v2) };
      if (prev && prev.v1 === cur.v1 && prev.v2 === cur.v2) continue;
      await vsRef.set({ [d.id]: cur }, { merge: true });
      if (!baselineOnly) await hVisit(db, v.schoolId, v, prev, await calOf(v.schoolId));
    }
  } catch (e) { console.error("pushWatcher visits", e); }

  // التحويلات الجديدة
  try {
    const nq = await db.collection("notes").where("createdAt", ">", since).get();
    for (const d of nq.docs) {
      const n = d.data(); if (!n.schoolId || !mark("n_" + d.id)) continue;
      if (!baselineOnly) await hNote(db, n, await calOf(n.schoolId));
    }
  } catch (e) { console.error("pushWatcher notes", e); }

  // تنبيهات الغياب
  try {
    const aq = await db.collection("attAlerts").where("ts", ">", since).get();
    for (const d of aq.docs) {
      const a = d.data(); if (!a.schoolId || a.resolved === true || !mark("a_" + d.id)) continue;
      if (!baselineOnly) await hAttAlert(db, a, await calOf(a.schoolId));
    }
  } catch (e) { console.error("pushWatcher alerts", e); }


  // منصة النشاط المدرسي: تكليفات وتوثيقات واعتماد الخطة (مستند واحد لكل حالة جديدة — mark يمنع التكرار)
  try {
    const asq = await db.collection("actAssignments").where("updatedAt", ">", since).get();
    for (const d of asq.docs) {
      const a = d.data(); if (!a.schoolId) continue;
      const kind = a.status === "pending" ? "pending" : (a.status === "approved" ? "approved" : null);
      if (!kind || !mark("asg_" + kind + "_" + d.id + "_" + (a.updatedAt || 0))) continue;
      if (!baselineOnly) await hActAssignment(db, a, await calOf(a.schoolId), kind);
    }
    const evq = await db.collection("activityEvents").where("updatedAt", ">", since).get();
    for (const d of evq.docs) {
      const e = d.data(); if (!e.schoolId || e.sourceType === "club") continue;
      const kind = e.approvalStatus;
      if (!["pending", "approved", "returned"].includes(kind) || !mark("aev_" + kind + "_" + d.id + "_" + (e.updatedAt || 0))) continue;
      if (!baselineOnly) await hActEvent(db, e, await calOf(e.schoolId), kind);
    }
    const cfq = await db.collection("activityConfig").where("updatedAt", ">", since).get();
    for (const d of cfq.docs) {
      const c = d.data(); if (!c.schoolId) continue;
      let kind = null, ts = 0;
      if (c.generalState === "submitted") { kind = "submitted"; ts = c.generalSubmittedAt || 0; }
      else if (c.generalState === "approved") { kind = "approved"; ts = c.generalApprovedAt || 0; }
      else if (c.generalState === "draft" && c.generalReturnNote) { kind = "returned"; ts = c.generalReturnedAt || 0; }
      if (!kind || !ts || !mark("acf_" + kind + "_" + d.id + "_" + ts)) continue;
      if (!baselineOnly) await hActPlan(db, Object.assign({}, c, { __note: c.generalReturnNote }), await calOf(c.schoolId), kind, "فعاليات المسار العام");
    }
    const clq = await db.collection("activityClubs").where("updatedAt", ">", since).get();
    for (const d of clq.docs) {
      const c = d.data(); if (!c.schoolId) continue;
      let kind = null, ts = 0;
      if (c.planState === "submitted") { kind = "submitted"; ts = c.planSubmittedAt || 0; }
      else if (c.planState === "approved") { kind = "approved"; ts = c.planApprovedAt || 0; }
      else if (c.planState === "draft" && c.planReturnNote) { kind = "returned"; ts = c.planReturnedAt || 0; }
      if (!kind || !ts || !mark("acl_" + kind + "_" + d.id + "_" + ts)) continue;
      if (!baselineOnly) await hActPlan(db, Object.assign({}, c, { __note: c.planReturnNote }), await calOf(c.schoolId), kind, "خطة " + (c.name || "النادي"));
    }
  } catch (e) { console.error("pushWatcher activity", e); }

  await seenRef.set({ ids: [...seen].slice(-800) });
  await wmRef.set({ at: t0 });
});

/* التذكير الصباحي ٦:٥٠ من الأحد إلى الخميس — ملخص يوم كل من فعّل الإشعارات، ولا يُرسل في أيام الإجازة.
   (ز) مواعيد أولياء الأمور اليوم تصل صاحبها (الوكيل/الموجه) ضمن الملخص. */
exports.morningReminder = onSchedule({ schedule: "50 6 * * 0-4", timeZone: "Asia/Riyadh" }, async () => {
  const db = admin.firestore();
  const { key: k, wd: w } = riyadhNow();
  const schools = await db.collection("schoolData").where("_isSchool", "==", true).get();
  let total = 0;
  for (const s of schools.docs) {
    const sd = s.data(), sid = s.id;
    if (sd.active === false) continue;
    try {
      const tk = await db.collection("pushTokens").where("sid", "==", sid).get();
      if (tk.empty) continue;
      const cal = await getCalendar(db, sid);
      if (isHoliday(cal, k)) continue;
      const period = sd.activePeriod || "first";
      const ttc = db.collection("timetables").doc(sid).collection("data");
      const pub = parseVal(await ttc.doc(period + "_published").get()) || {};
      const wday = parseVal(await ttc.doc(period + "_wday_" + k).get());
      const plans = (await db.collection("dutyPlans").where("schoolId", "==", sid).get()).docs.map((d) => d.data()).filter((v) => v.period === period && v.pub);
      const visits = (await db.collection("classVisits").where("schoolId", "==", sid).get()).docs.map((d) => d.data()).filter((v) => v.kind === "plan" && v.period === period);
      const appts = (await db.collection("guidanceAppointments").where("schoolId", "==", sid).get()).docs.map((d) => d.data()).filter((a) => a.date === k && a.status === "scheduled");
      const uids = uniq(tk.docs.map((d) => d.data().uid));
      for (const uid of uids) {
        const parts = [];
        if (plans.some((v) => ((v.pub.dutyDays || {})[k] || []).includes(uid))) parts.push("مناوبة");
        const n = ((((pub.byUser || {})[uid] || {}).lessons) || []).filter((l) => l.d === w).reduce((x, l) => x + (l.n || 1), 0);
        if (n) parts.push(n === 1 ? "حصة واحدة" : n === 2 ? "حصتان" : arNum(n) + (n <= 10 ? " حصص" : " حصة"));
        if (wday && wday.sent) (wday.items || []).filter((i) => i.subUid === uid).sort((a, b) => a.p - b.p).forEach((i) => parts.push("انتظار الحصة " + ordP(i.p)));
        plans.forEach((v) => {
          const evL = {}; (v.pub.events || []).forEach((e) => { evL[e.key] = e.label; });
          const plL = {}; (v.pub.places || []).forEach((p) => { plL[p.id] = p.name; });
          const byEv = (v.pub.sup || {})[w] || {};
          Object.keys(byEv).forEach((ev) => Object.keys(byEv[ev] || {}).forEach((pl) => {
            if ((byEv[ev][pl] || []).includes(uid)) parts.push("إشراف " + (evL[ev] || "") + (plL[pl] ? " (" + plL[pl] + ")" : ""));
          }));
        });
        visits.filter((v) => v.teacherId === uid).forEach((v) => [v.v1, v.v2].forEach((x) => {
          if (x && x.date === k) parts.push("زيارة صفية" + (x.p !== "" && x.p != null ? " الحصة " + ordP(x.p) : ""));
        }));
        appts.filter((a) => a.byUserId === uid).sort((a, b) => String(a.time).localeCompare(String(b.time)))
          .forEach((a) => parts.push("موعد ولي أمر " + fmt12(a.time)));
        if (!parts.length) continue;
        await notify(db, sid, [uid], { title: "صباح الخير — يومك", body: "اليوم: " + parts.join(" · "), link: "myday.html", tag: "morning-" + k }, cal);
        total++;
      }
    } catch (e) { console.error("morningReminder", sid, e); }
  }
  console.log("morningReminder: users", total);
});

/* إرسال ما أُجِّل في ساعات الهدوء عند انتهائها */
exports.flushPushQueue = onSchedule({ schedule: "every 10 minutes", timeZone: "Asia/Riyadh" }, async () => {
  const db = admin.firestore();
  const q = await db.collection("pushQueue").where("sendAt", "<=", Date.now()).limit(300).get();
  for (const d of q.docs) {
    const v = d.data();
    try { await sendNow(db, v.uids || [], v.msg || {}); } catch (e) { console.error("flushPushQueue", d.id, e); }
    await d.ref.delete().catch(() => {});
  }
});


/* [ADMIN-TOOLS:BEGIN] */
/* ============ شاشات التميز (ص-٣٧): اقتران تلفازات العرض بالمدرسة والقناة ============
   التطبيق على التلفاز يدخل مجهولًا (Anonymous Auth) فيكون uid الدخول = معرّف الشاشة.
   screenRequestCode (من التلفاز) ← رمز ٦ أرقام يصدره الخادم بعملية ذرية (لا يتكرر بين رمزين فعّالين).
   screenPeek / screenClaim (من مدير المدرسة أو المفوَّض «شاشة التميز» تعديل) ← يعاين الجهاز ثم يربطه بمدرسته وقناته.
   pairings/{الرمز} و screenClaimAttempts/{uid} مغلقة على العميل بالقواعد؛ هذه الدوال وحدها تكتب فيها. */
const exCrypto = require("crypto");
const EX_CHANNELS = ["public", "teachers", "admins"];
const EX_CODE_TTL_MS = 10 * 60 * 1000;
const EX_MAX_SCREENS = 30;

function exCanManage(u, sid) {
  if (!u || u.active === false || !sid) return false;
  if (u.role === "schoolAdmin") return (u.adminSchools || []).includes(sid);
  const c = (u.schools || {})[sid];
  if (!c || c.active === false) return false;
  const p = (c.permissions || {})["tools.excellence"];
  return !!(p && p.edit === true);
}
async function exAssertManager(db, request, sid) {
  if (!request.auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  const me = await db.collection("users").doc(request.auth.uid).get();
  if (!me.exists || !exCanManage(me.data(), sid)) throw new HttpsError("permission-denied", "ليست لديك صلاحية إدارة شاشة التميز في هذه المدرسة.");
  return me.data();
}
// ٨ محاولات فاشلة كل ١٠ دقائق كحد أقصى لكل مدير
async function exAttemptGate(db, uid) {
  const ref = db.collection("screenClaimAttempts").doc(uid);
  const now = Date.now();
  const s = await ref.get();
  const fails = ((s.exists && s.data().fails) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (fails.length >= 8) throw new HttpsError("resource-exhausted", "محاولات كثيرة خاطئة. حاول بعد قليل.");
  return { ref, fails, now };
}
async function exFail(gate) { await gate.ref.set({ fails: gate.fails.concat([gate.now]) }); }

exports.screenRequestCode = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول.");
  const uid = request.auth.uid;
  const db = admin.firestore();
  const dev = request.data && request.data.device ? request.data.device : {};
  const device = {
    model: String(dev.model || "").slice(0, 60),
    platform: String(dev.platform || "").slice(0, 30),
    app: String(dev.app || "").slice(0, 20),
  };
  // مقترنة أصلًا؟
  const sc = await db.collection("screens").doc(uid).get();
  if (sc.exists) return { paired: true };
  const now = Date.now();
  // رمز فعّال سابق لنفس الجهاز: نعيده بدل إصدار آخر
  const prev = await db.collection("pairings").where("uid", "==", uid).get();
  for (const d of prev.docs) {
    const v = d.data();
    if (v.expiresAt > now + 30000) return { code: d.id, expiresAt: v.expiresAt };
    await d.ref.delete();
  }
  for (let i = 0; i < 15; i++) {
    const code = String(100000 + exCrypto.randomInt(900000));
    const ref = db.collection("pairings").doc(code);
    const ok = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists && s.data().expiresAt > now) return false;
      tx.set(ref, { uid, device, createdAt: now, expiresAt: now + EX_CODE_TTL_MS });
      return true;
    });
    if (ok) return { code, expiresAt: now + EX_CODE_TTL_MS };
  }
  throw new HttpsError("unavailable", "تعذّر إصدار رمز. أعد المحاولة.");
});

exports.screenPeek = onCall(async (request) => {
  const db = admin.firestore();
  const sid = request.data && request.data.sid;
  const code = String((request.data && request.data.code) || "").trim();
  await exAssertManager(db, request, sid);
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "الرمز ٦ أرقام.");
  const gate = await exAttemptGate(db, request.auth.uid);
  const s = await db.collection("pairings").doc(code).get();
  if (!s.exists || s.data().expiresAt < Date.now()) { await exFail(gate); throw new HttpsError("not-found", "الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا من التلفاز."); }
  const v = s.data();
  return { device: v.device || {}, createdAt: v.createdAt, expiresAt: v.expiresAt };
});

exports.screenClaim = onCall(async (request) => {
  const db = admin.firestore();
  const d = request.data || {};
  const sid = d.sid, code = String(d.code || "").trim(), channel = d.channel;
  const name = String(d.name || "").trim().slice(0, 40);
  const me = await exAssertManager(db, request, sid);
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "الرمز ٦ أرقام.");
  if (!EX_CHANNELS.includes(channel)) throw new HttpsError("invalid-argument", "قناة غير صحيحة.");
  if (!name) throw new HttpsError("invalid-argument", "اكتب اسمًا للشاشة.");
  const gate = await exAttemptGate(db, request.auth.uid);
  const count = (await db.collection("screens").where("schoolId", "==", sid).get()).size;
  if (count >= EX_MAX_SCREENS) throw new HttpsError("failed-precondition", "بلغت المدرسة الحد الأقصى للشاشات (" + EX_MAX_SCREENS + ").");
  const pref = db.collection("pairings").doc(code);
  const now = Date.now();
  const res = await db.runTransaction(async (tx) => {
    const s = await tx.get(pref);
    if (!s.exists || s.data().expiresAt < now) return null;
    const v = s.data();
    tx.set(db.collection("screens").doc(v.uid), {
      schoolId: sid, channel, name, device: v.device || {}, active: true,
      pairedAt: now, pairedBy: request.auth.uid, pairedByName: me.username || "", lastSeen: null, updatedAt: now,
    });
    tx.delete(pref);
    return v.uid;
  });
  if (!res) { await exFail(gate); throw new HttpsError("not-found", "الرمز غير صحيح أو انتهت صلاحيته."); }
  return { id: res };
});

// تنظيف الرموز المنتهية (كل ساعة)
exports.cleanupScreenPairings = onSchedule({ schedule: "every 60 minutes", timeZone: "Asia/Riyadh" }, async () => {
  const db = admin.firestore();
  const old = await db.collection("pairings").where("expiresAt", "<", Date.now() - 60 * 60 * 1000).limit(300).get();
  const b = db.batch();
  old.docs.forEach((d) => b.delete(d.ref));
  if (!old.empty) await b.commit();
});
/* [ADMIN-TOOLS:END] */

/* ============================================================================================
   الأمان (2026-10-12): دوال تحل محل قراءات/كتابات مجموعة users وstudentAccounts الواسعة من المتصفح
   بعد تضييق firestore.rules: لا يقرأ أي مستخدم مستندات الآخرين مباشرة ولا يكتب صلاحياته بنفسه.
   كل الدوال تتحقق من المستدعي سيرفريًا. لا مجموعات جديدة تُفتح للعميل (secAttempts وsystemCounters مغلقتان).
   ============================================================================================ */
const secDb = () => admin.firestore();
const secFV = admin.firestore.FieldValue;
const secMsg = (code, m) => new HttpsError(code, m);

function secIsAdmin(u) { return !!u && u.role === "admin" && u.active !== false; }
function secAdminSchools(u) { return (u && u.role === "schoolAdmin" && u.active !== false) ? (u.adminSchools || []) : []; }
function secIsSchoolAdminOf(u, sid) { return !!sid && secAdminSchools(u).includes(sid); }
function secStaffCtx(u, sid) {
  const c = ((u && u.schools) || {})[sid];
  return (c && c.active !== false) ? c : null;
}
function secPerm(ctx, key, f) { const p = ((ctx && ctx.permissions) || {})[key]; return !!(p && p[f] === true); }
function secEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && exCrypto.timingSafeEqual(x, y);
}
function secMask(email) {
  if (!email) return "غير معروف";
  const parts = String(email).split("@");
  return parts[0].slice(0, 2) + "***@" + (parts[1] || "");
}
async function secCaller(request, opts) {
  if (!request.auth) throw secMsg("unauthenticated", "يجب تسجيل الدخول أولاً.");
  const tok = request.auth.token || {};
  if (tok.firebase && tok.firebase.sign_in_provider === "anonymous") throw secMsg("permission-denied", "هذا الإجراء غير متاح لهذا النوع من الدخول.");
  const s = await secDb().collection("users").doc(request.auth.uid).get();
  const out = { uid: request.auth.uid, tok, ref: s.ref, exists: s.exists, data: s.exists ? s.data() : null };
  if (opts && opts.needDoc && !out.exists) throw secMsg("permission-denied", "لا يوجد حساب مرتبط بهذا الدخول.");
  // (2026-10-14.3) إغلاق كامل بعد نهاية العام الدراسي: لا يعمل أحد غير أدمن النظام (إلا ما نصّ عليه allowClosed)
  if (!(opts && opts.allowClosed) && !secIsAdmin(out.data)) {
    const cal = await secCalendar();
    if (secYearEnded(cal, Date.now())) throw secYearClosedError(cal);
  }
  return out;
}
/* ===== (2026-10-14.3) الإغلاق الكامل بعد نهاية العام =====
   settings/academicCalendar.endMs هو آخر لحظة في العام (23:59:59.999 بتوقيت الرياض). بعدها يُغلق النظام لكل المستخدمين
   عدا أدمن النظام، حتى يُحفظ تقويم عام جديد (endMs أبعد). تُخزَّن قراءة التقويم دقيقة واحدة في ذاكرة الدالة. */
let SEC_CAL_CACHE = { at: 0, v: null };
async function secCalendar(force) {
  const dtc = Date.now() - SEC_CAL_CACHE.at;
  if (!force && SEC_CAL_CACHE.at && dtc >= 0 && dtc < 60000) return SEC_CAL_CACHE.v;
  const s = await secDb().collection("settings").doc("academicCalendar").get();
  SEC_CAL_CACHE = { at: Date.now(), v: s.exists ? s.data() : null };
  return SEC_CAL_CACHE.v;
}
function secYearEnded(cal, nowMs) { return !!cal && typeof cal.endMs === "number" && nowMs > cal.endMs; }
function secYearClosedError(cal) {
  return new HttpsError("failed-precondition",
    "انتهى العام الدراسي" + (cal && cal.year ? " " + cal.year : "") + "، والنظام مغلق إلى حين اعتماد العام الدراسي الجديد. للاستفسار تواصل مع إدارة النظام.",
    { yearClosed: true, year: (cal && cal.year) || null });
}
// محاولات فاشلة محدودة لكل مفتاح (سجل في secAttempts — مغلق على العميل)
async function secGate(key, max, windowMs) {
  const ref = secDb().collection("secAttempts").doc(key);
  const now = Date.now();
  const s = await ref.get();
  const fails = ((s.exists && s.data().fails) || []).filter((t) => now - t < windowMs);
  if (fails.length >= max) throw secMsg("resource-exhausted", "محاولات خاطئة كثيرة. حاول بعد قليل.");
  return { ref, fails, now };
}
// هل هذا الدخول/البريد لحساب طالب مسجَّل؟ (يمنع أن يصير الطالب معلمًا بنفس البريد)
async function secIsStudent(uid, email) {
  const db = secDb();
  if ((await db.collection("studentAccounts").doc(uid).get()).exists) return true;
  const ems = Array.from(new Set([String(email || "").trim(), String(email || "").trim().toLowerCase()])).filter(Boolean);
  for (const e of ems) {
    if (!(await db.collection("studentAccounts").where("email", "==", e).limit(1).get()).empty) return true;
  }
  return false;
}
const SEC_STUDENT_MSG = "هذا البريد مسجَّل كحساب طالب، ولا يمكن استخدامه لحساب معلم أو منسوب مدرسة. استخدم بريدًا آخر.";
async function secFail(g) { await g.ref.set({ fails: g.fails.concat([g.now]) }); }

// هل يملك المستدعي صلاحية «مدير» على مستخدمي هذه المدرسة (يرى أرقام الهوية والبريد وكلمات المرور الأولية للمعلَّقين)؟
function secIsUserManager(u, sid) {
  if (secIsAdmin(u)) return true;
  if (secIsSchoolAdminOf(u, sid)) return true;
  const c = secStaffCtx(u, sid);
  return !!c && (secPerm(c, "index.users", "access") || secPerm(c, "tools.timetable", "access") || secPerm(c, "tools.timetable", "edit"));
}
const SEC_SENSITIVE = ["password", "loginId", "email", "googleEmail", "mergeRequestAt", "mergeRequestTarget"];

/* قائمة مستخدمي مدرسة (أو كل المستخدمين للأدمن العام بلا schoolId).
   الأدمن العام ومدير المدرسة ومن لديه «المستخدمون»/«الجدول المدرسي» يرون أرقام الهوية والبريد، وكلمة المرور الأولية
   للسجلات المعلَّقة تُعاد لمدير المدرسة والأدمن فقط. غيرهم يرى الأسماء والسياق الوظيفي بلا حقول حساسة. */
exports.listSchoolUsers = onCall(async (request) => {
  const me = await secCaller(request, { needDoc: true });
  const u = me.data;
  const sid = request.data && request.data.schoolId ? String(request.data.schoolId) : null;
  const isAdm = secIsAdmin(u);
  if (!isAdm) {
    if (!sid) throw secMsg("invalid-argument", "حدّد المدرسة.");
    if (!(secIsSchoolAdminOf(u, sid) || secStaffCtx(u, sid))) throw secMsg("permission-denied", "ليست لديك صلاحية على هذه المدرسة.");
  }
  const db = secDb();
  const byId = new Map();
  if (!sid) {
    (await db.collection("users").get()).docs.forEach((d) => byId.set(d.id, d));
  } else {
    const col = db.collection("users");
    const FP = admin.firestore.FieldPath;
    const [a, b, c] = await Promise.all([
      col.where(new FP("schools", sid, "role"), ">=", "").get(),
      col.where("schoolId", "==", sid).get(),
      col.where("adminSchools", "array-contains", sid).get(),
    ]);
    [a, b, c].forEach((qs) => qs.docs.forEach((d) => byId.set(d.id, d)));
  }
  const mgr = sid ? secIsUserManager(u, sid) : isAdm;
  const pwOk = isAdm || (sid && secIsSchoolAdminOf(u, sid));
  const wantIds = !!(request.data && request.data.withIds);
  const users = [];
  byId.forEach((d, id) => {
    const x = d.data();
    const out = Object.assign({}, x);
    const pending = !x.authUid;
    if (!(pending && pwOk)) delete out.password;
    if (!(mgr && (wantIds || pwOk))) { SEC_SENSITIVE.forEach((k) => { if (k !== "password") delete out[k]; }); }
    users.push({ id, data: out });
  });
  return { users };
});

/* معلومات رقم هوية: تعارضه بمدرسة (لمن يدير المستخدمين)، ووجود حساب مفعَّل آخر بنفس الرقم (بريد مُقنَّع فقط) */
exports.loginIdInfo = onCall(async (request) => {
  const me = await secCaller(request, { needDoc: true });
  const d = request.data || {};
  const loginId = String(d.loginId || "").trim();
  if (!loginId || loginId.length > 40) throw secMsg("invalid-argument", "رقم هوية غير صالح.");
  const sid = d.schoolId ? String(d.schoolId) : null;
  const exclude = d.excludeDocId ? String(d.excludeDocId) : null;
  const qs = await secDb().collection("users").where("loginId", "==", loginId).get();
  const out = {};
  if (sid) {
    if (!secIsUserManager(me.data, sid)) throw secMsg("permission-denied", "ليست لديك صلاحية على هذه المدرسة.");
    let conflict = false;
    for (const x of qs.docs) {
      if (exclude && x.id === exclude) continue;
      const v = x.data();
      if (v.migratedTo) continue;
      if (!v.authUid) { if (v.schoolId === sid) conflict = true; }
      else if (v.role === "schoolAdmin") { if ((v.adminSchools || []).includes(sid)) conflict = true; }
      else if (v.schools && v.schools[sid]) conflict = true;
    }
    out.conflictAtSchool = conflict;
  }
  if (d.wantElsewhere) {
    const hit = qs.docs.find((x) => x.id !== me.uid && x.data().authUid && x.data().role !== "admin" && x.data().role !== "schoolAdmin");
    out.activatedElsewhere = hit ? { found: true, maskedEmail: secMask(hit.data().email || hit.data().googleEmail) } : null;
  }
  return out;
});

/* السجلات المعلَّقة الأخرى (بمدارس أخرى) لنفس رقم هوية المستدعي — بلا أي بيانات حساسة */
async function secPendingFor(me, excludeId, blocked) {
  const lid = me && me.loginId;
  if (!lid) return [];
  const bl = blocked || me.blockedSchools || [];
  const qs = await secDb().collection("users").where("loginId", "==", lid).get();
  return qs.docs
    .filter((x) => x.id !== excludeId && !x.data().migratedTo && !x.data().authUid && x.data().active !== false && !bl.includes(x.data().schoolId))
    .map((x) => ({ id: x.id, schoolId: x.data().schoolId || null, role: x.data().role || null, loginId: x.data().loginId, skippedOnce: !!x.data().skippedOnce }));
}
exports.discoverPending = onCall(async (request) => {
  const me = await secCaller(request, { needDoc: true });
  if (me.data.role === "admin" || me.data.role === "schoolAdmin") return { pending: [] };
  return { pending: await secPendingFor(me.data, null, null) };
});

async function secTemplatePerms(role) {
  try {
    const s = await secDb().collection("schoolData").doc("roleTemplates").get();
    const t = s.exists && ((s.data().templates || {})[role]);
    if (t && typeof t === "object" && Object.keys(t).length) return t;
  } catch (e) { /* يُترك للقيمة الافتراضية */ }
  return {};
}

/* تفعيل موظف بتحقق سيرفري من رقم الهوية وكلمة المرور الأولية، وإنشاء مستنده الموحَّد */
exports.activateStaff = onCall(async (request) => {
  const me = await secCaller(request);
  const tok = me.tok;
  if (tok.email_verified !== true) throw secMsg("failed-precondition", "يجب تأكيد بريدك أولًا ثم إعادة المحاولة.");
  const d = request.data || {};
  const seat = String(d.seat || "").trim();
  const temp = String(d.temp || "");
  if (!seat || !temp || seat.length > 40) throw secMsg("invalid-argument", "أدخل رقم الهوية وكلمة المرور الأولية");
  const gate = await secGate("act_" + me.uid, 10, 30 * 60 * 1000);
  if (await secIsStudent(me.uid, tok.email)) throw secMsg("permission-denied", SEC_STUDENT_MSG);
  const db = secDb();
  const users = db.collection("users");
  let qs = await users.where("loginId", "==", seat).get();
  let docs = qs.docs.filter((x) => !x.data().migratedTo && !x.data().authUid);
  if (!docs.length) {
    qs = await users.where("username", "==", seat).get();
    docs = qs.docs.filter((x) => !x.data().migratedTo && !x.data().authUid);
  }
  if (!docs.length) { await secFail(gate); throw secMsg("not-found", "رقم الهوية غير موجود، أو تم تفعيله مسبقاً. راجع الإدارة."); }
  const activeDocs = docs.filter((x) => x.data().active !== false);
  const pd = activeDocs.find((x) => secEq(x.data().password, temp)) || docs.find((x) => secEq(x.data().password, temp));
  if (!pd) {
    await secFail(gate);
    const d0 = activeDocs[0] || docs[0];
    if (d0.data().active === false) throw secMsg("failed-precondition", "هذا الحساب معطّل. راجع المسؤول");
    throw secMsg("permission-denied", "كلمة المرور الأولية غير صحيحة");
  }
  const data = pd.data();
  if (data.active === false) throw secMsg("failed-precondition", "هذا الحساب معطّل. راجع المسؤول");

  // رقم الهوية مرتبط بحساب مفعَّل بمصادقة أخرى: نوجّه للدخول بالحساب الأصلي (يُكشف بريده بعد نجاح التحقق من كلمة المرور فقط)
  const all = await users.where("loginId", "==", seat).get();
  const hit = all.docs.find((x) => x.id !== me.uid && x.data().authUid && x.data().authUid !== me.uid
    && x.data().role !== "admin" && x.data().role !== "schoolAdmin");
  if (hit) return { status: "already", already: { email: hit.data().email || null, googleEmail: hit.data().googleEmail || null } };

  const now = Date.now();
  const email = tok.email || null;
  const existingSnap = await me.ref.get();
  let kind;
  if (data.schools || data.solo) {
    if (existingSnap.exists) throw secMsg("failed-precondition", "حسابك الحالي مرتبط بحساب آخر بالفعل — لا يمكن إعادة ربط حساب كامل عليه. راجع admin العام.");
    const payload = Object.assign({}, data, { authUid: me.uid, email, updatedAt: now });
    delete payload.password;
    await me.ref.set(payload);
    await pd.ref.update({ migratedTo: me.uid, password: secFV.delete() });
    kind = "relink";
  } else if (data.role === "schoolAdmin") {
    const ur = await admin.auth().getUser(me.uid);
    const isGoogle = (ur.providerData || []).some((p) => p.providerId === "google.com");
    if (!isGoogle) return { status: "needGoogle" };
    if (existingSnap.exists) throw secMsg("failed-precondition", "لديك حساب مدير مفعَّل مسبقًا — إضافة مدرسة أخرى لحسابك تتم مباشرة من admin العام، لا عبر هذا التفعيل.");
    await me.ref.set({ role: "schoolAdmin", authUid: me.uid, email, googleEmail: email, username: data.username, active: true,
      adminSchools: [data.schoolId], loginId: seat, createdAt: now, updatedAt: now });
    await pd.ref.update({ migratedTo: me.uid, password: secFV.delete() });
    kind = "schoolAdmin";
  } else {
    if (data.role === "admin") throw secMsg("failed-precondition", "تفعيل حساب أدمن النظام لا يتم من هذه الشاشة. تواصل مع مالك النظام.");
    const perms = (data.permissions && Object.keys(data.permissions).length) ? data.permissions : await secTemplatePerms(data.role);
    const ctxPayload = { role: data.role, permissions: perms, assignedClasses: data.assignedClasses || [], active: true };
    if (!data.schoolId) throw secMsg("failed-precondition", "السجل غير مرتبط بمدرسة. راجع الإدارة.");
    if (!existingSnap.exists) {
      await me.ref.set({ authUid: me.uid, email, username: data.username, loginId: seat,
        schools: { [data.schoolId]: ctxPayload }, createdAt: now, updatedAt: now });
    } else if (existingSnap.data().role !== "admin" && existingSnap.data().role !== "schoolAdmin") {
      const FP = admin.firestore.FieldPath;
      const args = [new FP("schools", data.schoolId), ctxPayload, "updatedAt", now];
      if (!existingSnap.data().loginId) args.push("loginId", seat);
      await me.ref.update(...args);
    } else {
      throw secMsg("failed-precondition", "حسابك الحالي حساب أدمن/مدير — لا يمكن إضافة سياق موظف عادي عليه.");
    }
    await pd.ref.update({ migratedTo: me.uid, password: secFV.delete() });
    kind = "staff";
  }
  const meNow = (await me.ref.get()).data() || {};
  const others = await secPendingFor(Object.assign({}, meNow, { loginId: seat }), pd.id, meNow.blockedSchools || []);
  return { status: "activated", kind, others };
});

/* تفعيل مدرسة إضافية (سجل معلَّق آخر لنفس رقم الهوية) بعد التحقق من كلمة مرورها الأولية */
exports.activateExtraSchool = onCall(async (request) => {
  const me = await secCaller(request, { needDoc: true });
  if (me.data.role === "admin" || me.data.role === "schoolAdmin" || !me.data.loginId) throw secMsg("permission-denied", "غير متاح لهذا الحساب.");
  const d = request.data || {};
  const pid = String(d.pendingId || ""), temp = String(d.temp || "");
  if (!pid || !temp) throw secMsg("invalid-argument", "بيانات ناقصة.");
  const gate = await secGate("act_" + me.uid, 10, 30 * 60 * 1000);
  const ps = await secDb().collection("users").doc(pid).get();
  const p = ps.exists ? ps.data() : null;
  if (!p || p.authUid || p.migratedTo || p.active === false || p.loginId !== me.data.loginId || !p.schoolId) {
    throw secMsg("not-found", "السجل غير متاح للتفعيل.");
  }
  if (!secEq(p.password, temp)) { await secFail(gate); throw secMsg("permission-denied", "كلمة المرور الأولية غير صحيحة"); }
  const perms = (p.permissions && Object.keys(p.permissions).length) ? p.permissions : await secTemplatePerms(p.role);
  const ctxPayload = { role: p.role, permissions: perms, assignedClasses: p.assignedClasses || [], active: true };
  await me.ref.update(new admin.firestore.FieldPath("schools", p.schoolId), ctxPayload, "updatedAt", Date.now());
  await ps.ref.update({ migratedTo: me.uid, password: secFV.delete() });
  return { ok: true };
});

/* تخطّي سجل معلَّق آخر أو حظر مدرسته نهائيًا */
exports.skipPending = onCall(async (request) => {
  const me = await secCaller(request, { needDoc: true });
  if (!me.data.loginId) throw secMsg("permission-denied", "غير متاح لهذا الحساب.");
  const d = request.data || {};
  const ps = await secDb().collection("users").doc(String(d.pendingId || "")).get();
  const p = ps.exists ? ps.data() : null;
  if (!p || p.authUid || p.migratedTo || p.loginId !== me.data.loginId) throw secMsg("not-found", "السجل غير متاح.");
  const now = Date.now();
  if (d.block) {
    await me.ref.update({ blockedSchools: secFV.arrayUnion(p.schoolId), updatedAt: now });
    await ps.ref.update({ active: false, updatedAt: now });
  } else {
    await ps.ref.update({ active: false, skippedOnce: true, updatedAt: now });
  }
  return { ok: true };
});

/* إنشاء الحساب الفردي (تجربة ٣٠ يومًا تُحسب هنا لا في المتصفح) أو إضافة سياق الفردي لمستند موجود */
const SEC_SOLO_TRIAL_MS = 30 * 24 * 60 * 60 * 1000;   // الافتراضي إن لم يضبط الأدمن settings/soloTrial
/* (2026-10-14.2) مدة التجربة بالأيام يضبطها الأدمن في settings/soloTrial = {days}: 0 = بلا تجربة، وتسري على الحسابات الجديدة فقط */
async function secSoloTrialMs() {
  try {
    const s = await secDb().collection("settings").doc("soloTrial").get();
    const n = s.exists ? Number(s.data().days) : NaN;
    if (isFinite(n) && n >= 0 && n <= 3650) return Math.floor(n) * 86400000;
  } catch (e) { /* يبقى الافتراضي */ }
  return SEC_SOLO_TRIAL_MS;
}
async function secNextSoloCode() {
  const db = secDb();
  const ref = db.collection("systemCounters").doc("soloTeacher");
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    let max;
    if (s.exists) max = s.data().max || 0;
    else {
      max = 0;
      (await db.collection("users").where("isSolo", "==", true).get()).docs.forEach((x) => {
        const n = parseInt(String(x.data().teacherCode || "").replace(/^T/, ""), 10);
        if (!isNaN(n) && n > max) max = n;
      });
    }
    tx.set(ref, { max: max + 1 });
    return "T" + (max + 1);
  });
}
exports.registerSolo = onCall(async (request) => {
  const me = await secCaller(request);
  if (me.tok.email_verified !== true) throw secMsg("failed-precondition", "يجب تأكيد بريدك أولًا.");
  if (await secIsStudent(me.uid, me.tok.email)) throw secMsg("permission-denied", SEC_STUDENT_MSG);
  const db = secDb();
  const q = await db.collection("users").where("authUid", "==", me.uid).limit(1).get();
  const now = Date.now();
  const trialMs = await secSoloTrialMs();
  const trialCal = await secCalendar(true).catch(() => null);
  const trialCov = secSoloTrialCovered(trialCal, now);
  if (q.empty) {
    const email = me.tok.email || "";
    const data = {
      username: me.tok.name || (email.split("@")[0] || "مستخدم"),
      email, authUid: me.uid, teacherCode: await secNextSoloCode(), isSolo: true, loginId: null,
      solo: { active: true, subscribedAt: now, subscriptionEnds: now + trialMs, plan: "trial", coveredPeriods: trialCov.covered, planYear: trialCov.year },
      createdAt: now, updatedAt: now,
    };
    await db.collection("users").doc(me.uid).set(data);
    return { docId: me.uid, data };
  }
  const doc = q.docs[0];
  const data = doc.data();
  if (!data.solo && data.role !== "admin" && data.role !== "schoolAdmin") {
    const solo = { active: true, subscribedAt: now, subscriptionEnds: now + trialMs, plan: "trial", coveredPeriods: trialCov.covered, planYear: trialCov.year };
    const teacherCode = data.teacherCode || await secNextSoloCode();
    await doc.ref.update({ solo, teacherCode, isSolo: true, updatedAt: now });
    Object.assign(data, { solo, teacherCode, isSolo: true, updatedAt: now });
  }
  return { docId: doc.id, data };
});

/* ---------------- الطالب ---------------- */
async function secBelongsToStaff(uid, email) {
  const db = secDb();
  if ((await db.collection("users").doc(uid).get()).exists) return true;
  if (!(await db.collection("users").where("authUid", "==", uid).limit(1).get()).empty) return true;
  const ems = Array.from(new Set([String(email || "").trim(), String(email || "").trim().toLowerCase()])).filter(Boolean);
  for (const e of ems) {
    if (!(await db.collection("users").where("email", "==", e).limit(1).get()).empty) return true;
    if (!(await db.collection("users").where("googleEmail", "==", e).limit(1).get()).empty) return true;
  }
  return false;
}
// دخول الطالب بحساب Google: حساب موجود بالـuid ← مباشرة، أو بالبريد ← يُنقل لمعرّف الدخول الجديد، وإلا طالب جديد يحتاج التحقق
exports.studentSignIn = onCall(async (request) => {
  const me = await secCaller(request);
  const email = me.tok.email;
  if (!email) throw secMsg("failed-precondition", "تعذّر قراءة بريدك من حساب Google.");
  if (await secBelongsToStaff(me.uid, email)) return { status: "staff" };
  const db = secDb();
  const cols = db.collection("studentAccounts");
  const q = await cols.where("googleUid", "==", me.uid).limit(1).get();
  if (!q.empty) { const x = q.docs[0].data(); return { status: "ok", account: { id: q.docs[0].id, seat: x.seat, name: x.name || me.tok.name || "" } }; }
  const qe = await cols.where("email", "==", email).limit(1).get();
  if (!qe.empty) {
    const old = qe.docs[0]; const x = old.data();
    const payload = Object.assign({}, x, { googleUid: me.uid, name: x.name || me.tok.name || "", updatedAt: Date.now() });
    await cols.doc(me.uid).set(payload);
    if (old.id !== me.uid) await old.ref.delete();
    return { status: "ok", account: { id: me.uid, seat: x.seat, name: payload.name } };
  }
  return { status: "new" };
});
// التحقق من هوية الطالب ورمز فصله ثم إنشاء حسابه
exports.studentVerify = onCall(async (request) => {
  const me = await secCaller(request);
  const email = me.tok.email;
  if (!email) throw secMsg("failed-precondition", "تعذّر قراءة بريدك من حساب Google.");
  const d = request.data || {};
  const seat = String(d.seat || "").trim();
  const code = String(d.code || "").trim().toUpperCase();
  if (!seat || !code || seat.length > 40) throw secMsg("invalid-argument", "أدخل رقم الهوية ورمز الفصل.");
  if (await secBelongsToStaff(me.uid, email)) throw secMsg("permission-denied", "هذا البريد مسجَّل في النظام كحساب معلم أو منسوب مدرسة، ولا يمكن استخدامه في دخول الطالب.");
  const gate = await secGate("stu_" + me.uid, 8, 30 * 60 * 1000);
  const db = secDb();
  const snap = await db.collection("rosterIndex").where("seatList", "array-contains", seat).get();
  if (snap.empty) { await secFail(gate); throw secMsg("not-found", "رقم الهوية غير مسجّل لدى أي معلم. تأكد منه مع معلمك."); }
  let matched = null;
  snap.docs.forEach((x) => {
    const r = x.data();
    ((r.classBySeat || {})[seat] || []).forEach((cc) => {
      const meta = (r.classMeta || {})[cc];
      if (meta && meta.loginCode && String(meta.loginCode).toUpperCase() === code) matched = { rosterId: r.rosterId, classCode: cc };
    });
  });
  if (!matched) { await secFail(gate); throw secMsg("permission-denied", "رمز الفصل لا يطابق أي فصل أنت مسجَّل فيه. تأكد منه مع معلمك."); }
  const taken = await db.collection("studentAccounts").where("seat", "==", seat).limit(1).get();
  if (!taken.empty) throw secMsg("already-exists", "رقم الهوية هذا مرتبط بحساب آخر بالفعل. إن كان حسابك، سجّل الدخول بالبريد نفسه، وإلا راجع معلمك.");
  const now = Date.now();
  const payload = { googleUid: me.uid, email, name: me.tok.name || "", seat, linkedRosters: [matched.rosterId], verifiedAt: now, updatedAt: now };
  await db.collection("studentAccounts").doc(me.uid).set(payload);
  return { status: "ok", account: { id: me.uid, seat, name: payload.name } };
});
/* (2026-10-13 · المرحلة ٥) قراءة فهرس الطلاب صارت للخادم وحده: الطالب يرى فصوله هو فقط، ولا يصل لمتصفحه
   رمز دخول أي فصل ولا هوية غيره. رقم الهوية يؤخذ من حساب الطالب المخزَّن لا مما يرسله المتصفح. */
async function secStudentAccount(me) {
  const s = await secDb().collection("studentAccounts").doc(me.uid).get();
  if (!s.exists || !s.data().seat) throw secMsg("permission-denied", "لا يوجد حساب طالب مرتبط بهذا الدخول.");
  return s;
}
exports.studentMemberships = onCall(async (request) => {
  const me = await secCaller(request);
  const acc = await secStudentAccount(me);
  const seat = String(acc.data().seat);
  const linked = (acc.data().linkedRosters || []).map(String);
  const snap = await secDb().collection("rosterIndex").where("seatList", "array-contains", seat).get();
  const approved = [], invites = [];
  snap.docs.forEach((d) => {
    const r = d.data();
    const classCodes = ((r.classBySeat || {})[seat] || []).map(String);
    if (!classCodes.length) return;
    if (r.kind === "solo" && !linked.includes(String(r.rosterId))) {
      invites.push({ rosterId: String(r.rosterId), ownerName: r.ownerName || "معلم",
        classNames: classCodes.map((cc) => ((r.classMeta || {})[cc] || {}).name || cc) });
    } else {
      approved.push({ rosterId: String(r.rosterId), kind: r.kind, classCodes });
    }
  });
  return { approved, invites };
});
exports.studentConfirmInvite = onCall(async (request) => {
  const me = await secCaller(request);
  const acc = await secStudentAccount(me);
  const seat = String(acc.data().seat);
  const d = request.data || {};
  const rosterId = String(d.rosterId || "").trim();
  const code = String(d.code || "").trim().toUpperCase();
  if (!rosterId || !code || rosterId.length > 200 || code.length > 40) throw secMsg("invalid-argument", "أدخل رمز الفصل.");
  const gate = await secGate("inv_" + me.uid, 8, 30 * 60 * 1000);
  const rs = await secDb().collection("rosterIndex").doc(rosterId).get();
  const r = rs.exists ? rs.data() : {};
  const mine = (r.classBySeat || {})[seat] || [];
  const ok = r.kind === "solo" && mine.some((cc) => {
    const lc = ((r.classMeta || {})[cc] || {}).loginCode;
    return lc && String(lc).toUpperCase() === code;
  });
  if (!ok) { await secFail(gate); throw secMsg("permission-denied", "الرمز لا يطابق فصلك لدى هذا المعلم."); }
  await acc.ref.update({ linkedRosters: admin.firestore.FieldValue.arrayUnion(rosterId), updatedAt: Date.now() });
  return { ok: true };
});
// أرقام هوية طلاب فعّلوا حساباتهم (شارة «مفعَّل» عند المعلم) — بلا أي بيانات أخرى
exports.activatedSeats = onCall(async (request) => {
  const me = await secCaller(request, { needDoc: true });
  const u = me.data;
  if (!(u.solo || u.schools || u.role === "admin" || u.role === "schoolAdmin")) throw secMsg("permission-denied", "غير متاح.");
  const seats = Array.from(new Set(((request.data && request.data.seats) || []).map(String).filter(Boolean))).slice(0, 1500);
  const found = [];
  for (let i = 0; i < seats.length; i += 30) {
    const qs = await secDb().collection("studentAccounts").where("seat", "in", seats.slice(i, i + 30)).get();
    qs.docs.forEach((x) => found.push(String(x.data().seat)));
  }
  return { seats: found };
});


/* ============================================================================================
   المرحلة ٤ (2026-10-13): اشتراك المعلم الفردي
   - secExtendSolo: نقطة التمديد الوحيدة (الأدمن الآن، وبوابة الدفع الإلكتروني لاحقًا): التاريخ الجديد = (الأبعد من اليوم أو
     تاريخ الانتهاء الحالي) + المدة، فمن يجدّد قبل الانتهاء لا يخسر أيامه. يُفعِّل السياق ويسجّل مصدر التجديد.
   - adminSoloSubscription (المرحلة ٥): منح حسب الخطة plan = semester|year عبر secGrantSoloPlan، أو تفعيل/إيقاف active.
   - لا حذف تلقائي لبيانات المستقل المنتهي (أُلغي cleanupExpiredSolo).
   ============================================================================================ */
const SEC_DAY_MS = 24 * 60 * 60 * 1000;

async function secExtendSolo(db, uid, days, source) {
  const n = Number(days);
  if (!uid || !isFinite(n) || n <= 0 || n > 3660) throw secMsg("invalid-argument", "مدة التمديد غير صالحة.");
  const ref = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw secMsg("not-found", "الحساب غير موجود.");
    const u = s.data();
    if (u.role === "admin" || u.role === "schoolAdmin") throw secMsg("failed-precondition", "لا اشتراك فردي لهذا النوع من الحسابات.");
    if (!u.solo) throw secMsg("failed-precondition", "هذا الحساب بلا سياق فردي.");
    const now = Date.now();
    const base = Math.max(now, u.solo.subscriptionEnds || 0);
    const ends = base + Math.round(n * SEC_DAY_MS);
    const solo = Object.assign({}, u.solo, { active: true, subscriptionEnds: ends, lastRenewedAt: now, lastRenewSource: source || "admin" });
    tx.update(ref, { solo, isSolo: true, updatedAt: now });
    return { ends };
  });
}

/* (المرحلة ٥) خطط اشتراك المستقل تُحسب من التقويم المركزي وتاريخ الخادم، بلا تاريخ يدوي:
   semester = من اليوم إلى نهاية الفصل الحالي (أو القادم إن كنا بين فصلين)، year = من اليوم إلى نهاية العام الدراسي.
   covered = معرّفات الفصول التي يغطيها الاشتراك (يحق للمشترك عرضها للقراءة فقط بعد انتهائها). */
function secSoloUpcoming(cal, nowMs) {
  const ps = (cal.periods || []).slice().sort((x, y) => x.fromMs - y.fromMs);
  return ps.find((p) => nowMs <= p.toMs) || null;
}
function secSoloTrialCovered(cal, nowMs) {
  if (!cal || !Array.isArray(cal.periods) || !cal.periods.length) return { covered: [], year: null };
  const p = secSoloUpcoming(cal, nowMs);
  return { covered: p ? [p.id] : [], year: cal.year || null };
}
function secSoloPlan(cal, plan, nowMs) {
  if (!cal || !Array.isArray(cal.periods) || !cal.periods.length) throw secMsg("failed-precondition", "لم يُضبط التقويم الدراسي المركزي بعد.");
  if (!cal.endMs || nowMs > cal.endMs) throw secMsg("failed-precondition", "انتهى العام الدراسي الحالي؛ لا يمكن منح اشتراك قبل ضبط العام الجديد.");
  const p = secSoloUpcoming(cal, nowMs);
  if (!p) throw secMsg("failed-precondition", "لا يوجد فصل دراسي قائم أو قادم.");
  if (plan === "semester") return { ends: p.toMs, covered: [p.id], year: cal.year || null, period: p.id };
  if (plan === "year") return { ends: cal.endMs, covered: cal.periods.map((x) => x.id), year: cal.year || null, period: p.id };
  throw secMsg("invalid-argument", "نوع الاشتراك غير صالح.");
}
/* نقطة المنح الموحَّدة (الأدمن الآن، وبوابة الدفع لاحقًا): تُجدِّد الاشتراك حسب الخطة دون المساس بما سبق دفعه في العام نفسه */
async function secGrantSoloPlan(db, uid, plan, source) {
  const cal = await secCalendar(true);
  const now = Date.now();
  const pl = secSoloPlan(cal, plan, now);
  const ref = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw secMsg("not-found", "الحساب غير موجود.");
    const u = s.data();
    if (u.role === "admin" || u.role === "schoolAdmin") throw secMsg("failed-precondition", "لا اشتراك فردي لهذا النوع من الحسابات.");
    if (!u.solo) throw secMsg("failed-precondition", "هذا الحساب بلا سياق فردي.");
    const old = u.solo;
    const sameYear = old.planYear && old.planYear === pl.year;
    let covered = pl.covered.slice();
    if (sameYear && Array.isArray(old.coveredPeriods)) covered = Array.from(new Set(old.coveredPeriods.concat(covered)));
    const prevEnd = sameYear && (old.subscriptionEnds || 0) > now ? old.subscriptionEnds : 0;
    const solo = Object.assign({}, old, {
      active: true, plan, planYear: pl.year, coveredPeriods: covered,
      subscriptionEnds: Math.max(pl.ends, prevEnd), lastRenewedAt: now, lastRenewSource: source || "admin",
    });
    tx.update(ref, { solo, isSolo: true, updatedAt: now });
    return { ends: solo.subscriptionEnds, plan, covered, period: pl.period };
  });
}

exports.adminSoloSubscription = onCall(async (request) => {
  const me = await secCaller(request, { needDoc: true });
  if (!secIsAdmin(me.data)) throw secMsg("permission-denied", "مقصور على أدمن النظام العام.");
  const d = request.data || {};
  const uid = String(d.uid || "");
  if (!uid) throw secMsg("invalid-argument", "حدّد الحساب.");
  const db = secDb();
  if (d.plan != null) {
    const r = await secGrantSoloPlan(db, uid, String(d.plan), "admin:" + me.uid);
    return { ok: true, ends: r.ends, plan: r.plan, covered: r.covered };
  }
  const ref = db.collection("users").doc(uid);
  const s = await ref.get();
  if (!s.exists) throw secMsg("not-found", "الحساب غير موجود.");
  const u = s.data();
  if (!u.solo || u.role === "admin" || u.role === "schoolAdmin") throw secMsg("failed-precondition", "هذا الحساب بلا سياق فردي.");
  if (typeof d.active !== "boolean") throw secMsg("invalid-argument", "حدّد نوع الاشتراك أو حالة التفعيل.");
  const solo = Object.assign({}, u.solo, { active: d.active });
  await ref.update({ solo, updatedAt: Date.now() });
  return { ok: true, ends: solo.subscriptionEnds || null, active: solo.active !== false };
});

/* ============================================================================================
   الفصلان الدراسيان (2026-10-13.3): حالة كل فصل على مستند المدرسة schoolData/{sid}.semesters
     semesters = { first|second : { licensed, active, locked, activatedAt, closedAt, by } }
   الأدمن العام: يرخّص الفصل للمدرسة (license)، ويغلقه نهائيًا (lock) ويرفع الإغلاق (unlock)، ويضبط تواريخ الفردي (soloDates).
   مدير المدرسة: يفعّل (activate) ويغلق (close) الفصل المرخّص لمدرسته فقط، وبشرط أن يكون اليوم (بتوقيت الرياض) داخل تواريخ الفصل.
   التواريخ تُقرأ من school.periods التي يضبطها الأدمن. لا يكتب العميل هذه الحقول إطلاقًا (القواعد تمنع).
   ============================================================================================ */
const SEM_IDS = ["first", "second"];
const SEM_AR = { first: "الفصل الأول", second: "الفصل الثاني" };
function semTodayRiyadh() { return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10); }
const SEM_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// تحويل تاريخ yyyy-mm-dd إلى مللي ثانية بتوقيت الرياض (بداية اليوم أو نهايته)
function semMs(dateStr, end) { return new Date(dateStr + (end ? "T23:59:59.999+03:00" : "T00:00:00+03:00")).getTime(); }

/* حفظ تواريخ العام والفصلين (أدمن النظام فقط) مع الفحص على الخادم:
   - تاريخ العام إلزامي متى حُدِّد أي فصل. - كل فصل داخل العام. - الفصلان لا يتداخلان (بداية الثاني بعد نهاية الأول).
   - لا تُحذف تواريخ فصل مرخَّص. الأوقات بتوقيت الرياض. تُكتب الحقول المحمية من هنا فقط (القواعد تمنع الكتابة المباشرة). */
async function semSaveDates(me, u, d) {
  if (!secIsAdmin(u)) throw secMsg("permission-denied", "مقصور على أدمن النظام العام.");
  const sid = String(d.schoolId || "");
  if (!sid) throw secMsg("invalid-argument", "حدّد المدرسة.");
  let yF = d.yearFrom ? String(d.yearFrom) : "", yT = d.yearTo ? String(d.yearTo) : "";
  /* (2026-10-14.2) التقويم المركزي: متى وُجد settings/academicCalendar فهو المرجع الوحيد لتواريخ المدرسة، ويُتجاهل ما يرسله العميل */
  const calSnap = await secDb().collection("settings").doc("academicCalendar").get();
  const calData = calSnap.exists ? calSnap.data() : null;
  let dSems = d.semesters || {};
  if (calData && Array.isArray(calData.periods) && calData.periods.length) {
    yF = calData.startDate; yT = calData.endDate;
    dSems = {};
    calData.periods.forEach((x) => { dSems[x.id] = { from: x.from, to: x.to }; });
  }
  const given = {};
  for (const p of SEM_IDS) {
    const x = dSems[p];
    if (!x) continue;
    const f = String(x.from || ""), t = String(x.to || "");
    if (!SEM_DATE_RE.test(f) || !SEM_DATE_RE.test(t)) throw secMsg("invalid-argument", "حدّد بداية ونهاية صحيحتين لـ" + SEM_AR[p] + ".");
    if (t < f) throw secMsg("invalid-argument", "نهاية " + SEM_AR[p] + " قبل بدايته.");
    given[p] = { from: f, to: t };
  }
  const has = Object.keys(given).length > 0;
  if ((yF && !SEM_DATE_RE.test(yF)) || (yT && !SEM_DATE_RE.test(yT))) throw secMsg("invalid-argument", "تاريخ العام الدراسي غير صالح.");
  if (has && (!yF || !yT)) throw secMsg("invalid-argument", "تاريخ العام الدراسي (بداية ونهاية) إلزامي عند تحديد الفصلين.");
  if ((yF && !yT) || (!yF && yT)) throw secMsg("invalid-argument", "حدّد بداية العام الدراسي ونهايته معًا.");
  if (yF && yT < yF) throw secMsg("invalid-argument", "نهاية العام الدراسي قبل بدايته.");
  for (const p of Object.keys(given)) {
    if (given[p].from < yF || given[p].to > yT) throw secMsg("invalid-argument", SEM_AR[p] + " خارج مدة العام الدراسي.");
  }
  if (given.first && given.second && given.second.from <= given.first.to) throw secMsg("invalid-argument", "الفصلان متداخلان أو غير مرتبين: يجب أن يبدأ الفصل الثاني بعد نهاية الأول.");
  const ref = secDb().collection("schoolData").doc(sid);
  await secDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data()._isSchool !== true) throw secMsg("not-found", "المدرسة غير موجودة.");
    const sems = s.data().semesters || {};
    for (const p of SEM_IDS) {
      if (!given[p] && sems[p] && sems[p].licensed === true) throw secMsg("failed-precondition", "لا يمكن حذف تواريخ " + SEM_AR[p] + " وهو مرخَّص للمدرسة. اسحب الترخيص أولًا.");
    }
    const periods = [], semDates = {};
    for (const p of SEM_IDS) {
      if (!given[p]) continue;
      const rec = { from: given[p].from, to: given[p].to, fromMs: semMs(given[p].from, false), toMs: semMs(given[p].to, true) };
      periods.push(Object.assign({ id: p }, rec));
      semDates[p] = { fromMs: rec.fromMs, toMs: rec.toMs };
    }
    const upd = {
      periods, updatedAt: Date.now(),
      yearFrom: yF, yearTo: yT,
      yearFromMs: yF ? semMs(yF, false) : null, yearToMs: yT ? semMs(yT, true) : null,
    };
    upd.semDates = has ? semDates : secFV.delete();
    tx.update(ref, upd);
  });
  return { ok: true };
}

exports.schoolSemester = onCall(async (request) => {
  const me = await secCaller(request, { needDoc: true });
  const u = me.data;
  const d = request.data || {};
  const action = String(d.action || "");
  const db = secDb();

  if (action === "soloDates") {
    if (!secIsAdmin(u)) throw secMsg("permission-denied", "مقصور على أدمن النظام العام.");
    const out = {};
    for (const p of SEM_IDS) {
      const x = (d.dates || {})[p];
      if (!x) continue;
      const f = String(x.from || ""), t = String(x.to || "");
      if (!SEM_DATE_RE.test(f) || !SEM_DATE_RE.test(t) || t < f) throw secMsg("invalid-argument", "تواريخ " + SEM_AR[p] + " غير صحيحة.");
      out[p] = { from: f, to: t, fromMs: new Date(f + "T00:00:00+03:00").getTime(), toMs: new Date(t + "T23:59:59+03:00").getTime() };
    }
    if (out.first && out.second && out.second.from <= out.first.to) throw secMsg("invalid-argument", "الفصلان متداخلان أو غير مرتبين.");
    await db.collection("schoolData").doc("soloSemesters").set(Object.assign({ updatedAt: Date.now(), updatedBy: me.uid }, out), { merge: true });
    return { ok: true };
  }

  if (action === "saveDates") return semSaveDates(me, u, d);

  /* (2026-10-14.3) تمديد نهاية الفصل الأول لمدرسة بعينها (أدمن النظام فقط): حتى تاريخ أقصاه يوم قبل نهاية العام،
     وتبدأ مدرسة التمديد فصلها الثاني في اليوم التالي. until فارغ ← إلغاء التمديد. لا تمديد بعد نهاية العام. */
  if (action === "extend") {
    if (!secIsAdmin(u)) throw secMsg("permission-denied", "مقصور على أدمن النظام العام.");
    const sidE = String(d.schoolId || "");
    if (!sidE) throw secMsg("invalid-argument", "حدّد المدرسة.");
    const refE = db.collection("schoolData").doc(sidE);
    const sE = await refE.get();
    if (!sE.exists || sE.data()._isSchool !== true) throw secMsg("not-found", "المدرسة غير موجودة.");
    const until = String(d.until || "");
    if (!until) {
      await refE.update({ semExtend: secFV.delete(), updatedAt: Date.now() });
      return { ok: true, cleared: true };
    }
    if (!SEM_DATE_RE.test(until)) throw secMsg("invalid-argument", "تاريخ التمديد غير صحيح.");
    const cal = await secCalendar(true);
    if (!cal || cal.count !== 2 || !Array.isArray(cal.periods) || cal.periods.length < 2) throw secMsg("failed-precondition", "التمديد متاح عندما يكون العام فصلين فقط.");
    const p1 = cal.periods.find((x) => x.id === "first"), p2 = cal.periods.find((x) => x.id === "second");
    const ms = semMs(until, true);
    if (ms <= p1.toMs) throw secMsg("invalid-argument", "تاريخ التمديد يجب أن يكون بعد نهاية الفصل الأول (" + p1.to + ").");
    if (ms >= p2.toMs) throw secMsg("invalid-argument", "تاريخ التمديد يجب أن يسبق نهاية العام الدراسي (" + p2.to + "). لا تمديد بعد نهاية العام.");
    await refE.update({ semExtend: { first: ms, firstDate: until, by: me.uid, at: Date.now() }, updatedAt: Date.now() });
    return { ok: true, until, ms };
  }

  /* (2026-10-14.4) «نسخ من الفصل الحالي» إلى الفصل التالي (التجهيز المبكر) — يعمل قبل بداية الفصل الثاني فقط، وبشرط أن
     يكون الفصل الثاني مرخَّصًا من أدمن النظام وغير مقفل. لا يُنسخ إلا ما يملك المستدعي صلاحيته:
     الجدول المدرسي (مدير المدرسة أو «الجدول المدرسي» تعديل)، خطة المناوبة والإشراف، خطة الزيارات الصفية (مدير المدرسة أو الوكيل بالدور
     أو صلاحية الأداة تعديل). لا يُنسخ المنشور/المعتمد للمعلمين ولا الأيام المحدَّدة بتواريخ (حصص الانتظار اليومية، توزيع المناوبة، مواعيد الزيارات).
     ما كان موجودًا في الفصل الثاني لا يُستبدل إلا بـ overwrite=true. */
  if (action === "copyNext") {
    const sidC = String(d.schoolId || "");
    if (!sidC) throw secMsg("invalid-argument", "حدّد المدرسة.");
    const sysC = secIsAdmin(u), dirC = secIsSchoolAdminOf(u, sidC), ctxC = secStaffCtx(u, sidC);
    if (!sysC && !dirC && !ctxC) throw secMsg("permission-denied", "ليست لديك صلاحية على هذه المدرسة.");
    const scS = await db.collection("schoolData").doc(sidC).get();
    if (!scS.exists || scS.data()._isSchool !== true) throw secMsg("not-found", "المدرسة غير موجودة.");
    const sc = scS.data();
    const cal = await secCalendar(true);
    const p2 = cal && cal.count === 2 && Array.isArray(cal.periods) ? cal.periods.find((x) => x.id === "second") : null;
    if (!p2) throw secMsg("failed-precondition", "لا يوجد فصل تالٍ في هذا العام الدراسي.");
    const st2 = (sc.semesters || {}).second;
    if (!st2 || st2.licensed !== true) throw secMsg("failed-precondition", "الفصل الثاني غير مرخَّص لمدرستك. تواصل مع إدارة النظام للاشتراك.");
    if (st2.locked === true) throw secMsg("failed-precondition", "الفصل الثاني مغلق نهائيًا من إدارة النظام.");
    const exC = Number(((sc.semExtend || {}).first) || 0);
    const startMs = exC && exC >= p2.fromMs ? exC + 1 : p2.fromMs;
    if (Date.now() >= startMs) throw secMsg("failed-precondition", "بدأ الفصل الثاني؛ النسخ من الفصل الحالي متاح قبل بدايته فقط.");
    const want = Array.isArray(d.items) ? d.items.map(String) : [];
    const overwrite = d.overwrite === true;
    const can = {
      timetable: sysC || dirC || secPerm(ctxC, "tools.timetable", "edit"),
      duty: sysC || dirC || (ctxC && ctxC.role === "agent") || secPerm(ctxC, "tools.duty", "edit"),
      visits: sysC || dirC || (ctxC && ctxC.role === "agent") || secPerm(ctxC, "tools.visits", "edit"),
    };
    const items = ["timetable", "duty", "visits"].filter((k) => want.indexOf(k) >= 0);
    if (!items.length) throw secMsg("invalid-argument", "اختر ما تريد نسخه.");
    const denied = items.filter((k) => !can[k]);
    if (denied.length === items.length) throw secMsg("permission-denied", "ليست لديك صلاحية على ما اخترته.");
    const NOW = Date.now();
    const copied = { timetable: 0, duty: 0, visits: 0 }, skipped = { timetable: 0, duty: 0, visits: 0 }, refused = denied;
    const putDoc = async (ref, data, kind) => {
      if (!overwrite && (await ref.get()).exists) { skipped[kind]++; return; }
      await ref.set(data); copied[kind]++;
    };
    const flipPeriod = (v) => {
      if (Array.isArray(v)) return v.map(flipPeriod);
      if (v && typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => { o[k] = (k === "period" && v[k] === "first") ? "second" : flipPeriod(v[k]); }); return o; }
      return v;
    };
    if (items.indexOf("timetable") >= 0 && can.timetable) {
      const col = db.collection("timetables").doc(sidC).collection("data");
      const docs = (await col.get()).docs.filter((x) => x.id.indexOf("first_") === 0
        && !/_published$|_waiting$|_waitpub$/.test(x.id) && x.id.indexOf("_wday_") < 0);
      for (const x of docs) await putDoc(col.doc("second_" + x.id.slice(6)), flipPeriod(x.data()), "timetable");
    }
    const pre = sidC + "_first_";
    if (items.indexOf("duty") >= 0 && can.duty) {
      const qs = await db.collection("dutyPlans").where("schoolId", "==", sidC).get();
      for (const x of qs.docs.filter((y) => y.id.indexOf(pre) === 0)) {
        const v = x.data() || {};
        const doc = { kind: "plan", schoolId: sidC, period: "second", stage: v.stage || x.id.slice(pre.length), stageLabel: v.stageLabel || "",
          participants: v.participants || [], places: v.places || [], perDay: Number(v.perDay) || 1,
          agentName: v.agentName || "", principalName: v.principalName || "", copiedFrom: x.id, updatedAt: NOW, updatedBy: me.uid };
        await putDoc(db.collection("dutyPlans").doc(sidC + "_second_" + x.id.slice(pre.length)), doc, "duty");
      }
    }
    if (items.indexOf("visits") >= 0 && can.visits) {
      const qs = await db.collection("classVisits").where("schoolId", "==", sidC).get();
      for (const x of qs.docs.filter((y) => y.id.indexOf(pre) === 0 && (y.data() || {}).kind === "plan")) {
        const v = x.data() || {};
        const doc = { kind: "plan", schoolId: sidC, period: "second", teacherId: v.teacherId || x.id.slice(pre.length), teacherName: v.teacherName || "",
          spec: v.spec || "", exec: v.exec || "", v1: null, v2: null, copiedFrom: x.id, updatedAt: NOW, updatedBy: me.uid };
        await putDoc(db.collection("classVisits").doc(sidC + "_second_" + x.id.slice(pre.length)), doc, "visits");
      }
    }
    return { ok: true, copied, skipped, refused };
  }

  const sid = String(d.schoolId || "");
  const period = String(d.period || "");
  if (!sid || SEM_IDS.indexOf(period) < 0) throw secMsg("invalid-argument", "حدّد المدرسة والفصل الدراسي.");
  const isSys = secIsAdmin(u);
  const isDir = secIsSchoolAdminOf(u, sid);
  if (!isSys && !isDir) throw secMsg("permission-denied", "هذا الإجراء لأدمن النظام أو لمدير هذه المدرسة فقط.");
  if (["license", "lock", "unlock"].indexOf(action) >= 0 && !isSys) throw secMsg("permission-denied", "هذا الإجراء مقصور على أدمن النظام العام.");
  if (["license", "lock", "unlock", "activate", "close"].indexOf(action) < 0) throw secMsg("invalid-argument", "إجراء غير معروف.");

  const ref = db.collection("schoolData").doc(sid);
  const res = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data()._isSchool !== true) throw secMsg("not-found", "المدرسة غير موجودة.");
    const sc = s.data();
    // مدرسة قديمة بلا semesters: يُرخَّص لها الفصلان ويُفعَّل منهما الفصل activePeriod القديم (حفظًا لسلوكها الحالي)
    const sems = Object.assign({}, sc.semesters || {});
    if (!sc.semesters) {
      const ap = sc.activePeriod === "second" ? "second" : "first";
      SEM_IDS.forEach((p) => { sems[p] = { licensed: true, active: p === ap, locked: false }; });
    }
    const cur = Object.assign({ licensed: false, active: false, locked: false }, sems[period] || {});
    const now = Date.now();
    if (action === "license") {
      cur.licensed = d.licensed === true;
      if (!cur.licensed) cur.active = false;
    } else if (action === "lock") {
      cur.locked = true; cur.active = false; cur.closedAt = now; cur.by = me.uid;
    } else if (action === "unlock") {
      cur.locked = false;
    } else if (action === "close") {
      if (!cur.licensed) throw secMsg("failed-precondition", SEM_AR[period] + " غير مرخّص لهذه المدرسة.");
      cur.active = false; cur.closedAt = now; cur.by = me.uid;
    } else if (action === "activate") {
      if (sc.active === false) throw secMsg("failed-precondition", "المدرسة موقوفة من إدارة النظام.");
      if (!cur.licensed) throw secMsg("failed-precondition", SEM_AR[period] + " غير مرخّص لمدرستك. تواصل مع إدارة النظام.");
      if (cur.locked) throw secMsg("failed-precondition", SEM_AR[period] + " مغلق نهائيًا من إدارة النظام.");
      const per = (sc.periods || []).find((x) => x && x.id === period);
      if (!per || !per.from || !per.to) throw secMsg("failed-precondition", "لم تُحدَّد تواريخ " + SEM_AR[period] + " لمدرستك. تواصل مع إدارة النظام.");
      const today = semTodayRiyadh();
      if (today < per.from) throw secMsg("failed-precondition", "لم يبدأ " + SEM_AR[period] + " بعد (يبدأ في " + per.from + ").");
      if (today > per.to) throw secMsg("failed-precondition", "انتهى " + SEM_AR[period] + " في " + per.to + ".");
      cur.active = true; cur.activatedAt = now; cur.by = me.uid;
    }
    sems[period] = cur;
    const upd = { semesters: sems, updatedAt: now };
    // تعبئة semDates (مللي ثانية بتوقيت الرياض) من periods لمدرسة حُفظت تواريخها قبل هذه المرحلة — تقرؤها القواعد
    if (!sc.semDates && (sc.periods || []).length) {
      const sd = {};
      (sc.periods || []).forEach((x) => { if (x && x.id && x.from && x.to) sd[x.id] = { fromMs: semMs(x.from, false), toMs: semMs(x.to, true) }; });
      if (Object.keys(sd).length) upd.semDates = sd;
    }
    // يبقى الحقل القديم activePeriod صالحًا للإشعارات المجدولة: الفصل المفعّل الوحيد، وإلا يبقى كما هو
    const act = SEM_IDS.filter((p) => (sems[p] || {}).active === true);
    if (act.length === 1) upd.activePeriod = act[0];
    tx.update(ref, upd);
    return { semesters: sems, activePeriod: upd.activePeriod || sc.activePeriod || "first" };
  });
  return Object.assign({ ok: true }, res);
});

/* (المرحلة ٥) أُلغي الحذف التلقائي لبيانات المستقلين المنتهين: تبقى محفوظة للقراءة حتى يجدّدوا. */

/* ===== (2026-10-14.1) ختم العام الدراسي الموحَّد لبنك الأسئلة =====
   قيمة واحدة للنظام كله (مدارس ومستقلون) يضبطها أدمن النظام فقط: settings/academicYear = {year, endsMs, prevYear, prevEndsMs}.
   الختم يُثبَّت على النشاط عند حفظه في البنك (yearStamp) ولا يتغير بتغيّر العام لاحقًا، إلا في حالتين تصحَّحان هنا:
   (أ) نشاط بلا ختم (قديم، أو حُفظ قبل أن يُضبط عام) ← يُختم بالعام الجديد.
   (ب) نشاط حُفظ بعد نهاية العام السابق ولم يُحدَّث العام وقتها (فأخذ العام القديم) ← يُعاد ختمه بالعام الجديد حسب وقت حفظه،
       إلا ما أعاد المعلم ختمه بنفسه بتعديله (stampMode = "edit") فيبقى. */
const AY_YEAR_RE = /^1[34]\d\d$/;
async function ayRestamp(db, year, prevYear, prevEndsMs) {
  let stamped = 0, restamped = 0, last = null;
  for (;;) {
    let q = db.collection("questionBank").orderBy(admin.firestore.FieldPath.documentId()).select("yearStamp", "savedAt", "stampMode").limit(400);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let n = 0;
    for (const doc of snap.docs) {
      const d = doc.data() || {};
      const ys = d.yearStamp == null ? "" : String(d.yearStamp);
      const sv = d.savedAt && typeof d.savedAt.toMillis === "function" ? d.savedAt.toMillis() : (typeof d.savedAt === "number" ? d.savedAt : 0);
      if (!ys) {
        batch.update(doc.ref, { yearStamp: year, stampMode: "auto" }); stamped++; n++;
      } else if (prevYear && ys === prevYear && d.stampMode !== "edit" && prevEndsMs && sv > prevEndsMs) {
        batch.update(doc.ref, { yearStamp: year, stampMode: "auto" }); restamped++; n++;
      }
    }
    if (n) await batch.commit();
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }
  return { stamped, restamped };
}

/* تطبيق العام الدراسي على settings/academicYear وإعادة ختم البنك (يستعملها academicYear وacademicCalendar) */
async function ayApply(db, year, endsMs, uid) {
  const ref = db.collection("settings").doc("academicYear");
  const cur = (await ref.get()).data() || {};
  if (cur.year && Number(year) < Number(cur.year)) throw secMsg("failed-precondition", "لا يمكن الرجوع إلى عام أقدم من العام الحالي (" + cur.year + ").");
  const now = Date.now();
  if (cur.year && cur.year === year) {
    await ref.set(Object.assign({}, cur, { endsMs, updatedAt: now, by: uid }));
    return { stamped: 0, restamped: 0 };
  }
  await ref.set({
    year, endsMs, prevYear: cur.year || null, prevEndsMs: cur.endsMs || null, setAt: now, updatedAt: now, by: uid,
  });
  return ayRestamp(db, year, cur.year || null, cur.endsMs || null);
}

exports.academicYear = onCall(async (request) => {
  const me = await secCaller(request, { needDoc: true });
  if (!secIsAdmin(me.data)) throw secMsg("permission-denied", "مقصور على أدمن النظام العام.");
  const d = request.data || {};
  if (String(d.action || "") !== "set") throw secMsg("invalid-argument", "إجراء غير معروف.");
  const year = String(d.year || "").trim();
  if (!AY_YEAR_RE.test(year)) throw secMsg("invalid-argument", "اكتب العام الدراسي بأربع خانات، مثل ١٤٤٧.");
  const endDate = d.endDate ? String(d.endDate) : "";
  if (endDate && !SEM_DATE_RE.test(endDate)) throw secMsg("invalid-argument", "تاريخ نهاية العام غير صالح.");
  const endsMs = endDate ? semMs(endDate, true) : null;
  const res = await ayApply(secDb(), year, endsMs, me.uid);
  return { ok: true, year, stamped: res.stamped, restamped: res.restamped };
});

/* ===== (2026-10-14.2) التقويم الدراسي المركزي: settings/academicCalendar (أدمن النظام فقط) =====
   {year, count: 1|2, startDate, midDate (للفصلين: آخر يوم في الأول؛ الثاني يبدأ في اليوم التالي), endDate,
    periods:[{id,from,to,fromMs,toMs}], startMs, endMs}
   يُعمَّم من هنا على: كل المدارس (periods/yearFrom/yearTo/semDates) وتواريخ المعلم المستقل (schoolData/soloSemesters)،
   ويُحدِّث عام ختم البنك (settings/academicYear.endsMs = نهاية العام). الفصل الحالي لأي مستخدم يُحسب من تاريخ اليوم. */
function calNextDay(dateStr) { return new Date(semMs(dateStr, false) + 86400000 + 3 * 3600 * 1000).toISOString().slice(0, 10); }
function calBuild(d) {
  const year = String(d.year || "").trim();
  if (!AY_YEAR_RE.test(year)) throw secMsg("invalid-argument", "اكتب العام الدراسي بأربع خانات، مثل ١٤٤٧.");
  const count = Number(d.count);
  if (count !== 1 && count !== 2) throw secMsg("invalid-argument", "عدد الفصول الدراسية: فصل واحد أو فصلان.");
  const startDate = String(d.startDate || ""), endDate = String(d.endDate || ""), midDate = String(d.midDate || "");
  if (!SEM_DATE_RE.test(startDate)) throw secMsg("invalid-argument", "حدّد تاريخ بداية العام الدراسي.");
  if (!SEM_DATE_RE.test(endDate)) throw secMsg("invalid-argument", "حدّد تاريخ نهاية العام الدراسي.");
  if (endDate < startDate) throw secMsg("invalid-argument", "نهاية العام الدراسي قبل بدايته.");
  let periods;
  if (count === 1) {
    periods = [{ id: "first", from: startDate, to: endDate }];
  } else {
    if (!SEM_DATE_RE.test(midDate)) throw secMsg("invalid-argument", "حدّد تاريخ نهاية نصف العام.");
    if (midDate < startDate) throw secMsg("invalid-argument", "نهاية نصف العام قبل بداية العام.");
    if (midDate >= endDate) throw secMsg("invalid-argument", "نهاية نصف العام يجب أن تسبق نهاية العام الدراسي.");
    periods = [{ id: "first", from: startDate, to: midDate }, { id: "second", from: calNextDay(midDate), to: endDate }];
  }
  periods = periods.map((p) => Object.assign({}, p, { fromMs: semMs(p.from, false), toMs: semMs(p.to, true) }));
  return {
    year, count, startDate, midDate: count === 2 ? midDate : "", endDate, periods,
    startMs: semMs(startDate, false), endMs: semMs(endDate, true),
  };
}
async function calPropagate(db, cal) {
  const sc = await db.collection("schoolData").where("_isSchool", "==", true).get();
  let n = 0;
  for (let i = 0; i < sc.docs.length; i += 400) {
    const batch = db.batch();
    sc.docs.slice(i, i + 400).forEach((doc) => {
      const semDates = {};
      cal.periods.forEach((p) => { semDates[p.id] = { fromMs: p.fromMs, toMs: p.toMs }; });
      const upd0 = {};
      const ex = ((doc.data() || {}).semExtend || {}).first;
      const p1 = cal.periods.find((x) => x.id === "first"), p2 = cal.periods.find((x) => x.id === "second");
      if (ex && !(p1 && p2 && ex > p1.toMs && ex < p2.toMs)) upd0.semExtend = secFV.delete();   // التمديد لم يعد صالحًا مع التقويم الجديد
      batch.update(doc.ref, Object.assign(upd0, {
        periods: cal.periods.map((p) => ({ id: p.id, from: p.from, to: p.to, fromMs: p.fromMs, toMs: p.toMs })),
        yearFrom: cal.startDate, yearTo: cal.endDate, yearFromMs: cal.startMs, yearToMs: cal.endMs,
        semDates, updatedAt: Date.now(),
      }));
      n++;
    });
    await batch.commit();
  }
  const solo = { updatedAt: Date.now() };
  SEM_IDS.forEach((id) => {
    const p = cal.periods.find((x) => x.id === id);
    solo[id] = p ? { from: p.from, to: p.to, fromMs: p.fromMs, toMs: p.toMs } : secFV.delete();
  });
  await db.collection("schoolData").doc("soloSemesters").set(solo, { merge: true });
  return n;
}
exports.academicCalendar = onCall(async (request) => {
  const me = await secCaller(request, { needDoc: true });
  if (!secIsAdmin(me.data)) throw secMsg("permission-denied", "مقصور على أدمن النظام العام.");
  const d = request.data || {};
  if (String(d.action || "") !== "set") throw secMsg("invalid-argument", "إجراء غير معروف.");
  const cal = calBuild(d);
  const db = secDb();
  if (cal.count === 1) {
    const lic = (await db.collection("schoolData").where("_isSchool", "==", true).get()).docs
      .filter((x) => ((x.data().semesters || {}).second || {}).licensed === true).length;
    if (lic > 0) throw secMsg("failed-precondition", "لا يمكن جعل العام فصلًا واحدًا: يوجد " + lic + " مدرسة مرخَّصة للفصل الثاني. اسحب ترخيصه منها أولًا.");
  }
  const cur = (await db.collection("settings").doc("academicYear").get()).data() || {};
  if (cur.year && Number(cal.year) < Number(cur.year)) throw secMsg("failed-precondition", "لا يمكن الرجوع إلى عام أقدم من العام الحالي (" + cur.year + ").");
  const now = Date.now();
  const old = (await db.collection("settings").doc("academicCalendar").get()).data() || {};
  await db.collection("settings").doc("academicCalendar").set(Object.assign({}, cal, { setAt: old.setAt || now, updatedAt: now, by: me.uid }));
  const schools = await calPropagate(db, cal);
  const res = await ayApply(db, cal.year, cal.endMs, me.uid);
  return { ok: true, schools, stamped: res.stamped, restamped: res.restamped };
});

/* ===== (2026-10-14.2) الفصل الحالي بوقت خوادم Google: currentPeriod =====
   أي مستخدم مسجَّل. يُرجع وقت الخادم (nowMs) والفصل الذي يقع فيه اليوم حسب التقويم المركزي settings/academicCalendar:
   داخل فصل ← معرّفه (state="during")، قبل بداية العام ← الأول (state="before")، بعد نهايته ← الأخير (state="after")،
   بلا تقويم ← period=null (state="none"). لا يعتمد على ساعة جهاز المستخدم إطلاقًا. */
function calPeriodAt(cal, nowMs) {
  if (!cal || !Array.isArray(cal.periods) || !cal.periods.length) return { period: null, state: "none" };
  const ps = cal.periods.slice().sort((a, b) => a.fromMs - b.fromMs);
  for (const p of ps) if (nowMs >= p.fromMs && nowMs <= p.toMs) return { period: p.id, state: "during" };
  if (nowMs < ps[0].fromMs) return { period: ps[0].id, state: "before" };
  return { period: ps[ps.length - 1].id, state: "after" };
}
exports.currentPeriod = onCall(async (request) => {
  const me = await secCaller(request, { allowClosed: true });
  const nowMs = Date.now();
  const cal = await secCalendar(true);
  const r = calPeriodAt(cal, nowMs);
  let period = r.period;
  let extended = false;
  // تمديد الفصل الأول لمدرسة بعينها (semExtend.first): ما دام التمديد قائمًا تبقى المدرسة في الفصل الأول
  const sid = request.data && request.data.schoolId ? String(request.data.schoolId) : "";
  if (sid && r.state === "during" && period === "second") {
    const sc = await secDb().collection("schoolData").doc(sid).get();
    const e = sc.exists ? Number(((sc.data().semExtend || {}).first) || 0) : 0;
    if (e && nowMs <= e) { period = "first"; extended = true; }
  }
  const closed = secYearEnded(cal, nowMs) && !secIsAdmin(me.data);
  return { nowMs, period, state: r.state, year: cal ? cal.year || null : null, endMs: cal ? cal.endMs || null : null, closed, extended };
});


/* ===== (2026-10-14.3) الفحص اليومي للتقويم (02:00 بتوقيت الرياض) =====
   يكتب settings/calendarState = {state: during|before|ended|none, period, year, endMs, checkedAt} لتقرأه الواجهات والإدارة بلا حساب،
   ويسجّل سطرًا في calendarLog/{yyyy-mm-dd} عند تغيّر الحالة. الإغلاق الفعلي لا يعتمد على هذه الدالة (القواعد والدوال تحسبه من التاريخ مباشرة). */
exports.dailyCalendarSweep = onSchedule({ schedule: "0 2 * * *", timeZone: "Asia/Riyadh" }, async () => {
  const db = secDb();
  const nowMs = Date.now();
  const cal = await secCalendar(true);
  const r = calPeriodAt(cal, nowMs);
  const state = !cal ? "none" : (secYearEnded(cal, nowMs) ? "ended" : (r.state === "before" ? "before" : "during"));
  const ref = db.collection("settings").doc("calendarState");
  const prev = (await ref.get()).data() || {};
  await ref.set({ state, period: r.period || null, year: cal ? cal.year || null : null, endMs: cal ? cal.endMs || null : null, checkedAt: nowMs });
  if (prev.state !== state || prev.period !== (r.period || null)) {
    const day = new Date(nowMs + 3 * 3600e3).toISOString().slice(0, 10);
    await db.collection("calendarLog").doc(day).set({ at: nowMs, from: { state: prev.state || null, period: prev.period || null }, to: { state, period: r.period || null }, year: cal ? cal.year || null : null });
  }
  console.log("dailyCalendarSweep: state=" + state + " period=" + (r.period || "-"));
});

/* =========================================================================
   (2026-10-15.1) شاشة التميز: المحتوى التلقائي والدورة الهجرية الشهرية
   - شرائح آلية في قناتي المعلمين والإداريين تُكتب في boards/{sid}_{channel}.extra (التلفاز يقرأ اللقطة فقط).
       المعلمون: التعاميم الجديدة + مناوبة اليوم (بأسماء المناوبين). الإداريون: مؤشرات + تنبيهات.
       لا إجازات ولا غياب ولا درجات ولا جوالات ولا هويات في أي شريحة. لكل شريحة مفتاح تشغيل في excellence/{sid}.auto.
   - أرقام الإنجاز لكل مكرَّم مرتبط بحساب (item.uid + item.auto): من بداية الشهر الهجري الحالي فقط، وتبدأ من الصفر كل شهر.
   - الدورة: excellence/{sid}.cycle (مثل 1448-05). عند تغيّر الشهر تُحفظ لقطة الشهر السابق في excellence/{sid}/archive/{cycle}.
   ========================================================================= */
const EXA_DEF = { circ: true, duty: true, ind: true, alerts: true, nums: true };
function exaHijri(key) {
  const p = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(key + "T12:00:00Z"));
  const g = (t) => +((p.find((x) => x.type === t) || {}).value);
  return { y: g("year"), m: g("month"), d: g("day") };
}
function exaCycle(nowMs) {
  const todayKey = new Date(nowMs + 3 * 3600e3).toISOString().slice(0, 10);
  const h = exaHijri(todayKey);
  const startKey = addDaysKey(todayKey, -(h.d - 1));
  let endKey = startKey;
  for (let i = 0; i < 31; i++) { const nx = addDaysKey(endKey, 1); if (exaHijri(nx).m !== h.m) break; endKey = nx; }
  let name = "";
  try { name = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { timeZone: "UTC", month: "long" }).format(new Date(startKey + "T12:00:00Z")); } catch (e) { name = String(h.m); }
  return { id: h.y + "-" + String(h.m).padStart(2, "0"), y: h.y, m: h.m, name, label: name + " " + arNum(h.y) + " هـ", startKey, endKey, todayKey,
    startMs: Date.parse(startKey + "T00:00:00+03:00"), endMs: Date.parse(endKey + "T23:59:59.999+03:00") };
}
const exaPrevCycle = (cyc) => exaCycle(Date.parse(addDaysKey(cyc.startKey, -1) + "T12:00:00+03:00"));
const exaMs = (x) => (x && typeof x.toMillis === "function") ? x.toMillis() : (+x || 0);
const exaIn = (ms, cyc) => ms >= cyc.startMs && ms <= cyc.endMs;

/* يحمّل مصادر الأرقام مرة واحدة لمدرسة ودورة */
async function exaLoad(db, sid, cyc, nowMs, need) {
  const L = { cyc, nowMs, period: "first", staff: [], circ: [], sigs: {}, wait: {}, waitToday: 0, visits: {}, visitsAll: 0, visitsPlanned: 0, ws: {}, wsAll: 0, refs: {}, duty: [], cal: {} };
  const sd = await db.collection("schoolData").doc(sid).get();
  L.period = (sd.exists && sd.data().activePeriod) || "first";
  L.cal = await getCalendar(db, sid);
  const us = await db.collection("users").where(new admin.firestore.FieldPath("schools", sid, "role"), ">=", "").get();
  L.staff = us.docs.map((d) => ({ id: d.id, u: d.data() })).filter((x) => x.u.active !== false && !x.u.migratedTo && ((x.u.schools || {})[sid] || {}).active !== false);
  const since = Math.min(cyc.startMs, nowMs - 14 * 864e5);
  const cs = await db.collection("circulars").doc(sid).collection("items").where("createdAt", ">=", since).get();
  L.circ = cs.docs.map((d) => Object.assign({ id: d.id, ref: d.ref }, d.data())).sort((a, b) => (b.number || 0) - (a.number || 0));
  // توقيعات الإلزامية الأحدث (للمؤشرات والتنبيهات فقط)
  if (need.sigs) {
    for (const c of L.circ.filter((x) => x.mandatory && nowMs - x.createdAt <= 14 * 864e5).slice(0, 10)) {
      const ss = await c.ref.collection("signatures").get();
      L.sigs[c.id] = {}; ss.docs.forEach((s) => { L.sigs[c.id][s.id] = exaMs(s.data().signedAt); });
    }
  }
  // انتظار: وثائق الأيام من بداية الشهر حتى اليوم
  const ttc = db.collection("timetables").doc(sid).collection("data");
  for (let k = cyc.startKey, i = 0; k <= cyc.todayKey && k <= cyc.endKey && i < 31; k = addDaysKey(k, 1), i++) {
    const w = parseVal(await ttc.doc(L.period + "_wday_" + k).get());
    if (!w || !w.sent) continue;
    (w.items || []).forEach((it) => { if (it.subUid) L.wait[it.subUid] = (L.wait[it.subUid] || 0) + 1; });
    if (k === cyc.todayKey) L.waitToday = (w.items || []).filter((it) => it.subUid).length;
  }
  // الزيارات الصفية
  const vp = await db.collection("classVisits").where("schoolId", "==", sid).get();
  vp.docs.map((d) => d.data()).filter((v) => v.kind === "plan" && v.period === L.period).forEach((v) => {
    [v.v1, v.v2].forEach((x) => {
      if (!x || !x.date || x.date < cyc.startKey || x.date > cyc.endKey) return;
      L.visitsPlanned++;
      if (x.date <= cyc.todayKey && (v.exec === "ok" || v.exec === "mod")) L.visitsAll++;
      if (x.date <= cyc.todayKey && v.exec === "ok" && v.teacherId) L.visits[v.teacherId] = (L.visits[v.teacherId] || 0) + 1;
    });
  });
  // أوراق العمل المنشورة هذا الشهر
  const ws = await db.collection("worksheets").where("schoolId", "==", sid).get();
  ws.docs.map((d) => d.data()).forEach((w) => {
    if (w.status !== "published" || !exaIn(exaMs(w.publishedAt), cyc)) return;
    L.wsAll++; if (w.createdBy) L.ws[w.createdBy] = (L.ws[w.createdBy] || 0) + 1;
  });
  // الإحالات المغلقة (حالات الإرشاد المفتوحة من تحويل)
  const gc = await db.collection("guidanceCases").where("schoolId", "==", sid).get();
  gc.docs.map((d) => d.data()).forEach((c) => {
    if (c.source === "referral" && c.status === "closed" && exaIn(+c.closedAt || 0, cyc) && c.openedBy) L.refs[c.openedBy] = (L.refs[c.openedBy] || 0) + 1;
  });
  // مناوبو اليوم (الأسماء فقط)
  if (!isHoliday(L.cal, cyc.todayKey)) {
    const dp = await db.collection("dutyPlans").where("schoolId", "==", sid).get();
    const seen = new Set();
    dp.docs.map((d) => d.data()).filter((v) => v.period === L.period && v.pub).forEach((v) => {
      ((v.pub.dutyDays || {})[cyc.todayKey] || []).forEach((id) => {
        const key = id + "|" + (v.stageLabel || v.pub.stageLabel || "");
        if (seen.has(key)) return; seen.add(key);
        L.duty.push({ id, name: (v.pub.names || {})[id] || "", stage: v.stageLabel || v.pub.stageLabel || "" });
      });
    });
    L.duty = L.duty.filter((x) => x.name);
  }
  return L;
}

/* أرقام مكرَّم واحد (الشهر الهجري الحالي فقط). تُرجع حتى ثلاثة صفوف {v,l,i} بما هو أكبر من صفر */
async function exaNumsFor(L, uid) {
  const rows = [];
  const add = (n, l, i) => { if (n > 0) rows.push({ v: arNum(n), l, i }); };
  add(L.ws[uid] || 0, "أوراق عمل منشورة هذا الشهر", "book");
  add(L.visits[uid] || 0, "زيارات صفية نُفِّذت في موعدها", "target");
  add(L.wait[uid] || 0, "حصص انتظار نفّذها هذا الشهر", "clock");
  add(L.refs[uid] || 0, "إحالات طلابية أُغلقت", "heart");
  // سرعة التوقيع: التعاميم الإلزامية الواردة هذا الشهر الموقَّعة خلال ٢٤ ساعة
  let fast = 0;
  for (const c of L.circ.filter((x) => x.mandatory && exaIn(x.createdAt || 0, L.cyc) && (x.recipients || []).includes(uid))) {
    const s = await c.ref.collection("signatures").doc(uid).get();
    if (s.exists) { const at = exaMs(s.data().signedAt); if (at && at - c.createdAt <= 864e5) fast++; }
  }
  add(fast, "تعاميم وقّعها خلال ٢٤ ساعة من وصولها", "sparkle");
  return rows.slice(0, 3);
}

/* الشرائح الآلية (type: rows | stats) — كل شريحة لها cat يظهر في الشريط الجانبي */
function exaSlides(L, sw) {
  const t = [], a = [];
  const today = L.cyc.todayKey, staffN = Math.max(1, L.staff.length);
  if (sw.circ) {
    const rows = L.circ.filter((c) => c.source !== "duty" && (c.recipients || []).length >= 0.8 * staffN && L.nowMs - c.createdAt <= 7 * 864e5).slice(0, 5)
      .map((c) => [c.title || "تعميم", "تعميم رقم " + arNum(c.number || 0), c.mandatory ? "إلزامي" : "للاطلاع", c.mandatory ? "warn" : "ok"]);
    if (rows.length) t.push({ cat: "تعاميم جديدة", type: "rows", title: "التعاميم الجديدة", lead: "وصلت خلال الأيام السبعة الماضية", rows });
  }
  if (sw.duty && L.duty.length) {
    t.push({ cat: "مناوبة اليوم", type: "rows", title: "المناوبة اليوم", lead: hijriDay(today),
      rows: L.duty.slice(0, 8).map((d) => [d.name, d.stage, "مناوب", ""]) });
  }
  if (sw.ind) {
    const st = [];
    const mand = L.circ.filter((x) => x.mandatory && L.sigs[x.id]);
    let need = 0, got = 0;
    mand.forEach((c) => { const rc = c.recipients || []; need += rc.length; got += rc.filter((u) => L.sigs[c.id][u]).length; });
    if (need) st.push([arNum(Math.round(got * 100 / need)) + "٪", "نسبة توقيع التعاميم الإلزامية"]);
    if (L.duty.length) st.push([arNum(L.duty.length), "مناوبون اليوم"]);
    if (L.waitToday) st.push([arNum(L.waitToday), "حصص انتظار اليوم"]);
    if (L.wsAll) st.push([arNum(L.wsAll), "أوراق عمل منشورة هذا الشهر"]);
    if (st.length < 4 && L.visitsAll) st.push([arNum(L.visitsAll) + "/" + arNum(L.visitsPlanned), "زيارات صفية منفّذة من المخطط"]);
    if (st.length) a.push({ cat: "مؤشرات", type: "stats", title: "مؤشرات الشهر", lead: L.cyc.label, stats: st.slice(0, 4) });
  }
  if (sw.alerts) {
    const rows = [];
    L.circ.filter((c) => c.mandatory && L.sigs[c.id] && L.nowMs - c.createdAt >= 48 * 3600e3).forEach((c) => {
      const rc = c.recipients || [], un = rc.filter((u) => !L.sigs[c.id][u]).length;
      if (un > 0) rows.push([c.title || "تعميم", "تعميم رقم " + arNum(c.number || 0) + " · مضى " + arNum(Math.floor((L.nowMs - c.createdAt) / 864e5)) + " يوم", "لم يوقّع " + arNum(un) + " من " + arNum(rc.length), "warn"]);
    });
    if (rows.length) a.push({ cat: "تنبيهات", type: "rows", title: "تنبيهات", lead: "تعاميم إلزامية بانتظار التوقيع", rows: rows.slice(0, 5) });
  }
  return { teachers: t, admins: a };
}

/* لقطة الدورة السابقة للأرشيف */
async function exaArchive(db, sid, cyc, nowMs, nextStart) {
  const L = await exaLoad(db, sid, cyc, nowMs, {});
  const ds = await db.collection("excellence").doc(sid).collection("items").get();
  const items = [];
  for (const d of ds.docs) {
    const v = d.data(); if (v.demo) continue;
    const stamp = Math.max(+v.createdAt || 0, +v.updatedAt || 0);
    if (stamp < cyc.startMs || stamp >= nextStart) continue;
    let m = v.m || [];
    if (v.auto && v.uid) { const r = await exaNumsFor(L, v.uid); if (r.length) m = r; }
    items.push({ ch: v.ch, cat: v.cat, name: v.name, sub: v.sub || "", note: v.note || "", m, photo: v.photo || "" });
  }
  if (!items.length) return null;
  if (items.reduce((s, i) => s + (i.photo ? i.photo.length : 0), 0) > 600000) items.forEach((i) => { i.photo = ""; });
  const doc = { cycle: cyc.id, label: cyc.label, name: cyc.name, y: cyc.y, m: cyc.m, items, savedAt: nowMs, schoolId: sid };
  await db.collection("excellence").doc(sid).collection("archive").doc(cyc.id).set(doc);
  return doc;
}

async function exaRefreshSchool(db, sid, nowMs) {
  const cyc = exaCycle(nowMs);
  const exRef = db.collection("excellence").doc(sid);
  const exS = await exRef.get();
  const ex = exS.exists ? exS.data() : {};
  const sw = Object.assign({}, EXA_DEF, ex.auto || {});
  let archived = null;
  if (ex.cycle && ex.cycle !== cyc.id) {
    archived = await exaArchive(db, sid, exaPrevCycle(cyc), nowMs, cyc.startMs);
  }
  if (ex.cycle !== cyc.id) await exRef.set({ cycle: cyc.id, cycleLabel: cyc.label, cycleStartMs: cyc.startMs }, { merge: true });
  const bs = await db.collection("boards").where("schoolId", "==", sid).get();
  const boards = bs.docs.filter((d) => d.data().live !== false);
  if (!boards.length) return { cycle: cyc.id, archived: !!archived, boards: 0 };
  const L = await exaLoad(db, sid, cyc, nowMs, { sigs: sw.ind || sw.alerts });
  const slides = exaSlides(L, sw);
  const ds = await exRef.collection("items").get();
  const drafts = {}; ds.docs.forEach((d) => { drafts[d.id] = d.data(); });
  const numsCache = {};
  let n = 0;
  for (const b of boards) {
    const v = b.data(), items = (v.items || []).map((i) => Object.assign({}, i));
    if (sw.nums) {
      for (const it of items) {
        const d = drafts[it.id];
        if (!d || !d.auto || !d.uid) continue;
        if (Math.max(+d.createdAt || 0, +d.updatedAt || 0) < cyc.startMs) continue;   // بند من دورة سابقة: لا أرقام جديدة له
        if (!numsCache[d.uid]) numsCache[d.uid] = await exaNumsFor(L, d.uid);
        if (numsCache[d.uid].length) it.m = numsCache[d.uid].map((r) => ({ v: r.v, l: r.l, i: r.i }));
      }
    }
    const extra = v.channel === "teachers" ? slides.teachers : v.channel === "admins" ? slides.admins : [];
    await b.ref.update({ items, extra, autoAt: nowMs, autoCycle: cyc.id });
    n++;
  }
  return { cycle: cyc.id, archived: !!archived, boards: n, extra: { teachers: slides.teachers.length, admins: slides.admins.length } };
}

exports.excellenceAutoRefresh = onCall(async (request) => {
  const db = admin.firestore();
  const sid = request.data && request.data.sid;
  await exAssertManager(db, request, sid);
  return await exaRefreshSchool(db, sid, Date.now());
});

exports.excellenceAutoRun = onSchedule({ schedule: "30 6,9,12,15 * * *", timeZone: "Asia/Riyadh", timeoutSeconds: 300, memory: "512MiB" }, async () => {
  const db = admin.firestore();
  const schools = await db.collection("schoolData").where("_isSchool", "==", true).get();
  let done = 0;
  for (const s of schools.docs) {
    if (s.data().active === false) continue;
    try {
      const has = await db.collection("excellence").doc(s.id).collection("items").limit(1).get();
      const bd = await db.collection("boards").where("schoolId", "==", s.id).limit(1).get();
      if (has.empty && bd.empty) continue;
      await exaRefreshSchool(db, s.id, Date.now()); done++;
    } catch (e) { console.error("excellenceAutoRun", s.id, e); }
  }
  console.log("excellenceAutoRun: schools", done);
});


/* ============================================================================================
   (2026-10-16.5) الاقتراح بالذكاء الاصطناعي — خدمة عامة aiSuggest (Cloudflare Workers AI، الخطة المجانية)
   - مجانية بالكامل: السقف الصلب من Cloudflare (10,000 وحدة يوميًا؛ عند النفاد تفشل الطلبات ولا تُحاسب)،
     ونوقف نحن قبله بحدٍّ عام وحدٍّ لكل مدرسة. اليوم = يوم UTC (يتجدد ٣ فجرًا بتوقيت الرياض) ليطابق تجدد Cloudflare.
   - المفتاح والحساب سرّان في الخادم (CF_API_TOKEN / CF_ACCOUNT_ID). المجموعتان aiUsage / aiPrompts / aiConfig مغلقتان على العميل.
   - لا تُرسل للنموذج أسماء ولا بيانات شخصية: عنوان النشاط والمجال فقط.
   - إضافة نوع حقل جديد: مدخل واحد في AI_KINDS، أو مستند aiPrompts/{النوع} في Firestore بلا نشر.
   - الإعدادات (اختيارية) بمستند aiConfig/main: enabled, model, dailySchool, dailyGlobal.
   ============================================================================================ */
const AI_DEFAULTS = { enabled: true, model: "@cf/meta/llama-3.1-8b-instruct", dailySchool: 30, dailyGlobal: 150 };
const AI_KINDS = {
  open_activity_description: {
    perm: "activity",
    fields: ["title", "domain"],
    system: "أنت مساعد لرائد النشاط في مدرسة سعودية. تكتب بالعربية الفصحى فقط دون أي لهجة عامية ودون رموز تنسيق أو قوائم أو عناوين، وتلتزم بالإيجاز.",
    user: "اسم النشاط: {title}\nالمجال: {domain}\nاكتب وصفًا لهذا النشاط من جملتين إلى ثلاث جمل موجّهًا للمعلم، يبيّن المطلوب منه تنفيذه (فقرة أو مبادرة أو برنامج مناسب لطلاب المدرسة) وما يلزم توثيقه (صور الشواهد وعدد المستفيدين). لا تذكر أسماء أشخاص ولا تواريخ. أعد الوصف فقط.",
    req: "title", reqMsg: "اكتب اسم النشاط أولًا.", lim: { title: 120 },
    maxTokens: 260, maxLen: 600
  },
  meeting_summary: {
    perm: "activity",
    fields: ["number", "title"],
    system: "أنت مساعد لأمين سر مجلس النشاط في مدرسة سعودية. تكتب بالعربية الفصحى فقط دون لهجة عامية ودون رموز تنسيق أو قوائم أو عناوين، وتلتزم بالإيجاز والدقة ولا تختلق أسماء أو أرقامًا أو تواريخ.",
    user: "عنوان الاجتماع: {title}\nاكتب ملخصًا موجزًا من ثلاث إلى أربع جمل لاجتماع مجلس النشاط رقم {number} بهذا العنوان، يتناول المحاور المعتادة: متابعة تنفيذ خطة النشاط، واستعراض الفعاليات المنفذة والمتاحة، وتوثيق الشواهد، وما يلزم من تحسين. لا تذكر أسماء أشخاص ولا أرقامًا ولا تواريخ. أعد الملخص فقط.",
    req: "title", reqMsg: "اكتب عنوان الاجتماع أولًا.", lim: { number: 6, title: 80 }, maxTokens: 300, maxLen: 700
  },
  meeting_decisions: {
    perm: "activity",
    fields: ["summary", "title"],
    system: "أنت مساعد لأمين سر مجلس النشاط في مدرسة سعودية. تكتب بالعربية الفصحى فقط دون لهجة عامية ودون ترقيم أو رموز أو عناوين، وتلتزم بالإيجاز ولا تختلق أسماء أو أرقامًا أو تواريخ.",
    user: "عنوان الاجتماع: {title}\nملخص الاجتماع: {summary}\nاستخرج منه من ثلاثة إلى أربعة قرارات عملية قصيرة، قرارًا في كل سطر، وكل قرار جملة واحدة تبدأ بفعل. لا تضف ما لم يرد في الملخص. أعد القرارات فقط.",
    req: "summary", reqMsg: "اكتب ملخص الاجتماع أولًا.", lim: { summary: 600, title: 80 },
    keepLines: true, maxTokens: 260, maxLen: 600
  },
  excellence_note: {
    perm: "any",
    fields: ["cat"],
    system: "أنت مساعد في مدرسة سعودية يكتب عبارات تكريم قصيرة بالعربية الفصحى فقط دون لهجة عامية ودون رموز تنسيق أو علامات تنصيص، ولا يذكر أسماء.",
    user: "فئة التكريم: {cat}\nاكتب عبارة واحدة قصيرة (لا تتجاوز عشر كلمات) تصلح سببًا للتكريم في لوحة العرض. لا تذكر أسماء ولا أرقامًا. أعد العبارة فقط.",
    req: "cat", reqMsg: "اختر فئة التكريم أولًا.", lim: { cat: 60 }, maxTokens: 60, maxLen: 130
  }
};
let AI_CACHE = { at: 0, cfg: null, prompts: {} };
async function aiConfig(db, kind) {
  const now = Date.now();
  if (!AI_CACHE.at || now - AI_CACHE.at > 60000) {
    const c = await db.collection("aiConfig").doc("main").get();
    AI_CACHE = { at: now, cfg: Object.assign({}, AI_DEFAULTS, c.exists ? c.data() : {}), prompts: {} };
  }
  if (!(kind in AI_CACHE.prompts)) {
    const p = await db.collection("aiPrompts").doc(kind).get();
    AI_CACHE.prompts[kind] = p.exists ? p.data() : null;
  }
  return { cfg: AI_CACHE.cfg, over: AI_CACHE.prompts[kind] };
}
function aiClean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[{}<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function aiTidy(text, maxLen, keepLines) {
  if (keepLines) {
    const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/[*_#`>~]+/g, "").replace(/^\s*(?:[-•\u2022]|\d+[.)\-]|[٠-٩]+[.)\-])\s*/, "").replace(/\s+/g, " ").trim()).filter(Boolean);
    let out = lines.join("\n");
    if (out.length > maxLen) { const cut = out.slice(0, maxLen), i = cut.lastIndexOf("\n"); out = i > 20 ? cut.slice(0, i) : cut; }
    return out;
  }
  let t = String(text || "").replace(/[*_#`>~]+/g, "").replace(/^\s*["«“]+|["»”]+[.\s]*$/g, "").replace(/\s+/g, " ").trim();
  if (t.length > maxLen) {
    const cut = t.slice(0, maxLen), i = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("،"), cut.lastIndexOf("؛"));
    t = i > maxLen * 0.5 ? cut.slice(0, i + 1) : cut;
  }
  return t;
}
async function aiAllowed(db, u, uid, sid, perm) {
  if (secIsAdmin(u)) return true;
  const ctx = secStaffCtx(u, sid);
  if (perm === "any") return !!(ctx || secIsSchoolAdminOf(u, sid));
  if (perm === "activity") {
    if (!ctx) return false;
    if (secPerm(ctx, "tools.activity", "edit")) return true;
    for (const per of ["first", "second"]) {
      const c = await db.collection("activityCouncil").doc(sid + "_" + per).get();
      if (c.exists && c.data().secretaryId === uid) return true;
    }
    return false;
  }
  return false;
}
async function aiReserve(db, sid, day, cfg) {
  const sRef = db.collection("aiUsage").doc(sid + "_" + day), gRef = db.collection("aiUsage").doc("_all_" + day);
  return db.runTransaction(async (tx) => {
    const [s, g] = await Promise.all([tx.get(sRef), tx.get(gRef)]);
    const sc = s.exists ? (s.data().count || 0) : 0, gc = g.exists ? (g.data().count || 0) : 0;
    if (gc >= cfg.dailyGlobal) throw secMsg("resource-exhausted", "بلغت خدمة الاقتراح حدها اليومي العام، جرّب بعد الثالثة فجرًا.");
    if (sc >= cfg.dailySchool) throw secMsg("resource-exhausted", "بلغت مدرستك الحد اليومي لاقتراحات الذكاء الاصطناعي (" + cfg.dailySchool + ")، يتجدد بعد الثالثة فجرًا.");
    tx.set(sRef, { schoolId: sid, day, count: sc + 1, updatedAt: Date.now() }, { merge: true });
    tx.set(gRef, { day, count: gc + 1, updatedAt: Date.now() }, { merge: true });
    return { used: sc + 1, left: cfg.dailySchool - sc - 1 };
  });
}
async function aiRefund(db, sid, day) {
  const inc = admin.firestore.FieldValue.increment(-1);
  try {
    await db.collection("aiUsage").doc(sid + "_" + day).set({ count: inc }, { merge: true });
    await db.collection("aiUsage").doc("_all_" + day).set({ count: inc }, { merge: true });
  } catch (e) { console.warn("aiRefund", e && e.message); }
}
async function aiCallModel(cfg, system, user, maxTokens) {
  const acc = CF_ACCOUNT_ID.value(), tok = CF_API_TOKEN.value();
  if (!acc || !tok) throw secMsg("failed-precondition", "خدمة الاقتراح غير مهيّأة بعد.");
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 25000);
  let resp, body;
  try {
    resp = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(acc) + "/ai/run/" + cfg.model, {
      method: "POST", signal: ac.signal,
      headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature: 0.6 })
    });
    body = await resp.json().catch(() => ({}));
  } catch (e) {
    throw secMsg("unavailable", "تعذّر الوصول لخدمة الاقتراح الآن، حاول لاحقًا.");
  } finally { clearTimeout(timer); }
  const errs = JSON.stringify(body && body.errors || "");
  if (resp.status === 429 || /daily free allocation|neurons|quota|rate/i.test(errs)) {
    const e = secMsg("resource-exhausted", "انتهت الحصة اليومية المجانية للذكاء الاصطناعي، جرّب بعد الثالثة فجرًا.");
    e.aiQuotaExhausted = true; throw e;
  }
  if (!resp.ok || body.success === false) { console.warn("aiCallModel", resp.status, errs.slice(0, 300)); throw secMsg("unavailable", "تعذّر توليد الاقتراح الآن، حاول لاحقًا."); }
  const r = body.result || {};
  const text = typeof r.response === "string" ? r.response : (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || "";
  return text;
}
exports.aiSuggest = onCall({ secrets: [CF_ACCOUNT_ID, CF_API_TOKEN], timeoutSeconds: 40 }, async (request) => {
  const me = await secCaller(request, { needDoc: true });
  const d = request.data || {};
  const kind = String(d.kind || ""), sid = String(d.schoolId || "");
  const def = AI_KINDS[kind];
  if (!def) throw secMsg("invalid-argument", "نوع الاقتراح غير معروف.");
  if (!sid) throw secMsg("invalid-argument", "حدّد المدرسة.");
  const db = secDb();
  if (!(await aiAllowed(db, me.data, me.uid, sid, def.perm))) throw secMsg("permission-denied", "ليست لديك صلاحية استعمال الاقتراح هنا.");
  const { cfg, over } = await aiConfig(db, kind);
  if (cfg.enabled === false || (over && over.enabled === false)) throw secMsg("failed-precondition", "خدمة الاقتراح موقوفة حاليًا.");
  const ctx = {};
  for (const f of def.fields) ctx[f] = aiClean(d[f], (def.lim && def.lim[f]) || 60);
  if (def.req && !ctx[def.req]) throw secMsg("invalid-argument", def.reqMsg || "أكمل البيانات المطلوبة أولًا.");
  const sys = (over && over.system) || def.system;
  let usr = (over && over.user) || def.user;
  def.fields.forEach((f) => { usr = usr.split("{" + f + "}").join(ctx[f] || "غير محدد"); });
  const maxTokens = Math.min(Number((over && over.maxTokens) || def.maxTokens) || 260, 400);
  const day = new Date().toISOString().slice(0, 10);
  const rs = await aiReserve(db, sid, day, cfg);
  try {
    const raw = await aiCallModel(cfg, sys, usr, maxTokens);
    const text = aiTidy(raw, def.maxLen, def.keepLines);
    if (text.length < 10) throw secMsg("unavailable", "لم يُنتج النموذج اقتراحًا مناسبًا، أعد المحاولة.");
    return { text, remainingToday: rs.left };
  } catch (e) {
    await aiRefund(db, sid, day);
    if (e && e.aiQuotaExhausted) {
      try { await db.collection("aiUsage").doc("_all_" + day).set({ count: cfg.dailyGlobal, exhaustedAt: Date.now() }, { merge: true }); } catch (x) { /* لا شيء */ }
    }
    throw e;
  }
});

