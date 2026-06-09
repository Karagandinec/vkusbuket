// Этот код регистрирует сервис-воркер в промышленной сборке для оффлайн работы приложения.
// Используется в index.js.

export function register() {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      // Формируем путь к сервис-воркеру с учетом PUBLIC_URL (полезно при деплое на поддомены)
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('[PWA] ServiceWorker успешно зарегистрирован. Область видимости:', registration.scope);

          // Отслеживание обновления версии приложения
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker == null) return;
            
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // Новая версия доступна. Сообщаем об этом (например, через консоль или пользовательский эвент)
                  console.log('[PWA] Доступно обновление приложения. Пожалуйста, перезапустите вкладку.');
                  window.dispatchEvent(new CustomEvent('pwa-update-available', { detail: registration }));
                } else {
                  // Все ресурсы кэшированы для оффлайн работы
                  console.log('[PWA] Контент кэширован для автономной работы.');
                }
              }
            };
          };
        })
        .catch((error) => {
          console.error('[PWA] Ошибка при регистрации ServiceWorker:', error);
        });
    });
  }
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
        console.log('[PWA] ServiceWorker отключен.');
      })
      .catch((error) => {
        console.error('[PWA] Ошибка при отключении ServiceWorker:', error);
      });
  }
}
