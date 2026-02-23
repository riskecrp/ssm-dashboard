import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import StatisticsClient from './StatisticsClient';

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

export default async function StatisticsPage() {
  let staffMap = new Map();

  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    
    const rosterSheet = doc.sheetsByTitle['SSRoster']; 
    const statsSheet = doc.sheetsByTitle['AllStats'] || doc.sheetsByTitle['Sheet1'] || doc.sheetsByIndex[0]; 
    const loaSheet = doc.sheetsByTitle['LOAs'];
    const spokenToSheet = doc.sheetsByTitle['SpokenToLogs'];

    const [rosterRows, statsRows, loaRows, spokenToRows] = await Promise.all([
      rosterSheet ? rosterSheet.getRows() : [],
      statsSheet ? statsSheet.getRows() : [],
      loaSheet ? loaSheet.getRows() : [],
      spokenToSheet ? spokenToSheet.getRows() : []
    ]);

    rosterRows.forEach(row => {
      const name = row.get('Name')?.trim();
      if (!name) return;
      
      const isSenior = String(row.get('SeniorSupport')).toUpperCase() === 'TRUE';
      const isSupport = String(row.get('Support')).toUpperCase() === 'TRUE';

      staffMap.set(name.toLowerCase(), {
        name: name,
        rank: isSenior ? 'Senior Support' : 'Support',
        isActive: isSupport,
        lifetimeIG: 0,
        lifetimeForum: 0,
        lifetimeDiscord: 0,
        history: [],
        spokenToLogs: [],
        loas: []
      });
    });

    const parseStat = (val) => parseInt(String(val || '0').replace(/,/g, ''), 10) || 0;

    statsRows.forEach((row) => {
      const name = (row.get('Staff Name') || '').trim().toLowerCase();
      if (!staffMap.has(name)) return;

      const staff = staffMap.get(name);
      const rawDateStr = row.get('Date') || '';
      const dateStr = normalizeMonthString(rawDateStr);
      
      staff.history.push({
        month: dateStr,
        timestamp: new Date(dateStr.replace(/\//g, ' ')).getTime() || 0,
        newIG: parseStat(row.get('New IG Reports')),
        newForum: parseStat(row.get('New Forum Reports')),
        newDiscord: parseStat(row.get('New Discord')),
        totalIG: parseStat(row.get('Total Reports Completed')),
        totalForum: parseStat(row.get('Total Forum Reports')),
        totalDiscord: parseStat(row.get('Total Discord')),
        strike: parseStat(row.get('Strike Given'))
      });
    });

    loaRows.forEach(row => {
      const name = row.get('Name')?.trim().toLowerCase();
      if (!staffMap.has(name)) return;
      staffMap.get(name).loas.push({
        startDate: row.get('Start Date') || 'N/A',
        endDate: row.get('End Date') || 'N/A'
      });
    });

    spokenToRows.forEach(row => {
      const name = row.get('Staff Name')?.trim().toLowerCase();
      if (!staffMap.has(name)) return;
      staffMap.get(name).spokenToLogs.push({
        timestamp: row.get('Timestamp') || 'N/A',
        note: row.get('Note') || ''
      });
    });

    staffMap.forEach(staff => {
      // Sort everything latest first
      staff.history.sort((a, b) => b.timestamp - a.timestamp);
      staff.loas.reverse(); 
      staff.spokenToLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      if (staff.history.length > 0) {
        const latest = staff.history[0];
        staff.lifetimeIG = latest.totalIG;
        staff.lifetimeForum = latest.totalForum;
        staff.lifetimeDiscord = latest.totalDiscord;
      }
    });

  } catch (e) {
    console.error("Fetch Error:", e);
  }

  const rosterData = Array.from(staffMap.values());
  return <StatisticsClient initialData={rosterData} />;
}