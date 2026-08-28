import { Wallet, WalletStatus } from "./wallet.entity";

describe("Wallet money rounding", () => {
  const wallet = () => {
    const w = new Wallet();
    w.balance = 0;
    w.status = WalletStatus.ACTIVE;
    return w;
  };

  it("keeps two-decimal precision across repeated cent deposits", () => {
    const w = wallet();
    w.addBalance(0.1);
    w.addBalance(0.2);
    expect(w.balance).toBe(0.3);
  });

  it("rounds half-cent deposits using banker's-style JS round then two places", () => {
    const w = wallet();
    w.balance = 10;
    w.addBalance(0.555);
    expect(w.balance).toBe(10.56);
  });

  it("does not drift after many 0.01 withdrawals", () => {
    const w = wallet();
    w.balance = 1;
    for (let i = 0; i < 100; i += 1) {
      w.subtractBalance(0.01);
    }
    expect(w.balance).toBe(0);
  });
});
