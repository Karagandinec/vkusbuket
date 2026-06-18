import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Toast, useToast } from "./components/Toast";
import { createClient } from "@supabase/supabase-js";
import { SUPA_URL, SUPA_KEY } from "./utils";
import {
  getConvertedQty, INIT_USERS, initRawStock, initSemiStock, INIT_TECH_CARDS, CAT_COLORS, NAV, fmtM, fmtS, fmt, PAY_LABELS, fmtPay, parseQtyObj, parseSemiQtyObj, getQty, parseLocalDate, getPackagingItems, calcCost, calcProductCOGS, calcCartItemCOGS, getIngName, getIngUnit, restoreStockForSale, processSaleStock, LS, generateUUID, getMergedList, isSessionValid, touchSession, RPC_ENABLED, fmtUnit, checkIsMobile, checkIsPortrait, setWarehouseHistoryWithSync, setWriteOffsWithSync, setUsersWithSync, setCustomersWithSync, setRawStockWithSync, setSemiStockWithSync, setTechCardsWithSync, setSalesWithSync, setExpensesWithSync, checkAdminOrManager, isAdmin, isManager, isSurgeon, canWriteOff, canAddShift, supabase, supaFetch, setSessionExpiredHandler
} from "./utils";
import Settings from './pages/Settings';
import SearchableSelect from "./components/SearchableSelect";
import CustomBouquetModal from "./components/CustomBouquetModal";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Production from "./pages/Production";
import Warehouse from "./pages/Warehouse";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import Inventory from "./pages/Inventory";
import WriteOff from "./pages/WriteOff";
import Shifts from "./pages/Shifts";
import Preorders from "./pages/Preorders";
import PinScreen from "./pages/PinScreen";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "./constants";

export default function App(){

  const [tenantAuth, setTenantAuth] = useState(null);

  // Добавляем хендлер истечения сессии
  useEffect(() => {
    setSessionExpiredHandler(() => {
      console.warn("Global session expired handler triggered.");
      setTenantAuth(null);
      localStorage.removeItem("vb_tenant_jwt");
      localStorage.removeItem("vb_supabase_session");
      window.location.reload();
    });
  }, []);

  // Восстанавливаем состояние авторизации при загрузке
  useEffect(() => {
    if (!supabase) return;
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setTenantAuth({ access_token: session.access_token });
        localStorage.setItem("vb_tenant_jwt", session.access_token);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setTenantAuth({ access_token: session.access_token });
        localStorage.setItem("vb_tenant_jwt", session.access_token);
      } else {
        setTenantAuth(null);
        localStorage.removeItem("vb_tenant_jwt");
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPassword, setTenantPassword] = useState("");
  const [tenantAuthenticating, setTenantAuthenticating] = useState(false);
  const [tenantError, setTenantError] = useState("");
  const [showTenantPassword, setShowTenantPassword] = useState(false);

  const loginTenant = async () => {
    if (!supabase) return;
    setTenantAuthenticating(true);
    setTenantError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: tenantEmail, password: tenantPassword });
    setTenantAuthenticating(false);
      if (error) {
        setTenantError("Ошибка входа: " + error.message);
      } else {
        localStorage.setItem("vb_tenant_jwt", data.session.access_token);
        if (data.user?.app_metadata?.tenant_id) {
          localStorage.setItem("vb_tenant_id", data.user.app_metadata.tenant_id);
        }
        localStorage.removeItem("vb_sync_queue");
        setTenantAuth({ access_token: data.session.access_token });
      }
    };

  const registerTenant = async () => {
    if (!supabase) return;
    setTenantAuthenticating(true);
    setTenantError("");
    const { data, error } = await supabase.auth.signUp({ email: tenantEmail, password: tenantPassword });
    setTenantAuthenticating(false);
    if (error) {
      setTenantError("Ошибка регистрации: " + error.message);
    } else {
      setTenantError("Регистрация успешна! Теперь вы можете войти.");
    }
  };

  // Восстанавливаем сессию из localStorage (с проверкой TTL 8 часов)
  const [currentUser,setCurrentUser] = useState(() => {
    if (!isSessionValid()) {
      // Сессия истекла — чистим хранилище и показываем PIN-экран
      localStorage.removeItem("vb_session_user");
      localStorage.removeItem("vb_session_page");
      localStorage.removeItem("vb_session_shift");
      return null;
    }
    return LS("vb_session_user", null);
  });
  const [page,setPage]               = useState(() =>
    isSessionValid() ? LS("vb_session_page", "dashboard") : "dashboard"
  );
  const [sidebarOpen,setSidebarOpen] = useState(true);
  const [showUserMenu,setUserMenu]   = useState(false);
  const [loading,setLoading]         = useState(true);
  const [isMobile, setIsMobile]      = useState(checkIsMobile());
  const [isPortrait, setIsPortrait]   = useState(checkIsPortrait());
  const [isOffline, setIsOffline]     = useState(typeof window !== "undefined" && window.navigator ? !window.navigator.onLine : false);

  // useRef для currentUser — решает stale closure в Realtime-подписке
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Временная метка сессии touchSession() сохранена для совместимости, автоматический выход отключен по требованию пользователя.

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const [rawStock,  setRawStock]   = useState(() => {
    const loaded = LS("vb_raw", initRawStock);
    return Array.isArray(loaded) ? loaded.map(r => ({ ...r, qty: parseQtyObj(r.qty) })) : initRawStock;
  });
  const [semiStock, setSemiStock]  = useState(() => {
    const loaded = LS("vb_semi", initSemiStock);
    return Array.isArray(loaded) ? loaded.map(s => ({ ...s, qty: parseSemiQtyObj(s.qty) })) : initSemiStock;
  });
  const [techCards, setTechCards]  = useState(() => {
    const loaded = LS("vb_tc", INIT_TECH_CARDS);
    return Array.isArray(loaded) ? loaded.map(t => ({ ...t, ings: t.ings || [] })) : INIT_TECH_CARDS;
  });
  const [sales,     setSales]      = useState(() => {
    const loaded = LS("vb_sales", []);
    return Array.isArray(loaded) ? loaded.map(s => {
      const dObj = s.created_at ? new Date(s.created_at) : new Date();
      return { ...s, id: s.id || generateUUID(), date: s.date || dObj.toLocaleDateString("ru-RU") };
    }) : [];
  });
  const [expenses,  setExpenses]   = useState(() => {
    const loaded = LS("vb_exp", []);
    return Array.isArray(loaded) ? loaded.map(e => ({ ...e, id: e.id || generateUUID() })) : [];
  });
  const [users,     setUsers]      = useState(() => {
    const loaded = LS("vb_users", INIT_USERS);
    const clean = Array.isArray(loaded)
      ? loaded.filter(u => u.id && u.id.length >= 36)
              .map(u => ({ ...u, pin: String(u.pin || "") }))  // ВСЕГДА строка!
      : [];
    return clean.length ? clean : INIT_USERS;
  });
  const [toast,showToast]          = useToast();
  const [currentShift,setCurrentShift] = useState(() => LS("vb_session_shift", null));
  const [showOpenShift,setShowOpenShift] = useState(false);
  const [customers, setCustomers] = useState(() => LS("vb_customers", []));
  const [companyName, setCompanyName] = useState("SweetSync");
  const [warehouseHistory, setWarehouseHistory] = useState(() => LS("vb_warehouse_history", []));
  const [writeOffs, setWriteOffs] = useState(() => LS("vb_writeoffs_log", []));
  const [shifts, setShifts] = useState(() => LS("vb_shifts", []));
  const [preorders, setPreorders] = useState(() => {
    const loaded = LS("vb_preorders", []);
    return Array.isArray(loaded) ? loaded : [];
  });
