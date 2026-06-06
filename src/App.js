import { useState, useEffect } from "react";

// ─── ЦВЕТА ───────────────────────────────────────────────────────────────────
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

const POINT_COLORS = ["#E8A0B4","#3498DB","#2ECC71","#9B59B6"];
const POINTS = ["Точка №1","Точка №2","Точка №3","Точка №4"];

const ROLES = {
  owner:       { label:"Владелец",    icon:"👑", color:C.accent,  nav:["dashboard","pos","production","warehouse","inventory","writeoff","expenses","reports","settings"] },
  manager:     { label:"Управляющий", icon:"🏪", color:C.blue,    nav:["dashboard","pos","warehouse","inventory","writeoff"] },
  cashier:     { label:"Кассир",      icon:"🧾", color:C.green,   nav:["pos"] },
  storekeeper: { label:"Кладовщик",   icon:"📦", color:C.yellow,  nav:["warehouse","production","inventory","writeoff"] }
};

const INIT_USERS = [
  { id:1, name:"Вы (Владелец)",  role:"owner",       point:null },
  { id:2, name:"Айгерим — Т.1", role:"cashier",     point:"Точка №1" },
  { id:3, name:"Данияр — Склад",role:"storekeeper", point:"Центральный склад" },
  { id:4, name:"Сауле — Т.2",   role:"manager",     point:"Точка №2" }
];

// ─── СЫРЬЁ ───────────────────────────────────────────────────────────────────
// ✅ Остатки загружены из Инвентаризации_Июнь_26.xlsx (01.06.2026)
const initRawStock = [
  { id:"r1",  name:"Клубника свежая",              unit:"кг",  price:2500,   qty:0    },
  { id:"r2",  name:"Шоколад молочный",             unit:"кг",  price:8950,   qty:0    },
  { id:"r3",  name:"Шоколад белый",                unit:"кг",  price:7950,   qty:0    },
  { id:"r4",  name:"Шоколад тёмный Callebaut",     unit:"кг",  price:4800,   qty:0    },
  { id:"r5",  name:"Дубайская паста",              unit:"кг",  price:16500,  qty:0    },
  { id:"r6",  name:"Мороженное",                   unit:"кг",  price:2000,   qty:0    },
  { id:"r7",  name:"Краситель пищевой",            unit:"кг",  price:19000,  qty:0    },
  { id:"r8",  name:"Кандурин",                     unit:"кг",  price:100000, qty:0    },
  { id:"r9",  name:"Скотч двухсторонний",          unit:"шт",  price:100,    qty:6    },
  { id:"r10", name:"Лента декоративная 1см",       unit:"рул", price:400,    qty:29   },
  { id:"r11", name:"Розетки бумажные (1000шт)",    unit:"уп",  price:1140,   qty:5    },
  { id:"r12", name:"Тишью бумага",                 unit:"лист",price:0.4,    qty:292  },
  { id:"r13", name:"Шпажки / палочки (70шт)",      unit:"уп",  price:180,    qty:11   },
  { id:"r14", name:"Слюда (упак. плёнка)",         unit:"м",   price:8.5,    qty:100  },
  { id:"r15", name:"Упаковочная бумага",           unit:"лист",price:50,     qty:200  },
  { id:"r16", name:"Бичовка / верёвка",            unit:"рул", price:5,      qty:8    },
  { id:"r17", name:"Открытка",                     unit:"шт",  price:35,     qty:100  },
  { id:"r18", name:"Эмблема / бирка",              unit:"рул", price:5,      qty:20   },
  { id:"r19", name:"Пакет крафт малый",            unit:"шт",  price:80,     qty:79   },
  { id:"r20", name:"Пакет крафт средний",          unit:"шт",  price:85,     qty:43   },
  { id:"r21", name:"Пакет крафт большой",          unit:"шт",  price:120,    qty:75   },
  { id:"r22", name:"Скотч обычный (широкий)",      unit:"шт",  price:430,    qty:191  },
  { id:"r23", name:"Лента декоративная 2см",       unit:"рул", price:400,    qty:5    },
  { id:"r24", name:"Креманка",                     unit:"шт",  price:57,     qty:960  },
  { id:"r25", name:"Вилка одноразовая (уп.)",      unit:"уп",  price:13,     qty:4    },
  { id:"r26", name:"Салфетка",                     unit:"шт",  price:13,     qty:500  },
  { id:"r27", name:"Посыпка кондитерская (г)",     unit:"г",   price:0.025,  qty:2476 },
  { id:"r28", name:"Макси стакан",                 unit:"шт",  price:39.6,   qty:163  },
  { id:"r29", name:"Коробки набор 8шт",            unit:"шт",  price:220,    qty:2114 },
  { id:"r30", name:"Коробки набор 12шт",           unit:"шт",  price:200,    qty:524  },
  { id:"r31", name:"Коробки набор 15шт",           unit:"шт",  price:330,    qty:174  },
  { id:"r32", name:"Коробки набор 20шт",           unit:"шт",  price:410,    qty:173  },
  { id:"r33", name:"Коробки набор 25шт",           unit:"шт",  price:430,    qty:154  },
  { id:"r34", name:"Коробки набор 35шт",           unit:"шт",  price:430,    qty:69   },
  { id:"r35", name:"Коробки набор 48шт",           unit:"шт",  price:185,    qty:75   },
  { id:"r36", name:"Коробки набор 64шт",           unit:"шт",  price:700,    qty:8    },
];

// ─── ПОЛУФАБРИКАТЫ ───────────────────────────────────────────────────────────
const initSemiStock = [
  { id:"s1", name:"Клубника подготовленная",    unit:"кг",  qty:30,  rawId:"r1"  },
  { id:"s2", name:"Шоколад молочный (глазурь)", unit:"кг",  qty:8,   rawId:"r2"  },
  { id:"s3", name:"Шоколад белый (глазурь)",    unit:"кг",  qty:5,   rawId:"r3"  },
  { id:"s4", name:"Шоколад тёмный (глазурь)",   unit:"кг",  qty:3,   rawId:"r4"  },
  { id:"s5", name:"Дубайская паста (готовая)",  unit:"кг",  qty:2,   rawId:"r5"  },
  { id:"s6", name:"Мороженное (порции)",        unit:"кг",  qty:5,   rawId:"r6"  },
];

