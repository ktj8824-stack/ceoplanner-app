/* =========================================
   CEO플래너 — 역산(거꾸로 계산) 엔진
   마이플래너 Planner 엔진을 CEO 일정용으로 옮긴 것.
   일정 시작 시각에서 거꾸로 계산해
   기상 · 기사 호출 · 출발 · 도착 시각을 만듭니다.
   (화면·네트워크와 상관없는 순수 계산 모듈 → tests/backtime-test.cjs)
   ========================================= */
(function (root) {
  // utils.js 의 U (브라우저: window.U, node: require)
  const U = root.U || require('./utils.js');

  const Backtime = {
    // 이동수단 — extraMin: 수단별 추가 여유, pickupMin: 기사님이 미리 대기하는 시간
    MODES: {
      driver: { label: '기사 차량', emoji: '🚘', extraMin: 0, pickupMin: 10 },
      car:    { label: '자가용', emoji: '🚗', extraMin: 10, extraLabel: '주차 후 이동' },
      taxi:   { label: '택시', emoji: '🚕', extraMin: 10, extraLabel: '택시 호출 대기' },
      walk:   { label: '도보', emoji: '🚶', extraMin: 0 },
      train:  { label: 'KTX·기차', emoji: '🚄', trip: true, marginMin: 15, marginLabel: '승강장 도착 여유' },
      flight: { label: '비행기', emoji: '✈️', trip: true, marginMin: 40, marginLabel: '탑승 수속 (국내선)', intlMarginMin: 150, intlMarginLabel: '탑승 수속 (국제선)' },
      none:   { label: '이동 없음 (사내)', emoji: '🏢', extraMin: 0 },
    },

    // 일정 분류 — arriveEarlyMin: 시작보다 얼마나 일찍 도착해야 하는지
    CATEGORIES: {
      meeting:  { label: '사내 회의', emoji: '💼', arriveEarlyMin: 5 },
      external: { label: '외부 미팅', emoji: '🤝', arriveEarlyMin: 10 },
      dinner:   { label: '접대 식사', emoji: '🍽️', arriveEarlyMin: 10 },
      golf:     { label: '골프', emoji: '⛳', arriveEarlyMin: 60, arriveLabel: '클럽하우스 도착 (티오프 1시간 전)' },
      trip:     { label: '출장', emoji: '🧳', arriveEarlyMin: 10 },
      event:    { label: '행사', emoji: '🎤', arriveEarlyMin: 20 },
      personal: { label: '개인', emoji: '🔒', arriveEarlyMin: 5 },
    },

    DEFAULT_PREP_MIN: 60,   // 기상 → 출발 준비 시간 (내 정보에서 바꿈)
    DEFAULT_BUFFER_MIN: 10, // 길 막힘 대비 기본 여유

    isTrip(mode) { return !!(this.MODES[mode] && this.MODES[mode].trip); },

    /**
     * 일정 하나의 역산 결과.
     * s: { date, start, end, mode, travelMin, bufferMin, category, location, trip? }
     *    trip: { departTime, arriveTime, accessMin, station, intl }  (기차·비행기일 때)
     * opts: { prepMin, firstOfDay }  — 그날 첫 이동 일정이면 기상 시각도 계산
     * 반환: { arriveBy, leaveAt, driverCallAt, wakeAt, startAt, endAt, items[] }
     */
    plan(s, opts = {}) {
      const mode = this.MODES[s.mode] ? s.mode : 'none';
      const def = this.MODES[mode];
      const cat = this.CATEGORIES[s.category] || this.CATEGORIES.external;
      const startAt = U.at(s.date, s.start);
      let endAt = U.at(s.date, s.end || s.start);
      if (endAt < startAt) endAt = U.addMin(endAt, 24 * 60);   // 22:00–01:00 처럼 밤을 넘기는 일정
      const buffer = mode === 'none' ? 0 : Number(s.bufferMin ?? this.DEFAULT_BUFFER_MIN);
      const arriveBy = U.addMin(startAt, -cat.arriveEarlyMin);
      const items = [];
      let leaveAt, warn = '';

      if (mode === 'none') {
        leaveAt = arriveBy;
      } else if (def.trip) {
        const t = s.trip || {};
        const departAt = U.at(s.date, t.departTime || s.start);
        const margin = mode === 'flight' && t.intl ? def.intlMarginMin : def.marginMin;
        const marginLabel = mode === 'flight' && t.intl ? def.intlMarginLabel : def.marginLabel;
        const accessMin = Number(t.accessMin || 0);
        const stationAt = U.addMin(departAt, -margin);
        leaveAt = U.addMin(stationAt, -(accessMin + buffer));
        items.push({ at: leaveAt, kind: 'leave', icon: '🚪', title: `${t.station || '역·공항'}으로 출발`, detail: `${U.durLabel(accessMin)} 이동 + 여유 ${buffer}분` });
        items.push({ at: stationAt, kind: 'wait', icon: '⏱️', title: marginLabel, detail: `${margin}분 전 도착` });
        items.push({ at: departAt, kind: 'move', icon: def.emoji, title: `${def.label} 출발`, detail: t.departTime || '' });
        if (t.arriveTime) {
          let tripArr = U.at(s.date, t.arriveTime);
          if (tripArr < departAt) tripArr = U.addMin(tripArr, 24 * 60);   // 국제선 다음 날 도착
          items.push({ at: tripArr, kind: 'move', icon: '📍', title: '도착역·공항 도착', detail: s.travelMin ? `현장까지 ${U.durLabel(s.travelMin)}` : '' });
          const reach = U.addMin(tripArr, Number(s.travelMin || 0));
          const late = U.diffMin(reach, arriveBy);
          if (late > 0) warn = `도착 후 현장까지 가면 ${U.hm(reach)}이라, 시작 전 도착 시각(${U.hm(arriveBy)})보다 ${late}분 늦어요`;
        }
      } else {
        const travel = Number(s.travelMin || 0) + (def.extraMin || 0);
        leaveAt = U.addMin(arriveBy, -(travel + buffer));
        items.push({ at: leaveAt, kind: 'leave', icon: def.emoji, title: `${def.label} 출발`, detail: `이동 ${U.durLabel(s.travelMin || 0)}${def.extraMin ? ` + ${def.extraLabel} ${def.extraMin}분` : ''} + 여유 ${buffer}분` });
      }

      let driverCallAt = null;
      if (mode === 'driver' || (def.trip && s.trip && s.trip.accessMode === 'driver')) {
        driverCallAt = U.addMin(leaveAt, -this.MODES.driver.pickupMin);
        items.unshift({ at: driverCallAt, kind: 'driver', icon: '📞', title: '기사님 대기 요청', detail: `출발 ${this.MODES.driver.pickupMin}분 전 차량 대기` });
      }

      let wakeAt = null;
      if (opts.firstOfDay && mode !== 'none') {
        wakeAt = U.addMin(leaveAt, -Number(opts.prepMin ?? this.DEFAULT_PREP_MIN));
        items.unshift({ at: wakeAt, kind: 'wake', icon: '⏰', title: '기상', detail: `준비 ${U.durLabel(opts.prepMin ?? this.DEFAULT_PREP_MIN)}` });
      }

      if (mode !== 'none') {
        items.push({ at: arriveBy, kind: 'arrive', icon: '📍', title: cat.arriveLabel || `${s.location || '현장'} 도착`, detail: `시작 ${cat.arriveEarlyMin}분 전` });
      }
      items.push({ at: startAt, kind: 'start', icon: cat.emoji, title: `${s.title || cat.label} 시작`, detail: s.location || '' });
      if (s.end && s.end !== s.start) items.push({ at: endAt, kind: 'end', icon: '✅', title: '종료', detail: '' });

      items.sort((a, b) => a.at - b.at);
      return { arriveBy, leaveAt, driverCallAt, wakeAt, startAt, endAt, items, warn };
    },

    /** 하루 일정 전체 역산 — 기상은 그날 첫 일정이 이동 일정일 때만.
        앞에 사내 회의가 있으면 대표님은 이미 회사에 있으니 뒤 일정에 기상을 붙이지 않아요.
        (대표 개인 일정 · 취소된 일정은 '앞 일정'으로 치지 않음) */
    planDay(list, opts = {}) {
      const sorted = [...list].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      let first = true;
      return sorted.map(s => {
        const moving = s.mode && s.mode !== 'none';
        const p = this.plan(s, { ...opts, firstOfDay: first && moving });
        if (moving || (s.category !== 'personal' && !s.masked && s.status !== 'cancelled')) first = false;
        return { s, p };
      });
    },

    /**
     * 충돌·이동시간 부족 경고.
     * 앞 일정이 끝나는 시각보다 다음 일정 출발 시각이 이르면 경고.
     * 반환: [{ a, b, shortMin, msg }]
     */
    conflicts(list, opts = {}) {
      const day = list.map(s => ({ s, p: this.plan(s, opts) })).sort((a, b) => a.p.startAt - b.p.startAt);
      const out = [];
      for (let i = 1; i < day.length; i++) {
        const prev = day[i - 1], cur = day[i];
        // 사내·개인(이동 없음) 일정은 실제로 시간이 겹칠 때만 경고 (연달아 있는 건 정상)
        const short = cur.s.mode && cur.s.mode !== 'none'
          ? U.diffMin(prev.p.endAt, cur.p.leaveAt)
          : U.diffMin(prev.p.endAt, cur.p.startAt);
        if (short > 0) {
          const overlap = cur.p.startAt < prev.p.endAt;
          const a = `'${prev.s.title}'`;
          out.push({
            a: prev.s, b: cur.s, shortMin: short,
            msg: overlap
              ? `${a}${this.wa(prev.s.title)} '${cur.s.title}' 시간이 겹쳐요`
              : `${a} 끝나고 '${cur.s.title}'까지 이동 시간이 ${U.durLabel(short)} 부족해요`,
          });
        }
      }
      return out;
    },

    /** 그날 경고 + 전날 밤 일정이 이어지는 경우까지 (전날 마지막 일정과 비교) */
    conflictsOn(all, ymd, opts = {}) {
      const live = all.filter(s => s.status !== 'cancelled');
      const prev = live.filter(s => s.date === U.addDays(ymd, -1)).map(s => ({ s, p: this.plan(s, opts) })).sort((a, b) => b.p.endAt - a.p.endAt)[0];
      const list = live.filter(s => s.date === ymd);
      if (prev && prev.p.endAt > U.addMin(U.at(ymd, '00:00'), -4 * 60)) list.push(prev.s);   // 전날 20시 이후에 끝나는 일정만
      return this.conflicts(list, opts).filter(w => w.b.date === ymd);
    },

    /** 받침에 맞는 '와/과' */
    wa(w) { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0 ? '과' : '와'; },
  };

  root.Backtime = Backtime;
  if (typeof module !== 'undefined') module.exports = Backtime;
})(typeof window !== 'undefined' ? window : globalThis);
