import { normalizeEmail } from '../shared/auth-validation.js';
const KEY='farmrelay.pending-email.v1';
const attempts = new Map();
export function getPending(storage=globalThis.sessionStorage) {try {const v=JSON.parse(storage.getItem(KEY));return v&&typeof v.email==='string'&&v.email.length<=254?v:null;} catch {return null;}}
export function savePending(email,{role='farmer',sent=true}={},storage=globalThis.sessionStorage) {const old=getPending(storage),same=old?.email===normalizeEmail(email);const value={email:normalizeEmail(email),role,until:sent?Date.now()+60000:same?old.until:0,count:same?old.count||0:0,window:same?old.window||Date.now():Date.now()};try{storage.setItem(KEY,JSON.stringify(value));}catch{}return value;}
export function clearPending(storage=globalThis.sessionStorage){try{storage.removeItem(KEY);}catch{}}
export function resendState(pending,now=Date.now()) {return {remaining:Math.max(0,Math.ceil(((pending?.until||0)-now)/1000)),limited:(pending?.count||0)>=3&&now-(pending?.window||0)<900000};}
export function recordResend(pending,storage=globalThis.sessionStorage) {const now=Date.now();const reset=now-(pending.window||0)>=900000;const value={...pending,count:reset?1:(pending.count||0)+1,window:reset?now:pending.window,until:now+60000};try{storage.setItem(KEY,JSON.stringify(value));}catch{}return value;}
export function clientAttempt(key,limit=6,windowMs=60000,now=Date.now()){const old=attempts.get(key);const current=!old||now-old.start>=windowMs?{start:now,count:0}:old;if(current.count>=limit)return false;current.count++;attempts.set(key,current);return true;}