// ─── ТЕХ. КАРТЫ (ВСЕ ПРОДУКТЫ) ───────────────────────────────────────────────
const INIT_TECH_CARDS = [
  // НАБОРЫ
  { id:"tc1",  product:"Набор 8 шт",   cat:"Наборы",       price:7500,
    ings:[{sid:"s1",qty:0.20,loss:10},{sid:"s2",qty:0.040,loss:5},{sid:"s3",qty:0.040,loss:5}] },
  { id:"tc2",  product:"Набор 10 шт",  cat:"Наборы",       price:8300,
    ings:[{sid:"s1",qty:0.20,loss:10},{sid:"s2",qty:0.050,loss:5},{sid:"s3",qty:0.050,loss:5}] },
  { id:"tc3",  product:"Набор 12 шт",  cat:"Наборы",       price:10200,
    ings:[{sid:"s1",qty:0.252,loss:10},{sid:"s2",qty:0.060,loss:5},{sid:"s3",qty:0.060,loss:5}] },
  { id:"tc4",  product:"Набор 15 шт",  cat:"Наборы",       price:13600,
    ings:[{sid:"s1",qty:0.345,loss:10},{sid:"s2",qty:0.100,loss:5},{sid:"s3",qty:0.050,loss:5}] },
  { id:"tc5",  product:"Набор 20 шт",  cat:"Наборы",       price:15900,
    ings:[{sid:"s1",qty:0.400,loss:10},{sid:"s2",qty:0.100,loss:5},{sid:"s3",qty:0.100,loss:5}] },
  { id:"tc6",  product:"Набор 25 шт",  cat:"Наборы",       price:18900,
    ings:[{sid:"s1",qty:0.500,loss:10},{sid:"s2",qty:0.130,loss:5},{sid:"s3",qty:0.120,loss:5}] },
  { id:"tc7",  product:"Набор 35 шт",  cat:"Наборы",       price:26900,
    ings:[{sid:"s1",qty:0.735,loss:10},{sid:"s2",qty:0.200,loss:5},{sid:"s3",qty:0.150,loss:5}] },
  { id:"tc8",  product:"Набор 48 шт",  cat:"Наборы",       price:37900,
    ings:[{sid:"s1",qty:1.008,loss:10},{sid:"s2",qty:0.240,loss:5},{sid:"s3",qty:0.240,loss:5}] },
  { id:"tc9",  product:"Набор 64 шт",  cat:"Наборы",       price:46400,
    ings:[{sid:"s1",qty:1.280,loss:10},{sid:"s2",qty:0.240,loss:5},{sid:"s3",qty:0.320,loss:5}] },

  // БУКЕТЫ
  { id:"tc10", product:"Букет XXS (9 ягод)",   cat:"Букеты", price:9900,
    ings:[{sid:"s1",qty:0.252,loss:10},{sid:"s2",qty:0.090,loss:5}] },
  { id:"tc11", product:"Букет XS (15 ягод)",   cat:"Букеты", price:13400,
    ings:[{sid:"s1",qty:0.330,loss:10},{sid:"s2",qty:0.080,loss:5},{sid:"s3",qty:0.070,loss:5}] },
  { id:"tc12", product:"Букет S (17-19 ягод)",  cat:"Букеты", price:15900,
    ings:[{sid:"s1",qty:0.399,loss:10},{sid:"s2",qty:0.110,loss:5},{sid:"s3",qty:0.080,loss:5}] },
  { id:"tc13", product:"Букет S+ (22-25 ягод)", cat:"Букеты", price:19600,
    ings:[{sid:"s1",qty:0.525,loss:10},{sid:"s2",qty:0.150,loss:5},{sid:"s3",qty:0.100,loss:5}] },
  { id:"tc14", product:"Букет M (33-36 ягод)",  cat:"Букеты", price:27300,
    ings:[{sid:"s1",qty:0.738,loss:10},{sid:"s2",qty:0.200,loss:5},{sid:"s3",qty:0.160,loss:5}] },
  { id:"tc15", product:"Букет M+ (43-45 ягод)", cat:"Букеты", price:34600,
    ings:[{sid:"s1",qty:0.950,loss:10},{sid:"s2",qty:0.250,loss:5},{sid:"s3",qty:0.200,loss:5}] },
  { id:"tc16", product:"Букет L (56-60 ягод)",  cat:"Букеты", price:43300,
    ings:[{sid:"s1",qty:1.020,loss:10},{sid:"s2",qty:0.400,loss:5},{sid:"s3",qty:0.200,loss:5}] },
  { id:"tc17", product:"Букет L+ (68-70 ягод)", cat:"Букеты", price:51700,
    ings:[{sid:"s1",qty:1.400,loss:10},{sid:"s2",qty:0.450,loss:5},{sid:"s3",qty:0.250,loss:5}] },
  { id:"tc18", product:"Букет XL (87-90 ягод)", cat:"Букеты", price:65900,
    ings:[{sid:"s1",qty:1.755,loss:10},{sid:"s2",qty:0.650,loss:5},{sid:"s3",qty:0.250,loss:5}] },

  // КРЕМАНКИ
  { id:"tc19", product:"Креманка классик",            cat:"Креманки", price:2500,
    ings:[{sid:"s1",qty:0.150,loss:10},{sid:"s2",qty:0.030,loss:5}] },
  { id:"tc20", product:"Креманка классик + мор",      cat:"Креманки", price:2500,
    ings:[{sid:"s1",qty:0.100,loss:10},{sid:"s2",qty:0.030,loss:5},{sid:"s6",qty:0.050,loss:10}] },
  { id:"tc21", product:"Креманка классик + 2 шок",    cat:"Креманки", price:3000,
    ings:[{sid:"s1",qty:0.150,loss:10},{sid:"s2",qty:0.030,loss:5},{sid:"s3",qty:0.015,loss:5}] },
  { id:"tc22", product:"Крем. класс + мор + 2 шок",   cat:"Креманки", price:3000,
    ings:[{sid:"s1",qty:0.100,loss:10},{sid:"s2",qty:0.030,loss:5},{sid:"s3",qty:0.015,loss:5},{sid:"s6",qty:0.050,loss:10}] },
  { id:"tc23", product:"Креманка дубай",              cat:"Креманки", price:4500,
    ings:[{sid:"s1",qty:0.150,loss:10},{sid:"s2",qty:0.030,loss:5},{sid:"s5",qty:0.030,loss:5}] },
  { id:"tc24", product:"Креманка дубай + мор",        cat:"Креманки", price:4500,
    ings:[{sid:"s1",qty:0.100,loss:10},{sid:"s2",qty:0.030,loss:5},{sid:"s5",qty:0.030,loss:5},{sid:"s6",qty:0.050,loss:10}] },

  // МАКСИ СТАКАНЫ
  { id:"tc25", product:"Макси классик",               cat:"Макси стаканы", price:4500,
    ings:[{sid:"s1",qty:0.300,loss:10},{sid:"s2",qty:0.060,loss:5}] },
  { id:"tc26", product:"Макси классик + мор",         cat:"Макси стаканы", price:4500,
    ings:[{sid:"s1",qty:0.200,loss:10},{sid:"s2",qty:0.060,loss:5},{sid:"s6",qty:0.100,loss:10}] },
  { id:"tc27", product:"Макси дубай",                 cat:"Макси стаканы", price:8000,
    ings:[{sid:"s1",qty:0.300,loss:10},{sid:"s2",qty:0.060,loss:5},{sid:"s5",qty:0.060,loss:5}] },
  { id:"tc28", product:"Макси дубай + мор",           cat:"Макси стаканы", price:8000,
    ings:[{sid:"s1",qty:0.200,loss:10},{sid:"s2",qty:0.060,loss:5},{sid:"s5",qty:0.060,loss:5},{sid:"s6",qty:0.100,loss:10}] },
];

const CAT_COLORS = {
  "Наборы":"#E8A0B4","Букеты":"#2ECC71",
  "Креманки":"#3498DB","Макси стаканы":"#F39C12"
};

const NAV = [
  { id:"dashboard",   icon:"📈", label:"Дашборд",        desc:"Аналитика и финансы" },
  { id:"pos",         icon:"🛒", label:"Касса",           desc:"Продажи и списания" },
  { id:"production",  icon:"🍓", label:"Производство",   desc:"Сырьё → Кухня" },
  { id:"warehouse",   icon:"📦", label:"Склад",           desc:"Закупки и остатки" },
  { id:"inventory",   icon:"📋", label:"Инвентаризация",  desc:"Пересчёт остатков" },
  { id:"writeoff",    icon:"🗑️", label:"Списания",        desc:"Коррекционные карты" },
  { id:"expenses",    icon:"💰", label:"Расходы",         desc:"Аренда, зарплата, реклама" },
  { id:"reports",     icon:"📊", label:"Отчёты",          desc:"Cash Flow, P&L" },
  { id:"settings",    icon:"⚙️", label:"Настройки",       desc:"Техкарты и Маржа" },
];

const fmtM = (n) => Math.round(n||0).toLocaleString("ru-RU") + " ₸";
const fmtS = (n) => { n=n||0; if(n>=1e6) return (n/1e6).toFixed(1)+"M ₸"; if(n>=1e3) return (n/1e3).toFixed(0)+"K ₸"; return n+" ₸"; };
const fmt  = (n,d=2) => typeof n==="number" ? n.toLocaleString("ru-RU",{minimumFractionDigits:0,maximumFractionDigits:d}) : String(n||0);

// Себестоимость по закупочным ценам
const calcCost = (ings, semiStock, rawStock) =>
  ings.reduce((sum,ing)=>{
    const semi = semiStock.find(s=>s.id===ing.sid);
    if(!semi) return sum;
    const raw  = rawStock.find(r=>r.id===semi.rawId);
    return sum + (ing.qty*(1+(ing.loss||0)/100))*(raw?.price||0);
  },0);

