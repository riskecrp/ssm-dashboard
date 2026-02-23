import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import TasksClient from './TasksClient';

export const revalidate = 60; 

export default async function TasksPage() {
  let initialTasks = [];
  let ssmNames = [];

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
        target: r.get('Target') || 'General',
        status: r.get('Status') || 'Pending',
        claimedBy: r.get('Claimed By') || ''
      }));
    }

    const ssmTab = doc.sheetsByTitle['SSMRoster'];
    if (ssmTab) {
      const ssmRows = await ssmTab.getRows();
      ssmRows.forEach(r => {
        const name = r.get('Name')?.trim();
        if (name) ssmNames.push(name);
      });
    }

  } catch (e) {
    console.error("Tasks Fetch Error:", e);
  }

  return <TasksClient initialTasks={initialTasks.reverse()} ssmNames={ssmNames} />;
}