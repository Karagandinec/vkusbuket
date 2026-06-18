import { Toast, useToast } from "../components/Toast";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";
import {
  getConvertedQty, INIT_USERS, initRawStock, initSemiStock, INIT_TECH_CARDS, CAT_COLORS, NAV, fmtM, fmtS, fmt, PAY_LABELS, fmtPay, parseQtyObj, parseSemiQtyObj, getQty, parseLocalDate, getPackagingItems, calcCost, calcProductCOGS, calcCartItemCOGS, getIngName, getIngUnit, restoreStockForSale, processSaleStock, LS, generateUUID, getMergedList, isSessionValid, touchSession, RPC_ENABLED, fmtUnit, checkIsMobile, checkIsPortrait, setWarehouseHistoryWithSync, setWriteOffsWithSync, setUsersWithSync, setCustomersWithSync, setRawStockWithSync, setSemiStockWithSync, setTechCardsWithSync, setSalesWithSync, setExpensesWithSync, checkAdminOrManager, isAdmin, isManager, isSurgeon, canWriteOff, canAddShift, supabase, supaFetch
} from "../utils";
import SearchableSelect from '../components/SearchableSelect';

export default function Inventory({isMobile,semiStock,setSemiStock,rawStock,setRawStock,currentUser,setExpenses,currentShift}){
  const isCashier = currentUser?.role === "cashier";
  const myPoint = currentUser?.point;
  const [selPoint, setSelPoint] = useState(isCashier ? currentUser.point : POINTS[0]);
  const [activeTab, setActiveTab] = useState("semi"); // "semi" или "raw"
  const [facts, setFacts] = useState({});
  const [toast,showToast]=useToast();

  const handleCommitInventory = async () => {
    if (!currentShift) {
      showToast("Операция невозможна: нет открытой смены", true);
      return;
    }
    const auditedKeys = Object.keys(facts).filter(k => facts[k] !== "");
    if (auditedKeys.length === 0) {
      showToast("Введите хотя бы одно фактическое значение", true);
      return;
    }

    if (!window.confirm(`Зафиксировать результаты инвентаризации по ${auditedKeys.length} позициям?`)) return;

    const invId = generateUUID();

    try {
      await supaFetch("POST", "inventory", {
        id: invId,
        point: selPoint,
        created_by: currentUser?.name || "Кассир",
        created_at: new Date().toISOString()
      });

      const itemsToInsert = [];
      const updatedSemi = [...semiStock];
      const updatedRaw = [...rawStock];
      let writeOffsCount = 0;

      for (const itemId of auditedKeys) {
        const factVal = parseFloat(facts[itemId]);
        if (isNaN(factVal) || factVal < 0) continue;

        const semiItem = semiStock.find(s => s.id === itemId);
        const rawItem = rawStock.find(r => r.id === itemId);

        if (semiItem) {
          const expected = getQty(semiItem.qty, selPoint);
          const difference = factVal - expected;

          itemsToInsert.push({
            inventory_id: invId,
            component_type: "semi",
            component_id: itemId,
            expected_quantity: expected,
            actual_quantity: factVal,
            difference: difference
          });

          const idx = updatedSemi.findIndex(s => s.id === itemId);
          if (idx >= 0) {
            const q = parseSemiQtyObj(updatedSemi[idx].qty);
            q[selPoint] = factVal;
            updatedSemi[idx] = { ...updatedSemi[idx], qty: q };
          }

          if (difference < 0) {
            const shortageQty = Math.abs(difference);
            const cost = calcProductCOGS(semiItem, semiStock, rawStock);
            const amount = shortageQty * cost;

            setExpenses(prev => [
              ...prev,
              {
                id: generateUUID(),
                cat: "other",
                desc: `Авто-списание (инвентаризация): ${semiItem.name} (-${shortageQty} ${semiItem.unit}) [Разница при пересчете]`,
                amount: amount,
                point: selPoint,
                paid: true,
                date: new Date().toLocaleDateString("ru-RU")
              }
            ]);

            writeOffsCount++;
          }
        } else if (rawItem) {
          const expected = getQty(rawItem.qty, selPoint);
          const difference = factVal - expected;

          itemsToInsert.push({
            inventory_id: invId,
            component_type: "raw",
            component_id: itemId,
            expected_quantity: expected,
            actual_quantity: factVal,
            difference: difference
          });

          const idx = updatedRaw.findIndex(r => r.id === itemId);
          if (idx >= 0) {
            const q = parseQtyObj(updatedRaw[idx].qty);
            q[selPoint] = factVal;
            updatedRaw[idx] = { ...updatedRaw[idx], qty: q };
          }

          if (difference < 0) {
            const shortageQty = Math.abs(difference);
            const amount = shortageQty * (rawItem.price || 0);

            setExpenses(prev => [
              ...prev,
              {
                id: generateUUID(),
                cat: "other",
                desc: `Авто-списание (инвентаризация): ${rawItem.name} (-${shortageQty} ${rawItem.unit}) [Разница при пересчете]`,
                amount: amount,
                point: selPoint,
                paid: true,
                date: new Date().toLocaleDateString("ru-RU")
              }
            ]);

            writeOffsCount++;
          }
        }
      }

      setSemiStock(updatedSemi);
      setRawStock(updatedRaw);

      if (itemsToInsert.length > 0) {
        await supaFetch("POST", "inventory_items", itemsToInsert);
      }

      showToast(`Инвентаризация успешно сохранена! Сформировано авто-списаний: ${writeOffsCount}`);
      setFacts({});
    } catch (err) {
      showToast("Ошибка сохранения инвентаризации", true);
    }
  };

  const currentList = activeTab === "semi" ? semiStock : rawStock;

  return(
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      <Toast toast={toast}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:18,fontWeight:800}}>📋 {isCashier ? `Инвентаризация остатков (${myPoint})` : "Инвентаризация остатков"}</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:C.muted}}>Выберите точку:</span>
          {isCashier ? (
            <span style={{fontSize:13,fontWeight:700,color:C.text}}>{myPoint}</span>
          ) : (
            <select value={selPoint} onChange={e=>setSelPoint(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",outline:"none",fontSize:12}}>
              {POINTS.map(p=><option key={p}>{p}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* ТАБЫ */}
      <div style={{display:"flex",gap:10,marginBottom:20}}>
        <button onClick={()=>setActiveTab("semi")} style={{padding:"10px 18px",borderRadius:8,border:"none",background:activeTab==="semi"?C.accentSoft:C.card,color:activeTab==="semi"?C.accent:C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>
          🥗 Полуфабрикаты (Кухня)
        </button>
        <button onClick={()=>setActiveTab("raw")} style={{padding:"10px 18px",borderRadius:8,border:"none",background:activeTab==="raw"?C.accentSoft:C.card,color:activeTab==="raw"?C.accent:C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>
          📦 Сырьё (Склад)
        </button>
      </div>

      <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:500}}>
            <thead>
              <tr style={{background:C.surface,borderBottom:`1px solid ${C.border}`}}>
                {["Наименование","Ед.","Расчётный остаток","Фактический остаток","Разница"].map((h,i)=>
                  <th key={i} style={{padding:"13px 18px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {currentList.map((item)=>{
                const expVal = getQty(item.qty, selPoint);
                const factVal = facts[item.id] !== undefined ? facts[item.id] : "";
                const parsedFact = parseFloat(factVal);
                const diff = !isNaN(parsedFact) ? parsedFact - expVal : null;

                return (
                  <tr key={item.id} style={{borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:"13px 18px",fontWeight:600}}>{item.name}</td>
                    <td style={{padding:"13px 18px",color:C.muted}}>{fmtUnit(item.unit)}</td>
                    <td style={{padding:"13px 18px",fontWeight:800,color:expVal<0?C.red:C.text}}>{fmt(expVal)}</td>
                    <td style={{padding:"13px 18px"}}>
                      <input
                        type="number"
                        value={factVal}
                        onChange={e => setFacts(prev => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder={fmt(expVal)}
                        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.text,outline:"none",width:100}}
                      />
                    </td>
                    <td style={{padding:"13px 18px",fontWeight:800,color:diff === null ? C.muted : diff === 0 ? C.green : diff < 0 ? C.red : C.blue}}>
                      {diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{marginTop:20,display:"flex",justifyContent:"flex-end"}}>
        <button onClick={handleCommitInventory} style={{padding:"14px 28px",background:C.green,color:"#000",border:"none",borderRadius:10,fontWeight:900,cursor:"pointer",fontSize:15}}>
          🍓 Зафиксировать инвентаризацию
        </button>
      </div>
    </div>
  );
}