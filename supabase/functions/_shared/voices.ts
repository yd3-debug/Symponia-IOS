// The cloud's two voices, chosen by Yekta on 2026-10-09 from the ElevenLabs
// Voice Library. Voice ids are not secret; the API key is, and lives only in
// the function secrets as ELEVENLABS_API_KEY.
//
// Keys match profiles.voice_kind and services/voice.ts.
//
// Both are Voice Library voices, not ElevenLabs' built-in ones. That matters:
//   - they must be added to the account's own voices before the API can use them;
//   - library voices can be withdrawn by their owners, so keep a fallback;
//   - check that each sounds right in every app language before release. Their
//     pages list English plus about twenty other verified languages each.
export const CLOUD_VOICES = {
  woman: { id: 'L98c1yZIIK3on1wizQ55', name: 'Marie Callahasin' },
  man: { id: 'vSjOBQp24DUB2COr2xI9', name: 'Miles' },
} as const;

export type CloudVoiceKind = keyof typeof CLOUD_VOICES;
