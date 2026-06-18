import React, { useState, useEffect } from 'react';
import { C, ROLES } from '../constants';
export default function Settings({isMobile,techCards,setTechCards,rawStock,setRawStock,semiStock,users,setUsers,customers,setCustomers,currentUser,tenantAuth}){
  const [tab,setTab]=useState("products");
  const [search,setSearch]=useState("");
  const [isRawCollapsed, setIsRawCollapsed] = useState(false);
  const [isSemiCollapsed, setIsSemiCollapsed] = useState(false);
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
      if (field === "purchase_price") {
        const newPrice = parseFloat(val) || 0;
        if (newPrice !== r.purchase_price) {
          supaFetch("POST","raw_material_prices",{raw_id:id,price:newPrice,effective_from:new Date().toISOString()}).catch(()=>{});
        }
        return { ...r, purchase_price: newPrice };
      } else if (field === "purchase_volume") {
        return { ...r, purchase_volume: parseFloat(val) || 1 };
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
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
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
                            {(() => {
                               const cogs = calcProductCOGS(tc, semiStock, rawStock);
                               const recPrice = cogs * 3.3;
                               const isUnderpriced = recPrice > tc.price;
                               const role = currentUser?.role || 'cashier';
                               const showHint = (role === 'admin' && isUnderpriced) || (role === 'owner' || role === 'director');
                               return showHint ? (
                                 <div style={{fontSize:10, color: isUnderpriced ? C.red : C.muted, marginTop:4}}>Рек: {fmtM(Math.round(recPrice))}</div>
                               ) : null;
                            })()}
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
                      <div style={{display:"flex",alignItems:"center",cursor:"pointer",flexWrap:"wrap",gap:8}} onClick={()=>setEditId(tc.id)}>
                        <div style={{flex:1,minWidth:120,fontWeight:600,fontSize:14}}>{tc.product}</div>
                        {(() => {
                           const cogs = calcProductCOGS(tc, semiStock, rawStock);
                           const recPrice = cogs * 3.3;
                           const isUnderpriced = recPrice > tc.price;
                           const role = currentUser?.role || 'cashier';
                           const showHint = (role === 'admin' && isUnderpriced) || (role === 'owner' || role === 'director');
                           return showHint ? (
                             <div style={{fontSize:11,color: isUnderpriced ? C.red : C.muted, marginRight:8, background:C.surface, padding:"2px 6px", borderRadius:4}}>
                               Рек. цена: {fmtM(Math.round(recPrice))}
                             </div>
                           ) : null;
                        })()}
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
                      <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>ЗАКУП (₸)</div><input type="number" value={r.purchase_price||0} onChange={e=>updateRaw(r.id,"purchase_price",e.target.value)} style={inputStyle}/></div>
<div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>ОБЪЕМ ЗАКУПА</div><input type="number" value={r.purchase_volume||1} onChange={e=>updateRaw(r.id,"purchase_volume",e.target.value)} style={inputStyle}/></div>
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
                      <div style={{fontWeight:700,color:C.yellow}}>{fmtM(r.purchase_price||0)} / {r.purchase_volume||1}{r.unit}</div>
                      <div style={{fontSize:12,color:C.muted}}>✏️</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={()=>setRawStock(p=>[...p,{id:`r_${Date.now()}`,name:"Новая позиция",unit:"кг",purchase_price:0, purchase_volume:1,qty:{ "Склад":0,"Мастерская":0,"Фуд Трак":0,"Жара":0,"Парк":0 }}])} style={{marginTop:10,padding:"10px 20px",borderRadius:10,border:`1px solid ${C.border}`,background:C.card,color:C.text,cursor:"pointer",fontSize:13}}>+ Добавить сырьё</button>
        </div>
      )}

      {tab==="users"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
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

          {currentUser?.role === "owner" && tenantAuth && (
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.red}`,padding:20,marginTop:20}}>
              <div style={{fontSize:16,fontWeight:800,marginBottom:10,color:C.red}}>Смена Мастер-пароля (SaaS)</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:15}}>Внимание: это изменит пароль от вашей Мастерской. Сообщите новый пароль кассирам для входа на рабочих устройствах. Ваша почта останется прежней.</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end"}}>
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:4}}>НОВЫЙ ПАРОЛЬ</div>
                  <input type="text" id="newMasterPassword" placeholder="Минимум 6 символов" style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:14,boxSizing:"border-box",outline:"none",width:200}} />
                </div>
                <button onClick={async ()=>{
                  const newPw = document.getElementById("newMasterPassword").value;
                  if(newPw.length < 6) return alert("Пароль должен быть не менее 6 символов");
                  if(!window.confirm("Точно изменить мастер-пароль?")) return;
                  try {
                    const res = await fetch("https://zsplctffdvyzbzlnxuew.supabase.co/auth/v1/user", {
                      method: "PUT",
                      headers: {
                        "apikey": "sb_publishable_7bNd98DdOHOzUr3-cGNBJA_7enkN_6s",
                        "Authorization": "Bearer " + tenantAuth.access_token,
                        "Content-Type": "application/json"
                      },
                      body: JSON.stringify({ password: newPw })
                    });
                    if (res.ok) {
                      alert("Мастер-пароль успешно изменён! Вы можете давать его кассирам.");
                      document.getElementById("newMasterPassword").value = "";
                    } else {
                      const err = await res.json();
                      alert("Ошибка: " + err.msg);
                    }
                  } catch(e) { alert("Ошибка сети"); }
                }} style={{padding:"11px 20px",borderRadius:8,border:"none",background:C.red,color:"#fff",fontWeight:800,cursor:"pointer"}}>
                  Установить пароль
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab==="loyalty"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
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