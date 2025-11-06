const TABLE = {
  peninsula: {
    'Correos':         { service:'48-72h', price:4.50 },
    'Correos Express': { service:'24/48h', price:6.90 },
    'SEUR':            { service:'24h',    price:7.90 },
    'MRW':             { service:'24h',    price:7.50 },
  },
  baleares: {
    'Correos':         { service:'72h',    price:7.50 },
    'Correos Express': { service:'48/72h', price:9.90 },
    'SEUR':            { service:'48h',    price:10.90 },
    'MRW':             { service:'48h',    price:10.50 },
  },
  canarias: {
    'Correos':         { service:'5-7d',   price:9.50 },
    'Correos Express': { service:'4-6d',   price:12.90 },
    'SEUR':            { service:'4-6d',   price:13.90 },
    'MRW':             { service:'4-6d',   price:13.50 },
  },
  ceuta_melilla: {
    'Correos':         { service:'4-6d',   price:9.90 },
    'SEUR':            { service:'3-5d',   price:12.90 },
    'MRW':             { service:'3-5d',   price:12.50 },
  },
  eu: {
    'Correos':         { service:'5-7d',   price:12.90 },
    'SEUR':            { service:'3-5d',   price:15.90 },
    'MRW':             { service:'3-5d',   price:15.50 },
    'Correos Express': { service:'4-6d',   price:14.90 },
  },
};

function resolveZone(country='ES', province='', postalCode='') {
  const cc = String(country).toUpperCase();
  if (cc !== 'ES') return 'eu';
  const p = (province||'').toLowerCase();
  const pc = String(postalCode||'');
  if (['islas baleares','illes balears'].includes(p)) return 'baleares';
  if (['santa cruz de tenerife','las palmas'].includes(p)) return 'canarias';
  if (['ceuta','melilla'].includes(p)) return 'ceuta_melilla';
  if (/^(35|38)\d{3}$/.test(pc)) return 'canarias';
  return 'peninsula';
}

function quoteOptions(dest) {
  const zone = resolveZone(dest.country, dest.province, dest.postalCode);
  const rows = TABLE[zone];
  return Object.keys(rows).map(carrier => ({
    carrier, service: rows[carrier].service, zone, cost: rows[carrier].price,
  }));
}

module.exports = { resolveZone, quoteOptions };
