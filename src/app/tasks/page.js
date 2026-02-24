import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import TasksClient from './TasksClient';

export const revalidate = 0; 

export default async function TasksPage() {
  let initialTasks = [];
  let ssmNames = [];
  let activeRosterNames = [];

  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();

    const tasksTab = doc.sheetsByTitle['Tasks'];
    if (tasksTab) {
      const rows = await tasksTab.getRows();
      initialTasks = rows.map(r => ({
        id: r.get('Task ID'),
        timestamp: r.get('Timestamp'),
        title: r.get('Title'),
        description: r.get('Description') || '',
        target: r.get('Target') || 'SSM',
        status: r.get('Status') || 'Pending',
        claimedBy: r.get('Claimed By') || ''
      })).reverse();
    }

    const ssmTab = doc.sheetsByTitle['SSMRoster'];
    if (ssmTab) {
      const ssmRows = await ssmTab.getRows();
      ssmNames = ssmRows.map(r => r.get('Name')?.trim()).filter(Boolean);
    }

    const rosterTab = doc.sheetsByTitle['SSRoster'];
    if (rosterTab) {
      const rosterRows = await rosterTab.getRows();
      activeRosterNames = rosterRows
        .filter(r => String(r.get('Support')).toUpperCase() === 'TRUE')
        .map(r => r.get('Name')?.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    }

  } catch (err) {
    console.error("Tasks Fetch Error:", err);
  }

  return <TasksClient initialTasks={initialTasks} ssmNames={ssmNames} activeRosterNames={activeRosterNames} />;
}
