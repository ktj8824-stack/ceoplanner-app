/* CEO플래너 — 로그인 화면 (Supabase 모드에서만 사용)
   스스로 가입 · 카카오/구글 로그인 없음. 회사(운영자)가 발급한 아이디 + 비밀번호로만 들어옵니다. */
const Login = {
  render(root, title, onDone) {
    root.innerHTML = `
      <form class="login card" id="loginForm" autocomplete="on">
        <h2 style="margin:0">${U.esc(title)}</h2>
        <input type="text" name="uid" placeholder="아이디" required autocomplete="username"
               autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="latin">
        <input type="password" name="pw" placeholder="비밀번호" required autocomplete="current-password">
        <button class="btn primary" type="submit">로그인</button>
        <p class="small" id="loginErr" role="alert" style="margin:0;color:var(--signal)">${U.esc(Store.loginError || '')}</p>
        <p class="muted small" style="margin:0">계정은 회사에서 발급해요. 아이디·비밀번호를 잊었다면 담당자에게 문의해 주세요.</p>
        <a class="muted small" href="privacy.html" target="_blank">개인정보 처리방침</a>
      </form>`;
    root.querySelector('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, btn = f.querySelector('button');
      btn.disabled = true;
      try { await Store.signIn(f.uid.value, f.pw.value); onDone(); }
      catch (err) { root.querySelector('#loginErr').textContent = err.message || String(err); }
      finally { btn.disabled = false; }
    });
  },
};
