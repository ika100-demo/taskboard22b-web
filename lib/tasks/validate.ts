import { TITLE_INVALID } from "./messages";

export function validateTitle(
  raw: string,
): { ok: true; title: string } | { ok: false; message: typeof TITLE_INVALID } {
  const title = raw.trim();
  if (title.length >= 1 && title.length <= 200) {
    return { ok: true, title };
  }
  return { ok: false, message: TITLE_INVALID };
}
