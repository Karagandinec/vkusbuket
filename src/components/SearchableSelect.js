import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";
import {
  getConvertedQty, INIT_USERS, initRawStock, initSemiStock, INIT_TECH_CARDS, CAT_COLORS, NAV, fmtM, fmtS, fmt, PAY_LABELS, fmtPay, parseQtyObj, parseSemiQtyObj, getQty, parseLocalDate, getPackagingItems, calcCost, calcProductCOGS, calcCartItemCOGS, getIngName, getIngUnit, restoreStockForSale, processSaleStock, LS, generateUUID, getMergedList, isSessionValid, touchSession, RPC_ENABLED, fmtUnit, checkIsMobile, checkIsPortrait, setWarehouseHistoryWithSync, setWriteOffsWithSync, setUsersWithSync, setCustomersWithSync, setRawStockWithSync, setSemiStockWithSync, setTechCardsWithSync, setSalesWithSync, setExpensesWithSync, checkAdminOrManager, isAdmin, isManager, isSurgeon, canWriteOff, canAddShift, supabase, supaFetch
} from "../utils";

export default function SearchableSelect({ value, onChange, options, placeholder = "Выберите...", style = {} }) {
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  
  const selectedOption = options.find(o => o.value === value);
  const displayValue = selectedOption ? selectedOption.label : "";

  return (
    <div style={{ position: "relative", ...style }} tabIndex={0} onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
    }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 11px", color:C.text, boxSizing:"border-box", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", ...style }}
      >
        <span style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", fontSize:13 }}>{displayValue || placeholder}</span>
        <span style={{ fontSize:10, opacity:0.5 }}>▼</span>
      </div>
      {open && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:4, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, zIndex:100, overflow:"hidden", boxShadow:"0 4px 12px rgba(0,0,0,0.5)" }}>
          <input 
            autoFocus
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="🔍 Поиск..." 
            style={{ width:"100%", background:"transparent", border:"none", borderBottom:`1px solid ${C.border}`, padding:11, color:C.text, outline:"none", boxSizing:"border-box", fontSize:13 }}
          />
          <div style={{ maxHeight: 200, overflowY:"auto" }}>
            {options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())).map(o => (
              <div 
                key={o.value} 
                onClick={() => { onChange(o.value); setOpen(false); setSearch(""); }}
                style={{ padding:"10px 12px", cursor:"pointer", borderBottom:`1px solid ${C.border}40`, background: o.value === value ? C.surface : "transparent", fontSize:13 }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface}
                onMouseLeave={e => e.currentTarget.style.background = o.value === value ? C.surface : "transparent"}
              >
                {o.label}
              </div>
            ))}
            {options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())).length === 0 && (
              <div style={{ padding:"10px 12px", color:C.muted, fontSize:12, textAlign:"center" }}>Ничего не найдено</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}