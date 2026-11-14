/* =========================================
   CEO플래너 — 대표 앱 (모바일)
   아래 메뉴: 홈 · 비서톡 · [가운데 마이크 = AI 비서] · 긴급 · 내 정보
   홈: 인사 + 다음 일정까지 단계(기사 호출 → 출발 → 도착 → 시작) + 오늘 시간선
       시간선은 일정 사이에 이동 시간, 겹치면 그 사이에 빨간 줄 하나
   입력은 비서가 하고, 대표는 확인 · 요청 · 개인 일정만.
   ========================================= */
const App = {
  tab: 'home',
  view: 'timeline',   // 'timeline' | 'calendar'
  day: U.today(),
  openId: null,       // 사용자가 펼친 일정
  seenMsgs: 0,
  _timers: [],

  TABS: [['home', 'home', '홈'], ['chat', 'chat', '비서톡'], ['ai', 'mic', 'AI 비서'], ['sos', 'siren', '긴급'], ['me', 'user', '내 정보']],
  SIZES: { m: ['보통', 1], l: ['크게', 1.1], xl: ['아주', 1.22] },
  PREP: [30, 45, 60, 75, 90, 120],

  async start() {
    const root = document.getElementById('root');
    this.applySize();
    try { await Store.init('ceo'); }
    catch (e) { root.innerHTML = U.failBox(e); return; }
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
    nav.innerHTML = this.TABS.map(([k, ic, l]) => k === 'ai'
      ? `<button data-tab="ai" class="mic-tab" aria-label="AI 비서에게 말하기"><span class="mic">${Icon.svg('mic', 28)}</span><span>${l}</span></button>`
      : `<button data-tab="${k}">${Icon.svg(ic, 24)}<span>${l}</span></button>`).join('');
    nav.addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (!b) return; if (b.dataset.tab === 'ai') this.openAI(); else this.go(b.dataset.tab); });
    Store.on(() => { this.render(); this.scheduleAlerts(); });
    this.render();
    this.scheduleAlerts();
    setInterval(() => { if (this.tab === 'home') this.render(); }, 60000);
    this._booted = true;
    // 알림 전용 서비스워커 (화면 파일 캐시는 하지 않음) — 알림을 누르면 앱을 여는 데만 씀
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw-notify.js').catch(() => { });
    // 뒤로 가기(스와이프·안드로이드 뒤로): 다른 탭이면 홈으로, 열린 창이 있으면 닫기
    try { history.replaceState({ tab: 'home' }, ''); } catch { /* */ }
    window.addEventListener('popstate', e => {
      const open = document.querySelector('.modal-back, .voice-back');
      if (open) { open.remove(); try { history.pushState({ tab: this.tab }, ''); } catch { /* */ } return; }
      this.go((e.state && e.state.tab) || 'home', true);
    });
    if (window.AutoNav) AutoNav.init();   // 차에 타면 자동 길안내 (?go=next · ceoplanner://next)
  },

  go(tab, fromHistory) {
    if (window.AutoNav && AutoNav.closeGuide) AutoNav.closeGuide();   // 자동 길안내 가이드가 떠 있으면 닫고 이동
    if (!fromHistory && tab !== this.tab) {
      try { if (tab === 'home') history.replaceState({ tab }, ''); else if (this.tab === 'home') history.pushState({ tab }, ''); else history.replaceState({ tab }, ''); } catch { /* file: 등 */ }
    }
    this.tab = tab;
    this.render();
    window.scrollTo(0, tab === 'chat' ? document.body.scrollHeight : 0);
  },

  // 글자 크기 — 이 기기에만 저장 (보통 · 크게 · 아주, 기본 보통)
  size() { return this.SIZES[localStorage.getItem('CEOP_FONT')] ? localStorage.getItem('CEOP_FONT') : 'm'; },
  applySize() { document.getElementById('root').style.zoom = this.SIZES[this.size()][1]; },

  notifState() { return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission; },

  render() {
    document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === this.tab); b.setAttribute('aria-current', b.dataset.tab === this.tab ? 'page' : 'false'); });
    // 데모 안내 줄은 대표 앱에 표시하지 않아요 (내 정보 아래에 '데모 데이터 처음으로' · '데모 끝내기')
    const demo = '';
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

  /** '출발했어요'를 누른 시각 (기기에 저장, 일정 id별) */
  /** 실제 출발·도착 기록 (대표가 누른 것 + 기사님이 보낸 상태) — 쌓이면 이동 시간을 배워요 */
  actualOf(s) { return Learn.actual(s, Store.messages()); },
  departedAt(id) { const s = Store.get(id); return s ? this.actualOf(s).departAt || null : null; },

  /** 이 일정에 대해 대표가 이미 보낸 요청이 있는지 (조정 요청 등) */
  sentAbout(id, word) { return Store.messages().some(m => m.from === 'ceo' && m.ref === id && m.body.includes(word)); },

  // ───────── 홈 ─────────
  home() {
    return this.hero() + `<div class="body">${this.briefCard()}${this.rateCard()}${window.AutoNav && AutoNav.promoHtml ? AutoNav.promoHtml() : ''}${this.view === 'timeline' ? this.dayList() : this.calendar()}</div>`;
  },

  /** 기사님 최근 상태 한 줄 (대기 중 · 출발 · 현장 도착) + 출발했으면 도착 예상 · 늦을 것 같으면 경고 */
  driverLine(s) {
    const msgs = Store.messages();
    const st = (s.mode === 'driver' || (s.trip && s.trip.accessMode === 'driver')) ? Learn.driverStatus(s, msgs) : null;
    const name = U.esc(this.profile().driverName || '기사');
    const txt = st && { wait: '대기 중', depart: '출발했어요', arrive: '현장 도착' }[st.kind];
    const e = Learn.eta(s, msgs, Store.list());
    let html = st && (!e || st.kind !== 'depart') ? `<p class="drv-line ${st.kind}">${Icon.svg('car', 15)} ${name}님 ${txt} · ${U.hm(new Date(st.at))}</p>` : '';
    if (e) {
      html += `<p class="drv-line eta ${e.late > 0 ? 'late' : ''}">${Icon.svg('car', 15)} 출발 ${U.hm(e.depart)} · 도착 예상 <b>${U.hm(e.at)}</b>${e.learned ? `<small>${e.slotLabel || '지난 기록'} 평균 ${e.min}분</small>` : ''}</p>`;
      if (e.late > 0) {
        const sent = msgs.some(m => m.ref === s.id && /늦을 것 같아요/.test(m.body) && m.at >= e.depart.toISOString());
        html += `<div class="late-box"><span>${Icon.svg('alert', 16)} 약 <b>${e.late}분</b> 늦을 것 같아요</span>${s.visibility === 'private' ? '' : sent ? '<small>비서에게 알렸어요</small>' : `<button class="btn" data-latenote="${s.id}" data-min="${e.late}">비서에게 알리기</button>`}</div>`;
      }
    }
    return html;
  },

  /** 비서가 보낸 브리핑 — 확인 대기 일정이 남아 있으면 '모두 확인' */
  latestBrief() {
    const m = [...Store.messages()].reverse().find(x => x.from === 'secretary' && String(x.ref || '').startsWith('brief:'));
    if (!m) return null;
    const ymd = m.ref.slice(6);
    if (ymd < U.today()) return null;
    const pending = Store.byDate(ymd).filter(x => x.status !== 'cancelled' && x.visibility !== 'private' && !x.ackAt);
    return { m, ymd, pending, total: Store.byDate(ymd).filter(x => x.status !== 'cancelled').length };
  },
  briefCard() {
    const b = this.latestBrief();
    if (!b || !b.pending.length) return '';
    const rel = b.ymd === U.today() ? '오늘' : b.ymd === U.addDays(U.today(), 1) ? '내일' : this.dateTitle(b.ymd);
    return `<section class="brief-card"><div class="bc-top"><span class="ico">${Icon.svg('file', 18)}</span>
        <span class="t"><b>${rel} 브리핑이 왔어요</b><small>${U.esc(this.profile().secretaryName || '비서')} · ${U.hm(new Date(b.m.at))} · 일정 ${b.total}건 · 확인 대기 ${b.pending.length}건</small></span></div>
      <div class="bc-acts"><button class="btn" data-briefview>내용 보기</button><button class="btn primary" data-ackall="${b.ymd}">${Icon.svg('check', 16)} 모두 확인</button></div></section>`;
  },

  /** 끝난 식사 일정 평가 — 쌓이면 비서 등록 창에서 '좋았던 곳'을 추천 */
  rateTarget() {
    const now = new Date(), from = U.addDays(U.today(), -1);
    return Store.list().filter(s => s.category === 'dinner' && s.location && s.status !== 'cancelled' && s.date >= from && !(s.actual && s.actual.rating)
      && U.addMin(U.at(s.date, s.end || s.start), 0) < now).sort((a, b) => (b.date + b.end).localeCompare(a.date + a.end))[0] || null;
  },
  rateCard() {
    const s = this.rateTarget();
    if (!s) return '';
    return `<section class="rate-card"><button class="rc-x" data-rate="${s.id}" data-v="skip" aria-label="평가 건너뛰기">${Icon.svg('x', 16)}</button>
      <p><b>${U.esc(s.location)}</b> 어떠셨어요?<small>${U.esc(s.title)} · ${s.date === U.today() ? '오늘' : '어제'} ${s.start} · 다음 식사 장소 고를 때 참고해요</small></p>
      <div class="rc-acts">${Object.entries(Learn.RATING).map(([k, l]) => `<button class="btn ${k === 'good' ? 'primary' : ''}" data-rate="${s.id}" data-v="${k}">${l}</button>`).join('')}</div></section>`;
  },

  greet() { const h = new Date().getHours(); return h < 11 ? '좋은 아침이에요' : h < 18 ? '좋은 오후예요' : '오늘도 수고하셨어요'; },
  longDate(ymd) { const d = U.at(ymd, '00:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${U.WEEK[d.getDay()]}요일`; },

  /** 다음 일정까지 단계 — 기사 호출 → 출발 → 도착 → 시작 (움직이지 않는 일정은 시작 → 종료) */
  steps(s, pl) {
    const names = { driver: '기사 호출', leave: '출발', arrive: '도착', start: '시작', end: '종료' };
    const want = s.mode !== 'none' ? ['driver', 'leave', 'arrive', 'start'] : ['start', 'end'];
    const seen = new Set();
    return pl.items.filter(it => want.includes(it.kind) && !seen.has(it.kind) && seen.add(it.kind)).map(it => ({ kind: it.kind, label: names[it.kind], at: it.at }));
  },

  hero() {
    const p = this.profile();
    const now = new Date();
    const fresh = this.unreadNotices();
    const top = `<div class="hero-top"><div class="hello"><small>${this.longDate(U.today())}</small><b>${U.esc(p.name || '대표')}님, ${this.greet()}</b></div>
      <button class="hero-bell" data-bell aria-label="공지사항${fresh ? ` (새 공지 ${fresh}개)` : ''}">${Icon.svg('bell', 20)}${fresh ? '<i></i>' : ''}</button></div>`;
    const n = this.next();
    if (!n) return `<header class="hero">${top}<div class="next-card rest"><b>남은 일정이 없어요</b><span>내일 일정은 비서가 정리하면 여기에 보여요.</span></div></header>`;
    const { s, p: pl } = n;
    const priv = s.visibility === 'private';
    const steps = this.steps(s, pl);
    // 출발 시각이 지났는데 '출발했어요'를 안 눌렀으면 출발 단계에서 멈추고 알려 줌
    const departed = this.departedAt(s.id);
    const leaveIdx = steps.findIndex(st => st.kind === 'leave');
    const overdue = leaveIdx >= 0 && !departed && steps[leaveIdx].at <= now && pl.startAt > now ? U.diffMin(now, steps[leaveIdx].at) : 0;
    // 출발을 기록했으면(대표 또는 기사님) 출발 단계까지는 끝난 것으로
    let cur = overdue ? leaveIdx : steps.findIndex(st => st.at > now);   // 지금 기다리는 단계 (-1 = 모두 지남 → 진행 중)
    if (departed && leaveIdx >= 0 && cur >= 0 && cur <= leaveIdx) cur = leaveIdx + 1 < steps.length ? leaveIdx + 1 : -1;
    const target = cur >= 0 ? steps[cur] : null;
    // 출발이 기록됐으면 '도착'은 원래 계획 대신 도착 예상 시각으로 (아래 '도착 예상' 줄과 같은 숫자)
    const eta = target && target.kind === 'arrive' && departed ? Learn.eta(s, Store.messages(), Store.list()) : null;
    const left = target ? U.diffMin(eta ? eta.at : target.at, now) : 0;
    const tLabel = eta ? '도착 예상' : target && target.label;
    const pill = overdue ? `출발 ${U.durLabel(overdue)} 지남` : !target ? `${s.end}까지 진행 중` : left <= 0 && eta ? '곧 도착' : left < 60 ? `${tLabel} ${left}분 전` : `${tLabel}까지 ${U.durLabel(left)}`;
    // 내일 새벽 일정인데 기사 호출·출발이 오늘 밤이면 '오늘 밤'을 앞에
    const tonight = s.date !== U.today() && steps.some(st => U.ymd(st.at) === U.today());
    const leaveStep = steps.find(st => st.kind === 'leave');
    const headLabel = s.date === U.today() ? (pl.startAt <= now ? '지금 일정' : '다음 일정') : tonight && leaveStep ? '오늘 밤 출발 · 내일' : '내일 첫 일정';
    const mode = Backtime.MODES[s.mode] || Backtime.MODES.none;
    const sub = [s.location ? U.esc(s.location) : '', s.mode !== 'none' ? `<span class="nw">${mode.label}${s.travelMin ? ' ' + U.durLabel(s.travelMin) : ''}</span>` : ''].filter(Boolean).join(' · ');
    const fill = steps.length > 1 ? (cur < 0 ? 1 : cur / (steps.length - 1)) : 0;
    const stepHtml = `<ol class="steps" style="--n:${steps.length};--fill:${fill.toFixed(3)}">${steps.map((st, i) =>
      `<li class="${cur < 0 || i < cur ? 'done' : i === cur ? (overdue ? 'now late' : 'now') : ''}"><i>${cur < 0 || i < cur ? Icon.svg('check', 12) : ''}</i><span>${st.label}</span><b>${tonight && U.ymd(st.at) === U.today() ? '<small>오늘</small>' : ''}${U.hm(st.at)}</b></li>`).join('')}</ol>`;
    const acts = [];
    if (s.mode === 'driver' && p.driverPhone) acts.push(`<a class="na light" href="${U.telLink(p.driverPhone)}">${Icon.svg('phone', 16)} ${U.esc(p.driverName || '기사')}님</a>`);
    else if (s.briefing && s.briefing.who) acts.push(`<button class="na light" data-brief="${s.id}">${Icon.svg('file', 16)} 미팅 브리핑</button>`);
    else if (s.location && s.mode !== 'none') acts.push(`<a class="na light" href="${U.tmapLink(s.location)}">${Icon.svg('nav', 16)} 길안내</a>`);
    else if (!priv) acts.push(`<button class="na light" data-tabgo="chat">${Icon.svg('chat', 16)} 비서톡</button>`);   // 회사 안 회의: 길안내 대신
    const act = this.actualOf(s);
    const canArrive = !overdue && departed && !act.arriveAt && s.mode !== 'none' && !mode.trip && pl.startAt > now;
    if (overdue) acts.unshift(`<button class="na light" data-departed="${s.id}">${Icon.svg('check', 16)} 출발했어요</button>`);
    else if (canArrive) acts.unshift(`<button class="na light" data-arrived="${s.id}">${Icon.svg('check', 16)} 도착했어요</button>`);
    if (!priv) acts.push(`<button class="na" data-late="${s.id}">10분 늦어요</button>`);
    if (!overdue && !canArrive && s.mode === 'driver' && p.driverPhone && s.briefing && s.briefing.who) acts.push(`<button class="na" data-brief="${s.id}">${Icon.svg('file', 16)} 브리핑</button>`);
    const ack = !priv && !s.ackAt ? `<button class="next-ack" data-ack="${s.id}">${Icon.svg('check', 16)} 이 일정 확인했어요</button>` : '';
    return `<header class="hero">${top}
      <div class="next-card">
        <div class="nc-head"><div><small>${headLabel} ${s.start}</small><b>${priv ? Icon.svg('lock', 16) + ' ' : ''}${U.esc(s.title)}</b>${sub ? `<span>${sub}</span>` : ''}</div>
          <span class="pill ${overdue ? 'late' : ''}">${pill}</span></div>
        ${stepHtml}${this.driverLine(s)}
        <div class="nc-acts n${acts.length}">${acts.join('')}</div>${ack}
      </div></header>`;
  },

  dayList() {
    const isToday = this.day === U.today();
    const list = this.dayPlan(this.day);
    const warns = Backtime.conflictsOn(Store.list(), this.day);
    const now = new Date();
    const next = this.next();
    const head = `<div class="list-head">
        ${isToday ? '' : `<button class="link" data-today>${Icon.svg('left', 16)} 오늘</button>`}
        <h2>${isToday ? '오늘' : this.dateTitle(this.day)} ${list.length}건</h2>
        <button class="link" data-view="calendar">캘린더 ${Icon.svg('chevron', 16)}</button></div>`;
    const rows = list.map(({ s, p }, i) => {
      const w = warns.find(x => x.b.id === s.id);
      let gap = '';
      if (i > 0) {
        if (w) gap = this.conflictGap(w);
        else if (s.mode !== 'none' && s.travelMin) { const adj = this.adjustedTo(s.id); gap = `<span></span><div class="tl-gap move">${Icon.mode(s.mode, 14)} 이동 ${U.durLabel(s.travelMin)} · ${U.esc((Backtime.MODES[s.mode] || {}).label || '')}${adj ? ` <b class="adj">${Icon.svg('check', 12)} ${adj}${adj.slice(-2) === '00' || adj.endsWith('5') ? '로' : '으로'} 조정됨</b>` : ''}</div>`; }
        else gap = '<span></span><div class="tl-gap"></div>';
      } else if (w) gap = this.conflictGap(w);
      const past = p.endAt < now;
      const isNext = next && next.s.id === s.id;
      const item = this.openId === s.id ? this.card(s, p, isNext) : past ? this.rowPast(s) : this.row(s, isNext);
      return `${gap}<span class="tl-t ${past ? 'past' : ''} ${isNext ? 'next' : ''}">${s.start}</span>${item}`;
    }).join('');
    return head + (rows ? `<div class="tl">${rows}</div>` : '<div class="empty-day">이 날은 일정이 없어요.</div>') +
      `<button class="add-private" data-addprivate>${Icon.svg('plus', 16)} 개인 일정 추가</button>`;
  },

  /** 겹침: 두 일정 사이에 빨간 줄 하나 + 조정 요청 */
  /** 조정 요청 단계: none → asked(요청함) → seen(비서 확인 중) */
  adjustStage(id) {
    const msgs = Store.messages();
    const req = [...msgs].reverse().find(m => m.from === 'ceo' && m.ref === id && m.body.includes('조정'));
    if (!req) return 'none';
    return msgs.some(m => m.from === 'secretary' && m.ref === id && String(m.at) > String(req.at)) ? 'seen' : 'asked';
  },
  /** 비서가 미뤄서 해결된 일정 → "11:30으로 조정됨" */
  adjustedTo(id) {
    const m = [...Store.messages()].reverse().find(x => x.from === 'secretary' && x.ref === id && /미뤘어요/.test(x.body));
    const t = m && m.body.match(/시작을 (\d{1,2}:\d{2})/);
    return t && Store.get(id)?.start === t[1] ? t[1] : '';
  },

  conflictGap(w) {
    const stage = this.adjustStage(w.b.id);
    const name = this.profile().secretaryName || '비서';
    const txt = w.shortMin && !/겹/.test(w.msg) ? `이동 시간이<br>${w.shortMin}분 부족해요` : '앞 일정과<br>시간이 겹쳐요';
    const label = stage === 'seen' ? `${Icon.svg('check', 14)} ${U.esc(name)} 확인 중` : stage === 'asked' ? '조정 요청함' : '비서에게 조정';
    // 둘 다 대표 개인 일정이면 비서가 조정할 일이 아님 → 버튼 없이 안내만
    if (w.a.visibility === 'private' && w.b.visibility === 'private') return `<span></span><div class="tl-gap conflict" role="note"><i class="bar"></i><div class="cg"><span>${txt}</span><small class="muted">개인 일정끼리라 비서에겐 안 보여요</small></div></div>`;
    return `<span></span><div class="tl-gap conflict" role="note"><i class="bar"></i><div class="cg"><span title="${U.esc(w.msg)}">${txt}</span>
      <button class="${stage === 'seen' ? 'sent' : stage === 'asked' ? 'asked' : ''}" data-adjust="${w.b.id}" data-prev="${w.a.id}" ${stage !== 'none' ? 'disabled' : ''}>${label}</button></div></div>`;
  },

  rowPast(s) {
    return `<div class="tl-item past"><span class="n">${U.esc(s.title)}</span><span class="done">끝남</span></div>`;
  },

  row(s, isNext) {
    const priv = s.visibility === 'private';
    if (priv) return `<div class="tl-item private" data-open="${s.id}"><span class="n">${Icon.svg('lock', 14)} ${U.esc(s.title)}</span><span class="tag">비서에겐 '바쁨'</span></div>`;
    const bits = [s.location ? U.esc(s.location) : '', s.end ? `${s.end}까지` : '', s.briefing && s.briefing.who ? '브리핑 있음' : ''].filter(Boolean).join(' · ');
    return `<div class="tl-item ${isNext ? 'is-next' : ''}" data-open="${s.id}"><span class="n">${U.esc(s.title)}<small>${s.ackAt ? '' : '<em>확인 대기</em>' + (bits ? ' · ' : '')}${bits}</small></span>
      ${s.ackAt ? `<span class="ok" aria-label="확인함">${Icon.svg('check', 16)}</span>` : `<button class="mini" data-ack="${s.id}">확인</button>`}</div>`;
  },

  card(s, p, isNext) {
    const priv = s.visibility === 'private';
    const mode = Backtime.MODES[s.mode] || Backtime.MODES.none;
    const go = s.mode !== 'none';
    const now = new Date();
    const steps = go ? p.items.filter(it => !['start', 'end'].includes(it.kind)) : [];
    const route = steps.length ? `<ol class="route">${steps.map(it =>
      `<li class="${it.kind} ${it.at < now ? 'done' : ''}"><b>${U.hm(it.at)}</b><span>${U.esc(it.title)}${it.detail ? ` <small>${U.esc(it.detail)}</small>` : ''}</span></li>`).join('')}</ol>` : '';
    const badge = priv ? `<span class="tag">비서에겐 '바쁨'</span>` : s.ackAt ? '<span class="badge ok">확인함</span>' : '<span class="badge warn">확인 대기</span>';
    const acts = [];
    if (!priv && !s.ackAt) acts.push(`<button class="primary" data-ack="${s.id}">확인</button>`);
    if (s.briefing && s.briefing.who) acts.push(`<button data-brief="${s.id}">${Icon.svg('file', 16)} 브리핑</button>`);
    if (s.location && go) acts.push(`<a href="${U.tmapLink(s.location)}">${Icon.svg('nav', 16)} 길안내</a>`);
    if (!priv) acts.push(`<button data-postpone="${s.id}" ${this.sentAbout(s.id, '미뤄') ? 'disabled' : ''}>${this.sentAbout(s.id, '미뤄') ? '변경 요청 보냄' : '변경 요청'}</button>`);
    else acts.push(`<button data-delprivate="${s.id}">삭제</button>`);
    return `<article class="card ${isNext ? 'is-next' : ''} ${priv ? 'private' : ''}">
      <div class="card-top"><span class="n"><strong>${priv ? Icon.svg('lock', 16) + ' ' : ''}${U.esc(s.title)}</strong><small>${[`${s.start}–${s.end}`, s.location ? U.esc(s.location) : '', go ? mode.label : ''].filter(Boolean).join(' · ')}</small></span>${badge}</div>
      ${route}<div class="card-actions">${acts.join('')}</div>
      <button class="fold" data-fold>접기</button></article>`;
  },

  calendar() {
    let html = `<div class="list-head"><button class="link" data-view="timeline">${Icon.svg('left', 16)} 오늘 일정</button><h2>앞으로 3주</h2><span></span></div><section class="sheet">`;
    for (let i = 0; i < 21; i++) {
      const ymd = U.addDays(U.today(), i);
      const d = U.at(ymd, '00:00');
      const list = Store.byDate(ymd).filter(s => s.status !== 'cancelled');
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
    const ps = Plan.state();
    const person = (initial, name, role, phone, chat) => `<div class="person"><span class="av">${U.esc(initial)}</span>
      <span class="who"><b>${U.esc(name)}</b><span>${role} · ${U.esc(phone || '연락처 없음')}</span></span>
      ${phone ? `<a class="sq call" href="${U.telLink(phone)}" aria-label="${U.esc(name)}에게 전화">${Icon.svg('phone', 18)}</a>` : ''}
      ${chat ? `<button class="sq" data-tabgo="chat" aria-label="${U.esc(name)}에게 비서톡">${Icon.svg('chat', 18)}</button>` : `<a class="sq" href="sms:${String(phone || '').replace(/[^0-9+]/g, '')}" aria-label="${U.esc(name)}에게 문자">${Icon.svg('sms', 18)}</a>`}</div>`;
    const row = (attrs, label, value, sub) => `<button class="set-row" ${attrs}><span class="l">${label}${sub ? `<small>${sub}</small>` : ''}</span><span class="v">${U.esc(value)}${Icon.svg('chevron', 16)}</span></button>`;
    const notifRow = n === 'unsupported' ? '' : n === 'granted'
      ? `<div class="set-row static"><span class="l">기상 · 출발 알림<small>미리 깨워 드려요</small></span><span class="switch on" aria-hidden="true"></span></div>`
      : `<button class="set-row" data-notif><span class="l">기상 · 출발 알림<small class="warn">${n === 'denied' ? '차단돼 있어요 — 눌러서 방법 보기' : '꺼져 있어요 — 켜 두면 미리 깨워 드려요'}</small></span><span class="switch" aria-hidden="true"></span></button>`;
    const sizes = `<div class="set-row static"><span class="l">글자 크기</span><span class="seg-mini" role="group" aria-label="글자 크기">${Object.entries(this.SIZES).map(([k, [l]]) => `<button class="sz-${k}" data-size="${k}" aria-pressed="${this.size() === k}">${l}</button>`).join('')}</span></div>`;
    return `<header class="page-head"><h1>내 정보</h1></header>
      <div class="me">
        <div class="me-card"><span class="av big">${U.esc((p.name || '대').slice(0, 1))}</span>
          <span class="who"><b>${U.esc(p.name || '대표')}</b><small>${Store.myLogin ? '아이디 ' + U.esc(Store.myLogin) : '비서실과 연결됨'}</small></span>
          <span class="plan-badge ${ps.plan}">${U.esc(Plan.NAMES[ps.plan])}</span></div>
        <section class="group"><h2>함께 일하는 사람</h2><div class="box">
          ${person((p.secretaryName || '비').slice(0, 1), p.secretaryName || '비서', '비서', p.secretaryPhone, true)}
          ${person((p.driverName || '기').slice(0, 1), p.driverName || '기사님', '기사', p.driverPhone, false)}
          ${row('data-edit="contacts"', '연락처 고치기', '')}</div></section>
        <section class="group"><h2>알림 · 화면</h2><div class="box">
          ${notifRow}
          ${row('data-edit="prep"', '아침 준비 시간', U.durLabel(p.prepMin || 60))}
          ${row('data-autonav', '차에 타면 자동 길안내', '', '차와 연결되면 다음 일정 장소로 내비가 켜져요')}
          ${row('data-edit="name"', '이름', p.name || '')}
          ${sizes}</div></section>
        <section class="group"><h2>구독</h2><div class="box">
          <a class="set-row" href="${U.esc(Plan.payUrl())}"><span class="l">${U.esc(Plan.NAMES[ps.plan])}<small>${U.esc(Plan.summary())}${Plan.payNote() ? '<br>' + U.esc(Plan.payNote()) : ''}</small></span><span class="v strong">${ps.plan === 'trial' || ps.plan === 'expired' ? '결제' : '연장'}${Icon.svg('chevron', 16)}</span></a></div></section>
        <p class="me-foot">${Store.mode === 'demo' ? `<button data-reset>데모 데이터 처음으로</button>${Store.forcedDemo ? ' · <button data-exitdemo>데모 끝내기</button>' : ''}` : '<button data-logout>로그아웃</button>'} · <a href="privacy.html" target="_blank">개인정보 처리방침</a> · 버전 0.4</p>
      </div>`;
  },

  editProfile(key) {
    const p = this.profile();
    const f = (name, label, val, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${U.esc(val ?? '')}"></label>`;
    const body = {
      name: ['이름', f('name', '이름', p.name)],
      prep: ['아침 준비 시간', `<label>기상부터 출발까지<select name="prepMin">${this.PREP.map(m => `<option value="${m}" ${Number(p.prepMin || 60) === m ? 'selected' : ''}>${U.durLabel(m)}</option>`).join('')}</select></label>`],
      contacts: ['연락처 고치기', f('ceoPhone', '내 휴대폰 (비서 웹 긴급 전화용)', p.ceoPhone, 'tel') + f('secretaryName', '비서 이름', p.secretaryName) + f('secretaryPhone', '비서 연락처', p.secretaryPhone, 'tel') + f('driverName', '기사님 이름', p.driverName) + f('driverPhone', '기사님 연락처', p.driverPhone, 'tel')],
    }[key];
    if (!body) return;
    const m = this.modal(`<h3>${body[0]}</h3><form id="pf"><div class="form-list">${body[1]}</div>
      <div class="modal-foot"><button type="button" class="btn" data-close>취소</button><button class="btn primary">저장</button></div></form>`);
    m.querySelector('#pf').addEventListener('submit', async e => {
      e.preventDefault();
      const patch = Object.fromEntries(new FormData(e.target));
      if (patch.prepMin) patch.prepMin = Number(patch.prepMin);
      if ('name' in patch && !String(patch.name).trim()) return U.toast('이름을 넣어 주세요');
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

  // ───────── 공지사항 (오른쪽 위 종) ─────────
  /** 아직 안 본 공지 수 — 마지막으로 연 시각보다 새 공지 */
  noticeSeen() {
    let seen = ''; try { seen = localStorage.getItem('CEOP_NOTICE_SEEN') || ''; } catch { /* */ }
    const acc = this.profile().noticeSeenAt || '';
    return acc > seen ? acc : seen;
  },
  unreadNotices() {
    const seen = this.noticeSeen();
    return Store.notices().filter(n => n.at > seen).length;
  },
  openNotices() {
    const list = Store.notices();
    const seen = this.noticeSeen();
    const d = iso => { const t = new Date(iso); return `${t.getFullYear()}.${t.getMonth() + 1}.${t.getDate()}`; };
    this.modal(`<div class="notices">
      <div class="sheet-head"><h3>공지사항</h3><button class="sq" data-close aria-label="닫기">${Icon.svg('x', 18)}</button></div>
      ${list.length ? `<ul class="notice-list">${list.map((n, i) => `<li>
        <details ${i === 0 ? 'open' : ''}><summary><span class="t">${n.pinned ? '<em>고정</em>' : ''}${n.at > seen ? '<i class="new">새 글</i>' : ''}<b>${U.esc(n.title)}</b></span><small>${d(n.at)}</small></summary>
        <p>${U.esc(n.body).replace(/\n/g, '<br>')}</p></details></li>`).join('')}</ul>`
        : '<p class="muted" style="padding:20px 0;text-align:center">아직 공지사항이 없어요.</p>'}
    </div>`);
    const latest = list.reduce((m, n) => n.at > m ? n.at : m, '');
    try { if (latest) localStorage.setItem('CEOP_NOTICE_SEEN', latest); } catch { /* */ }
    if (latest && latest > (this.profile().noticeSeenAt || '')) Store.saveProfile({ noticeSeenAt: latest }).catch(() => {});
    this.render();
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
      if (f.end.value < f.start.value && !confirm(`끝나는 시간이 시작보다 빨라요.\n다음 날 ${f.end.value}에 끝나는 일정으로 저장할까요?`)) return;
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
        <p style="margin:4px 0 12px;font-size:1.05em">AI 비서는 <b>'AI 비서 포함'</b> 요금제(월 ${Plan.won(Plan.PRICES.premium)}, VAT 별도)에서 쓸 수 있어요. 말로 일정을 넣고 바꾸고 미룰 수 있어요.</p>
        <a class="btn primary" style="width:100%" href="${U.esc(Plan.payUrl())}">요금제 바꾸기</a></div>`);
      return m;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const back = document.createElement('div');
    back.className = 'voice-back';
    back.innerHTML = `<div class="voice" role="dialog" aria-label="AI 비서">
      <div class="v-head"><span class="v-state"><i></i><span id="vState">${SR ? '듣고 있어요' : '적어 주시면 일정을 바꿔 드려요'}</span></span>
        <button class="v-close" data-close aria-label="닫기">${Icon.svg('x', 20)}</button></div>
      <div class="v-log" id="aiLog"><p class="v-bot">무엇을 도와드릴까요? 바꾸기 전에 꼭 한 번 여쭤볼게요.${Store.mode === 'demo' ? '<br><small>데모라 정해진 말투만 알아들어요</small>' : ''}</p></div>
      <div class="v-bottom">
        <div class="v-ex">${Assistant.EXAMPLES.map(e => `<button type="button" data-ex="${U.esc(e)}">${U.esc(e)}</button>`).join('')}</div>
        <form id="aiForm" class="v-type" ${SR ? 'hidden' : ''}><input name="q" placeholder="예: 점심 30분 미뤄 줘" autocomplete="off" aria-label="AI 비서에게 적기"><button aria-label="보내기">${Icon.svg('send', 18)}</button></form>
        ${SR ? `<button type="button" class="v-mic" data-mic aria-label="말하기">${Icon.svg('mic', 34)}</button>
        <p class="v-hint">말이 끝나면 저절로 멈춰요 · <button type="button" data-typing>글로 쓰기</button></p>` : ''}
      </div></div>`;
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) { try { rec && rec.abort(); } catch { /* */ } back.remove(); } });
    document.body.appendChild(back);
    const log = back.querySelector('#aiLog');
    const f = back.querySelector('#aiForm');
    const state = back.querySelector('#vState');
    const add = (cls, html) => { log.insertAdjacentHTML('beforeend', `<div class="${cls}">${html}</div>`); log.scrollTop = log.scrollHeight; return log.lastElementChild; };
    const ask = text => {
      if (!text.trim()) return;
      add('v-said', `“${U.esc(text)}”`);
      const r = Assistant.interpret(text, { schedules: Store.list(), now: new Date(), profile: this.profile() });
      if (r.kind !== 'action') return add('v-bot', U.esc(r.say));
      const op = (r.changes[0] || {}).op;
      const yes = !r.changes.length ? '비서에게 보내기' : op === 'cancel' ? '취소하기' : r.changes[0].schedule && !Store.get(r.changes[0].schedule.id) ? '등록하기' : '이대로 바꾸기';
      const card = add('v-card', `<span class="k">확인해 주세요</span><b>${U.esc(r.say)}</b><ul>${r.lines.map(l => `<li class="${l.startsWith('주의') ? 'warn' : ''}">${U.esc(l)}</li>`).join('')}</ul>
        ${r.choices && r.choices.length ? `<div class="ai-pick"><span class="lbl">대표님이 좋았다고 한 곳</span>${r.choices.map((c, i) => `<button type="button" data-pick="${i}"><b>${U.esc(c.location)}</b><small>${U.esc(c.sub)}</small></button>`).join('')}</div>` : ''}
        <div class="ai-do"><button class="btn" data-no>${op === 'cancel' ? '그대로 두기' : '취소'}</button><button class="btn primary" data-yes>${yes}</button></div>`);
      card.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
        const c = r.choices[b.dataset.pick], s = r.changes[0].schedule, on = !b.classList.contains('on');
        card.querySelectorAll('[data-pick]').forEach(x => x.classList.remove('on'));
        if (on) {
          b.classList.add('on');
          const t = Learn.travel(Store.list(), Store.messages(), { origin: s.origin, location: c.location, at: U.addMin(U.at(s.date, s.start), -40) });
          Object.assign(s, { location: c.location, mode: 'driver', travelMin: t ? t.avg : 30 });
        } else Object.assign(s, { location: '', mode: 'none', travelMin: 0 });
      }));
      card.querySelector('[data-no]').addEventListener('click', () => { card.querySelector('.ai-do').innerHTML = '<span class="muted small">취소했어요</span>'; });
      card.querySelector('[data-yes]').addEventListener('click', async () => {
        try {
          for (const c of r.changes) await Store.upsert(c.schedule);
          if (r.notify) await Store.send(r.notify.body, { ref: r.notify.ref });
          card.querySelector('.ai-do').innerHTML = `<span class="ok">${Icon.svg('check', 15)} ${r.changes.length ? '바꿨어요' : ''}${r.notify ? (r.changes.length ? '. ' : '') + '비서에게 알렸어요' : ''}</span>`;
          if (r.draft) {
            const d = add('v-card draft', `<span class="k">상대방에게 보낼 문자 초안</span><p>${U.esc(r.draft)}</p><button class="btn" data-copy>복사</button>`);
            d.querySelector('[data-copy]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(r.draft); U.toast('복사했어요'); } catch { U.toast('복사하지 못했어요. 길게 눌러 복사해 주세요'); } });
          }
        } catch (err) { U.toast('바꾸지 못했어요: ' + (err.message || err)); }
      });
    };
    f.addEventListener('submit', e => { e.preventDefault(); const v = f.q.value; f.q.value = ''; ask(v); });
    back.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => ask(b.dataset.ex)));
    back.querySelector('[data-typing]')?.addEventListener('click', () => { f.hidden = false; f.q.focus(); });
    const mic = back.querySelector('[data-mic]');
    let rec = null;
    const listen = () => {
      try {
        rec = new SR(); rec.lang = 'ko-KR'; rec.interimResults = false;
        mic.classList.add('on'); state.textContent = '듣고 있어요';
        rec.onresult = e => ask(e.results[0][0].transcript);
        rec.onerror = e => {
          // 마이크 권한이 없거나 쓸 수 없으면 바로 글로 쓰기로 (열자마자 '잘 못 들었어요'가 뜨지 않게)
          if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(e && e.error)) {
            state.textContent = '마이크를 쓸 수 없어요 · 아래에 글로 적어 주세요'; f.hidden = false; mic.hidden = true;
            const h = back.querySelector('.v-hint'); if (h) h.hidden = true;
            return;
          }
          state.textContent = e && e.error === 'no-speech' ? '말씀이 들리지 않았어요. 마이크를 눌러 다시 말씀해 주세요' : '잘 못 들었어요. 마이크를 눌러 다시 말씀해 주세요';
        };
        rec.onend = () => { mic.classList.remove('on'); if (state.textContent === '듣고 있어요') state.textContent = '마이크를 눌러 말씀해 주세요'; };
        rec.start();
      } catch { state.textContent = '마이크를 쓸 수 없어요. 글로 적어 주세요'; f.hidden = false; }
    };
    if (mic) { mic.addEventListener('click', listen); listen(); }
    else f.q.focus();
  },

  async ackAll(ymd) {
    const ids = Store.byDate(ymd).filter(x => x.status !== 'cancelled' && x.visibility !== 'private' && !x.ackAt).map(x => x.id);
    if (!ids.length) return;
    try {
      await Store.ackMany(ids);
      const rel = ymd === U.today() ? '오늘' : ymd === U.addDays(U.today(), 1) ? '내일' : this.dateTitle(ymd);
      await Store.send(`${rel} 일정 ${ids.length}건 모두 확인했어요.`, { ref: 'brief:' + ymd });
      U.toast(`${ids.length}건 모두 확인했어요. 비서에게 전달됐어요`);
    } catch (err) { U.toast('확인하지 못했어요: ' + (err.message || err)); }
  },

  /** 알림 띄우기: 알림 전용 서비스워커가 있으면 그것으로(안드로이드·아이폰 홈 화면 앱은 이 방법만 됨). nav면 누르면 ?go=next → 바로 길안내 */
  async notify(title, body, nav, tag) {
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg && reg.showNotification) {
        return await reg.showNotification(title, { body, icon: new URL('icon.svg', reg.scope).href, ...(tag ? { tag } : {}),
          data: { url: new URL(nav ? './?go=next' : './', reg.scope).href } });
      }
      const n = new Notification(title, { body });
      if (nav) n.onclick = () => { try { window.focus(); n.close(); } catch (e) { /* */ } if (typeof AutoNav !== 'undefined') AutoNav.start(); };
    } catch (e) { /* 알림을 못 띄워도 앱은 그대로 */ }
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
    on('[data-departed]', safe(async el => { await Store.setActual(el.dataset.departed, { departAt: new Date().toISOString() }); U.toast('출발을 기록했어요'); }));
    on('[data-arrived]', safe(async el => { await Store.setActual(el.dataset.arrived, { arriveAt: new Date().toISOString() }); U.toast('도착을 기록했어요'); }));
    on('[data-rate]', safe(async el => { await Store.setActual(el.dataset.rate, { rating: el.dataset.v, ratedAt: new Date().toISOString() }); if (el.dataset.v !== 'skip') U.toast('기억해 둘게요'); }));
    on('[data-briefview]', () => { const b = this.latestBrief(); if (b) this.modal(`<h3>${U.esc(this.profile().secretaryName || '비서')} 브리핑</h3><p class="brief-text">${U.esc(b.m.body).replace(/\n/g, '<br>')}</p><div class="modal-foot"><button class="btn" data-close>닫기</button><button class="btn primary" data-close data-ackall="${b.ymd}">모두 확인</button></div>`).querySelector('[data-ackall]').addEventListener('click', () => this.ackAll(b.ymd)); });
    on('[data-ackall]', safe(async el => this.ackAll(el.dataset.ackall)));
    on('[data-latenote]', safe(async el => {
      const s = Store.get(el.dataset.latenote); if (!s) return;
      const e = Learn.eta(s, Store.messages(), Store.list());
      await Store.send(`'${s.title}'에 약 ${el.dataset.min}분 늦을 것 같아요 (출발 ${e ? U.hm(e.depart) : ''} · 도착 예상 ${e ? U.hm(e.at) : ''}). 상대방께 전달 부탁해요.`, { ref: s.id });
      U.toast('비서에게 알렸어요. 상대방 연락은 비서가 해요');
    }));
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
    on('[data-bell]', () => this.openNotices());
    on('[data-exitdemo]', () => Store.exitDemo());
    on('[data-tabgo]', el => this.go(el.dataset.tabgo));
    on('[data-autonav]', () => AutoNav.openGuide());
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
        const nav = it.kind === 'leave' && s.mode !== 'driver';   // 직접 운전·택시 등 출발 알림 → 누르면 바로 길안내
        if (ms > 0 && ms < 12 * 3600e3) this._timers.push(setTimeout(() => this.notify(it.title, `${s.title} · ${s.start}${nav ? '\n눌러서 바로 길안내' : ''}`, nav, nav ? 'next-' + s.id : ''), ms));
        // 출발 1시간 전 '다음 일정' 알림: 알림 목록에 남겨 두면 차에 타서 눌러 바로 길안내
        const ms1 = ms - 3600e3;
        if (nav && ms1 > 0 && ms1 < 12 * 3600e3) this._timers.push(setTimeout(() => this.notify(`🚗 다음 일정 · ${U.hm(it.at)} 출발`, `${s.title}${s.location ? ' · ' + s.location : ''}\n차에 타면 눌러서 바로 길안내`, true, 'next-' + s.id), ms1));
      });
    }));
    // 밤 9시까지 내일 브리핑을 확인하지 않았으면 한 번 알려 줌 (하루 한 번)
    const nine = U.at(U.today(), '21:00').getTime() - now;
    if (nine > 0) this._timers.push(setTimeout(() => {
      const b = this.latestBrief(), key = 'CEOP_BRIEF_NOTIFIED';
      if (!b || b.ymd !== U.addDays(U.today(), 1) || !b.pending.length || localStorage.getItem(key) === b.ymd) return;
      localStorage.setItem(key, b.ymd);
      this.notify('내일 일정 확인', `확인 대기 ${b.pending.length}건 — 앱에서 '모두 확인'을 눌러 주세요`, false, 'brief');
    }, nine));
  },
};

App.start();
