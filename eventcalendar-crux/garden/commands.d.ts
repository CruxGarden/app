export function validateCommand(value: unknown): Record<string, unknown>;
export function defaultEnd(event: { start: string; allDay: boolean }): string;
export function inspectCalendar(project: any, args: any, stateToken: string): any;
export function calendarCsv(project: any, args?: any): string;
export function createCalendarCommands(api: any): {
  prepare(value: unknown): { mutates: boolean; apply(): Promise<any> };
};
