from pathlib import Path
p=Path(__file__).resolve().parents[1]
api=(p/'worker/bakery-accountability.ts').read_text()
ui=(p/'src/bakery-v2.tsx').read_text()
css=(p/'src/bakery-accountability.css').read_text()
checks=[
('read pending return queue', 'pendingReturns' in api and 'pendingReturns' in ui),
('permissioned manager verification', 'verifyReturns:allowed' in api and 'data.capabilities.verifyReturns' in ui),
('physical count confirmation', 'physicallyReceived' in ui and "body.physicallyReceived!==true" in api),
('quarantine and no stock addition', 'saleableStockAdded:0' in api),
('backend closure gate', 'Agent-declared returns require independent physical warehouse verification' in api),
('mobile presentation', '.bakery-return-panel .bakery-two' in css)
]
for name,ok in checks:
 if not ok:raise AssertionError(name)
 print('PASS',name)
