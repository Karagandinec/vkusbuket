/* eslint-disable no-restricted-globals */

// Имя кэша приложения — меняйте при изменении структуры кэшируемых файлов
const CACHE_NAME = 'vkusbuket-cache-v2';

// Список базовых ресурсов для предварительного кэширования (App Shell)
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// Событие установки: кэшируем основные ресурсы ядра
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Кэширование оболочки приложения');
        return cache.addAll(ASSETS_TO_CACHE);
      })
    // НЕ вызываем skipWaiting() здесь автоматически.
    // Вместо этого ждём команды SKIP_WAITING от клиента (serviceWorkerRegistration.js),
    // чтобы контролировать момент обновления и избежать неожиданной перезагрузки.
  );
});

// Событие активации: очищаем старые версии кэшей
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Удаление старого кэша:', cache);
            return caches.delete(cache);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim()) // Берём управление над всеми открытыми вкладками
  );
});

// Команда от клиента: немедленно взять управление (вызывается из serviceWorkerRegistration.js)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Получена команда SKIP_WAITING. Активируем новую версию.');
    self.skipWaiting();
  }
});

// Перехват сетевых запросов
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Обрабатываем только GET-запросы и игнорируем запросы к Supabase API,
  // чтобы не ломать оффлайн-очередь в App.js
  if (event.request.method !== 'GET' || requestUrl.host.includes('supabase.co')) {
    return;
  }

  // Статические ресурсы сборки Webpack (скрипты с хэшами, стили, шрифты, картинки).
  // Они неизменны между деплоями — хэш в имени файла гарантирует уникальность.
  const isStaticAsset = event.request.url.startsWith(self.location.origin) &&
    (requestUrl.pathname.includes('/static/') ||
     requestUrl.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|otf)$/));

  if (isStaticAsset) {
    // Стратегия: Cache First для статики (быстро, файл с новым хэшем = новый файл)
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        });
      })
    );
  } else {
    // Стратегия: Network First для index.html и навигационных запросов.
    // Всегда пытаемся загрузить свежую версию из сети,
    // и только при отсутствии интернета отдаём из кэша.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Кэшируем свежую копию
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Сеть недоступна — берём из кэша
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Навигационный запрос без кэша — отдаём index.html
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return null;
          });
        })
    );
  }
});
