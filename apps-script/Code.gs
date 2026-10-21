/**
 * מערכת אישורי הגעה לחתונה — צד שרת (Google Apps Script)
 *
 * הקובץ הזה מודבק ב-Extensions > Apps Script של גיליון ה-Google Sheets.
 * הוא עושה שלושה דברים:
 *   1. מוסיף לגיליון תפריט "💍 אישורי הגעה" (הגדרה ראשונית, קישורי וואטסאפ ותזכורות)
 *   2. doGet  — האתר שואל "מי האורח עם המזהה הזה?"
 *   3. doPost — האתר שולח את התשובה של האורח, והיא נכתבת לגיליון
 */

// ===================== הגדרות — לערוך כאן =====================

// כתובת האתר ב-GitHub Pages (עם / בסוף)
const SITE_URL = 'https://zoeykulp.github.io/wedding-rsvp/';

// נוסח הודעת הוואטסאפ. {name} יוחלף בשם המוזמן, {link} בקישור האישי שלו.
const INVITE_MESSAGE =
  'היי {name}! 🤍\n' +
  'הוזמנתם לחתונה של ויקטוריה וידין 💍\n\n' +
  'האירוע יתקיים ביום חמישי, 26.11.26\n' +
  'בחוות אלנבי, נצר סירני\n\n' +
  'נשמח לדעת אם תגיעו 🙏\n' +
  'לאישור הגעה לחצו כאן 👇\n' +
  '{link}';

// כמה אנשים מותר לאשר כברירת מחדל, אם העמודה "מקסימום אורחים" ריקה
const DEFAULT_MAX_GUESTS = 2;

// פרטי המתנה (ביט / PayBox) לא נכתבים כאן, כי הקוד הזה נמצא בגיטהאב הציבורי.
// מגדירים אותם מהגיליון: 💍 אישורי הגעה ← 🎁 הגדרת פרטי מתנה.

const WAZE_URL = 'https://waze.com/ul?navigate=yes&q=' + encodeURIComponent('חוות אלנבי נצר סרני'); // כתיב החיפוש ש-Waze מכיר

// תזכורת למי שעוד לא ענה (או ענה "אולי"). {link} = הקישור האישי.
const NUDGE_MESSAGE =
  'היי {name} 🤍\n' +
  'רק מזכירים: נשמח לדעת אם תגיעו לחתונה של ויקטוריה וידין ב-26.11 💍\n' +
  'לאישור הגעה 👇\n' +
  '{link}';

// תזכורת ביום החתונה, למי שאישר הגעה. {gift} = שורת המתנה (אם הוגדרה).
const DAY_MESSAGE =
  'היי {name}! 🎉\n' +
  'היום זה קורה! מחכים לראות אתכם הערב בחוות אלנבי, נצר סירני 💍\n' +
  'קבלת פנים 19:00 · חופה 20:00\n\n' +
  'ניווט ב-Waze 🚗\n' +
  '{waze}' +
  '{gift}';

// ההודעות באנגלית: למוזמנים שבעמודה "שפה" כתוב אצלם "אנגלית". הקישור שלהם מוביל לדף האנגלי.
// בלי {gift}: PayBox / ביט עובדים רק עם חשבון בנק ישראלי, אז לא שולחים להם את פרטי המתנה.
const INVITE_MESSAGE_EN =
  'Hi {name}! 🤍\n' +
  "You're invited to Victoria & Yadin's wedding 💍\n\n" +
  'Thursday, 26.11.2026\n' +
  'Chavat Allenby, Kibbutz Netzer Sereni, Israel\n\n' +
  "We'd love to know if you can make it 🙏\n" +
  'Please RSVP here 👇\n' +
  '{link}';

const NUDGE_MESSAGE_EN =
  'Hi {name} 🤍\n' +
  "Just a friendly reminder: we'd love to know if you can join Victoria & Yadin's wedding on 26.11 💍\n" +
  'RSVP here 👇\n' +
  '{link}';

const DAY_MESSAGE_EN =
  'Hi {name}! 🎉\n' +
  "Today's the day! We can't wait to see you tonight at Chavat Allenby, Kibbutz Netzer Sereni 💍\n" +
  'Reception 19:00 · Chuppah 20:00\n\n' +
  'Navigate with Waze 🚗\n' +
  '{waze}';

// ================================================================

