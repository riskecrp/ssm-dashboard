import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import RosterClient from './RosterClient';

export const revalidate = 60; 

function normalizeMonthString(dateStr) {
  if (!dateStr) return 'N/A';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
      const year = parts[0];
      const monthNum = parseInt(parts[1], 10);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `01/${months[monthNum - 1]}/${year}`;
    }
  }
  return dateStr; 
}

export default async function Home() {
  let staffMap = new Map();
  let managementMap = new Map();

  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    
    const rosterSheet = doc.sheetsByTitle['SSRoster']; 
    const mgmtSheet = doc.sheetsByTitle['SSMRoster']; 
    const statsSheet = doc.sheetsByTitle['AllStats'] || doc.sheetsByTitle['Sheet1'] || doc.sheetsByIndex[0]; 
    const loaSheet = doc.sheetsByTitle['LOAs'];
    const changelogSheet = doc.sheetsByTitle['SupportChangesLog'];
    const spokenToSheet = doc.sheetsByTitle['SpokenToLogs'];
    const tasksSheet = doc.sheetsByTitle['Tasks'];

    const [rosterRows, mgmtRows, statsRows, loaRows, changelogRows, spokenToRows, taskRows] = await Promise.all([
      rosterSheet ? rosterSheet.getRows() : [],
      mgmtSheet ? mgmtSheet.getRows() : [],
      statsSheet ? statsSheet.getRows() : [],
      loaSheet ? loaSheet.getRows() : [],
      changelogSheet ? changelogSheet.getRows() : [],
      spokenToSheet ? spokenToSheet.getRows() : [],
      tasksSheet ? tasksSheet.getRows() : []
    ]);

    const pendingStrikesFor = [];
    const pendingTasksMap = {}; 
    if (taskRows) {
        taskRows.forEach(row => {
            if (row.get('Status') === 'Pending') {
                const title = row.get('Title');
                if (title?.startsWith('Issue Strike - ')) {
                    pendingStrikesFor.push(title.replace('Issue Strike - ', '').trim().toLowerCase());
                }
                const claimedBy = row.get('Claimed By')?.trim().toLowerCase();
                if (claimedBy) {
                  pendingTasksMap[claimedBy] = (pendingTasksMap[claimedBy] || 0) + 1;
                }
            }
        });
    }

    mgmtRows.forEach(row => {
       const name = row.get('Name')?.trim();
       if (!name) return;
       managementMap.set(name.toLowerCase(), {
         name: name,
         discordId: row.get('Discord ID') || '',
         forumLink: row.get('Forum Link') || '',
         discordName: 'Fetching...',
         isManagement: true,
         pendingTasks: pendingTasksMap[name.toLowerCase()] || 0
       });
    });

    rosterRows.forEach(row => {
      const name = row.get('Name')?.trim();
      if (!name) return;
      
      const isSenior = String(row.get('SeniorSupport')).toUpperCase() === 'TRUE';
      const isSupport = String(row.get('Support')).toUpperCase() === 'TRUE';
      const isPendingStrike = pendingStrikesFor.includes(name.toLowerCase());

      staffMap.set(name.toLowerCase(), {
        name: name,
        discordId: row.get('Discord ID') || '',
        forumLink: row.get('Forum Link') || '',
        discordName: 'Fetching...', 
        firstSeen: 'N/A',
        latestSeen: 'N/A',
        rank: isSenior ? 'Senior Support' : 'Support',
        isActive: isSupport,
        pendingStrike: isPendingStrike,
        lifetimeIG: 0,
        lifetimeForum: 0,
        lifetimeDiscord: 0,
        strikes3Mo: 0,
        totalStrikes: 0,
        activeLOA: false,
        loaEnd: null,
        lifecycle: [],
        history: [],
        spokenToLogs: [],
        loas: []
      });
    });

    const discordIds = [...staffMap.values(), ...managementMap.values()].map(s => s.discordId).filter(Boolean);
    const uniqueDiscordIds = [...new Set(discordIds)];
    const discordNames = {};

    if (process.env.DISCORD_BOT_TOKEN && uniqueDiscordIds.length > 0) {
      await Promise.all(uniqueDiscordIds.map(async (id) => {
        try {
          const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
            headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
            next: { revalidate: 3600 } 
          });
          if (res.ok) {
            const data = await res.json();
            discordNames[id] = data.global_name || data.username;
          } else {
            discordNames[id] = "Invalid ID";
          }
        } catch (err) {
          discordNames[id] = "Error";
        }
      }));
    }

    staffMap.forEach(staff => { staff.discordName = staff.discordId ? (discordNames[staff.discordId] || "Not Found") : "N/A"; });
    managementMap.forEach(mgmt => { mgmt.discordName = mgmt.discordId ? (discordNames[mgmt.discordId] || "Not Found") : "N/A"; });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    loaRows.forEach(row => {
      const name = row.get('Name')?.trim().toLowerCase();
      if (!staffMap.has(name)) return;
      const start = new Date(row.get('Start Date'));
      const end = new Date(row.get('End Date'));
      
      const loaEntry = { startDate: row.get('Start Date'), endDate: row.get('End Date') };
      staffMap.get(name).loas.push(loaEntry);

      if (today >= start && today <= end) {
        staffMap.get(name).activeLOA = true;
        staffMap.get(name).loaEnd = row.get('End Date');
      }
    });

    const parseStat = (val) => parseInt(String(val || '0').replace(/,/g, ''), 10) || 0;

    statsRows.forEach((row) => {
      const name = (row.get('Staff Name') || '').trim().toLowerCase();
      if (!staffMap.has(name)) return;
      const staff = staffMap.get(name);
      const rawDateStr = row.get('Date') || '';
      const dateStr = normalizeMonthString(rawDateStr);
      
      // Universally read manually inputted strikes (TRUE, Yes, 1, etc)
      const rawStrike = String(row.get('Strike Given') || '').toUpperCase().trim();
      const strikeCount = (rawStrike === 'TRUE' || rawStrike === 'YES' || rawStrike === '1') ? 1 : (parseInt(rawStrike, 10) || 0);

      staff.history.push({
        month: dateStr,
        timestamp: new Date(dateStr.replace(/\//g, ' ')).getTime() || 0,
        newIG: parseStat(row.get('New IG Reports')),
        newForum: parseStat(row.get('New Forum Reports')),
        newDiscord: parseStat(row.get('New Discord')),
        totalIG: parseStat(row.get('Total Reports Completed')),
        totalForum: parseStat(row.get('Total Forum Reports')),
        totalDiscord: parseStat(row.get('Total Discord')),
        strike: strikeCount,
        loaDays: parseStat(row.get('LOA Days'))
      });
    });

    const threeMonthsAgoMs = new Date();
    threeMonthsAgoMs.setMonth(threeMonthsAgoMs.getMonth() - 3);
    const msLimit = threeMonthsAgoMs.getTime();

    staffMap.forEach(staff => {
      staff.history.sort((a, b) => b.timestamp - a.timestamp);
      if (staff.history.length > 0) {
        const latest = staff.history[0];
        const oldest = staff.history[staff.history.length - 1];
        staff.latestSeen = latest.month;
        staff.firstSeen = oldest.month;
        staff.lifetimeIG = latest.totalIG;
        staff.lifetimeForum = latest.totalForum;
        staff.lifetimeDiscord = latest.totalDiscord;
        staff.totalStrikes = staff.history.reduce((sum, h) => sum + (h.strike > 0 ? 1 : 0), 0);
        staff.strikes3Mo = staff.history.filter(h => h.timestamp >= msLimit).reduce((sum, h) => sum + (h.strike > 0 ? 1 : 0), 0);
      }
    });

    changelogRows.forEach((row) => {
      const staffName = (row.get('Staff') || '').trim().toLowerCase();
      if (staffMap.has(staffName)) {
        staffMap.get(staffName).lifecycle.push({
          date: row.get('Timestamp') || 'N/A',
          action: row.get('Action') || 'N/A'
        });
      }
    });

    spokenToRows.forEach((row) => {
      const staffName = (row.get('Staff Name') || '').trim().toLowerCase();
      if (staffMap.has(staffName)) {
        staffMap.get(staffName).spokenToLogs.push({
          timestamp: row.get('Timestamp') || 'N/A',
          note: row.get('Note') || ''
        });
      }
    });

    staffMap.forEach(staff => {
      staff.lifecycle.sort((a, b) => new Date(b.date) - new Date(a.date));
      staff.spokenToLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    });

  } catch (e) {
    console.error("Fetch Error:", e);
  }

  // FORCE SORT: Senior Support A-Z -> Support A-Z
  const rosterData = Array.from(staffMap.values()).sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank === 'Senior Support' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  
  const managementData = Array.from(managementMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  
  return <RosterClient initialData={rosterData} managementData={managementData} />;
}
