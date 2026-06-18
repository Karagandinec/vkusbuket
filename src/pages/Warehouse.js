import { Toast, useToast } from "../components/Toast";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";
import {
  getConvertedQty, INIT_USERS, initRawStock, initSemiStock, INIT_TECH_CARDS, CAT_COLORS, NAV, fmtM, fmtS, fmt, PAY_LABELS, fmtPay, parseQtyObj, parseSemiQtyObj, getQty, parseLocalDate, getPackagingItems, calcCost, calcProductCOGS, calcCartItemCOGS, getIngName, getIngUnit, restoreStockForSale, processSaleStock, LS, generateUUID, getMergedList, isSessionValid, touchSession, RPC_ENABLED, fmtUnit, checkIsMobile, checkIsPortrait, setWarehouseHistoryWithSync, setWriteOffsWithSync, setUsersWithSync, setCustomersWithSync, setRawStockWithSync, setSemiStockWithSync, setTechCardsWithSync, setSalesWithSync, setExpensesWithSync, checkAdminOrManager, isAdmin, isManager, isSurgeon, canWriteOff, canAddShift, supabase, supaFetch
} from "../utils";
import SearchableSelect from '../components/SearchableSelect';

export default function Warehouse({isMobile,rawStock,setRawStock,semiStock,setSemiStock,currentUser,sales,expenses,techCards,history,setHistory}){
  const handleCorrection = (item, loc, currentQty, isRaw) => {
     if (currentUser?.role !== "owner" && currentUser?.role !== "director") {
         return; // Only owner/director can correct
     }
     const val = window.prompt(`Введите правильный остаток для "${item.name}" в локации "${loc}" (сейчас: ${currentQty}):`, currentQty);
     if (val === null) return;
     const newQty = parseFloat(val.replace(',', '.'));
     if (isNaN(newQty) || newQty < 0) {
         alert("Некорректное значение");
         return;
     }
     if (newQty === currentQty) return;
     
     const diff = newQty - currentQty;
     const sign = diff > 0 ? "+" : "";

     if (isRaw) {
        setRawStock(prev => prev.map(r => {
           if(r.id !== item.id) return r;
           const qObj = parseQtyObj(r.qty);
           qObj[loc] = newQty;
           return {...r, qty: qObj};
        }));
     } else {
        setSemiStock(prev => prev.map(s => {
           if(s.id !== item.id) return s;
           const qObj = parseSemiQtyObj(s.qty);
           qObj[loc] = newQty;
           return {...s, qty: qObj};
        }));
     }
     
     const histId = generateUUID();
     const newHistItem = {
      id: histId,
      date: new Date().toLocaleDateString("ru-RU"),
      item: item.name,
      qty: diff,
      unit: item.unit,
      price: item.price || 0,
      supplier: "Корректировка",
      location: loc,
      type: "correction"
     };
     setHistory(h => [newHistItem, ...h]);
     showToast(`Корректировка: ${item.name} (${sign}${diff} ${item.unit})`);
  };

  const [showAdd,setShowAdd]=useState(false);
  const [search,setSearch]=useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState("");
  const [isRawCollapsed, setIsRawCollapsed] = useState(false);
  const [isSemiCollapsed, setIsSemiCollapsed] = useState(false);
  const [form,setForm]=useState({itemId:"r1",price:"",qty:"",supplier:"",location:currentUser.role==="cashier"?currentUser.point:"Склад",manualEntry:false,customName:"",customType:"raw",customUnit:"г"});
  const [toast,showToast]=useToast();

  const handleDeleteHistory = (itemToDelete) => {
    if (!window.confirm("Удалить этот приход и списать добавленное количество со склада?")) return;
    
    let itemRef = rawStock.find(r => r.name === itemToDelete.item);
    if (!itemRef) itemRef = semiStock.find(s => s.name === itemToDelete.item);

    if (itemRef) {
       const qtyToRevert = parseFloat(itemToDelete.qty) || 0;
       const loc = itemToDelete.location || "Мастерская";
       
       if (rawStock.some(r => r.id === itemRef.id)) {
          setRawStock(prev => prev.map(item => {
             if (item.id !== itemRef.id) return item;
             const qtyObj = typeof item.qty === 'object' ? {...item.qty} : {"Мастерская": parseFloat(item.qty)||0};
             const cur = qtyObj[loc] || 0;
             qtyObj[loc] = Math.max(0, Math.round((cur - qtyToRevert)*1000)/1000);
             return {...item, qty: qtyObj};
          }));
       } else {
          setSemiStock(prev => prev.map(item => {
             if (item.id !== itemRef.id) return item;
             const qtyObj = typeof item.qty === 'object' ? {...item.qty} : {"Мастерская": parseFloat(item.qty)||0};
             const cur = qtyObj[loc] || 0;
             qtyObj[loc] = Math.max(0, Math.round((cur - qtyToRevert)*1000)/1000);
             return {...item, qty: qtyObj};
          }));
       }
    }

    setHistory(prev => prev.filter(h => h.id !== itemToDelete.id));
    showToast("Приход удален, количество списано");
  };

  const handleAdd=(e)=>{
    e.preventDefault();
    const qty=parseFloat(form.qty),price=parseFloat(form.price)||0;
    if(!qty||qty<=0){showToast("Введите количество",true);return;}
    
    if (form.manualEntry) {
      if (!form.customName.trim()) { showToast("Введите название товара", true); return; }
      if (!form.customUnit.trim()) { showToast("Введите единицу измерения", true); return; }
      
      const newId = (form.customType === "raw" ? "r_" : "s_") + Date.now();
      const name = form.customName.trim();
      const unit = form.customUnit.trim();
      
      const qtyObj = { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 };
      qtyObj[form.location] = qty;
      
      if (form.customType === "raw") {
        const newItem = { id: newId, name, unit, price, qty: qtyObj };
        setRawStock(prev => [...prev, newItem]);
        showToast(`Добавлено новое сырьё: ${name} (+${qty} ${unit})`);
      } else {
        const newItem = { id: newId, name, unit, qty: qtyObj, rawId: null };
        setSemiStock(prev => [...prev, newItem]);
        showToast(`Добавлен новый полуфабрикат: ${name} (+${qty} ${unit})`);
      }
    } else {
      setRawStock(prev=>prev.map(item=>{
        if(item.id!==form.itemId) return item;
        const qtyObj = parseQtyObj(item.qty);
        const cur = qtyObj[form.location] || 0;
        const avgPrice = cur>0 ? Math.round((cur*item.price+qty*price)/(cur+qty)) : price;
        
        qtyObj[form.location] = Math.round((cur+qty)*1000)/1000;
        return{...item,qty:qtyObj,price:avgPrice};
      }));
      const item=rawStock.find(r=>r.id===form.itemId);
      showToast(`Оприходовано: ${item?.name} +${qty} ${item?.unit} на ${form.location}`);
    }
    
    const itemName = form.manualEntry ? form.customName.trim() : rawStock.find(r=>r.id===form.itemId)?.name;
    const itemUnit = form.manualEntry ? form.customUnit.trim() : rawStock.find(r=>r.id===form.itemId)?.unit;
    
    const histId = generateUUID();
    const newHistItem = {
      id: histId,
      date: new Date().toLocaleDateString("ru-RU"),
      item: itemName,
      qty,
      unit: itemUnit,
      price,
      supplier: form.supplier||"—",
      location: form.location
    };
    setHistory(h => [newHistItem, ...h]);
    
    setForm({
      itemId:"r1",
      price:"",
      qty:"",
      supplier:"",
      location:currentUser.role==="cashier"?currentUser.point:"Склад",
      manualEntry: false,
      customName: "",
      customType: "raw",
      customUnit: "г"
    });
    setShowAdd(false);
  };

  const isCashier = currentUser.role === "cashier";
  const myPoint = currentUser.point;
  const filteredHistory = isCashier ? history.filter(h => h.location === myPoint) : history;

  const displayedHistory = React.useMemo(() => {
    if (!historyDateFilter) return filteredHistory;
    const [y, m, d] = historyDateFilter.split("-");
    const fmtDate = `${d}.${m}.${y}`;
    return filteredHistory.filter(h => h.date === fmtDate);
  }, [filteredHistory, historyDateFilter]);

  // Данные за сегодня для кассира
  const todayStr = new Date().toLocaleDateString("ru-RU");
  const todaySales = isCashier ? (sales||[]).filter(s => s.point === myPoint && s.date === todayStr) : [];

  // Расчет поступившего сегодня ассортимента (для кассира)
  const receivedGrouped = {};
  filteredHistory
    .filter(h => h.date === todayStr)
    .forEach(h => {
      if (!receivedGrouped[h.item]) {
        receivedGrouped[h.item] = { qty: 0, unit: h.unit };
      }
      receivedGrouped[h.item].qty += h.qty;
    });

  // Расчет израсходованного сегодня ассортимента (для кассира)
  const consumedGrouped = {};
  const addCons = (name, qty, unit) => {
    const roundedQty = Math.round(qty * 1000) / 1000;
    if (roundedQty <= 0) return;
    if (!consumedGrouped[name]) {
      consumedGrouped[name] = { qty: 0, unit };
    }
    consumedGrouped[name].qty += roundedQty;
  };

  todaySales.forEach(sale => {
    (sale.items || []).forEach(item => {
      const tc = (techCards || []).find(t => t.id === item.id || t.product === item.name);
      if (tc) {
        (tc.ings || []).forEach(ing => {
          const targetUnit = ing.rid ? rawStock.find(r=>r.id===ing.rid)?.unit : semiStock.find(s=>s.id===ing.sid)?.unit;
          const convertedQty = getConvertedQty(ing.qty, ing.unit || targetUnit, targetUnit);
          const spend = convertedQty * item.qty * (1 + (ing.loss || 0) / 100);
          if (ing.rid) {
            const raw = (rawStock || []).find(r => r.id === ing.rid);
            if (raw) addCons(raw.name, spend, raw.unit);
          } else {
            const semi = (semiStock || []).find(s => s.id === ing.sid);
            if (semi) addCons(semi.name, spend, semi.unit);
          }
        });
        const packaging = getPackagingItems(item);
        (packaging || []).forEach(pkg => {
          const raw = (rawStock || []).find(r => r.id === pkg.rawId);
          if (raw) addCons(raw.name, pkg.qty * item.qty, raw.unit);
        });
      }
      if (item.extras) {
        if (item.extras.s6 > 0) {
          const semi = (semiStock || []).find(s => s.id === "s6");
          if (semi) addCons(semi.name, item.extras.s6 * 50 * item.qty, semi.unit);
        }
        if (item.extras.s7 > 0) {
          const semi = (semiStock || []).find(s => s.id === "s7");
          if (semi) addCons(semi.name, item.extras.s7 * 50 * item.qty, semi.unit);
        }
        if (item.extras.s2 > 0) {
          const semi = (semiStock || []).find(s => s.id === "s2");
          if (semi) addCons(semi.name, item.extras.s2 * 15 * item.qty, semi.unit);
        }
      }
    });
  });

  try {
    const saved = localStorage.getItem("vb_writeoffs_log");
    const log = saved ? JSON.parse(saved) : [];
    log.filter(l => l.location === myPoint && l.date === todayStr).forEach(l => {
      addCons(l.item, l.qty, l.unit);
    });
  } catch (e) {}

  return(
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      <Toast toast={toast}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={{margin:0}}>▣ Складской учёт {isCashier ? `(${myPoint})` : ""}</h2>
        <button onClick={()=>setShowAdd(v=>!v)} style={{padding:"10px 22px",borderRadius:10,border:"none",background:C.green,color:"#000",fontWeight:800,cursor:"pointer",fontSize:14}}>
          {showAdd?"✕ Отмена":"+ Оприходовать"}
        </button>
      </div>

      {showAdd&&(
        <form onSubmit={handleAdd} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:15}}>
            <input 
              type="checkbox" 
              id="manualEntry" 
              checked={form.manualEntry} 
              onChange={e=>{
                const checked = e.target.checked;
                setForm(f=>({...f, manualEntry: checked, customName: "", customType: "raw", customUnit: "г", price: "", qty: ""}));
              }}
              style={{cursor:"pointer",width:16,height:16}}
            />
            <label htmlFor="manualEntry" style={{fontSize:13,fontWeight:700,cursor:"pointer",color:form.manualEntry?C.accent:C.text}}>
              Добавить товар вручную (которого нет в списке)
            </label>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,alignItems:"end"}}>
            {!isCashier && (
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Локация поступления</div>
                <select value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 10px",color:C.text,outline:"none"}}>
                  {ALL_LOCATIONS.map(l=><option key={l}>{l}</option>)}
                </select>
              </div>
            )}
            
            {form.manualEntry ? (
              <>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Название товара</div>
                  <input required value={form.customName} onChange={e=>setForm(f=>({...f,customName:e.target.value}))} placeholder="Введите название" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Тип товара</div>
                  <select value={form.customType} onChange={e=>setForm(f=>({...f,customType:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 10px",color:C.text,outline:"none"}}>
                    <option value="raw">Сырьё / упаковка</option>
                    <option value="semi">Полуфабрикат</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Ед. измерения</div>
                  <input required value={form.customUnit} onChange={e=>setForm(f=>({...f,customUnit:e.target.value}))} placeholder="г, шт, уп" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
                </div>
                {form.customType === "raw" ? (
                  <div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Цена закупа (₸/ед.)</div>
                    <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ) : (
                  <div style={{display:"none"}} />
                )}
              </>
            ) : (
              <>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Позиция</div>
                  <select value={form.itemId} onChange={e=>setForm(f=>({...f,itemId:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 10px",color:C.text,outline:"none"}}>
                    {rawStock.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Цена закупа (₸/ед.)</div>
                  <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
                </div>
              </>
            )}
            
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Количество</div>
              <input type="number" step="0.01" required value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} placeholder="0" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Поставщик</div>
              <input value={form.supplier} onChange={e=>setForm(f=>({...f,supplier:e.target.value}))} placeholder="Напр. ИП Жанибеков" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <button type="submit" style={{padding:"11px 20px",borderRadius:8,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>✓ Сохранить</button>
          </div>
        </form>
      )}

      {/* Карточки сводки за сегодня для кассира */}
      {isCashier && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,marginBottom:20}}>
          {/* Блок Приход за сегодня */}
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:20}}>
            <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",marginBottom:12,fontWeight:700}}>📥 Поступило сегодня на точку</div>
            {Object.keys(receivedGrouped).length === 0 ? (
              <div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>Поступлений сегодня не было</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {Object.entries(receivedGrouped).map(([name, info]) => (
                  <div key={name} style={{display:"flex",justifyContent:"space-between",fontSize:13,borderBottom:`1px solid ${C.border}40`,paddingBottom:6}}>
                    <span style={{fontWeight:600}}>{name}</span>
                    <span style={{color:C.blue,fontWeight:800}}>+{fmt(info.qty)} {info.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Блок Расход за сегодня */}
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:20}}>
            <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",marginBottom:12,fontWeight:700}}>📤 Израсходовано сегодня (POS + списания)</div>
            {Object.keys(consumedGrouped).length === 0 ? (
              <div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>Расхода сегодня не было</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {Object.entries(consumedGrouped).map(([name, info]) => (
                  <div key={name} style={{display:"flex",justifyContent:"space-between",fontSize:13,borderBottom:`1px solid ${C.border}40`,paddingBottom:6}}>
                    <span style={{fontWeight:600}}>{name}</span>
                    <span style={{color:C.red,fontWeight:800}}>-{fmt(info.qty)} {info.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      

      <div style={{marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск по складу..." style={{width:"100%",padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,outline:"none",boxSizing:"border-box",fontSize:14}}/>
      </div>
      {/* Таблица сырья */}
      <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:20,alignItems:"flex-start",marginBottom:20}}>
        <div style={{flex:1,minWidth:0,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <div 
          onClick={() => setIsRawCollapsed(!isRawCollapsed)}
          style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
        >
          <span>📦 Остатки сырья и упаковки</span>
          <span style={{fontSize:13,color:C.muted,fontWeight:"normal"}}>{isRawCollapsed ? "▼ Развернуть" : "▲ Свернуть"}</span>
        </div>
        {!isRawCollapsed && (
          <div style={{overflowX:"auto", overflowY:"auto", maxHeight:"50vh"}}>
          <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:13,minWidth:650}}>
            <thead>
              <tr style={{background:C.surface,borderBottom:`1px solid ${C.border}`}}>
                {isCashier ? (
                  ["Наименование","Ед.","Остаток на точке","Статус"].map((h,i)=>
                    <th key={i} style={{padding:"13px 18px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )
                ) : (
                  ["Наименование","Ед.","На Складе","В Мастерской","В Фуд Траке","В Жаре","В Парке","Ср. цена","Итого (₸)","Статус"].map((h,i)=>
                    <th key={i} style={{padding:"13px 18px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rawStock.filter(r => {
                if(search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
                const qObj = parseQtyObj(r.qty);
                const totalQty = isCashier ? qObj[myPoint] : Object.values(qObj).reduce((a,b)=>a+b,0);
                return totalQty > 0;
              }).map((r,i)=>{
                const qObj = parseQtyObj(r.qty);
                const totalQty = isCashier ? qObj[myPoint] : Object.values(qObj).reduce((a,b)=>a+b,0);
                return(
                  <tr key={r.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?"transparent":C.surface+"30"}}>
                    <td style={{padding:"13px 18px",fontWeight:600}}>{r.name}</td>
                    <td style={{padding:"13px 18px",color:C.muted}}>{fmtUnit(r.unit)}</td>
                    {isCashier ? (
                      <td style={{padding:"13px 18px",fontWeight:800}}>{fmt(qObj[myPoint])}</td>
                    ) : (
                      <>
                        <td onClick={() => handleCorrection(r, "Склад", qObj["Склад"] || 0, true)} style={{padding:"13px 18px",fontWeight:800, cursor:(currentUser?.role==="owner"||currentUser?.role==="director")?"pointer":"default", textDecoration:(currentUser?.role==="owner"||currentUser?.role==="director")?"underline dashed":"none"}} title="Кликните для корректировки">{fmt(qObj["Склад"]||0)}</td>
                        <td onClick={() => handleCorrection(r, "Мастерская", qObj["Мастерская"] || 0, true)} style={{padding:"13px 18px", cursor:(currentUser?.role==="owner"||currentUser?.role==="director")?"pointer":"default", textDecoration:(currentUser?.role==="owner"||currentUser?.role==="director")?"underline dashed":"none"}}>{fmt(qObj["Мастерская"]||0)}</td>
                        <td onClick={() => handleCorrection(r, "Фуд Трак", qObj["Фуд Трак"] || 0, true)} style={{padding:"13px 18px", cursor:(currentUser?.role==="owner"||currentUser?.role==="director")?"pointer":"default", textDecoration:(currentUser?.role==="owner"||currentUser?.role==="director")?"underline dashed":"none"}}>{fmt(qObj["Фуд Трак"]||0)}</td>
                        <td onClick={() => handleCorrection(r, "Жара", qObj["Жара"] || 0, true)} style={{padding:"13px 18px", cursor:(currentUser?.role==="owner"||currentUser?.role==="director")?"pointer":"default", textDecoration:(currentUser?.role==="owner"||currentUser?.role==="director")?"underline dashed":"none"}}>{fmt(qObj["Жара"]||0)}</td>
                        <td onClick={() => handleCorrection(r, "Парк", qObj["Парк"] || 0, true)} style={{padding:"13px 18px", cursor:(currentUser?.role==="owner"||currentUser?.role==="director")?"pointer":"default", textDecoration:(currentUser?.role==="owner"||currentUser?.role==="director")?"underline dashed":"none"}}>{fmt(qObj["Парк"]||0)}</td>
                        <td style={{padding:"13px 18px",color:C.green,fontWeight:700}}>{fmtM(r.price)}</td>
                        <td style={{padding:"13px 18px",color:C.accent,fontWeight:700}}>{fmtM(Math.round(totalQty*r.price))}</td>
                      </>
                    )}
                    <td style={{padding:"13px 18px"}}>
                      <span style={{fontSize:11,fontWeight:700,color:totalQty<5?C.red:totalQty<15?C.yellow:C.green,background:totalQty<5?C.redSoft:totalQty<15?C.yellowSoft:C.greenSoft,padding:"3px 10px",borderRadius:20}}>
                        {totalQty<5?"Критично":totalQty<15?"Мало":"OK"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Таблица полуфабрикатов */}
        <div style={{flex:1,minWidth:0,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <div 
          onClick={() => setIsSemiCollapsed(!isSemiCollapsed)}
          style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
        >
          <span>⚗️ Полуфабрикаты на кухне</span>
          <span style={{fontSize:13,color:C.muted,fontWeight:"normal"}}>{isSemiCollapsed ? "▼ Развернуть" : "▲ Свернуть"}</span>
        </div>
        {!isSemiCollapsed && (
          <div style={{overflowX:"auto", overflowY:"auto", maxHeight:"50vh"}}>
          <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:13,minWidth:650}}>
            <thead>
              <tr style={{background:C.surface,borderBottom:`1px solid ${C.border}`}}>
                {isCashier ? (
                  ["Наименование","Ед.","Остаток на кухне","Статус"].map((h,i)=>
                    <th key={i} style={{padding:"13px 18px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )
                ) : (
                  ["Наименование","Ед.","На Складе","В Мастерской","В Фуд Траке","В Жаре","В Парке","Статус"].map((h,i)=>
                    <th key={i} style={{padding:"13px 18px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {semiStock.filter(s => {
                if(search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
                const qtyObj = parseSemiQtyObj(s.qty);
                const totalQty = isCashier ? qtyObj[myPoint] : Object.values(qtyObj).reduce((a,b)=>a+b,0);
                return totalQty > 0;
              }).map((s,i)=>{
                const qtyObj = parseSemiQtyObj(s.qty);
                const totalQty = isCashier ? qtyObj[myPoint] : Object.values(qtyObj).reduce((a,b)=>a+b,0);
                const limitCritical = s.unit === "г" ? 500 : 5;
                const limitLow = s.unit === "г" ? 1500 : 15;
                const status = totalQty < limitCritical ? "Критично" : totalQty < limitLow ? "Мало" : "OK";
                return(
                  <tr key={s.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?"transparent":C.surface+"30"}}>
                    <td style={{padding:"13px 18px",fontWeight:600}}>{s.name}</td>
                    <td style={{padding:"13px 18px",color:C.muted}}>{fmtUnit(s.unit)}</td>
                    {isCashier ? (
                      <td style={{padding:"13px 18px",fontWeight:800}}>{fmt(qtyObj[myPoint])}</td>
                    ) : (
                      <>
                        <td onClick={() => handleCorrection(s, "Склад", qtyObj["Склад"] || 0, false)} style={{padding:"13px 18px",fontWeight:800, cursor:(currentUser?.role==="owner"||currentUser?.role==="director")?"pointer":"default", textDecoration:(currentUser?.role==="owner"||currentUser?.role==="director")?"underline dashed":"none"}} title="Кликните для корректировки">{fmt(qtyObj["Склад"]||0)}</td>
                        <td onClick={() => handleCorrection(s, "Мастерская", qtyObj["Мастерская"] || 0, false)} style={{padding:"13px 18px", cursor:(currentUser?.role==="owner"||currentUser?.role==="director")?"pointer":"default", textDecoration:(currentUser?.role==="owner"||currentUser?.role==="director")?"underline dashed":"none"}}>{fmt(qtyObj["Мастерская"]||0)}</td>
                        <td onClick={() => handleCorrection(s, "Фуд Трак", qtyObj["Фуд Трак"] || 0, false)} style={{padding:"13px 18px", cursor:(currentUser?.role==="owner"||currentUser?.role==="director")?"pointer":"default", textDecoration:(currentUser?.role==="owner"||currentUser?.role==="director")?"underline dashed":"none"}}>{fmt(qtyObj["Фуд Трак"]||0)}</td>
                        <td onClick={() => handleCorrection(s, "Жара", qtyObj["Жара"] || 0, false)} style={{padding:"13px 18px", cursor:(currentUser?.role==="owner"||currentUser?.role==="director")?"pointer":"default", textDecoration:(currentUser?.role==="owner"||currentUser?.role==="director")?"underline dashed":"none"}}>{fmt(qtyObj["Жара"]||0)}</td>
                        <td onClick={() => handleCorrection(s, "Парк", qtyObj["Парк"] || 0, false)} style={{padding:"13px 18px", cursor:(currentUser?.role==="owner"||currentUser?.role==="director")?"pointer":"default", textDecoration:(currentUser?.role==="owner"||currentUser?.role==="director")?"underline dashed":"none"}}>{fmt(qtyObj["Парк"]||0)}</td>
                      </>
                    )}
                    <td style={{padding:"13px 18px"}}>
                      <span style={{fontSize:11,fontWeight:700,color:status==="Критично"?C.red:status==="Мало"?C.yellow:C.green,background:status==="Критично"?C.redSoft:status==="Мало"?C.yellowSoft:C.greenSoft,padding:"3px 10px",borderRadius:20}}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>
      </div>

      {(filteredHistory.length>0 || historyDateFilter)&&(
        <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
            <div style={{fontSize:14,fontWeight:700}}>История поступлений {isCashier ? `на точку ${myPoint}` : ""}</div>
            <input type="date" value={historyDateFilter} onChange={e=>setHistoryDateFilter(e.target.value)} style={{padding:8,borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,color:C.text,outline:"none"}}/>
          </div>
          {displayedHistory.length === 0 ? (
            <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>Нет поступлений за выбранную дату</div>
          ) : (
            displayedHistory.map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<displayedHistory.length-1?`1px solid ${C.border}`:"none"}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{h.item}</div>
                <div style={{fontSize:11,color:C.muted}}>{h.supplier} · {h.location} · {h.date}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:800,color:C.green,fontSize:14}}>+{h.qty} {h.unit}</div>
                  {h.price>0&&<div style={{fontSize:11,color:C.muted}}>{fmtM(h.price)}/ед.</div>}
                </div>
                {!isCashier && (
                  <button onClick={()=>handleDeleteHistory(h)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:"4px 8px"}} title="Удалить запись">
                    🗑
                  </button>
                )}
              </div>
            </div>
          )))}
        </div>
      )}
    </div>
  );
}

// ─── РАСХОДЫ ─────────────────────────────────────────────────────────────────
const EXP_CATS = [
  {id:"rent",      label:"Аренда",    icon:"🏪", color:C.blue},
  {id:"salary",    label:"Зарплата",  icon:"👤", color:C.purple},
  {id:"marketing", label:"Реклама",   icon:"📣", color:C.accent},
  {id:"utility",   label:"Коммунальные услуги", icon:"💡", color:C.yellow},
  {id:"tax",       label:"Налоги",    icon:"🧾", color:C.red},
  {id:"deposit",   label:"Внесение личных средств", icon:"📥", color:C.green},
  {id:"safe",      label:"Сейф (Снятие наличных)", icon:"🏦", color:C.yellow},
  {id:"other",     label:"Прочее",    icon:"📝", color:C.muted},
];