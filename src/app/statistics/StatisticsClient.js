"use client";
import { useState, useMemo } from 'react';
import { manageTask, logSpokenTo } from '../actions';

export default function StatisticsClient({ initialData }) {
  const [openDropdown, setOpenDropdown] = useState(null);
  
  // Global Time Filters
  const [timeMode, setTimeMode] = useState('Monthly'); 
  const [tpMonth, setTpMonth] = useState('');
  const [tpRange, setTpRange] = useState({ start: '', end: '' });

  // Independent Comparison Time Filters
  const [compTimeMode, setCompTimeMode] = useState('Monthly');
  const [compMonth, setCompMonth] = useState('');
  const [compRange, setCompRange] = useState({ start: '', end: '' });

  const [selectedStaffName, setSelectedStaffName] = useState("");
  const [compareSelected, setCompareSelected] = useState([]);
  const [processing, setProcessing] = useState(null);
  const [exceptionModal, setExceptionModal] = useState({ isOpen: false, name: "", reason: "" });

  // State to track and hide handled users in the Metric Evaluator
  const [dismissedEvaluations, setDismissedEvaluations] = useState([]);

  const activeStaff = initialData.filter(s => s.isActive);

  const staffOptions = useMemo(() => {
    return [...initialData].sort((a, b) => {
      if (a.isActive === b.isActive) return a.name.localeCompare(b.name);
      return a.isActive ? -1 : 1;
    });
  }, [initialData]);

  const availableMonths = useMemo(() => {
    const months = new Set();
    initialData.forEach(s => s.history.forEach(h => months.add(h.month)));
    const sorted = Array.from(months).sort((a, b) => new Date(b) - new Date(a));
    if (sorted.length > 0) {
      if (!tpMonth) setTpMonth(sorted[0]);
      if (!compMonth) setCompMonth(sorted[0]);
    }
    return sorted;
  }, [initialData, tpMonth, compMonth]);

  const mostRecentMonth = availableMonths[0];

  // METRIC EVALUATOR
  const missedQuotaEvaluations = useMemo(() => {
    if (!mostRecentMonth) return [];
    return activeStaff.map(s => {
       // Instantly hide if they have been handled in this session
       if (dismissedEvaluations.includes(s.name)) return null;

       const h = s.history.find(x => x.month === mostRecentMonth);
       if (!h) return null;
       const igTarget = Math.max(0, 30 - (h.loaDays || 0));
       const isSenior = s.rank === 'Senior Support';
       let met = h.newIG >= igTarget;
       if (isSenior && h.newForum < 5) met = false;
       
       if (h.strike > 0) return null; 
       
       return { ...s, monthData: h, metQuota: met, igTarget, forumTarget: isSenior ? 5 : 0 };
    }).filter(s => s && !s.metQuota);
  }, [activeStaff, mostRecentMonth, dismissedEvaluations]);

  const handleConfirmStrike = async (staffName) => {
    setProcessing(`strike-${staffName}`);
    await manageTask({ action: 'AddBatch', tasksArray: [{ id: Date.now().toString(), title: `Issue Strike - ${staffName}`, description: `Missed Metric Quota for ${mostRecentMonth}`, target: 'SSM' }] });
    setDismissedEvaluations(prev => [...prev, staffName]); // Hide from view instantly
    setProcessing(null);
  };

  const submitException = async () => {
    setProcessing('exception');
    await logSpokenTo({ name: exceptionModal.name, note: `METRIC EXCEPTION: ${exceptionModal.reason}` });
    setDismissedEvaluations(prev => [...prev, exceptionModal.name]); // Hide from view instantly
    setProcessing(null);
    setExceptionModal({ isOpen: false, name: "", reason: "" });
  };

  // RANK RELIABILITY
  const rankStats = useMemo(() => {
    const stats = {
      support: { sixMo: { met: 0, total: 0, igSum: 0 }, life: { met: 0, total: 0, igSum: 0 } },
      senior: { sixMo: { met: 0, total: 0, igSum: 0, forumSum: 0 }, life: { met: 0, total: 0, igSum: 0, forumSum: 0 } }
    };
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    initialData.forEach(staff => {
      const isSenior = staff.rank === 'Senior Support';
      staff.history.forEach(h => {
        const isRecent = h.timestamp >= sixMonthsAgo.getTime();
        const igTarget = Math.max(0, 30 - (h.loaDays || 0));
        let met = h.newIG >= igTarget;
        if (isSenior && h.newForum < 5) met = false;

        const category = isSenior ? stats.senior : stats.support;
        category.life.total++;
        if (met) category.life.met++;
        category.life.igSum += h.newIG;
        if (isSenior) category.life.forumSum += h.newForum;

        if (isRecent) {
          category.sixMo.total++;
          if (met) category.sixMo.met++;
          category.sixMo.igSum += h.newIG;
          if (isSenior) category.sixMo.forumSum += h.newForum;
        }
      });
    });

    const calcRel = (cat) => cat.total > 0 ? Math.round((cat.met / cat.total) * 100) : 0;
    const calcAvg = (sum, total) => total > 0 ? (sum / total).toFixed(1) : 0;

    return {
      support: { rel6: calcRel(stats.support.sixMo), relLife: calcRel(stats.support.life), avgIG: calcAvg(stats.support.life.igSum, stats.support.life.total) },
      senior: { rel6: calcRel(stats.senior.sixMo), relLife: calcRel(stats.senior.life), avgIG: calcAvg(stats.senior.life.igSum, stats.senior.life.total), avgForum: calcAvg(stats.senior.life.forumSum, stats.senior.life.total) }
    };
  }, [initialData]);

  const lifetimeTotals = useMemo(() => {
    return initialData.reduce((acc, staff) => {
      return { ig: acc.ig + staff.lifetimeIG, forum: acc.forum + staff.lifetimeForum, discord: acc.discord + staff.lifetimeDiscord };
    }, { ig: 0, forum: 0, discord: 0 });
  }, [initialData]);

  // LEADERBOARD LOGIC
  const staffPerformance = useMemo(() => {
    return activeStaff.map(s => {
      let ig = 0, forum = 0, discord = 0;
      if (timeMode === 'Overall') {
        ig = s.lifetimeIG; forum = s.lifetimeForum; discord = s.lifetimeDiscord;
      } else if (timeMode === 'Monthly') {
        const monthData = s.history.find(h => h.month === tpMonth);
        if (monthData) { ig = monthData.newIG; forum = monthData.newForum; discord = monthData.newDiscord; }
      } else if (timeMode === 'Range') {
        const startMs = new Date(tpRange.start).getTime() || 0;
        const endMs = new Date(tpRange.end).getTime() || Infinity;
        const validHistory = s.history.filter(h => h.timestamp >= startMs && h.timestamp <= endMs);
        ig = validHistory.reduce((sum, h) => sum + h.newIG, 0);
        forum = validHistory.reduce((sum, h) => sum + h.newForum, 0);
        discord = validHistory.reduce((sum, h) => sum + h.newDiscord, 0);
      }
      return { name: s.name, ig, forum, discord, total: ig + forum + discord };
    });
  }, [activeStaff, timeMode, tpMonth, tpRange]);

  const topIG = [...staffPerformance].sort((a, b) => b.ig - a.ig).slice(0, 5).filter(s => s.ig > 0);
  const topForum = [...staffPerformance].sort((a, b) => b.forum - a.forum).slice(0, 5).filter(s => s.forum > 0);
  const topDiscord = [...staffPerformance].sort((a, b) => b.discord - a.discord).slice(0, 5).filter(s => s.discord > 0);

  // INDIVIDUAL ANALYSIS DATA
  const selectedStaffData = useMemo(() => {
    const data = initialData.find(s => s.name === selectedStaffName);
    if (!data) return null;
    const isSenior = data.rank === 'Senior Support';
    const historyWithQuota = data.history.slice(0, 6).map(h => {
      const igTarget = Math.max(0, 30 - (h.loaDays || 0));
      let met = h.newIG >= igTarget;
      if (isSenior && h.newForum < 5) met = false;
      return { ...h, metQuota: met, igTarget, forumTarget: isSenior ? 5 : 0 };
    });
    const metCount = historyWithQuota.filter(h => h.metQuota).length;
    const reliability = historyWithQuota.length > 0 ? Math.round((metCount / historyWithQuota.length) * 100) : 0;
    const strikes = data.history.filter(h => h.strike > 0);
    return { ...data, historyWithQuota, reliability, metCount, strikes };
  }, [initialData, selectedStaffName]);

  // CUSTOM COMPARE LOGIC
  const comparePerformance = useMemo(() => {
    return initialData.map(s => {
      let ig = 0, forum = 0, discord = 0, metCount = 0, totalEligible = 0;
      const isSenior = s.rank === 'Senior Support';
      
      if (compTimeMode === 'Overall') {
        ig = s.lifetimeIG; forum = s.lifetimeForum; discord = s.lifetimeDiscord;
        s.history.forEach(h => {
           totalEligible++;
           const igTarget = Math.max(0, 30 - (h.loaDays || 0));
           let met = h.newIG >= igTarget;
           if (isSenior && h.newForum < 5) met = false;
           if (met) metCount++;
        });
      } else if (compTimeMode === 'Monthly') {
        const h = s.history.find(x => x.month === compMonth);
        if (h) { 
           ig = h.newIG; forum = h.newForum; discord = h.newDiscord; 
           totalEligible = 1;
           const igTarget = Math.max(0, 30 - (h.loaDays || 0));
           let met = h.newIG >= igTarget;
           if (isSenior && h.newForum < 5) met = false;
           if (met) metCount = 1;
        }
      } else if (compTimeMode === 'Range') {
        const startMs = new Date(compRange.start).getTime() || 0;
        const endMs = new Date(compRange.end).getTime() || Infinity;
        const validHistory = s.history.filter(h => h.timestamp >= startMs && h.timestamp <= endMs);
        validHistory.forEach(h => {
           ig += h.newIG; forum += h.newForum; discord += h.newDiscord;
           totalEligible++;
           const igTarget = Math.max(0, 30 - (h.loaDays || 0));
           let met = h.newIG >= igTarget;
           if (isSenior && h.newForum < 5) met = false;
           if (met) metCount++;
        });
      }
      const reliability = totalEligible > 0 ? Math.round((metCount / totalEligible) * 100) : 0;
      return { name: s.name, ig, forum, discord, reliability, rank: s.rank };
    });
  }, [initialData, compTimeMode, compMonth, compRange]);

  const toggleCompare = (name) => {
    if (compareSelected.includes(name)) setCompareSelected(prev => prev.filter(n => n !== name));
    else setCompareSelected(prev => [...prev, name]);
  };

  const comparisonData = compareSelected.map(name => comparePerformance.find(s => s.name === name)).filter(Boolean);

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-[1600px] mx-auto space-y-10 relative min-h-screen" onClick={() => setOpenDropdown(null)}>
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-indigo-500/5 rounded-full blur-[100px]" />
      </div>

      <header className="relative z-[100] bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">
          <div><h1 className="text-4xl font-light text-white tracking-tight">Performance Statistics</h1><p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mt-2 font-bold font-mono">Network Intelligence Hub</p></div>
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/40 p-2 rounded-2xl border border-white/5 shadow-inner">
             <div className="text-[10px] text-zinc-500 uppercase tracking-widest px-4 font-bold">Global Range:</div>
             <div className="flex flex-wrap items-center gap-2">
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <div onClick={() => setOpenDropdown(openDropdown === 'timeMode' ? null : 'timeMode')} className="bg-zinc-800/50 hover:bg-zinc-800 border border-white/5 text-white text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer flex items-center gap-3 transition-all"><span>{timeMode === 'Overall' ? 'Lifetime' : timeMode === 'Monthly' ? 'Monthly' : 'Range'}</span><span className="text-[8px] text-zinc-500">▼</span></div>
                  {openDropdown === 'timeMode' && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl py-2 overflow-hidden z-[110]">
                      {['Overall', 'Monthly', 'Range'].map(mode => (<div key={mode} onClick={() => { setTimeMode(mode); setOpenDropdown(null); }} className={`px-5 py-3 text-xs font-bold cursor-pointer transition-colors ${timeMode === mode ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>{mode}</div>))}
                    </div>
                  )}
                </div>
                {timeMode === 'Monthly' && (
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <div onClick={() => setOpenDropdown(openDropdown === 'tpMonth' ? null : 'tpMonth')} className="bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer flex items-center gap-3 transition-all"><span>{tpMonth}</span><span className="text-[8px] text-indigo-400">▼</span></div>
                    {openDropdown === 'tpMonth' && (
                      <div className="absolute top-full right-0 mt-2 w-40 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl py-2 max-h-64 overflow-y-auto custom-scrollbar z-[110]">
                        {availableMonths.map(m => (<div key={m} onClick={() => { setTpMonth(m); setOpenDropdown(null); }} className={`px-5 py-3 text-xs font-bold cursor-pointer transition-colors ${tpMonth === m ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>{m}</div>))}
                      </div>
                    )}
                  </div>
                )}
                {timeMode === 'Range' && (
                  <div className="flex items-center gap-2 bg-zinc-800/50 border border-white/5 rounded-xl px-4 py-2">
                    <input type="date" style={{ colorScheme: 'dark' }} className="bg-transparent text-indigo-300 text-[10px] font-bold uppercase outline-none" value={tpRange.start} onChange={e => setTpRange({...tpRange, start: e.target.value})} />
                    <span className="text-zinc-600 font-bold">-</span>
                    <input type="date" style={{ colorScheme: 'dark' }} className="bg-transparent text-indigo-300 text-[10px] font-bold uppercase outline-none" value={tpRange.end} onChange={e => setTpRange({...tpRange, end: e.target.value})} />
                  </div>
                )}
             </div>
          </div>
        </div>
      </header>

      {/* SECTION 1: METRIC EVALUATOR & LEADERBOARDS */}
      <div className="flex flex-col space-y-8 relative z-50">
        
        {/* CONDENSED METRIC EVALUATOR */}
        {mostRecentMonth && missedQuotaEvaluations.length > 0 && (
          <section className="bg-red-950/20 backdrop-blur-3xl border border-red-500/30 rounded-[2rem] p-6 shadow-[0_20px_50px_rgba(239,68,68,0.1)]">
            <div className="flex items-center gap-3 mb-4 border-b border-red-500/20 pb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse" />
              <h2 className="text-sm font-bold text-red-100 uppercase tracking-widest">Metric Evaluator: {mostRecentMonth}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {missedQuotaEvaluations.map(s => (
                <div key={s.name} className="bg-black/50 border border-red-500/20 rounded-xl p-4 flex flex-col gap-3 group hover:border-red-500/50 transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white text-sm">{s.name}</span>
                    <span className="text-[8px] uppercase tracking-widest text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">{s.rank === 'Senior Support' ? 'Senior' : 'Support'}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-zinc-400 bg-white/5 p-2 rounded-lg">
                    <span>IG: <span className="text-red-400 font-bold">{s.monthData.newIG}</span>/{s.igTarget}</span>
                    <span>FR: <span className={s.monthData.newForum < s.forumTarget ? 'text-red-400 font-bold' : 'text-amber-400 font-bold'}>{s.monthData.newForum}</span>/{s.forumTarget}</span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button disabled={processing === `strike-${s.name}`} onClick={() => handleConfirmStrike(s.name)} className="flex-1 py-2 bg-red-600/80 hover:bg-red-500 rounded-lg text-[9px] font-bold text-white uppercase tracking-widest transition-all shadow-md">{processing === `strike-${s.name}` ? '...' : 'Strike Task'}</button>
                    <button onClick={() => setExceptionModal({ isOpen: true, name: s.name, reason: "" })} className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-bold text-zinc-300 uppercase tracking-widest transition-all">Exception</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* COMBINED LEADERBOARD */}
        <section className="bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-xl">
           <h2 className="text-2xl font-light text-white tracking-tight mb-6 border-b border-white/5 pb-4">Network Leaderboards</h2>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
             <LeaderboardColumn title="In-Game Reports" data={topIG} color="text-emerald-400" field="ig" />
             <LeaderboardColumn title="Forum Reports" data={topForum} color="text-amber-400" field="forum" />
             <LeaderboardColumn title="Discord Tickets" data={topDiscord} color="text-indigo-400" field="discord" />
           </div>
        </section>
      </div>

      {/* SECTION 2: SIDE-BY-SIDE RANK & INDIVIDUAL */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 relative z-40">
        
        {/* RANK RELIABILITY (1 Col) */}
        <section className="xl:col-span-1 bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-xl flex flex-col gap-6">
           <div className="border-b border-white/5 pb-4 mb-2">
              <h2 className="text-2xl font-light text-white tracking-tight">Rank Audit</h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1 font-bold">Structural Benchmark</p>
           </div>
           <RankCard title="Support Personnel" stats={rankStats.support} color="text-emerald-400" glow="bg-emerald-500/5" logic="30 In-Game Reports" />
           <RankCard title="Senior Support" stats={rankStats.senior} color="text-indigo-400" glow="bg-indigo-500/5" logic="30 IG & 5 Forum" />
        </section>

        {/* INDIVIDUAL ANALYSIS (2 Cols) */}
        <section className="xl:col-span-2 bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-xl flex flex-col">
          <div className="relative z-50 border-b border-white/5 pb-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl font-light text-white tracking-tight">Individual Analysis</h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1 font-bold">Personnel Deep-Dive</p>
            </div>
            <div className="relative w-full md:w-auto" onClick={(e) => e.stopPropagation()}>
              <div onClick={() => setOpenDropdown(openDropdown === 'staffSelect' ? null : 'staffSelect')} className="bg-black/40 border border-white/10 text-white text-sm font-bold px-6 py-3 rounded-xl cursor-pointer flex items-center justify-between w-full md:min-w-[280px] hover:border-indigo-500/50 transition-all">
                <span>{selectedStaffName || "Select Staff Member..."}</span><span className="text-[9px] text-zinc-500 ml-4">▼</span>
              </div>
              {openDropdown === 'staffSelect' && (
                <div className="absolute top-full right-0 mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-2 max-h-[350px] overflow-y-auto custom-scrollbar z-[120]">
                  {staffOptions.map(s => (
                    <div key={s.name} onClick={() => { setSelectedStaffName(s.name); setOpenDropdown(null); }} className={`px-5 py-3 text-sm font-bold cursor-pointer transition-colors flex justify-between items-center ${selectedStaffName === s.name ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>
                      <span>{s.name}</span>
                      {!s.isActive && <span className="text-[8px] uppercase tracking-widest text-red-400 bg-red-400/10 px-2 py-0.5 rounded border border-red-400/20">Inactive</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {selectedStaffData ? (
            <div className="flex-1 flex flex-col animate-in fade-in duration-500 space-y-6">
              <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-6 flex justify-between items-center shadow-inner">
                 <div>
                   <div className="text-[10px] text-indigo-400 uppercase tracking-[0.2em] font-black mb-1">Reliability Rating</div>
                   <div className={`text-4xl font-light tracking-tight ${selectedStaffData.reliability >= 80 ? 'text-emerald-400' : selectedStaffData.reliability >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{selectedStaffData.reliability}%</div>
                 </div>
                 <div className="text-right flex gap-6">
                    <div><div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-bold">Lifetime IG</div><div className="text-xl text-white font-light">{selectedStaffData.lifetimeIG}</div></div>
                    <div><div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-bold">Forums</div><div className="text-xl text-white font-light">{selectedStaffData.lifetimeForum}</div></div>
                    <div><div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-bold">Discord</div><div className="text-xl text-white font-light">{selectedStaffData.lifetimeDiscord}</div></div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                <HistoryLedger title="6-Month Ledger" data={selectedStaffData.historyWithQuota} />
                <div className="flex flex-col gap-6">
                  <DisciplineLedger title="Discipline & Feedback" strikes={selectedStaffData.strikes} logs={selectedStaffData.spokenToLogs} />
                  <LOALedger title="Leave History" data={selectedStaffData.loas} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-30 min-h-[300px]"><div className="text-4xl mb-4">👤</div><div className="text-sm font-bold uppercase tracking-widest">Select Personnel</div></div>
          )}
        </section>
      </div>

      {/* SECTION 3: CUSTOM COMPARISON */}
      <section className="relative z-30 bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-10 shadow-xl">
         <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-8 border-b border-white/5 pb-6">
            <div>
               <h2 className="text-3xl font-light text-white tracking-tight">Custom Comparison</h2>
               <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2 font-bold font-mono">1-to-1 Evaluation</p>
            </div>
            
            {/* INDEPENDENT TIME FILTER & SELECTOR */}
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/5">
                 <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <div onClick={() => setOpenDropdown(openDropdown === 'compTimeMode' ? null : 'compTimeMode')} className="bg-zinc-800/50 border border-white/5 text-white text-[10px] font-bold uppercase px-3 py-2 rounded-lg cursor-pointer flex items-center gap-2">
                      <span>{compTimeMode}</span><span className="text-[8px] text-zinc-500">▼</span>
                    </div>
                    {openDropdown === 'compTimeMode' && (
                      <div className="absolute top-full left-0 mt-1 w-32 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 z-[110]">
                        {['Overall', 'Monthly', 'Range'].map(mode => (<div key={mode} onClick={() => { setCompTimeMode(mode); setOpenDropdown(null); }} className="px-4 py-2 text-[10px] font-bold cursor-pointer transition-colors uppercase text-zinc-400 hover:bg-white/5 hover:text-white">{mode}</div>))}
                      </div>
                    )}
                 </div>
                 {compTimeMode === 'Monthly' && (
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <div onClick={() => setOpenDropdown(openDropdown === 'compMonth' ? null : 'compMonth')} className="bg-indigo-500/10 text-indigo-300 text-[10px] font-bold uppercase px-3 py-2 rounded-lg cursor-pointer flex items-center gap-2 border border-indigo-500/20">
                        <span>{compMonth}</span><span className="text-[8px] text-indigo-400">▼</span>
                      </div>
                      {openDropdown === 'compMonth' && (
                        <div className="absolute top-full right-0 mt-1 w-32 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 max-h-48 overflow-y-auto custom-scrollbar z-[110]">
                          {availableMonths.map(m => (<div key={m} onClick={() => { setCompMonth(m); setOpenDropdown(null); }} className="px-4 py-2 text-[10px] font-bold cursor-pointer transition-colors text-zinc-400 hover:bg-white/5 hover:text-white uppercase">{m}</div>))}
                        </div>
                      )}
                    </div>
                 )}
                 {compTimeMode === 'Range' && (
                    <div className="flex items-center gap-2 bg-zinc-800/50 border border-white/5 rounded-lg px-2 py-1">
                      <input type="date" style={{ colorScheme: 'dark' }} className="bg-transparent text-indigo-300 text-[9px] font-bold uppercase outline-none" value={compRange.start} onChange={e => setCompRange({...compRange, start: e.target.value})} />
                      <span className="text-zinc-600">-</span>
                      <input type="date" style={{ colorScheme: 'dark' }} className="bg-transparent text-indigo-300 text-[9px] font-bold uppercase outline-none" value={compRange.end} onChange={e => setCompRange({...compRange, end: e.target.value})} />
                    </div>
                 )}
              </div>

              <div className="relative w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
                <div onClick={() => setOpenDropdown(openDropdown === 'compareSelect' ? null : 'compareSelect')} className="bg-black/40 border border-white/10 text-white text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer flex items-center justify-between min-w-[220px] hover:border-indigo-500/50">
                  <span>Add Staff to Compare...</span><span className="text-[8px] text-zinc-500 ml-3">▼</span>
                </div>
                {openDropdown === 'compareSelect' && (
                  <div className="absolute top-full right-0 mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-2 max-h-[300px] overflow-y-auto custom-scrollbar z-[120]">
                    {staffOptions.map(s => (
                      <div key={s.name} onClick={() => toggleCompare(s.name)} className={`px-5 py-3 text-xs font-bold cursor-pointer transition-colors flex justify-between items-center ${compareSelected.includes(s.name) ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>
                        <span>{s.name}</span>
                        {compareSelected.includes(s.name) && <span className="text-[8px] uppercase tracking-widest text-indigo-400 font-black">Selected</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
         </div>

         {comparisonData.length > 0 ? (
           <div className="flex gap-6 overflow-x-auto custom-scrollbar pb-4">
             {comparisonData.map((staff, i) => (
               <div key={i} className="bg-black/30 border border-white/5 rounded-3xl p-8 min-w-[280px] shadow-inner relative group hover:border-indigo-500/30 transition-all">
                 <button onClick={() => toggleCompare(staff.name)} className="absolute top-4 right-4 text-zinc-600 hover:text-red-400 transition-colors font-bold text-lg">✕</button>
                 <h3 className="text-2xl font-light text-white tracking-tight mb-1">{staff.name}</h3>
                 <div className={`inline-block px-3 py-1 rounded-md text-[8px] font-bold uppercase tracking-widest mb-6 ${staff.rank === 'Senior Support' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>{staff.rank}</div>
                 
                 <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-center mb-6">
                   <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-black mb-1">Timeframe Reliability</div>
                   <div className={`text-3xl font-extralight ${staff.reliability >= 80 ? 'text-emerald-400' : staff.reliability >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{staff.reliability}%</div>
                 </div>

                 <div className="space-y-4 font-mono text-sm">
                   <div className="flex justify-between items-center border-b border-white/5 pb-2"><span className="text-zinc-500 text-xs">In-Game</span><span className="text-emerald-400 font-bold">{staff.ig}</span></div>
                   <div className="flex justify-between items-center border-b border-white/5 pb-2"><span className="text-zinc-500 text-xs">Forum</span><span className="text-amber-400 font-bold">{staff.forum}</span></div>
                   <div className="flex justify-between items-center"><span className="text-zinc-500 text-xs">Discord</span><span className="text-indigo-400 font-bold">{staff.discord}</span></div>
                 </div>
               </div>
             ))}
           </div>
         ) : (
           <div className="text-center py-16 text-zinc-600 font-bold uppercase tracking-widest text-xs italic opacity-50">Select staff from the dropdown above to begin comparison</div>
         )}
      </section>

      <footer className="relative z-10 bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-wrap justify-center sm:justify-between items-center gap-6">
        <div className="text-[10px] text-zinc-500 uppercase tracking-[0.3em] font-black sm:ml-4">Network Lifetime Aggregates</div>
        <div className="flex gap-6 sm:gap-10 sm:mr-4 font-mono">
          <div className="flex flex-col"><span className="text-[8px] text-zinc-600 uppercase font-black mb-1">In-Game</span><span className="text-sm text-emerald-400 font-bold">{lifetimeTotals.ig.toLocaleString()}</span></div>
          <div className="flex flex-col"><span className="text-[8px] text-zinc-600 uppercase font-black mb-1">Forums</span><span className="text-sm text-amber-400 font-bold">{lifetimeTotals.forum.toLocaleString()}</span></div>
          <div className="flex flex-col"><span className="text-[8px] text-zinc-600 uppercase font-black mb-1">Discord</span><span className="text-sm text-indigo-400 font-bold">{lifetimeTotals.discord.toLocaleString()}</span></div>
        </div>
      </footer>

      {exceptionModal.isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-lg shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-2xl font-light text-white mb-2 tracking-tight">Metric Exception: {exceptionModal.name}</h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-8">This reason will log to their permanent file</p>
              <textarea className="w-full h-40 p-5 rounded-2xl bg-black/40 border border-white/5 text-white text-sm outline-none focus:border-amber-500 focus:shadow-[0_0_15px_rgba(251,191,36,0.2)] transition-all custom-scrollbar mb-8 shadow-inner" placeholder="Why are they being excused from their quota?" value={exceptionModal.reason} onChange={(e) => setExceptionModal({...exceptionModal, reason: e.target.value})} />
              <div className="flex gap-4">
                <button onClick={() => setExceptionModal({isOpen: false, name: "", reason: ""})} className="flex-1 text-zinc-500 font-bold uppercase text-xs hover:text-white transition-colors">Cancel</button>
                <button disabled={processing === 'exception'} onClick={submitException} className="flex-1 py-4 bg-amber-600/80 hover:bg-amber-500 backdrop-blur-md border border-amber-400/50 rounded-xl font-bold text-white uppercase text-xs transition-all shadow-[0_0_20px_rgba(251,191,36,0.4)]">{processing === 'exception' ? 'Saving...' : 'Grant Exception'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// SUB-COMPONENTS
function LeaderboardColumn({ title, data, color, field }) {
  return (
    <div className="group">
      <h3 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-4 border-b border-white/5 pb-2">{title}</h3>
      <div className="space-y-2">
        {data.length > 0 ? data.map((d, i) => (
          <div key={i} className="flex justify-between items-center bg-white/[0.02] p-3 rounded-xl border border-transparent hover:border-white/10 transition-all">
            <div className="flex items-center gap-3">
              <span className={`text-[9px] font-black font-mono ${i === 0 ? color : 'text-zinc-600'}`}>0{i + 1}</span>
              <span className={`text-xs ${i === 0 ? 'text-white font-bold' : 'text-zinc-400'}`}>{d.name}</span>
            </div>
            <span className={`font-mono text-xs font-black ${color}`}>{d[field]}</span>
          </div>
        )) : <div className="text-[9px] text-zinc-700 uppercase font-bold tracking-widest text-center py-4 italic">No Data</div>}
      </div>
    </div>
  );
}

function RankCard({ title, stats, color, glow, logic }) {
  return (
    <div className={`relative ${glow} border border-white/5 rounded-2xl p-6 shadow-inner flex flex-col group`}>
      <div className="mb-6">
        <h3 className={`text-xl font-light ${color} tracking-tight`}>{title}</h3>
        <p className="text-[8px] text-zinc-500 uppercase tracking-widest mt-1 font-bold">{logic}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-center">
          <div className="text-[8px] text-zinc-500 uppercase tracking-widest font-black mb-1">6-Mo Hit Rate</div>
          <div className={`text-2xl font-light ${color}`}>{stats.rel6}%</div>
        </div>
        <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-center">
          <div className="text-[8px] text-zinc-500 uppercase tracking-widest font-black mb-1">Life Hit Rate</div>
          <div className={`text-2xl font-light text-white opacity-80`}>{stats.relLife}%</div>
        </div>
      </div>
      <div className="bg-black/20 rounded-xl p-4 border border-white/5 font-mono text-[10px]">
        <div className="flex justify-between text-zinc-400 mb-2"><span>Avg. IG Reports:</span><span className="text-emerald-400">{stats.avgIG}</span></div>
        {stats.avgForum !== undefined && (
          <div className="flex justify-between text-zinc-400"><span>Avg. Forum Reports:</span><span className="text-amber-400">{stats.avgForum}</span></div>
        )}
      </div>
    </div>
  );
}

function HistoryLedger({ title, data }) {
  return (
    <div className="bg-black/40 border border-white/5 rounded-2xl p-6 flex flex-col h-[400px] shadow-inner">
      <h3 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-4 border-b border-white/5 pb-3">{title}</h3>
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
        {data.map((h, i) => (
          <div key={i} className={`bg-white/[0.02] border ${h.metQuota ? 'border-emerald-500/20' : 'border-red-500/20'} p-4 rounded-xl relative overflow-hidden`}>
            <div className={`absolute top-0 right-0 px-2 py-1 text-[7px] font-black uppercase tracking-tighter rounded-bl-lg ${h.metQuota ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{h.metQuota ? 'MET' : 'MISSED'}</div>
            <div className="text-[10px] text-zinc-400 font-bold font-mono uppercase tracking-widest mb-3">{h.month.substring(3)}</div>
            <div className="space-y-2 font-mono text-[10px]">
              <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-zinc-500">In-Game Reports</span><span className={h.newIG >= h.igTarget ? 'text-emerald-400' : 'text-red-400'}>{h.newIG} <span className="text-zinc-700">/ {h.igTarget}</span></span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-zinc-500">Forum Reports</span><span className={h.newForum >= h.forumTarget ? 'text-amber-400' : 'text-red-400'}>{h.newForum} <span className="text-zinc-700">/ {h.forumTarget}</span></span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Discord Tickets</span><span className="text-indigo-400">{h.newDiscord}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DisciplineLedger({ title, strikes, logs }) {
  return (
    <div className="bg-black/40 border border-white/5 rounded-2xl p-6 flex flex-col h-[200px] shadow-inner mb-6">
      <h3 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-4 border-b border-white/5 pb-3">{title}</h3>
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
        {strikes.map((s, i) => (
          <div key={`s-${i}`} className="bg-red-500/5 border border-red-500/20 p-3 rounded-xl flex items-start gap-3"><div className="text-red-500 text-[8px] mt-1">🔴</div><div><div className="text-[9px] text-red-400/80 font-mono uppercase tracking-widest mb-0.5">{s.month.substring(3)}</div><div className="text-[10px] text-zinc-200">Strike ({s.strike})</div></div></div>
        ))}
        {logs.map((log, i) => (
          <div key={`l-${i}`} className="bg-fuchsia-500/5 border border-fuchsia-500/20 p-3 rounded-xl flex items-start gap-3"><div className="text-fuchsia-500 text-[8px] mt-1">🟣</div><div><div className="text-[9px] text-fuchsia-400/80 font-mono uppercase tracking-widest mb-0.5">{log.timestamp}</div><div className="text-[10px] text-zinc-200 leading-relaxed italic">"{log.note}"</div></div></div>
        ))}
        {strikes.length === 0 && logs.length === 0 && <div className="text-[10px] text-zinc-600 uppercase tracking-widest text-center py-4 opacity-50">Clean Record</div>}
      </div>
    </div>
  );
}

function LOALedger({ title, data }) {
  return (
    <div className="bg-black/40 border border-white/5 rounded-2xl p-6 flex flex-col h-[176px] shadow-inner">
      <h3 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-4 border-b border-white/5 pb-3">{title}</h3>
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
        {data.length > 0 ? data.map((loa, i) => (
          <div key={i} className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-xl flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /><div className="text-[10px] text-zinc-200 font-mono">{loa.startDate} <span className="text-zinc-600 mx-1">→</span> {loa.endDate}</div></div>
        )) : <div className="text-[10px] text-zinc-600 uppercase tracking-widest text-center py-4 opacity-50">No Leaves</div>}
      </div>
    </div>
  );
}