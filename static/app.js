/* Витрина: поведение страниц без фреймворков. Всё работает и без JS, скрипт только ускоряет. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const NNBSP = ' ';
  const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  const plural = (n, one, few, many) => {
    n = Math.abs(n) % 100; const d = n % 10;
    if (n > 10 && n < 20) return many;
    if (d === 1) return one;
    if (d >= 2 && d <= 4) return few;
    return many;
  };
  const store = {
    get(key, def) { try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); } catch { return def; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* приватный режим */ } },
  };
  const lockScroll = on => document.documentElement.classList.toggle('lock', on);
  const SITE = window.SITE || {};
  const STATIC = !!SITE.static;          // демо-сборка на GitHub Pages: без сервера
  const BASE = SITE.base || '';
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const rub = n => fmt(n) + ' ₽';
  const svg = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  // «3 часа назад», «вчера», «5 дней назад», как на сервере
  function ago(ts) {
    const t = new Date(ts); if (isNaN(t)) return '';
    const now = new Date(), s = (now - t) / 1000;
    const sameDay = now.toDateString() === t.toDateString();
    if (s < 3600) { const m = Math.max(1, Math.floor(s / 60)); return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`; }
    if (s < 86400 && sameDay) { const h = Math.floor(s / 3600); return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`; }
    const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()), d1 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const days = Math.round((d0 - d1) / 86400000);
    if (days <= 1) return 'вчера';
    if (days < 31) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
    return t.toLocaleDateString('ru-RU');
  }
  const refreshAgo = (root = document) => $$('[data-ago]', root).forEach(el => {
    const t = ago(el.dataset.ago); if (t) el.textContent = (el.dataset.agoPrefix || '') + t;
  });

  // Демо-сборка: каталог считается в браузере по data/cars.json так же, как на сервере
  let dbPromise = null;
  const loadDB = () => dbPromise || (dbPromise = fetch(BASE + '/data/cars.json').then(r => r.json()));
  const toInt = v => { const d = String(v || '').replace(/\D/g, '').slice(0, 12); return d ? Number(d) : 0; };
  const cmp = (a, b) => (a > b) - (a < b);
  const SORT = {
    rel: (a, b) => (b.pinned - a.pinned) || cmp(b.first_seen, a.first_seen) || cmp(b.id, a.id),
    price_asc: (a, b) => (a.price - b.price) || cmp(a.id, b.id),
    price_desc: (a, b) => (b.price - a.price) || cmp(a.id, b.id),
    year_desc: (a, b) => (b.year - a.year) || (a.price - b.price),
    mileage_asc: (a, b) => (a.mileage - b.mileage) || cmp(a.id, b.id),
    new: (a, b) => cmp(b.first_seen, a.first_seen) || cmp(b.id, a.id),
  };
  function readFilters(p) {
    const mark = (p.get('mark') || '').trim().toUpperCase();
    return {
      mark, model: mark ? (p.get('model') || '').trim().toUpperCase() : '',
      price_from: toInt(p.get('price_from')), price_to: toInt(p.get('price_to')),
      year_from: toInt(p.get('year_from')), year_to: toInt(p.get('year_to')), mileage_to: toInt(p.get('mileage_to')),
      body: p.getAll('body'), engine: p.getAll('engine'), gear: p.getAll('gear'), drive: p.getAll('drive'),
      wheel: p.get('wheel') || '', owners: [1, 2, 3].includes(toInt(p.get('owners'))) ? toInt(p.get('owners')) : 0,
      q: (p.get('q') || '').trim().replace(/\s+/g, ' ').slice(0, 60), sort: SORT[p.get('sort')] ? p.get('sort') : 'rel',
    };
  }
  function matches(c, f, skip = '') {
    if (f.mark && skip !== 'mark') {
      if (c.mark_code !== f.mark) return false;
      if (f.model && skip !== 'model' && c.model_code !== f.model) return false;
    }
    if (f.price_from && !(c.price >= f.price_from)) return false;
    if (f.price_to && !(c.price <= f.price_to)) return false;
    if (f.year_from && !(c.year >= f.year_from)) return false;
    if (f.year_to && !(c.year <= f.year_to)) return false;
    if (f.mileage_to && !(c.mileage <= f.mileage_to)) return false;
    for (const key of ['body', 'engine', 'gear', 'drive']) {
      if (f[key].length && skip !== key && !f[key].includes(c[key])) return false;
    }
    if (f.wheel && skip !== 'wheel' && c.wheel !== f.wheel) return false;
    if (f.owners && !(c.owners != null && c.owners <= f.owners)) return false;
    if (f.q) for (const w of f.q.toLowerCase().split(' ').slice(0, 5)) if (!c.search.includes(w)) return false;
    return true;
  }
  const totalText = n => n
    ? `${n % 10 === 1 && n % 100 !== 11 ? 'Подобран' : 'Подобрано'} ${fmt(n)} ${plural(n, 'автомобиль', 'автомобиля', 'автомобилей')}`
    : 'Ничего не нашлось';
  function pagerPages(page, pages) {
    const keep = [...new Set([1, pages, ...Array.from({length: 5}, (_, i) => page - 2 + i)])].filter(p => p >= 1 && p <= pages).sort((a, b) => a - b);
    const out = [];
    for (const p of keep) { if (out.length && p - out[out.length - 1] > 1) out.push(0); out.push(p); }
    return out;
  }
  function pagerHtml(page, pages, href) {
    if (pages <= 1) return '';
    let h = '<nav class="pager" aria-label="Страницы каталога">';
    if (page < pages) h += `<button class="btn btn-ghost btn-lg pager-more" type="button" data-more="${href(page + 1)}">Показать ещё</button>`;
    h += '<div class="pager-pages">';
    if (page > 1) h += `<a class="pg" href="${href(page - 1)}" aria-label="Предыдущая страница" data-page>${svg('chevron-left')}</a>`;
    for (const p of pagerPages(page, pages)) {
      h += p ? `<a class="pg${p === page ? ' on' : ''}" href="${href(p)}" data-page${p === page ? ' aria-current="page"' : ''}>${p}</a>` : '<span class="pg gap">…</span>';
    }
    if (page < pages) h += `<a class="pg" href="${href(page + 1)}" aria-label="Следующая страница" data-page>${svg('chevron-right')}</a>`;
    return h + `</div><p class="pager-info">Страница ${page} из ${pages}</p></nav>`;
  }
  function chipsHtml(f, db, resetHref) {
    const out = [];
    const chip = (label, param) => out.push(`<button class="chip chip-on" type="button" data-clear="${esc(param)}" aria-label="Убрать фильтр ${esc(label)}">${esc(label)} ${svg('close')}</button>`);
    if (f.mark) {
      chip(db.marks[f.mark] || f.mark, 'mark');
      if (f.model) { const m = db.cars.find(c => c.mark_code === f.mark && c.model_code === f.model); chip(m ? m.model : f.model, 'model'); }
    }
    if (f.price_from) chip(`от ${rub(f.price_from)}`, 'price_from');
    if (f.price_to) chip(`до ${rub(f.price_to)}`, 'price_to');
    if (f.year_from) chip(`от ${f.year_from} г.`, 'year_from');
    if (f.year_to) chip(`до ${f.year_to} г.`, 'year_to');
    if (f.mileage_to) chip(`пробег до ${fmt(f.mileage_to)} км`, 'mileage_to');
    f.body.forEach(k => db.bodies[k] && chip(db.bodies[k], `body=${k}`));
    f.engine.forEach(v => chip(v, `engine=${v}`));
    f.gear.forEach(v => chip(v, `gear=${v}`));
    f.drive.forEach(v => { const l = v.toLowerCase() + ' привод'; chip(l[0].toUpperCase() + l.slice(1), `drive=${v}`); });
    if (f.wheel) chip(f.wheel === 'left' ? 'Левый руль' : 'Правый руль', 'wheel');
    if (f.owners) chip({1: 'Один владелец', 2: 'Не больше двух', 3: 'Не больше трёх'}[f.owners], 'owners');
    if (f.q) chip(`«${f.q}»`, 'q');
    return out.length ? out.join('') + `<a class="chip-reset" href="${resetHref}" data-reset>Сбросить всё</a>` : '';
  }
  async function staticResults(q, action) {
    const db = await loadDB();
    const f = readFilters(q);
    const found = db.cars.filter(c => matches(c, f)).sort(SORT[f.sort]);
    const per = 24, total = found.length, pages = Math.max(1, Math.ceil(total / per));
    const page = Math.min(Math.max(1, toInt(q.get('page')) || 1), pages);
    const href = n => { const u = new URLSearchParams(q); ['partial', 'append', 'page'].forEach(k => u.delete(k)); if (n > 1) u.set('page', n); return action + (u.toString() ? '?' + esc(u.toString()) : ''); };
    const cards = found.slice((page - 1) * per, page * per).map(c => c.html).join('');
    const pager = pagerHtml(page, pages, href);
    const counts = {};
    const add = k => { counts[k] = (counts[k] || 0) + 1; };
    for (const c of db.cars) {
      for (const key of ['body', 'engine', 'gear', 'drive', 'wheel']) if (c[key] && matches(c, f, key)) add(`${key}:${c[key]}`);
    }
    const models = {};
    if (f.mark) for (const c of db.cars) if (c.mark_code === f.mark && matches(c, f, 'model')) {
      (models[c.model_code] = models[c.model_code] || {code: c.model_code, name: c.model, n: 0}).n++;
    }
    const markName = f.mark ? db.marks[f.mark] : '';
    const modelName = f.model && models[f.model] ? models[f.model].name : '';
    const heading = (markName ? `${markName}${modelName ? ' ' + modelName : ''} с пробегом` : 'Автомобили с пробегом') + ` в ${SITE.city_in}`;
    const empty = `<div class="empty"><span class="empty-ic">${svg('search')}</span><h2>Под такие условия сейчас ничего нет</h2>
      <p>Попробуйте ослабить фильтры или оставьте заявку: поищем подходящий автомобиль по всему рынку и сообщим, когда найдём.</p>
      <div class="empty-btns"><a class="btn btn-ghost" href="${action}" data-reset>Сбросить фильтры</a>
      <button class="btn btn-primary" type="button" data-lead="selection">Оставить заявку на подбор</button></div></div>`;
    const append = !!q.get('append');
    return {
      html: append ? cards : (total ? `<div class="cards" data-cards>${cards}</div><div data-pager>${pager}</div>` : empty),
      pager: append ? pager : '', chips: chipsHtml(f, db, action), total, total_text: totalText(total), page, pages, counts,
      models: Object.values(models).sort((a, b) => a.name.localeCompare(b.name, 'ru')), heading,
      title: `${heading}: ${fmt(total)} ${plural(total, 'вариант', 'варианта', 'вариантов')} · ${SITE.brand}`,
    };
  }

  // Уведомление внизу экрана
  let toastTimer;
  function toast(text) {
    const t = $('#toast'); if (!t) return;
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // Шапка: тень после прокрутки
  const hdr = $('.hdr');
  const onScroll = () => hdr && hdr.classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, {passive: true}); onScroll();

  // Окна: меню, заявка, фото на весь экран
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open]');
    if (opener) { const d = document.getElementById(opener.dataset.open); if (d && !d.open) { d.showModal(); lockScroll(true); } return; }
    const closer = e.target.closest('dialog [data-close]');
    if (closer) closer.closest('dialog').close();
  });
  $$('dialog').forEach(d => {
    d.addEventListener('close', () => { if (!$('dialog[open]')) lockScroll(false); });
    if (d.classList.contains('lightbox')) return;
    d.addEventListener('click', e => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    });
  });
  $$('.sheet a').forEach(a => a.addEventListener('click', () => a.closest('dialog').close()));

  // Фото, которые не загрузились: показываем фирменную заглушку
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.failed) return;
    img.dataset.failed = '1';
    (img.closest('.ph, .body-ph, .hero-photo, .thumb, .car-lead-car') || img.parentElement)?.classList.add('noimg');
  }, true);

  // Избранное хранится в браузере посетителя
  const FAV_KEY = 'autostock:favorites';
  let favs = new Set(store.get(FAV_KEY, []));
  function favUI() {
    $$('[data-fav]').forEach(b => {
      const on = favs.has(b.dataset.fav);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', on ? 'Убрать из избранного' : 'В избранное');
    });
    $$('[data-fav-count]').forEach(el => { el.textContent = favs.size; el.hidden = !favs.size; });
  }
  function saveFavs() { store.set(FAV_KEY, [...favs]); favUI(); }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const id = b.dataset.fav, on = !favs.has(id);
    on ? favs.add(id) : favs.delete(id);
    saveFavs();
    b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
    toast(on ? 'Добавлено в избранное' : 'Убрано из избранного');
    if (!on && $('[data-fav-list]')) {
      b.closest('.car-card')?.remove();
      if (!favs.size) renderFavorites();
    }
  });
  window.addEventListener('storage', e => { if (e.key === FAV_KEY) { favs = new Set(store.get(FAV_KEY, [])); favUI(); } });
  window.addEventListener('pageshow', () => { favs = new Set(store.get(FAV_KEY, [])); favUI(); });

  async function renderFavorites() {
    const list = $('[data-fav-list]'); if (!list) return;
    const empty = $('[data-fav-empty]'), tools = $('[data-fav-tools]');
    const ids = [...favs];
    if (!ids.length) { list.innerHTML = ''; empty.hidden = false; tools.hidden = true; return; }
    list.classList.add('loading');
    try {
      let j;
      if (STATIC) {
        const db = await loadDB(), byId = new Map(db.cars.map(c => [c.id, c]));
        const found = ids.filter(id => byId.has(id));
        j = {html: found.map(id => byId.get(id).html).join(''), found};
      } else {
        const r = await fetch(BASE + '/api/cards?ids=' + encodeURIComponent(ids.join(',')), {headers: {'X-Requested-With': 'fetch'}});
        j = await r.json();
      }
      list.innerHTML = j.html;
      refreshAgo(list);
      empty.hidden = j.found.length > 0; tools.hidden = !j.found.length;
      if (j.found.length !== ids.length) { favs = new Set(j.found); saveFavs(); }
      favUI();
    } catch { empty.hidden = false; }
    finally { list.classList.remove('loading'); }
  }
  $('[data-fav-clear]')?.addEventListener('click', () => { favs.clear(); saveFavs(); renderFavorites(); });

  // Телефон: +7 (999) 123-45-67
  function formatPhone(v) {
    let d = v.replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    const p = d.slice(1);
    let out = '+7';
    if (p.length) out += ' (' + p.slice(0, 3);
    if (p.length >= 3) out += ') ' + p.slice(3, 6);
    if (p.length >= 6) out += '-' + p.slice(6, 8);
    if (p.length >= 8) out += '-' + p.slice(8, 10);
    return out;
  }
  document.addEventListener('input', e => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== 'tel') return;
    if (e.inputType && e.inputType.startsWith('delete')) return;
    el.value = formatPhone(el.value);
    el.classList.remove('is-error');
  });
  document.addEventListener('focusin', e => { const el = e.target; if (el.type === 'tel' && !el.value) el.value = '+7 '; });
  document.addEventListener('focusout', e => { const el = e.target; if (el.type === 'tel' && el.value.replace(/\D/g, '').length <= 1) el.value = ''; });
  document.addEventListener('change', e => { if (e.target.name === 'consent') e.target.closest('.check')?.classList.remove('is-error'); });

  // Окно заявки
  const leadModal = $('#lead-modal');
  const LEAD_TEXT = {
    car: ['Заявка на автомобиль', 'Перезвоним, расскажем, как проходит проверка этого автомобиля, и договоримся об осмотре.', 'Удобное время для звонка, вопросы по автомобилю'],
    selection: ['Подбор автомобиля', 'Перезвоним, уточним пожелания и бюджет, подберём варианты и проверим их перед покупкой.', 'Марка, бюджет, год, коробка, привод'],
    callback: ['Обратный звонок', 'Оставьте номер, и мы перезвоним в рабочее время.', 'Удобное время для звонка'],
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-lead]'); if (!b || !leadModal) return;
    e.preventDefault();
    const parent = b.closest('dialog');
    if (parent && parent !== leadModal) parent.close();
    const kind = LEAD_TEXT[b.dataset.lead] ? b.dataset.lead : 'selection';
    const [kicker, text, placeholder] = LEAD_TEXT[kind];
    const form = $('form', leadModal);
    form.classList.remove('is-sent');
    $('.form-success', form).hidden = true;
    $('.form-error', form).hidden = true;
    form.elements.kind.value = kind;
    form.elements.offer_id.value = b.dataset.offer || '';
    $('[data-lead-kicker]', leadModal).textContent = kicker;
    $('[data-lead-title]', leadModal).textContent = b.dataset.title || (kind === 'selection' ? 'Расскажите, какой автомобиль ищете' : kicker);
    $('[data-lead-text]', leadModal).textContent = text;
    const comment = form.elements.comment;
    if (comment) {
      comment.placeholder = placeholder;
      if (b.hasAttribute('data-fav-lead')) {
        comment.value = 'Проверить из избранного:\n' + $$('[data-fav-list] .card-title a').map(a => `${a.textContent.trim()}: ${a.href}`).join('\n');
      } else if (b.dataset.title && kind === 'selection') {
        comment.value = b.dataset.title;
      }
    }
    if (!leadModal.open) { leadModal.showModal(); lockScroll(true); }
    setTimeout(() => form.elements.name?.focus({preventScroll: true}), 60);
  });

  // Отправка форм заявки без перезагрузки
  const LEAD_ERRORS = {
    phone: 'Проверьте номер телефона.',
    consent: 'Отметьте согласие на обработку персональных данных.',
    rate: 'Слишком много заявок подряд. Попробуйте через несколько минут или позвоните нам.',
  };
  document.addEventListener('submit', async e => {
    const form = e.target.closest('form[data-ajax]'); if (!form) return;
    e.preventDefault();
    const err = $('.form-error', form), phone = form.elements.phone, consent = form.elements.consent;
    const fail = msg => { err.textContent = msg; err.hidden = false; };
    err.hidden = true;
    if (phone.value.replace(/\D/g, '').length < 11) { phone.classList.add('is-error'); phone.focus(); return fail('Укажите номер телефона полностью.'); }
    if (!consent.checked) { consent.closest('.check').classList.add('is-error'); return fail(LEAD_ERRORS.consent); }
    if (STATIC) return fail(`Это демо-версия сайта, заявки с неё не отправляются. Позвоните нам: ${SITE.phone || ''}`);
    const btn = $('button[type=submit]', form), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Отправляем…';
    try {
      const r = await fetch(form.action, {method: 'POST', body: new FormData(form), headers: {'X-Requested-With': 'fetch'}});
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        form.reset();
        form.classList.add('is-sent');
        $('.form-success', form).hidden = false;
        if (window.ym && window.SITE && SITE.metrika) window.ym(SITE.metrika, 'reachGoal', 'lead');
      } else {
        fail(LEAD_ERRORS[j.error] || 'Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.');
      }
    } catch {
      fail('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });

  // Числа с пробелами в полях цены и пробега
  document.addEventListener('focusout', e => {
    const el = e.target;
    if (el.matches?.('[data-num]')) { const d = el.value.replace(/\D/g, ''); el.value = d ? fmt(d) : ''; }
  });

  // Каталог: фильтры обновляют выдачу без перезагрузки страницы
  function initCatalog() {
    const form = $('#filters'); if (!form) return;
    const results = $('#results'), chipsBox = $('#chips'), panel = $('#filters-panel');
    const sortSel = $('select[form="filters"]');
    let ctrl = null, timer = null, backdrop = null;

    const params = () => {
      const p = new URLSearchParams();
      for (const [k, v] of new FormData(form)) {
        let val = String(v).trim();
        const el = form.elements[k];
        if (el && el.dataset && el.dataset.num !== undefined) val = val.replace(/\D/g, '');
        if (val) p.append(k, val);
      }
      if (p.get('sort') === 'rel') p.delete('sort');
      return p;
    };
    const urlOf = p => form.getAttribute('action') + (p.toString() ? '?' + p : '');

    function updateCounts(counts) {
      $$('[data-count]', form).forEach(el => {
        const n = counts[el.dataset.count] || 0;
        el.textContent = n;
        const label = el.closest('.opt'), input = label && $('input', label);
        if (!label) return;
        label.classList.toggle('zero', !n && !input.checked);
        if (input.type === 'checkbox') label.hidden = !n && !input.checked;
      });
    }
    function updateModels(models) {
      const sel = form.elements.model; if (!sel) return;
      const cur = sel.value, mark = form.elements.mark.value;
      sel.innerHTML = '';
      sel.add(new Option('Все модели', ''));
      models.forEach(m => sel.add(new Option(`${m.name} · ${m.n}`, m.code, false, m.code === cur)));
      sel.disabled = !mark;
    }
    function updateBadge() {
      const n = $$('.chip', chipsBox).length;
      const btn = $('[data-filters-open]'); if (!btn) return;
      let c = $('.count', btn);
      if (n) { if (!c) { c = document.createElement('span'); c.className = 'count'; btn.append(c); } c.textContent = n; }
      else c?.remove();
    }

    async function load({page = 0, append = false} = {}) {
      const p = params();
      if (page > 1) p.set('page', page);
      const pageUrl = urlOf(p);
      const q = new URLSearchParams(p); q.set('partial', '1'); if (append) q.set('append', '1');
      ctrl?.abort(); ctrl = new AbortController();
      results.classList.add('loading'); results.setAttribute('aria-busy', 'true');
      try {
        let j;
        if (STATIC) {
          j = await staticResults(q, form.getAttribute('action'));
        } else {
          const r = await fetch(urlOf(q), {signal: ctrl.signal, headers: {'X-Requested-With': 'fetch'}});
          if (!r.ok) throw new Error(String(r.status));
          j = await r.json();
        }
        if (append) {
          $('[data-cards]', results)?.insertAdjacentHTML('beforeend', j.html);
          const pager = $('[data-pager]', results); if (pager) pager.innerHTML = j.pager;
        } else {
          results.innerHTML = j.html;
        }
        chipsBox.innerHTML = j.chips;
        $$('[data-total]').forEach(el => { el.textContent = j.total_text; });
        const h1 = $('.cat-head h1'); if (h1 && j.heading) h1.textContent = j.heading;
        if (j.title) document.title = j.title;
        const tb = $('[data-total-btn]');
        if (tb) tb.textContent = j.total ? `Показать ${fmt(j.total)} ${plural(j.total, 'автомобиль', 'автомобиля', 'автомобилей')}` : 'Ничего не нашлось';
        updateCounts(j.counts);
        updateModels(j.models);
        updateBadge();
        history.replaceState(null, '', pageUrl);
        favUI();
        refreshAgo(results);
        return j;
      } catch (err) {
        if (err.name !== 'AbortError') window.location.href = pageUrl;
      } finally {
        results.classList.remove('loading'); results.setAttribute('aria-busy', 'false');
      }
    }

    form.addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'mark' && form.elements.model) form.elements.model.value = '';
      if (t.matches('input[inputmode="numeric"], input[type="search"]')) return;
      load();
    });
    form.addEventListener('input', e => {
      if (!e.target.matches('input[inputmode="numeric"], input[type="search"]')) return;
      clearTimeout(timer); timer = setTimeout(() => load(), 650);
    });
    form.addEventListener('submit', async e => {
      e.preventDefault(); clearTimeout(timer);
      await load(); closePanel();
      results.scrollIntoView({behavior: 'smooth', block: 'start'});
    });
    sortSel?.addEventListener('change', () => load());

    chipsBox.addEventListener('click', e => {
      const c = e.target.closest('[data-clear]'); if (!c) return;
      const [name, value] = c.dataset.clear.split('=');
      $$(`[name="${name}"]`, form).forEach(el => {
        if (el.type === 'checkbox') { if (value === undefined || el.value === value) el.checked = false; }
        else if (el.type === 'radio') el.checked = el.value === '';
        else el.value = '';
      });
      if (name === 'mark' && form.elements.model) form.elements.model.value = '';
      load();
    });
    document.addEventListener('click', e => {
      const reset = e.target.closest('[data-reset]'); if (!reset) return;
      e.preventDefault();
      $$('input, select', form).forEach(el => {
        if (el.type === 'checkbox') el.checked = false;
        else if (el.type === 'radio') el.checked = el.value === '';
        else if (el.type !== 'hidden') el.value = '';
      });
      load().then(closePanel);
    });

    results.addEventListener('click', async e => {
      const more = e.target.closest('[data-more]');
      if (more) {
        e.preventDefault();
        const page = Number(new URL(more.dataset.more, location.href).searchParams.get('page')) || 2;
        more.disabled = true; more.textContent = 'Загружаем…';
        await load({page, append: true});
        return;
      }
      const a = e.target.closest('a[data-page]');
      if (a) {
        e.preventDefault();
        const page = Number(new URL(a.href).searchParams.get('page')) || 1;
        await load({page});
        $('.cat-head')?.scrollIntoView({behavior: 'smooth', block: 'start'});
      }
    });

    function openPanel() {
      panel.classList.add('open');
      backdrop = document.createElement('div'); backdrop.className = 'filters-backdrop';
      backdrop.addEventListener('click', closePanel);
      document.body.append(backdrop); lockScroll(true);
    }
    function closePanel() {
      if (!panel.classList.contains('open')) return;
      panel.classList.remove('open'); backdrop?.remove(); backdrop = null; lockScroll(false);
    }
    $('[data-filters-open]')?.addEventListener('click', openPanel);
    $('[data-filters-close]')?.addEventListener('click', closePanel);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

    // Демо-сборка отдаёт страницу без фильтров: фильтры из адреса применяем в браузере
    if (STATIC && location.search) {
      const p = new URLSearchParams(location.search);
      $$('input, select', form).forEach(el => {
        if (!p.has(el.name)) return;
        if (el.type === 'checkbox') el.checked = p.getAll(el.name).includes(el.value);
        else if (el.type === 'radio') el.checked = (p.get(el.name) || '') === el.value;
        else if (el.name === 'mark') el.value = p.get('mark').toUpperCase();
        else if (el.name === 'model') {
          const v = p.get('model').toUpperCase();
          if (![...el.options].some(o => o.value === v)) el.add(new Option(v, v));
          el.value = v; el.disabled = false;
        } else el.value = p.get(el.name);
      });
      if (sortSel && p.has('sort')) sortSel.value = p.get('sort');
      load({page: toInt(p.get('page'))});
    }
  }

  // Быстрый поиск на главной
  function initQuick() {
    const form = $('[data-quick]'); if (!form) return;
    const mark = $('[data-mark]', form), model = $('[data-model]', form), label = $('[data-quick-btn] span', form);
    const clean = () => { const p = new URLSearchParams(); for (const [k, v] of new FormData(form)) if (v) p.append(k, v); return p; };
    async function count() {
      try {
        let total;
        if (STATIC) {
          const db = await loadDB(), f = readFilters(clean());
          total = db.cars.filter(c => matches(c, f)).length;
        } else {
          total = (await (await fetch(BASE + '/api/count?' + clean())).json()).total;
        }
        label.textContent = total ? `Показать ${fmt(total)}` : 'Ничего нет';
      } catch { /* кнопка просто ведёт в каталог */ }
    }
    async function modelsOf(markCode) {
      if (!STATIC) return (await fetch(BASE + '/api/models?mark=' + encodeURIComponent(markCode))).json();
      const db = await loadDB(), out = {};
      for (const c of db.cars) if (c.mark_code === markCode) (out[c.model_code] = out[c.model_code] || {code: c.model_code, name: c.model, n: 0}).n++;
      return Object.values(out).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    mark.addEventListener('change', async () => {
      if (mark.selectedOptions[0]?.hasAttribute('data-all-marks')) { window.location.href = form.action; return; }
      model.innerHTML = ''; model.add(new Option('Любая', '')); model.disabled = !mark.value;
      if (mark.value) {
        try {
          (await modelsOf(mark.value)).forEach(m => model.add(new Option(`${m.name} · ${m.n}`, m.code)));
        } catch { /* без списка моделей тоже можно искать */ }
      }
      count();
    });
    form.addEventListener('change', e => { if (e.target !== mark) count(); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const p = clean();
      let url = form.getAttribute('action');
      const mk = p.get('mark'), md = p.get('model');
      if (mk) { url += '/' + mk.toLowerCase(); p.delete('mark'); if (md) { url += '/' + md.toLowerCase(); p.delete('model'); } }
      window.location.href = url + (p.toString() ? '?' + p : '');
    });
  }

  // Галерея на странице автомобиля
  function initGallery() {
    const g = $('[data-gallery]'); if (!g) return;
    const track = $('[data-track]', g); if (!track) return;
    const slides = $$('img', track), n = slides.length;
    const counter = $('[data-counter]', g), thumbs = $$('[data-thumb]', g);
    let idx = 0, raf = 0;
    const sync = () => {
      if (counter) counter.textContent = `${idx + 1} / ${n}`;
      thumbs.forEach((t, j) => t.classList.toggle('on', j === idx));
      const t = thumbs[idx];
      if (t) t.parentElement.scrollTo({left: t.offsetLeft - t.parentElement.clientWidth / 2 + t.clientWidth / 2, behavior: 'smooth'});
    };
    const go = (i, smooth = true) => {
      idx = (i + n) % n;
      track.scrollTo({left: idx * track.clientWidth, behavior: smooth ? 'smooth' : 'auto'});
      sync();
    };
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        if (i !== idx && i >= 0 && i < n) { idx = i; sync(); }
      });
    }, {passive: true});
    $('[data-prev]', g)?.addEventListener('click', () => go(idx - 1));
    $('[data-next]', g)?.addEventListener('click', () => go(idx + 1));
    thumbs.forEach((t, j) => t.addEventListener('click', () => go(j)));
    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
    });

    const lb = $('#lightbox'); if (!lb) return;
    const lbTrack = $('[data-lb-track]', lb), lbImgs = $$('img', lbTrack), lbCounter = $('[data-lb-counter]', lb);
    let li = 0, lraf = 0;
    const lazy = i => [i - 1, i, i + 1].forEach(k => { const im = lbImgs[(k + n) % n]; if (im && !im.getAttribute('src')) im.src = im.dataset.src; });
    const lbSync = () => { lbCounter.textContent = `${li + 1} / ${n}`; lazy(li); };
    const lbGo = (i, smooth = true) => {
      li = (i + n) % n; lazy(li);
      lbTrack.scrollTo({left: li * lbTrack.clientWidth, behavior: smooth ? 'smooth' : 'auto'});
      lbSync();
    };
    const open = i => { lb.showModal(); lockScroll(true); lbGo(i, false); };
    track.addEventListener('click', () => open(idx));
    $('[data-zoom-open]', g)?.addEventListener('click', () => open(idx));
    $('[data-lb-prev]', lb)?.addEventListener('click', () => lbGo(li - 1));
    $('[data-lb-next]', lb)?.addEventListener('click', () => lbGo(li + 1));
    lbTrack.addEventListener('scroll', () => {
      cancelAnimationFrame(lraf);
      lraf = requestAnimationFrame(() => {
        const i = Math.round(lbTrack.scrollLeft / lbTrack.clientWidth);
        if (i !== li && i >= 0 && i < n) { li = i; lbSync(); }
      });
    }, {passive: true});
    lb.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') lbGo(li + 1);
      if (e.key === 'ArrowLeft') lbGo(li - 1);
    });
    lb.addEventListener('close', () => go(li, false));
    window.addEventListener('resize', () => go(idx, false));
  }

  // Поделиться ссылкой на автомобиль
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-share]'); if (!b) return;
    const data = {title: b.dataset.shareTitle || document.title, url: location.origin + location.pathname};
    if (navigator.share) { try { await navigator.share(data); } catch { /* отменено */ } return; }
    try { await navigator.clipboard.writeText(data.url); toast('Ссылка скопирована'); }
    catch { toast('Скопируйте адрес из строки браузера'); }
  });

  // Яндекс Метрика загружается только после согласия на cookie
  function loadMetrika() {
    const id = Number(window.SITE.metrika);
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); }; m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(id, 'init', {clickmap: true, trackLinks: true, accurateTrackBounce: true});
  }
  function initCookie() {
    if (!window.SITE || !SITE.metrika) return;
    const KEY = 'autostock:cookie', choice = store.get(KEY, null);
    if (choice === 'yes') return loadMetrika();
    if (choice === 'no') return;
    const box = $('#cookie'); if (!box) return;
    box.hidden = false;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-cookie]'); if (!b) return;
      store.set(KEY, b.dataset.cookie); box.hidden = true;
      if (b.dataset.cookie === 'yes') loadMetrika();
    });
  }

  favUI();
  refreshAgo();
  renderFavorites();
  initCatalog();
  initQuick();
  initGallery();
  initCookie();
})();