const MESSAGES = {
  invite: { he: INVITE_MESSAGE, en: INVITE_MESSAGE_EN },
  nudge: { he: NUDGE_MESSAGE, en: NUDGE_MESSAGE_EN },
  day: { he: DAY_MESSAGE, en: DAY_MESSAGE_EN },
};

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
  ['remind', 'תזכורת'],
  ['lang', 'שפה'],
  ['group', 'קבוצה'],
];

// הקבוצות ברשימה הנפתחת של עמודת "קבוצה" ובטבלת הסיכום. אפשר להוסיף או לשנות כאן.
const GROUPS = ['משפחה', 'חברים של ויקטוריה וידין', 'חברים של ההורים', 'חברים של האחים'];
const C = Object.fromEntries(COLUMNS.map(([key], i) => [key, i]));
const letter_ = key => String.fromCharCode(65 + C[key]);

// ---------------------- תפריט והגדרה ----------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💍 אישורי הגעה')
    .addItem('הגדרה ראשונית', 'setup')
    .addItem('צור קישורי שליחה', 'generateLinks')
    .addSeparator()
    .addItem('תזכורת: למי שעוד לא ענה', 'remindPending')
    .addItem('תזכורת: יום החתונה (למגיעים)', 'remindWeddingDay')
    .addSeparator()
    .addItem('🎁 הגדרת פרטי מתנה', 'setupGift')
    .addItem('📊 רענון דף הסיכום', 'refreshSummary')
    .addItem('🔧 העברת קבוצות מעמודת "סטטוס"', 'moveGroupsFromStatus')
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
  // insertCheckboxes מאפס את כל הסימונים, אז רק אם עוד אין תיבות (כדי שהרצה חוזרת לא תמחק את "נשלח")
  if (!sh.getRange(2, C.sent + 1).getDataValidation()) sh.getRange(2, C.sent + 1, rows).insertCheckboxes();
  sh.getRange(2, C.updated + 1, rows).setNumberFormat('dd/MM HH:mm');
  setListValidation_(sh);

  buildSummary_();
  installWarmup_();
  SpreadsheetApp.getUi().alert('הגיליון מוכן ✅\nעכשיו אפשר להדביק שמות וטלפונים בגיליון "מוזמנים".');
}

function refreshSummary() {
  ensureHeaders_(guestsSheet_());
  buildSummary_();
  SpreadsheetApp.getUi().alert('דף הסיכום עודכן ✅');
}

/** רשימות נפתחות לעמודות "שפה" ו"קבוצה" (אפשר גם להקליד ערך אחר) */
function setListValidation_(sh) {
  const rows = sh.getMaxRows() - 1;
  const list = values => SpreadsheetApp.newDataValidation().requireValueInList(values).setAllowInvalid(true).build();
  sh.getRange(2, C.lang + 1, rows).setDataValidation(list(['עברית', 'אנגלית']));
  sh.getRange(2, C.group + 1, rows).setDataValidation(list(GROUPS));
}

/** רק "מגיע" / "לא מגיע" / "אולי" נחשבים תשובה. כל ערך אחר בעמודת הסטטוס = עוד לא ענה. */
function hasAnswered_(row) {
  return STATUSES.includes(String(row[C.status]).trim());
}

/**
 * תיקון: ערכים שנכתבו בטעות בעמודת "סטטוס" (למשל שם קבוצה) עוברים לעמודת "קבוצה",
 * ועמודת הסטטוס מתרוקנת אצלם. תשובות אמיתיות (מגיע / לא מגיע / אולי) לא נוגעים בהן.
 */
function moveGroupsFromStatus() {
  const ui = SpreadsheetApp.getUi();
  const sh = guestsSheet_();
  ensureHeaders_(sh);
  // אותו מנעול כמו doPost, כדי לא לדרוס תשובה של אורח שנשלחת בדיוק עכשיו
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let moved = 0;
  try {
    const n = sh.getLastRow() - 1;
    if (n < 1) return;
    const data = sh.getRange(2, 1, n, COLUMNS.length).getValues();
    const status = [];
    const group = [];
    data.forEach(r => {
      const s = String(r[C.status]).trim();
      if (s && !hasAnswered_(r)) {
        if (!String(r[C.group]).trim()) r[C.group] = s;
        r[C.status] = '';
        moved++;
      }
      status.push([r[C.status]]);
      group.push([r[C.group]]);
    });
    if (moved) {
      sh.getRange(2, C.status + 1, n, 1).setValues(status);
      sh.getRange(2, C.group + 1, n, 1).setValues(group);
    }
  } finally {
    lock.releaseLock();
  }
  warmUp(); // שהדף לא יציג "כבר אישרתם" למי שלא ענה
  ui.alert(moved
    ? `הועברו ${moved} ערכים מעמודת "סטטוס" לעמודת "קבוצה" ✅\n\n` +
      'למי שכבר אישר, הקבוצה נדרסה. צריך למלא לו אותה ידנית בעמודת "קבוצה" (עמודה Q).'
    : 'לא נמצאו ערכים להעביר ✅');
}

