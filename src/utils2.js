const LS = (key,def) => { try { const v=localStorage.getItem(key); return v?JSON.parse(v):def; } catch{ return def; } };

const generateUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
};

// getMergedList: O(n) через Map вместо O(n²) через findIndex
const getMergedList = (fetched, local, tableName) => {
  const queue = LS("vb_sync_queue", []);
  // Строим Set ID записей с pending-синхронизацией для O(1) проверки
  const pendingIds = new Set(
    queue
      .filter(q => q.table === tableName)
      .flatMap(q => {
        const ids = [];
        if (q.body?.id) ids.push(q.body.id);
        if (q.params) {
          const m = q.params.match(/id=eq\.([^&]+)/);
          if (m) ids.push(m[1]);
        }
        return ids;
      })
  );

  // Строим Map из fetched для O(1) lookup
  const mergedMap = new Map(fetched.map(item => [item.id, item]));

  // Local-записи с pending sync имеют приоритет; остальные local-only добавляем
  local.forEach(localItem => {
    if (!mergedMap.has(localItem.id)) {
      mergedMap.set(localItem.id, localItem);
    } else if (pendingIds.has(localItem.id)) {
      mergedMap.set(localItem.id, localItem); // local-версия актуальнее
    }
  });

  return Array.from(mergedMap.values());
};

// Проверяет, не истекла ли сессия (всегда валидна, если пользователь авторизован)
const isSessionValid = () => {
  try {
    return !!localStorage.getItem("vb_session_user");
  } catch { return false; }
};

// Сохраняет метку времени входа
const touchSession = () => {
  try { localStorage.setItem("vb_session_ts", String(Date.now())); } catch {}
};

// ─── ЦВЕТА ───────────────────────────────────────────────────────────────────


// ─── TOAST ───────────────────────────────────────────────────────────────────
// React.memo: Toast перерендерится только при изменении toast-объекта

// ─── ДАШБОРД ─────────────────────────────────────────────────────────────────

// ─── КАССА ───────────────────────────────────────────────────────────────────

// ─── КАСТОМНЫЙ КОНСТРУКТОР БУКЕТОВ (МАСТЕРСКАЯ) ──────────────────────────────────


// ─── ПРОИЗВОДСТВО И ПЕРЕМЕЩЕНИЕ ──────────────────────────────────────────────

// ─── СКЛАД ───────────────────────────────────────────────────────────────────


// ─── ОТЧЕТЫ ──────────────────────────────────────────────────────────────────

// ─── НАСТРОЙКИ ───────────────────────────────────────────────────────────────

// ─── СПИСАНИЯ ────────────────────────────────────────────────────────────────

// ─── ЖУРНАЛ СМЕН ──────────────────────────────────────────────────────────────
// React.memo: перерендерится только при изменении списка смен

// ─── PIN ЭКРАН ────────────────────────────────────────────────────────────────







async function supaFetch(method, table, body=null, params="") {
  if (!SUPA_URL || !SUPA_KEY) return method === "GET" ? [] : false;
  const url = `${SUPA_URL}/rest/v1/${table}${params}`;

  if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
    try {
      const tid = localStorage.getItem("vb_tenant_id");
      if (tid && !table.startsWith("rpc/")) {
        if (Array.isArray(body)) {
          body = body.map(item => ({ ...item, tenant_id: tid }));
        } else if (typeof body === "object") {
          body = { ...body, tenant_id: tid };
        }
      }
    } catch (e) {}
  }

  // Вспомогательная функция добавления в очередь с UUID и дедупликацией PATCH
  const enqueueOp = () => {
    try {
      const queue = LS("vb_sync_queue", []);
      const op = { method, table, body, params, id: generateUUID(), enqueuedAt: Date.now() };
      // Дедупликация: для PATCH/DELETE заменяем существующую операцию для той же записи
      if (method === "PATCH" || method === "DELETE") {
        const existIdx = queue.findIndex(q => q.table === table && q.params === params && q.method === method);
        if (existIdx >= 0) { queue[existIdx] = op; }
        else { queue.push(op); }
      } else {
        queue.push(op);
      }
      localStorage.setItem("vb_sync_queue", JSON.stringify(queue));
    } catch {}
  };

  // Оффлайн-очередь для операций записи (POST, PATCH, DELETE)
  if (method !== "GET" && typeof window !== "undefined" && window.navigator && !window.navigator.onLine) {
    enqueueOp();
    console.warn(`Устройство оффлайн. Запрос ${method} ${table} добавлен в очередь синхронизации.`);
    return true;
  }

  try {
    const res = await fetch(url,{
      method,
      headers:{
        "apikey":SUPA_KEY,
        "Authorization":`Bearer ${localStorage.getItem("vb_tenant_jwt") || SUPA_KEY}`,
        "Content-Type":"application/json",
        "Prefer": method === "POST" ? "resolution=merge-duplicates" : "return=minimal",
      },
      body: body?JSON.stringify(body):null,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`supaFetch ${method} ${table} failed with status ${res.status}: ${errText}`);
      if (res.status === 401) {
        if (typeof window !== 'undefined') {
          console.warn("Global 401 token expiry. Logging out.");
          localStorage.removeItem("vb_tenant_jwt");
          window.location.reload();
        }
      }
      if (method !== "GET") {
        if (!(res.status === 404 && method === "DELETE")) {
          enqueueOp();
        }
      }
      return method === "GET" ? [] : false;
    }
    if (method === "GET") {
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    }
    return true;
  } catch (e) {
    console.warn(`supaFetch ${method} ${table} network error:`, e);
    if (method !== "GET") { enqueueOp(); }
    return method === "GET" ? [] : false;
  }
}

// Проверка наличия RPC для атомарного списания (защита от гонки данных)
let RPC_ENABLED = false;
async function checkRpcExists() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/update_raw_stock_atomic`, {
      method: "POST", headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${localStorage.getItem("vb_tenant_jwt") || SUPA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_raw_id: "test", p_point: "test", p_delta: 0 })
    });
    RPC_ENABLED = res.status !== 404;
  } catch(e) {}
}
// Запускаем проверку при загрузке
if (typeof window !== "undefined") {
  checkRpcExists();
}

function fmtUnit(u) { return u === "г" ? "гр." : u; }

// ─── ГЛАВНОЕ ПРИЛОЖЕНИЕ ───────────────────────────────────────────────────────
const checkIsMobile = () => {
  if (typeof window === "undefined") return false;
  // window.screen.width/height — физический размер, не зависит от ориентации
  const minDim = Math.min((window.screen && window.screen.width) || 0, (window.screen && window.screen.height) || 0);
  const isPhone = minDim < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test((window.navigator && window.navigator.userAgent) || "");
  return isPhone;
};

// Портретный режим: надёжное определение для Android (включая Samsung One UI)
const checkIsPortrait = () => {
  if (typeof window === "undefined") return false;
  // Наиболее надёжный: сравниваем innerWidth vs innerHeight — всегда актуально
  if (window.innerWidth > 0 && window.innerHeight > 0) {
    return window.innerWidth < window.innerHeight;
  }
  // Современный API (Chrome Android, Safari iOS 16.4+)
  if (window.screen && window.screen.orientation) {
    return window.screen.orientation.type.startsWith("portrait");
  }
  // Fallback: устаревший window.orientation
  if (typeof window.orientation !== "undefined") {
    return window.orientation === 0 || window.orientation === 180;
  }
  return true;
};