// ─── TOAST ───────────────────────────────────────────────────────────────────
function Toast({toast}){
  if(!toast) return null;
  return <div style={{position:"fixed",top:20,right:20,zIndex:9999,background:toast.err?C.red:C.green,color:"#000",padding:"12px 22px",borderRadius:12,fontWeight:700,fontSize:14,boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>
    {toast.err?"✕ ":"✓ "}{toast.msg}
  </div>;
}

function useToast(){
  const [toast,setToast]=useState(null);
  const show=(msg,err=false)=>{setToast({msg,err});setTimeout(()=>setToast(null),3000);};
  return [toast,show];
}

// ─── ДАШБОРД ─────────────────────────────────────────────────────────────────
function Dashboard({sales,semiStock,rawStock,expenses}){
  const totalRev  = sales.reduce((s,i)=>s+i.total,0);
  const totalCOGS = sales.reduce((s,i)=>s+(i.cogs||0),0);
  const totalExp  = (expenses||[]).filter(e=>e.paid).reduce((s,e)=>s+e.amount,0);
  const grossP    = totalRev - totalCOGS;
  const netP      = grossP - totalExp;

  const byPoint = POINTS.map((p,i)=>({
    name:p, color:POINT_COLORS[i],
    rev:sales.filter(s=>s.point===p).reduce((a,s)=>a+s.total,0),
    orders:sales.filter(s=>s.point===p).length,
  }));
  const maxRev = Math.max(...byPoint.map(p=>p.rev),1);

  const lowSemi = semiStock.filter(s=>s.qty<5);
  const lowRaw  = rawStock.filter(r=>r.qty<10);

  const KPI = [
    {label:"ВЫРУЧКА",       val:fmtS(totalRev),  color:C.accent },
    {label:"COGS (себест.)",val:fmtS(totalCOGS), color:C.yellow },
    {label:"ВАЛОВАЯ ПРИБЫЛЬ",val:fmtS(grossP),   color:grossP>=0?C.green:C.red },
    {label:"ЧИСТАЯ ПРИБЫЛЬ", val:fmtS(netP),     color:netP>=0?C.green:C.red },
  ];

  return (
    <div style={{padding:"24px 28px",overflowY:"auto",height:"calc(100vh-57px)"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
        {KPI.map((k,i)=>(
          <div key={i} style={{background:C.card,borderRadius:14,padding:"18px 20px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>{k.label}</div>
            <div style={{fontSize:26,fontWeight:900,color:k.color}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>Выручка по точкам</div>
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
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>🔔 Алерты</div>
          {lowSemi.length===0&&lowRaw.length===0
            ? <div style={{color:C.green,fontSize:13}}>✓ Всё в порядке</div>
            : null}
          {lowSemi.map((s,i)=><div key={i} style={{padding:"10px 12px",borderRadius:10,background:C.yellowSoft,color:C.yellow,marginBottom:8,fontSize:13}}>⚠ Мало на кухне: <b>{s.name}</b> — {fmt(s.qty)} {s.unit}</div>)}
          {lowRaw.map((r,i)=><div key={i} style={{padding:"10px 12px",borderRadius:10,background:C.redSoft,color:C.red,marginBottom:8,fontSize:13}}>🔴 Критически: <b>{r.name}</b> — {fmt(r.qty)} {r.unit}</div>)}
        </div>
      </div>

      {sales.length>0&&(
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Последние продажи</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["Чек","Точка","Позиции","Оплата","COGS","Сумма","Время"].map((h,i)=>
                  <th key={i} style={{padding:"8px 12px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {[...sales].reverse().slice(0,10).map((s,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${C.border}40`}}>
                  <td style={{padding:"10px 12px",color:C.muted}}>#{s.no}</td>
                  <td style={{padding:"10px 12px"}}>{s.point}</td>
                  <td style={{padding:"10px 12px",color:C.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.items?.map(x=>x.name).join(", ")}</td>
                  <td style={{padding:"10px 12px"}}>{s.payMode==="cash"?"💵 Нал":"💳 Kaspi"}</td>
                  <td style={{padding:"10px 12px",color:C.yellow}}>{fmtM(s.cogs||0)}</td>
                  <td style={{padding:"10px 12px",fontWeight:800,color:C.accent}}>{fmtM(s.total)}</td>
                  <td style={{padding:"10px 12px",color:C.muted}}>{s.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── КАССА ───────────────────────────────────────────────────────────────────
function POS({semiStock,setSemiStock,rawStock,sales,setSales,currentUser,techCards}){
  const [cart,setCart]         = useState([]);
  const [payMode,setPayMode]   = useState(null);
  const [cashInput,setCashInput]=useState("");
  const [selPoint,setSelPoint] = useState(currentUser.point||POINTS[0]);
  const [discount,setDiscount] = useState(0);
  const [done,setDone]         = useState(false);
  const [lastReceipt,setLast]  = useState(null);
  const [catFilter,setCatFilter]=useState("Все");
  const [search,setSearch]     = useState("");
  const [toast,showToast]      = useToast();

  const cats = ["Все",...new Set(techCards.map(t=>t.cat))];
  const filtered = techCards.filter(t=>
    (catFilter==="Все"||t.cat===catFilter)&&
    (search===""||t.product.toLowerCase().includes(search.toLowerCase()))
  );

  const addToCart=(tc)=>setCart(p=>p.find(i=>i.id===tc.id)?p.map(i=>i.id===tc.id?{...i,qty:i.qty+1}:i):[...p,{...tc,qty:1}]);
  const chgQty=(id,d)=>setCart(p=>p.map(i=>i.id===id?{...i,qty:Math.max(0,i.qty+d)}:i).filter(i=>i.qty>0));

  const subtotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const discAmt  = Math.round(subtotal*discount/100);
  const total    = subtotal - discAmt;
  const cashGiven= parseInt(cashInput.replace(/\D/g,""))||0;

  const handlePay=()=>{
    if(payMode==="cash"&&cashGiven<total){showToast("Недостаточно наличных",true);return;}
    // Физическое списание
    const newSemi=[...semiStock];
    for(const item of cart){
      for(const ing of item.ings){
        const spend=ing.qty*item.qty*(1+ing.loss/100);
        const idx=newSemi.findIndex(s=>s.id===ing.sid);
        if(idx>=0) newSemi[idx]={...newSemi[idx],qty:Math.round((newSemi[idx].qty-spend)*1000)/1000};
      }
    }
    setSemiStock(newSemi);
    // COGS
    const cogs=cart.reduce((s,i)=>s+calcCost(i.ings,semiStock,rawStock)*i.qty,0);
    const receipt={
      no:1001+sales.length, point:selPoint,
      items:cart.map(i=>({name:i.product,qty:i.qty,price:i.price})),
      total, subtotal, discAmt, discount, cogs, payMode,
      cashGiven:payMode==="cash"?cashGiven:total,
      change:payMode==="cash"?cashGiven-total:0,
      time:new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),
    };
    setSales(p=>[...p,receipt]);
    setLast(receipt);
    setDone(true);
  };

  const newSale=()=>{setCart([]);setPayMode(null);setCashInput("");setDiscount(0);setDone(false);setLast(null);};

  return(
    <div style={{display:"flex",height:"calc(100vh - 57px)"}}>
      <Toast toast={toast}/>
      {/* ТОВАРЫ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Фильтры */}
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {(currentUser.role==="owner"||currentUser.role==="manager")&&(
            <select value={selPoint} onChange={e=>setSelPoint(e.target.value)} style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",outline:"none",fontSize:13}}>
              {POINTS.map(p=><option key={p}>{p}</option>)}
            </select>
          )}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Поиск..." style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",outline:"none",fontSize:13,width:180}}/>
          {cats.map(c=>(
            <button key={c} onClick={()=>setCatFilter(c)} style={{padding:"7px 14px",borderRadius:20,border:"none",background:catFilter===c?(CAT_COLORS[c]||C.accent):C.card,color:catFilter===c?"#000":C.muted,fontWeight:catFilter===c?700:400,cursor:"pointer",fontSize:13}}>
              {c}
            </button>
          ))}
        </div>
        {/* Грид */}
        <div style={{flex:1,overflowY:"auto",padding:14,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:10,alignContent:"start"}}>
          {filtered.map(tc=>{
            const inCart=cart.find(i=>i.id===tc.id);
            const color=CAT_COLORS[tc.cat]||C.accent;
            const cost=calcCost(tc.ings,semiStock,rawStock);
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

      {/* КОРЗИНА */}
      <div style={{width:340,background:C.surface,display:"flex",flexDirection:"column",borderLeft:`1px solid ${C.border}`}}>
        <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontWeight:700,fontSize:15}}>Корзина</span>
          {cart.length>0&&<button onClick={()=>setCart([])} style={{background:C.redSoft,color:C.red,border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>Очистить</button>}
        </div>

        <div style={{flex:1,overflowY:"auto",padding:10}}>
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
                    <span style={{fontWeight:900,color,fontSize:15}}>{fmtM(item.price*item.qty)}</span>
                  </div>
                </div>
              );
            })
          }
        </div>

        {cart.length>0&&!done&&(
          <div style={{padding:"14px 16px",borderTop:`1px solid ${C.border}`}}>
            {/* Скидка */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:6}}>СКИДКА</div>
              <div style={{display:"flex",gap:6}}>
                {[0,5,10,15,20].map(d=>(
                  <button key={d} onClick={()=>setDiscount(d)} style={{flex:1,padding:"6px 2px",borderRadius:8,border:`1px solid ${discount===d?C.accent:C.border}`,background:discount===d?C.accentSoft:"transparent",color:discount===d?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>
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
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <button onClick={()=>setPayMode("cash")} style={{flex:1,padding:10,background:payMode==="cash"?C.greenSoft:C.card,color:payMode==="cash"?C.green:C.text,border:`1px solid ${payMode==="cash"?C.green:C.border}`,borderRadius:8,cursor:"pointer",fontWeight:700}}>💵 Нал</button>
              <button onClick={()=>setPayMode("card")} style={{flex:1,padding:10,background:payMode==="card"?C.blueSoft:C.card,color:payMode==="card"?C.blue:C.text,border:`1px solid ${payMode==="card"?C.blue:C.border}`,borderRadius:8,cursor:"pointer",fontWeight:700}}>💳 Kaspi</button>
            </div>
            {payMode==="cash"&&(
              <div style={{marginBottom:10}}>
                <input value={cashInput} onChange={e=>setCashInput(e.target.value.replace(/\D/g,""))} placeholder="Сумма от клиента..." style={{width:"100%",padding:12,background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,boxSizing:"border-box",fontSize:18,fontWeight:700,outline:"none"}}/>
                {cashGiven>=total&&cashGiven>0&&<div style={{color:C.green,fontWeight:700,fontSize:14,marginTop:6}}>Сдача: {fmtM(cashGiven-total)}</div>}
              </div>
            )}
            <button onClick={handlePay} disabled={!payMode||(payMode==="cash"&&cashGiven<total)} style={{width:"100%",padding:16,background:payMode?C.accent:C.dimmed,color:"#000",border:"none",borderRadius:10,fontWeight:900,cursor:payMode?"pointer":"default",fontSize:15}}>
              ✓ Принять оплату
            </button>
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
      </div>
    </div>
  );
}

// ─── ПРОИЗВОДСТВО ────────────────────────────────────────────────────────────
function Production({rawStock,setRawStock,semiStock,setSemiStock}){
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({targetId:"s1",qty:""});
  const [toast,showToast]=useToast();

  const handleTransfer=()=>{
    const qty=parseFloat(form.qty);
    if(!qty||qty>modal.qty){showToast("Неверное количество",true);return;}
    setRawStock(p=>p.map(r=>r.id===modal.id?{...r,qty:Math.round((r.qty-qty)*1000)/1000}:r));
    setSemiStock(p=>p.map(s=>s.id===form.targetId?{...s,qty:Math.round((s.qty+qty)*1000)/1000}:s));
    showToast(`${modal.name} → кухня (${qty} ${modal.unit})`);
    setModal(null);
  };

  return(
    <div style={{padding:"24px 28px",overflowY:"auto"}}>
      <Toast toast={toast}/>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.card,borderRadius:16,padding:28,width:420,border:`1px solid ${C.border}`}}>
            <h3 style={{marginTop:0,marginBottom:16}}>Передать на кухню</h3>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Полуфабрикат</div>
              <select value={form.targetId} onChange={e=>setForm(f=>({...f,targetId:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:12,color:C.text,outline:"none"}}>
                {semiStock.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Количество ({modal.unit}) / Макс.: {fmt(modal.qty)}</div>
              <input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:12,color:C.text,outline:"none",boxSizing:"border-box",fontSize:20,fontWeight:700}}/>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:12,borderRadius:10,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Отмена</button>
              <button onClick={handleTransfer} style={{flex:2,padding:12,borderRadius:10,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer"}}>Передать →</button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
          <h3 style={{marginTop:0,marginBottom:16}}>🏭 Сырьевой склад</h3>
          {rawStock.map(r=>(
            <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:10,marginBottom:10,borderBottom:`1px solid ${C.border}`}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{r.name}</div>
                <div style={{fontSize:12,color:r.qty<10?C.yellow:C.muted}}>{fmt(r.qty)} {r.unit}</div>
              </div>
              <button onClick={()=>{setModal(r);setForm({targetId:"s1",qty:""}); }} style={{padding:"7px 14px",borderRadius:8,background:C.accentSoft,color:C.accent,border:`1px solid ${C.accent}`,cursor:"pointer",fontWeight:700,fontSize:12}}>На кухню →</button>
            </div>
          ))}
        </div>
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
          <h3 style={{marginTop:0,marginBottom:16}}>⚗️ Полуфабрикаты (кухня)</h3>
          {semiStock.map(s=>(
            <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:10,marginBottom:10,borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
              <div style={{fontWeight:800,fontSize:15,color:s.qty<0?C.red:s.qty<3?C.yellow:C.text}}>{fmt(s.qty)} {s.unit}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── СКЛАД ───────────────────────────────────────────────────────────────────
function Warehouse({rawStock,setRawStock,semiStock}){
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({itemId:"r1",price:"",qty:"",supplier:""});
  const [history,setHistory]=useState([]);
  const [toast,showToast]=useToast();

  const handleAdd=(e)=>{
    e.preventDefault();
    const qty=parseFloat(form.qty),price=parseFloat(form.price)||0;
    if(!qty||qty<=0){showToast("Введите количество",true);return;}
    setRawStock(prev=>prev.map(item=>{
      if(item.id!==form.itemId) return item;
      const cur=item.qty>0?item.qty:0;
      const avgPrice=cur>0?Math.round((cur*item.price+qty*price)/(cur+qty)):price;
      return{...item,qty:Math.round((cur+qty)*1000)/1000,price:avgPrice};
    }));
    const item=rawStock.find(r=>r.id===form.itemId);
    setHistory(h=>[{date:new Date().toLocaleDateString("ru-RU"),item:item?.name,qty,unit:item?.unit,price,supplier:form.supplier||"—"},...h]);
    showToast(`Оприходовано: ${item?.name} +${qty} ${item?.unit}`);
    setForm({itemId:"r1",price:"",qty:"",supplier:""});
    setShowAdd(false);
  };

  return(
    <div style={{padding:"24px 28px",overflowY:"auto"}}>
      <Toast toast={toast}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={{margin:0}}>▣ Склад сырья</h2>
        <button onClick={()=>setShowAdd(v=>!v)} style={{padding:"10px 22px",borderRadius:10,border:"none",background:C.green,color:"#000",fontWeight:800,cursor:"pointer",fontSize:14}}>
          {showAdd?"✕ Отмена":"+ Оприходовать"}
        </button>
      </div>

      {showAdd&&(
        <form onSubmit={handleAdd} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:24}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 2fr auto",gap:12,alignItems:"end"}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Позиция</div>
              <select value={form.itemId} onChange={e=>setForm(f=>({...f,itemId:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 10px",color:C.text,outline:"none"}}>
                {rawStock.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Цена (₸/ед.)</div>
              <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Кол-во</div>
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

      <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:20}}>
        <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:13}}>
          <thead>
            <tr style={{background:C.surface,borderBottom:`1px solid ${C.border}`}}>
              {["Наименование","Ед.","Остаток","Ср. цена закупки","На сумму","Статус"].map((h,i)=>
                <th key={i} style={{padding:"13px 18px",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rawStock.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?"transparent":C.surface+"30"}}>
                <td style={{padding:"13px 18px",fontWeight:600}}>{r.name}</td>
                <td style={{padding:"13px 18px",color:C.muted}}>{r.unit}</td>
                <td style={{padding:"13px 18px",fontWeight:800,color:r.qty<10?C.yellow:C.text}}>{fmt(r.qty)}</td>
                <td style={{padding:"13px 18px",color:C.green,fontWeight:700}}>{fmtM(r.price)}</td>
                <td style={{padding:"13px 18px",color:C.accent,fontWeight:700}}>{fmtM(Math.round(r.qty*r.price))}</td>
                <td style={{padding:"13px 18px"}}>
                  <span style={{fontSize:11,fontWeight:700,color:r.qty<5?C.red:r.qty<15?C.yellow:C.green,background:r.qty<5?C.redSoft:r.qty<15?C.yellowSoft:C.greenSoft,padding:"3px 10px",borderRadius:20}}>
                    {r.qty<5?"Критично":r.qty<15?"Мало":"OK"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {history.length>0&&(
        <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:20}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>История поступлений</div>
          {history.map((h,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<history.length-1?`1px solid ${C.border}`:"none"}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{h.item}</div>
                <div style={{fontSize:11,color:C.muted}}>{h.supplier} · {h.date}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:800,color:C.green,fontSize:14}}>+{h.qty} {h.unit}</div>
                {h.price>0&&<div style={{fontSize:11,color:C.muted}}>{fmtM(h.price)}/ед.</div>}
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
  {id:"rent",     label:"Аренда",    icon:"🏪", color:C.blue},
  {id:"salary",   label:"Зарплата",  icon:"👤", color:C.purple},
  {id:"marketing",label:"Реклама",   icon:"📣", color:C.accent},
  {id:"utility",  label:"Коммунал.", icon:"💡", color:C.yellow},
  {id:"tax",      label:"Налоги",    icon:"🧾", color:C.red},
  {id:"other",    label:"Прочее",    icon:"📝", color:C.muted},
];

function Expenses({expenses,setExpenses}){
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({cat:"rent",desc:"",amount:"",point:"Вся компания",paid:true});
  const [toast,showToast]=useToast();

  const totalPaid=expenses.filter(e=>e.paid).reduce((s,e)=>s+e.amount,0);
  const totalPend=expenses.filter(e=>!e.paid).reduce((s,e)=>s+e.amount,0);

  const handleAdd=(ev)=>{
    ev.preventDefault();
    if(!form.desc||!form.amount){showToast("Заполните поля",true);return;}
    setExpenses(p=>[...p,{id:Date.now(),...form,amount:parseInt(form.amount)||0,date:new Date().toLocaleDateString("ru-RU")}]);
    setForm({cat:"rent",desc:"",amount:"",point:"Вся компания",paid:true});
    setShowForm(false);
    showToast("Расход добавлен");
  };

  return(
    <div style={{padding:"24px 28px",overflowY:"auto"}}>
      <Toast toast={toast}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <h2 style={{margin:"0 0 6px"}}>💰 Расходы</h2>
          <div style={{display:"flex",gap:16}}>
            <span style={{color:C.red,fontSize:13,fontWeight:700}}>Оплачено: {fmtM(totalPaid)}</span>
            <span style={{color:C.yellow,fontSize:13,fontWeight:700}}>Ожидает: {fmtM(totalPend)}</span>
          </div>
        </div>
        <button onClick={()=>setShowForm(v=>!v)} style={{padding:"10px 22px",borderRadius:10,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer",fontSize:14}}>
          {showForm?"✕ Отмена":"+ Добавить"}
        </button>
      </div>

      {showForm&&(
        <form onSubmit={handleAdd} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr 1fr auto",gap:12,alignItems:"end"}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Категория</div>
              <select value={form.cat} onChange={e=>setForm(f=>({...f,cat:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none"}}>
                {EXP_CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Описание</div>
              <input value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="Напр. Аренда Точка №1 — июнь" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Сумма (₸)</div>
              <input type="number" required value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:5,textTransform:"uppercase"}}>Статус</div>
              <select value={form.paid?"paid":"pending"} onChange={e=>setForm(f=>({...f,paid:e.target.value==="paid"}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none"}}>
                <option value="paid">Оплачено</option>
                <option value="pending">Ожидает</option>
              </select>
            </div>
            <button type="submit" style={{padding:"11px 20px",borderRadius:8,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer"}}>+ Добавить</button>
          </div>
        </form>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {expenses.map((e,i)=>{
          const cat=EXP_CATS.find(c=>c.id===e.cat)||EXP_CATS[5];
          return(
            <div key={e.id||i} style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
              <div style={{fontSize:24}}>{cat.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14}}>{e.desc}</div>
                <div style={{fontSize:11,color:C.muted}}>{cat.label} · {e.point||"Вся компания"} · {e.date}</div>
              </div>
              <div style={{fontWeight:800,color:C.red,fontSize:15}}>{fmtM(e.amount)}</div>
              <button onClick={()=>setExpenses(p=>p.map((x,j)=>j===i?{...x,paid:!x.paid}:x))} style={{padding:"5px 12px",borderRadius:20,border:"none",background:e.paid?C.greenSoft:C.yellowSoft,color:e.paid?C.green:C.yellow,cursor:"pointer",fontSize:12,fontWeight:700}}>
                {e.paid?"✓ Оплачено":"⏳ Ожидает"}
              </button>
              <button onClick={()=>setExpenses(p=>p.filter((_,j)=>j!==i))} style={{background:C.redSoft,color:C.red,border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontWeight:700}}>✕</button>
            </div>
          );
        })}
        {expenses.length===0&&<div style={{textAlign:"center",color:C.muted,padding:40,fontSize:14}}>Расходов нет. Нажмите "+ Добавить"</div>}
      </div>
    </div>
  );
}

// ─── ОТЧЁТЫ ──────────────────────────────────────────────────────────────────
function Reports({sales,expenses,rawStock,semiStock}){
  const totalRev  = sales.reduce((s,i)=>s+i.total,0);
  const totalCOGS = sales.reduce((s,i)=>s+(i.cogs||0),0);
  const totalExp  = expenses.filter(e=>e.paid).reduce((s,e)=>s+e.amount,0);
  const grossP    = totalRev-totalCOGS;
  const netP      = grossP-totalExp;
  const margin    = totalRev>0?Math.round(netP/totalRev*100):0;

  const byPoint=POINTS.map((p,i)=>({
    name:p,color:POINT_COLORS[i],
    rev:sales.filter(s=>s.point===p).reduce((a,s)=>a+s.total,0),
    orders:sales.filter(s=>s.point===p).length,
    cogs:sales.filter(s=>s.point===p).reduce((a,s)=>a+(s.cogs||0),0),
  }));

  const stockValue=rawStock.reduce((s,r)=>s+r.qty*r.price,0);

  return(
    <div style={{padding:"24px 28px",overflowY:"auto"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
        {[
          {label:"Выручка",       val:fmtS(totalRev),  color:C.green},
          {label:"Расходы (COGS+накл.)",val:fmtS(totalCOGS+totalExp),color:C.red},
          {label:"Чистая прибыль",val:fmtS(netP),      color:netP>=0?C.green:C.red},
          {label:"Маржа",         val:`${margin}%`,    color:margin>=20?C.green:margin>=10?C.yellow:C.red},
        ].map((k,i)=>(
          <div key={i} style={{background:C.card,borderRadius:14,padding:"18px 20px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:6,textTransform:"uppercase"}}>{k.label}</div>
            <div style={{fontSize:24,fontWeight:900,color:k.color}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        {/* P&L */}
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:16}}>💹 P&L отчёт</div>
          {[
            {label:"Выручка",                 val:totalRev,   color:C.green,  bold:true},
            {label:"Себестоимость продаж (COGS)",val:-totalCOGS,color:C.red},
            {label:"Валовая прибыль",          val:grossP,    color:C.blue,   bold:true},
            {label:"Операционные расходы",     val:-totalExp, color:C.red},
            {label:"Чистая прибыль",           val:netP,      color:netP>=0?C.green:C.red, bold:true, big:true},
          ].map((r,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}40`}}>
              <span style={{fontSize:r.big?14:13,color:r.bold?C.text:C.muted,fontWeight:r.bold?700:400}}>{r.label}</span>
              <span style={{fontSize:r.big?18:14,fontWeight:r.bold?900:500,color:r.color}}>
                {r.val>=0?"+":""}{fmtM(r.val)}
              </span>
            </div>
          ))}
          <div style={{background:margin>=20?C.greenSoft:C.yellowSoft,borderRadius:10,padding:14,marginTop:14,textAlign:"center"}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Итоговая маржа</div>
            <div style={{fontSize:36,fontWeight:900,color:margin>=20?C.green:margin>=10?C.yellow:C.red}}>{margin}%</div>
          </div>
        </div>

        {/* По точкам */}
        <div>
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22,marginBottom:16}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>📍 По точкам</div>
            {byPoint.map((p,i)=>(
              <div key={i} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:4,background:p.color}}/>
                    <span style={{fontWeight:600,fontSize:13}}>{p.name}</span>
                    <span style={{fontSize:11,color:C.muted}}>{p.orders} заказов</span>
                  </div>
                  <span style={{fontWeight:800,color:p.color}}>{fmtS(p.rev)}</span>
                </div>
                <div style={{height:5,background:C.dimmed,borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:5,width:`${Math.round(p.rev/Math.max(totalRev,1)*100)}%`,background:p.color,borderRadius:3}}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:22}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:12}}>📦 Стоимость склада</div>
            <div style={{fontSize:28,fontWeight:900,color:C.accent}}>{fmtS(stockValue)}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:4}}>Итого сырья на главном складе</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── НАСТРОЙКИ ───────────────────────────────────────────────────────────────
function Settings({techCards,setTechCards,rawStock,setRawStock,semiStock,users,setUsers}){
  const [tab,setTab]=useState("products");
  const [editId,setEditId]=useState(null);
  const [showAddProduct,setShowAddProduct]=useState(false);
  const [newProduct,setNewProduct]=useState({product:"",cat:"Наборы",price:""});
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
  const updateRaw=(id,field,val)=>setRawStock(p=>p.map(r=>r.id===id?{...r,[field]:field==="price"||field==="qty"?parseFloat(val)||0:val}:r));

  const inputStyle={background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};

  return(
    <div style={{padding:"20px 28px",overflowY:"auto"}}>
      <Toast toast={toast}/>
      {/* Вкладки */}
      <div style={{display:"flex",gap:6,marginBottom:20}}>
        {[["products","🍓 Товары"],["techcards","📋 Тех. карты"],["rawstock","🏭 Сырьё"],["users","👥 Сотрудники"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"10px 18px",borderRadius:10,border:"none",background:tab===id?C.accent:C.card,color:tab===id?"#000":C.muted,fontWeight:tab===id?700:400,cursor:"pointer",fontSize:14}}>
            {label}
          </button>
        ))}
      </div>

      {/* ТОВАРЫ И ЦЕНЫ */}
      {tab==="products"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:800}}>Товары и цены</div>
            <button onClick={()=>setShowAddProduct(v=>!v)} style={{padding:"9px 20px",borderRadius:10,border:"none",background:C.accent,color:"#000",fontWeight:800,cursor:"pointer"}}>+ Добавить товар</button>
          </div>
          {showAddProduct&&(
            <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.accent}`,padding:20,marginBottom:16}}>
              <div style={{display:"flex",gap:10,alignItems:"end"}}>
                <div style={{flex:2}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>НАЗВАНИЕ</div>
                  <input value={newProduct.product} onChange={e=>setNewProduct(f=>({...f,product:e.target.value}))} placeholder="Напр. Набор 30 шт" style={inputStyle}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ЦЕНА (₸)</div>
                  <input type="number" value={newProduct.price} onChange={e=>setNewProduct(f=>({...f,price:e.target.value}))} placeholder="0" style={inputStyle}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>КАТЕГОРИЯ</div>
                  <select value={newProduct.cat} onChange={e=>setNewProduct(f=>({...f,cat:e.target.value}))} style={inputStyle}>
                    {cats.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={addProduct} style={{padding:"9px 20px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>+ Добавить</button>
                <button onClick={()=>setShowAddProduct(false)} style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Отмена</button>
              </div>
            </div>
          )}
          {cats.map(cat=>{
            const items=techCards.filter(t=>t.cat===cat);
            if(!items.length) return null;
            const color=CAT_COLORS[cat]||C.accent;
            return(
              <div key={cat} style={{marginBottom:20}}>
                <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>{cat}</div>
                {items.map(tc=>(
                  <div key={tc.id} style={{background:C.card,borderRadius:10,border:`1.5px solid ${editId===tc.id?color:C.border}`,padding:"14px 18px",marginBottom:6}}>
                    {editId===tc.id?(
                      <div>
                        <div style={{display:"flex",gap:10,marginBottom:10}}>
                          <div style={{flex:2}}>
                            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>НАЗВАНИЕ</div>
                            <input value={tc.product} onChange={e=>updateTC(tc.id,"product",e.target.value)} style={inputStyle}/>
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>ЦЕНА (₸)</div>
                            <input type="number" value={tc.price} onChange={e=>updateTC(tc.id,"price",e.target.value)} style={inputStyle}/>
                          </div>
                          <div style={{flex:1}}>
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

      {/* ТЕХ. КАРТЫ */}
      {tab==="techcards"&&(
        <div>
          <div style={{fontSize:18,fontWeight:800,marginBottom:8}}>Технологические карты</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:16}}>Нажмите на карту → изменяйте нормы расхода и потери</div>
          {techCards.map(tc=>(
            <div key={tc.id} style={{background:C.card,borderRadius:12,border:`1.5px solid ${editId===tc.id?C.accent:C.border}`,padding:"14px 18px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",cursor:"pointer"}} onClick={()=>setEditId(editId===tc.id?null:tc.id)}>
                <div style={{flex:1}}>
                  <span style={{fontWeight:700,fontSize:14}}>{tc.product}</span>
                  <span style={{fontSize:11,color:C.muted,marginLeft:10}}>{tc.cat} · {tc.ings.length} ингред.</span>
                </div>
                <span style={{fontWeight:800,color:C.accent,marginRight:12}}>{fmtM(tc.price)}</span>
                <span style={{fontSize:12,color:C.muted}}>{editId===tc.id?"▲":"▼"}</span>
              </div>
              {editId===tc.id&&(
                <div style={{marginTop:14}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:10}}>
                    <thead>
                      <tr style={{background:C.surface}}>
                        {["Полуфабрикат","Норма (кг/шт)","Потери %","Итого с пот.",""].map((h,i)=>(
                          <th key={i} style={{padding:"8px 10px",textAlign:"left",fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tc.ings.map((ing,idx)=>{
                        const withLoss=Math.round(ing.qty*(1+ing.loss/100)*1000)/1000;
                        return(
                          <tr key={idx} style={{borderBottom:`1px solid ${C.border}`}}>
                            <td style={{padding:"8px 10px"}}>
                              <select value={ing.sid} onChange={e=>updateIng(tc.id,idx,"sid",e.target.value)} style={{...inputStyle,width:"auto",minWidth:180}}>
                                {semiStock.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </td>
                            <td style={{padding:"8px 10px"}}>
                              <input type="number" step="0.001" value={ing.qty} onChange={e=>updateIng(tc.id,idx,"qty",e.target.value)} style={{...inputStyle,width:90}}/>
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

      {/* СЫРЬЁ */}
      {tab==="rawstock"&&(
        <div>
          <div style={{fontSize:18,fontWeight:800,marginBottom:16}}>Сырьё и расходники</div>
          {rawStock.map(r=>(
            <div key={r.id} style={{background:C.card,borderRadius:10,border:`1.5px solid ${editId===r.id?C.accent:C.border}`,padding:"12px 16px",marginBottom:6}}>
              {editId===r.id?(
                <div>
                  <div style={{display:"flex",gap:10,marginBottom:10}}>
                    <div style={{flex:2}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>НАИМЕНОВАНИЕ</div><input value={r.name} onChange={e=>updateRaw(r.id,"name",e.target.value)} style={inputStyle}/></div>
                    <div style={{flex:0.6}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>ЕД.</div><input value={r.unit} onChange={e=>updateRaw(r.id,"unit",e.target.value)} style={inputStyle}/></div>
                    <div style={{flex:1}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>ЦЕНА (₸)</div><input type="number" value={r.price} onChange={e=>updateRaw(r.id,"price",e.target.value)} style={inputStyle}/></div>
                    <div style={{flex:1}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>ОСТАТОК</div><input type="number" step="0.01" value={r.qty} onChange={e=>updateRaw(r.id,"qty",e.target.value)} style={inputStyle}/></div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{setEditId(null);showToast("Сохранено!");}} style={{padding:"7px 16px",borderRadius:8,border:"none",background:C.green,color:"#000",fontWeight:700,cursor:"pointer"}}>✓ Сохранить</button>
                    <button onClick={()=>{setRawStock(p=>p.filter(x=>x.id!==r.id));setEditId(null);showToast("Удалено");}} style={{padding:"7px 14px",borderRadius:8,border:"none",background:C.redSoft,color:C.red,fontWeight:700,cursor:"pointer"}}>🗑 Удалить</button>
                    <button onClick={()=>setEditId(null)} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer"}}>Отмена</button>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",cursor:"pointer"}} onClick={()=>setEditId(r.id)}>
                  <div style={{flex:1,fontWeight:600,fontSize:13}}>{r.name}</div>
                  <div style={{fontSize:13,color:C.muted,marginRight:16}}>{fmt(r.qty)} {r.unit}</div>
                  <div style={{fontWeight:700,color:C.yellow,marginRight:12}}>{fmtM(r.price)}/{r.unit}</div>
                  <div style={{fontSize:12,color:C.muted}}>✏️</div>
                </div>
              )}
            </div>
          ))}
          <button onClick={()=>setRawStock(p=>[...p,{id:`r_${Date.now()}`,name:"Новая позиция",unit:"кг",price:0,qty:0}])} style={{marginTop:10,padding:"10px 20px",borderRadius:10,border:`1px solid ${C.border}`,background:C.card,color:C.text,cursor:"pointer",fontSize:13}}>+ Добавить сырьё</button>
        </div>
      )}

      {/* СОТРУДНИКИ */}
      {tab==="users"&&(
        <div>
          <div style={{fontSize:18,fontWeight:800,marginBottom:16}}>Сотрудники и роли</div>
          {users.map((u,i)=>(
            <div key={u.id} style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:"14px 18px",marginBottom:8,display:"flex",alignItems:"center",gap:14}}>
              <div style={{fontSize:22}}>{ROLES[u.role].icon}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14}}>{u.name}</div>
                <div style={{fontSize:12,color:C.muted}}>{ROLES[u.role].label}{u.point?" · "+u.point:""}</div>
              </div>
              <select value={u.role} onChange={e=>setUsers(p=>p.map((x,j)=>j===i?{...x,role:e.target.value}:x))} style={{...inputStyle,width:"auto"}}>
                {Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ИНВЕНТАРИЗАЦИЯ (заглушка) ────────────────────────────────────────────────
function Inventory({semiStock,sales}){
  return(
    <div style={{padding:28}}>
      <div style={{fontSize:18,fontWeight:800,marginBottom:16}}>☰ Инвентаризация</div>
      <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{background:C.surface,borderBottom:`1px solid ${C.border}`}}>
              {["Полуфабрикат","Ед.","Расчётный остаток","Факт (введите)","Отклонение"].map((h,i)=>
                <th key={i} style={{padding:"13px 18px",textAlign:"left",color:C.muted,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {semiStock.map((s,i)=>(
              <tr key={s.id} style={{borderBottom:`1px solid ${C.border}`}}>
                <td style={{padding:"13px 18px",fontWeight:600}}>{s.name}</td>
                <td style={{padding:"13px 18px",color:C.muted}}>{s.unit}</td>
                <td style={{padding:"13px 18px",fontWeight:800,color:s.qty<0?C.red:C.text}}>{fmt(s.qty)}</td>
                <td style={{padding:"13px 18px"}}><input type="number" placeholder={fmt(s.qty)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.text,outline:"none",width:100}}/></td>
                <td style={{padding:"13px 18px",color:C.muted}}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── СПИСАНИЯ ────────────────────────────────────────────────────────────────
function WriteOff({rawStock,setRawStock,semiStock,setSemiStock}){
  const [form,setForm]=useState({stock:"semi",itemId:"s1",qty:"",reason:"spoil",note:"",author:""});
  const [log,setLog]=useState([]);
  const [toast,showToast]=useToast();

  const allItems=[...semiStock.map(s=>({...s,stock:"semi"})),...rawStock.map(r=>({...r,stock:"raw"}))];
  const filtered=allItems.filter(i=>i.stock===form.stock);
  const selItem=allItems.find(i=>i.id===form.itemId);

  const reasons=[
    {id:"spoil",label:"Порча / Истёк срок"},
    {id:"break",label:"Бой / Повреждение"},
    {id:"defect",label:"Брак производства"},
    {id:"promo",label:"Дегустация / Промо"},
    {id:"other",label:"Прочее"},
  ];

  const handleSubmit=(e)=>{
    e.preventDefault();
    const qty=parseFloat(form.qty)||0;
    if(!qty||!form.author){showToast("Заполните все поля",true);return;}
    if(form.stock==="semi") setSemiStock(p=>p.map(s=>s.id===form.itemId?{...s,qty:Math.round((s.qty-qty)*1000)/1000}:s));
    else setRawStock(p=>p.map(r=>r.id===form.itemId?{...r,qty:Math.round((r.qty-qty)*1000)/1000}:r));
    setLog(p=>[{date:new Date().toLocaleDateString("ru-RU"),time:new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),item:selItem?.name,qty,unit:selItem?.unit,reason:reasons.find(r=>r.id===form.reason)?.label,author:form.author,note:form.note},...p]);
    showToast(`Списано: ${selItem?.name} — ${qty} ${selItem?.unit}`);
    setForm(f=>({...f,qty:"",note:"",author:""}));
  };

  return(
    <div style={{padding:"24px 28px",overflowY:"auto"}}>
      <Toast toast={toast}/>
      <div style={{fontSize:18,fontWeight:800,marginBottom:20}}>✕ Коррекционная карта (Списание)</div>
      <form onSubmit={handleSubmit} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:24,marginBottom:20}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>СКЛАД</div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {[["semi","Полуфабрикаты"],["raw","Сырьё"]].map(([v,l])=>(
                <button key={v} type="button" onClick={()=>setForm(f=>({...f,stock:v,itemId:v==="semi"?semiStock[0]?.id:rawStock[0]?.id}))} style={{flex:1,padding:10,borderRadius:8,border:`1px solid ${form.stock===v?C.accent:C.border}`,background:form.stock===v?C.accentSoft:"transparent",color:form.stock===v?C.accent:C.muted,cursor:"pointer",fontWeight:700}}>{l}</button>
              ))}
            </div>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ПОЗИЦИЯ</div>
            <select value={form.itemId} onChange={e=>setForm(f=>({...f,itemId:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",marginBottom:14}}>
              {filtered.map(i=><option key={i.id} value={i.id}>{i.name} (ост: {fmt(i.qty)} {i.unit})</option>)}
            </select>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>КОЛИЧЕСТВО</div>
            <input type="number" step="0.001" required value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box",fontSize:20,fontWeight:700}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ПРИЧИНА</div>
            <select value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",marginBottom:14}}>
              {reasons.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>ОТВЕТСТВЕННЫЙ</div>
            <input required value={form.author} onChange={e=>setForm(f=>({...f,author:e.target.value}))} placeholder="Имя сотрудника" style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box",marginBottom:14}}/>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>КОММЕНТАРИЙ</div>
            <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Описание причины..." style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:11,color:C.text,outline:"none",boxSizing:"border-box",height:70,resize:"none"}}/>
          </div>
        </div>
        <button type="submit" style={{marginTop:16,width:"100%",padding:14,background:C.red,border:"none",borderRadius:10,color:"#fff",fontWeight:900,cursor:"pointer",fontSize:15}}>✓ Провести списание</button>
      </form>

      {log.length>0&&(
        <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:20}}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:14}}>История списаний</div>
          {log.map((l,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"10px 0",borderBottom:i<log.length-1?`1px solid ${C.border}`:"none"}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{l.item}</div>
                <div style={{fontSize:11,color:C.muted}}>{l.reason} · {l.author} · {l.date} {l.time}</div>
                {l.note&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>«{l.note}»</div>}
              </div>
              <div style={{fontWeight:800,color:C.red,fontSize:14}}>−{l.qty} {l.unit}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPA_URL = process.env.REACT_APP_SUPABASE_URL||"";
const SUPA_KEY = process.env.REACT_APP_SUPABASE_KEY||"";

const supaFetch = async (method, table, body=null, params="") => {
  const url = `${SUPA_URL}/rest/v1/${table}${params}`;
  const res = await fetch(url,{
    method,
    headers:{
      "apikey":SUPA_KEY,
      "Authorization":`Bearer ${SUPA_KEY}`,
      "Content-Type":"application/json",
      "Prefer": method==="POST"?"resolution=merge-duplicates":"return=minimal",
    },
    body: body?JSON.stringify(body):null,
  });
  if(method==="GET") return res.json();
  return res.ok;
};

const LS = (key,def) => { try { const v=localStorage.getItem(key); return v?JSON.parse(v):def; } catch{ return def; } };

// ─── ГЛАВНОЕ ПРИЛОЖЕНИЕ ───────────────────────────────────────────────────────
export default function App(){
  const [currentUser,setCurrentUser] = useState(INIT_USERS[0]);
  const [page,setPage]               = useState("dashboard");
  const [sidebarOpen,setSidebarOpen] = useState(true);
  const [showUserMenu,setUserMenu]   = useState(false);
  const [loading,setLoading]         = useState(true);

  const [rawStock,  setRawStock]   = useState(initRawStock);
  const [semiStock, setSemiStock]  = useState(initSemiStock);
  const [techCards, setTechCards]  = useState(INIT_TECH_CARDS);
  const [sales,     setSales]      = useState([]);
  const [expenses,  setExpenses]   = useState([]);
  const [users,     setUsers]      = useState(INIT_USERS);
  const [toast,showToast]          = useToast();

  // Название вкладки браузера
  useEffect(()=>{ document.title = "VkusBuket"; }, []);
  useEffect(()=>{
    const load = async () => {
      try {
        const [raw,semi,tc,sl,exp] = await Promise.all([
          supaFetch("GET","raw_stock"),
          supaFetch("GET","semi_stock"),
          supaFetch("GET","tech_cards"),
          supaFetch("GET","sales","",`?order=created_at.desc&limit=500`),
          supaFetch("GET","expenses"),
        ]);
        if(Array.isArray(raw)&&raw.length)  setRawStock(raw);
        if(Array.isArray(semi)&&semi.length) setSemiStock(semi);
        if(Array.isArray(tc)&&tc.length)    setTechCards(tc.map(t=>({...t,ings:t.ings||[]})));
        if(Array.isArray(sl)&&sl.length)    setSales(sl.map(s=>({...s,items:s.items||[],payMode:s.pay_mode,time:s.sale_time,cogs:s.cogs||0})));
        if(Array.isArray(exp)&&exp.length)  setExpenses(exp.map(e=>({...e,desc:e.note,date:e.expense_date})));
        // Первый запуск — заливаем начальные данные
        if(!Array.isArray(raw)||!raw.length)  await supaFetch("POST","raw_stock",initRawStock);
        if(!Array.isArray(semi)||!semi.length) await supaFetch("POST","semi_stock",initSemiStock);
        if(!Array.isArray(tc)||!tc.length)    await supaFetch("POST","tech_cards",INIT_TECH_CARDS);
      } catch(e) {
        console.warn("Supabase недоступен, работаем локально:",e);
        setRawStock(LS("vb_raw",initRawStock));
        setSemiStock(LS("vb_semi",initSemiStock));
        setTechCards(LS("vb_tc",INIT_TECH_CARDS));
        setSales(LS("vb_sales",[]));
        setExpenses(LS("vb_exp",[]));
      }
      setLoading(false);
    };
    load();
  },[]);

  // Синхронизация склада → Supabase
  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_raw",JSON.stringify(rawStock));
    rawStock.forEach(r=>supaFetch("POST","raw_stock",r).catch(()=>{}));
  },[rawStock,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_semi",JSON.stringify(semiStock));
    semiStock.forEach(s=>supaFetch("POST","semi_stock",s).catch(()=>{}));
  },[semiStock,loading]);

  useEffect(()=>{
    if(loading) return;
    localStorage.setItem("vb_tc",JSON.stringify(techCards));
    techCards.forEach(t=>supaFetch("POST","tech_cards",t).catch(()=>{}));
  },[techCards,loading]);

  // Обёртки setSales / setExpenses с сохранением в Supabase
  const setSalesWithSync = (updater) => {
    setSales(prev=>{
      const next = typeof updater==="function"?updater(prev):updater;
      localStorage.setItem("vb_sales",JSON.stringify(next));
      const newSale = next[next.length-1];
      if(newSale) supaFetch("POST","sales",{
        no:newSale.no, point:newSale.point, items:newSale.items,
        total:newSale.total, subtotal:newSale.subtotal||newSale.total,
        disc_amt:newSale.discAmt||0, discount:newSale.discount||0,
        cogs:newSale.cogs||0, pay_mode:newSale.payMode,
        cash_given:newSale.cashGiven||0, change_amt:newSale.change||0,
        sale_time:newSale.time,
      }).catch(()=>{});
      return next;
    });
  };

  const setExpensesWithSync = (updater) => {
    setExpenses(prev=>{
      const next = typeof updater==="function"?updater(prev):updater;
      localStorage.setItem("vb_exp",JSON.stringify(next));
      const added = next.filter(n=>!prev.find(p=>p.id===n.id));
      added.forEach(e=>supaFetch("POST","expenses",{
        cat:e.cat, note:e.desc||e.note, amount:e.amount,
        point:e.point, paid:e.paid, expense_date:e.date,
      }).catch(()=>{}));
      return next;
    });
  };

  if(loading) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0F0F13",color:"#E8A0B4",flexDirection:"column",gap:16}}>
      <div style={{fontSize:32,fontWeight:900,letterSpacing:-1}}>VKUS<span style={{color:"#EAEAF0",fontWeight:300}}>BUKET</span></div>
      <div style={{fontSize:14,color:"#7A7A94"}}>⟳ Загрузка данных из облака...</div>
    </div>
  );

  const role       = ROLES[currentUser.role];
  const allowedNav = NAV.filter(n=>role.nav.includes(n.id));

  const totalRev = sales.reduce((s,i)=>s+i.total,0);
  const totalOrd = sales.length;

  return(
    <div style={{fontFamily:"'DM Sans','Segoe UI',sans-serif",background:C.bg,minHeight:"100vh",display:"flex",color:C.text,overflow:"hidden"}}>
      <Toast toast={toast}/>

      {/* САЙДБАР */}
      <div style={{width:sidebarOpen?220:58,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0,transition:"width .2s",overflow:"hidden"}}>
        {/* Лого */}
        <div style={{padding:"18px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          {sidebarOpen&&<span style={{fontSize:20,fontWeight:900,color:C.accent,letterSpacing:-0.5}}>VKUS<span style={{color:C.text,fontWeight:300}}>BUKET</span></span>}
          <button onClick={()=>setSidebarOpen(v=>!v)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:4,flexShrink:0}}>{sidebarOpen?"←":"→"}</button>
        </div>

        {/* Навигация */}
        <div style={{flex:1,padding:"10px 6px",overflowY:"auto"}}>
          {allowedNav.map(n=>{
            const active=page===n.id;
            return(
              <button key={n.id} onClick={()=>setPage(n.id)} title={!sidebarOpen?n.label:""} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 10px",borderRadius:10,border:"none",cursor:"pointer",background:active?C.accentSoft:"transparent",color:active?C.accent:C.muted,fontWeight:active?700:400,width:"100%",textAlign:"left",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden"}}>
                <span style={{fontSize:18,flexShrink:0}}>{n.icon}</span>
                {sidebarOpen&&<span style={{fontSize:13}}>{n.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Пользователь */}
        <div style={{padding:"10px 8px",borderTop:`1px solid ${C.border}`,position:"relative"}}>
          {showUserMenu&&(
            <div style={{position:"absolute",bottom:70,left:8,right:8,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:8,zIndex:200}}>
              {users.map(u=>(
                <button key={u.id} onClick={()=>{setCurrentUser(u);setUserMenu(false);setPage(ROLES[u.role].nav[0]);showToast(`Вошли как: ${u.name}`);}} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:8,border:"none",background:currentUser.id===u.id?C.accentSoft:"transparent",color:currentUser.id===u.id?C.accent:C.text,cursor:"pointer",width:"100%",textAlign:"left",fontSize:13,fontWeight:currentUser.id===u.id?700:400}}>
                  <span>{ROLES[u.role].icon}</span>{sidebarOpen&&u.name}
                </button>
              ))}
            </div>
          )}
          <button onClick={()=>setUserMenu(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 8px",borderRadius:10,border:"none",background:"transparent",color:C.text,cursor:"pointer",width:"100%",textAlign:"left"}}>
            <div style={{width:32,height:32,borderRadius:16,background:role.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{role.icon}</div>
            {sidebarOpen&&<div><div style={{fontSize:12,fontWeight:700}}>{currentUser.name}</div><div style={{fontSize:10,color:C.muted}}>{role.label}</div></div>}
          </button>
        </div>
      </div>

      {/* ОСНОВНОЙ КОНТЕНТ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Топбар */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"13px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{fontSize:16,fontWeight:800}}>{NAV.find(n=>n.id===page)?.label}</div>
          <div style={{display:"flex",gap:10}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",fontSize:12}}>
              <span style={{color:C.muted}}>Заказов: </span><span style={{fontWeight:700,color:C.blue}}>{totalOrd}</span>
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",fontSize:12}}>
              <span style={{color:C.muted}}>Выручка: </span><span style={{fontWeight:700,color:C.accent}}>{fmtS(totalRev)}</span>
            </div>
          </div>
        </div>

        {/* Страницы */}
        <div style={{flex:1,overflowY:"auto"}}>
          {page==="dashboard"  && <Dashboard   sales={sales} semiStock={semiStock} rawStock={rawStock} expenses={expenses}/>}
          {page==="pos"        && <POS         semiStock={semiStock} setSemiStock={setSemiStock} rawStock={rawStock} sales={sales} setSales={setSalesWithSync} currentUser={currentUser} techCards={techCards}/>}
          {page==="production" && <Production  rawStock={rawStock} setRawStock={setRawStock} semiStock={semiStock} setSemiStock={setSemiStock}/>}
          {page==="warehouse"  && <Warehouse   rawStock={rawStock} setRawStock={setRawStock} semiStock={semiStock}/>}
          {page==="inventory"  && <Inventory   semiStock={semiStock} sales={sales}/>}
          {page==="writeoff"   && <WriteOff    rawStock={rawStock} setRawStock={setRawStock} semiStock={semiStock} setSemiStock={setSemiStock}/>}
          {page==="expenses"   && <Expenses    expenses={expenses} setExpenses={setExpensesWithSync}/>}
          {page==="reports"    && <Reports     sales={sales} expenses={expenses} rawStock={rawStock} semiStock={semiStock}/>}
          {page==="settings"   && <Settings    techCards={techCards} setTechCards={setTechCards} rawStock={rawStock} setRawStock={setRawStock} semiStock={semiStock} users={users} setUsers={setUsers}/>}
        </div>
      </div>
    </div>
  );
}
