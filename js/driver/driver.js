/* =========================================
   CEO플래너 — 기사님 배차표 (배차 문자 속 링크로 열어요)
   - 오늘 · 내일 기사 차량 일정만 (대표 개인 일정 · 브리핑은 안 보임)
   - 단계 버튼: 출발지 도착·대기 중 → 대표님 탑승·출발 → 현장 도착
     누를 때마다 대표 앱 · 비서 웹에 바로 표시되고, 실제 이동 시간 학습에 쓰여요
   ========================================= */
const Drv = {
  day: U.today(),
  STEPS: [
    { kind: 'wait', btn: '출발지 도착 · 대기 중', done: '대기 중' },
    { kind: 'depart', btn: '대표님 탑승 · 출발', done: '출발' },
    { kind: 'arrive', btn: '현장 도착', done: '현장 도착' },
  ],

  async start() {
    const root = document.getElementById('root');
    try { await Store.init('driver'); }
    catch (err) { root.innerHTML = `<div class="drv-empty"><p>연결하지 못했어요: ${U.esc(err.message || err)}</p></div>`; return; }
    if (Store.needsLogin) return Login.renderId(root, '기사님 로그인', () => this.start());
    Store.on(() => this.render());
    this.render();
    // 비서가 일정을 바꾸면 반영 (기사님은 실시간 구독 대신 1분마다 다시 받기)
    setInterval(async () => { try { if (Store.mode === 'supabase') await Store._reload(); } catch { /* 다음에 다시 */ } this.render(); }, 60000);
  },

  /** 기사님이 누른 단계 (이 폰에 저장 — 기사님은 메시지 읽기 권한이 없어요) */
  state(id) { try { return (JSON.parse(localStorage.getItem('CEOP_DRV') || '{}'))[id] || {}; } catch { return {}; } },
  saveState(id, kind) {
    try { const m = JSON.parse(localStorage.getItem('CEOP_DRV') || '{}'); m[id] = { ...(m[id] || {}), [kind]: new Date().toISOString() }; localStorage.setItem('CEOP_DRV', JSON.stringify(m)); } catch { /* */ }
  },

  /** 대기 장소: 출발지 칸이 비면 그날 바로 앞 일정 장소 (없으면 본사) */
  waitPlace(s) {
    if (s.origin) return s.origin;
    const prev = Store.list().filter(x => x.date === s.date && x.id !== s.id && x.location && !x.masked && x.status !== 'cancelled' && (x.end || x.start) <= s.start)
      .sort((a, b) => (a.end || a.start).localeCompare(b.end || b.start)).pop();
    return prev ? prev.location : '본사';
  },

  jobs(ymd) {
    const p = Store.profile();
    const list = Store.list().filter(s => s.date === ymd && s.status !== 'cancelled' && s.visibility !== 'private' && !s.masked
      && (s.mode === 'driver' || (s.trip && s.trip.accessMode === 'driver')));
    return Backtime.planDay(list, { prepMin: p.prepMin });
  },

  render() {
    const root = document.getElementById('root');
    const p = Store.profile();
    const t = U.today(), t1 = U.addDays(t, 1);
    const now = new Date();
    const jobs = this.jobs(this.day);
    const tab = (ymd, label) => `<button class="${this.day === ymd ? 'on' : ''}" data-day="${ymd}">${label} <small>${this.jobs(ymd).length}건</small></button>`;
    root.innerHTML = `
      <header class="drv-head"><div><small>${U.dateLabel(this.day)}</small><h1>${U.esc(p.driverName || '기사')}님 배차표</h1></div>
        ${p.secretaryPhone ? `<a class="drv-call" href="${U.telLink(p.secretaryPhone)}">${Icon.svg('phone', 18)} ${U.esc(p.secretaryName || '비서')}</a>` : ''}</header>
      <nav class="drv-tabs">${tab(t, '오늘')}${tab(t1, '내일')}</nav>
      <main class="drv-list">${jobs.length ? jobs.map(({ s, p: pl }) => this.card(s, pl, now)).join('') : '<div class="drv-empty"><p>이 날은 배차가 없어요.</p></div>'}</main>
      <p class="drv-foot">${Store.mode === 'demo' ? '데모 화면이에요 · ' : ''}누른 상태는 대표님과 비서실에 바로 전달돼요</p>`;
    root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { this.day = b.dataset.day; this.render(); }));
    root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => this.step(b.dataset.id, b.dataset.step)));
  },

  card(s, pl, now) {
    const st = this.state(s.id);
    const nextIdx = this.STEPS.findIndex(x => !st[x.kind]);
    const trip = Backtime.isTrip(s.mode);
    const dest = trip ? (s.trip && s.trip.station) || '역 · 공항' : s.location || '현장';
    const callAt = pl.driverCallAt || pl.leaveAt;
    const soon = U.diffMin(callAt, now);
    const past = pl.endAt < now;
    const late = !past && soon < -5 && !st.wait && !st.depart;
    const timeline = this.STEPS.map((x, i) => `<li class="${st[x.kind] ? 'done' : i === nextIdx ? 'now' : ''}"><i>${st[x.kind] ? Icon.svg('check', 12) : ''}</i><span>${x.done}</span><b>${st[x.kind] ? U.hm(new Date(st[x.kind])) : ''}</b></li>`).join('');
    const next = nextIdx >= 0 && !past ? this.STEPS[nextIdx] : null;
    return `<article class="drv-card ${past ? 'past' : ''}">
      <div class="dc-top"><div class="dc-call"><small>대기 시각</small><b class="num">${U.hm(callAt)}</b></div>
        <span class="dc-pill ${late ? 'late' : soon <= 30 && soon > -30 && !st.depart ? 'soon' : ''}">${past ? '끝남' : late ? `대기 ${U.durLabel(-soon)} 지남` : soon > 0 ? (soon < 60 ? `${soon}분 뒤` : `${U.durLabel(soon)} 뒤`) : st.depart ? '운행 중' : '대기 시간'}</span></div>
      <dl class="dc-route">
        <dt>대기 장소</dt><dd>${U.esc(this.waitPlace(s))}</dd>
        <dt>출발</dt><dd class="num">${U.hm(pl.leaveAt)}</dd>
        <dt>${trip ? '역 · 공항' : '도착 목표'}</dt><dd><b>${U.esc(dest)}</b> <span class="num">${trip ? (s.trip && s.trip.departTime ? `${s.trip.departTime} 출발편` : '') : U.hm(pl.arriveBy)}</span></dd>
        <dt>일정</dt><dd>${s.start} ${U.esc(s.title)}</dd>
      </dl>
      <ol class="dc-steps">${timeline}</ol>
      <div class="dc-acts">${next ? `<button class="btn primary big" data-step="${next.kind}" data-id="${s.id}">${next.btn}</button>` : `<p class="dc-done">${past ? '' : Icon.svg('checkCircle', 18) + ' 현장 도착을 알렸어요'}</p>`}
        <a class="btn" href="${U.tmapLink(st.wait || st.depart ? dest : this.waitPlace(s))}">${Icon.svg('nav', 16)} 길안내</a></div>
    </article>`;
  },

  async step(id, kind) {
    const s = Store.get(id); if (!s) return;
    const name = Store.profile().driverName || '기사';
    const body = {
      wait: `${name}님: 출발지(${this.waitPlace(s)}) 도착, 대기 중이에요 · '${s.title}'`,
      depart: `${name}님: 대표님 탑승, 출발했어요 · '${s.title}' ${s.trip ? (s.trip.station || '역') : (s.location || '현장')}으로`,
      arrive: `${name}님: 현장 도착했어요 · '${s.title}'`,
    }[kind];
    try {
      await Store.send(body, { ref: id });
      this.saveState(id, kind);
      U.toast({ wait: '대기 중이라고 알렸어요', depart: '출발을 알렸어요', arrive: '도착을 알렸어요' }[kind]);
      this.render();
    } catch (err) { U.toast('보내지 못했어요. 인터넷을 확인하고 다시 눌러 주세요'); }
  },
};

Drv.start();
