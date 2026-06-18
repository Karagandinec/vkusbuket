export const C = {
  bg:"#0F0F13", surface:"#16161D", card:"#1C1C26", border:"#2A2A38",
  accent:"#E8A0B4", accentSoft:"rgba(232,160,180,0.12)",
  green:"#2ECC71", greenSoft:"rgba(46,204,113,0.13)",
  red:"#E74C3C", redSoft:"rgba(231,76,60,0.12)",
  yellow:"#F39C12", yellowSoft:"rgba(243,156,18,0.12)",
  blue:"#3498DB", blueSoft:"rgba(52,152,219,0.12)",
  purple:"#9B59B6", purpleSoft:"rgba(155,89,182,0.12)",
  text:"#EAEAF0", muted:"#7A7A94", dimmed:"#2A2A38"
};

export const POINT_COLORS = ["#E8A0B4","#3498DB","#2ECC71","#9B59B6","#95A5A6"];
export const POINTS = ["Мастерская","Фуд Трак","Жара","Парк"];
export const ALL_LOCATIONS = ["Склад", ...POINTS];

export const ROLES = {
  owner:       { label:"Владелец",        icon:"👑", color:C.accent,  nav:["dashboard","pos","preorders","production","warehouse","inventory","writeoff","expenses","reports","shifts","settings"] },
  director:    { label:"Директор",        icon:"👔", color:C.purple,  nav:["dashboard","pos","preorders","production","warehouse","inventory","writeoff","expenses","reports","shifts","settings"] },
  admin:       { label:"Администратор",   icon:"📋", color:C.blue,    nav:["dashboard","pos","preorders","warehouse","inventory","writeoff","expenses"] },
  cashier:     { label:"Кассир",          icon:"🧾", color:C.green,   nav:["pos","writeoff","inventory"] },
};
