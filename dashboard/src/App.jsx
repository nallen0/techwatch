import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend
} from 'recharts';
import {
  Activity, Award, Zap, Microscope, TrendingUp, Download, RefreshCw, BarChart2, Calendar, FlameKindling
} from 'lucide-react';

const CustomTooltip = ({ active, payload, label, data }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card" style={{ padding: '12px', border: '1px solid rgba(255,255,255,0.1)', minWidth: '180px' }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>{label}</p>
        {payload.map((entry, index) => {
          const isImputed = entry.payload[`${entry.dataKey}_is_imputed`];
          return (
            <div key={index} style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: entry.color, fontSize: '0.8rem' }}>● {entry.name}:</span>
                <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: '500' }}>
                  {entry.value.toLocaleString()}
                  {isImputed && <span style={{ color: '#f59e0b', fontSize: '0.65rem', marginLeft: '4px', fontStyle: 'italic' }}>(Est.)</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

function App() {
  const [rawData, setRawData] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Overview');
  const [frequency, setFrequency] = useState('Monthly');
  const [selectedCategory, setSelectedCategory] = useState('personalized_medicine');
  const [heatMetric, setHeatMetric] = useState('research');

  const CATS = [
    { key: 'personalized_medicine', label: 'Personalized Med' },
    { key: 'antibodies',            label: 'Antibodies'       },
    { key: 'orphan_drugs',          label: 'Orphan Drugs'     },
    { key: 'medical_devices',       label: 'Medical Devices'  },
    { key: 'space_biology',         label: 'Space Biology'    },
  ];

  const heatmapData = useMemo(() => {
    const prefix = { research: 'res_', trial: 'tri_', development: 'dev_' }[heatMetric];
    const series = {};
    CATS.forEach(({ key }) => {
      series[key] = rawData.map(row => ({ month: row.month, val: row[prefix + key] ?? 0 }));
    });
    const stats = {};
    CATS.forEach(({ key }) => {
      const vals = series[key].map(d => d.val);
      const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const sd   = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1)) || 1;
      stats[key] = { mean, sd };
    });
    const cells = [];
    rawData.forEach((row, i) => {
      const prev = rawData[i - 1];
      CATS.forEach(({ key, label }) => {
        const val     = row[prefix + key] ?? 0;
        const prevVal = prev ? (prev[prefix + key] ?? 0) : null;
        const momPct  = prevVal != null && prevVal !== 0 ? ((val - prevVal) / prevVal) * 100 : null;
        const z       = (val - stats[key].mean) / stats[key].sd;
        cells.push({ month: row.month, isPartial: row.is_partial_month, catKey: key, catLabel: label, val, z, momPct });
      });
    });
    return { cells, months: rawData.map(r => r.month) };
  }, [rawData, heatMetric]);

  useEffect(() => {
    const load = async () => {
      try {
        const json = window.electronAPI
          ? await window.electronAPI.getIndicators()
          : await fetch(import.meta.env.BASE_URL + 'data/indicators.json').then(r => r.json());
        setRawData(json);
        processData(json, frequency);
      } catch (err) {
        console.error('Failed to load data', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    processData(rawData, frequency);
  }, [frequency, rawData]);

  const processData = (json, freq) => {
    if (freq === 'Monthly') {
      setData(json);
    } else {
      // Aggregate by Quarter
      const quarters = {};
      json.forEach(item => {
        const year = item.month.split('-')[0];
        const month = parseInt(item.month.split('-')[1]);
        const q = Math.ceil(month / 3);
        const qKey = `${year} Q${q}`;
        
        if (!quarters[qKey]) {
          quarters[qKey] = { ...item, month: qKey, count: 0 };
          // Initialize all aggregated metrics to 0
          Object.keys(item).forEach(key => {
            if (
              key.startsWith('res_') ||
              key.startsWith('tri_') ||
              key.startsWith('dev_') ||
              key.startsWith('total_') ||
              key === 'census_manufacturing_orders' ||
              key === 'industrial_production' ||
              key === 'renewable_energy_share'
            ) {
              quarters[qKey][key] = 0;
            }
          });
        }
        
        Object.keys(item).forEach(key => {
          if (
            key.startsWith('res_') ||
            key.startsWith('tri_') ||
            key.startsWith('dev_') ||
            key.startsWith('total_') ||
            key === 'census_manufacturing_orders'
          ) {
            quarters[qKey][key] += item[key];
          } else if (key === 'industrial_production' || key === 'renewable_energy_share') {
             quarters[qKey][key] = (quarters[qKey][key] * quarters[qKey].count + item[key]) / (quarters[qKey].count + 1);
          }
        });
        quarters[qKey].count += 1;
      });
      setData(Object.values(quarters));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', background: '#05070a' }}>
        <RefreshCw className="animate-spin" color="#00f2ff" />
      </div>
    );
  }

  const latest = data[data.length - 1] || {};
  const previous = data[data.length - 2] || {};

  const calculateGrowth = (current, prev) => {
    if (!prev || prev === 0) return current > 0 ? '100+' : '0';
    return (((current - prev) / prev) * 100).toFixed(1);
  };

  // ── Momentum heatmap ─────────────────────────────────────────────────────
  // Map z-score to a colour.  Clamp at ±2.5 so genuine outliers get the
  // darkest shade without dominating the whole palette.
  const zToColor = (z) => {
    const clamped = Math.max(-2.5, Math.min(2.5, z));
    const t = (clamped + 2.5) / 5; // 0 → 1
    if (t < 0.5) {
      // negative: deep red → neutral
      const intensity = Math.round((0.5 - t) * 2 * 160);
      return `rgba(239,68,68,${(0.5 - t) * 2 * 0.85 + 0.05})`;
    }
    // positive: neutral → deep cyan-green
    const s = (t - 0.5) * 2;
    return `rgba(16,185,129,${s * 0.85 + 0.05})`;
  };

  const anomalyLabel = (z, isPartial) => {
    if (isPartial) return '~';
    if (z >  2.5) return '▲▲';
    if (z >  2.0) return '▲';
    if (z < -2.5) return '▼▼';
    if (z < -2.0) return '▼';
    return '';
  };
  // ─────────────────────────────────────────────────────────────────────────

  const categoriesData = [
    { subject: 'Personalized Med', res: latest.res_personalized_medicine, tri: latest.tri_personalized_medicine, dev: latest.dev_personalized_medicine },
    { subject: 'Antibodies', res: latest.res_antibodies, tri: latest.tri_antibodies, dev: latest.dev_antibodies },
    { subject: 'Orphan Drugs', res: latest.res_orphan_drugs, tri: latest.tri_orphan_drugs, dev: latest.dev_orphan_drugs },
    { subject: 'Medical Devices', res: latest.res_medical_devices, tri: latest.tri_medical_devices, dev: latest.dev_medical_devices },
    { subject: 'Space Bio', res: latest.res_space_biology, tri: latest.tri_space_biology, dev: latest.dev_space_biology },
  ];

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="logo">
          <Activity size={32} color="var(--accent-color)" />
          <span>TechWatch</span>
        </div>
        
        <nav className="nav-links">
          {['Overview', 'Deep Dive', 'Momentum', 'Economy'].map(tab => (
            <li
              key={tab}
              className={`nav-item ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'Overview'  && <Activity size={20} />}
              {tab === 'Deep Dive' && <Microscope size={20} />}
              {tab === 'Momentum'  && <FlameKindling size={20} />}
              {tab === 'Economy'   && <TrendingUp size={20} />}
              {tab}
            </li>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-card" style={{ padding: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.8rem', letterSpacing: '0.05em' }}>DATA HEALTH</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: '#94a3b8' }}>Research (Pubmed/ArXiv)</span>
                <span style={{ color: latest.total_research > 0 ? '#10b981' : '#f59e0b' }}>● {latest.total_research > 0 ? 'Live' : 'Initializing...'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: '#94a3b8' }}>Mfg Orders (FRED)</span>
                <span style={{ color: latest.census_manufacturing_orders > 0 ? '#10b981' : '#f59e0b' }}>● {latest.census_manufacturing_orders > 0 ? 'Live' : 'No data'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: '#94a3b8' }}>Trials (ClinicalTrials)</span>
                <span style={{ color: latest.total_trial > 0 ? '#10b981' : '#f59e0b' }}>● {latest.total_trial > 0 ? 'Live' : 'No data'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: '#94a3b8' }}>Dev (GitHub)</span>
                <span style={{ color: latest.total_development > 0 ? '#10b981' : '#f59e0b' }}>● {latest.total_development > 0 ? 'Live' : 'No data'}</span>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>FREQUENCY</p>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px' }}>
              <button 
                onClick={() => setFrequency('Monthly')}
                style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', background: frequency === 'Monthly' ? 'var(--accent-color)' : 'transparent', color: frequency === 'Monthly' ? '#000' : '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
              >Monthly</button>
              <button 
                onClick={() => setFrequency('Quarterly')}
                style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', background: frequency === 'Quarterly' ? 'var(--accent-color)' : 'transparent', color: frequency === 'Quarterly' ? '#000' : '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
              >Quarterly</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="header animate-fade-in">
          <div className="title-group">
            <h1>TechWatch Intel</h1>
            <p>Science & Economic Impact Baseline Dashboard</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {latest.is_partial_month && (
              <span style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: '600' }}>
                ⚠ Partial Month
              </span>
            )}
            <span className="update-badge">{frequency} View</span>
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', border: 'none' }} onClick={async () => {
              const csv = window.electronAPI
                ? await window.electronAPI.getReportCsv()
                : await fetch('/report.csv').then(r => r.text());
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
              a.download = 'report.csv';
              a.click();
            }}>
              <Download size={18} />
              Export RAW
            </button>
          </div>
        </header>

        {activeTab === 'Overview' && (
          <>
            <section className="stats-grid animate-fade-in">
              <div className="glass-card metric-card">
                <span className="metric-label">Research Papers</span>
                <div className="metric-value">{latest.total_research?.toLocaleString() || '0'}</div>
                <div style={{ color: '#10b981', fontSize: '0.875rem' }}>
                  {calculateGrowth(latest.total_research, previous.total_research)}% {frequency === 'Monthly' ? 'MoM' : 'QoQ'}
                </div>
              </div>
              <div className="glass-card metric-card">
                <span className="metric-label">Clinical Trial Starts</span>
                <div className="metric-value">{latest.total_trial?.toLocaleString() || '0'}</div>
                <div style={{ color: '#10b981', fontSize: '0.875rem' }}>
                   {calculateGrowth(latest.total_trial, previous.total_trial)}% {frequency === 'Monthly' ? 'MoM' : 'QoQ'}
                </div>
              </div>
              <div className="glass-card metric-card">
                <span className="metric-label">Open Source (GitHub)</span>
                <div className="metric-value">{latest.total_development?.toLocaleString() || '0'}</div>
                <div style={{ color: '#10b981', fontSize: '0.875rem' }}>
                  {calculateGrowth(latest.total_development, previous.total_development)}% trend
                </div>
              </div>
            </section>

            <div className="stats-grid animate-fade-in" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
              <div className="glass-card">
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BarChart2 size={20} color="var(--accent-color)" />
                  Innovation Pipeline Trends
                </h3>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                      <defs>
                        <linearGradient id="colorPatents" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00f2ff" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#00f2ff" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="month" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Area type="monotone" dataKey="total_research" name="Research" stroke="#00f2ff" fillOpacity={1} fill="url(#colorPatents)" strokeWidth={3} />
                      <Area type="monotone" dataKey="total_trial" name="Trials" stroke="#7000ff" fillOpacity={0} strokeWidth={2} />
                      <Area type="monotone" dataKey="total_development" name="Development" stroke="#10b981" fillOpacity={0} strokeWidth={2} strokeDasharray="5 5" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-card">
                <h3 style={{ marginBottom: '1.5rem' }}>Latest Category Mix</h3>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={categoriesData}>
                      <PolarGrid stroke="rgba(255,255,255,0.1)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <PolarRadiusAxis hide />
                      <Radar name="Research" dataKey="res" stroke="#00f2ff" fill="#00f2ff" fillOpacity={0.15} />
                      <Radar name="Trials" dataKey="tri" stroke="#7000ff" fill="#7000ff" fillOpacity={0.15} />
                      <Radar name="Development" dataKey="dev" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                      <Legend />
                      <Tooltip content={<CustomTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'Deep Dive' && (
           <div className="animate-fade-in">
             <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Category Analysis</h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '4px 0 0 0' }}>Analyzing the progression from Research to Development</p>
                </div>
                <select 
                  value={selectedCategory} 
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="glass-card"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
                >
                  <option value="personalized_medicine">Personalized Medicine</option>
                  <option value="antibodies">Antibodies</option>
                  <option value="orphan_drugs">Orphan Drugs</option>
                  <option value="medical_devices">Medical Devices</option>
                  <option value="space_biology">Space Biology</option>
                </select>
             </div>

             <div className="stats-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
               <div className="glass-card">
                 <h3>Innovation Mix</h3>
                 <div className="chart-container">
                   <ResponsiveContainer width="100%" height="100%">
                     <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                       { subject: 'Research', val: latest[`res_${selectedCategory}`] },
                       { subject: 'Trials', val: latest[`tri_${selectedCategory}`] },
                       { subject: 'Dev', val: latest[`dev_${selectedCategory}`] },
                     ]}>
                       <PolarGrid stroke="rgba(255,255,255,0.1)" />
                       <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                       <Radar name="Activity" dataKey="val" stroke="var(--accent-color)" fill="var(--accent-color)" fillOpacity={0.4} />
                       <Tooltip content={<CustomTooltip />} />
                     </RadarChart>
                   </ResponsiveContainer>
                 </div>
               </div>

               <div className="glass-card">
                 <h3>Pipeline Timeline</h3>
                 <div className="chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="month" stroke="#475569" fontSize={10} />
                        <YAxis stroke="#475569" fontSize={10} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey={`res_${selectedCategory}`} name="Research Papers" stroke="#00f2ff" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey={`tri_${selectedCategory}`} name="Trial Starts" stroke="#7000ff" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey={`dev_${selectedCategory}`} name="Github Repos" stroke="#10b981" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                 </div>
               </div>
             </div>
           </div>
        )}

        {activeTab === 'Momentum' && (
          <div className="animate-fade-in">
            {/* Header + controls */}
            <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>Category Momentum Heatmap</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '4px 0 0 0' }}>
                  Z-score vs. each category's own baseline — shows acceleration, not just volume.
                  Anomaly markers: <span style={{ color: '#10b981' }}>▲▲ &gt;2.5σ</span> &nbsp;
                  <span style={{ color: '#ef4444' }}>▼▼ &lt;-2.5σ</span> &nbsp;
                  <span style={{ color: '#f59e0b' }}>~ partial month</span>
                </p>
              </div>
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px', gap: '2px' }}>
                {['research', 'trial', 'development'].map(m => (
                  <button
                    key={m}
                    onClick={() => setHeatMetric(m)}
                    style={{
                      padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'capitalize',
                      background: heatMetric === m ? 'var(--accent-color)' : 'transparent',
                      color:      heatMetric === m ? '#000' : '#fff',
                    }}
                  >{m}</button>
                ))}
              </div>
            </div>

            {/* Heatmap grid */}
            <div className="glass-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '3px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '130px', textAlign: 'left', color: '#475569', fontSize: '0.7rem', paddingBottom: '6px', fontWeight: 600 }}>CATEGORY</th>
                    {heatmapData.months.map(m => (
                      <th key={m} style={{ color: '#475569', fontSize: '0.6rem', fontWeight: 500, textAlign: 'center', minWidth: '36px', paddingBottom: '6px', whiteSpace: 'nowrap' }}>
                        {m.slice(2)} {/* YY-MM */}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CATS.map(({ key, label }) => (
                    <tr key={key}>
                      <td style={{ color: '#94a3b8', fontSize: '0.75rem', paddingRight: '10px', whiteSpace: 'nowrap', fontWeight: 500, paddingBottom: '3px' }}>
                        {label}
                      </td>
                      {heatmapData.months.map(month => {
                        const cell = heatmapData.cells.find(c => c.month === month && c.catKey === key);
                        if (!cell) return <td key={month} />;
                        const flag = anomalyLabel(cell.z, cell.isPartial);
                        const momStr = cell.momPct != null
                          ? `${cell.momPct > 0 ? '+' : ''}${cell.momPct.toFixed(1)}% MoM`
                          : 'first period';
                        return (
                          <td key={month} title={`${label} · ${month}\nValue: ${cell.val.toLocaleString()}\nZ-score: ${cell.z.toFixed(2)}σ\n${momStr}${cell.isPartial ? '\n⚠ Partial month' : ''}`}
                            style={{
                              background: zToColor(cell.z),
                              borderRadius: '5px',
                              textAlign: 'center',
                              fontSize: '0.6rem',
                              fontWeight: '700',
                              color: Math.abs(cell.z) > 1.5 ? '#fff' : 'rgba(255,255,255,0.4)',
                              padding: '6px 2px',
                              cursor: 'default',
                              border: cell.isPartial ? '1px solid rgba(245,158,11,0.5)' : '1px solid transparent',
                              minWidth: '36px',
                              transition: 'filter 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.4)'}
                            onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
                          >
                            {flag || (cell.val > 0 ? cell.val.toLocaleString() : '—')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Legend */}
              <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 600 }}>Z-SCORE</span>
                {[
                  { z: -2.5, label: '−2.5σ' },
                  { z: -1.5, label: '−1.5σ' },
                  { z: -0.5, label: '−0.5σ' },
                  { z:  0.5, label: '+0.5σ' },
                  { z:  1.5, label: '+1.5σ' },
                  { z:  2.5, label: '+2.5σ' },
                ].map(({ z, label }) => (
                  <div key={z} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: 28, height: 18, borderRadius: 4, background: zToColor(z) }} />
                    <span style={{ color: '#475569', fontSize: '0.65rem' }}>{label}</span>
                  </div>
                ))}
                <span style={{ marginLeft: '12px', color: '#475569', fontSize: '0.7rem' }}>
                  Cells show value (or anomaly flag for &gt;|2σ|). Hover for detail.
                </span>
              </div>
            </div>

            {/* Anomaly call-outs */}
            <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>📌 KNOWN STRUCTURAL ANOMALIES</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>Jan 2025 research spike (▲▲)</span>
                    <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>
                      Publishing calendar artifact — journals flush Q4 submissions into January. Hits all categories proportionally. Not a real trend signal.
                    </p>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#e2e8f0', marginTop: '0.25rem' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>Oct 2025 Space Biology dev spike (▲▲)</span>
                    <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>
                      Isolated to one category + one layer, no research/trial corroboration. Likely a single-event GitHub repo dump (course, hackathon, or bulk upload).
                    </p>
                  </div>
                </div>
              </div>
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>📐 HOW TO READ THE HEATMAP</p>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.6' }}>
                  <p>Each cell is coloured by <strong style={{ color: '#e2e8f0' }}>z-score vs. that category's own history</strong>, so a slow-moving field like Space Biology and a high-volume field like Antibodies are on the same scale.</p>
                  <p style={{ marginTop: '0.4rem' }}>A real acceleration shows <strong style={{ color: '#10b981' }}>green across multiple categories</strong> in the same month. A single bright cell in an otherwise neutral row is noise.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Economy' && (
          <div className="stats-grid">
             <div className="glass-card">
               <h3>Industrial Production Index</h3>
               <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" fontSize={10} />
                    <YAxis domain={['auto', 'auto']} fontSize={10} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="industrial_production" name="INDPRO" stroke="#10b981" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
               </div>
             </div>
             <div className="glass-card">
               <h3>Renewable Generation (×1,000 MWh)</h3>
               <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <XAxis dataKey="month" fontSize={10} />
                    <YAxis domain={['auto', 'auto']} fontSize={10} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="renewable_energy_share" name="Renewable Gen" fill="#10b981" fillOpacity={0.1} stroke="#10b981" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
               </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
