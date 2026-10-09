/**
 * מערכת אישורי הגעה לחתונה — צד שרת (Google Apps Script)
 *
 * הקובץ הזה מודבק ב-Extensions > Apps Script של גיליון ה-Google Sheets.
 * הוא עושה שלושה דברים:
 *   1. מוסיף לגיליון תפריט "💍 אישורי הגעה" (הגדרה ראשונית + יצירת קישורי וואטסאפ)
 *   2. doGet  — האתר שואל "מי האורח עם המזהה הזה?"
 *   3. doPost — האתר שולח את התשובה של האורח, והיא נכתבת לגיליון
 */

// ===================== הגדרות — לערוך כאן =====================

// כתובת האתר ב-GitHub Pages (עם / בסוף)
const SITE_URL = 'https://zoeykulp.github.io/wedding-rsvp/';

// נוסח הודעת הוואטסאפ. {name} יוחלף בשם המוזמן, {link} בקישור האישי שלו.
const INVITE_MESSAGE =
  'היי {name}! 🤍\n' +
  'הוזמנתם לחתונה של ידין וויקטוריה 💍\n\n' +
  'האירוע יתקיים ביום חמישי, 26.11.26\n' +
  'בחוות אלנבי, נצר סרני\n\n' +
  'נשמח לדעת אם תגיעו 🙏\n' +
  'לאישור הגעה לחצו כאן 👇\n' +
  '{link}';

// כמה אנשים מותר לאשר כברירת מחדל, אם העמודה "מקסימום אורחים" ריקה
const DEFAULT_MAX_GUESTS = 2;

// ================================================================

const GUESTS_SHEET = 'מוזמנים';
const SUMMARY_SHEET = 'סיכום';
const STATUSES = ['מגיע', 'לא מגיע', 'אולי'];

// סדר העמודות בגיליון. status..updated חייבות להישאר רצופות (doPost כותב אותן בבת אחת).
const COLUMNS = [
  ['name', 'שם'],
  ['phone', 'טלפון'],
  ['max', 'מקסימום אורחים'],
  ['status', 'סטטוס'],
  ['count', 'מגיעים'],
  ['veg', 'צמחוני'],
  ['vegan', 'טבעוני'],
  ['gf', 'ללא גלוטן'],
  ['allergy', 'אלרגיות'],
  ['notes', 'הערות'],
  ['updated', 'עודכן'],
  ['send', 'שליחה'],
  ['sent', 'נשלח'],
  ['id', 'מזהה'],
];
const C = Object.fromEntries(COLUMNS.map(([key], i) => [key, i]));
const letter_ = key => String.fromCharCode(65 + C[key]);

