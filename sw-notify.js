// CEO플래너 알림 전용 서비스워커 — 화면 파일은 캐시하지 않음(항상 새 버전)
//  알림을 누르면 알림에 담긴 주소(출발 알림은 ?go=next → 바로 길안내)로 앱을 엶
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find(c => c.url.startsWith(self.registration.scope));
    if (w) { try { await w.focus(); if ('navigate' in w) { await w.navigate(url); return; } } catch (err) { } }
    await self.clients.openWindow(url);
  })());
});