/** בונה מחדש את לשונית "סיכום": סיכום כללי בעמודות A-B, ופירוק לפי קבוצות מעמודה D */
function buildSummary_() {
  const ss = SpreadsheetApp.getActive();
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

  // לפי קבוצות. "ללא קבוצה" תופס את מי שעוד לא שובץ, כדי שהסכומים יתאימו לסיכום הכללי.
  const byGroup = (criteria, label) => {
    const g = `${col('group')},${criteria}`;
    return [
      label,
      `=COUNTIFS(${col('name')},"<>",${g})`,
      `=COUNTIFS(${g},${coming})`,
      `=SUMIFS(${col('count')},${g},${coming})`,
      `=COUNTIFS(${g},${col('status')},"לא מגיע")`,
      `=COUNTIFS(${g},${col('status')},"אולי")`,
      `=COUNTIFS(${col('name')},"<>",${g},${col('status')},"")`,
    ];
  };
  const groups = [
    ['קבוצה', 'הוזמנו', 'אישרו', 'אורחים מגיעים', 'לא מגיעים', 'אולי', 'עוד לא ענו'],
    ...GROUPS.map(name => byGroup(`"${name}"`, name)),
    byGroup('""', 'ללא קבוצה'),
  ];
  const table = sum.getRange(1, 4, groups.length, groups[0].length);
  table.setValues(groups);
  sum.getRange(1, 4, 1, groups[0].length).setFontWeight('bold').setBackground('#e6ebf3');
  sum.getRange(1, 4, groups.length, 1).setFontWeight('bold');
  sum.setColumnWidth(4, 190);
  for (let c = 5; c < 4 + groups[0].length; c++) sum.setColumnWidth(c, 95);
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
  ensureHeaders_(sh);

  const data = sh.getRange(2, 1, n, COLUMNS.length).getValues();
  const used = new Set(data.map(r => String(r[C.id]).trim()).filter(Boolean));
  const ids = [];
  const links = [];
  const badPhones = [];
  let made = 0;
  let english = 0;

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
    links.push([`=HYPERLINK("${waLink_(phone, fillMessage_('invite', r, id))}","שלח בוואטסאפ 📲")`]);
    made++;
    if (isEnglish_(r)) english++;
  });

  sh.getRange(2, C.id + 1, n, 1).setValues(ids);
  sh.getRange(2, C.send + 1, n, 1).setFormulas(links);
  installWarmup_();
  warmUp();

  let msg = `נוצרו ${made} קישורי שליחה ✅`;
  if (english) msg += `\n(מתוכם ${english} באנגלית)`;
  if (badPhones.length) msg += `\n\nמספר טלפון חסר או לא תקין אצל:\n${badPhones.join('\n')}`;
  ui.alert(msg);
}

// ---------------------- תזכורות ----------------------

function remindPending() {
  generateReminders_(r => !hasAnswered_(r) || r[C.status] === 'אולי', 'nudge', 'למי שעוד לא ענה');
}

function remindWeddingDay() {
  generateReminders_(r => r[C.status] === 'מגיע', 'day', 'ליום החתונה');
}

/** ממלא את עמודת "תזכורת" בקישורי וואטסאפ, רק לשורות שעומדות בתנאי */
function generateReminders_(shouldRemind, messageKey, label) {
  const ui = SpreadsheetApp.getUi();
  const sh = guestsSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) {
    ui.alert('אין מוזמנים בגיליון עדיין.');
    return;
  }
  ensureHeaders_(sh);

  let made = 0;
  const links = sh.getRange(2, 1, n, COLUMNS.length).getValues().map(r => {
    const name = String(r[C.name]).trim();
    const id = String(r[C.id]).trim();
    const phone = normalizePhone_(r[C.phone]);
    if (!name || !id || !phone || !shouldRemind(r)) return [''];
    made++;
    return [`=HYPERLINK("${waLink_(phone, fillMessage_(messageKey, r, id))}","שלח תזכורת 🔔")`];
  });
  sh.getRange(2, C.remind + 1, n, 1).setFormulas(links);
  ui.alert(`נוצרו ${made} קישורי תזכורת ${label} ✅\nהם בעמודה "תזכורת".`);
}

