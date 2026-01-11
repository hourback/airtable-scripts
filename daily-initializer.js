// 1. Setup - Select the target date
let targetDate = new Date();
const dateChoice = await input.buttonsAsync('Which day are we staging?', ['Today', 'Other Date']);

if (dateChoice === 'Other Date') {
    let customDateStr = await input.textAsync('Enter date (YYYY-MM-DD):');
    targetDate = new Date(customDateStr);
}

// Normalize target date to midnight
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

// 4. Safety Check: What is already staged for this day?
const existingTrackingQuery = await trackingTable.selectRecordsAsync({fields: ['Habit', 'Day Bucket']});
const alreadyStagedHabitIds = existingTrackingQuery.records
    .filter(r => r.getCellValue('Day Bucket')?.[0]?.id === dayRecord)
    .map(r => r.getCellValue('Habit')[0].id);

// 5. Load Habits with the necessary fields, including Weight and Keystone
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
let stagingSummary = []; // NEW: log per-habit staging info

for (let record of habitRecords.records) {
    if (record.getCellValue('Active?') && !alreadyStagedHabitIds.includes(record.id)) {
        
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
                let lastDoneDate = new Date(lastDone);
                lastDoneDate.setHours(0, 0, 0, 0);
                
                let diffInTime = targetDate.getTime() - lastDoneDate.getTime();
                let diffInDays = Math.floor(diffInTime / (1000 * 3600 * 24));

                if (diffInDays >= freq) {
                    isDue = true;
                }
            }
        }

        // Prepare new Habit Tracking slip
        newSlips.push({
            fields: {
                'Habit': [{id: record.id}],
                'Day Bucket': [{id: dayRecord}],
                'Actual Value': 0,
                'Is Due?': isDue 
            }
        });

        // Log the staging info
        stagingSummary.push({
            'Habit Name': record.getCellValue('Habit Name'),
            'Last Completed': lastDone || 'Never',
            'Frequency (Days)': freq,
            'Due Today?': isDue,
            'Weight': weight,
            'Keystone': keystone
        });
    }
}

// 6. Final Execution
if (newSlips.length > 0) {
    await trackingTable.createRecordsAsync(newSlips);
    output.text(`✅ Successfully staged ${newSlips.length} habit slips for ${dateString}.\n`);
    
    // NEW: Output detailed staging summary
    output.table(stagingSummary);
} else {
    output.text(`ℹ️ No new habits needed for ${dateString}.`);
}
