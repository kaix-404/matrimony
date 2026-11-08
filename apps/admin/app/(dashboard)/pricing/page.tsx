import {
  quotePayment,
  type AdminPricingView,
  type NetWorthCategoryOption,
  type PricingQuote,
} from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { PublishForm } from './pricing-form';

/**
 * What each net-worth band costs (section 29).
 *
 * Pricing is append-only and effective immediately, so the page leads with the
 * version in force and keeps every earlier version below it: an administrator
 * raising a price is changing a number that members are being charged right now,
 * and the previous number is the only context that makes the change reviewable.
 *
 * A band with no active version cannot be bought at all - checkout fails closed -
 * so those bands are listed too, rather than appearing only once someone
 * remembers to price them.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Pricing - Networth Matrimony Admin' };

/** GST is stored as a fraction, and the quote helper takes a percentage. */
function quote(version: AdminPricingView): PricingQuote | null {
  try {
    return quotePayment(version.baseAmount, Number(version.gstRate) * 100);
  } catch {
    return null;
  }
}

function money(value: string): string {
  return `Rs ${value}`;
}

export default async function PricingPage() {
  let versions: AdminPricingView[] | null = null;
  let error: string | null = null;
  try {
    versions = await adminFetch<AdminPricingView[]>('/admin/pricing');
  } catch (caught) {
    error = describeError(caught);
  }

  // The band catalogue is public; a price can only be published for a band that
  // is on sale, so the form must offer exactly those.
  let categories: NetWorthCategoryOption[] | null = null;
  try {
    categories = await adminFetch<NetWorthCategoryOption[]>('/master-data/net-worth-categories');
  } catch {
    categories = null;
  }

  const purchasable = (categories ?? []).filter((option) => option.is_discoverable);
  const active = (versions ?? []).filter((version) => version.effectiveTo === null);
  const activeByCategory = new Map(active.map((version) => [version.category, version]));
  const label = (key: string): string =>
    categories?.find((option) => option.key === key)?.label ?? key;

  const inForceText: Record<string, string | undefined> = {};
  for (const option of purchasable) {
    const version = activeByCategory.get(option.key);
    if (version === undefined) {
      inForceText[option.key] = undefined;
      continue;
    }
    const quoted = quote(version);
    inForceText[option.key] =
      quoted === null
        ? `${money(version.baseAmount)} (v${version.version}, since ${formatDateTime(version.effectiveFrom)})`
        : `${money(quoted.totalAmount)} incl. GST, v${version.version}, since ${formatDateTime(version.effectiveFrom)}`;
  }

  return (
    <>
      <h1>Pricing</h1>
      <p className="lede">
        One price in force per band. Publishing replaces it immediately for the next checkout and
        keeps the previous version as history.
      </p>

      {error !== null ? <div className="error">{error}</div> : null}

      {versions !== null ? (
        <>
          <div className="card">
            <h2>In force</h2>
            <p className="notice">
              A band with no version in force cannot be bought: checkout refuses it rather than
              guessing a price.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Band</th>
                  <th>Base (excl. GST)</th>
                  <th>GST</th>
                  <th>Member pays</th>
                  <th>Version</th>
                  <th>Since</th>
                </tr>
              </thead>
              <tbody>
                {purchasable.map((option) => {
                  const version = activeByCategory.get(option.key);
                  if (version === undefined) {
                    return (
                      <tr key={option.key}>
                        <td>{option.label}</td>
                        <td colSpan={5}>
                          <span style={{ color: 'var(--muted)' }}>
                            No price published - not on sale
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  const quoted = quote(version);
                  return (
                    <tr key={option.key}>
                      <td>
                        <div>{option.label}</div>
                        <div className="mono" style={{ color: 'var(--muted)' }}>
                          {option.key}
                        </div>
                      </td>
                      <td className="mono">{money(version.baseAmount)}</td>
                      <td className="mono">
                        {(Number(version.gstRate) * 100).toFixed(0)}%
                      </td>
                      <td className="mono">{quoted === null ? '-' : money(quoted.totalAmount)}</td>
                      <td className="mono">{version.version}</td>
                      <td>{formatDateTime(version.effectiveFrom)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Publish a new version</h2>
            {categories === null ? (
              <p className="notice">
                The band catalogue could not be loaded, so a price cannot be published from here.
              </p>
            ) : purchasable.length === 0 ? (
              <p className="notice">No band is on sale, so there is nothing to price.</p>
            ) : (
              <PublishForm options={purchasable} inForce={inForceText} />
            )}
          </div>

          <div className="card">
            <h2>History</h2>
            {versions.length === 0 ? (
              <p className="notice">No price has ever been published.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Band</th>
                    <th>Version</th>
                    <th>Base</th>
                    <th>GST</th>
                    <th>From</th>
                    <th>Until</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version) => (
                    <tr key={version.id}>
                      <td>{label(version.category)}</td>
                      <td className="mono">{version.version}</td>
                      <td className="mono">{money(version.baseAmount)}</td>
                      <td className="mono">{(Number(version.gstRate) * 100).toFixed(0)}%</td>
                      <td>{formatDateTime(version.effectiveFrom)}</td>
                      <td>
                        {version.effectiveTo === null ? (
                          <span className="badge badge-ok">In force</span>
                        ) : (
                          formatDateTime(version.effectiveTo)
                        )}
                      </td>
                      <td>{version.note ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
