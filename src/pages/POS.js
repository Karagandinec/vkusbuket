import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";
import SearchableSelect from '../components/SearchableSelect';
import CustomBouquetModal from '../components/CustomBouquetModal';

export default function POS({isMobile,semiStock,setSemiStock,rawStock,setRawStock,sales,setSales,currentUser,techCards,currentShift,onCloseShift,onCancelSale,customers,preorders,setPreorders,setCustomers}){
  const [customizing, setCustomizing] = useState(null);
  const [cart,setCart]          = useState(() => LS("vb_pos_cart", []));
  const [customizerTc, setCustomizerTc] = useState(null);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(null);
  const [payMode,setPayMode]    = useState(null);
  const [cashInput,setCashInput] = useState("");
  const [selPoint,setSelPoint]  = useState(currentUser.point||POINTS[0]);
  const [discount,setDiscount]  = useState(0);
  const [done,setDone]          = useState(false);
  const [lastReceipt,setLast]   = useState(null);
  const [catFilter,setCatFilter] = useState("Все");
  const [search,setSearch]      = useState("");
  const [posTab,setPosTab]          = useState("products");
  const [ordersPointFilter,setOrdersPointFilter] = useState(currentUser?.role==="cashier" ? currentUser.point : "Все точки");
  const [toast,showToast]           = useToast();
  const [splitMode,setSplitMode]    = useState(false);
  const [payments,setPayments]      = useState([]);

  const [showPreorderModal, setShowPreorderModal] = useState(false);
  const [preorderDate, setPreorderDate] = useState("");
  const [preorderTime, setPreorderTime] = useState("");
  const [preorderClientName, setPreorderClientName] = useState("");
  const [preorderClientPhone, setPreorderClientPhone] = useState("");
  const [preorderPrepayment, setPreorderPrepayment] = useState("");
  const [preorderPayMode, setPreorderPayMode] = useState("cash");
  const [preorderNotes, setPreorderNotes] = useState("");

  // Сохраняем корзину в localStorage, чтобы она пережила авто-перезагрузку при обновлении приложения
  useEffect(() => {
    if (done) {
      // После оплаты корзина очищается
      localStorage.removeItem("vb_pos_cart");
    } else {
      localStorage.setItem("vb_pos_cart", JSON.stringify(cart));
    }
  }, [cart, done]);

  useEffect(() => {
    if (showPreorderModal) {
      if (loyaltyCustomer) {
        setPreorderClientPhone(loyaltyCustomer.phone);
        setPreorderClientName(loyaltyCustomer.name);
      } else if (phoneSearch) {
        setPreorderClientPhone(phoneSearch);
      }
    }
  }, [showPreorderModal, loyaltyCustomer, phoneSearch]);
  const [showCloseShift,setShowCloseShift] = useState(false);
  const [actualCashInput,setActualCashInput] = useState("");

  // useMemo: пересчитываем только при изменении techCards, catFilter, search или точки
  const displayCards = useMemo(() => techCards.map(t =>
    t.cat === "Макси стаканы" ? { ...t, cat: "Креманки" } : t
  ), [techCards]);

  const isRestrictedPoint = ["Парк", "Фуд Трак", "Жара"].includes(currentUser?.point);
  const isRestrictedCashier = currentUser?.role === "cashier" && isRestrictedPoint;

  const finalCards = useMemo(() => displayCards.filter(t => {
    if (isRestrictedCashier && (t.cat === "Наборы" || t.cat === "Букеты")) return false;
    return true;
  }), [displayCards, isRestrictedCashier]);

  const cats = useMemo(() => ["Все",...new Set(finalCards.map(t=>t.cat))], [finalCards]);

  const filtered = useMemo(() => finalCards.filter(t =>
    (catFilter==="Все"||t.cat===catFilter)&&
    (search===""||t.product.toLowerCase().includes(search.toLowerCase()))
  ), [finalCards, catFilter, search]);

  // useCallback: стабильные ссылки — не создают новые объекты при каждом рендере
  const addToCart = useCallback((tc) =>
    setCart(p => {
      if (p.find(i => (i.baseTcId || i.id) === tc.id)) {
        return p.map(i => (i.baseTcId || i.id) === tc.id ? {...i, qty: i.qty+1} : i);
      } else {
        const isRozhok = tc.product && tc.product.toLowerCase().includes("рожок");
        const isKremanok = !isRozhok && (tc.cat === "Креманки" || (tc.product && tc.product.toLowerCase().includes("креманка")));
        const is3Scoops = isKremanok && tc.product && tc.product.toLowerCase().includes("3 шар");
        let initialIceCream = [];
        if (is3Scoops) initialIceCream = ["s6", "s6", "s6"];
        else if (isKremanok) initialIceCream = ["s6"];
        else if (isRozhok) initialIceCream = ["s6", "s6"];
        return [...p, {...tc, qty:1, extras:{s6:0,s7:0,s2:0}, baseIceCream: initialIceCream, bowlType: isKremanok ? "бумажная" : null, isRozhok: isRozhok, baseTcId: tc.id}];
      }
    }), []);

  const chgQty = useCallback((id, d) =>
    setCart(p => p.map(i => i.id===id ? {...i, qty:Math.max(0,i.qty+d)} : i).filter(i => i.qty > 0))
  , []);

  const subtotal = useMemo(() => cart.reduce((s,i) => {
    const extrasCost = ((i.extras?.s6 || 0) + (i.extras?.s7 || 0) + (i.extras?.s2 || 0)) * 500;
    return s + (i.price + extrasCost) * i.qty;
  }, 0), [cart]);
  const discAmt  = Math.round(subtotal*discount/100);
  const total    = subtotal - discAmt;
  const cashGiven= parseInt(cashInput.replace(/\D/g,""))||0;

  const handleCreatePreorder = () => {
    if (!preorderDate) { showToast("Выберите дату выдачи", true); return; }
    if (!preorderTime) { showToast("Укажите время выдачи", true); return; }
    if (!preorderClientPhone) { showToast("Укажите телефон клиента", true); return; }

    const phoneClean = preorderClientPhone.replace(/\D/g,"");
    if (phoneClean.length < 10) { showToast("Некорректный номер телефона", true); return; }

    // Register customer if new
    const existing = (customers || []).find(c => c.phone === phoneClean);
    let customerId = existing ? existing.id : null;
    if (!existing) {
      customerId = generateUUID();
      const newCust = {
        id: customerId,
        name: preorderClientName || `Клиент ${phoneClean}`,
        phone: phoneClean,
        discount_percent: 0,
        created_at: new Date().toISOString()
      };
      if (typeof setCustomers === "function") {
        setCustomers(prev => [...prev, newCust]);
      }
    }

    const prepayAmt = parseInt(preorderPrepayment) || 0;
    if (prepayAmt > total) { showToast("Предоплата не может превышать сумму заказа", true); return; }

    const newPreorder = {
      id: generateUUID(),
      point: "Мастерская", // Locked to Мастерская ("только в мастерской")
      customer_id: customerId,
      customer_name: preorderClientName || (existing ? existing.name : `Клиент ${phoneClean}`),
      customer_phone: phoneClean,
      items: cart.map(i=>({name:i.product,qty:i.qty,price:i.price,extras:i.extras})),
      subtotal: subtotal,
      discount: discount,
      disc_amt: discAmt,
      total: total,
      prepayment: prepayAmt,
      prepayment_method: prepayAmt > 0 ? preorderPayMode : null,
      prepayment_shift_id: prepayAmt > 0 ? (currentShift?.id || null) : null,
      target_date: preorderDate,
      target_time: preorderTime,
      status: "pending",
      notes: preorderNotes,
      created_by: currentUser?.id || null,
      created_at: new Date().toISOString(),
      completed_shift_id: null,
      completed_at: null,
      remaining_payment: 0,
      remaining_method: null
    };

    setPreorders(prev => [newPreorder, ...prev]);
    showToast("Предзаказ успешно оформлен!");
    setCart([]);
    setShowPreorderModal(false);
    
    // Reset fields
    setPreorderDate("");
    setPreorderTime("");
    setPreorderClientName("");
    setPreorderClientPhone("");
    setPreorderPrepayment("");
    setPreorderNotes("");
  };

  const handlePay=()=>{
    try {
    // Валидация
    if (splitMode) {
      const splitTotal = payments.reduce((s,p)=>s+p.amount,0);
      if (splitTotal !== total) { showToast("Сумма платежей не совпадает с итого",true); return; }
    } else {
      if (!payMode) { showToast("Выберите способ оплаты",true); return; }
      if (payMode==="cash" && cashGiven<total) { showToast("Недостаточно наличных",true); return; }
    }

    const newSemi=[...semiStock];
    const newRaw=[...rawStock];
    
    // 1. Списываем полуфабрикаты/сырье с кухни/склада точки
    for(const item of cart){
      for(const ing of (item.ings || [])){
        const totalSpend = ing.qty * item.qty * (1 + (ing.loss||0)/100);
        
        if (ing.sid === "s6" && Array.isArray(item.baseIceCream) && item.baseIceCream.length > 0) {
          // Разбиваем вес на количество выбранных шариков
          const scoopSpend = totalSpend / item.baseIceCream.length;
          item.baseIceCream.forEach(scoopSid => {
            if (scoopSid === "none") {
              const idxS1 = newSemi.findIndex(s=>s.id==="s1");
              if (idxS1 >= 0) {
                const qtyObj = parseSemiQtyObj(newSemi[idxS1].qty);
                qtyObj[selPoint] = Math.round((qtyObj[selPoint] - 55 * item.qty)*1000)/1000;
                newSemi[idxS1] = { ...newSemi[idxS1], qty: qtyObj };
              }
            } else {
              const idx = newSemi.findIndex(s=>s.id===scoopSid);
              if(idx>=0) {
                const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
                qtyObj[selPoint] = Math.round((qtyObj[selPoint] - scoopSpend)*1000)/1000;
                newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
              }
            }
          });
        } else if (ing.rid) {
          const idx = newRaw.findIndex(r=>r.id===ing.rid);
          if(idx>=0) {
            const qtyObj = parseQtyObj(newRaw[idx].qty);
            qtyObj[selPoint] = Math.round((qtyObj[selPoint] - totalSpend)*1000)/1000;
            newRaw[idx] = { ...newRaw[idx], qty: qtyObj };
          }
        } else {
          const idx = newSemi.findIndex(s=>s.id===ing.sid);
          if(idx>=0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[selPoint] = Math.round((qtyObj[selPoint] - totalSpend)*1000)/1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
      }
      
      // 2. Списываем коробки, стаканчики, ленты, шпажки со склада точки
      const packaging = getPackagingItems(item);
      for(const pkg of packaging){
        const idx = newRaw.findIndex(r=>r.id===pkg.rawId);
        if(idx>=0) {
          const qtyObj = parseQtyObj(newRaw[idx].qty);
          qtyObj[selPoint] = Math.round((qtyObj[selPoint] - pkg.qty * item.qty)*1000)/1000;
          newRaw[idx] = { ...newRaw[idx], qty: qtyObj };
        }
      }

      // 3. Списываем добавки (extras) с кухни/склада точки
      if (item.extras) {
        if (item.extras.s6 > 0) {
          const idx = newSemi.findIndex(s=>s.id==="s6");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[selPoint] = Math.round((qtyObj[selPoint] - item.extras.s6 * 50 * item.qty)*1000)/1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
        if (item.extras.s7 > 0) {
          const idx = newSemi.findIndex(s=>s.id==="s7");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[selPoint] = Math.round((qtyObj[selPoint] - item.extras.s7 * 50 * item.qty)*1000)/1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
        if (item.extras.s2 > 0) {
          const idx = newSemi.findIndex(s=>s.id==="s2");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[selPoint] = Math.round((qtyObj[selPoint] - item.extras.s2 * 15 * item.qty)*1000)/1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
      }
    }
    setSemiStock(newSemi);
    setRawStock(newRaw);

    const cogs = cart.reduce((s,i)=>s + calcCartItemCOGS(i, semiStock, rawStock) * i.qty, 0);
    
    // Формируем массив платежей
    const receiptPayments = splitMode
      ? payments
      : [{ method: payMode, amount: total }];
    const effectivePayMode = splitMode ? "split" : payMode;
    const cashPayment = receiptPayments.find(p=>p.method==="cash");
    const effectiveCashGiven = cashPayment ? cashGiven : 0;
    const effectiveChange = (payMode==="cash" && !splitMode) ? cashGiven-total : 0;

    const receipt={
      id: generateUUID(),
      no:1001+sales.length, point:selPoint,
      items:cart.map(i=>{
        let finalName = i.product;
        if (Array.isArray(i.baseIceCream) && i.baseIceCream.length > 0) {
          const flavors = i.baseIceCream.map(s => s === "s7" ? "Шок." : "Слив.").join("/");
          finalName += ` (${flavors}, ${i.bowlType === "Вафельная" ? "Ваф." : "Пласт."})`;
        }
        return { name: finalName, qty: i.qty, price: i.price, extras: i.extras };
      }),
      total, subtotal, discAmt, discount, cogs,
      payMode: effectivePayMode,
      payments: receiptPayments,
      cashGiven: effectiveCashGiven,
      change: effectiveChange,
      shift_id: currentShift?.id || null,
      date: new Date().toLocaleDateString("ru-RU"),
      time: new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),
    };
    setSales(p=>[...p,receipt]);
    setLast(receipt);
    setDone(true);
    setPosTab("cart");
    } catch (err) {
      alert("Ошибка при оплате (handlePay): " + err.message);
      console.error(err);
    }
  };

  const newSale=()=>{
    setCart([]);
    setPayMode(null);
    setCashInput("");
    setDiscount(0);
    setDone(false);
    setLast(null);
    setSplitMode(false);
    setPayments([]);
    setPosTab("products");
    setPhoneSearch("");
    setLoyaltyCustomer(null);
  };

  const renderOrders = () => {
    const todayStr = new Date().toLocaleDateString("ru-RU");
    const todaySales = sales.filter(s => {
      if(s.date !== todayStr) return false;
      if(currentUser?.role === "cashier") return s.point === currentUser.point;
      return ordersPointFilter === "Все точки" || s.point === ordersPointFilter;
    });
    
    return (
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",height:"100%",maxHeight:"100vh"}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {(currentUser.role==="owner"||currentUser.role==="director")&&(
            <select value={ordersPointFilter} onChange={e=>setOrdersPointFilter(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",outline:"none",fontSize:13}}>
              <option>Все точки</option>
              {POINTS.map(p=><option key={p}>{p}</option>)}
            </select>
          )}
          <h3 style={{marginTop:0,marginBottom:0,marginLeft:8}}>Заказы за сегодня ({ordersPointFilter})</h3>
        </div>
        <div style={{flex:1,padding:20,overflowY:"auto",boxSizing:"border-box"}}>
        {todaySales.length === 0 ? (
          <div style={{color:C.muted,textAlign:"center",padding:40,fontSize:13}}>Сегодня заказов ещё не было</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {todaySales.map((s, idx) => (
              <div key={idx} style={{background:C.card,borderRadius:12,padding:16,border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontWeight:700,color:C.accent}}>Чек #{s.no}</span>
                  <span style={{color:C.muted,fontSize:12}}>{s.time}</span>
                </div>
                <div style={{fontSize:13,color:C.text,marginBottom:8}}>
                  {s.items?.map(it => `${it.name} x${it.qty}`).join(", ")}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${C.border}60`,paddingTop:8,flexWrap:"wrap",gap:8}}>
                  <span style={{fontSize:12,color:C.muted}}>Тип: {s.payMode === "cash" ? "💵 Наличные" : "💳 Kaspi"}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontWeight:900,color:C.green,fontSize:15,marginRight:8}}>{fmtM(s.total)}</span>
                    {s.status === "pending" ? (
                      <span style={{color:C.yellow,fontSize:11,fontWeight:700,background:C.yellowSoft,padding:"4px 8px",borderRadius:6}}>⏳ Ожидает удаления</span>
                    ) : (
                      currentUser?.role === "owner" || currentUser?.role === "director" ? (
                        <button onClick={() => {
                          if (window.confirm(`Аннулировать продажу #${s.no} на сумму ${fmtM(s.total)}?`)) {
                            onCancelSale(s.no);
                          }
                        }} style={{background:C.red + "1a",color:C.red,border:`1px solid ${C.red}40`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                          Аннулировать
                        </button>
                      ) : (
                        <button onClick={async () => {
                          const reason = window.prompt("Укажите причину удаления чека:");
                          if (reason) {
                            try {
                              setSales(prev => prev.map(x => x.id === s.id ? { ...x, status: "pending", delete_requested_by: currentUser.id } : x));
                              showToast("Запрос на удаление отправлен владельцу.");
                            } catch (e) {
                              showToast("Ошибка при отправке запроса", true);
                            }
                          }
                        }} style={{background:C.red + "1a",color:C.red,border:`1px solid ${C.red}40`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                          Запросить удаление
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    );
  };

  const renderProducts = () => (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        {(currentUser.role==="owner"||currentUser.role==="director")&&(
          <select value={selPoint} onChange={e=>setSelPoint(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",outline:"none",fontSize:13}}>
            {POINTS.map(p=><option key={p}>{p}</option>)}
          </select>
        )}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск..." style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13,width:180,flexGrow:1}}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,width:"100%"}}>
          {cats.map(c=>(
            <button key={c} onClick={()=>setCatFilter(c)} style={{padding:"7px 14px",borderRadius:20,border:"none",background:catFilter===c?(CAT_COLORS[c]||C.accent):C.card,color:catFilter===c?"#000":C.muted,fontWeight:catFilter===c?700:400,cursor:"pointer",fontSize:13,whiteSpace:"nowrap"}}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:14,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,alignContent:"start"}}>
        {filtered.map(tc=>{
          const inCart=cart.find(i=>i.id===tc.id);
          const color=CAT_COLORS[tc.cat]||C.accent;
          const cost=calcProductCOGS(tc, semiStock, rawStock);
          const margin=cost>0?Math.round((tc.price-cost)/tc.price*100):0;
          return(
            <button key={tc.id} onClick={()=>{
              if(selPoint === "Мастерская" && (tc.cat === "Букеты" || tc.cat === "Наборы")) {
                setCustomizing(tc);
              } else {
                addToCart(tc);
              }
            }} style={{background:inCart?`${color}18`:C.card,border:`1.5px solid ${inCart?color:C.border}`,borderRadius:12,padding:"14px 12px",cursor:"pointer",textAlign:"left",color:C.text,position:"relative",transition:"all .15s"}}>
              {inCart&&<div style={{position:"absolute",top:8,right:8,background:color,color:"#000",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900}}>{inCart.qty}</div>}
              <div style={{fontSize:12,fontWeight:600,marginBottom:6,lineHeight:1.3}}>{tc.product}</div>
              <div style={{fontSize:16,fontWeight:900,color}}>{fmtM(tc.price)}</div>
              {currentUser?.role !== "cashier" && <div style={{fontSize:10,color:margin>50?C.green:margin>30?C.yellow:C.red,marginTop:4}}>Маржа {margin}%</div>}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderCart = () => (
    <div style={{width:isMobile?"100%":340,background:C.surface,display:"flex",flexDirection:"column",borderLeft:isMobile?"none":`1px solid ${C.border}`,height:"100%",overflowY:isMobile?"auto":"hidden"}}>
      <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontWeight:700,fontSize:15}}>Корзина ({selPoint})</span>
        {cart.length>0&&<button onClick={()=>setCart([])} style={{background:C.redSoft,color:C.red,border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>Очистить</button>}
      </div>

      <div style={{flex:isMobile?"none":1,overflowY:isMobile?"visible":"auto",padding:10}}>
        {cart.length===0
          ? <div style={{textAlign:"center",color:C.muted,marginTop:40,fontSize:13}}>🍓 Выберите товар</div>
          : cart.map(item=>{
            const color=CAT_COLORS[item.cat]||C.accent;
            let displayRecPrice = null;
            let isUnderpriced = false;
            let isOverpriced = false;
            const isOwnerOrDirector = currentUser?.role === "owner" || currentUser?.role === "director";

            if (item.recCustomPrice) {
              if (item.recCustomPrice > item.price) {
                displayRecPrice = item.recCustomPrice;
                isUnderpriced = true;
              } else if (isOwnerOrDirector && item.recCustomPrice < item.price) {
                displayRecPrice = item.recCustomPrice;
                isOverpriced = true;
              }
            } else {
              const cogs = calcProductCOGS(item, semiStock, rawStock);
              const recPrice = Math.round(cogs * 3.3);
              if (recPrice > item.price) {
                displayRecPrice = recPrice;
                isUnderpriced = true;
              }
            }
            return(
              <div key={item.id} style={{background:C.card,borderRadius:10,padding:"12px",border:`1px solid ${C.border}`,marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>{item.product}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button onClick={()=>chgQty(item.id,-1)} style={{width:28,height:28,background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:16}}>−</button>
                    <span style={{fontWeight:800,width:24,textAlign:"center"}}>{item.qty}</span>
                    <button onClick={()=>chgQty(item.id,1)} style={{width:28,height:28,background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:16}}>+</button>
                  </div>
                  <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end"}}>
                    <span
                      onClick={() => {
                        const newPriceStr = prompt(`Введите новую цену для ${item.product}:`, item.price);
                        if (newPriceStr !== null) {
                          const newP = parseInt(newPriceStr.replace(/\D/g, ""));
                          if (!isNaN(newP) && newP >= 0) {
                            setCart(prev => prev.map(i => i.id === item.id ? { ...i, price: newP } : i));
                          }
                        }
                      }}
                      style={{fontWeight:900,color: isUnderpriced ? C.red : isOverpriced ? C.yellow : color,fontSize:15,cursor:"pointer",textDecoration:"underline dashed"}}
                      title="Кликните для изменения цены"
                    >
                      {fmtM((item.price + ((item.extras?.s6 || 0) + (item.extras?.s7 || 0) + (item.extras?.s2 || 0)) * 500) * item.qty)}
                    </span>
                    {displayRecPrice && (
                      <span style={{fontSize:10, color: isUnderpriced ? C.red : isOverpriced ? C.yellow : C.text, fontWeight:700, marginTop:2}}>
                        Рек: {fmtM(displayRecPrice * item.qty)}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Выбор базы для креманок */}
                {Array.isArray(item.baseIceCream) && item.baseIceCream.length > 0 && (
                  <div style={{marginTop: 8, display:"flex", flexDirection:"column", gap:10}}>
                    {!item.isRozhok && (
<div>
                      <div style={{fontSize: 10, color: C.muted, marginBottom: 4, fontWeight:700}}>ТИП ТАРЫ</div>
                      <div style={{display: "flex", gap: 6}}>
                        <button
                          onClick={() => setCart(prev => prev.map(i => {
                            if (i.baseTcId !== item.baseTcId) return i;
                            const is3 = i.product.toLowerCase().includes("3 шар");
                            const pTc = techCards.find(t => t.product.toLowerCase().includes("пластиков") && t.product.toLowerCase().includes("креманка") && t.product.toLowerCase().includes("3 шар") === is3) || techCards.find(t => t.product.toLowerCase().includes("креманка") && !t.product.toLowerCase().includes("вафельн") && t.product.toLowerCase().includes("3 шар") === is3);
                            if (pTc) return { ...pTc, qty: i.qty, extras: i.extras, baseIceCream: i.baseIceCream, baseTcId: i.baseTcId, bowlType: "Пластиковая" };
                            return { ...i, bowlType: "Пластиковая" };
                          }))}
                          style={{flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${item.bowlType === "Пластиковая" ? C.accent : C.border}`, background: item.bowlType === "Пластиковая" ? C.accentSoft : "transparent", color: item.bowlType === "Пластиковая" ? C.accent : C.muted, fontSize: 11, cursor: "pointer", fontWeight: 700}}
                        >
                          Пластик
                        </button>
                        <button
                          onClick={() => setCart(prev => prev.map(i => {
                            if (i.baseTcId !== item.baseTcId) return i;
                            const is3 = i.product.toLowerCase().includes("3 шар");
                            const wTc = techCards.find(t => t.product.toLowerCase().includes("вафельн") && t.product.toLowerCase().includes("креманка") && t.product.toLowerCase().includes("3 шар") === is3);
                            if (wTc) return { ...wTc, qty: i.qty, extras: i.extras, baseIceCream: i.baseIceCream, baseTcId: i.baseTcId, bowlType: "Вафельная" };
                            return { ...i, bowlType: "Вафельная" };
                          }))}
                          style={{flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${item.bowlType === "Вафельная" ? C.accent : C.border}`, background: item.bowlType === "Вафельная" ? C.accentSoft : "transparent", color: item.bowlType === "Вафельная" ? C.accent : C.muted, fontSize: 11, cursor: "pointer", fontWeight: 700}}
                        >
                          Вафля
                        </button>
                      </div>
                    </div>
)}

                    <div>
                      <div style={{fontSize: 10, color: C.muted, marginBottom: 4, fontWeight:700}}>ШАРИКИ МОРОЖЕНОГО (ПО 50Г)</div>
                      {item.baseIceCream.map((scoop, sIdx) => (
                        <div key={sIdx} style={{display: "flex", gap: 6, marginBottom: 4}}>
                          <button
                            onClick={() => setCart(prev => prev.map(i => i.id === item.id ? { ...i, baseIceCream: i.baseIceCream.map((sc, index) => index === sIdx ? "s6" : sc) } : i))}
                            style={{flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${scoop === "s6" ? C.accent : C.border}`, background: scoop === "s6" ? C.accentSoft : "transparent", color: scoop === "s6" ? C.accent : C.muted, fontSize: 11, cursor: "pointer", fontWeight: 700}}
                          >
                            🍦 Слив.
                          </button>
                          <button
                            onClick={() => setCart(prev => prev.map(i => i.id === item.id ? { ...i, baseIceCream: i.baseIceCream.map((sc, index) => index === sIdx ? "s7" : sc) } : i))}
                            style={{flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${scoop === "s7" ? C.accent : C.border}`, background: scoop === "s7" ? C.accentSoft : "transparent", color: scoop === "s7" ? C.accent : C.muted, fontSize: 11, cursor: "pointer", fontWeight: 700}}
                          >
                            🍦 Шок.
                          </button>
                                                  {!item.isRozhok && (
                            <button
                              onClick={() => setCart(prev => prev.map(i => i.id === item.id ? { ...i, baseIceCream: i.baseIceCream.map((sc, index) => index === sIdx ? "none" : sc) } : i))}
                              style={{flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${scoop === "none" ? C.accent : C.border}`, background: scoop === "none" ? C.accentSoft : "transparent", color: scoop === "none" ? C.accent : C.muted, fontSize: 11, cursor: "pointer", fontWeight: 700}}
                            >
                              Без мороженого (+50г ягод)
                            </button>
                          )}
</div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Добавки (Extras) */}
                {(item.cat === "Креманки" || item.product.toLowerCase().includes("креманка") || item.product.toLowerCase().includes("макси-стакан") || item.product.toLowerCase().includes("макси стакан")) && (
                  <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                    {[
                      { key: "s6", label: "🍦 Слив. 50г", price: 500 },
                      { key: "s7", label: "🍦 Шок. 50г", price: 500 },
                      { key: "s2", label: "🍫 Шок. 15г", price: 500 }
                    ].map(ext => {
                      const active = (item.extras?.[ext.key] || 0) > 0;
                      return (
                        <button
                          key={ext.key}
                          type="button"
                          onClick={() => {
                            setCart(prev => prev.map(i => {
                              if (i.id !== item.id) return i;
                              const ex = { s6: 0, s7: 0, s2: 0, ...i.extras };
                              ex[ext.key] = ex[ext.key] ? 0 : 1;
                              return { ...i, extras: ex };
                            }));
                          }}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: `1px solid ${active ? C.accent : C.border}`,
                            background: active ? C.accentSoft : "transparent",
                            color: active ? C.accent : C.muted,
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          {ext.label} (+{ext.price} ₸)
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        }
      </div>

      {cart.length>0&&!done&&(
        <div style={{padding:"14px 16px",borderTop:`1px solid ${C.border}`}}>
          {/* ПОИСК КЛИЕНТА ДЛЯ ЛОЯЛЬНОСТИ */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>КЛИЕНТ (ПОИСК ПО ТЕЛЕФОНУ)</div>
            <div style={{display:"flex",gap:6}}>
              <input
                value={phoneSearch}
                onChange={e => {
                  const val = e.target.value.replace(/[^0-9+]/g, "");
                  setPhoneSearch(val);
                  const found = (customers || []).find(c => c.phone === val);
                  if (found) {
                    setLoyaltyCustomer(found);
                    setDiscount(found.discount_percent);
                    showToast(`Применена скидка клиента ${found.name}: ${found.discount_percent}%`);
                  } else {
                    setLoyaltyCustomer(null);
                    setDiscount(0);
                  }
                }}
                placeholder="87011234567"
                style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,outline:"none",width:"100%",boxSizing:"border-box",flex:1,padding:"6px 10px"}}
              />
              {loyaltyCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    setPhoneSearch("");
                    setLoyaltyCustomer(null);
                    setDiscount(0);
                  }}
                  style={{background:C.redSoft,color:C.red,border:"none",borderRadius:8,padding:"0 12px",cursor:"pointer",fontWeight:700}}
                >
                  ✕
                </button>
              )}
            </div>
            {loyaltyCustomer && (
              <div style={{fontSize:12,color:C.green,marginTop:6,fontWeight:600}}>
                ✓ {loyaltyCustomer.name} (Скидка: {loyaltyCustomer.discount_percent}%)
              </div>
            )}
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>РУЧНАЯ СКИДКА</div>
            <div style={{display:"flex",gap:6}}>
              {[0,5,10,15,20].map(d=>(
                <button key={d} onClick={()=>{setDiscount(d);setLoyaltyCustomer(null);setPhoneSearch("");}} style={{flex:1,padding:"6px 2px",borderRadius:8,border:`1px solid ${discount===d?C.accent:C.border}`,background:discount===d?C.accentSoft:"transparent",color:discount===d?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>
                  {d===0?"Нет":d+"%"}
                </button>
              ))}
            </div>
          </div>
          {discount>0&&<div style={{fontSize:12,color:C.red,marginBottom:8,textAlign:"right"}}>Скидка: −{fmtM(discAmt)}</div>}
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
            <span style={{fontWeight:800,fontSize:16}}>К оплате:</span>
            <span style={{fontSize:22,fontWeight:900,color:C.accent}}>{fmtM(total)}</span>
          </div>

          {/* Переключатель сплит-оплаты */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <button onClick={()=>{setSplitMode(!splitMode);if(!splitMode){setPayments([]);setPayMode(null);}}} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${splitMode?C.accent:C.border}`,background:splitMode?C.accentSoft:"transparent",color:splitMode?C.accent:C.muted,cursor:"pointer",fontSize:11,fontWeight:700}}>
              {splitMode?"✓ Сплит-оплата":"Разделить оплату"}
            </button>
            {splitMode&&<span style={{fontSize:11,color:C.muted}}>Введите суммы по методам</span>}
          </div>

          {!splitMode ? (
            <>
              {/* Обычная оплата: 4 кнопки */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
                {[
                  {id:"cash",label:"💵 Нал",color:C.green,soft:C.greenSoft},
                  {id:"kaspi",label:"📱 Kaspi",color:C.blue,soft:C.blueSoft},
                  {id:"halyk",label:"🏦 Халык",color:C.purple,soft:C.purpleSoft},
                  {id:"bck",label:"🏛️ БЦК",color:C.yellow,soft:C.yellowSoft},
                ].map(m=>(
                  <button key={m.id} onClick={()=>setPayMode(m.id)} style={{padding:10,background:payMode===m.id?m.soft:C.card,color:payMode===m.id?m.color:C.text,border:`1px solid ${payMode===m.id?m.color:C.border}`,borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
                    {m.label}
                  </button>
                ))}
              </div>
              {payMode==="cash"&&(
                <div style={{marginBottom:10}}>
                  <input value={cashInput} onChange={e=>setCashInput(e.target.value.replace(/\D/g,""))} placeholder="Сумма от клиента..." style={{width:"100%",padding:12,background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,boxSizing:"border-box",fontSize:18,fontWeight:700,outline:"none"}}/>
                  {cashGiven>=total&&cashGiven>0&&<div style={{color:C.green,fontWeight:700,fontSize:14,marginTop:6}}>Сдача: {fmtM(cashGiven-total)}</div>}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Сплит-оплата: поля для каждого метода */}
              <div style={{marginBottom:10}}>
                {[
                  {id:"cash",label:"💵 Нал",color:C.green},
                  {id:"kaspi",label:"📱 Kaspi",color:C.blue},
                  {id:"halyk",label:"🏦 Халык",color:C.purple},
                  {id:"bck",label:"🏛️ БЦК",color:C.yellow},
                ].map(m=>{
                  const existing = payments.find(p=>p.method===m.id);
                  const val = existing ? existing.amount : "";
                  return (
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:12,fontWeight:700,color:m.color,width:85}}>{m.label}</span>
                      <input
                        type="number"
                        value={val}
                        onChange={e=>{
                          const amt = parseInt(e.target.value)||0;
                          setPayments(prev=>{
                            const filtered = prev.filter(p=>p.method!==m.id);
                            if(amt>0) filtered.push({method:m.id,amount:amt});
                            return filtered;
                          });
                        }}
                        placeholder="0"
                        style={{flex:1,padding:"8px 12px",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",fontSize:14,fontWeight:700}}
                      />
                      <span style={{fontSize:11,color:C.muted}}>₸</span>
                    </div>
                  );
                })}
                {(() => {
                  const splitTotal = payments.reduce((s,p)=>s+p.amount,0);
                  const remaining = total - splitTotal;
                  return (
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:8,padding:"8px 12px",borderRadius:8,background:remaining===0?C.greenSoft:C.yellowSoft}}>
                      <span style={{fontSize:12,fontWeight:700,color:remaining===0?C.green:C.yellow}}>
                        {remaining===0?"✓ Сумма совпадает":`Осталось: ${fmtM(remaining)}`}
                      </span>
                      <span style={{fontSize:12,fontWeight:700,color:C.muted}}>Итого: {fmtM(splitTotal)}</span>
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          <button
            onClick={handlePay}
            disabled={splitMode ? payments.reduce((s,p)=>s+p.amount,0)!==total : (!payMode||(payMode==="cash"&&cashGiven<total))}
            style={{width:"100%",padding:16,background:(splitMode?(payments.reduce((s,p)=>s+p.amount,0)===total):payMode)?C.accent:C.dimmed,color:"#000",border:"none",borderRadius:10,fontWeight:900,cursor:(splitMode?(payments.reduce((s,p)=>s+p.amount,0)===total):payMode)?"pointer":"default",fontSize:15}}
          >
            ✓ Принять оплату
          </button>
          {selPoint === "Мастерская" && (
            <button
              type="button"
              onClick={() => setShowPreorderModal(true)}
              style={{width:"100%",padding:12,marginTop:8,background:"transparent",color:C.accent,border:`1px solid ${C.accent}`,borderRadius:10,fontWeight:900,cursor:"pointer",fontSize:13}}
            >
              📅 Оформить предзаказ
            </button>
          )}
        </div>
      )}

      {done&&lastReceipt&&(
        <div style={{padding:16}}>
          <div style={{background:C.greenSoft,border:`1px solid ${C.green}`,borderRadius:12,padding:20,marginBottom:12,textAlign:"center"}}>
            <div style={{fontSize:36}}>✓</div>
            <div style={{fontSize:18,fontWeight:800,color:C.green,marginBottom:4}}>Оплата принята!</div>
            <div style={{fontSize:13,color:C.muted}}>Чек #{lastReceipt.no} · {lastReceipt.point}</div>
            <div style={{fontSize:24,fontWeight:900,marginTop:8}}>{fmtM(lastReceipt.total)}</div>
            {lastReceipt.change>0&&<div style={{color:C.green,fontWeight:700,marginTop:4}}>Сдача: {fmtM(lastReceipt.change)}</div>}
          </div>
          <button onClick={newSale} style={{width:"100%",padding:14,background:C.accent,color:"#000",border:"none",borderRadius:10,fontWeight:900,cursor:"pointer",fontSize:15}}>🍓 Новая продажа</button>
        </div>
      )}

      {/* Кнопка закрытия смены для кассира */}
      {currentUser?.role==="cashier" && currentShift && !done && (
        <div style={{padding:"0 16px 16px"}}>
          <button onClick={()=>{setShowCloseShift(true);setActualCashInput("");}} style={{width:"100%",padding:12,background:C.redSoft,color:C.red,border:`1px solid ${C.red}`,borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:13}}>🔒 Закрыть смену</button>
        </div>
      )}

      {/* Модалка закрытия смены */}
      {showCloseShift && currentShift && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:1000,overflowY:"auto",padding:"40px 0"}}>
          <div style={{background:C.card,borderRadius:16,padding:28,width:360,maxWidth:"90vw",border:`1px solid ${C.border}`,margin:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:16}}>🔒 Закрытие смены</div>
            {(()=>{
              const shiftSales = sales.filter(s=>s.shift_id===currentShift.id);
              const shiftPreorders = (preorders || []).filter(p => p.prepayment_shift_id === currentShift.id);
              const expectedPreordersCash = shiftPreorders.reduce((sum, p) => {
                if (p.status !== "cancelled" && p.prepayment_method === "cash") return sum + (p.prepayment || 0);
                return sum;
              }, 0);
              const expectedCash = shiftSales.reduce((sum,s)=>{
                if(s.payMode==="cash") return sum+s.total;
                if(s.payMode==="split" && s.payments) return sum+s.payments.filter(p=>p.method==="cash").reduce((a,p)=>a+p.amount,0);
                return sum;
              },0) + expectedPreordersCash;
              const actualCash = parseInt(actualCashInput.replace(/\D/g,""))||0;
              const discrepancy = actualCash - expectedCash;
              return (
                <>
                  <div style={{background:C.surface,borderRadius:10,padding:14,marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{color:C.muted,fontSize:13}}>Продаж за смену:</span><span style={{fontWeight:700}}>{shiftSales.length}</span></div>
                    {expectedPreordersCash > 0 && (
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{color:C.muted,fontSize:13}}>Авансы по предзаказам (нал):</span><span style={{fontWeight:700,color:C.accent}}>+{fmtM(expectedPreordersCash)}</span></div>
                    )}
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{color:C.muted,fontSize:13}}>Ожидаемая наличка:</span><span style={{fontWeight:700,color:C.green}}>{fmtM(expectedCash)}</span></div>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Фактическая наличка в кассе (₸)</div>
                    <input value={actualCashInput} onChange={e=>setActualCashInput(e.target.value.replace(/[^0-9]/g,""))} placeholder="0" style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,fontSize:18,fontWeight:700,outline:"none",boxSizing:"border-box"}} autoFocus/>
                  </div>
                  {actualCashInput && (
                    <div style={{background:discrepancy===0?C.greenSoft:discrepancy>0?C.blueSoft:C.redSoft,borderRadius:10,padding:12,marginBottom:14,textAlign:"center"}}>
                      <div style={{fontSize:12,color:C.muted}}>Расхождение</div>
                      <div style={{fontSize:20,fontWeight:900,color:discrepancy===0?C.green:discrepancy>0?C.blue:C.red}}>{discrepancy>0?"+":""}{fmtM(discrepancy)}</div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>setShowCloseShift(false)} style={{flex:1,padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600}}>Отмена</button>
                    <button onClick={()=>{
                      setShowCloseShift(false);
                      if(onCloseShift) onCloseShift(actualCash, expectedCash, discrepancy);
                    }} style={{flex:1,padding:12,borderRadius:10,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontWeight:800,fontSize:14}}>Закрыть смену</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );

  return(
    <div style={{display:"flex",height:"calc(100vh - 57px)"}}>
      <Toast toast={toast}/>

      {!isMobile ? (
        <>
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0}}>
              <button onClick={()=>setPosTab("products")} style={{padding:"14px 20px",background:posTab==="products"?C.card:"transparent",color:posTab==="products"?C.accent:C.muted,border:"none",fontWeight:700,fontSize:14,cursor:"pointer",outline:"none"}}>🍓 Товары</button>
              <button onClick={()=>setPosTab("orders")} style={{padding:"14px 20px",background:posTab==="orders"?C.card:"transparent",color:posTab==="orders"?C.accent:C.muted,border:"none",fontWeight:700,fontSize:14,cursor:"pointer",outline:"none"}}>🧾 Заказы за сегодня</button>
            </div>
            {posTab === "products" ? renderProducts() : renderOrders()}
          </div>
          {renderCart()}
        </>
      ) : (
        <div style={{width:"100%",display:"flex",flexDirection:"column",position:"relative"}}>
          <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
            <button onClick={()=>setPosTab("products")} style={{flex:1,padding:14,background:posTab==="products"?C.card:"transparent",color:posTab==="products"?C.accent:C.muted,border:"none",fontWeight:700,fontSize:14,outline:"none"}}>🍓 Товары</button>
            <button onClick={()=>setPosTab("cart")} style={{flex:1,padding:14,background:posTab==="cart"?C.card:"transparent",color:posTab==="cart"?C.accent:C.muted,border:"none",fontWeight:700,fontSize:14,outline:"none"}}>🛒 Корзина ({cart.reduce((s,i)=>s+i.qty,0)})</button>
            <button onClick={()=>setPosTab("orders")} style={{flex:1,padding:14,background:posTab==="orders"?C.card:"transparent",color:posTab==="orders"?C.accent:C.muted,border:"none",fontWeight:700,fontSize:14,outline:"none"}}>🧾 Заказы</button>
          </div>
          <div style={{flex:1,overflow:"hidden"}}>
            {posTab==="products" ? renderProducts() : posTab==="cart" ? renderCart() : renderOrders()}
          </div>
          
          {posTab==="products" && cart.length>0 && (
            <button onClick={()=>setPosTab("cart")} style={{position:"absolute",bottom:20,right:20,background:C.accent,color:"#000",padding:"14px 22px",borderRadius:30,boxShadow:"0 4px 15px rgba(232,160,180,0.4)",border:"none",fontWeight:900,fontSize:14,cursor:"pointer",zIndex:10}}>
              Оформить ({cart.reduce((s,i)=>s+i.qty,0)} шт) · {fmtM(subtotal)} →
            </button>
          )}
        </div>
      )}

      {showPreorderModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:1000,overflowY:"auto",padding:"40px 0"}}>
          <div style={{background:C.card,borderRadius:16,padding:24,width:400,maxWidth:"95vw",border:`1px solid ${C.border}`,margin:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:16,color:C.accent,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>📅 Оформление предзаказа</span>
              <button onClick={()=>setShowPreorderModal(false)} style={{background:"transparent",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>✕</button>
            </div>

            <div style={{background:C.surface,borderRadius:10,padding:12,marginBottom:14,fontSize:13}}>
              <div style={{fontWeight:700,marginBottom:4,color:C.muted}}>Товары:</div>
              {cart.map(item => (
                <div key={item.id} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span>{item.product} x{item.qty}</span>
                  <span style={{fontWeight:600}}>{fmtM((item.price + ((item.extras?.s6 || 0) + (item.extras?.s7 || 0) + (item.extras?.s2 || 0)) * 500) * item.qty)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:6,fontWeight:800}}>
                <span>Итого к оплате:</span>
                <span style={{color:C.accent}}>{fmtM(total)}</span>
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ТЕЛЕФОН КЛИЕНТА *</label>
                <input
                  type="text"
                  value={preorderClientPhone}
                  onChange={e => {
                    const phone = e.target.value.replace(/[^0-9+]/g, "");
                    setPreorderClientPhone(phone);
                    const found = customers.find(c => c.phone === phone);
                    if (found) {
                      setPreorderClientName(found.name);
                      setDiscount(found.discount_percent);
                      setLoyaltyCustomer(found);
                      setPhoneSearch(found.phone);
                    } else {
                      setDiscount(0);
                      setLoyaltyCustomer(null);
                    }
                  }}
                  placeholder="87011234567"
                  style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13}}
                />
              </div>

              <div>
                <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ИМЯ КЛИЕНТА</label>
                <input
                  type="text"
                  value={preorderClientName}
                  onChange={e => setPreorderClientName(e.target.value)}
                  placeholder="Введите имя..."
                  style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13}}
                />
              </div>

              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ДАТА ВЫДАЧИ *</label>
                  <input
                    type="date"
                    value={preorderDate}
                    onChange={e => setPreorderDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13}}
                  />
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ВРЕМЯ ВЫДАЧИ *</label>
                  <input
                    type="time"
                    value={preorderTime}
                    onChange={e => setPreorderTime(e.target.value)}
                    style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13}}
                  />
                </div>
              </div>

              <div>
                <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ТОЧКА ВЫДАЧИ</label>
                <div style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,boxSizing:"border-box",fontSize:13,fontWeight:700}}>
                  Мастерская (только в мастерской)
                </div>
              </div>

              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ПРЕДОПЛАТА (₸)</label>
                  <input
                    type="number"
                    value={preorderPrepayment}
                    onChange={e => setPreorderPrepayment(e.target.value)}
                    placeholder="0"
                    style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13,fontWeight:700}}
                  />
                </div>
                {parseInt(preorderPrepayment) > 0 && (
                  <div style={{flex:1}}>
                    <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>СПОСОБ ОПЛАТЫ</label>
                    <select
                      value={preorderPayMode}
                      onChange={e => setPreorderPayMode(e.target.value)}
                      style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13}}
                    >
                      <option value="cash">💵 Наличные</option>
                      <option value="kaspi">📱 Kaspi</option>
                      <option value="halyk">🏦 Халык</option>
                      <option value="bck">🏛️ БЦК</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>КОММЕНТАРИЙ К ЗАКАЗУ</label>
                <textarea
                  value={preorderNotes}
                  onChange={e => setPreorderNotes(e.target.value)}
                  placeholder="Особые пожелания..."
                  style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13,height:60,resize:"none"}}
                />
              </div>

              <div style={{display:"flex",gap:10,marginTop:8}}>
                <button
                  type="button"
                  onClick={()=>setShowPreorderModal(false)}
                  style={{flex:1,padding:12,borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600}}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleCreatePreorder}
                  style={{flex:1,padding:12,border:"none",background:C.accent,color:"#000",borderRadius:8,cursor:"pointer",fontWeight:900}}
                >
                  Создать предзаказ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {customizing && <CustomBouquetModal baseTc={customizing} onClose={()=>setCustomizing(null)} onAdd={(tc)=>{ addToCart(tc); setCustomizing(null); }} rawStock={rawStock} C={C} />}
    </div>
  );
}