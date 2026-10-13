// משותף לדף העברי (index.html) ולדף האנגלי (en/index.html).
// הטקסטים וההגדרות של כל שפה נמצאים ב-window.PAGE, בתוך הדף עצמו.

// כתובת ה-Web App של Apps Script (נגמרת ב-/exec). כשהשדה ריק, הדף עובד במצב הדגמה.
const API_URL = 'https://script.google.com/macros/s/AKfycby4lBLsoiZYVjXAd-NYE6aGGlSZyExb31CJywgy9NwZ0n9NhZSjGgX4Q7G__cmL5rdeHQ/exec';

const PAGE = window.PAGE;
const T = PAGE.T;
const $ = s => document.querySelector(s);
const id = new URLSearchParams(location.search).get('id');
const demo = !API_URL || id === 'demo';
// ערכי הסטטוס נשמרים בגיליון בעברית בשתי השפות
const state = { status: '', count: 1, veg: 0, vegan: 0, gf: 0, max: 2 };

if (PAGE.INVITE_IMAGE) {
  $('#invite-img').src = PAGE.INVITE_IMAGE;
  $('#invite-img').hidden = false;
}

function show(name) {
  for (const s of ['loading', 'error', 'form-view', 'done']) $('#' + s).hidden = s !== name;
}

