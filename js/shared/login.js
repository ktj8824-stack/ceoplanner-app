/* CEO플래너 — 로그인 화면 (Supabase 모드에서만 사용) */
const Login = {
  render(root, title, onDone) {
    root.innerHTML = `
      <form class="login card" id="loginForm">
        <h2 style="margin:0">${U.esc(title)}</h2>
        <input type="email" name="email" placeholder="이메일" required autocomplete="username">
        <input type="password" name="pw" placeholder="비밀번호" required autocomplete="current-password">
        <button class="btn primary" type="submit">로그인</button>
        <p class="muted small" id="loginErr" style="margin:0"></p>
        <a class="muted small" href="privacy.html" target="_blank">개인정보 처리방침</a>
      </form>`;
    root.querySelector('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      try { await Store.signIn(f.email.value.trim(), f.pw.value); onDone(); }
      catch (err) { root.querySelector('#loginErr').textContent = '로그인 실패: ' + (err.message || err); }
    });
  },
};
