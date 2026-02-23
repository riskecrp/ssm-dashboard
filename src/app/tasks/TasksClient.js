"use client";
import { useState } from 'react';
import { manageTask, pingDiscordTask } from '../actions';

export default function TasksClient({ initialTasks, ssmNames }) {
  const [viewMode, setViewMode] = useState('Pending');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [processing, setProcessing] = useState(null);

  const [newTask, setNewTask] = useState({ title: "", description: "", target: "SSM" });

  const displayedTasks = initialTasks.filter(t => t.status === viewMode);

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) return;
    setProcessing('creating');
    
    const taskObj = {
      id: Date.now().toString(),
      title: newTask.title,
      description: newTask.description,
      target: newTask.target
    };

    await manageTask({ action: 'AddBatch', tasksArray: [taskObj] });
    await pingDiscordTask({ tasksArray: [taskObj], targetPings: newTask.target });
    
    setProcessing(null);
    setIsAddModalOpen(false);
    setNewTask({ title: "", description: "", target: "SSM" });
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
                <div className="text-[9px] uppercase tracking-widest font-bold bg-white/5 text-zinc-300 px-3 py-1 rounded-lg border border-white/10">{task.target}</div>
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
                          {ssmNames.map(name => (
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
                  <button disabled={processing === `Delete-${task.id}`} onClick={() => handleAction(task.id, 'Delete')} className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase tracking-widest">Delete</button>
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-700" />
            <div className="relative z-10">
              <h3 className="text-3xl font-light text-white mb-8 tracking-tight">Create Task</h3>
              <div className="space-y-5 mb-8">
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Target (Ping)</label><input type="text" className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm" value={newTask.target} onChange={(e) => setNewTask({...newTask, target: e.target.value})} placeholder="e.g. SSM or Staff Name" /></div>
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Task Title</label><input type="text" className="w-full p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm" value={newTask.title} onChange={(e) => setNewTask({...newTask, title: e.target.value})} placeholder="Action required..." /></div>
                <div><label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 block font-bold">Description</label><textarea className="w-full h-32 p-4 rounded-2xl bg-black/40 border border-white/5 text-white outline-none focus:border-indigo-500 transition-all shadow-inner text-sm custom-scrollbar" value={newTask.description} onChange={(e) => setNewTask({...newTask, description: e.target.value})} placeholder="Additional details..." /></div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setIsAddModalOpen(false)} className="flex-1 text-zinc-500 font-bold uppercase text-xs hover:text-white transition-colors">Cancel</button>
                <button disabled={processing === 'creating'} onClick={handleCreateTask} className="flex-1 py-4 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur-md border border-indigo-400/50 rounded-xl font-bold text-white uppercase text-xs transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]">{processing === 'creating' ? 'Deploying...' : 'Deploy Task'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}