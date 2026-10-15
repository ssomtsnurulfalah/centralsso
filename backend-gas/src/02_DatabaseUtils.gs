var SsoDbUtils = (function () {
  // Escape reversibel. Tidak bergantung pada perilaku apostrof getValues().
  var sentinel = '\u200b';
  function fail(code, message) { var e = new Error(message); e.code = code; throw e; }
  function encode(value) {
    if (typeof value !== 'string') return value;
    return value.charAt(0) === sentinel || /^[\s\u0000-\u001f]*[=+@\-']/.test(value) ? sentinel + value : value;
  }
  function decode(value) {
    return typeof value === 'string' && value.charAt(0) === sentinel ? value.slice(1) : value;
  }
  function now() { return new Date().toISOString(); }
  function normalizeUsername(value) {
    if (typeof value !== 'string') fail('VALIDATION_ERROR','Username harus teks.');
    var result = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(result)) fail('VALIDATION_ERROR','Format username tidak valid (3–64 karakter).');
    return result;
  }
  function withLock(fn) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) fail('DATABASE_BUSY','Database sibuk; coba kembali.');
    try { return fn(); }
    finally { try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); } }
  }
  function openConfigured() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('SSO_SPREADSHEET_ID');
    var environment = props.getProperty('SSO_ENVIRONMENT');
    if (!id || ['development','staging','production'].indexOf(environment) < 0)
      fail('CONFIGURATION_ERROR','Atur SSO_SPREADSHEET_ID dan SSO_ENVIRONMENT pada Script Properties.');
    return SpreadsheetApp.openById(id);
  }
  function spec(name) {
    if (!Object.prototype.hasOwnProperty.call(SsoSchema.tables, name)) fail('UNKNOWN_TABLE','Sheet tidak diizinkan.');
    return SsoSchema.tables[name];
  }
  function assertHeader(sheet, schema) {
    var width = Math.max(sheet.getLastColumn(), schema.columns.length);
    if (sheet.getMaxColumns() < width) fail('SCHEMA_MISMATCH','Kolom sheet tidak lengkap: '+sheet.getName());
    var range = sheet.getRange(1,1,1,width);
    if (range.getFormulas()[0].some(function (v) { return v !== ''; })) fail('SCHEMA_MISMATCH','Formula pada header ditolak.');
    var actual = range.getValues()[0];
    if (actual.slice(0,schema.columns.length).some(function(v,i){return v !== schema.columns[i];}) ||
        actual.slice(schema.columns.length).some(function(v){return v !== '';}))
      fail('SCHEMA_MISMATCH','Header tidak sesuai: '+sheet.getName()+'. Jalankan migrasi eksplisit, jangan timpa data.');
  }
  function ensureRows(sheet, lastRow) {
    if (lastRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),lastRow-sheet.getMaxRows());
  }
  return {fail:fail, encode:encode, decode:decode, now:now, normalizeUsername:normalizeUsername,
    withLock:withLock, openConfigured:openConfigured, spec:spec, assertHeader:assertHeader, ensureRows:ensureRows};
})();
