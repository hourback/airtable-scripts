// TABLE NAMES
const habitsTable = base.getTable('Habits');
const trackingTable = base.getTable('Habit Tracking');

// 1. Fetch Active Habits
const habitQuery = await habitsTable.selectRecordsAsync({
    fields: ['Habit Name', 'Active?']
});
const activeHabits = habitQuery.records.filter(r => r.getCellValue('Active?') === true);

// 2. Get "Today" as a simple string: "2026-01-02"
const todayStr = new Date().toISOString().split('T')[0];

// 3. Get existing logs and map them by Habit ID
const trackingQuery = await trackingTable.selectRecordsAsync({fields: ['Date', 'Habit']});

// Filter existing logs that match EXACTLY today's date string
const existingHabitIdsForToday = trackingQuery.records
    .filter(r => {
        let recordDate = r.getCellValue('Date');
        return recordDate ? recordDate === todayStr : false;
    })
    .map(l => l.getCellValue('Habit')?.[0]?.id);

// 4. Determine what needs to be created
let recordsToCreate = [];
let habitsToSkip = [];

for (let habit of activeHabits) {
    if (!existingHabitIdsForToday.includes(habit.id)) {
        recordsToCreate.push({
            fields: {
                'Habit': [{id: habit.id}],
                'Date': todayStr, // Setting the date as a string ensures no timestamp mess
                'Completed?': false
            }
        });
    } else {
        habitsToSkip.push(habit.getCellValue('Habit Name'));
    }
}

// 5. Execute
if (recordsToCreate.length > 0) {
    await trackingTable.createRecordsAsync(recordsToCreate);
    output.text(`🚀 SUCCESS: Created ${recordsToCreate.length} habits for today (${todayStr}).`);
} 

if (habitsToSkip.length > 0) {
    output.text(`ℹ️ IDEMPOTENCY CHECK: ${habitsToSkip.length} habits were already present. Skipping duplicates.`);
}

if (recordsToCreate.length === 0 && habitsToSkip.length === 0) {
    output.text("⚠️ No active habits found to initialize.");
}
