/* =========================================
   CEO플래너 — CEO 앱 (모바일)
   아래 메뉴: 홈 · 비서톡 · 긴급 · 내 정보
   홈: 다음 출발 시각(크게) + 일정표(타임라인) / 세로 캘린더
   입력은 비서가 하고, 대표는 확인 · 요청 · 개인 일정만.
   ========================================= */
const App = {
  tab: 'home',
  view: 'timeline',   // 'timeline' | 'calendar'
  day: U.today(),
  seenMsgs: 0,
  _timers: [],

  TABS: [['home', 'home', '홈'], ['chat', 'chat', '비서톡'], ['sos', 'siren', '긴급'], ['me', 'user', '내 정보']],

  async start() {
    const root = document.getElementById('root');
    try { await Store.init('ceo'); }
    catch (e) { root.innerHTML = `<p style="padding:20px">연결 오류: ${U.esc(e.message || e)}</p>`; return; }
    if (Store.needsLogin) return Login.render(root, 'CEO플래너 로그인', () => this.boot());
    this.boot();
  },

  boot() {
    this.seenMsgs = Number(localStorage.getItem('CEOP_SEEN_CEO') || 0);
    const nav = document.getElementById('tabs');
    nav.innerHTML = this.TABS.map(([k, ic, l]) => `<button data-tab="${k}" class="${k === 'sos' ? 'sos-tab' : ''}">${Icon.svg(ic, 22)}<span>${l}</span></button>`).join('');
    nav.addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) this.go(b.dataset.tab); });
    Store.on(() => { this.render(); this.scheduleAlerts(); });
    this.render();
    this.scheduleAlerts();
    setInterval(() => { if (this.tab === 'home') this.render(); }, 60000);
  },

  go(tab) {
    this.tab = tab;
    this.render();
    window.scrollTo(0, tab === 'chat' ? document.body.scrollHeight : 0);
  },

  render() {
    document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === this.tab); b.setAttribute('aria-current', b.dataset.tab === this.tab ? 'page' : 'false'); });
    const demo = Store.mode === 'demo' ? `<div class="demo-bar">데모 모드입니다. 같은 브라우저에서 <a href="${U.esc(CEOP_CONFIG.SECRETARY_URL)}" target="_blank">비서 웹</a>을 열면 양쪽에 바로 반영돼요.</div>` : '';
    const root = document.getElementById('root');
    root.innerHTML = demo + { home: () => this.home(), chat: () => this.chat(), sos: () => this.sos(), me: () => this.me() }[this.tab]();
    this.bind(root);
    this.updateChatDot();
  },

  profile() { return Store.profile(); },
  dayPlan(ymd) { return Backtime.planDay(Store.byDate(ymd).filter(s => s.status !== 'cancelled'), { prepMin: this.profile().prepMin }); },

  /** 지금 이후 가장 가까운 일정 (오늘·내일) */
  next() {
    const now = new Date();
    for (const ymd of [U.today(), U.addDays(U.today(), 1)]) {
      const hit = this.dayPlan(ymd).find(({ p }) => p.endAt > now);
      if (hit) return hit;
    }
    return null;
  },

  // ───────── 홈 ─────────
  home() {
    return this.hero() + `<div class="body">
      <div class="toolbar">
        <div class="seg" role="tablist"><button data-view="timeline" class="${this.view === 'timeline' ? 'on' : ''}">일정표</button><button data-view="calendar" class="${this.view === 'calendar' ? 'on' : ''}">캘린더</button></div>
        ${this.view === 'timeline' ? `<div class="daynav"><button data-day="-1" aria-label="전날">${Icon.svg('left', 18)}</button><b>${this.shortDate(this.day)}</b><button data-day="1" aria-label="다음 날">${Icon.svg('right', 18)}</button></div>` : ''}
      </div>
      ${this.view === 'timeline' ? this.timeline() : this.calendar()}</div>`;
  },

  shortDate(ymd) {
    const d = U.at(ymd, '00:00');
    const rel = ymd === U.today() ? '오늘' : ymd === U.addDays(U.today(), 1) ? '내일' : ymd === U.addDays(U.today(), -1) ? '어제' : U.WEEK[d.getDay()] + '요일';
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${rel}`;
  },

  hero() {
    const p = this.profile();
    const now = new Date();
    const d = U.at(U.today(), '00:00');
    const top = `<div class="hero-top"><span class="hero-date">${d.getMonth() + 1}월 ${d.getDate()}일 ${U.WEEK[d.getDay()]}요일</span><span class="hero-name">${U.esc(p.name || '대표')}님</span></div>`;
    const n = this.next();
    if (!n) return `<header class="hero rest">${top}<p class="hero-label">남은 일정</p><div class="hero-time"><b>오늘은 끝났어요</b></div>
      <div class="hero-meta">내일 일정은 비서가 정리하면 여기에 표시돼요.</div></header>`;
    const { s, p: pl } = n;
    const moving = s.mode !== 'none' && pl.leaveAt > now;
    const target = moving ? pl.leaveAt : pl.startAt;
    const left = U.diffMin(target, now);
    const label = moving ? (s.date === U.today() ? '다음 출발' : '내일 첫 출발') : left > 0 ? (s.date === U.today() ? '다음 일정' : '내일 첫 일정') : '진행 중';
    const leftTxt = left > 0 ? `${U.durLabel(left)} 남음` : `${s.end}까지`;
    const fill = left > 0 ? Math.max(4, Math.min(100, 100 - left / 180 * 100)) : 100;
    const priv = s.visibility === 'private';
    const acked = !!s.ackAt || priv;
    const meta = [];
    meta.push(`${s.start} 시작`);
    if (s.location) meta.push(U.esc(s.location));
    if (moving && pl.driverCallAt) meta.push(`기사님 ${U.hm(pl.driverCallAt)} 대기`);
    if (moving && pl.wakeAt && pl.wakeAt > now) meta.push(`기상 ${U.hm(pl.wakeAt)}`);
    const hasBrief = s.briefing && s.briefing.who;
    return `<header class="hero">${top}
      <p class="hero-label">${label}</p>
      <div class="hero-time"><b>${U.hm(target)}</b><span>${leftTxt}</span></div>
      <div class="hero-bar" aria-hidden="true"><i style="width:${fill}%"></i></div>
      <div class="hero-what">${U.esc(s.title)}</div>
      <div class="hero-meta">${meta.join(' · ')}</div>
      <div class="hero-actions">
        ${priv ? '' : `<button class="btn ${acked ? '' : 'go'}" data-ack="${s.id}" ${acked ? 'disabled' : ''}>${acked ? `${Icon.svg('check', 16)} 확인함` : '확인'}</button>`}
        ${priv ? '' : `<button class="btn" data-late="${s.id}">10분 늦어요</button>`}
        ${hasBrief ? `<button class="btn" data-brief="${s.id}">${Icon.svg('file', 16)} 브리핑</button>` : s.location ? `<a class="btn" href="${U.tmapLink(s.location)}">${Icon.svg('nav', 16)} 길안내</a>` : ''}
      </div></header>`;
  },

  timeline() {
    const list = this.dayPlan(this.day);
    const warns = Backtime.conflicts(Store.byDate(this.day).filter(s => s.status !== 'cancelled'));
    const now = new Date();
    // 충돌 경고는 맨 위가 아니라 부딪히는 두 일정 사이에 표시
    const rows = list.map(({ s, p }) => {
      const state = p.endAt < now ? 'past' : p.startAt <= now ? 'now' : '';
      const w = warns.find(x => x.b.id === s.id);
      const note = w ? `<div class="conflict" role="note">${Icon.svg('alert', 16)}<span>${U.esc(w.msg)}</span></div>` : '';
      return note + this.agRow(s, p, state);
    }).join('');
    return `<section class="sheet">${rows || '<div class="empty-day">이 날은 일정이 없어요.</div>'}</section>
      <button class="add-private" data-addprivate>${Icon.svg('lock', 15)} 개인 일정 추가 · 비서에게는 '바쁨'으로 보여요</button>`;
  },

  agRow(s, p, state) {
    const priv = s.visibility === 'private';
    const mode = Backtime.MODES[s.mode] || Backtime.MODES.none;
    const go = s.mode !== 'none';
    const now = new Date();
    const route = go ? `<ol class="route">${p.items.filter(it => !['start', 'end'].includes(it.kind)).map(it =>
      `<li class="${it.kind} ${it.at < now ? 'done' : ''}"><b>${U.hm(it.at)}</b>${Icon.kind(it.kind, 15)}<span>${U.esc(it.title)}${it.detail ? ` <small>${U.esc(it.detail)}</small>` : ''}</span></li>`).join('')}</ol>` : '';
    const status = priv ? '<span class="badge private">개인</span>' : s.ackAt ? '<span class="badge ok">확인함</span>' : '<span class="badge warn">확인 대기</span>';
    const sub = [s.location ? U.esc(s.location) : '', go ? mode.label : ''].filter(Boolean).join(' · ');
    const acts = [];
    if (!priv && !s.ackAt) acts.push(`<button class="confirm" data-ack="${s.id}">확인</button>`);
    if (s.briefing && s.briefing.who) acts.push(`<button data-brief="${s.id}">${Icon.svg('file', 15)} 브리핑</button>`);
    if (s.location) acts.push(`<a href="${U.tmapLink(s.location)}">${Icon.svg('nav', 15)} 길안내</a>`);
    if (!priv) acts.push(`<button data-postpone="${s.id}">변경 요청</button>`);
    else acts.push(`<button data-delprivate="${s.id}">삭제</button>`);
    return `<article class="ag ${state} ${priv ? 'private' : ''}">
      <div class="ag-time"><b>${s.start}</b><small>${s.end}</small></div>
      <div class="ag-body">
        <div class="ag-title">${Icon.cat(s.category, 17)}<h3>${U.esc(s.title)}</h3>${status}</div>
        ${sub ? `<div class="ag-sub">${sub}</div>` : ''}
        ${state === 'past' ? '' : route}
        ${state === 'past' ? '' : `<div class="ag-actions">${acts.join('')}</div>`}
      </div></article>`;
  },

  calendar() {
    let html = '<section class="sheet">';
    for (let i = 0; i < 21; i++) {
      const ymd = U.addDays(U.today(), i);
      const d = U.at(ymd, '00:00');
      const list = Store.byDate(ymd);
      const items = list.map(s => `<span class="${s.visibility === 'private' ? 'lock' : ''}"><i>${s.start}</i>${U.esc(s.title)}</span>`).join('') || '<span class="none">일정 없음</span>';
      html += `<button class="cal-row ${i === 0 ? 'today' : ''}" data-pick="${ymd}">
        <span class="d"><b>${d.getDate()}</b><small>${U.WEEK[d.getDay()]}</small></span><span class="items">${items}</span></button>`;
    }
    return html + '</section>';
  },

  // ───────── 비서톡 ─────────
  QUICK: ['확인했어요', '10분 늦어요', '이 일정 미뤄 주세요', '전화 주세요', '차 대기시켜 주세요'],
  chat() {
    const msgs = Store.messages();
    this.seenMsgs = msgs.length;
    localStorage.setItem('CEOP_SEEN_CEO', String(msgs.length));
    const name = this.profile().secretaryName || '비서';
    const list = msgs.map(m => `<div class="msg ${m.from === 'ceo' ? 'me' : 'them'} ${m.urgent ? 'urgent' : ''}">${U.esc(m.body)}<small>${m.urgent ? '긴급 · ' : ''}${U.hm(new Date(m.at))}</small></div>`).join('')
      || `<p class="muted small" style="text-align:center">${U.esc(name)}님에게 보낸 메시지가 여기에 표시돼요.</p>`;
    return `<header class="page-head"><h1>비서톡</h1><p>${U.esc(name)}</p></header>
      <div class="chat">${list}</div>
      <div class="composer"><div class="quick">${this.QUICK.map(q => `<button data-quick="${U.esc(q)}">${U.esc(q)}</button>`).join('')}</div>
      <form id="chatForm"><input name="body" placeholder="메시지 입력" autocomplete="off" aria-label="메시지"><button class="btn primary" aria-label="보내기">${Icon.svg('send', 18)}</button></form></div>`;
  },

  updateChatDot() {
    const btn = document.querySelector('#tabs button[data-tab="chat"]');
    if (!btn) return;
    btn.querySelector('.dot')?.remove();
    const msgs = Store.messages();
    const unread = msgs.slice(this.seenMsgs).some(m => m.from !== 'ceo');
    if (unread && this.tab !== 'chat') btn.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
  },

  // ───────── 긴급 ─────────
  sos() {
    const p = this.profile();
    return `<header class="page-head"><h1>긴급</h1><p>누르면 바로 연결돼요</p></header>
      <div class="list">
        <button class="list-row danger" data-urgent><span class="ico">${Icon.svg('siren', 20)}</span><span class="t"><b>비서에게 긴급 요청</b><small>'지금 바로 연락 주세요'를 바로 보내요</small></span></button>
        <a class="list-row" href="${U.telLink(p.secretaryPhone)}"><span class="ico">${Icon.svg('phone', 20)}</span><span class="t"><b>${U.esc(p.secretaryName || '비서')}에게 전화</b><small class="num">${U.esc(p.secretaryPhone || '번호를 내 정보에서 입력하세요')}</small></span></a>
        <a class="list-row" href="${U.telLink(p.driverPhone)}"><span class="ico">${Icon.svg('car', 20)}</span><span class="t"><b>${U.esc(p.driverName || '기사님')}에게 전화</b><small class="num">${U.esc(p.driverPhone || '번호를 내 정보에서 입력하세요')}</small></span></a>
      </div>
      <p class="list-note">긴급 요청은 비서 웹 맨 위에 빨간 띠로 바로 표시돼요.</p>`;
  },

  // ───────── 내 정보 ─────────
  me() {
    const p = this.profile();
    const notif = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
    const field = (name, label, val, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${U.esc(val ?? '')}"></label>`;
    const notifTxt = notif === 'granted' ? '켜짐 · 앱이 열려 있을 때 울려요' : notif === 'denied' ? '차단됨 · 브라우저 설정에서 허용하세요' : notif === 'unsupported' ? '이 기기에서는 지원하지 않아요' : '꺼짐';
    return `<header class="page-head"><h1>내 정보</h1><p>${Store.mode === 'demo' ? '데모 모드' : '서버에 연결됨'}</p></header>
      <form id="meForm">
        <p class="section-label">나</p>
        <div class="list form-list">${field('name', '이름', p.name)}${field('prepMin', '아침 준비 시간 (분)', p.prepMin || 60, 'number')}</div>
        <p class="section-label">비서 · 기사님</p>
        <div class="list form-list">${field('secretaryName', '비서 이름', p.secretaryName)}${field('secretaryPhone', '비서 연락처', p.secretaryPhone, 'tel')}${field('driverName', '기사님 이름', p.driverName)}${field('driverPhone', '기사님 연락처', p.driverPhone, 'tel')}</div>
        <button class="btn primary form-save">저장</button>
      </form>
      <p class="section-label">앱</p>
      <div class="list">
        <${notif === 'default' ? 'button data-notif' : 'div'} class="list-row brass"><span class="ico">${Icon.svg('clock', 20)}</span><span class="t"><b>기상 · 출발 알림</b><small>${notifTxt}</small></span></${notif === 'default' ? 'button' : 'div'}>
        ${Store.mode === 'demo' ? `<button class="list-row" data-reset><span class="ico">${Icon.svg('settings', 20)}</span><span class="t"><b>데모 데이터 처음으로</b><small>샘플 일정으로 되돌려요</small></span></button>`
          : `<button class="list-row" data-logout><span class="ico">${Icon.svg('user', 20)}</span><span class="t"><b>로그아웃</b></span></button>`}
      </div>`;
  },

  // ───────── 모달 ─────────
  modal(html) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) back.remove(); });
    document.body.appendChild(back);
    return back;
  },

  briefing(id) {
    const s = Store.get(id); if (!s) return;
    const b = s.briefing || {};
    const row = (k, v) => v ? `<dt>${k}</dt><dd>${U.esc(v)}</dd>` : '';
    this.modal(`<div class="brief-head"><span class="ico">${Icon.svg('file', 22)}</span><div><h3>${U.esc(s.title)}</h3><p>${this.shortDate(s.date)} ${s.start}${s.location ? ' · ' + U.esc(s.location) : ''}</p></div></div>
      <dl class="kv">${row(s.category === 'golf' ? '동반자' : '만날 분', b.who)}${row('회사 · 직함', b.company)}${row('목적', b.purpose)}${row('지난 미팅', b.last)}${row('메모', b.notes)}${row('준비물', b.bring)}</dl>
      <div class="modal-foot"><button class="btn primary" data-close>닫기</button></div>`);
  },

  addPrivate() {
    const m = this.modal(`<h3>개인 일정 추가</h3><p class="muted small" style="margin:0">비서에게는 이 시간이 '바쁨'으로만 보여요.</p>
      <form id="privForm">
        <div class="form-list">
          <label>제목<input name="title" required placeholder="예: 가족 행사"></label>
          <label>날짜<input name="date" type="date" required value="${this.day}"></label>
          <label>시작<input name="start" type="time" required value="18:00"></label>
          <label>종료<input name="end" type="time" required value="19:00"></label>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>취소</button><button class="btn primary">저장</button></div>
      </form>`);
    m.querySelector('#privForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      if (f.end.value < f.start.value) return U.toast('종료 시간이 시작보다 빨라요');
      try {
        await Store.upsert({ title: f.title.value.trim(), category: 'personal', date: f.date.value, start: f.start.value, end: f.end.value, mode: 'none', visibility: 'private', location: '', briefing: {}, status: 'scheduled', ackAt: new Date().toISOString() });
        m.remove(); U.toast('개인 일정을 저장했어요');
      } catch (err) { U.toast('저장하지 못했어요: ' + (err.message || err)); }
    });
    m.querySelector('[name=title]').focus();
  },

  // ───────── 이벤트 ─────────
  bind(root) {
    const on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', e => fn(el, e)));
    const safe = fn => async (...a) => { try { await fn(...a); } catch (err) { U.toast('처리하지 못했어요: ' + (err.message || err)); } };
    on('[data-view]', el => { this.view = el.dataset.view; this.render(); });
    on('[data-day]', el => { this.day = U.addDays(this.day, Number(el.dataset.day)); this.render(); });
    on('[data-pick]', el => { this.day = el.dataset.pick; this.view = 'timeline'; this.render(); });
    on('[data-ack]', safe(async el => { await Store.ack(el.dataset.ack); U.toast('확인했어요. 비서 화면에 표시돼요'); }));
    on('[data-brief]', el => this.briefing(el.dataset.brief));
    on('[data-late]', safe(async el => { const s = Store.get(el.dataset.late); await Store.send(`'${s.title}' 10분 정도 늦을 것 같아요.`, { ref: s.id }); U.toast('비서에게 보냈어요'); }));
    on('[data-postpone]', safe(async el => { const s = Store.get(el.dataset.postpone); await Store.send(`'${s.title}' (${this.shortDate(s.date)} ${s.start}) 일정 미뤄 주세요.`, { ref: s.id }); U.toast('비서에게 요청했어요'); }));
    on('[data-addprivate]', () => this.addPrivate());
    on('[data-delprivate]', safe(async el => { if (confirm('이 개인 일정을 삭제할까요?')) { await Store.remove(el.dataset.delprivate); U.toast('삭제했어요'); } }));
    on('[data-quick]', safe(async el => { await Store.send(el.dataset.quick); }));
    // 긴급은 한 번 누르면 바로 전송 (입력창 없이)
    on('[data-urgent]', safe(async () => { await Store.send('지금 바로 연락 주세요', { urgent: true }); U.toast('긴급 요청을 보냈어요'); }));
    on('[data-notif]', async () => { await Notification.requestPermission(); this.render(); this.scheduleAlerts(); });
    on('[data-reset]', () => { if (confirm('데모 데이터를 처음 상태로 되돌릴까요?')) Store.resetDemo(); });
    on('[data-logout]', () => Store.signOut());
    const cf = root.querySelector('#chatForm');
    if (cf) cf.addEventListener('submit', safe(async e => { e.preventDefault(); const v = cf.body.value.trim(); if (v) await Store.send(v); }));
    const mf = root.querySelector('#meForm');
    if (mf) mf.addEventListener('submit', safe(async e => {
      e.preventDefault();
      const f = new FormData(mf);
      await Store.saveProfile({ name: f.get('name'), prepMin: Number(f.get('prepMin')) || 60, secretaryName: f.get('secretaryName'), secretaryPhone: f.get('secretaryPhone'), driverName: f.get('driverName'), driverPhone: f.get('driverPhone') });
      U.toast('저장했어요');
    }));
  },

  // ───────── 알림 (앱이 열려 있을 때만 — 앱이 꺼져도 울리는 알람은 안드로이드 단계에서) ─────────
  scheduleAlerts() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const now = Date.now();
    [U.today(), U.addDays(U.today(), 1)].forEach(ymd => this.dayPlan(ymd).forEach(({ s, p }) => {
      p.items.filter(it => ['wake', 'driver', 'leave'].includes(it.kind)).forEach(it => {
        const ms = it.at.getTime() - now;
        if (ms > 0 && ms < 12 * 3600e3) this._timers.push(setTimeout(() => new Notification(it.title, { body: `${s.title} · ${s.start}` }), ms));
      });
    }));
  },
};

App.start();
