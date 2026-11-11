/* =========================================
   CEO플래너 — 상대방에게 보낼 문자 초안 (비서가 고쳐서 보냄)
   일정 시간을 바꾸거나 취소했을 때, 만날 분께 보낼 정중한 문장을 만들어요.
   순수 함수 → tests/learn-test.cjs
   ========================================= */
(function (root) {
  const U = root.U || require('./utils.js');
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

  const Drafts = {
    when(date, start) {
      const d = U.at(date, '00:00');
      return `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEK[d.getDay()]}) ${start}`;
    },
    /** '정민호 부사장' → '정민호 부사장님, 안녕하세요.' */
    hello(b) {
      const who = String((b && b.who) || '').split(/[,·]| 외 /)[0].trim();
      return who ? `${who.replace(/님$/, '')}님, 안녕하세요.` : '안녕하세요.';
    },
    me(p) {
      const ceo = (p && p.name) || '대표';
      const sec = (p && p.secretaryName) || '';
      return `${ceo}님 비서${sec ? ' ' + sec : ''}입니다.`;
    },
    what(s) { return s.category === 'golf' ? '라운딩' : s.category === 'dinner' ? '식사' : '미팅'; },

    /** 시간 변경 — from/to: { date, start } */
    change(s, from, to, profile) {
      const sameDay = from.date === to.date;
      const target = sameDay ? to.start : this.when(to.date, to.start);
      return `${this.hello(s.briefing)} ${this.me(profile)}\n` +
        `${this.when(from.date, from.start)} ${this.what(s)} 시간을 ${target}${to.start.slice(-2) === '00' || to.start.endsWith('5') ? '로' : '으로'} 조정 부탁드려도 될까요?\n` +
        `어려우시면 편하신 시간을 말씀해 주시면 맞추겠습니다. 감사합니다.`;
    },

    /** 취소 */
    cancel(s, profile) {
      return `${this.hello(s.briefing)} ${this.me(profile)}\n` +
        `${this.when(s.date, s.start)} ${this.what(s)}에 대표님이 부득이하게 참석하기 어렵게 되었습니다.\n` +
        `갑작스럽게 말씀드려 죄송합니다. 편하신 날을 다시 여쭙겠습니다.`;
    },
  };

  root.Drafts = Drafts;
  if (typeof module !== 'undefined') module.exports = Drafts;
})(typeof window !== 'undefined' ? window : globalThis);
