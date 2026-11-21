/* =========================================
   CEO플래너 — 기사님 배차표 (배차 문자 속 링크로 열어요)
   - 오늘 · 내일 기사 차량 일정만 (대표 개인 일정 · 브리핑은 안 보임)
   - 단계 버튼: 출발지 도착·대기 중 → 대표님 탑승·출발 → 현장 도착
     누를 때마다 대표 앱 · 비서 웹에 바로 표시되고, 실제 이동 시간 학습에 쓰여요
   ========================================= */
const Drv = {
  day: U.today(),
  STEPS: [
    { kind: 'wait', btn: '출발지 도착 · 대기 중', done: '대기' },
    { kind: 'depart', btn: '대표님 탑승 · 출발', done: '출발' },
    { kind: 'arrive', btn: '현장 도착', done: '현장 도착' },
  ],

  async start() {
    const root = document.getElementById('root');
    try { await Store.init('driver'); }
    catch (err) { root.innerHTML = U.failBox(err); return; }
    if (Store.needsLogin) return Login.renderId(root, '기사님 로그인', () => this.start());
    Store.on(() => this.render());
    this.render();
    // 비서가 일정을 바꾸면 반영 (기사님은 실시간 구독 대신 1분마다 다시 받기)
    setInterval(async () => { try { if (Store.mode === 'supabase') await Store._reload(); } catch { /* 다음에 다시 */ } this.render(); }, 60000);
  },

  /** 기사님이 누른 단계 (이 폰에 저장 — 기사님은 메시지 읽기 권한이 없어요) */
  state(id) { try { return (JSON.parse(localStorage.getItem('CEOP_DRV') || '{}'))[id] || {}; } catch { return {}; } },
  saveState(id, kind, extra = {}) {
    try { const m = JSON.parse(localStorage.getItem('CEOP_DRV') || '{}'); m[id] = { ...(m[id] || {}), [kind]: new Date().toISOString(), ...extra }; localStorage.setItem('CEOP_DRV', JSON.stringify(m)); } catch { /* */ }
  },
  /** 대기 중이라고 알린 뒤 비서가 대기 장소를 바꿨는지 (출발 전만) → 그 장소 '대기'를 다시 누르게 */
  moved(s, st) { return !!(st.wait && !st.depart && st.waitAt && st.waitAt !== this.waitFull(s)); },

  /** 대기 장소: 출발지 칸이 비면 그날 바로 앞 일정 장소 (없으면 본사).
      '본사 15층 대회의실'처럼 층 · 회의실까지 적혀 있어도 기사님께는 건물 이름만 ('본사') */
  waitPlace(s) { return U.building(this.waitFull(s)); },
  /** 원래 적힌 대기 장소 전체 ('S타워 B2층 주차장') — 화면에 작게 같이 보여 줘요 (층·주차장은 기사님께 필요한 정보) */
  waitFull(s) {
    if (s.origin) return s.origin;
    const prev = Store.list().filter(x => x.date === s.date && x.id !== s.id && x.location && !x.masked && x.visibility !== 'private' && x.status !== 'cancelled' && (x.end || x.start) <= s.start)
      .sort((a, b) => (a.end || a.start).localeCompare(b.end || b.start)).pop();
    return prev ? prev.location : '본사';
  },

  jobs(ymd) {
    const p = Store.profile();
    const list = Store.list().filter(s => s.date === ymd && s.status !== 'cancelled' && s.visibility !== 'private' && !s.masked
      && (s.mode === 'driver' || (s.trip && s.trip.accessMode === 'driver')));
    return Backtime.planDay(list, { prepMin: p.prepMin });
  },
  /** 도착지 마중 — 기차 · 비행기 일정에 '도착지 마중'을 켜 두면 도착 + 짐 찾는 시간에 자동 배차 ('도착 20:00 → 20:40 T2 대기')
      국제선은 다음 날 도착일 수 있어 전날 일정도 봐요 */
  pickups(ymd) {
    const p = Store.profile();
    return Store.list().filter(s => (s.date === ymd || s.date === U.addDays(ymd, -1)) && s.status !== 'cancelled' && s.visibility !== 'private' && !s.masked
      && Backtime.isTrip(s.mode) && s.trip && s.trip.pickup && s.trip.pickup.on && s.trip.arriveTime)
      .map(s => ({ s, p: Backtime.plan(s, { prepMin: p.prepMin }) }))
      .filter(({ p: pl }) => pl.pickup && U.ymd(pl.pickup.waitAt) === ymd);
  },
  count(ymd) { return this.jobs(ymd).length + this.pickups(ymd).length; },
  /** 취소된 기사 차량 일정 — 지우지 않고 '취소됨' 한 줄로 (헛걸음하지 않게) */
  cancelled(ymd) {
    return Store.list().filter(s => s.date === ymd && s.status === 'cancelled' && s.visibility !== 'private' && !s.masked
      && (s.mode === 'driver' || (s.trip && s.trip.accessMode === 'driver'))).sort((a, b) => a.start.localeCompare(b.start));
  },

  render() {
    const root = document.getElementById('root');
    const p = Store.profile();
    const t = U.today(), t1 = U.addDays(t, 1);
    const now = new Date();
    // 배차(출발) + 도착지 마중을 대기 시각 순서로
    const jobs = [...this.jobs(this.day).map(({ s, p: pl }) => ({ at: pl.driverCallAt || pl.leaveAt, html: () => this.card(s, pl, now) })),
      ...this.pickups(this.day).map(({ s, p: pl }) => ({ at: pl.pickup.waitAt, html: () => this.pickupCard(s, pl, now) }))].sort((a, b) => a.at - b.at);
    const tab = (ymd, label) => `<button class="${this.day === ymd ? 'on' : ''}" data-day="${ymd}">${label} <small>${this.count(ymd)}건</small></button>`;
    root.innerHTML = `
      <header class="drv-head"><div><small>${U.dateLabel(this.day)}</small><h1>${U.esc(p.driverName || '기사')}님 배차표</h1></div>
        ${p.secretaryPhone ? `<a class="drv-call" href="${U.telLink(p.secretaryPhone)}">${Icon.svg('phone', 18)} ${U.esc(p.secretaryName || '비서')}</a>` : ''}</header>
      <nav class="drv-tabs">${tab(t, '오늘')}${tab(t1, '내일')}</nav>
      <main class="drv-list">${this.cancelled(this.day).map(s => `<article class="drv-card"><div class="dc-top"><b>${s.start} ${U.esc(s.title)}</b><span class="dc-pill late">취소됨</span></div><small class="dc-full">대기 안 해도 돼요 · ${U.esc(this.waitPlace(s))} → ${U.esc(s.location || '현장')}</small></article>`).join('')}${jobs.length ? jobs.map(j => j.html()).join('') : '<div class="drv-empty"><p>이 날은 배차가 없어요.</p></div>'}</main>
      <p class="drv-foot">${Store.mode === 'demo' ? '데모 화면이에요 · ' : ''}누른 상태는 대표님과 비서실에 바로 전달돼요<br><button type="button" class="drv-wd" data-withdraw>회원 탈퇴</button></p>
      ${Store.mode === 'demo' ? '' : '<button type="button" class="drv-logout" data-logout>로그아웃</button>'}`;
    root.querySelector('[data-withdraw]')?.addEventListener('click', () => U.withdraw());
    root.querySelector('[data-logout]')?.addEventListener('click', () => Store.signOut());
    root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { this.day = b.dataset.day; this.render(); }));
    root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => this.step(b.dataset.id, b.dataset.step)));
    root.querySelectorAll('[data-pkstep]').forEach(b => b.addEventListener('click', () => this.pickupStep(b.dataset.id, b.dataset.pkstep)));
  },

  card(s, pl, now) {
    const raw = this.state(s.id), moved = this.moved(s, raw);
    const st = moved ? { ...raw, wait: null } : raw;   // 바뀐 장소에서 다시 '대기 중'을 누르게
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
        <span class="dc-pill ${late || moved ? 'late' : soon <= 30 && soon > -30 && !st.depart ? 'soon' : ''}">${moved && !past ? '픽업 장소 바뀜' : past ? '끝남' : late ? `대기 ${U.durLabel(-soon)} 지남` : soon > 0 ? (soon < 60 ? `${soon}분 뒤` : `${U.durLabel(soon)} 뒤`) : st.depart ? '운행 중' : '대기 시간'}</span></div>
      <dl class="dc-route">
        <dt>대기 장소</dt><dd>${U.esc(this.waitPlace(s))}${this.waitFull(s) !== this.waitPlace(s) ? `<small class="dc-full">${U.esc(this.waitFull(s))}</small>` : ''}${moved ? `<small class="dc-full">픽업 장소가 바뀌었어요 · 예전 ${U.esc(U.building(raw.waitAt))}</small>` : ''}</dd>
        <dt>출발</dt><dd class="num">${U.hm(pl.leaveAt)}</dd>
        <dt>${trip ? '역 · 공항' : '도착 목표'}</dt><dd><b>${U.esc(dest)}</b> <span class="num">${trip ? (s.trip && s.trip.departTime ? `${s.trip.departTime} 출발편` : '') : U.hm(pl.arriveBy)}</span></dd>
        <dt>일정</dt><dd>${s.start} ${U.esc(s.title)}</dd>
      </dl>
      <ol class="dc-steps">${timeline}</ol>
      <div class="dc-acts">${next ? `<button class="btn primary big" data-step="${next.kind}" data-id="${s.id}">${next.btn}</button>` : `<p class="dc-done">${past ? '' : Icon.svg('checkCircle', 18) + ' 현장 도착을 알렸어요'}</p>`}
        <a class="btn" href="${U.tmapLink(st.wait || st.depart ? dest : this.waitPlace(s))}">${Icon.svg('nav', 16)} 길안내</a></div>
    </article>`;
  },

  /** 도착지 마중 카드 — '도착 20:00 → 20:40 T2 대기' */
  PK_STEPS: [
    { kind: 'wait', btn: '마중 장소 도착 · 대기 중', done: '대기' },
    { kind: 'depart', btn: '대표님 탑승 · 출발', done: '탑승' },
  ],
  pickupCard(s, pl, now) {
    const pk = pl.pickup, st = this.state(s.id + ':pickup');
    const where = pk.spot || (s.trip && s.trip.station) || '도착 출구';
    const nextIdx = this.PK_STEPS.findIndex(x => !st[x.kind]);
    const soon = U.diffMin(pk.waitAt, now);
    const past = U.addMin(pk.waitAt, 90) < now && !st.wait;
    const late = !past && soon < -5 && !st.wait;
    const next = nextIdx >= 0 && !past ? this.PK_STEPS[nextIdx] : null;
    const timeline = this.PK_STEPS.map((x, i) => `<li class="${st[x.kind] ? 'done' : i === nextIdx ? 'now' : ''}"><i>${st[x.kind] ? Icon.svg('check', 12) : ''}</i><span>${x.done}</span><b>${st[x.kind] ? U.hm(new Date(st[x.kind])) : ''}</b></li>`).join('');
    return `<article class="drv-card pickup ${past ? 'past' : ''}">
      <div class="dc-top"><div class="dc-call"><small>마중 대기</small><b class="num">${U.hm(pk.waitAt)}</b></div>
        <span class="dc-pill ${late ? 'late' : soon <= 30 && soon > -30 && !st.depart ? 'soon' : ''}">${past ? '끝남' : st.depart ? '운행 중' : late ? `대기 ${U.durLabel(-soon)} 지남` : soon > 0 ? (soon < 60 ? `${soon}분 뒤` : `${U.durLabel(soon)} 뒤`) : '대기 시간'}</span></div>
      <p class="dc-pk num">도착 ${U.hm(pk.arriveAt)} → ${U.hm(pk.waitAt)} ${U.esc(where)} 대기</p>
      <dl class="dc-route">
        <dt>마중 장소</dt><dd><b>${U.esc(where)}</b>${s.trip && s.trip.station && pk.spot ? `<small class="dc-full">${U.esc(s.trip.station)}</small>` : ''}</dd>
        <dt>도착편</dt><dd class="num">${U.hm(pk.arriveAt)} 도착 · 짐 찾기 ${pk.bagMin}분</dd>
        <dt>일정</dt><dd>${U.esc(s.title)}${s.location ? ` → ${U.esc(s.location)}` : ''}</dd>
      </dl>
      <ol class="dc-steps">${timeline}</ol>
      <div class="dc-acts">${next ? `<button class="btn primary big" data-pkstep="${next.kind}" data-id="${s.id}">${next.btn}</button>` : `<p class="dc-done">${past ? '' : Icon.svg('checkCircle', 18) + ' 대표님 탑승을 알렸어요'}</p>`}
        <a class="btn" href="${U.tmapLink(st.depart && s.location ? s.location : (s.trip && s.trip.station) || where)}">${Icon.svg('nav', 16)} 길안내</a></div>
    </article>`;
  },
  async pickupStep(id, kind) {
    const s = Store.get(id); if (!s) return;
    const name = Store.profile().driverName || '기사';
    const where = (s.trip && s.trip.pickup && s.trip.pickup.spot) || (s.trip && s.trip.station) || '도착 출구';
    const body = { wait: `${name}님: ${where}에서 마중 대기하고 있어요 · '${s.title}'`, depart: `${name}님: 대표님 마중 탑승, 출발했어요 · '${s.title}'` }[kind];
    try {
      // ref 를 따로 둬서 출발 쪽 대기 · 출발 기록(이동 시간 학습)과 섞이지 않게
      await Store.send(body, { ref: 'pickup:' + id });
      this.saveState(id + ':pickup', kind);
      U.toast(kind === 'wait' ? '마중 대기 중이라고 알렸어요' : '탑승 · 출발을 알렸어요');
      this.render();
    } catch (err) { U.toast('보내지 못했어요. 인터넷을 확인하고 다시 눌러 주세요'); }
  },

  async step(id, kind) {
    const s = Store.get(id); if (!s) return;
    const name = Store.profile().driverName || '기사';
    const body = {
      wait: `${name}님: 출발지(${U.pickupLabel(this.waitFull(s))}) 도착, 대기 중이에요 · '${s.title}'`,
      depart: `${name}님: 대표님 탑승, 출발했어요 · '${s.title}' ${s.trip ? (s.trip.station || '역') : (s.location || '현장')}으로`,
      arrive: `${name}님: 현장 도착했어요 · '${s.title}'`,
    }[kind];
    try {
      await Store.send(body, { ref: id });
      this.saveState(id, kind, kind === 'wait' ? { waitAt: this.waitFull(s) } : {});
      U.toast({ wait: '대기 중이라고 알렸어요', depart: '출발을 알렸어요', arrive: '도착을 알렸어요' }[kind]);
      this.render();
    } catch (err) { U.toast('보내지 못했어요. 인터넷을 확인하고 다시 눌러 주세요'); }
  },
};

Drv.start();
