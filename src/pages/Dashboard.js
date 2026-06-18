import { Toast, useToast } from "../components/Toast";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";
import {
  getConvertedQty, INIT_USERS, initRawStock, initSemiStock, INIT_TECH_CARDS, CAT_COLORS, NAV, fmtM, fmtS, fmt, PAY_LABELS, fmtPay, parseQtyObj, parseSemiQtyObj, getQty, parseLocalDate, getPackagingItems, calcCost, calcProductCOGS, calcCartItemCOGS, getIngName, getIngUnit, restoreStockForSale, processSaleStock, LS, generateUUID, getMergedList, isSessionValid, touchSession, RPC_ENABLED, fmtUnit, checkIsMobile, checkIsPortrait, setWarehouseHistoryWithSync, setWriteOffsWithSync, setUsersWithSync, setCustomersWithSync, setRawStockWithSync, setSemiStockWithSync, setTechCardsWithSync, setSalesWithSync, setExpensesWithSync, checkAdminOrManager, isAdmin, isManager, isSurgeon, canWriteOff, canAddShift, supabase, supaFetch
} from "../utils";
import SearchableSelect from '../components/SearchableSelect';

export default function Dashboard({isMobile,sales,semiStock,rawStock,expenses,currentUser,onCancelSale,users,setSales,showToast,setActiveMenu}){
  const [pointFilter, setPointFilter] = useState("Все");
  const [periodFilter, setPeriodFilter] = useState("Сегодня");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selPoint, setSelPoint] = useState(POINTS[0]);
  const [kpiModal, setKpiModal] = useState(null);
  const [pointModal, setPointModal] = useState(null);

  const now = new Date();
  const todayStr = now.toLocaleDateString("ru-RU");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("ru-RU");

  const filteredSales = sales.filter(s => {
    if (pointFilter !== "Все" && s.point !== pointFilter) return false;
    
    const sDate = parseLocalDate(s.date);
    if (periodFilter === "Сегодня") {
      return s.date === todayStr;
    } else if (periodFilter === "Вчера") {
      return s.date === yesterdayStr;
    } else if (periodFilter === "Неделя") {
      const diffTime = Math.abs(now - sDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    } else if (periodFilter === "Месяц") {
      return sDate.getMonth() === now.getMonth() && sDate.getFullYear() === now.getFullYear();
    } else if (periodFilter === "Свой период") {
      if (customStart) {
        const cs = new Date(customStart);
        cs.setHours(0,0,0,0);
        if (sDate < cs) return false;
      }
      if (customEnd) {
        const ce = new Date(customEnd);
        ce.setHours(23,59,59,999);
        if (sDate > ce) return false;
      }
    }
    return true;
  });

  const totalRev  = filteredSales.reduce((s,i)=>s+i.total,0);
  const totalCOGS = filteredSales.reduce((s,i)=>s+(i.cogs||0),0);

  // Фильтруем расходы по тому же периоду, что и продажи
  const filteredExpenses = (expenses||[]).filter(e => {
    if (!e.paid) return false;
    // Исключаем внесения и сейф — это не операционные расходы
    if (e.cat === "deposit" || e.cat === "safe") return false;
    // Фильтр по точке
    if (pointFilter !== "Все" && e.point !== pointFilter && e.point !== "Вся компания") return false;
    // Фильтр по периоду
    const eDate = parseLocalDate(e.date);
    if (periodFilter === "Сегодня") {
      return e.date === todayStr;
    } else if (periodFilter === "Вчера") {
      return e.date === yesterdayStr;
    } else if (periodFilter === "Неделя") {
      const diffTime = Math.abs(now - eDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    } else if (periodFilter === "Месяц") {
      return eDate.getMonth() === now.getMonth() && eDate.getFullYear() === now.getFullYear();
    } else if (periodFilter === "Свой период") {
      if (customStart) {
        const cs = new Date(customStart);
        cs.setHours(0,0,0,0);
        if (eDate < cs) return false;
      }
      if (customEnd) {
        const ce = new Date(customEnd);
        ce.setHours(23,59,59,999);
        if (eDate > ce) return false;
      }
    }
    return true;
  });

  // Если выбрана конкретная точка, расходы "Вся компания" делим пропорционально на кол-во точек
  const activePointsCount = POINTS.length;
  const totalExp = filteredExpenses.reduce((s,e) => {
    if (pointFilter !== "Все" && e.point === "Вся компания") {
      return s + e.amount / activePointsCount;
    }
    return s + e.amount;
  }, 0);

  const grossP    = totalRev - totalCOGS;
  const netP      = grossP - totalExp;
  const foodCost  = totalRev > 0 ? (totalCOGS / totalRev * 100).toFixed(1) + "%" : "0%";

  const byPoint = POINTS.map((p,i)=>({
    name:p, color:POINT_COLORS[i],
    rev:filteredSales.filter(s=>s.point===p).reduce((a,s)=>a+s.total,0),
    orders:filteredSales.filter(s=>s.point===p).length,
  }));
  const maxRev = Math.max(...byPoint.map(p=>p.rev),1);

  // Пороги для алертов: для учёта в граммах порог 500г, для штучных товаров — 10 шт
  const lowSemi = semiStock.filter(s=>parseSemiQtyObj(s.qty)[selPoint] < 500);
  const lowRaw  = rawStock.filter(r=>{
    const qty = parseQtyObj(r.qty)[selPoint];
    const threshold = r.unit === "г" ? 500 : 10;
    return qty < threshold;
  });

  const isAdmin = currentUser?.role === "admin";
  const KPI = isAdmin ? [
    {id:"rev", label:"ВЫРУЧКА",        val:fmtS(totalRev),  color:C.accent },
    {id:"exp", label:"РАСХОДЫ",        val:fmtS(totalExp),  color:C.red },
  ] : [
    {id:"rev", label:"ВЫРУЧКА",        val:fmtS(totalRev),  color:C.accent },
    {id:"cogs",label:"COGS (себест.)", val:fmtS(totalCOGS), color:C.yellow },
    {id:"foodcost",label:"ФУДКОСТ",    val:foodCost,        color:C.blue },
    {id:"gross",label:"ВАЛОВАЯ ПРИБЫЛЬ",val:fmtS(grossP),    color:grossP>=0?C.green:C.red },
    {id:"net", label:"ЧИСТАЯ ПРИБЫЛЬ", val:fmtS(netP),      color:netP>=0?C.green:C.red },
  ];
  const renderPointModal = () => {
    if (!pointModal) return null;
    const pointSales = filteredSales.filter(s => s.point === pointModal);
    return (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.card,borderRadius:16,padding:28,width:"90%",maxWidth:600,border:`1px solid ${C.border}`,maxHeight:"90vh",overflowY:"auto", WebkitOverflowScrolling:"touch"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
               <h3 style={{margin:0, color:C.text}}>Детализация выручки: {pointModal}</h3>
               <button onClick={()=>setPointModal(null)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>✕</button>
            </div>
            {pointSales.length === 0 ? <p style={{color:C.muted}}>Нет данных за этот период.</p> : (
               <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                 <thead><tr style={{borderBottom:`1px solid ${C.border}`}}><th style={{textAlign:"left",paddingBottom:8}}>Чек</th><th style={{textAlign:"right",paddingBottom:8}}>Сумма</th></tr></thead>
                 <tbody>
                    {pointSales.map(s => (
                       <tr key={s.id} style={{borderBottom:`1px solid ${C.border}40`}}>
                          <td style={{padding:"8px 0"}}>#{s.no} <span style={{fontSize:10,color:C.muted}}>({s.date})</span></td>
                          <td style={{textAlign:"right",fontWeight:"bold",color:C.green}}>{fmtM(s.total)}</td>
                       </tr>
                    ))}
                 </tbody>
               </table>
            )}
          </div>
        </div>
    );
  };

  const renderKpiModal = () => {
    if (!kpiModal) return null;
    let title = "";
    let contentNode = null;
    if (kpiModal === "rev") {
       title = "Детализация Выручки";
       contentNode = (
           <div>
             <div style={{marginBottom: 10, fontSize: 13, color: C.muted}}>Данные построены на основе проведенных продаж за выбранный период ({periodFilter}). Всего чеков: {filteredSales.length}.</div>
             <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                 <thead><tr style={{borderBottom:`1px solid ${C.border}`}}><th style={{textAlign:"left",paddingBottom:8}}>Чек</th><th style={{textAlign:"left",paddingBottom:8}}>Точка</th><th style={{textAlign:"right",paddingBottom:8}}>Сумма</th></tr></thead>
                 <tbody>
                    {filteredSales.map(s => (
                       <tr key={s.id} style={{borderBottom:`1px solid ${C.border}40`}}>
                          <td style={{padding:"8px 0"}}>#{s.no} <span style={{fontSize:10,color:C.muted}}>({s.date})</span></td>
                          <td>{s.point}</td>
                          <td style={{textAlign:"right",fontWeight:"bold",color:C.green}}>{fmtM(s.total)}</td>
                       </tr>
                    ))}
                 </tbody>
             </table>
           </div>
       );
    } else if (kpiModal === "cogs") {
       title = "Детализация Себестоимости (COGS)";
       contentNode = (
           <div>
             <div style={{marginBottom: 10, fontSize: 13, color: C.muted}}>Себестоимость рассчитывается на основе технологических карт (ингредиентов) для каждого проданного товара за {periodFilter}.</div>
             <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                 <thead><tr style={{borderBottom:`1px solid ${C.border}`}}><th style={{textAlign:"left",paddingBottom:8}}>Чек</th><th style={{textAlign:"left",paddingBottom:8}}>Точка</th><th style={{textAlign:"right",paddingBottom:8}}>Себестоимость</th></tr></thead>
                 <tbody>
                    {filteredSales.map(s => (
                       <tr key={s.id} style={{borderBottom:`1px solid ${C.border}40`}}>
                          <td style={{padding:"8px 0"}}>#{s.no}</td>
                          <td>{s.point}</td>
                          <td style={{textAlign:"right",fontWeight:"bold",color:C.yellow}}>{fmtM(s.cogs || 0)}</td>
                       </tr>
                    ))}
                 </tbody>
             </table>
           </div>
       );
    } else if (kpiModal === "exp") {
       title = "Детализация Расходов";
       contentNode = (
           <div>
             <div style={{marginBottom: 10, fontSize: 13, color: C.muted}}>Расходы берутся из вкладки «Расходы», за исключением внесений и изъятий в сейф за {periodFilter}. Общекорпоративные расходы делятся на количество точек (если выбрана конкретная точка).</div>
             <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                 <thead><tr style={{borderBottom:`1px solid ${C.border}`}}><th style={{textAlign:"left",paddingBottom:8}}>Расход</th><th style={{textAlign:"left",paddingBottom:8}}>Точка</th><th style={{textAlign:"right",paddingBottom:8}}>Сумма</th></tr></thead>
                 <tbody>
                    {filteredExpenses.map(e => {
                       let amt = e.amount;
                       let note = "";
                       if (pointFilter !== "Все" && e.point === "Вся компания") {
                           amt = amt / activePointsCount;
                           note = "(разд.)";
                       }
                       return (
                         <tr key={e.id} style={{borderBottom:`1px solid ${C.border}40`}}>
                            <td style={{padding:"8px 0"}}>{e.name} <span style={{fontSize:10,color:C.muted}}>({e.date})</span></td>
                            <td>{e.point} <span style={{fontSize:10,color:C.muted}}>{note}</span></td>
                            <td style={{textAlign:"right",fontWeight:"bold",color:C.red}}>{fmtM(amt)}</td>
                         </tr>
                       );
                    })}
                 </tbody>
             </table>
           </div>
       );
    } else if (kpiModal === "gross") {
       title = "Расчёт Валовой Прибыли";
       contentNode = (
           <div style={{textAlign:"center", padding: 20}}>
             <div style={{fontSize: 16, color: C.muted, marginBottom: 20}}>Валовая прибыль = Выручка − Себестоимость проданных товаров (COGS)</div>
             <div style={{fontSize: 24, fontWeight: "bold", marginBottom: 10}}>
               <span style={{color: C.green}}>{fmtM(totalRev)}</span> − <span style={{color: C.yellow}}>{fmtM(totalCOGS)}</span>
             </div>
             <div style={{fontSize: 32, fontWeight: 900, color: grossP >= 0 ? C.green : C.red}}>
               = {fmtM(grossP)}
             </div>
           </div>
       );
    } else if (kpiModal === "foodcost") {
       title = "Расчёт Фудкоста";
       contentNode = (
           <div style={{textAlign:"center", padding: 20}}>
             <div style={{fontSize: 16, color: C.muted, marginBottom: 20}}>Фудкост = (Себестоимость проданных товаров / Выручка) × 100%</div>
             <div style={{fontSize: 24, fontWeight: "bold", marginBottom: 10}}>
               (<span style={{color: C.yellow}}>{fmtM(totalCOGS)}</span> ÷ <span style={{color: C.green}}>{fmtM(totalRev)}</span>) × 100
             </div>
             <div style={{fontSize: 32, fontWeight: 900, color: C.blue}}>
               = {foodCost}
             </div>
           </div>
       );
    } else if (kpiModal === "net") {
       title = "Расчёт Чистой Прибыли";
       contentNode = (
           <div style={{textAlign:"center", padding: 20}}>
             <div style={{fontSize: 16, color: C.muted, marginBottom: 20}}>Чистая прибыль = Валовая прибыль − Операционные расходы</div>
             <div style={{fontSize: 24, fontWeight: "bold", marginBottom: 10}}>
               <span style={{color: grossP >= 0 ? C.green : C.red}}>{fmtM(grossP)}</span> − <span style={{color: C.red}}>{fmtM(totalExp)}</span>
             </div>
             <div style={{fontSize: 32, fontWeight: 900, color: netP >= 0 ? C.green : C.red}}>
               = {fmtM(netP)}
             </div>
           </div>
       );
    }

    return (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.card,borderRadius:16,padding:28,width:"90%",maxWidth:600,border:`1px solid ${C.border}`,maxHeight:"90vh",overflowY:"auto", WebkitOverflowScrolling:"touch"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
               <h3 style={{margin:0, color:C.text}}>{title}</h3>
               <button onClick={()=>setKpiModal(null)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>✕</button>
            </div>
            {contentNode}
          </div>
        </div>
    );
  };


  const pendingDeletions = sales.filter(s => s.status === "pending");
  const isOwnerOrDirector = currentUser?.role === "owner" || currentUser?.role === "director";

  return (
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      {/* ЗАПРОСЫ НА УДАЛЕНИЕ */}
      {isOwnerOrDirector && pendingDeletions.length > 0 && (
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.red}`,padding:22,marginBottom:22,boxSizing:"border-box"}}>
          <div style={{fontSize:15,fontWeight:800,color:C.red,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <span>⏳ Запросы на удаление чеков ({pendingDeletions.length})</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {pendingDeletions.map(s => {
              const requestedBy = (users||[]).find(u => u.id === s.delete_requested_by)?.name || "Кассир";
              return (
                <div key={s.no} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.surface,padding:"14px 18px",borderRadius:10,border:`1px solid ${C.border}`,flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>Чек #{s.no} ({s.point})</div>
                    <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                      Сумма: <span style={{fontWeight:700,color:C.accent}}>{fmtM(s.total)}</span> | Инициатор: <b>{requestedBy}</b>
                    </div>
                    <div style={{fontSize:12,color:C.text,marginTop:4}}>Позиции: {s.items?.map(it=>`${it.name} x${it.qty}`).join(", ")}</div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={async () => {
                      if (window.confirm(`Одобрить удаление чека #${s.no}?`)) {
                        await onCancelSale(s.no);
                      }
                    }} style={{background:C.green,color:"#000",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:700,cursor:"pointer",fontSize:13}}>Одобрить</button>
                    <button onClick={async () => {
                      if (window.confirm(`Отклонить удаление чека #${s.no}?`)) {
                        setSales(prev => prev.map(x => x.id === s.id ? { ...x, status: "active", delete_requested_by: null } : x));
                        showToast("Запрос на удаление отклонен.");
                      }
                    }} style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:13}}>Отклонить</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ФИЛЬТРЫ */}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",background:C.surface,padding:14,borderRadius:12,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <span style={{fontSize:11,color:C.muted}}>ТОЧКА ПРОДАЖ</span>
          <select value={pointFilter} onChange={e=>setPointFilter(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13}}>
            <option>Все</option>
            {POINTS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <span style={{fontSize:11,color:C.muted}}>ВРЕМЕННОЙ ПЕРИОД</span>
          <select value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13}}>
            <option>За все время</option>
            <option>Сегодня</option>
            <option>Вчера</option>
            <option>Неделя</option>
            <option>Месяц</option>
            <option>Свой период</option>
          </select>
          {periodFilter === "Свой период" && (
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12,width:"50%"}} />
              <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12,width:"50%"}} />
            </div>
          )}
        </div>
      </div>

      {renderKpiModal()}
      {renderPointModal()}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:22}}>
        {KPI.map((k,i)=>(
          <div 
            key={i} 
            onClick={() => { if (isOwnerOrDirector) setKpiModal(k.id) }}
            style={{background:C.card,borderRadius:14,padding:"18px 20px",border:`1px solid ${C.border}`, cursor: isOwnerOrDirector ? "pointer" : "default", transition:"transform 0.1s", transform: "scale(1)"}}
            onMouseOver={(e)=>{ if(isOwnerOrDirector) e.currentTarget.style.transform="scale(1.02)" }}
            onMouseOut={(e)=>{ if(isOwnerOrDirector) e.currentTarget.style.transform="scale(1)" }}
            title={isOwnerOrDirector ? "Кликните для детализации расчёта" : ""}
          >
            <div style={{fontSize:10,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>{k.label}</div>
            <div style={{fontSize:26,fontWeight:900,color:k.color}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,marginBottom:16}}>
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>Выручка по точкам ({periodFilter})</div>
          {byPoint.map((p,i)=>(
            <div 
              key={i} 
              style={{marginBottom:14, cursor: isOwnerOrDirector ? "pointer" : "default", padding: "8px", borderRadius: "8px", transition: "background 0.2s"}}
              onClick={() => { if(isOwnerOrDirector) setPointModal(p.name); }}
              onMouseOver={(e)=>{ if(isOwnerOrDirector) e.currentTarget.style.background=C.surface }}
              onMouseOut={(e)=>{ if(isOwnerOrDirector) e.currentTarget.style.background="transparent" }}
              title={isOwnerOrDirector ? "Посмотреть чеки по этой точке" : ""}
            >
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:4,background:p.color}}/>
                  <span style={{fontWeight:600,fontSize:13}}>{p.name}</span>
                  <span style={{fontSize:11,color:C.muted}}>{p.orders} чеков</span>
                </div>
                <span style={{fontWeight:800,color:p.color}}>{fmtS(p.rev)}</span>
              </div>
              <div style={{height:5,background:C.dimmed,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:5,width:`${Math.round(p.rev/maxRev*100)}%`,background:p.color,borderRadius:3}}/>
              </div>
            </div>
          ))}
        </div>

        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700}}>🔔 Алерты по точке</div>
            <select value={selPoint} onChange={e=>setSelPoint(e.target.value)} style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",outline:"none",fontSize:12}}>
              {POINTS.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          {lowSemi.length===0&&lowRaw.length===0
            ? <div style={{color:C.green,fontSize:13}}>✓ Всё в порядке</div>
            : null}
          {lowSemi.map((s,i)=><div key={i} style={{padding:"10px 12px",borderRadius:10,background:C.yellowSoft,color:C.yellow,marginBottom:8,fontSize:13}}>⚠ Мало на кухне: <b>{s.name}</b> — {fmt(parseSemiQtyObj(s.qty)[selPoint])} {s.unit}</div>)}
          {lowRaw.map((r,i)=><div key={i} style={{padding:"10px 12px",borderRadius:10,background:C.redSoft,color:C.red,marginBottom:8,fontSize:13}}>🔴 Критически: <b>{r.name}</b> — {fmt(parseQtyObj(r.qty)[selPoint])} {r.unit}</div>)}
        </div>
      </div>

      {filteredSales.length>0&&(
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,boxSizing:"border-box"}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Последние продажи</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:600}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Чек","Точка","Позиции","Оплата",!isAdmin && "COGS","Сумма","Дата / Время",""].filter(Boolean).map((h,i)=>
                    <th key={i} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...filteredSales].reverse().slice(0,10).map((s,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}40`}}>
                    <td style={{padding:"10px 12px",color:C.muted}}>#{s.no}</td>
                    <td style={{padding:"10px 12px"}}>{s.point}</td>
                    <td style={{padding:"10px 12px",color:C.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.items?.map(x=>x.name).join(", ")}</td>
                    <td style={{padding:"10px 12px"}}>{fmtPay(s)}</td>
                    {!isAdmin && <td style={{padding:"10px 12px",color:C.yellow}}>{fmtM(s.cogs||0)}</td>}
                    <td style={{padding:"10px 12px",fontWeight:800,color:C.accent}}>{fmtM(s.total)}</td>
                    <td style={{padding:"10px 12px",color:C.muted}}>{s.date ? `${s.date} ${s.time}` : s.time}</td>
                    <td style={{padding:"10px 12px"}}>
                      {currentUser?.role === "owner" && (
                        <button onClick={() => {
                          if (window.confirm(`Аннулировать продажу #${s.no} на сумму ${fmtM(s.total)}?`)) {
                            onCancelSale(s.no);
                          }
                        }} style={{background:C.red + "1a",color:C.red,border:`1px solid ${C.red}40`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                          Аннулировать
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}