// ---------------------- תפריט והגדרה ----------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💍 אישורי הגעה')
    .addItem('הגדרה ראשונית', 'setup')
    .addItem('צור קישורי שליחה', 'generateLinks')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();

  const sh = ss.getSheetByName(GUESTS_SHEET) || ss.insertSheet(GUESTS_SHEET, 0);
  sh.setRightToLeft(true);
  sh.getRange(1, 1, 1, COLUMNS.length)
    .setValues([COLUMNS.map(c => c[1])])
    .setFontWeight('bold')
    .setBackground('#e7ebe0');
  sh.setFrozenRows(1);
  const rows = sh.getMaxRows() - 1;
  sh.getRange(2, C.phone + 1, rows).setNumberFormat('@'); // שומר על ה-0 בהתחלה
  sh.getRange(2, C.status + 1, rows).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES).setAllowInvalid(false).build()
  );
  sh.getRange(2, C.sent + 1, rows).insertCheckboxes();
  sh.getRange(2, C.updated + 1, rows).setNumberFormat('dd/MM HH:mm');

  const sum = ss.getSheetByName(SUMMARY_SHEET) || ss.insertSheet(SUMMARY_SHEET, 1);
  sum.clear();
  sum.setRightToLeft(true);
  const col = key => `'${GUESTS_SHEET}'!${letter_(key)}2:${letter_(key)}`;
  const coming = `${col('status')},"מגיע"`;
  const summary = [
    ['רשומות מוזמנים', `=COUNTA(${col('name')})`],
    ['אישרו הגעה (רשומות)', `=COUNTIF(${coming})`],
    ['סה"כ אורחים מגיעים', `=SUMIF(${coming},${col('count')})`],
    ['לא מגיעים', `=COUNTIF(${col('status')},"לא מגיע")`],
    ['אולי', `=COUNTIF(${col('status')},"אולי")`],
    ['עוד לא ענו', `=COUNTIFS(${col('name')},"<>",${col('status')},"")`],
    ['', ''],
    ['מנות צמחוניות', `=SUMIF(${coming},${col('veg')})`],
    ['מנות טבעוניות', `=SUMIF(${coming},${col('vegan')})`],
    ['ללא גלוטן', `=SUMIF(${coming},${col('gf')})`],
    ['אלרגיות', `=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(${col('name')}&": "&${col('allergy')},${col('allergy')}<>"",${col('status')}="מגיע")),"אין")`],
  ];
  sum.getRange(1, 1, summary.length, 2).setValues(summary);
  sum.getRange(1, 1, summary.length, 1).setFontWeight('bold');
  sum.setColumnWidth(1, 180);
  sum.setColumnWidth(2, 320);
  sum.getRange(summary.length, 2).setWrap(true);

  installWarmup_();
  SpreadsheetApp.getUi().alert('הגיליון מוכן ✅\nעכשיו אפשר להדביק שמות וטלפונים בגיליון "מוזמנים".');
}

// ---------------------- יצירת קישורי וואטסאפ ----------------------

function generateLinks() {
  const ui = SpreadsheetApp.getUi();
  if (SITE_URL.includes('USERNAME')) {
    ui.alert('צריך קודם לעדכן את SITE_URL בראש הקוד לכתובת האתר שלכם.');
    return;
  }
  const sh = guestsSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) {
    ui.alert('אין מוזמנים בגיליון עדיין.');
    return;
  }

  const data = sh.getRange(2, 1, n, COLUMNS.length).getValues();
  const used = new Set(data.map(r => String(r[C.id]).trim()).filter(Boolean));
  const ids = [];
  const links = [];
  const badPhones = [];
  let made = 0;

  data.forEach(r => {
    const name = String(r[C.name]).trim();
    let id = String(r[C.id]).trim();
    if (!name) {
      ids.push([id]);
      links.push(['']);
      return;
    }
    if (!id) {
      do id = newId_(); while (used.has(id));
      used.add(id);
    }
    ids.push([id]);

    const phone = normalizePhone_(r[C.phone]);
    if (!phone) {
      badPhones.push(name);
      links.push(['']);
      return;
    }
    const text = INVITE_MESSAGE.replace('{name}', name).replace('{link}', SITE_URL + '?id=' + id);
    // ישר ל-WhatsApp Web, בלי wa.me: ההפניה של wa.me משבשת אימוג'ים להודעה עם �
    const wa = 'https://web.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(text);
    links.push([`=HYPERLINK("${wa}","שלח בוואטסאפ 📲")`]);
    made++;
  });

  sh.getRange(2, C.id + 1, n, 1).setValues(ids);
  sh.getRange(2, C.send + 1, n, 1).setFormulas(links);
  installWarmup_();
  warmUp();

  let msg = `נוצרו ${made} קישורי שליחה ✅`;
  if (badPhones.length) msg += `\n\nמספר טלפון חסר או לא תקין אצל:\n${badPhones.join('\n')}`;
  ui.alert(msg);
}

// ---------------------- API לאתר ----------------------

/** GET ?id=xxx → פרטי האורח ותשובה קודמת (אם יש) */
function doGet(e) {
  const id = String((e.parameter || {}).id || '').trim();
  if (!id) return json_({ ok: false, error: 'not_found' });

  // קודם מהזיכרון המהיר, כדי לא לפתוח את הגיליון (זה החלק האיטי)
  const cached = CacheService.getScriptCache().get(CACHE_PREFIX + id);
  if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

  const found = findGuest_(id);
  if (!found) return json_({ ok: false, error: 'not_found' });
  const payload = guestPayload_(found.row);
  cacheGuest_(id, payload);
  return json_(payload);
}

