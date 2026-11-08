/* =========================================
   CEO플래너 — CEO 앱 (모바일)
   아래 메뉴: 홈 · 비서톡 · 긴급 · 내 정보
   홈: 다음 일정 카드 + 타임라인 / 세로 캘린더
   입력은 비서가 하고, 대표는 확인 · 요청 · 개인 일정만.
   ========================================= */
const App = {
  tab: 'home',
  view: 'timeline',   // 'timeline' | 'calendar'
  day: U.today(),
  seenMsgs: 0,
  _timers: [],

  async start() {
    const root = document.getElementById('root');
    try { await Store.init('ceo'); }
    catch (e) { root.innerHTML = `<p style="padding:20px">연결 오류: ${U.esc(e.message || e)}</p>`; return; }
    if (Store.needsLogin) {
      document.getElementById('tabs').style.display = 'none';
      return Login.render(root, 'CEO플래너 로그인', () => { document.getElementById('tabs').style.display = ''; this.boot(); });
    }
    this.boot();
  },

  boot() {
    this.seenMsgs = Number(localStorage.getItem('CEOP_SEEN_CEO') || 0);
    Store.on(() => { this.render(); this.scheduleAlerts(); });
    document.getElementById('tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-tab]');
      if (b) this.go(b.dataset.tab);
    });
    this.render();
    this.scheduleAlerts();
    setInterval(() => { if (this.tab === 'home') this.render(); }, 60000);
  },

  go(tab) {
    this.tab = tab;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    this.render();
    window.scrollTo(0, tab === 'chat' ? document.body.scrollHeight : 0);
  },

  render() {
    const root = document.getElementById('root');
    const demo = Store.mode === 'demo' ? `<div class="demo-bar">데모 모드 — 같은 브라우저에서 <a href="${U.esc(CEOP_CONFIG.SECRETARY_URL)}" target="_blank">비서 웹</a>을 열면 서로 바로 반영돼요</div>` : '';
    const html = { home: () => this.home(), chat: () => this.chat(), sos: () => this.sos(), me: () => this.me() }[this.tab]();
    root.innerHTML = demo + html;
    this.bind(root);
    this.updateChatDot();
  },

  // ───────── 홈 ─────────
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

  home() {
    const p = this.profile();
    const today = Store.byDate(U.today());
    const head = `<header class="app-head"><h1>${U.esc(p.name || '대표')}님, 안녕하세요</h1>
      <div class="sub">${U.dateLabel(U.today())} · 오늘 일정 ${today.length}개</div></header>`;
    return head + `<main>${this.nextCard()}
      <div class="seg"><button data-view="timeline" class="${this.view === 'timeline' ? 'on' : ''}">타임라인</button>
      <button data-view="calendar" class="${this.view === 'calendar' ? 'on' : ''}">캘린더</button></div>
      ${this.view === 'timeline' ? this.timeline() : this.calendar()}</main>`;
  },

  nextCard() {
    const n = this.next();
    if (!n) return `<section class="card next"><div class="label">다음 일정</div><div class="title">남은 일정이 없어요</div><div class="muted small">푹 쉬세요.</div></section>`;
    const { s, p } = n;
    const now = new Date();
    const moving = s.mode && s.mode !== 'none';
    const target = moving && p.leaveAt > now ? p.leaveAt : p.startAt;
    const left = U.diffMin(target, now);
    const leftTxt = left > 0 ? `${U.durLabel(left)} 남음` : '진행 중';
    const priv = s.visibility === 'private';
    const acked = !!s.ackAt || priv;
    return `<section class="card next">
      <div class="label">다음 일정 · ${s.date === U.today() ? '오늘' : '내일'}</div>
      <div class="title">${Backtime.CATEGORIES[s.category]?.emoji || ''} ${U.esc(s.title)}</div>
      <div class="muted small">${s.start}–${s.end}${s.location ? ' · ' + U.esc(s.location) : ''}</div>
      <div class="leave"><b>${U.hm(target)}</b><span>${moving && p.leaveAt > now ? '출발' : '시작'} · ${leftTxt}</span></div>
      ${p.driverCallAt && p.driverCallAt > now ? `<div class="small muted" style="margin:-6px 0 12px">🚘 기사님 ${U.hm(p.driverCallAt)} 대기</div>` : ''}
      <div class="actions">
        <button class="btn ${acked ? '' : 'primary'}" data-ack="${s.id}" ${acked ? 'disabled' : ''}>${priv ? '🔒 개인' : acked ? '✔ 확인함' : '확인'}</button>
        <button class="btn" data-late="${s.id}">10분 늦어</button>
        ${s.briefing && s.briefing.who ? `<button class="btn gold" data-brief="${s.id}">브리핑</button>` : `<a class="btn" href="${U.tmapLink(s.location)}">길안내</a>`}
      </div></section>`;
  },

  timeline() {
    const list = this.dayPlan(this.day);
    const warns = Backtime.conflicts(Store.byDate(this.day).filter(s => s.status !== 'cancelled'));
    const bar = `<div class="daybar"><button class="btn ghost" data-day="-1">‹</button>
      <h2>${U.dateLabel(this.day)}</h2><button class="btn ghost" data-day="1">›</button></div>`;
    const warnHtml = warns.map(w => `<div class="warn-box">⚠️ ${U.esc(w.msg)}</div>`).join('');
    const cards = list.map(({ s, p }) => this.schedCard(s, p)).join('') ||
      `<div class="card sched muted">일정이 없어요.</div>`;
    return bar + warnHtml + cards + `<button class="btn ghost" style="width:100%;margin:6px 0 20px" data-addprivate>🔒 개인 일정 추가 (비서에게는 '바쁨'으로 보여요)</button>`;
  },

  schedCard(s, p) {
    const cat = Backtime.CATEGORIES[s.category] || {};
    const mode = Backtime.MODES[s.mode] || Backtime.MODES.none;
    const priv = s.visibility === 'private';
    const items = p.items.map(it => `<li class="${it.kind}"><span class="t">${U.hm(it.at)}</span>${it.icon} ${U.esc(it.title)}${it.detail ? `<span class="d">${U.esc(it.detail)}</span>` : ''}</li>`).join('');
    return `<article class="card sched ${priv ? 'private' : ''}">
      <div class="top"><div><div class="time">${s.start}–${s.end}</div>
        <div class="name">${cat.emoji || ''} ${U.esc(s.title)}</div>
        <div class="place">${U.esc(s.location || '')}${s.mode !== 'none' ? ` · ${mode.emoji} ${mode.label}` : ''}</div></div>
        <div>${priv ? '<span class="badge private">개인</span>' : s.ackAt ? '<span class="badge ok">확인함</span>' : '<span class="badge warn">미확인</span>'}</div></div>
      ${s.mode !== 'none' ? `<ul class="tl">${items}</ul>` : ''}
      <div class="row">
        ${!priv && !s.ackAt ? `<button class="btn primary" data-ack="${s.id}">확인</button>` : ''}
        ${s.briefing && s.briefing.who ? `<button class="btn gold" data-brief="${s.id}">브리핑</button>` : ''}
        ${s.location ? `<a class="btn" href="${U.tmapLink(s.location)}">길안내</a>` : ''}
        ${!priv ? `<button class="btn" data-postpone="${s.id}">미뤄줘</button>` : `<button class="btn" data-delprivate="${s.id}">삭제</button>`}
      </div></article>`;
  },

  calendar() {
    let html = '';
    for (let i = 0; i < 21; i++) {
      const ymd = U.addDays(U.today(), i);
      const d = U.at(ymd, '00:00');
      const list = Store.byDate(ymd);
      const rows = list.map(s => `<div>${s.start} ${Backtime.CATEGORIES[s.category]?.emoji || ''} ${U.esc(s.title)}</div>`).join('') || '<div class="empty">일정 없음</div>';
      html += `<div class="card cal-day ${i === 0 ? 'today' : ''}" data-pick="${ymd}">
        <div class="dnum"><b>${d.getDate()}</b><span>${U.WEEK[d.getDay()]}</span></div><div class="items">${rows}</div></div>`;
    }
    return html;
  },

  // ───────── 비서톡 ─────────
  QUICK: ['확인했어요', '10분 늦어요', '이 일정 미뤄 주세요', '전화 주세요', '차 대기시켜 주세요'],
  chat() {
    const msgs = Store.messages();
    this.seenMsgs = msgs.length;
    localStorage.setItem('CEOP_SEEN_CEO', String(msgs.length));
    const name = this.profile().secretaryName || '비서';
    const list = msgs.map(m => `<div class="msg ${m.from === 'ceo' ? 'me' : 'them'} ${m.urgent ? 'urgent' : ''}">${m.urgent ? '🚨 ' : ''}${U.esc(m.body)}<span class="at">${U.hm(new Date(m.at))}</span></div>`).join('')
      || `<p class="muted small" style="text-align:center">${U.esc(name)}님과의 대화가 여기에 표시돼요.</p>`;
    return `<header class="app-head" style="padding-bottom:18px"><h1>비서톡</h1><div class="sub">${U.esc(name)}</div></header>
      <main><div class="chat">${list}</div></main>
      <div class="composer"><div class="quick">${this.QUICK.map(q => `<button data-quick="${U.esc(q)}">${U.esc(q)}</button>`).join('')}</div>
      <form id="chatForm"><input name="body" placeholder="메시지 입력" autocomplete="off"><button class="btn primary">보내기</button></form></div>`;
  },

  updateChatDot() {
    const btn = document.querySelector('#tabs button[data-tab="chat"]');
    const unread = Store.messages().filter(m => m.from !== 'ceo').length > 0 && Store.messages().length > this.seenMsgs && this.tab !== 'chat';
    btn.querySelector('.dot')?.remove();
    if (unread) btn.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
  },

  // ───────── 긴급 ─────────
  sos() {
    const p = this.profile();
    return `<header class="app-head" style="padding-bottom:18px"><h1>긴급</h1><div class="sub">누르면 바로 연결돼요</div></header>
      <main class="sos">
        <a class="btn danger" href="${U.telLink(p.secretaryPhone)}">📞 ${U.esc(p.secretaryName || '비서')}에게 전화</a>
        <a class="btn primary" href="${U.telLink(p.driverPhone)}">🚘 ${U.esc(p.driverName || '기사님')}에게 전화</a>
        <button class="btn gold" data-urgent>🚨 비서에게 긴급 메시지 보내기</button>
        <p class="muted small" style="margin:-4px 0 0">누르면 '지금 바로 연락 주세요'가 바로 전송되고, 비서 웹 맨 위에 빨간색으로 떠요.</p>
      </main>`;
  },

  // ───────── 내 정보 ─────────
  me() {
    const p = this.profile();
    const notif = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
    return `<header class="app-head" style="padding-bottom:18px"><h1>내 정보</h1><div class="sub">${Store.mode === 'demo' ? '데모 모드' : '서버 연결됨'}</div></header>
      <main><form class="card form" id="meForm">
        <label>이름<input name="name" value="${U.esc(p.name || '')}"></label>
        <label>아침 준비 시간 (분) — 기상 알림 계산에 사용<input name="prepMin" type="number" min="10" max="240" value="${Number(p.prepMin || 60)}"></label>
        <label>비서 이름<input name="secretaryName" value="${U.esc(p.secretaryName || '')}"></label>
        <label>비서 연락처<input name="secretaryPhone" value="${U.esc(p.secretaryPhone || '')}"></label>
        <label>기사님 이름<input name="driverName" value="${U.esc(p.driverName || '')}"></label>
        <label>기사님 연락처<input name="driverPhone" value="${U.esc(p.driverPhone || '')}"></label>
        <button class="btn primary">저장</button>
      </form>
      <div class="card form">
        <div class="small">알림: ${notif === 'granted' ? '켜짐 (앱이 열려 있을 때)' : notif === 'denied' ? '차단됨 — 브라우저 설정에서 허용' : notif === 'unsupported' ? '이 기기에서 지원 안 함' : '꺼짐'}</div>
        ${notif === 'default' ? '<button class="btn" data-notif>알림 허용</button>' : ''}
        ${Store.mode === 'demo' ? '<button class="btn ghost" data-reset>데모 데이터 처음으로</button>' : '<button class="btn ghost" data-logout>로그아웃</button>'}
      </div></main>`;
  },

  // ───────── 모달 ─────────
  modal(html) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal">${html}</div>`;
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) back.remove(); });
    document.body.appendChild(back);
    return back;
  },

  briefing(id) {
    const s = Store.get(id); if (!s) return;
    const b = s.briefing || {};
    const row = (k, v) => v ? `<dt>${k}</dt><dd>${U.esc(v)}</dd>` : '';
    this.modal(`<h3>📋 ${U.esc(s.title)}</h3><p class="muted small" style="margin-top:-6px">${U.dateLabel(s.date)} ${s.start} · ${U.esc(s.location || '')}</p>
      <dl class="kv">${row('만날 분', b.who)}${row('회사·직함', b.company)}${row('목적', b.purpose)}${row('지난 미팅', b.last)}${row('메모', b.notes)}${row('준비물', b.bring)}</dl>
      <button class="btn primary" style="width:100%;margin-top:16px" data-close>닫기</button>`);
  },

  addPrivate() {
    const m = this.modal(`<h3>🔒 개인 일정 추가</h3>
      <form class="form" id="privForm" style="padding:0;margin:0">
        <label>제목<input name="title" required placeholder="예: 병원, 가족 행사"></label>
        <label>날짜<input name="date" type="date" required value="${this.day}"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label>시작<input name="start" type="time" required value="18:00"></label>
          <label>종료<input name="end" type="time" required value="19:00"></label></div>
        <p class="muted small" style="margin:0">비서에게는 이 시간이 '바쁨'으로만 보여요.</p>
        <div style="display:flex;gap:8px"><button type="button" class="btn ghost" data-close style="flex:1">취소</button><button class="btn primary" style="flex:1">저장</button></div>
      </form>`);
    m.querySelector('#privForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      if (f.end.value < f.start.value) return U.toast('종료 시간이 시작보다 빨라요');
      await Store.upsert({ title: f.title.value.trim(), category: 'personal', date: f.date.value, start: f.start.value, end: f.end.value, mode: 'none', visibility: 'private', location: '', briefing: {}, status: 'scheduled', ackAt: new Date().toISOString() });
      m.remove(); U.toast('개인 일정을 저장했어요');
    });
  },

  // ───────── 이벤트 ─────────
  bind(root) {
    const on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', e => fn(el, e)));
    const safe = fn => async (...a) => { try { await fn(...a); } catch (err) { U.toast('저장 실패: ' + (err.message || err)); } };
    on('[data-view]', el => { this.view = el.dataset.view; this.render(); });
    on('[data-day]', el => { this.day = U.addDays(this.day, Number(el.dataset.day)); this.render(); });
    on('[data-pick]', el => { this.day = el.dataset.pick; this.view = 'timeline'; this.render(); });
    on('[data-ack]', safe(async el => { await Store.ack(el.dataset.ack); U.toast('확인했다고 비서에게 알렸어요'); }));
    on('[data-brief]', el => this.briefing(el.dataset.brief));
    on('[data-late]', safe(async el => { const s = Store.get(el.dataset.late); await Store.send(`'${s.title}' 10분 정도 늦을 것 같아요.`); U.toast('비서에게 보냈어요'); }));
    on('[data-postpone]', safe(async el => { const s = Store.get(el.dataset.postpone); await Store.send(`'${s.title}' (${U.dateLabel(s.date)} ${s.start}) 일정 미뤄 주세요.`); U.toast('비서에게 요청했어요'); }));
    on('[data-addprivate]', () => this.addPrivate());
    on('[data-delprivate]', safe(async el => { if (confirm('이 개인 일정을 삭제할까요?')) { await Store.remove(el.dataset.delprivate); U.toast('삭제했어요'); } }));
    on('[data-quick]', safe(async el => { await Store.send(el.dataset.quick); }));
    // 긴급은 한 번 누르면 바로 전송 (입력창 없이)
    on('[data-urgent]', safe(async () => { await Store.send('지금 바로 연락 주세요', { urgent: true }); U.toast('긴급 메시지를 보냈어요'); }));
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

  // ───────── 알림 (앱이 열려 있을 때만 — 앱이 꺼져도 울리는 알람은 안드로이드 네이티브 단계에서) ─────────
  scheduleAlerts() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const now = Date.now();
    [U.today(), U.addDays(U.today(), 1)].forEach(ymd => this.dayPlan(ymd).forEach(({ s, p }) => {
      p.items.filter(it => ['wake', 'driver', 'leave'].includes(it.kind)).forEach(it => {
        const ms = it.at.getTime() - now;
        if (ms > 0 && ms < 12 * 3600e3) this._timers.push(setTimeout(() => new Notification(`${it.icon} ${it.title}`, { body: `${s.title} · ${s.start}` }), ms));
      });
    }));
  },
};

App.start();
