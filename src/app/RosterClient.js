"use client";
import { useState, useMemo } from 'react';
import { manageStaffRecord, manageLOA, logSpokenTo } from './actions';

const parseSafeDate = (dateStr) => {
  if (!dateStr || dateStr === 'N/A') return 0;
  let d = new Date(dateStr.replace(/\//g, ' '));
  if (!isNaN(d.getTime())) return d.getTime();
  const parts = String(dateStr).split(/[-/]/);
  if (parts.length >= 3) {
      d = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
      if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0; 
};

export default function RosterClient({ initialData, managementData }) {
  const [viewMode, setViewMode] = useState('Active'); 
  const [roleFilter, setRoleFilter] = useState("All"); 
  const [searchQuery, setSearchQuery] = useState("");
  const [openDropdown, setOpenDropdown] = useState(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editModal, setEditModal] = useState({ isOpen: false, oldName: "", newName: "", discordId: "", forumLink: "", isManagement: false });
  const [loaModal, setLoaModal] = useState({ isOpen: false, name: "", startDate: "", endDate: "", history: [] });
  const [reinstateModal, setReinstateModal] = useState({ isOpen: false, name: "", role: "Support" });
  const [removeModal, setRemoveModal] = useState({ isOpen: false, name: "", rank: "", reason: "Resignation", isManagement: false });

  const [createLogModal, setCreateLogModal] = useState({ isOpen: false, name: "", note: "" });
  const [viewLogsModal, setViewLogsModal] = useState({ isOpen: false, name: "", logs: [] });

  const [selectedStaffStats, setSelectedStaffStats] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [formState, setFormState] = useState({ name: "", role: "Support", discordId: "", forumLink: "" });

  const displayedRoster = viewMode === 'Management' ? managementData : initialData.filter(staff => {
    if (viewMode === 'Active' && !staff.isActive) return false;
    if (viewMode === 'Inactive' && staff.isActive) return false;
    if (roleFilter !== "All" && staff.rank !== roleFilter) return false;
    if (searchQuery && !staff.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  
  const activeCount = displayedRoster.length; 

  const timelineEvents = useMemo(() => {
    if (!selectedStaffStats || selectedStaffStats.isManagement) return [];
    let events = [];

    (selectedStaffStats.history || []).forEach(h => {
        events.push({ id: `stat-${h.month}`, type: 'stats', dateStr: h.month, dateObj: parseSafeDate(h.month), stats: h });
        if (h.strike > 0) events.push({ id: `strike-${h.month}`, type: 'strike', dateStr: h.month, dateObj: parseSafeDate(h.month) + 1, action: `Strike Issued` });
    });

    (selectedStaffStats.spokenToLogs || []).forEach((log, i) => {
        let isException = log.note.startsWith('METRIC EXCEPTION');
        events.push({ 
            id: `log-${i}-${log.timestamp}`, 
            type: 'spoken_to', 
            dateStr: log.timestamp, 
            dateObj: parseSafeDate(log.timestamp), 
            action: isException ? 'METRIC EXCEPTION' : 'Spoken To', 
            note: isException ? log.note.replace('METRIC EXCEPTION:', '').trim() : log.note 
        });
    });

    (selectedStaffStats.lifecycle || []).forEach((l, i) => {
        if (l.action.includes('Spoken To Log') || l.action.includes('METRIC EXCEPTION')) return; 
        events.push({ id: `lc-${i}-${l.date}`, type: 'event', dateStr: l.date, dateObj: parseSafeDate(l.date), action: l.action });
    });

    return events.sort((a, b) => b.dateObj - a.dateObj);
  }, [selectedStaffStats]);

  const handleAction = async (name, action, currentRank) => {
    setProcessing(name);
    let roleToPass = currentRank;
    if (action === 'Promote') roleToPass = 'Senior';
    if (action === 'Demote') roleToPass = 'Support';
    await manageStaffRecord({ name, action, role: roleToPass, isManagement: false });
    setProcessing(null);
  };

  const submitRemove = async () => {
    setProcessing('removing');
    await manageStaffRecord({ name: removeModal.name, action: 'Remove', role: removeModal.rank, reason: removeModal.reason, isManagement: removeModal.isManagement });
    setProcessing(null);
    setRemoveModal({ isOpen: false, name: "", rank: "", reason: "Resignation", isManagement: false });
  };

  const handleReinstate = async () => {
    setProcessing('reinstate');
    await manageStaffRecord({ name: reinstateModal.name, action: 'Reinstate', role: reinstateModal.role, isManagement: false });
    setProcessing(null);
    setReinstateModal({ isOpen: false, name: "", role: "Support" });
  };

  const handleEditProfile = async () => {
    if (!editModal.oldName) return;
    setProcessing('editing');
    await manageStaffRecord({ name: editModal.oldName, action: 'EditProfile', newName: editModal.newName, discordId: editModal.discordId, forumLink: editModal.forumLink, isManagement: editModal.isManagement });
    setProcessing(null);
    setEditModal({ isOpen: false, oldName: "", newName: "", discordId: "", forumLink: "", isManagement: false });
  };

  const handleAddStaff = async () => {
    setProcessing('adding');
    await manageStaffRecord({ ...formState, action: 'Add', isManagement: viewMode === 'Management' });
    setProcessing(null);
    setIsAddModalOpen(false);
  };

  const handleLOASubmit = async () => {
    if (!loaModal.startDate || !loaModal.endDate) return;
    setProcessing('loa');
    await manageLOA({ name: loaModal.name, startDate: loaModal.startDate, endDate: loaModal.endDate, action: 'Add' });
    setProcessing(null);
    setLoaModal({ isOpen: false, name: "", startDate: "", endDate: "", history: [] });
  };

  const handleDeleteLOA = async (oldStart, oldEnd) => {
    setProcessing('loa');
    await manageLOA({ name: loaModal.name, oldStart, oldEnd, action: 'Delete' });
    setProcessing(null);
    setLoaModal(prev => ({ ...prev, history: prev.history.filter(h => h.startDate !== oldStart || h.endDate !== oldEnd) }));
  };

  const handleCreateLog = async () => {
    if (!createLogModal.note.trim()) return;
    setProcessing('logging');
    await logSpokenTo({ name: createLogModal.name, note: createLogModal.note.trim() });
    setProcessing(null);
    setCreateLogModal({ isOpen: false, name: "", note: "" });
  };

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-[1600px] mx-auto space-y-8 relative" onClick={() => setOpenDropdown(null)}>
      
      <header style={{ zIndex: 100 }} className="bg-zinc-900/80 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col xl:flex-row xl:items-center justify-between shadow-[0_0_40px_rgba(0,0,0,0.5)] relative group gap-6">
        <div className="absolute inset-0 overflow-hidden rounded-3xl z-0 pointer-events-none">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] transition-all duration-700 group-hover:bg-indigo-500/20" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6 w-full xl:w-auto">
          <div className="flex flex-wrap bg-black/40 p-1 rounded-2xl border border-white/5 shadow-inner w-full md:w-auto gap-1">
            <button onClick={() => setViewMode('Active')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all ${viewMode === 'Active' ? 'bg-indigo-600/80 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}>Active</button>
            <button onClick={() => setViewMode('Inactive')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all ${viewMode === 'Inactive' ? 'bg-zinc-700 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}>Inactive</button>
            <button onClick={() => setViewMode('Management')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all ${viewMode === 'Management' ? 'bg-amber-600/80 text-white shadow-[0_0_15px_rgba(217,119,6,0.4)]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}>Management</button>
          </div>
          
          {viewMode !== 'Management' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
                <div onClick={() => setOpenDropdown(openDropdown === 'roleFilter' ? null : 'roleFilter')} className={`bg-black/40 border text-white text-xs font-bold rounded-xl px-5 py-3 cursor-pointer shadow-inner flex items-center justify-between min-w-[160px] transition-all ${openDropdown === 'roleFilter' ? 'border-indigo-500' : 'border-white/10 hover:border-white/20'}`}>
                  <span>{roleFilter === 'All' ? 'All Personnel' : roleFilter === 'Support' ? 'Support Only' : 'Senior Support Only'}</span><span className="text-[9px] text-zinc-500 ml-3">▼</span>
                </div>
                {openDropdown === 'roleFilter' && (
                  <div className="absolute top-full left-0 mt-2 w-full bg-zinc-800 border border-zinc-600 rounded-2xl shadow-2xl py-2 z-[110]">
                    {['All', 'Support', 'Senior Support'].map(role => (
                      <div key={role} onClick={() => { setRoleFilter(role); setOpenDropdown(null); }} className={`px-5 py-3 text-xs font-bold cursor-pointer transition-colors ${roleFilter === role ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>{role === 'All' ? 'All Personnel' : role}</div>
                    ))}
                  </div>
                )}
              </div>
              <input type="text" placeholder="Search Staff..." className="bg-black/40 border border-white/10 text-white text-xs font-bold rounded-xl px-5 py-3 outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-600 w-full sm:w-auto shadow-inner" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          )}
        </div>
        
        <div className="flex gap-4 items-center relative z-10 w-full xl:w-auto justify-between xl:justify-end mt-4 xl:mt-0">
          <div className="text-[10px] text-zinc-400 font-mono bg-black/40 border border-white/5 px-4 py-3 rounded-xl shadow-inner whitespace-nowrap">
            <span className="text-indigo-400 font-bold text-sm mr-2">{activeCount}</span> TOTAL
          </div>
          <button onClick={() => setIsAddModalOpen(true)} className="px-6 py-3 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur-md border border-indigo-400/50 rounded-xl text-xs font-bold text-white uppercase tracking-widest shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all whitespace-nowrap">+ Add Personnel</button>
        </div>
      </header>

      <div style={{ zIndex: 10 }} className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative">
        {displayedRoster.map((staff) => {
          const isSenior = staff.rank === 'Senior Support';
          
          const cardLifecycle = staff.isManagement ? [] : [
            ...(staff.lifecycle || []).filter(l => !l.action.includes('Spoken To Log') && !l.action.includes('METRIC EXCEPTION')), 
            ...(staff.spokenToLogs || []).map(log => ({ date: log.timestamp, action: log.note.startsWith('METRIC EXCEPTION') ? 'METRIC EXCEPTION' : 'Spoken To Log' }))
          ].sort((a, b) => parseSafeDate(b.date) - parseSafeDate(a.date));

          return (
            <div key={staff.name} onClick={() => !staff.isManagement && setSelectedStaffStats(staff)} className={`relative ${!staff.isManagement && 'cursor-pointer hover:-translate-y-2 hover:shadow-[0_20px_80px_rgba(79,70,229,0.3)]'} bg-zinc-900/80 backdrop-blur-2xl border ${staff.isManagement ? 'border-amber-500/20' : viewMode === 'Active' ? 'border-white/10 hover:border-indigo-500/40' : 'border-red-900/30 hover:border-red-500/30'} rounded-[2rem] overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.6)] transition-all duration-500 group flex flex-col`}>
              
              <div className="absolute inset-0 overflow-hidden rounded-[2rem] z-0 pointer-events-none">
                <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-[80px] transition-all duration-700 ${staff.isManagement ? 'bg-amber-500/10' : viewMode === 'Active' ? 'bg-indigo-500/20 group-hover:bg-indigo-500/30' : 'bg-red-500/10'}`} />
                <div className={`absolute -bottom-24 -left-24 w-64 h-64 rounded-full blur-[80px] transition-all duration-700 ${staff.isManagement ? 'bg-amber-500/5' : viewMode === 'Active' ? 'bg-indigo-500/10' : 'bg-red-500/5'}`} />
              </div>

              <div className="p-8 flex-1 flex flex-col relative z-10">
                <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4">
                  <div>
                    <h2 className={`text-3xl font-light text-white drop-shadow-md transition-colors ${!staff.isManagement && 'group-hover:text-indigo-300'}`}>{staff.name}</h2>
                    <div className="flex gap-2 items-center mt-3 flex-wrap">
                        {staff.isManagement ? (
                           <div className="inline-block px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]">SSM</div>
                        ) : (
                           <div className={`inline-block px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest ${viewMode !== 'Active' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : isSenior ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>
                              {viewMode === 'Active' ? staff.rank : 'INACTIVE'}
                           </div>
                        )}
                        {staff.pendingStrike && viewMode === 'Active' && <div className="inline-block px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest bg-red-500/20 text-red-300 border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse">Pending Strike</div>}
                        {staff.pendingTasks > 0 && <div className="inline-block px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse">{staff.pendingTasks} Pending Tasks</div>}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 opacity-100 sm:opacity-50 sm:group-hover:opacity-100 transition-opacity flex-wrap justify-start sm:justify-end">
                    <button disabled={processing === staff.name} onClick={(e) => { e.stopPropagation(); setEditModal({ isOpen: true, oldName: staff.name, newName: staff.name, discordId: staff.discordId, forumLink: staff.forumLink, isManagement: staff.isManagement }); }} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-300 transition-colors shadow-sm">Edit Profile</button>
                    {staff.isManagement && (
                      <button disabled={processing === staff.name} onClick={(e) => { e.stopPropagation(); setRemoveModal({ isOpen: true, name: staff.name, rank: 'SSM', reason: "Removal", isManagement: true }); }} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/30 border border-red-500/20 rounded-lg text-[9px] font-bold uppercase tracking-widest text-red-300 transition-colors">Remove</button>
                    )}
                    {!staff.isManagement && viewMode === 'Active' && (
                      <>
                        <button disabled={processing === staff.name} onClick={(e) => { e.stopPropagation(); setCreateLogModal({ isOpen: true, name: staff.name, note: "" }); }} className="px-3 py-1.5 bg-fuchsia-500/10 hover:bg-fuchsia-500/30 border border-fuchsia-500/20 rounded-lg text-[9px] font-bold uppercase tracking-widest text-fuchsia-300 transition-colors">Log Spoken To</button>
                        <button disabled={processing === staff.name} onClick={(e) => { e.stopPropagation(); setLoaModal({ isOpen: true, name: staff.name, startDate: "", endDate: "", history: staff.loas }); }} className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/30 border border-amber-500/20 rounded-lg text-[9px] font-bold uppercase tracking-widest text-amber-300 transition-colors">Manage LOA</button>
                        {isSenior ? (
                          <button disabled={processing === staff.name} onClick={(e) => { e.stopPropagation(); handleAction(staff.name, 'Demote', staff.rank); }} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-300 transition-colors">Demote</button>
                        ) : (
                          <button disabled={processing === staff.name} onClick={(e) => { e.stopPropagation(); handleAction(staff.name, 'Promote', staff.rank); }} className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/30 rounded-lg text-[9px] font-bold uppercase tracking-widest text-indigo-200 transition-colors">Promote</button>
                        )}
                        <button disabled={processing === staff.name} onClick={(e) => { e.stopPropagation(); setRemoveModal({ isOpen: true, name: staff.name, rank: staff.rank, reason: "Resignation", isManagement: false }); }} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/30 border border-red-500/20 rounded-lg text-[9px] font-bold uppercase tracking-widest text-red-300 transition-colors">Remove</button>
                      </>
                    )}
                    {!staff.isManagement && viewMode === 'Inactive' && (
                      <button disabled={processing === staff.name} onClick={(e) => { e.stopPropagation(); setReinstateModal({ isOpen: true, name: staff.name, role: 'Support' }); }} className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/30 rounded-lg text-[9px] font-bold uppercase tracking-widest text-emerald-300 transition-colors">Reinstate</button>
                    )}
                  </div>
                </div>

                <div className="mb-6 mt-2">
                  <div className="text-[11px] text-zinc-400 space-y-2">
                    <div className="flex items-center gap-3"><span className="uppercase tracking-widest text-zinc-500 font-bold">Discord:</span><span className="text-zinc-200 font-mono">{staff.discordName}</span></div>
                    <div className="flex items-center gap-3"><span className="uppercase tracking-widest text-zinc-500 font-bold">Forums:</span>{staff.forumLink ? <a href={staff.forumLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-indigo-400 hover:text-indigo-300 underline transition-colors">View Profile ↗</a> : <span className="text-zinc-600">N/A</span>}</div>
                  </div>
                </div>

                {!staff.isManagement && (
                  <>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 text-sm mb-8 border-t border-white/5 pt-6">
                      <StatBox label="3-Mo Strikes" value={staff.strikes3Mo} alert={viewMode === 'Active' && staff.strikes3Mo > 0} />
                      <StatBox label="Total Strikes" value={staff.totalStrikes} alert={viewMode === 'Active' && staff.totalStrikes >= 3} />
                      <div><div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-bold">Active LOA</div><div className={`font-medium text-xs ${staff.activeLOA ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-zinc-200'}`}>{staff.activeLOA ? `Until ${staff.loaEnd}` : 'No'}</div></div>
                      <StatBox label={viewMode === 'Active' ? "Join Date" : "Last Seen"} value={viewMode === 'Active' ? (staff.firstSeen || 'N/A') : (staff.latestSeen || 'N/A')} />
                    </div>
                    <div className="mt-auto grid grid-cols-1 xl:grid-cols-2 gap-6 border-t border-white/10 pt-6">
                      <div>
                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Lifetime Volume</h3>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-black/30 rounded-xl p-3 border border-white/5 shadow-inner"><div className="text-xl font-light text-white">{staff.lifetimeIG}</div><div className="text-[8px] text-zinc-500 uppercase tracking-widest mt-1">IG</div></div>
                          <div className="bg-black/30 rounded-xl p-3 border border-white/5 shadow-inner"><div className="text-xl font-light text-white">{staff.lifetimeForum}</div><div className="text-[8px] text-zinc-500 uppercase tracking-widest mt-1">Forum</div></div>
                          <div className="bg-indigo-500/10 rounded-xl p-3 border border-indigo-500/20 shadow-inner"><div className="text-xl font-light text-indigo-300">{staff.lifetimeDiscord}</div><div className="text-[8px] text-indigo-400/50 uppercase tracking-widest mt-1">Discord</div></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-end mb-3 border-b border-white/5 pb-2">
                          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Lifecycle History</h3>
                          {staff.spokenToLogs && staff.spokenToLogs.length > 0 && (
                            <button onClick={(e) => { e.stopPropagation(); setViewLogsModal({ isOpen: true, name: staff.name, logs: staff.spokenToLogs }); }} className="text-[9px] font-bold uppercase tracking-widest text-fuchsia-400 hover:text-fuchsia-300 bg-fuchsia-500/10 px-2.5 py-1.5 rounded-lg border border-fuchsia-500/20 transition-colors">Logs ({staff.spokenToLogs.length})</button>
                          )}
                        </div>
                        <div className="bg-black/30 rounded-xl p-4 border border-white/5 h-28 overflow-y-auto space-y-3 custom-scrollbar shadow-inner">
                          {cardLifecycle.length > 0 ? cardLifecycle.map((event, idx) => (
                            <div key={idx} className="flex flex-col gap-1">
                              <span className="text-[10px] text-zinc-500 font-mono tracking-widest">{event.date}</span>
                              <span className={`text-[10px] uppercase font-bold tracking-wider ${event.action.includes('METRIC EXCEPTION') || event.action.includes('Spoken To Log') ? 'text-fuchsia-400' : event.action.includes('Promote') || event.action.includes('Reinstate') ? 'text-emerald-400' : event.action.includes('REMOVED') ? 'text-red-400' : 'text-zinc-300'}`}>{event.action}</span>
                            </div>
                          )) : <div className="text-xs text-zinc-600 italic text-center mt-6">No logged events</div>}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ALL MODALS */}
      {selectedStaffStats && !selectedStaffStats.isManagement && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setSelectedStaffStats(null)}>
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-xl shadow-[0_0_60px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh] relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="mb-8 border-b border-white/5 pb-6 relative z-10">
              <h3 className="text-3xl font-light text-white tracking-tight">{selectedStaffStats.name}</h3>
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1 font-bold">Staff History & Timeline</p>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 relative z-10">
              <div className="absolute left-[9px] top-2 bottom-2 w-[2px] bg-white/5" />
              <div className="space-y-6">
                {timelineEvents.map((ev) => (
                  <div key={ev.id} className="relative pl-8 flex items-start">
                    <div className={`absolute left-0 top-2.5 w-5 h-5 rounded-full border-[3px] border-zinc-900 shadow-md ${ev.type === 'stats' ? 'bg-indigo-500' : ev.type === 'strike' ? 'bg-red-500' : ev.type === 'spoken_to' ? 'bg-fuchsia-500' : ev.action?.includes('REMOVED') ? 'bg-red-500' : ev.action?.includes('Promote') || ev.action?.includes('Reinstate') ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                    <div className="flex-1 bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-2xl p-5 hover:border-white/20 transition-all shadow-lg relative overflow-hidden group hover:bg-white/[0.04]">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                        <div className="text-[10px] text-zinc-500 font-mono font-bold whitespace-nowrap w-24">{ev.dateStr}</div>
                        <div className="flex-1 w-full">
                          {ev.type === 'stats' && (
                            <div className="text-xs font-mono text-zinc-400 space-y-1">
                              <div className="text-indigo-400 font-sans font-black uppercase tracking-widest text-[9px] mb-2 border-b border-white/5 pb-1">Stats Snapshot</div>
                              <div className="flex justify-between"><span className="text-zinc-500">IG Reports:</span><span className="text-white font-bold">{ev.stats.newIG}</span></div>
                              <div className="flex justify-between"><span className="text-zinc-500">Forum Reports:</span><span className="text-white font-bold">{ev.stats.newForum}</span></div>
                              <div className="flex justify-between"><span className="text-zinc-500">Discord Tickets:</span><span className="text-white font-bold">{ev.stats.newDiscord}</span></div>
                            </div>
                          )}
                          {ev.type === 'strike' && (<div className="text-xs font-black text-red-400 uppercase tracking-widest">{ev.action}</div>)}
                          {ev.type === 'event' && (<div className={`text-xs font-black uppercase tracking-widest ${ev.action.includes('REMOVED') ? 'text-red-400' : ev.action.includes('Promote') || ev.action.includes('Reinstate') ? 'text-emerald-400' : 'text-zinc-200'}`}>{ev.action}</div>)}
                          {ev.type === 'spoken_to' && (
                            <div>
                              <div className="text-[10px] font-black text-fuchsia-400 uppercase tracking-widest mb-2">{ev.action.includes('METRIC') ? 'Metric Exception' : 'Spoken To'}</div>
                              {ev.note && <div className="text-[11px] text-zinc-300 leading-relaxed bg-black/40 p-3 rounded-xl border border-white/5">{ev.note}</div>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setSelectedStaffStats(null)} className="mt-8 relative z-10 w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-white uppercase text-xs transition-all shadow-md">Close Timeline</button>
          </div>
        </div>
      )}

      {removeModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setOpenDropdown(null)}>
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-red-500/20 rounded-[2.5rem] p-8 w-full max-w-md shadow-[0_0_60px_rgba(239,68,68,0.15)] relative overflow-visible" onClick={e => e.stopPropagation()}>
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-red-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="relative z-10">
              <h3 className="text-3xl font-light text-white mb-2 tracking-tight">Remove Personnel</h3>
              <p className="text-xs text-zinc-400 mb-8">Select the reason for removing <span className="text-white font-bold">{removeModal.name}</span>.</p>
              <div className="relative mb-8" onClick={(e) => e.stopPropagation()}>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Reason for Removal</label>
                  <div onClick={() => setOpenDropdown(openDropdown === 'removeReason' ? null : 'removeReason')} className={`w-full p-4 rounded-2xl bg-black/40 border text-white text-sm cursor-pointer shadow-inner flex items-center justify-between transition-all ${openDropdown === 'removeReason' ? 'border-red-500' : 'border-white/10 hover:border-white/20'}`}>
                    <span>{removeModal.reason}</span><span className="text-[9px] text-zinc-500">▼</span>
                  </div>
                  {openDropdown === 'removeReason' && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-zinc-800 border border-zinc-600 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden">
                      {['Resignation', 'Removal', 'Promotion to Moderator'].map(r => (
                        <div key={r} onClick={() => { setRemoveModal({...removeModal, reason: r}); setOpenDropdown(null); }} className={`px-5 py-3 text-sm font-bold cursor-pointer transition-colors ${removeModal.reason === r ? 'bg-red-500/20 text-red-400' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>{r}</div>
                      ))}
                    </div>
                  )}
              </div>
              <div className="flex gap-4">
                <button onClick={() => setRemoveModal({isOpen: false, name: "", rank: "", reason: "Resignation", isManagement: false})} className="flex-1 text-zinc-500 font-bold uppercase text-xs hover:text-white transition-colors">Cancel</button>
                <button disabled={processing === 'removing'} onClick={submitRemove} className="flex-1 py-4 bg-red-600/80 hover:bg-red-500 backdrop-blur-md border border-red-400/50 rounded-xl font-bold text-white uppercase text-xs shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all">{processing === 'removing' ? 'Processing...' : 'Confirm'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loaModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-lg shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="relative z-10 flex flex-col h-full max-h-[85vh]">
              <div className="mb-8 border-b border-white/5 pb-6">
                <h3 className="text-3xl font-light text-white mb-2 tracking-tight">Manage LOA</h3>
                <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Active & Past Records for {loaModal.name}</p>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-6 mb-8">
                 <div className="space-y-3">
                   <h4 className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Existing Records</h4>
                   {loaModal.history.length > 0 ? loaModal.history.map((loa, i) => (
                      <div key={i} className="bg-black/40 border border-white/5 p-4 rounded-2xl flex justify-between items-center group shadow-inner">
                         <div className="flex items-center gap-3">
                           <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                           <div className="text-xs text-zinc-200 font-mono font-bold tracking-tighter">{loa.startDate} <span className="text-zinc-600 font-normal mx-2">→</span> {loa.endDate}</div>
                         </div>
                         <button onClick={() => handleDeleteLOA(loa.startDate, loa.endDate)} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-widest rounded-lg border border-red-500/20 opacity-0 group-hover:opacity-100 transition-all">Remove</button>
                      </div>
                   )) : <div className="text-xs text-zinc-600 italic bg-white/[0.02] p-4 rounded-2xl text-center border border-white/5">No past records</div>}
                 </div>
                 <div className="space-y-4 bg-white/[0.02] border border-white/5 p-6 rounded-3xl">
                   <h4 className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Log New Leave</h4>
                   <div className="grid grid-cols-2 gap-4">
                     <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Start Date</label><input type="date" style={{ colorScheme: 'dark' }} className="w-full p-3 rounded-xl bg-black/50 border border-white/10 text-white outline-none focus:border-amber-500 transition-all shadow-inner text-xs font-mono" value={loaModal.startDate} onChange={(e) => setLoaModal({...loaModal, startDate: e.target.value})} /></div>
                     <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">End Date</label><input type="date" style={{ colorScheme: 'dark' }} className="w-full p-3 rounded-xl bg-black/50 border border-white/10 text-white outline-none focus:border-amber-500 transition-all shadow-inner text-xs font-mono" value={loaModal.endDate} onChange={(e) => setLoaModal({...loaModal, endDate: e.target.value})} /></div>
                   </div>
                 </div>
              </div>
              <div className="flex gap-4 border-t border-white/5 pt-6 mt-auto">
                <button onClick={() => setLoaModal({isOpen: false, name: "", startDate: "", endDate: "", history: []})} className="flex-1 py-4 text-zinc-500 font-bold uppercase text-xs hover:text-white transition-colors">Close / Cancel</button>
                <button disabled={processing === 'loa'} onClick={handleLOASubmit} className="flex-1 py-4 bg-amber-600/80 hover:bg-amber-500 backdrop-blur-md border border-amber-400/50 rounded-xl font-bold text-white uppercase text-xs transition-all shadow-[0_0_20px_rgba(251,191,36,0.4)]">{processing === 'loa' ? 'Processing...' : 'Save New Leave'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="relative z-10">
              <h3 className="text-2xl font-light text-white mb-8 tracking-tight">Edit Profile: {editModal.oldName}</h3>
              <div className="space-y-5 mb-8">
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Staff Name</label><input type="text" className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm" value={editModal.newName} onChange={(e) => setEditModal({...editModal, newName: e.target.value})} /></div>
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Discord ID</label><input type="text" className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm" value={editModal.discordId} onChange={(e) => setEditModal({...editModal, discordId: e.target.value})} /></div>
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Forum Link</label><input type="text" className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm" value={editModal.forumLink} onChange={(e) => setEditModal({...editModal, forumLink: e.target.value})} /></div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setEditModal({isOpen: false, oldName: "", newName: "", discordId: "", forumLink: "", isManagement: false})} className="flex-1 text-zinc-500 font-bold uppercase text-xs hover:text-white transition-colors">Cancel</button>
                <button disabled={processing === 'editing'} onClick={handleEditProfile} className="flex-1 py-4 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur-md border border-indigo-400/50 rounded-xl font-bold text-white uppercase text-xs transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]">{processing === 'editing' ? 'Saving...' : 'Save Profile'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {createLogModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-lg shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-fuchsia-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="relative z-10">
              <h3 className="text-2xl font-light text-white mb-2 tracking-tight">Log Spoken To: {createLogModal.name}</h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-8">Detailed permanent lifecycle log</p>
              <textarea className="w-full h-40 p-5 rounded-2xl bg-black/40 border border-white/5 text-white text-sm outline-none focus:border-fuchsia-500 focus:shadow-[0_0_15px_rgba(217,70,239,0.2)] transition-all custom-scrollbar mb-8 shadow-inner" placeholder="Enter details..." value={createLogModal.note} onChange={(e) => setCreateLogModal({...createLogModal, note: e.target.value})} />
              <div className="flex gap-4">
                <button onClick={() => setCreateLogModal({isOpen: false, name: "", note: ""})} className="flex-1 text-zinc-500 font-bold uppercase text-xs hover:text-white transition-colors">Cancel</button>
                <button disabled={processing === 'logging'} onClick={handleCreateLog} className="flex-1 py-4 bg-fuchsia-600/80 hover:bg-fuchsia-500 backdrop-blur-md border border-fuchsia-400/50 rounded-xl font-bold text-white uppercase text-xs transition-all shadow-[0_0_20px_rgba(217,70,239,0.4)]">{processing === 'logging' ? 'Saving...' : 'Submit Log'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setOpenDropdown(null)}>
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-y-auto max-h-[90vh] relative">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="relative z-10">
              <h3 className="text-3xl font-light text-white mb-8 tracking-tight">Add Personnel</h3>
              <div className="space-y-5 mb-8">
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Full Name</label><input type="text" className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm" onChange={(e) => setFormState({...formState, name: e.target.value})} /></div>
                {viewMode !== 'Management' && (
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Initial Rank</label>
                    <div onClick={() => setOpenDropdown(openDropdown === 'addRole' ? null : 'addRole')} className={`w-full p-4 rounded-2xl bg-black/40 border text-white text-sm cursor-pointer shadow-inner flex items-center justify-between transition-all ${openDropdown === 'addRole' ? 'border-indigo-500' : 'border-white/5 hover:border-white/10'}`}>
                      <span>{formState.role}</span><span className="text-[9px] text-zinc-500">▼</span>
                    </div>
                    {openDropdown === 'addRole' && (
                      <div className="absolute top-full left-0 mt-2 w-full bg-zinc-800 border border-zinc-600 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden">
                        {['Support', 'Senior Support'].map(role => (
                          <div key={role} onClick={() => { setFormState({...formState, role}); setOpenDropdown(null); }} className={`px-5 py-3 text-sm font-bold cursor-pointer transition-colors ${formState.role === role ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>{role}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Discord ID</label><input type="text" className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm" onChange={(e) => setFormState({...formState, discordId: e.target.value})} /></div>
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Forum Link (Optional)</label><input type="text" className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm" onChange={(e) => setFormState({...formState, forumLink: e.target.value})} /></div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setIsAddModalOpen(false)} className="flex-1 text-zinc-500 font-bold uppercase text-xs hover:text-white transition-colors">Cancel</button>
                <button disabled={processing === 'adding'} onClick={handleAddStaff} className="flex-1 py-4 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur-md border border-indigo-400/50 rounded-xl font-bold text-white uppercase text-xs transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]">{processing === 'adding' ? 'Deploying...' : 'Deploy'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reinstateModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setOpenDropdown(null)}>
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-sm shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-visible">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="relative z-10">
              <h3 className="text-3xl font-light text-white mb-6 tracking-tight">Reinstate</h3>
              <div className="relative mb-8" onClick={(e) => e.stopPropagation()}>
                  <div onClick={() => setOpenDropdown(openDropdown === 'reinstateRole' ? null : 'reinstateRole')} className={`w-full p-4 rounded-2xl bg-black/40 border text-white text-sm cursor-pointer shadow-inner flex items-center justify-between transition-all ${openDropdown === 'reinstateRole' ? 'border-emerald-500' : 'border-white/5 hover:border-white/10'}`}>
                    <span>{reinstateModal.role}</span><span className="text-[9px] text-zinc-500">▼</span>
                  </div>
                  {openDropdown === 'reinstateRole' && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-zinc-800 border border-zinc-600 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden">
                      {['Support', 'Senior Support'].map(role => (
                        <div key={role} onClick={() => { setReinstateModal({...reinstateModal, role}); setOpenDropdown(null); }} className={`px-5 py-3 text-sm font-bold cursor-pointer transition-colors ${reinstateModal.role === role ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>{role}</div>
                      ))}
                    </div>
                  )}
              </div>
              <div className="flex gap-4">
                <button onClick={() => setReinstateModal({isOpen: false, name: "", role: "Support"})} className="flex-1 text-zinc-500 font-bold uppercase text-xs hover:text-white transition-colors">Cancel</button>
                <button disabled={processing === 'reinstate'} onClick={handleReinstate} className="flex-1 py-4 bg-emerald-600/80 hover:bg-emerald-500 backdrop-blur-md border border-emerald-400/50 rounded-xl font-bold text-white uppercase text-xs shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all">{processing === 'reinstate' ? 'Updating...' : 'Reinstate'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewLogsModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setViewLogsModal({ isOpen: false, name: "", logs: [] })}>
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-2xl shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-fuchsia-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="relative z-10">
              <h3 className="text-3xl font-light text-white mb-2 tracking-tight">{viewLogsModal.name}</h3>
              <p className="text-xs text-zinc-400 mb-8 uppercase tracking-widest font-bold">Feedback & Disciplinary Logs</p>
              <div className="max-h-96 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                {viewLogsModal.logs.map((log, i) => {
                  const isException = log.note.startsWith('METRIC EXCEPTION');
                  return (
                    <div key={i} className="bg-white/[0.03] backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-fuchsia-500/30 transition-all relative overflow-hidden group">
                      <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none transition-all group-hover:bg-fuchsia-500/20" />
                      <div className="text-[10px] text-fuchsia-400 font-mono mb-3 font-bold relative z-10">{log.timestamp}</div>
                      <div className="text-[10px] uppercase font-black text-fuchsia-300 mb-1">{isException ? 'METRIC EXCEPTION' : 'Spoken To'}</div>
                      <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed relative z-10">{isException ? log.note.replace('METRIC EXCEPTION:', '').trim() : log.note}</p>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setViewLogsModal({ isOpen: false, name: "", logs: [] })} className="mt-8 w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-white uppercase text-xs transition-all shadow-md">Close Window</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function StatBox({ label, value, alert }) {
  return (
    <div>
      <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-bold">{label}</div>
      <div className={`font-medium text-sm ${alert && typeof alert === 'boolean' && value !== 'No' ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]' : 'text-zinc-200'}`}>{value}</div>
    </div>
  );
}
