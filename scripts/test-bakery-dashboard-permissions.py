from pathlib import Path
root=Path(__file__).resolve().parents[1]
a=(root/'worker/bakery.ts').read_text()
b=(root/'src/bakery-v2.tsx').read_text()
assert 'includeCommercial=salesCan(context)' in a
assert 'includeCommercial?env.DB.prepare' in a
assert 'orders:includeCommercial?Number(orders?.orderCount||0):null' in a
assert 'revenueKobo:includeCommercial?Number(orders?.revenueKobo||0):null' in a
assert 'bestSellers:includeCommercial?(best.results||[]):[]' in a
assert "can(context,'bakery.access')?api<Dashboard>" in b
assert 'metrics:{orders:number|null;revenueKobo:number|null;paidKobo:number|null;' in b
print('PASS bakery dashboard role-scoped API and production access')