// ---------------------- הודעות וואטסאפ ----------------------

/** messageKey: 'invite' / 'nudge' / 'day'. השפה נקבעת לפי עמודת "שפה" של המוזמן. */
function fillMessage_(messageKey, row, id) {
  const en = isEnglish_(row);
  return MESSAGES[messageKey][en ? 'en' : 'he']
    .split('{name}').join(String(row[C.name]).trim())
    .split('{link}').join(SITE_URL + (en ? 'en/' : '') + '?id=' + id)
    .split('{waze}').join(WAZE_URL)
    .split('{gift}').join(en ? '' : giftLine_());
}

function isEnglish_(row) {
  return /^(אנגלית|english|en)$/i.test(String(row[C.lang] || '').trim());
}

/** משלים כותרות חסרות (לגיליונות שנוצרו לפני שנוספו עמודות כמו "תזכורת" ו"שפה") */
function ensureHeaders_(sh) {
  const header = sh.getRange(1, 1, 1, COLUMNS.length);
  const values = header.getValues()[0];
  if (values.every((v, i) => v === COLUMNS[i][1])) return;
  header.setValues([COLUMNS.map(c => c[1])]).setFontWeight('bold').setBackground('#e7ebe0');
  setListValidation_(sh);
  buildSummary_(); // נוספו עמודות, אז גם הסיכום צריך להתעדכן
}

function giftLine_() {
  const gift = giftConfig_();
  if (!gift) return '';
  if (gift.paybox) return '\n\nלמתנה לזוג 🎁\n' + gift.paybox;
  return '\n\nלמתנה לזוג 🎁 ביט למספר ' + gift.bit;
}

// ---------------------- מתנה ----------------------

/** שומר את פרטי המתנה ב-Script Properties: נשארים בגוגל בלבד, ולא נמחקים כשמדביקים קוד חדש */
function setupGift() {
  const ui = SpreadsheetApp.getUi();
  const current = giftConfig_();
  const res = ui.prompt(
    '🎁 פרטי מתנה',
    'מספר טלפון לביט, או קישור תשלום (קישור אישי מביט / קבוצת PayBox).\n' +
      'הפרטים ייכנסו לתזכורת של יום החתונה. כדי להסיר, משאירים ריק.' +
      (current ? `\n\nכרגע מוגדר: ${current.paybox || current.bit}` : ''),
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const value = res.getResponseText().trim();
  const props = PropertiesService.getScriptProperties();
  const digits = value.replace(/\D/g, '');
  if (!value) {
    props.deleteProperty('GIFT_PAYBOX_URL');
    props.deleteProperty('GIFT_BIT_PHONE');
  } else if (/^https:\/\//.test(value)) {
    props.setProperty('GIFT_PAYBOX_URL', value);
    props.deleteProperty('GIFT_BIT_PHONE');
  } else if (/^05\d{8}$/.test(digits)) {
    props.setProperty('GIFT_BIT_PHONE', digits.slice(0, 3) + '-' + digits.slice(3));
    props.deleteProperty('GIFT_PAYBOX_URL');
  } else {
    ui.alert('לא זיהיתי את מה שהוזן. צריך מספר נייד (למשל 050-1234567) או קישור שמתחיל ב-https://');
    return;
  }
  giftCache_ = undefined;
  const gift = giftConfig_();
  ui.alert(gift
    ? `נשמר ✅\nבתזכורת של יום החתונה יופיע: ${gift.paybox || 'ביט למספר ' + gift.bit}\n` +
      '(אם כבר יצרת קישורי תזכורת ליום החתונה, צריך ליצור אותם מחדש)'
    : 'פרטי המתנה הוסרו ✅');
}

let giftCache_;
/** קורא פעם אחת לכל הרצה (יש מכסה יומית לקריאות מ-Properties) */
function giftConfig_() {
  if (giftCache_ === undefined) {
    const p = PropertiesService.getScriptProperties().getProperties();
    giftCache_ = p.GIFT_PAYBOX_URL || p.GIFT_BIT_PHONE
      ? { paybox: p.GIFT_PAYBOX_URL || '', bit: p.GIFT_BIT_PHONE || '' }
      : null;
  }
  return giftCache_;
}

/** ישר ל-WhatsApp Web, בלי wa.me: ההפניה של wa.me משבשת אימוג'ים להודעה עם � */
function waLink_(phone, text) {
  return 'https://web.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(text);
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
    response: hasAnswered_(r)
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
