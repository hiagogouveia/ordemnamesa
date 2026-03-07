import { Shift } from './types';
export function getCurrentShift(shifts: Shift[], currentTimeStr: string = new Date().toTimeString().slice(0, 5)): Shift | null {
    if (!shifts || shifts.length === 0) return null;

    const [currentHour, currentMinute] = currentTimeStr.split(':').map(Number);
    const currentMins = currentHour * 60 + currentMinute;

    for (const shift of shifts) {
        if (!shift.start_time || !shift.end_time || !shift.active) continue;

        const [startHour, startMinute] = shift.start_time.split(':').map(Number);
        const [endHour, endMinute] = shift.end_time.split(':').map(Number);

        const startMins = startHour * 60 + startMinute;
        const endMins = endHour * 60 + endMinute;

        if (startMins <= endMins) {
            // Normal shift (e.g., 08:00 to 16:00)
            if (currentMins >= startMins && currentMins <= endMins) {
                return shift;
            }
        } else {
            // Night shift crossing midnight (e.g., 18:00 to 02:00)
            if (currentMins >= startMins || currentMins <= endMins) {
                return shift;
            }
        }
    }

    return null;
}