const setWarehouseHistoryWithSync = (updater) => {
    setWarehouseHistory(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(item => supaFetch("POST", "warehouse_history", item).catch(()=>{}));
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "warehouse_history", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setWriteOffsWithSync = (updater) => {
    setWriteOffs(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(item => supaFetch("POST", "write_offs", {
        id: item.id,
        item_id: item.itemId,
        stock: item.stock,
        date: item.date,
        time: item.time,
        item: item.item,
        qty: item.qty,
        unit: item.unit,
        reason: item.reason,
        author: item.author,
        note: item.note,
        location: item.location
      }).catch(()=>{}));
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "write_offs", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setUsersWithSync = (updater) => {
    setUsers(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(u => {
        const old = prev.find(p => p.id === u.id);
        if (!old) {
          supaFetch("POST", "app_users", { id: u.id, name: u.name, role: u.role, point: u.point, pin: u.pin, is_active: true }).catch(()=>{});
        } else if (JSON.stringify(old) !== JSON.stringify(u)) {
          supaFetch("PATCH", "app_users", { name: u.name, role: u.role, point: u.point, pin: u.pin }, `?id=eq.${u.id}`).catch(()=>{});
        }
      });
      prev.forEach(old => {
        if (!next.find(n => n.id === old.id)) {
          supaFetch("PATCH", "app_users", { is_active: false }, `?id=eq.${old.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setCustomersWithSync = (updater) => {
    setCustomers(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(c => supaFetch("POST", "customers", c).catch(()=>{}));
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (oldItem && JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
          supaFetch("PATCH", "customers", { name: newItem.name, phone: newItem.phone, discount_percent: newItem.discount_percent }, `?id=eq.${newItem.id}`).catch(()=>{});
        }
      });
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "customers", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setRawStockWithSync = (updater) => {
    setRawStock(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
          let qtyChangedOnly = false;
          if (RPC_ENABLED && oldItem) {
            const oldNoQty = {...oldItem, qty:null};
            const newNoQty = {...newItem, qty:null};
            if (JSON.stringify(oldNoQty) === JSON.stringify(newNoQty)) {
              qtyChangedOnly = true;
              const qtyOld = typeof oldItem.qty === 'string' ? JSON.parse(oldItem.qty) : (oldItem.qty || {});
              const qtyNew = typeof newItem.qty === 'string' ? JSON.parse(newItem.qty) : (newItem.qty || {});
              const allPts = new Set([...Object.keys(qtyOld), ...Object.keys(qtyNew)]);
              for (const pt of allPts) {
                const diff = (qtyNew[pt] || 0) - (qtyOld[pt] || 0);
                if (diff !== 0) {
                  if (String(newItem.id).length === 36) {
                    supaFetch("POST", "rpc/update_raw_stock_atomic", { p_raw_id: newItem.id, p_point: pt, p_delta: diff }).catch(()=>{});
                  }
                }
              }
            }
          }
          if (!qtyChangedOnly) {
            if (String(newItem.id).length === 36) {
              supaFetch("POST", "raw_stock", newItem).catch(()=>{});
            }
          }
        }
      });
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          if (String(oldItem.id).length === 36) {
            supaFetch("DELETE", "raw_stock", null, `?id=eq.${oldItem.id}`).catch(()=>{});
          }
        }
      });
      return next;
    });
  };

const setSemiStockWithSync = (updater) => {
    setSemiStock(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
          let qtyChangedOnly = false;
          if (RPC_ENABLED && oldItem) {
            const oldNoQty = {...oldItem, qty:null};
            const newNoQty = {...newItem, qty:null};
            if (JSON.stringify(oldNoQty) === JSON.stringify(newNoQty)) {
              qtyChangedOnly = true;
              const qtyOld = typeof oldItem.qty === 'string' ? JSON.parse(oldItem.qty) : (oldItem.qty || {});
              const qtyNew = typeof newItem.qty === 'string' ? JSON.parse(newItem.qty) : (newItem.qty || {});
              const allPts = new Set([...Object.keys(qtyOld), ...Object.keys(qtyNew)]);
              for (const pt of allPts) {
                const diff = (qtyNew[pt] || 0) - (qtyOld[pt] || 0);
                if (diff !== 0) {
                  if (String(newItem.id).length === 36) {
                    supaFetch("POST", "rpc/update_semi_stock_atomic", { p_semi_id: newItem.id, p_point: pt, p_delta: diff }).catch(()=>{});
                  }
                }
              }
            }
          }
          if (!qtyChangedOnly) {
            if (String(newItem.id).length === 36) {
              supaFetch("POST", "semi_stock", newItem).catch(()=>{});
            }
          }
        }
      });
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          if (String(oldItem.id).length === 36) {
            supaFetch("DELETE", "semi_stock", null, `?id=eq.${oldItem.id}`).catch(()=>{});
          }
        }
      });
      return next;
    });
  };

const setTechCardsWithSync = (updater) => {
    setTechCards(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
          supaFetch("POST", "tech_cards", newItem).catch(()=>{});
        }
      });
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "tech_cards", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setSalesWithSync = (updater) => {
    setSales(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      
      // Added sales
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(newSale => {
        supaFetch("POST", "sales", {
          id: newSale.id,
          no: newSale.no,
          point: newSale.point,
          items: newSale.items,
          total: newSale.total,
          subtotal: newSale.subtotal || newSale.total,
          disc_amt: newSale.discAmt || 0,
          discount: newSale.discount || 0,
          cogs: newSale.cogs || 0,
          pay_mode: newSale.payMode,
          payments: newSale.payments || [],
          cash_given: newSale.cashGiven || 0,
          change_amt: newSale.change || 0,
          sale_time: newSale.time,
          date: newSale.date,
          shift_id: newSale.shift_id || null,
          status: newSale.status || "active",
        }).catch(()=>{});
      });
      
      // Modified sales
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (oldItem && (oldItem.status !== newItem.status || oldItem.delete_requested_by !== newItem.delete_requested_by || oldItem.delete_approved_by !== newItem.delete_approved_by)) {
          supaFetch("PATCH", "sales", {
            status: newItem.status,
            delete_requested_by: newItem.delete_requested_by,
            delete_approved_by: newItem.delete_approved_by,
          }, `?id=eq.${newItem.id}`).catch(()=>{});
        }
      });
      
      // Deleted sales
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "sales", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      
      return next;
    });
  };

const setExpensesWithSync = (updater) => {
    setExpenses(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      
      // Added expenses
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(e => supaFetch("POST", "expenses", {
        id: e.id,
        cat: e.cat,
        note: e.desc || e.note,
        amount: e.amount,
        point: e.point,
        paid: e.paid,
        expense_date: e.date,
      }).catch(()=>{}));
      
      // Modified expenses
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (oldItem && (oldItem.paid !== newItem.paid || oldItem.amount !== newItem.amount || oldItem.desc !== newItem.desc || oldItem.note !== newItem.note || oldItem.cat !== newItem.cat || oldItem.date !== newItem.date || oldItem.point !== newItem.point)) {
          supaFetch("PATCH", "expenses", {
            cat: newItem.cat,
            note: newItem.desc || newItem.note,
            amount: newItem.amount,
            point: newItem.point,
            paid: newItem.paid,
            expense_date: newItem.date,
          }, `?id=eq.${newItem.id}`).catch(()=>{});
        }
      });
      
      // Deleted expenses
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "expenses", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      
      return next;
    });
  };

  const setPreordersWithSync = (updater) => {
    setPreorders(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;

      // Added preorders
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(p => {
        supaFetch("POST", "preorders", {
          id: p.id,
          point: p.point,
          customer_id: p.customer_id || null,
          customer_name: p.customer_name,
          customer_phone: p.customer_phone,
          items: p.items,
          subtotal: p.subtotal,
          discount: p.discount || 0,
          disc_amt: p.disc_amt || 0,
          total: p.total,
          prepayment: p.prepayment || 0,
          prepayment_method: p.prepayment_method || null,
          prepayment_shift_id: p.prepayment_shift_id || null,
          target_date: p.target_date,
          target_time: p.target_time,
          status: p.status || "pending",
          notes: p.notes || "",
          created_by: p.created_by || null,
          created_at: p.created_at || new Date().toISOString(),
          completed_shift_id: p.completed_shift_id || null,
          completed_at: p.completed_at || null,
          remaining_payment: p.remaining_payment || 0,
          remaining_method: p.remaining_method || null,
        }).catch(()=>{});
      });

      // Modified preorders
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (oldItem && (
          oldItem.status !== newItem.status ||
          oldItem.completed_shift_id !== newItem.completed_shift_id ||
          oldItem.completed_at !== newItem.completed_at ||
          oldItem.remaining_payment !== newItem.remaining_payment ||
          oldItem.remaining_method !== newItem.remaining_method
        )) {
          supaFetch("PATCH", "preorders", {
            status: newItem.status,
            completed_shift_id: newItem.completed_shift_id,
            completed_at: newItem.completed_at,
            remaining_payment: newItem.remaining_payment,
            remaining_method: newItem.remaining_method,
          }, `?id=eq.${newItem.id}`).catch(()=>{});
        }
      });

      // Deleted preorders
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "preorders", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });

      return next;
    });
  };





  
  
  
  
  const processSyncQueue = async () => {
    if (!localStorage.getItem("vb_tenant_jwt")) return;
    const queue = LS("vb_sync_queue", []);
    if (!queue.length) return;
    if (typeof window !== "undefined" && window.navigator && !window.navigator.onLine) return;
    
    console.log(`Обработка очереди офлайн-синхронизации: ${queue.length} элементов`);
    const nextQueue = [];
    let processedAny = false;
    
    for (const item of queue) {
      if (item.table === "raw_material_prices") continue;
      if (item.method === "POST" && Array.isArray(item.body) && (item.table === "raw_stock" || item.table === "semi_stock")) continue;
      try {
        const url = `${SUPA_URL}/rest/v1/${item.table}${item.params || ""}`;
        
        // Strip tenant_id from old queued RPC calls to avoid Postgres 400 Bad Request
        let reqBody = item.body;
        if (reqBody && item.table.startsWith("rpc/")) {
          if (Array.isArray(reqBody)) {
            reqBody = reqBody.map(b => {
              const { tenant_id, ...rest } = b;
              return rest;
            });
          } else {
            const { tenant_id, ...rest } = reqBody;
            reqBody = rest;
          }
        }
        
        const res = await fetch(url, {
          method: item.method,
          headers: {
            "apikey": SUPA_KEY,
            "Authorization": `Bearer ${localStorage.getItem("vb_tenant_jwt") || SUPA_KEY}`,
            "Content-Type": "application/json",
            "Prefer": item.method === "POST" ? "resolution=merge-duplicates" : "return=minimal",
          },
          body: reqBody ? JSON.stringify(reqBody) : null,
        });
        
        if (res.ok) {
          console.log(`Синхронизировано в фоновом режиме: ${item.method} ${item.table}`);
          processedAny = true;
        } else {
          const errText = await res.text().catch(() => "");
          console.warn(`Ошибка фоновой синхронизации ${item.method} ${item.table}: status ${res.status}: ${errText}`);
          // Drop permanent client errors (poison pills) to avoid infinite retry loops.
          // Retain 401 (token expiry — will retry after re-auth) and 429 (rate limit).
          if (res.status === 401) { console.warn("JWT expired. Retaining queue."); nextQueue.push(item); localStorage.removeItem("vb_tenant_jwt"); window.location.reload(); break; } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            console.error(`Fatal client error (Poison Pill) ${res.status} on ${item.method} ${item.table}. Dropping from queue.`);
          } else {
            nextQueue.push(item);
          }
        }
      } catch (e) {
        console.warn(`Сеть недоступна для фоновой синхронизации:`, e);
        nextQueue.push(item);
      }
    }
    
    localStorage.setItem("vb_sync_queue", JSON.stringify(nextQueue));
    if (processedAny) {
      showToast("Локальные изменения успешно отправлены в облако!");
    }
  };

  // Эффект периодической проверки оффлайн очереди синхронизации
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      processSyncQueue();
    };
    window.addEventListener("online", handleOnline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Эффект Realtime-подписок на таблицы Supabase объединен ниже с основным эффектом
useEffect(()=>{
    document.title = companyName || "SweetSync";
    const handleResize = () => {
      const mobile = checkIsMobile();
      const portrait = checkIsPortrait();
      setIsMobile(mobile);
      setIsPortrait(portrait);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    // Задержка при orientationchange — браузер обновляет window.screen.orientation асинхронно
    const handleOrientationChange = () => setTimeout(handleResize, 100);

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    // Современный API (Chrome Android, Safari iOS 16.4+)
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener("change", handleOrientationChange);
    }
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      if (window.screen && window.screen.orientation) {
        window.screen.orientation.removeEventListener("change", handleOrientationChange);
      }
    };
  }, []);

  useEffect(()=>{
    if (!localStorage.getItem("vb_tenant_jwt")) return;
    const load = async () => {
      try {
        await processSyncQueue();
        const tid = localStorage.getItem("vb_tenant_id");
        const f = tid ? `?tenant_id=eq.${tid}` : "";
        const fAnd = tid ? `&tenant_id=eq.${tid}` : "";
        const [raw,semi,tc,sl,exp,appUsers,custs,sh,whHist,wrOffs,preords,tPoints] = await Promise.all([
          supaFetch("GET","raw_stock",null,f),
          supaFetch("GET","semi_stock",null,f),
          supaFetch("GET","tech_cards",null,f),
          supaFetch("GET","sales",null,`?order=created_at.desc&limit=500${fAnd}`),
          supaFetch("GET","expenses",null,f),
          supaFetch("GET","app_users",null,`?is_active=eq.true${fAnd}`),
          supaFetch("GET","customers",null,f),
          supaFetch("GET","shifts",null,`?order=opened_at.desc&limit=100${fAnd}`),
          supaFetch("GET","warehouse_history",null,`?order=created_at.desc&limit=500${fAnd}`),
          supaFetch("GET","write_offs",null,`?order=created_at.desc&limit=500${fAnd}`),
          supaFetch("GET","preorders",null,`?order=created_at.desc&limit=500${fAnd}`),
          supaFetch("GET","tenant_points",null,f)
        ]);
        
        if (Array.isArray(tPoints) && tPoints.length) {
          POINTS.length = 0;
          POINT_COLORS.length = 0;
          ALL_LOCATIONS.length = 0;
          ALL_LOCATIONS.push("Все");
          tPoints.forEach(tp => {
            POINTS.push(tp.name);
            POINT_COLORS.push(tp.color || "#E8A0B4");
            ALL_LOCATIONS.push(tp.name);
          });
        }
        
        if (Array.isArray(custs)) {
          setCustomers(prev => getMergedList(custs, prev, "customers"));
        }
        if (Array.isArray(raw)) {
          setRawStock(prev => getMergedList(raw, prev, "raw_stock"));
        }
        if (Array.isArray(semi)) {
          setSemiStock(prev => getMergedList(semi, prev, "semi_stock"));
        }
        if (Array.isArray(tc)) {
          const mapped = tc.map(t=>({...t,ings:t.ings||[]}));
          setTechCards(prev => getMergedList(mapped, prev, "tech_cards"));
        }
        if (Array.isArray(sh)) {
          setShifts(prev => getMergedList(sh, prev, "shifts"));
        }
        if (Array.isArray(whHist)) {
          setWarehouseHistory(prev => getMergedList(whHist, prev, "warehouse_history"));
        }
        if (Array.isArray(wrOffs)) {
          setWriteOffs(prev => getMergedList(wrOffs, prev, "write_offs"));
        }
        if (Array.isArray(sl)) {
          const fetchedSales = sl.map(s=>{
            const dObj = s.created_at ? new Date(s.created_at) : new Date();
            return {
              ...s,
              items: s.items || [],
              payMode: s.pay_mode,
              time: s.sale_time,
              cogs: s.cogs || 0,
              date: s.date || dObj.toLocaleDateString("ru-RU")
            };
          });
          setSales(prev => {
            const merged = getMergedList(fetchedSales, prev, "sales");
            return merged.sort((a,b) => a.no - b.no);
          });
        }
        if (Array.isArray(exp)) {
          const mapped = exp.map(e=>({...e,desc:e.note,date:e.expense_date}));
          setExpenses(prev => getMergedList(mapped, prev, "expenses"));
        }
        if (Array.isArray(preords)) {
          setPreorders(prev => getMergedList(preords, prev, "preorders"));
        }

        // Phase 5: Load users from app_users, populate if empty
        if (Array.isArray(appUsers) && appUsers.length) {
          setUsers(prev => {
            const mapped = appUsers.map(u => {
              const localUser = prev.find(p => p.id === u.id);
              const pinVal = String(u.pin || "");
              const finalPin = (pinVal === "" && localUser && localUser.pin) ? String(localUser.pin) : pinVal;
              return { ...u, pin: finalPin };
            });
            const merged = getMergedList(mapped, prev, "app_users");
            // Принудительно восстанавливаем PIN из БД, если локальный кэш затер его пустым значением
            return merged.map(m => {
              const dbUser = appUsers.find(u => u.id === m.id);
              if (dbUser && dbUser.pin && (!m.pin || m.pin === "")) {
                return { ...m, pin: dbUser.pin };
              }
              return m;
            });
          });
        } else if (Array.isArray(appUsers) && appUsers.length === 0) {
        }

        // Phase 5: Fetch Tenant Company Name
        if (tenantAuth && tenantAuth.tenant_id) {
          const tData = await supaFetch("GET","tenants","",`?id=eq.${tenantAuth.tenant_id}&select=company_name`);
          if (Array.isArray(tData) && tData.length > 0 && tData[0].company_name) {
            setCompanyName(tData[0].company_name);
          }
        }
      } catch(e) {
        console.warn("Supabase недоступен, работаем локально:",e);
      } finally {
        setLoading(false);
      }
    };
    load();
    
    const timer = setInterval(() => {
      processSyncQueue();
      load();
    }, 15000);
    
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tenantAuth]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_raw",JSON.stringify(rawStock));
  },[rawStock,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_semi",JSON.stringify(semiStock));
  },[semiStock,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_tc",JSON.stringify(techCards));
  },[techCards,loading]);

  useEffect(()=>{
    if(loading) return;
    // pin сохраняем как строку, чтобы при чтении тип был корректным
    const usersToSave = users.map(u => ({ ...u, pin: String(u.pin || "") }));
    localStorage.setItem("vb_users", JSON.stringify(usersToSave));
  },[users,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_sales",JSON.stringify(sales));
  },[sales,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_customers",JSON.stringify(customers));
  },[customers,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_exp",JSON.stringify(expenses));
  },[expenses,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_shifts",JSON.stringify(shifts));
  },[shifts,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_warehouse_history",JSON.stringify(warehouseHistory));
  },[warehouseHistory,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_writeoffs_log",JSON.stringify(writeOffs));
  },[writeOffs,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_preorders",JSON.stringify(preorders));
  },[preorders,loading]);

  // Сохраняем сессию пользователя в localStorage для восстановления после авто-перезагрузки PWA
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("vb_session_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("vb_session_user");
      localStorage.removeItem("vb_session_page");
      localStorage.removeItem("vb_session_shift");
      localStorage.removeItem("vb_pos_cart");
      // Очищаем локальные кэши таблиц для исключения утечек состояний между кассирами
      localStorage.removeItem("vb_raw");
      localStorage.removeItem("vb_semi");
      localStorage.removeItem("vb_sales");
      localStorage.removeItem("vb_exp");
      localStorage.removeItem("vb_customers");
      localStorage.removeItem("vb_warehouse_history");
      localStorage.removeItem("vb_writeoffs_log");
      localStorage.removeItem("vb_shifts");
      localStorage.removeItem("vb_preorders");
    }
  }, [currentUser]);

  useEffect(() => {
    if (page) {
      localStorage.setItem("vb_session_page", JSON.stringify(page));
    }
  }, [page]);

  useEffect(() => {
    if (currentShift) {
      localStorage.setItem("vb_session_shift", JSON.stringify(currentShift));
    } else {
      localStorage.removeItem("vb_session_shift");
    }
  }, [currentShift]);

  // Realtime subscription
  // Realtime subscription (consolidated for all tables)
  useEffect(() => {
    if (!supabase || loading) return;

    const channelName = tenantAuth?.tenant_id ? `sweetsync-realtime-${tenantAuth.tenant_id}` : "sweetsync-realtime";
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "raw_stock" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setRawStock(prev => prev.filter(r => r.id !== oldRow.id));
        } else {
          const parsed = { ...newRow, qty: parseQtyObj(newRow.qty) };
          setRawStock(prev => {
            const idx = prev.findIndex(r => r.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "semi_stock" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setSemiStock(prev => prev.filter(s => s.id !== oldRow.id));
        } else {
          const parsed = { ...newRow, qty: parseSemiQtyObj(newRow.qty), rawId: newRow.rawId || newRow.raw_id };
          setSemiStock(prev => {
            const idx = prev.findIndex(s => s.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tech_cards" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setTechCards(prev => prev.filter(t => t.id !== oldRow.id));
        } else {
          const parsed = { ...newRow, ings: newRow.ings || [] };
          setTechCards(prev => {
            const idx = prev.findIndex(t => t.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setSales(prev => prev.filter(s => s.id !== oldRow.id));
        } else {
          const dObj = newRow.created_at ? new Date(newRow.created_at) : new Date();
          const parsed = {
            ...newRow,
            items: newRow.items || [],
            payMode: newRow.pay_mode,
            time: newRow.sale_time,
            cogs: newRow.cogs || 0,
            date: newRow.date || dObj.toLocaleDateString("ru-RU")
          };
          setSales(prev => {
            const idx = prev.findIndex(s => s.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setExpenses(prev => prev.filter(e => e.id !== oldRow.id));
        } else {
          const parsed = { ...newRow, desc: newRow.note, date: newRow.expense_date };
          setExpenses(prev => {
            const idx = prev.findIndex(e => e.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setCustomers(prev => prev.filter(c => c.id !== oldRow.id));
        } else {
          setCustomers(prev => {
            const idx = prev.findIndex(c => c.id === newRow.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(newRow)) return prev;
              const next = [...prev];
              next[idx] = newRow;
              return next;
            } else {
              return [...prev, newRow];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_users" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setUsers(prev => prev.filter(u => u.id !== oldRow.id));
        } else {
          // pin может приходить как integer из Realtime — всегда приводим к String
          const parsed = { id: newRow.id, name: newRow.name, role: newRow.role, point: newRow.point, pin: String(newRow.pin||"") };
          setUsers(prev => {
            const idx = prev.findIndex(u => u.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "warehouse_history" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setWarehouseHistory(prev => prev.filter(h => h.id !== oldRow.id));
        } else {
          setWarehouseHistory(prev => {
            const idx = prev.findIndex(h => h.id === newRow.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(newRow)) return prev;
              const next = [...prev];
              next[idx] = newRow;
              return next;
            } else {
              return [newRow, ...prev];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "write_offs" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setWriteOffs(prev => prev.filter(w => w.id !== oldRow.id));
        } else {
          const parsed = {
            id: newRow.id,
            itemId: newRow.item_id,
            stock: newRow.stock,
            date: newRow.date,
            time: newRow.time,
            item: newRow.item,
            qty: parseFloat(newRow.qty),
            unit: newRow.unit,
            reason: newRow.reason,
            author: newRow.author,
            note: newRow.note,
            location: newRow.location
          };
          setWriteOffs(prev => {
            const idx = prev.findIndex(w => w.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [parsed, ...prev];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "preorders" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setPreorders(prev => prev.filter(p => p.id !== oldRow.id));
        } else {
          setPreorders(prev => {
            const idx = prev.findIndex(p => p.id === newRow.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(newRow)) return prev;
              const next = [...prev];
              next[idx] = newRow;
              return next;
            } else {
              return [...prev, newRow];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setShifts(prev => prev.filter(s => s.id !== oldRow.id));
          setCurrentShift(prev => (prev && prev.id === oldRow.id) ? null : prev);
        } else {
          setShifts(prev => {
            const idx = prev.findIndex(s => s.id === newRow.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(newRow)) return prev;
              const next = [...prev];
              next[idx] = newRow;
              return next;
            } else {
              return [newRow, ...prev];
            }
          });
          // Используем currentUserRef.current вместо currentUser из замыкания (stale closure fix)
          const cu = currentUserRef.current;
          if (cu && newRow.cashier_pin === cu.pin && newRow.point === cu.point) {
            if (newRow.status === "open") {
              setCurrentShift(newRow);
            } else if (newRow.status === "closed") {
              setCurrentShift(prev => (prev && prev.id === newRow.id) ? null : prev);
            }
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, currentUser]);

  
  
  
  
  const handleCancelSale = async (saleNo) => {
    if (currentUser?.role !== "owner" && currentUser?.role !== "director") {
      showToast("Доступ ограничен. Только Владелец или Директор могут аннулировать продажи.", true);
      return;
    }
    const sale = sales.find(s => s.no === saleNo);
    if (!sale) return;
    const { newRaw, newSemi } = restoreStockForSale(sale, rawStock, semiStock, techCards);
    setRawStockWithSync(newRaw);
    setSemiStockWithSync(newSemi);
    setSalesWithSync(prev => prev.filter(s => s.id !== sale.id));
    showToast("Продажа #" + saleNo + " аннулирована!");
  };

  
  // ── ЭКРАН ЗАГРУЗКИ ──
  if(loading && tenantAuth) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0F0F13",color:"#E8A0B4",flexDirection:"column",gap:16}}>
      <div style={{fontSize:32,fontWeight:900,letterSpacing:-1}}>Sweet<span style={{color:"#EAEAF0",fontWeight:300}}>Sync</span></div>
      <div style={{fontSize:14,color:"#7A7A94"}}>⟳ Загрузка данных...</div>
    </div>
  );

  // ── PIN-ЭКРАН ──
  const ROLE_FALLBACK = { label:"?", icon:"👤", color:C.muted, nav:["dashboard","pos"] };

  // Phase 3: handle login with shift check for cashiers
  // ── Stale closure fix: используем Ref вместо переменной из замыкания
  const handleLogin = async (u) => {
    setCurrentUser(u);
    touchSession(); // Записываем timestamp входа для TTL
    setPage((ROLES[u.role]||ROLE_FALLBACK).nav[0]);
    if(u.role==="cashier" && u.point) {
      const localOpen = shifts.find(s => String(s.cashier_pin) === String(u.pin) && s.point === u.point && s.status === "open");
      if (localOpen) {
        setCurrentShift(localOpen);
      } else {
        try {
          const openShifts = await supaFetch("GET","shifts","",`?cashier_pin=eq.${u.pin}&status=eq.open&select=*`);
          if(Array.isArray(openShifts) && openShifts.length > 0) {
            setCurrentShift(openShifts[0]);
            setShifts(prev => {
              if (!prev.find(s => s.id === openShifts[0].id)) {
                return [openShifts[0], ...prev];
              }
              return prev;
            });
          } else {
            setShowOpenShift(true);
          }
        } catch { setShowOpenShift(true); }
      }
    }
  };

  const handleOpenShift = async () => {
    if(!currentUser) return;
    const shiftId = generateUUID();
    const shift = {
      id: shiftId,
      point: currentUser.point,
      cashier_name: currentUser.name,
      cashier_pin: currentUser.pin,
      opened_at: new Date().toISOString(),
      expected_cash: 0,
      actual_cash: 0,
      discrepancy: 0,
      status: "open",
    };
    
    setCurrentShift(shift);
    setShifts(prev => [shift, ...prev]);

    await supaFetch("POST", "shifts", shift);
    
    setShowOpenShift(false);
    showToast("Смена открыта!");
  };

  const handleCloseShift = (actualCash, expectedCash, discrepancy) => {
    if (currentShift) {
      const updated = {
        closed_at: new Date().toISOString(),
        actual_cash: actualCash,
        expected_cash: expectedCash,
        discrepancy,
        status: "closed"
      };
      setShifts(prev => prev.map(s => s.id === currentShift.id ? { ...s, ...updated } : s));
      supaFetch("PATCH", "shifts", updated, `?id=eq.${currentShift.id}`).catch(()=>{});
    }
    // Очищаем сессию при закрытии смены
    localStorage.removeItem("vb_session_user");
    localStorage.removeItem("vb_session_page");
    localStorage.removeItem("vb_session_shift");
    localStorage.removeItem("vb_pos_cart");
    setCurrentShift(null);
    setCurrentUser(null);
    showToast("Смена закрыта, выход из системы");
  };

  if (!tenantAuth) {
    return (
      <div style={{fontFamily:"'Segoe UI',sans-serif",background:C.bg,height:"100dvh",display:"flex",flexDirection:"column",color:C.text,alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{fontSize:32,fontWeight:900,color:C.accent,marginBottom:30}}>Sweet<span style={{fontWeight:300,color:C.text}}>Sync</span></div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:30,width:"100%",maxWidth:400}}>
          <div style={{fontSize:20,fontWeight:800,marginBottom:20,textAlign:"center"}}>Вход в систему</div>
          {tenantError && <div style={{color:C.red,fontSize:13,marginBottom:15,textAlign:"center"}}>{tenantError}</div>}
          <div style={{marginBottom:15}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Email</div>
            <input 
              type="email" 
              value={tenantEmail} 
              onChange={e => setTenantEmail(e.target.value)} 
              placeholder="mail@example.com"
              style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",color:C.text,fontSize:14,boxSizing:"border-box",outline:"none"}} 
            />
          </div>
          <div style={{marginBottom:25,position:"relative"}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Пароль</div>
            <input 
              type={showTenantPassword ? "text" : "password"} 
              value={tenantPassword} 
              onChange={e => setTenantPassword(e.target.value)} 
              placeholder="••••••••"
              style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",color:C.text,fontSize:14,boxSizing:"border-box",outline:"none"}} 
            />
            <button 
              onClick={() => setShowTenantPassword(!showTenantPassword)}
              style={{position:"absolute",right:12,top:32,background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:12}}>
              {showTenantPassword ? "Скрыть" : "Показать"}
            </button>
          </div>
          <button 
            disabled={tenantAuthenticating || !tenantEmail || !tenantPassword}
            onClick={loginTenant}
            style={{width:"100%",padding:14,borderRadius:10,background:C.accent,color:"#000",fontWeight:800,border:"none",cursor:"pointer",marginBottom:15,opacity:(tenantAuthenticating || !tenantEmail || !tenantPassword)?0.5:1}}>
            {tenantAuthenticating ? "Вход..." : "Войти"}
          </button>
          <button 
            disabled={tenantAuthenticating || !tenantEmail || !tenantPassword}
            onClick={registerTenant}
            style={{width:"100%",padding:14,borderRadius:10,background:"transparent",color:C.accent,fontWeight:800,border:`1px solid ${C.accent}`,cursor:"pointer",opacity:(tenantAuthenticating || !tenantEmail || !tenantPassword)?0.5:1}}>
            Зарегистрировать Бизнес
          </button>
        </div>
      </div>
    );
  }

  if(!currentUser) return <PinScreen users={users} onLogin={handleLogin} />;

  const role       = ROLES[currentUser.role] || ROLE_FALLBACK;
  const userNav    = [...role.nav];
  if (currentUser.role === "cashier" && currentUser.point === "Мастерская") {
    if (!userNav.includes("production")) userNav.push("production");
    if (!userNav.includes("preorders")) userNav.push("preorders");
    if (!userNav.includes("expenses")) userNav.push("expenses");
    if (!userNav.includes("warehouse")) userNav.push("warehouse");
  }
  const allowedNav = NAV.filter(n=>userNav.includes(n.id));

  const todayStrHeader = new Date().toLocaleDateString("ru-RU");
  const headerSales = sales.filter(s => {
    if(s.date !== todayStrHeader) return false;
    if(currentUser?.role === "cashier") return s.point === currentUser.point;
    return true;
  });
  const totalRev = headerSales.reduce((s,i)=>s+i.total,0);
  const totalOrd = headerSales.length;

  return(
    <div style={{fontFamily:"'Segoe UI',sans-serif",background:C.bg,height:"100dvh",display:"flex",flexDirection:(isMobile && isPortrait)?"column":"row",color:C.text,overflow:"hidden",position:"relative",paddingTop:"env(safe-area-inset-top)",paddingBottom:"env(safe-area-inset-bottom)",paddingLeft:"env(safe-area-inset-left)",paddingRight:"env(safe-area-inset-right)",boxSizing:"border-box"}}>
      <Toast toast={toast}/>
      {showUserMenu && <PinScreen users={users} onLogin={(u)=>{handleLogin(u);setUserMenu(false);showToast(`Вошли как: ${u.name}`);}} onClose={()=>setUserMenu(false)}/>}

      {/* Модалка открытия смены */}
      {showOpenShift && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
          <div style={{background:C.card,borderRadius:16,padding:28,width:340,maxWidth:"90vw",border:`1px solid ${C.border}`,textAlign:"center",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:36,marginBottom:12}}>🔓</div>
            <div style={{fontSize:18,fontWeight:800,marginBottom:8}}>Открыть смену?</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Точка: <b>{currentUser?.point}</b><br/>Кассир: <b>{currentUser?.name}</b></div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setShowOpenShift(false);setCurrentUser(null);}} style={{flex:1,padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600}}>Отмена</button>
              <button onClick={handleOpenShift} style={{flex:1,padding:12,borderRadius:10,border:"none",background:C.green,color:"#000",cursor:"pointer",fontWeight:800,fontSize:14}}>Открыть</button>
            </div>
          </div>
        </div>
      )}

      {/* САЙДБАР (МОБИЛЬНЫЙ ВЫЕЗДНОЙ ИЛИ ДЕКСТОПНЫЙ СТАТИЧЕСКИЙ) */}
      {/* В портретном режиме на телефоне — сайдбар скрыт, навигация снизу */}
      {isMobile && sidebarOpen && !isPortrait && (
        <div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:998}} />
      )}
      
      <div style={{
        width: (isMobile && isPortrait) ? 0 : (sidebarOpen ? 220 : isMobile ? 0 : 58),
        background:C.surface,
        borderRight:`1px solid ${C.border}`,
        display:"flex",
        flexDirection:"column",
        flexShrink:0,
        transition:"width .2s, left .2s",
        overflow:"hidden",
        height:"100vh",
        position: isMobile ? "fixed" : "sticky",
        left: (isMobile && isPortrait) ? -220 : (isMobile ? (sidebarOpen ? 0 : -220) : 0),
        top:0,
        zIndex:999
      }}>
        <div style={{padding:(sidebarOpen || isMobile)?"18px 14px":"18px 0",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:(sidebarOpen || isMobile)?"space-between":"center"}}>
          {(sidebarOpen || isMobile) && <span style={{fontSize:20,fontWeight:900,color:C.accent,letterSpacing:-0.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{companyName}</span>}
          <button onClick={()=>setSidebarOpen(v=>!v)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:4,flexShrink:0}}>{sidebarOpen?"←":"→"}</button>
        </div>

        <div style={{flex:1,padding:"10px 6px",overflowY:"auto"}}>
          {allowedNav.map(n=>{
            const active=page===n.id;
            return(
              <button key={n.id} onClick={()=>{setPage(n.id); if(isMobile) setSidebarOpen(false);}} title={!sidebarOpen?n.label:""} style={{display:"flex",alignItems:"center",justifyContent:(sidebarOpen || isMobile)?"flex-start":"center",gap:10,padding:"11px 10px",borderRadius:10,border:"none",cursor:"pointer",background:active?C.accentSoft:"transparent",color:active?C.accent:C.muted,fontWeight:active?700:400,width:"100%",textAlign:"left",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden"}}>
                <span style={{fontSize:18,flexShrink:0}}>{n.icon}</span>
                {(sidebarOpen || isMobile) &&<span style={{fontSize:13}}>{n.label}</span>}
              </button>
            );
          })}
        </div>

        <div style={{padding:"10px 8px",borderTop:`1px solid ${C.border}`}}>
          <button onClick={()=>setUserMenu(true)} style={{display:"flex",alignItems:"center",justifyContent:(sidebarOpen || isMobile)?"flex-start":"center",gap:10,padding:"8px 8px",borderRadius:10,border:"none",background:"transparent",color:C.text,cursor:"pointer",width:"100%",textAlign:"left"}}>
            <div style={{width:32,height:32,borderRadius:16,background:role.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{role.icon}</div>
            {(sidebarOpen || isMobile) &&<div>
              <div style={{fontSize:12,fontWeight:700}}>{currentUser.name}</div>
              <div style={{fontSize:10,color:C.muted}}>{role.label}{currentUser.point?" · "+currentUser.point:""}</div>
            </div>}
          </button>
          <button onClick={()=>{
            setCurrentUser(null);
            localStorage.removeItem("vb_session_user");
          }} style={{marginTop:8, display:"flex",alignItems:"center",justifyContent:(sidebarOpen || isMobile)?"flex-start":"center",gap:10,padding:"10px 10px",borderRadius:10,border:`1px solid ${C.red}33`,background:"transparent",color:C.red,cursor:"pointer",width:"100%",fontWeight:700}}>
            <span style={{fontSize:16,flexShrink:0}}>🚪</span>
            {(sidebarOpen || isMobile) && <span style={{fontSize:13}}>Выйти (Сменить)</span>}
          </button>
        </div>
      </div>

      {/* ОСНОВНОЙ КОНТЕНТ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",width:"100%"}}>
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"13px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {isMobile && !isPortrait && (
              <button onClick={()=>setSidebarOpen(true)} style={{background:"transparent",border:"none",color:C.text,fontSize:22,cursor:"pointer",padding:0}}>☰</button>
            )}
            <div style={{fontSize:16,fontWeight:800}}>{NAV.find(n=>n.id===page)?.label}</div>
            {isOffline && (
              <div style={{background:C.redSoft, border:`1px solid ${C.red}`, color:C.red, borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:700, marginLeft:10}}>
                ⚠️ Нет связи, работаем автономно
              </div>
            )}
            {!isOffline && (
              <button 
                onClick={() => { 
                  showToast("Синхронизация..."); 
                  processSyncQueue().then(() => window.location.reload());
                }}
                style={{background:C.blue + "1a", border:`1px solid ${C.blue}40`, color:C.blue, borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:700, marginLeft:10, cursor:"pointer", display:"flex", alignItems:"center", gap:4}}
              >
                🔄 Обновить
              </button>
            )}
          </div>
          <div style={{display:"flex",gap:10}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",fontSize:12}}>
              <span style={{color:C.muted}}>Заказов: </span><span style={{fontWeight:700,color:C.blue}}>{totalOrd}</span>
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",fontSize:12,display:isMobile?"none":"block"}}>
              <span style={{color:C.muted}}>Выручка: </span><span style={{fontWeight:700,color:C.accent}}>{fmtS(totalRev)}</span>
            </div>
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:(isMobile && isPortrait) ? 68 : 0,minHeight:0}}>
          {page==="dashboard"        && <>
            <Dashboard sales={sales} currentShift={currentShift} expenses={expenses} rawStock={rawStock} semiStock={semiStock} isMobile={isMobile} currentUser={currentUser} setActiveMenu={setPage} onCancelSale={handleCancelSale} users={users} setSales={setSalesWithSync} showToast={showToast} />

          </>}
          {page==="pos"        && <POS        isMobile={isMobile} semiStock={semiStock} setSemiStock={setSemiStockWithSync} rawStock={rawStock} setRawStock={setRawStockWithSync} sales={sales} setSales={setSalesWithSync} currentUser={currentUser} techCards={techCards} currentShift={currentShift} onCloseShift={handleCloseShift} onCancelSale={handleCancelSale} customers={customers} preorders={preorders} setPreorders={setPreordersWithSync} setCustomers={setCustomersWithSync}/>}
          {page==="preorders"  && <Preorders isMobile={isMobile} preorders={preorders} setPreorders={setPreordersWithSync} sales={sales} setSales={setSalesWithSync} semiStock={semiStock} setSemiStock={setSemiStockWithSync} rawStock={rawStock} setRawStock={setRawStockWithSync} currentUser={currentUser} currentShift={currentShift} customers={customers} techCards={techCards} showToast={showToast}/>}
          {page==="production" && <Production isMobile={isMobile} rawStock={rawStock} setRawStock={setRawStockWithSync} semiStock={semiStock} setSemiStock={setSemiStockWithSync} currentUser={currentUser}/>}
          {page==="warehouse"  && <Warehouse  isMobile={isMobile} rawStock={rawStock} setRawStock={setRawStockWithSync} semiStock={semiStock} setSemiStock={setSemiStockWithSync} currentUser={currentUser} sales={sales} expenses={expenses} techCards={techCards} history={warehouseHistory} setHistory={setWarehouseHistoryWithSync}/>}
          {page==="inventory"  && <Inventory  isMobile={isMobile} semiStock={semiStock} setSemiStock={setSemiStockWithSync} rawStock={rawStock} setRawStock={setRawStockWithSync} currentUser={currentUser} setExpenses={setExpensesWithSync} currentShift={currentShift}/>}
          {page==="writeoff"   && <WriteOff   isMobile={isMobile} rawStock={rawStock} setRawStock={setRawStockWithSync} semiStock={semiStock} setSemiStock={setSemiStockWithSync} currentUser={currentUser} log={writeOffs} setLog={setWriteOffsWithSync} currentShift={currentShift}/>}
          {page==="expenses"   && <Expenses   isMobile={isMobile} expenses={expenses} setExpenses={setExpensesWithSync} currentUser={currentUser}/>}
          {page==="reports"    && <Reports    isMobile={isMobile} sales={sales} expenses={expenses} rawStock={rawStock} semiStock={semiStock} currentUser={currentUser}/>}
          {page==="shifts"     && <Shifts     isMobile={isMobile} shifts={shifts} currentUser={currentUser} sales={sales} expenses={expenses} />}
          {page==="settings"   && <Settings   isMobile={isMobile} techCards={techCards} setTechCards={setTechCardsWithSync} rawStock={rawStock} setRawStock={setRawStockWithSync} semiStock={semiStock} users={users} setUsers={setUsersWithSync} customers={customers} setCustomers={setCustomersWithSync} currentUser={currentUser} tenantAuth={tenantAuth}/>}
        </div>
      </div>

      {/* НИЖНЯЯ НАВИГАЦИЯ ДЛЯ ПОРТРЕТНОГО МОБИЛЬНОГО */}
      {isMobile && isPortrait && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,height:64,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-around",zIndex:999,paddingBottom:"env(safe-area-inset-bottom)"}}>
          {allowedNav.slice(0,4).map(n => (
            <button key={n.id} onClick={()=>setPage(n.id)}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"transparent",border:"none",cursor:"pointer",padding:"6px 0",gap:2,color:page===n.id?C.accent:C.muted,transition:"color .15s"}}>
              <span style={{fontSize:20}}>{n.icon}</span>
              <span style={{fontSize:9,fontWeight:page===n.id?700:400,letterSpacing:0}}>{n.label}</span>
            </button>
          ))}
          <button onClick={()=>setSidebarOpen(v=>!v)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"transparent",border:"none",cursor:"pointer",padding:"6px 0",gap:2,color:sidebarOpen?C.accent:C.muted}}>
            <span style={{fontSize:20}}>{sidebarOpen?"👤":"☰"}</span>
            <span style={{fontSize:9,fontWeight:sidebarOpen?700:400}}>Профиль</span>
          </button>
        </div>
      )}

      {/* ВЫЕЗДНОЕ МЕНЮ «ЕЩЁ» в портрете */}
      {isMobile && isPortrait && sidebarOpen && (
        <>
          <div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000}}/>
          <div style={{position:"fixed",bottom:64,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,zIndex:1001,display:"flex",flexDirection:"column",padding:"12px 16px",gap:16}}>
            {/* User Profile in Overflow Menu */}
            <div style={{display:"flex",alignItems:"center",gap:12,paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
              <div style={{width:40,height:40,borderRadius:20,background:role.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{role.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700}}>{currentUser.name}</div>
                <div style={{fontSize:12,color:C.muted}}>{role.label}{currentUser.point?" · "+currentUser.point:""}</div>
              </div>
              <button onClick={()=>{
                setSidebarOpen(false);
                setCurrentUser(null);
                localStorage.removeItem("vb_session_user");
              }} style={{padding:"8px 12px",borderRadius:8,border:`1px solid ${C.red}33`,background:"transparent",color:C.red,fontWeight:700,cursor:"pointer"}}>
                Выйти
              </button>
            </div>

            {/* Overflow Nav Items */}
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {allowedNav.slice(4).map(n => (
                <button key={n.id} onClick={()=>{setPage(n.id);setSidebarOpen(false);}}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"10px 16px",background:page===n.id?C.accentSoft:C.card,border:`1px solid ${page===n.id?C.accent:C.border}`,borderRadius:10,color:page===n.id?C.accent:C.text,cursor:"pointer",fontSize:13,fontWeight:page===n.id?700:400}}>
                  {n.icon} {n.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      </div>
  );
}
