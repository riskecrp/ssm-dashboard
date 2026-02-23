"use server";
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { revalidatePath } from 'next/cache';

async function getDocument() {
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  return doc;
}

function getFormattedTimestamp() {
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')}/${months[d.getMonth()]}/${d.getFullYear()}`;
}

export async function manageStaffRecord({ name, action, role, discordId, forumLink, newName, reason, isManagement }) {
  const doc = await getDocument();
  const rosterTab = isManagement ? doc.sheetsByTitle['SSMRoster'] : doc.sheetsByTitle['SSRoster'];
  const changelogTab = doc.sheetsByTitle['SupportChangesLog'];
  const timestamp = getFormattedTimestamp();
  
  if (action === 'EditProfile') {
    const allStatsTab = doc.sheetsByTitle['AllStats'] || doc.sheetsByTitle['Sheet1'];
    const rosterRows = await rosterTab.getRows();
    const rRow = rosterRows.find(r => r.get('Name')?.toLowerCase().trim() === name.toLowerCase().trim());
    
    let isSupport = 'TRUE';
    let isSenior = 'FALSE';
    let actualNewName = newName && newName.trim() !== '' ? newName.trim() : name;

    if (rRow) {
      if (!isManagement) {
        isSupport = rRow.get('Support') || 'TRUE';
        isSenior = rRow.get('SeniorSupport') || 'FALSE';
      }
      rRow.set('Name', actualNewName);
      rRow.set('Discord ID', discordId || '');
      rRow.set('Forum Link', forumLink || '');
      await rRow.save();
    }

    if (actualNewName !== name && !isManagement && allStatsTab) {
      const statRows = await allStatsTab.getRows();
      const userStats = statRows.filter(r => r.get('Staff Name')?.toLowerCase().trim() === name.toLowerCase().trim());
      for (const sRow of userStats) {
        sRow.set('Staff Name', actualNewName);
        await sRow.save(); 
      }
    }
    
    revalidatePath('/');
    return { success: true };
  }

  let isSupport = 'TRUE';
  let isSenior = 'FALSE';

  if (action === 'Promote' || action === 'UpdateRank' || action === 'Reinstate' || action === 'Add') {
    isSenior = (role === 'Senior' || role === 'Senior Support') ? 'TRUE' : 'FALSE';
  } else if (action === 'Demote') {
    isSenior = 'FALSE';
  } else if (action === 'Remove') {
    isSupport = 'FALSE';
    isSenior = 'FALSE';
  }
  
  const rows = await rosterTab.getRows();
  const row = rows.find(r => r.get('Name')?.toLowerCase().trim() === name.toLowerCase().trim());
  
  if (row) {
    row.set('Support', isSupport); 
    row.set('SeniorSupport', isSenior);
    if (discordId !== undefined) row.set('Discord ID', discordId);
    if (forumLink !== undefined) row.set('Forum Link', forumLink);
    await row.save();
  } else if (action === 'Add') {
    await rosterTab.addRow({ 
      'Name': name, 
      'Support': isSupport, 
      'SeniorSupport': isSenior,
      'Discord ID': discordId || '',
      'Forum Link': forumLink || ''
    });
  }

  let actionText = action;
  if (action === 'Add') actionText = 'Added to Roster';
  else if (action === 'Remove') actionText = `REMOVED: ${reason?.toUpperCase() || 'REMOVAL'}`;
  else if (action === 'Promote') actionText = 'Promoted to Senior Support';
  else if (action === 'Demote') actionText = 'Demoted to Support';
  else if (action === 'Reinstate') actionText = `Reinstated as ${isSenior === 'TRUE' ? 'Senior Support' : 'Support'}`;

  if (changelogTab && action !== 'EditProfile' && !isManagement) {
    await changelogTab.addRow({ 'Timestamp': timestamp, 'Staff': name, 'Action': actionText, 'Support': isSupport, 'Senior Support': isSenior });
  }
  
  revalidatePath('/');
  return { success: true };
}

