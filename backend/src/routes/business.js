import { Router } from 'express';
import { pool } from '../config/database.js';
import { allowRoles, requireAuth } from '../auth.js';

const emptyState = {
  orders: [], stock: [], customers: [], next: 1, menu: {}, staff: [], finishedStock: {},
  productionRuns: [], stockMoves: [], suppliers: [], purchases: [], expenses: [], reminders: [],
  settings: { businessName: 'Hamro Lunch Box', address: '', phone: '', pan: '', vatNumber: '', vatEnabled: false, vatRate: 13, qrLabel: 'Scan to pay' },
};
const router = Router();

const withDefaults = payload => ({
  ...emptyState,
  ...(payload && typeof payload === 'object' ? payload : {}),
  settings: { ...emptyState.settings, ...(payload?.settings || {}) },
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT payload,revision FROM business_state WHERE id=1');
    const payload = withDefaults(rows[0]?.payload);
    if (req.user.role === 'delivery') {
      const orders = payload.orders.filter(o => o.driver === req.user.name);
      const customerIds = new Set(orders.map(o => o.c));
      return res.json({ data: { ...emptyState, orders, customers: payload.customers.filter(c => customerIds.has(c.id)), menu: payload.menu, settings: payload.settings }, revision: Number(rows[0]?.revision || 0) });
    }
    res.json({ data: payload, revision: Number(rows[0]?.revision || 0) });
  } catch (error) { next(error); }
});

const isUsablePayload = data => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (!['orders', 'stock', 'customers', 'staff', 'purchases', 'expenses', 'reminders', 'suppliers', 'productionRuns', 'stockMoves'].every(key => Array.isArray(data[key] ?? []))) return false;
  if (!data.menu || typeof data.menu !== 'object' || Array.isArray(data.menu)) return false;
  if (!Object.values(data.menu).every(item => item && typeof item === 'object' && Number.isFinite(Number(item.price)) && (!item.r || (typeof item.r === 'object' && !Array.isArray(item.r))))) return false;
  if (data.settings !== undefined && (typeof data.settings !== 'object' || Array.isArray(data.settings))) return false;
  return true;
};

router.put('/', requireAuth, allowRoles('admin','reception'), async (req, res, next) => {
  try {
    const data = req.body?.data;
    if (!isUsablePayload(data)) return res.status(400).json({ error: 'Invalid business data' });
    const json = JSON.stringify(data);
    if (Buffer.byteLength(json) > 5 * 1024 * 1024) return res.status(413).json({ error: 'Business data is too large' });
    const expected = Number(req.body?.revision);
    if (!Number.isInteger(expected) || expected < 0) return res.status(400).json({ error: 'Missing data revision' });
    const result = await pool.query(
      'UPDATE business_state SET payload=$1::jsonb,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=$2', [json, expected],
    );
    if (!result.rowCount) return res.status(409).json({ error: 'Business data changed in another session. Reload before saving.' });
    const { rows } = await pool.query('SELECT revision FROM business_state WHERE id=1');
    res.json({ ok: true, revision: Number(rows[0].revision) });
  } catch (error) { next(error); }
});

router.patch('/orders/:id', requireAuth, allowRoles('delivery'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT payload FROM business_state WHERE id=1');
    const data = rows[0]?.payload || emptyState;
    const index = data.orders.findIndex(o => String(o.id) === String(req.params.id) && o.driver === req.user.name);
    if (index < 0) return res.status(404).json({ error: 'Assigned order not found' });
    const patch = req.body || {};
    if (patch.status && !['Out for Delivery','Delivered'].includes(patch.status)) return res.status(400).json({ error: 'Invalid delivery status' });
    if (patch.payments && (!Array.isArray(patch.payments) || patch.payments.length > 1 || patch.payments.some(p => !Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0 || !p.method))) return res.status(400).json({ error: 'Invalid payment update' });
    if (!patch.status && !patch.payments) return res.status(400).json({ error: 'No supported order change provided' });
    data.orders[index] = { ...data.orders[index], ...(patch.status ? { status: patch.status } : {}), ...(patch.payments ? { payments: [...(data.orders[index].payments || []), ...patch.payments] } : {}) };
    await pool.query('UPDATE business_state SET payload=$1::jsonb,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1', [JSON.stringify(data)]);
    res.json({ order: data.orders[index] });
  } catch (error) { next(error); }
});

export default router;
