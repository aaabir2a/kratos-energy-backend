// One-off import: Build-Your-System catalog (inverters, batteries, EV chargers)
// from kratos-energy/src/lib/systemPricing.ts into the CRM products table.
// One row per brand+category; models joined into `capacity`, comma-separated.
// basePrice 0 — matches the existing multi-capacity rows (display catalog).
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient({
  datasources: { db: { url: 'postgresql://kratos:kratos%402026@75.119.149.137:5432/kratos-backend' } },
});

const INVERTERS = [
  ['Goodwe', ['Goodwe 5kW 1P', 'Goodwe 10kW 1P', 'Goodwe 5kW 3P', 'Goodwe 8kW 3P', 'Goodwe 10kW 3P', 'Goodwe 15kW 3P']],
  ['Sungrow', ['SH5.0RS', 'SH8.0RS', 'SH10RS', 'SH5RT', 'SH10RT', 'SH15RT']],
  ['Sigenergy', ['SigenStor EC 5.0 SP', 'SigenStor EC 8.0 SP', 'SigenStor EC 10.0 SP', 'SigenStor EC 10.0 TP', 'SigenStor EC 15.0 TP']],
  ['FoxESS', ['Fox 5kW 1P', 'Fox 8kW 1P', 'Fox 10kW 1P', 'Fox 10kW 3P', 'Fox 15kW 3P']],
  ['Sofar', ['ESI 5K', 'ESI 6K', 'HYD 5', 'HYD 10', 'HYD 15', 'HYD 20']],
];

const BATTERIES = [
  ['Goodwe', ['16kWh All-in-One', '24kWh All-in-One', '32kWh All-in-One', '40kWh All-in-One', '48kWh All-in-One']],
  ['Sungrow', ['10kWh Battery', '15kWh Battery', '20kWh Battery', '25kWh Battery (3-phase)']],
  ['Sigenergy', ['16kWh Battery', '24kWh Battery', '32kWh Battery', '40kWh Battery', '48kWh Battery']],
  ['FoxESS', ['18kWh EQ', '23kWh EQ', '27kWh EQ', '32kWh EQ', '37kWh EQ', '42kWh EQ']],
  ['Sofar', ['10kWh Battery', '15kWh Battery', '20kWh Battery', '30kWh Battery', '40kWh Battery', '50kWh Battery']],
];

// "No charger" is a UI choice, not a product — excluded.
const EV_CHARGERS = [['AC Charger', ['7kW AC charger', '22kW AC charger']]];

const rows = [
  ...INVERTERS.map(([brandName, models]) => ({ category: 'Inverter', brandName, capacity: models.join(', ') })),
  ...BATTERIES.map(([brandName, models]) => ({ category: 'Battery', brandName, capacity: models.join(', ') })),
  ...EV_CHARGERS.map(([brandName, models]) => ({ category: 'EV Charger', brandName, capacity: models.join(', ') })),
];

let created = 0;
let skipped = 0;
for (const r of rows) {
  const existing = await p.product.findFirst({
    where: { category: r.category, brandName: r.brandName, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    console.log(`skip (exists): ${r.category} | ${r.brandName}`);
    skipped++;
    continue;
  }
  await p.product.create({
    data: {
      category: r.category,
      brandName: r.brandName,
      capacity: r.capacity,
      stock: 0,
      basePrice: 0,
      stateRebate: 0,
      federalRebate: 0,
      isActive: true,
    },
  });
  console.log(`created: ${r.category} | ${r.brandName} | ${r.capacity}`);
  created++;
}

console.log(`\nDone — created ${created}, skipped ${skipped}`);
const total = await p.product.count({ where: { deletedAt: null } });
console.log('total active products now:', total);
await p.$disconnect();
