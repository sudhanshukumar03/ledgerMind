import { RazorpayClient } from './razorpay.client.js';

describe('explicit gateway execution mode', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });
  it('does not simulate when credentials are missing', async () => {
    delete process.env.PAYMENT_EXECUTION_MODE;
    await expect(new RazorpayClient().createRefund('pay_any', 100)).rejects.toThrow('disabled');
  });
  it('keeps distinct simulated operations unique and a replay stable', async () => {
    process.env.PAYMENT_EXECUTION_MODE = 'simulation';
    const client = new RazorpayClient();
    const [one, two, replay] = await Promise.all([
      client.createRefund('pay_a', 100, 'action-a'),
      client.createRefund('pay_b', 100, 'action-b'),
      client.createRefund('pay_a', 100, 'action-a'),
    ]);
    expect(one.id).not.toBe(two.id);
    expect(replay.id).toBe(one.id);
    expect(one).toMatchObject({ simulated: true, execution_mode: 'simulation' });
    const link = await client.createPaymentLink('order_a', 100);
    expect(link.short_url).toContain(link.id);
  });
  it('rejects missing or live credentials in provider test mode', () => {
    process.env.PAYMENT_EXECUTION_MODE = 'provider_test';
    process.env.RAZORPAY_KEY_ID = 'rzp_live_example';
    process.env.RAZORPAY_KEY_SECRET = 'unused';
    expect(() => new RazorpayClient()).toThrow('test credentials');
  });
});
