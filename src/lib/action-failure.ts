export interface ActionFailure {
  message: string;
  detail: string;
}

/** Keep native diagnostics available without making them the user's next step. */
export function actionFailure(error: unknown, message: string): ActionFailure {
  const detail = error instanceof Error ? error.message : String(error);
  const guidance = /ENOSPC|no space left|disk (?:is )?full/i.test(detail)
    ? 'Make room on the drive, then retry. Keep this window open if it contains unsaved edits.'
    : /EACCES|EPERM|permission denied/i.test(detail)
      ? 'Check that you can write to the Project Folder and that it is not locked, then retry.'
      : /SQLITE_BUSY|database is locked/i.test(detail)
        ? 'Another operation is using the Garden. Wait for it to finish, then retry.'
        : null;
  return { message: guidance ? `${message} ${guidance}` : message, detail };
}
