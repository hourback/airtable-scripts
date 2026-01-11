// 1️⃣ Setup - Select the target date
let targetDate = new Date();
const dateChoice = await input.buttonsAsync('Which day are we staging?', ['Today', 'Other Date']);

if (dateChoice === 'Other Date') {
    let customDateStr = await input.textAsync('Enter date (YYYY-MM-DD):');
    targetDate = new Date(customDateStr);
}

// Normalize target date to midnight local time
targetDate.setHours(0, 0, 0, 0);

// Convert to YYYY-MM-DD in LOCAL time
const pad = (n) => n.toString().padStart(2, '0');
const dateString = `${targetDate.getFullYear()}-${pad(targetDate.getMonth()+1)}-${pad(targetDate.getDate())}`;

// Helper: convert any date to YYYY-MM-DD string in local time
function localDateString(d) {
    const dt = new Date(d);
    dt.setHours(0,0,0,0);
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
}

// 2️⃣ Load Tables
const habitsTable = base.getTable('Habits');
const trackingTable = base.getTable('Habit Tracking');
const daysTable = base.getTable('Days');

// 3️⃣ Find or Create Day record
let daysQuery = await daysTable.selectRecordsAsync({fields: ['Date']});
let dayRecordObj = daysQuery.records.find(r => r.getCellValue('Date') === dateString);

let dayRecordId;
if (!dayRecordObj) {
    output.text(`Creating new day record for ${dateString}...`);
    dayRecordId = await daysTable.createRecordAsync({'Date': dateString});
} else {
    dayRecordId = dayRecordObj.id;
}

// 4️⃣ Safety Check: already staged habits
const existingTrackingQuery = await trackingTable.selectRecordsAsync({fields: ['Habit', 'Day Bucket']});
const alreadyStagedHabitIds = existingTrackingQuery.records
    .filter(r => r.getCellValue('Day Bucket')?.[0]?.id === dayRecordId)
    .map(r => r.getCellValue('Habit')[0].id);

// 5️⃣ Load Habits
const habitRecords = await habitsTable.selectRecordsAsync({
    fields: [
        'Habit Name',
        'Track Mode',
        'Frequency (Days)',
        'Last Completed Date',
        'Active?',
        'Weight',
        'Keystone Habit'
    ]
});

let newSlips = [];
let stagingSummary = [];

for (let record of habitRecords.records) {
    if (!record.getCellValue('Active?')) continue;
    if (alreadyStagedHabitIds.includes(record.id)) continue;

    let trackMode = record.getCellValue('Track Mode');
    let modeName = trackMode ? (trackMode.name || trackMode) : 'Core';
    let freq = record.getCellValue('Frequency (Days)') || 1;
    let lastDone = record.getCellValue('Last Completed Date');
    let weight = record.getCellValue('Weight') || 0;
    let keystone = record.getCellValue('Keystone Habit') || false;
    let isDue = false;

    if (modeName === 'Core') {
        if (!lastDone) {
            isDue = true;
        } else {
            const lastDoneStr = localDateString(lastDone);
            const targetStr = dateString;

            // Calculate difference in days
            const lastParts = lastDoneStr.split('-').map(Number);
            const targetParts = targetStr.split('-').map(Number);
            const lastDateObj = new Date(lastParts[0], lastParts[1]-1, lastParts[2]);
            const targetDateObj = new Date(targetParts[0], targetParts[1]-1, targetParts[2]);
            const diffInTime = targetDateObj.getTime() - lastDateObj.getTime();
            const diffInDays = Math.floor(diffInTime / (1000*3600*24));

            if (diffInDays >= freq) isDue = true;
        }
    }

    // Stage the habit slip
    newSlips.push({
        fields: {
            'Habit': [{id: record.id}],
            'Day Bucket': [{id: dayRecordId}],
            'Actual Value': 0,
            'Is Due?': isDue
        }
    });

    // Log summary
    stagingSummary.push({
        'Habit Name': record.getCellValue('Habit Name'),
        'Last Completed': lastDone ? localDateString(lastDone) : 'Never',
        'Frequency (Days)': freq,
        'Due Today?': isDue,
        'Weight': weight,
        'Keystone': keystone
    });
}

// 6️⃣ Execute
if (newSlips.length > 0) {
    await trackingTable.createRecordsAsync(newSlips);
    output.text(`✅ Successfully staged ${newSlips.length} habit slips for ${dateString}.\n`);
    output.table(stagingSummary);
} else {
    output.text(`ℹ️ No new habits needed for ${dateString}.`);
}
