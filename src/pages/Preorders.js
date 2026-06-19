import { Toast, useToast } from "../components/Toast";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";
import {
  getConvertedQty, INIT_USERS, initRawStock, initSemiStock, INIT_TECH_CARDS, CAT_COLORS, NAV, fmtM, fmtS, fmt, PAY_LABELS, fmtPay, parseQtyObj, parseSemiQtyObj, getQty, parseLocalDate, getPackagingItems, calcCost, calcProductCOGS, calcCartItemCOGS, getIngName, getIngUnit, restoreStockForSale, processSaleStock, LS, generateUUID, getMergedList, isSessionValid, touchSession, RPC_ENABLED, fmtUnit, checkIsMobile, checkIsPortrait, setWarehouseHistoryWithSync, setWriteOffsWithSync, setUsersWithSync, setCustomersWithSync, setRawStockWithSync, setSemiStockWithSync, setTechCardsWithSync, setSalesWithSync, setExpensesWithSync, checkAdminOrManager, isAdmin, isManager, isSurgeon, canWriteOff, canAddShift, supabase, supaFetch
} from "../utils";
import SearchableSelect from '../components/SearchableSelect';

export default function Preorders({isMobile,preorders, setPreorders, sales, setSales, semiStock, setSemiStock, rawStock, setRawStock, currentUser, currentShift, customers, techCards, showToast}) {
  const [statusFilter, setStatusFilter] = useState("all_active"); // "all_active", "pending", "ready", "completed", "cancelled"
  const [dateFilter, setDateFilter] = useState("all"); // "all", "today", "tomorrow", "custom"
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // States for finishing preorder (pick up / check out)
  const [checkoutPreorder, setCheckoutPreorder] = useState(null);
  const [checkoutPayMode, setCheckoutPayMode] = useState("cash");


  // Filtered preorders (always filtered to "Мастерская" because "только в мастерской")
  const filtered = preorders.filter(p => {
    // Only show "Мастерская" preorders
    if (p.point !== "Мастерская") return false;

    // 2. Status filter
    if (statusFilter === "all_active") {
      if (p.status !== "pending" && p.status !== "ready") return false;
    } else if (p.status !== statusFilter) {
      return false;
    }

    // 3. Date filter
    const todayStr = new Date().toLocaleDateString("ru-RU");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString("ru-RU");

    let dateNorm = p.target_date; // YYYY-MM-DD
    if (p.target_date && p.target_date.includes("-")) {
      const parts = p.target_date.split("-");
      dateNorm = `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    if (dateFilter === "today" && dateNorm !== todayStr) return false;
    if (dateFilter === "tomorrow" && dateNorm !== tomorrowStr) return false;
    if (dateFilter === "custom") {
      const pDate = new Date(p.target_date); // p.target_date is YYYY-MM-DD
      pDate.setHours(0,0,0,0);
      if (customStart) {
        const cs = new Date(customStart);
        cs.setHours(0,0,0,0);
        if (pDate < cs) return false;
      }
      if (customEnd) {
        const ce = new Date(customEnd);
        ce.setHours(23,59,59,999);
        if (pDate > ce) return false;
      }
    }

    // 4. Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = p.customer_name && p.customer_name.toLowerCase().includes(q);
      const phoneMatch = p.customer_phone && p.customer_phone.includes(q);
      const itemsMatch = p.items && p.items.some(i => i.name.toLowerCase().includes(q));
      if (!nameMatch && !phoneMatch && !itemsMatch) return false;
    }

    return true;
  });

  // Sort by target_date + target_time (nearest first)
  const sorted = [...filtered].sort((a, b) => {
    const da = `${a.target_date}T${a.target_time || "00:00"}`;
    const db = `${b.target_date}T${b.target_time || "00:00"}`;
    return da.localeCompare(db);
  });

  const handleStatusChange = (preorderId, newStatus) => {
    setPreorders(prev => prev.map(p => {
      if (p.id !== preorderId) return p;
      return { ...p, status: newStatus };
    }));
    showToast(`Статус предзаказа изменен на: ${newStatus === "ready" ? "Собран" : "Отменен"}`);
  };

  const handleOpenCheckout = (preorder) => {
    if (!currentShift && currentUser.role === "cashier") {
      showToast("Смена не открыта! Откройте смену в кассе.", true);
      return;
    }
    setCheckoutPreorder(preorder);
    setCheckoutPayMode("cash");
  };

  const handleCompletePreorder = () => {
    if (!checkoutPreorder) return;
    
    const p = checkoutPreorder;
    const remaining = p.total - p.prepayment;
    
    // Create sales receipt
    const receiptPayments = [];
    if (p.prepayment > 0) {
      receiptPayments.push({ method: "preorder_prepayment", amount: p.prepayment });
    }
    if (remaining > 0) {
      receiptPayments.push({ method: checkoutPayMode, amount: remaining });
    }

    // Determine effective pay_mode
    const effectivePayMode = receiptPayments.length > 1 ? "split" : (remaining > 0 ? checkoutPayMode : "preorder_prepayment");

    // Deduct stock
    const newSemi = [...semiStock];
    const newRaw = [...rawStock];

    for (const item of p.items) {
      const tc = techCards.find(t => t.product === item.name);
      if (tc && tc.ings) {
        for (const ing of tc.ings) {
          const spend = ing.qty * item.qty * (1 + (ing.loss || 0) / 100);
          if (ing.rid) {
            const idx = newRaw.findIndex(r => r.id === ing.rid);
            if (idx >= 0) {
              const qtyObj = parseQtyObj(newRaw[idx].qty);
              qtyObj[p.point] = Math.round((qtyObj[p.point] - spend) * 1000) / 1000;
              newRaw[idx] = { ...newRaw[idx], qty: qtyObj };
            }
          } else {
            const idx = newSemi.findIndex(s => s.id === ing.sid);
            if (idx >= 0) {
              const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
              qtyObj[p.point] = Math.round((qtyObj[p.point] - spend) * 1000) / 1000;
              newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
            }
          }
        }
      }

      // Deduct packaging
      const packaging = getPackagingItems(item.product);
      for (const pkg of packaging) {
        const idx = newRaw.findIndex(r => r.id === pkg.rawId);
        if (idx >= 0) {
          const qtyObj = parseQtyObj(newRaw[idx].qty);
          qtyObj[p.point] = Math.round((qtyObj[p.point] - pkg.qty * item.qty) * 1000) / 1000;
          newRaw[idx] = { ...newRaw[idx], qty: qtyObj };
        }
      }

      // Deduct extras
      if (item.extras) {
        if (item.extras.s6 > 0) {
          const idx = newSemi.findIndex(s => s.id === "s6");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[p.point] = Math.round((qtyObj[p.point] - item.extras.s6 * 50 * item.qty) * 1000) / 1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
        if (item.extras.s7 > 0) {
          const idx = newSemi.findIndex(s => s.id === "s7");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[p.point] = Math.round((qtyObj[p.point] - item.extras.s7 * 50 * item.qty) * 1000) / 1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
        if (item.extras.s2 > 0) {
          const idx = newSemi.findIndex(s => s.id === "s2");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[p.point] = Math.round((qtyObj[p.point] - item.extras.s2 * 15 * item.qty) * 1000) / 1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
      }
    }

    setSemiStock(newSemi);
    setRawStock(newRaw);

    // Calculate COGS
    const cogs = p.items.reduce((s, item) => {
      const tc = techCards.find(t => t.product === item.name);
      const itemCogs = tc ? calcCartItemCOGS({ ...tc, qty: 1, extras: item.extras }, semiStock, rawStock) : 0;
      return s + itemCogs * item.qty;
    }, 0);

    const sale = {
      id: generateUUID(),
      no: 1001 + sales.length,
      point: p.point,
      items: p.items,
      total: p.total,
      subtotal: p.subtotal || p.total,
      discAmt: p.disc_amt || 0,
      discount: p.discount || 0,
      cogs: cogs,
      payMode: effectivePayMode,
      payments: receiptPayments,
      cashGiven: remaining > 0 && checkoutPayMode === "cash" ? remaining : 0,
      change: 0,
      shift_id: currentShift?.id || null,
      date: new Date().toLocaleDateString("ru-RU"),
      time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      status: "active",
      created_at: new Date().toISOString()
    };

    setSales(prev => [...prev, sale]);

    setPreorders(prev => prev.map(item => {
      if (item.id !== p.id) return item;
      return {
        ...item,
        status: "completed",
        completed_shift_id: currentShift?.id || null,
        completed_at: new Date().toISOString(),
        remaining_payment: remaining,
        remaining_method: remaining > 0 ? checkoutPayMode : null
      };
    }));

    showToast("Предзаказ успешно выдан и закрыт!");
    setCheckoutPreorder(null);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "pending": return <span style={{background:C.yellowSoft,color:C.yellow,padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>В ожидании</span>;
      case "ready": return <span style={{background:C.blueSoft,color:C.blue,padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>Собран</span>;
      case "completed": return <span style={{background:C.greenSoft,color:C.green,padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>Выдан</span>;
      case "cancelled": return <span style={{background:C.redSoft,color:C.red,padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>Отменен</span>;
      default: return null;
    }
  };

  return (
    <div style={{padding:isMobile?"12px 14px":"20px 28px",flex:1,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:900,color:C.accent}}>📅 Журнал предзаказов (Мастерская)</div>
        <div style={{display:"flex",gap:10}}>
          <input
            value={searchQuery}
            onChange={e=>setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, тел, товару..."
            style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,padding:"8px 12px",borderRadius:8,fontSize:13,outline:"none",width:200}}
          />
        </div>
      </div>

      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{display:"flex",background:C.surface,borderRadius:8,padding:3,border:`1px solid ${C.border}`}}>
          {[
            {id:"all_active",label:"Активные"},
            {id:"pending",label:"В ожидании"},
            {id:"ready",label:"Собраны"},
            {id:"completed",label:"Выданы"},
            {id:"cancelled",label:"Отменены"}
          ].map(f => (
            <button
              key={f.id}
              onClick={()=>setStatusFilter(f.id)}
              style={{padding:"6px 12px",borderRadius:6,border:"none",background:statusFilter===f.id?C.card:"transparent",color:statusFilter===f.id?C.accent:C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{display:"flex",background:C.surface,borderRadius:8,padding:3,border:`1px solid ${C.border}`}}>
          {[
            {id:"all",label:"Все даты"},
            {id:"today",label:"На сегодня"},
            {id:"tomorrow",label:"На завтра"},
            {id:"custom",label:"Свой период"}
          ].map(f => (
            <button
              key={f.id}
              onClick={()=>setDateFilter(f.id)}
              style={{padding:"6px 12px",borderRadius:6,border:"none",background:dateFilter===f.id?C.card:"transparent",color:dateFilter===f.id?C.accent:C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}
            >
              {f.label}
            </button>
          ))}
        </div>
        {dateFilter === "custom" && (
          <div style={{display:"flex",gap:8}}>
            <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12}} />
            <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12}} />
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:60,textAlign:"center",color:C.muted}}>
          Предзаказы не найдены
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))",gap:16}}>
          {sorted.map(p => {
            const isPending = p.status === "pending";
            const isReady = p.status === "ready";
            const remaining = p.total - p.prepayment;
            return (
              <div key={p.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:10}}>
                    <div>
                      <span style={{fontSize:11,color:C.muted,background:C.surface,padding:"2px 6px",borderRadius:4,marginRight:6}}>{p.point}</span>
                      <span style={{fontSize:12,fontWeight:700,color:C.text}}>{p.target_date} в {p.target_time}</span>
                    </div>
                    {getStatusBadge(p.status)}
                  </div>

                  <div style={{fontWeight:800,fontSize:14,marginBottom:4}}>{p.customer_name || "Без имени"}</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:10}}>📞 {p.customer_phone}</div>

                  <div style={{background:C.surface,borderRadius:8,padding:8,marginBottom:12}}>
                    {p.items?.map((item, idx) => (
                      <div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                        <span style={{color:C.text}}>{item.name} x{item.qty}</span>
                        <span style={{fontWeight:600}}>{fmtM(item.price * item.qty)}</span>
                      </div>
                    ))}
                    {p.notes && (
                      <div style={{fontSize:11,color:C.accent,borderTop:`1px solid ${C.border}`,paddingTop:6,marginTop:6,fontStyle:"italic"}}>
                        💬 {p.notes}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:C.muted}}>Сумма:</span><span style={{fontWeight:700}}>{fmtM(p.total)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:C.muted}}>Внесено (предоплата):</span><span style={{fontWeight:700,color:C.green}}>{fmtM(p.prepayment)} {p.prepayment_method && `(${PAY_LABELS[p.prepayment_method] || p.prepayment_method})`}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:12,borderTop:`1px solid ${C.border}`,paddingTop:4}}><span style={{fontWeight:700}}>Осталось:</span><span style={{fontWeight:800,color:remaining>0?C.yellow:C.green}}>{fmtM(remaining)}</span></div>

                  <div style={{display:"flex",gap:8}}>
                    {isPending && (
                      <>
                        <button
                          onClick={()=>handleStatusChange(p.id, "ready")}
                          style={{flex:1,padding:"8px 10px",background:C.accent,color:"#000",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer"}}
                        >
                          Собрать / Готов
                        </button>
                        <button
                          onClick={() => {
                            if(window.confirm("Отменить этот предзаказ?")) handleStatusChange(p.id, "cancelled");
                          }}
                          style={{padding:"8px 12px",background:C.redSoft,color:C.red,border:`1px solid ${C.red}`,borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}
                        >
                          Отменить
                        </button>
                      </>
                    )}
                    {isReady && (
                      <>
                        <button
                          onClick={()=>handleOpenCheckout(p)}
                          style={{flex:1,padding:"8px 10px",background:C.green,color:"#000",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer"}}
                        >
                          Выдать клиенту
                        </button>
                        <button
                          onClick={() => {
                            if(window.confirm("Отменить этот предзаказ?")) handleStatusChange(p.id, "cancelled");
                          }}
                          style={{padding:"8px 12px",background:C.redSoft,color:C.red,border:`1px solid ${C.red}`,borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}
                        >
                          Отменить
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {checkoutPreorder && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
          <div style={{background:C.card,borderRadius:16,padding:24,width:350,maxWidth:"90vw",border:`1px solid ${C.border}`,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:16}}>🛍️ Выдача предзаказа</div>
            <div style={{background:C.surface,borderRadius:10,padding:12,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:C.muted,fontSize:12}}>Сумма заказа:</span><span style={{fontWeight:700}}>{fmtM(checkoutPreorder.total)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:C.muted,fontSize:12}}>Предоплата:</span><span style={{fontWeight:700,color:C.green}}>-{fmtM(checkoutPreorder.prepayment)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:6}}><span style={{fontWeight:700,fontSize:13}}>К доплате:</span><span style={{fontWeight:900,color:C.yellow,fontSize:15}}>{fmtM(checkoutPreorder.total - checkoutPreorder.prepayment)}</span></div>
            </div>

            {checkoutPreorder.total - checkoutPreorder.prepayment > 0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:6}}>МЕТОД ДОПЛАТЫ</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {[
                    {id:"cash",label:"💵 Нал",color:C.green,soft:C.greenSoft},
                    {id:"kaspi",label:"📱 Kaspi",color:C.blue,soft:C.blueSoft},
                    {id:"halyk",label:"🏦 Халык",color:C.purple,soft:C.purpleSoft},
                    {id:"bck",label:"🏛️ БЦК",color:C.yellow,soft:C.yellowSoft},
                  ].map(m=>(
                    <button
                      key={m.id}
                      onClick={()=>setCheckoutPayMode(m.id)}
                      style={{padding:8,background:checkoutPayMode===m.id?m.soft:C.card,color:checkoutPayMode===m.id?m.color:C.text,border:`1px solid ${checkoutPayMode===m.id?m.color:C.border}`,borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12}}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setCheckoutPreorder(null)} style={{flex:1,padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600}}>Отмена</button>
              <button onClick={handleCompletePreorder} style={{flex:1,padding:12,borderRadius:10,border:"none",background:C.green,color:"#000",cursor:"pointer",fontWeight:800,fontSize:13}}>Подтвердить выдачу</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPA_URL = process.env.REACT_APP_SUPABASE_URL||"";
const SUPA_KEY = process.env.REACT_APP_SUPABASE_KEY||"";
