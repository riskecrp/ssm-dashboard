"use client";
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close menu when route changes
  useEffect(() => { setIsOpen(false); }, [pathname]);

  return (
    <>
      {/* MOBILE TOP BAR */}
      <div className="md:hidden flex items-center justify-between bg-zinc-900/90 backdrop-blur-3xl border-b border-white/10 p-4 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-black/40 rounded-lg border border-white/10 shadow-inner">
            <Image src="/lobster.png" alt="SSM Mascot" width={24} height={24} className="drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
          </div>
          <h1 className="text-[10px] font-bold tracking-widest text-white uppercase leading-tight">SSM Workspace</h1>
        </div>
        <button onClick={() => setIsOpen(!isOpen)} className="text-zinc-400 hover:text-white p-2 text-xl outline-none">
          {isOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* DESKTOP & MOBILE MENU */}
      <aside className={`${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:sticky top-[64px] md:top-0 left-0 h-[calc(100vh-64px)] md:h-screen w-72 bg-zinc-900/95 md:bg-zinc-900/60 backdrop-blur-3xl border-r border-white/10 flex flex-col z-[100] md:z-50 shadow-[8px_0_40px_rgba(0,0,0,0.5)] transition-transform duration-300 overflow-hidden`}>
        
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none transition-all duration-700 hidden md:block" />
        
        <div className="relative z-10 p-8 items-center gap-5 border-b border-white/5 bg-white/[0.01] hidden md:flex">
          <div className="relative flex-shrink-0 group">
            <div className="absolute inset-0 bg-red-500/20 rounded-xl blur-md group-hover:bg-red-500/30 transition-all duration-500" />
            <div className="p-2.5 bg-black/40 rounded-xl border border-white/10 shadow-inner relative z-10 transition-transform duration-500 group-hover:scale-105">
              <Image src="/lobster.png" alt="SSM Mascot" width={38} height={38} className="drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
            </div>
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-widest text-white uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] leading-relaxed">
              SSM<br/>Workspace
            </h1>
          </div>
        </div>

        <nav className="relative z-10 flex-1 p-6 space-y-3 mt-2 overflow-y-auto">
          <SidebarLink href="/" label="Staff Roster" current={pathname} />
          <SidebarLink href="/statistics" label="Performance Stats" current={pathname} />
          <SidebarLink href="/tasks" label="Task Workspace" current={pathname} />
          <SidebarLink href="/shredder" label="Prepare Monthly Stats" current={pathname} />
        </nav>
      </aside>
      
      {/* MOBILE BACKDROP OVERLAY */}
      {isOpen && (
        <div onClick={() => setIsOpen(false)} className="md:hidden fixed inset-0 top-[64px] bg-black/60 backdrop-blur-sm z-[90]" />
      )}
    </>
  );
}

function SidebarLink({ href, label, current }) {
  const isActive = current === href || (href !== '/' && current?.startsWith(href));
  return (
    <Link href={href} className={`group relative flex items-center gap-4 px-5 py-4 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all duration-300 border ${isActive ? 'bg-white/[0.08] text-white border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.3)]' : 'text-zinc-400 border-transparent hover:text-white hover:bg-white/[0.04] hover:border-white/5'}`}>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 relative z-10 ${isActive ? 'bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.8)]' : 'bg-zinc-700 group-hover:bg-indigo-400'}`} />
      <span className="relative z-10">{label}</span>
    </Link>
  );
}