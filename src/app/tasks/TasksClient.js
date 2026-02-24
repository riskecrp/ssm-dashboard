"use client";
import { useState } from 'react';
import { manageTask, pingDiscordTask } from '../actions';

export default function TasksClient({ initialTasks, ssmNames, activeRosterNames }) {
  const [viewMode, setViewMode] = useState('Pending');
  const [openDropdown, setOpenDropdown] = useState(null);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editModal, setEditModal] = useState({ isOpen: false, id: "", title: "", description: "", target: "" });
  const [processing, setProcessing] = useState(null);

  const [newTask, setNewTask] = useState({ 
    type: "General", 
    customTitle: "", 
    description: "", 
    target: "SSM", 
    staffInvolved: [] 
  });

  const displayedTasks = (initialTasks || []).filter(t => t.status === viewMode);

  const toggleStaffSelection = (name) => {
    setNewTask(prev => ({
       ...prev,
       staffInvolved: prev.staffInvolved.includes(name) 
           ? prev.staffInvolved.filter(n => n !== name) 
           : [...prev.staffInvolved, name]
    }));
  };

  const handleCreateTask = async () => {
    if (newTask.type === "General" && !newTask.customTitle.trim()) return;
    setProcessing('creating');
    
    let tasksArray = [];

    if (newTask.type === "General" || newTask.staffInvolved.length === 0) {
        tasksArray = [{
            id: Date.now().toString(),
            title: newTask.type === 'General' ? newTask.customTitle : newTask.type,
            description: newTask.description,
            target: newTask.target
        }];
    } else {
        tasksArray = newTask.staffInvolved.map((staffName, index) => ({
            id: (Date.now() + index).toString(),
            title: `${newTask.type} - ${staffName}`,
            description: newTask.description,
            target: newTask.target
        }));
    }

    await manageTask({ action: 'AddBatch', tasksArray });
    await pingDiscordTask({ tasksArray, targetPings: newTask.target });
    
    setProcessing(null);
    setIsAddModalOpen(false);
    setNewTask({ type: "General", customTitle: "", description: "", target: "SSM", staffInvolved: [] });
  };

  const handleEditTask = async () => {
    if (!editModal.title.trim()) return;
    setProcessing('editing');
    await manageTask({ 
        action: 'Edit', 
        taskId: editModal.id, 
        newTitle: editModal.title, 
        newDescription: editModal.description, 
        newTarget: editModal.target 
    });
    setProcessing(null);
    setEditModal({ isOpen: false, id: "", title: "", description: "", target: "" });
  };

  const handleAction = async (taskId, action, claimName = '') => {
    setProcessing(`${action}-${taskId}`);
    await manageTask({ action, taskId, claimedBy: claimName });
    setProcessing(null);
    setOpenDropdown(null);
  };

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-[1600px] mx-auto space-y-8 relative min-h-screen" onClick={() => setOpenDropdown(null)}>
      
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
      </div>

      <header style={{ zIndex: 100 }} className="bg-zinc-900/80 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between shadow-[0_0_40px_rgba(0,0,0,0.5)] relative group gap-6">
        <div className="relative z-10 flex flex-col sm:flex-row gap-6 w-full md:w-auto">
          <div>
            <h1 className="text-3xl font-light text-white tracking-tight drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">Task Workspace</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1 font-bold">Action Items & Deployments</p>
          </div>
          <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5 shadow-inner">
            <button onClick={() => setViewMode('Pending')} className={`px-6 py-2.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all ${viewMode === 'Pending' ? 'bg-indigo-600/80 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]' : 'text-zinc-500 hover:text-zinc-300'}`}>Pending</button>
            <button onClick={() => setViewMode('Completed')} className={`px-6 py-2.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all ${viewMode === 'Completed' ? 'bg-emerald-600/80 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'text-zinc-500 hover:text-zinc-300'}`}>Completed</button>
          </div>
        </div>
        <button onClick={() => setIsAddModalOpen(true)} className="px-6 py-3 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur-md border border-indigo-400/50 rounded-xl text-xs font-bold text-white uppercase tracking-widest shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all whitespace-nowrap">+ Create Task</button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
        {displayedTasks.map(task => (
          <div key={task.id} className="bg-zinc-900/80 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 shadow-[0_16px_40px_rgba(0,0,0,0.6)] flex flex-col hover:-translate-y-2 hover:border-indigo-500/40 hover:shadow-[0_20px_80px_rgba(79,70,229,0.3)] transition-all duration-500">
             <div className="flex justify-between items-start mb-4 gap-4">
                <div className="text-[10px] text-zinc-500 font-mono tracking-widest font-bold">{task.timestamp}</div>
                <div className="flex gap-2 items-center">
                  {viewMode === 'Pending' && (
                    <>
                      <button disabled={processing === `SilentDelete-${task.id}`} onClick={(e) => { e.stopPropagation(); handleAction(task.id, 'SilentDelete'); }} className="text-zinc-600 hover:text-red-400 font-black text-xs transition-colors" title="Delete without logging">✕</button>
                      <button onClick={(e) => { e.stopPropagation(); setEditModal({ isOpen: true, id: task.id, title: task.title, description: task.description || '', target: task.target || 'SSM' }); }} className="text-[9px] uppercase tracking-widest font-bold bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors px-2 py-1 rounded border border-white/10">Edit</button>
                    </>
                  )}
                  <div className="text-[9px] uppercase tracking-widest font-bold bg-white/5 text-zinc-300 px-3 py-1 rounded-lg border border-white/10">{task.target}</div>
                </div>
             </div>
             
             <h3 className="text-xl font-bold text-white mb-2 leading-tight">{task.title}</h3>
             <p className="text-xs text-zinc-400 mb-8 leading-relaxed flex-1">{task.description}</p>
             
             {viewMode === 'Pending' ? (
                <div className="flex items-center justify-between mt-auto border-t border-white/5 pt-6 gap-4">
                   <div className="relative z-[150] w-full" onClick={(e) => e.stopPropagation()}>
                     <div onClick={() => setOpenDropdown(openDropdown === task.id ? null : task.id)} className="bg-black/50 border border-white/10 text-indigo-400 text-[10px] font-bold uppercase tracking-widest px-4 py-3 rounded-xl cursor-pointer shadow-inner flex items-center justify-between hover:border-indigo-500/50 transition-colors">
                       <span>{task.claimedBy || "Unclaimed"}</span><span className="text-[8px] text-indigo-500 ml-3">▼</span>
                     </div>
                     {openDropdown === task.id && (
                       <div className="absolute bottom-full mb-2 left-0 w-full bg-zinc-800 border border-zinc-600 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.9)] py-2 max-h-48 overflow-y-auto custom-scrollbar">
                          <div onClick={() => handleAction(task.id, 'Claim', '')} className="px-5 py-3 text-[10px] font-bold cursor-pointer transition-colors text-zinc-400 hover:bg-white/5 hover:text-white uppercase tracking-widest border-b border-white/5">Unclaim</div>
                          {(ssmNames || []).map(name => (
                            <div key={name} onClick={() => handleAction(task.id, 'Claim', name)} className={`px-5 py-3 text-[10px] font-bold cursor-pointer transition-colors uppercase tracking-widest ${task.claimedBy === name ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>{name}</div>
                          ))}
                       </div>
                     )}
                   </div>
                   <button disabled={processing === `Complete-${task.id}`} onClick={() => handleAction(task.id, 'Complete')} className="flex-shrink-0 px-5 py-3 bg-emerald-600/80 hover:bg-emerald-500 rounded-xl text-[10px] font-bold text-white uppercase tracking-widest shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all">Done ✓</button>
                </div>
             ) : (
                <div className="mt-auto border-t border-white/5 pt-6 flex justify-between items-center">
                  <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Completed by {task.claimedBy || 'Unknown'}</div>
                  <button disabled={processing === `Delete-${task.id}`} onClick={() => handleAction(task.id, 'Delete')} className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase tracking-widest">Delete Log</button>
                </div>
             )}
          </div>
        ))}
        {displayedTasks.length === 0 && (
          <div className="col-span-full py-32 text-center text-zinc-600 uppercase tracking-widest text-sm font-bold flex flex-col items-center justify-center opacity-50">
            <span className="text-4xl mb-4">✨</span> No {viewMode} Tasks Found
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setOpenDropdown(null)}>
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-xl shadow-[0_0_60px_rgba(0,0,0,0.8)] relative flex flex-col max-h-[90vh]">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="relative z-10 flex flex-col h-full">
              <h3 className="text-3xl font-light text-white mb-6 tracking-tight flex-shrink-0">Create Task Batch</h3>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 space-y-6 mb-8">
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Target (Who gets pinged?)</label>
                    <div onClick={() => setOpenDropdown(openDropdown === 'taskTarget' ? null : 'taskTarget')} className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white text-sm cursor-pointer shadow-inner flex items-center justify-between transition-all hover:border-indigo-500">
                      <span>{newTask.target}</span><span className="text-[9px] text-zinc-500">▼</span>
                    </div>
                    {openDropdown === 'taskTarget' && (
                      <div className="absolute top-full left-0 mt-2 w-full bg-zinc-800 border border-zinc-600 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                        <div onClick={() => { setNewTask({...newTask, target: 'SSM'}); setOpenDropdown(null); }} className={`px-5 py-3 text-sm font-bold cursor-pointer transition-colors ${newTask.target === 'SSM' ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>SSM</div>
                        {(ssmNames || []).map(name => (
                          <div key={name} onClick={() => { setNewTask({...newTask, target: name}); setOpenDropdown(null); }} className={`px-5 py-3 text-sm font-bold cursor-pointer transition-colors ${newTask.target === name ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>{name}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Task Type</label>
                    <div onClick={() => setOpenDropdown(openDropdown === 'taskType' ? null : 'taskType')} className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white text-sm cursor-pointer shadow-inner flex items-center justify-between transition-all hover:border-indigo-500">
                      <span>{newTask.type}</span><span className="text-[9px] text-zinc-500">▼</span>
                    </div>
                    {openDropdown === 'taskType' && (
                      <div className="absolute top-full left-0 mt-2 w-full bg-zinc-800 border border-zinc-600 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden">
                        {['General', 'Spoken To', 'Issue Strike'].map(t => (
                          <div key={t} onClick={() => { setNewTask({...newTask, type: t}); setOpenDropdown(null); }} className={`px-5 py-3 text-sm font-bold cursor-pointer transition-colors ${newTask.type === t ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>{t}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {newTask.type === 'General' && (
                     <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Custom Title</label><input type="text" className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm" value={newTask.customTitle} onChange={(e) => setNewTask({...newTask, customTitle: e.target.value})} placeholder="Action required..." /></div>
                  )}

                  {(newTask.type === 'Spoken To' || newTask.type === 'Issue Strike') && (
                     <div className="bg-white/[0.02] border border-white/5 p-5 rounded-3xl">
                        <label className="text-[10px] text-indigo-400 uppercase tracking-widest mb-4 block font-black">Staff Involved (Checklist)</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                           {(activeRosterNames || []).map(name => {
                              const isSelected = newTask.staffInvolved.includes(name);
                              return (
                                 <div key={name} onClick={() => toggleStaffSelection(name)} className={`px-3 py-2 text-xs font-bold rounded-xl cursor-pointer border transition-colors flex items-center justify-center text-center ${isSelected ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-black/30 border-white/5 text-zinc-400 hover:border-white/20'}`}>
                                    {name}
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  )}

                  <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Description (Optional)</label><textarea className="w-full h-32 p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm custom-scrollbar" value={newTask.description} onChange={(e) => setNewTask({...newTask, description: e.target.value})} placeholder="Additional details..." /></div>
              </div>

              <div className="flex gap-4 flex-shrink-0 pt-4 border-t border-white/5">
                <button onClick={() => setIsAddModalOpen(false)} className="flex-1 text-zinc-500 font-bold uppercase text-xs hover:text-white transition-colors">Cancel</button>
                <button disabled={processing === 'creating'} onClick={handleCreateTask} className="flex-1 py-4 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur-md border border-indigo-400/50 rounded-xl font-bold text-white uppercase text-xs transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]">{processing === 'creating' ? 'Deploying...' : 'Deploy Task Batch'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setOpenDropdown(null)}>
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-visible">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="relative z-10">
              <h3 className="text-3xl font-light text-white mb-8 tracking-tight">Edit Task</h3>
              <div className="space-y-5 mb-8">
                
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Target (Ping)</label>
                  <div onClick={() => setOpenDropdown(openDropdown === 'editTarget' ? null : 'editTarget')} className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white text-sm cursor-pointer shadow-inner flex items-center justify-between transition-all hover:border-indigo-500">
                    <span>{editModal.target}</span><span className="text-[9px] text-zinc-500">▼</span>
                  </div>
                  {openDropdown === 'editTarget' && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-zinc-800 border border-zinc-600 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                      <div onClick={() => { setEditModal({...editModal, target: 'SSM'}); setOpenDropdown(null); }} className={`px-5 py-3 text-sm font-bold cursor-pointer transition-colors ${editModal.target === 'SSM' ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>SSM</div>
                      {(ssmNames || []).map(name => (
                        <div key={name} onClick={() => { setEditModal({...editModal, target: name}); setOpenDropdown(null); }} className={`px-5 py-3 text-sm font-bold cursor-pointer transition-colors ${editModal.target === name ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>{name}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Task Title</label><input type="text" className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm" value={editModal.title} onChange={(e) => setEditModal({...editModal, title: e.target.value})} /></div>
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Description</label><textarea className="w-full h-32 p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm custom-scrollbar" value={editModal.description} onChange={(e) => setEditModal({...editModal, description: e.target.value})} /></div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setEditModal({isOpen: false, id: "", title: "", description: "", target: ""})} className="flex-1 text-zinc-500 font-bold uppercase text-xs hover:text-white transition-colors">Cancel</button>
                <button disabled={processing === 'editing'} onClick={handleEditTask} className="flex-1 py-4 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur-md border border-indigo-400/50 rounded-xl font-bold text-white uppercase text-xs transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]">{processing === 'editing' ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
