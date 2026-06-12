import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const LS = (key,def) => { try { const v=localStorage.getItem(key); return v?JSON.parse(v):def; } catch{ return def; } };

const generateUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
};

// getMergedList: O(n) через Map вместо O(n²) через findIndex
const getMergedList = (fetched, local, tableName) => {
  const queue = LS("vb_sync_queue", []);
  // Строим Set ID записей с pending-синхронизацией для O(1) проверки
  const pendingIds = new Set(
    queue
      .filter(q => q.table === tableName)
      .flatMap(q => {
        const ids = [];
        if (q.body?.id) ids.push(q.body.id);
        if (q.params) {
          const m = q.params.match(/id=eq\.([^&]+)/);
          if (m) ids.push(m[1]);
        }
        return ids;
      })
  );

  // Строим Map из fetched для O(1) lookup
  const mergedMap = new Map(fetched.map(item => [item.id, item]));

  // Local-записи с pending sync имеют приоритет; остальные local-only добавляем
  local.forEach(localItem => {
    if (!mergedMap.has(localItem.id)) {
      mergedMap.set(localItem.id, localItem);
    } else if (pendingIds.has(localItem.id)) {
      mergedMap.set(localItem.id, localItem); // local-версия актуальнее
    }
  });

  return Array.from(mergedMap.values());
};

// Проверяет, не истекла ли сессия (всегда валидна, если пользователь авторизован)
const isSessionValid = () => {
  try {
    return !!localStorage.getItem("vb_session_user");
  } catch { return false; }
};

// Сохраняет метку времени входа
const touchSession = () => {
  try { localStorage.setItem("vb_session_ts", String(Date.now())); } catch {}
};

// ─── ЦВЕТА ───────────────────────────────────────────────────────────────────

