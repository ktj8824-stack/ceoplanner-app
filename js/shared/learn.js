/* =========================================
   CEO플래너 — 배우는 비서 (계획 vs 실제 기록으로 먼저 알려 주기)
   화면·네트워크와 상관없는 순수 계산 모듈 → tests/learn-test.cjs

   - actual(s, messages): 실제 출발·도착 시각 (대표가 누른 기록 → 없으면 기사님 메시지 시각)
   - travel(list, messages, { origin, location, at }): 같은 길의 실제 이동 시간 평균 (3번 이상 쌓이면)
       at(출발 예정 시각)을 주면 같은 시간대(출근 · 낮 · 퇴근 · 밤) 기록을 먼저 씀
   - eta(s, messages, list): 출발 기록이 있으면 도착 예상 시각 · 시작보다 몇 분 늦을지
   - places(list, { who, company }): 대표님이 '좋았어요'라고 한 식사 장소 추천
   - placeNote(list, location): 이 장소에 대한 대표님 지난 평가
   - repeatDates(date, kind, count): 반복 일정 날짜들
   ========================================= */
(function (root) {
  const U = root.U || require('./utils.js');

  const DRIVER = {
    wait: /대기 중/,
    depart: /출발했어요/,
    arrive: /현장 도착/,
  };

  const Learn = {
    MIN_SAMPLES: 3,
    RATING: { good: '좋았어요', ok: '보통', bad: '별로' },

    /** 시간대 — 같은 길도 출근 · 퇴근 때는 훨씬 오래 걸려요 */
    slot(d) {
      const h = new Date(d).getHours();
      if (h >= 6 && h < 10) return { key: 'am', label: '출근 시간대' };
      if (h >= 10 && h < 16) return { key: 'mid', label: '낮 시간대' };
      if (h >= 16 && h < 20) return { key: 'pm', label: '퇴근 시간대' };
      return { key: 'night', label: '밤 시간대' };
    },

    /** 같은 사람인지: '최상무님' ↔ '최서연 상무' · '정민호 부사장' ↔ '정민호 부사장님' */
    samePerson(a, b) {
      const norm = x => String(x || '').replace(/님/g, '').trim();
      const A = norm(a), Bs = norm(b);
      if (!A || !Bs) return false;
      const ka = A.replace(/\s+/g, ''), kb = Bs.replace(/\s+/g, '');
      if (ka === kb || kb.startsWith(ka) || ka.startsWith(kb)) return true;
      // '최상무'(성 + 직함) ↔ '최서연 상무'(이름 + 직함)
      const parts = s => { const p = s.split(/\s+/); return p.length >= 2 ? { last: p[0][0], title: p[p.length - 1] } : { last: s[0], title: s.slice(1) }; };
      const pa = parts(A), pb = parts(Bs);
      return !!pa.title && pa.last === pb.last && pa.title === pb.title;
    },

    /** 장소 이름 비교용 (띄어쓰기·대소문자 무시) */
    key(place) { return String(place || '').replace(/\s+/g, '').toLowerCase(); },

    /** 기사님 메시지 종류 */
    driverKind(body) { for (const [k, re] of Object.entries(DRIVER)) if (re.test(body)) return k; return null; },

    /** 실제 기록 { departAt, arriveAt, waitAt, rating } — 일정에 저장된 값이 먼저, 없으면 기사님 메시지 시각 */
    actual(s, messages = []) {
      const a = { ...((s && s.actual) || {}) };
      for (const m of messages) {
        if (m.from !== 'driver' || m.ref !== s.id) continue;
        const k = this.driverKind(m.body);
        if (k === 'wait' && !a.waitAt) a.waitAt = m.at;
        if (k === 'depart' && !a.departAt) a.departAt = m.at;
        if (k === 'arrive' && !a.arriveAt) a.arriveAt = m.at;
      }
      return a;
    },

    /** 이 일정에 대한 기사님 최근 상태 { kind, at } */
    driverStatus(s, messages = []) {
      let last = null;
      for (const m of messages) if (m.from === 'driver' && m.ref === s.id) { const k = this.driverKind(m.body); if (k && (!last || m.at > last.at)) last = { kind: k, at: m.at }; }
      return last;
    },

    /** 실제 이동 시간(분) 표본 — 출발·도착이 모두 기록된 지난 일정만 */
    samples(list, messages, location) {
      const k = this.key(location);
      if (!k) return [];
      const out = [];
      for (const s of list) {
        if (s.status === 'cancelled' || this.key(s.location) !== k || !s.mode || s.mode === 'none' || (root.Backtime && root.Backtime.isTrip && root.Backtime.isTrip(s.mode))) continue;
        const a = this.actual(s, messages);
        if (!a.departAt || !a.arriveAt) continue;
        const min = U.diffMin(new Date(a.arriveAt), new Date(a.departAt));
        if (min < 3 || min > 300) continue;   // 잘못 누른 기록은 빼기
        out.push({ s, min, origin: this.key(s.origin), at: a.departAt, slot: this.slot(a.departAt).key });
      }
      return out.sort((x, y) => String(y.at).localeCompare(String(x.at)));
    },

    /** 같은 길의 실제 이동 시간 평균 — { n, avg, mins, sameOrigin } 또는 null */
    travel(list, messages, { origin, location, at } = {}) {
      const all = this.samples(list, messages, location);
      const ok = x => x.length >= this.MIN_SAMPLES;
      const o = this.key(origin);
      const sl = at ? this.slot(at) : null;
      // 고르는 순서: 같은 시간대 + 같은 출발지 → 같은 시간대 → 같은 출발지 → 전체
      const tries = [
        sl && all.filter(x => x.slot === sl.key && o && x.origin === o),
        sl && all.filter(x => x.slot === sl.key),
        o && all.filter(x => x.origin === o),
        all,
      ].filter(Boolean);
      const use = (tries.find(ok) || []).slice(0, 5);
      if (!ok(use)) return null;
      const mins = use.map(x => x.min);
      const bySlot = !!sl && use.every(x => x.slot === sl.key);
      return { n: use.length, avg: Math.round(mins.reduce((a, b) => a + b, 0) / mins.length), mins,
        sameOrigin: !!o && use.every(x => x.origin === o), slotLabel: bySlot ? sl.label : '' };
    },

    /** 도착 예상 — 출발 기록(대표 · 기사님)이 있고 아직 도착 전일 때. { at, min, late, learned, slotLabel } */
    eta(s, messages = [], list = []) {
      if (!s || !s.mode || s.mode === 'none' || !s.location || (root.Backtime && root.Backtime.isTrip && root.Backtime.isTrip(s.mode))) return null;
      const a = this.actual(s, messages);
      if (!a.departAt || a.arriveAt) return null;
      const dep = new Date(a.departAt);
      const t = this.travel(list.filter(x => x.id !== s.id), messages, { origin: s.origin, location: s.location, at: dep });
      const min = t ? t.avg : Number(s.travelMin || 0);
      if (!min) return null;
      const at = U.addMin(dep, min);
      return { at, depart: dep, min, late: U.diffMin(at, U.at(s.date, s.start)), learned: !!t, slotLabel: t ? t.slotLabel : '' };
    },

    /** 식사 장소별 대표님 평가 모음 */
    _placeTable(list) {
      const map = new Map();
      for (const s of list) {
        const r = s.actual && s.actual.rating;
        if (s.category !== 'dinner' || !s.location || !this.RATING[r]) continue;
        const k = this.key(s.location);
        const e = map.get(k) || { name: s.location, good: 0, ok: 0, bad: 0, n: 0, last: '', lastRating: '', people: [] };
        e[r]++; e.n++;
        if (s.date >= e.last) { e.last = s.date; e.lastRating = r; e.name = s.location; }
        const b = s.briefing || {};
        if (b.who || b.company) e.people.push({ who: b.who || '', company: b.company || '', date: s.date, rating: r });
        map.set(k, e);
      }
      return map;
    },

    /** 추천: 좋았던 곳 먼저, 같은 분·같은 회사와 갔던 곳은 더 위로. 최근 '별로'는 빼기 */
    places(list, { who = '', company = '' } = {}, limit = 4) {
      const co = this.key(String(company).split(/[·,]/)[0]);
      const rows = [...this._placeTable(list).values()].filter(e => e.good > 0 && e.lastRating !== 'bad').map(e => {
        const withThem = e.people.filter(p => (who && this.samePerson(who, p.who)) || (co && this.key(p.company).startsWith(co)));
        return { ...e, withThem: withThem.sort((a, b) => b.date.localeCompare(a.date))[0] || null, score: e.good * 2 + e.ok - e.bad * 3 + (withThem.length ? 5 : 0) };
      });
      return rows.sort((a, b) => b.score - a.score || b.last.localeCompare(a.last)).slice(0, limit);
    },

    /** 이 장소에 대한 지난 평가 { lastRating, good, ok, bad, n } 또는 null */
    placeNote(list, location) {
      const e = this._placeTable(list).get(this.key(location));
      return e || null;
    },

    /** 반복 일정 날짜 — kind: weekly | biweekly | weekdays | monthly, count: 첫 날 포함 개수 */
    repeatDates(date, kind, count) {
      const out = [date];
      const n = Math.max(1, Math.min(52, Number(count) || 1));
      const [y, m, d] = date.split('-').map(Number);
      let cur = date, i = 1;
      while (out.length < n && i < 400) {
        if (kind === 'weekly') cur = U.addDays(date, 7 * i);
        else if (kind === 'biweekly') cur = U.addDays(date, 14 * i);
        else if (kind === 'weekdays') { cur = U.addDays(cur, 1); const w = U.at(cur, '00:00').getDay(); if (w === 0 || w === 6) { i++; continue; } }
        else if (kind === 'monthly') { const t = new Date(y, m - 1 + i, d); if (t.getDate() !== d) { i++; continue; } cur = U.ymd(t); }   // 31일이 없는 달은 건너뜀
        else break;
        out.push(cur); i++;
      }
      return out;
    },
  };

  root.Learn = Learn;
  if (typeof module !== 'undefined') module.exports = Learn;
})(typeof window !== 'undefined' ? window : globalThis);
