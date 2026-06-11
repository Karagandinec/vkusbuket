// Этот код регистрирует сервис-воркер в промышленной сборке для оффлайн работы приложения.
// При обнаружении новой версии — страница автоматически перезагружается.
// Используется в index.js.

let _refreshing = false;

export function register() {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {

    // Когда новый сервис-воркер становится активным контроллером —
    // автоматически перезагружаем страницу (один раз, без петли).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_refreshing) return;
      _refreshing = true;
      console.log('[PWA] Новая версия активирована. Перезагрузка...');
      window.location.reload();
    });

    window.addEventListener('load', () => {
      // Формируем путь к сервис-воркеру с учётом PUBLIC_URL
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('[PWA] ServiceWorker зарегистрирован. Область:', registration.scope);

          // Принудительно проверяем обновление при каждой загрузке страницы
          registration.update().catch(() => {});

          // Отслеживание установки новой версии воркера
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker == null) return;

            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // Новый воркер установлен поверх старого:
                  // отправляем ему команду немедленно взять управление (skipWaiting).
                  // После этого сработает событие 'controllerchange' выше → reload().
                  console.log('[PWA] Новая версия доступна, активируем...');
                  installingWorker.postMessage({ type: 'SKIP_WAITING' });
                } else {
                  // Первая установка — ресурсы закэшированы
                  console.log('[PWA] Контент закэширован для автономной работы.');
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
