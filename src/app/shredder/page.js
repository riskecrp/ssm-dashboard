import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import ShredderClient from './ShredderClient';

export const revalidate = 60; // 60-second cache to prevent Google API Rate Limits

const normalize = (str) => (str ? String(str).trim().toLowerCase().replace(/\s+/g, '') : '');

export default async function PrepareStatsPage() {
  let baselineData = [];
  let savedPrepText = "";

  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();

    const rosterTab = doc.sheetsByTitle['SSRoster'];
    const statsTab = doc.sheetsByTitle['AllStats'] || doc.sheetsByTitle['Sheet1'] || doc.sheetsByIndex[0];
    const forumTab = doc.sheetsById[382477503] || doc.sheetsByTitle['ForumReports'];
    const padTab = doc.sheetsByTitle['Scratchpad'];

    const [rosterRows, statsRows] = await Promise.all([
      rosterTab ? rosterTab.getRows() : [],
      statsTab ? statsTab.getRows() : []
    ]);

    // Fetch the shared scratchpad state safely
    if (padTab) {
      try {
        await padTab.loadHeaderRow();
        const pRows = await padTab.getRows();
        if (pRows.length > 0) {
          savedPrepText = pRows[0].get('Data') || "";
        }
      } catch (err) {
        // Automatically inject the header if the user forgot to add 'Data' to A1
        try {
          await padTab.setHeaderRow(['Data']);
        } catch (innerErr) {
          console.error("Could not set Scratchpad header");
        }
      }
    }

    let forumRows = [];
    if (forumTab) {
      await forumTab.loadHeaderRow();
      forumRows = await forumTab.getRows();
    }

    const staffMap = new Map();
    
    rosterRows.forEach(r => {
      if (r.get('Support') === 'TRUE') {
        const name = (r.get('Name') || '').trim();
        if (!name) return;
        
        staffMap.set(normalize(name), {
          name: name, 
          isSenior: r.get('SeniorSupport') === 'TRUE',
          discordQuery: r.get('Discord Query') || '',
          prevIG: 0,
          prevForum: 0,
          prevDiscord: 0,
          fetchedForumTotal: 0,
          hasBaseline: false
        });
      }
    });

    const sortedStats = [...statsRows].reverse(); 
    for (const r of sortedStats) {
      const nName = normalize(r.get('Staff Name'));
      if (staffMap.has(nName)) {
        const staff = staffMap.get(nName);
        const parseStat = (val) => parseInt(String(val || '0').replace(/,/g, ''), 10) || 0;
        
        if (!staff.hasBaseline) {
          staff.prevIG = parseStat(r.get('Total Reports Completed'));
          staff.prevForum = parseStat(r.get('Total Forum Reports'));
          staff.prevDiscord = parseStat(r.get('Total Discord'));
          staff.hasBaseline = true; 
        }
      }
    }

    if (forumRows.length > 0) {
      const colBHeader = forumTab.headerValues[1];
      forumRows.forEach(r => {
        let rawName = r.get(colBHeader);
        if (!rawName && r._rawData && r._rawData.length > 1) {
          rawName = r._rawData[1];
        }
        if (rawName) {
          const fName = normalize(rawName);
          if (staffMap.has(fName)) {
            staffMap.get(fName).fetchedForumTotal += 1;
          }
        }
      });
    }

    baselineData = Array.from(staffMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  } catch(e) {
    console.error("Stats Prep Error:", e);
  }

  return <ShredderClient baselineData={baselineData} savedPrepText={savedPrepText} />;
}