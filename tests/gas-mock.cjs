// Test double, bukan emulator GAS atau bukti perilaku Google Sheets produksi.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
class Range {
  constructor(sheet,r,c,h,w) {
    if(r<1||c<1||h<1||w<1||r+h-1>sheet.maxRows||c+w-1>sheet.maxCols) throw Error('Invalid range');
    Object.assign(this,{sheet,r,c,h,w});
  }
  getValues() {return Array.from({length:this.h},(_,i)=>Array.from({length:this.w},(_,j)=>this.sheet.cells[this.r+i-1]?.[this.c+j-1]??''));}
  getFormulas() {return this.getValues().map(row=>row.map(v=>typeof v==='string'&&v.startsWith('=')?v:''));}
  setValues(rows) {
    if(rows.length!==this.h||rows.some(r=>r.length!==this.w)) throw Error('Invalid matrix');
    if(this.sheet.failWrite || this.sheet.failOnWrite === this.sheet.writes + 1) throw Error('Injected write failure');
    rows.forEach((row,i)=>row.forEach((v,j)=>{this.sheet.cells[this.r+i-1]??=[];this.sheet.cells[this.r+i-1][this.c+j-1]=v;}));
    this.sheet.writes++;return this;
  }
}
class Sheet {
  constructor(name){Object.assign(this,{name,cells:[],maxRows:1000,maxCols:26,writes:0});}
  getName(){return this.name;}
  getLastRow(){let n=this.cells.length;while(n&&!(this.cells[n-1]||[]).some(v=>v!==''&&v!==undefined))n--;return n;}
  getLastColumn(){return this.cells.reduce((max,row)=>Math.max(max,row.reduce((n,v,i)=>v!==''&&v!==undefined?i+1:n,0)),0);}
  getMaxRows(){return this.maxRows;}
  getMaxColumns(){return this.maxCols;}
  getRange(...args){return new Range(this,...args);}
  setFrozenRows(n){this.frozen=n;return this;}
  deleteRows(start,count){if(start<2||start+count-1>this.maxRows)throw Error('Invalid delete');this.cells.splice(start-1,count);this.maxRows-=count;}
  insertRowsAfter(after,n){if(after!==this.maxRows)throw Error('Unexpected expansion');this.maxRows+=n;}
  insertColumnsAfter(after,n){if(after!==this.maxCols)throw Error('Unexpected expansion');this.maxCols+=n;}
}
class Spreadsheet {
  constructor(){this.sheets=new Map();}
  getSheetByName(name){return this.sheets.get(name)||null;}
  insertSheet(name){if(this.sheets.has(name))throw Error('Duplicate sheet');const sh=new Sheet(name);this.sheets.set(name,sh);return sh;}
}
function environment() {
  const spreadsheet=new Spreadsheet();
  const state={busy:false,held:false,releases:0,flushes:0,events:[],properties:{}};
  class GasDate extends Date {constructor(...args){super(...(args.length?args:[state.clock??Date.now()]));}static now(){return state.clock??Date.now();}}
  const context=vm.createContext({console,Date:GasDate,JSON,Number,Set,Map,Object,Array,Error,
    Utilities:{getUuid:()=>crypto.randomUUID(), Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'sha256'},
      computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v,'utf8').digest()].map(b=>b>127?b-256:b),
      computeHmacSha256Signature:(v,k)=>[...crypto.createHmac('sha256',k).update(v,'utf8').digest()].map(b=>b>127?b-256:b),
      base64DecodeWebSafe:v=>[...Buffer.from(v,'base64url')],
      base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),
      newBlob:v=>({getDataAsString:()=>Buffer.from(v).toString('utf8')})},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:content=>({content,setMimeType(){return this;}})},
    SpreadsheetApp:{openById:id=>{if(id!=='test-id')throw Error('Unknown spreadsheet');return spreadsheet;},flush:()=>{state.events.push('flush');state.flushes++;if(state.failFlush)throw Error('flush failed');}},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>state.properties[key]??null,setProperty:(key,value)=>{if(state.propertySetFailure===true||state.propertySetFailure===key)throw Error('Injected property set failure');state.properties[key]=value;},deleteProperty:key=>{if(state.propertyDeleteFailure===true||state.propertyDeleteFailure===key)throw Error('Injected property delete failure');delete state.properties[key];}})},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(state.busy||state.held)return false;state.events.push('lock');state.held=true;return true;},releaseLock:()=>{state.events.push('release');state.held=false;state.releases++;}})}
  });
  const root=path.join(__dirname,'../backend-gas/src');
  // Pemuatan acak-terbalik membuktikan tidak ada inisialisasi silang bergantung nama file.
  fs.readdirSync(root).filter(f=>f.endsWith('.gs')).sort().reverse().forEach(f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context,{filename:f}));
  return {context,spreadsheet,state,initialize:()=>context.SsoDatabaseInitializer.initialize_(spreadsheet),db:()=>context.SsoDatabase.create_(spreadsheet)};
}
module.exports={environment,Spreadsheet};
