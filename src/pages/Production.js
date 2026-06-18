import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";
import SearchableSelect from '../components/SearchableSelect';

export default function Production({isMobile,rawStock,setRawStock,semiStock,setSemiStock,currentUser}){
  const [activeTab, setActiveTab] = useState("transfer"); // "produce" или "transfer"
  const [search,setSearch]=useState("");
  const [isRawCollapsed, setIsRawCollapsed] = useState(false);
  const [isSemiCollapsed, setIsSemiCollapsed] = useState(false);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({targetId:"s1",qty:"",point:"Мастерская"});
  
  // Форма перемещения сырья между локациями
  const [transferForm, setTransferForm] = useState({
    itemId: "r1",
    qty: "",
    sourceLoc: currentUser?.point === "Мастерская" ? "Мастерская" : "Склад",
    destPoint: currentUser?.point === "Мастерская" ? "Фуд Трак" : "Мастерская"
  });
  
  const [toast,showToast]=useToast();

  const handleTransfer=()=>{
    const qty=parseFloat(form.qty);
    const rawMatch = rawStock.find(r=>r.id === modal.rawId);
    const stockQty = getQty(rawMatch?.qty, "Склад");
    
    if(!qty||qty>stockQty){showToast("Недостаточно сырья на главном складе",true);return;}
    
    // Списываем сырье со склада
    setRawStock(p=>p.map(r=> {
      if (r.id === modal.rawId) {
        const q = parseQtyObj(r.qty);
        q["Склад"] = Math.round((q["Склад"] - qty)*1000)/1000;
        return { ...r, qty: q };
      }
      return r;
    }));
    
    // Оприходуем полуфабрикат на кухню выбранной точки
    setSemiStock(p=>p.map(s=>{
      if (s.id===form.targetId) {
        const q = parseSemiQtyObj(s.qty);
        q[form.point] = Math.round((q[form.point] + qty)*1000)/1000;
        return { ...s, qty: q };
      }
      return s;
    }));
    
    showToast(`${modal.name} → ${form.point} кухня (+${qty} ${modal.unit})`);
    setModal(null);
  };

  const handleRawTransfer=(e)=>{
    e.preventDefault();
    const qty = parseFloat(transferForm.qty);
    const item = rawStock.find(r => r.id === transferForm.itemId);
    const sourceLoc = transferForm.sourceLoc || "Склад";
    const destLoc = transferForm.destPoint;

    if (sourceLoc === destLoc) {
      showToast("Локации отправления и назначения должны отличаться", true);
      return;
    }

    const availableQty = getQty(item?.qty, sourceLoc);
    
    if (!qty || qty <= 0 || qty > availableQty) {
      showToast(`Недостаточно сырья в локации: ${sourceLoc} (доступно: ${fmt(availableQty)} ${item?.unit})`, true);
      return;
    }
    
    setRawStock(p => p.map(r => {
      if (r.id !== transferForm.itemId) return r;
      const q = parseQtyObj(r.qty);
      q[sourceLoc] = Math.round((q[sourceLoc] - qty) * 1000) / 1000;
      q[destLoc] = Math.round((q[destLoc] + qty) * 1000) / 1000;
      return { ...r, qty: q };
    }));
    
    showToast(`Перемещено: ${item.name} | ${sourceLoc} → ${destLoc} (${qty} ${item.unit})`);
    setTransferForm(f => ({ ...f, qty: "" }));
  };

  return(
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      <Toast toast={toast}/>
      
      {/* РЕЖИМЫ */}
      <div style={{display:"flex",gap:6,marginBottom:20}}>
        <button onClick={()=>setActiveTab("transfer")} style={{padding:"10px 18px",borderRadius:10,border:"none",background:activeTab==="transfer"?C.accent:C.card,color:activeTab==="transfer"?"#000":C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>📦 Центральный склад (сырья и упаковки)</button>
        <button onClick={()=>setActiveTab("produce")} style={{padding:"10px 18px",borderRadius:10,border:"none",background:activeTab==="produce"?C.accent:C.card,color:activeTab==="produce"?"#000":C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>🍓 Производство (полуфабрикаты)</button>
      </div>

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.card,borderRadius:16,padding:28,width:420,border:`1px solid ${C.border}`,maxHeight:"90vh",overflowY:"auto"}}>
            <h3 style={{marginTop:0,marginBottom:16}}>Передать на кухню</h3>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:6}}>ПОЛУФАБРИКАТ</div>
              <select value={form.targetId} onChange={e=>setForm(f=>({...f,targetId:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:12,color:C.text,outline:"none"}}>
                {semiStock.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:6}}>КУХНЯ ТОЧКИ</div>
              <select value={form.point} onChange={e=>setForm(f=>({...f,point:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:12,color:C.text,outline:"none"}}>
                {POINTS.map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:6}}>КОЛИЧЕСТВО ({modal.unit}) / Склад: {fmt(getQty(rawStock.find(r=>r.id===modal.rawId)?.qty, "Склад"))}</div>
              <input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:12,color:C.text,outline:"none",boxSizing:"border-box",fontSize:20,fontWeight:700}}/>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Отмена</button>
              <button onClick={handleTransfer} style={{flex:2,padding:12,borderRadius:10,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer"}}>Передать →</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "produce" ? (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:20}}>
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
            <h3 
              onClick={() => { if(isMobile) setIsRawCollapsed(!isRawCollapsed) }}
              style={{marginTop:0,marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:isMobile?"pointer":"default"}}
            >
              <span>🏭 Склад сырья (Центральный)</span>
              {isMobile && <span style={{fontSize:13,color:C.muted,fontWeight:"normal"}}>{isRawCollapsed ? "▼" : "▲"}</span>}
            </h3>
            {!isRawCollapsed && rawStock.filter(r=>r.name.toLowerCase().includes(search.toLowerCase())).map(r=>{
              const matchedSemi = semiStock.find(s=>s.rawId === r.id);
              if (!matchedSemi) return null;
              const wQty = getQty(r.qty, "Склад");
              return(
                <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:10,marginBottom:10,borderBottom:`1px solid ${C.border}`}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:13}}>{r.name}</div>
                    <div style={{fontSize:12,color:wQty<10?C.yellow:C.muted}}>{fmt(wQty)} {r.unit}</div>
                  </div>
                  <button onClick={()=>{setModal({id:r.id, name:r.name, unit:r.unit, rawId:r.id});setForm({targetId:matchedSemi.id,qty:"",point:"Мастерская"});}} style={{padding:"7px 14px",borderRadius:8,background:C.accentSoft,color:C.accent,border:`1px solid ${C.accent}`,cursor:"pointer",fontWeight:700,fontSize:12}}>Производство →</button>
                </div>
              );
            })}
          </div>
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <h3 
                onClick={() => { if(isMobile) setIsSemiCollapsed(!isSemiCollapsed) }}
                style={{margin:0,display:"flex",alignItems:"center",gap:8,cursor:isMobile?"pointer":"default",flex:1}}
              >
                <span>⚗️ Полуфабрикаты по точкам</span>
                {isMobile && <span style={{fontSize:13,color:C.muted,fontWeight:"normal"}}>{isSemiCollapsed ? "▼" : "▲"}</span>}
              </h3>
              <select value={form.point} onChange={e=>setForm(f=>({...f,point:e.target.value}))} style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",outline:"none",fontSize:12}}>
                {POINTS.map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            {!isSemiCollapsed && semiStock.map(s=>{
              const pQty = getQty(s.qty, form.point);
              return (
                <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:10,marginBottom:10,borderBottom:`1px solid ${C.border}`}}>
                  <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
                  <div style={{fontWeight:800,fontSize:15,color:pQty<0?C.red:pQty<3?C.yellow:C.text}}>{fmt(pQty)} {s.unit}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:20}}>
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
            <h3 style={{marginTop:0,marginBottom:16}}>📦 Перемещение упаковки/сырья между точками</h3>
            <form onSubmit={handleRawTransfer} style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ОТКУДА (ИСТОЧНИК)</div>
                <select value={transferForm.sourceLoc || "Склад"} onChange={e=>setTransferForm(f=>({...f,sourceLoc:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none"}}>
                  {ALL_LOCATIONS.map(l=><option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ПОЗИЦИЯ СЫРЬЯ</div>
                <SearchableSelect 
                  value={transferForm.itemId} 
                  onChange={val=>setTransferForm(f=>({...f,itemId:val}))} 
                  options={rawStock.map(r=>({ value: r.id, label: `${r.name} (Доступно: ${fmt(getQty(r.qty, transferForm.sourceLoc || "Склад"))} ${r.unit})` }))}
                />
              </div>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:5}}>КОЛИЧЕСТВО ДЛЯ ПЕРЕДАЧИ</div>
                <input type="number" step="0.01" required value={transferForm.qty} onChange={e=>setTransferForm(f=>({...f,qty:e.target.value}))} placeholder="0" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ТОЧКА-ПОЛУЧАТЕЛЬ</div>
                <select value={transferForm.destPoint} onChange={e=>setTransferForm(f=>({...f,destPoint:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none"}}>
                  {ALL_LOCATIONS.filter(l => l !== (transferForm.sourceLoc || "Склад")).map(l=><option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <button type="submit" style={{padding:"12px 20px",borderRadius:8,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer",marginTop:10}}>✓ Выполнить перемещение</button>
            </form>
          </div>
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <h3 style={{margin:0}}>📦 Остатки упаковки на точках</h3>
              <select value={transferForm.destPoint} onChange={e=>setTransferForm(f=>({...f,destPoint:e.target.value}))} style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",outline:"none",fontSize:12}}>
                {POINTS.map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            {rawStock.filter(r=>(r.name.includes("Коробк") || r.name.includes("Креман") || r.name.includes("Пакет") || r.name.includes("Лент") || r.name.includes("Вилка")) && r.name.toLowerCase().includes(search.toLowerCase())).map(r=>{
              const pQty = getQty(r.qty, transferForm.destPoint);
              return (
                <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:8,marginBottom:8,borderBottom:`1px solid ${C.border}60`}}>
                  <div style={{fontWeight:600,fontSize:12}}>{r.name}</div>
                  <div style={{fontWeight:800,fontSize:13}}>{fmt(pQty)} {r.unit}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}