export async function manageLOA({ name, startDate, endDate, action, oldStart, oldEnd }) {
  const doc = await getDocument();
  const loaTab = doc.sheetsByTitle['LOAs'];
  if (!loaTab) return { success: false, error: "LOAs tab not found" };
  
  if (action === 'Delete') {
    const rows = await loaTab.getRows();
    const row = rows.find(r => r.get('Name') === name && r.get('Start Date') === oldStart && r.get('End Date') === oldEnd);
    if (row) await row.delete();
  } else if (action === 'Edit') {
    const rows = await loaTab.getRows();
    const row = rows.find(r => r.get('Name') === name && r.get('Start Date') === oldStart && r.get('End Date') === oldEnd);
    if (row) {
      row.set('Start Date', startDate);
      row.set('End Date', endDate);
      await row.save();
    }
  } else {
    await loaTab.addRow({ 'Name': name, 'Start Date': startDate, 'End Date': endDate });
  }
  
  revalidatePath('/');
  return { success: true };
}

export async function logSpokenTo({ name, note }) {
  const doc = await getDocument();
  const logsTab = doc.sheetsByTitle['SpokenToLogs'];
  if (!logsTab) return { success: false, error: "SpokenToLogs tab not found" };

  const timestamp = getFormattedTimestamp();
  await logsTab.addRow({ 'Timestamp': timestamp, 'Staff Name': name, 'Note': note });

  const changelogTab = doc.sheetsByTitle['SupportChangesLog'];
  if (changelogTab) {
    const rosterTab = doc.sheetsByTitle['SSRoster'];
    let isSupport = 'TRUE'; let isSenior = 'FALSE';
    if (rosterTab) {
        const rows = await rosterTab.getRows();
        const row = rows.find(r => r.get('Name')?.toLowerCase().trim() === name.toLowerCase().trim());
        if (row) {
            isSupport = row.get('Support') || 'TRUE';
            isSenior = row.get('SeniorSupport') || 'FALSE';
        }
    }
    const actionText = note.startsWith('METRIC EXCEPTION') ? 'METRIC EXCEPTION' : 'Spoken To Log Issued';
    await changelogTab.addRow({ 'Timestamp': timestamp, 'Staff': name, 'Action': actionText, 'Support': isSupport, 'Senior Support': isSenior });
  }

  revalidatePath('/');
  return { success: true };
}

export async function commitMonthlyBatch(stagedRows) {
  const doc = await getDocument();
  const allStatsTab = doc.sheetsByTitle['AllStats'] || doc.sheetsByTitle['Sheet1'];
  if (!allStatsTab) return { success: false, error: "Stats database tab not found" };
  await allStatsTab.addRows(stagedRows);
  revalidatePath('/');
  return { success: true };
}

