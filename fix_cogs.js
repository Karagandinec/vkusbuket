const fs = require('fs');
let code = fs.readFileSync('C:/Projects/sweetsync_vkusbuket/src/utils.js', 'utf8');

code = code.replace(/export const calcCost =  \(ings, semiStock, rawStock\) =>[\s\S]*?\},0\);/, 
`export const getPricePerUnit = (raw) => {
  if (!raw) return 0;
  if (raw.purchase_volume && raw.purchase_price) {
    return raw.purchase_price / raw.purchase_volume;
  }
  return raw.price || 0;
};

export const calcCost =  (ings, semiStock, rawStock) =>
  (ings||[]).reduce((sum,ing)=>{
    if (ing.rid) {
      const raw = (rawStock||[]).find(r=>r.id===ing.rid);
      return sum + (ing.qty*(1+(ing.loss||0)/100))*getPricePerUnit(raw);
    } else {
      const semi = (semiStock||[]).find(s=>s.id===ing.sid);
      if(!semi) return sum;
      const raw  = (rawStock||[]).find(r=>r.id===semi.rawId);
      return sum + (ing.qty*(1+(ing.loss||0)/100))*getPricePerUnit(raw);
    }
  },0);`);

code = code.replace(/const raw = \(rawStock\|\|\[\]\)\.find\(r => r\.id === pkg\.rawId\);\s+return sum \+ pkg\.qty \* \(raw\?\.price \|\| 0\);/g,
`const raw = (rawStock||[]).find(r => r.id === pkg.rawId);
    return sum + pkg.qty * getPricePerUnit(raw);`);

code = code.replace(/const vanillaPrice = rawStock\.find\(r=>r\.id==="r6"\)\?\.price \|\| 0;/g, `const vanillaPrice = getPricePerUnit(rawStock.find(r=>r.id==="r6"));`);
code = code.replace(/const chocolateIcePrice = rawStock\.find\(r=>r\.id==="r37"\)\?\.price \|\| 0;/g, `const chocolateIcePrice = getPricePerUnit(rawStock.find(r=>r.id==="r37"));`);
code = code.replace(/const milkChocPrice = rawStock\.find\(r=>r\.id==="r2"\)\?\.price \|\| 0;/g, `const milkChocPrice = getPricePerUnit(rawStock.find(r=>r.id==="r2"));`);

fs.writeFileSync('C:/Projects/sweetsync_vkusbuket/src/utils.js', code);
console.log('Done!');
