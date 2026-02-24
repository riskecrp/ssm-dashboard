"use client";
import { useState, useMemo } from 'react';
import { manageTask, logSpokenTo } from '../actions';

function TimeFilter({ mode, setMode, month, setMonth, range, setRange, availableMonths, dropKey, openDropdown, setOpenDropdown }) {
  return (
    <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/5">
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <div onClick={() => setOpenDropdown(openDropdown === `${dropKey}-mode` ? null : `${dropKey}-mode`)} className="bg-zinc-800/50 hover:bg-zinc-800 border border-white/5 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-2">
          <span>{mode}</span><span className="text-[8px] text-zinc-500">▼</span>
        </div>
        {openDropdown === `${dropKey}-mode` && (
          <div className="absolute top-full right-0 mt-1 w-24 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 z-[110]">
            {['Overall', 'Monthly', 'Range'].map(m => (<div key={m} onClick={() => { setMode(m); setOpenDropdown(null); }} className="px-3 py-2 text-[10px] font-bold cursor-pointer transition-colors text-zinc-400 hover:bg-white/5 hover:text-white uppercase">{m}</div>))}
          </div>
        )}
      </div>
      {mode === 'Monthly' && (
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <div onClick={() => setOpenDropdown(openDropdown === `${dropKey}-month` ? null : `${dropKey}-month`)} className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-2">
            <span>{month}</span><span className="text-[8px] text-indigo-400">▼</span>
          </div>
          {openDropdown === `${dropKey}-month` && (
            <div className="absolute top-full right-0 mt-1 w-28 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 max-h-48 overflow-y-auto custom-scrollbar z-[110]">
              {availableMonths.map(m => (<div key={m} onClick={() => { setMonth(m); setOpenDropdown(null); }} className="px-3 py-2 text-[10px] font-bold cursor-pointer transition-colors text-zinc-400 hover:bg-white/5 hover:text-white uppercase">{m}</div>))}
            </div>
          )}
        </div>
      )}
      {mode === 'Range' && (
        <div className="flex items-center gap-1 bg-zinc-800/50 border border-white/5 rounded-lg px-2 py-1">
          <input type="date" style={{ colorScheme: 'dark' }} className="bg-transparent text-indigo-300 text-[9px] font-bold uppercase outline-none w-20" value={range.start} onChange={e => setRange({...range, start: e.target.value})} />
          <span className="text-zinc-600">-</span>
          <input type="date" style={{ colorScheme: 'dark' }} className="bg-transparent text-indigo-300 text-[9px] font-bold uppercase outline-none w-20" value={range.end} onChange={e => setRange({...range, end: e.target.value})} />
        </div>
      )}
    </div>
  );
}