async function loadGuest() {
  if (demo) {
    return {
      ok: true, name: T.demoName, max: 4, response: null,
      gift: { paybox: 'https://example.com', bit: '050-1234567' },
    };
  }
  const res = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`);
  return res.json();
}

async function saveResponse(payload) {
  if (demo) {
    console.log('demo submit', payload);
    await new Promise(r => setTimeout(r, 500));
    return { ok: true };
  }
  // Apps Script עונה ל-POST בהפניה (redirect), וחלק מהדפדפנים בטלפון חוסמים את קריאת
  // התשובה למרות שהשמירה הצליחה. לכן no-cors: לא קוראים את התשובה, ורק שגיאת רשת
  // אמיתית (למשל אין אינטרנט) נחשבת כישלון. הבדיקות עצמן נעשות בשרת.
  // keepalive: הבקשה ממשיכה גם אם האורח סוגר את הדף מיד אחרי השליחה.
  await fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
  return { ok: true };
}

// ---------- steppers ----------
document.querySelectorAll('.stepper').forEach(el => {
  el.innerHTML = `<button type="button" data-d="1" aria-label="${T.plus}">+</button><output></output><button type="button" data-d="-1" aria-label="${T.minus}">−</button>`;
  el.addEventListener('click', e => {
    const d = Number(e.target.dataset.d);
    if (!d) return;
    state[el.dataset.key] += d;
    render();
  });
});

function render() {
  // count קודם, כי שאר המונים מוגבלים לפיו
  document.querySelectorAll('.stepper').forEach(el => {
    const k = el.dataset.key;
    const min = k === 'count' ? 1 : 0;
    const max = k === 'count' ? state.max : state.count;
    state[k] = Math.min(Math.max(state[k], min), max);
    el.querySelector('output').textContent = state[k];
    el.querySelector('[data-d="-1"]').disabled = state[k] <= min;
    el.querySelector('[data-d="1"]').disabled = state[k] >= max;
  });
  document.querySelectorAll('.choice').forEach(b =>
    b.setAttribute('aria-checked', String(b.dataset.status === state.status)));
  $('#coming').hidden = state.status !== 'מגיע';
  $('#notes-field').hidden = !state.status;
  $('#allergy').hidden = !$('#has-allergy').checked;
  $('#submit').disabled = !state.status;
}

// האורח כבר התחיל למלא, אז לא דורסים לו את הטופס בתשובה קודמת שהגיעה באיחור
let touched = false;
document.querySelectorAll('.choice').forEach(b =>
  b.addEventListener('click', () => { touched = true; state.status = b.dataset.status; render(); }));
$('#has-allergy').addEventListener('change', render);

function formError(msg) {
  $('#form-error').textContent = msg;
  $('#form-error').hidden = !msg;
}

$('#submit').addEventListener('click', async () => {
  const coming = state.status === 'מגיע';
  const hasAllergy = coming && $('#has-allergy').checked;
  const allergy = $('#allergy').value.trim();
  if (hasAllergy && !allergy) return formError(T.allergyMissing);
  formError('');

  // השרת איטי, אז מראים תודה מיד ושומרים ברקע. אם השמירה נכשלת, חוזרים לטופס.
  showDone();
  try {
    const res = await saveResponse({
      id,
      status: state.status,
      count: coming ? state.count : 0,
      veg: coming ? state.veg : 0,
      vegan: coming ? state.vegan : 0,
      gf: coming ? state.gf : 0,
      allergy: hasAllergy ? allergy : '',
      notes: $('#notes').value.trim(),
    });
    if (!res.ok) throw new Error(res.error);
  } catch (err) {
    console.error(err);
    formError(T.saveFailed);
    show('form-view');
  }
});

function showDone() {
  [$('#done-emoji').textContent, $('#done-title').textContent, $('#done-text').textContent] = T.done[state.status];
  $('#waze').hidden = !(state.status === 'מגיע' && PAGE.WAZE_URL);
  $('#waze').href = PAGE.WAZE_URL;
  renderGift();
  show('done');
}

// פרטי המתנה מגיעים מהשרת יחד עם פרטי האורח, ולא כתובים באתר (הוא ציבורי)
let gift = null;
function renderGift() {
  const visible = PAGE.SHOW_GIFT && gift && (state.status === 'מגיע' || state.status === 'לא מגיע');
  $('#gift').hidden = !visible;
  if (!visible) return;
  $('#gift-title').textContent = state.status === 'מגיע' ? T.giftComing : T.giftNotComing;
  // gift.paybox = קישור תשלום כלשהו (קבוצת PayBox או קישור אישי מביט)
  const link = /^https:\/\//.test(gift.paybox || '') ? gift.paybox : '';
  const linkBtn = $('#gift-paybox');
  linkBtn.hidden = !link;
  linkBtn.href = link || '#';
  linkBtn.textContent = /paybox/i.test(link) ? T.giftPaybox : /bit/i.test(link) ? T.giftBit : T.giftGeneric;
  $('#gift-bit').hidden = !gift.bit;
  const btn = $('#bit-copy');
  btn.textContent = '';
  if (gift.bit) {
    const num = btn.appendChild(document.createElement('bdi'));
    num.dir = 'ltr';
    num.textContent = gift.bit;
    btn.append(T.bitCopySuffix);
  }
}

$('#bit-copy').addEventListener('click', async () => {
  const btn = $('#bit-copy');
  try {
    await navigator.clipboard.writeText(gift.bit.replace(/\D/g, ''));
    btn.textContent = T.bitCopied;
  } catch (_) {
    btn.textContent = gift.bit; // אם ההעתקה נחסמה, לפחות שהמספר יהיה גלוי
  }
  setTimeout(renderGift, 2000);
});

$('#edit').addEventListener('click', () => { $('#prev-note').hidden = true; show('form-view'); });

// ---------- init ----------
// הטופס מוצג מיד, ופרטי האורח נטענים ברקע (השרת יכול לקחת כמה שניות)
(async () => {
  if (!id && !demo) return show('error');
  render();
  show('form-view');
  try {
    const g = await loadGuest();
    if (!g.ok) return show('error');
    const hi = $('#greet-hi');
    hi.textContent = T.hi;
    hi.appendChild(document.createElement('strong')).textContent = g.name;
    hi.append(',');
    state.max = Number(g.max) || 2;
    gift = g.gift || null;
    renderGift(); // למקרה שהאורח כבר שלח לפני שהפרטים הגיעו
    const r = g.response;
    if (r && !touched) {
      Object.assign(state, {
        status: r.status,
        count: Number(r.count) || 1,
        veg: Number(r.veg) || 0,
        vegan: Number(r.vegan) || 0,
        gf: Number(r.gf) || 0,
      });
      $('#has-allergy').checked = !!r.allergy;
      $('#allergy').value = r.allergy || '';
      $('#notes').value = r.notes || '';
      $('#prev-note').hidden = false;
    }
    render();
  } catch (err) {
    // לא חוסמים את האורח: אפשר עדיין לשלוח, והשרת יבדוק את המזהה
    console.error(err);
  }
})();
