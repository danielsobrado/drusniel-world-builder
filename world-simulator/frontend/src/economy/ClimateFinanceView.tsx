import type { ClimateState, FoodBalance, HouseholdFinances } from '../api/types';
import { fmt, pct } from '../components/format';

export function ClimateFinanceView({ climate, finances, food }: {
  climate: ClimateState; finances: HouseholdFinances; food: FoodBalance;
}) {
  const savings = finances.tiers.reduce((sum, tier) => sum + tier.savings, 0);
  const arrears = finances.tiers.reduce((sum, tier) => sum + tier.arrears, 0);
  return (
    <>
      <h4>Seasonal agriculture</h4>
      <div className="tiles">
        <div className="tile"><div className="tile-label">Simulated season</div>
          <div className="tile-value">{climate.season}</div><div className="tile-note">{climate.profile} climate profile</div></div>
        <div className="tile"><div className="tile-label">Growing conditions</div>
          <div className="tile-value">{pct(food.yieldFactor)}</div>
          <div className="tile-note">of neutral monthly harvest; rain {pct(climate.rainfall)}</div></div>
        <div className={`tile ${climate.hazard ? 'tile-bad' : 'tile-good'}`}>
          <div className="tile-label">Weather event</div><div className="tile-value">{climate.hazard ?? 'None'}</div>
          <div className="tile-note">deterministic scenario weather</div></div>
        <div className="tile"><div className="tile-label">Granary loss</div>
          <div className="tile-value">{fmt(Math.round(food.spoiled))}</div>
          <div className="tile-note">rations spoiled last month</div></div>
      </div>
      <h4>Household finances</h4>
      {!finances.tiers.length ? <p className="muted">Household budget tracking was not enabled for this scenario.</p> : <>
        <div className="tiles">
          <div className={`tile ${finances.foodAccess < 0.95 ? 'tile-bad' : 'tile-good'}`}>
            <div className="tile-label">Food affordability</div><div className="tile-value">{pct(finances.foodAccess)}</div>
            <div className="tile-note">of modeled household food budget</div></div>
          <div className="tile"><div className="tile-label">Households struggling</div>
            <div className="tile-value">{fmt(finances.strugglingHouseholds)}</div>
            <div className="tile-note">{finances.hardshipMonths} consecutive hardship months</div></div>
          <div className="tile"><div className="tile-label">Household savings</div>
            <div className="tile-value">{fmt(Math.round(savings))}</div><div className="tile-note">aggregate copper</div></div>
          <div className="tile"><div className="tile-label">Housing arrears</div>
            <div className="tile-value">{fmt(Math.round(arrears))}</div><div className="tile-note">aggregate copper owed</div></div>
        </div>
        <table className="grid" aria-label="Household financial tiers">
          <thead><tr><th>Households</th><th className="num">Count</th><th className="num">Food access</th>
            <th className="num">Savings</th><th className="num">Arrears</th></tr></thead>
          <tbody>{finances.tiers.map((tier) => <tr key={tier.name}>
            <td>{tier.name}</td><td className="num">{fmt(tier.households)}</td>
            <td className="num">{pct(tier.foodAccess)}</td><td className="num">{fmt(Math.round(tier.savings))}</td>
            <td className="num">{fmt(Math.round(tier.arrears))}</td>
          </tr>)}</tbody>
        </table>
      </>}
    </>
  );
}
