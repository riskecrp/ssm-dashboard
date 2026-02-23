import './globals.css';
import Sidebar from './Sidebar';

export const metadata = {
  title: "SSM Dashboard",
  description: "Internal Support Staff Management & Task Workspace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-[#09090b] text-zinc-400 min-h-screen font-sans antialiased selection:bg-indigo-500/30 flex flex-col md:flex-row relative">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative z-0 w-full">
          {children}
        </main>
      </body>
    </html>
  );
}