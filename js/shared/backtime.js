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
    DEFAULT_COMMUTE_MIN: 40,   // 집 → 회사 출근 이동 (사내 회의로 시작하는 날 기상 계산)
    DEFAULT_BUFFER_MIN: 10, // 길 막힘 대비 기본 여유

    isTrip(mode) { return !!(this.MODES[mode] && this.MODES[mode].trip); },

    // 도착지 마중 — 짐 찾는 시간 기본값 (국제선 40분 · 국내선 20분 · KTX 10분)
    PICKUP_BAG_MIN: { intl: 40, flight: 20, train: 10 },
    pickupBagDefault(mode, intl) { return mode === 'flight' ? (intl ? this.PICKUP_BAG_MIN.intl : this.PICKUP_BAG_MIN.flight) : this.PICKUP_BAG_MIN.train; },

    /** 서울 기사님이 모시고 갈 수 있는 출발역 · 공항 (서울 · 수도권) */
    SEOUL_STATION: /김포|인천|ICN|GMP|서울|용산|수서|광명|청량리|영등포|행신|상봉|고속터미널|센트럴시티/i,
    /** 출발 구간을 기사님이 갈 수 없는지 — '도착지 마중'을 켠 기차 · 비행기(돌아오는 편)인데 출발역 · 공항이 서울 · 수도권 밖
        (김해공항 → 김포, 부산역 → 서울역, 국제선 귀국편 모두). 이 구간은 배차 · 기사 호출 · 배차 문자에서 빼고 도착 마중만 가요.
        김포 · 인천공항 · 서울역 · 용산 · 수서 · 광명역 등에서 출발하면 그대로 기사님이 모셔요.
        출발역을 안 적었으면 국제선만 빼요 (국내선 · KTX는 대개 서울에서 출발) */
    departAbroad(s) {
      const t = s && s.trip;
      if (!s || !this.isTrip(s.mode) || !t || !t.pickup || !t.pickup.on) return false;
      const st = String(t.station || '').trim();
      if (!st) return !!(s.mode === 'flight' && t.intl);
      return !this.SEOUL_STATION.test(st);
    },
    /** 출발 구간(→ 역 · 공항)을 기사님이 모시는지 — 기사 차량 일정 · 역까지 기사 차량 (해외 출발 구간은 빼요) */
    driverLeg(s) {
      if (!s) return false;
      if (s.mode === 'driver') return true;
      return !!(this.isTrip(s.mode) && s.trip && s.trip.accessMode === 'driver' && !this.departAbroad(s));
    },
    /** 도착 공항 · 역 — 직접 적은 '도착 공항', 없으면 장소가 공항 · 역일 때 장소, 국제선 귀국편이면 인천공항 */
    arriveStation(s) {
      const t = (s && s.trip) || {};
      if (String(t.arriveStation || '').trim()) return String(t.arriveStation).trim();
      if (/공항|터미널|역$|역\s/.test((s && s.location) || '')) return s.location;
      return this.departAbroad(s) && t.intl ? '인천공항' : '';
    },

    /** 마중만 하는 일정인지: 제목에 '픽업 · 마중', 도착지가 공항 · 역, 출발지가 본사(비어 있으면 본사)
        → 대표님이 움직이는 일정이 아니라 기사님 심부름이라 기상 · 기사 호출 · 이동 부족 경고를 붙이지 않아요 */
    isPickupOnly(s) {
      if (!s || !/픽업|마중/.test(s.title || '') || this.isTrip(s.mode)) return false;
      if (!/공항|터미널|\bT[12]\b|역$|역\s|KTX|SRT/i.test(s.location || '')) return false;
      return !s.origin || /본사|회사|사옥/.test(s.origin);
    },

    /**
     * 일정 하나의 역산 결과.
     * s: { date, start, end, mode, travelMin, bufferMin, category, location, trip? }
     *    trip: { departTime, arriveTime, accessMin, station, intl, arriveStation?, flightNo?, pickup? }  (기차·비행기일 때 · station 은 출발역 · 공항)
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
      const pickupOnly = this.isPickupOnly(s);
      let leaveAt, warn = '', pickup = null, freeAt = null, lateMin = 0;

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
        items.push({ at: departAt, kind: 'move', icon: def.emoji, title: `${def.label} 출발`, detail: [t.flightNo, t.departTime].filter(Boolean).join(' · ') });
        if (t.arriveTime) {
          let tripArr = U.at(s.date, t.arriveTime);
          if (tripArr < departAt) tripArr = U.addMin(tripArr, 24 * 60);   // 국제선 다음 날 도착
          items.push({ at: tripArr, kind: 'move', icon: '📍', title: `${this.arriveStation(s) || '도착역·공항'} 도착`, detail: s.travelMin ? `현장까지 ${U.durLabel(s.travelMin)}` : '' });
          // 도착지 마중: 도착 + 짐 찾는 시간에 기사님이 마중 장소에서 대기
          let ready = tripArr;
          if (t.pickup && t.pickup.on) {
            const bagMin = Number(t.pickup.bagMin ?? this.pickupBagDefault(mode, t.intl));
            const spot = String(t.pickup.spot || '').trim();
            ready = U.addMin(tripArr, bagMin);
            pickup = { arriveAt: tripArr, waitAt: ready, bagMin, spot, station: this.arriveStation(s), flightNo: String(t.flightNo || '').trim() };
            items.push({ at: ready, kind: 'pickup', icon: '🚘', title: `기사님 마중 대기${spot ? ` · ${spot}` : ''}`, detail: `도착 ${U.hm(tripArr)} + 짐 찾기 ${bagMin}분` });
          }
          const reach = U.addMin(ready, Number(s.travelMin || 0));
          if (reach > endAt) freeAt = reach;   // 도착이 늦어지면 다음 일정은 그 뒤에야 (겹침 경고)
          const late = U.diffMin(reach, arriveBy);
          lateMin = Math.max(0, late);
          if (late > 0) warn = `도착 후 현장까지 가면 ${U.hm(reach)}이라, 시작 전 도착 시각(${U.hm(arriveBy)})보다 ${late}분 늦어요`;
        }
      } else {
        const travel = Number(s.travelMin || 0) + (def.extraMin || 0);
        leaveAt = U.addMin(arriveBy, -(travel + buffer));
        if (pickupOnly) items.push({ at: leaveAt, kind: 'drive', icon: def.emoji, title: '기사님 마중 출발', detail: `${s.origin || '본사'} → ${s.location} · 이동 ${U.durLabel(s.travelMin || 0)}` });
        else items.push({ at: leaveAt, kind: 'leave', icon: def.emoji, title: `${def.label} 출발`, detail: `이동 ${U.durLabel(s.travelMin || 0)}${def.extraMin ? ` + ${def.extraLabel} ${def.extraMin}분` : ''} + 여유 ${buffer}분` });
      }

      let driverCallAt = null;
      if (!pickupOnly && this.driverLeg(s)) {   // 해외 출발 구간(귀국편)은 기사 호출 없음
        driverCallAt = U.addMin(leaveAt, -this.MODES.driver.pickupMin);
        items.unshift({ at: driverCallAt, kind: 'driver', icon: '📞', title: '기사님 대기 요청', detail: `출발 ${this.MODES.driver.pickupMin}분 전 차량 대기` });
      }

      let wakeAt = null;
      const prep = Number(opts.prepMin ?? this.DEFAULT_PREP_MIN);
      if (pickupOnly) {
        // 마중만 하는 일정: 대표님 기상 · 출근 계산 없음
      } else if (opts.firstOfDay && mode !== 'none') {
        wakeAt = U.addMin(leaveAt, -prep);
        items.unshift({ at: wakeAt, kind: 'wake', icon: '⏰', title: '기상', detail: `준비 ${U.durLabel(prep)}` });
      } else if (opts.firstOfDay && s.category !== 'personal') {
        // 사내 일정으로 시작하는 날: 집 → 회사 출근 이동(프로필, 없으면 40분)과 준비 시간을 빼서 기상
        const commute = Number(opts.commuteMin || this.DEFAULT_COMMUTE_MIN);
        wakeAt = U.addMin(startAt, -(commute + prep));
        items.unshift({ at: wakeAt, kind: 'wake', icon: '⏰', title: '기상', detail: `준비 ${U.durLabel(prep)} · 출근 ${U.durLabel(commute)}` });
      }

      if (pickupOnly && mode !== 'none') {
        items.push({ at: arriveBy, kind: 'drive', icon: '📍', title: `${s.location} 도착 · 마중 대기`, detail: `시작 ${cat.arriveEarlyMin}분 전` });
      } else if (mode !== 'none') {
        items.push({ at: arriveBy, kind: 'arrive', icon: '📍', title: cat.arriveLabel || `${s.location || '현장'} 도착`, detail: `시작 ${cat.arriveEarlyMin}분 전` });
      }
      items.push({ at: startAt, kind: 'start', icon: cat.emoji, title: `${s.title || cat.label} 시작`, detail: s.location || '' });
      if (s.end && s.end !== s.start) items.push({ at: endAt, kind: 'end', icon: '✅', title: '종료', detail: '' });

      items.sort((a, b) => a.at - b.at);
      return { arriveBy, leaveAt, driverCallAt, wakeAt, startAt, endAt, items, warn, pickup, pickupOnly, freeAt: freeAt || endAt, lateMin, departAbroad: this.departAbroad(s) };
    },

    /** 하루 일정 전체 역산 — 기상은 그날 첫 일정에만 붙여요.
        첫 일정이 사내 회의면 '출근 이동 + 준비'로 기상을 그 회의에 붙이고, 뒤 이동 일정에는 붙이지 않아요.
        (대표 개인 일정 · 취소된 일정은 '앞 일정'으로 치지 않음) */
    planDay(list, opts = {}) {
      const sorted = [...list].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      let first = true;
      return sorted.map(s => {
        // 마중만 하는 일정(기사님 심부름)은 대표님 '그날 첫 일정'으로 치지 않아요
        if (this.isPickupOnly(s)) return { s, p: this.plan(s, { ...opts, firstOfDay: false }) };
        const moving = s.mode && s.mode !== 'none';
        const p = this.plan(s, { ...opts, firstOfDay: first && (moving || (s.category !== 'personal' && !s.masked && s.status !== 'cancelled')) });
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
      // 마중만 하는 일정은 기사님만 움직여요 → 대표님 일정과 이동 부족 · 겹침 경고를 만들지 않음
      const day = list.map(s => ({ s, p: this.plan(s, opts) })).filter(d => !d.p.pickupOnly).sort((a, b) => a.p.startAt - b.p.startAt);
      const out = [];
      for (let i = 1; i < day.length; i++) {
        const prev = day[i - 1], cur = day[i];
        // 사내·개인(이동 없음) 일정은 실제로 시간이 겹칠 때만 경고 (연달아 있는 건 정상)
        const short = cur.s.mode && cur.s.mode !== 'none'
          ? U.diffMin(prev.p.freeAt, cur.p.leaveAt)
          : U.diffMin(prev.p.freeAt, cur.p.startAt);
        if (short > 0) {
          const overlap = cur.p.startAt < prev.p.freeAt;
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
      const prev = live.filter(s => s.date === U.addDays(ymd, -1)).map(s => ({ s, p: this.plan(s, opts) })).sort((a, b) => b.p.freeAt - a.p.freeAt)[0];
      const list = live.filter(s => s.date === ymd);
      if (prev && prev.p.freeAt > U.addMin(U.at(ymd, '00:00'), -4 * 60)) list.push(prev.s);   // 전날 20시 이후에 끝나는 일정만
      return this.conflicts(list, opts).filter(w => w.b.date === ymd);
    },

    /** 출발지(기사님 대기 장소) 기본값 — 출발지 칸 → 그날 바로 앞 일정 장소.
     *  그날 첫 일정(앞 일정이 없거나, 앞 일정이 끝나고 3시간 넘게 비면)이면 자택 (내 정보의 집 주소가 있으면 그 주소).
     *  대표 개인 일정 · 가린 일정 · 취소된 일정은 '앞 일정'으로 치지 않아요.
     *  비서 등록 창 · 기사님 배차표 · 대표 앱 · AI 비서가 모두 이 규칙을 써요 */
    HOME: '자택',
    prevOf(list, s) {
      return (list || []).filter(x => x && x.date === s.date && x.id !== s.id && x.location && !x.masked && x.visibility !== 'private' && x.status !== 'cancelled'
        && (x.end || x.start) <= s.start && x.start <= s.start)
        .sort((a, b) => (a.end || a.start).localeCompare(b.end || b.start)).pop() || null;
    },
    defaultOrigin(list, s, home) {
      if (!s) return '';
      if (s.origin) return s.origin;
      const prev = this.prevOf(list, s);
      const m = t => { const [h, mi] = String(t || '0:0').split(':').map(Number); return h * 60 + (mi || 0); };
      if (!prev || m(s.start) - m(prev.end || prev.start) > 180) return String(home || '').trim() || this.HOME;
      return prev.location;
    },

    /** s 가 대표 개인 일정('바쁨' · 비서에겐 가려진 일정)과 시간이 실제로 겹치면 그 일정 (없으면 null).
     *  이동 시간은 빼고 일정 시작~종료만 비교해요 (끝이 시작보다 빠르면 다음 날 끝). 전날 밤에서 이어지는 개인 일정도 봐요.
     *  비서 등록 창 '대표님 개인 일정과 겹쳐요' 확인 창이 써요 (2026-11-25) */
    busyClash(all, s) {
      if (!s || !s.date || !s.start || s.masked || s.visibility === 'private') return null;
      const span = x => { const a = U.at(x.date, x.start); let b = U.at(x.date, x.end || x.start); if (b <= a) b = U.addMin(b, 24 * 60); return [a, b]; };
      const [a1, b1] = span(s);
      return (all || []).filter(x => x && x.id !== s.id && x.status !== 'cancelled' && (x.masked || x.visibility === 'private')
        && (x.date === s.date || x.date === U.addDays(s.date, -1) || x.date === U.addDays(s.date, 1)))
        .map(x => ({ x, t: span(x) })).filter(({ t }) => t[0] < b1 && a1 < t[1])
        .sort((p, q) => p.t[0] - q.t[0]).map(({ x }) => x)[0] || null;
    },

    /** 늦을 때 도착 예상 — 시작 시각 + 늦는 분 ('10분 늦어요' → 11:00 미팅이면 11:10쯤 도착).
     *  대표 앱 '10분 늦어요' · 비서에게 알리기 · AI 비서 '15분 늦어' · 상대방 문자 초안이 모두 이 규칙을 써요 */
    lateArrive(s, min) { return U.addMin(U.at(s.date, s.start), Math.max(0, Number(min) || 0)); },

    /** 받침에 맞는 '와/과' */
    wa(w) { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0 ? '과' : '와'; },
  };

  root.Backtime = Backtime;
  if (typeof module !== 'undefined') module.exports = Backtime;
})(typeof window !== 'undefined' ? window : globalThis);
