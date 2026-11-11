/* =========================================
   CEO플래너 — AI 비서 (데모 해석기)
   지금은 서버 없이 정해진 말투만 알아듣는 규칙 기반 해석기예요.
   서버가 연결되면 interpret() 안쪽만 실제 AI 호출로 바꾸고,
   돌려주는 결과 모양(아래 '결과')은 그대로 씁니다.

   결과: { kind: 'answer' | 'action' | 'unknown',
           say: 화면에 보여 줄 말,
           lines: 확인 카드에 보여 줄 줄들,
           changes: [{ op: 'upsert'|'cancel', schedule }],
           notify: 비서에게 보낼 메시지 (ref 포함),
           draft: 상대방에게 보낼 문자 초안 }
   실제로 바꾸는 일은 화면 쪽(app.js)이 '이대로 할게요'를 누른 뒤에만 합니다.
   ========================================= */
(function (root) {
  const U = root.U || require('./utils.js');
  const Backtime = root.Backtime || require('./backtime.js');

  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const CAT_WORDS = [
    [/점심|저녁|식사|만찬|오찬|접대/, 'dinner'], [/골프|라운딩|티오프/, 'golf'], [/회의|임원회의|이사회/, 'meeting'],
    [/출장|ktx|KTX|비행기/, 'trip'], [/행사|강연|세미나|시상/, 'event'], [/미팅|면담|만남|협의/, 'external'],
  ];

  const A = {
    EXAMPLES: ['길 막혀서 15분 늦어', '점심 30분 미뤄 줘', '목요일 오후 3시에 한빛전자 미팅 잡아 줘, 삼성동에서', '내일 첫 출발 몇 시야?'],

    /** ctx: { schedules, now(Date), profile } */
    interpret(text, ctx) {
      const t = String(text || '').trim();
      if (!t) return { kind: 'unknown', say: '말씀을 못 들었어요. 다시 한 번 말씀해 주세요.' };
      const now = ctx.now || new Date();
      const list = (ctx.schedules || []).filter(s => s.status !== 'cancelled');
      // 1) 숫자 말을 숫자로 ('한 시간' → '1 시간', '삼십 분' → '30 분')  2) 날짜를 먼저 읽기
      const n = this.normNum(t);
      const day = this.dateInfo(n, now);
      if (day.err) return { kind: 'answer', say: day.err };

      if (/늦|지연|막혀|막힘/.test(n) && !/미뤄|미루/.test(n)) return this.delay(n, list, now, ctx);
      if (/취소/.test(n)) return this.cancel(n, list, now, day.ymd);
      if (/미뤄|미루|늦춰|당겨|옮겨|바꿔|변경/.test(n)) return this.move(n, list, now, day.ymd);
      if (/잡아|추가|등록|넣어|만들어/.test(n)) return this.create(n, list, now, ctx);
      if (/몇\s*시|언제|알려|뭐야|뭐 있|있어\?|일정은|끝나|마치/.test(n)) return this.ask(n, list, now, ctx);
      // 동사 없이 '내일 오전 10시 삼성동 미팅'처럼 날짜 + 시각 + 이름만 말해도 등록 카드로
      if (day.ymd && this.time(n) && this.titleOf(n, null)) return this.create(n, list, now, ctx);
      return { kind: 'unknown', say: '아직 그 말은 알아듣지 못해요. 아래 예시처럼 말씀해 주세요.' };
    },

    // ───────── 공통 ─────────
    /** 한글 숫자 → 숫자: '한 시간 반' → '1 시간 반', '열두 시' → '12 시', '삼십 분' → '30 분' */
    normNum(t) {
      const NATIVE = { 열한: 11, 열두: 12, 한: 1, 두: 2, 세: 3, 석: 3, 네: 4, 넉: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 스무: 20 };
      let out = t.replace(/(열한|열두|다섯|여섯|일곱|여덟|아홉|스무|한|두|세|석|네|넉|열)\s*(시간|시|분)/g, (m, w, u) => `${NATIVE[w]} ${u}`);
      const SINO = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
      out = out.replace(/([이삼사오]?십[일이삼사오육칠팔구]?|[일이삼사오육칠팔구])\s*분/g, (m, w) => {
        const [a, b] = w.includes('십') ? w.split('십') : ['', w];
        const v = w.includes('십') ? (a ? SINO[a] : 1) * 10 + (b ? SINO[b] : 0) : SINO[b];
        return `${v} 분`;
      });
      return out;
    },

    /** 날짜 읽기 + 없는 날짜(31일이 없는 달 등)는 되묻기 */
    dateInfo(t, now) {
      const ymd = this.date(t, now);
      const m = t.match(/(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/);
      if (ymd && m && !/요일/.test(t.slice(m.index, m.index + m[0].length + 2)) && Number(ymd.slice(8)) !== Number(m[2])) {
        const mon = m[1] ? Number(m[1]) : now.getMonth() + 1;
        return { ymd: null, err: `${mon}월에는 ${m[2]}일이 없어요. 날짜를 다시 말씀해 주세요.` };
      }
      return { ymd, err: '' };
    },

    /** 비서에게 알릴 필요가 없는 일정 (대표 개인 일정) */
    isPrivate(s) { return s && s.visibility === 'private'; },

    plan(list, ymd, ctx) { return Backtime.planDay(list.filter(s => s.date === ymd), { prepMin: (ctx.profile || {}).prepMin }); },

    /** 지금 진행 중이거나 다음 일정 (오늘·내일) — skipPrivate 면 개인 일정은 건너뜀 */
    upcoming(list, now, skipPrivate) {
      const t = U.ymd(now);
      for (const ymd of [t, U.addDays(t, 1)]) {
        const hit = Backtime.planDay(list.filter(s => s.date === ymd && !(skipPrivate && this.isPrivate(s)))).find(({ p }) => p.endAt > now);
        if (hit) return hit.s;
      }
      return null;
    },

    /** 말에서 일정 고르기: (날짜를 말했으면 그날 안에서) 제목 단어 → 분류 단어 → 다음 일정 */
    pick(t, list, now, ymd) {
      if (ymd) list = list.filter(s => s.date === ymd);
      const future = list.filter(s => U.at(s.date, s.end || s.start) > now);
      const words = t.replace(/[,.?!]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
      const byTitle = future.filter(s => words.some(w => s.title && s.title.includes(w.replace(/(을|를|은|는|이|가|도|만)$/, ''))));
      if (byTitle.length) return this.soonest(byTitle, now);
      for (const [re, cat] of CAT_WORDS) if (re.test(t)) {
        const byCat = future.filter(s => s.category === cat);
        if (byCat.length) return this.soonest(byCat, now);
      }
      if (ymd) return this.soonest(future, now) || null;
      return this.upcoming(list, now);
    },
    /** 제목·분류 단어로 맞는 일정이 있는지 (취소처럼 조심할 때 '다음 일정'으로 넘어가지 않게) */
    named(t, list, now) {
      const future = list.filter(s => U.at(s.date, s.end || s.start) > now);
      const words = t.replace(/[,.?!]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
      if (future.some(s => s.title && words.some(w => s.title.includes(w.replace(/(을|를|은|는|이|가|도|만)$/, ''))))) return true;
      return CAT_WORDS.some(([re, cat]) => re.test(t) && future.some(s => s.category === cat));
    },
    soonest(arr, now) {
      const key = s => s.date + ' ' + s.start;
      const ahead = arr.filter(s => U.at(s.date, s.end || s.start) > now).sort((a, b) => key(a).localeCompare(key(b)));
      return ahead[0] || arr.sort((a, b) => key(a).localeCompare(key(b)))[0];
    },

    /** '오후 3시', '3시 반', '15:30', '12시 50분' → 'HH:MM' */
    time(t) {
      let m = t.match(/(\d{1,2}):(\d{2})/);
      if (m) return `${U.pad(+m[1])}:${m[2]}`;
      m = t.match(/(오전|오후|아침|저녁|밤|낮|새벽)?\s*(\d{1,2})\s*시\s*(반|(\d{1,2})\s*분)?/);
      if (!m) return null;
      let h = +m[2];
      const min = m[3] === '반' ? 30 : m[4] ? +m[4] : 0;
      if (/오후|저녁|밤/.test(m[1] || '') && h < 12) h += 12;
      else if (!m[1] && h >= 1 && h <= 6) h += 12; // '3시' = 오후 3시로 봄
      if (h > 23 || min > 59) return null;
      return `${U.pad(h)}:${U.pad(min)}`;
    },

    /** '오늘·내일·모레·목요일·다음 주 화요일·11월 12일·12일' → 'YYYY-MM-DD' */
    date(t, now) {
      const today = U.ymd(now);
      if (/모레/.test(t)) return U.addDays(today, 2);
      if (/내일/.test(t)) return U.addDays(today, 1);
      if (/오늘/.test(t)) return today;
      let m = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
      if (m) {
        let y = now.getFullYear();
        if (+m[1] < now.getMonth() + 1) y += 1;
        return U.ymd(new Date(y, +m[1] - 1, +m[2]));
      }
      m = t.match(/(다음\s*주|담주)?\s*([일월화수목금토])요일/);
      if (m) {
        const target = WEEK.indexOf(m[2]);
        if (m[1]) { // 다음 주 = 월요일 시작 기준 다음 주
          const nextMon = U.addDays(today, 7 - ((now.getDay() + 6) % 7));
          return U.addDays(nextMon, (target + 6) % 7);
        }
        return U.addDays(today, (target - now.getDay() + 7) % 7);
      }
      m = t.match(/(\d{1,2})\s*일/);
      if (m && !/분/.test(t.slice(m.index, m.index + 4))) {
        const d = new Date(now.getFullYear(), now.getMonth(), +m[1]);
        if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setMonth(d.getMonth() + 1);
        return U.ymd(d);
      }
      return null;
    },

    minutes(t) {
      const h = t.match(/(\d+)\s*시간\s*(반)?/);
      const m = t.match(/(\d+)\s*분/);
      let n = 0;
      if (h) n += +h[1] * 60 + (h[2] ? 30 : 0);
      if (m) n += +m[1];
      if (!h && !m && /반\s*시간/.test(t)) n = 30;
      return n || null;
    },

    /** 받침에 맞는 조사: eul('점심') → '점심을', eul('미팅') → '미팅을', eul('회의') → '회의를' */
    batchim(w) { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 !== 0 : /[013678]$/.test(w); },
    eul(w) { return `'${w}'${this.batchim(w) ? '을' : '를'}`; },
    /** 시각 뒤 조사: '12:50으로' · '13:00로' · '12:45로' */
    ro(hm) { const m = hm.slice(-2); return `${hm}${m === '00' || m.endsWith('5') ? '로' : '으로'}`; },

    label(s) { return `${s.title} (${this.when(s)})`; },
    when(s) {
      const d = U.at(s.date, '00:00');
      return `${d.getMonth() + 1}/${d.getDate()} ${s.start}`;
    },

    // ───────── 지연: "길 막혀서 15분 늦어" ─────────
    delay(t, list, now, ctx) {
      const s = this.upcoming(list, now, true);   // 개인 일정은 비서·상대방에게 알릴 일이 아님
      if (!s) return { kind: 'answer', say: '지금 늦을 일정이 없어요.' };
      const n = this.minutes(t) || 10;
      const reason = /막혀|막힘|교통|차가/.test(t) ? '교통 체증으로 ' : '';
      const who = (s.briefing && s.briefing.who) ? `${s.briefing.who}님, ` : '';
      const arriveBy = U.addMin(U.at(s.date, s.start), -((Backtime.CATEGORIES[s.category] || {}).arriveEarlyMin || 0));
      return {
        kind: 'action',
        say: `'${s.title}'에 ${n}분 늦는다고 비서에게 알릴게요.`,
        lines: [`${s.title} · ${s.start} 시작`, `도착 예상 ${U.hm(U.addMin(arriveBy, n))} (원래 ${U.hm(arriveBy)})`, `비서에게 알림 + 상대방에게 보낼 문자 초안`],
        changes: [],
        notify: { body: `${reason}'${s.title}'에 ${n}분 정도 늦을 것 같아요. 상대방께 전달 부탁해요.`, ref: s.id },
        draft: `${who}${reason}${n}분 정도 늦을 것 같습니다. 죄송합니다. 최대한 빨리 가겠습니다.`,
      };
    },

    // ───────── 변경: "점심 30분 미뤄 줘" · "투자사 점심 1시로 옮겨 줘" ─────────
    move(t, list, now, ymd) {
      const s = this.pick(t, list, now, ymd);
      if (!s) return { kind: 'answer', say: '바꿀 일정을 찾지 못했어요. 일정 이름을 같이 말씀해 주세요.' };
      if (s.masked) return { kind: 'answer', say: '그 일정은 바꿀 수 없어요.' };
      const dur = U.diffMin(U.at(s.date, s.end || s.start), U.at(s.date, s.start));
      let start = null;
      const abs = /(로|으로)\s*(미뤄|옮겨|바꿔|변경)|에\s*(해|하자)/.test(t) ? this.time(t) : null;
      if (abs) start = abs;
      else {
        const n = this.minutes(t);
        const sign = /당겨|앞당/.test(t) ? -1 : 1;
        if (!n) return { kind: 'answer', say: `${this.eul(s.title)} 몇 분 ${sign < 0 ? '당길지' : '미룰지'}, 또는 몇 시로 옮길지 같이 말씀해 주세요.` };
        start = U.hm(U.addMin(U.at(s.date, s.start), sign * n));
      }
      const end = U.hm(U.addMin(U.at(s.date, start), dur));
      const next = { ...s, start, end };
      const all = [...list.filter(x => x.id !== s.id), next];
      const warns = [...Backtime.conflictsOn(all, s.date), ...Backtime.conflictsOn(all, U.addDays(s.date, 1))].filter(w => w.a === next || w.b === next);
      const priv = this.isPrivate(s);
      return {
        kind: 'action',
        say: `${this.eul(s.title)} ${this.ro(start)} 옮길까요?`,
        lines: [`${s.title}`, `${s.start}–${s.end} → ${start}–${end}`, ...warns.map(w => `주의: ${w.msg}`), priv ? '개인 일정이라 비서에게는 알리지 않아요' : '바꾸면 비서에게 자동으로 알려요'],
        changes: [{ op: 'upsert', schedule: next }],
        notify: priv ? null : { body: `대표님이 '${s.title}' 시간을 ${s.start} → ${this.ro(start)} 바꿨어요. 상대방께 전달 부탁해요.`, ref: s.id },
      };
    },

    // ───────── 취소: "골프 취소해 줘" · "모레 일정 다 취소해 줘" ─────────
    cancel(t, list, now, ymd) {
      const all = /다\s*취소|모두|전부|싹/.test(t);
      const rel = ymd ? this.relDay(ymd, now) : '';
      if (all) {
        if (!ymd) return { kind: 'answer', say: '어느 날 일정을 모두 취소할까요? 예: "모레 일정 다 취소해 줘"' };
        const day = list.filter(s => s.date === ymd && !s.masked && U.at(s.date, s.end || s.start) > now).sort((a, b) => a.start.localeCompare(b.start));
        if (!day.length) return { kind: 'answer', say: `${rel}은 취소할 일정이 없어요.` };
        const shared = day.filter(s => !this.isPrivate(s));
        return {
          kind: 'action',
          say: `${rel} 일정 ${day.length}건을 모두 취소할까요?`,
          lines: [...day.map(s => this.label(s)), shared.length ? '취소하면 비서에게 알리고, 상대방 연락은 비서가 해요' : '개인 일정이라 비서에게는 알리지 않아요'],
          changes: day.map(s => ({ op: 'cancel', schedule: { ...s, status: 'cancelled' } })),
          notify: shared.length ? { body: `대표님이 ${rel} 일정 ${shared.length}건을 취소했어요: ${shared.map(s => this.label(s)).join(', ')}. 상대방께 연락 부탁해요.`, ref: shared[0].id } : null,
        };
      }
      // 이름·분류를 말하지 않았고 날짜도 없으면, 엉뚱한 일정을 고르지 않게 되묻기
      if (!ymd && !this.named(t, list, now)) return { kind: 'answer', say: '어떤 일정을 취소할까요? 일정 이름이나 날짜를 같이 말씀해 주세요.' };
      const s = this.pick(t, list, now, ymd);
      if (!s || s.masked) return { kind: 'answer', say: ymd ? `${rel}은 취소할 일정을 찾지 못했어요.` : '취소할 일정을 찾지 못했어요.' };
      const priv = this.isPrivate(s);
      return {
        kind: 'action',
        say: `${this.eul(s.title)} 취소할까요?`,
        lines: [this.label(s), priv ? '개인 일정이라 비서에게는 알리지 않아요' : '취소하면 비서에게 알리고, 상대방 연락은 비서가 해요'],
        changes: [{ op: 'cancel', schedule: { ...s, status: 'cancelled' } }],
        notify: priv ? null : { body: `대표님이 '${this.label(s)}' 일정을 취소했어요. 상대방께 연락 부탁해요.`, ref: s.id },
      };
    },
    relDay(ymd, now) {
      const t = U.ymd(now);
      if (ymd === t) return '오늘';
      if (ymd === U.addDays(t, 1)) return '내일';
      if (ymd === U.addDays(t, 2)) return '모레';
      const d = U.at(ymd, '00:00');
      return `${d.getMonth() + 1}월 ${d.getDate()}일`;
    },

    // ───────── 등록: "목요일 오후 3시에 한빛전자 미팅 잡아 줘, 삼성동에서" ─────────
    create(t, list, now, ctx) {
      const date = this.date(t, now);
      const start = this.time(t);
      if (!date || !start) return { kind: 'answer', say: `${!date ? '날짜' : '시간'}를 같이 말씀해 주세요. 예: "목요일 오후 3시에 한빛전자 미팅 잡아 줘"` };
      const locM = t.match(/([^\s,]+(?:\s[^\s,]+)?)\s*에서/);
      let location = locM ? locM[1] : '';
      let title = this.titleOf(t, locM) || '새 일정';
      let category = 'external';
      for (const [re, cat] of CAT_WORDS) if (re.test(title)) { category = cat; break; }
      // '남서울 골프' 처럼 골프 앞 낱말은 골프장 이름으로 보고 장소에 넣음 (비서가 확인)
      let guessed = false;
      if (category === 'golf' && !location) {
        const g = title.match(/([^\s]+?)\s*(?:CC|cc|컨트리클럽|골프장)?\s*(?:골프|라운딩)/);
        if (g && g[1] && !/^(골프|라운딩)$/.test(g[1])) { location = g[1].replace(/(CC|cc)$/, '') + (/(CC|cc|컨트리|골프장)/.test(g[1]) ? '' : 'CC'); guessed = true; }
      }
      // '삼성동 미팅' 처럼 동네 이름 + 미팅이면 장소로
      if (!location && /^[가-힣]+동\s/.test(title)) location = title.split(' ')[0];
      const s = {
        id: U.uid(), title, category, date, start, end: U.hm(U.addMin(U.at(date, start), category === 'golf' ? 300 : 60)),
        location, origin: '', mode: location ? 'driver' : 'none', travelMin: location ? (category === 'golf' ? 60 : 30) : 0, bufferMin: 10,
        visibility: 'normal', status: 'scheduled', briefing: {}, createdBy: 'ceo', ackAt: new Date().toISOString(),
      };
      const d = U.at(date, '00:00');
      const all = [...list, s];
      const warns = [...Backtime.conflictsOn(all, date), ...Backtime.conflictsOn(all, U.addDays(date, 1))].filter(w => w.a === s || w.b === s);
      return {
        kind: 'action',
        say: `이렇게 등록할까요?`,
        lines: [title, `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]}) ${start}–${s.end}`, location ? `${location}${guessed ? ' (골프장 이름 맞나요?)' : ''} · 기사 차량 · 이동 ${s.travelMin}분(임시)` : '장소 없음 · 이동 없음', ...warns.map(w => `주의: ${w.msg}`), '등록하면 비서에게 장소 · 이동 시간 확인을 부탁해요'],
        changes: [{ op: 'upsert', schedule: s }],
        notify: { body: `대표님이 '${title}' (${d.getMonth() + 1}/${d.getDate()} ${start}) 일정을 직접 넣었어요. 장소 · 이동 시간 확인 부탁해요.`, ref: s.id },
      };
    },

    /** 말에서 날짜·시각·장소·동사를 빼고 남은 일정 이름 */
    titleOf(t, locM) {
      return t
        .replace(/(다음\s*주|담주)?\s*[일월화수목금토]요일|오늘|내일|모레|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*일/g, ' ')
        .replace(/(오전|오후|아침|저녁|밤|낮|새벽)?\s*\d{1,2}\s*시\s*(반|\d{1,2}\s*분)?|\d{1,2}:\d{2}/g, ' ')
        .replace(locM ? locM[0] : /$^/, ' ')
        .replace(/(잡아|추가해|등록해|넣어|만들어)\s*(줘|주세요|줄래|라)?|일정|에\b|,/g, ' ')
        .replace(/\s+/g, ' ').trim().replace(/^에\s*/, '').replace(/\s*(을|를)$/, '');
    },

    // ───────── 질문: "내일 첫 출발 몇 시야?" · "오늘 일정 알려 줘" ─────────
    ask(t, list, now, ctx) {
      const ymd = this.date(t, now) || U.ymd(now);
      const rel = ymd === U.ymd(now) ? '오늘' : ymd === U.addDays(U.ymd(now), 1) ? '내일' : this.when({ date: ymd, start: '' }).trim();
      const day = this.plan(list, ymd, ctx);
      // 시각 앞에 붙일 말: 일정 날짜와 다른 날(전날 밤)이면 '오늘 밤'
      const at = d => (U.ymd(d) !== ymd ? (U.ymd(d) === U.ymd(now) ? '오늘 밤 ' : '전날 ') : '') + U.hm(d);
      if (/끝나|마치|퇴근/.test(t)) {
        if (!day.length) return { kind: 'answer', say: `${rel}은 일정이 없어요.` };
        const last = day.reduce((m, x) => x.p.endAt > m.p.endAt ? x : m);
        return { kind: 'answer', say: `${rel} 마지막 일정은 '${last.s.title}'이고 ${U.ymd(last.p.endAt) !== ymd ? '다음 날 ' : ''}${U.hm(last.p.endAt)}에 끝나요.` };
      }
      if (/출발|나가|기상|일어나/.test(t)) {
        const first = day.find(({ s, p }) => s.mode !== 'none' && (ymd !== U.ymd(now) || p.leaveAt > now));
        if (!first) return { kind: 'answer', say: `${rel}은 나가실 일정이 없어요.` };
        const { s, p } = first;
        return { kind: 'answer', say: `${rel} ${ymd === U.ymd(now) ? '다음' : '첫'} 출발은 ${at(p.leaveAt)}이에요. '${s.title}' ${s.start} 시작${p.driverCallAt ? `, 기사님은 ${at(p.driverCallAt)}부터 대기` : ''}${p.wakeAt ? `, 기상은 ${at(p.wakeAt)}` : ''}.` };
      }
      if (!day.length) return { kind: 'answer', say: `${rel}은 일정이 없어요.` };
      return { kind: 'answer', say: `${rel} 일정 ${day.length}건이에요. ` + day.map(({ s }) => `${s.start} ${s.title}`).join(' · ') };
    },
  };

  root.Assistant = A;
  if (typeof module !== 'undefined') module.exports = A;
})(typeof window !== 'undefined' ? window : globalThis);
