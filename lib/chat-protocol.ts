// Shared wire-protocol constant for the /chat plain-text stream. This module is
// deliberately NOT `server-only`: it is imported by both the server streamer
// (lib/chat.ts) and the browser chat component (app/components/Chat), so the two
// sides agree on the same marker.
//
// When a model fails (429/503) AFTER it has already streamed part of an answer,
// the server can't silently fail over — the user has seen partial text. Instead
// it emits this RESET marker into the stream and re-answers on the next model;
// the client, on seeing the marker, DISCARDS everything shown so far for the
// current assistant message and renders the re-generated answer from scratch, so
// nothing is duplicated or interleaved.
//
// It is a single Private-Use-Area code point (U+E000): models never emit PUA
// characters, and it round-trips through UTF-8 / nginx intact, so it can't
// collide with real answer text the way an ASCII sentinel could. Built via
// fromCharCode so the source stays plain ASCII (no invisible glyph to review).
export const CHAT_RESET_SIGNAL = String.fromCharCode(0xe000);
