from pathlib import Path
s=(Path(__file__).resolve().parents[1]/'worker'/'bakery-accountability.ts').read_text()
assert 'AND company_id=? AND quantity-reserved_quantity>=?' in s
assert '.bind(quantity,locationId,product.itemId,COMPANY,quantity)' in s
print('PASS Bakery agent dispatch protects same-company and reserved stock')
