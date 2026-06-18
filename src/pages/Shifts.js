import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";
import {
  getConvertedQty, INIT_USERS, initRawStock, initSemiStock, INIT_TECH_CARDS, CAT_COLORS, NAV, fmtM, fmtS, fmt, PAY_LABELS, fmtPay, parseQtyObj, parseSemiQtyObj, getQty, parseLocalDate, getPackagingItems, calcCost, calcProductCOGS, calcCartItemCOGS, getIngName, getIngUnit, restoreStockForSale, processSaleStock, LS, generateUUID, getMergedList, isSessionValid, touchSession, RPC_ENABLED, fmtUnit, checkIsMobile, checkIsPortrait, setWarehouseHistoryWithSync, setWriteOffsWithSync, setUsersWithSync, setCustomersWithSync, setRawStockWithSync, setSemiStockWithSync, setTechCardsWithSync, setSalesWithSync, setExpensesWithSync, checkAdminOrManager, isAdmin, isManager, isSurgeon, canWriteOff, canAddShift, supabase, supaFetch
} from "../utils";

const Shifts = React.memo(function Shifts({isMobile, shifts, currentUser, sales, expenses }){
  const [filterPoint, setFilterPoint] = React.useState("all");
  const [expandedShift, setExpandedShift] = React.useState(null);
  const [sortBy, setSortBy] = React.useState("date_desc");
  const [search, setSearch] = React.useState("");

  const fmtDT = (iso) => {
    if(!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  };

  const points = React.useMemo(() => {
    if (!shifts) return [];
    const pts = new Set(shifts.map(s => s.point).filter(Boolean));
    return Array.from(pts);
  }, [shifts]);

  const filteredShifts = React.useMemo(() => {
    if (!shifts) return [];
    let res = [...shifts];
    if (currentUser?.role === "cashier") {
      res = res.filter(s => s.cashier_id === currentUser.id || s.cashier_name === currentUser.name);
    }
    
    if (filterPoint !== "all") {
      res = res.filter(s => s.point === filterPoint);
    }
    
    if (search.trim() !== "") {
      const q = search.toLowerCase();
      res = res.filter(s => 
        (s.cashier_name && s.cashier_name.toLowerCase().includes(q)) ||
        (s.point && s.point.toLowerCase().includes(q)) ||
        (s.opened_at && fmtDT(s.opened_at).toLowerCase().includes(q))
      );
    }
    
    res.sort((a, b) => {
      if (sortBy === "date_desc") {
        return new Date(b.opened_at) - new Date(a.opened_at);
      } else if (sortBy === "date_asc") {
        return new Date(a.opened_at) - new Date(b.opened_at);
      } else if (sortBy === "point_asc") {
        const pA = a.point || "";
        const pB = b.point || "";
        return pA.localeCompare(pB);
      } else if (sortBy === "point_desc") {
        const pA = a.point || "";
        const pB = b.point || "";
        return pB.localeCompare(pA);
      }
      return 0;
    });
    
    return res;
  }, [shifts, filterPoint, sortBy, search]);

  const inputStyle = {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.surface,
    color: C.text,
    outline: "none",
    fontSize: 13
  };

  return(
    <div style={{padding:isMobile?"12px 14px":"20px 28px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:20,fontWeight:800}}>🕐 Журнал смен</div>
        
        {shifts && shifts.length > 0 && (
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            <input 
              placeholder="Поиск (имя, дата, точка)..." 
              value={search} 
              onChange={e=>setSearch(e.target.value)} 
              style={{...inputStyle, width: isMobile ? "100%" : 200}} 
            />
            <select value={filterPoint} onChange={e=>setFilterPoint(e.target.value)} style={inputStyle}>
              <option value="all">Все точки</option>
              {points.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={inputStyle}>
              <option value="date_desc">Сначала новые (по дате)</option>
              <option value="date_asc">Сначала старые (по дате)</option>
              <option value="point_asc">По точкам (А-Я)</option>
              <option value="point_desc">По точкам (Я-А)</option>
            </select>
          </div>
        )}
      </div>

      {!shifts ? (
        <div style={{color:C.muted,textAlign:"center",padding:40}}>⟳ Загрузка смен...</div>
      ) : shifts.length === 0 ? (
        <div style={{color:C.muted,textAlign:"center",padding:40}}>Нет данных о сменах</div>
      ) : (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:800}}>
            <thead>
              <tr style={{background:C.surface}}>
                {["Точка","Кассир","Открыта","Закрыта","Ожидаемая ₸","Фактическая ₸","Расхождение","Статус","Детали"].map((h,i)=>(
                  <th key={i} style={{padding:"10px 14px",textAlign:"left",fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredShifts.map(sh=>{
                const disc = sh.discrepancy||0;
                const statusColor = sh.status==="closed" ? C.green : C.yellow;
                return(
                  <React.Fragment key={sh.id}>
                    <tr style={{borderBottom:`1px solid ${C.border}`, cursor:"pointer"}} onClick={() => setExpandedShift(expandedShift === sh.id ? null : sh.id)}>
                      <td style={{padding:"10px 14px",fontWeight:600}}>{sh.point||"—"}</td>
                      <td style={{padding:"10px 14px"}}>{sh.cashier_name||"—"}</td>
                      <td style={{padding:"10px 14px",fontSize:12}}>{fmtDT(sh.opened_at)}</td>
                      <td style={{padding:"10px 14px",fontSize:12}}>{fmtDT(sh.closed_at)}</td>
                      <td style={{padding:"10px 14px",fontWeight:700}}>{sh.expected_cash!=null?fmtM(sh.expected_cash):"—"}</td>
                      <td style={{padding:"10px 14px",fontWeight:700}}>{sh.actual_cash!=null?fmtM(sh.actual_cash):"—"}</td>
                      <td style={{padding:"10px 14px",fontWeight:700,color:disc===0?C.green:disc>0?C.blue:C.red}}>{disc!==0?(disc>0?"+":"")+fmtM(disc):"—"}</td>
                      <td style={{padding:"10px 14px"}}><span style={{background:sh.status==="closed"?C.greenSoft:C.yellowSoft,color:statusColor,padding:"4px 10px",borderRadius:6,fontWeight:700,fontSize:11}}>{sh.status==="closed"?"Закрыта":"Открыта"}</span></td>
                      <td style={{padding:"10px 14px"}}>{expandedShift === sh.id ? "▲" : "▼"}</td>
                    </tr>
                    {expandedShift === sh.id && (
                      <tr style={{borderBottom:`1px solid ${C.border}`, background: C.surface}}>
                        <td colSpan={9} style={{padding:"16px 20px"}}>
                          {(() => {
                            const sSales = (sales||[]).filter(x => x.shift_id === sh.id);
                            const sExp = (expenses||[]).filter(x => x.shift_id === sh.id);
                            const totalSales = sSales.reduce((sum, x) => sum + x.total, 0);
                            const totalCash = sSales.filter(x => x.pay_mode === 'cash' || x.pay_mode === 'split').reduce((sum, x) => sum + (x.cash_given ? Math.min(x.cash_given, x.total) : (x.pay_mode === 'cash' ? x.total : 0)), 0);
                            const totalExp = sExp.reduce((sum, x) => sum + x.amount, 0);
                            return (
                              <div style={{fontSize:13, display:"flex", gap: 30}}>
                                <div>
                                  <div style={{color:C.muted, marginBottom:4}}>Продажи смены:</div>
                                  <div style={{fontWeight:700, fontSize:15}}>{totalSales.toLocaleString("ru-RU")} ₸ <span style={{fontSize:12, fontWeight:400}}>({sSales.length} шт)</span></div>
                                </div>
                                <div>
                                  <div style={{color:C.muted, marginBottom:4}}>Наличными:</div>
                                  <div style={{fontWeight:700, fontSize:15}}>{totalCash.toLocaleString("ru-RU")} ₸</div>
                                </div>
                                <div>
                                  <div style={{color:C.muted, marginBottom:4}}>Расходы:</div>
                                  <div style={{fontWeight:700, fontSize:15, color:C.redSoft}}>{totalExp.toLocaleString("ru-RU")} ₸</div>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {filteredShifts.length === 0 && (
            <div style={{color:C.muted,textAlign:"center",padding:40}}>По вашему запросу ничего не найдено</div>
          )}
        </div>
      )}
    </div>
  );
});
export default Shifts;