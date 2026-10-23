import { ReconciliationService } from './reconciliation.service.js';
const ago = (hours: number) => new Date(Date.now() - hours * 3600000);
const service: any = new ReconciliationService({} as any);
const payment = (over = {}) => ({
  id: 'p1',
  merchantId: 'm1',
  orderId: 'o1',
  amount: 10000n,
  currency: 'INR',
  status: 'CAPTURED',
  capturedAt: ago(200),
  createdAt: ago(201),
  ...over,
});
const order = (over = {}) => ({
  id: 'o1',
  merchantId: 'm1',
  amount: 10000n,
  currency: 'INR',
  status: 'PAID',
  createdAt: ago(201),
  ...over,
});
const settlement = (over = {}) => ({
  id: 's1',
  merchantId: 'm1',
  amount: 10000n,
  currency: 'INR',
  status: 'PROCESSED',
  utr: 'UTR1',
  settlementDate: ago(100),
  createdAt: ago(100),
  ...over,
});
const bank = (over = {}) => ({
  id: 'b1',
  merchantId: 'm1',
  amount: 10000n,
  currency: 'INR',
  status: 'POSTED',
  transactionType: 'CREDIT',
  utr: 'UTR1',
  transactionDate: ago(100),
  ...over,
});

describe('Reconciliation financial evidence rules', () => {
  it('accepts split captures whose sum pays the order', () => {
    const e: any[] = [],
      m: any[] = [];
    service.checkOrderPayment(
      [order()],
      [payment({ amount: 4000n }), payment({ id: 'p2', amount: 6000n })],
      e,
      m,
      'm1',
    );
    expect(e).toEqual([]);
    expect(m).toHaveLength(2);
  });
  it('reports positive underpayment rather than duplicate/negative exposure', () => {
    const e: any[] = [];
    service.checkOrderPayment(
      [order()],
      [payment({ amount: 1000n }), payment({ id: 'p2', amount: 2000n })],
      e,
      [],
      'm1',
    );
    expect(e[0]).toMatchObject({
      type: 'ORDER_PAYMENT_MISMATCH',
      financialImpact: 7000n,
    });
  });
  it('retains capture evidence for refunded payments', () => {
    const e: any[] = [];
    service.checkOrderPayment(
      [order()],
      [payment({ status: 'REFUNDED' })],
      e,
      [],
      'm1',
    );
    expect(e).toEqual([]);
  });
  it('flags due unpaid CREATED orders, but waits for fresh orders', () => {
    const e: any[] = [];
    service.checkOrderPayment(
      [
        order({ status: 'CREATED' }),
        order({ id: 'fresh', status: 'CREATED', createdAt: new Date() }),
      ],
      [],
      e,
      [],
      'm1',
    );
    expect(e).toHaveLength(1);
    expect(e[0].type).toBe('PAYMENT_MISSING');
  });
  it('does not flag returned duplicate exposure after a processed refund', () => {
    const e: any[] = [];
    service.checkOrderPayment(
      [order()],
      [payment(), payment({ id: 'p2' })],
      e,
      [],
      'm1',
      [{ paymentId: 'p2', status: 'PROCESSED', amount: 10000n }],
    );
    expect(e).toEqual([]);
  });
  it('keeps duplicate exposure for pending or unrelated refunds', () => {
    const e: any[] = [];
    service.checkOrderPayment(
      [order()],
      [payment(), payment({ id: 'p2' })],
      e,
      [],
      'm1',
      [
        { paymentId: 'p2', status: 'PROCESSING', amount: 10000n },
        { paymentId: 'other', status: 'PROCESSED', amount: 10000n },
      ],
    );
    expect(e[0].financialImpact).toBe(10000n);
  });
  it('does not infer settlement membership from equal amounts', () => {
    const e: any[] = [],
      m: any[] = [];
    service.checkPaymentSettlement([payment()], [settlement()], e, m, 'm1');
    expect(m).toEqual([]);
    expect(e.some((x) => x.type === 'SETTLEMENT_MISSING')).toBe(true);
  });
  it('supports batched captures with fees and tax in the net', () => {
    const e: any[] = [],
      m: any[] = [];
    const members = ['p1', 'p2'].map((paymentId) => ({
      paymentId,
      settlementId: 's1',
      grossAmount: 10000n,
      refundAmount: 0n,
      feeAmount: 200n,
      taxAmount: 36n,
      adjustmentAmount: 0n,
    }));
    service.checkPaymentSettlement(
      [payment(), payment({ id: 'p2' })],
      [settlement({ amount: 19528n })],
      e,
      m,
      'm1',
      members,
    );
    expect(e).toEqual([]);
    expect(m).toHaveLength(2);
  });
  it.each(['CREATED', 'FAILED'])(
    'does not accept %s settlements as coverage',
    (status) => {
      const e: any[] = [],
        m: any[] = [];
      service.checkPaymentSettlement(
        [payment()],
        [settlement({ status })],
        e,
        m,
        'm1',
        [
          {
            paymentId: 'p1',
            settlementId: 's1',
            grossAmount: 10000n,
            refundAmount: 0n,
            feeAmount: 0n,
            taxAmount: 0n,
            adjustmentAmount: 0n,
          },
        ],
      );
      expect(m).toEqual([]);
      expect(e[0].type).toBe('SETTLEMENT_MISSING');
    },
  );
  it('waits for the capture clearing deadline', () => {
    const e: any[] = [];
    service.checkPaymentSettlement(
      [payment({ capturedAt: new Date() })],
      [],
      e,
      [],
      'm1',
    );
    expect(e).toEqual([]);
  });
  it.each([
    { status: 'FAILED' },
    { status: 'PENDING' },
    { transactionType: 'DEBIT' },
  ])('rejects ineligible bank evidence %o', (over) => {
    const e: any[] = [],
      m: any[] = [];
    service.checkSettlementBank([settlement()], [bank(over)], e, m, 'm1');
    expect(m).toEqual([]);
    expect(e[0].type).toBe('BANK_MISMATCH');
  });
  it('rejects conflicting UTR and stored settlement references', () => {
    const e: any[] = [],
      m: any[] = [];
    service.checkSettlementBank(
      [settlement()],
      [bank({ utr: 'OTHER' }), bank({ id: 'b2', settlementId: 'another' })],
      e,
      m,
      'm1',
    );
    expect(m).toEqual([]);
  });
  it('cannot reuse a single bank credit for two settlements', () => {
    const e: any[] = [],
      m: any[] = [];
    service.checkSettlementBank(
      [settlement(), settlement({ id: 's2', utr: null })],
      [bank()],
      e,
      m,
      'm1',
    );
    expect(m).toHaveLength(1);
  });
  it('reserves strong bank references before weak matches in either settlement order', () => {
    const weak = settlement({ id: 'weak', utr: null });
    for (const batches of [
      [weak, settlement()],
      [settlement(), weak],
    ]) {
      const matches: any[] = [];
      service.checkSettlementBank(batches, [bank()], [], matches, 'm1');
      expect(matches).toHaveLength(1);
      expect(matches[0].sourceId).toBe('s1');
      expect(matches[0].matchMethod).toBe('UTR');
    }
  });
  it('refuses a weak credit shared by two indistinguishable batches', () => {
    const matches: any[] = [];
    service.checkSettlementBank(
      [settlement({ utr: null }), settlement({ id: 's2', utr: null })],
      [bank({ utr: null })],
      [],
      matches,
      'm1',
    );
    expect(matches).toEqual([]);
  });
  it('refuses a credit with a stored link contradicted by another known UTR', () => {
    const matches: any[] = [];
    service.checkSettlementBank(
      [settlement({ id: 'other', utr: null }), settlement()],
      [bank({ settlementId: 'other' })],
      [],
      matches,
      'm1',
    );
    expect(matches).toEqual([]);
  });
  it('aggregates every eligible credit into one failed-payment discrepancy', () => {
    const exceptions: any[] = [],
      matches: any[] = [];
    service.checkBankPaymentMismatch(
      [payment({ status: 'FAILED' })],
      [
        bank({ paymentId: 'p1', amount: 4000n }),
        bank({ id: 'b2', paymentId: 'p1', amount: 6000n }),
      ],
      exceptions,
      'm1',
      matches,
    );
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].financialImpact).toBe(10000n);
    expect(
      exceptions[0].events.filter(
        (e: any) => e.entityType === 'BANK_TRANSACTION',
      ),
    ).toHaveLength(2);
    expect(matches).toHaveLength(2);
  });
  it('requires explicit payment evidence for failed-payment credits', () => {
    const e: any[] = [];
    service.checkBankPaymentMismatch(
      [payment({ status: 'FAILED' })],
      [bank({ amount: 10000n })],
      e,
      'm1',
    );
    expect(e).toEqual([]);
    service.checkBankPaymentMismatch(
      [payment({ status: 'FAILED' })],
      [bank({ paymentId: 'p1' })],
      e,
      'm1',
    );
    expect(e[0].type).toBe('BANK_PAYMENT_MISMATCH');
  });
  it('checks processed refunds against posted linked bank debits', () => {
    const e: any[] = [],
      m: any[] = [];
    service.checkRefundBank(
      [
        {
          id: 'r1',
          merchantId: 'm1',
          paymentId: 'p1',
          amount: 10000n,
          status: 'PROCESSED',
          createdAt: ago(200),
          processedAt: ago(100),
        },
      ],
      [bank({ transactionType: 'DEBIT', refundId: 'r1', amount: 9000n })],
      e,
      m,
      'm1',
    );
    expect(e[0]).toMatchObject({
      type: 'REFUND_MISMATCH',
      financialImpact: 1000n,
    });
    expect(m).toHaveLength(1);
  });
});
