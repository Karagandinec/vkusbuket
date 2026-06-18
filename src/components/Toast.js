import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, ROLES, POINTS, POINT_COLORS, ALL_LOCATIONS } from "../constants";

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