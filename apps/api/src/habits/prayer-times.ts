import type { PrayerMethod, PrayerTimes, Settings } from '@pa/shared';
import { CalculationMethod, type CalculationParameters, Coordinates, Madhab, PrayerTimes as AdhanTimes } from 'adhan';

const METHODS: Record<PrayerMethod, () => CalculationParameters> = {
  Karachi: CalculationMethod.Karachi,
  MuslimWorldLeague: CalculationMethod.MuslimWorldLeague,
  Egyptian: CalculationMethod.Egyptian,
  UmmAlQura: CalculationMethod.UmmAlQura,
  Dubai: CalculationMethod.Dubai,
  MoonsightingCommittee: CalculationMethod.MoonsightingCommittee,
  NorthAmerica: CalculationMethod.NorthAmerica,
  Kuwait: CalculationMethod.Kuwait,
  Qatar: CalculationMethod.Qatar,
  Singapore: CalculationMethod.Singapore,
  Tehran: CalculationMethod.Tehran,
  Turkey: CalculationMethod.Turkey,
};

/**
 * Prayer times for a calendar day at the owner's location, worked out here
 * from the sun's position. No outside service is asked.
 */
export function prayerTimesFor(
  day: string,
  settings: Pick<Settings, 'general.location' | 'habits.prayer'>,
): PrayerTimes {
  const { lat, lng } = settings['general.location'];
  const params = METHODS[settings['habits.prayer'].method]();
  params.madhab = settings['habits.prayer'].asr === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;

  // The library reads only the year, month and date of this value, in the server's own zone.
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  const times = new AdhanTimes(new Coordinates(lat, lng), new Date(year, month - 1, date), params);

  return {
    fajr: times.fajr,
    sunrise: times.sunrise,
    zuhr: times.dhuhr,
    asr: times.asr,
    maghrib: times.maghrib,
    isha: times.isha,
  };
}
