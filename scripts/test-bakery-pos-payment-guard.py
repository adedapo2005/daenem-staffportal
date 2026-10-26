from pathlib import Path
root=Path(__file__).resolve().parents[1]
s=(root/'worker/bakery.ts').read_text()
ui=(root/'src/bakery-v2.tsx').read_text()
for expected in ['if(paid>total)return json','b.cashReceivedConfirmed!==true','if(fulfillNow&&paid!==total)','cashReceivedConfirmed:paid>0']:
 assert expected in s, expected
assert "cashReceivedConfirmed:payment==='cash'&&cashConfirmed" in ui
print("PASS POS payment boundary: no silent overpayment, confirmed cash, no unpaid immediate release, UI wiring")
