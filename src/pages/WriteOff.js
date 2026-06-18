import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";
import SearchableSelect from '../components/SearchableSelect';

export default function WriteOff({isMobile,rawStock,setRawStock,semiStock,setSemiStock,currentUser,log,setLog,currentShift}){
  const [form,setForm]=useState({stock:"semi",itemId:"s1",qty:"",reason:"spoil",note:"",author:""});
  const isCashier = currentUser.role === "cashier";
  const myPoint = currentUser.point;
  const [selPoint, setSelPoint] = useState(currentUser.role === "cashier" ? currentUser.point : POINTS[0]);
  const [toast,showToast]=useToast();

  const [logDateFilter, setLogDateFilter] = useState("");
  const filteredLog = isCashier ? log.filter(l => l.location === myPoint) : log;

  const displayedLog = React.useMemo(() => {
    if (!logDateFilter) return filteredLog;
    const [y, m, d] = logDateFilter.split("-");
    const fmtDate = `${d}.${m}.${y}`;
    return filteredLog.filter(l => l.date === fmtDate);
  }, [filteredLog, logDateFilter]);

  const allItems=[...semiStock.map(s=>({...s,stock:"semi"})),...rawStock.map(r=>({...r,stock:"raw"}))];
  const filtered=allItems.filter(i=>i.stock===form.stock);
  const selItem=allItems.find(i=>i.id===form.itemId);

  const reasons=[
    {id:"spoil",  label:"Порча / Истёк срок"},
    {id:"break",  label:"Бой / Повреждение"},
    {id:"defect", label:"Брак производства"},
    {id:"promo",  label:"Дегустация / Промо"},
    {id:"other",  label:"Прочее"},
  ];

  const handleSubmit=(e)=>{
    e.preventDefault();
    if (!currentShift) {
      showToast("Операция невозможна: нет открытой смены", true);
      return;
    }
    const qty=parseFloat(form.qty)||0;
    if(!qty||!form.author){showToast("Заполните все поля",true);return;}
    
    if(form.stock==="semi") {
      setSemiStock(p=>p.map(s=>{
        if (s.id===form.itemId) {
          const q = parseSemiQtyObj(s.qty);
          q[selPoint] = Math.round((q[selPoint] - qty)*1000)/1000;
          return { ...s, qty: q };
        }
        return s;
      }));
    } else {
      setRawStock(p=>p.map(r=>{
        if (r.id===form.itemId) {
          const q = parseQtyObj(r.qty);
          q[selPoint] = Math.round((q[selPoint] - qty)*1000)/1000;
          return { ...r, qty: q };
        }
        return r;
      }));
    }
    
    const writeOffId = generateUUID();
    setLog(p=>[{
      id: writeOffId,
      itemId: form.itemId,
      stock: form.stock,
      date: new Date().toLocaleDateString("ru-RU"),
      time: new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),
      item: selItem?.name,
      qty,
      unit: selItem?.unit,
      reason: reasons.find(r=>r.id===form.reason)?.label,
      author: form.author,
      note: form.note,
      location: selPoint
    },...p]);
    showToast(`Списано: ${selItem?.name} — ${qty} ${selItem?.unit} на ${selPoint}`);
    setForm(f=>({...f,qty:"",note:"",author:""}));
  };

  const handleCancelWriteOff = (id) => {
    const item = log.find(x => x.id === id);
    if (!item) return;
    if (!window.confirm(`Аннулировать списание ${item.item} (${item.qty} ${item.unit})?`)) return;
    
    if (item.stock === "semi") {
      setSemiStock(p => p.map(s => {
        if (s.id === item.itemId) {
          const q = parseSemiQtyObj(s.qty);
          q[item.location] = Math.round((q[item.location] + item.qty) * 1000) / 1000;
          return { ...s, qty: q };
        }
        return s;
      }));
    } else {
      setRawStock(p => p.map(r => {
        if (r.id === item.itemId) {
          const q = parseQtyObj(r.qty);
          q[item.location] = Math.round((q[item.location] + item.qty) * 1000) / 1000;
          return { ...r, qty: q };
        }
        return r;
      }));
    }
    
    setLog(p => p.filter(x => x.id !== id));
    showToast("Списание аннулировано и остатки восстановлены!");
  };

  return(
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      <Toast toast={toast}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:18,fontWeight:800}}>✕ Коррекционное списание остатков</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:C.muted}}>Точка списания:</span>
          {isCashier ? (
            <span style={{fontSize:13,fontWeight:700,color:C.text}}>{myPoint}</span>
          ) : (
            <select value={selPoint} onChange={e=>setSelPoint(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",outline:"none",fontSize:12}}>
              {POINTS.map(p=><option key={p}>{p}</option>)}
            </select>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:24,marginBottom:20}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:20}}>
          <div>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ТИП ТОВАРА</div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {[["semi","Полуфабрикаты"],["raw","Сырьё"]].map(([v,l])=>(
                <button key={v} type="button" onClick={()=>setForm(f=>({...f,stock:v,itemId:v==="semi"?semiStock[0]?.id:rawStock[0]?.id}))} style={{flex:1,padding:10,borderRadius:8,border:`1px solid ${form.stock===v?C.accent:C.border}`,background:form.stock===v?C.accentSoft:"transparent",color:form.stock===v?C.accent:C.muted,cursor:"pointer",fontWeight:700}}>{l}</button>
              ))}
            </div>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ПОЗИЦИЯ</div>
            <select value={form.itemId} onChange={e=>setForm(f=>({...f,itemId:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",marginBottom:14}}>
              {filtered.map(i=>{
                const itemQty = form.stock==="semi"? getQty(i.qty, selPoint) : getQty(i.qty, selPoint);
                return <option key={i.id} value={i.id}>{i.name} (текущий остаток: {fmt(itemQty)} {i.unit})</option>
              })}
            </select>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>КОЛИЧЕСТВО К СПИСАНИЮ</div>
            <input type="number" step="0.001" required value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box",fontSize:20,fontWeight:700}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ПРИЧИНА</div>
            <select value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",marginBottom:14}}>
              {reasons.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ОТВЕТСТВЕННЫЙ СОТРУДНИК</div>
            <input required value={form.author} onChange={e=>setForm(f=>({...f,author:e.target.value}))} placeholder="Имя" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box",marginBottom:14}}/>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>КОММЕНТАРИЙ</div>
            <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Например: Срок годности истёк" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box",height:70,resize:"none"}}/>
          </div>
        </div>
        <button type="submit" style={{marginTop:16,width:"100%",padding:14,background:C.red,border:"none",borderRadius:10,color:"#fff",fontWeight:900,cursor:"pointer",fontSize:15}}>✓ Провести списание</button>
      </form>

      {(filteredLog.length>0 || logDateFilter)&&(
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
            <div style={{fontSize:15,fontWeight:800}}>История списаний</div>
            <input type="date" value={logDateFilter} onChange={e=>setLogDateFilter(e.target.value)} style={{padding:8,borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,color:C.text,outline:"none"}}/>
          </div>
          {displayedLog.length === 0 ? (
            <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>Нет списаний за выбранную дату</div>
          ) : (
            displayedLog.map((l,i)=>(
              <div key={l.id || i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<displayedLog.length-1?`1px solid ${C.border}`:"none"}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{l.item} ({l.location})</div>
                <div style={{fontSize:11,color:C.muted}}>{l.reason} · {l.author} · {l.date} {l.time}</div>
                {l.note&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>«{l.note}»</div>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontWeight:800,color:C.red,fontSize:14}}>−{l.qty} {l.unit}</div>
                {(currentUser?.role === "owner" || currentUser?.role === "director") && (
                  <button onClick={() => handleCancelWriteOff(l.id)} style={{background:C.red + "1a",color:C.red,border:`1px solid ${C.red}40`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                    Аннулировать
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