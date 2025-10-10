import { useState, useEffect, useRef, useMemo } from 'react';

/**
 * Multi-Pool Digital Fencing Sheet with React state persistence
 * - Multiple independent pools with tabs
 * - Add/remove/rename pools
 * - Each pool has its own fencers and bout results
 * - All data stored in React state (no localStorage)
 */

// -------- Helpers --------
function makeEmptyPairData() {
  return [
    { a: "", b: "", ha: 0, hb: 0 },
    { a: "", b: "", ha: 0, hb: 0 },
    { a: "", b: "", ha: 0, hb: 0 },
    { a: "", b: "", ha: 0, hb: 0 },
  ];
}

function safeInt(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function effectiveScore(base, handicap) {
  return safeInt(base) + safeInt(handicap);
}

function calcPairStats(bouts) {
  let vA = 0, vB = 0, hsA = 0, hsB = 0;
  bouts.forEach((bt) => {
    const sa = effectiveScore(bt.a, bt.ha);
    const sb = effectiveScore(bt.b, bt.hb);
    if (sa === 0 && sb === 0 && bt.a === "" && bt.b === "") return;
    hsA += sa;
    hsB += sb;
    if (sa > sb) vA += 1;
    else if (sb > sa) vB += 1;
  });
  return { vA, vB, hsA, hsB };
}

function downloadCSV(rows, filename) {
  const esc = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function createEmptyPool(name, id) {
  return {
    id,
    name,
    date: new Date().toISOString().slice(0, 10),
    size: 6,
    boutsPer: 2,
    names: Array.from({ length: 10 }, (_, i) => `F${i + 1}`),
    pairs: Array.from({ length: 10 }, (_, i) =>
      Array.from({ length: 10 }, (_, j) => (i < j ? makeEmptyPairData() : null))
    ),
  };
}

// -------- Main Component --------
export default function App() {
  const [pools, setPools] = useState([createEmptyPool("Pool 1", 1)]);
  const [activePoolId, setActivePoolId] = useState(1);
  const [nextPoolId, setNextPoolId] = useState(2);
  const [editing, setEditing] = useState(null);

  const activePool = pools.find(p => p.id === activePoolId) || pools[0];

  // -------- Pool Management --------
  const addPool = () => {
    const newPool = createEmptyPool(`Pool ${nextPoolId}`, nextPoolId);
    setPools([...pools, newPool]);
    setActivePoolId(nextPoolId);
    setNextPoolId(nextPoolId + 1);
  };

  const removePool = (id) => {
    if (pools.length === 1) return; // Keep at least one pool
    const newPools = pools.filter(p => p.id !== id);
    setPools(newPools);
    if (activePoolId === id) {
      setActivePoolId(newPools[0].id);
    }
  };

  const renamePool = (id, newName) => {
    setPools(pools.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  const updatePool = (updates) => {
    setPools(pools.map(p => p.id === activePoolId ? { ...p, ...updates } : p));
  };

  const clearPoolData = () => {
    updatePool({
      date: new Date().toISOString().slice(0, 10),
      size: 6,
      boutsPer: 2,
      names: Array.from({ length: 10 }, (_, i) => `F${i + 1}`),
      pairs: Array.from({ length: 10 }, (_, i) =>
        Array.from({ length: 10 }, (_, j) => (i < j ? makeEmptyPairData() : null))
      ),
    });
  };

  // -------- Current Pool Data --------
  const N = Math.min(10, Math.max(2, activePool.size));
  const B = Math.min(4, Math.max(1, activePool.boutsPer));
  const visibleNames = activePool.names.slice(0, N);

  // -------- Stats Computation --------
  const standings = useMemo(() => {
    const res = Array.from({ length: N }, (_, idx) => ({
      idx,
      name: visibleNames[idx],
      V: 0,
      HS: 0,
      HR: 0,
      IND: 0,
    }));

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const stats = calcPairStats(activePool.pairs[i][j].slice(0, B));
        res[i].V += stats.vA;
        res[j].V += stats.vB;
        res[i].HS += stats.hsA;
        res[i].HR += stats.hsB;
        res[j].HS += stats.hsB;
        res[j].HR += stats.hsA;
      }
    }

    res.forEach((r) => (r.IND = r.HS - r.HR));

    const sorted = [...res].sort((a, b) => {
      if (b.V !== a.V) return b.V - a.V;
      if (b.IND !== a.IND) return b.IND - a.IND;
      if (b.HS !== a.HS) return b.HS - a.HS;
      return a.idx - b.idx;
    });

    const places = new Map();
    let place = 1;
    sorted.forEach((r, k) => {
      if (k === 0) {
        places.set(r.idx, place);
      } else {
        const prev = sorted[k - 1];
        const equal = r.V === prev.V && r.IND === prev.IND && r.HS === prev.HS;
        if (!equal) place = k + 1;
        places.set(r.idx, place);
      }
    });

    return res.map((r) => ({ ...r, Place: places.get(r.idx) }));
  }, [activePool.pairs, N, B, visibleNames]);

  const sortedStandings = useMemo(() => {
    return [...standings].sort((a, b) => {
      if (b.V !== a.V) return b.V - a.V;
      if (b.IND !== a.IND) return b.IND - a.IND;
      if (b.HS !== a.HS) return b.HS - a.HS;
      return a.idx - b.idx;
    });
  }, [standings]);

  // -------- Handlers --------
  const updateName = (i, val) => {
    const newNames = [...activePool.names];
    newNames[i] = val;
    updatePool({ names: newNames });
  };

  const updateBout = (i, j, boutIndex, field, value) => {
    if (i >= j) return;
    const newPairs = activePool.pairs.map((row) =>
      row.map((cell) => (Array.isArray(cell) ? [...cell] : cell))
    );
    const arr = newPairs[i][j].map((b) => ({ ...b }));
    arr[boutIndex][field] = value;
    newPairs[i][j] = arr;
    updatePool({ pairs: newPairs });
  };

  const incDec = (i, j, k, field, delta) => {
    const newPairs = activePool.pairs.map((row) =>
      row.map((cell) =>
        Array.isArray(cell) ? cell.map((b) => ({ ...b })) : cell
      )
    );
    const v = safeInt(newPairs[i][j][k][field]) + delta;
    newPairs[i][j][k][field] = v < 0 ? 0 : v;
    updatePool({ pairs: newPairs });
  };

  const summaryFor = (i, j) => calcPairStats(activePool.pairs[i][j].slice(0, B));

  const exportStandingsCSV = () => {
    const header = ["#", "Name", "V", "HS", "HR", "IND"];
    const rows = sortedStandings.map((r) => [
      r.Place,
      r.name,
      r.V,
      r.HS,
      r.HR,
      r.IND,
    ]);
    downloadCSV([header, ...rows], `${activePool.name}_standings_${activePool.date}.csv`);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <header className="mb-5">
          <h1 className="text-3xl font-bold tracking-tight">Digital Fencing Pool Sheet</h1>
          <p className="text-sm text-gray-600 mt-1">Multiple pools • Up to 10 fencers • 1–4 bouts per pairing</p>
        </header>

        {/* Pool Tabs */}
        <div className="mb-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {pools.map((pool) => (
              <div key={pool.id} className="flex items-center gap-1 bg-white rounded-xl border shadow-sm">
                <button
                  onClick={() => setActivePoolId(pool.id)}
                  className={`px-4 py-2 rounded-l-xl text-sm font-medium transition ${
                    activePoolId === pool.id
                      ? 'bg-black text-white'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {pool.name}
                </button>
                {pools.length > 1 && (
                  <button
                    onClick={() => removePool(pool.id)}
                    className="px-2 py-2 hover:bg-gray-100 rounded-r-xl text-gray-500 hover:text-red-600"
                    title="Remove pool"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addPool}
              className="px-4 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm font-medium shadow-sm"
            >
              + Add Pool
            </button>
          </div>

          {/* Pool Settings */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={activePool.name}
              onChange={(e) => renamePool(activePoolId, e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm bg-white shadow-sm font-medium"
              placeholder="Pool name"
            />
            <span className="h-5 w-px bg-gray-300" />
            <label className="text-sm text-gray-700">Date</label>
            <input
              type="date"
              value={activePool.date}
              onChange={(e) => updatePool({ date: e.target.value })}
              className="border rounded-xl px-3 py-2 text-sm bg-white shadow-sm"
            />
            <span className="h-5 w-px bg-gray-300" />
            <label className="text-sm text-gray-700">Pool size</label>
            <select
              value={N}
              onChange={(e) => updatePool({ size: Number(e.target.value) })}
              className="border rounded-xl px-3 py-2 text-sm bg-white shadow-sm"
            >
              {Array.from({ length: 9 }, (_, k) => 2 + k).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <label className="text-sm text-gray-700">Bouts per pairing</label>
            <select
              value={B}
              onChange={(e) => updatePool({ boutsPer: Number(e.target.value) })}
              className="border rounded-xl px-3 py-2 text-sm bg-white shadow-sm"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button onClick={() => window.print()} className="ml-auto px-3 py-2 rounded-xl bg-black text-white text-sm shadow-sm">
              Print / Save PDF
            </button>
            <button onClick={clearPoolData} className="px-3 py-2 rounded-xl border text-sm shadow-sm">
              Clear pool data
            </button>
          </div>
        </div>

        {/* Names editor */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: N }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs w-6 text-gray-500">{i + 1}.</span>
              <input
                value={activePool.names[i]}
                onChange={(e) => updateName(i, e.target.value)}
                className="flex-1 border rounded-xl px-3 py-2 text-sm bg-white shadow-sm"
                placeholder={`Fencer ${i + 1} name`}
              />
            </div>
          ))}
        </div>

        {/* Pool Grid */}
        <div className="overflow-auto border rounded-2xl bg-white shadow-sm">
          <table className="min-w-max w-full text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-30 bg-gray-100 p-3 text-left w-48 border-b">Name</th>
                {Array.from({ length: N }).map((_, j) => (
                  <th key={j} className="sticky top-0 z-20 bg-gray-100 p-3 text-center w-16 border-b border-l">{j + 1}</th>
                ))}
                {["V","HS","HR","IND","Place"].map((h) => (
                  <th key={h} className="sticky top-0 z-20 bg-gray-100 p-3 text-center w-16 border-b border-l">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: N }).map((_, i) => (
                <tr key={i}>
                  <td className="sticky left-0 z-10 bg-white p-3 font-medium whitespace-nowrap border-t">{activePool.names[i]}</td>
                  {Array.from({ length: N }).map((_, j) => {
                    if (i === j) {
                      return (
                        <td key={j} className="p-0 border-t border-l">
                          <div className="h-12 bg-gray-100" />
                        </td>
                      );
                    }
                    if (i > j) {
                      const stats = summaryFor(j, i);
                      const label = stats.vA + stats.vB > 0 ? `${stats.vB} -- ${stats.vA}` : '';
                      return (
                        <td key={j} className="p-1 text-center align-middle border-t border-l">
                          <span className="text-xs text-gray-400 tabular-nums">{label}</span>
                        </td>
                      );
                    }
                    const pairSummary = summaryFor(i, j);
                    return (
                      <td key={j} className="p-1 border-t border-l">
                        <button
                          onClick={() => setEditing({ i, j })}
                          className="w-full h-12 rounded-xl border bg-white hover:bg-gray-50 transition flex items-center justify-center gap-1"
                          title="Edit bouts"
                        >
                          {pairSummary.vA + pairSummary.vB > 0 ? (
                            <span className="text-sm text-gray-800 tabular-nums font-semibold">
                              {pairSummary.vA} -- {pairSummary.vB}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Add</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-3 text-center font-semibold tabular-nums border-t border-l">{standings[i].V}</td>
                  <td className="p-3 text-center tabular-nums border-t border-l">{standings[i].HS}</td>
                  <td className="p-3 text-center tabular-nums border-t border-l">{standings[i].HR}</td>
                  <td className="p-3 text-center tabular-nums border-t border-l">{standings[i].IND}</td>
                  <td className="p-3 text-center font-semibold tabular-nums border-t border-l">{standings[i].Place}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Standings Table */}
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-3">
            <h2 className="text-lg font-semibold">Standings</h2>
            <button
              onClick={exportStandingsCSV}
              className="ml-auto px-3 py-2 rounded-xl bg-black text-white text-sm shadow-sm"
              title="Download standings as CSV"
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-auto border rounded-2xl bg-white shadow-sm">
            <table className="min-w-max w-full text-sm">
              <thead>
                <tr>
                  {["#","Name","V","HS","HR","IND"].map((h, idx) => (
                    <th key={h} className={`p-3 ${idx<2?"text-left":"text-center"} bg-gray-100 border-b ${idx>0?"border-l":""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedStandings.map((r) => (
                  <tr key={r.idx}>
                    <td className="p-3 border-t tabular-nums">{r.Place}</td>
                    <td className="p-3 border-t border-l">{r.name}</td>
                    <td className="p-3 text-center border-t border-l tabular-nums font-semibold">{r.V}</td>
                    <td className="p-3 text-center border-t border-l tabular-nums">{r.HS}</td>
                    <td className="p-3 text-center border-t border-l tabular-nums">{r.HR}</td>
                    <td className="p-3 text-center border-t border-l tabular-nums">{r.IND}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-4 text-xs text-gray-500">
          Legend: V = Victories • HS = Hits Scored • HR = Hits Received • IND = HS − HR
        </p>
      </div>

      {/* Pop-up Editor Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditing(null)} />
          <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-semibold">Edit Pairing</h3>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">{activePool.names[editing.i]}</span>
                  <span className="mx-2">vs</span>
                  <span className="font-medium">{activePool.names[editing.j]}</span>
                </div>
              </div>
              <button onClick={() => setEditing(null)} className="rounded-full w-9 h-9 flex items-center justify-center border hover:bg-gray-50">✕</button>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
              {activePool.pairs[editing.i][editing.j].slice(0, B).map((bt, k) => (
                <div key={k} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Bout {k + 1}</div>
                    <button
                      onClick={() => {
                        updateBout(editing.i, editing.j, k, 'a', 0);
                        updateBout(editing.i, editing.j, k, 'b', 0);
                        updateBout(editing.i, editing.j, k, 'ha', 0);
                        updateBout(editing.i, editing.j, k, 'hb', 0);
                      }}
                      className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    >
                      Reset bout
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Inc fieldLabel={`${activePool.names[editing.i]} score`} value={safeInt(bt.a)} onDec={() => incDec(editing.i, editing.j, k, 'a', -1)} onInc={() => incDec(editing.i, editing.j, k, 'a', 1)} />
                    <Inc fieldLabel={`${activePool.names[editing.j]} score`} value={safeInt(bt.b)} onDec={() => incDec(editing.i, editing.j, k, 'b', -1)} onInc={() => incDec(editing.i, editing.j, k, 'b', 1)} />
                    <Inc fieldLabel={`Handicap ${activePool.names[editing.i]}`} value={safeInt(bt.ha)} onDec={() => incDec(editing.i, editing.j, k, 'ha', -1)} onInc={() => incDec(editing.i, editing.j, k, 'ha', 1)} />
                    <Inc fieldLabel={`Handicap ${activePool.names[editing.j]}`} value={safeInt(bt.hb)} onDec={() => incDec(editing.i, editing.j, k, 'hb', -1)} onInc={() => incDec(editing.i, editing.j, k, 'hb', 1)} />
                  </div>
                  <div className="mt-2 text-xs text-gray-600">Effective: {effectiveScore(bt.a, bt.ha)} : {effectiveScore(bt.b, bt.hb)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                {(() => { const s = summaryFor(editing.i, editing.j); return `Summary V ${s.vA}-${s.vB}  |  HS/HR ${s.hsA}/${s.hsB}`; })()}
              </div>
              <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-xl bg-black text-white text-sm">Done</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .tabular-nums { font-variant-numeric: tabular-nums; }
        @media print { .fixed, header button { display: none !important; } }
      `}</style>
    </div>
  );
}

function Inc({ fieldLabel, value, onDec, onInc }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{fieldLabel}</label>
      <div className="flex items-center gap-2">
        <button onClick={onDec} className="w-9 h-9 rounded-xl border bg-gray-50 hover:bg-gray-100 text-lg leading-none">−</button>
        <div className="min-w-10 text-center text-base font-medium">{value}</div>
        <button onClick={onInc} className="w-9 h-9 rounded-xl border bg-gray-50 hover:bg-gray-100 text-lg leading-none">+</button>
      </div>
    </div>
  );
}
