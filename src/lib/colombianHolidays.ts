// Días festivos fijos en Colombia (que NO se trasladan)
const FIXED_HOLIDAYS = [
  { month: 1, day: 1 },   // Año Nuevo
  { month: 5, day: 1 },   // Día del Trabajo
  { month: 7, day: 20 },  // Día de la Independencia
  { month: 8, day: 7 },   // Batalla de Boyacá
  { month: 12, day: 8 },  // Inmaculada Concepción
  { month: 12, day: 25 }, // Navidad
];

// Días festivos que se trasladan al lunes siguiente (Ley Emiliani)
const MOVABLE_HOLIDAYS = [
  { month: 1, day: 6 },   // Reyes Magos
  { month: 3, day: 19 },  // San José
  { month: 6, day: 29 },  // San Pedro y San Pablo
  { month: 8, day: 15 },  // Asunción de la Virgen
  { month: 10, day: 12 }, // Día de la Raza
  { month: 11, day: 1 },  // Todos los Santos
  { month: 11, day: 11 }, // Independencia de Cartagena
];

// Calcular el domingo de Pascua usando el algoritmo de Meeus/Jones/Butcher
function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  return new Date(year, month - 1, day);
}

// Trasladar un día festivo al lunes siguiente si no cae en lunes
function moveToNextMonday(date: Date): Date {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 1) return date; // Ya es lunes
  
  const daysToAdd = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  const newDate = new Date(date);
  newDate.setDate(date.getDate() + daysToAdd);
  return newDate;
}

// Obtener todos los días festivos de Colombia para un año específico
export function getColombianHolidays(year: number): Date[] {
  const holidays: Date[] = [];
  
  // 1. Agregar festivos fijos
  FIXED_HOLIDAYS.forEach(({ month, day }) => {
    holidays.push(new Date(year, month - 1, day));
  });
  
  // 2. Agregar festivos móviles (con traslado a lunes)
  MOVABLE_HOLIDAYS.forEach(({ month, day }) => {
    const originalDate = new Date(year, month - 1, day);
    const movedDate = moveToNextMonday(originalDate);
    holidays.push(movedDate);
  });
  
  // 3. Calcular Semana Santa
  const easterSunday = calculateEasterSunday(year);
  
  // Jueves Santo (3 días antes de domingo de Pascua)
  const maundyThursday = new Date(easterSunday);
  maundyThursday.setDate(easterSunday.getDate() - 3);
  holidays.push(maundyThursday);
  
  // Viernes Santo (2 días antes de domingo de Pascua)
  const goodFriday = new Date(easterSunday);
  goodFriday.setDate(easterSunday.getDate() - 2);
  holidays.push(goodFriday);
  
  // Ascensión del Señor (43 días después de Pascua, trasladado al lunes siguiente)
  const ascension = new Date(easterSunday);
  ascension.setDate(easterSunday.getDate() + 43);
  holidays.push(moveToNextMonday(ascension));
  
  // Corpus Christi (64 días después de Pascua, trasladado al lunes siguiente)
  const corpusChristi = new Date(easterSunday);
  corpusChristi.setDate(easterSunday.getDate() + 64);
  holidays.push(moveToNextMonday(corpusChristi));
  
  // Sagrado Corazón (71 días después de Pascua, trasladado al lunes siguiente)
  const sacredHeart = new Date(easterSunday);
  sacredHeart.setDate(easterSunday.getDate() + 71);
  holidays.push(moveToNextMonday(sacredHeart));
  
  return holidays;
}

// Verificar si una fecha es festivo en Colombia
export function isColombianHoliday(date: Date, holidaysCache: Date[]): boolean {
  return holidaysCache.some(holiday => 
    holiday.getFullYear() === date.getFullYear() &&
    holiday.getMonth() === date.getMonth() &&
    holiday.getDate() === date.getDate()
  );
}

// Formatear fecha para mostrar
export function formatHolidayDate(date: Date): string {
  return date.toLocaleDateString('es-CO', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}
