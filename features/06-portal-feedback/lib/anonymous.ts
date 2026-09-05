// Shared shapes for the anonymous note to exec. Imported by BOTH the client
// form and the server route, so nothing here may touch Supabase, `auth`,
// nodemailer, or node builtins.
//
// This is a different channel from the feedback widget in the same folder, and
// the difference is the whole point. The widget files a PUBLIC GitHub issue
// signed with the member's name, because a bug report you can ask a follow-up
// question about is worth more than one you can't. This sends a private email
// to two exec addresses with no name on it, because the things people don't say
// out loud are the things that never reach exec at all.

/**
 * What the note is about. Four, deliberately — it exists to make the subject
 * line of the email useful, not to make the member classify themselves before
 * they are allowed to speak. Every topic goes to the same two addresses.
 */
export const ANONYMOUS_TOPICS = [
  { key: "conduct", label: "Something happened that exec should know about" },
  { key: "culture", label: "How the club is being run" },
  { key: "idea", label: "An idea or a suggestion" },
  { key: "other", label: "Something else" },
] as const;

export type AnonymousTopic = (typeof ANONYMOUS_TOPICS)[number]["key"];

export function isAnonymousTopic(v: unknown): v is AnonymousTopic {
  return ANONYMOUS_TOPICS.some((t) => t.key === v);
}

/** The human label, for the email subject and the form. */
export function topicLabel(key: AnonymousTopic): string {
  return ANONYMOUS_TOPICS.find((t) => t.key === key)?.label ?? "Something else";
}

/** POST body of /api/feedback/anonymous. */
export type AnonymousNote = {
  topic: AnonymousTopic;
  message: string;
  /**
   * How to reach them back, IF they want that — typed by the member, never
   * filled in from the session.
   *
   * The default is silence: exec reads the note and cannot answer it. That is
   * the correct default and also a real cost, because most notes deserve a
   * reply. So the member gets to decide, and whatever they put here — a name,
   * a burner address, "ask at the next GBM" — is the only thing in the message
   * that says who they are.
   */
  contact?: string;
};

// Long enough for someone to tell a whole story in one go. They get one shot
// at this: there is no thread to add to afterwards, because there is nobody to
// add as.
export const MAX_MESSAGE = 8000;

// A line, not an essay. Anything longer is prose that belongs in the message,
// and the field is echoed into an email where a wall of text would bury it.
export const MAX_CONTACT = 200;
