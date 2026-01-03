// TABLE NAMES
const habitsTable = base.getTable('Habits');
const trackingTable = base.getTable('Habit Tracking');
const daysTable = base.getTable('Days');

const todayStr = new Date().toISOString().split('T')[0];

// 1. Ensure the "Day Bucket" exists
const daysQuery = await daysTable.selectRecordsAsync({fields: ['Date']});
let dayRecord = daysQuery.records.find(r => r.getCellValue('Date') === todayStr);
let dayRecordId = dayRecord ? dayRecord.id : await daysTable.createRecordAsync({'Date': todayStr});

// 2. Fetch Habits that are BOTH Active AND Due Today
const habitQuery = await habitsTable.selectRecordsAsync({
    fields: ['Habit Name', 'Active?', 'Due Today?']
});

// We only want habits where Active is true AND Due Today? is 1 (or true)
const habitsToInitialize = habitQuery.records.filter(r => {
    return r.getCellValue('Active?') === true && r.getCellValue('Due Today?') === 1;
});

// 3. Prevent Duplicates
const trackingQuery = await trackingTable.selectRecordsAsync({fields: ['Day Bucket', 'Habit']});
const existingHabitIds = trackingQuery.records
    .filter(r => r.getCellValue('Day Bucket')?.[0]?.id === dayRecordId)
    .map(l => l.getCellValue('Habit')?.[0]?.id);

let recordsToCreate = habitsToInitialize
    .filter(h => !existingHabitIds.includes(h.id))
    .map(h => ({
        fields: {
            'Habit': [{id: h.id}],
            'Day Bucket': [{id: dayRecordId}],
            'Actual Value': 0
        }
    }));

// 4. Create Records
if (recordsToCreate.length > 0) {
    await trackingTable.createRecordsAsync(recordsToCreate);
    output.text(`✅ Initialized ${recordsToCreate.length} habits based on your cadence!`);
} else {
    output.text("ℹ️ No new habits due today or already initialized.");
}