function SearchableSelect({ value, onChange, options, placeholder = "Выберите...", style = {} }) {
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

const getConvertedQty = (qty, fromUnit, toUnit) => {
  if (!qty) return 0;
  if (!fromUnit || !toUnit || fromUnit === toUnit) return qty;
  if (fromUnit === "г" && toUnit === "кг") return qty / 1000;
  if (fromUnit === "кг" && toUnit === "г") return qty * 1000;
  if (fromUnit === "мл" && toUnit === "л") return qty / 1000;
  if (fromUnit === "л" && toUnit === "мл") return qty * 1000;
  return qty;
};

const C = {

  bg:"#0F0F13", surface:"#16161D", card:"#1C1C26", border:"#2A2A38",
  accent:"#E8A0B4", accentSoft:"rgba(232,160,180,0.12)",
  green:"#2ECC71", greenSoft:"rgba(46,204,113,0.13)",
  red:"#E74C3C", redSoft:"rgba(231,76,60,0.12)",
  yellow:"#F39C12", yellowSoft:"rgba(243,156,18,0.12)",
  blue:"#3498DB", blueSoft:"rgba(52,152,219,0.12)",
  purple:"#9B59B6", purpleSoft:"rgba(155,89,182,0.12)",
  text:"#EAEAF0", muted:"#7A7A94", dimmed:"#2A2A38"
};

const POINT_COLORS = ["#E8A0B4","#3498DB","#2ECC71","#9B59B6","#95A5A6"];
const POINTS = ["Мастерская","Фуд Трак","Жара","Парк"];
const ALL_LOCATIONS = ["Склад", ...POINTS];

const ROLES = {
  owner:       { label:"Владелец",        icon:"👑", color:C.accent,  nav:["dashboard","pos","preorders","production","warehouse","inventory","writeoff","expenses","reports","shifts","settings"] },
  director:    { label:"Директор",        icon:"👔", color:C.purple,  nav:["dashboard","pos","preorders","production","warehouse","inventory","writeoff","expenses","reports","shifts","settings"] },
  admin:       { label:"Администратор",   icon:"📋", color:C.blue,    nav:["dashboard","pos","preorders","warehouse","inventory","writeoff","expenses"] },
  cashier:     { label:"Кассир",          icon:"🧾", color:C.green,   nav:["pos","writeoff","inventory"] },
};

const INIT_USERS = [
  { id:"00000000-0000-4000-a000-000000000001", name:"Владелец",          role:"owner",    point:null,          pin:"7663" },
  { id:"00000000-0000-4000-a000-000000000002", name:"Директор",          role:"director", point:null,          pin:"8888" },
  { id:"00000000-0000-4000-a000-000000000003", name:"Кассир Мастерская", role:"cashier",  point:"Мастерская",  pin:"1111" },
  { id:"00000000-0000-4000-a000-000000000004", name:"Кассир Фуд Трак",   role:"cashier",  point:"Фуд Трак",    pin:"2222" },
  { id:"00000000-0000-4000-a000-000000000005", name:"Кассир Жара",       role:"cashier",  point:"Жара",        pin:"3333" },
  { id:"00000000-0000-4000-a000-000000000006", name:"Кассир Парк",       role:"cashier",  point:"Парк",        pin:"4444" },
];

// Инициализируем остатки на "Склад" согласно данным из Excel
const initRawStock = [
  { id:"r1",  name:"Клубника свежая",              unit:"г",    price:2.5,    qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r2",  name:"Шоколад молочный",             unit:"г",    price:8.95,   qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r3",  name:"Шоколад белый",                unit:"г",    price:7.95,   qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r4",  name:"Шоколад тёмный Callebaut",     unit:"г",    price:4.8,    qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r5",  name:"Дубайская паста",              unit:"г",    price:16.5,   qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r6",  name:"Мороженое сливочное",          unit:"г",    price:2,      qty: { "Склад": 38000, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r37", name:"Мороженое шоколадное",         unit:"г",    price:2,      qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r38", name:"Рожок вафельный",              unit:"шт",   price:80,     qty: { "Склад": 100, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r7",  name:"Краситель пищевой",            unit:"г",    price:19,     qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r8",  name:"Кандурин",                     unit:"г",    price:100,    qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r9",  name:"Скотч двухсторонний",          unit:"шт",   price:100,    qty: { "Склад": 6, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r10", name:"Лента декоративная 1см",       unit:"рул",  price:400,    qty: { "Склад": 29, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r11", name:"Розетки бумажные (1000шт)",    unit:"уп",   price:1140,   qty: { "Склад": 5, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r12", name:"Тишью бумага",                 unit:"лист", price:0.4,    qty: { "Склад": 292, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r13", name:"Шпажки / палочки (70шт)",      unit:"уп",   price:180,    qty: { "Склад": 11, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r14", name:"Слюда (упак. плёнка)",         unit:"м",    price:8.5,    qty: { "Склад": 100, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r15", name:"Упаковочная бумага",           unit:"лист", price:50,     qty: { "Склад": 200, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r16", name:"Бичевка / верёвка",            unit:"рул",  price:5,      qty: { "Склад": 8, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r17", name:"Открытка",                     unit:"шт",   price:35,     qty: { "Склад": 100, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r18", name:"Эмблема / бирка",              unit:"рул",  price:5,      qty: { "Склад": 20, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r19", name:"Пакет крафт малый",            unit:"шт",   price:80,     qty: { "Склад": 86, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r20", name:"Пакет крафт средний",          unit:"шт",   price:85,     qty: { "Склад": 52, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r21", name:"Пакет крафт большой",          unit:"шт",   price:120,    qty: { "Склад": 89, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r22", name:"Скотч обычный (широкий)",      unit:"шт",   price:430,    qty: { "Склад": 191, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r23", name:"Лента декоративная 2см",       unit:"рул",  price:400,    qty: { "Склад": 8, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r24", name:"Креманка",                     unit:"шт",   price:57,     qty: { "Склад": 1264, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r25", name:"Вилка одноразовая (уп.)",      unit:"уп",   price:13,     qty: { "Склад": 12, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r26", name:"Салфетка",                     unit:"шт",   price:13,     qty: { "Склад": 500, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r27", name:"Посыпка кондитерская (г)",     unit:"г",    price:0.025,  qty: { "Склад": 2476, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r28", name:"Макси стакан",                 unit:"шт",   price:39.6,   qty: { "Склад": 163, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r29", name:"Коробки набор 8шт",            unit:"шт",   price:220,    qty: { "Склад": 2119, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r30", name:"Коробки набор 12шт",           unit:"шт",   price:200,    qty: { "Склад": 530, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r31", name:"Коробки набор 15шт",           unit:"шт",   price:330,    qty: { "Склад": 174, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r32", name:"Коробки набор 20шт",           unit:"шт",   price:410,    qty: { "Склад": 173, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r33", name:"Коробки набор 25шт",           unit:"шт",   price:430,    qty: { "Склад": 154, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r34", name:"Коробки набор 35шт",           unit:"шт",   price:430,    qty: { "Склад": 69, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r35", name:"Коробки набор 48шт",           unit:"шт",   price:185,    qty: { "Склад": 75, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r36", name:"Коробки набор 64шт",           unit:"шт",   price:700,    qty: { "Склад": 8, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
];

// ─── ПОЛУФАБРИКАТЫ ───────────────────────────────────────────────────────────
// Инициализируем полуфабрикаты на кухнях точек
const initSemiStock = [
  { id:"s1", name:"Клубника подготовленная",    unit:"г", qty: { "Склад": 0, "Мастерская": 30000, "Фуд Трак": 30000, "Жара": 30000, "Парк": 30000 }, rawId:"r1" },
  { id:"s2", name:"Шоколад молочный (глазурь)", unit:"г", qty: { "Склад": 0, "Мастерская": 8000,  "Фуд Трак": 8000,  "Жара": 8000,  "Парк": 8000  }, rawId:"r2" },
  { id:"s3", name:"Шоколад белый (глазурь)",    unit:"г", qty: { "Склад": 0, "Мастерская": 5000,  "Фуд Трак": 5000,  "Жара": 5000,  "Парк": 5000  }, rawId:"r3" },
  { id:"s4", name:"Шоколад тёмный (глазурь)",   unit:"г", qty: { "Склад": 0, "Мастерская": 3000,  "Фуд Трак": 3000,  "Жара": 3000,  "Парк": 3000  }, rawId:"r4" },
  { id:"s5", name:"Дубайская паста (готовая)",  unit:"г", qty: { "Склад": 0, "Мастерская": 2000,  "Фуд Трак": 2000,  "Жара": 2000,  "Парк": 2000  }, rawId:"r5" },
  { id:"s6", name:"Мороженое сливочное (порции)", unit:"г", qty: { "Склад": 0, "Мастерская": 5000, "Фуд Трак": 5000, "Жара": 5000, "Парк": 5000 }, rawId:"r6" },
  { id:"s7", name:"Мороженое шоколадное (порции)", unit:"г", qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 }, rawId:"r37" },
];

// ─── ТЕХ. КАРТЫ ───────────────────────────────────────────────────────────────
const INIT_TECH_CARDS = [
  {
    "id": "tc1",
    "product": "Набор 8 шт",
    "cat": "Наборы",
    "price": 7500,
    "ings": [
      {
        "sid": "s1",
        "qty": 200.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 40.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 40.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r27",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r9",
        "qty": 0.008,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.024,
        "loss": 1.2
      },
      {
        "rid": "r11",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r29",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r12",
        "qty": 0.166,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r19",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc2",
    "product": "Набор 10 шт",
    "cat": "Наборы",
    "price": 8300,
    "ings": [
      {
        "sid": "s1",
        "qty": 200.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 50.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 50.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r9",
        "qty": 0.008,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.024,
        "loss": 1.2
      },
      {
        "rid": "r11",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r29",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r12",
        "qty": 0.166,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r19",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc3",
    "product": "Набор 12 шт",
    "cat": "Наборы",
    "price": 10200,
    "ings": [
      {
        "sid": "s1",
        "qty": 252.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 60.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 60.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r9",
        "qty": 0.18,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.024,
        "loss": 1.2
      },
      {
        "rid": "r11",
        "qty": 0.012,
        "loss": 0.0
      },
      {
        "rid": "r30",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r12",
        "qty": 0.2,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc4",
    "product": "Набор 15 шт",
    "cat": "Наборы",
    "price": 13600,
    "ings": [
      {
        "sid": "s1",
        "qty": 345.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 100.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 50.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r31",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r12",
        "qty": 0.3,
        "loss": 0.0
      },
      {
        "rid": "r11",
        "qty": 0.015,
        "loss": 0.0
      },
      {
        "rid": "r9",
        "qty": 0.15,
        "loss": 15.2
      },
      {
        "rid": "r10",
        "qty": 0.028,
        "loss": 1.4
      },
      {
        "rid": "r18",
        "qty": 0.001,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r21",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc5",
    "product": "Набор 20 шт",
    "cat": "Наборы",
    "price": 15900,
    "ings": [
      {
        "sid": "s1",
        "qty": 400.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 100.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 100.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r32",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r12",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r9",
        "qty": 0.15,
        "loss": 15.2
      },
      {
        "rid": "r10",
        "qty": 0.026,
        "loss": 1.3
      },
      {
        "rid": "r18",
        "qty": 0.001,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r20",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc6",
    "product": "Набор 25 шт",
    "cat": "Наборы",
    "price": 18900,
    "ings": [
      {
        "sid": "s1",
        "qty": 500.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 130.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 120.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r9",
        "qty": 0.15,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.036,
        "loss": 1.8
      },
      {
        "rid": "r11",
        "qty": 0.025,
        "loss": 0.0
      },
      {
        "rid": "r33",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r12",
        "qty": 0.25,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.001,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r21",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc7",
    "product": "Набор 35 шт",
    "cat": "Наборы",
    "price": 26900,
    "ings": [
      {
        "sid": "s1",
        "qty": 735.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 200.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 150.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r9",
        "qty": 0.15,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.036,
        "loss": 1.8
      },
      {
        "rid": "r11",
        "qty": 0.025,
        "loss": 0.0
      },
      {
        "rid": "r33",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r12",
        "qty": 0.25,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.001,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r21",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc8",
    "product": "Набор 48 шт",
    "cat": "Наборы",
    "price": 37900,
    "ings": [
      {
        "sid": "s1",
        "qty": 1008.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 240.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 240.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r8",
        "qty": 5.0,
        "loss": 0.5
      },
      {
        "rid": "r9",
        "qty": 0.15,
        "loss": 15.2
      },
      {
        "rid": "r18",
        "qty": 0.001,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 2.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc9",
    "product": "Набор 64 шт",
    "cat": "Наборы",
    "price": 46400,
    "ings": [
      {
        "sid": "s1",
        "qty": 1280.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 240.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 320.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r11",
        "qty": 0.064,
        "loss": 0.0
      },
      {
        "rid": "r9",
        "qty": 3.0,
        "loss": 3.0
      },
      {
        "rid": "r18",
        "qty": 0.001,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 2.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc10",
    "product": "Букет XXS (9 ягод)",
    "cat": "Букеты",
    "price": 9900,
    "ings": [
      {
        "sid": "s1",
        "qty": 252.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 90.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r27",
        "qty": 8.0,
        "loss": 0.0
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r14",
        "qty": 0.4,
        "loss": 40.4
      },
      {
        "rid": "r15",
        "qty": 2.0,
        "loss": 0.0
      },
      {
        "rid": "r13",
        "qty": 0.2571,
        "loss": 0.0
      },
      {
        "rid": "r22",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.01,
        "loss": 50.5
      },
      {
        "rid": "r16",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc11",
    "product": "Букет XS (15 ягод)",
    "cat": "Букеты",
    "price": 13400,
    "ings": [
      {
        "sid": "s1",
        "qty": 330.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 80.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 70.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r27",
        "qty": 8.0,
        "loss": 0.0
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r14",
        "qty": 0.4,
        "loss": 40.4
      },
      {
        "rid": "r15",
        "qty": 3.0,
        "loss": 0.0
      },
      {
        "rid": "r13",
        "qty": 0.4286,
        "loss": 0.0
      },
      {
        "rid": "r22",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.01,
        "loss": 50.5
      },
      {
        "rid": "r16",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc12",
    "product": "Букет S (17-19 ягод)",
    "cat": "Букеты",
    "price": 15900,
    "ings": [
      {
        "sid": "s1",
        "qty": 399.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 110.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 80.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r27",
        "qty": 3.0,
        "loss": 0.3
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r14",
        "qty": 0.5,
        "loss": 50.5
      },
      {
        "rid": "r15",
        "qty": 5.0,
        "loss": 0.0
      },
      {
        "rid": "r13",
        "qty": 0.5429,
        "loss": 0.0
      },
      {
        "rid": "r22",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.02,
        "loss": 1.0
      },
      {
        "rid": "r16",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc13",
    "product": "Букет S+ (22-25 ягод)",
    "cat": "Букеты",
    "price": 19600,
    "ings": [
      {
        "sid": "s1",
        "qty": 525.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 150.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 100.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r27",
        "qty": 3.0,
        "loss": 0.3
      },
      {
        "rid": "r8",
        "qty": 1.0,
        "loss": 0.1
      },
      {
        "rid": "r14",
        "qty": 0.6,
        "loss": 60.6
      },
      {
        "rid": "r15",
        "qty": 5.0,
        "loss": 0.0
      },
      {
        "rid": "r13",
        "qty": 0.7143,
        "loss": 0.0
      },
      {
        "rid": "r22",
        "qty": 1.5,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.02,
        "loss": 1.0
      },
      {
        "rid": "r16",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc14",
    "product": "Букет M (33-36 ягод)",
    "cat": "Букеты",
    "price": 27300,
    "ings": [
      {
        "sid": "s1",
        "qty": 738.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 200.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 160.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r27",
        "qty": 3.0,
        "loss": 0.3
      },
      {
        "rid": "r8",
        "qty": 1.3,
        "loss": 0.1
      },
      {
        "rid": "r14",
        "qty": 1.0,
        "loss": 1.0
      },
      {
        "rid": "r15",
        "qty": 6.0,
        "loss": 0.0
      },
      {
        "rid": "r13",
        "qty": 1.0286,
        "loss": 0.0
      },
      {
        "rid": "r22",
        "qty": 1.5,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.04,
        "loss": 2.0
      },
      {
        "rid": "r16",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc15",
    "product": "Букет M+ (43-45 ягод)",
    "cat": "Букеты",
    "price": 34600,
    "ings": [
      {
        "sid": "s1",
        "qty": 949.5,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 250.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 200.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r27",
        "qty": 3.0,
        "loss": 0.3
      },
      {
        "rid": "r8",
        "qty": 1.4,
        "loss": 0.1
      },
      {
        "rid": "r14",
        "qty": 1.0,
        "loss": 1.0
      },
      {
        "rid": "r15",
        "qty": 7.0,
        "loss": 0.0
      },
      {
        "rid": "r13",
        "qty": 1.2857,
        "loss": 0.0
      },
      {
        "rid": "r22",
        "qty": 1.5,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.04,
        "loss": 2.0
      },
      {
        "rid": "r16",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc16",
    "product": "Букет L (56-60 ягод)",
    "cat": "Букеты",
    "price": 43300,
    "ings": [
      {
        "sid": "s1",
        "qty": 1020.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 400.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 200.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 2.0,
        "loss": 0.0
      },
      {
        "rid": "r27",
        "qty": 3.0,
        "loss": 0.3
      },
      {
        "rid": "r8",
        "qty": 2.0,
        "loss": 0.2
      },
      {
        "rid": "r14",
        "qty": 1.2,
        "loss": 1.2
      },
      {
        "rid": "r15",
        "qty": 8.0,
        "loss": 0.0
      },
      {
        "rid": "r13",
        "qty": 1.7143,
        "loss": 0.0
      },
      {
        "rid": "r22",
        "qty": 3.0,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.04,
        "loss": 2.0
      },
      {
        "rid": "r16",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc17",
    "product": "Букет L+ (68-70 ягод)",
    "cat": "Букеты",
    "price": 51700,
    "ings": [
      {
        "sid": "s1",
        "qty": 1400.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 450.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 250.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 2.0,
        "loss": 0.0
      },
      {
        "rid": "r27",
        "qty": 3.0,
        "loss": 0.3
      },
      {
        "rid": "r8",
        "qty": 2.0,
        "loss": 0.2
      },
      {
        "rid": "r14",
        "qty": 1.5,
        "loss": 1.5
      },
      {
        "rid": "r15",
        "qty": 8.0,
        "loss": 0.0
      },
      {
        "rid": "r13",
        "qty": 2.0,
        "loss": 0.0
      },
      {
        "rid": "r22",
        "qty": 4.0,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.04,
        "loss": 2.0
      },
      {
        "rid": "r16",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc18",
    "product": "Букет XL (87-90 ягод)",
    "cat": "Букеты",
    "price": 65900,
    "ings": [
      {
        "sid": "s1",
        "qty": 1755.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 650.0,
        "loss": 5.0
      },
      {
        "sid": "s3",
        "qty": 250.0,
        "loss": 5.0
      },
      {
        "rid": "r7",
        "qty": 3.0,
        "loss": 0.0
      },
      {
        "rid": "r27",
        "qty": 3.0,
        "loss": 0.3
      },
      {
        "rid": "r8",
        "qty": 2.5,
        "loss": 0.3
      },
      {
        "rid": "r14",
        "qty": 2.0,
        "loss": 2.0
      },
      {
        "rid": "r15",
        "qty": 10.0,
        "loss": 0.0
      },
      {
        "rid": "r13",
        "qty": 2.5714,
        "loss": 0.0
      },
      {
        "rid": "r22",
        "qty": 5.0,
        "loss": 0.0
      },
      {
        "rid": "r10",
        "qty": 0.04,
        "loss": 2.0
      },
      {
        "rid": "r16",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r18",
        "qty": 0.002,
        "loss": 0.0
      },
      {
        "rid": "r17",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc19",
    "product": "Креманка классик",
    "cat": "Креманки",
    "price": 2500,
    "ings": [
      {
        "sid": "s1",
        "qty": 100.0,
        "loss": 10.0
      },
      {
        "sid": "s6",
        "qty": 50.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 30.0,
        "loss": 5.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc20",
    "product": "Креманка классик + мор",
    "cat": "Креманки",
    "price": 2500,
    "ings": [
      {
        "sid": "s1",
        "qty": 100.0,
        "loss": 10.0
      },
      {
        "sid": "s6",
        "qty": 50.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 30.0,
        "loss": 5.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc21",
    "product": "Креманка классик + 2 шок",
    "cat": "Креманки",
    "price": 3000,
    "ings": [
      {
        "sid": "s1",
        "qty": 150.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 45.0,
        "loss": 5.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc22",
    "product": "Крем. класс + мор + 2 шок",
    "cat": "Креманки",
    "price": 3000,
    "ings": [
      {
        "sid": "s1",
        "qty": 100.0,
        "loss": 10.0
      },
      {
        "sid": "s6",
        "qty": 50.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 45.0,
        "loss": 5.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc23",
    "product": "Креманка дубай",
    "cat": "Креманки",
    "price": 4500,
    "ings": [
      {
        "sid": "s1",
        "qty": 150.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 30.0,
        "loss": 5.0
      },
      {
        "sid": "s5",
        "qty": 30.0,
        "loss": 5.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc24",
    "product": "Креманка дубай + мор",
    "cat": "Креманки",
    "price": 4500,
    "ings": [
      {
        "sid": "s1",
        "qty": 100.0,
        "loss": 10.0
      },
      {
        "sid": "s6",
        "qty": 50.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 30.0,
        "loss": 5.0
      },
      {
        "sid": "s5",
        "qty": 30.0,
        "loss": 5.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc25",
    "product": "Макси классик",
    "cat": "Макси стаканы",
    "price": 4500,
    "ings": [
      {
        "sid": "s1",
        "qty": 200.0,
        "loss": 10.0
      },
      {
        "sid": "s6",
        "qty": 100.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 60.0,
        "loss": 5.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc26",
    "product": "Макси классик + мор",
    "cat": "Макси стаканы",
    "price": 4500,
    "ings": [
      {
        "sid": "s1",
        "qty": 200.0,
        "loss": 10.0
      },
      {
        "sid": "s6",
        "qty": 100.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 60.0,
        "loss": 5.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc27",
    "product": "Макси дубай",
    "cat": "Макси стаканы",
    "price": 8000,
    "ings": [
      {
        "sid": "s1",
        "qty": 200.0,
        "loss": 10.0
      },
      {
        "sid": "s6",
        "qty": 100.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 60.0,
        "loss": 5.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "sid": "s5",
        "qty": 60.0,
        "loss": 5.0
      }
    ]
  },
  {
    "id": "tc28",
    "product": "Макси дубай + мор",
    "cat": "Макси стаканы",
    "price": 8000,
    "ings": [
      {
        "sid": "s1",
        "qty": 200.0,
        "loss": 10.0
      },
      {
        "sid": "s6",
        "qty": 100.0,
        "loss": 10.0
      },
      {
        "sid": "s2",
        "qty": 60.0,
        "loss": 5.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "sid": "s5",
        "qty": 60.0,
        "loss": 5.0
      }
    ]
  },
  {
    "id": "tc29",
    "product": "Рожок с мороженым",
    "cat": "Креманки",
    "price": 1000,
    "ings": [
      {
        "sid": "s6",
        "qty": 100.0,
        "loss": 10.0
      },
      {
        "rid": "r38",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  },
  {
    "id": "tc30",
    "product": "Креманка 3 шарика мороженого",
    "cat": "Креманки",
    "price": 1500,
    "ings": [
      {
        "sid": "s6",
        "qty": 150.0,
        "loss": 10.0
      },
      {
        "rid": "r24",
        "qty": 1.0,
        "loss": 0.0
      },
      {
        "rid": "r25",
        "qty": 0.01,
        "loss": 0.0
      },
      {
        "rid": "r26",
        "qty": 1.0,
        "loss": 0.0
      }
    ]
  }
];

const CAT_COLORS = {
  "Наборы":"#E8A0B4","Букеты":"#2ECC71",
  "Креманки":"#3498DB","Макси стаканы":"#F39C12"
};

const NAV = [
  { id:"dashboard",   icon:"📈", label:"Дашборд",       desc:"Аналитика и финансы" },
  { id:"pos",         icon:"🛒", label:"Касса",          desc:"Продажи и списания" },
  { id:"preorders",   icon:"📅", label:"Предзаказы",     desc:"Управление предзаказами" },
  { id:"production",  icon:"🍓", label:"Производство",  desc:"Сырье → Кухня" },
  { id:"warehouse",   icon:"📦", label:"Склад",          desc:"Закупки и остатки" },
  { id:"inventory",   icon:"📋", label:"Инвентаризация", desc:"Пересчёт остатков" },
  { id:"writeoff",    icon:"🗑️", label:"Списания",       desc:"Коррекционные карты" },
  { id:"expenses",    icon:"💰", label:"Расходы",        desc:"Аренда, зарплата, реклама" },
  { id:"reports",     icon:"📊", label:"Отчеты",         desc:"Cash Flow, P&L" },
  { id:"shifts",      icon:"🕐", label:"Смены",          desc:"Журнал кассовых смен" },
  { id:"settings",    icon:"⚙️", label:"Настройки",      desc:"Техкарты и Маржа" },
];

const fmtM = (n) => Math.round(n||0).toLocaleString("ru-RU") + " ₸";
const fmtS = (n) => Math.round(n||0).toLocaleString("ru-RU") + " ₸";
const fmt  = (n,d=2) => typeof n==="number" ? n.toLocaleString("ru-RU",{minimumFractionDigits:0,maximumFractionDigits:d}) : String(n||0);

const PAY_LABELS = { cash:"💵 Нал", kaspi:"📱 Kaspi", halyk:"🏦 Халык", bck:"🏛️ БЦК", card:"💳 Kaspi", split:"🔀 Сплит" };
const fmtPay = (sale) => {
  if (sale.payMode === "split" && sale.payments) {
    return sale.payments.map(p => (PAY_LABELS[p.method]||p.method) + " " + fmtM(p.amount)).join(" + ");
  }
  return PAY_LABELS[sale.payMode] || sale.payMode || "—";
};

// ─── BEHAVIORAL HELPERS ───────────────────────────────────────────────────────
const parseQtyObj = (qty) => {
  if (typeof qty === "object" && qty !== null) {
    return {
      "Склад": qty["Склад"] || 0,
      "Мастерская": qty["Мастерская"] || 0,
      "Фуд Трак": qty["Фуд Трак"] || 0,
      "Жара": qty["Жара"] || 0,
      "Парк": qty["Парк"] || 0,
    };
  }
  return {
    "Склад": Number(qty) || 0,
    "Мастерская": 0,
    "Фуд Трак": 0,
    "Жара": 0,
    "Парк": 0,
  };
};

const parseSemiQtyObj = (qty) => {
  if (typeof qty === "object" && qty !== null) {
    return {
      "Склад": qty["Склад"] || 0,
      "Мастерская": qty["Мастерская"] || 0,
      "Фуд Трак": qty["Фуд Трак"] || 0,
      "Жара": qty["Жара"] || 0,
      "Парк": qty["Парк"] || 0,
    };
  }
  const val = Number(qty) || 0;
  return {
    "Склад": 0,
    "Мастерская": val,
    "Фуд Трак": val,
    "Жара": val,
    "Парк": val,
  };
};

const getQty = (qtyObj, location) => {
  return parseQtyObj(qtyObj)[location] || 0;
};

const parseLocalDate = (dateStr) => {
  if (!dateStr) return new Date();
  const parts = dateStr.split(".");
  if (parts.length === 3) {
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return new Date(dateStr);
};

const getPackagingItems = (productName) => {
  const p = (productName || "").toLowerCase();
  const items = [];
  
  // 1. Коробки и пакеты для наборов
  if (p.includes("набор")) {
    if (p.includes("8")) items.push({ rawId: "r29", qty: 1 });
    else if (p.includes("10") || p.includes("12")) items.push({ rawId: "r30", qty: 1 });
    else if (p.includes("15")) items.push({ rawId: "r31", qty: 1 });
    else if (p.includes("20")) items.push({ rawId: "r32", qty: 1 });
    else if (p.includes("25")) items.push({ rawId: "r33", qty: 1 });
    else if (p.includes("35")) items.push({ rawId: "r34", qty: 1 });
    else if (p.includes("48")) items.push({ rawId: "r35", qty: 1 });
    else if (p.includes("64")) items.push({ rawId: "r36", qty: 1 });
    
    if (p.includes("8") || p.includes("10") || p.includes("12")) {
      items.push({ rawId: "r19", qty: 1 }); // малый пакет
    } else if (p.includes("15") || p.includes("20") || p.includes("25")) {
      items.push({ rawId: "r20", qty: 1 }); // средний пакет
    } else {
      items.push({ rawId: "r21", qty: 1 }); // большой пакет
    }
    items.push({ rawId: "r17", qty: 1 }); // открытка
    items.push({ rawId: "r18", qty: 1 }); // эмблема/бирка
  }
  
  // 2. Стаканы и креманки
  else if (p.includes("креманка")) {
    items.push({ rawId: "r24", qty: 1 }); // креманка
    items.push({ rawId: "r25", qty: 0.01 }); // вилка (0.01 от упаковки 100 шт)
    items.push({ rawId: "r26", qty: 1 }); // салфетка
  }
  else if (p.includes("макси")) {
    items.push({ rawId: "r28", qty: 1 }); // макси стакан
    items.push({ rawId: "r25", qty: 0.01 }); // вилка
    items.push({ rawId: "r26", qty: 1 }); // салфетка
  }
  
  // 3. Букеты
  else if (p.includes("букет")) {
    let berries = 15;
    if (p.includes("xxs") || p.includes("9")) berries = 9;
    else if (p.includes("xs") || p.includes("15")) berries = 15;
    else if (p.includes("s+") || p.includes("22") || p.includes("23") || p.includes("24") || p.includes("25")) berries = 24;
    else if (p.includes("s") || p.includes("17") || p.includes("18") || p.includes("19")) berries = 18;
    else if (p.includes("m+") || p.includes("43") || p.includes("44") || p.includes("45")) berries = 44;
    else if (p.includes("m") || p.includes("33") || p.includes("34") || p.includes("35") || p.includes("36")) berries = 35;
    else if (p.includes("l+") || p.includes("68") || p.includes("69") || p.includes("70")) berries = 69;
    else if (p.includes("l") || p.includes("56") || p.includes("57") || p.includes("58") || p.includes("59") || p.includes("60")) berries = 58;
    else if (p.includes("xl") || p.includes("87") || p.includes("88") || p.includes("89") || p.includes("90")) berries = 89;
    
    items.push({ rawId: "r13", qty: berries / 70 }); // шпажки (упаковки по 70 шт)
    items.push({ rawId: "r10", qty: 0.02 }); // лента 1см (0.02 рулона = 1 метр)
    items.push({ rawId: "r12", qty: 2 }); // тишью
    items.push({ rawId: "r15", qty: 2 }); // упак бумага
    items.push({ rawId: "r14", qty: 1 }); // слюда
    items.push({ rawId: "r17", qty: 1 }); // открытка
    items.push({ rawId: "r18", qty: 1 }); // эмблема/бирка
    
    if (berries <= 15) items.push({ rawId: "r19", qty: 1 });
    else if (berries <= 25) items.push({ rawId: "r20", qty: 1 });
    else items.push({ rawId: "r21", qty: 1 });
  }
  
  return items;
};

const calcCost = (ings, semiStock, rawStock) =>
  (ings||[]).reduce((sum,ing)=>{
    if (ing.rid) {
      const raw = (rawStock||[]).find(r=>r.id===ing.rid);
      return sum + (ing.qty*(1+(ing.loss||0)/100))*(raw?.price||0);
    } else {
      const semi = (semiStock||[]).find(s=>s.id===ing.sid);
      if(!semi) return sum;
      const raw  = (rawStock||[]).find(r=>r.id===semi.rawId);
      return sum + (ing.qty*(1+(ing.loss||0)/100))*(raw?.price||0);
    }
  },0);

const calcProductCOGS = (item, semiStock, rawStock) => {
  if (!item) return 0;
  const kitchenCost = calcCost(item.ings, semiStock, rawStock);
  const packaging = getPackagingItems(item.product || "");
  const pkgCost = (packaging||[]).reduce((sum, pkg) => {
    const raw = (rawStock||[]).find(r => r.id === pkg.rawId);
    return sum + pkg.qty * (raw?.price || 0);
  }, 0);
  return kitchenCost + pkgCost;
};

const calcCartItemCOGS = (item, semiStock, rawStock) => {
  const baseCOGS = calcProductCOGS(item, semiStock, rawStock);
  const vanillaPrice = rawStock.find(r=>r.id==="r6")?.price || 0;
  const chocolateIcePrice = rawStock.find(r=>r.id==="r37")?.price || 0;
  const milkChocPrice = rawStock.find(r=>r.id==="r2")?.price || 0;
  
  const vanillaCost = (item.extras?.s6 || 0) * 50 * vanillaPrice;
  const chocIceCost = (item.extras?.s7 || 0) * 50 * chocolateIcePrice;
  const milkChocCost = (item.extras?.s2 || 0) * 15 * milkChocPrice;
  
  return baseCOGS + vanillaCost + chocIceCost + milkChocCost;
};

// eslint-disable-next-line no-unused-vars
const getIngName = (ing, semiStock, rawStock) => {
  if (!ing) return "Неизвестный ингредиент";
  if (ing.rid) {
    const raw = (rawStock||[]).find(r => r.id === ing.rid);
    return raw ? `${raw.name} [Сырьё]` : "Неизвестное сырьё";
  }
  const semi = (semiStock||[]).find(s => s.id === ing.sid);
  return semi ? `${semi.name} [ПФ]` : "Неизвестный ПФ";
};

// eslint-disable-next-line no-unused-vars
const getIngUnit = (ing, semiStock, rawStock) => {
  if (!ing) return "";
  if (ing.rid) {
    const raw = (rawStock||[]).find(r => r.id === ing.rid);
    return raw ? raw.unit : "";
  }
  const semi = (semiStock||[]).find(s => s.id === ing.sid);
  return semi ? semi.unit : "";
};

const restoreStockForSale = (sale, rawStock, semiStock, techCards) => {
  const newSemi = [...semiStock];
  const newRaw = [...rawStock];
  const selPoint = sale.point;
  
  for (const item of sale.items || []) {
    const tc = techCards.find(t => t.product === item.name);
    if (tc) {
      for (const ing of tc.ings || []) {
        const spend = ing.qty * item.qty * (1 + (ing.loss || 0)/100);
        if (ing.rid) {
          const idx = newRaw.findIndex(r => r.id === ing.rid);
          if (idx >= 0) {
            const q = parseQtyObj(newRaw[idx].qty);
            q[selPoint] = Math.round((q[selPoint] + spend) * 1000) / 1000;
            newRaw[idx] = { ...newRaw[idx], qty: q };
          }
        } else {
          const idx = newSemi.findIndex(s => s.id === ing.sid);
          if (idx >= 0) {
            const q = parseSemiQtyObj(newSemi[idx].qty);
            q[selPoint] = Math.round((q[selPoint] + spend) * 1000) / 1000;
            newSemi[idx] = { ...newSemi[idx], qty: q };
          }
        }
      }
    }
    
    // Restore packaging
    const packaging = getPackagingItems(item.name);
    for (const pkg of packaging) {
      const idx = newRaw.findIndex(r => r.id === pkg.rawId);
      if (idx >= 0) {
        const q = parseQtyObj(newRaw[idx].qty);
        q[selPoint] = Math.round((q[selPoint] + pkg.qty * item.qty) * 1000) / 1000;
        newRaw[idx] = { ...newRaw[idx], qty: q };
      }
    }
    
    // Restore extras
    if (item.extras) {
      if (item.extras.s6 > 0) {
        const idx = newSemi.findIndex(s => s.id === "s6");
        if (idx >= 0) {
          const q = parseSemiQtyObj(newSemi[idx].qty);
          q[selPoint] = Math.round((q[selPoint] + item.extras.s6 * 50 * item.qty) * 1000) / 1000;
          newSemi[idx] = { ...newSemi[idx], qty: q };
        }
      }
      if (item.extras.s7 > 0) {
        const idx = newSemi.findIndex(s => s.id === "s7");
        if (idx >= 0) {
          const q = parseSemiQtyObj(newSemi[idx].qty);
          q[selPoint] = Math.round((q[selPoint] + item.extras.s7 * 50 * item.qty) * 1000) / 1000;
          newSemi[idx] = { ...newSemi[idx], qty: q };
        }
      }
      if (item.extras.s2 > 0) {
        const idx = newSemi.findIndex(s => s.id === "s2");
        if (idx >= 0) {
          const q = parseSemiQtyObj(newSemi[idx].qty);
          q[selPoint] = Math.round((q[selPoint] + item.extras.s2 * 15 * item.qty) * 1000) / 1000;
          newSemi[idx] = { ...newSemi[idx], qty: q };
        }
      }
    }
  }
  
  return { newRaw, newSemi };
};

// ─── TOAST ───────────────────────────────────────────────────────────────────
// React.memo: Toast перерендерится только при изменении toast-объекта
const Toast = React.memo(function Toast({toast}){
  if(!toast) return null;
  return <div style={{position:"fixed",top:20,right:20,zIndex:9999,background:toast.err?C.red:C.green,color:"#fff",padding:"12px 22px",borderRadius:12,fontWeight:700,fontSize:14,boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>
    {toast.err?"✕ ":"✓ "}{toast.msg}
  </div>;
});

function useToast(){
  const [toast,setToast]=useState(null);
  const show=(msg,err=false)=>{setToast({msg,err});setTimeout(()=>setToast(null),3000);};
  return [toast,show];
}

// ─── ДАШБОРД ─────────────────────────────────────────────────────────────────
function Dashboard({isMobile,sales,semiStock,rawStock,expenses,currentUser,onCancelSale,users,setSales,showToast}){
  const [pointFilter, setPointFilter] = useState("Все");
  const [periodFilter, setPeriodFilter] = useState("За все время");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selPoint, setSelPoint] = useState(POINTS[0]);

  const now = new Date();
  const todayStr = now.toLocaleDateString("ru-RU");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("ru-RU");

  const filteredSales = sales.filter(s => {
    if (pointFilter !== "Все" && s.point !== pointFilter) return false;
    
    const sDate = parseLocalDate(s.date);
    if (periodFilter === "Сегодня") {
      return s.date === todayStr;
    } else if (periodFilter === "Вчера") {
      return s.date === yesterdayStr;
    } else if (periodFilter === "Неделя") {
      const diffTime = Math.abs(now - sDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    } else if (periodFilter === "Месяц") {
      return sDate.getMonth() === now.getMonth() && sDate.getFullYear() === now.getFullYear();
    } else if (periodFilter === "Свой период") {
      if (customStart) {
        const cs = new Date(customStart);
        cs.setHours(0,0,0,0);
        if (sDate < cs) return false;
      }
      if (customEnd) {
        const ce = new Date(customEnd);
        ce.setHours(23,59,59,999);
        if (sDate > ce) return false;
      }
    }
    return true;
  });

  const totalRev  = filteredSales.reduce((s,i)=>s+i.total,0);
  const totalCOGS = filteredSales.reduce((s,i)=>s+(i.cogs||0),0);

  // Фильтруем расходы по тому же периоду, что и продажи
  const filteredExpenses = (expenses||[]).filter(e => {
    if (!e.paid) return false;
    // Исключаем внесения и сейф — это не операционные расходы
    if (e.cat === "deposit" || e.cat === "safe") return false;
    // Фильтр по точке
    if (pointFilter !== "Все" && e.point !== pointFilter && e.point !== "Вся компания") return false;
    // Фильтр по периоду
    const eDate = parseLocalDate(e.date);
    if (periodFilter === "Сегодня") {
      return e.date === todayStr;
    } else if (periodFilter === "Вчера") {
      return e.date === yesterdayStr;
    } else if (periodFilter === "Неделя") {
      const diffTime = Math.abs(now - eDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    } else if (periodFilter === "Месяц") {
      return eDate.getMonth() === now.getMonth() && eDate.getFullYear() === now.getFullYear();
    } else if (periodFilter === "Свой период") {
      if (customStart) {
        const cs = new Date(customStart);
        cs.setHours(0,0,0,0);
        if (eDate < cs) return false;
      }
      if (customEnd) {
        const ce = new Date(customEnd);
        ce.setHours(23,59,59,999);
        if (eDate > ce) return false;
      }
    }
    return true;
  });

  // Если выбрана конкретная точка, расходы "Вся компания" делим пропорционально на кол-во точек
  const activePointsCount = POINTS.length;
  const totalExp = filteredExpenses.reduce((s,e) => {
    if (pointFilter !== "Все" && e.point === "Вся компания") {
      return s + e.amount / activePointsCount;
    }
    return s + e.amount;
  }, 0);

  const grossP    = totalRev - totalCOGS;
  const netP      = grossP - totalExp;

  const byPoint = POINTS.map((p,i)=>({
    name:p, color:POINT_COLORS[i],
    rev:filteredSales.filter(s=>s.point===p).reduce((a,s)=>a+s.total,0),
    orders:filteredSales.filter(s=>s.point===p).length,
  }));
  const maxRev = Math.max(...byPoint.map(p=>p.rev),1);

  // Пороги для алертов: для учёта в граммах порог 500г, для штучных товаров — 10 шт
  const lowSemi = semiStock.filter(s=>parseSemiQtyObj(s.qty)[selPoint] < 500);
  const lowRaw  = rawStock.filter(r=>{
    const qty = parseQtyObj(r.qty)[selPoint];
    const threshold = r.unit === "г" ? 500 : 10;
    return qty < threshold;
  });

  const isAdmin = currentUser?.role === "admin";
  const KPI = isAdmin ? [
    {label:"ВЫРУЧКА",        val:fmtS(totalRev),  color:C.accent },
    {label:"РАСХОДЫ",        val:fmtS(totalExp),  color:C.red },
  ] : [
    {label:"ВЫРУЧКА",        val:fmtS(totalRev),  color:C.accent },
    {label:"COGS (себест.)", val:fmtS(totalCOGS), color:C.yellow },
    {label:"ВАЛОВАЯ ПРИБЫЛЬ",val:fmtS(grossP),    color:grossP>=0?C.green:C.red },
    {label:"ЧИСТАЯ ПРИБЫЛЬ", val:fmtS(netP),      color:netP>=0?C.green:C.red },
  ];

  const pendingDeletions = sales.filter(s => s.status === "pending");
  const isOwnerOrDirector = currentUser?.role === "owner" || currentUser?.role === "director";

  return (
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      {/* ЗАПРОСЫ НА УДАЛЕНИЕ */}
      {isOwnerOrDirector && pendingDeletions.length > 0 && (
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.red}`,padding:22,marginBottom:22,boxSizing:"border-box"}}>
          <div style={{fontSize:15,fontWeight:800,color:C.red,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <span>⏳ Запросы на удаление чеков ({pendingDeletions.length})</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {pendingDeletions.map(s => {
              const requestedBy = (users||[]).find(u => u.id === s.delete_requested_by)?.name || "Кассир";
              return (
                <div key={s.no} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.surface,padding:"14px 18px",borderRadius:10,border:`1px solid ${C.border}`,flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>Чек #{s.no} ({s.point})</div>
                    <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                      Сумма: <span style={{fontWeight:700,color:C.accent}}>{fmtM(s.total)}</span> | Инициатор: <b>{requestedBy}</b>
                    </div>
                    <div style={{fontSize:12,color:C.text,marginTop:4}}>Позиции: {s.items?.map(it=>`${it.name} x${it.qty}`).join(", ")}</div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={async () => {
                      if (window.confirm(`Одобрить удаление чека #${s.no}?`)) {
                        await onCancelSale(s.no);
                      }
                    }} style={{background:C.green,color:"#000",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:700,cursor:"pointer",fontSize:13}}>Одобрить</button>
                    <button onClick={async () => {
                      if (window.confirm(`Отклонить удаление чека #${s.no}?`)) {
                        setSales(prev => prev.map(x => x.id === s.id ? { ...x, status: "active", delete_requested_by: null } : x));
                        showToast("Запрос на удаление отклонен.");
                      }
                    }} style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:13}}>Отклонить</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ФИЛЬТРЫ */}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",background:C.surface,padding:14,borderRadius:12,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <span style={{fontSize:11,color:C.muted}}>ТОЧКА ПРОДАЖ</span>
          <select value={pointFilter} onChange={e=>setPointFilter(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13}}>
            <option>Все</option>
            {POINTS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <span style={{fontSize:11,color:C.muted}}>ВРЕМЕННОЙ ПЕРИОД</span>
          <select value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13}}>
            <option>За все время</option>
            <option>Сегодня</option>
            <option>Вчера</option>
            <option>Неделя</option>
            <option>Месяц</option>
            <option>Свой период</option>
          </select>
          {periodFilter === "Свой период" && (
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12,width:"50%"}} />
              <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12,width:"50%"}} />
            </div>
          )}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:22}}>
        {KPI.map((k,i)=>(
          <div key={i} style={{background:C.card,borderRadius:14,padding:"18px 20px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>{k.label}</div>
            <div style={{fontSize:26,fontWeight:900,color:k.color}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,marginBottom:16}}>
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>Выручка по точкам ({periodFilter})</div>
          {byPoint.map((p,i)=>(
            <div key={i} style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:4,background:p.color}}/>
                  <span style={{fontWeight:600,fontSize:13}}>{p.name}</span>
                  <span style={{fontSize:11,color:C.muted}}>{p.orders} чеков</span>
                </div>
                <span style={{fontWeight:800,color:p.color}}>{fmtS(p.rev)}</span>
              </div>
              <div style={{height:5,background:C.dimmed,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:5,width:`${Math.round(p.rev/maxRev*100)}%`,background:p.color,borderRadius:3}}/>
              </div>
            </div>
          ))}
        </div>

        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700}}>🔔 Алерты по точке</div>
            <select value={selPoint} onChange={e=>setSelPoint(e.target.value)} style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",outline:"none",fontSize:12}}>
              {POINTS.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
          {lowSemi.length===0&&lowRaw.length===0
            ? <div style={{color:C.green,fontSize:13}}>✓ Всё в порядке</div>
            : null}
          {lowSemi.map((s,i)=><div key={i} style={{padding:"10px 12px",borderRadius:10,background:C.yellowSoft,color:C.yellow,marginBottom:8,fontSize:13}}>⚠ Мало на кухне: <b>{s.name}</b> — {fmt(parseSemiQtyObj(s.qty)[selPoint])} {s.unit}</div>)}
          {lowRaw.map((r,i)=><div key={i} style={{padding:"10px 12px",borderRadius:10,background:C.redSoft,color:C.red,marginBottom:8,fontSize:13}}>🔴 Критически: <b>{r.name}</b> — {fmt(parseQtyObj(r.qty)[selPoint])} {r.unit}</div>)}
        </div>
      </div>

      {filteredSales.length>0&&(
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,boxSizing:"border-box"}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Последние продажи</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:600}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Чек","Точка","Позиции","Оплата",!isAdmin && "COGS","Сумма","Дата / Время",""].filter(Boolean).map((h,i)=>
                    <th key={i} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...filteredSales].reverse().slice(0,10).map((s,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}40`}}>
                    <td style={{padding:"10px 12px",color:C.muted}}>#{s.no}</td>
                    <td style={{padding:"10px 12px"}}>{s.point}</td>
                    <td style={{padding:"10px 12px",color:C.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.items?.map(x=>x.name).join(", ")}</td>
                    <td style={{padding:"10px 12px"}}>{fmtPay(s)}</td>
                    {!isAdmin && <td style={{padding:"10px 12px",color:C.yellow}}>{fmtM(s.cogs||0)}</td>}
                    <td style={{padding:"10px 12px",fontWeight:800,color:C.accent}}>{fmtM(s.total)}</td>
                    <td style={{padding:"10px 12px",color:C.muted}}>{s.date ? `${s.date} ${s.time}` : s.time}</td>
                    <td style={{padding:"10px 12px"}}>
                      {currentUser?.role === "owner" && (
                        <button onClick={() => {
                          if (window.confirm(`Аннулировать продажу #${s.no} на сумму ${fmtM(s.total)}?`)) {
                            onCancelSale(s.no);
                          }
                        }} style={{background:C.red + "1a",color:C.red,border:`1px solid ${C.red}40`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                          Аннулировать
                        </button>
                      )}
                    </td>
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

// ─── КАССА ───────────────────────────────────────────────────────────────────
function POS({isMobile,semiStock,setSemiStock,rawStock,setRawStock,sales,setSales,currentUser,techCards,currentShift,onCloseShift,onCancelSale,customers,preorders,setPreorders,setCustomers}){
  const [cart,setCart]          = useState(() => LS("vb_pos_cart", []));
  const [phoneSearch, setPhoneSearch] = useState("");
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(null);
  const [payMode,setPayMode]    = useState(null);
  const [cashInput,setCashInput] = useState("");
  const [selPoint,setSelPoint]  = useState(currentUser.point||POINTS[0]);
  const [discount,setDiscount]  = useState(0);
  const [done,setDone]          = useState(false);
  const [lastReceipt,setLast]   = useState(null);
  const [catFilter,setCatFilter] = useState("Все");
  const [search,setSearch]      = useState("");
  const [posTab,setPosTab]          = useState("products");
  const [toast,showToast]           = useToast();
  const [splitMode,setSplitMode]    = useState(false);
  const [payments,setPayments]      = useState([]);

  const [showPreorderModal, setShowPreorderModal] = useState(false);
  const [preorderDate, setPreorderDate] = useState("");
  const [preorderTime, setPreorderTime] = useState("");
  const [preorderClientName, setPreorderClientName] = useState("");
  const [preorderClientPhone, setPreorderClientPhone] = useState("");
  const [preorderPrepayment, setPreorderPrepayment] = useState("");
  const [preorderPayMode, setPreorderPayMode] = useState("cash");
  const [preorderNotes, setPreorderNotes] = useState("");

  // Сохраняем корзину в localStorage, чтобы она пережила авто-перезагрузку при обновлении приложения
  useEffect(() => {
    if (done) {
      // После оплаты корзина очищается
      localStorage.removeItem("vb_pos_cart");
    } else {
      localStorage.setItem("vb_pos_cart", JSON.stringify(cart));
    }
  }, [cart, done]);

  useEffect(() => {
    if (showPreorderModal) {
      if (loyaltyCustomer) {
        setPreorderClientPhone(loyaltyCustomer.phone);
        setPreorderClientName(loyaltyCustomer.name);
      } else if (phoneSearch) {
        setPreorderClientPhone(phoneSearch);
      }
    }
  }, [showPreorderModal, loyaltyCustomer, phoneSearch]);
  const [showCloseShift,setShowCloseShift] = useState(false);
  const [actualCashInput,setActualCashInput] = useState("");

  // useMemo: пересчитываем только при изменении techCards, catFilter, search или точки
  const displayCards = useMemo(() => techCards.map(t =>
    t.cat === "Макси стаканы" ? { ...t, cat: "Креманки" } : t
  ), [techCards]);

  const isRestrictedPoint = ["Парк", "Фуд Трак", "Жара"].includes(currentUser?.point);
  const isRestrictedCashier = currentUser?.role === "cashier" && isRestrictedPoint;

  const finalCards = useMemo(() => displayCards.filter(t => {
    if (isRestrictedCashier && (t.cat === "Наборы" || t.cat === "Букеты")) return false;
    return true;
  }), [displayCards, isRestrictedCashier]);

  const cats = useMemo(() => ["Все",...new Set(finalCards.map(t=>t.cat))], [finalCards]);

  const filtered = useMemo(() => finalCards.filter(t =>
    (catFilter==="Все"||t.cat===catFilter)&&
    (search===""||t.product.toLowerCase().includes(search.toLowerCase()))
  ), [finalCards, catFilter, search]);

  // useCallback: стабильные ссылки — не создают новые объекты при каждом рендере
  const addToCart = useCallback((tc) =>
    setCart(p => {
      if (p.find(i => i.id === tc.id)) {
        return p.map(i => i.id === tc.id ? {...i, qty: i.qty+1} : i);
      } else {
        const isKremanok = tc.product && tc.product.toLowerCase().includes("креманка");
        const is3Scoops = isKremanok && tc.product.toLowerCase().includes("3 шар");
        const initialIceCream = is3Scoops ? ["s6", "s6", "s6"] : (isKremanok ? ["s6"] : []);
        return [...p, {...tc, qty:1, extras:{s6:0,s7:0,s2:0}, baseIceCream: initialIceCream}];
      }
    }), []);

  const chgQty = useCallback((id, d) =>
    setCart(p => p.map(i => i.id===id ? {...i, qty:Math.max(0,i.qty+d)} : i).filter(i => i.qty > 0))
  , []);

  const subtotal = useMemo(() => cart.reduce((s,i) => {
    const extrasCost = ((i.extras?.s6 || 0) + (i.extras?.s7 || 0) + (i.extras?.s2 || 0)) * 500;
    return s + (i.price + extrasCost) * i.qty;
  }, 0), [cart]);
  const discAmt  = Math.round(subtotal*discount/100);
  const total    = subtotal - discAmt;
  const cashGiven= parseInt(cashInput.replace(/\D/g,""))||0;

  const handleCreatePreorder = () => {
    if (!preorderDate) { showToast("Выберите дату выдачи", true); return; }
    if (!preorderTime) { showToast("Укажите время выдачи", true); return; }
    if (!preorderClientPhone) { showToast("Укажите телефон клиента", true); return; }

    const phoneClean = preorderClientPhone.replace(/\D/g,"");
    if (phoneClean.length < 10) { showToast("Некорректный номер телефона", true); return; }

    // Register customer if new
    const existing = (customers || []).find(c => c.phone === phoneClean);
    let customerId = existing ? existing.id : null;
    if (!existing) {
      customerId = generateUUID();
      const newCust = {
        id: customerId,
        name: preorderClientName || `Клиент ${phoneClean}`,
        phone: phoneClean,
        discount_percent: 0,
        created_at: new Date().toISOString()
      };
      if (typeof setCustomers === "function") {
        setCustomers(prev => [...prev, newCust]);
      }
    }

    const prepayAmt = parseInt(preorderPrepayment) || 0;
    if (prepayAmt > total) { showToast("Предоплата не может превышать сумму заказа", true); return; }

    const newPreorder = {
      id: generateUUID(),
      point: "Мастерская", // Locked to Мастерская ("только в мастерской")
      customer_id: customerId,
      customer_name: preorderClientName || (existing ? existing.name : `Клиент ${phoneClean}`),
      customer_phone: phoneClean,
      items: cart.map(i=>({name:i.product,qty:i.qty,price:i.price,extras:i.extras})),
      subtotal: subtotal,
      discount: discount,
      disc_amt: discAmt,
      total: total,
      prepayment: prepayAmt,
      prepayment_method: prepayAmt > 0 ? preorderPayMode : null,
      prepayment_shift_id: prepayAmt > 0 ? (currentShift?.id || null) : null,
      target_date: preorderDate,
      target_time: preorderTime,
      status: "pending",
      notes: preorderNotes,
      created_by: currentUser?.id || null,
      created_at: new Date().toISOString(),
      completed_shift_id: null,
      completed_at: null,
      remaining_payment: 0,
      remaining_method: null
    };

    setPreorders(prev => [newPreorder, ...prev]);
    showToast("Предзаказ успешно оформлен!");
    setCart([]);
    setShowPreorderModal(false);
    
    // Reset fields
    setPreorderDate("");
    setPreorderTime("");
    setPreorderClientName("");
    setPreorderClientPhone("");
    setPreorderPrepayment("");
    setPreorderNotes("");
  };

  const handlePay=()=>{
    // Валидация
    if (splitMode) {
      const splitTotal = payments.reduce((s,p)=>s+p.amount,0);
      if (splitTotal !== total) { showToast("Сумма платежей не совпадает с итого",true); return; }
    } else {
      if (!payMode) { showToast("Выберите способ оплаты",true); return; }
      if (payMode==="cash" && cashGiven<total) { showToast("Недостаточно наличных",true); return; }
    }

    const newSemi=[...semiStock];
    const newRaw=[...rawStock];
    
    // 1. Списываем полуфабрикаты/сырье с кухни/склада точки
    for(const item of cart){
      for(const ing of item.ings){
        const totalSpend = ing.qty * item.qty * (1 + (ing.loss||0)/100);
        
        if (ing.sid === "s6" && Array.isArray(item.baseIceCream) && item.baseIceCream.length > 0) {
          // Разбиваем вес на количество выбранных шариков
          const scoopSpend = totalSpend / item.baseIceCream.length;
          item.baseIceCream.forEach(scoopSid => {
            const idx = newSemi.findIndex(s=>s.id===scoopSid);
            if(idx>=0) {
              const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
              qtyObj[selPoint] = Math.round((qtyObj[selPoint] - scoopSpend)*1000)/1000;
              newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
            }
          });
        } else if (ing.rid) {
          const idx = newRaw.findIndex(r=>r.id===ing.rid);
          if(idx>=0) {
            const qtyObj = parseQtyObj(newRaw[idx].qty);
            qtyObj[selPoint] = Math.round((qtyObj[selPoint] - totalSpend)*1000)/1000;
            newRaw[idx] = { ...newRaw[idx], qty: qtyObj };
          }
        } else {
          const idx = newSemi.findIndex(s=>s.id===ing.sid);
          if(idx>=0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[selPoint] = Math.round((qtyObj[selPoint] - totalSpend)*1000)/1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
      }
      
      // 2. Списываем коробки, стаканчики, ленты, шпажки со склада точки
      const packaging = getPackagingItems(item.product);
      for(const pkg of packaging){
        const idx = newRaw.findIndex(r=>r.id===pkg.rawId);
        if(idx>=0) {
          const qtyObj = parseQtyObj(newRaw[idx].qty);
          qtyObj[selPoint] = Math.round((qtyObj[selPoint] - pkg.qty * item.qty)*1000)/1000;
          newRaw[idx] = { ...newRaw[idx], qty: qtyObj };
        }
      }

      // 3. Списываем добавки (extras) с кухни/склада точки
      if (item.extras) {
        if (item.extras.s6 > 0) {
          const idx = newSemi.findIndex(s=>s.id==="s6");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[selPoint] = Math.round((qtyObj[selPoint] - item.extras.s6 * 50 * item.qty)*1000)/1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
        if (item.extras.s7 > 0) {
          const idx = newSemi.findIndex(s=>s.id==="s7");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[selPoint] = Math.round((qtyObj[selPoint] - item.extras.s7 * 50 * item.qty)*1000)/1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
        if (item.extras.s2 > 0) {
          const idx = newSemi.findIndex(s=>s.id==="s2");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[selPoint] = Math.round((qtyObj[selPoint] - item.extras.s2 * 15 * item.qty)*1000)/1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
      }
    }
    setSemiStock(newSemi);
    setRawStock(newRaw);

    const cogs = cart.reduce((s,i)=>s + calcCartItemCOGS(i, semiStock, rawStock) * i.qty, 0);
    
    // Формируем массив платежей
    const receiptPayments = splitMode
      ? payments
      : [{ method: payMode, amount: total }];
    const effectivePayMode = splitMode ? "split" : payMode;
    const cashPayment = receiptPayments.find(p=>p.method==="cash");
    const effectiveCashGiven = cashPayment ? cashGiven : 0;
    const effectiveChange = (payMode==="cash" && !splitMode) ? cashGiven-total : 0;

    const receipt={
      id: generateUUID(),
      no:1001+sales.length, point:selPoint,
      items:cart.map(i=>{
        let finalName = i.product;
        if (Array.isArray(i.baseIceCream) && i.baseIceCream.length > 0) {
          const flavors = i.baseIceCream.map(s => s === "s7" ? "Шок." : "Слив.").join("/");
          finalName += ` (${flavors})`;
        }
        return { name: finalName, qty: i.qty, price: i.price, extras: i.extras };
      }),
      total, subtotal, discAmt, discount, cogs,
      payMode: effectivePayMode,
      payments: receiptPayments,
      cashGiven: effectiveCashGiven,
      change: effectiveChange,
      shift_id: currentShift?.id || null,
      date: new Date().toLocaleDateString("ru-RU"),
      time: new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),
    };
    setSales(p=>[...p,receipt]);
    setLast(receipt);
    setDone(true);
    setPosTab("cart"); // Показываем чек
  };

  const newSale=()=>{
    setCart([]);
    setPayMode(null);
    setCashInput("");
    setDiscount(0);
    setDone(false);
    setLast(null);
    setSplitMode(false);
    setPayments([]);
    setPosTab("products");
    setPhoneSearch("");
    setLoyaltyCustomer(null);
  };

  const renderOrders = () => {
    const todayStr = new Date().toLocaleDateString("ru-RU");
    const todaySales = sales.filter(s => s.point === selPoint && s.date === todayStr);
    
    return (
      <div style={{flex:1,padding:20,overflowY:"auto",boxSizing:"border-box",height:"100%",maxHeight:"100vh"}}>
        <h3 style={{marginTop:0,marginBottom:16}}>Заказы за сегодня ({selPoint})</h3>
        {todaySales.length === 0 ? (
          <div style={{color:C.muted,textAlign:"center",padding:40,fontSize:13}}>Сегодня заказов ещё не было</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {todaySales.map((s, idx) => (
              <div key={idx} style={{background:C.card,borderRadius:12,padding:16,border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontWeight:700,color:C.accent}}>Чек #{s.no}</span>
                  <span style={{color:C.muted,fontSize:12}}>{s.time}</span>
                </div>
                <div style={{fontSize:13,color:C.text,marginBottom:8}}>
                  {s.items?.map(it => `${it.name} x${it.qty}`).join(", ")}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${C.border}60`,paddingTop:8,flexWrap:"wrap",gap:8}}>
                  <span style={{fontSize:12,color:C.muted}}>Тип: {s.payMode === "cash" ? "💵 Наличные" : "💳 Kaspi"}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontWeight:900,color:C.green,fontSize:15,marginRight:8}}>{fmtM(s.total)}</span>
                    {s.status === "pending" ? (
                      <span style={{color:C.yellow,fontSize:11,fontWeight:700,background:C.yellowSoft,padding:"4px 8px",borderRadius:6}}>⏳ Ожидает удаления</span>
                    ) : (
                      currentUser?.role === "owner" || currentUser?.role === "director" ? (
                        <button onClick={() => {
                          if (window.confirm(`Аннулировать продажу #${s.no} на сумму ${fmtM(s.total)}?`)) {
                            onCancelSale(s.no);
                          }
                        }} style={{background:C.red + "1a",color:C.red,border:`1px solid ${C.red}40`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                          Аннулировать
                        </button>
                      ) : (
                        <button onClick={async () => {
                          const reason = window.prompt("Укажите причину удаления чека:");
                          if (reason) {
                            try {
                              setSales(prev => prev.map(x => x.id === s.id ? { ...x, status: "pending", delete_requested_by: currentUser.id } : x));
                              showToast("Запрос на удаление отправлен владельцу.");
                            } catch (e) {
                              showToast("Ошибка при отправке запроса", true);
                            }
                          }
                        }} style={{background:C.red + "1a",color:C.red,border:`1px solid ${C.red}40`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                          Запросить удаление
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderProducts = () => (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        {(currentUser.role==="owner"||currentUser.role==="director")&&(
          <select value={selPoint} onChange={e=>setSelPoint(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",outline:"none",fontSize:13}}>
            {POINTS.map(p=><option key={p}>{p}</option>)}
          </select>
        )}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск..." style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13,width:180,flexGrow:1}}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,width:"100%"}}>
          {cats.map(c=>(
            <button key={c} onClick={()=>setCatFilter(c)} style={{padding:"7px 14px",borderRadius:20,border:"none",background:catFilter===c?(CAT_COLORS[c]||C.accent):C.card,color:catFilter===c?"#000":C.muted,fontWeight:catFilter===c?700:400,cursor:"pointer",fontSize:13,whiteSpace:"nowrap"}}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:14,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,alignContent:"start"}}>
        {filtered.map(tc=>{
          const inCart=cart.find(i=>i.id===tc.id);
          const color=CAT_COLORS[tc.cat]||C.accent;
          const cost=calcProductCOGS(tc, semiStock, rawStock);
          const margin=cost>0?Math.round((tc.price-cost)/tc.price*100):0;
          return(
            <button key={tc.id} onClick={()=>addToCart(tc)} style={{background:inCart?`${color}18`:C.card,border:`1.5px solid ${inCart?color:C.border}`,borderRadius:12,padding:"14px 12px",cursor:"pointer",textAlign:"left",color:C.text,position:"relative",transition:"all .15s"}}>
              {inCart&&<div style={{position:"absolute",top:8,right:8,background:color,color:"#000",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900}}>{inCart.qty}</div>}
              <div style={{fontSize:12,fontWeight:600,marginBottom:6,lineHeight:1.3}}>{tc.product}</div>
              <div style={{fontSize:16,fontWeight:900,color}}>{fmtM(tc.price)}</div>
              <div style={{fontSize:10,color:margin>50?C.green:margin>30?C.yellow:C.red,marginTop:4}}>Маржа {margin}%</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderCart = () => (
    <div style={{width:isMobile?"100%":340,background:C.surface,display:"flex",flexDirection:"column",borderLeft:isMobile?"none":`1px solid ${C.border}`,height:"100%",overflowY:isMobile?"auto":"hidden"}}>
      <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontWeight:700,fontSize:15}}>Корзина ({selPoint})</span>
        {cart.length>0&&<button onClick={()=>setCart([])} style={{background:C.redSoft,color:C.red,border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>Очистить</button>}
      </div>

      <div style={{flex:isMobile?"none":1,overflowY:isMobile?"visible":"auto",padding:10}}>
        {cart.length===0
          ? <div style={{textAlign:"center",color:C.muted,marginTop:40,fontSize:13}}>🍓 Выберите товар</div>
          : cart.map(item=>{
            const color=CAT_COLORS[item.cat]||C.accent;
            return(
              <div key={item.id} style={{background:C.card,borderRadius:10,padding:"12px",border:`1px solid ${C.border}`,marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>{item.product}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button onClick={()=>chgQty(item.id,-1)} style={{width:28,height:28,background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:16}}>−</button>
                    <span style={{fontWeight:800,width:24,textAlign:"center"}}>{item.qty}</span>
                    <button onClick={()=>chgQty(item.id,1)} style={{width:28,height:28,background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:16}}>+</button>
                  </div>
                  <span
                    onClick={() => {
                      const newPriceStr = prompt(`Введите новую цену для ${item.product}:`, item.price);
                      if (newPriceStr !== null) {
                        const newP = parseInt(newPriceStr.replace(/\D/g, ""));
                        if (!isNaN(newP) && newP >= 0) {
                          setCart(prev => prev.map(i => i.id === item.id ? { ...i, price: newP } : i));
                        }
                      }
                    }}
                    style={{fontWeight:900,color,fontSize:15,cursor:"pointer",textDecoration:"underline dashed"}}
                    title="Кликните для изменения цены"
                  >
                    {fmtM((item.price + ((item.extras?.s6 || 0) + (item.extras?.s7 || 0) + (item.extras?.s2 || 0)) * 500) * item.qty)}
                  </span>
                </div>
                
                {/* Выбор базы для креманок */}
                {Array.isArray(item.baseIceCream) && item.baseIceCream.length > 0 && (
                  <div style={{marginTop: 8, display:"flex", flexDirection:"column", gap:10}}>
                    <div>
                      <div style={{fontSize: 10, color: C.muted, marginBottom: 4, fontWeight:700}}>ШАРИКИ МОРОЖЕНОГО (ПО 50Г)</div>
                      {item.baseIceCream.map((scoop, sIdx) => (
                        <div key={sIdx} style={{display: "flex", gap: 6, marginBottom: 4}}>
                          <button
                            onClick={() => setCart(prev => prev.map(i => i.id === item.id ? { ...i, baseIceCream: i.baseIceCream.map((sc, index) => index === sIdx ? "s6" : sc) } : i))}
                            style={{flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${scoop === "s6" ? C.accent : C.border}`, background: scoop === "s6" ? C.accentSoft : "transparent", color: scoop === "s6" ? C.accent : C.muted, fontSize: 11, cursor: "pointer", fontWeight: 700}}
                          >
                            🍦 Слив.
                          </button>
                          <button
                            onClick={() => setCart(prev => prev.map(i => i.id === item.id ? { ...i, baseIceCream: i.baseIceCream.map((sc, index) => index === sIdx ? "s7" : sc) } : i))}
                            style={{flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${scoop === "s7" ? C.accent : C.border}`, background: scoop === "s7" ? C.accentSoft : "transparent", color: scoop === "s7" ? C.accent : C.muted, fontSize: 11, cursor: "pointer", fontWeight: 700}}
                          >
                            🍦 Шок.
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Добавки (Extras) */}
                {!(item.cat === "Наборы" || item.cat === "Букеты") && (
                  <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                    {[
                      { key: "s6", label: "🍦 Слив. 50г", price: 500 },
                      { key: "s7", label: "🍦 Шок. 50г", price: 500 },
                      { key: "s2", label: "🍫 Шок. 15г", price: 500 }
                    ].map(ext => {
                      const active = (item.extras?.[ext.key] || 0) > 0;
                      return (
                        <button
                          key={ext.key}
                          type="button"
                          onClick={() => {
                            setCart(prev => prev.map(i => {
                              if (i.id !== item.id) return i;
                              const ex = { s6: 0, s7: 0, s2: 0, ...i.extras };
                              ex[ext.key] = ex[ext.key] ? 0 : 1;
                              return { ...i, extras: ex };
                            }));
                          }}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: `1px solid ${active ? C.accent : C.border}`,
                            background: active ? C.accentSoft : "transparent",
                            color: active ? C.accent : C.muted,
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          {ext.label} (+{ext.price} ₸)
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        }
      </div>

      {cart.length>0&&!done&&(
        <div style={{padding:"14px 16px",borderTop:`1px solid ${C.border}`}}>
          {/* ПОИСК КЛИЕНТА ДЛЯ ЛОЯЛЬНОСТИ */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>КЛИЕНТ (ПОИСК ПО ТЕЛЕФОНУ)</div>
            <div style={{display:"flex",gap:6}}>
              <input
                value={phoneSearch}
                onChange={e => {
                  const val = e.target.value.replace(/[^0-9+]/g, "");
                  setPhoneSearch(val);
                  const found = (customers || []).find(c => c.phone === val);
                  if (found) {
                    setLoyaltyCustomer(found);
                    setDiscount(found.discount_percent);
                    showToast(`Применена скидка клиента ${found.name}: ${found.discount_percent}%`);
                  } else {
                    setLoyaltyCustomer(null);
                    setDiscount(0);
                  }
                }}
                placeholder="87011234567"
                style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,outline:"none",width:"100%",boxSizing:"border-box",flex:1,padding:"6px 10px"}}
              />
              {loyaltyCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    setPhoneSearch("");
                    setLoyaltyCustomer(null);
                    setDiscount(0);
                  }}
                  style={{background:C.redSoft,color:C.red,border:"none",borderRadius:8,padding:"0 12px",cursor:"pointer",fontWeight:700}}
                >
                  ✕
                </button>
              )}
            </div>
            {loyaltyCustomer && (
              <div style={{fontSize:12,color:C.green,marginTop:6,fontWeight:600}}>
                ✓ {loyaltyCustomer.name} (Скидка: {loyaltyCustomer.discount_percent}%)
              </div>
            )}
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>РУЧНАЯ СКИДКА</div>
            <div style={{display:"flex",gap:6}}>
              {[0,5,10,15,20].map(d=>(
                <button key={d} onClick={()=>{setDiscount(d);setLoyaltyCustomer(null);setPhoneSearch("");}} style={{flex:1,padding:"6px 2px",borderRadius:8,border:`1px solid ${discount===d?C.accent:C.border}`,background:discount===d?C.accentSoft:"transparent",color:discount===d?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>
                  {d===0?"Нет":d+"%"}
                </button>
              ))}
            </div>
          </div>
          {discount>0&&<div style={{fontSize:12,color:C.red,marginBottom:8,textAlign:"right"}}>Скидка: −{fmtM(discAmt)}</div>}
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
            <span style={{fontWeight:800,fontSize:16}}>К оплате:</span>
            <span style={{fontSize:22,fontWeight:900,color:C.accent}}>{fmtM(total)}</span>
          </div>

          {/* Переключатель сплит-оплаты */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <button onClick={()=>{setSplitMode(!splitMode);if(!splitMode){setPayments([]);setPayMode(null);}}} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${splitMode?C.accent:C.border}`,background:splitMode?C.accentSoft:"transparent",color:splitMode?C.accent:C.muted,cursor:"pointer",fontSize:11,fontWeight:700}}>
              {splitMode?"✓ Сплит-оплата":"Разделить оплату"}
            </button>
            {splitMode&&<span style={{fontSize:11,color:C.muted}}>Введите суммы по методам</span>}
          </div>

          {!splitMode ? (
            <>
              {/* Обычная оплата: 4 кнопки */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
                {[
                  {id:"cash",label:"💵 Нал",color:C.green,soft:C.greenSoft},
                  {id:"kaspi",label:"📱 Kaspi",color:C.blue,soft:C.blueSoft},
                  {id:"halyk",label:"🏦 Халык",color:C.purple,soft:C.purpleSoft},
                  {id:"bck",label:"🏛️ БЦК",color:C.yellow,soft:C.yellowSoft},
                ].map(m=>(
                  <button key={m.id} onClick={()=>setPayMode(m.id)} style={{padding:10,background:payMode===m.id?m.soft:C.card,color:payMode===m.id?m.color:C.text,border:`1px solid ${payMode===m.id?m.color:C.border}`,borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
                    {m.label}
                  </button>
                ))}
              </div>
              {payMode==="cash"&&(
                <div style={{marginBottom:10}}>
                  <input value={cashInput} onChange={e=>setCashInput(e.target.value.replace(/\D/g,""))} placeholder="Сумма от клиента..." style={{width:"100%",padding:12,background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,boxSizing:"border-box",fontSize:18,fontWeight:700,outline:"none"}}/>
                  {cashGiven>=total&&cashGiven>0&&<div style={{color:C.green,fontWeight:700,fontSize:14,marginTop:6}}>Сдача: {fmtM(cashGiven-total)}</div>}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Сплит-оплата: поля для каждого метода */}
              <div style={{marginBottom:10}}>
                {[
                  {id:"cash",label:"💵 Нал",color:C.green},
                  {id:"kaspi",label:"📱 Kaspi",color:C.blue},
                  {id:"halyk",label:"🏦 Халык",color:C.purple},
                  {id:"bck",label:"🏛️ БЦК",color:C.yellow},
                ].map(m=>{
                  const existing = payments.find(p=>p.method===m.id);
                  const val = existing ? existing.amount : "";
                  return (
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:12,fontWeight:700,color:m.color,width:85}}>{m.label}</span>
                      <input
                        type="number"
                        value={val}
                        onChange={e=>{
                          const amt = parseInt(e.target.value)||0;
                          setPayments(prev=>{
                            const filtered = prev.filter(p=>p.method!==m.id);
                            if(amt>0) filtered.push({method:m.id,amount:amt});
                            return filtered;
                          });
                        }}
                        placeholder="0"
                        style={{flex:1,padding:"8px 12px",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",fontSize:14,fontWeight:700}}
                      />
                      <span style={{fontSize:11,color:C.muted}}>₸</span>
                    </div>
                  );
                })}
                {(() => {
                  const splitTotal = payments.reduce((s,p)=>s+p.amount,0);
                  const remaining = total - splitTotal;
                  return (
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:8,padding:"8px 12px",borderRadius:8,background:remaining===0?C.greenSoft:C.yellowSoft}}>
                      <span style={{fontSize:12,fontWeight:700,color:remaining===0?C.green:C.yellow}}>
                        {remaining===0?"✓ Сумма совпадает":`Осталось: ${fmtM(remaining)}`}
                      </span>
                      <span style={{fontSize:12,fontWeight:700,color:C.muted}}>Итого: {fmtM(splitTotal)}</span>
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          <button
            onClick={handlePay}
            disabled={splitMode ? payments.reduce((s,p)=>s+p.amount,0)!==total : (!payMode||(payMode==="cash"&&cashGiven<total))}
            style={{width:"100%",padding:16,background:(splitMode?(payments.reduce((s,p)=>s+p.amount,0)===total):payMode)?C.accent:C.dimmed,color:"#000",border:"none",borderRadius:10,fontWeight:900,cursor:(splitMode?(payments.reduce((s,p)=>s+p.amount,0)===total):payMode)?"pointer":"default",fontSize:15}}
          >
            ✓ Принять оплату
          </button>
          {selPoint === "Мастерская" && (
            <button
              type="button"
              onClick={() => setShowPreorderModal(true)}
              style={{width:"100%",padding:12,marginTop:8,background:"transparent",color:C.accent,border:`1px solid ${C.accent}`,borderRadius:10,fontWeight:900,cursor:"pointer",fontSize:13}}
            >
              📅 Оформить предзаказ
            </button>
          )}
        </div>
      )}

      {done&&lastReceipt&&(
        <div style={{padding:16}}>
          <div style={{background:C.greenSoft,border:`1px solid ${C.green}`,borderRadius:12,padding:20,marginBottom:12,textAlign:"center"}}>
            <div style={{fontSize:36}}>✓</div>
            <div style={{fontSize:18,fontWeight:800,color:C.green,marginBottom:4}}>Оплата принята!</div>
            <div style={{fontSize:13,color:C.muted}}>Чек #{lastReceipt.no} · {lastReceipt.point}</div>
            <div style={{fontSize:24,fontWeight:900,marginTop:8}}>{fmtM(lastReceipt.total)}</div>
            {lastReceipt.change>0&&<div style={{color:C.green,fontWeight:700,marginTop:4}}>Сдача: {fmtM(lastReceipt.change)}</div>}
          </div>
          <button onClick={newSale} style={{width:"100%",padding:14,background:C.accent,color:"#000",border:"none",borderRadius:10,fontWeight:900,cursor:"pointer",fontSize:15}}>🍓 Новая продажа</button>
        </div>
      )}

      {/* Кнопка закрытия смены для кассира */}
      {currentUser?.role==="cashier" && currentShift && !done && (
        <div style={{padding:"0 16px 16px"}}>
          <button onClick={()=>{setShowCloseShift(true);setActualCashInput("");}} style={{width:"100%",padding:12,background:C.redSoft,color:C.red,border:`1px solid ${C.red}`,borderRadius:10,fontWeight:700,cursor:"pointer",fontSize:13}}>🔒 Закрыть смену</button>
        </div>
      )}

      {/* Модалка закрытия смены */}
      {showCloseShift && currentShift && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:1000,overflowY:"auto",padding:"40px 0"}}>
          <div style={{background:C.card,borderRadius:16,padding:28,width:360,maxWidth:"90vw",border:`1px solid ${C.border}`,margin:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:16}}>🔒 Закрытие смены</div>
            {(()=>{
              const shiftSales = sales.filter(s=>s.shift_id===currentShift.id);
              const shiftPreorders = (preorders || []).filter(p => p.prepayment_shift_id === currentShift.id);
              const expectedPreordersCash = shiftPreorders.reduce((sum, p) => {
                if (p.prepayment_method === "cash") return sum + (p.prepayment || 0);
                return sum;
              }, 0);
              const expectedCash = shiftSales.reduce((sum,s)=>{
                if(s.payMode==="cash") return sum+s.total;
                if(s.payMode==="split" && s.payments) return sum+s.payments.filter(p=>p.method==="cash").reduce((a,p)=>a+p.amount,0);
                return sum;
              },0) + expectedPreordersCash;
              const actualCash = parseInt(actualCashInput.replace(/\D/g,""))||0;
              const discrepancy = actualCash - expectedCash;
              return (
                <>
                  <div style={{background:C.surface,borderRadius:10,padding:14,marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{color:C.muted,fontSize:13}}>Продаж за смену:</span><span style={{fontWeight:700}}>{shiftSales.length}</span></div>
                    {expectedPreordersCash > 0 && (
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{color:C.muted,fontSize:13}}>Авансы по предзаказам (нал):</span><span style={{fontWeight:700,color:C.accent}}>+{fmtM(expectedPreordersCash)}</span></div>
                    )}
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{color:C.muted,fontSize:13}}>Ожидаемая наличка:</span><span style={{fontWeight:700,color:C.green}}>{fmtM(expectedCash)}</span></div>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Фактическая наличка в кассе (₸)</div>
                    <input value={actualCashInput} onChange={e=>setActualCashInput(e.target.value.replace(/[^0-9]/g,""))} placeholder="0" style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,fontSize:18,fontWeight:700,outline:"none",boxSizing:"border-box"}} autoFocus/>
                  </div>
                  {actualCashInput && (
                    <div style={{background:discrepancy===0?C.greenSoft:discrepancy>0?C.blueSoft:C.redSoft,borderRadius:10,padding:12,marginBottom:14,textAlign:"center"}}>
                      <div style={{fontSize:12,color:C.muted}}>Расхождение</div>
                      <div style={{fontSize:20,fontWeight:900,color:discrepancy===0?C.green:discrepancy>0?C.blue:C.red}}>{discrepancy>0?"+":""}{fmtM(discrepancy)}</div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>setShowCloseShift(false)} style={{flex:1,padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600}}>Отмена</button>
                    <button onClick={()=>{
                      setShowCloseShift(false);
                      if(onCloseShift) onCloseShift(actualCash, expectedCash, discrepancy);
                    }} style={{flex:1,padding:12,borderRadius:10,border:"none",background:C.red,color:"#fff",cursor:"pointer",fontWeight:800,fontSize:14}}>Закрыть смену</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );

  return(
    <div style={{display:"flex",height:"calc(100vh - 57px)"}}>
      <Toast toast={toast}/>
      {!isMobile ? (
        <>
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0}}>
              <button onClick={()=>setPosTab("products")} style={{padding:"14px 20px",background:posTab==="products"?C.card:"transparent",color:posTab==="products"?C.accent:C.muted,border:"none",fontWeight:700,fontSize:14,cursor:"pointer",outline:"none"}}>🍓 Товары</button>
              <button onClick={()=>setPosTab("orders")} style={{padding:"14px 20px",background:posTab==="orders"?C.card:"transparent",color:posTab==="orders"?C.accent:C.muted,border:"none",fontWeight:700,fontSize:14,cursor:"pointer",outline:"none"}}>🧾 Заказы за сегодня</button>
            </div>
            {posTab === "products" ? renderProducts() : renderOrders()}
          </div>
          {renderCart()}
        </>
      ) : (
        <div style={{width:"100%",display:"flex",flexDirection:"column",position:"relative"}}>
          <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
            <button onClick={()=>setPosTab("products")} style={{flex:1,padding:14,background:posTab==="products"?C.card:"transparent",color:posTab==="products"?C.accent:C.muted,border:"none",fontWeight:700,fontSize:14,outline:"none"}}>🍓 Товары</button>
            <button onClick={()=>setPosTab("cart")} style={{flex:1,padding:14,background:posTab==="cart"?C.card:"transparent",color:posTab==="cart"?C.accent:C.muted,border:"none",fontWeight:700,fontSize:14,outline:"none"}}>🛒 Корзина ({cart.reduce((s,i)=>s+i.qty,0)})</button>
            <button onClick={()=>setPosTab("orders")} style={{flex:1,padding:14,background:posTab==="orders"?C.card:"transparent",color:posTab==="orders"?C.accent:C.muted,border:"none",fontWeight:700,fontSize:14,outline:"none"}}>🧾 Заказы</button>
          </div>
          <div style={{flex:1,overflow:"hidden"}}>
            {posTab==="products" ? renderProducts() : posTab==="cart" ? renderCart() : renderOrders()}
          </div>
          
          {posTab==="products" && cart.length>0 && (
            <button onClick={()=>setPosTab("cart")} style={{position:"absolute",bottom:20,right:20,background:C.accent,color:"#000",padding:"14px 22px",borderRadius:30,boxShadow:"0 4px 15px rgba(232,160,180,0.4)",border:"none",fontWeight:900,fontSize:14,cursor:"pointer",zIndex:10}}>
              Оформить ({cart.reduce((s,i)=>s+i.qty,0)} шт) · {fmtM(subtotal)} →
            </button>
          )}
        </div>
      )}

      {showPreorderModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:1000,overflowY:"auto",padding:"40px 0"}}>
          <div style={{background:C.card,borderRadius:16,padding:24,width:400,maxWidth:"95vw",border:`1px solid ${C.border}`,margin:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:16,color:C.accent,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>📅 Оформление предзаказа</span>
              <button onClick={()=>setShowPreorderModal(false)} style={{background:"transparent",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>✕</button>
            </div>

            <div style={{background:C.surface,borderRadius:10,padding:12,marginBottom:14,fontSize:13}}>
              <div style={{fontWeight:700,marginBottom:4,color:C.muted}}>Товары:</div>
              {cart.map(item => (
                <div key={item.id} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span>{item.product} x{item.qty}</span>
                  <span style={{fontWeight:600}}>{fmtM((item.price + ((item.extras?.s6 || 0) + (item.extras?.s7 || 0) + (item.extras?.s2 || 0)) * 500) * item.qty)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:6,fontWeight:800}}>
                <span>Итого к оплате:</span>
                <span style={{color:C.accent}}>{fmtM(total)}</span>
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ТЕЛЕФОН КЛИЕНТА *</label>
                <input
                  type="text"
                  value={preorderClientPhone}
                  onChange={e => {
                    const phone = e.target.value.replace(/[^0-9+]/g, "");
                    setPreorderClientPhone(phone);
                    const found = customers.find(c => c.phone === phone);
                    if (found) {
                      setPreorderClientName(found.name);
                      setDiscount(found.discount_percent);
                      setLoyaltyCustomer(found);
                      setPhoneSearch(found.phone);
                    } else {
                      setDiscount(0);
                      setLoyaltyCustomer(null);
                    }
                  }}
                  placeholder="87011234567"
                  style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13}}
                />
              </div>

              <div>
                <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ИМЯ КЛИЕНТА</label>
                <input
                  type="text"
                  value={preorderClientName}
                  onChange={e => setPreorderClientName(e.target.value)}
                  placeholder="Введите имя..."
                  style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13}}
                />
              </div>

              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ДАТА ВЫДАЧИ *</label>
                  <input
                    type="date"
                    value={preorderDate}
                    onChange={e => setPreorderDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13}}
                  />
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ВРЕМЯ ВЫДАЧИ *</label>
                  <input
                    type="time"
                    value={preorderTime}
                    onChange={e => setPreorderTime(e.target.value)}
                    style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13}}
                  />
                </div>
              </div>

              <div>
                <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ТОЧКА ВЫДАЧИ</label>
                <div style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,boxSizing:"border-box",fontSize:13,fontWeight:700}}>
                  Мастерская (только в мастерской)
                </div>
              </div>

              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>ПРЕДОПЛАТА (₸)</label>
                  <input
                    type="number"
                    value={preorderPrepayment}
                    onChange={e => setPreorderPrepayment(e.target.value)}
                    placeholder="0"
                    style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13,fontWeight:700}}
                  />
                </div>
                {parseInt(preorderPrepayment) > 0 && (
                  <div style={{flex:1}}>
                    <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>СПОСОБ ОПЛАТЫ</label>
                    <select
                      value={preorderPayMode}
                      onChange={e => setPreorderPayMode(e.target.value)}
                      style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13}}
                    >
                      <option value="cash">💵 Наличные</option>
                      <option value="kaspi">📱 Kaspi</option>
                      <option value="halyk">🏦 Халык</option>
                      <option value="bck">🏛️ БЦК</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>КОММЕНТАРИЙ К ЗАКАЗУ</label>
                <textarea
                  value={preorderNotes}
                  onChange={e => setPreorderNotes(e.target.value)}
                  placeholder="Особые пожелания..."
                  style={{width:"100%",padding:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,outline:"none",boxSizing:"border-box",fontSize:13,height:60,resize:"none"}}
                />
              </div>

              <div style={{display:"flex",gap:10,marginTop:8}}>
                <button
                  type="button"
                  onClick={()=>setShowPreorderModal(false)}
                  style={{flex:1,padding:12,borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600}}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleCreatePreorder}
                  style={{flex:1,padding:12,border:"none",background:C.accent,color:"#000",borderRadius:8,cursor:"pointer",fontWeight:900}}
                >
                  Создать предзаказ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ПРОИЗВОДСТВО И ПЕРЕМЕЩЕНИЕ ──────────────────────────────────────────────
function Production({isMobile,rawStock,setRawStock,semiStock,setSemiStock,currentUser}){
  const [activeTab, setActiveTab] = useState("produce"); // "produce" или "transfer"
  const [search,setSearch]=useState("");
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
        <button onClick={()=>setActiveTab("produce")} style={{padding:"10px 18px",borderRadius:10,border:"none",background:activeTab==="produce"?C.accent:C.card,color:activeTab==="produce"?"#000":C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>🍓 Производство полуфабрикатов</button>
        <button onClick={()=>setActiveTab("transfer")} style={{padding:"10px 18px",borderRadius:10,border:"none",background:activeTab==="transfer"?C.accent:C.card,color:activeTab==="transfer"?"#000":C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>📦 Распределение упаковки и сырья</button>
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
            <h3 style={{marginTop:0,marginBottom:16}}>🏭 Склад сырья (Центральный)</h3>
            {rawStock.filter(r=>r.name.toLowerCase().includes(search.toLowerCase())).map(r=>{
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
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0}}>⚗️ Полуфабрикаты по точкам</h3>
              <select value={form.point} onChange={e=>setForm(f=>({...f,point:e.target.value}))} style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",outline:"none",fontSize:12}}>
                {POINTS.map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            {semiStock.map(s=>{
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
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
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

// ─── СКЛАД ───────────────────────────────────────────────────────────────────
function Warehouse({isMobile,rawStock,setRawStock,semiStock,setSemiStock,currentUser,sales,expenses,techCards,history,setHistory}){
  const [showAdd,setShowAdd]=useState(false);
  const [search,setSearch]=useState("");
  const [form,setForm]=useState({itemId:"r1",price:"",qty:"",supplier:"",location:currentUser.role==="cashier"?currentUser.point:"Склад",manualEntry:false,customName:"",customType:"raw",customUnit:"г"});
  const [toast,showToast]=useToast();

  const handleDeleteHistory = (itemToDelete) => {
    if (!window.confirm("Удалить эту запись из истории приходов? (Внимание: остатки на складе не изменятся автоматически)")) return;
    setHistory(prev => prev.filter(h => h.id !== itemToDelete.id));
    showToast("Запись удалена из истории");
  };

  const handleAdd=(e)=>{
    e.preventDefault();
    const qty=parseFloat(form.qty),price=parseFloat(form.price)||0;
    if(!qty||qty<=0){showToast("Введите количество",true);return;}
    
    if (form.manualEntry) {
      if (!form.customName.trim()) { showToast("Введите название товара", true); return; }
      if (!form.customUnit.trim()) { showToast("Введите единицу измерения", true); return; }
      
      const newId = (form.customType === "raw" ? "r_" : "s_") + Date.now();
      const name = form.customName.trim();
      const unit = form.customUnit.trim();
      
      const qtyObj = { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 };
      qtyObj[form.location] = qty;
      
      if (form.customType === "raw") {
        const newItem = { id: newId, name, unit, price, qty: qtyObj };
        setRawStock(prev => [...prev, newItem]);
        showToast(`Добавлено новое сырьё: ${name} (+${qty} ${unit})`);
      } else {
        const newItem = { id: newId, name, unit, qty: qtyObj, rawId: null };
        setSemiStock(prev => [...prev, newItem]);
        showToast(`Добавлен новый полуфабрикат: ${name} (+${qty} ${unit})`);
      }
    } else {
      setRawStock(prev=>prev.map(item=>{
        if(item.id!==form.itemId) return item;
        const qtyObj = parseQtyObj(item.qty);
        const cur = qtyObj[form.location] || 0;
        const avgPrice = cur>0 ? Math.round((cur*item.price+qty*price)/(cur+qty)) : price;
        
        qtyObj[form.location] = Math.round((cur+qty)*1000)/1000;
        return{...item,qty:qtyObj,price:avgPrice};
      }));
      const item=rawStock.find(r=>r.id===form.itemId);
      showToast(`Оприходовано: ${item?.name} +${qty} ${item?.unit} на ${form.location}`);
    }
    
    const itemName = form.manualEntry ? form.customName.trim() : rawStock.find(r=>r.id===form.itemId)?.name;
    const itemUnit = form.manualEntry ? form.customUnit.trim() : rawStock.find(r=>r.id===form.itemId)?.unit;
    
    const histId = generateUUID();
    const newHistItem = {
      id: histId,
      date: new Date().toLocaleDateString("ru-RU"),
      item: itemName,
      qty,
      unit: itemUnit,
      price,
      supplier: form.supplier||"—",
      location: form.location
    };
    setHistory(h => [newHistItem, ...h]);
    
    setForm({
      itemId:"r1",
      price:"",
      qty:"",
      supplier:"",
      location:currentUser.role==="cashier"?currentUser.point:"Склад",
      manualEntry: false,
      customName: "",
      customType: "raw",
      customUnit: "г"
    });
    setShowAdd(false);
  };

  const isCashier = currentUser.role === "cashier";
  const myPoint = currentUser.point;
  const filteredHistory = isCashier ? history.filter(h => h.location === myPoint) : history;

  // Данные за сегодня для кассира
  const todayStr = new Date().toLocaleDateString("ru-RU");
  const todaySales = isCashier ? (sales||[]).filter(s => s.point === myPoint && s.date === todayStr) : [];

  // Расчет поступившего сегодня ассортимента (для кассира)
  const receivedGrouped = {};
  filteredHistory
    .filter(h => h.date === todayStr)
    .forEach(h => {
      if (!receivedGrouped[h.item]) {
        receivedGrouped[h.item] = { qty: 0, unit: h.unit };
      }
      receivedGrouped[h.item].qty += h.qty;
    });

  // Расчет израсходованного сегодня ассортимента (для кассира)
  const consumedGrouped = {};
  const addCons = (name, qty, unit) => {
    const roundedQty = Math.round(qty * 1000) / 1000;
    if (roundedQty <= 0) return;
    if (!consumedGrouped[name]) {
      consumedGrouped[name] = { qty: 0, unit };
    }
    consumedGrouped[name].qty += roundedQty;
  };

  todaySales.forEach(sale => {
    (sale.items || []).forEach(item => {
      const tc = (techCards || []).find(t => t.id === item.id || t.product === item.name);
      if (tc) {
        (tc.ings || []).forEach(ing => {
          const targetUnit = ing.rid ? rawStock.find(r=>r.id===ing.rid)?.unit : semiStock.find(s=>s.id===ing.sid)?.unit;
          const convertedQty = getConvertedQty(ing.qty, ing.unit || targetUnit, targetUnit);
          const spend = convertedQty * item.qty * (1 + (ing.loss || 0) / 100);
          if (ing.rid) {
            const raw = (rawStock || []).find(r => r.id === ing.rid);
            if (raw) addCons(raw.name, spend, raw.unit);
          } else {
            const semi = (semiStock || []).find(s => s.id === ing.sid);
            if (semi) addCons(semi.name, spend, semi.unit);
          }
        });
        const packaging = getPackagingItems(item.name);
        (packaging || []).forEach(pkg => {
          const raw = (rawStock || []).find(r => r.id === pkg.rawId);
          if (raw) addCons(raw.name, pkg.qty * item.qty, raw.unit);
        });
      }
      if (item.extras) {
        if (item.extras.s6 > 0) {
          const semi = (semiStock || []).find(s => s.id === "s6");
          if (semi) addCons(semi.name, item.extras.s6 * 50 * item.qty, semi.unit);
        }
        if (item.extras.s7 > 0) {
          const semi = (semiStock || []).find(s => s.id === "s7");
          if (semi) addCons(semi.name, item.extras.s7 * 50 * item.qty, semi.unit);
        }
        if (item.extras.s2 > 0) {
          const semi = (semiStock || []).find(s => s.id === "s2");
          if (semi) addCons(semi.name, item.extras.s2 * 15 * item.qty, semi.unit);
        }
      }
    });
  });

  try {
    const saved = localStorage.getItem("vb_writeoffs_log");
    const log = saved ? JSON.parse(saved) : [];
    log.filter(l => l.location === myPoint && l.date === todayStr).forEach(l => {
      addCons(l.item, l.qty, l.unit);
    });
  } catch (e) {}

  return(
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      <Toast toast={toast}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={{margin:0}}>▣ Складской учёт {isCashier ? `(${myPoint})` : ""}</h2>
        <button onClick={()=>setShowAdd(v=>!v)} style={{padding:"10px 22px",borderRadius:10,border:"none",background:C.green,color:"#000",fontWeight:800,cursor:"pointer",fontSize:14}}>
          {showAdd?"✕ Отмена":"+ Оприходовать"}
        </button>
      </div>

      {/* Карточки сводки за сегодня для кассира */}
      {isCashier && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,marginBottom:20}}>
          {/* Блок Приход за сегодня */}
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:20}}>
            <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",marginBottom:12,fontWeight:700}}>📥 Поступило сегодня на точку</div>
            {Object.keys(receivedGrouped).length === 0 ? (
              <div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>Поступлений сегодня не было</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {Object.entries(receivedGrouped).map(([name, info]) => (
                  <div key={name} style={{display:"flex",justifyContent:"space-between",fontSize:13,borderBottom:`1px solid ${C.border}40`,paddingBottom:6}}>
                    <span style={{fontWeight:600}}>{name}</span>
                    <span style={{color:C.blue,fontWeight:800}}>+{fmt(info.qty)} {info.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Блок Расход за сегодня */}
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:20}}>
            <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",marginBottom:12,fontWeight:700}}>📤 Израсходовано сегодня (POS + списания)</div>
            {Object.keys(consumedGrouped).length === 0 ? (
              <div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>Расхода сегодня не было</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {Object.entries(consumedGrouped).map(([name, info]) => (
                  <div key={name} style={{display:"flex",justifyContent:"space-between",fontSize:13,borderBottom:`1px solid ${C.border}40`,paddingBottom:6}}>
                    <span style={{fontWeight:600}}>{name}</span>
                    <span style={{color:C.red,fontWeight:800}}>-{fmt(info.qty)} {info.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAdd&&(
        <form onSubmit={handleAdd} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:15}}>
            <input 
              type="checkbox" 
              id="manualEntry" 
              checked={form.manualEntry} 
              onChange={e=>{
                const checked = e.target.checked;
                setForm(f=>({...f, manualEntry: checked, customName: "", customType: "raw", customUnit: "г", price: "", qty: ""}));
              }}
              style={{cursor:"pointer",width:16,height:16}}
            />
            <label htmlFor="manualEntry" style={{fontSize:13,fontWeight:700,cursor:"pointer",color:form.manualEntry?C.accent:C.text}}>
              Добавить товар вручную (которого нет в списке)
            </label>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,alignItems:"end"}}>
            {!isCashier && (
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Локация поступления</div>
                <select value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 10px",color:C.text,outline:"none"}}>
                  {ALL_LOCATIONS.map(l=><option key={l}>{l}</option>)}
                </select>
              </div>
            )}
            
            {form.manualEntry ? (
              <>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Название товара</div>
                  <input required value={form.customName} onChange={e=>setForm(f=>({...f,customName:e.target.value}))} placeholder="Введите название" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Тип товара</div>
                  <select value={form.customType} onChange={e=>setForm(f=>({...f,customType:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 10px",color:C.text,outline:"none"}}>
                    <option value="raw">Сырьё / упаковка</option>
                    <option value="semi">Полуфабрикат</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Ед. измерения</div>
                  <input required value={form.customUnit} onChange={e=>setForm(f=>({...f,customUnit:e.target.value}))} placeholder="г, шт, уп" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
                </div>
                {form.customType === "raw" ? (
                  <div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Цена закупа (₸/ед.)</div>
                    <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ) : (
                  <div style={{display:"none"}} />
                )}
              </>
            ) : (
              <>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Позиция</div>
                  <select value={form.itemId} onChange={e=>setForm(f=>({...f,itemId:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 10px",color:C.text,outline:"none"}}>
                    {rawStock.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Цена закупа (₸/ед.)</div>
                  <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
                </div>
              </>
            )}
            
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Количество</div>
              <input type="number" step="0.01" required value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} placeholder="0" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Поставщик</div>
              <input value={form.supplier} onChange={e=>setForm(f=>({...f,supplier:e.target.value}))} placeholder="Напр. ИП Жанибеков" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <button type="submit" style={{padding:"11px 20px",borderRadius:8,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>✓ Сохранить</button>
          </div>
        </form>
      )}

      <div style={{marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск по складу..." style={{width:"100%",padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,outline:"none",boxSizing:"border-box",fontSize:14}}/>
      </div>
      {/* Таблица сырья */}
      <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:20}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,fontWeight:700}}>📦 Остатки сырья и упаковки</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:13,minWidth:650}}>
            <thead>
              <tr style={{background:C.surface,borderBottom:`1px solid ${C.border}`}}>
                {isCashier ? (
                  ["Наименование","Ед.","Остаток на точке","Статус"].map((h,i)=>
                    <th key={i} style={{padding:"13px 18px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )
                ) : (
                  ["Наименование","Ед.","На Складе","В Мастерской","В Фуд Траке","В Жаре","В Парке","Ср. цена","Итого (₸)","Статус"].map((h,i)=>
                    <th key={i} style={{padding:"13px 18px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rawStock.filter(r => {
                if(search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
                const qObj = parseQtyObj(r.qty);
                const totalQty = isCashier ? qObj[myPoint] : Object.values(qObj).reduce((a,b)=>a+b,0);
                return totalQty > 0;
              }).map((r,i)=>{
                const qObj = parseQtyObj(r.qty);
                const totalQty = isCashier ? qObj[myPoint] : Object.values(qObj).reduce((a,b)=>a+b,0);
                return(
                  <tr key={r.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?"transparent":C.surface+"30"}}>
                    <td style={{padding:"13px 18px",fontWeight:600}}>{r.name}</td>
                    <td style={{padding:"13px 18px",color:C.muted}}>{fmtUnit(r.unit)}</td>
                    {isCashier ? (
                      <td style={{padding:"13px 18px",fontWeight:800}}>{fmt(qObj[myPoint])}</td>
                    ) : (
                      <>
                        <td style={{padding:"13px 18px",fontWeight:800}}>{fmt(qObj["Склад"])}</td>
                        <td style={{padding:"13px 18px"}}>{fmt(qObj["Мастерская"])}</td>
                        <td style={{padding:"13px 18px"}}>{fmt(qObj["Фуд Трак"])}</td>
                        <td style={{padding:"13px 18px"}}>{fmt(qObj["Жара"])}</td>
                        <td style={{padding:"13px 18px"}}>{fmt(qObj["Парк"])}</td>
                        <td style={{padding:"13px 18px",color:C.green,fontWeight:700}}>{fmtM(r.price)}</td>
                        <td style={{padding:"13px 18px",color:C.accent,fontWeight:700}}>{fmtM(Math.round(totalQty*r.price))}</td>
                      </>
                    )}
                    <td style={{padding:"13px 18px"}}>
                      <span style={{fontSize:11,fontWeight:700,color:totalQty<5?C.red:totalQty<15?C.yellow:C.green,background:totalQty<5?C.redSoft:totalQty<15?C.yellowSoft:C.greenSoft,padding:"3px 10px",borderRadius:20}}>
                        {totalQty<5?"Критично":totalQty<15?"Мало":"OK"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Таблица полуфабрикатов */}
      <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:20}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,fontWeight:700}}>⚗️ Полуфабрикаты на кухне</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:13,minWidth:650}}>
            <thead>
              <tr style={{background:C.surface,borderBottom:`1px solid ${C.border}`}}>
                {isCashier ? (
                  ["Наименование","Ед.","Остаток на кухне","Статус"].map((h,i)=>
                    <th key={i} style={{padding:"13px 18px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )
                ) : (
                  ["Наименование","Ед.","На Складе","В Мастерской","В Фуд Траке","В Жаре","В Парке","Статус"].map((h,i)=>
                    <th key={i} style={{padding:"13px 18px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {semiStock.filter(s => {
                if(search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
                const qtyObj = parseSemiQtyObj(s.qty);
                const totalQty = isCashier ? qtyObj[myPoint] : Object.values(qtyObj).reduce((a,b)=>a+b,0);
                return totalQty > 0;
              }).map((s,i)=>{
                const qtyObj = parseSemiQtyObj(s.qty);
                const totalQty = isCashier ? qtyObj[myPoint] : Object.values(qtyObj).reduce((a,b)=>a+b,0);
                const limitCritical = s.unit === "г" ? 500 : 5;
                const limitLow = s.unit === "г" ? 1500 : 15;
                const status = totalQty < limitCritical ? "Критично" : totalQty < limitLow ? "Мало" : "OK";
                return(
                  <tr key={s.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?"transparent":C.surface+"30"}}>
                    <td style={{padding:"13px 18px",fontWeight:600}}>{s.name}</td>
                    <td style={{padding:"13px 18px",color:C.muted}}>{fmtUnit(s.unit)}</td>
                    {isCashier ? (
                      <td style={{padding:"13px 18px",fontWeight:800}}>{fmt(qtyObj[myPoint])}</td>
                    ) : (
                      <>
                        <td style={{padding:"13px 18px",fontWeight:800}}>{fmt(qtyObj["Склад"])}</td>
                        <td style={{padding:"13px 18px"}}>{fmt(qtyObj["Мастерская"])}</td>
                        <td style={{padding:"13px 18px"}}>{fmt(qtyObj["Фуд Трак"])}</td>
                        <td style={{padding:"13px 18px"}}>{fmt(qtyObj["Жара"])}</td>
                        <td style={{padding:"13px 18px"}}>{fmt(qtyObj["Парк"])}</td>
                      </>
                    )}
                    <td style={{padding:"13px 18px"}}>
                      <span style={{fontSize:11,fontWeight:700,color:status==="Критично"?C.red:status==="Мало"?C.yellow:C.green,background:status==="Критично"?C.redSoft:status==="Мало"?C.yellowSoft:C.greenSoft,padding:"3px 10px",borderRadius:20}}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filteredHistory.length>0&&(
        <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:20}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>История поступлений {isCashier ? `на точку ${myPoint}` : ""}</div>
          {filteredHistory.map((h,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<filteredHistory.length-1?`1px solid ${C.border}`:"none"}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{h.item}</div>
                <div style={{fontSize:11,color:C.muted}}>{h.supplier} · {h.location} · {h.date}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:800,color:C.green,fontSize:14}}>+{h.qty} {h.unit}</div>
                  {h.price>0&&<div style={{fontSize:11,color:C.muted}}>{fmtM(h.price)}/ед.</div>}
                </div>
                {!isCashier && (
                  <button onClick={()=>handleDeleteHistory(h)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:"4px 8px"}} title="Удалить запись">
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── РАСХОДЫ ─────────────────────────────────────────────────────────────────
const EXP_CATS = [
  {id:"rent",      label:"Аренда",    icon:"🏪", color:C.blue},
  {id:"salary",    label:"Зарплата",  icon:"👤", color:C.purple},
  {id:"marketing", label:"Реклама",   icon:"📣", color:C.accent},
  {id:"utility",   label:"Коммунальные услуги", icon:"💡", color:C.yellow},
  {id:"tax",       label:"Налоги",    icon:"🧾", color:C.red},
  {id:"deposit",   label:"Внесение личных средств", icon:"📥", color:C.green},
  {id:"safe",      label:"Сейф (Снятие наличных)", icon:"🏦", color:C.yellow},
  {id:"other",     label:"Прочее",    icon:"📝", color:C.muted},
];

function Expenses({isMobile,expenses,setExpenses,currentUser}){
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({cat:"rent",desc:"",amount:"",point: currentUser?.role === "cashier" ? currentUser.point : "Вся компания",paid:true,type:"expense"});
  const [toast,showToast]=useToast();

  const totalPaid=expenses.filter(e=>e.paid && e.cat !== "deposit" && e.cat !== "safe").reduce((s,e)=>s+e.amount,0);
  const totalPend=expenses.filter(e=>!e.paid && e.cat !== "deposit" && e.cat !== "safe").reduce((s,e)=>s+e.amount,0);

  const handleAdd=(ev)=>{
    ev.preventDefault();
    if(!form.desc||!form.amount){showToast("Заполните поля",true);return;}
    const catVal = form.type && form.type !== "expense" ? form.type : form.cat;
    setExpenses(p=>[...p,{id:generateUUID(),...form,cat:catVal,amount:parseInt(form.amount)||0,date:new Date().toLocaleDateString("ru-RU")}]);
    setForm({cat:"rent",desc:"",amount:"",point: currentUser?.role === "cashier" ? currentUser.point : "Вся компания",paid:true,type:"expense"});
    setShowForm(false);
    showToast(form.type === "deposit" ? "Средства внесены" : form.type === "safe" ? "Наличные сняты (Сейф)" : "Расход добавлен");
  };

  return(
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      <Toast toast={toast}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <h2 style={{margin:"0 0 6px"}}>💰 Финансовые операции (Сейф / Расходы)</h2>
          <div style={{display:"flex",gap:16}}>
            <span style={{color:C.red,fontSize:13,fontWeight:700}}>Оплачено расходов: {fmtM(totalPaid)}</span>
            <span style={{color:C.yellow,fontSize:13,fontWeight:700}}>Ожидается расходов: {fmtM(totalPend)}</span>
          </div>
        </div>
        <button onClick={()=>setShowForm(v=>!v)} style={{padding:"10px 22px",borderRadius:10,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer",fontSize:14}}>
          {showForm?"✕ Отмена":"+ Новая операция"}
        </button>
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
          const amt=expenses.filter(e=>e.cat===cat.id&&e.paid).reduce((s,e)=>s+e.amount,0);
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

      {expenses.length>0&&(
        <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:20}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>История операций</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:500}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Категория","Назначение","Точка","Статус","Сумма","Дата"].map((h,i)=>
                    <th key={i} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...expenses].reverse().map((e,i)=>(
                  <tr key={e.id} style={{borderBottom:`1px solid ${C.border}40`}}>
                    <td style={{padding:"10px 12px"}}>{EXP_CATS.find(x=>x.id===e.cat)?.icon} {EXP_CATS.find(x=>x.id===e.cat)?.label}</td>
                    <td style={{padding:"10px 12px",color:C.text}}>{e.desc||e.note}</td>
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

// ─── ОТЧЕТЫ ──────────────────────────────────────────────────────────────────
function Reports({isMobile,sales,expenses,rawStock,semiStock,currentUser}){
  const isCashier = currentUser?.role === "cashier";
  const isAdmin = currentUser?.role === "admin";
  const myPoint = currentUser?.point;
  const [pointFilter, setPointFilter] = useState(isCashier ? currentUser.point : "Все");
  const [periodFilter, setPeriodFilter] = useState("За все время");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [reportType, setReportType] = useState("finance");

  const now = new Date();
  const todayStr = now.toLocaleDateString("ru-RU");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("ru-RU");

  // useMemo: фильтрация при изменении входных данных, а не при каждом рендере
  const filteredSales = useMemo(() => sales.filter(s => {
    if (pointFilter !== "Все" && s.point !== pointFilter) return false;
    const sDate = parseLocalDate(s.date);
    if (periodFilter === "Сегодня") return s.date === todayStr;
    else if (periodFilter === "Вчера") return s.date === yesterdayStr;
    else if (periodFilter === "Неделя") return Math.ceil(Math.abs(now - sDate) / 86400000) <= 7;
    else if (periodFilter === "Месяц") return sDate.getMonth() === now.getMonth() && sDate.getFullYear() === now.getFullYear();
    else if (periodFilter === "Свой период") {
      if (customStart) {
        const cs = new Date(customStart);
        cs.setHours(0,0,0,0);
        if (sDate < cs) return false;
      }
      if (customEnd) {
        const ce = new Date(customEnd);
        ce.setHours(23,59,59,999);
        if (sDate > ce) return false;
      }
    }
    return true;
  }), [sales, pointFilter, periodFilter, todayStr, yesterdayStr, customStart, customEnd]);

  const { totalRev, totalCOGS } = useMemo(() => ({
    totalRev:  filteredSales.reduce((s,i)=>s+i.total,0),
    totalCOGS: filteredSales.reduce((s,i)=>s+(i.cogs||0),0),
  }), [filteredSales]);

  const filteredExpenses = useMemo(() => expenses.filter(e => {
    if (isCashier) {
      if (e.point !== myPoint) return false;
    } else {
      if (pointFilter !== "Все" && e.point !== pointFilter && e.point !== "Вся компания") return false;
    }
    const eDate = parseLocalDate(e.date);
    if (periodFilter === "Сегодня") return e.date === todayStr;
    else if (periodFilter === "Вчера") return e.date === yesterdayStr;
    else if (periodFilter === "Неделя") return Math.ceil(Math.abs(now - eDate) / 86400000) <= 7;
    else if (periodFilter === "Месяц") return eDate.getMonth() === now.getMonth() && eDate.getFullYear() === now.getFullYear();
    else if (periodFilter === "Свой период") {
      if (customStart) {
        const cs = new Date(customStart);
        cs.setHours(0,0,0,0);
        if (eDate < cs) return false;
      }
      if (customEnd) {
        const ce = new Date(customEnd);
        ce.setHours(23,59,59,999);
        if (eDate > ce) return false;
      }
    }
    return true;
  }), [expenses, isCashier, myPoint, pointFilter, periodFilter, todayStr, yesterdayStr, customStart, customEnd]);

  const rpActivePointsCount = POINTS.length;
  const { totalExp, totalInflow, totalSafe } = useMemo(() => ({
    totalExp: filteredExpenses.filter(e=>e.paid && e.cat !== "deposit" && e.cat !== "safe").reduce((s,e) => {
      if (pointFilter !== "Все" && e.point === "Вся компания") return s + e.amount / rpActivePointsCount;
      return s + e.amount;
    }, 0),
    totalInflow: filteredExpenses.filter(e=>e.paid && e.cat === "deposit").reduce((s,e)=>s+e.amount,0),
    totalSafe:   filteredExpenses.filter(e=>e.paid && e.cat === "safe").reduce((s,e)=>s+e.amount,0),
  }), [filteredExpenses, pointFilter, rpActivePointsCount]);

  const grossP  = totalRev - totalCOGS;
  const netP    = grossP - totalExp;
  const margin  = totalRev > 0 ? Math.round(netP / totalRev * 100) : 0;
  const netCashFlow = totalRev + totalInflow - totalExp - totalSafe;

  const byPoint = useMemo(() => POINTS.map((p,i) => ({
    name:p, color:POINT_COLORS[i],
    rev:    filteredSales.filter(s=>s.point===p).reduce((a,s)=>a+s.total,0),
    orders: filteredSales.filter(s=>s.point===p).length,
    cogs:   filteredSales.filter(s=>s.point===p).reduce((a,s)=>a+(s.cogs||0),0),
  })), [filteredSales]);

  const stockLoc = isCashier ? myPoint : "Склад";
  const stockValue = rawStock.reduce((s,r)=>s + (parseQtyObj(r.qty)[stockLoc] * r.price),0);

  const getAbcData = () => {
    const productSales = {};
    filteredSales.forEach(sale => {
      (sale.items || []).forEach(item => {
        productSales[item.name] = (productSales[item.name] || 0) + (item.price * item.qty);
      });
    });

    const itemsArray = Object.keys(productSales).map(name => ({
      name,
      revenue: productSales[name]
    }));

    itemsArray.sort((a, b) => b.revenue - a.revenue);

    const totalItemsRev = itemsArray.reduce((sum, item) => sum + item.revenue, 0);
    let runningSum = 0;

    return itemsArray.map(item => {
      runningSum += item.revenue;
      const share = totalItemsRev > 0 ? (item.revenue / totalItemsRev * 100) : 0;
      const cumShare = totalItemsRev > 0 ? (runningSum / totalItemsRev * 100) : 0;

      let group = "C";
      if (cumShare <= 80.01) group = "A";
      else if (cumShare <= 95.01) group = "B";

      return {
        ...item,
        share,
        cumShare,
        group
      };
    });
  };

  const abcRows = useMemo(() => getAbcData(), [filteredSales]); // eslint-disable-line react-hooks/exhaustive-deps

  const getFoodcostData = () => {
    return POINTS.map((p, idx) => {
      const pSales = sales.filter(s => s.point === p);
      const pFilteredSales = pSales.filter(s => {
        const sDate = parseLocalDate(s.date);
        if (periodFilter === "Сегодня") return s.date === todayStr;
        if (periodFilter === "Вчера") return s.date === yesterdayStr;
        if (periodFilter === "Неделя") {
          const diffTime = Math.abs(now - sDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 7;
        }
        if (periodFilter === "Месяц") {
          return sDate.getMonth() === now.getMonth() && sDate.getFullYear() === now.getFullYear();
        }
        return true;
      });

      const rev = pFilteredSales.reduce((sum, s) => sum + s.total, 0);
      const cogsVal = pFilteredSales.reduce((sum, s) => sum + (s.cogs || 0), 0);
      const percent = rev > 0 ? (cogsVal / rev * 100) : 0;

      return {
        name: p,
        revenue: rev,
        cogs: cogsVal,
        percent,
        color: POINT_COLORS[idx]
      };
    });
  };

  const foodcostRows = getFoodcostData();
  const fcLimit = 30;

  return(
    <div style={{padding:isMobile?"12px 14px":"24px 28px",boxSizing:"border-box"}}>
      {/* ФИЛЬТРЫ */}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",background:C.surface,padding:14,borderRadius:12,border:`1px solid ${C.border}`}}>
        {!isCashier ? (
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <span style={{fontSize:11,color:C.muted}}>ТОЧКА ОТЧЕТА</span>
            <select value={pointFilter} onChange={e=>setPointFilter(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13}}>
              <option>Все</option>
              {POINTS.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <span style={{fontSize:11,color:C.muted}}>ТОЧКА ОТЧЕТА</span>
            <div style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:13,fontWeight:700}}>
              📍 {myPoint}
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <span style={{fontSize:11,color:C.muted}}>ПЕРИОД ОТЧЕТА</span>
          <select value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13}}>
            <option>За все время</option>
            <option>Сегодня</option>
            <option>Вчера</option>
            <option>Неделя</option>
            <option>Месяц</option>
            <option>Свой период</option>
          </select>
          {periodFilter === "Свой период" && (
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12,width:"50%"}} />
              <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12,width:"50%"}} />
            </div>
          )}
        </div>
      </div>

      {/* ТАБЫ ДЛЯ ОУНЕРА ИЛИ ДИРЕКТОРА */}
      {!(isCashier || isAdmin) && (
        <div style={{display:"flex",gap:10,marginBottom:22,flexWrap:"wrap"}}>
          <button onClick={()=>setReportType("finance")} style={{padding:"10px 18px",borderRadius:8,border:"none",background:reportType==="finance"?C.accentSoft:C.card,color:reportType==="finance"?C.accent:C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>
            📊 Финансовые отчеты (P&L, CF)
          </button>
          <button onClick={()=>setReportType("abc")} style={{padding:"10px 18px",borderRadius:8,border:"none",background:reportType==="abc"?C.accentSoft:C.card,color:reportType==="abc"?C.accent:C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>
            🔤 ABC-анализ товаров
          </button>
          <button onClick={()=>setReportType("foodcost")} style={{padding:"10px 18px",borderRadius:8,border:"none",background:reportType==="foodcost"?C.accentSoft:C.card,color:reportType==="foodcost"?C.accent:C.muted,fontWeight:700,cursor:"pointer",fontSize:13}}>
            🍔 Фудкост по точкам
          </button>
        </div>
      )}

      {isCashier || isAdmin ? (
        /* Упрощённый вид для кассира и администратора: только продажи, расходы и стоимость склада */
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:20}}>
          {[
            {label:"СУММА ПРОДАЖ",     val:fmtS(totalRev),  color:C.green},
            {label:"КОЛИЧЕСТВО ЧЕКОВ", val:String(filteredSales.length),  color:C.accent},
            {label:"РАСХОДЫ",          val:fmtS(totalExp),  color:C.red},
            isAdmin && {label:"СТОИМОСТЬ СКЛАДА", val:fmtS(stockValue), color:C.blue},
          ].filter(Boolean).map((k,i)=>(
            <div key={i} style={{background:C.card,borderRadius:14,padding:"18px 20px",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:6,textTransform:"uppercase"}}>{k.label}</div>
              <div style={{fontSize:24,fontWeight:900,color:k.color}}>{k.val}</div>
            </div>
          ))}
        </div>
      ) : (
        /* Полный вид для владельца / директора */
        <>
        {reportType === "finance" && (
          <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:20}}>
            {[
              {label:"Выручка (ДДС Приход)", val:fmtS(totalRev),  color:C.green},
              {label:"Расходы P&L (COGS+накл.)",val:fmtS(totalCOGS+totalExp),color:C.red},
              {label:"Чистая прибыль P&L",      val:fmtS(netP),      color:netP>=0?C.green:C.red},
              {label:"Рентабельность (Маржа)", val:`${margin}%`,    color:margin>=20?C.green:margin>=10?C.yellow:C.red},
            ].map((k,i)=>(
              <div key={i} style={{background:C.card,borderRadius:14,padding:"18px 20px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:6,textTransform:"uppercase"}}>{k.label}</div>
                <div style={{fontSize:24,fontWeight:900,color:k.color}}>{k.val}</div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,marginBottom:16}}>
            {/* P&L Отчет */}
            <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
              <div style={{fontSize:15,fontWeight:800,marginBottom:16}}>💹 Отчёт о прибылях и убытках (P&L)</div>
              {[
                {label:"Выручка (Продажи)",        val:totalRev,  color:C.green, bold:true},
                {label:"Себестоимость продаж (COGS)",val:-totalCOGS,color:C.red},
                {label:"Валовая прибыль",           val:grossP,    color:C.blue,  bold:true},
                {label:"Накладные расходы",         val:-totalExp, color:C.red},
                {label:"Чистая прибыль",            val:netP,      color:netP>=0?C.green:C.red, bold:true, big:true},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}40`}}>
                  <span style={{fontSize:r.big?14:13,color:r.bold?C.text:C.muted,fontWeight:r.bold?700:400}}>{r.label}</span>
                  <span style={{fontSize:r.big?18:14,fontWeight:r.bold?900:500,color:r.color}}>
                    {r.val>=0?"+":""}{fmtM(r.val)}
                  </span>
                </div>
              ))}
              <div style={{background:margin>=20?C.greenSoft:C.yellowSoft,borderRadius:10,padding:14,marginTop:14,textAlign:"center"}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Рентабельность бизнеса</div>
                <div style={{fontSize:36,fontWeight:900,color:margin>=20?C.green:margin>=10?C.yellow:C.red}}>{margin}%</div>
              </div>
            </div>

            {/* Cash Flow (ДДС) Отчет */}
            <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
              <div style={{fontSize:15,fontWeight:800,marginBottom:16}}>📊 Движение денежных средств (Cash Flow)</div>
              {[
                {label:"Поступления от клиентов (Выручка)", val:totalRev,  color:C.green, bold:true},
                {label:"Внесение личных средств",          val:totalInflow,color:C.green},
                {label:"Оплата расходов (Накладные)",      val:-totalExp,  color:C.red},
                {label:"Сейф (Снятие наличных)",          val:-totalSafe, color:C.red},
                {label:"Чистый денежный поток (Net Cash)",  val:netCashFlow,color:netCashFlow>=0?C.green:C.red, bold:true, big:true},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}40`}}>
                  <span style={{fontSize:r.big?14:13,color:r.bold?C.text:C.muted,fontWeight:r.bold?700:400}}>{r.label}</span>
                  <span style={{fontSize:r.big?18:14,fontWeight:r.bold?900:500,color:r.color}}>
                    {r.val>=0?"+":""}{fmtM(r.val)}
                  </span>
                </div>
              ))}
              <div style={{background:C.blueSoft,borderRadius:10,padding:14,marginTop:14,textAlign:"center"}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Изменение денежного баланса за период</div>
                <div style={{fontSize:24,fontWeight:900,color:C.blue}}>{netCashFlow>=0?"+":""}{fmtM(netCashFlow)}</div>
              </div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,marginBottom:16}}>
            {pointFilter === "Все" && (
              <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
                <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>📍 Финансы по точкам</div>
                {byPoint.map((p,i)=>(
                  <div key={i} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:8,height:8,borderRadius:4,background:p.color}}/>
                        <span style={{fontWeight:600,fontSize:13}}>{p.name}</span>
                        <span style={{fontSize:11,color:C.muted}}>{p.orders} зак.</span>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontWeight:800,color:p.color,fontSize:13}}>{fmtS(p.rev)}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>Кост (COGS): <span style={{color:C.yellow,fontWeight:700}}>{fmtS(p.cogs)}</span> | Прибыль: <span style={{color:C.green,fontWeight:700}}>{fmtS(p.rev - p.cogs)}</span></div>
                      </div>
                    </div>
                    <div style={{height:5,background:C.dimmed,borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:5,width:`${Math.round(p.rev/Math.max(totalRev,1)*100)}%`,background:p.color,borderRadius:3}}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
              <div style={{fontSize:15,fontWeight:800,marginBottom:12}}>📦 Стоимость склада</div>
              <div style={{fontSize:28,fontWeight:900,color:C.accent}}>{fmtS(stockValue)}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                Стоимость сырья на Главном Складе
              </div>
            </div>
          </div>
          </>
        )}

        {reportType === "abc" && (
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>🔤 ABC-анализ товаров по выручке ({periodFilter})</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:20}}>
              Категория A (до 80% выручки) — ключевые товары. Категория B (80% - 95%) — средняя значимость. Категория C (95% - 100%) — низкая доля выручки.
            </div>
            {abcRows.length === 0 ? (
              <div style={{textAlign:"center",color:C.muted,padding:40}}>Нет данных о продажах за выбранный период</div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:600}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${C.border}`,textAlign:"left"}}>
                      <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Товар</th>
                      <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Выручка</th>
                      <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Доля (%)</th>
                      <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Накоп. доля (%)</th>
                      <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Группа</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abcRows.map((row, idx) => {
                      const groupColor = row.group === "A" ? C.green : row.group === "B" ? C.yellow : C.red;
                      const groupBg = row.group === "A" ? C.greenSoft : row.group === "B" ? C.yellowSoft : C.redSoft;
                      return (
                        <tr key={idx} style={{borderBottom:`1px solid ${C.border}40`}}>
                          <td style={{padding:"12px 12px",fontWeight:600}}>{row.name}</td>
                          <td style={{padding:"12px 12px"}}>{fmtM(row.revenue)}</td>
                          <td style={{padding:"12px 12px"}}>{row.share.toFixed(1)}%</td>
                          <td style={{padding:"12px 12px"}}>{row.cumShare.toFixed(1)}%</td>
                          <td style={{padding:"12px 12px"}}>
                            <span style={{color:groupColor,background:groupBg,padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:900}}>{row.group}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {reportType === "foodcost" && (
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>🍔 Анализ Фудкоста по точкам ({periodFilter})</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:20}}>
              Процент Фудкоста рассчитывается как Себестоимость сырья (COGS) / Выручка. Установленная норма: <b>{fcLimit}%</b>. При превышении нормы выводится красный индикатор предупреждения.
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:600}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${C.border}`,textAlign:"left"}}>
                    <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Точка</th>
                    <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Выручка</th>
                    <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Себестоимость (COGS)</th>
                    <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Процент фудкоста</th>
                    <th style={{padding:"10px 12px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {foodcostRows.map((row, idx) => {
                    const isOver = row.percent > fcLimit;
                    return (
                      <tr key={idx} style={{borderBottom:`1px solid ${C.border}40`}}>
                        <td style={{padding:"12px 12px",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:8,height:8,borderRadius:4,background:row.color}}/>
                          {row.name}
                        </td>
                        <td style={{padding:"12px 12px"}}>{fmtM(row.revenue)}</td>
                        <td style={{padding:"12px 12px",color:C.yellow}}>{fmtM(row.cogs)}</td>
                        <td style={{padding:"12px 12px",fontWeight:800,color:isOver ? C.red : C.green}}>{row.percent.toFixed(1)}%</td>
                        <td style={{padding:"12px 12px"}}>
                          {isOver ? (
                            <span style={{color:C.red,background:C.redSoft,padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:800}}>⚠️ Превышение нормы</span>
                          ) : (
                            <span style={{color:C.green,background:C.greenSoft,padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:800}}>✓ В норме</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
      )}

      {/* Список продаж для кассира и администратора */}
      {(isCashier || isAdmin) && filteredSales.length > 0 && (
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>🧾 Продажи ({periodFilter})</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:400}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Чек",isAdmin && "Точка","Позиции","Оплата","Сумма","Время"].filter(Boolean).map((h,i)=>
                    <th key={i} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...filteredSales].reverse().slice(0,20).map((s,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}40`}}>
                    <td style={{padding:"10px 12px",color:C.muted}}>#{s.no}</td>
                    {isAdmin && <td style={{padding:"10px 12px"}}>{s.point}</td>}
                    <td style={{padding:"10px 12px",color:C.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.items?.map(x=>x.name).join(", ")}</td>
                    <td style={{padding:"10px 12px"}}>{fmtPay(s)}</td>
                    <td style={{padding:"10px 12px",fontWeight:800,color:C.green}}>{fmtM(s.total)}</td>
                    <td style={{padding:"10px 12px",color:C.muted}}>{s.date} {s.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Список расходов для кассира и администратора */}
      {(isCashier || isAdmin) && filteredExpenses.length > 0 && (
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>💰 Расходы ({periodFilter})</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:400}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["Категория","Сумма",isAdmin && "Точка","Дата","Комментарий","Статус"].filter(Boolean).map((h,i)=>
                    <th key={i} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...filteredExpenses].reverse().map((e,i)=>{
                  const catInfo = EXP_CATS.find(c => c.id === e.cat);
                  return (
                    <tr key={e.id || i} style={{borderBottom:`1px solid ${C.border}40`}}>
                      <td style={{padding:"10px 12px"}}>{catInfo?.icon} {catInfo?.label || e.cat}</td>
                      <td style={{padding:"10px 12px",fontWeight:800,color:C.red}}>{fmtM(e.amount)}</td>
                      {isAdmin && <td style={{padding:"10px 12px"}}>{e.point || "Вся компания"}</td>}
                      <td style={{padding:"10px 12px",color:C.muted}}>{e.date}</td>
                      <td style={{padding:"10px 12px",color:C.muted,fontStyle:e.desc?"normal":"italic"}}>{e.desc || "—"}</td>
                      <td style={{padding:"10px 12px"}}>
                        <span style={{color:e.paid?C.green:C.yellow,fontSize:11,fontWeight:700}}>
                          {e.paid?"Оплачено":"Ожидает"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── НАСТРОЙКИ ───────────────────────────────────────────────────────────────
function Settings({isMobile,techCards,setTechCards,rawStock,setRawStock,semiStock,users,setUsers,customers,setCustomers}){
  const [tab,setTab]=useState("products");
  const [search,setSearch]=useState("");
  useEffect(()=>{setSearch("");},[tab]);
  const [editId,setEditId]=useState(null);
  const [showAddProduct,setShowAddProduct]=useState(false);
  const [showAddTechCard,setShowAddTechCard]=useState(false);
  const [newProduct,setNewProduct]=useState({product:"",cat:"Наборы",price:""});
  
  // Управление сотрудниками
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", role: "cashier", pin: "", point: "Мастерская" });

  // Управление клиентами (лояльность)
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", discount_percent: 0 });
  const [editCustId, setEditCustId] = useState(null);
  
  // Выбор локации для отображения сырья
  const [rawLoc, setRawLoc] = useState("Склад");

  const [toast,showToast]=useToast();

  const cats=["Наборы","Букеты","Креманки","Макси стаканы"];

  const updateTC=(id,field,val)=>setTechCards(p=>p.map(t=>t.id===id?{...t,[field]:field==="price"?parseInt(val)||0:val}:t));
  const deleteTC=(id)=>{setTechCards(p=>p.filter(t=>t.id!==id));setEditId(null);showToast("Товар удалён");};
  const updateIng=(tcId,idx,field,val)=>setTechCards(p=>p.map(t=>t.id!==tcId?t:{...t,ings:t.ings.map((x,i)=>i===idx?{...x,[field]:field==="qty"||field==="loss"?parseFloat(val)||0:val}:x)}));
  const addIng=(tcId)=>setTechCards(p=>p.map(t=>t.id!==tcId?t:{...t,ings:[...t.ings,{sid:"s1",qty:0,loss:0}]}));
  const delIng=(tcId,idx)=>setTechCards(p=>p.map(t=>t.id!==tcId?t:{...t,ings:t.ings.filter((_,i)=>i!==idx)}));
  
  const addProduct=()=>{
    if(!newProduct.product||!newProduct.price){showToast("Заполните название и цену",true);return;}
    setTechCards(p=>[...p,{id:`tc_${Date.now()}`,product:newProduct.product,cat:newProduct.cat,price:parseInt(newProduct.price)||0,ings:[]}]);
    setNewProduct({product:"",cat:"Наборы",price:""});
    setShowAddProduct(false);
    showToast("Товар добавлен!");
  };

  const addTechCard=()=>{
    if(!newProduct.product||!newProduct.price){showToast("Заполните название и цену",true);return;}
    setTechCards(p=>[...p,{id:`tc_${Date.now()}`,product:newProduct.product,cat:newProduct.cat,price:parseInt(newProduct.price)||0,ings:[]}]);
    setNewProduct({product:"",cat:"Наборы",price:""});
    setShowAddTechCard(false);
    showToast("Тех. карта добавлена!");
  };

  const updateRaw=(id,field,val)=>{
    setRawStock(p=>p.map(r=>{
      if (r.id !== id) return r;
      if (field === "price") {
        const newPrice = parseFloat(val) || 0;
        // Phase 4: track price history in raw_material_prices
        if (newPrice !== r.price) {
          supaFetch("POST","raw_material_prices",{raw_id:id,price:newPrice,effective_from:new Date().toISOString()}).catch(()=>{});
        }
        return { ...r, price: newPrice };
      } else if (field === "name") {
        return { ...r, name: val };
      } else if (field === "unit") {
        return { ...r, unit: val };
      } else if (field === "qty") {
        // Редактируем остаток для выбранной локации
        const qObj = parseQtyObj(r.qty);
        qObj[rawLoc] = parseFloat(val) || 0;
        return { ...r, qty: qObj };
      }
      return r;
    }));
  };

  const inputStyle={background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};

  const getIngNameLocal = (ing) => {
    if (!ing) return "Неизвестный ингредиент";
    if (ing.rid) {
      const raw = rawStock.find(r => r.id === ing.rid);
      return raw ? `${raw.name} [Сырьё]` : "Неизвестное сырьё";
    }
    const targetSid = ing.sid || ing;
    const semi = semiStock.find(s => s.id === targetSid);
    return semi ? `${semi.name} [ПФ]` : "Неизвестный ПФ";
  };

  return(
    <div style={{padding:isMobile?"12px 14px":"20px 28px",boxSizing:"border-box"}}>
      <Toast toast={toast}/>
      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {[["products","🍓 Товары"],["techcards","📋 Тех. карты"],["rawstock","🏭 Сырьё"],["users","👥 Сотрудники"],["loyalty","👥 Клиенты (Лояльность)"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"10px 18px",borderRadius:10,border:"none",background:tab===id?C.accent:C.card,color:tab===id?"#000":C.muted,fontWeight:tab===id?700:400,cursor:"pointer",fontSize:14}}>
            {label}
          </button>
        ))}
      </div>


      {tab!=="users" && (
      <div style={{marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск..." style={{width:"100%",padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,outline:"none",boxSizing:"border-box",fontSize:14}}/>
      </div>
      )}
      {tab==="products"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:800}}>Товары и цены</div>
            <button onClick={()=>setShowAddProduct(v=>!v)} style={{padding:"9px 20px",borderRadius:10,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer"}}>+ Добавить товар</button>
          </div>
          {showAddProduct&&(
            <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.accent}`,padding:20,marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:10,alignItems:"end"}}>
                <div style={{flex:2}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>НАЗВАНИЕ</div>
                  <input value={newProduct.product} onChange={e=>setNewProduct(f=>({...f,product:e.target.value}))} placeholder="Напр. Набор 30 шт" style={inputStyle}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ЦЕНА (₸)</div>
                  <input type="number" value={newProduct.price} onChange={e=>setNewProduct(f=>({...f,price:e.target.value}))} placeholder="0" style={inputStyle}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>КАТЕГОРИЯ</div>
                  <select value={newProduct.cat} onChange={e=>setNewProduct(f=>({...f,cat:e.target.value}))} style={inputStyle}>
                    {cats.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={addProduct} style={{padding:"9px 20px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>+ Добавить</button>
                  <button onClick={()=>setShowAddProduct(false)} style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Отмена</button>
                </div>
              </div>
            </div>
          )}
          {cats.map(cat=>{
            const items=techCards.filter(t=>t.cat===cat && t.product.toLowerCase().includes(search.toLowerCase()));
            if(!items.length) return null;
            const color=CAT_COLORS[cat]||C.accent;
            return(
              <div key={cat} style={{marginBottom:20}}>
                <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>{cat}</div>
                {items.map(tc=>(
                  <div key={tc.id} style={{background:C.card,borderRadius:10,border:`1.5px solid ${editId===tc.id?color:C.border}`,padding:"14px 18px",marginBottom:6}}>
                    {editId===tc.id?(
                      <div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:10,marginBottom:10}}>
                          <div style={{flex:2}}>
                            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>НАЗВАНИЕ</div>
                            <input value={tc.product} onChange={e=>updateTC(tc.id,"product",e.target.value)} style={inputStyle}/>
                          </div>
                          <div>
                            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>ЦЕНА (₸)</div>
                            <input type="number" value={tc.price} onChange={e=>updateTC(tc.id,"price",e.target.value)} style={inputStyle}/>
                          </div>
                          <div>
                            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>КАТЕГОРИЯ</div>
                            <select value={tc.cat} onChange={e=>updateTC(tc.id,"cat",e.target.value)} style={inputStyle}>
                              {cats.map(c=><option key={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>{setEditId(null);showToast("Сохранено!");}} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:700,cursor:"pointer"}}>✓ Сохранить</button>
                          <button onClick={()=>deleteTC(tc.id)} style={{padding:"8px 16px",borderRadius:8,border:"none",background:C.redSoft,color:C.red,fontWeight:700,cursor:"pointer"}}>🗑 Удалить</button>
                          <button onClick={()=>setEditId(null)} style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Отмена</button>
                        </div>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",cursor:"pointer"}} onClick={()=>setEditId(tc.id)}>
                        <div style={{flex:1,fontWeight:600,fontSize:14}}>{tc.product}</div>
                        <div style={{fontWeight:900,color,fontSize:15,marginRight:12}}>{fmtM(tc.price)}</div>
                        <div style={{fontSize:12,color:C.muted}}>✏️ Изменить</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {tab==="techcards"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:18,fontWeight:800}}>Технологические карты</div>
              <div style={{fontSize:12,color:C.muted}}>Норма расхода и процент отходов по ингредиентам</div>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <button onClick={()=>setShowAddTechCard(v=>!v)} style={{padding:"9px 20px",borderRadius:10,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer"}}>
                + Добавить тех. карту
              </button>
              <button onClick={()=>{
                if(window.confirm("Вы уверены, что хотите сбросить все тех. карты на заводские настройки из Excel? Все ваши ручные изменения будут заменены.")) {
                  setTechCards(INIT_TECH_CARDS);
                  showToast("Технологические карты сброшены к значениям из Excel!");
                }
              }} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${C.red}`,background:"transparent",color:C.red,fontWeight:700,cursor:"pointer",fontSize:13}}>
                🔄 Сбросить к Excel
              </button>
            </div>
          </div>
          {showAddTechCard&&(
            <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.accent}`,padding:20,marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:10,alignItems:"end"}}>
                <div style={{flex:2}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>НАЗВАНИЕ</div>
                  <input value={newProduct.product} onChange={e=>setNewProduct(f=>({...f,product:e.target.value}))} placeholder="Напр. Букет РОЗА" style={inputStyle}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ЦЕНА (₸)</div>
                  <input type="number" value={newProduct.price} onChange={e=>setNewProduct(f=>({...f,price:e.target.value}))} placeholder="0" style={inputStyle}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>КАТЕГОРИЯ</div>
                  <select value={newProduct.cat} onChange={e=>setNewProduct(f=>({...f,cat:e.target.value}))} style={inputStyle}>
                    {cats.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={addTechCard} style={{padding:"9px 20px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>+ Добавить</button>
                  <button onClick={()=>setShowAddTechCard(false)} style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Отмена</button>
                </div>
              </div>
            </div>
          )}
          {techCards.filter(tc=>tc.product.toLowerCase().includes(search.toLowerCase())).map(tc=>(
            <div key={tc.id} style={{background:C.card,borderRadius:12,border:`1.5px solid ${editId===tc.id?C.accent:C.border}`,padding:"14px 18px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",cursor:"pointer"}} onClick={()=>setEditId(editId===tc.id?null:tc.id)}>
                <div style={{flex:1}}>
                  <span style={{fontWeight:700,fontSize:14}}>{tc.product}</span>
                  <span style={{fontSize:11,color:C.muted,marginLeft:10}}>{tc.cat} · {(tc.ings||[]).map(ing => getIngNameLocal(ing)).join(', ')}</span>
                </div>
                <span style={{fontWeight:800,color:C.accent,marginRight:12}}>{fmtM(tc.price)}</span>
                <span style={{fontSize:12,color:C.muted}}>{editId===tc.id?"▲":"▼"}</span>
              </div>
              {editId===tc.id&&(
                <div style={{marginTop:14}}>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:10,minWidth:500}}>
                      <thead>
                        <tr style={{background:C.surface}}>
                          {["Ингредиент (ПФ/Сырьё)","Норма","Потери %","Итого с пот.",""].map((h,i)=>(
                            <React.Fragment key={i}>
                              <th style={{padding:"8px 10px",textAlign:"left",fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                              {i===1 && <th style={{padding:"8px 10px",textAlign:"left",fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>Ед.изм.</th>}
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tc.ings.map((ing,idx)=>{
                          const targetUnit = ing.rid ? rawStock.find(r=>r.id===ing.rid)?.unit : semiStock.find(s=>s.id===ing.sid)?.unit;
                          const convertedQty = getConvertedQty(ing.qty, ing.unit || targetUnit, targetUnit);
                          const withLoss=Math.round(convertedQty*(1+ing.loss/100)*1000)/1000;
                          return(
                            <tr key={idx} style={{borderBottom:`1px solid ${C.border}`}}>
                              <td style={{padding:"8px 10px"}}>
                                <SearchableSelect
                                  value={ing.rid ? `raw:${ing.rid}` : `semi:${ing.sid}`}
                                  onChange={v=>{
                                    const isRaw = v.startsWith("raw:");
                                    const id = v.split(":")[1];
                                    setTechCards(p=>p.map(t=>t.id!==tc.id?t:{...t,ings:t.ings.map((x,i)=>{
                                      if (i===idx) {
                                        return isRaw ? { rid: id, qty: x.qty, loss: x.loss, unit: x.unit } : { sid: id, qty: x.qty, loss: x.loss, unit: x.unit };
                                      }
                                      return x;
                                    })}));
                                  }}
                                  style={{minWidth:180}}
                                  options={[
                                    ...semiStock.map(s=>({ value: `semi:${s.id}`, label: `ПФ: ${s.name}` })),
                                    ...rawStock.map(r=>({ value: `raw:${r.id}`, label: `Сырьё: ${r.name}` }))
                                  ]}
                                />
                              </td>
                              <td style={{padding:"8px 10px"}}>
                                <input type="number" step="0.001" value={ing.qty} onChange={e=>updateIng(tc.id,idx,"qty",e.target.value)} style={{...inputStyle,width:90}}/>
                              </td>
                              <td style={{padding:"8px 10px"}}>
                                <select value={ing.unit || ""} onChange={e=>updateIng(tc.id,idx,"unit",e.target.value)} style={{...inputStyle,width:60,padding:"8px 6px"}}>
                                  <option value="">Авт.</option>
                                  <option value="кг">кг</option>
                                  <option value="г">г</option>
                                  <option value="л">л</option>
                                  <option value="мл">мл</option>
                                  <option value="шт">шт</option>
                                </select>
                              </td>
                              <td style={{padding:"8px 10px"}}>
                                <input type="number" step="0.1" value={ing.loss} onChange={e=>updateIng(tc.id,idx,"loss",e.target.value)} style={{...inputStyle,width:70}}/>
                              </td>
                              <td style={{padding:"8px 10px",fontWeight:700,color:C.accent}}>{withLoss}</td>
                              <td style={{padding:"8px 10px"}}>
                                <button onClick={()=>delIng(tc.id,idx)} style={{background:C.redSoft,color:C.red,border:"none",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontWeight:700}}>✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>addIng(tc.id)} style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,color:C.text,cursor:"pointer",fontSize:13}}>+ Ингредиент</button>
                    <button onClick={()=>{setEditId(null);showToast("Тех. карта сохранена!");}} style={{padding:"8px 18px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:700,cursor:"pointer"}}>✓ Сохранить</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==="rawstock"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div style={{fontSize:18,fontWeight:800}}>Сырьё и расходные материалы</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,color:C.muted}}>Локация остатков:</span>
              <select value={rawLoc} onChange={e=>setRawLoc(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",outline:"none",fontSize:12}}>
                {ALL_LOCATIONS.map(l=><option key={l}>{l}</option>)}
              </select>
            </div>
          </div>
          {rawStock.filter(r=>r.name.toLowerCase().includes(search.toLowerCase())).map(r=>{
            const qtyVal = getQty(r.qty, rawLoc);
            return(
              <div key={r.id} style={{background:C.card,borderRadius:10,border:`1.5px solid ${editId===r.id?C.accent:C.border}`,padding:"12px 16px",marginBottom:6}}>
                {editId===r.id?(
                  <div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:10}}>
                      <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>НАИМЕНОВАНИЕ</div><input value={r.name} onChange={e=>updateRaw(r.id,"name",e.target.value)} style={inputStyle}/></div>
                      <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>ЕД. ИЗМ.</div><input value={r.unit} onChange={e=>updateRaw(r.id,"unit",e.target.value)} style={inputStyle}/></div>
                      <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>ЦЕНА (₸)</div><input type="number" value={r.price} onChange={e=>updateRaw(r.id,"price",e.target.value)} style={inputStyle}/></div>
                      <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>ОСТАТОК ({rawLoc})</div><input type="number" step="0.01" value={qtyVal} onChange={e=>updateRaw(r.id,"qty",e.target.value)} style={inputStyle}/></div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{setEditId(null);showToast("Сохранено!");}} style={{padding:"7px 16px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:700,cursor:"pointer"}}>✓ Сохранить</button>
                      <button onClick={()=>{setRawStock(p=>p.filter(x=>x.id!==r.id));setEditId(null);showToast("Удалено");}} style={{padding:"7px 14px",borderRadius:8,border:"none",background:C.redSoft,color:C.red,fontWeight:700,cursor:"pointer"}}>🗑 Удалить</button>
                      <button onClick={()=>setEditId(null)} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Отмена</button>
                    </div>
                  </div>
                ):(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setEditId(r.id)}>
                    <div style={{fontWeight:600,fontSize:13}}>{r.name}</div>
                    <div style={{display:"flex",alignItems:"center",gap:16}}>
                      <div style={{fontSize:13,color:C.muted}}>{fmt(qtyVal)} {r.unit}</div>
                      <div style={{fontWeight:700,color:C.yellow}}>{fmtM(r.price)}/{r.unit}</div>
                      <div style={{fontSize:12,color:C.muted}}>✏️</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={()=>setRawStock(p=>[...p,{id:`r_${Date.now()}`,name:"Новая позиция",unit:"кг",price:0,qty:{ "Склад":0,"Мастерская":0,"Фуд Трак":0,"Жара":0,"Парк":0 }}])} style={{marginTop:10,padding:"10px 20px",borderRadius:10,border:`1px solid ${C.border}`,background:C.card,color:C.text,cursor:"pointer",fontSize:13}}>+ Добавить сырьё</button>
        </div>
      )}

      {tab==="users"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:800}}>Сотрудники и доступы</div>
            <button onClick={()=>setShowAddUser(v=>!v)} style={{padding:"9px 20px",borderRadius:10,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer"}}>+ Добавить сотрудника</button>
          </div>
          {showAddUser && (
            <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.accent}`,padding:20,marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:10,alignItems:"end"}}>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ИМЯ СОТРУДНИКА</div>
                  <input value={newUser.name} onChange={e=>setNewUser(f=>({...f,name:e.target.value}))} placeholder="Елена" style={inputStyle}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>РОЛЬ</div>
                  <select value={newUser.role} onChange={e=>setNewUser(f=>({...f,role:e.target.value}))} style={inputStyle}>
                    {Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>PIN-КОД (4 ЦИФРЫ)</div>
                  <input value={newUser.pin} onChange={e=>setNewUser(f=>({...f,pin:e.target.value.replace(/\D/g,"").slice(0,4)}))} placeholder="1234" style={inputStyle}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>РАБОЧАЯ ТОЧКА</div>
                  <select value={newUser.point || ""} onChange={e=>setNewUser(f=>({...f,point:e.target.value || null}))} style={inputStyle}>
                    <option value="">Все точки (офис)</option>
                    {POINTS.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{
                    if(!newUser.name || newUser.pin.length!==4){ showToast("Введите имя и 4-значный PIN",true); return; }
                    const newId = generateUUID();
                    const usr = { id: newId, name: newUser.name, role: newUser.role, pin: newUser.pin, point: newUser.point };
                    setUsers(p=>[...p, usr]);
                    setNewUser({ name: "", role: "cashier", pin: "", point: "Мастерская" });
                    setShowAddUser(false);
                    showToast("Сотрудник добавлен!");
                  }} style={{padding:"9px 20px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:800,cursor:"pointer",flex:1}}>Добавить</button>
                  <button onClick={()=>setShowAddUser(false)} style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Отмена</button>
                </div>
              </div>
            </div>
          )}

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
          }).map((u)=>(
            <div key={u.id} style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"14px 18px",marginBottom:8}}>
              {editId === u.id ? (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:10,alignItems:"end"}}>
                  <div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>ИМЯ</div>
                    <input value={u.name} onChange={e=>setUsers(p=>p.map(x=>x.id===u.id?{...x,name:e.target.value}:x))} style={inputStyle}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>РОЛЬ</div>
                    <select value={u.role} onChange={e=>setUsers(p=>p.map(x=>x.id===u.id?{...x,role:e.target.value}:x))} style={inputStyle}>
                      {Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>PIN-КОД</div>
                    <input value={u.pin} onChange={e=>setUsers(p=>p.map(x=>x.id===u.id?{...x,pin:e.target.value.replace(/\D/g,"").slice(0,4)}:x))} style={inputStyle}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>ТОЧКА</div>
                    <select value={u.point || ""} onChange={e=>setUsers(p=>p.map(x=>x.id===u.id?{...x,point:e.target.value || null}:x))} style={inputStyle}>
                      <option value="">Все точки (офис)</option>
                      {POINTS.map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{supaFetch("PATCH","app_users",{name:u.name,role:u.role,pin:u.pin,point:u.point},`?id=eq.${u.id}`).catch(()=>{});setEditId(null);showToast("Сохранено!");}} style={{padding:"8px 14px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:700,cursor:"pointer"}}>✓</button>
                    <button onClick={()=>{setUsers(p=>p.filter(x=>x.id!==u.id));supaFetch("PATCH","app_users",{is_active:false},`?id=eq.${u.id}`).catch(()=>{});setEditId(null);showToast("Сотрудник удален");}} style={{padding:"8px 14px",borderRadius:8,border:"none",background:C.redSoft,color:C.red,fontWeight:700,cursor:"pointer"}}>🗑</button>
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:14}}>
                    <div style={{fontSize:22}}>{(ROLES[u.role]||{icon:"👤"}).icon}</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{u.name}</div>
                      <div style={{fontSize:12,color:C.muted}}>{(ROLES[u.role]||{label:u.role||"?"}).label} · {u.point || "Офис"} · PIN: {u.pin}</div>
                    </div>
                  </div>
                  <button onClick={()=>setEditId(u.id)} style={{background:"transparent",border:"none",color:C.accent,cursor:"pointer",fontSize:13,fontWeight:700}}>✏️ Редактировать</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==="loyalty"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:800}}>База клиентов (Лояльность)</div>
            <button onClick={()=>setShowAddCustomer(v=>!v)} style={{padding:"9px 20px",borderRadius:10,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer"}}>+ Добавить клиента</button>
          </div>
          {showAddCustomer && (
            <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.accent}`,padding:20,marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:10,alignItems:"end"}}>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ИМЯ КЛИЕНТА</div>
                  <input value={newCustomer.name} onChange={e=>setNewCustomer(f=>({...f,name:e.target.value}))} placeholder="Иван Иванов" style={inputStyle}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ТЕЛЕФОН</div>
                  <input value={newCustomer.phone} onChange={e=>setNewCustomer(f=>({...f,phone:e.target.value}))} placeholder="+7 (707) 123-4567" style={inputStyle}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>СКИДКА (%)</div>
                  <input type="number" min="0" max="100" value={newCustomer.discount_percent} onChange={e=>setNewCustomer(f=>({...f,discount_percent:parseInt(e.target.value)||0}))} placeholder="0" style={inputStyle}/>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{
                    if(!newCustomer.name || !newCustomer.phone){ showToast("Введите имя и телефон клиента",true); return; }
                    const newId = generateUUID();
                    const cust = { id: newId, name: newCustomer.name, phone: newCustomer.phone, discount_percent: newCustomer.discount_percent };
                    setCustomers(p=>[...p, cust]);
                    setNewCustomer({ name: "", phone: "", discount_percent: 0 });
                    setShowAddCustomer(false);
                    showToast("Клиент добавлен в базу!");
                  }} style={{padding:"9px 20px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:800,cursor:"pointer",flex:1}}>Добавить</button>
                  <button onClick={()=>setShowAddCustomer(false)} style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Отмена</button>
                </div>
              </div>
            </div>
          )}

          {customers.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)).map((c)=>(
            <div key={c.id} style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"14px 18px",marginBottom:8}}>
              {editCustId === c.id ? (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",gap:10,alignItems:"end"}}>
                  <div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>ИМЯ</div>
                    <input value={c.name} onChange={e=>setCustomers(p=>p.map(x=>x.id===c.id?{...x,name:e.target.value}:x))} style={inputStyle}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>ТЕЛЕФОН</div>
                    <input value={c.phone} onChange={e=>setCustomers(p=>p.map(x=>x.id===c.id?{...x,phone:e.target.value}:x))} style={inputStyle}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>СКИДКА (%)</div>
                    <input type="number" min="0" max="100" value={c.discount_percent} onChange={e=>setCustomers(p=>p.map(x=>x.id===c.id?{...x,discount_percent:parseInt(e.target.value)||0}:x))} style={inputStyle}/>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{setEditCustId(null);showToast("Сохранено!");}} style={{padding:"8px 14px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:700,cursor:"pointer"}}>✓</button>
                    <button onClick={()=>{setCustomers(p=>p.filter(x=>x.id!==c.id));setEditCustId(null);showToast("Клиент удален");}} style={{padding:"8px 14px",borderRadius:8,border:"none",background:C.redSoft,color:C.red,fontWeight:700,cursor:"pointer"}}>🗑</button>
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:14}}>
                    <div style={{fontSize:22}}>👤</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{c.name}</div>
                      <div style={{fontSize:12,color:C.muted}}>Тел: {c.phone} · Скидка: {c.discount_percent}%</div>
                    </div>
                  </div>
                  <button onClick={()=>setEditCustId(c.id)} style={{background:"transparent",border:"none",color:C.accent,cursor:"pointer",fontSize:13,fontWeight:700}}>✏️ Редактировать</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ИНВЕНТАРИЗАЦИЯ ───────────────────────────────────────────────────────────
function Inventory({isMobile,semiStock,setSemiStock,rawStock,setRawStock,currentUser,setExpenses}){
  const isCashier = currentUser?.role === "cashier";
  const myPoint = currentUser?.point;
  const [selPoint, setSelPoint] = useState(isCashier ? currentUser.point : POINTS[0]);
  const [activeTab, setActiveTab] = useState("semi"); // "semi" или "raw"
  const [facts, setFacts] = useState({});
  const [toast,showToast]=useToast();

  const handleCommitInventory = async () => {
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

// ─── СПИСАНИЯ ────────────────────────────────────────────────────────────────
function WriteOff({isMobile,rawStock,setRawStock,semiStock,setSemiStock,currentUser,log,setLog}){
  const [form,setForm]=useState({stock:"semi",itemId:"s1",qty:"",reason:"spoil",note:"",author:""});
  const isCashier = currentUser.role === "cashier";
  const myPoint = currentUser.point;
  const [selPoint, setSelPoint] = useState(currentUser.role === "cashier" ? currentUser.point : POINTS[0]);
  const [toast,showToast]=useToast();

  const filteredLog = isCashier ? log.filter(l => l.location === myPoint) : log;

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

      {filteredLog.length>0&&(
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:20}}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>История списаний</div>
          {filteredLog.map((l,i)=>(
            <div key={l.id || i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<filteredLog.length-1?`1px solid ${C.border}`:"none"}}>
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
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ЖУРНАЛ СМЕН ──────────────────────────────────────────────────────────────
// React.memo: перерендерится только при изменении списка смен
const Shifts = React.memo(function Shifts({isMobile, shifts }){
  const [filterPoint, setFilterPoint] = React.useState("all");
  const [sortBy, setSortBy] = React.useState("date_desc");
  const [search, setSearch] = React.useState("");

  const fmtDT = (iso) => {
    if(!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  };

  const points = React.useMemo(() => {
    if (!shifts) return [];
    const pts = new Set(shifts.map(s => s.point).filter(Boolean));
    return Array.from(pts);
  }, [shifts]);

  const filteredShifts = React.useMemo(() => {
    if (!shifts) return [];
    let res = [...shifts];
    
    if (filterPoint !== "all") {
      res = res.filter(s => s.point === filterPoint);
    }
    
    if (search.trim() !== "") {
      const q = search.toLowerCase();
      res = res.filter(s => 
        (s.cashier_name && s.cashier_name.toLowerCase().includes(q)) ||
        (s.point && s.point.toLowerCase().includes(q)) ||
        (s.opened_at && fmtDT(s.opened_at).toLowerCase().includes(q))
      );
    }
    
    res.sort((a, b) => {
      if (sortBy === "date_desc") {
        return new Date(b.opened_at) - new Date(a.opened_at);
      } else if (sortBy === "date_asc") {
        return new Date(a.opened_at) - new Date(b.opened_at);
      } else if (sortBy === "point_asc") {
        const pA = a.point || "";
        const pB = b.point || "";
        return pA.localeCompare(pB);
      } else if (sortBy === "point_desc") {
        const pA = a.point || "";
        const pB = b.point || "";
        return pB.localeCompare(pA);
      }
      return 0;
    });
    
    return res;
  }, [shifts, filterPoint, sortBy, search]);

  const inputStyle = {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.surface,
    color: C.text,
    outline: "none",
    fontSize: 13
  };

  return(
    <div style={{padding:isMobile?"12px 14px":"20px 28px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:20,fontWeight:800}}>🕐 Журнал смен</div>
        
        {shifts && shifts.length > 0 && (
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            <input 
              placeholder="Поиск (имя, дата, точка)..." 
              value={search} 
              onChange={e=>setSearch(e.target.value)} 
              style={{...inputStyle, width: isMobile ? "100%" : 200}} 
            />
            <select value={filterPoint} onChange={e=>setFilterPoint(e.target.value)} style={inputStyle}>
              <option value="all">Все точки</option>
              {points.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={inputStyle}>
              <option value="date_desc">Сначала новые (по дате)</option>
              <option value="date_asc">Сначала старые (по дате)</option>
              <option value="point_asc">По точкам (А-Я)</option>
              <option value="point_desc">По точкам (Я-А)</option>
            </select>
          </div>
        )}
      </div>

      {!shifts ? (
        <div style={{color:C.muted,textAlign:"center",padding:40}}>⟳ Загрузка смен...</div>
      ) : shifts.length === 0 ? (
        <div style={{color:C.muted,textAlign:"center",padding:40}}>Нет данных о сменах</div>
      ) : (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:800}}>
            <thead>
              <tr style={{background:C.surface}}>
                {["Точка","Кассир","Открыта","Закрыта","Ожидаемая ₸","Фактическая ₸","Расхождение","Статус"].map((h,i)=>(
                  <th key={i} style={{padding:"10px 14px",textAlign:"left",fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredShifts.map(sh=>{
                const disc = sh.discrepancy||0;
                const statusColor = sh.status==="closed" ? C.green : C.yellow;
                return(
                  <tr key={sh.id} style={{borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:"10px 14px",fontWeight:600}}>{sh.point||"—"}</td>
                    <td style={{padding:"10px 14px"}}>{sh.cashier_name||"—"}</td>
                    <td style={{padding:"10px 14px",fontSize:12}}>{fmtDT(sh.opened_at)}</td>
                    <td style={{padding:"10px 14px",fontSize:12}}>{fmtDT(sh.closed_at)}</td>
                    <td style={{padding:"10px 14px",fontWeight:700}}>{sh.expected_cash!=null?fmtM(sh.expected_cash):"—"}</td>
                    <td style={{padding:"10px 14px",fontWeight:700}}>{sh.actual_cash!=null?fmtM(sh.actual_cash):"—"}</td>
                    <td style={{padding:"10px 14px",fontWeight:700,color:disc===0?C.green:disc>0?C.blue:C.red}}>{disc!==0?(disc>0?"+":"")+fmtM(disc):"—"}</td>
                    <td style={{padding:"10px 14px"}}><span style={{background:sh.status==="closed"?C.greenSoft:C.yellowSoft,color:statusColor,padding:"4px 10px",borderRadius:6,fontWeight:700,fontSize:11}}>{sh.status==="closed"?"Закрыта":"Открыта"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredShifts.length === 0 && (
            <div style={{color:C.muted,textAlign:"center",padding:40}}>По вашему запросу ничего не найдено</div>
          )}
        </div>
      )}
    </div>
  );
});

// ─── PIN ЭКРАН ────────────────────────────────────────────────────────────────
function Preorders({isMobile,preorders, setPreorders, sales, setSales, semiStock, setSemiStock, rawStock, setRawStock, currentUser, currentShift, customers, techCards, showToast}) {
  const [statusFilter, setStatusFilter] = useState("all_active"); // "all_active", "pending", "ready", "completed", "cancelled"
  const [dateFilter, setDateFilter] = useState("all"); // "all", "today", "tomorrow", "custom"
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // States for finishing preorder (pick up / check out)
  const [checkoutPreorder, setCheckoutPreorder] = useState(null);
  const [checkoutPayMode, setCheckoutPayMode] = useState("cash");


  // Filtered preorders (always filtered to "Мастерская" because "только в мастерской")
  const filtered = preorders.filter(p => {
    // Only show "Мастерская" preorders
    if (p.point !== "Мастерская") return false;

    // 2. Status filter
    if (statusFilter === "all_active") {
      if (p.status !== "pending" && p.status !== "ready") return false;
    } else if (p.status !== statusFilter) {
      return false;
    }

    // 3. Date filter
    const todayStr = new Date().toLocaleDateString("ru-RU");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString("ru-RU");

    let dateNorm = p.target_date; // YYYY-MM-DD
    if (p.target_date && p.target_date.includes("-")) {
      const parts = p.target_date.split("-");
      dateNorm = `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    if (dateFilter === "today" && dateNorm !== todayStr) return false;
    if (dateFilter === "tomorrow" && dateNorm !== tomorrowStr) return false;
    if (dateFilter === "custom") {
      const pDate = new Date(p.target_date); // p.target_date is YYYY-MM-DD
      pDate.setHours(0,0,0,0);
      if (customStart) {
        const cs = new Date(customStart);
        cs.setHours(0,0,0,0);
        if (pDate < cs) return false;
      }
      if (customEnd) {
        const ce = new Date(customEnd);
        ce.setHours(23,59,59,999);
        if (pDate > ce) return false;
      }
    }

    // 4. Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = p.customer_name && p.customer_name.toLowerCase().includes(q);
      const phoneMatch = p.customer_phone && p.customer_phone.includes(q);
      const itemsMatch = p.items && p.items.some(i => i.name.toLowerCase().includes(q));
      if (!nameMatch && !phoneMatch && !itemsMatch) return false;
    }

    return true;
  });

  // Sort by target_date + target_time (nearest first)
  const sorted = [...filtered].sort((a, b) => {
    const da = `${a.target_date}T${a.target_time || "00:00"}`;
    const db = `${b.target_date}T${b.target_time || "00:00"}`;
    return da.localeCompare(db);
  });

  const handleStatusChange = (preorderId, newStatus) => {
    setPreorders(prev => prev.map(p => {
      if (p.id !== preorderId) return p;
      return { ...p, status: newStatus };
    }));
    showToast(`Статус предзаказа изменен на: ${newStatus === "ready" ? "Собран" : "Отменен"}`);
  };

  const handleOpenCheckout = (preorder) => {
    if (!currentShift && currentUser.role === "cashier") {
      showToast("Смена не открыта! Откройте смену в кассе.", true);
      return;
    }
    setCheckoutPreorder(preorder);
    setCheckoutPayMode("cash");
  };

  const handleCompletePreorder = () => {
    if (!checkoutPreorder) return;
    
    const p = checkoutPreorder;
    const remaining = p.total - p.prepayment;
    
    // Create sales receipt
    const receiptPayments = [];
    if (p.prepayment > 0) {
      receiptPayments.push({ method: "preorder_prepayment", amount: p.prepayment });
    }
    if (remaining > 0) {
      receiptPayments.push({ method: checkoutPayMode, amount: remaining });
    }

    // Determine effective pay_mode
    const effectivePayMode = receiptPayments.length > 1 ? "split" : (remaining > 0 ? checkoutPayMode : "preorder_prepayment");

    // Deduct stock
    const newSemi = [...semiStock];
    const newRaw = [...rawStock];

    for (const item of p.items) {
      const tc = techCards.find(t => t.product === item.name);
      if (tc && tc.ings) {
        for (const ing of tc.ings) {
          const spend = ing.qty * item.qty * (1 + (ing.loss || 0) / 100);
          if (ing.rid) {
            const idx = newRaw.findIndex(r => r.id === ing.rid);
            if (idx >= 0) {
              const qtyObj = parseQtyObj(newRaw[idx].qty);
              qtyObj[p.point] = Math.round((qtyObj[p.point] - spend) * 1000) / 1000;
              newRaw[idx] = { ...newRaw[idx], qty: qtyObj };
            }
          } else {
            const idx = newSemi.findIndex(s => s.id === ing.sid);
            if (idx >= 0) {
              const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
              qtyObj[p.point] = Math.round((qtyObj[p.point] - spend) * 1000) / 1000;
              newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
            }
          }
        }
      }

      // Deduct packaging
      const packaging = getPackagingItems(item.name);
      for (const pkg of packaging) {
        const idx = newRaw.findIndex(r => r.id === pkg.rawId);
        if (idx >= 0) {
          const qtyObj = parseQtyObj(newRaw[idx].qty);
          qtyObj[p.point] = Math.round((qtyObj[p.point] - pkg.qty * item.qty) * 1000) / 1000;
          newRaw[idx] = { ...newRaw[idx], qty: qtyObj };
        }
      }

      // Deduct extras
      if (item.extras) {
        if (item.extras.s6 > 0) {
          const idx = newSemi.findIndex(s => s.id === "s6");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[p.point] = Math.round((qtyObj[p.point] - item.extras.s6 * 50 * item.qty) * 1000) / 1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
        if (item.extras.s7 > 0) {
          const idx = newSemi.findIndex(s => s.id === "s7");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[p.point] = Math.round((qtyObj[p.point] - item.extras.s7 * 50 * item.qty) * 1000) / 1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
        if (item.extras.s2 > 0) {
          const idx = newSemi.findIndex(s => s.id === "s2");
          if (idx >= 0) {
            const qtyObj = parseSemiQtyObj(newSemi[idx].qty);
            qtyObj[p.point] = Math.round((qtyObj[p.point] - item.extras.s2 * 15 * item.qty) * 1000) / 1000;
            newSemi[idx] = { ...newSemi[idx], qty: qtyObj };
          }
        }
      }
    }

    setSemiStock(newSemi);
    setRawStock(newRaw);

    // Calculate COGS
    const cogs = p.items.reduce((s, item) => {
      const tc = techCards.find(t => t.product === item.name);
      const itemCogs = tc ? calcCartItemCOGS({ ...tc, qty: 1, extras: item.extras }, semiStock, rawStock) : 0;
      return s + itemCogs * item.qty;
    }, 0);

    const sale = {
      id: generateUUID(),
      no: 1001 + sales.length,
      point: p.point,
      items: p.items,
      total: p.total,
      subtotal: p.subtotal || p.total,
      discAmt: p.disc_amt || 0,
      discount: p.discount || 0,
      cogs: cogs,
      payMode: effectivePayMode,
      payments: receiptPayments,
      cashGiven: remaining > 0 && checkoutPayMode === "cash" ? remaining : 0,
      change: 0,
      shift_id: currentShift?.id || null,
      date: new Date().toLocaleDateString("ru-RU"),
      time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      status: "active",
      created_at: new Date().toISOString()
    };

    setSales(prev => [...prev, sale]);

    setPreorders(prev => prev.map(item => {
      if (item.id !== p.id) return item;
      return {
        ...item,
        status: "completed",
        completed_shift_id: currentShift?.id || null,
        completed_at: new Date().toISOString(),
        remaining_payment: remaining,
        remaining_method: remaining > 0 ? checkoutPayMode : null
      };
    }));

    showToast("Предзаказ успешно выдан и закрыт!");
    setCheckoutPreorder(null);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "pending": return <span style={{background:C.yellowSoft,color:C.yellow,padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>В ожидании</span>;
      case "ready": return <span style={{background:C.blueSoft,color:C.blue,padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>Собран</span>;
      case "completed": return <span style={{background:C.greenSoft,color:C.green,padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>Выдан</span>;
      case "cancelled": return <span style={{background:C.redSoft,color:C.red,padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>Отменен</span>;
      default: return null;
    }
  };

  return (
    <div style={{padding:isMobile?"12px 14px":"20px 28px",flex:1,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:900,color:C.accent}}>📅 Журнал предзаказов (Мастерская)</div>
        <div style={{display:"flex",gap:10}}>
          <input
            value={searchQuery}
            onChange={e=>setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, тел, товару..."
            style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,padding:"8px 12px",borderRadius:8,fontSize:13,outline:"none",width:200}}
          />
        </div>
      </div>

      <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{display:"flex",background:C.surface,borderRadius:8,padding:3,border:`1px solid ${C.border}`}}>
          {[
            {id:"all_active",label:"Активные"},
            {id:"pending",label:"В ожидании"},
            {id:"ready",label:"Собраны"},
            {id:"completed",label:"Выданы"},
            {id:"cancelled",label:"Отменены"}
          ].map(f => (
            <button
              key={f.id}
              onClick={()=>setStatusFilter(f.id)}
              style={{padding:"6px 12px",borderRadius:6,border:"none",background:statusFilter===f.id?C.card:"transparent",color:statusFilter===f.id?C.accent:C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{display:"flex",background:C.surface,borderRadius:8,padding:3,border:`1px solid ${C.border}`}}>
          {[
            {id:"all",label:"Все даты"},
            {id:"today",label:"На сегодня"},
            {id:"tomorrow",label:"На завтра"},
            {id:"custom",label:"Свой период"}
          ].map(f => (
            <button
              key={f.id}
              onClick={()=>setDateFilter(f.id)}
              style={{padding:"6px 12px",borderRadius:6,border:"none",background:dateFilter===f.id?C.card:"transparent",color:dateFilter===f.id?C.accent:C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}
            >
              {f.label}
            </button>
          ))}
        </div>
        {dateFilter === "custom" && (
          <div style={{display:"flex",gap:8}}>
            <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12}} />
            <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px",fontSize:12}} />
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:60,textAlign:"center",color:C.muted}}>
          Предзаказы не найдены
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))",gap:16}}>
          {sorted.map(p => {
            const isPending = p.status === "pending";
            const isReady = p.status === "ready";
            const remaining = p.total - p.prepayment;
            return (
              <div key={p.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:10}}>
                    <div>
                      <span style={{fontSize:11,color:C.muted,background:C.surface,padding:"2px 6px",borderRadius:4,marginRight:6}}>{p.point}</span>
                      <span style={{fontSize:12,fontWeight:700,color:C.text}}>{p.target_date} в {p.target_time}</span>
                    </div>
                    {getStatusBadge(p.status)}
                  </div>

                  <div style={{fontWeight:800,fontSize:14,marginBottom:4}}>{p.customer_name || "Без имени"}</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:10}}>📞 {p.customer_phone}</div>

                  <div style={{background:C.surface,borderRadius:8,padding:8,marginBottom:12}}>
                    {p.items?.map((item, idx) => (
                      <div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                        <span style={{color:C.text}}>{item.name} x{item.qty}</span>
                        <span style={{fontWeight:600}}>{fmtM(item.price * item.qty)}</span>
                      </div>
                    ))}
                    {p.notes && (
                      <div style={{fontSize:11,color:C.accent,borderTop:`1px solid ${C.border}`,paddingTop:6,marginTop:6,fontStyle:"italic"}}>
                        💬 {p.notes}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:C.muted}}>Сумма:</span><span style={{fontWeight:700}}>{fmtM(p.total)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:C.muted}}>Внесено (предоплата):</span><span style={{fontWeight:700,color:C.green}}>{fmtM(p.prepayment)} {p.prepayment_method && `(${PAY_LABELS[p.prepayment_method] || p.prepayment_method})`}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:12,borderTop:`1px solid ${C.border}`,paddingTop:4}}><span style={{fontWeight:700}}>Осталось:</span><span style={{fontWeight:800,color:remaining>0?C.yellow:C.green}}>{fmtM(remaining)}</span></div>

                  <div style={{display:"flex",gap:8}}>
                    {isPending && (
                      <>
                        <button
                          onClick={()=>handleStatusChange(p.id, "ready")}
                          style={{flex:1,padding:"8px 10px",background:C.accent,color:"#000",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer"}}
                        >
                          Собрать / Готов
                        </button>
                        <button
                          onClick={() => {
                            if(window.confirm("Отменить этот предзаказ?")) handleStatusChange(p.id, "cancelled");
                          }}
                          style={{padding:"8px 12px",background:C.redSoft,color:C.red,border:`1px solid ${C.red}`,borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}
                        >
                          Отменить
                        </button>
                      </>
                    )}
                    {isReady && (
                      <>
                        <button
                          onClick={()=>handleOpenCheckout(p)}
                          style={{flex:1,padding:"8px 10px",background:C.green,color:"#000",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer"}}
                        >
                          Выдать клиенту
                        </button>
                        <button
                          onClick={() => {
                            if(window.confirm("Отменить этот предзаказ?")) handleStatusChange(p.id, "cancelled");
                          }}
                          style={{padding:"8px 12px",background:C.redSoft,color:C.red,border:`1px solid ${C.red}`,borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}
                        >
                          Отменить
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {checkoutPreorder && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
          <div style={{background:C.card,borderRadius:16,padding:24,width:350,maxWidth:"90vw",border:`1px solid ${C.border}`,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:16}}>🛍️ Выдача предзаказа</div>
            <div style={{background:C.surface,borderRadius:10,padding:12,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:C.muted,fontSize:12}}>Сумма заказа:</span><span style={{fontWeight:700}}>{fmtM(checkoutPreorder.total)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:C.muted,fontSize:12}}>Предоплата:</span><span style={{fontWeight:700,color:C.green}}>-{fmtM(checkoutPreorder.prepayment)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:6}}><span style={{fontWeight:700,fontSize:13}}>К доплате:</span><span style={{fontWeight:900,color:C.yellow,fontSize:15}}>{fmtM(checkoutPreorder.total - checkoutPreorder.prepayment)}</span></div>
            </div>

            {checkoutPreorder.total - checkoutPreorder.prepayment > 0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:6}}>МЕТОД ДОПЛАТЫ</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {[
                    {id:"cash",label:"💵 Нал",color:C.green,soft:C.greenSoft},
                    {id:"kaspi",label:"📱 Kaspi",color:C.blue,soft:C.blueSoft},
                    {id:"halyk",label:"🏦 Халык",color:C.purple,soft:C.purpleSoft},
                    {id:"bck",label:"🏛️ БЦК",color:C.yellow,soft:C.yellowSoft},
                  ].map(m=>(
                    <button
                      key={m.id}
                      onClick={()=>setCheckoutPayMode(m.id)}
                      style={{padding:8,background:checkoutPayMode===m.id?m.soft:C.card,color:checkoutPayMode===m.id?m.color:C.text,border:`1px solid ${checkoutPayMode===m.id?m.color:C.border}`,borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12}}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setCheckoutPreorder(null)} style={{flex:1,padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600}}>Отмена</button>
              <button onClick={handleCompletePreorder} style={{flex:1,padding:12,borderRadius:10,border:"none",background:C.green,color:"#000",cursor:"pointer",fontWeight:800,fontSize:13}}>Подтвердить выдачу</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PinScreen({users, onLogin, onClose}){
  const [selected, setSelected] = useState(null);
  const [pin, setPin]           = useState("");
  const [error, setError]       = useState("");
  const [locked, setLocked]     = useState(false);
  const [lockSecsLeft, setLockSecsLeft] = useState(0);

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS   = 30_000;

  const getBFState = (userId) => {
    try { const s = JSON.parse(localStorage.getItem(`vb_bf_${userId}`) || "{}"); return { attempts: s.attempts||0, lockedUntil: s.lockedUntil||0 }; }
    catch { return { attempts: 0, lockedUntil: 0 }; }
  };
  const setBFState = (userId, state) => { try { localStorage.setItem(`vb_bf_${userId}`, JSON.stringify(state)); } catch {} };
  const clearBFState = (userId) => { try { localStorage.removeItem(`vb_bf_${userId}`); } catch {} };

  const handleSelectUser = (u) => {
    setPin(""); setError("");
    const { lockedUntil } = getBFState(u.id);
    setSelected(u);
    setLocked(Date.now() < lockedUntil);
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
    if (locked || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) {
      setTimeout(() => {
        const latestUser = users.find(u => u.id === selected.id) || selected;
        if (String(next) === String(latestUser.pin)) {
          clearBFState(selected.id);
          onLogin(latestUser);
          setPin(""); setSelected(null); setLocked(false);
        } else {
          const bf = getBFState(selected.id);
          const newAttempts = bf.attempts + 1;
          if (newAttempts >= MAX_ATTEMPTS) {
            setBFState(selected.id, { attempts: 0, lockedUntil: Date.now() + LOCKOUT_MS });
            setLocked(true);
            setError(`Слишком много попыток. Блокировка ${LOCKOUT_MS/1000} сек.`);
          } else {
            setBFState(selected.id, { attempts: newAttempts, lockedUntil: 0 });
            setError(`Неверный PIN. Осталось попыток: ${MAX_ATTEMPTS - newAttempts}`);
          }
          setPin("");
        }
      }, 200);
    }
  };

  const handleBack = () => { if (!locked) { setPin(p=>p.slice(0,-1)); setError(""); } };

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
          <button onClick={()=>{setSelected(null);setPin("");setError("");setLocked(false);}} style={{background:"transparent",border:"none",color:"#7A7A94",cursor:"pointer",fontSize:13,alignSelf:"flex-start"}}>← Назад</button>
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

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPA_URL = process.env.REACT_APP_SUPABASE_URL||"";
const SUPA_KEY = process.env.REACT_APP_SUPABASE_KEY||"";

const supabase = (SUPA_URL && SUPA_KEY) ? createClient(SUPA_URL, SUPA_KEY) : null;







async function supaFetch(method, table, body=null, params="") {
  if (!SUPA_URL || !SUPA_KEY) return method === "GET" ? [] : false;
  const url = `${SUPA_URL}/rest/v1/${table}${params}`;

  // Вспомогательная функция добавления в очередь с UUID и дедупликацией PATCH
  const enqueueOp = () => {
    try {
      const queue = LS("vb_sync_queue", []);
      const op = { method, table, body, params, id: generateUUID(), enqueuedAt: Date.now() };
      // Дедупликация: для PATCH/DELETE заменяем существующую операцию для той же записи
      if (method === "PATCH" || method === "DELETE") {
        const existIdx = queue.findIndex(q => q.table === table && q.params === params && q.method === method);
        if (existIdx >= 0) { queue[existIdx] = op; }
        else { queue.push(op); }
      } else {
        queue.push(op);
      }
      localStorage.setItem("vb_sync_queue", JSON.stringify(queue));
    } catch {}
  };

  // Оффлайн-очередь для операций записи (POST, PATCH, DELETE)
  if (method !== "GET" && typeof window !== "undefined" && window.navigator && !window.navigator.onLine) {
    enqueueOp();
    console.warn(`Устройство оффлайн. Запрос ${method} ${table} добавлен в очередь синхронизации.`);
    return true;
  }

  try {
    const res = await fetch(url,{
      method,
      headers:{
        "apikey":SUPA_KEY,
        "Authorization":`Bearer ${SUPA_KEY}`,
        "Content-Type":"application/json",
        "Prefer": method === "POST" ? "resolution=merge-duplicates" : "return=minimal",
      },
      body: body?JSON.stringify(body):null,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`supaFetch ${method} ${table} failed with status ${res.status}: ${errText}`);
      if (method !== "GET") {
        if (!(res.status === 404 && method === "DELETE")) {
          enqueueOp();
        }
      }
      return method === "GET" ? [] : false;
    }
    if (method === "GET") {
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    }
    return true;
  } catch (e) {
    console.warn(`supaFetch ${method} ${table} network error:`, e);
    if (method !== "GET") { enqueueOp(); }
    return method === "GET" ? [] : false;
  }
}

// Проверка наличия RPC для атомарного списания (защита от гонки данных)
let RPC_ENABLED = false;
async function checkRpcExists() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/update_raw_stock_atomic`, {
      method: "POST", headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_raw_id: "test", p_point: "test", p_delta: 0 })
    });
    RPC_ENABLED = res.status !== 404;
  } catch(e) {}
}
// Запускаем проверку при загрузке
if (typeof window !== "undefined") {
  checkRpcExists();
}

function fmtUnit(u) { return u === "г" ? "гр." : u; }

// ─── ГЛАВНОЕ ПРИЛОЖЕНИЕ ───────────────────────────────────────────────────────
const checkIsMobile = () => {
  if (typeof window === "undefined") return false;
  // window.screen.width/height — физический размер, не зависит от ориентации
  const minDim = Math.min((window.screen && window.screen.width) || 0, (window.screen && window.screen.height) || 0);
  const isPhone = minDim < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test((window.navigator && window.navigator.userAgent) || "");
  return isPhone;
};

// Портретный режим: надёжное определение для Android (включая Samsung One UI)
const checkIsPortrait = () => {
  if (typeof window === "undefined") return false;
  // Наиболее надёжный: сравниваем innerWidth vs innerHeight — всегда актуально
  if (window.innerWidth > 0 && window.innerHeight > 0) {
    return window.innerWidth < window.innerHeight;
  }
  // Современный API (Chrome Android, Safari iOS 16.4+)
  if (window.screen && window.screen.orientation) {
    return window.screen.orientation.type.startsWith("portrait");
  }
  // Fallback: устаревший window.orientation
  if (typeof window.orientation !== "undefined") {
    return window.orientation === 0 || window.orientation === 180;
  }
  return true;
};

export default function App(){
  // Восстанавливаем сессию из localStorage (с проверкой TTL 8 часов)
  const [currentUser,setCurrentUser] = useState(() => {
    if (!isSessionValid()) {
      // Сессия истекла — чистим хранилище и показываем PIN-экран
      localStorage.removeItem("vb_session_user");
      localStorage.removeItem("vb_session_page");
      localStorage.removeItem("vb_session_shift");
      return null;
    }
    return LS("vb_session_user", null);
  });
  const [page,setPage]               = useState(() =>
    isSessionValid() ? LS("vb_session_page", "dashboard") : "dashboard"
  );
  const [sidebarOpen,setSidebarOpen] = useState(true);
  const [showUserMenu,setUserMenu]   = useState(false);
  const [loading,setLoading]         = useState(true);
  const [isMobile, setIsMobile]      = useState(checkIsMobile());
  const [isPortrait, setIsPortrait]   = useState(checkIsPortrait());
  const [isOffline, setIsOffline]     = useState(typeof window !== "undefined" && window.navigator ? !window.navigator.onLine : false);

  // useRef для currentUser — решает stale closure в Realtime-подписке
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Временная метка сессии touchSession() сохранена для совместимости, автоматический выход отключен по требованию пользователя.

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const [rawStock,  setRawStock]   = useState(() => {
    const loaded = LS("vb_raw", initRawStock);
    return Array.isArray(loaded) ? loaded.map(r => ({ ...r, qty: parseQtyObj(r.qty) })) : initRawStock;
  });
  const [semiStock, setSemiStock]  = useState(() => {
    const loaded = LS("vb_semi", initSemiStock);
    return Array.isArray(loaded) ? loaded.map(s => ({ ...s, qty: parseSemiQtyObj(s.qty) })) : initSemiStock;
  });
  const [techCards, setTechCards]  = useState(() => {
    const loaded = LS("vb_tc", INIT_TECH_CARDS);
    return Array.isArray(loaded) ? loaded.map(t => ({ ...t, ings: t.ings || [] })) : INIT_TECH_CARDS;
  });
  const [sales,     setSales]      = useState(() => {
    const loaded = LS("vb_sales", []);
    return Array.isArray(loaded) ? loaded.map(s => {
      const dObj = s.created_at ? new Date(s.created_at) : new Date();
      return { ...s, id: s.id || generateUUID(), date: s.date || dObj.toLocaleDateString("ru-RU") };
    }) : [];
  });
  const [expenses,  setExpenses]   = useState(() => {
    const loaded = LS("vb_exp", []);
    return Array.isArray(loaded) ? loaded.map(e => ({ ...e, id: e.id || generateUUID() })) : [];
  });
  const [users,     setUsers]      = useState(() => {
    const loaded = LS("vb_users", INIT_USERS);
    const clean = Array.isArray(loaded)
      ? loaded.filter(u => u.id && u.id.length >= 36)
              .map(u => ({ ...u, pin: String(u.pin || "") }))  // ВСЕГДА строка!
      : [];
    return clean.length ? clean : INIT_USERS;
  });
  const [toast,showToast]          = useToast();
  const [currentShift,setCurrentShift] = useState(() => LS("vb_session_shift", null));
  const [showOpenShift,setShowOpenShift] = useState(false);
  const [customers, setCustomers] = useState(() => LS("vb_customers", []));
  const [warehouseHistory, setWarehouseHistory] = useState(() => LS("vb_warehouse_history", []));
  const [writeOffs, setWriteOffs] = useState(() => LS("vb_writeoffs_log", []));
  const [shifts, setShifts] = useState(() => LS("vb_shifts", []));
  const [preorders, setPreorders] = useState(() => {
    const loaded = LS("vb_preorders", []);
    return Array.isArray(loaded) ? loaded : [];
  });
const setWarehouseHistoryWithSync = (updater) => {
    setWarehouseHistory(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(item => supaFetch("POST", "warehouse_history", item).catch(()=>{}));
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "warehouse_history", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setWriteOffsWithSync = (updater) => {
    setWriteOffs(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(item => supaFetch("POST", "write_offs", {
        id: item.id,
        item_id: item.itemId,
        stock: item.stock,
        date: item.date,
        time: item.time,
        item: item.item,
        qty: item.qty,
        unit: item.unit,
        reason: item.reason,
        author: item.author,
        note: item.note,
        location: item.location
      }).catch(()=>{}));
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "write_offs", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setUsersWithSync = (updater) => {
    setUsers(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(u => {
        const old = prev.find(p => p.id === u.id);
        if (!old) {
          supaFetch("POST", "app_users", { id: u.id, name: u.name, role: u.role, point: u.point, pin: u.pin, is_active: true }).catch(()=>{});
        } else if (JSON.stringify(old) !== JSON.stringify(u)) {
          supaFetch("PATCH", "app_users", { name: u.name, role: u.role, point: u.point, pin: u.pin }, `?id=eq.${u.id}`).catch(()=>{});
        }
      });
      prev.forEach(old => {
        if (!next.find(n => n.id === old.id)) {
          supaFetch("PATCH", "app_users", { is_active: false }, `?id=eq.${old.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setCustomersWithSync = (updater) => {
    setCustomers(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(c => supaFetch("POST", "customers", c).catch(()=>{}));
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (oldItem && JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
          supaFetch("PATCH", "customers", { name: newItem.name, phone: newItem.phone, discount_percent: newItem.discount_percent }, `?id=eq.${newItem.id}`).catch(()=>{});
        }
      });
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "customers", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setRawStockWithSync = (updater) => {
    setRawStock(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
          let qtyChangedOnly = false;
          if (RPC_ENABLED && oldItem) {
            const oldNoQty = {...oldItem, qty:null};
            const newNoQty = {...newItem, qty:null};
            if (JSON.stringify(oldNoQty) === JSON.stringify(newNoQty)) {
              qtyChangedOnly = true;
              const qtyOld = typeof oldItem.qty === 'string' ? JSON.parse(oldItem.qty) : (oldItem.qty || {});
              const qtyNew = typeof newItem.qty === 'string' ? JSON.parse(newItem.qty) : (newItem.qty || {});
              const allPts = new Set([...Object.keys(qtyOld), ...Object.keys(qtyNew)]);
              for (const pt of allPts) {
                const diff = (qtyNew[pt] || 0) - (qtyOld[pt] || 0);
                if (diff !== 0) {
                  supaFetch("POST", "rpc/update_raw_stock_atomic", { p_raw_id: newItem.id, p_point: pt, p_delta: diff }).catch(()=>{});
                }
              }
            }
          }
          if (!qtyChangedOnly) {
            supaFetch("POST", "raw_stock", newItem).catch(()=>{});
          }
        }
      });
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "raw_stock", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setSemiStockWithSync = (updater) => {
    setSemiStock(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
          let qtyChangedOnly = false;
          if (RPC_ENABLED && oldItem) {
            const oldNoQty = {...oldItem, qty:null};
            const newNoQty = {...newItem, qty:null};
            if (JSON.stringify(oldNoQty) === JSON.stringify(newNoQty)) {
              qtyChangedOnly = true;
              const qtyOld = typeof oldItem.qty === 'string' ? JSON.parse(oldItem.qty) : (oldItem.qty || {});
              const qtyNew = typeof newItem.qty === 'string' ? JSON.parse(newItem.qty) : (newItem.qty || {});
              const allPts = new Set([...Object.keys(qtyOld), ...Object.keys(qtyNew)]);
              for (const pt of allPts) {
                const diff = (qtyNew[pt] || 0) - (qtyOld[pt] || 0);
                if (diff !== 0) {
                  supaFetch("POST", "rpc/update_semi_stock_atomic", { p_semi_id: newItem.id, p_point: pt, p_delta: diff }).catch(()=>{});
                }
              }
            }
          }
          if (!qtyChangedOnly) {
            supaFetch("POST", "semi_stock", newItem).catch(()=>{});
          }
        }
      });
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "semi_stock", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setTechCardsWithSync = (updater) => {
    setTechCards(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
          supaFetch("POST", "tech_cards", newItem).catch(()=>{});
        }
      });
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "tech_cards", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      return next;
    });
  };

const setSalesWithSync = (updater) => {
    setSales(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      
      // Added sales
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(newSale => {
        supaFetch("POST", "sales", {
          id: newSale.id,
          no: newSale.no,
          point: newSale.point,
          items: newSale.items,
          total: newSale.total,
          subtotal: newSale.subtotal || newSale.total,
          disc_amt: newSale.discAmt || 0,
          discount: newSale.discount || 0,
          cogs: newSale.cogs || 0,
          pay_mode: newSale.payMode,
          payments: newSale.payments || [],
          cash_given: newSale.cashGiven || 0,
          change_amt: newSale.change || 0,
          sale_time: newSale.time,
          date: newSale.date,
          shift_id: newSale.shift_id || null,
          status: newSale.status || "active",
        }).catch(()=>{});
      });
      
      // Modified sales
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (oldItem && (oldItem.status !== newItem.status || oldItem.delete_requested_by !== newItem.delete_requested_by || oldItem.delete_approved_by !== newItem.delete_approved_by)) {
          supaFetch("PATCH", "sales", {
            status: newItem.status,
            delete_requested_by: newItem.delete_requested_by,
            delete_approved_by: newItem.delete_approved_by,
          }, `?id=eq.${newItem.id}`).catch(()=>{});
        }
      });
      
      // Deleted sales
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "sales", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      
      return next;
    });
  };

const setExpensesWithSync = (updater) => {
    setExpenses(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      
      // Added expenses
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(e => supaFetch("POST", "expenses", {
        id: e.id,
        cat: e.cat,
        note: e.desc || e.note,
        amount: e.amount,
        point: e.point,
        paid: e.paid,
        expense_date: e.date,
      }).catch(()=>{}));
      
      // Modified expenses
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (oldItem && (oldItem.paid !== newItem.paid || oldItem.amount !== newItem.amount || oldItem.desc !== newItem.desc || oldItem.note !== newItem.note || oldItem.cat !== newItem.cat || oldItem.date !== newItem.date || oldItem.point !== newItem.point)) {
          supaFetch("PATCH", "expenses", {
            cat: newItem.cat,
            note: newItem.desc || newItem.note,
            amount: newItem.amount,
            point: newItem.point,
            paid: newItem.paid,
            expense_date: newItem.date,
          }, `?id=eq.${newItem.id}`).catch(()=>{});
        }
      });
      
      // Deleted expenses
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "expenses", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });
      
      return next;
    });
  };

  const setPreordersWithSync = (updater) => {
    setPreorders(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;

      // Added preorders
      const added = next.filter(n => !prev.find(p => p.id === n.id));
      added.forEach(p => {
        supaFetch("POST", "preorders", {
          id: p.id,
          point: p.point,
          customer_id: p.customer_id || null,
          customer_name: p.customer_name,
          customer_phone: p.customer_phone,
          items: p.items,
          subtotal: p.subtotal,
          discount: p.discount || 0,
          disc_amt: p.disc_amt || 0,
          total: p.total,
          prepayment: p.prepayment || 0,
          prepayment_method: p.prepayment_method || null,
          prepayment_shift_id: p.prepayment_shift_id || null,
          target_date: p.target_date,
          target_time: p.target_time,
          status: p.status || "pending",
          notes: p.notes || "",
          created_by: p.created_by || null,
          created_at: p.created_at || new Date().toISOString(),
          completed_shift_id: p.completed_shift_id || null,
          completed_at: p.completed_at || null,
          remaining_payment: p.remaining_payment || 0,
          remaining_method: p.remaining_method || null,
        }).catch(()=>{});
      });

      // Modified preorders
      next.forEach(newItem => {
        const oldItem = prev.find(p => p.id === newItem.id);
        if (oldItem && (
          oldItem.status !== newItem.status ||
          oldItem.completed_shift_id !== newItem.completed_shift_id ||
          oldItem.completed_at !== newItem.completed_at ||
          oldItem.remaining_payment !== newItem.remaining_payment ||
          oldItem.remaining_method !== newItem.remaining_method
        )) {
          supaFetch("PATCH", "preorders", {
            status: newItem.status,
            completed_shift_id: newItem.completed_shift_id,
            completed_at: newItem.completed_at,
            remaining_payment: newItem.remaining_payment,
            remaining_method: newItem.remaining_method,
          }, `?id=eq.${newItem.id}`).catch(()=>{});
        }
      });

      // Deleted preorders
      prev.forEach(oldItem => {
        if (!next.find(n => n.id === oldItem.id)) {
          supaFetch("DELETE", "preorders", null, `?id=eq.${oldItem.id}`).catch(()=>{});
        }
      });

      return next;
    });
  };





  
  
  
  
  const processSyncQueue = async () => {
    const queue = LS("vb_sync_queue", []);
    if (!queue.length) return;
    if (typeof window !== "undefined" && window.navigator && !window.navigator.onLine) return;
    
    console.log(`Обработка очереди офлайн-синхронизации: ${queue.length} элементов`);
    const nextQueue = [];
    let processedAny = false;
    
    for (const item of queue) {
      try {
        const url = `${SUPA_URL}/rest/v1/${item.table}${item.params || ""}`;
        const res = await fetch(url, {
          method: item.method,
          headers: {
            "apikey": SUPA_KEY,
            "Authorization": `Bearer ${SUPA_KEY}`,
            "Content-Type": "application/json",
            "Prefer": item.method === "POST" ? "resolution=merge-duplicates" : "return=minimal",
          },
          body: item.body ? JSON.stringify(item.body) : null,
        });
        
        if (res.ok) {
          console.log(`Синхронизировано в фоновом режиме: ${item.method} ${item.table}`);
          processedAny = true;
        } else {
          const errText = await res.text().catch(() => "");
          console.warn(`Ошибка фоновой синхронизации ${item.method} ${item.table}: status ${res.status}: ${errText}`);
          // Prevent data loss: retain item in queue even for 4xx errors (e.g. 401 Unauthorized token expiry)
          if (res.status === 404 && item.method === "DELETE") {
             // Safe to drop 404 on DELETE, it's already gone
          } else {
            nextQueue.push(item);
          }
        }
      } catch (e) {
        console.warn(`Сеть недоступна для фоновой синхронизации:`, e);
        nextQueue.push(item);
      }
    }
    
    localStorage.setItem("vb_sync_queue", JSON.stringify(nextQueue));
    if (processedAny) {
      showToast("Локальные изменения успешно отправлены в облако!");
    }
  };

  // Эффект периодической проверки оффлайн очереди синхронизации
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      processSyncQueue();
    };
    window.addEventListener("online", handleOnline);
    
    // Периодический опрос очереди (каждые 15 секунд)
    const timer = setInterval(() => {
      processSyncQueue();
      load();
    }, 15000);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Эффект Realtime-подписок на таблицы Supabase объединен ниже с основным эффектом


  useEffect(()=>{
    document.title = "VkusBuket";
    const handleResize = () => {
      const mobile = checkIsMobile();
      const portrait = checkIsPortrait();
      setIsMobile(mobile);
      setIsPortrait(portrait);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    // Задержка при orientationchange — браузер обновляет window.screen.orientation асинхронно
    const handleOrientationChange = () => setTimeout(handleResize, 100);

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    // Современный API (Chrome Android, Safari iOS 16.4+)
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener("change", handleOrientationChange);
    }
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      if (window.screen && window.screen.orientation) {
        window.screen.orientation.removeEventListener("change", handleOrientationChange);
      }
    };
  }, []);

  useEffect(()=>{
    const load = async () => {
      try {
        const [raw,semi,tc,sl,exp,appUsers,custs,sh,whHist,wrOffs,preords] = await Promise.all([
          supaFetch("GET","raw_stock"),
          supaFetch("GET","semi_stock"),
          supaFetch("GET","tech_cards"),
          supaFetch("GET","sales","",`?order=created_at.desc&limit=500`),
          supaFetch("GET","expenses"),
          supaFetch("GET","app_users","",`?is_active=eq.true`),
          supaFetch("GET","customers"),
          supaFetch("GET","shifts","",`?order=opened_at.desc&limit=100`),
          supaFetch("GET","warehouse_history","",`?order=created_at.desc&limit=500`),
          supaFetch("GET","write_offs","",`?order=created_at.desc&limit=500`),
          supaFetch("GET","preorders","",`?order=created_at.desc&limit=500`),
        ]);
        
        if (Array.isArray(custs)) {
          setCustomers(prev => getMergedList(custs, prev, "customers"));
        }
        if (Array.isArray(raw)) {
          setRawStock(prev => getMergedList(raw, prev, "raw_stock"));
        }
        if (Array.isArray(semi)) {
          setSemiStock(prev => getMergedList(semi, prev, "semi_stock"));
        }
        if (Array.isArray(tc)) {
          const mapped = tc.map(t=>({...t,ings:t.ings||[]}));
          setTechCards(prev => getMergedList(mapped, prev, "tech_cards"));
        }
        if (Array.isArray(sh)) {
          setShifts(prev => getMergedList(sh, prev, "shifts"));
        }
        if (Array.isArray(whHist)) {
          setWarehouseHistory(prev => getMergedList(whHist, prev, "warehouse_history"));
        }
        if (Array.isArray(wrOffs)) {
          setWriteOffs(prev => getMergedList(wrOffs, prev, "write_offs"));
        }
        if (Array.isArray(sl)) {
          const fetchedSales = sl.map(s=>{
            const dObj = s.created_at ? new Date(s.created_at) : new Date();
            return {
              ...s,
              items: s.items || [],
              payMode: s.pay_mode,
              time: s.sale_time,
              cogs: s.cogs || 0,
              date: s.date || dObj.toLocaleDateString("ru-RU")
            };
          });
          setSales(prev => {
            const merged = getMergedList(fetchedSales, prev, "sales");
            return merged.sort((a,b) => a.no - b.no);
          });
        }
        if (Array.isArray(exp)) {
          const mapped = exp.map(e=>({...e,desc:e.note,date:e.expense_date}));
          setExpenses(prev => getMergedList(mapped, prev, "expenses"));
        }
        if (Array.isArray(preords)) {
          setPreorders(prev => getMergedList(preords, prev, "preorders"));
        }

        // Phase 5: Load users from app_users, populate if empty
        if (Array.isArray(appUsers) && appUsers.length) {
          setUsers(prev => {
            const mapped = appUsers.map(u => {
              const localUser = prev.find(p => p.id === u.id);
              const pinVal = String(u.pin || "");
              const finalPin = (pinVal === "" && localUser && localUser.pin) ? String(localUser.pin) : pinVal;
              return { ...u, pin: finalPin };
            });
            const merged = getMergedList(mapped, prev, "app_users");
            // Принудительно восстанавливаем PIN из БД, если локальный кэш затер его пустым значением
            return merged.map(m => {
              const dbUser = appUsers.find(u => u.id === m.id);
              if (dbUser && dbUser.pin && (!m.pin || m.pin === "")) {
                return { ...m, pin: dbUser.pin };
              }
              return m;
            });
          });
        } else if (Array.isArray(appUsers) && appUsers.length === 0) {
          // Populate app_users from INIT_USERS (one-time)
          for(const u of INIT_USERS) {
            supaFetch("POST","app_users",{id:u.id,name:u.name,role:u.role,point:u.point,pin:u.pin,is_active:true}).catch(()=>{});
          }
        }

        // Phase 4: Populate raw_material_prices if empty (one-time)
        const prices = await supaFetch("GET","raw_material_prices","",`?limit=1`);
        if(Array.isArray(prices)&&prices.length===0&&Array.isArray(raw)&&raw.length) {
          const priceRows = raw.map(r=>({raw_id:r.id,price:r.price,effective_from:new Date().toISOString()}));
          supaFetch("POST","raw_material_prices",priceRows).catch(()=>{});
        }
      } catch(e) {
        console.warn("Supabase недоступен, работаем локально:",e);
      } finally {
        setLoading(false);
      }
    };
    load();
  },[]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_raw",JSON.stringify(rawStock));
  },[rawStock,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_semi",JSON.stringify(semiStock));
  },[semiStock,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_tc",JSON.stringify(techCards));
  },[techCards,loading]);

  useEffect(()=>{
    if(loading) return;
    // pin сохраняем как строку, чтобы при чтении тип был корректным
    const usersToSave = users.map(u => ({ ...u, pin: String(u.pin || "") }));
    localStorage.setItem("vb_users", JSON.stringify(usersToSave));
  },[users,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_sales",JSON.stringify(sales));
  },[sales,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_customers",JSON.stringify(customers));
  },[customers,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_exp",JSON.stringify(expenses));
  },[expenses,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_shifts",JSON.stringify(shifts));
  },[shifts,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_warehouse_history",JSON.stringify(warehouseHistory));
  },[warehouseHistory,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_writeoffs_log",JSON.stringify(writeOffs));
  },[writeOffs,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_preorders",JSON.stringify(preorders));
  },[preorders,loading]);

  // Сохраняем сессию пользователя в localStorage для восстановления после авто-перезагрузки PWA
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("vb_session_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("vb_session_user");
      localStorage.removeItem("vb_session_page");
      localStorage.removeItem("vb_session_shift");
      localStorage.removeItem("vb_pos_cart");
      // Очищаем локальные кэши таблиц для исключения утечек состояний между кассирами
      localStorage.removeItem("vb_raw");
      localStorage.removeItem("vb_semi");
      localStorage.removeItem("vb_sales");
      localStorage.removeItem("vb_exp");
      localStorage.removeItem("vb_customers");
      localStorage.removeItem("vb_warehouse_history");
      localStorage.removeItem("vb_writeoffs_log");
      localStorage.removeItem("vb_shifts");
      localStorage.removeItem("vb_preorders");
    }
  }, [currentUser]);

  useEffect(() => {
    if (page) {
      localStorage.setItem("vb_session_page", JSON.stringify(page));
    }
  }, [page]);

  useEffect(() => {
    if (currentShift) {
      localStorage.setItem("vb_session_shift", JSON.stringify(currentShift));
    } else {
      localStorage.removeItem("vb_session_shift");
    }
  }, [currentShift]);

  // Realtime subscription
  // Realtime subscription (consolidated for all tables)
  useEffect(() => {
    if (!supabase || loading) return;

    const channel = supabase
      .channel("vkusbuket-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "raw_stock" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setRawStock(prev => prev.filter(r => r.id !== oldRow.id));
        } else {
          const parsed = { ...newRow, qty: parseQtyObj(newRow.qty) };
          setRawStock(prev => {
            const idx = prev.findIndex(r => r.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "semi_stock" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setSemiStock(prev => prev.filter(s => s.id !== oldRow.id));
        } else {
          const parsed = { ...newRow, qty: parseSemiQtyObj(newRow.qty), rawId: newRow.rawId || newRow.raw_id };
          setSemiStock(prev => {
            const idx = prev.findIndex(s => s.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tech_cards" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setTechCards(prev => prev.filter(t => t.id !== oldRow.id));
        } else {
          const parsed = { ...newRow, ings: newRow.ings || [] };
          setTechCards(prev => {
            const idx = prev.findIndex(t => t.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setSales(prev => prev.filter(s => s.id !== oldRow.id));
        } else {
          const dObj = newRow.created_at ? new Date(newRow.created_at) : new Date();
          const parsed = {
            ...newRow,
            items: newRow.items || [],
            payMode: newRow.pay_mode,
            time: newRow.sale_time,
            cogs: newRow.cogs || 0,
            date: newRow.date || dObj.toLocaleDateString("ru-RU")
          };
          setSales(prev => {
            const idx = prev.findIndex(s => s.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setExpenses(prev => prev.filter(e => e.id !== oldRow.id));
        } else {
          const parsed = { ...newRow, desc: newRow.note, date: newRow.expense_date };
          setExpenses(prev => {
            const idx = prev.findIndex(e => e.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setCustomers(prev => prev.filter(c => c.id !== oldRow.id));
        } else {
          setCustomers(prev => {
            const idx = prev.findIndex(c => c.id === newRow.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(newRow)) return prev;
              const next = [...prev];
              next[idx] = newRow;
              return next;
            } else {
              return [...prev, newRow];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_users" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setUsers(prev => prev.filter(u => u.id !== oldRow.id));
        } else {
          // pin может приходить как integer из Realtime — всегда приводим к String
          const parsed = { id: newRow.id, name: newRow.name, role: newRow.role, point: newRow.point, pin: String(newRow.pin||"") };
          setUsers(prev => {
            const idx = prev.findIndex(u => u.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [...prev, parsed];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "warehouse_history" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setWarehouseHistory(prev => prev.filter(h => h.id !== oldRow.id));
        } else {
          setWarehouseHistory(prev => {
            const idx = prev.findIndex(h => h.id === newRow.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(newRow)) return prev;
              const next = [...prev];
              next[idx] = newRow;
              return next;
            } else {
              return [newRow, ...prev];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "write_offs" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setWriteOffs(prev => prev.filter(w => w.id !== oldRow.id));
        } else {
          const parsed = {
            id: newRow.id,
            itemId: newRow.item_id,
            stock: newRow.stock,
            date: newRow.date,
            time: newRow.time,
            item: newRow.item,
            qty: parseFloat(newRow.qty),
            unit: newRow.unit,
            reason: newRow.reason,
            author: newRow.author,
            note: newRow.note,
            location: newRow.location
          };
          setWriteOffs(prev => {
            const idx = prev.findIndex(w => w.id === parsed.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(parsed)) return prev;
              const next = [...prev];
              next[idx] = parsed;
              return next;
            } else {
              return [parsed, ...prev];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "preorders" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setPreorders(prev => prev.filter(p => p.id !== oldRow.id));
        } else {
          setPreorders(prev => {
            const idx = prev.findIndex(p => p.id === newRow.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(newRow)) return prev;
              const next = [...prev];
              next[idx] = newRow;
              return next;
            } else {
              return [...prev, newRow];
            }
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === "DELETE") {
          setShifts(prev => prev.filter(s => s.id !== oldRow.id));
          setCurrentShift(prev => (prev && prev.id === oldRow.id) ? null : prev);
        } else {
          setShifts(prev => {
            const idx = prev.findIndex(s => s.id === newRow.id);
            if (idx >= 0) {
              if (JSON.stringify(prev[idx]) === JSON.stringify(newRow)) return prev;
              const next = [...prev];
              next[idx] = newRow;
              return next;
            } else {
              return [newRow, ...prev];
            }
          });
          // Используем currentUserRef.current вместо currentUser из замыкания (stale closure fix)
          const cu = currentUserRef.current;
          if (cu && newRow.cashier_pin === cu.pin && newRow.point === cu.point) {
            if (newRow.status === "open") {
              setCurrentShift(newRow);
            } else if (newRow.status === "closed") {
              setCurrentShift(prev => (prev && prev.id === newRow.id) ? null : prev);
            }
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, currentUser]);

  
  
  
  
  const handleCancelSale = async (saleNo) => {
    if (currentUser?.role !== "owner" && currentUser?.role !== "director") {
      showToast("Доступ ограничен. Только Владелец или Директор могут аннулировать продажи.", true);
      return;
    }
    const sale = sales.find(s => s.no === saleNo);
    if (!sale) return;
    const { newRaw, newSemi } = restoreStockForSale(sale, rawStock, semiStock, techCards);
    setRawStockWithSync(newRaw);
    setSemiStockWithSync(newSemi);
    setSalesWithSync(prev => prev.filter(s => s.id !== sale.id));
    showToast("Продажа #" + saleNo + " аннулирована!");
  };

  
  // ── ЭКРАН ЗАГРУЗКИ ──
  if(loading) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0F0F13",color:"#E8A0B4",flexDirection:"column",gap:16}}>
      <div style={{fontSize:32,fontWeight:900,letterSpacing:-1}}>VKUS<span style={{color:"#EAEAF0",fontWeight:300}}>BUKET</span></div>
      <div style={{fontSize:14,color:"#7A7A94"}}>⟳ Загрузка данных...</div>
    </div>
  );

  // ── PIN-ЭКРАН ──
  const ROLE_FALLBACK = { label:"?", icon:"👤", color:C.muted, nav:["dashboard","pos"] };

  // Phase 3: handle login with shift check for cashiers
  // ── Stale closure fix: используем Ref вместо переменной из замыкания
  const handleLogin = async (u) => {
    setCurrentUser(u);
    touchSession(); // Записываем timestamp входа для TTL
    setPage((ROLES[u.role]||ROLE_FALLBACK).nav[0]);
    if(u.role==="cashier" && u.point) {
      const localOpen = shifts.find(s => String(s.cashier_pin) === String(u.pin) && s.point === u.point && s.status === "open");
      if (localOpen) {
        setCurrentShift(localOpen);
      } else {
        try {
          const openShifts = await supaFetch("GET","shifts","",`?cashier_pin=eq.${u.pin}&status=eq.open&select=*`);
          if(Array.isArray(openShifts) && openShifts.length > 0) {
            setCurrentShift(openShifts[0]);
            setShifts(prev => {
              if (!prev.find(s => s.id === openShifts[0].id)) {
                return [openShifts[0], ...prev];
              }
              return prev;
            });
          } else {
            setShowOpenShift(true);
          }
        } catch { setShowOpenShift(true); }
      }
    }
  };

  const handleOpenShift = async () => {
    if(!currentUser) return;
    const shiftId = generateUUID();
    const shift = {
      id: shiftId,
      point: currentUser.point,
      cashier_name: currentUser.name,
      cashier_pin: currentUser.pin,
      opened_at: new Date().toISOString(),
      expected_cash: 0,
      actual_cash: 0,
      discrepancy: 0,
      status: "open",
    };
    
    setCurrentShift(shift);
    setShifts(prev => [shift, ...prev]);

    await supaFetch("POST", "shifts", shift);
    
    setShowOpenShift(false);
    showToast("Смена открыта!");
  };

  const handleCloseShift = (actualCash, expectedCash, discrepancy) => {
    if (currentShift) {
      const updated = {
        closed_at: new Date().toISOString(),
        actual_cash: actualCash,
        expected_cash: expectedCash,
        discrepancy,
        status: "closed"
      };
      setShifts(prev => prev.map(s => s.id === currentShift.id ? { ...s, ...updated } : s));
      supaFetch("PATCH", "shifts", updated, `?id=eq.${currentShift.id}`).catch(()=>{});
    }
    // Очищаем сессию при закрытии смены
    localStorage.removeItem("vb_session_user");
    localStorage.removeItem("vb_session_page");
    localStorage.removeItem("vb_session_shift");
    localStorage.removeItem("vb_pos_cart");
    setCurrentShift(null);
    setCurrentUser(null);
    showToast("Смена закрыта, выход из системы");
  };

  if(!currentUser) return <PinScreen users={users} onLogin={handleLogin} />;

  const role       = ROLES[currentUser.role] || ROLE_FALLBACK;
  const userNav    = [...role.nav];
  if (currentUser.role === "cashier" && currentUser.point === "Мастерская") {
    if (!userNav.includes("production")) {
      userNav.push("production");
    }
    if (!userNav.includes("preorders")) {
      userNav.push("preorders");
    }
  }
  const allowedNav = NAV.filter(n=>userNav.includes(n.id));

  const totalRev = sales.reduce((s,i)=>s+i.total,0);
  const totalOrd = sales.length;

  return(
    <div style={{fontFamily:"'Segoe UI',sans-serif",background:C.bg,height:"100dvh",display:"flex",flexDirection:(isMobile && isPortrait)?"column":"row",color:C.text,overflow:"hidden",position:"relative"}}>
      <Toast toast={toast}/>
      {showUserMenu && <PinScreen users={users} onLogin={(u)=>{handleLogin(u);setUserMenu(false);showToast(`Вошли как: ${u.name}`);}} onClose={()=>setUserMenu(false)}/>}

      {/* Модалка открытия смены */}
      {showOpenShift && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
          <div style={{background:C.card,borderRadius:16,padding:28,width:340,maxWidth:"90vw",border:`1px solid ${C.border}`,textAlign:"center",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:36,marginBottom:12}}>🔓</div>
            <div style={{fontSize:18,fontWeight:800,marginBottom:8}}>Открыть смену?</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Точка: <b>{currentUser?.point}</b><br/>Кассир: <b>{currentUser?.name}</b></div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setShowOpenShift(false);setCurrentUser(null);}} style={{flex:1,padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600}}>Отмена</button>
              <button onClick={handleOpenShift} style={{flex:1,padding:12,borderRadius:10,border:"none",background:C.green,color:"#000",cursor:"pointer",fontWeight:800,fontSize:14}}>Открыть</button>
            </div>
          </div>
        </div>
      )}

      {/* САЙДБАР (МОБИЛЬНЫЙ ВЫЕЗДНОЙ ИЛИ ДЕКСТОПНЫЙ СТАТИЧЕСКИЙ) */}
      {/* В портретном режиме на телефоне — сайдбар скрыт, навигация снизу */}
      {isMobile && sidebarOpen && !isPortrait && (
        <div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:998}} />
      )}
      
      <div style={{
        width: (isMobile && isPortrait) ? 0 : (sidebarOpen ? 220 : isMobile ? 0 : 58),
        background:C.surface,
        borderRight:`1px solid ${C.border}`,
        display:"flex",
        flexDirection:"column",
        flexShrink:0,
        transition:"width .2s, left .2s",
        overflow:"hidden",
        height:"100vh",
        position: isMobile ? "fixed" : "sticky",
        left: (isMobile && isPortrait) ? -220 : (isMobile ? (sidebarOpen ? 0 : -220) : 0),
        top:0,
        zIndex:999
      }}>
        <div style={{padding:(sidebarOpen || isMobile)?"18px 14px":"18px 0",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:(sidebarOpen || isMobile)?"space-between":"center"}}>
          {(sidebarOpen || isMobile) && <span style={{fontSize:20,fontWeight:900,color:C.accent,letterSpacing:-0.5}}>VKUS<span style={{color:C.text,fontWeight:300}}>BUKET</span></span>}
          <button onClick={()=>setSidebarOpen(v=>!v)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:4,flexShrink:0}}>{sidebarOpen?"←":"→"}</button>
        </div>

        <div style={{flex:1,padding:"10px 6px",overflowY:"auto"}}>
          {allowedNav.map(n=>{
            const active=page===n.id;
            return(
              <button key={n.id} onClick={()=>{setPage(n.id); if(isMobile) setSidebarOpen(false);}} title={!sidebarOpen?n.label:""} style={{display:"flex",alignItems:"center",justifyContent:(sidebarOpen || isMobile)?"flex-start":"center",gap:10,padding:"11px 10px",borderRadius:10,border:"none",cursor:"pointer",background:active?C.accentSoft:"transparent",color:active?C.accent:C.muted,fontWeight:active?700:400,width:"100%",textAlign:"left",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden"}}>
                <span style={{fontSize:18,flexShrink:0}}>{n.icon}</span>
                {(sidebarOpen || isMobile) &&<span style={{fontSize:13}}>{n.label}</span>}
              </button>
            );
          })}
        </div>

        <div style={{padding:"10px 8px",borderTop:`1px solid ${C.border}`}}>
          <button onClick={()=>setUserMenu(true)} style={{display:"flex",alignItems:"center",justifyContent:(sidebarOpen || isMobile)?"flex-start":"center",gap:10,padding:"8px 8px",borderRadius:10,border:"none",background:"transparent",color:C.text,cursor:"pointer",width:"100%",textAlign:"left"}}>
            <div style={{width:32,height:32,borderRadius:16,background:role.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{role.icon}</div>
            {(sidebarOpen || isMobile) &&<div>
              <div style={{fontSize:12,fontWeight:700}}>{currentUser.name}</div>
              <div style={{fontSize:10,color:C.muted}}>{role.label}{currentUser.point?" · "+currentUser.point:""}</div>
            </div>}
          </button>
          <button onClick={()=>{
            setCurrentUser(null);
            localStorage.removeItem("vb_session_user");
          }} style={{marginTop:8, display:"flex",alignItems:"center",justifyContent:(sidebarOpen || isMobile)?"flex-start":"center",gap:10,padding:"10px 10px",borderRadius:10,border:`1px solid ${C.red}33`,background:"transparent",color:C.red,cursor:"pointer",width:"100%",fontWeight:700}}>
            <span style={{fontSize:16,flexShrink:0}}>🚪</span>
            {(sidebarOpen || isMobile) && <span style={{fontSize:13}}>Выйти (Сменить)</span>}
          </button>
        </div>
      </div>

      {/* ОСНОВНОЙ КОНТЕНТ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",width:"100%"}}>
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"13px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {isMobile && !isPortrait && (
              <button onClick={()=>setSidebarOpen(true)} style={{background:"transparent",border:"none",color:C.text,fontSize:22,cursor:"pointer",padding:0}}>☰</button>
            )}
            <div style={{fontSize:16,fontWeight:800}}>{NAV.find(n=>n.id===page)?.label}</div>
            {isOffline && (
              <div style={{background:C.redSoft, border:`1px solid ${C.red}`, color:C.red, borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:700, marginLeft:10}}>
                ⚠️ Нет связи, работаем автономно
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:10}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",fontSize:12}}>
              <span style={{color:C.muted}}>Заказов: </span><span style={{fontWeight:700,color:C.blue}}>{totalOrd}</span>
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",fontSize:12,display:isMobile?"none":"block"}}>
              <span style={{color:C.muted}}>Выручка: </span><span style={{fontWeight:700,color:C.accent}}>{fmtS(totalRev)}</span>
            </div>
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:(isMobile && isPortrait) ? 68 : 0,minHeight:0}}>
          {page==="dashboard"  && <Dashboard  isMobile={isMobile} sales={sales} semiStock={semiStock} rawStock={rawStock} expenses={expenses} currentUser={currentUser} onCancelSale={handleCancelSale} users={users} setSales={setSales} showToast={showToast}/>}
          {page==="pos"        && <POS        isMobile={isMobile} semiStock={semiStock} setSemiStock={setSemiStockWithSync} rawStock={rawStock} setRawStock={setRawStockWithSync} sales={sales} setSales={setSalesWithSync} currentUser={currentUser} techCards={techCards} currentShift={currentShift} onCloseShift={handleCloseShift} onCancelSale={handleCancelSale} customers={customers} preorders={preorders} setPreorders={setPreordersWithSync} setCustomers={setCustomersWithSync}/>}
          {page==="preorders"  && <Preorders isMobile={isMobile} preorders={preorders} setPreorders={setPreordersWithSync} sales={sales} setSales={setSalesWithSync} semiStock={semiStock} setSemiStock={setSemiStockWithSync} rawStock={rawStock} setRawStock={setRawStockWithSync} currentUser={currentUser} currentShift={currentShift} customers={customers} techCards={techCards} showToast={showToast}/>}
          {page==="production" && <Production isMobile={isMobile} rawStock={rawStock} setRawStock={setRawStockWithSync} semiStock={semiStock} setSemiStock={setSemiStockWithSync} currentUser={currentUser}/>}
          {page==="warehouse"  && <Warehouse  isMobile={isMobile} rawStock={rawStock} setRawStock={setRawStockWithSync} semiStock={semiStock} setSemiStock={setSemiStockWithSync} currentUser={currentUser} sales={sales} expenses={expenses} techCards={techCards} history={warehouseHistory} setHistory={setWarehouseHistoryWithSync}/>}
          {page==="inventory"  && <Inventory  isMobile={isMobile} semiStock={semiStock} setSemiStock={setSemiStockWithSync} rawStock={rawStock} setRawStock={setRawStockWithSync} currentUser={currentUser} setExpenses={setExpensesWithSync}/>}
          {page==="writeoff"   && <WriteOff   isMobile={isMobile} rawStock={rawStock} setRawStock={setRawStockWithSync} semiStock={semiStock} setSemiStock={setSemiStockWithSync} currentUser={currentUser} log={writeOffs} setLog={setWriteOffsWithSync}/>}
          {page==="expenses"   && <Expenses   isMobile={isMobile} expenses={expenses} setExpenses={setExpensesWithSync} currentUser={currentUser}/>}
          {page==="reports"    && <Reports    isMobile={isMobile} sales={sales} expenses={expenses} rawStock={rawStock} semiStock={semiStock} currentUser={currentUser}/>}
          {page==="shifts"     && <Shifts     isMobile={isMobile} shifts={shifts}/>}
          {page==="settings"   && <Settings   isMobile={isMobile} techCards={techCards} setTechCards={setTechCardsWithSync} rawStock={rawStock} setRawStock={setRawStockWithSync} semiStock={semiStock} users={users} setUsers={setUsersWithSync} customers={customers} setCustomers={setCustomersWithSync}/>}
        </div>
      </div>

      {/* НИЖНЯЯ НАВИГАЦИЯ ДЛЯ ПОРТРЕТНОГО МОБИЛЬНОГО */}
      {isMobile && isPortrait && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,height:64,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-around",zIndex:999,paddingBottom:"env(safe-area-inset-bottom)"}}>
          {allowedNav.slice(0,4).map(n => (
            <button key={n.id} onClick={()=>setPage(n.id)}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"transparent",border:"none",cursor:"pointer",padding:"6px 0",gap:2,color:page===n.id?C.accent:C.muted,transition:"color .15s"}}>
              <span style={{fontSize:20}}>{n.icon}</span>
              <span style={{fontSize:9,fontWeight:page===n.id?700:400,letterSpacing:0}}>{n.label}</span>
            </button>
          ))}
          <button onClick={()=>setSidebarOpen(v=>!v)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"transparent",border:"none",cursor:"pointer",padding:"6px 0",gap:2,color:sidebarOpen?C.accent:C.muted}}>
            <span style={{fontSize:20}}>{sidebarOpen?"👤":"☰"}</span>
            <span style={{fontSize:9,fontWeight:sidebarOpen?700:400}}>Профиль</span>
          </button>
        </div>
      )}

      {/* ВЫЕЗДНОЕ МЕНЮ «ЕЩЁ» в портрете */}
      {isMobile && isPortrait && sidebarOpen && (
        <>
          <div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000}}/>
          <div style={{position:"fixed",bottom:64,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,zIndex:1001,display:"flex",flexDirection:"column",padding:"12px 16px",gap:16}}>
            {/* User Profile in Overflow Menu */}
            <div style={{display:"flex",alignItems:"center",gap:12,paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
              <div style={{width:40,height:40,borderRadius:20,background:role.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{role.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700}}>{currentUser.name}</div>
                <div style={{fontSize:12,color:C.muted}}>{role.label}{currentUser.point?" · "+currentUser.point:""}</div>
              </div>
              <button onClick={()=>{
                setSidebarOpen(false);
                setCurrentUser(null);
                localStorage.removeItem("vb_session_user");
              }} style={{padding:"8px 12px",borderRadius:8,border:`1px solid ${C.red}33`,background:"transparent",color:C.red,fontWeight:700,cursor:"pointer"}}>
                Выйти
              </button>
            </div>

            {/* Overflow Nav Items */}
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {allowedNav.slice(4).map(n => (
                <button key={n.id} onClick={()=>{setPage(n.id);setSidebarOpen(false);}}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"10px 16px",background:page===n.id?C.accentSoft:C.card,border:`1px solid ${page===n.id?C.accent:C.border}`,borderRadius:10,color:page===n.id?C.accent:C.text,cursor:"pointer",fontSize:13,fontWeight:page===n.id?700:400}}>
                  {n.icon} {n.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
