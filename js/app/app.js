/* =========================================
   CEO플래너 — CEO 앱 (모바일)
   아래 메뉴: 홈 · 비서톡 · 긴급 · 내 정보
   홈: 다음 출발(크게) + 확인 버튼 + 오늘 일정
       다음 일정만 펼치고, 끝난 일정 · 나머지는 한 줄 (누르면 펼침)
   입력은 비서가 하고, 대표는 확인 · 요청 · 개인 일정만.
   ========================================= */
const App = {
  tab: 'home',
  view: 'timeline',   // 'timeline' | 'calendar'
  day: U.today(),
  openId: null,       // 사용자가 펼친 일정
  seenMsgs: 0,
  _timers: [],

  TABS: [['home', 'home', '홈'], ['chat', 'chat', '비서톡'], ['sos', 'siren', '긴급'], ['me', 'user', '내 정보']],
  SIZES: { m: ['보통', 1], l: ['크게', 1.1], xl: ['아주 크게', 1.22] },
  PREP: [30, 45, 60, 75, 90, 120],

  async start() {
    const root = document.getElementById('root');
    this.applySize();
    try { await Store.init('ceo'); }
    catch (e) { root.innerHTML = `<p style="padding:20px">연결 오류: ${U.esc(e.message || e)}</p>`; return; }
    if (Store.needsLogin) {
      document.getElementById('tabs').hidden = true;   // 로그인 · 가입 중에는 아래 메뉴 숨김
      return Login.render(root, 'CEO플래너 로그인', () => this.boot());
    }
    this.boot();
  },

  boot() {
    this.seenMsgs = Number(localStorage.getItem('CEOP_SEEN_CEO') || 0);
    const nav = document.getElementById('tabs');
    nav.hidden = false;
    nav.innerHTML = this.TABS.map(([k, ic, l]) => `<button data-tab="${k}" class="${k === 'sos' ? 'sos-tab' : ''}">${Icon.svg(ic, 24)}<span>${l}</span></button>`).join('');
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

  // 글자 크기 — 이 기기에만 저장 (보통 · 크게 · 아주 크게, 기본 크게)
  size() { return this.SIZES[localStorage.getItem('CEOP_FONT')] ? localStorage.getItem('CEOP_FONT') : 'l'; },
  applySize() { document.getElementById('root').style.zoom = this.SIZES[this.size()][1]; },

  notifState() { return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission; },

  render() {
    document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === this.tab); b.setAttribute('aria-current', b.dataset.tab === this.tab ? 'page' : 'false'); });
    const demo = Store.mode === 'demo' ? `<div class="demo-bar">데모 모드입니다. 같은 브라우저에서 <a href="${U.esc(CEOP_CONFIG.SECRETARY_URL)}" target="_blank">비서 웹</a>을 열면 양쪽에 바로 반영돼요.</div>` : '';
    const root = document.getElementById('root');
    const ps = Plan.state();
    document.getElementById('tabs').hidden = !ps.active;
    if (!ps.active) { root.innerHTML = demo + `<div class="plan-lock-wrap">${Plan.lockHtml()}</div>`; Plan.bindLock(root); return; }
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

  dateTitle(ymd) {
    const d = U.at(ymd, '00:00');
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${U.WEEK[d.getDay()]})`;
  },

  /** 이 일정에 대해 대표가 이미 보낸 요청이 있는지 (조정 요청 등) */
  sentAbout(id, word) { return Store.messages().some(m => m.from === 'ceo' && m.ref === id && m.body.includes(word)); },

  // ───────── 홈 ─────────
  home() {
    return this.hero() + `<div class="body">${this.view === 'timeline' ? this.dayList() : this.calendar()}</div>`
      + `<button class="ai-fab" data-ai aria-label="AI 비서 열기">${Icon.svg('mic', 20)}<span>AI 비서</span></button>`;
  },

  notifBanner(where) {
    const n = this.notifState();
    if (n === 'granted' || n === 'unsupported') return '';
    return `<button class="notif-banner ${where}" data-notif>${Icon.svg('bell', 18)}<span>기상 · 출발 알림이 ${n === 'denied' ? '차단돼 있어요' : '꺼져 있어요'}</span><u>${n === 'denied' ? '방법 보기' : '켜기'}</u></button>`;
  },

  hero() {
    const p = this.profile();
    const now = new Date();
    const top = `<div class="hero-top"><span>${this.dateTitle(U.today())}</span><span>${U.esc(p.name || '대표')}님</span></div>`;
    const n = this.next();
    if (!n) return `<header class="hero rest">${top}${this.notifBanner('in-hero')}<p class="hero-label">남은 일정</p><div class="hero-time"><b>오늘은 끝났어요</b></div>
      <div class="hero-meta">내일 일정은 비서가 정리하면 여기에 표시돼요.</div></header>`;
    const { s, p: pl } = n;
    const moving = s.mode !== 'none' && pl.leaveAt > now;
    const target = moving ? pl.leaveAt : pl.startAt;
    const left = U.diffMin(target, now);
    const label = moving ? (s.date === U.today() ? '다음 출발' : '내일 첫 출발') : left > 0 ? (s.date === U.today() ? '다음 일정' : '내일 첫 일정') : '진행 중';
    const leftTxt = left > 0 ? `${U.durLabel(left)} 남음` : `${s.end}까지`;
    const priv = s.visibility === 'private';
    const driver = moving && pl.driverCallAt
      ? `<div class="hero-driver">${Icon.svg('car', 17)}${U.esc(p.driverName || '기사')}님이 ${U.hm(pl.driverCallAt)}부터 ${pl.driverCallAt <= now ? '대기 중' : '대기 예정'}</div>` : '';
    const wake = moving && pl.wakeAt && pl.wakeAt > now ? `<div class="hero-sub">기상 ${U.hm(pl.wakeAt)} · 준비 ${U.durLabel(p.prepMin || 60)}</div>` : '';
    const hasBrief = s.briefing && s.briefing.who;
    return `<header class="hero">${top}${this.notifBanner('in-hero')}
      <p class="hero-label">${label}</p>
      <div class="hero-time"><b>${U.hm(target)}</b><span class="pill">${leftTxt}</span></div>
      <div class="hero-what">
        <strong>${U.esc(s.title)}</strong>
        <div class="hero-sub">${s.start} 시작${s.location ? ' · ' + U.esc(s.location) : ''}</div>
        ${driver}${wake}
      </div>
      ${priv ? '' : `<button class="hero-confirm ${s.ackAt ? 'done' : ''}" data-ack="${s.id}" ${s.ackAt ? 'disabled' : ''}>${s.ackAt ? `${Icon.svg('check', 18)} 확인했어요 · 비서에게 전달됨` : '이 일정 확인했어요'}</button>`}
      <div class="hero-actions">
        ${priv ? '' : `<button class="btn" data-late="${s.id}">10분 늦어요</button>`}
        ${hasBrief ? `<button class="btn" data-brief="${s.id}">${Icon.svg('file', 17)} 미팅 브리핑</button>` : s.location ? `<a class="btn" href="${U.tmapLink(s.location)}">${Icon.svg('nav', 17)} 길안내</a>` : ''}
      </div></header>`;
  },

  dayList() {
    const isToday = this.day === U.today();
    const list = this.dayPlan(this.day);
    const warns = Backtime.conflicts(Store.byDate(this.day).filter(s => s.status !== 'cancelled'));
    const now = new Date();
    const auto = (list.find(({ p }) => p.endAt > now) || {}).s;
    const openId = this.openId && list.some(x => x.s.id === this.openId) ? this.openId : auto && auto.id;
    const next = this.next();
    const head = `<div class="list-head">
        ${isToday ? '' : `<button class="link" data-today>${Icon.svg('left', 16)} 오늘</button>`}
        <h2>${isToday ? '오늘' : this.dateTitle(this.day)} 일정 ${list.length}건</h2>
        <button class="link" data-view="calendar">캘린더 ${Icon.svg('chevron', 16)}</button></div>`;
    const rows = list.map(({ s, p }) => {
      const w = warns.find(x => x.b.id === s.id);
      const past = p.endAt < now;
      let html = w ? this.conflictBox(w) : '';
      if (past) html += this.rowPast(s);
      else if (s.id === openId) html += this.card(s, p, next && next.s.id === s.id);
      else html += this.row(s);
      return html;
    }).join('');
    return head + (rows || '<div class="empty-day">이 날은 일정이 없어요.</div>') +
      `<button class="add-private" data-addprivate>${Icon.svg('plus', 16)} 개인 일정 추가</button>`;
  },

  conflictBox(w) {
    const asked = this.sentAbout(w.b.id, '조정');
    const name = this.profile().secretaryName || '비서';
    return `<div class="conflict" role="note"><p>${Icon.svg('alert', 18)}<span>${U.esc(w.msg)}</span></p>
      <button class="${asked ? 'sent' : ''}" data-adjust="${w.b.id}" data-prev="${w.a.id}" ${asked ? 'disabled' : ''}>${asked ? `${Icon.svg('check', 16)} 조정 요청 보냄 · ${U.esc(name)} 확인 중` : '비서에게 조정 요청'}</button></div>`;
  },

  rowPast(s) {
    return `<div class="row past"><span class="t">${s.start}</span><span class="n">${U.esc(s.title)}</span><span class="done">${Icon.svg('check', 16)} 끝남</span></div>`;
  },

  row(s) {
    const priv = s.visibility === 'private';
    if (priv) return `<div class="row private" data-open="${s.id}"><span class="t">${s.start}</span><span class="n">${Icon.svg('lock', 16)} ${U.esc(s.title)}</span><span class="tag">비서에겐 '바쁨'</span></div>`;
    const sub = s.ackAt ? U.esc(s.location || '') : `<em>확인 대기</em>${s.location ? ' · ' + U.esc(s.location) : ''}`;
    return `<div class="row" data-open="${s.id}"><span class="t">${s.start}</span>
      <span class="n">${U.esc(s.title)}<small>${sub}</small></span>
      ${s.ackAt ? `<span class="ok">${Icon.svg('check', 16)} 확인함</span>` : `<button class="mini" data-ack="${s.id}">확인</button>`}</div>`;
  },

  card(s, p, isNext) {
    const priv = s.visibility === 'private';
    const mode = Backtime.MODES[s.mode] || Backtime.MODES.none;
    const go = s.mode !== 'none';
    const now = new Date();
    const steps = go ? p.items.filter(it => !['start', 'end'].includes(it.kind)) : [];
    const route = steps.length ? `<ol class="route">${steps.map(it =>
      `<li class="${it.kind} ${it.at < now ? 'done' : ''}"><b>${U.hm(it.at)}</b><span>${U.esc(it.title)}${it.detail ? ` <small>${U.esc(it.detail)}</small>` : ''}</span></li>`).join('')}</ol>` : '';
    const badge = priv ? `<span class="tag">비서에겐 '바쁨'</span>` : isNext ? '<span class="badge next">다음 일정</span>' : s.ackAt ? '<span class="badge ok">확인함</span>' : '<span class="badge warn">확인 대기</span>';
    const acts = [];
    if (!priv && !s.ackAt && !isNext) acts.push(`<button class="primary" data-ack="${s.id}">확인</button>`);
    if (s.briefing && s.briefing.who && !isNext) acts.push(`<button data-brief="${s.id}">${Icon.svg('file', 16)} 브리핑</button>`);
    if (s.location) acts.push(`<a href="${U.tmapLink(s.location)}">${Icon.svg('nav', 16)} 길안내</a>`);
    if (!priv) acts.push(`<button data-postpone="${s.id}" ${this.sentAbout(s.id, '미뤄') ? 'disabled' : ''}>${this.sentAbout(s.id, '미뤄') ? '변경 요청 보냄' : '변경 요청'}</button>`);
    else acts.push(`<button data-delprivate="${s.id}">삭제</button>`);
    return `<article class="card ${isNext ? 'is-next' : ''} ${priv ? 'private' : ''}">
      <div class="card-top"><span class="t"><b>${s.start}</b><small>${s.end}</small></span>
        <span class="n"><strong>${priv ? Icon.svg('lock', 16) + ' ' : ''}${U.esc(s.title)}</strong><small>${[s.location ? U.esc(s.location) : '', go ? mode.label : ''].filter(Boolean).join(' · ')}</small></span>${badge}</div>
      ${route}<div class="card-actions">${acts.join('')}</div>
      ${this.openId === s.id ? `<button class="fold" data-fold>접기</button>` : ''}</article>`;
  },

  calendar() {
    let html = `<div class="list-head"><button class="link" data-view="timeline">${Icon.svg('left', 16)} 오늘 일정</button><h2>앞으로 3주</h2><span></span></div><section class="sheet">`;
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
    const list = msgs.map(m => {
      const ref = m.ref && Store.get(m.ref);
      return `<div class="msg ${m.from === 'ceo' ? 'me' : 'them'} ${m.urgent ? 'urgent' : ''}">${U.esc(m.body)}${ref && m.from !== 'ceo' ? `<button class="ref" data-goto="${U.esc(m.ref)}">${Icon.svg('calendar', 14)} 일정 보기</button>` : ''}<small>${m.urgent ? '긴급 · ' : ''}${U.hm(new Date(m.at))}</small></div>`;
    }).join('') || `<p class="muted small" style="text-align:center">${U.esc(name)}님에게 보낸 메시지가 여기에 표시돼요.</p>`;
    return `<header class="page-head"><h1>비서톡</h1><p>${U.esc(name)}</p></header>
      <div class="chat">${list}</div>
      <div class="composer"><div class="quick">${this.QUICK.map(q => `<button data-quick="${U.esc(q)}">${U.esc(q)}</button>`).join('')}</div>
      <form id="chatForm"><input name="body" placeholder="메시지 입력" autocomplete="off" aria-label="메시지"><button class="btn primary" aria-label="보내기">${Icon.svg('send', 18)}</button></form></div>`;
  },

  updateChatDot() {
    const btn = document.querySelector('#tabs button[data-tab="chat"]');
    if (!btn) return;
    btn.querySelector('.dot')?.remove();
    const unread = Store.messages().slice(this.seenMsgs).some(m => m.from !== 'ceo');
    if (unread && this.tab !== 'chat') btn.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
  },

  // ───────── 긴급 ─────────
  sos() {
    const p = this.profile();
    return `<header class="page-head"><h1>긴급</h1><p>누르면 바로 연결돼요</p></header>
      <div class="list">
        <button class="list-row danger" data-urgent><span class="ico">${Icon.svg('siren', 22)}</span><span class="t"><b>비서에게 긴급 요청</b><small>'지금 바로 연락 주세요'를 바로 보내요</small></span></button>
        <a class="list-row" href="${U.telLink(p.secretaryPhone)}"><span class="ico">${Icon.svg('phone', 22)}</span><span class="t"><b>${U.esc(p.secretaryName || '비서')}에게 전화</b><small class="num">${U.esc(p.secretaryPhone || '번호를 내 정보에서 입력하세요')}</small></span></a>
        <a class="list-row" href="${U.telLink(p.driverPhone)}"><span class="ico">${Icon.svg('car', 22)}</span><span class="t"><b>${U.esc(p.driverName || '기사님')}에게 전화</b><small class="num">${U.esc(p.driverPhone || '번호를 내 정보에서 입력하세요')}</small></span></a>
      </div>
      <p class="list-note">긴급 요청은 비서 웹 맨 위에 빨간 띠로 바로 표시돼요.</p>`;
  },

  // ───────── 내 정보 ─────────
  me() {
    const p = this.profile();
    const n = this.notifState();
    const person = (initial, name, role, phone, chat) => `<div class="person"><span class="av">${U.esc(initial)}</span>
      <span class="who"><b>${U.esc(name)} <small>${role}</small></b><span class="num">${U.esc(phone || '연락처 없음')}</span></span>
      ${phone ? `<a class="sq call" href="${U.telLink(phone)}" aria-label="${U.esc(name)}에게 전화">${Icon.svg('phone', 20)}</a>` : ''}
      ${chat ? `<button class="sq" data-tabgo="chat" aria-label="${U.esc(name)}에게 비서톡">${Icon.svg('chat', 20)}</button>` : `<a class="sq" href="sms:${String(phone || '').replace(/[^0-9+]/g, '')}" aria-label="${U.esc(name)}에게 문자">${Icon.svg('sms', 20)}</a>`}</div>`;
    const setRow = (key, label, value) => `<button class="set-row" data-edit="${key}"><span>${label}</span><span class="v">${U.esc(value)}${Icon.svg('chevron', 16)}</span></button>`;
    const notifBox = n === 'default' || n === 'denied' ? `<section class="notif-box"><b>${Icon.svg('bell', 20)} 기상 · 출발 알림이 ${n === 'denied' ? '차단돼 있어요' : '꺼져 있어요'}</b>
        <p>${n === 'denied' ? '브라우저 설정 → 사이트 설정 → 알림에서 이 사이트를 허용으로 바꿔 주세요.' : '켜 두면 기상 · 기사님 대기 · 출발 시간을 미리 알려 드려요.'}</p>
        ${n === 'default' ? '<button data-notif>알림 켜기</button>' : ''}</section>` : '';
    return `<header class="me-head"><span class="av big">${U.esc((p.name || '대').slice(0, 1))}</span>
        <span><b>${U.esc(p.name || '대표')}님</b><small>비서실과 연결됨 · ${U.esc(p.secretaryName || '비서')} · ${U.esc(p.driverName || '기사')}</small></span></header>
      <div class="me">
        ${notifBox}
        <section class="group"><h2>비서 · 기사님</h2>
          ${person((p.secretaryName || '비').slice(0, 1), p.secretaryName || '비서', '비서', p.secretaryPhone, true)}
          ${person((p.driverName || '기').slice(0, 1), p.driverName || '기사님', '기사', p.driverPhone, false)}
          <button class="set-row" data-edit="contacts"><span>연락처 고치기</span><span class="v">${Icon.svg('chevron', 16)}</span></button></section>
        <section class="group"><h2>나</h2>
          ${setRow('name', '이름', p.name || '')}
          ${setRow('prep', '아침 준비 시간', U.durLabel(p.prepMin || 60))}
          ${n === 'granted' ? setRow('notif', '기상 · 출발 알림', '켜짐') : ''}</section>
        <section class="group"><h2>구독</h2>
          <a class="set-row" href="${U.esc(Plan.payUrl())}"><span>${U.esc(Plan.NAMES[Plan.state().plan])}</span><span class="v">${U.esc(Plan.summary().split(' · ').slice(1).join(' · ') || '결제하기')}${Icon.svg('chevron', 16)}</span></a></section>
        <section class="group sizes"><h2>글자 크기</h2>
          <div class="size-pick">${Object.entries(this.SIZES).map(([k, [l]]) => `<button class="sz-${k}" data-size="${k}" aria-pressed="${this.size() === k}">${l}</button>`).join('')}</div>
          <p>일정표 · 버튼 · 비서톡 글자가 함께 커져요</p></section>
        <p class="me-foot">${Store.mode === 'demo' ? '<button data-reset>데모 데이터 처음으로</button>' : '<button data-logout>로그아웃</button>'} · <a href="privacy.html" target="_blank">개인정보 처리방침</a> · 버전 0.3</p>
      </div>`;
  },

  editProfile(key) {
    const p = this.profile();
    const f = (name, label, val, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${U.esc(val ?? '')}"></label>`;
    const body = {
      name: ['이름', f('name', '이름', p.name)],
      prep: ['아침 준비 시간', `<label>기상부터 출발까지<select name="prepMin">${this.PREP.map(m => `<option value="${m}" ${Number(p.prepMin || 60) === m ? 'selected' : ''}>${U.durLabel(m)}</option>`).join('')}</select></label>`],
      contacts: ['연락처 고치기', f('secretaryName', '비서 이름', p.secretaryName) + f('secretaryPhone', '비서 연락처', p.secretaryPhone, 'tel') + f('driverName', '기사님 이름', p.driverName) + f('driverPhone', '기사님 연락처', p.driverPhone, 'tel')],
    }[key];
    if (!body) return;
    const m = this.modal(`<h3>${body[0]}</h3><form id="pf"><div class="form-list">${body[1]}</div>
      <div class="modal-foot"><button type="button" class="btn" data-close>취소</button><button class="btn primary">저장</button></div></form>`);
    m.querySelector('#pf').addEventListener('submit', async e => {
      e.preventDefault();
      const patch = Object.fromEntries(new FormData(e.target));
      if (patch.prepMin) patch.prepMin = Number(patch.prepMin);
      try { await Store.saveProfile(patch); m.remove(); U.toast('저장했어요'); this.render(); }
      catch (err) { U.toast('저장하지 못했어요: ' + (err.message || err)); }
    });
    m.querySelector('input,select')?.focus();
  },

  // ───────── 모달 ─────────
  modal(html) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
    back.style.zoom = this.SIZES[this.size()][1];
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) back.remove(); });
    document.body.appendChild(back);
    return back;
  },

  briefing(id) {
    const s = Store.get(id); if (!s) return;
    const b = s.briefing || {};
    const row = (k, v) => v ? `<dt>${k}</dt><dd>${U.esc(v)}</dd>` : '';
    this.modal(`<div class="brief-head"><span class="ico">${Icon.svg('file', 22)}</span><div><h3>${U.esc(s.title)}</h3><p>${this.dateTitle(s.date)} ${s.start}${s.location ? ' · ' + U.esc(s.location) : ''}</p></div></div>
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

  // ───────── AI 비서 (데모: 정해진 말투만 · 서버 연결 후 실제 AI로 교체) ─────────
  openAI() {
    if (!Plan.can('ai')) {
      const m = this.modal(`<div class="ai"><div class="ai-head"><span class="ico">${Icon.svg('mic', 20)}</span><div><h3>AI 비서</h3><p>지금 요금제: ${U.esc(Plan.NAMES[Plan.state().plan])}</p></div><button class="sq" data-close aria-label="닫기">${Icon.svg('x', 18)}</button></div>
        <p style="margin:4px 0 12px;font-size:1.05em">AI 비서는 <b>'AI 비서 포함'</b> 요금제(월 ${Plan.won(Plan.PRICES.premium)})에서 쓸 수 있어요. 말로 일정을 넣고 바꾸고 미룰 수 있어요.</p>
        <a class="btn primary" style="width:100%" href="${U.esc(Plan.payUrl())}">요금제 바꾸기</a></div>`);
      return m;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const m = this.modal(`<div class="ai">
      <div class="ai-head"><span class="ico">${Icon.svg('mic', 20)}</span><div><h3>AI 비서</h3><p>말하거나 적으면 일정을 바꿔 드려요 · 데모라 정해진 말투만 알아들어요</p></div><button class="sq" data-close aria-label="닫기">${Icon.svg('x', 18)}</button></div>
      <div class="ai-log" id="aiLog"><div class="ai-msg bot">무엇을 도와드릴까요? 바꾸기 전에 꼭 한 번 여쭤볼게요.</div></div>
      <div class="ai-ex">${Assistant.EXAMPLES.map(e => `<button type="button" data-ex="${U.esc(e)}">${U.esc(e)}</button>`).join('')}</div>
      <form id="aiForm" class="ai-form">
        ${SR ? `<button type="button" class="sq mic" data-mic aria-label="말로 하기">${Icon.svg('mic', 20)}</button>` : ''}
        <input name="q" placeholder="예: 점심 30분 미뤄 줘" autocomplete="off" aria-label="AI 비서에게 말하기">
        <button class="btn primary" aria-label="보내기">${Icon.svg('send', 18)}</button>
      </form></div>`);
    m.querySelector('.modal').classList.add('ai-modal');
    const log = m.querySelector('#aiLog');
    const f = m.querySelector('#aiForm');
    const add = (cls, html) => { log.insertAdjacentHTML('beforeend', `<div class="ai-msg ${cls}">${html}</div>`); log.scrollTop = log.scrollHeight; return log.lastElementChild; };
    const ask = text => {
      if (!text.trim()) return;
      add('me', U.esc(text));
      const r = Assistant.interpret(text, { schedules: Store.list(), now: new Date(), profile: this.profile() });
      if (r.kind !== 'action') return add('bot', U.esc(r.say));
      const card = add('bot card', `<b>${U.esc(r.say)}</b><ul>${r.lines.map(l => `<li class="${l.startsWith('주의') ? 'warn' : ''}">${U.esc(l)}</li>`).join('')}</ul>
        <div class="ai-do"><button class="btn" data-no>아니요</button><button class="btn primary" data-yes>이대로 할게요</button></div>`);
      card.querySelector('[data-no]').addEventListener('click', () => { card.querySelector('.ai-do').innerHTML = '<span class="muted small">취소했어요</span>'; });
      card.querySelector('[data-yes]').addEventListener('click', async () => {
        try {
          for (const c of r.changes) await Store.upsert(c.schedule);
          if (r.notify) await Store.send(r.notify.body, { ref: r.notify.ref });
          card.querySelector('.ai-do').innerHTML = `<span class="ok">${Icon.svg('check', 15)} ${r.changes.length ? '바꿨어요. ' : ''}비서에게 알렸어요</span>`;
          if (r.draft) {
            const d = add('bot draft', `<b>상대방에게 보낼 문자 초안</b><p>${U.esc(r.draft)}</p><button class="btn" data-copy>복사</button>`);
            d.querySelector('[data-copy]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(r.draft); U.toast('복사했어요'); } catch { U.toast('복사하지 못했어요. 길게 눌러 복사해 주세요'); } });
          }
        } catch (err) { U.toast('바꾸지 못했어요: ' + (err.message || err)); }
      });
    };
    f.addEventListener('submit', e => { e.preventDefault(); const v = f.q.value; f.q.value = ''; ask(v); });
    m.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => ask(b.dataset.ex)));
    const mic = m.querySelector('[data-mic]');
    if (mic) mic.addEventListener('click', () => {
      const rec = new SR(); rec.lang = 'ko-KR'; rec.interimResults = false;
      mic.classList.add('on'); f.q.placeholder = '듣고 있어요…';
      rec.onresult = e => { const said = e.results[0][0].transcript; ask(said); };
      rec.onerror = () => U.toast('잘 못 들었어요. 다시 말씀하거나 적어 주세요');
      rec.onend = () => { mic.classList.remove('on'); f.q.placeholder = '예: 점심 30분 미뤄 줘'; };
      rec.start();
    });
    f.q.focus();
  },

  async askNotif() {
    if (this.notifState() === 'denied') return this.go('me');
    await Notification.requestPermission();
    this.render(); this.scheduleAlerts();
  },

  // ───────── 이벤트 ─────────
  bind(root) {
    const on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', e => { e.stopPropagation(); fn(el, e); }));
    const safe = fn => async (...a) => { try { await fn(...a); } catch (err) { U.toast('처리하지 못했어요: ' + (err.message || err)); } };
    on('[data-view]', el => { this.view = el.dataset.view; this.render(); });
    on('[data-today]', () => { this.day = U.today(); this.openId = null; this.render(); });
    on('[data-pick]', el => { this.day = el.dataset.pick; this.view = 'timeline'; this.openId = null; this.render(); });
    on('[data-open]', el => { this.openId = el.dataset.open; this.render(); });
    on('[data-fold]', () => { this.openId = null; this.render(); });
    on('[data-ack]', safe(async el => { await Store.ack(el.dataset.ack); U.toast('확인했어요. 비서에게 전달됐어요'); }));
    on('[data-brief]', el => this.briefing(el.dataset.brief));
    on('[data-late]', safe(async el => { const s = Store.get(el.dataset.late); await Store.send(`'${s.title}' 10분 정도 늦을 것 같아요.`, { ref: s.id }); U.toast('비서에게 보냈어요'); }));
    on('[data-postpone]', safe(async el => { const s = Store.get(el.dataset.postpone); await Store.send(`'${s.title}' (${this.dateTitle(s.date)} ${s.start}) 일정 미뤄 주세요.`, { ref: s.id }); U.toast('비서에게 요청했어요'); }));
    on('[data-adjust]', safe(async el => {
      const b = Store.get(el.dataset.adjust), a = Store.get(el.dataset.prev);
      await Store.send(`'${a.title}' 끝나고 '${b.title}'까지 이동 시간이 부족해요. 조정해 주세요.`, { ref: b.id });
      U.toast('비서에게 조정을 요청했어요');
    }));
    on('[data-addprivate]', () => this.addPrivate());
    on('[data-ai]', () => this.openAI());
    on('[data-delprivate]', safe(async el => { if (confirm('이 개인 일정을 삭제할까요?')) { await Store.remove(el.dataset.delprivate); U.toast('삭제했어요'); } }));
    on('[data-quick]', safe(async el => { await Store.send(el.dataset.quick); }));
    on('[data-goto]', el => { const s = Store.get(el.dataset.goto); if (!s) return; this.day = s.date; this.openId = s.id; this.view = 'timeline'; this.go('home'); });
    // 긴급은 한 번 누르면 바로 전송 (입력창 없이)
    on('[data-urgent]', safe(async () => { await Store.send('지금 바로 연락 주세요', { urgent: true }); U.toast('긴급 요청을 보냈어요'); }));
    on('[data-notif]', () => this.askNotif());
    on('[data-tabgo]', el => this.go(el.dataset.tabgo));
    on('[data-edit]', el => { if (el.dataset.edit === 'notif') return U.toast('알림을 끄려면 브라우저 설정에서 바꿔 주세요'); this.editProfile(el.dataset.edit); });
    on('[data-size]', el => { localStorage.setItem('CEOP_FONT', el.dataset.size); this.applySize(); this.render(); });
    on('[data-reset]', () => { if (confirm('데모 데이터를 처음 상태로 되돌릴까요?')) Store.resetDemo(); });
    on('[data-logout]', () => Store.signOut());
    const cf = root.querySelector('#chatForm');
    if (cf) cf.addEventListener('submit', safe(async e => { e.preventDefault(); const v = cf.body.value.trim(); if (v) await Store.send(v); }));
  },

  // ───────── 알림 (앱이 열려 있을 때만 — 앱이 꺼져도 울리는 알람은 안드로이드 단계에서) ─────────
  scheduleAlerts() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
    if (this.notifState() !== 'granted') return;
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
