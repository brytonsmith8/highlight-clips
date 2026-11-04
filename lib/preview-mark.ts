/**
 * A short tag the server-side preview maker (FFmpeg) writes into every preview it produces. Saving or publishing
 * a clip requires it, so a preview that did not go through the blur + watermark pipeline can never go live.
 * Bump the number if the pipeline changes in a way old previews should no longer be accepted.
 */
export const PREVIEW_MARK = "BRYT-PREVIEW-v1";
