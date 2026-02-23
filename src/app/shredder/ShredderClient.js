"use client";
import { useState } from 'react';
import { commitMonthlyBatch, manageScratchpad } from '../actions';

const normalize = (str) => (str ? str.trim().toLowerCase().replace(/\s+/g, '') : '');

function calculateDays(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (e < s) return 0;
  return Math.ceil(Math.abs(e - s) / (1000 * 60 * 60 * 24)) + 1;
}

export default function ShredderClient({ baselineData, savedPrepText }) {
  const [step, setStep] = useState(1);
  const [prepText, setPrepText] = useState(savedPrepText || "");
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().substring(0, 7)); 
  const [formError, setFormError] = useState("");
  
  const [stagedData, setStagedData] = useState([]);
  const [discordInputs, setDiscordInputs] = useState({});
  const [loaDates, setLoaDates] = useState({}); 
  const [processing, setProcessing] = useState(false);
  const [copiedQuery, setCopiedQuery] = useState(null);

  const handleSaveDraft = async () => {
    setProcessing(true);
    await manageScratchpad('SAVE', prepText);
    setProcessing(false);
  };

  const handleClearText = async () => {
    setPrepText("");
    await manageScratchpad('CLEAR');
  };

  const handleProcessData = async () => {
    setFormError("");
    if (!prepText.trim()) { setFormError("Please paste the flat panel data into the box first."); return; }
    
    await manageScratchpad('SAVE', prepText);
    
    const processingData = baselineData.map(staff => ({
      ...staff,
      currentIG: staff.prevIG, 
      currentForum: Math.max(staff.prevForum, staff.fetchedForumTotal || 0), 
      quizzesAccepted: 0, quizzesRejected: 0
    }));

    const lines = prepText.split('\n');
    const lineRegex = /^([a-zA-Z0-9_ -]+)\t(\d+)\t(\d+)\t([\d,]+)/;

    lines.forEach(line => {
      const match = line.match(lineRegex);
      if (match) {
        const normName = normalize(match[1]);
        const qAcc = parseInt(match[2], 10) || 0;
        const qRej = parseInt(match[3], 10) || 0;
        const totalReports = parseInt(match[4].replace(/,/g, ''), 10) || 0;
        const staffIndex = processingData.findIndex(s => normalize(s.name) === normName);
        if (staffIndex !== -1) {
          processingData[staffIndex].currentIG = totalReports;
          processingData[staffIndex].quizzesAccepted = qAcc;
          processingData[staffIndex].quizzesRejected = qRej;
        }
      }
    });

    const initialDiscord = {};
    const initialLoa = {};
    processingData.forEach(s => {
      initialDiscord[s.name] = s.prevDiscord;
      initialLoa[s.name] = { start: '', end: '' };
    });

    setDiscordInputs(initialDiscord);
    setLoaDates(initialLoa);
    setStagedData(processingData);
    setStep(2);
  };

  const handleDiscordChange = (name, value) => {
    setDiscordInputs({ ...discordInputs, [name]: parseInt(value, 10) || 0 });
  };

  const handleCopyQuery = (query) => {
    if (!query) return;
    navigator.clipboard.writeText(query);
    setCopiedQuery(query);
    setTimeout(() => setCopiedQuery(null), 2000);
  };

  const handleCommitBatch = async () => {
    setProcessing(true);
    const [year, monthNum] = snapshotDate.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parseInt(monthNum, 10) - 1];
    const fullDateStr = `01/${monthName}/${year}`;

    const finalRows = stagedData.map(d => {
      const currentDiscord = discordInputs[d.name] || d.prevDiscord;
      const staffLoa = loaDates[d.name] || { start: '', end: '' };
      return {
        'Date': fullDateStr,
        'Staff Name': d.name,
        'Senior': d.isSenior ? 'TRUE' : 'FALSE',
        'Quizzes Accepted': d.quizzesAccepted,
        'Quizzes Rejected': d.quizzesRejected,
        'Total Reports Completed': d.currentIG,
        'Total Forum Reports': d.currentForum,
        'Total Discord': currentDiscord,
        'New IG Reports': Math.max(0, d.currentIG - d.prevIG),
        'New Forum Reports': Math.max(0, d.currentForum - d.prevForum),
        'New Discord': Math.max(0, currentDiscord - d.prevDiscord),
        'Strike Given': 0,
        'LOA Days': calculateDays(staffLoa.start, staffLoa.end)
      };
    });

    await commitMonthlyBatch(finalRows);
    setProcessing(false);
    setStep(1);
    setPrepText("");
    await manageScratchpad('CLEAR'); 
  };

  return (
    <div className="p-4 md:p-12 max-w-[1400px] mx-auto space-y-10 relative">
      <header className="bg-zinc-900/80 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden group gap-6">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700 group-hover:bg-indigo-500/20" />
        <div className="relative z-10"><h1 className="text-4xl font-light text-white tracking-tight">Prepare Monthly Stats</h1><p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mt-2 font-bold font-mono">Compile & Commit Data Snapshot</p></div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 relative z-10 w-full sm:w-auto bg-black/40 p-3 rounded-2xl border border-white/5 shadow-inner">
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold px-2">Snapshot Month:</label>
          <input type="month" style={{ colorScheme: 'dark' }} className="bg-zinc-800/50 hover:bg-zinc-800 border border-white/5 text-white text-xs font-bold rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors w-full sm:w-auto" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
        </div>
      </header>

      {step === 1 && (
        <div className="bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex justify-between items-end mb-4"><h3 className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black">Paste Admin Panel Output</h3>{savedPrepText && <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest animate-pulse">Draft Recovered</span>}</div>
            <textarea className="w-full h-96 p-6 rounded-2xl bg-black/40 border border-white/5 text-zinc-300 font-mono text-xs outline-none focus:border-indigo-500 transition-all shadow-inner custom-scrollbar mb-4" placeholder="Paste raw flat panel data here..." value={prepText} onChange={(e) => { setPrepText(e.target.value); setFormError(""); }} />
            {formError && (<div className="text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-4 flex items-center gap-3"><span className="text-lg leading-none">⚠</span> {formError}</div>)}
            <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex gap-4 w-full sm:w-auto">
                <button onClick={handleClearText} className="flex-1 sm:flex-none px-6 py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl font-bold text-red-400 uppercase text-[10px] tracking-widest transition-all">Clear Text</button>
                <button onClick={handleSaveDraft} disabled={processing} className="flex-1 sm:flex-none px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-zinc-300 uppercase text-[10px] tracking-widest transition-all">{processing ? 'Saving...' : 'Save Draft'}</button>
              </div>
              <button onClick={handleProcessData} className="w-full sm:w-auto px-10 py-4 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur-md border border-indigo-400/50 rounded-xl font-bold text-white uppercase text-[10px] tracking-widest shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all">Parse & Stage Data</button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-indigo-500/10 border border-indigo-500/20 rounded-[2.5rem] p-8 gap-4 shadow-inner">
            <div><h2 className="text-2xl font-light text-white tracking-tight">Staging Verification</h2><p className="text-[10px] text-indigo-300 uppercase tracking-widest mt-2 font-bold font-mono">Review math and input Discord/LOA metrics.</p></div>
            <button onClick={() => setStep(1)} className="w-full sm:w-auto px-8 py-4 bg-black/40 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold text-zinc-300 uppercase tracking-widest transition-all shadow-md">Cancel & Restart</button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 relative z-10">
            {stagedData.map((staff) => {
              const currentDiscordVal = discordInputs[staff.name] !== undefined ? discordInputs[staff.name] : staff.prevDiscord;
              const staffLoa = loaDates[staff.name] || { start: '', end: '' };
              const computedDays = calculateDays(staffLoa.start, staffLoa.end);

              return (
                <div key={staff.name} className="bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-xl hover:shadow-2xl hover:border-indigo-500/40 transition-all duration-500 flex flex-col group">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-light text-white drop-shadow-md group-hover:text-indigo-300 transition-colors">{staff.name}</h3>
                    <div className={`inline-block px-3 py-1 rounded-md text-[8px] font-bold uppercase tracking-widest ${staff.isSenior ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>{staff.isSenior ? 'Senior Support' : 'Support'}</div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <MathBlock title="In-Game" prev={staff.prevIG} current={staff.currentIG} newAmount={Math.max(0, staff.currentIG - staff.prevIG)} />
                    <MathBlock title="Forum" prev={staff.prevForum} current={staff.currentForum} newAmount={Math.max(0, staff.currentForum - staff.prevForum)} />
                    <MathBlock title="Discord" prev={staff.prevDiscord} current={currentDiscordVal} newAmount={Math.max(0, currentDiscordVal - staff.prevDiscord)} />
                  </div>

                  {/* FIXED FULL WIDTH INPUT PANEL */}
                  <div className="mt-auto grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/30 p-5 rounded-2xl border border-white/5 shadow-inner">
                     <div className="flex flex-col gap-2">
                        <div className="text-[9px] text-amber-500 uppercase tracking-widest font-black">LOA Dates ({computedDays} Days)</div>
                        <div className="flex items-center gap-2">
                           <input type="date" style={{ colorScheme: 'dark' }} className="w-full bg-black/50 border border-amber-500/20 rounded-xl px-3 py-2.5 text-white font-mono text-xs outline-none focus:border-amber-500 transition-colors" value={staffLoa.start} onChange={e => setLoaDates({...loaDates, [staff.name]: {...staffLoa, start: e.target.value}})} />
                           <span className="text-zinc-600 font-bold">-</span>
                           <input type="date" style={{ colorScheme: 'dark' }} className="w-full bg-black/50 border border-amber-500/20 rounded-xl px-3 py-2.5 text-white font-mono text-xs outline-none focus:border-amber-500 transition-colors" value={staffLoa.end} onChange={e => setLoaDates({...loaDates, [staff.name]: {...staffLoa, end: e.target.value}})} />
                        </div>
                     </div>
                     <div className="flex flex-col gap-2">
                        <div className="text-[9px] text-indigo-400 uppercase tracking-widest font-black md:text-right">Lifetime Discord Total</div>
                        <div className="flex items-center gap-3 md:justify-end">
                           <button onClick={() => handleCopyQuery(staff.discordQuery)} className={`px-4 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest border transition-all shadow-sm ${!staff.discordQuery ? 'opacity-30 cursor-not-allowed bg-black/40 border-white/5' : copiedQuery === staff.discordQuery ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30 text-indigo-300'}`}>{copiedQuery === staff.discordQuery ? 'Copied!' : 'Copy Query'}</button>
                           <input type="number" min="0" className="w-24 bg-black/50 border border-indigo-500/20 rounded-xl px-3 py-2.5 text-white font-mono text-sm outline-none focus:border-indigo-400 transition-colors text-center" value={currentDiscordVal} onChange={(e) => handleDiscordChange(staff.name, e.target.value)} />
                        </div>
                     </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-8">
            <button disabled={processing} onClick={handleCommitBatch} className="w-full sm:w-auto px-12 py-5 bg-emerald-600/80 hover:bg-emerald-500 backdrop-blur-md border border-emerald-400/50 rounded-2xl font-bold text-white uppercase text-sm tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all">
              {processing ? 'Writing to Database...' : 'Commit Snapshot to Database'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MathBlock({ title, prev, current, newAmount }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 transition-colors">
      <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-3 text-center font-bold">{title}</div>
      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 mb-1"><span>Prev:</span><span>{prev}</span></div>
      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-200 border-b border-white/5 pb-2 mb-2"><span>Cur:</span><span>{current}</span></div>
      <div className="flex justify-between items-center font-bold text-xs mt-3"><span className="text-[8px] uppercase tracking-widest text-zinc-500">New:</span><span className={newAmount > 0 ? 'text-emerald-400' : 'text-zinc-600'}>+{newAmount}</span></div>
    </div>
  );
}