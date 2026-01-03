// TABLE NAMES
const habitsTable = base.getTable('Habits');
const trackingTable = base.getTable('Habit Tracking');
const daysTable = base.getTable('Days');

// 1. Get "Today" as a simple string: "2026-01-03"
const todayStr = new Date().toISOString().split('T')[0];

// 2. Ensure the "Day Bucket" exists
const daysQuery = await daysTable.selectRecordsAsync({fields: ['Date']});
let dayRecord = daysQuery.records.find(r => r.getCellValue('Date') === todayStr);
let dayRecordId;

if (!dayRecord) {
    dayRecordId = await daysTable.createRecordAsync({
        'Date': todayStr
    });
    output.text(`📅 Created new Day record for: ${todayStr}`);
} else {
    dayRecordId = dayRecord.id;
    output.text(`📅 Found existing Day record for: ${todayStr}`);
}

// 3. Fetch Active Habits
const habitQuery = await habitsTable.selectRecordsAsync({
    fields: ['Habit Name', 'Active?']
});
const activeHabits = habitQuery.records.filter(r => r.getCellValue('Active?') === true);

// 4. Check for existing logs to maintain Idempotency
const trackingQuery = await trackingTable.selectRecordsAsync({fields: ['Day Bucket', 'Habit']});
const existingHabitIdsForToday = trackingQuery.records
    .filter(r => {
        let linkedDay = r.getCellValue('Day Bucket');
        return linkedDay ? linkedDay[0].id === dayRecordId : false;
    })
    .map(l => l.getCellValue('Habit')?.[0]?.id);

// 5. Determine what needs to be created
let recordsToCreate = [];
let habitsToSkip = [];

for (let habit of activeHabits) {
    if (!existingHabitIdsForToday.includes(habit.id)) {
        recordsToCreate.push({
            fields: {
                'Habit': [{id: habit.id}],
                'Day Bucket': [{id: dayRecordId}], // Linking to the Parent Bucket
                'Completed?': false,
                'Actual Value': 0
            }
        });
    } else {
        habitsToSkip.push(habit.getCellValue('Habit Name'));
    }
}

// 6. Execute
if (recordsToCreate.length > 0) {
    await trackingTable.createRecordsAsync(recordsToCreate);
    output.text(`🚀 SUCCESS: Created ${recordsToCreate.length} habits for today.`);
} 

if (habitsToSkip.length > 0) {
    output.text(`ℹ️ SKIPPED: ${habitsToSkip.length} habits were already initialized.`);
}
