// NEXUS ALPHA compatibility guard for rare nameless Extreme assets.
var shortAddr = typeof short === 'function' ? short : (value => value ? `${String(value).slice(0,5)}…${String(value).slice(-4)}` : '—');
