/* =========================================
   CEO플래너 — 주소·연결 설정
   Supabase 주소와 publishable 키를 넣으면 실제 서버와 연동되고,
   비워 두면 데모 모드(이 브라우저 안에서만 저장)로 동작합니다.
   ⚠️ service_role / sb_secret_ 키는 절대 여기에 넣지 마세요.

   주소: 개발용 PC(localhost)에서는 같은 폴더 파일을,
         배포 후에는 GitHub Pages 주소를 씁니다. 도메인을 바꾸면 APP / WEB 두 줄만 고치세요.
   ========================================= */
(function () {
  const APP = 'https://ktj8824-stack.github.io/ceoplanner-app/';  // CEO 앱 (ceoplanner-app 저장소)
  const WEB = 'https://ktj8824-stack.github.io/ceoplanner-web/';  // 비서 웹 (ceoplanner-web 저장소)
  const isDev = ['localhost', '127.0.0.1', ''].includes(location.hostname) || location.protocol === 'file:';
  window.CEOP_CONFIG = Object.freeze({
    SUPABASE_URL: '',
    SUPABASE_KEY: '', // sb_publishable_... 키만
    // 토스페이먼츠 결제위젯 클라이언트 키 — 지금은 토스 문서용 공개 테스트 키 (실제 돈 안 나감). 가맹 후 live_gck_... 로 교체
    TOSS_CLIENT_KEY: 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm',
    PAY_URL: APP + 'payment.html',   // 아이폰 앱에서는 사파리로 이 결제 화면을 열어요
    LOGIN_DOMAIN: 'ceoplanner.invalid', // 발급 아이디 kim → kim@ceoplanner.invalid (스스로 가입 · 카카오/구글 없음)
    APP_URL: isDev ? './index.html' : APP,
    SECRETARY_URL: isDev ? './secretary.html' : WEB,
  });
})();
