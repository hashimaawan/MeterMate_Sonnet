/**
 * MeterMate seed script — idempotent.
 * Run standalone: npm run seed (from server/)
 * Also called at boot when DEMO_MODE=true.
 *
 * Creates on the Maxio test site:
 *   - Product Family: metermate-consulting
 *   - Products: basic ($99/mo), pro ($299/mo)
 *   - Metered Components: metermate-consulting-minutes ($2.00/min), metermate-api-calls ($0.01/call)
 *
 * Handles are prefixed with "metermate-" to avoid collisions on shared Maxio test sites
 * where generic names like "consulting-minutes" may belong to another product family.
 *
 * Note on metermate-api-calls: Maxio Event-Based Billing (EBB) requires a billing metric
 * pre-created via the Maxio UI and site-level EBB enablement. This seed creates
 * metermate-api-calls as a standard metered (per-unit) component, which achieves the same
 * per-unit billing with zero UI pre-setup. Usage recording via createUsage is
 * identical for both component types.
 */

import {
  productFamiliesController,
  productsController,
  componentsController,
} from './maxioClient';
import { config } from './config';
import { IntervalUnit, PricingScheme } from '@maxio-com/advanced-billing-sdk';

export interface SeededProduct {
  id: number;
  handle: string;
  name: string;
  priceInCents: number;
  interval: number;
  intervalUnit: string;
}

export interface SeededComponent {
  id: number;
  handle: string;
  name: string;
  unitName: string;
  unitPrice: string;
  kind: string;
}

export interface SeedResult {
  productFamilyId: number;
  products: SeededProduct[];
  components: SeededComponent[];
}

async function ensureProductFamily(): Promise<number> {
  const familyHandle = config.maxio.defaultProductFamily;

  const { result: families } = await productFamiliesController.listProductFamilies({});
  const existing = families.find((f) => f.productFamily?.handle === familyHandle);

  if (existing?.productFamily?.id != null) {
    const id = Number(existing.productFamily.id);
    console.log(`  [ok] Product family "${familyHandle}" (id=${id})`);
    return id;
  }

  const { result } = await productFamiliesController.createProductFamily({
    productFamily: {
      name: 'MeterMate Consulting',
      handle: familyHandle,
      description: 'MeterMate billing plans and metered components for consulting services.',
    },
  });
  const id = result.productFamily?.id;
  if (id == null) throw new Error('Product family creation returned no id');
  const numId = Number(id);
  console.log(`  [created] Product family "${familyHandle}" (id=${numId})`);
  return numId;
}

async function ensureProduct(
  familyId: number,
  handle: string,
  name: string,
  priceInCents: number
): Promise<SeededProduct> {
  try {
    const { result } = await productsController.readProductByHandle(handle);
    const p = result.product;
    if (p?.id != null) {
      console.log(`  [ok] Product "${handle}" (id=${p.id}, price=${p.priceInCents}¢)`);
      return {
        id: Number(p.id),
        handle: p.handle ?? handle,
        name: p.name ?? name,
        priceInCents: p.priceInCents != null ? Number(p.priceInCents) : priceInCents,
        interval: p.interval ?? 1,
        intervalUnit: (p.intervalUnit as string | undefined) ?? 'month',
      };
    }
  } catch {
    // Not found — fall through to create
  }

  const { result } = await productsController.createProduct(String(familyId), {
    product: {
      name,
      handle,
      description: `${name} — flat monthly retainer`,
      priceInCents: BigInt(priceInCents),
      interval: 1,
      intervalUnit: IntervalUnit.Month,
      requireCreditCard: false,
    },
  });
  const p = result.product;
  if (p?.id == null) throw new Error(`Product "${handle}" creation returned no id`);
  const numPrice = p.priceInCents != null ? Number(p.priceInCents) : priceInCents;
  console.log(`  [created] Product "${handle}" (id=${p.id}, price=${numPrice}¢)`);
  return {
    id: Number(p.id),
    handle: p.handle ?? handle,
    name: p.name ?? name,
    priceInCents: numPrice,
    interval: p.interval ?? 1,
    intervalUnit: (p.intervalUnit as string | undefined) ?? 'month',
  };
}

async function ensureMeteredComponent(
  familyId: number,
  handle: string,
  name: string,
  unitName: string,
  unitPriceDollars: string
): Promise<SeededComponent> {
  try {
    const { result } = await componentsController.findComponent(handle);
    const c = result.component;
    if (c?.id != null) {
      console.log(`  [ok] Component "${handle}" (id=${c.id})`);
      return {
        id: Number(c.id),
        handle: c.handle ?? handle,
        name: c.name ?? name,
        unitName: c.unitName ?? unitName,
        unitPrice: unitPriceDollars,
        kind: c.kind ?? 'metered_component',
      };
    }
  } catch {
    // Not found — fall through to create
  }

  const { result } = await componentsController.createMeteredComponent(String(familyId), {
    meteredComponent: {
      name,
      handle,
      unitName,
      pricingScheme: PricingScheme.PerUnit,
      unitPrice: unitPriceDollars,
      taxable: false,
    },
  });
  const c = result.component;
  if (c?.id == null) throw new Error(`Component "${handle}" creation returned no id`);
  console.log(`  [created] Component "${handle}" (id=${c.id}, unitPrice=$${unitPriceDollars})`);
  return {
    id: Number(c.id),
    handle: c.handle ?? handle,
    name: c.name ?? name,
    unitName: c.unitName ?? unitName,
    unitPrice: unitPriceDollars,
    kind: c.kind ?? 'metered_component',
  };
}

export async function runSeed(): Promise<SeedResult> {
  console.log('\n[seed] Starting MeterMate seed on site:', config.maxio.siteSubdomain);

  console.log('\n[seed] Product Family...');
  const familyId = await ensureProductFamily();

  console.log('\n[seed] Products...');
  const [basic, pro] = await Promise.all([
    ensureProduct(familyId, 'basic', 'Basic Plan', 9900),
    ensureProduct(familyId, 'pro', 'Pro Plan', 29900),
  ]);

  console.log('\n[seed] Components...');
  const [consultingMinutes, apiCalls] = await Promise.all([
    ensureMeteredComponent(familyId, 'metermate-consulting-minutes', 'MeterMate Consulting Minutes', 'minute', '2.00'),
    ensureMeteredComponent(familyId, 'metermate-api-calls', 'MeterMate API Calls', 'call', '0.01'),
  ]);

  console.log('\n[seed] Consultants (from env):');
  for (const c of config.consultants) {
    console.log(`  - ${c.name} <${c.email || '(no email set)'}> [id=${c.id}]`);
  }

  const result: SeedResult = {
    productFamilyId: familyId,
    products: [basic, pro],
    components: [consultingMinutes, apiCalls],
  };

  console.log('\n[seed] Done:');
  console.log(`  Family: ${config.maxio.defaultProductFamily} (id=${familyId})`);
  console.log(`  Products: ${result.products.map((p) => `${p.handle}=$${(p.priceInCents / 100).toFixed(2)}/mo`).join(', ')}`);
  console.log(`  Components: ${result.components.map((c) => `${c.handle}=$${c.unitPrice}/${c.unitName}`).join(', ')}`);

  return result;
}

// Run as standalone script
if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err: Error) => {
      console.error('[seed] FAILED:', err.message);
      process.exit(1);
    });
}
