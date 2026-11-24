import { useState } from 'react';
import { useApi } from '../api/worldApi';
import { ApiView } from '../components/StateViews';
import { formatKey, type PeoplesData } from './types';

interface Option { id: string; score: number; contributions: Record<string, number> }
interface ComparisonSide { id: string; choice: string; options: Option[] }
interface Comparison { left: ComparisonSide; right: ComparisonSide }

export function CultureComparison({ base, data }: { base: string; data: PeoplesData }) {
  const ids = Object.keys(data.profiles);
  const [left, setLeft] = useState(ids[0] ?? 'neutral');
  const [right, setRight] = useState(ids[1] ?? 'neutral');
  const [scenario, setScenario] = useState('trade');
  const [urgency, setUrgency] = useState('0');
  const options = [['neutral', 'Neutral baseline'], ...Object.entries(data.cultures).map(([id, row]) => [id, row.displayName])];
  const query = new URLSearchParams({ left, right, scenario, urgency });
  const result = useApi<Comparison>(`${base}/compare?${query}`);

  return <section className="section">
    <div className="section-head"><h2>Compare Cultures</h2><span className="muted">Experimental</span></div>
    <div className="peoples-controls">
      <label>First culture <select value={left} onChange={(e) => setLeft(e.target.value)}>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <label>Second culture <select value={right} onChange={(e) => setRight(e.target.value)}>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <label>Situation <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
        {data.comparisonScenarios.map((id) => <option key={id} value={id}>{formatKey(id)}</option>)}
      </select></label>
      <label>Income urgency <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
        <option value="0">Routine</option><option value="0.5">Strained</option><option value="1">Desperate</option>
      </select></label>
    </div>
    <ApiView result={result}>{(comparison) => <div className="culture-comparison">
      {[comparison.left, comparison.right].map((side, index) => <div className="tile" key={index}>
        <h3>{data.cultures[side.id]?.displayName ?? 'Neutral baseline'}</h3>
        <p><strong>{formatKey(side.choice)}</strong></p>
        <table className="grid">
          <thead><tr><th scope="col">Option</th><th scope="col">Utility</th></tr></thead>
          <tbody>{side.options.map((option) => <tr key={option.id}>
            <td>{formatKey(option.id)}
              <div className="muted small">{Object.entries(option.contributions).map(([key, value]) =>
                `${formatKey(key)} ${value.toFixed(2)}`).join(' · ')}</div>
            </td>
            <td>{option.score.toFixed(2)}</td>
          </tr>)}</tbody>
        </table>
      </div>)}
    </div>}</ApiView>
  </section>;
}
