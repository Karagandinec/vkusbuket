
const getConvertedQty = (qty, fromUnit, toUnit) => {
  if (!qty) return 0;
  if (!fromUnit || !toUnit || fromUnit === toUnit) return qty;
  if (fromUnit === "г" && toUnit === "кг") return qty / 1000;
  if (fromUnit === "кг" && toUnit === "г") return qty * 1000;
  if (fromUnit === "мл" && toUnit === "л") return qty / 1000;
  if (fromUnit === "л" && toUnit === "мл") return qty * 1000;
  return qty;
};



const INIT_USERS = [];

// Инициализируем остатки на "Склад" согласно данным из Excel
const initRawStock = [
  { id:"r1",  name:"Клубника свежая",              unit:"г",    purchase_price:2500, purchase_volume:1000,    qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r2",  name:"Шоколад молочный",             unit:"г",    purchase_price:8950, purchase_volume:1000,   qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r3",  name:"Шоколад белый",                unit:"г",    purchase_price:7950, purchase_volume:1000,   qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r4",  name:"Шоколад тёмный Callebaut",     unit:"г",    purchase_price:4800, purchase_volume:1000,    qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r5",  name:"Дубайская паста",              unit:"г",    purchase_price:16500, purchase_volume:1000,   qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r6",  name:"Мороженое сливочное",          unit:"г",    purchase_price:2000, purchase_volume:1000,      qty: { "Склад": 38000, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r37", name:"Мороженое шоколадное",         unit:"г",    purchase_price:2000, purchase_volume:1000,      qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r38", name:"Рожок вафельный",              unit:"шт",   purchase_price:80, purchase_volume:1,     qty: { "Склад": 100, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r7",  name:"Краситель пищевой",            unit:"г",    purchase_price:19000, purchase_volume:1000,     qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r8",  name:"Кандурин",                     unit:"г",    purchase_price:100000, purchase_volume:1000,    qty: { "Склад": 0, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r9",  name:"Скотч двухсторонний",          unit:"шт",   purchase_price:100, purchase_volume:1,    qty: { "Склад": 6, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r10", name:"Лента декоративная 1см",       unit:"рул",  purchase_price:400, purchase_volume:1,    qty: { "Склад": 29, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r11", name:"Розетки бумажные (1000шт)",    unit:"уп",   purchase_price:1140, purchase_volume:1,   qty: { "Склад": 5, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r12", name:"Тишью бумага",                 unit:"лист", purchase_price:0.4, purchase_volume:1,    qty: { "Склад": 292, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r13", name:"Шпажки / палочки (70шт)",      unit:"уп",   purchase_price:180, purchase_volume:1,    qty: { "Склад": 11, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r14", name:"Слюда (упак. плёнка)",         unit:"м",    purchase_price:8.5, purchase_volume:1,    qty: { "Склад": 100, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r15", name:"Упаковочная бумага",           unit:"лист", purchase_price:50, purchase_volume:1,     qty: { "Склад": 200, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r16", name:"Бичевка / верёвка",            unit:"рул",  purchase_price:5, purchase_volume:1,      qty: { "Склад": 8, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r17", name:"Открытка",                     unit:"шт",   purchase_price:35, purchase_volume:1,     qty: { "Склад": 100, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r18", name:"Эмблема / бирка",              unit:"рул",  purchase_price:5, purchase_volume:1,      qty: { "Склад": 20, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r19", name:"Пакет крафт малый",            unit:"шт",   purchase_price:80, purchase_volume:1,     qty: { "Склад": 86, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r20", name:"Пакет крафт средний",          unit:"шт",   purchase_price:85, purchase_volume:1,     qty: { "Склад": 52, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r21", name:"Пакет крафт большой",          unit:"шт",   purchase_price:120, purchase_volume:1,    qty: { "Склад": 89, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r22", name:"Скотч обычный (широкий)",      unit:"шт",   purchase_price:430, purchase_volume:1,    qty: { "Склад": 191, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r23", name:"Лента декоративная 2см",       unit:"рул",  purchase_price:400, purchase_volume:1,    qty: { "Склад": 8, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r24", name:"Креманка",                     unit:"шт",   purchase_price:57, purchase_volume:1,     qty: { "Склад": 1264, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r25", name:"Вилка одноразовая (уп.)",      unit:"уп",   purchase_price:13, purchase_volume:1,     qty: { "Склад": 12, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r26", name:"Салфетка",                     unit:"шт",   purchase_price:13, purchase_volume:1,     qty: { "Склад": 500, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r27", name:"Посыпка кондитерская (г)",     unit:"г",    purchase_price:25, purchase_volume:1000,  qty: { "Склад": 2476, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r28", name:"Макси стакан",                 unit:"шт",   purchase_price:39.6, purchase_volume:1,   qty: { "Склад": 163, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r29", name:"Коробки набор 8шт",            unit:"шт",   purchase_price:220, purchase_volume:1,    qty: { "Склад": 2119, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r30", name:"Коробки набор 12шт",           unit:"шт",   purchase_price:200, purchase_volume:1,    qty: { "Склад": 530, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r31", name:"Коробки набор 15шт",           unit:"шт",   purchase_price:330, purchase_volume:1,    qty: { "Склад": 174, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r32", name:"Коробки набор 20шт",           unit:"шт",   purchase_price:410, purchase_volume:1,    qty: { "Склад": 173, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r33", name:"Коробки набор 25шт",           unit:"шт",   purchase_price:430, purchase_volume:1,    qty: { "Склад": 154, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r34", name:"Коробки набор 35шт",           unit:"шт",   purchase_price:430, purchase_volume:1,    qty: { "Склад": 69, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r35", name:"Коробки набор 48шт",           unit:"шт",   purchase_price:185, purchase_volume:1,    qty: { "Склад": 75, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
  { id:"r36", name:"Коробки набор 64шт",           unit:"шт",   purchase_price:700, purchase_volume:1,    qty: { "Склад": 8, "Мастерская": 0, "Фуд Трак": 0, "Жара": 0, "Парк": 0 } },
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

const getPackagingItems = (item) => {
  const p = (item.name || item.product || "").toLowerCase();
  const id = (item.id || "").toLowerCase();
  const items = [];
  
  // Helper for word boundary matches (prevents "15" matching "150")
  const hasNum = (num) => new RegExp(`\\b${num}\\b`).test(p);
  const hasAny = (nums) => nums.some(n => hasNum(n));
  
  // 1. Коробки и пакеты для наборов
  if (p.includes("набор") && !p.includes("букет")) {
    if (hasNum("8")) items.push({ rawId: "r29", qty: 1 });
    else if (hasAny(["10", "12"])) items.push({ rawId: "r30", qty: 1 });
    else if (hasNum("15")) items.push({ rawId: "r31", qty: 1 });
    else if (hasNum("20")) items.push({ rawId: "r32", qty: 1 });
    else if (hasNum("25")) items.push({ rawId: "r33", qty: 1 });
    else if (hasNum("35")) items.push({ rawId: "r34", qty: 1 });
    else if (hasNum("48")) items.push({ rawId: "r35", qty: 1 });
    else if (hasNum("64")) items.push({ rawId: "r36", qty: 1 });
    
    if (hasAny(["8", "10", "12"])) {
      items.push({ rawId: "r19", qty: 1 }); // малый пакет
    } else if (hasAny(["15", "20", "25"])) {
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
  
  // 3. Букеты и Кастомные товары
  else if (p.includes("букет") || id.startsWith("custom_")) {
    let berries = 15; // default for custom
    
    // Пытаемся вытащить количество клубник из названия или состава
    const match = p.match(/(\d+)\s*(шт|клуб|ягод)/);
    if (match) {
       berries = parseInt(match[1]);
    } else {
      if (p.includes("xxs") || hasNum("9")) berries = 9;
      else if (p.includes("xs") || hasNum("15")) berries = 15;
      else if (p.includes("s+") || hasAny(["22","23","24","25"])) berries = 24;
      else if (p.includes("s") || hasAny(["17","18","19"])) berries = 18;
      else if (p.includes("m+") || hasAny(["43","44","45"])) berries = 44;
      else if (p.includes("m") || hasAny(["33","34","35","36"])) berries = 35;
      else if (p.includes("l+") || hasAny(["68","69","70"])) berries = 69;
      else if (p.includes("l") || hasAny(["56","57","58","59","60"])) berries = 58;
      else if (p.includes("xl") || hasAny(["87","88","89","90"])) berries = 89;
      else if (p.includes("xxl") || hasAny(["120","150"])) berries = 150;
    }
    
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
      return sum + (ing.qty*(1+(ing.loss||0)/100))*((raw?.purchase_price||0)/(raw?.purchase_volume||1));
    } else {
      const semi = (semiStock||[]).find(s=>s.id===ing.sid);
      if(!semi) return sum;
      const raw  = (rawStock||[]).find(r=>r.id===semi.rawId);
      return sum + (ing.qty*(1+(ing.loss||0)/100))*((raw?.purchase_price||0)/(raw?.purchase_volume||1));
    }
  },0);

const calcProductCOGS = (item, semiStock, rawStock) => {
  if (!item) return 0;
  const kitchenCost = calcCost(item.ings, semiStock, rawStock);
  const packaging = getPackagingItems(item);
  const pkgCost = (packaging||[]).reduce((sum, pkg) => {
    const raw = (rawStock||[]).find(r => r.id === pkg.rawId);
    return sum + pkg.qty * (raw?.price || 0);
  }, 0);
  return kitchenCost + pkgCost;
};

const calcCartItemCOGS = (item, semiStock, rawStock) => {
  const baseCOGS = calcProductCOGS(item, semiStock, rawStock);
  const vanillaPrice = (() => { const r = rawStock.find(x=>x.id==="r6"); return r ? (r.purchase_price||0)/(r.purchase_volume||1) : 0; })();
  const chocolateIcePrice = (() => { const r = rawStock.find(x=>x.id==="r37"); return r ? (r.purchase_price||0)/(r.purchase_volume||1) : 0; })();
  const milkChocPrice = (() => { const r = rawStock.find(x=>x.id==="r2"); return r ? (r.purchase_price||0)/(r.purchase_volume||1) : 0; })();
  
  const vanillaCost = (item.extras?.s6 || 0) * 50 * vanillaPrice;
  const chocIceCost = (item.extras?.s7 || 0) * 50 * chocolateIcePrice;
  const milkChocCost = (item.extras?.s2 || 0) * 15 * milkChocPrice;
  
  // Add packaging costs
  const packaging = getPackagingItems(item);
  let packagingCost = 0;
  for(const pkg of packaging){
    const rItem = rawStock.find(r => r.id === pkg.rawId);
    if(rItem && rItem.purchase_price && rItem.purchase_volume) {
      packagingCost += (rItem.purchase_price / rItem.purchase_volume) * pkg.qty;
    }
  }
  
  return baseCOGS + vanillaCost + chocIceCost + milkChocCost + packagingCost;
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
    const packaging = getPackagingItems(item);
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