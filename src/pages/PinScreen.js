import React, { useState, useEffect, useRef } from "react";
import { ROLES, C } from "../constants";
import {
  getConvertedQty, INIT_USERS, initRawStock, initSemiStock, INIT_TECH_CARDS, CAT_COLORS, NAV, fmtM, fmtS, fmt, PAY_LABELS, fmtPay, parseQtyObj, parseSemiQtyObj, getQty, parseLocalDate, getPackagingItems, calcCost, calcProductCOGS, calcCartItemCOGS, getIngName, getIngUnit, restoreStockForSale, processSaleStock, LS, generateUUID, getMergedList, isSessionValid, touchSession, RPC_ENABLED, fmtUnit, checkIsMobile, checkIsPortrait, setWarehouseHistoryWithSync, setWriteOffsWithSync, setUsersWithSync, setCustomersWithSync, setRawStockWithSync, setSemiStockWithSync, setTechCardsWithSync, setSalesWithSync, setExpensesWithSync, checkAdminOrManager, isAdmin, isManager, isSurgeon, canWriteOff, canAddShift, supabase, supaFetch
} from "../utils";

export default function PinScreen({users, onLogin, onClose}){
  const [selected, setSelected] = useState(null);
  const [pin, setPin]           = useState("");
  const [error, setError]       = useState("");
  const [locked, setLocked]     = useState(false);
  const [lockSecsLeft, setLockSecsLeft] = useState(0);

  const verificationTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      try {
        if (verificationTimeoutRef.current) {
          clearTimeout(verificationTimeoutRef.current);
        }
      } catch (e) {
        console.warn('[unmount cleanup] Error:', e.message || e);
      }
    };
  }, []);

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS   = 30_000;

  const getBFState = (userId) => {
    try { const s = JSON.parse(localStorage.getItem(`vb_bf_${userId}`) || "{}"); return { attempts: s.attempts||0, lockedUntil: s.lockedUntil||0 }; }
    catch { return { attempts: 0, lockedUntil: 0 }; }
  };
  const setBFState = (userId, state) => { try { localStorage.setItem(`vb_bf_${userId}`, JSON.stringify(state)); } catch {} };
  const clearBFState = (userId) => { try { localStorage.removeItem(`vb_bf_${userId}`); } catch {} };

  const handleSelectUser = (u) => {
    try {
      if (verificationTimeoutRef.current) {
        clearTimeout(verificationTimeoutRef.current);
        verificationTimeoutRef.current = null;
      }
      setPin(""); setError("");
      const { lockedUntil } = getBFState(u.id);
      const latestUser = users.find(x => x.id === u.id) || u;

      // Пропускаем ПИН если он не задан
      if (!latestUser.pin || String(latestUser.pin).trim() === "") {
        if (!lockedUntil || Date.now() > lockedUntil) {
          clearBFState(u.id);
          onLogin(latestUser);
          return;
        }
      }

      setSelected(u);
      setLocked(Date.now() < lockedUntil);
    } catch (e) {
      console.warn('[handleSelectUser] Error:', e.message || e);
    }
  };

  useEffect(() => {
    if (!locked || !selected) return;
    const update = () => {
      const { lockedUntil } = getBFState(selected.id);
      const rem = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockSecsLeft(rem);
      if (rem === 0) { setLocked(false); setError(""); }
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, selected]);

  const handleDigit = (d) => {
    try {
      if (locked || verificationTimeoutRef.current) return;
      setPin(prev => {
        if (prev.length >= 4) return prev;
        const next = prev + d;
        if (next.length === 4) {
          if (!verificationTimeoutRef.current) {
            const targetUser = selected;
            if (!targetUser) return next;
            verificationTimeoutRef.current = setTimeout(() => {
              try {
                const latestUser = users.find(u => u.id === targetUser.id) || targetUser;
                if (String(next) === String(latestUser.pin)) {
                  clearBFState(targetUser.id);
                  onLogin(latestUser);
                  setPin("");
                  setSelected(null);
                  setLocked(false);
                } else {
                  const bf = getBFState(targetUser.id);
                  const newAttempts = bf.attempts + 1;
                  if (newAttempts >= MAX_ATTEMPTS) {
                    setBFState(targetUser.id, { attempts: 0, lockedUntil: Date.now() + LOCKOUT_MS });
                    setLocked(true);
                    setError(`Слишком много попыток. Блокировка ${LOCKOUT_MS/1000} сек.`);
                  } else {
                    setBFState(targetUser.id, { attempts: newAttempts, lockedUntil: 0 });
                    setError(`Неверный PIN. Осталось попыток: ${MAX_ATTEMPTS - newAttempts}`);
                  }
                  setPin("");
                }
              } catch (timeoutErr) {
                console.warn('[handleDigit timeout] Error:', timeoutErr.message || timeoutErr);
              } finally {
                verificationTimeoutRef.current = null;
              }
            }, 200);
          }
        }
        return next;
      });
      setError("");
    } catch (e) {
      console.warn('[handleDigit] Error:', e.message || e);
    }
  };

  const handleCancel = () => {
    try {
      if (verificationTimeoutRef.current) {
        clearTimeout(verificationTimeoutRef.current);
        verificationTimeoutRef.current = null;
      }
      setSelected(null);
      setPin("");
      setError("");
      setLocked(false);
    } catch (e) {
      console.warn('[handleCancel] Error:', e.message || e);
    }
  };

  const handleBack = () => {
    try {
      if (!locked && !verificationTimeoutRef.current) {
        setPin(p => p.slice(0, -1));
        setError("");
      }
    } catch (e) {
      console.warn('[handleBack] Error:', e.message || e);
    }
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,15,19,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,flexDirection:"column",gap:24}}>
      {onClose && <button onClick={onClose} style={{position:"absolute",top:20,right:24,background:"transparent",border:"none",color:"#7A7A94",fontSize:24,cursor:"pointer"}}>✕</button>}
      <div style={{fontSize:28,fontWeight:900,letterSpacing:-1,color:"#E8A0B4"}}>VKUS<span style={{color:"#EAEAF0",fontWeight:300}}>BUKET</span></div>

      {!selected ? (
        <div style={{display:"flex",flexDirection:"column",gap:12,width:280,maxHeight:"65vh",overflowY:"auto",paddingRight:4}}>
          <div style={{color:"#7A7A94",fontSize:13,textAlign:"center",marginBottom:4}}>Выберите профиль сотрудника</div>
          {[...users].sort((a, b) => {
            const getWeight = (u) => {
              if (u.role === "owner") return 1;
              if (u.role === "director") return 2;
              if (u.role === "cashier") {
                const pt = u.point || "";
                if (pt.includes("Мастерская")) return 3;
                if (pt.includes("Фуд") || pt.includes("Food")) return 4;
                if (pt.includes("Жара")) return 5;
                if (pt.includes("Парк")) return 6;
                return 7;
              }
              return 8;
            };
            return getWeight(a) - getWeight(b);
          }).map(u=>{
            const r = ROLES[u.role] || { label: u.role||"Неизвестно", icon:"👤", color:C.muted, nav:["dashboard"] };
            const { lockedUntil } = getBFState(u.id);
            const isUserLocked = Date.now() < lockedUntil;
            return(
              <button key={u.id} onClick={()=>handleSelectUser(u)}
                style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderRadius:14,border:"1px solid #2A2A38",background:"#16161D",color:"#EAEAF0",cursor:"pointer",textAlign:"left",opacity:isUserLocked?0.6:1}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#E8A0B4"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#2A2A38"}>
                <div style={{width:40,height:40,borderRadius:20,background:r.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{r.icon}</div>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{u.name}</div>
                  <div style={{fontSize:12,color:"#7A7A94"}}>{r.label}{u.point?" · "+u.point:""}{isUserLocked?" 🔒":""}</div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20,width:280}}>
          <button onClick={handleCancel} style={{background:"transparent",border:"none",color:"#7A7A94",cursor:"pointer",fontSize:13,alignSelf:"flex-start"}}>← Назад</button>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            {(()=>{ const sr = ROLES[selected.role] || { color:C.muted, icon:"👤" }; return (
            <div style={{width:40,height:40,borderRadius:20,background:sr.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{sr.icon}</div>
            ); })()}
            <div style={{fontWeight:700}}>{selected.name}</div>
          </div>
          {locked ? (
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:40,marginBottom:8}}>🔒</div>
              <div style={{color:"#E74C3C",fontSize:14,fontWeight:700}}>Слишком много попыток</div>
              <div style={{color:"#7A7A94",fontSize:13,marginTop:4}}>Повторите через <b style={{color:"#EAEAF0"}}>{lockSecsLeft}</b> сек.</div>
            </div>
          ) : (
            <>
              <div style={{color:"#7A7A94",fontSize:13}}>Введите PIN-код</div>
              <div style={{display:"flex",gap:14}}>
                {[0,1,2,3].map(i=>(
                  <div key={i} style={{width:16,height:16,borderRadius:8,background:pin.length>i?"#E8A0B4":"#2A2A38",transition:"background .15s"}}/>
                ))}
              </div>
              {error&&<div style={{color:"#E74C3C",fontSize:13,fontWeight:600,textAlign:"center"}}>{error}</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,width:"100%"}}>
                {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(
                  <button key={i} onClick={()=> d==="⌫"?handleBack():d!==""?handleDigit(String(d)):null}
                    disabled={d===""}
                    style={{padding:"18px 0",borderRadius:14,border:"1px solid #2A2A38",background:d===""?"transparent":"#1C1C26",color:"#EAEAF0",fontSize:20,fontWeight:600,cursor:d===""?"default":"pointer",opacity:d===""?0:1}}>
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
