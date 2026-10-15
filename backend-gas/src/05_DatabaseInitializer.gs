/** Idempoten untuk skema v1. Tidak melakukan migrasi otomatis. */
var SsoDatabaseInitializer = (function () {
  function initialize_(spreadsheet) {
    return SsoDbUtils.withLock(function(){
      var names=Object.keys(SsoSchema.tables), created=[], initialized=[], settingsAdded=[];
      // Preflight seluruh sheet SEBELUM mutasi, termasuk versi Settings.
      names.forEach(function(name){
        var sh=spreadsheet.getSheetByName(name);
        if(sh && sh.getLastRow()>0) SsoDbUtils.assertHeader(sh,SsoSchema.tables[name]);
      });
      var settings=spreadsheet.getSheetByName('Settings'), existing={};
      if(settings && settings.getLastRow()>1) {
        if(settings.getLastRow()>20001) SsoDbUtils.fail('SCAN_LIMIT_EXCEEDED','Settings terlalu besar.');
        var range=settings.getRange(2,1,settings.getLastRow()-1,4);
        if(range.getFormulas().some(function(row){return row.some(function(v){return v!=='';});})) SsoDbUtils.fail('DATA_INTEGRITY_ERROR','Formula pada Settings ditolak.');
        range.getValues().forEach(function(row){
          var key=SsoDbUtils.decode(row[0]);
          if(!key || Object.prototype.hasOwnProperty.call(existing,key)) SsoDbUtils.fail('DATA_INTEGRITY_ERROR','Kunci Settings kosong atau duplikat.');
          existing[key]=SsoDbUtils.decode(row[1]);
        });
        if(existing.schema_version!==undefined && existing.schema_version!==SsoSchema.version) SsoDbUtils.fail('SCHEMA_MISMATCH','Versi database berbeda; migrasi diperlukan.');
      }
      names.forEach(function(name){
        var sh=spreadsheet.getSheetByName(name), columns=SsoSchema.tables[name].columns;
        if(!sh) {sh=spreadsheet.insertSheet(name);created.push(name);}
        if(sh.getLastRow()===0) {
          if(sh.getMaxColumns()<columns.length) sh.insertColumnsAfter(sh.getMaxColumns(),columns.length-sh.getMaxColumns());
          sh.getRange(1,1,1,columns.length).setValues([columns]);
          sh.setFrozenRows(1);initialized.push(name);
        }
      });
      var defaults=[];
      Object.keys(SsoSchema.defaults).forEach(function(key){
        if(!Object.prototype.hasOwnProperty.call(existing,key)) {
          var d=SsoSchema.defaults[key];defaults.push([key,d[0],d[1],SsoDbUtils.now()].map(SsoDbUtils.encode));settingsAdded.push(key);
        }
      });
      if(defaults.length) {
        settings=spreadsheet.getSheetByName('Settings');var start=settings.getLastRow()+1;
        SsoDbUtils.ensureRows(settings,start+defaults.length-1);settings.getRange(start,1,defaults.length,4).setValues(defaults);
      }
      return {success:true,schema_version:SsoSchema.version,created_sheets:created,initialized_headers:initialized,settings_added:settingsAdded};
    });
  }
  return {initialize_:initialize_};
})();

function initializeDatabase() {
  return SsoDatabaseInitializer.initialize_(SsoDbUtils.openConfigured());
}
function validateDatabase() {
  return SsoDatabase.configured_().validateIntegrity();
}
