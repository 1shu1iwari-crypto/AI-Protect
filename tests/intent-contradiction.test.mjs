import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, checkIntentConsistency, CONTRADICTION_TYPES } from '../core/engine.mjs';

test('TICE: detects credit claim vs outgoing UPI debit QR contradiction', () => {
 const session = new Session();
 session.add({ channel: 'message', text: 'Congratulations! Your ₹3,500 refund is approved. Scan QR to receive money into your account.' });
 const res = session.add({ channel: 'qr', text: 'upi://pay?pa=merchant@okaxis&pn=CashbackDesk&am=3500.00&cu=INR' });
 
 assert.equal(res.contradiction.hasContradiction, true);
 assert.equal(res.contradiction.highestSeverity, 'critical');
 assert(res.contradiction.contradictions.some(c => c.type === CONTRADICTION_TYPES.CREDIT_VS_DEBIT));
 assert.equal(res.showWarning, true);
 assert.equal(res.severity, 'high');
});

test('TICE: detects authority claim vs remote screen-sharing action mismatch', () => {
 const session = new Session();
 session.add({ channel: 'call', text: 'I am DSP Verma from CBI New Delhi cyber crime investigation.' });
 const res = session.add({ channel: 'message', text: 'To verify your phone, install AnyDesk QuickSupport app and turn on screen share.' });
 
 assert.equal(res.contradiction.hasContradiction, true);
 assert(res.contradiction.contradictions.some(c => c.type === CONTRADICTION_TYPES.AUTHORITY_ACTION_MISMATCH));
 assert.equal(res.contradiction.highestSeverity, 'critical');
});

test('TICE: detects authority claim vs safe account transfer coercion', () => {
 const session = new Session();
 session.add({ channel: 'call', text: 'Police verification unit: your bank account is implicated in narcotics money laundering.' });
 session.add({ channel: 'message', text: 'You must transfer your funds to the RBI safe holding account for clearance.' });
 const res = session.add({ channel: 'payment', payment: { amount: 85000, newPayee: true } });
 
 assert.equal(res.contradiction.hasContradiction, true);
 assert(res.contradiction.contradictions.some(c => c.type === CONTRADICTION_TYPES.AUTHORITY_ACTION_MISMATCH));
 assert.equal(res.showWarning, true);
 assert.equal(res.severity, 'high');
});

test('TICE: detects investment profit release vs upfront withdrawal fee contradiction', () => {
 const session = new Session();
 session.add({ channel: 'message', text: 'Guaranteed 200% return on institutional trading plan.' });
 session.add({ channel: 'message', text: 'Your withdrawal profit is ₹90,000. Pay ₹5,000 clearance fee to unlock release.' });
 const res = session.add({ channel: 'payment', payment: { amount: 5000, newPayee: true } });
 
 assert.equal(res.contradiction.hasContradiction, true);
 assert(res.contradiction.contradictions.some(c => c.type === CONTRADICTION_TYPES.INVESTMENT_ADVANCE_FEE));
 assert.equal(res.showWarning, true);
});

test('TICE: normal benign transaction has zero contradictions', () => {
 const session = new Session();
 session.add({ channel: 'message', text: 'Hey, please send ₹450 for the shared lunch pizza.' });
 const res = session.add({ channel: 'payment', payment: { amount: 450, newPayee: false } });
 
 assert.equal(res.contradiction.hasContradiction, false);
 assert.equal(res.contradiction.contradictions.length, 0);
 assert.equal(res.showWarning, false);
 assert.equal(res.severity, 'quiet');
});
