import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";

export default function CustomBouquetModal({ baseTc, onClose, onAdd, rawStock, C }) {
  const availableToppings = rawStock.filter(r => r.name.toLowerCase().includes("посыпка") || r.cat === "Посыпки");
  const availableChocolates = rawStock.filter(r => r.name.toLowerCase().includes("шоколад") && !r.name.toLowerCase().includes("мороженое") && r.unit === "г");
  const defaultChocId = availableChocolates.length > 0 ? availableChocolates[0].id : "r2";

  const [groups, setGroups] = useState([
    { id: Date.now(), choc: defaultChocId, topping: "", qty: 1 }
  ]);

  const totalBerries = groups.reduce((sum, g) => sum + (parseInt(g.qty) || 0), 0);

  const handleAddGroup = () => {
    setGroups([...groups, { id: Date.now(), choc: defaultChocId, topping: "", qty: 1 }]);
  };

  const handleRemoveGroup = (id) => {
    if (groups.length === 1) return;
    setGroups(groups.filter(g => g.id !== id));
  };

  const updateGroup = (id, field, val) => {
    setGroups(groups.map(g => g.id === id ? { ...g, [field]: val } : g));
  };

  const handleAdd = () => {
    if (totalBerries === 0) {
      alert("Укажите количество ягод!");
      return;
    }
    const chocCounts = {};
    const toppingCounts = {};
    groups.forEach(g => {
      const q = parseInt(g.qty) || 0;
      if (q > 0) {
        chocCounts[g.choc] = (chocCounts[g.choc] || 0) + q;
        if (g.topping) toppingCounts[g.topping] = (toppingCounts[g.topping] || 0) + q;
      }
    });

    const newIngs = [];
    if (totalBerries > 0) newIngs.push({ rid:"r1", qty: (totalBerries * 20)/1000, loss: 10 });
    Object.keys(chocCounts).forEach(rid => newIngs.push({ rid: rid, qty: (chocCounts[rid] * 9)/1000, loss: 5 }));
    Object.keys(toppingCounts).forEach(rid => newIngs.push({ rid: rid, qty: (toppingCounts[rid] * 0.2) / 1000, loss: 0 }));

    const packagingIDs = ["r10", "r11", "r12", "r13", "r14", "r15", "r16", "r17", "r18", "r19", "r20", "r21", "r22", "r23", "r29", "r30", "r31", "r32", "r33", "r34", "r35", "r36", "r38", "r9"];
    baseTc.ings.forEach(ing => {
      if (ing.rid && packagingIDs.includes(ing.rid)) {
        newIngs.push(ing.rid === "r11" ? { ...ing, qty: totalBerries / 1000 } : { ...ing });
      }
    });

    let baseBerries = 0;
    const match = baseTc.product.match(/(\d+)\s*(ягод|шт)/i);
    if (match) {
      baseBerries = parseInt(match[1]);
    } else {
      const s1Ing = baseTc.ings.find(ing => ing.sid === "s1");
      const r1Ing = baseTc.ings.find(ing => ing.rid === "r1");
      if (s1Ing) baseBerries = Math.round(s1Ing.qty / 28);
      else if (r1Ing) baseBerries = Math.round((r1Ing.qty * 1000) / 20);
    }
    
    let recCustomPrice = baseTc.price || 0;
    if (baseBerries > 0 && totalBerries !== baseBerries) {
      const pricePerBerry = baseTc.price / baseBerries;
      recCustomPrice = Math.round(pricePerBerry * totalBerries);
      recCustomPrice = Math.round(recCustomPrice / 100) * 100;
    }

    onAdd({
      ...baseTc,
      id: "custom_" + Date.now(),
      baseTcId: baseTc.id,
      product: `${baseTc.product} (Кастом: ${totalBerries}шт)`,
      cat: "Кастомная сборка",
      price: baseTc.price,
      recCustomPrice: recCustomPrice,
      ings: newIngs
    });
  };

  const btnStyle = { padding:"8px 16px", borderRadius:8, background:C.surface, border:`1px solid ${C.border}`, color:C.text, cursor:"pointer", fontSize:18, fontWeight:"bold" };
  const rowStyle = { display:"flex", alignItems:"flex-start", justifyContent:"space-between", background:C.card, padding:"16px", borderRadius:12, marginBottom:10 };
  const selectStyle = { marginTop:6, fontSize:12, padding:"6px", borderRadius:6, border:`1px solid ${C.border}`, background:C.surface, color:C.text, outline:"none", maxWidth: 180 };
  const chocSelectStyle = { fontWeight:"bold", fontSize:15, background:"transparent", border:"none", color:C.text, outline:"none", maxWidth:180, cursor:"pointer", padding:0 };

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:C.surface,padding:24,borderRadius:16,width:"90%",maxWidth:440,boxShadow:"0 8px 32px rgba(0,0,0,0.3)", maxHeight:"90vh", overflowY:"auto", WebkitOverflowScrolling:"touch"}}>
        <h3 style={{marginTop:0,marginBottom:8,color:C.text}}>Сборка: {baseTc.product}</h3>
        <p style={{fontSize:13,color:C.muted,marginTop:0,marginBottom:20}}>Каждая ягода: 20г клубники + 9г шоколада + 0.2г посыпки.</p>
        
        <div style={{maxHeight:"45vh",overflowY:"auto",paddingRight:4, paddingBottom: 40, WebkitOverflowScrolling:"touch"}}>
          {groups.map((g, idx) => (
            <div key={g.id} style={rowStyle}>
              <div style={{flex:1}}>
                <select style={chocSelectStyle} value={g.choc} onChange={(e) => updateGroup(g.id, "choc", e.target.value)}>
                  {availableChocolates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  {availableChocolates.length === 0 && <option value="r2">Шоколад не найден</option>}
                </select>
                <div style={{marginTop: 6}}>
                  <select style={selectStyle} value={g.topping} onChange={(e) => updateGroup(g.id, "topping", e.target.value)}>
                    <option value="">Без посыпки</option>
                    {availableToppings.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12, marginTop:4}}>
                <button style={btnStyle} onClick={() => updateGroup(g.id, "qty", Math.max(0, g.qty - 1))}>-</button>
                <span style={{fontSize:18,fontWeight:"bold",width:24,textAlign:"center",color:C.text}}>{g.qty}</span>
                <button style={btnStyle} onClick={() => updateGroup(g.id, "qty", g.qty + 1)}>+</button>
                {groups.length > 1 && (
                  <button onClick={() => handleRemoveGroup(g.id)} style={{...btnStyle, color:C.red, background:"transparent", border:"none", padding:"8px", fontSize:16}}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <button onClick={handleAddGroup} style={{width:"100%",background:"transparent", border:`1.5px dashed ${C.border}`, color:C.muted, padding:10, borderRadius:8, cursor:"pointer", fontWeight:"bold", marginBottom:16, marginTop:4}}>
          + Добавить партию
        </button>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${C.border}`,paddingTop:16, paddingBottom: 16}}>
          <div style={{fontWeight:"bold", fontSize: 16}}>Итого ягод: {totalBerries}</div>
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={handleAdd} style={{flex:1,padding:14,borderRadius:10,background:C.accent,color:"#000",border:"none",fontWeight:"bold",cursor:"pointer", fontSize:14}}>Собрать поштучно</button>
          <button onClick={() => { onAdd(baseTc); }} style={{flex:1,padding:14,borderRadius:10,background:C.green,color:"#000",border:"none",fontWeight:"bold",cursor:"pointer", fontSize:14}}>По стандарту</button>
          <button onClick={onClose} style={{padding:14,borderRadius:10,background:C.card,color:C.text,border:`1px solid ${C.border}`,fontWeight:"bold",cursor:"pointer", fontSize:14}}>Отмена</button>
        </div>
      </div>
    </div>
  );
}