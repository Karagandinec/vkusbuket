import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";

export default function Reports({isMobile,sales,expenses,rawStock,semiStock,currentUser,techCards}){
  const isCashier = currentUser?.role === "cashier";
  const isAdmin = currentUser?.role === "admin";
  const myPoint = currentUser?.point;
  const [pointFilter, setPointFilter] = useState(isCashier ? currentUser.point : "Все");
  const [periodFilter, setPeriodFilter] = useState("Сегодня");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [reportType, setReportType] = useState("finance");

  const now = new Date();
  const todayStr = now.toLocaleDateString("ru-RU");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("ru-RU");

  // useMemo: фильтрация при изменении входных данных, а не при каждом рендере
  const filteredSales = useMemo(() => sales.filter(s => {
    if (pointFilter !== "Все" && s.point !== pointFilter) return false;
    const sDate = parseLocalDate(s.date);
    if (periodFilter === "Сегодня") return s.date === todayStr;
    else if (periodFilter === "Вчера") return s.date === yesterdayStr;
    else if (periodFilter === "Неделя") return Math.ceil(Math.abs(now - sDate) / 86400000) <= 7;
    else if (periodFilter === "Месяц") return sDate.getMonth() === now.getMonth() && sDate.getFullYear() === now.getFullYear();
    else if (periodFilter === "Свой период") {
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
  }), [sales, pointFilter, periodFilter, todayStr, yesterdayStr, customStart, customEnd]);

  const { totalRev, totalCOGS } = useMemo(() => ({
    totalRev:  filteredSales.reduce((s,i)=>s+i.total,0),
    totalCOGS: filteredSales.reduce((s,i)=>s+(i.cogs||0),0),
  }), [filteredSales]);

  const filteredExpenses = useMemo(() => expenses.filter(e => {
    if (isCashier) {
      if (e.point !== myPoint) return false;
    } else {
      if (pointFilter !== "Все" && e.point !== pointFilter && e.point !== "Вся компания") return false;
    }
    const eDate = parseLocalDate(e.date);
    if (periodFilter === "Сегодня") return e.date === todayStr;
    else if (periodFilter === "Вчера") return e.date === yesterdayStr;
    else if (periodFilter === "Неделя") return Math.ceil(Math.abs(now - eDate) / 86400000) <= 7;
    else if (periodFilter === "Месяц") return eDate.getMonth() === now.getMonth() && eDate.getFullYear() === now.getFullYear();
    else if (periodFilter === "Свой период") {
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
  }), [expenses, isCashier, myPoint, pointFilter, periodFilter, todayStr, yesterdayStr, customStart, customEnd]);

  const rpActivePointsCount = POINTS.length;
  const { totalExp, totalInflow, totalSafe } = useMemo(() => ({
    totalExp: filteredExpenses.filter(e=>e.paid && e.cat !== "deposit" && e.cat !== "safe").reduce((s,e) => {
      if (pointFilter !== "Все" && e.point === "Вся компания") return s + e.amount / rpActivePointsCount;
      return s + e.amount;
    }, 0),
    totalInflow: filteredExpenses.filter(e=>e.paid && e.cat === "deposit").reduce((s,e)=>s+e.amount,0),
    totalSafe:   filteredExpenses.filter(e=>e.paid && e.cat === "safe").reduce((s,e)=>s+e.amount,0),
  }), [filteredExpenses, pointFilter, rpActivePointsCount]);

  const grossP  = totalRev - totalCOGS;
  const netP    = grossP - totalExp;
  const margin  = totalRev > 0 ? Math.round(netP / totalRev * 100) : 0;
  const netCashFlow = totalRev + totalInflow - totalExp - totalSafe;

  const byPoint = useMemo(() => POINTS.map((p,i) => ({
    name:p, color:POINT_COLORS[i],
    rev:    filteredSales.filter(s=>s.point===p).reduce((a,s)=>a+s.total,0),
    orders: filteredSales.filter(s=>s.point===p).length,
    cogs:   filteredSales.filter(s=>s.point===p).reduce((a,s)=>a+(s.cogs||0),0),
  })), [filteredSales]);

  const stockLoc = isCashier ? myPoint : "Склад";
  const stockValue = rawStock.reduce((s,r)=>s + (parseQtyObj(r.qty)[stockLoc] * r.price),0);

  const getAbcData = () => {
    const productSales = {};
    filteredSales.forEach(sale => {
      (sale.items || []).forEach(item => {
        productSales[item.name] = (productSales[item.name] || 0) + (item.price * item.qty);
      });
    });

    const itemsArray = Object.keys(productSales).map(name => ({
      name,
      revenue: productSales[name]
    }));

    itemsArray.sort((a, b) => b.revenue - a.revenue);

    const totalItemsRev = itemsArray.reduce((sum, item) => sum + item.revenue, 0);
    let runningSum = 0;

    return itemsArray.map(item => {
      runningSum += item.revenue;
      const share = totalItemsRev > 0 ? (item.revenue / totalItemsRev * 100) : 0;
      const cumShare = totalItemsRev > 0 ? (runningSum / totalItemsRev * 100) : 0;

      let group = "C";
      if (cumShare <= 80.01) group = "A";
      else if (cumShare <= 95.01) group = "B";

      return {
        ...item,
        share,
        cumShare,
        group
      };
    });
  };

  const abcRows = useMemo(() => getAbcData(), [filteredSales]); // eslint-disable-line react-hooks/exhaustive-deps

  const getFoodcostData = () => {
    return POINTS.map((p, idx) => {
      const pSales = sales.filter(s => s.point === p);
      const pFilteredSales = pSales.filter(s => {
        const sDate = parseLocalDate(s.date);
        if (periodFilter === "Сегодня") return s.date === todayStr;
        if (periodFilter === "Вчера") return s.date === yesterdayStr;
        if (periodFilter === "Неделя") {
          const diffTime = Math.abs(now - sDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 7;
        }
        if (periodFilter === "Месяц") {
          return sDate.getMonth() === now.getMonth() && sDate.getFullYear() === now.getFullYear();
        }
        return true;
      });

      const rev = pFilteredSales.reduce((sum, s) => sum + s.total, 0);
      const cogsVal = pFilteredSales.reduce((sum, s) => sum + (s.cogs || 0), 0);
      const percent = rev > 0 ? (cogsVal / rev * 100) : 0;

      return {
        name: p,
        revenue: rev,
        cogs: cogsVal,
        percent,
        color: POINT_COLORS[idx]
      };
    });
  };

  const foodcostRows = getFoodcostData();
  const fcLimit = 30;

  return(
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      {/* ФИЛЬТРЫ */}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",background:C.surface,padding:14,borderRadius:12,border:`1px solid ${C.border}`}}>
        {!isCashier ? (
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <span style={{fontSize:11,color:C.muted}}>ТОЧКА ОТЧЕТА</span>
            <select value={pointFilter} onChange={e=>setPointFilter(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13}}>
              <option>Все</option>
              {POINTS.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <span style={{fontSize:11,color:C.muted}}>ТОЧКА ОТЧЕТА</span>
            <div style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:13,fontWeight:700}}>
              📍 {myPoint}
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <span style={{fontSize:11,color:C.muted}}>ПЕРИОД ОТЧЕТА</span>
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

      {/* ТАБЫ ДЛЯ ОУНЕРА ИЛИ ДИРЕКТОРА */}
      {!(isCashier || isAdmin) && (
        <div style={{display:"flex",gap:10,marginBottom:22,flexWrap:"wrap"}}>
          <button onClick={()=>setReportType("finance")} style={{padding:"10px 18px",borderRadius:8,border:"none",background:reportType==="finance"?C.accentSoft:C.card,color:reportType==="finance"?C.accent:C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>
            📊 Финансовые отчеты (P&L, CF)
          </button>
          <button onClick={()=>setReportType("abc")} style={{padding:"10px 18px",borderRadius:8,border:"none",background:reportType==="abc"?C.accentSoft:C.card,color:reportType==="abc"?C.accent:C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>
            🔤 ABC-анализ товаров
          </button>
          <button onClick={()=>setReportType("foodcost")} style={{padding:"10px 18px",borderRadius:8,border:"none",background:reportType==="foodcost"?C.accentSoft:C.card,color:reportType==="foodcost"?C.accent:C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>
            🍔 Фудкост по точкам
          </button>
          <button onClick={()=>setReportType("pricing")} style={{padding:"10px 18px",borderRadius:8,border:"none",background:reportType==="pricing"?C.accentSoft:C.card,color:reportType==="pricing"?C.accent:C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>
            💰 Аудит ценообразования
          </button>
        </div>
      )}

      {isCashier || isAdmin ? (
        /* Упрощённый вид для кассира и администратора: только продажи, расходы и стоимость склада */
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:20}}>
          {[
            {label:"СУММА ПРОДАЖ",     val:fmtS(totalRev),  color:C.green},
            {label:"КОЛИЧЕСТВО ЧЕКОВ", val:String(filteredSales.length),  color:C.accent},
            {label:"РАСХОДЫ",          val:fmtS(totalExp),  color:C.red},
            isAdmin && {label:"СТОИМОСТЬ СКЛАДА", val:fmtS(stockValue), color:C.blue},
          ].filter(Boolean).map((k,i)=>(
            <div key={i} style={{background:C.card,borderRadius:14,padding:"18px 20px",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:6,textTransform:"uppercase"}}>{k.label}</div>
              <div style={{fontSize:24,fontWeight:900,color:k.color}}>{k.val}</div>
            </div>
          ))}
        </div>
      ) : (
        /* Полный вид для владельца / директора */
        <>
        {reportType === "finance" && (
          <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:20}}>
            {[
              {label:"Выручка (ДДС Приход)", val:fmtS(totalRev),  color:C.green},
              {label:"Расходы P&L (COGS+накл.)",val:fmtS(totalCOGS+totalExp),color:C.red},
              {label:"Чистая прибыль P&L",      val:fmtS(netP),      color:netP>=0?C.green:C.red},
              {label:"Рентабельность (Маржа)", val:`${margin}%`,    color:margin>=20?C.green:margin>=10?C.yellow:C.red},
            ].map((k,i)=>(
              <div key={i} style={{background:C.card,borderRadius:14,padding:"18px 20px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:6,textTransform:"uppercase"}}>{k.label}</div>
                <div style={{fontSize:24,fontWeight:900,color:k.color}}>{k.val}</div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,marginBottom:16}}>
            {/* P&L Отчет */}
            <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
              <div style={{fontSize:15,fontWeight:800,marginBottom:16}}>💹 Отчёт о прибылях и убытках (P&L)</div>
              {[
                {label:"Выручка (Продажи)",        val:totalRev,  color:C.green, bold:true},
                {label:"Себестоимость продаж (COGS)",val:-totalCOGS,color:C.red},
                {label:"Валовая прибыль",           val:grossP,    color:C.blue,  bold:true},
                {label:"Накладные расходы",         val:-totalExp, color:C.red},
                {label:"Чистая прибыль",            val:netP,      color:netP>=0?C.green:C.red, bold:true, big:true},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}40`}}>
                  <span style={{fontSize:r.big?14:13,color:r.bold?C.text:C.muted,fontWeight:r.bold?700:400}}>{r.label}</span>
                  <span style={{fontSize:r.big?18:14,fontWeight:r.bold?900:500,color:r.color}}>
                    {r.val>=0?"+":""}{fmtM(r.val)}
                  </span>
                </div>
              ))}
              <div style={{background:margin>=20?C.greenSoft:C.yellowSoft,borderRadius:10,padding:14,marginTop:14,textAlign:"center"}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Рентабельность бизнеса</div>
                <div style={{fontSize:36,fontWeight:900,color:margin>=20?C.green:margin>=10?C.yellow:C.red}}>{margin}%</div>
              </div>
            </div>

            {/* Cash Flow (ДДС) Отчет */}
            <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
              <div style={{fontSize:15,fontWeight:800,marginBottom:16}}>📊 Движение денежных средств (Cash Flow)</div>
              {[
                {label:"Поступления от клиентов (Выручка)", val:totalRev,  color:C.green, bold:true},
                {label:"Внесение личных средств",          val:totalInflow,color:C.green},
                {label:"Оплата расходов (Накладные)",      val:-totalExp,  color:C.red},
                {label:"Сейф (Снятие наличных)",          val:-totalSafe, color:C.red},
                {label:"Чистый денежный поток (Net Cash)",  val:netCashFlow,color:netCashFlow>=0?C.green:C.red, bold:true, big:true},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}40`}}>
                  <span style={{fontSize:r.big?14:13,color:r.bold?C.text:C.muted,fontWeight:r.bold?700:400}}>{r.label}</span>
                  <span style={{fontSize:r.big?18:14,fontWeight:r.bold?900:500,color:r.color}}>
                    {r.val>=0?"+":""}{fmtM(r.val)}
                  </span>
                </div>
              ))}
              <div style={{background:C.blueSoft,borderRadius:10,padding:14,marginTop:14,textAlign:"center"}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Изменение денежного баланса за период</div>
                <div style={{fontSize:24,fontWeight:900,color:C.blue}}>{netCashFlow>=0?"+":""}{fmtM(netCashFlow)}</div>
              </div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,marginBottom:16}}>
            {pointFilter === "Все" && (
              <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
                <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>📍 Финансы по точкам</div>
                {byPoint.map((p,i)=>(
                  <div key={i} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:8,height:8,borderRadius:4,background:p.color}}/>
                        <span style={{fontWeight:600,fontSize:13}}>{p.name}</span>
                        <span style={{fontSize:11,color:C.muted}}>{p.orders} зак.</span>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontWeight:800,color:p.color,fontSize:13}}>{fmtS(p.rev)}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>Кост (COGS): <span style={{color:C.yellow,fontWeight:700}}>{fmtS(p.cogs)}</span> | Прибыль: <span style={{color:C.green,fontWeight:700}}>{fmtS(p.rev - p.cogs)}</span></div>
                      </div>
                    </div>
                    <div style={{height:5,background:C.dimmed,borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:5,width:`${Math.round(p.rev/Math.max(totalRev,1)*100)}%`,background:p.color,borderRadius:3}}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
              <div style={{fontSize:15,fontWeight:800,marginBottom:12}}>📦 Стоимость склада</div>
              <div style={{fontSize:28,fontWeight:900,color:C.accent}}>{fmtS(stockValue)}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                Стоимость сырья на Главном Складе
              </div>
            </div>
          </div>
          </>
        )}

        {reportType === "abc" && (
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>🔤 ABC-анализ товаров по выручке ({periodFilter})</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:20}}>
              Категория A (до 80% выручки) — ключевые товары. Категория B (80% - 95%) — средняя значимость. Категория C (95% - 100%) — низкая доля выручки.
            </div>
            {abcRows.length === 0 ? (
              <div style={{textAlign:"center",color:C.muted,padding:40}}>Нет данных о продажах за выбранный период</div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:600}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${C.border}`,textAlign:"left"}}>
                      <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Товар</th>
                      <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Выручка</th>
                      <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Доля (%)</th>
                      <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Накоп. доля (%)</th>
                      <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Группа</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abcRows.map((row, idx) => {
                      const groupColor = row.group === "A" ? C.green : row.group === "B" ? C.yellow : C.red;
                      const groupBg = row.group === "A" ? C.greenSoft : row.group === "B" ? C.yellowSoft : C.redSoft;
                      return (
                        <tr key={idx} style={{borderBottom:`1px solid ${C.border}40`}}>
                          <td style={{padding:"12px 12px",fontWeight:600}}>{row.name}</td>
                          <td style={{padding:"12px 12px"}}>{fmtM(row.revenue)}</td>
                          <td style={{padding:"12px 12px"}}>{row.share.toFixed(1)}%</td>
                          <td style={{padding:"12px 12px"}}>{row.cumShare.toFixed(1)}%</td>
                          <td style={{padding:"12px 12px"}}>
                            <span style={{color:groupColor,background:groupBg,padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:900}}>{row.group}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {reportType === "foodcost" && (
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>🍔 Анализ Фудкоста по точкам ({periodFilter})</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:20}}>
              Процент Фудкоста рассчитывается как Себестоимость сырья (COGS) / Выручка. Установленная норма: <b>{fcLimit}%</b>. При превышении нормы выводится красный индикатор предупреждения.
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:600}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${C.border}`,textAlign:"left"}}>
                    <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Точка</th>
                    <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Выручка</th>
                    <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Себестоимость (COGS)</th>
                    <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Процент фудкоста</th>
                    <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {foodcostRows.map((row, idx) => {
                    const isOver = row.percent > fcLimit;
                    return (
                      <tr key={idx} style={{borderBottom:`1px solid ${C.border}40`}}>
                        <td style={{padding:"12px 12px",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:8,height:8,borderRadius:4,background:row.color}}/>
                          {row.name}
                        </td>
                        <td style={{padding:"12px 12px"}}>{fmtM(row.revenue)}</td>
                        <td style={{padding:"12px 12px",color:C.yellow}}>{fmtM(row.cogs)}</td>
                        <td style={{padding:"12px 12px",fontWeight:800,color:isOver ? C.red : C.green}}>{row.percent.toFixed(1)}%</td>
                        <td style={{padding:"12px 12px"}}>
                          {isOver ? (
                            <span style={{color:C.red,background:C.redSoft,padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:800}}>⚠️ Превышение нормы</span>
                          ) : (
                            <span style={{color:C.green,background:C.greenSoft,padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:800}}>✓ В норме</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
      )}

      {/* Список продаж для кассира и администратора */}
      {(isCashier || isAdmin) && filteredSales.length > 0 && (
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>🧾 Продажи ({periodFilter})</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:400}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Чек",isAdmin && "Точка","Позиции","Оплата","Сумма","Время"].filter(Boolean).map((h,i)=>
                    <th key={i} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...filteredSales].reverse().slice(0,20).map((s,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}40`}}>
                    <td style={{padding:"10px 12px",color:C.muted}}>#{s.no}</td>
                    {isAdmin && <td style={{padding:"10px 12px"}}>{s.point}</td>}
                    <td style={{padding:"10px 12px",color:C.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.items?.map(x=>x.name).join(", ")}</td>
                    <td style={{padding:"10px 12px"}}>{fmtPay(s)}</td>
                    <td style={{padding:"10px 12px",fontWeight:800,color:C.green}}>{fmtM(s.total)}</td>
                    <td style={{padding:"10px 12px",color:C.muted}}>{s.date} {s.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Список расходов для кассира и администратора */}
      {(isCashier || isAdmin) && filteredExpenses.length > 0 && (
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>💰 Расходы ({periodFilter})</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:400}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Категория","Сумма",isAdmin && "Точка","Дата","Комментарий","Статус"].filter(Boolean).map((h,i)=>
                    <th key={i} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...filteredExpenses].reverse().map((e,i)=>{
                  const catInfo = EXP_CATS.find(c => c.id === e.cat);
                  return (
                    <tr key={e.id || i} style={{borderBottom:`1px solid ${C.border}40`}}>
                      <td style={{padding:"10px 12px"}}>{catInfo?.icon} {catInfo?.label || e.cat}</td>
                      <td style={{padding:"10px 12px",fontWeight:800,color:C.red}}>{fmtM(e.amount)}</td>
                      {isAdmin && <td style={{padding:"10px 12px"}}>{e.point || "Вся компания"}</td>}
                      <td style={{padding:"10px 12px",color:C.muted}}>{e.date}</td>
                      <td style={{padding:"10px 12px",color:C.muted,fontStyle:e.desc?"normal":"italic"}}>{e.desc || "—"}</td>
                      <td style={{padding:"10px 12px"}}>
                        <span style={{color:e.paid?C.green:C.yellow,fontSize:11,fontWeight:700}}>
                          {e.paid?"Оплачено":"Ожидает"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}