function guestPayload_(r) {
  return {
    ok: true,
    name: r[C.name],
    max: maxGuests_(r),
    response: r[C.status]
      ? {
          status: r[C.status],
          count: r[C.count],
          veg: r[C.veg],
          vegan: r[C.vegan],
          gf: r[C.gf],
          allergy: r[C.allergy],
          notes: r[C.notes],
        }
      : null,
  };
}

/** POST {id, status, count, veg, vegan, gf, allergy, notes} → שומר לגיליון */
function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (_) {
    return json_({ ok: false, error: 'bad_json' });
  }
  if (!STATUSES.includes(d.status)) return json_({ ok: false, error: 'bad_status' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findGuest_(d.id);
    if (!found) return json_({ ok: false, error: 'not_found' });

    const coming = d.status === 'מגיע';
    const count = coming ? clampInt_(d.count, 1, maxGuests_(found.row)) : 0;
    const values = [
      d.status,
      count,
      clampInt_(d.veg, 0, count),
      clampInt_(d.vegan, 0, count),
      clampInt_(d.gf, 0, count),
      coming ? cleanText_(d.allergy) : '',
      cleanText_(d.notes),
      new Date(),
    ];
    guestsSheet_().getRange(found.rowNum, C.status + 1, 1, values.length).setValues([values]);
    found.row.splice(C.status, values.length, ...values);
    cacheGuest_(found.row[C.id], guestPayload_(found.row));
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------- עזרים ----------------------

function guestsSheet_() {
  return SpreadsheetApp.getActive().getSheetByName(GUESTS_SHEET);
}

function findGuest_(id) {
  id = String(id || '').trim();
  if (!id) return null;
  const sh = guestsSheet_();
  // מחפש רק בעמודת המזהה, במקום לקרוא את כל הגיליון
  const cell = sh.getRange(2, C.id + 1, sh.getMaxRows() - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  if (!cell) return null;
  const rowNum = cell.getRow();
  return { row: sh.getRange(rowNum, 1, 1, COLUMNS.length).getValues()[0], rowNum };
}

// ---------------------- מהירות: זיכרון מהיר + חימום ----------------------

const CACHE_PREFIX = 'g:';
const CACHE_SECONDS = 6 * 60 * 60; // המקסימום ש-Google מאפשר

function cacheGuest_(id, payload) {
  CacheService.getScriptCache().put(CACHE_PREFIX + id, JSON.stringify(payload), CACHE_SECONDS);
}

/**
 * רץ כל 5 דקות (טיימר): שומר את כל המוזמנים בזיכרון המהיר ומונע מהשרת "להירדם".
 * שינויים ידניים בגיליון (למשל מקסימום אורחים) נכנסים לזיכרון תוך 5 דקות לכל היותר.
 */
function warmUp() {
  const sh = guestsSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return;
  const entries = {};
  sh.getRange(2, 1, n, COLUMNS.length).getValues().forEach(r => {
    const id = String(r[C.id]).trim();
    if (id && String(r[C.name]).trim()) entries[CACHE_PREFIX + id] = JSON.stringify(guestPayload_(r));
  });
  CacheService.getScriptCache().putAll(entries, CACHE_SECONDS);
}

function installWarmup_() {
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'warmUp');
  if (!exists) ScriptApp.newTrigger('warmUp').timeBased().everyMinutes(5).create();
}

function maxGuests_(row) {
  return Number(row[C.max]) || DEFAULT_MAX_GUESTS;
}

function newId_() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** 050-123-4567 / 501234567 / +972 50... → 972501234567 */
function normalizePhone_(p) {
  let d = String(p).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '972' + d.slice(1);
  else if (d.length === 9) d = '972' + d;
  return d.length >= 11 ? d : '';
}

function clampInt_(v, min, max) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min;
}

/** חותך טקסט ומונע ממנו להתפרש כנוסחה בגיליון */
function cleanText_(v) {
  let s = String(v || '').trim().slice(0, 500);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
