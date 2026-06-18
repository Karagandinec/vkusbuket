import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";

export default function Expenses({isMobile,expenses,setExpenses,currentUser}){
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({cat:"rent",desc:"",amount:"",point: currentUser?.role === "cashier" ? currentUser.point : "Вся компания",paid:true,type:"expense", source:"наличка"});
  const [toast,showToast]=useToast();
  
  const [periodFilter, setPeriodFilter] = useState("Сегодня");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const isCashier = currentUser?.role === 'cashier';
  const todayStr = new Date().toLocaleDateString('ru-RU');
  
  const parseDate = (dstr) => {
    if(!dstr) return 0;
    const [d, m, y] = dstr.split(".");
    return new Date(y, m - 1, d).setHours(0,0,0,0);
  };
  
  const now = new Date().setHours(0,0,0,0);

  const filteredExpenses = expenses.filter(e => {
    if (isCashier) {
      return e.date === todayStr && e.point === currentUser.point;
    }
    if (periodFilter === "За все время") return true;
    
    const eDate = parseDate(e.date);
    if (periodFilter === "Сегодня") return eDate === now;
    if (periodFilter === "Вчера") return eDate === now - 86400000;
    if (periodFilter === "Неделя") return Math.ceil(Math.abs(now - eDate) / 86400000) <= 7;
    if (periodFilter === "Месяц") return Math.ceil(Math.abs(now - eDate) / 86400000) <= 31;
    if (periodFilter === "Свой период") {
      if (!customStart || !customEnd) return true;
      const s = new Date(customStart).setHours(0,0,0,0);
      const en = new Date(customEnd).setHours(0,0,0,0);
      return eDate >= s && eDate <= en;
    }
    return true;
  });

  const totalPaid=filteredExpenses.filter(e=>e.paid && e.cat !== "deposit" && e.cat !== "safe").reduce((s,e)=>s+e.amount,0);
  const totalPend=filteredExpenses.filter(e=>!e.paid && e.cat !== "deposit" && e.cat !== "safe").reduce((s,e)=>s+e.amount,0);

  const handleAdd=(ev)=>{
    ev.preventDefault();
    if(!form.desc||!form.amount){showToast("Заполните поля",true);return;}
    const catVal = form.type && form.type !== "expense" ? form.type : form.cat;
    setExpenses(p=>[...p,{id:generateUUID(),...form,cat:catVal,amount:parseInt(form.amount)||0,date:new Date().toLocaleDateString("ru-RU")}]);
    setForm({cat:"rent",desc:"",amount:"",point: currentUser?.role === "cashier" ? currentUser.point : "Вся компания",paid:true,type:"expense", source:"наличка"});
    setShowForm(false);
    showToast(form.type === "deposit" ? "Средства внесены" : form.type === "safe" ? "Наличные сняты (Сейф)" : "Расход добавлен");
  };

  return(
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      <Toast toast={toast}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{margin:"0 0 6px"}}>💰 Финансовые операции (Сейф / Расходы)</h2>
          <div style={{display:"flex",gap:16}}>
            <span style={{color:C.red,fontSize:13,fontWeight:700}}>Оплачено расходов: {fmtM(totalPaid)}</span>
            <span style={{color:C.yellow,fontSize:13,fontWeight:700}}>Ожидается расходов: {fmtM(totalPend)}</span>
          </div>
        </div>
        <div style={{display:"flex", gap: 10, alignItems:"center", flexWrap:"wrap"}}>
          {!isCashier && (
            <div style={{display:"flex", alignItems:"center", gap: 8, flexWrap:"wrap"}}>
              <select value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13}}>
                <option>За все время</option>
                <option>Сегодня</option>
                <option>Вчера</option>
                <option>Неделя</option>
                <option>Месяц</option>
                <option>Свой период</option>
              </select>
              {periodFilter === "Свой период" && (
                <div style={{display:"flex",gap:4}}>
                  <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12,width:110}} />
                  <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12,width:110}} />
                </div>
              )}
            </div>
          )}
          <button onClick={()=>setShowForm(v=>!v)} style={{padding:"10px 22px",borderRadius:10,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer",fontSize:14,whiteSpace:"nowrap"}}>
            {showForm?"Отменить":"+ Новая операция"}
          </button>
        </div>
      </div>

      {showForm&&(
        <form onSubmit={handleAdd} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:20}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:8,textTransform:"uppercase"}}>Тип операции</div>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {[["expense","📉 Расход"],["deposit","📥 Внесение личных средств"],["safe","🏦 Сейф (Снятие наличных)"]].map(([t,l])=>(
              <button
                key={t}
                type="button"
                onClick={()=>{
                  setForm(f=>({
                    ...f,
                    cat: t==="expense" ? "rent" : t,
                    type: t
                  }));
                }}
                style={{
                  flex:1,
                  padding:10,
                  borderRadius:8,
                  border:`1px solid ${form.type===t ? C.accent : C.border}`,
                  background:form.type===t ? C.accentSoft : "transparent",
                  color:form.type===t ? C.accent : C.muted,
                  cursor:"pointer",
                  fontWeight:700,
                  fontSize:12
                }}
              >
                {l}
              </button>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,alignItems:"end"}}>
            {form.type === "expense" && (
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:5}}>КАТЕГОРИЯ РАСХОДА</div>
                <select value={form.cat} onChange={e=>setForm(f=>({...f,cat:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 10px",color:C.text,outline:"none"}}>
                  {EXP_CATS.filter(c=>c.id!=="deposit"&&c.id!=="safe").map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5}}>НАЗНАЧЕНИЕ / КОММЕНТАРИЙ</div>
              <input value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder={form.type==="deposit"?"Откуда (напр. Личные средства)":form.type==="safe"?"На какие цели (напр. Сейф в Мастерскую)":"Напр. Аренда офиса за Июнь"} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5}}>СУММА (₸)</div>
              <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ИСТОЧНИК</div>
              <select value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 10px",color:C.text,outline:"none"}}>
                <option value="наличка">💵 Наличка</option>
                <option value="каспи">Kaspi</option>
                <option value="халык">Halyk</option>
                <option value="bск">БЦК</option>
              </select>
            </div>
            {currentUser?.role !== "cashier" && (
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ТОЧКА / КАССА</div>
                <select value={form.point} onChange={e=>setForm(f=>({...f,point:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 10px",color:C.text,outline:"none"}}>
                  <option>Вся компания</option>
                  {POINTS.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
            )}
            {form.type === "expense" && (
              <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:12}}>
                <input type="checkbox" checked={form.paid} onChange={e=>setForm(f=>({...f,paid:e.target.checked}))} id="paidCheck" style={{width:18,height:18}}/>
                <label htmlFor="paidCheck" style={{fontSize:13,fontWeight:600}}>Оплачено</label>
              </div>
            )}
            <button type="submit" style={{padding:"11px 20px",borderRadius:8,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer"}}>✓ Выполнить</button>
          </div>
        </form>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:12,marginBottom:20}}>
        {EXP_CATS.map(cat=>{
          const amt=filteredExpenses.filter(e=>e.cat===cat.id&&e.paid).reduce((s,e)=>s+e.amount,0);
          return(
            <div key={cat.id} style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:24,background:cat.color+"15",color:cat.color,width:40,height:40,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"}}>{cat.icon}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:700}}>{cat.label}</div>
                  <div style={{fontSize:11,color:C.muted}}>Итого {(cat.id==="deposit"||cat.id==="safe")?"проведено":"оплачено"}</div>
                </div>
              </div>
              <span style={{fontWeight:900,fontSize:16,color:cat.color}}>{fmtS(amt)}</span>
            </div>
          );
        })}
      </div>

      {filteredExpenses.length>0&&(
        <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:20}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>История операций</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:500}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Категория","Назначение","Источник","Точка","Статус","Сумма","Дата"].map((h,i)=>
                    <th key={i} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...filteredExpenses].reverse().map((e,i)=>(
                  <tr key={e.id} style={{borderBottom:`1px solid ${C.border}40`}}>
                    <td style={{padding:"10px 12px"}}>{EXP_CATS.find(x=>x.id===e.cat)?.icon} {EXP_CATS.find(x=>x.id===e.cat)?.label}</td>
                    <td style={{padding:"10px 12px",color:C.text}}>{e.desc||e.note}</td>
                    <td style={{padding:"10px 12px",color:C.muted}}>{e.source === "наличка" ? "💵 Наличка" : e.source === "каспи" ? "Kaspi" : e.source === "халык" ? "Halyk" : e.source === "bск" ? "БЦК" : (e.source || "—")}</td>
                    <td style={{padding:"10px 12px",color:C.muted}}>{e.point}</td>
                    <td style={{padding:"10px 12px"}}>
                      {(e.cat === "deposit" || e.cat === "safe") ? (
                        <span style={{fontSize:11,fontWeight:700,color:C.green,background:C.greenSoft,padding:"4px 10px",borderRadius:20}}>✓ Проведено</span>
                      ) : (
                        <button onClick={()=>{
                          setExpenses(p=>p.map(x=>x.id===e.id?{...x,paid:!x.paid}:x));
                          showToast("Статус оплаты изменен");
                        }} style={{border:"none",borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",background:e.paid?C.greenSoft:C.yellowSoft,color:e.paid?C.green:C.yellow}}>
                          {e.paid?"✓ Оплачено":"⏳ Ожидает"}
                        </button>
                      )}
                    </td>
                    <td style={{padding:"10px 12px",fontWeight:800,color:e.cat==="deposit"?C.green:e.cat==="safe"?C.yellow:C.accent}}>{e.cat==="deposit"?"+":e.cat==="safe"?"-":""}{fmtM(e.amount)}</td>
                    <td style={{padding:"10px 12px",color:C.muted}}>{e.date}</td>
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