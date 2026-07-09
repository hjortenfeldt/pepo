// Freelancer-appens service worker. Har lige nu kun ét job: modtage
// push-beskeder fra serveren (se lib/push.ts) og vise dem som en
// systemnotifikation, samt åbne/fokusere appen når man trykker på en.
// Ingen offline-cache endnu — kan udbygges senere, hvis det bliver relevant.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Pepo", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Pepo";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
