/* =========================================
   CEO플래너 — 데모 데이터 (처음 열었을 때 채워 넣는 샘플)
   날짜는 항상 '오늘' 기준으로 만듭니다.
   ========================================= */
const Demo = {
  /** 데모 공지사항 */
  notices() {
    // 데모를 처음 만들 때 한 번만 정해 저장 (매일 '새 글'로 바뀌지 않게) · 한국 시간 오전 9시
    const day = n => U.at(U.addDays(U.today(), -n), '09:00').toISOString();
    return [
      { id: 'n1', pinned: true, at: day(3), title: 'CEO플래너에 오신 걸 환영해요',
        body: '비서님이 일정을 넣으면 대표님 앱에 바로 보여요.\n출발 · 기사 호출 시간은 앱이 거꾸로 계산해 알려 드려요.\n일정이 겹치면 홈 화면에 빨간 줄로 표시돼요.' },
      { id: 'n2', at: day(1), title: 'AI 비서 사용법',
        body: '아래 메뉴 가운데 마이크를 누르고 말씀하세요.\n예: "점심 30분 미뤄 줘", "길 막혀서 15분 늦어"\n바꾸기 전에 꼭 한 번 확인을 받아요.' },
      { id: 'n3', at: day(0), title: '무료 체험 14일 안내',
        body: '가입 후 14일 동안 AI 비서까지 모두 무료로 쓸 수 있어요.\n체험이 끝나기 전에 내 정보 > 구독에서 요금제를 고를 수 있어요.' },
    ];
  },
  /** 데모 회사 구독: 무료 체험 10일 남음 */
  company() {
    return { plan: 'trial', trialUntil: new Date(Date.now() + 10 * 86400000).toISOString(), paidUntil: null, extraExecs: 0 };
  },
  /** 데모 회사 계정 (계정 관리 화면용) */
  members(p = {}) {
    return [
      { loginId: 'kim', name: p.name || '김대표', role: 'ceo', phone: p.ceoPhone || '' },
      { loginId: 'lee', name: p.secretaryName || '이비서', role: 'secretary', phone: p.secretaryPhone || '' },
      { loginId: 'park', name: p.driverName || '박기사', role: 'driver', phone: p.driverPhone || '' },
    ];
  },
  /** 지난 3주 기록 — 실제 출발·도착 시각과 식사 평가가 있는 일정 */
  history(t, S) {
    const at = (d, hm) => U.at(d, hm).toISOString();
    const trip = (n, depart, min, extra = {}) => { const d = U.addDays(t, -n);
      return S({ title: '한빛전자 실무 미팅', category: 'external', date: d, start: '10:00', end: '11:00', location: '한빛전자 삼성동 사옥', origin: '본사', mode: 'driver', travelMin: 35, ackAt: at(d, '08:00'),
        actual: { departAt: at(d, depart), arriveAt: U.addMin(U.at(d, depart), min).toISOString() }, ...extra }); };
    const meal = (n, title, place, rating, b = {}) => { const d = U.addDays(t, -n);
      return S({ title, category: 'dinner', date: d, start: '12:00', end: '13:30', location: place, mode: 'driver', travelMin: 25, ackAt: at(d, '08:00'), actual: { rating }, briefing: b }); };
    return [
      trip(15, '09:05', 40), trip(9, '09:03', 45), trip(4, '09:08', 41),
      meal(13, '그린벤처스 점심', '광화문 한정식 소담', 'good', { who: '최서연 상무', company: '그린벤처스' }),
      meal(11, '대한건설 오찬', '청담 스시 오마카세', 'bad', { who: '윤태식 회장', company: '대한건설' }),
      meal(7, '한빛전자 점심', '광화문 한정식 소담', 'good', { who: '정민호 부사장', company: '한빛전자' }),
      meal(5, '협력사 점심', '여의도 중식당 루이', 'ok', { who: '박지훈 대표', company: '루이테크' }),
      meal(2, '이사회 오찬', '삼청동 이탈리안 산마리노', 'good', { who: '사외이사 3명', company: '' }),
    ];
  },

  build() {
    const t = U.today(), d1 = U.addDays(t, 1), d2 = U.addDays(t, 2);
    const S = (o) => ({ id: U.uid(), visibility: 'normal', bufferMin: 10, status: 'scheduled', ackAt: null, briefing: {}, createdBy: 'secretary', ...o });
    return {
      profile: { name: '김대표', prepMin: 60, ceoPhone: '010-0000-0000', secretaryName: '이비서', secretaryPhone: '010-0000-0001', driverName: '박기사', driverPhone: '010-0000-0002' },
      schedules: [
        S({ title: '주간 임원 회의', category: 'meeting', date: t, start: '08:30', end: '09:30', location: '본사 15층 대회의실', mode: 'none', ackAt: new Date().toISOString() }),
        S({ title: '한빛전자 협력 미팅', category: 'external', date: t, start: '11:00', end: '12:00', location: '한빛전자 삼성동 사옥', mode: 'driver', travelMin: 35,
            briefing: { who: '정민호 부사장', company: '한빛전자 · 전략기획', purpose: '하반기 공동 개발 범위 합의', notes: '지난번 단가 이야기는 꺼내지 않기로 함', last: '9월 첫 미팅 — 기술 검토 요청 받음', bring: '제안서 2부, 명함' } }),
        S({ title: '투자사 점심', category: 'dinner', date: t, start: '12:20', end: '13:30', location: '광화문 한정식 소담', mode: 'driver', travelMin: 30,
            briefing: { who: '최서연 상무', company: '그린벤처스', purpose: '시리즈 B 분위기 파악', notes: '채식 위주로 예약함', bring: '' } }),
        S({ title: '가족 저녁', category: 'personal', date: t, start: '19:00', end: '21:00', location: '', mode: 'none', visibility: 'private', createdBy: 'ceo' }),
        S({ title: '대한건설 회장 라운딩', category: 'golf', date: d1, start: '07:30', end: '13:00', location: '레이크사이드CC', mode: 'driver', travelMin: 60,
            briefing: { who: '윤태식 회장 외 2명', company: '대한건설', purpose: '관계 유지', notes: '동반자: 윤태식 회장, 한상우 대표, 김대표', bring: '골프백 차량 적재 확인' } }),
        S({ title: '부산 지사 방문', category: 'trip', date: d2, start: '11:00', end: '17:00', location: '부산 지사', mode: 'train', travelMin: 25,
            trip: { station: '서울역', departTime: '08:00', arriveTime: '10:30', accessMin: 30, accessMode: 'driver' } }),
        // 지난 기록 (학습 · 추천 시연용): 본사 → 한빛전자 실제 이동 40·45·41분, 식사 장소 평가
        ...this.history(t, S),
      ],
      company: this.company(),
      notices: this.notices(),
      messages: [
        { id: U.uid(), from: 'secretary', body: '대표님, 내일 라운딩은 새벽 5시 20분 출발입니다. 기사님께도 전달했습니다.', urgent: false, at: new Date(Date.now() - 3600e3).toISOString() },
      ],
    };
  },
};
