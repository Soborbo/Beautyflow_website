import { describe, it, expect } from 'vitest';
import {
  runSink,
  decideLeadAcceptance,
  customerEmailStatus,
  readCrmAcceptance,
} from '../lead-delivery';

describe('lead-delivery — fogadónkénti eredmény', () => {
  it('kimaradó fogadó = skipped (nem fut, nem siker); dobás = failed; feloldás = delivered', async () => {
    let ran = false;
    expect(await runSink(false, async () => { ran = true; })).toEqual({ status: 'skipped' });
    expect(ran).toBe(false);
    const err = new Error('x');
    expect(await runSink(true, async () => { throw err; })).toEqual({ status: 'failed', error: err });
    expect(await runSink(true, async () => 'id-1')).toEqual({ status: 'delivered', value: 'id-1' });
  });

  it('elfogadás CSAK delivered üzleti fogadóval; csupa skipped/failed → nem elfogadott', () => {
    expect(decideLeadAcceptance({ a: { status: 'skipped' }, b: { status: 'failed' } }).accepted).toBe(false);
    const d = decideLeadAcceptance({ a: { status: 'failed' }, crm: { status: 'delivered' }, s: { status: 'skipped' } });
    expect(d).toEqual({ accepted: true, acceptedBy: ['crm'], failed: ['a'], skipped: ['s'] });
  });

  it('ügyféllevél-státusz', () => {
    expect(customerEmailStatus(null)).toBe('not_attempted');
    expect(customerEmailStatus({ status: 'delivered' })).toBe('sent');
    expect(customerEmailStatus({ status: 'skipped' })).toBe('skipped');
    expect(customerEmailStatus({ status: 'failed' })).toBe('failed');
  });

  it('CRM: a 2xx önmagában nem siker — success:false dob; nem-2xx dob; id csak érvényes formában', async () => {
    await expect(readCrmAcceptance(new Response('{"success":false}', { status: 200 }))).rejects.toThrow(/success:false/);
    await expect(readCrmAcceptance(new Response('x', { status: 502 }))).rejects.toThrow(/502/);
    expect(await readCrmAcceptance(new Response('{"success":true,"id":"lead_12345678"}'))).toBe('lead_12345678');
    expect(await readCrmAcceptance(new Response('{"success":true,"id":"x y"}'))).toBeUndefined();
    expect(await readCrmAcceptance(new Response('ok'))).toBeUndefined();
  });
});
