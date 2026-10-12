let n = 0;
/**
 * A realtime channel name nobody else in this tab is using. Supabase hands back the *same* channel for a repeated name, and adding
 * listeners to a channel that is already subscribed throws — which happened when two parts of the app (or the page being left and
 * the page being opened) listened to the same table at once.
 */
export const channelName = (base: string) => `${base}-${++n}-${Math.random().toString(36).slice(2, 8)}`;
