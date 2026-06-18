import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";
import {
  getConvertedQty, INIT_USERS, initRawStock, initSemiStock, INIT_TECH_CARDS, CAT_COLORS, NAV, fmtM, fmtS, fmt, PAY_LABELS, fmtPay, parseQtyObj, parseSemiQtyObj, getQty, parseLocalDate, getPackagingItems, calcCost, calcProductCOGS, calcCartItemCOGS, getIngName, getIngUnit, restoreStockForSale, processSaleStock, LS, generateUUID, getMergedList, isSessionValid, touchSession, RPC_ENABLED, fmtUnit, checkIsMobile, checkIsPortrait, setWarehouseHistoryWithSync, setWriteOffsWithSync, setUsersWithSync, setCustomersWithSync, setRawStockWithSync, setSemiStockWithSync, setTechCardsWithSync, setSalesWithSync, setExpensesWithSync, checkAdminOrManager, isAdmin, isManager, isSurgeon, canWriteOff, canAddShift, supabase, supaFetch
} from "../utils";

export const Toast = React.memo(function Toast({toast}){
  if(!toast) return null;
  return <div style={{position:"fixed",top:20,right:20,zIndex:9999,background:toast.err?C.red:C.green,color:"#fff",padding:"12px 22px",borderRadius:12,fontWeight:700,fontSize:14,boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>
    {toast.err?"✕ ":"✓ "}{toast.msg}
  </div>;
});

export function useToast(){
  const [toast,setToast]=useState(null);
  const show=(msg,err=false)=>{setToast({msg,err});setTimeout(()=>setToast(null),3000);};
  return [toast,show];
}