const calculateLoaDays = (monthStr, loas) => {
  if (!loas || !monthStr) return 0;
  const parts = monthStr.split('/');
  if (parts.length !== 3) return 0;
  
  let mYear = parseInt(parts[2], 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let mMonth = months.indexOf(parts[1]);
  if (mMonth === -1) return 0;

  mMonth = mMonth - 1;
  if (mMonth < 0) {
      mMonth = 11;
      mYear -= 1;
  }

  const monthStart = new Date(mYear, mMonth, 1);
  const monthEnd = new Date(mYear, mMonth + 1, 0);

  let days = 0;
  loas.forEach(loa => {
     const sParts = String(loa.startDate).split('-');
     const eParts = String(loa.endDate).split('-');
     if(sParts.length !== 3 || eParts.length !== 3) return;

     const s = new Date(sParts[0], sParts[1]-1, sParts[2]);
     const e = new Date(eParts[0], eParts[1]-1, eParts[2]);

     const overlapStart = s > monthStart ? s : monthStart;
     const overlapEnd = e < monthEnd ? e : monthEnd;
     
     if (overlapStart <= overlapEnd) {
        days += Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
     }
  });
  return days;
};

export default function StatisticsClient({ initialData }) {
  const [openDropdown, setOpenDropdown] = useState(null);
  
  const [lbTimeMode, setLbTimeMode] = useState('Monthly'); 
  const [lbMonth, setLbMonth] = useState('');
  const [lbRange, setLbRange] = useState({ start: '', end: '' });

  const [compTimeMode, setCompTimeMode] = useState('Monthly');
  const [compMonth, setCompMonth] = useState('');
  const [compRange, setCompRange] = useState({ start: '', end: '' });

  const [selectedStaffName, setSelectedStaffName] = useState("");
  const [compareSelected, setCompareSelected] = useState([]);
  const [processing, setProcessing] = useState(null);
  const [exceptionModal, setExceptionModal] = useState({ isOpen: false, name: "", reason: "" });
  const [dismissedEvaluations, setDismissedEvaluations] = useState([]);

  const activeStaff = initialData.filter(s => s.isActive);

  const staffOptions = useMemo(() => {
    return [...initialData].sort((a, b) => {
      if (a.isActive === b.isActive) return a.name.localeCompare(b.name);
      return a.isActive ? -1 : 1;
    });
  }, [initialData]);

  const activeStaffOptions = useMemo(() => {
    return [...initialData].filter(s => s.isActive).sort((a, b) => a.name.localeCompare(b.name));
  }, [initialData]);

  const availableMonths = useMemo(() => {
    const months = new Set();
    initialData.forEach(s => s.history.forEach(h => months.add(h.month)));
    const sorted = Array.from(months).sort((a, b) => new Date(b) - new Date(a));
    if (sorted.length > 0) {
      if (!lbMonth) setLbMonth(sorted[0]);
      if (!compMonth) setCompMonth(sorted[0]);
    }
    return sorted;
  }, [initialData, lbMonth, compMonth]);

  const mostRecentMonth = availableMonths[0];

  const missedQuotaEvaluations = useMemo(() => {
    if (!mostRecentMonth) return [];
    const monthStr = mostRecentMonth.substring(3); 
    
    return activeStaff.map(s => {
       if (dismissedEvaluations.includes(s.name)) return null;

       const h = s.history.find(x => x.month === mostRecentMonth);
       if (!h) return null;
       
       const dynamicLoaDays = calculateLoaDays(mostRecentMonth, s.loas);
       const igTarget = Math.max(0, 30 - dynamicLoaDays);
       const igGraceTarget = Math.max(0, igTarget - 5);
       
       const isSenior = s.rank === 'Senior Support';
       const forumTarget = isSenior ? 5 : 0;

       const missedIG = h.newIG < igGraceTarget;
       const missedForum = isSenior && h.newForum < forumTarget;
       
       if (!missedIG && !missedForum) return null; 
       if (h.strike > 0) return null; 
       
       const hasException = s.spokenToLogs?.some(log => log.note.includes(`METRIC EXCEPTION (${monthStr})`));
       if (hasException) return null; 

       const onlyForumMissed = !missedIG && missedForum;

       return { ...s, monthData: h, igTarget, forumTarget, isSenior, onlyForumMissed, missedIG, missedForum };
    }).filter(Boolean);
  }, [activeStaff, mostRecentMonth, dismissedEvaluations]);

  const handleConfirmStrike = async (staffName, type) => {
    setProcessing(`strike-${staffName}`);
    const desc = type === 'Forum' ? `Missed Forum Quota for ${mostRecentMonth}` : `Missed Metric Quota for ${mostRecentMonth}`;
    await manageTask({ action: 'AddBatch', tasksArray: [{ id: Date.now().toString(), title: `Issue Strike - ${staffName}`, description: desc, target: 'SSM' }] });
    setDismissedEvaluations(prev => [...prev, staffName]); 
    setProcessing(null);
  };

  const submitException = async () => {
    setProcessing('exception');
    const monthStr = mostRecentMonth.substring(3);
    await logSpokenTo({ name: exceptionModal.name, note: `METRIC EXCEPTION (${monthStr}): ${exceptionModal.reason}` });
    setDismissedEvaluations(prev => [...prev, exceptionModal.name]); 
    setProcessing(null);
    setExceptionModal({ isOpen: false, name: "", reason: "" });
  };

  const lifetimeTotals = useMemo(() => {
    return initialData.reduce((acc, staff) => {
      return { ig: acc.ig + staff.lifetimeIG, forum: acc.forum + staff.lifetimeForum, discord: acc.discord + staff.lifetimeDiscord };
    }, { ig: 0, forum: 0, discord: 0 });
  }, [initialData]);

  const staffPerformance = useMemo(() => {
    return activeStaff.map(s => {
      let ig = 0, forum = 0, discord = 0;
      if (lbTimeMode === 'Overall') {
        ig = s.lifetimeIG; forum = s.lifetimeForum; discord = s.lifetimeDiscord;
      } else if (lbTimeMode === 'Monthly') {
        const monthData = s.history.find(h => h.month === lbMonth);
        if (monthData) { ig = monthData.newIG; forum = monthData.newForum; discord = monthData.newDiscord; }
      } else if (lbTimeMode === 'Range') {
        const startMs = new Date(lbRange.start).getTime() || 0;
        const endMs = new Date(lbRange.end).getTime() || Infinity;
        const validHistory = s.history.filter(h => h.timestamp >= startMs && h.timestamp <= endMs);
        ig = validHistory.reduce((sum, h) => sum + h.newIG, 0);
        forum = validHistory.reduce((sum, h) => sum + h.newForum, 0);
        discord = validHistory.reduce((sum, h) => sum + h.newDiscord, 0);
      }
      return { name: s.name, ig, forum, discord, total: ig + forum + discord };
    });
  }, [activeStaff, lbTimeMode, lbMonth, lbRange]);

  const topIG = [...staffPerformance].sort((a, b) => b.ig - a.ig).slice(0, 5).filter(s => s.ig > 0);
  const topForum = [...staffPerformance].sort((a, b) => b.forum - a.forum).slice(0, 5).filter(s => s.forum > 0);
  const topDiscord = [...staffPerformance].sort((a, b) => b.discord - a.discord).slice(0, 5).filter(s => s.discord > 0);

  const selectedStaffData = useMemo(() => {
    const data = initialData.find(s => s.name === selectedStaffName);
    if (!data) return null;
    const isSenior = data.rank === 'Senior Support';
    
    const historyWithQuota = data.history.slice(0, 6).map(h => {
      const dynamicLoaDays = calculateLoaDays(h.month, data.loas);
      const igTarget = Math.max(0, 30 - dynamicLoaDays);
      const igGraceTarget = Math.max(0, igTarget - 5);
      const forumTarget = isSenior ? 5 : 0;
      
      const metIG = h.newIG >= igTarget;
      const graceIG = h.newIG >= igGraceTarget && !metIG;
      
      // Status mathematically ignores Forum. 
      const status = metIG ? 'MET' : graceIG ? 'GRACE' : 'MISSED';
      
      return { ...h, status, igTarget, igGraceTarget, forumTarget, isSenior };
    });
    
    const metCount = historyWithQuota.filter(h => h.status !== 'MISSED').length;
    const reliability = historyWithQuota.length > 0 ? Math.round((metCount / historyWithQuota.length) * 100) : 0;
    const strikes = data.history.filter(h => h.strike > 0);
    return { ...data, historyWithQuota, reliability, metCount, strikes };
  }, [initialData, selectedStaffName]);

  const comparePerformance = useMemo(() => {
    let supportIgSum = 0, supportForumSum = 0, supportDiscordSum = 0, supportMetCount = 0, supportTotalEligible = 0, supportCount = 0;
    let seniorIgSum = 0, seniorForumSum = 0, seniorDiscordSum = 0, seniorMetCount = 0, seniorTotalEligible = 0, seniorCount = 0;

    const individuals = initialData.map(s => {
      let ig = 0, forum = 0, discord = 0, metCount = 0, totalEligible = 0;
      
      const calculateStatus = (h) => {
         const dynamicLoaDays = calculateLoaDays(h.month, s.loas);
         const igTarget = Math.max(0, 30 - dynamicLoaDays);
         const igGraceTarget = Math.max(0, igTarget - 5);
         const metIG = h.newIG >= igTarget;
         const graceIG = h.newIG >= igGraceTarget && !metIG;
         return metIG || graceIG; // True if Reliable based purely on IG
      };

      if (compTimeMode === 'Overall') {
        ig = s.lifetimeIG; forum = s.lifetimeForum; discord = s.lifetimeDiscord;
        s.history.forEach(h => {
           totalEligible++;
           if (calculateStatus(h)) metCount++;
        });
      } else if (compTimeMode === 'Monthly') {
        const h = s.history.find(x => x.month === compMonth);
        if (h) { 
           ig = h.newIG; forum = h.newForum; discord = h.newDiscord; 
           totalEligible = 1;
           if (calculateStatus(h)) metCount = 1;
        }
      } else if (compTimeMode === 'Range') {
        const startMs = new Date(compRange.start).getTime() || 0;
        const endMs = new Date(compRange.end).getTime() || Infinity;
        const validHistory = s.history.filter(h => h.timestamp >= startMs && h.timestamp <= endMs);
        validHistory.forEach(h => {
           ig += h.newIG; forum += h.newForum; discord += h.newDiscord;
           totalEligible++;
           if (calculateStatus(h)) metCount++;
        });
      }

      if (s.rank === 'Senior Support') {
          seniorIgSum += ig; seniorForumSum += forum; seniorDiscordSum += discord; seniorCount++;
          seniorMetCount += metCount; seniorTotalEligible += totalEligible;
      } else {
          supportIgSum += ig; supportForumSum += forum; supportDiscordSum += discord; supportCount++;
          supportMetCount += metCount; supportTotalEligible += totalEligible;
      }

      const reliability = totalEligible > 0 ? Math.round((metCount / totalEligible) * 100) : 0;
      return { name: s.name, ig, forum, discord, reliability, rank: s.rank };
    });

    individuals.push({
        name: '[Group] All Support', rank: 'Support', isGroup: true,
        ig: supportCount ? Math.round(supportIgSum / supportCount) : 0,
        forum: supportCount ? Math.round(supportForumSum / supportCount) : 0,
        discord: supportCount ? Math.round(supportDiscordSum / supportCount) : 0,
        reliability: supportTotalEligible ? Math.round((supportMetCount / supportTotalEligible) * 100) : 0
    });
    
    individuals.push({
        name: '[Group] All Senior Support', rank: 'Senior Support', isGroup: true,
        ig: seniorCount ? Math.round(seniorIgSum / seniorCount) : 0,
        forum: seniorCount ? Math.round(seniorForumSum / seniorCount) : 0,
        discord: seniorCount ? Math.round(seniorDiscordSum / seniorCount) : 0,
        reliability: seniorTotalEligible ? Math.round((seniorMetCount / seniorTotalEligible) * 100) : 0
    });

    return individuals;
  }, [initialData, compTimeMode, compMonth, compRange]);

  const toggleCompare = (name) => {
    if (name === '[Group] All Support') {
       const supportNames = activeStaffOptions.filter(s => s.rank === 'Support').map(s => s.name);
       const allSelected = supportNames.every(n => compareSelected.includes(n));
       if (allSelected) { setCompareSelected(prev => prev.filter(n => !supportNames.includes(n))); } 
       else { setCompareSelected(prev => Array.from(new Set([...prev, ...supportNames]))); }
       return;
    }
    if (name === '[Group] All Senior Support') {
       const seniorNames = activeStaffOptions.filter(s => s.rank === 'Senior Support').map(s => s.name);
       const allSelected = seniorNames.every(n => compareSelected.includes(n));
       if (allSelected) { setCompareSelected(prev => prev.filter(n => !seniorNames.includes(n))); } 
       else { setCompareSelected(prev => Array.from(new Set([...prev, ...seniorNames]))); }
       return;
    }
    if (compareSelected.includes(name)) setCompareSelected(prev => prev.filter(n => n !== name));
    else setCompareSelected(prev => [...prev, name]);
  };

  const comparisonData = compareSelected.map(name => comparePerformance.find(s => s.name === name)).filter(Boolean);
  const isAllSupportSelected = activeStaffOptions.filter(s => s.rank === 'Support').length > 0 && activeStaffOptions.filter(s => s.rank === 'Support').every(s => compareSelected.includes(s.name));
  const isAllSeniorSelected = activeStaffOptions.filter(s => s.rank === 'Senior Support').length > 0 && activeStaffOptions.filter(s => s.rank === 'Senior Support').every(s => compareSelected.includes(s.name));

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-[1600px] mx-auto space-y-10 relative min-h-screen" onClick={() => setOpenDropdown(null)}>
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-indigo-500/5 rounded-full blur-[100px]" />
      </div>

      <header className="relative z-[100] bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-light text-white tracking-tight">Performance Statistics</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mt-2 font-bold font-mono">Network Intelligence Hub</p>
        </div>
      </header>

      <div className="flex flex-col space-y-8 relative z-50">
        
        {mostRecentMonth && missedQuotaEvaluations.length > 0 && (
          <section className="bg-red-950/20 backdrop-blur-3xl border border-red-500/30 rounded-[2rem] p-6 shadow-[0_20px_50px_rgba(239,68,68,0.1)]">
            <div className="flex items-center gap-3 mb-4 border-b border-red-500/20 pb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse" />
              <h2 className="text-sm font-bold text-red-100 uppercase tracking-widest">Metric Evaluator: {mostRecentMonth}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {missedQuotaEvaluations.map(s => {
                const isAmber = s.onlyForumMissed;
                return (
                  <div key={s.name} className={`bg-black/50 border rounded-xl p-4 flex flex-col gap-3 group transition-colors ${isAmber ? 'border-amber-500/30 hover:border-amber-500/60' : 'border-red-500/20 hover:border-red-500/50'}`}>
                    <div className="flex justify-between items-center">
                      <span className={`font-bold text-sm ${isAmber ? 'text-amber-100' : 'text-white'}`}>{s.name}</span>
                      <span className={`text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${isAmber ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>{s.isSenior ? 'Senior' : 'Support'}</span>
                    </div>
                    <div className={`flex justify-between text-[10px] font-mono p-2 rounded-lg ${isAmber ? 'bg-amber-900/20 text-amber-400/70' : 'bg-white/5 text-zinc-400'}`}>
                      <span>IG: <span className={s.missedIG ? 'text-red-400 font-bold' : isAmber ? 'text-amber-400 font-bold' : 'text-zinc-400'}>{s.monthData.newIG}</span> / {s.igTarget}</span>
                      {s.isSenior && (
                        <span>FR: <span className={s.missedForum ? (isAmber ? 'text-amber-500 font-bold' : 'text-red-400 font-bold') : 'text-zinc-400'}>{s.monthData.newForum}</span> / {s.forumTarget}</span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-1">
                      <button disabled={processing === `strike-${s.name}`} onClick={() => handleConfirmStrike(s.name, isAmber ? 'Forum' : 'Metric')} className={`flex-1 py-2 rounded-lg text-[9px] font-bold text-white uppercase tracking-widest transition-all shadow-md ${isAmber ? 'bg-amber-600/60 hover:bg-amber-500' : 'bg-red-600/80 hover:bg-red-500'}`}>{processing === `strike-${s.name}` ? '...' : 'Strike Task'}</button>
                      {isAmber ? (
                        <button onClick={() => setDismissedEvaluations(prev => [...prev, s.name])} className="flex-1 py-2 bg-black/40 hover:bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold text-zinc-400 hover:text-white uppercase tracking-widest transition-all">Dismiss</button>
                      ) : (
                        <button onClick={() => setExceptionModal({ isOpen: true, name: s.name, reason: "" })} className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-bold text-zinc-300 uppercase tracking-widest transition-all">Exception</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-xl">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-6 border-b border-white/5 pb-4">
             <h2 className="text-2xl font-light text-white tracking-tight">Network Leaderboards</h2>
             <TimeFilter mode={lbTimeMode} setMode={setLbTimeMode} month={lbMonth} setMonth={setLbMonth} range={lbRange} setRange={setLbRange} availableMonths={availableMonths} dropKey="lb" openDropdown={openDropdown} setOpenDropdown={setOpenDropdown} />
           </div>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
             <LeaderboardColumn title="In-Game Reports" data={topIG} color="text-emerald-400" field="ig" />
             <LeaderboardColumn title="Forum Reports" data={topForum} color="text-amber-400" field="forum" />
             <LeaderboardColumn title="Discord Tickets" data={topDiscord} color="text-indigo-400" field="discord" />
           </div>
        </section>
      </div>

      <section className="relative z-40 bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-xl flex flex-col">
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
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

      <section className="relative z-30 bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-10 shadow-xl">
         <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-8 border-b border-white/5 pb-6">
            <div>
               <h2 className="text-3xl font-light text-white tracking-tight">Custom Comparison</h2>
               <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2 font-bold font-mono">1-to-1 Data Grid</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <TimeFilter mode={compTimeMode} setMode={setCompTimeMode} month={compMonth} setMonth={setCompMonth} range={compRange} setRange={setCompRange} availableMonths={availableMonths} dropKey="comp" openDropdown={openDropdown} setOpenDropdown={setOpenDropdown} />
              <div className="relative w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
                <div onClick={() => setOpenDropdown(openDropdown === 'compareSelect' ? null : 'compareSelect')} className="bg-black/40 border border-white/10 text-white text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer flex items-center justify-between min-w-[220px] hover:border-indigo-500/50">
                  <span>Add Staff to Compare...</span><span className="text-[8px] text-zinc-500 ml-3">▼</span>
                </div>
                {openDropdown === 'compareSelect' && (
                  <div className="absolute top-full right-0 mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 py-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                    <div onClick={() => toggleCompare('[Group] All Support')} className={`px-5 py-3 text-xs font-bold cursor-pointer transition-colors flex justify-between items-center ${isAllSupportSelected ? 'bg-indigo-500/20 text-white' : 'text-amber-400 hover:bg-white/5 hover:text-white'}`}>
                      <span>[Group] All Support</span>
                      {isAllSupportSelected && <span className="text-[8px] uppercase tracking-widest text-indigo-400 font-black">Selected</span>}
                    </div>
                    <div onClick={() => toggleCompare('[Group] All Senior Support')} className={`px-5 py-3 text-xs font-bold cursor-pointer transition-colors flex justify-between items-center ${isAllSeniorSelected ? 'bg-indigo-500/20 text-white' : 'text-amber-400 hover:bg-white/5 hover:text-white'}`}>
                      <span>[Group] All Senior Support</span>
                      {isAllSeniorSelected && <span className="text-[8px] uppercase tracking-widest text-indigo-400 font-black">Selected</span>}
                    </div>
                    <div className="border-t border-zinc-700 my-1" />
                    {activeStaffOptions.map(s => (
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
           <div className="bg-black/30 border border-white/5 rounded-3xl p-2 sm:p-6 shadow-inner overflow-hidden">
             <div className="overflow-x-auto custom-scrollbar">
               <table className="w-full text-left border-collapse min-w-[800px]">
                 <thead>
                   <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                     <th className="p-4 pl-6">Personnel</th>
                     <th className="p-4 text-center">In-Game</th>
                     <th className="p-4 text-center">Forum</th>
                     <th className="p-4 text-center">Discord</th>
                     <th className="p-4 text-center">Reliability</th>
                     <th className="p-4 pr-6 text-right">Action</th>
                   </tr>
                 </thead>
                 <tbody className="text-sm">
                   {comparisonData.map((staff, i) => (
                     <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors group">
                       <td className="p-4 pl-6 flex flex-col justify-center">
                         <div className="font-light tracking-tight text-white text-base">{staff.name}</div>
                         <div className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest mt-1 w-max ${staff.rank === 'Senior Support' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-zinc-400'}`}>{staff.rank}</div>
                       </td>
                       <td className="p-4 text-center font-mono text-emerald-400 font-bold">{staff.ig}</td>
                       <td className="p-4 text-center font-mono text-amber-400 font-bold">{staff.rank === 'Senior Support' ? staff.forum : '-'}</td>
                       <td className="p-4 text-center font-mono text-indigo-400 font-bold">{staff.discord}</td>
                       <td className="p-4 text-center">
                         <div className={`inline-flex items-center justify-center px-3 py-1 rounded-lg text-xs font-black ${staff.reliability >= 80 ? 'bg-emerald-500/10 text-emerald-400' : staff.reliability >= 50 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                           {staff.reliability}%
                         </div>
                       </td>
                       <td className="p-4 pr-6 text-right">
                         <button onClick={() => toggleCompare(staff.name)} className="text-zinc-600 hover:text-red-400 transition-colors font-bold text-lg opacity-0 group-hover:opacity-100">✕</button>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
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

function HistoryLedger({ title, data }) {
  return (
    <div className="bg-black/40 border border-white/5 rounded-2xl p-6 flex flex-col h-[400px] shadow-inner">
      <h3 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mb-4 border-b border-white/5 pb-3">{title}</h3>
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
        {data.map((h, i) => {
          // Badges completely ignore Forum status now. Only IG matters.
          const badgeClass = h.status === 'MET' ? 'bg-emerald-500/20 text-emerald-400' : h.status === 'GRACE' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400';
          const borderClass = h.status === 'MET' ? 'border-emerald-500/20' : h.status === 'GRACE' ? 'border-yellow-500/20' : 'border-red-500/20';
          const igClass = h.newIG >= h.igTarget ? 'text-emerald-400 font-bold' : h.newIG >= h.igGraceTarget ? 'text-yellow-400 font-bold' : 'text-red-400 font-bold';
          
          return (
            <div key={i} className={`bg-white/[0.02] border ${borderClass} p-4 rounded-xl relative overflow-hidden`}>
              <div className={`absolute top-0 right-0 px-2 py-1 text-[7px] font-black uppercase tracking-tighter rounded-bl-lg ${badgeClass}`}>{h.status}</div>
              <div className="text-[10px] text-zinc-400 font-bold font-mono uppercase tracking-widest mb-3">{h.month.substring(3)}</div>
              <div className="space-y-2 font-mono text-[10px]">
                <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-zinc-500">In-Game Reports</span><span className={igClass}>{h.newIG} <span className="text-zinc-700 font-normal">/ {h.igTarget}</span></span></div>
                {h.isSenior && (
                  <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-zinc-500">Forum Reports</span><span className={h.newForum >= h.forumTarget ? 'text-amber-400 font-bold' : 'text-red-400 font-bold'}>{h.newForum} <span className="text-zinc-700 font-normal">/ {h.forumTarget}</span></span></div>
                )}
                <div className="flex justify-between"><span className="text-zinc-500">Discord Tickets</span><span className="text-indigo-400 font-bold">{h.newDiscord}</span></div>
              </div>
            </div>
          );
        })}
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
          <div key={`s-${i}`} className="bg-red-500/5 border border-red-500/20 p-3 rounded-xl flex items-start gap-3"><div className="text-red-500 text-[8px] mt-1">🔴</div><div><div className="text-[9px] text-red-400/80 font-mono uppercase tracking-widest mb-0.5">{s.month.substring(3)}</div><div className="text-[10px] text-zinc-200">Strike Issued</div></div></div>
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
