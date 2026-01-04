// 1. Setup - Select the target date
let targetDate = new Date();
const dateChoice = await input.buttonsAsync('Which day are we staging?', ['Today', 'Other Date']);

if (dateChoice === 'Other Date') {
    let customDateStr = await input.textAsync('Enter date (YYYY-MM-DD):');
    targetDate = new Date(customDateStr);
}

targetDate.setHours(0, 0, 0, 0);
const dateString = targetDate.toISOString().split('T')[0];

// 2. Load Tables
const habitsTable = base.getTable('Habits');
const trackingTable = base.getTable('Habit Tracking');
const daysTable = base.getTable('Days');

// 3. Find or Create the "Day" record
let daysQuery = await daysTable.selectRecordsAsync({fields: ['Date']});
let dayRecord = daysQuery.records.find(r => r.getCellValue('Date') === dateString);

if (!dayRecord) {
    output.text(`Creating new day record for ${dateString}...`);
    dayRecord = await daysTable.createRecordAsync({'Date': dateString});
} else {
    dayRecord = dayRecord.id;
}

// 4. Safety Check: Find what's ALREADY staged for this day
const existingTrackingQuery = await trackingTable.selectRecordsAsync({fields: ['Habit', 'Day Bucket']});
const alreadyStagedHabitIds = existingTrackingQuery.records
    .filter(r => {
        let dayLink = r.getCellValue('Day Bucket');
        return dayLink && dayLink[0].id === dayRecord;
    })
    .map(r => r.getCellValue('Habit')[0].id);

// 5. Logic: Which habits SHOULD be there?
const habitRecords = await habitsTable.selectRecordsAsync({
    fields: ['Habit Name', 'Weight', 'Target Value', 'Frequency (Days)', 'Last Completed Date', 'Active?']
});

let newSlips = [];

for (let record of habitRecords.records) {
    if (!record.getCellValue('Active?')) continue;
    
    // IDEMPOTENCY CHECK: Skip if this habit is already in the tracking table for this day
    if (alreadyStagedHabitIds.includes(record.id)) continue;

    let frequency = record.getCellValue('Frequency (Days)') || 1;
    let lastDone = record.getCellValue('Last Completed Date');
    let shouldCreate = false;

    if (!lastDone) {
        shouldCreate = true;
    } else {
        let lastDoneDate = new Date(lastDone);
        lastDoneDate.setHours(0, 0, 0, 0);
        let diffInDays = Math.floor((targetDate.getTime() - lastDoneDate.getTime()) / (1000 * 3600 * 24));
        if (diffInDays >= frequency) shouldCreate = true;
    }

    if (shouldCreate) {
        newSlips.push({
            fields: {
                'Habit': [{id: record.id}],
                'Day Bucket': [{id: dayRecord}],
                'Actual Value': 0 // Initializing at zero
            }
        });
    }
}

// 6. Execution
if (newSlips.length > 0) {
    await trackingTable.createRecordsAsync(newSlips);
    output.text(`✅ Successfully staged ${newSlips.length} new habit slips for ${dateString}.`);
} else {
    output.text(`ℹ️ No new habits needed for ${dateString}. (Everything is either not due or already staged!)`);
}