export async function manageTask({ action, taskId, tasksArray, claimedBy }) {
  const doc = await getDocument();
  const tasksTab = doc.sheetsByTitle['Tasks'];
  const logsTab = doc.sheetsByTitle['TasksLog']; 
  if (!tasksTab) return { success: false, error: "Tasks tab not found" };

  const timestamp = getFormattedTimestamp();

  if (action === 'AddBatch' && tasksArray) {
    const rowsToAdd = tasksArray.map(t => ({
      'Task ID': t.id,
      'Timestamp': timestamp,
      'Title': t.title,
      'Description': t.description,
      'Target': t.target,
      'Status': 'Pending',
      'Claimed By': ''
    }));
    await tasksTab.addRows(rowsToAdd);
    if (logsTab) {
      const logRows = tasksArray.map(t => ({ 'Timestamp': timestamp, 'Task ID': t.id, 'Action': 'Created', 'Task Title': t.title, 'Details': `Assigned/Notified: ${t.target}` }));
      await logsTab.addRows(logRows);
    }
  } else if (action === 'Complete') {
    const rows = await tasksTab.getRows();
    const row = rows.find(r => r.get('Task ID') === taskId);
    if (row) {
      row.set('Status', 'Completed');
      await row.save();
      
      const title = row.get('Title');
      const description = row.get('Description') || '';
      
      if (title && title.startsWith('Issue Strike - ')) {
         const staffName = title.replace('Issue Strike - ', '').trim();
         const allStatsTab = doc.sheetsByTitle['AllStats'] || doc.sheetsByTitle['Sheet1'];
         
         if (allStatsTab) {
            const statsRows = await allStatsTab.getRows();
            let targetMonthStr = '';
            const match = description.match(/for\s+(.*)/);
            if (match) targetMonthStr = match[1].trim(); 
            else targetMonthStr = row.get('Timestamp') || ''; 

            const getMY = (dateStr) => {
               if (!dateStr) return '';
               const str = String(dateStr).toLowerCase();
               const yMatch = str.match(/\d{4}/);
               const y = yMatch ? yMatch[0] : null;
               const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
               let m = null;
               for (let i = 0; i < months.length; i++) {
                   if (str.includes(months[i])) { m = i + 1; break; }
               }
               if (m === null && y) {
                   const parts = str.split(/[-/]/);
                   if (parts.length >= 2) {
                       if (parts[0] === y) m = parseInt(parts[1], 10);
                       else if (parts[2] === y) m = parseInt(parts[0], 10); 
                   }
               }
               if (m !== null && y !== null) return `${y}-${m}`;
               const d = new Date(dateStr);
               if (!isNaN(d.getTime())) return `${d.getFullYear()}-${d.getMonth() + 1}`;
               return str;
            };

            const targetMY = getMY(targetMonthStr);

            const targetStatRow = statsRows.find(r => {
               const rName = r.get('Staff Name') || '';
               const rDate = r.get('Date') || '';
               return rName.toLowerCase() === staffName.toLowerCase() && getMY(rDate) === targetMY;
            });
            
            if (targetStatRow) {
               targetStatRow.set('Strike Given', 1); 
               await targetStatRow.save();
            }
         }
      }

      if (logsTab) await logsTab.addRow({ 'Timestamp': timestamp, 'Task ID': taskId, 'Action': 'Completed', 'Task Title': title, 'Details': `Claimed by: ${row.get('Claimed By') || 'Unclaimed'}` });
    }
  } else if (action === 'Delete') {
    const rows = await tasksTab.getRows();
    const row = rows.find(r => r.get('Task ID') === taskId);
    if (row) {
      const title = row.get('Title');
      await row.delete();
      if (logsTab) await logsTab.addRow({ 'Timestamp': timestamp, 'Task ID': taskId, 'Action': 'Deleted', 'Task Title': title, 'Details': `Permanently removed from workspace` });
    }
  } else if (action === 'Claim') {
    const rows = await tasksTab.getRows();
    const row = rows.find(r => r.get('Task ID') === taskId);
    if (row) {
      row.set('Claimed By', claimedBy || '');
      await row.save();
    }
  }

  revalidatePath('/tasks');
  return { success: true };
}

export async function pingDiscordTask({ tasksArray, targetPings }) {
  if (!process.env.DISCORD_BOT_TOKEN) return { success: false, error: "No bot token" };
  
  const CHANNEL_ID = "1075156653789429882"; 
  
  let formattedTarget = targetPings;
  if (targetPings && targetPings.toUpperCase() === 'SSM') {
     const roleId = process.env.SSM_ROLE_ID || "YOUR_SSM_ROLE_ID_HERE";
     formattedTarget = `<@&${roleId}>`;
  }

  let messageContent = formattedTarget ? `**New Task(s) Assigned To:** ${formattedTarget}\n\n` : `**New Task(s) Logged:**\n\n`;
  tasksArray.forEach(t => {
    messageContent += `• **${t.title}**\n${t.description ? `  └ *${t.description}*\n` : ''}`;
  });

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: messageContent })
    });
    if (!res.ok) throw new Error("Discord API rejected the request");
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

export async function manageScratchpad(action, payload) {
  const doc = await getDocument();
  const tab = doc.sheetsByTitle['Scratchpad'];
  if (!tab) return { success: false, error: 'No Scratchpad tab found' };

  try { await tab.loadHeaderRow(); } catch (err) { await tab.setHeaderRow(['Data']); }
  const rows = await tab.getRows();

  if (action === 'SAVE') {
    if (rows.length > 0) { rows[0].set('Data', payload || ''); await rows[0].save(); } 
    else { await tab.addRow({ 'Data': payload || '' }); }
    return { success: true };
  }
  if (action === 'CLEAR') {
    if (rows.length > 0) { rows[0].set('Data', ''); await rows[0].save(); }
    return { success: true };
  }
}