import { getDb } from "./db";
import "server-only";

/**
 * Money is stored in pence as integers throughout. Floating point and currency
 * do not mix — 0.1 + 0.2 famously isn't 0.3, and that lands in her tax return.
 */

export type Payment = {
  id: number;
  clientId: number;
  clientName: string;
  appointmentId: number | null;
  amountPence: number;
  method: string;
  paidAt: string;
  note: string;
};

type PaymentRow = {
  id: number;
  client_id: number;
  client_name: string;
  appointment_id: number | null;
  amount_pence: number;
  method: string;
  paid_at: string;
  note: string | null;
};

const SELECT = `
  SELECT p.id, p.client_id, p.appointment_id, p.amount_pence, p.method,
         p.paid_at, p.note, (c.first_name || ' ' || c.last_name) AS client_name
  FROM payments p
  JOIN clients c ON c.id = p.client_id
`;

function hydrate(row: PaymentRow): Payment {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    appointmentId: row.appointment_id,
    amountPence: row.amount_pence,
    method: row.method,
    paidAt: row.paid_at,
    note: row.note ?? "",
  };
}

export function listPayments(from?: string, to?: string): Payment[] {
  const rows = getDb()
    .prepare(
      `${SELECT}
       WHERE (? IS NULL OR p.paid_at >= ?) AND (? IS NULL OR p.paid_at < ?)
       ORDER BY p.paid_at DESC, p.id DESC`,
    )
    .all(from ?? null, from ?? null, to ?? null, to ?? null) as PaymentRow[];
  return rows.map(hydrate);
}

export function createPayment(input: {
  clientId: number;
  appointmentId?: number | null;
  amountPence: number;
  method: string;
  paidAt: string;
  note?: string;
}): number {
  const result = getDb()
    .prepare(
      `INSERT INTO payments (client_id, appointment_id, amount_pence, method, paid_at, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.clientId,
      input.appointmentId ?? null,
      input.amountPence,
      input.method,
      input.paidAt,
      input.note || null,
    );
  return Number(result.lastInsertRowid);
}

export function deletePayment(id: number) {
  getDb().prepare("DELETE FROM payments WHERE id = ?").run(id);
}

/** Appointments that have happened but haven't been paid for in full. */
export type Outstanding = {
  appointmentId: number;
  clientId: number;
  clientName: string;
  treatment: string;
  startsAt: string;
  pricePence: number;
  paidPence: number;
  owedPence: number;
};

export function listOutstanding(): Outstanding[] {
  return getDb()
    .prepare(
      `SELECT a.id AS appointmentId, a.client_id AS clientId,
              (c.first_name || ' ' || c.last_name) AS clientName,
              a.treatment, a.starts_at AS startsAt, a.price_pence AS pricePence,
              COALESCE(SUM(p.amount_pence), 0) AS paidPence,
              a.price_pence - COALESCE(SUM(p.amount_pence), 0) AS owedPence
       FROM appointments a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN payments p ON p.appointment_id = a.id
       WHERE a.status = 'attended' AND a.price_pence > 0
       GROUP BY a.id
       HAVING owedPence > 0
       ORDER BY a.starts_at`,
    )
    .all() as Outstanding[];
}

/** Totals by month for a UK tax year, plus the year's total. */
export function incomeByMonth(year: number) {
  const rows = getDb()
    .prepare(
      `SELECT strftime('%Y-%m', paid_at) AS month,
              SUM(amount_pence) AS totalPence,
              COUNT(*) AS count
       FROM payments
       WHERE paid_at >= ? AND paid_at < ?
       GROUP BY month ORDER BY month`,
    )
    .all(`${year}-01-01`, `${year + 1}-01-01`) as Array<{
    month: string;
    totalPence: number;
    count: number;
  }>;

  return {
    months: rows,
    totalPence: rows.reduce((sum, row) => sum + row.totalPence, 0),
    count: rows.reduce((sum, row) => sum + row.count, 0),
  };
}

export function formatMoney(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

/** Parses "45", "£45", "45.50" into pence, rejecting anything else. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
